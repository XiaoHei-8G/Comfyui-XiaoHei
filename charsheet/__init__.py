""" 小黑插件 · 角色设定表子模块（1 个节点）

复刻 + 优化 H3-Character-Sheet-Designer v1.3（MIT, Copyright (c) 2026 ukr8b3g-cmyk）。
原包 13 个视图写死、prompt 只服务 MiniMax H3；这里改成：
  · 视图注册表（可插拔，主节点不认具体 ID）
  · 模型后端能力表（ref_channel / ref_slots / tag_syntax / size_align …）
  · 通用输出口 prompt_generic / ref_roles_json / adapter_info

零新增第三方依赖：只用标准库 + numpy + torch（后两者 ComfyUI 官方自带）。
 按家族铁律，本子模块**不放任何工作流 JSON**；工作流是用户自己的项目资产。
"""
WEB_DIRECTORY = "web"   # 死变量（ComfyUI 只读顶层声明），与家族其它子模块保持一致

try:
    from .py.nodes import (
        NODE_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print("[XiaoHei/CharacterSheet]  子模块加载失败：%s" % _e)
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
