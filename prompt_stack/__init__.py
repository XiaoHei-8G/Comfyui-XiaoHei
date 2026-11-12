# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-提示词堆叠 子模块
#   1:1 学 ComfyUI-Pixaroma 的 Prompt Stack（MIT, Copyright (c) 2026 pixaroma）
#   后端 1 个节点只负责按顺序拼接；行的开关、拖拽排序、行名、分隔符与齿轮设置
#   窗全在 web/xh_prompt_stack/ 里，状态存 node.properties，随工作流一起保存。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_prompt_stack import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
