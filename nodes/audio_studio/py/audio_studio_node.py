# nodes/audio_studio/py/audio_studio_node.py
"""XiaoHei-图片蹦迪 -- 1:1 复刻 ComfyUI-Pixaroma 的 AudioReact Pixaroma (MIT)。

Effect math lives in the shared engine (_audio_react_engine.py). This
node ships a fullscreen browser editor with WebGL preview as the only
config surface (no on-canvas widgets). The editor saves to a hidden
`XHAudioStudioJson` input via Pattern #9 (extension-scope app.graphToPrompt
injection).

Source resolution at exec time:
- image: optional upstream IMAGE input. If unwired, loaded from disk at
  input/xiaohei/audio_studio/<node_id>/image.<ext>.
- audio: same dual-source pattern. Disk-stored audio is always WAV
  (browser converts before upload -- see js/xh_audio_studio/audio_analysis.mjs).

只改三类接线标识：class_type / 隐藏输入名 / import 路径；算法与契约 1:1 照抄。
"""
from __future__ import annotations

import json
import os
import wave
from pathlib import Path

import numpy as np
import torch
from PIL import Image

import folder_paths

from ._audio_react_engine import (
    generate_video,
    params_from_dict,
    validate_params,
)
from ._path_guard import safe_join
from ._resize_helpers import normalize_bit_depth


# 家族独立输入根：与 Pixaroma 原包的 input/pixaroma 分开，两包同装互不覆盖。
XH_INPUT_ROOT = Path(folder_paths.get_input_directory()) / "xiaohei"


def _resolve_inline(rel_path, what: str) -> str:
    """Resolve an editor-supplied relative path INSIDE XH_INPUT_ROOT.

    SECURITY (fixed 2026-08-03, reported on ComfyUI-Manager PR #3118): these
    paths arrive in the hidden `XHAudioStudioJson` widget, and /prompt is
    unauthenticated, so the value is attacker-controlled. The old code did
    `XH_INPUT_ROOT / rel_path`, and BOTH pathlib's `/` and os.path.join
    DISCARD the base when the right-hand side is absolute
    (Path('/base')/'/etc/passwd' == Path('/etc/passwd')), so an absolute
    rel_path read any file on the host and returned it as a tensor - which the
    graph could then route to a Save or Preview node. '../' escaped too.

    Containment is the realpath check, not string inspection: rejecting '..'
    by hand misses symlinks and the absolute-path case above.

    ORDERING (2026-08-04, follow-up review on the same PR): the first pass
    kept its own join+realpath, which refused the read correctly but only AFTER
    resolving. On Windows that is already the attack for a UNC rel_path -
    realpath opens SMB and hands over an NTLM hash during the resolve itself.
    safe_join() runs the lexical rel_is_rooted() screen FIRST, so a UNC value is
    refused without ever being touched. Never hand-roll the join again; the
    resolve is the thing that has to be prevented, not just the read.
    """
    root = str(XH_INPUT_ROOT)
    candidate = safe_join(root, rel_path)
    if candidate is None:
        raise ValueError(
            f"[XiaoHei] 图片蹦迪 —— 拒绝读取插件输入目录之外的{what}。"
            f"请重新打开编辑器，重选一次{what}。"
        )
    return candidate


def _migrate_cfg(cfg: dict) -> dict:
    """Apply schema_version migrations. v1 is the only version at ship --
    this is here so future migrations have an obvious home."""
    version = cfg.get("schema_version", 1)
    # Future: if version < N: ... apply migration ...; version = N
    cfg["schema_version"] = version
    return cfg


def _load_inline_image(rel_path: str) -> torch.Tensor:
    """Load PNG/JPG/WebP from input/xiaohei/audio_studio/... -> IMAGE tensor
    [1, H, W, 3] in [0, 1]."""
    abs_path = _resolve_inline(rel_path, "图片")
    if not os.path.exists(abs_path):
        raise ValueError(
            f"[XiaoHei] 图片蹦迪 —— 内联图片不见了：{abs_path}。"
            f"请重新打开编辑器，重选一次图片。"
        )
    # The inline image is a RAW file the user uploaded, so it can be 16-bit, and
    # a bare .convert() would CLAMP it to near-white with no error anywhere.
    # See load-image.md #21; no-op for 8-bit.
    arr = np.array(
        normalize_bit_depth(Image.open(abs_path)).convert("RGB"), dtype=np.float32
    ) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _load_inline_audio(rel_path: str) -> dict:
    """Load WAV from input/xiaohei/audio_studio/... -> AUDIO dict
    {waveform: [1, C, S], sample_rate: int}.

    WAV-only -- the browser converts other formats (MP3 / OGG / AAC) to WAV
    before upload via the Web Audio API + an inline 16-bit PCM writer.
    Keeps the Python side dependency-free (stdlib `wave` module).
    """
    abs_path = _resolve_inline(rel_path, "音频")
    if not os.path.exists(abs_path):
        raise ValueError(
            f"[XiaoHei] 图片蹦迪 —— 内联音频不见了：{abs_path}。"
            f"请重新打开编辑器，重选一次音频。"
        )
    with wave.open(str(abs_path), "rb") as wf:
        sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
    if sample_width == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif sample_width == 1:
        data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise ValueError(
            f"[XiaoHei] 图片蹦迪 —— 不支持的 WAV 采样宽度："
            f"{sample_width} 字节。请重新编码成 16 位 PCM WAV。"
        )
    if n_channels > 1:
        data = data.reshape(-1, n_channels).T  # [C, S]
    else:
        data = data.reshape(1, -1)             # [1, S]
    waveform = torch.from_numpy(data).unsqueeze(0)  # [1, C, S]
    return {"waveform": waveform, "sample_rate": sample_rate}


class XHAudioStudio:
    """XiaoHei-图片蹦迪 -- 单张图片跟随音频律动生成视频（1:1 复刻 AudioReact Pixaroma）。

    No widget UI on the node itself -- config is stored in node.properties
    and surfaced via a fullscreen JS editor.
    """

    DESCRIPTION = (
        "XiaoHei-图片蹦迪 - 把一张静态图片变成跟随音频律动的视频。"
        "点开节点进全屏编辑器：可以拖动音频听位置、挑一个运动模式（15 种：脉冲缩放、"
        "镜头抖动、故障、挤压、波浪、倾斜、像素化、RGB 错位等等），再往上叠最多 8 层叠加效果"
        "（色差偏移、泛光、暗角、色相偏移、电影调色、黑边、扫描线、胶片颗粒）。"
        "WebGL 实时预览会跟着节拍动，拖参数当场看效果。\n\n"
        "无需额外模型。输出是逐帧图像 + 音频 + fps，接 Save Mp4 之类的下游节点即可带音频封装成 MP4。需要 WebGL2。\n\n"
        "两个输入都是可选的——可以从任意上游接 IMAGE / AUDIO 进来，也可以直接在编辑器里"
        "载入（拖进来或选文件）。打开编辑器的内联固定开关后，新载入的素材会盖掉上游接线，"
        "关掉就恢复上游优先。"
    )

    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "image": ("IMAGE", {"tooltip": "可选的上游图像。接了就用它作为动态/叠加的静态底图；没接则使用编辑器内上传的图像。编辑器里的内联固定开关可让新上传覆盖上游接线。"}),
                "audio": ("AUDIO", {"tooltip": "可选的上游音频，驱动每一帧的动态/叠加包络。与图像同样的双来源逻辑：默认上游优先，但在编辑器内拖入的内联音频（WAV/MP3/OGG）打开固定开关后会覆盖上游。"}),
            },
            "hidden": {
                "XHAudioStudioJson": ("STRING", {"default": "{}"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT")
    RETURN_NAMES = ("video_frames", "audio", "fps")
    OUTPUT_TOOLTIPS = (
        "渲染出的动画帧序列。接到 Save Mp4 或预览节点。",
        "穿透输出的音频轨，方便下游把它封装到视频上。",
        "渲染的帧率（每秒帧数）。",
    )
    FUNCTION = "generate"
    CATEGORY = "XiaoHei/音频"

    def generate(self, XHAudioStudioJson="{}", image=None, audio=None):
        try:
            cfg = json.loads(XHAudioStudioJson or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"[XiaoHei] 图片蹦迪 —— 解析 XHAudioStudioJson 失败：{exc}。"
                f"请打开编辑器重新保存一次。"
            ) from exc
        cfg = _migrate_cfg(cfg)
        params = params_from_dict(cfg)

        # Source resolution priority:
        #   1. cfg.image_force_inline + cfg.image_path  -> inline (override)
        #   2. upstream wired (image is not None)        -> upstream
        #   3. cfg.image_path                            -> inline (fallback)
        #   4. else                                       -> error
        #
        # The force_inline flag is set by the JS editor when the user
        # explicitly picks/drag-drops a file in the studio while upstream
        # is wired -- that user action signals "use this new upload, not
        # the wire". Toggled off by clicking the pill again. This handles
        # both directions: wiring a new upstream auto-takes effect (since
        # force_inline is false by default), AND a fresh in-editor upload
        # wins even when upstream is wired.
        if cfg.get("image_force_inline") and cfg.get("image_path"):
            image = _load_inline_image(cfg["image_path"])
        elif image is None:
            if cfg.get("image_path"):
                image = _load_inline_image(cfg["image_path"])
            else:
                raise ValueError(
                    "[XiaoHei] 图片蹦迪 —— 没有图片来源。请接入 IMAGE 输入，"
                    "或打开编辑器载入一张内联图片。"
                )

        if cfg.get("audio_force_inline") and cfg.get("audio_path"):
            audio = _load_inline_audio(cfg["audio_path"])
        elif audio is None:
            if cfg.get("audio_path"):
                audio = _load_inline_audio(cfg["audio_path"])
            else:
                raise ValueError(
                    "[XiaoHei] 图片蹦迪 —— 没有音频来源。请接入 AUDIO 输入，"
                    "或打开编辑器载入一段内联音频。"
                )

        for diag in validate_params(params):
            print(f"[XiaoHei] 图片蹦迪 -- {diag}")
        frames = generate_video(image, audio, params)
        return (frames, audio, float(params.fps))


NODE_CLASS_MAPPINGS = {"XH_AudioStudio": XHAudioStudio}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_AudioStudio": "图片蹦迪 小黑"}
