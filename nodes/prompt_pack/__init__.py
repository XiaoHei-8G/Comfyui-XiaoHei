# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-提示词批量 子模块
#   1:1 复刻 ComfyUI-Pixaroma 的 Prompt Pack（MIT, Copyright (c) 2026 pixaroma）。
#   后端 1 个节点只负责把「当前这一轮要用的那条提示词」原样吐出；
#   一大块提示词的拆分方式、逐条排队、剩几条计数全在 js/xh_prompt_pack/ 里。
#   状态存 node.properties.xhPackState，随工作流一起保存。
#   只改三类接线标识：class_type / 隐藏输入名 / import 路径；逻辑与契约 1:1 照抄。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_prompt_pack import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
