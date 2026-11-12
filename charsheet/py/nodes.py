"""小黑插件 · 角色设定表 —— 后端节点

复刻 + 优化自 H3-Character-Sheet-Designer v1.3（MIT, Copyright (c) 2026 ukr8b3g-cmyk）：
  · 保留：13 视图、prompt 自动编译、宽高计算、布局 guide、4 张 IMAGE 原样透传、动态 <Picture N> 编号
  · 优化①：视图改成注册表（views.py），加第 14 个视图不用改本文件
  · 优化②：模型后端改成能力表（adapters.py），现在只实现 H3，空槽留给 Qwen / MOSS / Krea / Flux3 / Kling
  · 优化③：新增 3 个通用输出口（prompt_generic / ref_roles_json / adapter_info），老口一个不动

 输出契约：RETURN_TYPES 只许在**末尾追加**。ComfyUI 按位置取值，中间插口会让所有老工作流错位。
"""
from __future__ import annotations

import json

from . import adapters, compiler, views

_CATEGORY = "XiaoHei/Character"
_NODE_TITLE = "小黑·全能角色设定表"
_DEFAULT_STATE = json.dumps(
    {"views": list(views.DEFAULT_VIEW_IDS),
     "roles": {k: compiler.DEFAULT_ROLE for k in compiler.REF_INPUTS}},
    ensure_ascii=False,
)


class XiaoHeiCharacterSheet:
    """小黑·全能角色设定表：视图清单 + 布局图 + 可插拔模型适配。"""

    CATEGORY = _CATEGORY
    DESCRIPTION = (
        "【 干什么】点选视图生成一张角色设定表：自动写提示词、算画布、画布局图，参考图原样透传。"
        "视图与模型后端都是可插拔注册表，以后加视图 / 加模型不用改节点。"
        "【 怎么配】主图接 character_image（固定当人）；追加图接 reference_image_1~3 后，"
        "到面板里把每张图的角色下拉改对（默认『同一人物』会让衣服图被当人像）。"
        "【 输出】prompt 是 H3 原味；prompt_generic 是不绑模型的纯自然语言；"
        "ref_roles_json 把『哪张图干嘛』交给下游；adapter_info 是能力表快照。"
        " | English: A model-agnostic character sheet compiler. Views and model backends are "
        "pluggable registries; prompt_generic is model-neutral and ref_roles_json carries reference roles."
    )
    FUNCTION = "compile"
    RETURN_TYPES = (
        "STRING", "INT", "INT", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE",  # 与原包一致的 8 口
        "STRING", "STRING", "STRING",                                        # 新增 3 口（只追加末尾）
    )
    RETURN_NAMES = (
        "prompt", "width", "height", "layout_image", "character_image",
        "reference_image_1", "reference_image_2", "reference_image_3",
        "prompt_generic", "ref_roles_json", "adapter_info",
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "adapter": (adapters.adapter_names(), {
                    "default": "h3",
                    "tooltip": "【 后端适配器】只列已经实现的；空槽在 adapters.py 里占位。"
                               " | English: Only implemented backends appear here.",
                }),
                "size_mode": (["manual", "auto"], {
                    "default": "manual",
                    "tooltip": "【 画布】Manual 用下面填的宽高；Auto 按视图数自动排（可能撑得很宽、吃显存）。"
                               " | English: Manual uses the given size; Auto grows with the view count.",
                }),
                "manual_width": ("INT", {
                    "default": 2208, "min": 32, "max": 8192, "step": 32,
                    "tooltip": "【↔ 宽】按适配器的对齐粒度取整（H3 = 32）。 | English: Canvas width.",
                }),
                "manual_height": ("INT", {
                    "default": 1280, "min": 32, "max": 8192, "step": 32,
                    "tooltip": "【↕ 高】按适配器的对齐粒度取整（H3 = 32）。 | English: Canvas height.",
                }),
                "style": (list(compiler.STYLE_PROMPTS), {
                    "default": "none",
                    "tooltip": "【 风格】只改渲染手法，不改人物 / 服装 / 配色。 | English: Rendering style only.",
                }),
                "character_image": ("IMAGE", {
                    "tooltip": "【 主图】固定当人物基准，没有角色下拉。 | English: Primary character image.",
                }),
                "state_json": ("STRING", {
                    "default": _DEFAULT_STATE, "multiline": True, "dynamicPrompts": False,
                    "tooltip": "【 内部状态】面板点选的视图与参考图角色存在这里；前端视觉隐藏，不用手填。"
                               " | English: Internal state, edited by the panel.",
                }),
            },
            "optional": {
                "reference_image_1": ("IMAGE",),
                "reference_image_2": ("IMAGE",),
                "reference_image_3": ("IMAGE",),
                "use_layout_image": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "【 布局图】ON 才把格子 guide 当参考图交给模型；OFF 输出 None。"
                               " | English: Pass the layout guide downstream.",
                }),
            },
        }

    def compile(self, adapter, size_mode, manual_width, manual_height, style,
                character_image, state_json,
                reference_image_1=None, reference_image_2=None, reference_image_3=None,
                use_layout_image=False, **kwargs):
        refs = (character_image, reference_image_1, reference_image_2, reference_image_3)
        result = compiler.compile_sheet(
            state_json=state_json, adapter_key=adapter, size_mode=size_mode,
            manual_width=manual_width, manual_height=manual_height,
            style=style, refs=refs, use_layout_image=bool(use_layout_image),
        )
        return (
            result["prompt"], result["width"], result["height"],
            result["layout_image"],
            character_image, reference_image_1, reference_image_2, reference_image_3,
            result["prompt_generic"], result["ref_roles_json"], result["adapter_info"],
        )


NODE_CLASS_MAPPINGS = {
    "XiaoHeiCharacterSheet": XiaoHeiCharacterSheet,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XiaoHeiCharacterSheet": _NODE_TITLE,
}
