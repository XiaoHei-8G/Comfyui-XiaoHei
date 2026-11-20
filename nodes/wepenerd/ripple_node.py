"""H3 Ripple video preparation, edited-frame conditioning and output nodes.

Preparation and conditioning use separate nodes so external image editors can
connect between them without creating a graph cycle.
"""

from __future__ import annotations

import asyncio
import itertools
import json
import math
import threading
import weakref
from pathlib import Path

import av
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from comfy_api.latest import io

try:
    from . import ripple_core as rc
    from . import load_video_node as lv
except ImportError:  # loaded standalone by the tests
    import ripple_core as rc
    import load_video_node as lv

RIPPLE_TYPE = "XH_WN_RIPPLE"


# ---------------------------------------------------------------------------
# Video access (input folder only)
# ---------------------------------------------------------------------------


def _input_root() -> Path:
    import folder_paths

    return Path(folder_paths.get_input_directory()).resolve()


def list_videos() -> list[str]:
    """Input videos from Load Video's cached listing."""
    return lv.list_videos(_input_root()) or [""]


def video_path(video: str) -> Path:
    """Resolve a video path within the input folder."""
    return lv.video_path(video)


_info_cache: dict = {}


def probe(path: Path) -> dict:
    """Duration, size (after rotation), native fps, first-frame time and the 24 fps grid length."""
    stat = path.stat()
    key = (str(path), stat.st_size, stat.st_mtime_ns)
    if key in _info_cache:
        return dict(_info_cache[key])
    with av.open(str(path)) as container:
        if not container.streams.video:
            raise ValueError("This file has no video stream.")
        stream = container.streams.video[0]
        rate = stream.average_rate or stream.guessed_rate
        if not rate:
            raise ValueError("Could not read the video's frame rate.")
        start = (stream.start_time or 0) * stream.time_base
        if stream.duration:
            duration = float(stream.duration * stream.time_base)
        elif container.duration:
            duration = container.duration / av.time_base
        else:
            duration = (stream.frames or 0) / float(rate)
        first = next(container.decode(stream), None)
        width, height, rotation, first_time = stream.width, stream.height, 0, 0.0
        if first is not None:
            width, height, rotation = first.width, first.height, first.rotation
            if first.pts is not None:
                first_time = float(first.pts * first.time_base - start)
        if rotation % 180:
            width, height = height, width
    info = {
        "width": int(width), "height": int(height), "rotation": int(rotation), "fps": float(rate),
        "duration": float(duration), "first_time": first_time,
        "grid_frames": rc.grid_frame_count(max(0.0, duration - first_time)),
        "audio": None,
        # Invalidate cached thumbnails when the source file changes.
        "version": f"{stat.st_size:x}-{stat.st_mtime_ns:x}",
    }
    with av.open(str(path)) as container:
        info["audio"] = bool(container.streams.audio)
    if len(_info_cache) > 64:
        _info_cache.clear()
    _info_cache[key] = info
    return dict(info)


def decode_grid_window(path: Path, start: int, length: int, geometry=None) -> tuple[np.ndarray, float]:
    """Frames ``start .. start+length-1`` of the source resampled to 24 fps, as uint8 [N, H, W, 3].

    The 24 fps grid starts at the first frame (FFmpeg fps filter, round=near): grid frame k is the
    last source frame starting before (k + 0.5) / 24, matching the browser preview.
    Decode from the preceding keyframe and convert only window frames to RGB.
    Also returns the window's start time in source seconds.
    """
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        tb = stream.time_base
        stream_start = (stream.start_time or 0) * tb
        first_pts = None
        for frame in container.decode(stream):
            first_pts = frame.pts
            break
        if first_pts is None:
            raise ValueError("The video has no decodable frames.")
        seek_seconds = start / rc.FPS - 1.0
        container.seek(0, stream=stream) if seek_seconds <= 0 else container.seek(
            max(0, math.floor((stream_start + seek_seconds) / tb)), stream=stream, backward=True
        )
        graph = None
        frames: list[np.ndarray] = []
        rotation = 0
        for frame in itertools.chain(container.decode(stream), (None,)):
            if frame is not None:
                if frame.pts is None:
                    raise ValueError("The video has no frame timestamps.")
                rotation = frame.rotation
            if graph is None:
                if frame is None:
                    break
                graph = av.filter.Graph()
                graph.link_nodes(
                    graph.add_buffer(width=frame.width, height=frame.height, format=frame.format, time_base=frame.time_base),
                    graph.add("setpts", f"PTS-{first_pts}"),
                    graph.add("fps", f"fps={rc.FPS}:start_time=0:round=near"),
                    graph.add("buffersink"),
                )
                graph.configure()
            graph.push(frame)
            while len(frames) < length:
                try:
                    out = graph.pull()
                except (av.error.BlockingIOError, av.error.EOFError):
                    break
                index = int(out.pts)
                if index < start:
                    continue
                pixels = out.to_ndarray(format="rgb24")
                if rotation:
                    pixels = np.rot90(pixels, rotation // 90)
                if geometry is not None:
                    pixels = transform_pixels(pixels, geometry)
                frames.append(np.ascontiguousarray(pixels))
            if len(frames) >= length:
                break
    if not frames:
        raise ValueError(f"No frames at 24 fps grid position {start}; the window is past the end of the video.")
    window_time = float((first_pts * tb - stream_start)) + start / rc.FPS
    return np.stack(frames), window_time


def decode_audio(path: Path, start_seconds: float, duration: float) -> dict | None:
    with av.open(str(path)) as container:
        if not container.streams.audio:
            return None
        stream = container.streams.audio[0]
        rate = stream.codec_context.sample_rate
        channels = stream.codec_context.channels
        stream_start = float((stream.start_time or 0) * stream.time_base)
        first, count = round((start_seconds + stream_start) * rate), round(duration * rate)
        waveform = np.zeros((channels, count), dtype=np.float32)
        resampler = av.AudioResampler(format="fltp", layout=stream.codec_context.layout, rate=rate)
        if start_seconds > 0.5:
            container.seek(int((stream_start + start_seconds - 0.5) / stream.time_base), stream=stream, backward=True)
        for frame in itertools.chain(container.decode(stream), (None,)):
            for samples in resampler.resample(frame):
                if samples.pts is None:
                    continue
                offset = round(samples.pts * samples.time_base * rate) - first
                if offset >= count:
                    return {"waveform": torch.from_numpy(waveform).unsqueeze(0), "sample_rate": rate}
                lo, hi = max(0, offset), min(count, offset + samples.samples)
                if hi > lo:
                    waveform[:, lo:hi] = samples.to_ndarray()[:, lo - offset:hi - offset]
        return {"waveform": torch.from_numpy(waveform).unsqueeze(0), "sample_rate": rate}


def load_input_image(relative: str) -> torch.Tensor:
    """An attached edited image from ComfyUI's input folder as [1, H, W, 3] floats."""
    from PIL import Image, ImageOps

    root = _input_root()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"Attached edited image not found in the input folder: {relative}")
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        return torch.from_numpy(np.asarray(image, dtype=np.float32) / 255.0)[None]


# 2026-11-08：抽一帧 4K 要 av.open + seek + fps filter + PNG 编码，约 0.9 s。
# 时间轴拖拽结束会重新拉同一批锚帧缩略图，没有缓存时每次都重解码，界面就像"卡住"。
# 缓存键含文件版本 + 帧号 + 完整几何参数；文件一换自动失效。最多留 48 张（约 15 MB）。
_frame_cache: dict = {}
_frame_cache_lock = threading.Lock()


def frame_png(video: str, absolute_frame: int, megapixels=rc.DEFAULT_MEGAPIXELS, crop="", allow_upscale=False,
              resize_method="lanczos", output_width=0, output_height=0) -> tuple[bytes, str]:
    """PNG of one 24 fps grid frame at the generation size, exactly as Ripple Clip outputs it."""
    import io
    from PIL import Image

    path = video_path(video)
    info = probe(path)
    absolute_frame = min(max(0, int(absolute_frame)), max(0, info["grid_frames"] - 1))
    geometry = rc.geometry(info["width"], info["height"], megapixels, crop, allow_upscale,
                           resize_method, output_width, output_height)
    key = (str(path), info["version"], absolute_frame,
           json.dumps(geometry, sort_keys=True, default=str))
    with _frame_cache_lock:
        hit = _frame_cache.get(key)
    if hit is not None:
        return hit
    frames, _ = decode_grid_window(path, absolute_frame, 1, geometry)
    image = trim_content(torch.from_numpy(frames[:1]).float().div_(255), geometry)[0]
    buffer = io.BytesIO()
    Image.fromarray((image.clamp(0, 1).numpy() * 255).round().astype(np.uint8)).save(buffer, format="PNG")
    result = (buffer.getvalue(), f"{Path(video).stem}_f{absolute_frame:05d}.png")
    with _frame_cache_lock:
        if len(_frame_cache) > 48:
            _frame_cache.clear()
        _frame_cache[key] = result
    return result


def transform_pixels(pixels: np.ndarray, geometry: dict) -> np.ndarray:
    """Crop and resize one decoded frame before accumulating a window in RAM."""
    x, y, w, h = geometry["source_rect"]
    left, top, cw, ch = geometry["content_rect"]
    filters = {"lanczos": Image.Resampling.LANCZOS, "bicubic": Image.Resampling.BICUBIC,
               "bilinear": Image.Resampling.BILINEAR, "nearest-exact": Image.Resampling.NEAREST,
               "area": Image.Resampling.BOX}
    image = Image.fromarray(np.ascontiguousarray(pixels[y:y + h, x:x + w]))
    content = np.asarray(image.resize((cw, ch), filters[geometry["resize_method"]]))
    return np.pad(content, ((top, geometry["height"] - ch - top),
                            (left, geometry["width"] - cw - left), (0, 0)), mode="edge")


def trim_content(images: torch.Tensor, geometry: dict | None) -> torch.Tensor:
    x, y, w, h = geometry["content_rect"]
    return images[:, y:y + h, x:x + w].clone()


def edit_to_canvas(images: torch.Tensor, geometry: dict) -> torch.Tensor:
    """An exported edit already has the source crop; resize it and restore only model padding."""
    import comfy.utils

    left, top, cw, ch = geometry["content_rect"]
    # Editors can round the two axes to their own latent grid. Restore the complete image to
    # the exported frame's coordinates; applying the source crop again would change the edit.
    content = images[..., :3].movedim(-1, 1)
    if images.shape[1:3] != (ch, cw):
        content = comfy.utils.common_upscale(content, cw, ch, geometry["resize_method"], "disabled")
    return F.pad(content, (left, geometry["width"] - cw - left, top, geometry["height"] - ch - top),
                 mode="replicate").movedim(1, -1).clamp(0, 1)


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


def _weak(obj):
    try:
        return weakref.ref(obj)
    except TypeError:
        return None


def _same(ref, obj) -> bool:
    return ref is not None and ref() is obj


# Each cache holds one entry. Weak CLIP/VAE references allow models to be released.
_window_cache: dict = {}
_prompt_cache: dict = {}
_source_cache: dict = {}


def load_window(path: Path, info: dict, start: int, length: int, geometry: dict) -> dict:
    """Decode, resize and slice the audio of one window; the last result is kept for re-runs."""
    stat = path.stat()
    key = (str(path), stat.st_size, stat.st_mtime_ns, start, length, json.dumps(geometry, sort_keys=True))
    if _window_cache.get("key") == key:
        return _window_cache["value"]
    frames, window_time = decode_grid_window(path, start, length, geometry)
    notes = []
    if len(frames) < length:  # the container overstated its duration
        shorter = 17 * ((len(frames) - 5) // 17) + 5
        if shorter < 5:
            raise ValueError(f"Only {len(frames)} frames could be decoded at frame {start}; H3 needs at least 5.")
        notes.append(rc.line(f"Only {len(frames)} frames could be decoded here; using {shorter}.",
                             f"这里只能解出 {len(frames)} 帧；改用 {shorter} 帧。"))
        frames, length = frames[:shorter], shorter
    window = torch.from_numpy(frames).float().div_(255)
    audio = decode_audio(path, window_time, length / rc.FPS) if info.get("audio") else None
    value = {"window": window, "length": length, "window_time": window_time, "audio": audio, "notes": notes,
             "key": key}
    _window_cache.clear()
    _window_cache.update(key=key, value=value)
    return value


def encode_prompt(clip, prompt: str):
    """Text-only conditioning, cached per CLIP and prompt."""
    if _same(_prompt_cache.get("clip"), clip) and _prompt_cache.get("prompt") == prompt:
        return _prompt_cache["value"]
    value = clip.encode_from_tokens_scheduled(clip.tokenize(prompt))
    _prompt_cache.clear()
    _prompt_cache.update(clip=_weak(clip), prompt=prompt, value=value)
    return value


def encode_source(vae, ripple: dict):
    """The whole original window as one guide latent, cached per VAE and window."""
    key = ripple.get("window_key")
    if key is not None and _same(_source_cache.get("vae"), vae) and _source_cache.get("key") == key:
        return _source_cache["value"]
    value = vae.encode(ripple["window"][..., :3])
    _source_cache.clear()
    _source_cache.update(vae=_weak(vae), key=key, value=value)
    return value


def framing_inputs():
    return {
        "crop": ("STRING", {"default": "", "tooltip": "Normalized source crop [x, y, width, height]."}),
        "allow_upscale": ("BOOLEAN", {"default": False, "tooltip": "Allow enlarging the cropped source."}),
        "resize_method": (list(rc.RESIZE_METHODS), {"default": "lanczos"}),
        "output_width": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 32,
                                 "tooltip": "Fit within this width. Set height too; zero uses megapixels."}),
        "output_height": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 32,
                                  "tooltip": "Fit within this height. Set width too; zero uses megapixels."}),
    }


# Markers 1..MAX_ANCHORS get their own anchor_N output and edited_anchor_N input. The UI shows only the
# slots in use; markers beyond this still work through uploads or the edited_images batch.
MAX_ANCHORS = 16
ANCHOR_NAMES = tuple(f"anchor_{i}" for i in range(1, MAX_ANCHORS + 1))
EDITED_ANCHOR_NAMES = tuple(f"edited_{name}" for name in ANCHOR_NAMES)


def anchor_tooltip(identity: int) -> str:
    if identity == 1:
        return "The image for marker 1, independent of its position on the timeline."
    return f"The image for marker {identity}; empty until marker {identity} exists."


def anchor_outputs(window, markers, geometry):
    """The marked frames in time order, then one image per marker ID 1..MAX_ANCHORS (empty if absent)."""
    frames = trim_content(window[[m["frame"] for m in markers]], geometry)
    by_id = {m["id"]: frames[i:i + 1] for i, m in enumerate(markers)}
    empty = frames[:0].clone()
    return frames, tuple(by_id.get(identity, empty) for identity in range(1, MAX_ANCHORS + 1))


class WN_RippleClip:
    CATEGORY = "XiaoHei/Video"
    FUNCTION = "select"
    RETURN_TYPES = ("IMAGE", RIPPLE_TYPE, "IMAGE", "AUDIO") + ("IMAGE",) * MAX_ANCHORS
    RETURN_NAMES = ("frames_to_edit", "ripple", "source_window", "audio") + ANCHOR_NAMES
    OUTPUT_TOOLTIPS = (
        "The exact frames to edit (one per marker, in time order), at the size H3 will generate.",
        "Window frames, edited-frame markers and size for Ripple Apply / Ripple Output.",
        "The original frames of the window at the generation size.",
        "The source audio of the window (None if the video has no audio).",
    ) + tuple(anchor_tooltip(i) for i in range(1, MAX_ANCHORS + 1))
    DESCRIPTION = (
        "Load a video, drag the blue window (the frames H3 will generate) along the timeline and move the "
        "marker to the frame you want to edit. Download the frame, edit it, then upload, drop or paste the edit "
        "onto its card. Add another marker when the edit needs another anchor (for example a view the first "
        "frame doesn't show) and give it the same change; each marker gets its own anchor_N output. Arrow keys "
        "step the selected marker; Shift+arrows move the window; Tab switches markers; Ctrl+V pastes an edit "
        "onto the selected marker."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": (list_videos(), {"video_upload": True,"tooltip": "选择要处理的视频"}),
                "duration": ("FLOAT", {"default": rc.DEFAULT_DURATION, "min": 5 / rc.FPS, "max": 150.0,
                                       "step": 0.01, "tooltip": "时长（秒，按 24fps 计），吸附到 H3 步长"}),
                "megapixels": ("FLOAT", {"default": rc.DEFAULT_MEGAPIXELS, "min": 0.001, "max": 268.435456,
                                         "step": 0.01, "tooltip": "可见画面面积（百万像素）"}),
                "window_start": ("INT", {"default": 0, "min": 0, "max": 10_000_000,
                                 "tooltip": "窗口起始帧（在整段视频上的位置）"}),
                "markers": ("STRING", {"default": rc.DEFAULT_MARKERS_JSON, "multiline": False,
                            "tooltip": "带稳定帧号的编辑标记"}),
            },
            "optional": framing_inputs(),
        }

    @classmethod
    def VALIDATE_INPUTS(cls, video, duration, megapixels, crop="",
                        allow_upscale=False, resize_method="lanczos", output_width=0, output_height=0):
        try:
            video_path(video)
            rc.duration_frames(duration)
            rc.geometry(1920, 1080, megapixels, crop, allow_upscale, resize_method,
                        output_width, output_height)
        except (ValueError, IndexError, TypeError) as error:
            return str(error)
        return True

    @classmethod
    def IS_CHANGED(cls, video, **kwargs):
        stat = video_path(video).stat()
        return (video, stat.st_size, stat.st_mtime_ns, tuple(sorted(kwargs.items())))

    def select(self, video, duration, megapixels, window_start, markers, crop="", allow_upscale=False,
               resize_method="lanczos", output_width=0, output_height=0):
        path = video_path(video)
        info = probe(path)
        start, frames_n, notes = rc.fit_window(info["grid_frames"], window_start, rc.duration_frames(duration))
        geometry = rc.geometry(info["width"], info["height"], megapixels, crop, allow_upscale,
                               resize_method, output_width, output_height)
        width, height = geometry["width"], geometry["height"]
        loaded = load_window(path, info, start, frames_n, geometry)
        window, frames_n, audio = loaded["window"], loaded["length"], loaded["audio"]
        notes += loaded["notes"]
        marker_list, marker_notes = rc.parse_markers(markers, frames_n)
        notes += marker_notes
        edits = [marker["frame"] for marker in marker_list]
        ripple = {
            "window": window, "markers": marker_list, "length": frames_n, "width": width,
            "height": height, "fps": rc.FPS, "window_start": start, "window_time": loaded["window_time"],
            "audio": audio, "source": video, "source_version": info["version"], "window_key": loaded["key"],
            "binding": (video, path.stat().st_mtime_ns, start, frames_n, tuple(edits), width, height),
            "geometry": geometry,
        }
        cw, ch = geometry["content_rect"][2:]
        summary = rc.describe(start, frames_n, edits)
        text = [rc.line(summary["en"] + f" · {cw}x{ch}", summary["zh"] + f" · {cw}x{ch}"), *notes]
        ui = {"text": text, "binding": [start, frames_n, edits, video], "geometry": [geometry]}
        frames, anchors = anchor_outputs(window, marker_list, geometry)
        return {"ui": ui, "result": (frames, ripple, window, audio, *anchors)}


class WN_RippleFromFrames(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_WN_RippleFromFrames", display_name="H3 Ripple From Frames",
            category="XiaoHei/Video",
            description="Prepare frames from any video loader for Ripple, keeping the source framing and audio.",
            inputs=[
                io.Image.Input("images", tooltip="输入图像批次（作为视频帧）"),
                io.Float.Input("frame_rate", default=24.0, min=0.001, max=1000.0, tooltip="输出帧率（fps）"),
                io.Float.Input("duration", default=rc.DEFAULT_DURATION, min=5 / rc.FPS, max=150.0, step=0.01, tooltip="时长（秒，按 24fps 计），吸附到 H3 步长"),
                io.Float.Input("megapixels", default=rc.DEFAULT_MEGAPIXELS, min=0.001, max=268.435456, step=0.01, tooltip="可见画面面积（百万像素）"),
                io.Int.Input("window_start", default=0, min=0, max=10_000_000, tooltip="窗口起始帧"),
                io.String.Input("markers", default=rc.DEFAULT_MARKERS_JSON, multiline=True,
                                tooltip="标记 ID 与从 0 起的帧号"),
                io.Audio.Input("audio", optional=True, tooltip="可选音频，随视频一起封装"),
                io.String.Input("crop", default="", optional=True, tooltip="裁剪区域（x,y,宽,高），0=不裁剪"),
                io.Boolean.Input("allow_upscale", default=False, optional=True, tooltip="允许把小图放大到目标尺寸"),
                io.Combo.Input("resize_method", options=list(rc.RESIZE_METHODS), default="lanczos", optional=True, tooltip="缩放算法"),
                io.Int.Input("output_width", default=0, min=0, max=16384, step=32, optional=True,
                             tooltip="适配到该宽度以内（高度按比例）"),
                io.Int.Input("output_height", default=0, min=0, max=16384, step=32, optional=True,
                             tooltip="适配到该高度以内（宽度按比例）"),
            ],
            outputs=[io.Image.Output(display_name="frames_to_edit"), io.Custom(RIPPLE_TYPE).Output(display_name="ripple"),
                     io.Image.Output(display_name="source_window"), io.Audio.Output(display_name="audio"),
                     *[io.Image.Output(display_name=name, tooltip=anchor_tooltip(i))
                       for i, name in enumerate(ANCHOR_NAMES, 1)]])

    @classmethod
    def execute(cls, images, frame_rate, duration, megapixels, window_start, markers, audio=None,
                crop="", allow_upscale=False, resize_method="lanczos", output_width=0, output_height=0):
        if images.ndim != 4 or images.shape[-1] < 3 or not len(images):
            raise ValueError("Images must be a nonempty frame batch.")
        if not math.isfinite(frame_rate) or frame_rate <= 0:
            raise ValueError("Frame rate must be positive.")
        available = rc.grid_frame_count(len(images) / frame_rate)
        start, length, notes = rc.fit_window(available, window_start, rc.duration_frames(duration))
        geometry = rc.geometry(int(images.shape[2]), int(images.shape[1]), megapixels, crop, allow_upscale,
                               resize_method, output_width, output_height)
        frames = []
        for k in range(start, start + length):
            index = min(len(images) - 1, max(0, math.ceil((k + 0.5) * frame_rate / rc.FPS) - 1))
            pixels = (images[index, ..., :3].detach().cpu().clamp(0, 1).numpy() * 255).round().astype(np.uint8)
            frames.append(transform_pixels(pixels, geometry))
        window = torch.from_numpy(np.stack(frames)).float().div_(255)
        sound = None
        if audio is not None:
            rate = audio["sample_rate"]
            begin, count = round(start / rc.FPS * rate), round(length / rc.FPS * rate)
            waveform = audio["waveform"][..., begin:begin + count].clone()
            if waveform.shape[-1] < count:
                waveform = F.pad(waveform, (0, count - waveform.shape[-1]))
            sound = {"waveform": waveform, "sample_rate": rate}
        marker_list, marker_notes = rc.parse_markers(markers, length)
        context = {"window": window, "markers": marker_list, "length": length, "width": geometry["width"],
                   "height": geometry["height"], "fps": rc.FPS, "window_start": start, "window_time": start / rc.FPS,
                   "audio": sound, "source": "frames", "geometry": geometry}
        selected, anchors = anchor_outputs(window, marker_list, geometry)
        return io.NodeOutput(selected, context, window, sound, *anchors,
                             ui={"text": [*notes, *marker_notes], "geometry": [geometry]})


class WN_RippleApply:
    CATEGORY = "XiaoHei/Video"
    FUNCTION = "apply"
    RETURN_TYPES = ("CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "latent")
    OUTPUT_TOOLTIPS = (
        "H3 conditioning: prompt, original window guide at frame 0, each edited frame as a guide at its frame.",
        "Empty H3 audio-video latent for the window.",
    )
    DESCRIPTION = (
        "Builds the conditioning the H3 Ripple LoRA expects: the original window as a guide plus one "
        "guide per edited frame. An edited_anchor_N input (marker ID N) overrides the chronological edited_images "
        "batch, which overrides uploaded edits; a new empty edited_anchor input appears as you connect one. "
        "Use the FL2VA model "
        "with the Ripple LoRA, a BasicGuider (CFG 1) and any H3 sampler. The default prompt works for every edit. "
        "Re-runs with new edits reuse the encoded prompt and source clip."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "CLIP 模型（原样透传不改）"}),
                "vae": ("VAE", {"tooltip": "VAE 模型（原样透传不改）"}),
                "ripple": (RIPPLE_TYPE, {"tooltip": "Ripple 编辑数据"}),
                "prompt": ("STRING", {"multiline": True, "default": rc.DEFAULT_PROMPT,
                           "tooltip": "保持不变；编辑内容来自 Ripple 数据"}),
            },
            "optional": {
                "edited_images": ("IMAGE", {"tooltip": "图内编辑节点产出的已编辑帧"
                                                       "order. Overrides the images attached on Ripple Clip."}),
                **{name: ("IMAGE", {"tooltip": f"Exactly one edited image for marker {i}. Overrides its batch or upload."
                                    + ("" if i == 1 else f" Requires marker {i}.")})
                   for i, name in enumerate(EDITED_ANCHOR_NAMES, 1)},
            },
        }

    def apply(self, clip, vae, ripple, prompt, edited_images=None, **edited_anchors):
        import node_helpers
        from comfy_extras.nodes_minimax_h3 import _empty_av_latent

        unknown = sorted(set(edited_anchors) - set(EDITED_ANCHOR_NAMES))
        if unknown:
            raise TypeError(f"Unknown Ripple Apply input: {', '.join(unknown)}")
        width, height, length = ripple["width"], ripple["height"], ripple["length"]
        markers, _ = rc.parse_markers(ripple["markers"], length)
        geometry = ripple["geometry"]
        explicit = {i: edited_anchors[name] for i, name in enumerate(EDITED_ANCHOR_NAMES, 1)
                    if edited_anchors.get(name) is not None}
        for identity, image in explicit.items():
            if not any(m["id"] == identity for m in markers):
                raise ValueError(f"edited_anchor_{identity} needs marker {identity} on Ripple Clip.")
            if len(image) != 1:
                raise ValueError(f"edited_anchor_{identity} must contain exactly one image.")
        window = ripple["window"]
        notes, checks, keyframes_edit, unchanged = [], [], [], 0
        if edited_images is not None and len(edited_images) != len(markers):
            notes.append(rc.line(
                f"edited_images has {len(edited_images)} image(s) for {len(markers)} marker(s); "
                "missing ones use the attached edits.",
                f"edited_images 有 {len(edited_images)} 张图，对应 {len(markers)} 个标记；"
                "缺的那些用已上传的改图。"))
        missing = [m["frame"] + 1 for i, m in enumerate(markers)
                   if explicit.get(m["id"]) is None
                   and not (edited_images is not None and i < len(edited_images)) and not m.get("edited")]
        if missing:
            frames = ", ".join(str(frame) for frame in missing)
            raise ValueError(f"No edited image for frame{'s' if len(missing) > 1 else ''} {frames}: upload, drop or "
                             "paste one on its Ripple Clip card, or connect edited_images.")
        stale = set(rc.stale_markers(markers, int(ripple.get("window_start", 0)), geometry["crop"],
                                     ripple.get("source"), ripple.get("source_version")))
        window_np = None
        for index, marker in enumerate(markers):
            frame, label = int(marker["frame"]), f"Frame {int(marker['frame']) + 1}"
            zh_label = f"第 {int(marker['frame']) + 1} 帧"
            direct = explicit.get(marker["id"])
            from_input = direct is not None or (edited_images is not None and index < len(edited_images))
            edited = direct if direct is not None else (edited_images[index:index + 1] if from_input
                                                        else load_input_image(marker["edited"]))
            if frame in stale and not from_input:
                notes.append(rc.line(
                    f"{label}: its edit was made for another frame, crop or source. Re-export the frame or restore its selection.",
                    f"{zh_label}：这张改图是为别的帧、别的裁切或别的源片做的。请重新导出该帧，或恢复它原来的选择。"))
            aspect = rc.aspect_note((int(edited.shape[2]), int(edited.shape[1])), tuple(geometry["content_rect"][2:]))
            if aspect:
                notes.append(rc.line(f"{label}: {aspect['en']}", f"{zh_label}：{aspect['zh']}"))
            edited = edit_to_canvas(edited, geometry)
            if window_np is None:
                window_np = window.cpu().numpy()
            match = rc.match_edited_frame(window_np, edited[0].cpu().numpy(), frame)
            if match["unchanged"]:
                unchanged += 1
                notes.append(rc.line(
                    f"{label}: identical to the original frame, so that moment is kept as it is.",
                    f"{zh_label}：与原帧完全一样，所以该处保持原样。"))
            elif match["verdict"] == "mismatch":
                notes.append(rc.line(
                    f"{label}: the image looks like it was made from frame {match['best'] + 1}. "
                    "Re-export after moving the marker, or move it back.",
                    f"{zh_label}：这张图看起来是用第 {match['best'] + 1} 帧做的。"
                    "请在移动标记后重新导出，或把标记移回去。"))
            checks.append("✓" if match["verdict"] == "ok" else "?")
            keyframes_edit.append({"resolved_frame_index": frame, "latent": vae.encode(edited[..., :3])})
        if unchanged == len(markers):
            notes.append(rc.line(
                "No edited frame differs from the source: the result will look like the original shot.",
                "没有任何改帧与源片不同：结果会和原镜头一模一样。"))

        latent, frame_count = _empty_av_latent(width, height, length)
        if frame_count != length:
            raise ValueError(f"Window length {length} is not a valid H3 length")
        positive = encode_prompt(clip, prompt)
        keyframes = [{"resolved_frame_index": 0, "latent": encode_source(vae, ripple)}, *keyframes_edit]
        positive = node_helpers.conditioning_set_values(positive, {"minimax_keyframes": keyframes})
        where = ", ".join(f"{m['frame'] + 1} {c}" for m, c in zip(markers, checks))
        cw, ch = geometry["content_rect"][2:]
        count = len(markers)
        text = [rc.line(
            f"{count} edited frame{'s' if count > 1 else ''} of {length} ({cw}x{ch}): "
            f"frames {where} (✓ = image matches its source frame)",
            f"{length} 帧中已改 {count} 帧（{cw}x{ch}）："
            f"帧 {where}（✓ = 图像与源帧一致）"), *notes]
        return {"ui": {"text": text}, "result": (positive, latent)}


SAVE_CHOICES = ("shot + comparison", "shot", "comparison", "nothing")


def comparison_frames(images: torch.Tensor, ripple: dict, show_anchor_markers: bool = False) -> torch.Tensor:
    """Source | result side by side, optionally marking edited anchor frames."""
    count = min(len(images), ripple["length"])
    images = trim_content(images[:count], ripple["geometry"])
    source = trim_content(ripple["window"][:count], ripple["geometry"]).to(images.device, images.dtype)
    if source.shape[1:3] != images.shape[1:3]:
        import comfy.utils
        source = comfy.utils.common_upscale(source.movedim(-1, 1), int(images.shape[2]), int(images.shape[1]),
                                            "lanczos", "disabled").movedim(1, -1)
    comparison = torch.cat((source, images[..., :3]), dim=2).clone()
    if show_anchor_markers:
        for marker in ripple["markers"]:
            if marker["frame"] < count:
                comparison[marker["frame"], :6] = torch.tensor([1.0, 0.8, 0.0], dtype=comparison.dtype)
    return comparison


class WN_RippleOutput:
    CATEGORY = "XiaoHei/Video"
    FUNCTION = "output"
    OUTPUT_NODE = True
    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "IMAGE")
    RETURN_NAMES = ("images", "audio", "frame_rate", "comparison")
    OUTPUT_TOOLTIPS = (
        "The generated window.",
        "The source audio of the window.",
        "24.0",
        "Source | result side by side. Anchor markers are off by default.",
    )
    DESCRIPTION = (
        "Saves the generated shot as MP4 with the source audio, and a source | result comparison, using Save "
        "Video. Outputs the frames for anything further (another Save Video for other formats, an upscaler...)."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "要保存的图像批次"}),
                "ripple": (RIPPLE_TYPE, {"tooltip": "Ripple 编辑数据（一并保存）"}),
            },
            "optional": {
                "save": (list(SAVE_CHOICES), {"default": SAVE_CHOICES[0],
                         "tooltip": "保存为 MP4(H.264) 的内容选择"}),
                "filename_prefix": ("STRING", {"default": "ripple/edit",
                                    "tooltip": "文件名前缀（可含子文件夹）"}),
                "show_anchor_markers": ("BOOLEAN", {"default": False, "advanced": True,
                                        "tooltip": "在编辑/锚点帧上画黄色标记条"}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    def output(self, images, ripple, save=SAVE_CHOICES[0], filename_prefix="ripple/edit", prompt=None,
               extra_pnginfo=None, show_anchor_markers=False):
        count = min(len(images), ripple["length"])
        comparison = comparison_frames(images[:count], ripple, show_anchor_markers=show_anchor_markers)
        images = trim_content(images[:count], ripple["geometry"])
        fps, audio, previews = float(ripple["fps"]), ripple.get("audio"), []
        if save in ("shot + comparison", "shot", "comparison"):
            try:
                from . import save_video_node as sv
            except ImportError:  # loaded standalone by the tests
                import save_video_node as sv
            saver = sv.WN_SaveVideo()
            jobs = []
            if save != "comparison":
                jobs.append((images, filename_prefix, audio))
            if save != "shot":
                jobs.append((comparison, f"{filename_prefix}_compare", None))
            for frames, prefix, sound in jobs:
                saved = saver.save_video(frames, fps, prefix, audio=sound, prompt=prompt, extra_pnginfo=extra_pnginfo)
                previews += saved["ui"]["images"]
        result = (images, audio, fps, comparison)
        if not previews:
            return result
        return {"ui": {"images": previews, "animated": (True,)}, "result": result}


def query_geometry(query):
    return {"megapixels": float(query.get("megapixels", rc.DEFAULT_MEGAPIXELS)),
            "crop": query.get("crop", ""),
            "allow_upscale": str(query.get("allow_upscale", "false")).lower() in ("1", "true", "yes"),
            "resize_method": query.get("resize_method", "lanczos"),
            "output_width": int(query.get("output_width", 0)), "output_height": int(query.get("output_height", 0))}


def register_ripple_routes():
    """/xh/wn/ripple/info: source facts for the timeline, without running the graph."""
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return
    instance = PromptServer.instance
    if instance is None or getattr(instance, "_xh_wn_ripple_routes", False):
        return

    # 2026-11-08：原来 probe / frame_png 直接在 async handler 里同步跑，
    # 一次 4K 抽帧会把整个 aiohttp 事件循环卡住 ~1 s，连 info 请求一起饿死
    # ⇒ 前端一直显示「Reading video…」、时间轴拖不动。改走线程池并限 2 路并发。
    import asyncio as _asyncio
    decode_slots = _asyncio.Semaphore(2)

    @instance.routes.get("/xh/wn/ripple/info")
    async def ripple_info(request):
        video = request.query.get("video", "")
        geo = query_geometry(request.query)

        def job():
            info = probe(video_path(video))
            info["geometry"] = rc.geometry(info["width"], info["height"], **geo)
            return info

        try:
            async with decode_slots:
                info = await _asyncio.to_thread(job)
        except (OSError, ValueError, av.error.FFmpegError) as error:
            return web.json_response({"error": str(error)}, status=404)
        return web.json_response(info)

    @instance.routes.get("/xh/wn/ripple/frame")
    async def ripple_frame(request):
        query = request.query
        try:
            geo = query_geometry(query)
            frame = int(query.get("frame", "0"))
            async with decode_slots:
                data, name = await _asyncio.to_thread(
                    frame_png, query.get("video", ""), frame, **geo)
        except (OSError, ValueError, av.error.FFmpegError) as error:
            return web.json_response({"error": str(error)}, status=404)
        # Thumbnails carry the file's version token, so the browser may keep them; downloads never cache.
        cacheable = query.get("v") and not query.get("download")
        headers = {"Cache-Control": "private, max-age=86400" if cacheable else "no-store"}
        if query.get("download"):
            headers["Content-Disposition"] = f'attachment; filename="{name}"'
        return web.Response(body=data, content_type="image/png", headers=headers)

    instance._xh_wn_ripple_routes = True


NODE_CLASS_MAPPINGS = {
    "XH_WN_RippleClip": WN_RippleClip,
    "XH_WN_RippleFromFrames": WN_RippleFromFrames,
    "XH_WN_RippleApply": WN_RippleApply,
    "XH_WN_RippleOutput": WN_RippleOutput,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XH_WN_RippleClip": "H3 Ripple Clip",
    "XH_WN_RippleFromFrames": "H3 Ripple From Frames",
    "XH_WN_RippleApply": "H3 Ripple Apply",
    "XH_WN_RippleOutput": "H3 Ripple Output",
}
