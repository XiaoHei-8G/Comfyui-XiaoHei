""" 小黑插件 · 角色设定表（底层为 MIT 授权实现，署名见 NOTICE / LICENSE）

底层 100% 复用 py/h3lib/ 的编译逻辑，本文件只做小黑壳装配：
  · 节点注册名改为独创的 "XiaoHeiCharacterSheet"（避免与上游同名包冲突/互相覆盖；前端 JS 的 IMAGE_NODE_TYPE 已同步改为此名）
  · 显示名改为「小黑·全能角色设定表」，菜单分类归入「小黑家族」
  · 预览路由改为独立路径 /xiaohei/character_sheet/minimax_image/preview（上游包占用原路径，避免互相抢占）
美术素材（mannequin-atlas.png 等）已随包复制到 js/assets/ 与 py/web/assets/，
用户后续可直接替换为自有图。

2026-11-15 新增 · 下游模型格式切换
  · 节点上新增「下游模型格式」下拉：H3 Image / Qwen-Image 2.1。
  · 选 H3 Image 时提示词与升级前逐字相同（直接调用底层实现，底层一个字符未改）。
  · 选 Qwen-Image 2.1 时改用 py/qwen_image_compiler.py 重写措辞，并额外输出负向提示词。
  · 新增输出口一律追加在 RETURN_TYPES 末尾，新增输入追加在 optional 末尾，
    旧工作流的连线位置与端口顺序完全不受影响。
"""
from __future__ import annotations

import numpy as np
import torch

from .h3lib.guide_13 import render_reference13_guide
from .h3lib.minimax_image_node import DEFAULT_STATE_JSON
from .h3lib.minimax_image_node import MiniMaxH3ImageCharacterSheetDesigner as _H3Node
from .h3lib.multi_reference_node import validate_reference_image
from .h3lib.node import runtime_max_resolution
from .h3lib.reference_compiler import STYLE_PROMPTS
from .qwen_image_compiler import MODEL_ID as QWEN_MODEL
from .qwen_image_compiler import compile_qwen_image_state


MODEL_FORMATS = ('H3 Image', QWEN_MODEL)
DEFAULT_MODEL_FORMAT = MODEL_FORMATS[0]


class XiaoHeiCharacterSheet(_H3Node):
    CATEGORY = "小黑家族"
    DESCRIPTION = (
        'Character design sheet compiler. Pick the downstream model format and the '
        'prompt is written in that model\'s own dialect. '
        'H3 Image: feed prompt / width / height / layout_image / character_image / '
        'reference_image_1..3 to MiniMax H3 Image Conditioning images.image_0..image_4. '
        'Qwen-Image 2.1: feed prompt and the images to TextEncodeQwenImage21, and '
        'negative_prompt to its negative prompt field; attach the images in the same '
        'order the prompt lists them. '
        'Layout OFF returns None; the character image is optional, leaving it '
        'unconnected compiles a text-only sheet driven by the part prompts.')
    # 端口顺序 = 上游八项原样保留，negative_prompt 只追加在末尾。
    RETURN_TYPES = ('STRING', 'INT', 'INT', 'IMAGE', 'IMAGE', 'IMAGE', 'IMAGE', 'IMAGE', 'STRING')
    RETURN_NAMES = ('prompt', 'width', 'height', 'layout_image', 'character_image',
                    'reference_image_1', 'reference_image_2', 'reference_image_3',
                    'negative_prompt')

    @classmethod
    def INPUT_TYPES(cls):
        # character_image sits first inside optional so the on-canvas port order
        # stays exactly as before (state_json, character_image, reference_image_1..3).
        # model_format is appended last so no existing port moves.
        return {'required': {'state_json': ('STRING', {'default': DEFAULT_STATE_JSON,
                'multiline': True, 'dynamicPrompts': False})},
                'optional': {'character_image': ('IMAGE',),
                             'reference_image_1': ('IMAGE',), 'reference_image_2': ('IMAGE',),
                             'reference_image_3': ('IMAGE',),
                             'use_layout_image': ('BOOLEAN', {'default': False}),
                             'style': (list(STYLE_PROMPTS), {'default': 'none'}),
                             'model_format': (list(MODEL_FORMATS), {'default': DEFAULT_MODEL_FORMAT})}}

    @classmethod
    def VALIDATE_INPUTS(cls, state_json, use_layout_image=False, style='none',
                         model_format=DEFAULT_MODEL_FORMAT):
        if model_format not in MODEL_FORMATS:
            return f'Unknown downstream model format: {model_format}'
        return _H3Node.VALIDATE_INPUTS(state_json, use_layout_image=use_layout_image, style=style)

    def compile(self, state_json, character_image=None, reference_image_1=None,
                reference_image_2=None, use_layout_image=False, style='none',
                reference_image_3=None, model_format=DEFAULT_MODEL_FORMAT):
        if model_format != QWEN_MODEL:
            # H3 path: the untouched upstream implementation, byte for byte.
            return super().compile(state_json, character_image=character_image,
                                   reference_image_1=reference_image_1,
                                   reference_image_2=reference_image_2,
                                   use_layout_image=use_layout_image, style=style,
                                   reference_image_3=reference_image_3) + ('',)

        validate_reference_image(character_image, 'character_image')
        validate_reference_image(reference_image_1, 'reference_image_1')
        validate_reference_image(reference_image_2, 'reference_image_2')
        validate_reference_image(reference_image_3, 'reference_image_3')
        result = compile_qwen_image_state(state_json, use_layout_image=use_layout_image,
                                          style=style, max_resolution=runtime_max_resolution(),
                                          character_presence=character_image is not None,
                                          reference_presence={'reference_image_1': reference_image_1 is not None,
                                                              'reference_image_2': reference_image_2 is not None,
                                                              'reference_image_3': reference_image_3 is not None})
        image = None
        if use_layout_image:
            guide = render_reference13_guide(result['guide_geometry'], result['semantic_layout'])
            image = torch.from_numpy(np.asarray(guide, dtype=np.float32)/255.0).unsqueeze(0)
        return (result['prompt'], result['width'], result['height'], image,
                character_image, reference_image_1, reference_image_2, reference_image_3,
                result.get('negative_prompt', ''))


NODE_CLASS_MAPPINGS = {
    "XiaoHeiCharacterSheet": XiaoHeiCharacterSheet,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XiaoHeiCharacterSheet": "小黑·全能角色设定表",
}


def _register_routes():
    """注册只读预览路由；失败只打日志，绝不拖垮整包。"""
    try:
        from .h3lib.minimax_image_preview import register_routes
        register_routes()
    except Exception as _e:      # noqa: BLE001
        print("[XiaoHei/CharacterSheet]  预览路由注册失败：%s" % _e)


_register_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
