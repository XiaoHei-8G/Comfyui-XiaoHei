# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-画板 子模块
#   1:1 复刻 ComfyUI-Pixaroma 的 Paint 节点（MIT, Copyright (c) 2026 pixaroma）
#   后端 1 个节点 + 4 个落盘路由；前端 78 个文件在 web/xh_paint/ · web/shared/ · web/framework/
# ─────────────────────────────────────────────────────────────────────────────
from .py.paint_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# ComfyUI 只读顶层声明；子模块里这句与家族其它模块一致，属死变量（保留格式统一）。
WEB_DIRECTORY = "js"

# 路由注册整段 try 包住 —— 后端路由挂不上不能让整个 XiaoHei 包阵亡。
try:
    from .py.paint_routes import register_routes
    register_routes()
except Exception as _e:
    print(f"[XiaoHei-画板] 后端路由注册失败（画板节点仍可加载）：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
