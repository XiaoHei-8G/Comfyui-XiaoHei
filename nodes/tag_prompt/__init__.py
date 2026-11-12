# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-标签提示词 子模块
#   1:1 学 ComfyUI-Pixaroma 的 Prompt / Tag Library（MIT, Copyright (c) 2026 pixaroma）
#   后端 1 个节点只负责拼接；标签库、编辑器、补全、排队前展开全在
#   web/xh_tag_prompt/ 里，库存进 ComfyUI 设置，不进工作流、不进插件目录。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_tag_prompt import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
