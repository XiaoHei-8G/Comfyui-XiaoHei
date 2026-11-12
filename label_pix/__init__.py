# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-浮字标签 子模块
#   1:1 复刻 ComfyUI-Pixaroma 的 Label 节点（MIT, Copyright (c) 2026 pixaroma）
#   后端 1 个空壳节点；编辑器 / 渲染 / 存档全在 web/xh_label_pix/ 三件套里。
#   逻辑、参数、CSS 数值一字未改，只换了接线标识 + 界面文案翻成中文。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_label_pix import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# ComfyUI 只读顶层声明；子模块里这句与家族其它模块一致，属死变量（保留格式统一）。
WEB_DIRECTORY = "web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
