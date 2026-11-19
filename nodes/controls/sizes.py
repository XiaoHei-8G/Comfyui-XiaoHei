"""尺寸清单（XiaoHei）— 一个可编辑的精确分辨率列表，带竖屏 / 横屏翻转。
输出 JS UI 选中的宽度 + 高度整数。

1:1 复刻自 ComfyUI-Pixaroma 的 node_sizes.py（MIT，Copyright (c) 2026 pixaroma）：
算法、默认值、clamp 范围、fallback、RETURN 全部逐字照抄，只改接线标识：
  class_type:  PixaromaSizes → XH_Sizes
  隐藏输入:     SizesState    → XHSizesState
  显示名 / CATEGORY / 日志前缀家族规范化。

所有 UI 都在 JS 侧；Python 唯一的输入是隐藏的序列化状态字符串，运行时由
app.graphToPrompt 注入（与一键分辨率同款）。JS 已经算好最终朝向 + 对齐后的
宽高并存进 state.w / state.h，所以 Python 只需读回。
"""

import json

DEFAULT_STATE = {
    "version": 1,
    "sizes": [[1024, 1024]],
    "selected": 0,
    "orientation": "portrait",  # "portrait" | "landscape"
    "snap": 0,                  # 0 = off; else 8 / 16 / 32 / 64
    "accent": None,
    "collapsed": False,         # UI-only; Python ignores it
    "w": 1024,
    "h": 1024,
}


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def _orient(pair, orientation):
    a, b = int(pair[0]), int(pair[1])
    lo, hi = min(a, b), max(a, b)
    return (hi, lo) if orientation == "landscape" else (lo, hi)


def _snap(n: int, step: int) -> int:
    if not step:
        return n
    return round(n / step) * step


class XH_Sizes:
    DESCRIPTION = (
        "尺寸清单 - 属于你自己的精确分辨率列表。把你常用的宽 x 高尺寸加进去，"
        "从列表里挑一个，节点就输出宽度和高度两个 INT。\n\n"
        "竖屏 / 横屏按钮会把选中的尺寸翻转过来，所以你只要加一次像 1024 x 1536 "
        "这样的尺寸，两种朝向都能复用（正方形不受影响）。新节点默认只有一个 "
        "1024 x 1024；点开设置（齿轮）可以添加、删除、拖动排序尺寸，一键载入一批 "
        "常用尺寸，或者把宽高对齐到 8 / 16 / 32 / 64 的倍数，得到对 VAE 友好的尺寸。\n\n"
        "状态跟随工作流保存与恢复。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        # SizesState 是 hidden（无 widget、无输入圆点）。JS 前端把状态存在
        # node.properties.xhSizesState，运行时经 app.graphToPrompt 注入隐藏输入。
        return {
            "required": {},
            "hidden": {
                "XHSizesState": ("STRING", {"default": json.dumps(DEFAULT_STATE)}),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    OUTPUT_TOOLTIPS = ("选中的宽度（像素）。", "选中的高度（像素）。")
    FUNCTION = "get_size"
    CATEGORY = "XiaoHei/工具"

    def get_size(self, XHSizesState: str):
        try:
            state = json.loads(XHSizesState)
            # JS keeps state.w / state.h as the final oriented + snapped values;
            # trust them when present, otherwise recompute defensively (e.g. an
            # API prompt hand-built without the JS layer).
            if "w" in state and "h" in state:
                w = int(state.get("w", 1024))
                h = int(state.get("h", 1024))
            else:
                sizes = state.get("sizes") or [[1024, 1024]]
                idx = int(state.get("selected", 0))
                if idx < 0 or idx >= len(sizes):
                    idx = 0
                w, h = _orient(sizes[idx], state.get("orientation", "portrait"))
                step = int(state.get("snap", 0) or 0)
                w, h = _snap(w, step), _snap(h, step)
        except Exception:
            print("[XiaoHei] 尺寸清单：状态解析失败，回退到 1024x1024")
            w, h = 1024, 1024
        w = _clamp(int(w), 64, 16384)
        h = _clamp(int(h), 64, 16384)
        return (w, h)


NODE_CLASS_MAPPINGS = {"XH_Sizes": XH_Sizes}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_Sizes": "尺寸清单 小黑"}
