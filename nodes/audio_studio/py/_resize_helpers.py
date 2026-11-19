# nodes/audio_studio/py/_resize_helpers.py
"""从 ComfyUI-Pixaroma/nodes/_resize_helpers.py 摘出的最小依赖（MIT）。

AudioReact 节点壳只需要 normalize_bit_depth 这一函数处理 16/32 位内联上传图，
不引入 Pixaroma 的整套 resize 默认值。逻辑与原文一字未改。
"""
from __future__ import annotations

# I;16B (mean 0.00) 等模式必须经 .convert("I") 才正确。
_I16_MODES = ("I;16", "I;16B", "I;16L", "I;16N")


def normalize_bit_depth(img):
    """Scale a 16- or 32-bit image into the 8-bit range BEFORE any .convert().

    8 位模式原样返回（no-op）。16/32 位原始上传图若不先缩放，.convert("RGB")
    会静默 CLAMP 成近白色。
    """
    if img.mode == "I":
        return img.point(lambda px: px * (1 / 255))
    if img.mode in _I16_MODES:
        return img.convert("I").point(lambda px: px * (1 / 257))
    return img
