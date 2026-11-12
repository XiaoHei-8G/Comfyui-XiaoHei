# -*- coding: utf-8 -*-
""" XiaoHei 家族自研节点：H3 长镜头·改帧传播（分块版）

 本文件与 long_ripple_core.py 是 **XiaoHei 自研**，不是 WepeNerd 原包的 1:1 复刻件。
   依据全部来自可读源码 / 公开文档：
     * wepenerd/ripple_node.py:442-448  ripple dict 字段结构
     * wepenerd/ripple_node.py:557-642  WN_RippleApply.apply() -> {"ui":..., "result": (positive, latent)}
     * wepenerd/ripple_node.py:665-670  WN_RippleOutput 的 (images, audio, frame_rate, comparison)
     * wepenerd/ripple_core.py:35       duration_frames(): 24fps 的 17k+5 合法帧网格
     * comfy_extras/nodes_minimax_h3.py:100  _empty_av_latent() 要求 length 合法
     * comfy_extras/nodes_custom_sampler.py:801/1003/1020  BasicGuider / RandomNoise /
       SamplerCustomAdvanced 均为 V3 io.ComfyNode，返回 io.NodeOutput
     * mark9009/ComfyUI-H3-LongTake README  末段冻结补齐再裁回源时长
     * Songssx/...TimelineDirector README   重叠帧向下对齐到 17k+5

契约对齐收费节点 H3_AutoLongRipple 的公开截图：
   入 model / clip / vae / ripple / sampler / sigmas / edited_images / edited_anchor_N
   出 images / audio / frame_rate（+ XiaoHei 自加的 report 文本）
   widget：prompt / chunk_duration / overlap_frames / seed / chunk_mode

推断部分（源码不可得，已用开关留退路）：
   · 块间续接 = 把上一段最后一帧当作本段 frame 0 的改图锚点（carry_tail，可关）
   · 重叠 9 帧按 17k+5 向下对齐成 5 帧
   · 末段冻结末帧补齐到整块长度，拼接后裁回源帧数
   · 音频整段透传（WN_RippleOutput 的 audio 本就是 "The source audio of the window"）
   · 每段 seed = seed + 段号（确定性；fixed 只表示运行后种子不变）
"""
from __future__ import annotations

import gc
import logging

try:
    from . import long_ripple_core as core
except ImportError:  # 独立包 / 脚本导入
    import long_ripple_core as core

MAX_ANCHORS = 16
DEFAULT_PROMPT = (
    "Edit propagation: each edited frame shows exactly how that moment of the video should look after the edit. "
    "Apply the same changes to every frame of the clip, before, between and after the edited frames, so the edit "
    "stays consistent through the whole video. Keep the guide video's motion, timing, camera movement, composition "
    "and all unedited content unchanged."
)


def ripple_type() -> str:
    """XiaoHei 家族内部用 XH_WN_RIPPLE；独立包回落原版 WN_RIPPLE。"""
    try:
        from .ripple_node import RIPPLE_TYPE
        return RIPPLE_TYPE
    except Exception:
        return "WN_RIPPLE"


def apply_class():
    """优先用家族自己的 WN_RippleApply（双语状态行版本），不依赖原版是否安装。"""
    try:
        from .ripple_node import WN_RippleApply
        return WN_RippleApply
    except Exception:
        pass
    import nodes
    for key in ("XH_WN_RippleApply", "WN_RippleApply"):
        cls = nodes.NODE_CLASS_MAPPINGS.get(key)
        if cls is not None:
            return cls
    raise RuntimeError(
        "H3 Ripple Apply is not installed. 需要 Comfyui-XiaoHei / ComfyUI-WepeNerd 的 RippleApply 节点。")


def _unwrap(out):
    """统一 V1 tuple / V3 io.NodeOutput(.result/.args) / {"result": ...}。"""
    if isinstance(out, dict) and "result" in out:
        return tuple(out["result"])
    if isinstance(out, tuple):
        return out
    for attr in ("result", "args", "results", "values", "outputs"):
        value = getattr(out, attr, None)
        if value is not None:
            if callable(value):
                value = value()
            return tuple(value) if isinstance(value, (list, tuple)) else (value,)
    return (out,)


def _call_node(node_id, **kwargs):
    """按注册 id 调用 ComfyUI 节点；V3 没有 FUNCTION，默认 execute。"""
    import nodes
    cls = nodes.NODE_CLASS_MAPPINGS.get(node_id)
    if cls is None:
        raise RuntimeError(f"Required ComfyUI node '{node_id}' is not installed. {node_id} 未安装。")
    fn_name = getattr(cls, "FUNCTION", "execute")
    return _unwrap(getattr(cls(), fn_name)(**kwargs))


def _free_vram():
    try:
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


# ── XiaoHei 自加：三档内存路径（2026-11-10）─────────────────────────────────────────
# 第一版所有段都以 GPU IMAGE 堆在 pieces 里，最后 torch.cat 再复制一份 ⇒ 峰值约 2×。
# cpu    每段搬去内存条，最后 cat（显存只留一段，RAM 仍 2× 峰值）
# lowmem 每段搬去内存条并直接写进预先开好的一整块 RAM（默认，砍掉 2× 峰值）
# disk   每段先落临时 .npy，最后逐段读回同一块 RAM（过程中只占 1~2 段）
#  三档都返回完整 CPU IMAGE：ComfyUI 的节点契约是「一次返回整条 IMAGE」，
#   所以 disk 只能省「过程中」，最终仍占一整条。彻底流式需要换输出契约，未做。
class _ChunkSink:
    """三档共用的段收集器：接口一致，输出帧数 / 羽化行为一致。"""

    def __init__(self, mode, expected_frames, tmp_dir=None):
        import torch
        self.mode = mode
        self.expected = int(expected_frames)
        self.tmp_dir = tmp_dir
        self.count = 0
        self.pieces = []       # cpu
        self.out = None        # lowmem / disk 的最终缓冲区
        self.written = 0
        self.ends = []
        self.pending = None    # disk：延迟一段落盘，羽化才能改上一段尾部
        self.files = []
        self._torch = torch

    def append(self, piece):
        self.count += 1
        if self.mode == "cpu":
            self.pieces.append(piece)
        elif self.mode == "disk":
            if self.pending is not None:
                self._flush()
            self.pending = piece
        else:
            self._write(piece)

    def _write(self, piece):
        if self.out is None:
            self.out = self._torch.empty(
                (self.expected, *piece.shape[1:]), dtype=piece.dtype, device="cpu")
        n = int(piece.shape[0])
        if self.written + n > self.out.shape[0]:
            raise RuntimeError(
                "chunk plan produced more frames than the preallocated buffer; "
                "check the plan report before retrying.")
        self.out[self.written:self.written + n] = piece
        self.written += n
        self.ends.append(self.written)

    def _flush(self):
        import numpy as np
        import os
        path = os.path.join(self.tmp_dir, f"chunk_{len(self.files):04d}.npy")
        np.save(path, self.pending.detach().cpu().contiguous().numpy())
        self.files.append(path)
        self.pending = None

    def blend_tail(self, blend, n):
        """接缝羽化：只替换已提交队列的最后 n 帧，帧数不变。"""
        import torch
        if n <= 0 or not self.count:
            return
        if self.mode == "cpu":
            self.pieces[-1] = torch.cat([self.pieces[-1][:-n], blend], dim=0)
        elif self.mode == "disk":
            if self.pending is not None:
                self.pending = torch.cat([self.pending[:-n], blend], dim=0)
        else:
            start = self.ends[-1] - n
            self.out[start:start + n] = blend

    def finalize(self, output_frames):
        import numpy as np
        import torch
        if self.mode == "cpu":
            return torch.cat(self.pieces, dim=0)[:output_frames]
        if self.mode == "disk":
            if self.pending is not None:
                self._flush()
            for path in self.files:
                self._write(torch.from_numpy(np.load(path)))
        return self.out[:output_frames]


class XH_WN_H3AutoLongRipple:
    CATEGORY = "XiaoHei/Video"
    FUNCTION = "render"
    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "STRING")
    RETURN_NAMES = ("images", "audio", "frame_rate", "report")
    OUTPUT_TOOLTIPS = (
        "One continuous edited shot, trimmed back to the source frame count.",
        "Source audio of the whole window, passed through unchanged.",
        "24.0 fps (H3 grid).",
        "Plain-text chunk plan, one row per segment.",
    )
    DESCRIPTION = (
        "Long-take H3 Ripple edit propagation. Splits a long window into legal 17k+5 chunks, carries each edit "
        "through every chunk, trims the overlap and returns one continuous shot with the source audio. "
        "This is an XiaoHei original node built on top of WepeNerd's open-source RippleApply chain."
    )

    @classmethod
    def INPUT_TYPES(cls):
        anchors = {f"edited_anchor_{i}": ("IMAGE", {"tooltip":
                   f"Exactly one edited image for marker {i}. Overrides edited_images / uploaded edits."})
                   for i in range(1, MAX_ANCHORS + 1)}
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "ripple": (ripple_type(),),
                "sampler": ("SAMPLER",),
                "sigmas": ("SIGMAS",),
                "prompt": ("STRING", {"multiline": True, "default": DEFAULT_PROMPT,
                           "tooltip": "Keep WepeNerd's default propagation prompt."}),
                "chunk_duration": ("FLOAT", {"default": 10.13, "min": 0.21, "max": 60.0, "step": 0.01,
                                   "tooltip": "Seconds per chunk, snapped to H3's 17k+5 frame grid."}),
                "overlap_frames": ("INT", {"default": 9, "min": 0, "max": 240, "step": 1,
                                   "tooltip": "Requested overlap; rounded DOWN to a legal 17k+5 count."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff,
                         "control_after_generate": True}),
                "chunk_mode": (["enable", "disable"], {"default": "enable",
                               "tooltip": "enable = split into chunks; disable = one single pass."}),
                "dry_run": ("BOOLEAN", {"default": True,
                            "tooltip": "Print the chunk plan only; no model is loaded or sampled."}),
                "seam_blend": ("BOOLEAN", {"default": False,
                               "tooltip": "Cross-fade the overlap frames instead of a hard cut."}),
                "carry_tail": ("BOOLEAN", {"default": True,
                               "tooltip": "Use the previous chunk's last frame as this chunk's frame-0 guide."}),
                # XiaoHei 自加：三档内存路径。存档值只认英文 key，中文显示由前端词典负责。
                "memory_mode": (["cpu", "lowmem", "disk"], {"default": "lowmem",
                                "tooltip": "How each rendered chunk is held: cpu moves it to RAM, "
                                           "lowmem writes into one preallocated RAM buffer, "
                                           "disk streams chunks to a temp folder first."}),
                # XiaoHei 自加：按镜头切点手动分段。默认 average ⇒ 老工作流加载后行为一字不变。
                #  2026-11-10 三层父子模型：cut_mode 扩成四档，manual 仅作旧语法兼容。
                "cut_mode": (["average", "cuts", "single", "manual"], {"default": "average",
                             "tooltip": "L1 segment mode: average = equal-length segments, cuts = your own shot "
                                        "boundaries in the segment panel, single = one segment for the whole video, "
                                        "manual = legacy text syntax (compatibility only)."}),
                "cut_points": ("STRING", {"multiline": True, "default": "",
                               "tooltip": "Legacy cut text, superseded by the on-node segment plan panel. "
                                          "The panel writes a structured JSON plan here; leave the old "
                                          "8.5H, 19.2C:20 syntax untouched to keep legacy behaviour."}),
                #  新参数一律追加到 required 末尾：老工作流的 widgets_values 顺序不能错位。
                "segment_count": ("INT", {"default": 0, "min": 0, "max": 512, "step": 1,
                                 "tooltip": "L1 segment count for average mode; 0 = auto from the H3 frame cap. "
                                            "Ignored when the segment plan panel supplies its own count."}),
            },
            "optional": {"edited_images": ("IMAGE", {"tooltip":
                "Edited frames in marker time order. Overrides the edits attached on Ripple Clip."}), **anchors},
        }

    @staticmethod
    def _explicit_edits(ripple, edited_images, edited_anchors):
        """marker id -> 一张改图，沿用原作者的优先级：单锚点 > 批量 > 上传。"""
        markers = list(ripple.get("markers") or [])
        out = {}
        for index, marker in enumerate(markers):
            identity = int(marker.get("id", index + 1))
            direct = edited_anchors.get(f"edited_anchor_{identity}")
            if direct is not None and len(direct):
                out[identity] = direct[0:1]
            elif edited_images is not None and index < len(edited_images):
                out[identity] = edited_images[index:index + 1]
        return markers, out

    @staticmethod
    def _sub_ripple(ripple, segment, markers, explicit, prev_tail, carry_tail):
        """切一份子 ripple dict，直接喂给 WN_RippleApply.apply()。"""
        import torch
        start, end = segment["source_start"], segment["source_end"]
        window = ripple["window"][start:end]
        if len(window) < segment["generated"]:
            pad = segment["generated"] - len(window)
            window = torch.cat([window, window[-1:].expand(pad, -1, -1, -1)], dim=0)

        local, kwargs, used_ids = [], {}, set()
        for marker in markers:
            frame = int(marker["frame"])
            if not (start <= frame < end):
                continue
            item = dict(marker)
            item["frame"] = frame - start
            identity = int(item.get("id", len(local) + 1))
            used_ids.add(identity)
            image = explicit.get(identity)
            if image is not None:
                kwargs[f"edited_anchor_{identity}"] = image
                item.pop("edited", None)  # Apply 用连进来的图，不再读上传文件
            local.append(item)

        # 块间续接：把上一段最后一帧作为本段 frame 0 的引导图（推断策略，可关）。
        # 首段有真实锚点时不多插帧；首段一个锚点都没有才用源窗首帧兜底（等价原作者默认标记）。
        tail = prev_tail if (carry_tail and prev_tail is not None) else None
        if tail is None and not local:
            tail = window[0:1]
        if tail is not None:
            free_id = next((i for i in range(1, MAX_ANCHORS + 1) if i not in used_ids), None)
            if free_id is not None:
                local.append({"id": free_id, "frame": 0, "edited": "", "edited_at": None})
                # WN_RippleApply 强制 len(image) == 1；prev_tail 也可能是整段重叠帧，这里只取最后一帧
                kwargs[f"edited_anchor_{free_id}"] = tail[-1:]

        # window_key / binding 是整窗缓存键，必须清掉，否则每段复用上一段的源窗 latent
        sub = {key: value for key, value in ripple.items()
               if key not in ("binding", "window_key")}
        sub["window"] = window
        sub["length"] = segment["generated"]
        sub["markers"] = local
        sub["window_start"] = int(ripple.get("window_start", 0)) + start
        sub["window_time"] = sub["window_start"] / core.FPS
        return sub, kwargs

    @staticmethod
    def _sample_chunk(clip, vae, model, sampler, sigmas, prompt,
                      sub_ripple, edit_kwargs, seed):
        """一整段开源 Simple 链，进程内调用（不塞进图、不新建工作流）。"""
        cls = apply_class()
        applied = cls().apply(clip, vae, sub_ripple, prompt, **edit_kwargs)
        if isinstance(applied, dict) and "result" in applied:
            positive, latent = applied["result"]
        else:
            positive, latent = _unwrap(applied)[:2]

        guider = _call_node("BasicGuider", model=model, conditioning=positive)[0]
        noise = _call_node("RandomNoise", noise_seed=int(seed))[0]
        # V3 SamplerCustomAdvanced 返回 NodeOutput(out_latent, denoised)；out_latent 本身是 LATENT dict
        out_latent = _call_node("SamplerCustomAdvanced", noise=noise, guider=guider,
                                sampler=sampler, sigmas=sigmas, latent_image=latent)[0]
        if isinstance(out_latent, dict) and "samples" not in out_latent:
            out_latent = {"samples": out_latent}
        images = _call_node("VAEDecode", samples=out_latent, vae=vae)[0]
        return images

    @staticmethod
    def _blend(prev_overlap, head, count):
        """重叠区线性交叉淡化：0 → 1，只替换两侧各 count 帧，总帧数不变。"""
        import torch
        n = min(int(count), len(prev_overlap), len(head))
        if n <= 0:
            return None, 0
        a, b = prev_overlap[-n:].to(head.device, head.dtype), head[:n]
        w = torch.linspace(0.0, 1.0, n, device=head.device, dtype=head.dtype).view(n, 1, 1, 1)
        return (a * (1.0 - w) + b * w).to(head.dtype), n

    # ── XiaoHei 自加：三档内存路径（2026-11-10）─────────────────────────────────────
    #  第一版所有段都以 GPU IMAGE 堆在 pieces 里，最后 torch.cat 再复制一份 ⇒ 峰值约 2×。
    #  cpu    每段搬去内存条，最后 cat（显存只留一段，RAM 仍 2× 峰值）
    #  lowmem 每段搬去内存条并直接写进预先开好的一整块 RAM（默认，砍掉 2× 峰值）
    #  disk   每段先落临时 .npy，最后逐段读回同一块 RAM（过程中只占 1~2 段）
    #   三档都返回完整 CPU IMAGE：ComfyUI 的节点契约是「一次返回整条 IMAGE」，
    #    所以 disk 只能省「过程中」，最终仍占一整条。彻底流式需要换输出契约，未做。
    MODE_LINE = {
        "cpu": ("Each chunk moves to RAM; all chunks are concatenated at the end.",
                "每段搬到内存条，跑完一次性拼接。"),
        "lowmem": ("Each chunk moves to RAM and is written into one preallocated output.",
                   "每段搬到内存条，直接写进预先开好的一整块输出。"),
        "disk": ("Each chunk is written to a temp folder, then read back into one output.",
                 "每段先写临时文件，最后读回拼成一整条。"),
    }
    MODE_LABEL = {"cpu": ("Save VRAM", "省显存"),
                  "lowmem": ("Save RAM", "省内存"),
                  "disk": ("Disk", "落盘超长")}


    def render(self, model, clip, vae, ripple, sampler, sigmas, prompt,
               chunk_duration, overlap_frames, seed, chunk_mode, dry_run,
               seam_blend=False, carry_tail=True, edited_images=None,
               memory_mode="lowmem", cut_mode="average", cut_points="",
               segment_count=0, **edited_anchors):
        #  三层父子模型的唯一真源 = 面板写出的结构化 JSON。
        #   空面板 / 旧语法文本一律返回 None ⇒ 原样落回老路径，逐位零回归。
        total_hint = int(ripple["length"])
        spec = core.parse_spec(cut_points, total_hint, int(overlap_frames))
        if spec is None and (cut_mode in ("cuts", "single")
                             or (cut_mode == "average" and int(segment_count) > 0)):
            # 面板还没来得及写 JSON（例如 API 调用 / 手动改下拉）时的兜底
            spec = {"mode": cut_mode, "count": max(0, int(segment_count)),
                    "rows": [], "default_split": "auto", "json": False}
        if spec is not None:
            return self._render_hierarchical(
                model=model, clip=clip, vae=vae, ripple=ripple, sampler=sampler,
                sigmas=sigmas, prompt=prompt, chunk_duration=chunk_duration,
                overlap_frames=overlap_frames, seed=seed, dry_run=dry_run,
                seam_blend=seam_blend, carry_tail=carry_tail,
                edited_images=edited_images, memory_mode=memory_mode,
                spec=spec, edited_anchors=edited_anchors)
        # 老路径：手动分段走独立分支（旧语法），下面的平均模式一行未改，老工作流 / API 零回归。
        if cut_mode == "manual" and str(cut_points or "").strip():
            return self._render_manual(
                model=model, clip=clip, vae=vae, ripple=ripple, sampler=sampler,
                sigmas=sigmas, prompt=prompt, chunk_duration=chunk_duration,
                overlap_frames=overlap_frames, seed=seed, dry_run=dry_run,
                seam_blend=seam_blend, carry_tail=carry_tail,
                edited_images=edited_images, memory_mode=memory_mode,
                cut_points=cut_points, edited_anchors=edited_anchors)
        import torch
        total = int(ripple["length"])
        p = core.plan(total, chunk_duration, overlap_frames,
                      chunk_mode=(chunk_mode == "enable"))
        report = core.plan_report(p)
        logging.info("[XiaoHei_WN_H3AutoLongRipple] %s", report.replace("\n", " | "))
        print("[XiaoHei_WN_H3AutoLongRipple]\n" + report)

        source = ripple["window"]
        audio = ripple.get("audio")
        text = [p["summary"]]
        if dry_run:
            text.append(core.line(
                f"dry_run is ON: no model loaded, images below are the source window. "
                f"Turn dry_run off to sample {len(p['segments'])} chunk(s).",
                f"当前是预览模式：未加载模型、未采样，下方图像是源窗口占位。"
                f"关掉 dry_run 才会真跑 {len(p['segments'])} 段。"))
            return {"ui": {"text": text},
                    "result": (source[:p["output_frames"]], audio, float(core.FPS), report)}

        # 非法档位（旧工作流 / API 乱填）一律回落默认，不让整条渲染崩掉
        mode = memory_mode if memory_mode in self.MODE_LABEL else "lowmem"
        if mode != memory_mode:
            logging.warning("[XiaoHei_WN_H3AutoLongRipple] unknown memory_mode %r, falling back to lowmem",
                            memory_mode)
        label_en, label_zh = self.MODE_LABEL[mode]
        desc_en, desc_zh = self.MODE_LINE[mode]
        text.append(core.line(
            f"Memory mode: {label_en} - {desc_en}",
            f"内存模式：{label_zh} — {desc_zh}"))

        markers, explicit = self._explicit_edits(ripple, edited_images, edited_anchors)
        # prev_tail    = 上一段最后一帧（1 张），给下一段当 frame-0 引导图
        # prev_overlap = 上一段尾部 C 帧，只给接缝羽化用；两者不能混用
        prev_tail, prev_overlap = None, None
        overlap = int(p["overlap"])
        tmp = None
        try:
            if mode == "disk":
                import tempfile
                tmp = tempfile.TemporaryDirectory(prefix="xh_h3_long_")
                tmp_dir = tmp.name
            else:
                tmp_dir = None
            sink = _ChunkSink(mode, sum(int(s["new_frames"]) for s in p["segments"]), tmp_dir)
            for segment in p["segments"]:
                sub, edit_kwargs = self._sub_ripple(ripple, segment, markers, explicit,
                                                    prev_tail, carry_tail)
                images = self._sample_chunk(clip, vae, model, sampler, sigmas, prompt,
                                            sub, edit_kwargs, int(seed) + segment["index"])
                # VAE Decode 的输出不带 .cpu()；三档都先搬下 GPU，显存只留当前段。
                images = images.detach().to("cpu", copy=False)
                trim = segment["trim_head"]
                piece = images[trim:].contiguous()
                if seam_blend and prev_overlap is not None and overlap > 0:
                    #  head 必须是「未裁切」的当前段前 overlap 帧（原作者口径），
                    #   不能用 piece[:overlap]：piece 已裁掉 trim_head，会整体错 5 帧。
                    blend, n = self._blend(prev_overlap, images[:overlap], overlap)
                    if n > 0 and sink.count:
                        sink.blend_tail(blend, n)
                    sink.append(piece)
                else:
                    sink.append(piece)
                prev_tail = images[-1:].clone()
                prev_overlap = images[-overlap:].clone() if overlap > 0 else None
                text.append(core.line(
                    f"Chunk #{segment['index']:02d}: source[{segment['source_start']}:{segment['source_end']}] "
                    f"-> {len(images)} frames, trim_head {trim}, pad {segment['pad']}.",
                    f"第 {segment['index'] + 1} 段：源帧 [{segment['source_start']}:{segment['source_end']}] "
                    f"→ 生成 {len(images)} 帧，裁掉开头 {trim} 帧，末段补齐 {segment['pad']} 帧。"))
                logging.info("[XiaoHei_WN_H3AutoLongRipple] chunk %d/%d done",
                             segment["index"] + 1, len(p["segments"]))
                del images, piece, sub, edit_kwargs
                _free_vram()
            frames = sink.finalize(p["output_frames"])
        finally:
            if tmp is not None:
                tmp.cleanup()
            sink = None

        text.append(core.line(
            f"Rendered {len(p['segments'])} chunk(s) -> {len(frames)} of {total} frames "
            f"({'cross-fade' if seam_blend else 'hard cut'} at seams).",
            f"已渲染 {len(p['segments'])} 段，输出 {len(frames)}/{total} 帧"
            f"（接缝{'线性羽化' if seam_blend else '硬切'}）。"))
        return {"ui": {"text": text},
                "result": (frames, audio, float(core.FPS), report)}

    # ── XiaoHei 自加：手动分段（按镜头切点，段长不等 / 每接缝单独重叠）────────────────
    #  平均模式的全局 C 会把硬切点两侧镜头插成「半 A 半 B」，还会用 A 镜头末帧
    #  污染 B 镜头的 frame-0 引导图。这里 H 接缝三样一起关；C:N 的重叠帧数真实生效
    #  （不再被 align_overlap 压成 5），因为 H3 只约束每段生成长度，不约束重叠量。
    def _render_manual(self, model, clip, vae, ripple, sampler, sigmas, prompt,
                       chunk_duration, overlap_frames, seed, dry_run, seam_blend,
                       carry_tail, edited_images, memory_mode, cut_points,
                       edited_anchors):
        import torch
        total = int(ripple["length"])
        cuts = core.parse_cuts(cut_points, total, int(overlap_frames))
        p = core.plan_from_cuts(total, cuts, chunk_duration, int(overlap_frames))
        report = core.plan_report(p)
        logging.info("[XiaoHei_WN_H3AutoLongRipple/manual] %s", report.replace("\n", " | "))
        print("[XiaoHei_WN_H3AutoLongRipple/manual]\n" + report)

        source = ripple["window"]
        audio = ripple.get("audio")
        text = [p["summary"], core.cut_line(p, cuts)]
        if dry_run:
            text.append(core.line(
                f"dry_run is ON: no model loaded, images below are the source window. "
                f"Turn dry_run off to sample {len(p['segments'])} chunk(s).",
                f"当前是预览模式：未加载模型、未采样，下方图像是源窗口占位。"
                f"关掉 dry_run 才会真跑 {len(p['segments'])} 段。"))
            return {"ui": {"text": text},
                    "result": (source[:p["output_frames"]], audio,
                               float(core.FPS), report)}

        mode = memory_mode if memory_mode in self.MODE_LABEL else "lowmem"
        if mode != memory_mode:
            logging.warning("[XiaoHei_WN_H3AutoLongRipple/manual] unknown memory_mode %r, falling back to lowmem",
                            memory_mode)
        label_en, label_zh = self.MODE_LABEL[mode]
        desc_en, desc_zh = self.MODE_LINE[mode]
        text.append(core.line(f"Memory mode: {label_en} - {desc_en}",
                              f"内存模式：{label_zh} — {desc_zh}"))

        markers, explicit = self._explicit_edits(ripple, edited_images, edited_anchors)
        prev_tail, prev_overlap = None, None
        tmp = None
        sink = None
        try:
            if mode == "disk":
                import tempfile
                tmp = tempfile.TemporaryDirectory(prefix="xh_h3_long_")
                tmp_dir = tmp.name
            else:
                tmp_dir = None
            sink = _ChunkSink(mode, p["output_frames"], tmp_dir)
            for segment in p["segments"]:
                O_prev = int(segment["trim_head"])
                O_next = int(segment["overlap_after"])
                take = int(segment["new_frames"])
                # 硬切接缝：0 重叠、不羽化、不把 A 镜头末帧塞进 B 镜头当引导图
                use_tail = bool(carry_tail and segment["seam_before"] == "C"
                                and prev_tail is not None)
                sub, edit_kwargs = self._sub_ripple(
                    ripple, segment, markers, explicit,
                    prev_tail if use_tail else None, use_tail)
                images = self._sample_chunk(clip, vae, model, sampler, sigmas, prompt,
                                            sub, edit_kwargs, int(seed) + segment["index"])
                images = images.detach().to("cpu", copy=False)
                # 段边界严格落在用户给的帧上：只取 [O_prev, O_prev + take)
                piece = images[O_prev:O_prev + take].contiguous()
                if seam_blend and prev_overlap is not None and len(prev_overlap):
                    n = len(prev_overlap)
                    blend, used = self._blend(prev_overlap, images[:n], n)
                    if used > 0 and sink.count:
                        sink.blend_tail(blend, used)
                sink.append(piece)
                prev_overlap = piece[-O_next:].clone() if O_next > 0 else None
                prev_tail = piece[-1:].clone()
                hard = segment["seam_before"] == "H"
                text.append(core.line(
                    f"Chunk #{segment['index']:02d}: frames [{segment['cut_frame']}:"
                    f"{segment['cut_frame'] + take}] -> {take} frames, gen {len(images)}, "
                    f"seam_in {'hard cut' if hard else 'continuous'} ({O_prev}f), "
                    f"seam_out {O_next}f, pad {segment['pad']}.",
                    f"第 {segment['index'] + 1} 段：输出帧 [{segment['cut_frame']}:"
                    f"{segment['cut_frame'] + take}] 共 {take} 帧，生成 {len(images)} 帧；"
                    f"入接缝{'硬切' if hard else '连续'}（重叠 {O_prev} 帧），"
                    f"出接缝重叠 {O_next} 帧，末段补齐 {segment['pad']} 帧。"))
                logging.info("[XiaoHei_WN_H3AutoLongRipple/manual] chunk %d/%d done",
                             segment["index"] + 1, len(p["segments"]))
                del images, piece, sub, edit_kwargs
                _free_vram()
            frames = sink.finalize(p["output_frames"])
        finally:
            if tmp is not None:
                tmp.cleanup()
            sink = None

        hard_seams = sum(1 for s in p["segments"][1:] if s["seam_before"] == "H")
        text.append(core.line(
            f"Rendered {len(p['segments'])} chunk(s) -> {len(frames)}/{total} frames; "
            f"{hard_seams} hard cut seam(s) kept overlap-free"
            f"{'; cross-fade on continuous seams' if seam_blend else '; hard cut everywhere'}.",
            f"已渲染 {len(p['segments'])} 段，输出 {len(frames)}/{total} 帧；"
            f"{hard_seams} 处硬切接缝保持零重叠"
            f"{'；连续接缝做了线性羽化' if seam_blend else '；所有接缝硬切'}。"))
        return {"ui": {"text": text},
                "result": (frames, audio, float(core.FPS), report)}

    # ── XiaoHei 自加：三层父子模型（L1 分段 / L2 逐段 / L3 段内分块）────────────────────
    #  plan_hierarchical() 的 segments 与 plan_from_cuts() 同构（seam_before / trim_head /
    #  new_frames / overlap_after / cut_frame），所以渲染循环照抄 _render_manual()，
    #  只换「计划来源」与「分层状态行」；老平均 / 旧语法两条路径一行未动。
    def _render_hierarchical(self, model, clip, vae, ripple, sampler, sigmas, prompt,
                             chunk_duration, overlap_frames, seed, dry_run, seam_blend,
                             carry_tail, edited_images, memory_mode, spec,
                             edited_anchors):
        import torch
        total = int(ripple["length"])
        p = core.plan_hierarchical(total, spec, chunk_duration, int(overlap_frames))
        report = core.plan_report(p)
        logging.info("[XiaoHei_WN_H3AutoLongRipple/hierarchy] %s", report.replace("\n", " | "))
        print("[XiaoHei_WN_H3AutoLongRipple/hierarchy]\n" + report)

        source = ripple["window"]
        audio = ripple.get("audio")
        text = [p["summary"], core.hierarchy_line(p, spec)]
        if dry_run:
            text.append(core.line(
                f"dry_run is ON: no model loaded, images below are the source window. "
                f"Turn dry_run off to sample {len(p['segments'])} block(s) in "
                f"{len(p['segments_meta'])} segment(s).",
                f"当前是预览模式：未加载模型、未采样，下方图像是源窗口占位。"
                f"关掉 dry_run 才会真跑 {len(p['segments_meta'])} 段 / {len(p['segments'])} 块。"))
            return {"ui": {"text": text},
                    "result": (source[:p["output_frames"]], audio,
                               float(core.FPS), report)}

        mode = memory_mode if memory_mode in self.MODE_LABEL else "lowmem"
        if mode != memory_mode:
            logging.warning("[XiaoHei_WN_H3AutoLongRipple/hierarchy] unknown memory_mode %r, falling back to lowmem",
                            memory_mode)
        label_en, label_zh = self.MODE_LABEL[mode]
        desc_en, desc_zh = self.MODE_LINE[mode]
        text.append(core.line(f"Memory mode: {label_en} - {desc_en}",
                              f"内存模式：{label_zh} — {desc_zh}"))

        markers, explicit = self._explicit_edits(ripple, edited_images, edited_anchors)
        prev_tail, prev_overlap = None, None
        tmp = None
        sink = None
        try:
            if mode == "disk":
                import tempfile
                tmp = tempfile.TemporaryDirectory(prefix="xh_h3_long_")
                tmp_dir = tmp.name
            else:
                tmp_dir = None
            sink = _ChunkSink(mode, p["output_frames"], tmp_dir)
            for segment in p["segments"]:
                O_prev = int(segment["trim_head"])
                O_next = int(segment["overlap_after"])
                take = int(segment["new_frames"])
                # 硬切段边界：0 重叠、不羽化、不把 A 镜头末帧塞进 B 镜头当引导图。
                # 段内块边界是 C：正常续接尾帧 + 全局重叠。
                use_tail = bool(carry_tail and segment["seam_before"] == "C"
                                and prev_tail is not None)
                sub, edit_kwargs = self._sub_ripple(
                    ripple, segment, markers, explicit,
                    prev_tail if use_tail else None, use_tail)
                images = self._sample_chunk(clip, vae, model, sampler, sigmas, prompt,
                                            sub, edit_kwargs, int(seed) + segment["index"])
                images = images.detach().to("cpu", copy=False)
                piece = images[O_prev:O_prev + take].contiguous()
                if seam_blend and prev_overlap is not None and len(prev_overlap):
                    n = len(prev_overlap)
                    blend, used = self._blend(prev_overlap, images[:n], n)
                    if used > 0 and sink.count:
                        sink.blend_tail(blend, used)
                sink.append(piece)
                prev_overlap = piece[-O_next:].clone() if O_next > 0 else None
                prev_tail = piece[-1:].clone()
                hard = segment["seam_before"] == "H"
                text.append(core.line(
                    f"Seg {segment['segment_index'] + 1} / block #{segment['index']:02d}: "
                    f"frames [{segment['cut_frame']}:{segment['cut_frame'] + take}] -> {take} frames, "
                    f"gen {len(images)}, seam_in {'hard cut' if hard else 'continuous'} ({O_prev}f), "
                    f"seam_out {O_next}f, pad {segment['pad']}.",
                    f"第 {segment['segment_index'] + 1} 段 / 第 {segment['index'] + 1} 块："
                    f"输出帧 [{segment['cut_frame']}:{segment['cut_frame'] + take}] 共 {take} 帧，"
                    f"生成 {len(images)} 帧；入接缝{'硬切' if hard else '连续'}（重叠 {O_prev} 帧），"
                    f"出接缝重叠 {O_next} 帧，末段补齐 {segment['pad']} 帧。"))
                logging.info("[XiaoHei_WN_H3AutoLongRipple/hierarchy] block %d/%d done",
                             segment["index"] + 1, len(p["segments"]))
                del images, piece, sub, edit_kwargs
                _free_vram()
            frames = sink.finalize(p["output_frames"])
        finally:
            if tmp is not None:
                tmp.cleanup()
            sink = None

        hard_seams = sum(1 for s in p["segments"][1:] if s["seam_before"] == "H")
        auto_blocks = sum(1 for s in p["segments"] if s.get("auto_split"))
        text.append(core.line(
            f"Rendered {len(p['segments_meta'])} segment(s) / {len(p['segments'])} block(s) "
            f"-> {len(frames)}/{total} frames; {hard_seams} hard cut seam(s) kept overlap-free, "
            f"{auto_blocks} auto-split seam(s) inside segments"
            f"{'; cross-fade on continuous seams' if seam_blend else '; hard cut everywhere'}.",
            f"已渲染 {len(p['segments_meta'])} 段 / {len(p['segments'])} 块，"
            f"输出 {len(frames)}/{total} 帧；{hard_seams} 处硬切接缝保持零重叠，"
            f"段内自动补切 {auto_blocks} 处"
            f"{'；连续接缝做了线性羽化' if seam_blend else '；所有接缝硬切'}。"))
        return {"ui": {"text": text},
                "result": (frames, audio, float(core.FPS), report)}


NODE_CLASS_MAPPINGS = {"XH_WN_H3AutoLongRipple": XH_WN_H3AutoLongRipple}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_WN_H3AutoLongRipple": "H3 Auto Long Ripple (XH)"}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "XH_WN_H3AutoLongRipple"]
