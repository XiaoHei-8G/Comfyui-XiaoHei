"""一键分辨率（XiaoHei）— 输出宽度 + 高度整数，值由 JS UI 点选。

1:1 复刻自 ComfyUI-Pixaroma 的 node_resolution.py（MIT，Copyright (c) 2026 pixaroma）：
算法、默认值、clamp 范围、RETURN 全部逐字照抄，只改接线标识：
  class_type:  PixaromaResolution  → XH_ResolutionQuick
  隐藏输入:     ResolutionState     → XHResolutionQuickState
  显示名 / CATEGORY 家族规范化。
"""

import json

DEFAULT_STATE = {
    "mode": "preset",
    "ratio": "1:1",
    "w": 1024,
    "h": 1024,
    "custom_w": 1024,
    "custom_h": 1024,
    # Custom Ratio mode — kept in sync with DEFAULT_STATE in
    # js/xh_resolution_quick/index.js.
    "custom_ratio_w": 4,
    "custom_ratio_h": 3,
    "snap": 16,
}


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


class XH_ResolutionQuick:
    DESCRIPTION = (
        "一键分辨率 - 点击式分辨率选择器。节点界面是一个 3x3 比例格子"
        "（1:1、16:9、9:16、2:1、3:2、2:3、4:3、3:4、4:5），每个比例带 8 个常用尺寸，"
        "覆盖 SDXL、AI 视频和社交媒体常用尺寸。点一下比例、再点一下尺寸就好了。\n\n"
        "自定义比例模式可以输入任意 W:H（21:9、16:10 都行），自动算出适合 AI 的尺寸；"
        "自定义分辨率模式可以直接输入精确宽高，W / H 框里支持 1024+128 或 512*2 这样的算式。"
        "对齐格子（8 / 16 / 32 / 64）把输出凑成 VAE 喜欢的倍数。\n\n"
        "输出宽高两个 INT，状态跟随工作流保存与恢复。\n\n"
        "所有界面都在 JS 侧；Python 唯一的输入是一个隐藏的序列化状态字符串，运行时注入。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        # 隐藏输入不产生 widget、不产生输入圆点。JS 前端把状态存在
        # node.properties.xhResolutionQuickState，运行时经 app.graphToPrompt 注入。
        return {
            "required": {},
            "hidden": {
                "XHResolutionQuickState": (
                    "STRING",
                    {"default": json.dumps(DEFAULT_STATE)},
                ),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    OUTPUT_TOOLTIPS = ("选中的宽度（像素）。", "选中的高度（像素）。")
    FUNCTION = "get_resolution"
    CATEGORY = "XiaoHei/工具"

    def get_resolution(self, XHResolutionQuickState: str):
        try:
            state = json.loads(XHResolutionQuickState)
            w = int(state.get("w", 1024))
            h = int(state.get("h", 1024))
        except Exception:
            print("[XiaoHei] 一键分辨率：状态解析失败，回退到 1024x1024")
            w, h = 1024, 1024
        w = _clamp(w, 64, 16384)
        h = _clamp(h, 64, 16384)
        return (w, h)


NODE_CLASS_MAPPINGS = {"XH_ResolutionQuick": XH_ResolutionQuick}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_ResolutionQuick": "一键分辨率 小黑"}
