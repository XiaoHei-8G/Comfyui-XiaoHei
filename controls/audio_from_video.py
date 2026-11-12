# XiaoHei-视频取音（XiaoHei 家族）
#
# 解决什么问题（2026-10-26）：
#   LTX-2.5 / H3 这类「音画联合生成」的模型，出来的 VIDEO **自带音轨**（子图里
#   CreateVideo 的 audio 口就是模型解出来的原生音轨）。但很多工作流为了做接缝
#   处理（色调补偿 / 帧重排 / 换首帧），会把 VIDEO 拆成纯画面去改，改完再合成时
#   **音轨就丢了** —— 结果就是成片没声音。
#   本节点把 VIDEO 里的音轨单独取出来（AUDIO），让「改画面」和「留声音」两条路
#   能并行：画面走你的处理链，声音走本节点，最后一起合成。
#
# 对照对象：
#   · 官方 `GetVideoComponents`（comfy_extras/nodes_video.py）—— 官方原生 VIDEO
#     拆解节点，能力最全（frames/audio/fps/bit_depth/color_space）。
#   · comfyui-easy-media 的 `EasyGetAudioFromVideo` —— 第三方，走 ffmpeg 抠轨。
#   · VideoHelperSuite 的 `VHS_VideoCombine` 的 audio 口 —— 吃标准 AUDIO 格式。
#
# XiaoHei 版比官方多的：
#   1. **只取音频也能用**（不接 VIDEO 时也能单独用？不 —— VIDEO 是必接，语义清晰）；
#   2. **兼容两种 VIDEO 形态**：官方 dataclass（VideoComponents / VideoContainer）
#      和老式 dict（{"frame":..., "audio":...}，VHS / 第三方常用），
#      官方节点遇到老 dict 会直接崩，本节点不会；
#   3. **无音轨时给出明确提示**（而不是静默返回 None），并把「音轨时长 vs 画面时长」
#      算出来告诉你对不对得上（对不上会导致合成时音频被截断/画面被拉长）；
#   4. 多送一个 **info 文字输出**，接「显示文本」就能看诊断结果。
#
# 家族规范：
#   · class_type 与 web/xh_video_audio.js 里的 NODE_TYPE 必须逐字一致；
#   · 只用 ComfyUI 官方 API（comfy_api/latest/_util/video_types.py），零三方依赖；
#   · 端口名/控件名一律英文，中文只出现在 tooltip 与前端 label。
#
#  输出格式（与官方 AUDIO 规范一致，VHS_VideoCombine / XHLoadAudio 都能直接吃）：
#     {"waveform": [1, 声道, 采样数] 的 tensor, "sample_rate": int}

import torch


def _to_video_components(video):
    """把任意形态的 VIDEO 归一成 VideoComponents（拿不到就返回 None）。

    官方 dataclass 优先；老式 dict 兜底；都不像就返回 None。
    """
    if video is None:
        return None

    # ⓪ 官方 NodeOutput 包装（真机执行器一般会解包，这里再兜一层）
    if hasattr(video, "result") and not isinstance(video, dict):
        try:
            inner = video.result
            if inner is not None and inner is not video:
                if isinstance(inner, (list, tuple)):
                    inner = inner[0] if inner else None
                if inner is not None:
                    return _to_video_components(inner)
        except Exception:
            pass

    # ① 官方 VideoComponents / VideoContainer：本身就有 get_components()
    get_comp = getattr(video, "get_components", None)
    if callable(get_comp):
        try:
            comp = get_comp()
            if comp is not None:
                return comp
        except Exception:
            pass

    # ② 老式 dict：VHS / 第三方节点常见的 {"frame":..., "audio":...}
    if isinstance(video, dict):
        frames = video.get("frame")
        if frames is None:
            frames = video.get("images")
        audio = video.get("audio")
        fps = video.get("fps") or video.get("frame_rate")
        if frames is None and audio is None:
            return None
        try:
            from comfy_api.latest._util.video_types import VideoComponents
            from fractions import Fraction
        except Exception:
            try:
                from comfy_api._util.video_types import VideoComponents
                from fractions import Fraction
            except Exception:
                return None
        if fps is None:
            fps = 24
        try:
            fr = Fraction(fps).limit_denominator(1000000)
        except Exception:
            fr = Fraction(24)
        return VideoComponents(images=frames, frame_rate=fr, audio=audio)

    # ③ 裸 dataclass（没有 get_components 方法的老版本）
    if hasattr(video, "images") and hasattr(video, "frame_rate"):
        return video

    return None


def _audio_duration(audio):
    """从 AUDIO dict 算时长（秒）；算不出返回 None。"""
    if not isinstance(audio, dict):
        return None
    wave = audio.get("waveform")
    sr = audio.get("sample_rate")
    if wave is None or not sr:
        return None
    try:
        samples = int(wave.shape[-1])
        return samples / float(sr)
    except Exception:
        return None


class XHAudioFromVideo:
    """从 VIDEO 里取出音轨（同时可选输出帧与帧率），用于「改画面但别丢声音」。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": ("VIDEO", {
                    "tooltip": (
                        "要取音的 VIDEO（LTX-2.5 / H3 这类模型出来的 VIDEO 自带原生音轨）。\n"
                        "· 官方 dataclass 与老式 dict 两种形态都支持；\n"
                        "· **音轨不存在时不会报错**，但会输出提示文字告诉你「这视频没声音」。"
                    ),
                }),
            },
            "optional": {
                "output_frames": ("BOOLEAN", {
                    "default": False,
                    "tooltip": (
                        "是否同时输出画面帧（IMAGE）。\n"
                        "· 只要音轨 → 保持关闭（省内存，视频大的话帧很占显存）；\n"
                        "· 需要「拆画面另做处理」时打开。\n"
                        " 输出帧是**未经处理的原始帧**，只是把音轨和画面分家用的。"
                    ),
                }),
            },
        }

    RETURN_TYPES = ("AUDIO", "IMAGE", "FLOAT", "STRING")
    RETURN_NAMES = ("audio", "frames", "fps", "info")
    FUNCTION = "extract"
    CATEGORY = "XiaoHei/音频"
    DESCRIPTION = (
        "视频取音：从 VIDEO 里把音轨取出来（AUDIO），画面/声音分家两条路互不干扰。"
        "解决「做接缝处理换了画面之后成片没声音」的问题。"
        "兼容官方 dataclass 与老式 dict 两种 VIDEO 形态；无音轨时给出明确提示 + 时长对比。"
    )

    def extract(self, video, output_frames=False):
        comp = _to_video_components(video)
        if comp is None:
            return (
                None, None, 0.0,
                "[XiaoHei-视频取音] 没认出这个 VIDEO 的格式（既不是官方 VideoComponents，"
                "也不是常见的 dict）⇒ 取不到音轨。",
            )

        audio = getattr(comp, "audio", None)
        frames = getattr(comp, "images", None)
        fr = getattr(comp, "frame_rate", None)
        try:
            fps = float(fr) if fr is not None else 0.0
        except Exception:
            fps = 0.0

        notes = []
        if audio is None:
            notes.append("这个 VIDEO **没有音轨**（audio 为空）⇒ 音频口输出 None。")
            # 常见原因：这个 VIDEO 是「拆过画面再拼回去」的产物，音轨在拼接时掉了。
            notes.append(
                "常见原因：画面被拆出来单独改过再合成，合成时没把音轨一起带上。"
            )
        else:
            dur = _audio_duration(audio)
            n_frames = None
            try:
                n_frames = int(frames.shape[0]) if frames is not None else None
            except Exception:
                n_frames = None
            if dur is not None and fps > 0 and n_frames:
                vdur = n_frames / fps
                diff = abs(vdur - dur)
                notes.append(
                    "画面 %d 帧 @%.3f fps = %.2f 秒 ｜ 音轨 %.2f 秒 ｜ 差 %.2f 秒"
                    % (n_frames, fps, vdur, dur, diff)
                )
                if diff > 0.25:
                    notes.append(
                        " 画面与音轨长度差 %.2f 秒 —— 合成时音频会被截断（或画面被拉长）。"
                        "LTX 续接常见原因是段数/帧数对不上，检查两段的帧数是否都是 8n+1。"
                        % diff
                    )
            elif dur is not None:
                notes.append("音轨 %.2f 秒" % dur)

        if not output_frames:
            frames = None

        head = "[XiaoHei-视频取音] %s" % ("有音轨" if audio is not None else "无音轨")
        info = head + ("\n· " + "\n· ".join(notes) if notes else "")
        for n in notes:
            print(head + "\n  ↳ " + n)

        return (audio, frames, fps, info)


NODE_CLASS_MAPPINGS = {"XHAudioFromVideo": XHAudioFromVideo}
NODE_DISPLAY_NAME_MAPPINGS = {"XHAudioFromVideo": "视频取音"}
