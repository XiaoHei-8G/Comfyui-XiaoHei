""" 小黑插件 · 角色设定表子模块（1 个节点）

底层逻辑见 py/h3lib/。本层只做小黑壳装配与导出。
"""
WEB_DIRECTORY = "js"   # 死变量（ComfyUI 只读顶层声明），与家族其它子模块保持一致

try:
    from .py import (
        NODE_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print("[XiaoHei/CharacterSheet]  子模块加载失败：%s" % _e)
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
