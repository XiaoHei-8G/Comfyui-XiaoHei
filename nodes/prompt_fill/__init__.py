# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-提示词填空（提示词填空 XiaoHei）子模块
#   模板 + 词库填空器。模板骨架/词库取自本机 MiniMax Design 官方提示词技能库
#   （H3 官方三段式 + §4.1/4.2/4.3 枚举词），由前端编辑器编辑、存进节点隐藏 widget，
#   随工作流走、上云可用。确定性随机填充在后端做（seed 可复现）。
#   零第三方依赖：只用标准库。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_prompt_fill import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
