# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-图片蹦迪 子模块
#   1:1 复刻 ComfyUI-Pixaroma 的 AudioReact Pixaroma（MIT, Copyright (c) 2026 pixaroma）。
#   后端 1 节点 + 2 条路由（sysinfo / upload）+ 纯 torch FFT 引擎（15 motion / 8 overlay）；
#   前端 8 文件在 js/xh_audio_studio/（WebGL2 全屏编辑器）。
#   只改三类接线标识：class_type / 隐藏输入名(XHAudioStudioJson) / import 路径；
#   算法、shader、状态契约 1:1 照抄。
# ─────────────────────────────────────────────────────────────────────────────
from .py.audio_studio_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# ComfyUI 只读顶层声明；子模块里这句属死变量（保留格式统一）。
WEB_DIRECTORY = "js"

# 路由注册整段 try 包住 —— 后端路由挂不上不能让整个 XiaoHei 包阵亡。
try:
    from .py.audio_studio_routes import register_routes
    register_routes()
except Exception as _e:
    print(f"[XiaoHei-图片蹦迪] 后端路由注册失败（节点仍可加载）：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
