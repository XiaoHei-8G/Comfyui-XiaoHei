"""Qwen-Image-2.1 prose for the XiaoHei character sheet.

Lives outside h3lib/ on purpose: the vendored upstream modules stay
byte-identical. This module reuses the H3 compiler for everything that must
not diverge (state parsing, validation, sizing, guide rendering, per-view
descriptions) and only rewrites the prose into the shape Qwen-Image expects.

Qwen-Image has no "<Picture N>" role syntax and no guide-image channel. It
reads plain sentences plus the order in which the reference images are
attached, so the rewrite does two things:

  * rewrites every "<Picture N>" token into "reference image N";
  * adds an explicit, ordered list of the attached references so the model
    knows what each image is for.

The negative prompt is a Qwen-only extra: H3 Image has no such field.
"""
from __future__ import annotations

import re

from .h3lib.minimax_image_compiler import compile_minimax_image_state


MODEL_ID = 'Qwen-Image 2.1'

# What each image slot *is*, addressed by the node input it comes from.
SOURCE_LABELS = {
    'character_image': (
        "the character's main appearance",
        'Match the face, hairstyle, body shape, skin tone and proportions exactly. '
        'This is the identity baseline for every view.'),
    'layout_image': (
        'the layout sheet',
        'Follow its panel arrangement, viewing directions and relative sizes, '
        'but do not copy its guide outlines or placeholder figures.'),
}

# What each reference is *for*, addressed by the role the user picked.
ROLE_LABELS = {
    'same_character': (
        'a supplementary reference of the same character',
        'Use it only for compatible details; the main appearance stays the baseline.'),
    'face': ('a facial appearance reference', 'Use it for the face only.'),
    'head': ('a head and hairstyle reference', 'Use it for the head and hair only.'),
    'clothing': ('an outfit reference',
                 'Use it for the outfit: construction, materials, colors and patterns.'),
    'clothing_front': ('the front of the outfit', 'Use it for the front view of the garment.'),
    'clothing_back': ('the back of the outfit', 'Use it for the back view of the garment.'),
    'hands': ('a hand and glove reference', 'Use it for the hands only.'),
    'footwear': ('a footwear reference', 'Use it for the shoes only.'),
}

QWEN_NEGATIVE = (
    'blurry, low resolution, deformed anatomy, extra limbs, extra fingers, mutated hands, '
    'inconsistent character between views, different outfit between views, '
    'different proportions between views, cluttered background, scenery, props, '
    'text, caption, watermark, signature, logo, jpeg artifacts, harsh shadow, cropped, '
    'guide outlines, placeholder silhouettes, duplicated views'
)

CLOSING_RULES = (
    'Draw the identical character in every panel, on a plain white background '
    'with soft even studio lighting and no shadow cast on the backdrop.'
)


def _to_reference_wording(text):
    """Turn the H3 "<Picture N>" vocabulary into Qwen's "reference image N"."""
    text = re.sub(r'from <Picture (\d+)>', r'based on reference image \1', text)
    text = re.sub(r'<Picture (\d+)>', r'reference image \1', text)
    text = re.sub(r'\bPicture (\d+)\b', r'reference image \1', text)
    # The upstream prose starts a sentence with the tag, so the replacement
    # would open the line in lower case.
    text = re.sub(r'(^|(?<=\n))reference image', 'Reference image', text)
    return text


def _reference_line(ref):
    """One bullet describing a single attached reference image."""
    label, usage = SOURCE_LABELS.get(ref['source']) or ROLE_LABELS.get(ref['role']) or (
        'an additional reference', 'Use it only where it matches the requested view.')
    return f"- Reference image {ref['picture_number']} is {label}. {usage}"


def compile_qwen_image_state(state_json, **kwargs):
    """Same inputs as the H3 compiler; returns the same result plus a
    Qwen-shaped prompt and a negative prompt."""
    result = compile_minimax_image_state(state_json, **kwargs)

    refs = result.get('reference_plan') or []
    lines = []
    if refs:
        lines.append('Attached reference images, in the order they are attached:')
        lines.extend(_reference_line(ref) for ref in refs)
        lines.append('')

    body = _to_reference_wording(result['prompt']).strip()
    if body:
        lines.append(body)
        lines.append('')

    lines.append(CLOSING_RULES)

    style = kwargs.get('style', 'none')
    style_prompt = ''
    try:
        from .h3lib.reference_compiler import STYLE_PROMPTS
        style_prompt = STYLE_PROMPTS.get(style, '') if isinstance(style, str) else ''
    except Exception:      # noqa: BLE001
        style_prompt = ''
    if style_prompt:
        lines.append(style_prompt)

    result['prompt'] = '\n'.join(lines).strip()
    result['negative_prompt'] = QWEN_NEGATIVE
    return result
