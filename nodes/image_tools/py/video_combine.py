# XiaoHei-视频合成（XiaoHei 家族）· XHVideoCombine
#
# 为什么要做这个（2026-10-26，用户要求「不想用别人的节点」）：
#   工作流里常接第三方 VHS_VideoCombine（Video Helper Suite 的节点）来把帧+音轨封成 mp4。
#   本节点把它的能力用**官方 PyAV 通路**重新实现一遍，注册名带 XiaoHei 前缀 ⇒ 与任何第三方零冲突。
#
# 与 VHS_VideoCombine 的对应关系（参数名刻意保持一致，方便对照迁移）：
#   images / audio / frame_rate / loop_count / filename_prefix /
#   format(video/h264-mp4) / pix_fmt / crf / save_metadata / trim_to_audio /
#   pingpong / save_output
#
#  与 VHS 的关键差异（都是故意的）：
#   ① **不依赖 ffmpeg 子进程**，用 PyAV（av，ComfyUI 自带 18.x）直接编码 ⇒ 少一层外部依赖、
#      少一次外部进程崩溃风险；Windows 上也不怕 ffmpeg 路径丢失。
#   ② **输出给两个口**：
#        video(VIDEO)  —— 官方 VIDEO 类型，节点框里能直接预览播放（VHS 是靠私有 VHS_FILENAMES 类型）；
#        file_path(STRING) —— 成品文件的完整路径，能直接喂给 XiaoHei-视频拼接 / 剪辑软件。
#   ③ **trim_to_audio 语义与 VHS 一致但方向写清楚了**：
#        关（默认）= 音频短则补静音到视频长（视频完整不被截），
#        开 = 音频长则按音频截（视频会被裁短）。
#      （这条 2026-10-26 在 LTX 续接工作流里踩过：VHS 的 trim_to_audio=True 会用 -shortest
#        以音频为准，音频短反而把视频截掉 —— 与直觉相反，所以这里默认值和说明都写死。）
#
# 依赖：av（PyAV，ComfyUI 官方自带）、torch、numpy、folder_paths、comfy_api 的视频接口。

from __future__ import annotations

import json
import math
import os
from fractions import Fraction

import av
import numpy as np
import torch

import folder_paths
from comfy.cli_args import args

CATEGORY_TYPE = "XiaoHei/Video"

# VHS 的 format 下拉里那几个视频格式，本节点只实做 mp4/h264（最通用、剪辑软件全吃得下）。
# gif / webp 走 Pillow 单独一条路（下面 SAVE_FORMATS 里登记）。
FORMAT_CHOICES = ["video/h264-mp4", "image/gif", "image/webp"]

PIX_FMT_CHOICES = ["yuv420p", "yuv420p10le", "yuv422p", "yuv444p", "rgb24"]


def _to_uint8_images(images):
    """IMAGE 张量（[B,H,W,C]，0~1）→ uint8 numpy 数组列表。"""
    if images is None:
        return []
    #  类型守卫：ComfyUI 在「必填输入缺失」等异常路径下会把占位**字符串**塞进来，
    #    torch.as_tensor(字符串) 会炸 "TypeError: new(): invalid data type 'str'"。
    #    这里直接判类型并给出人话报错，别让用户看堆栈。
    if isinstance(images, (str, bytes, int, float, bool)):
        raise TypeError(
            "[XiaoHei-视频合成] 收到的 images 是个 %s，不是图像张量 —— "
            "检查一下 images 口是不是没接 / 接错了节点。" % type(images).__name__
        )
    if isinstance(images, dict):
        # 有些节点输出 {"samples": tensor} 形式（LATENT）
        images = images.get("samples", None)
        if images is None:
            raise TypeError("[XiaoHei-视频合成] images 是个 dict 但里面没有 samples。")
    if not isinstance(images, torch.Tensor):
        try:
            images = torch.as_tensor(images)
        except Exception as e:
            raise TypeError(f"[XiaoHei-视频合成] images 无法转成张量：{e}") from e
    if images.ndim == 3:
        images = images.unsqueeze(0)
    if images.ndim != 4:
        raise TypeError(
            f"[XiaoHei-视频合成] images 维度是 {images.ndim}，应该是 4（批, 高, 宽, 通道）。"
        )
    arr = images.detach().cpu().clamp(0, 1).mul(255).round().to(torch.uint8).numpy()
    return [arr[i] for i in range(arr.shape[0])]


def _tensor_to_bytes(frame):
    """单帧 uint8 numpy（HWC）→ ffmpeg rawvideo 需要的 bytes。"""
    return np.ascontiguousarray(frame).tobytes()


class XHVideoCombine:
    """把图像帧（+ 可选音轨）合成视频文件，输出可直接预览的 VIDEO 和文件路径。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "frame_rate": ("FLOAT", {
                    "default": 24.0, "min": 1.0, "max": 240.0, "step": 1.0,
                    "tooltip": (
                        "【 帧率】每秒几帧。【节点默认 24】\n"
                        "·  **必须和出片时的帧率一致**（H3/LTX 常见 24，别填 25）——\n"
                        "  填错了画面会被压快/拉慢，声音就对不上嘴了\n"
                        "· 判据：帧数 ÷ 帧率 = 视频秒数，得等于你要的时长"
                    ),
                }),
                "filename_prefix": ("STRING", {
                    "default": "XH_video",
                    "tooltip": (
                        "【 输出前缀】写到 ComfyUI 的 output 目录。\n"
                        "例：XH_video → output/XH_video_00001_.mp4\n"
                        "前缀里带 `/` 就是子目录；重名会自动加序号，不会覆盖旧文件。"
                    ),
                }),
            },
            "optional": {
                #  images 放 optional（不接也允许建节点/跑测试）——
                #    放 required 时 ComfyUI 会把「缺失的必填输入」用占位**字符串**传进来，
                #    后端 torch.as_tensor(占位符) 直接炸 "TypeError: new(): invalid data type 'str'"
                #    （2026-10-26 真机首次跑就踩到了）。这里同时加类型守卫兜底。
                "images": ("IMAGE", {
                    "tooltip": (
                        "要合成视频的图像批，顺序即播放顺序。\n"
                        "分辨率取第 1 帧的宽高，所以整批必须是同一尺寸 —— "
                        "尺寸不一先拉同一个缩放节点。\n"
                        " 不接就跑不出片（会明确报错提示）。"
                    ),
                }),
                "audio": ("AUDIO", {
                    "tooltip": (
                        "【 音轨】可选，接了就一起封进 mp4（带声音的成片）。\n"
                        "标准格式：{\"waveform\": 张量[1,声道,采样数], \"sample_rate\": 采样率}\n"
                        " 音频比视频短会按视频长度补静音；比视频长按「裁到音频」开关处理。"
                    ),
                }),
                "format": (FORMAT_CHOICES, {
                    "default": "video/h264-mp4",
                    "tooltip": (
                        "【 容器格式】\n"
                        "· video/h264-mp4（默认）= mp4 + H.264，剪辑软件全吃得下\n"
                        "· image/gif = 动图（无音轨）\n"
                        "· image/webp = 动态 webp（无音轨）"
                    ),
                }),
                "pix_fmt": (PIX_FMT_CHOICES, {
                    "default": "yuv420p",
                    "tooltip": (
                        "【 像素格式】\n"
                        "· yuv420p（默认）= 兼容性最好，手机/微信/B站全兼容\n"
                        "· yuv420p10le = 10bit，色彩更细腻，但部分平台不认\n"
                        " 除非你要 10bit，别的别动。"
                    ),
                }),
                "crf": ("INT", {
                    "default": 19, "min": 0, "max": 51, "step": 1,
                    "tooltip": (
                        "【 画质】数值越小越清晰、文件越大。\n"
                        "· 0 = 几乎无损（很大）· 19（默认）= 画质与体积平衡\n"
                        "· 26~30 = 体积优先，细节会糊\n"
                        " 只对 h264-mp4 生效。"
                    ),
                }),
                "save_metadata": ("BOOLEAN", {
                    "default": True,
                    "tooltip": (
                        "【 存元数据】把工作流和提示词写进视频文件里。\n"
                        "开 = 以后能看出这段视频是怎么生成的；关 = 文件小一点。"
                    ),
                }),
                "trim_to_audio": ("BOOLEAN", {
                    "default": False,
                    "tooltip": (
                        "【 裁到音频长度】音画不等长时以谁为准。\n"
                        "· 关（默认）= **以视频为准**：音频短就补静音到视频长（视频不会被截）\n"
                        "· 开 = **以音频为准**：视频会被裁到音频长度（视频可能短一截）\n"
                        " 续接类工作流建议保持关 —— 开了容易出现「画面比声音短」"
                    ),
                }),
                "pingpong": ("BOOLEAN", {
                    "default": False,
                    "tooltip": (
                        "【 乒乓播放】正放 + 倒放 + 正放…\n"
                        "开 = 画面来回弹，适合做循环动效。\n"
                        " 只影响画面，音轨不跟着倒放。"
                    ),
                }),
                "loop_count": ("INT", {
                    "default": 0, "min": 0, "max": 100, "step": 1,
                    "tooltip": (
                        "【 循环次数】把整段重复几遍（0 = 只放一遍）。\n"
                        "· 3 = 同一段视频连续播 3 遍\n"
                        " 只影响画面，音轨不会重复。"
                    ),
                }),
                "save_output": ("BOOLEAN", {
                    "default": True,
                    "tooltip": (
                        "【 保存到 output】\n"
                        "· 开（默认）= 写进 output 目录，永久保留\n"
                        "· 关 = 只放临时目录，重启就没了（调试时防堆文件）"
                    ),
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                # unique_id：用来把「音画自检结果」推回前端的对应节点
                # （前端拿不到张量，只能靠后端回报真实的帧数/音轨长度）
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("VIDEO", "STRING")
    RETURN_NAMES = ("video", "file_path")
    FUNCTION = "combine_video"
    OUTPUT_NODE = True
    CATEGORY = CATEGORY_TYPE
    DESCRIPTION = (
        "【干什么】把一串图像帧（+ 可选音轨）合成视频文件，输出可直接预览的 VIDEO 和文件路径。\n"
        "【怎么配】· images：图像批（顺序即播放顺序，必须同尺寸）\n"
        "· frame_rate：帧率，默认 24，**必须和出片时一致**（H3/LTX 是 24）\n"
        "· audio：音轨，接了成片才带声音\n"
        "· filename_prefix：输出前缀\n"
        "【特色】零第三方依赖（PyAV 直编，不调 ffmpeg 子进程）；输出 VIDEO 口能直接在节点框里播放。\n"
        " 音画同步的命门：帧率填错（例：实际 24 填 25）画面会压快 4%，声音就对不上嘴。"
    )

    # ------------------------------------------------------------------ 主流程

    def combine_video(
        self,
        images,
        frame_rate,
        filename_prefix,
        audio=None,
        format="video/h264-mp4",
        pix_fmt="yuv420p",
        crf=19,
        save_metadata=True,
        trim_to_audio=False,
        pingpong=False,
        loop_count=0,
        save_output=True,
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
    ):
        if images is None:
            raise ValueError("[XiaoHei-视频合成] 没接到图像帧（images 口是空的）。")

        frames = _to_uint8_images(images)
        if not frames:
            raise ValueError("[XiaoHei-视频合成] 图像批是空的（0 帧）。")

        # ---- pingpong：正放 + 倒放（去掉首尾重复帧）----
        if pingpong and len(frames) > 2:
            frames = frames + frames[-2:0:-1]
        # ---- loop_count：整段重复 N 遍（0 = 不重复）----
        if loop_count > 0 and len(frames) > 0:
            frames = frames * loop_count

        num_frames = len(frames)
        height, width = frames[0].shape[0], frames[0].shape[1]

        # ---- 音画时长自检：把真实帧数 / 音轨秒数推给前端 ----
        #  前端拿不到张量（连线输入的 value 只有运行后才有），所以只能后端回报。
        #    这条是 2026-10-26 LTX 续接踩坑（帧率填 25、实际 24 → 音画差 0.32 秒）的护栏。
        self._push_sync_info(unique_id, num_frames, float(frame_rate), audio, trim_to_audio)

        # ---- 输出路径 ----
        output_dir = (folder_paths.get_output_directory() if save_output
                      else folder_paths.get_temp_directory())
        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, output_dir, width, height
        )
        os.makedirs(full_output_folder, exist_ok=True)

        fmt = format if format in FORMAT_CHOICES else "video/h264-mp4"
        ext = {"video/h264-mp4": "mp4", "image/gif": "gif", "image/webp": "webp"}[fmt]
        file_name = f"{filename}_{counter:05}_.{ext}"
        file_path = os.path.join(full_output_folder, file_name)

        # ---- 元数据 ----
        metadata = {}
        if save_metadata and not args.disable_metadata:
            if prompt is not None:
                metadata["prompt"] = prompt
            if extra_pnginfo is not None:
                metadata.update(extra_pnginfo)

        if fmt == "image/gif":
            self._save_pillow(frames, file_path, "GIF", frame_rate, metadata, loop_count)
        elif fmt == "image/webp":
            self._save_pillow(frames, file_path, "WEBP", frame_rate, metadata, 0)
        else:
            self._save_av(frames, file_path, frame_rate, pix_fmt, crf,
                          audio, metadata, trim_to_audio)

        # ---- 输出 ----
        try:
            from comfy_api.latest._input_impl.video_types import VideoFromComponents
            from comfy_api.latest._util.video_types import VideoComponents
        except ImportError:
            from comfy_api.input_impl import VideoFromComponents
            from comfy_api._util.video_types import VideoComponents

        video = VideoFromComponents(
            VideoComponents(images=images, audio=audio, frame_rate=Fraction(float(frame_rate)))
        )

        return {
            "ui": {
                "gifs": [{
                    "filename": file_name,
                    "subfolder": subfolder,
                    "type": "output" if save_output else "temp",
                    "format": fmt,
                    "frame_rate": frame_rate,
                    "fullpath": file_path,
                }],
            },
            "result": (video, file_path),
        }

    # ------------------------------------------------------------------ 音画自检推送

    @staticmethod
    def _push_sync_info(unique_id, num_frames, frame_rate, audio, trim_to_audio):
        """把「帧数 / 帧率 / 音轨秒数」推回前端，让状态条显示音画是否对齐。

        前端拿不到连线输入的张量（value 只有运行后才填），所以自检数据只能由后端回报。
        推不出去也不影响出片（纯提示功能，绝不能因为提示失败而中断流程）。
        """
        try:
            import re
            m = re.match(r"^\s*(\d+)", str(unique_id)) if unique_id is not None else None
            sid = int(m.group(1)) if m else None
            if sid is None:
                return
            from server import PromptServer
            if getattr(PromptServer, "instance", None) is None:
                return

            audio_sec = None
            if audio is not None:
                try:
                    w = audio["waveform"]
                    sr = int(audio["sample_rate"])
                    shp = list(w.shape)
                    n = int(shp[-1]) if shp else 0
                    if n:
                        audio_sec = n / float(sr)
                except Exception:
                    audio_sec = None

            video_sec = num_frames / float(frame_rate) if frame_rate else None
            diff = None
            if video_sec is not None and audio_sec is not None:
                diff = video_sec - audio_sec

            PromptServer.instance.send_sync(
                "xh-videocombine/sync",
                {
                    "id": sid,
                    "frames": int(num_frames),
                    "fps": float(frame_rate),
                    "video_sec": video_sec,
                    "audio_sec": audio_sec,
                    "diff": diff,
                    "trim_to_audio": bool(trim_to_audio),
                },
            )
        except Exception:
            pass

    # ------------------------------------------------------------------ PyAV 编码（mp4）

    def _save_av(self, frames, file_path, frame_rate, pix_fmt, crf,
                 audio, metadata, trim_to_audio):
        """用 PyAV 直编 mp4（不用 ffmpeg 子进程）。"""
        if pix_fmt not in PIX_FMT_CHOICES:
            pix_fmt = "yuv420p"

        rate = Fraction(round(float(frame_rate) * 1000), 1000)
        is_10bit = pix_fmt == "yuv420p10le"

        # ---- 音频准备：AUDIO 标准格式 {"waveform": [1,声道,采样数], "sample_rate": int} ----
        audio_wave = None
        audio_rate = None
        audio_channels = 0
        if audio is not None:
            try:
                audio_wave = audio["waveform"]
                audio_rate = int(audio["sample_rate"])
            except Exception:
                audio_wave = None
            if audio_wave is not None:
                audio_wave = audio_wave.detach().cpu().float()
                if audio_wave.ndim == 3:
                    audio_wave = audio_wave[0]          # [声道, 采样数]
                elif audio_wave.ndim == 1:
                    audio_wave = audio_wave.unsqueeze(0)
                audio_channels = int(audio_wave.shape[0])
                # 音频总秒数 → 目标采样数
                total_samples = int(audio_wave.shape[1])
                audio_seconds = total_samples / float(audio_rate)
                video_seconds = len(frames) / float(frame_rate)

                if trim_to_audio:
                    # 以音频为准：视频裁到音频长度
                    keep = int(round(audio_seconds * float(frame_rate)))
                    keep = max(1, min(keep, len(frames)))
                    frames = frames[:keep]
                else:
                    # 以视频为准：音频补静音到视频长
                    target = int(round(video_seconds * float(audio_rate)))
                    if target > total_samples:
                        pad = torch.zeros((audio_channels, target - total_samples),
                                          dtype=audio_wave.dtype)
                        audio_wave = torch.cat([audio_wave, pad], dim=1)
                    else:
                        audio_wave = audio_wave[:, :target]

        #  mp4 写自定义元数据必须加 options={"movflags": "use_metadata_tags+faststart"}
        #    （官方 comfy_api 同款，见 comfy_api/latest/_input_impl/video_types.py 的
        #      video_output_config）—— 不加的话 PyAV 会把 prompt/workflow 标签**静默丢掉**。
        #     注意是嵌在 "options" 里，不能直接写 movflags=xxx
        #    （av.open() 不认那个参数，会报 "unexpected keyword argument 'movflags'"，2026-10-26 真机踩到）。
        open_kwargs = {"mode": "w"}
        if file_path.lower().endswith(".mp4"):
            open_kwargs["options"] = {"movflags": "use_metadata_tags+faststart"}

        with av.open(file_path, **open_kwargs) as container:
            if metadata:
                for key, value in metadata.items():
                    try:
                        container.metadata[key] = json.dumps(value)
                    except Exception:
                        container.metadata[key] = str(value)

            video_stream = container.add_stream("h264", rate=rate)
            video_stream.width = frames[0].shape[1]
            video_stream.height = frames[0].shape[0]
            video_stream.pix_fmt = pix_fmt
            video_stream.options = {"crf": str(int(crf))}
            # 对齐到偶数（h264 要求宽高是偶数）
            if video_stream.width % 2:
                video_stream.width = video_stream.width - 1
            if video_stream.height % 2:
                video_stream.height = video_stream.height - 1

            audio_stream = None
            resampler = None
            layout = {1: "mono", 2: "stereo", 6: "5.1"}.get(audio_channels, "stereo")
            if audio_wave is not None:
                audio_stream = container.add_stream("aac", rate=audio_rate, layout=layout)
                resampler = av.audio.resampler.AudioResampler(
                    format="fltp", layout=layout, rate=audio_rate
                )

            # ---- 写视频帧 ----
            for frame in frames:
                img = frame
                if is_10bit:
                    v = av.VideoFrame.from_ndarray(
                        np.ascontiguousarray(img.astype(np.uint16)), format="rgb48le")
                else:
                    v = av.VideoFrame.from_ndarray(
                        np.ascontiguousarray(img), format="rgb24")
                v = v.reformat(format=pix_fmt)
                for packet in video_stream.encode(v):
                    container.mux(packet)
            for packet in video_stream.encode():
                container.mux(packet)

            # ---- 写音频帧 ----
            #  PyAV 的 'fltp' 是 **planar**（非交错）：ndarray 形状必须是 [声道, 采样]，
            #    不能转置成 [采样, 声道]（那样 from_ndarray 会报
            #    "Expected planar array.shape[0] to equal 1 but got N"）。
            #    做法跟官方 comfy_api/latest/_input_impl/video_types.py 的 save_to 一致：
            #    整段波形做成**一个** AudioFrame、pts=0，一次性送进编码器（不分块，pts 不会累积误差）。
            if audio_stream is not None and audio_wave is not None:
                samples = audio_wave.shape[1]
                if samples > 0:
                    wave_np = audio_wave.float().cpu().contiguous().numpy()   # [声道, 采样]
                    af = av.AudioFrame.from_ndarray(wave_np, format="fltp", layout=layout)
                    af.sample_rate = audio_rate
                    af.pts = 0
                    if resampler is not None:
                        for rf in resampler.resample(af):
                            for packet in audio_stream.encode(rf):
                                container.mux(packet)
                        for rf in resampler.resample(None):
                            for packet in audio_stream.encode(rf):
                                container.mux(packet)
                    else:
                        for packet in audio_stream.encode(af):
                            container.mux(packet)
                for packet in audio_stream.encode():
                    container.mux(packet)

            container.close()

    # ------------------------------------------------------------------ Pillow 动图

    def _save_pillow(self, frames, file_path, fmt, frame_rate, metadata, loop_count):
        """gif / webp 走 Pillow（无音轨）。"""
        from PIL import Image, PngImagePlugin

        duration = max(1, int(round(1000.0 / float(frame_rate))))
        imgs = [Image.fromarray(f) for f in frames]
        kwargs = {"save_all": True, "append_images": imgs[1:], "duration": duration}
        if fmt == "GIF":
            kwargs["disposal"] = 2
            kwargs["loop"] = loop_count
        else:
            kwargs["lossless"] = True
        pnginfo = None
        if metadata:
            pnginfo = PngImagePlugin.PngInfo()
            for key, value in metadata.items():
                try:
                    pnginfo.add_text(key, json.dumps(value))
                except Exception:
                    pass
        if pnginfo is not None:
            kwargs["pnginfo"] = pnginfo
        imgs[0].save(file_path, format=fmt, **kwargs)


NODE_CLASS_MAPPINGS = {
    "XHVideoCombine": XHVideoCombine,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHVideoCombine": "视频合成",
}
