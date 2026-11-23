"""小黑家族 · 视频分镜切分（1:1 复刻 ComfyUI-SceneCut，MIT 署名保留在 LICENSE）。

12 个节点全部保留：加载视频 / 检测 / 高级检测 / 精修 / 校验 / 校验高级 /
检测器加载 / 校验器加载 / 审阅器 / 精选播放 / 缩略图墙 / 导出保存 / 列表加载。
核心算法在 `scenecut/` 原样保留；接线标识、路由、显示名、分类已家族化。
`py/__init__.py` 在 import 时已注册模型目录与 HTTP 路由，这里不重复注册。
"""
from .py import NODES

# V3 节点：object_info 走 GET_NODE_INFO_V1()（读 Schema.display_name），
# 这里的映射与 Schema 保持一致，供家族聚合链与编辑器搜索使用。
_DISPLAY = {
    "XH_SceneCutLoadVideo": "加载视频·分镜 XiaoHei",
    "XH_SceneCutDetect": "分镜检测 XiaoHei",
    "XH_SceneCutViewer": "分镜审阅器 XiaoHei",
    "XH_SceneCutSelectedScenes": "分镜精选播放 XiaoHei",
    "XH_SceneCutContactSheet": "分镜缩略图墙 XiaoHei",
    "XH_SceneCutSaveScenes": "分镜导出保存 XiaoHei",
    "XH_SceneCutLoadScenes": "分镜列表加载 XiaoHei",
    "XH_SceneCutDetectorLoader": "分镜检测器加载 XiaoHei",
    "XH_SceneCutDetectAdvanced": "分镜检测高级 XiaoHei",
    "XH_SceneCutRefine": "分镜精修 XiaoHei",
    "XH_SceneCutValidatorLoader": "分镜校验器加载 XiaoHei",
    "XH_SceneCutValidate": "分镜校验高级 XiaoHei",
}

NODE_CLASS_MAPPINGS = {cls.__name__: cls for cls in NODES}
NODE_DISPLAY_NAME_MAPPINGS = {
    key: _DISPLAY[key] for key in NODE_CLASS_MAPPINGS if key in _DISPLAY
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
