# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-释放显存 子模块
#   1:1 复刻 ComfyUI-Pixaroma 的 Free VRAM Pixaroma（MIT, Copyright (c) 2026 pixaroma）。
#   后端只负责读数/清显存的纯决策（_free_vram_helpers.py 无 torch、可离线测）；
#   三档模式/开关/阈值存 node.properties，前端在排队前注入隐藏输入 XHFreeVramState。
#   界面全中文、接家族语言中枢、配色走官方 CSS 变量 + 主题预设、图案走家族图标库；
#   class_type = XH_FreeVram，显示名「释放显存 XiaoHei」（顶层统一规范化）。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_free_vram import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
