# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-数字选择 子模块
#   1:1 深度复刻 ComfyUI-Pixaroma 的 Number Pick（MIT, Copyright (c) 2026 pixaroma）
#   后端 1 节点 + 纯逻辑 helper；前端 6 模块在 js/xh_numberpick/。
#   算法（parse_state / coerce / compute）一行未改；输出仍为 ANY，由前端按接线
#   收窄成 INT / FLOAT 并把决定塞进隐藏输入，因此改值会进缓存签名。
#   只改了节点类型名、显示名、分类、widget 标识与中文说明/帮助。
# ─────────────────────────────────────────────────────────────────────────────
from .py.node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
