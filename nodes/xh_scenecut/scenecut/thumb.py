"""文件选择弹窗用的视频缩略图：只解一帧、缩成小图、按文件签名缓存。

不联网、不转码整片；任何 PyAV 能解的视频（包括浏览器播不了的 ffv1-mkv）都能出图。
"""
from __future__ import annotations

import hashlib
import os

# 缩略图尺寸与取帧位置（取半秒处，避开片头常见的黑帧）
THUMB_W = 192
THUMB_H = 108
SEEK_SECONDS = 0.5
MAX_SCAN = 90


def thumb_name(src: str) -> str:
    """缓存文件名：路径 + 文件大小 + 修改时间，文件一改就自动换一张。"""
    st = os.stat(src)
    raw = "|".join(str(x) for x in (
        os.path.realpath(src), st.st_size, int(st.st_mtime), "thumb-v1"))
    return "thumb_" + hashlib.sha1(raw.encode()).hexdigest()[:16] + ".jpg"


def make_thumb(src: str, dst: str, width: int = THUMB_W, height: int = THUMB_H) -> str:
    """从 src 取一帧写入 dst，返回 dst；已有缓存直接返回。"""
    if os.path.isfile(dst):
        return dst

    import av
    from PIL import Image

    with av.open(src) as container:
        streams = container.streams.video
        if not streams:
            raise RuntimeError("视频里没有画面流")
        stream = streams[0]
        try:
            fps = float(stream.average_rate) if stream.average_rate else 25.0
        except (TypeError, ValueError):
            fps = 25.0
        if not (1 <= fps <= 240):
            fps = 25.0
        target = max(1, min(int(fps * SEEK_SECONDS), MAX_SCAN))
        frame = None
        for i, decoded in enumerate(container.decode(stream)):
            frame = decoded
            if i >= target:
                break
        if frame is None:
            raise RuntimeError("视频里没有可读取的画面")
        img = frame.to_image()

    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    img.thumbnail((width, height), resample)
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    tmp = dst + ".part.jpg"
    img.convert("RGB").save(tmp, "JPEG", quality=82, optimize=True)
    os.replace(tmp, dst)
    return dst
