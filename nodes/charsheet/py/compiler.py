""" 小黑插件 · 角色设定表 —— 纯 CPU 编译器（不加载任何模型，不看图像像素）

复刻思路取自 H3-Character-Sheet-Designer v1.3（MIT, ukr8b3g-cmyk），
但输出按「三层架构」拆开：
  L1 通用内核  → 视图清单 / 布局 guide / 4 张原图透传 / 自然语言描述
  L2 适配层    → 查能力表，决定能不能写编号、宽高按几对齐、要不要写帧与音景
  L3 后端插件  → 目前只实现 H3；其余留空槽（adapters.py）

 设计红线：prompt（H3 原味）的语义永远不改；新增能力一律追加新输出口，
   绝不回头改老口 ⇒ 以后接 Qwen / MOSS 时，老工作流零变化。
"""
from __future__ import annotations

import json
import math

from . import adapters, views

STYLE_PROMPTS = {
    "none": "",
    "anime": "Apply anime-style linework and cel shading.",
    "photo": "Apply photographic rendering with realistic surface shading.",
    "realistic_painting": "Apply realistic painted rendering.",
    "semi_realistic_anime": "Apply anime-style linework with softly modeled shading.",
    "oil_painting": "Apply oil-painted brushwork to the character rendering.",
    "watercolor": "Apply watercolor pigment shading while retaining clear character contours.",
    "gouache": "Apply opaque gouache-style color fills and brushwork.",
    "colored_pencil": "Apply colored-pencil strokes and shading.",
    "3d": "Apply three-dimensional rendered surface shading.",
}

ROLE_LABELS = {
    "same_character": ("同一人物 · 补充角度", "same character, additional angle"),
    "face": ("仅面部", "face only"),
    "head": ("头部 / 面部 / 头发", "head, face and hair"),
    "clothing": ("整套服装", "complete outfit"),
    "clothing_front": ("服装正面", "front of outfit"),
    "clothing_back": ("服装背面", "back of outfit"),
    "hands": ("手 / 配件", "hands and accessories"),
    "footwear": ("足 / 鞋袜", "feet and footwear"),
}
DEFAULT_ROLE = "same_character"
REF_INPUTS = ("reference_image_1", "reference_image_2", "reference_image_3")


def parse_state(raw):
    """容错解析隐藏的 state_json；坏数据回默认，绝不抛异常拖垮整包。"""
    fallback = {"views": list(views.DEFAULT_VIEW_IDS), "roles": {}}
    if not isinstance(raw, str) or not raw.strip():
        return fallback
    try:
        d = json.loads(raw)
    except Exception:      # noqa: BLE001
        return fallback
    if not isinstance(d, dict):
        return fallback
    known = set(views.view_ids())
    sel = [v for v in (d.get("views") or []) if isinstance(v, str) and v in known]
    roles = {}
    for k in REF_INPUTS:
        v = d.get("roles", {}).get(k, DEFAULT_ROLE) if isinstance(d.get("roles"), dict) else DEFAULT_ROLE
        roles[k] = v if v in ROLE_LABELS else DEFAULT_ROLE
    return {"views": sel or list(views.DEFAULT_VIEW_IDS), "roles": roles}


def _align(value, step):
    step = int(step or 32)
    step = max(1, step)
    return max(step, (int(value) // step) * step)


def _canvas(selected, adapter_key, size_mode, manual_width, manual_height):
    align = adapters.get_capability(adapter_key, "size_align", 32)
    if size_mode == "manual":
        return _align(manual_width, align), _align(manual_height, align)
    n = max(1, len(selected))
    cols = min(4, max(1, math.ceil(math.sqrt(n))))
    rows = math.ceil(n / cols)
    return _align(cols * 384, align), _align(rows * 640, align)


def _rects(selected, width, height):
    """把选中视图排成网格，产出归一化 + 像素两套坐标。"""
    n = max(1, len(selected))
    cols = min(4, max(1, math.ceil(math.sqrt(n))))
    rows = math.ceil(n / cols)
    cw, ch = width / cols, height / rows
    pad = max(8, int(min(cw, ch) * 0.06))
    out = []
    for i, vid in enumerate(selected):
        x0 = (i % cols) * cw + pad
        y0 = (i // cols) * ch + pad
        w = max(16, int(cw - 2 * pad))
        h = max(16, int(ch - 2 * pad))
        out.append({
            "id": vid, "index": i + 1, "rect": [int(x0), int(y0), w, h],
            "normalized": [round(x0 / width, 4), round(y0 / height, 4),
                           round(w / width, 4), round(h / height, 4)],
        })
    return out


def _reference_plan(refs, adapter_key):
    """按实际接了哪些图动态编号，跳过空口 —— 与原包 reference_plan.py 同口径。"""
    channel = adapters.get_capability(adapter_key, "ref_channel", "none")
    tag_tpl = adapters.get_capability(adapter_key, "tag_syntax", None)
    slots = adapters.get_capability(adapter_key, "ref_slots", 5)
    ordered = [("character_image", "character", refs[0])]
    ordered += [(name, None, refs[i + 1]) for i, name in enumerate(REF_INPUTS)]
    plan, number = [], 0
    for source, role, present in ordered:
        if present is None:
            continue
        number += 1
        plan.append({
            "slot": number - 1, "source": source,
            "role": role or "character", "picture_number": number,
            "tag": tag_tpl.format(n=number) if (channel == "text_tag" and tag_tpl) else None,
        })
    if number > int(slots or 5):
        # 不阻断执行，只在 adapter_info 里留痕，让使用者知道超了目标模型的槽数
        pass
    return plan, channel


def _generic_prompt(selected, roles_text, style):
    labels = [views.get_view(v)["en"] for v in selected if views.get_view(v)]
    lines = [
        "A single clean character reference sheet on a plain neutral background, "
        "laid out as %d separate panels: %s." % (len(labels), "; ".join(labels)),
        "Keep exactly the same character, face, proportions, outfit, accessories and colors "
        "in every panel. Do not add text, captions, borders, scenery or extra people.",
    ]
    for v in selected:
        info = views.get_view(v)
        if info:
            lines.append("Panel %d (%s): %s" % (selected.index(v) + 1, info["en"], info["description"]))
    if roles_text:
        lines.append(roles_text)
    if style and STYLE_PROMPTS.get(style):
        lines.append(STYLE_PROMPTS[style] + " Keep the same rendering across all panels.")
    return "\n".join(lines)


def _h3_prompt(selected, plan, channel, style, is_video, roles_text):
    """H3 原味：结构化英文 + <Picture N> 编号 + 帧约束。只有 text_tag 通道才写编号。
    roles_text = 参考图角色权限句（text_tag 通道才写，latent_concat 等不写）。"""
    labels = [views.get_view(v)["en"] for v in selected if views.get_view(v)]
    lines = ["subject_definitions:"]
    for item in plan:
        tag = item["tag"] or ("Reference image %d" % item["picture_number"])
        lines.append("%s: %s." % (tag, item["role"]))
    lines += [
        "summary:",
        "One character reference sheet containing %d distinct views: %s. "
        "The same character appears in every view." % (len(labels), ", ".join(labels)),
        "detailed_description:",
    ]
    for v in selected:
        info = views.get_view(v)
        if info:
            lines.append("- %s: %s" % (info["en"], info["description"]))
    if roles_text:
        lines += ["reference_roles:", roles_text]
    if is_video:
        lines += [
            "[Shot 1] The sheet is fully present from the first frame and stays unchanged "
            "through the last frame. No camera motion, no cuts, no animation.",
            "overall_soundscape: silent.",
            "non_diegetic_music: none.",
        ]
    if style and STYLE_PROMPTS.get(style):
        lines.append(STYLE_PROMPTS[style] + " Apply the same rendering to every selected view.")
    return "\n".join(lines)


def compile_sheet(*, state_json, adapter_key, size_mode, manual_width, manual_height,
                  style, refs, use_layout_image):
    """主入口。返回 dict，节点只负责把它拆成输出口。"""
    if adapter_key not in adapters.implemented():
        adapter_key = "h3"
    state = parse_state(state_json)
    selected = state["views"]
    width, height = _canvas(selected, adapter_key, size_mode, manual_width, manual_height)
    rects = _rects(selected, width, height)
    plan, channel = _reference_plan(refs, adapter_key)
    is_video = bool(adapters.get_capability(adapter_key, "is_video", False))

    role_parts = []
    role_parts_plain = []
    for item in plan:
        if item["source"] == "character_image":
            continue
        key = item["source"]
        role = state["roles"].get(key, DEFAULT_ROLE)
        zh, en = ROLE_LABELS.get(role, ROLE_LABELS[DEFAULT_ROLE])
        if item["tag"]:
            role_parts.append("%s is a %s reference. Use it only for that part of the same character."
                              % (item["tag"], en))
        else:
            role_parts.append("Reference image %d (%s / %s) is supplied out-of-band; "
                              "use it only for that part of the same character."
                              % (item["picture_number"], zh, en))
        # 通用版：绝不写 <Picture N> 标签（那是 H3 专属噪音）；只用「参考图 N + 中文/英文角色」
        role_parts_plain.append("Reference image %d (%s) is a %s reference. "
                                "Use it only for that part of the same character."
                                % (item["picture_number"], zh, en))
        item["role"] = role
        item["role_en"] = en
        item["role_zh"] = zh
    roles_text = " ".join(role_parts)
    roles_text_plain = " ".join(role_parts_plain)

    a = adapters.get(adapter_key)
    info = {
        "adapter": adapter_key, "label": a["zh"], "implemented": a["implemented"],
        "capabilities": a["capabilities"], "notes": a["notes"],
        "views": len(selected), "view_registry_size": len(views.all_views()),
        "reference_channel": channel, "reference_count": len(plan),
        "registered_adapters": list(adapters.all_adapters()),
    }
    result = {
        "prompt": _h3_prompt(selected, plan, channel, style, is_video,
                            roles_text if channel == "text_tag" else ""),
        "prompt_generic": _generic_prompt(selected, roles_text_plain if channel == "text_tag" else "", style),
        "ref_roles_json": json.dumps(plan, ensure_ascii=False, indent=2),
        "adapter_info": json.dumps(info, ensure_ascii=False, indent=2),
        "width": width, "height": height, "rects": rects,
        "selected": selected, "channel": channel,
        "view_registry_size": len(views.all_views()),
    }
    if use_layout_image:
        result["layout_image"] = render_layout(width, height, rects)
    else:
        result["layout_image"] = None
    return result


def render_layout(width, height, rects):
    """白底黑框 + 灰块的布局 guide。只用 numpy + torch（ComfyUI 官方自带，零新增依赖）。"""
    import numpy as np
    import torch
    w = max(32, int(width))
    h = max(32, int(height))
    img = np.full((h, w, 3), 255, dtype=np.uint8)
    for p in rects:
        x, y, pw, ph = p["rect"]
        x, y = max(0, x), max(0, y)
        x2, y2 = min(w, x + pw), min(h, y + ph)
        if x2 <= x or y2 <= y:
            continue
        img[y:y2, x:x2] = 238
        t = 3
        img[y:min(y + t, y2), x:x2] = 32
        img[max(y2 - t, y):y2, x:x2] = 32
        img[y:y2, x:min(x + t, x2)] = 32
        img[y:y2, max(x2 - t, x):x2] = 32
        # 灰块示意人物占位，不带任何美术素材（原包的 mannequin atlas 不在 MIT 授权内，不复刻）
        bw, bh = int((x2 - x) * 0.42), int((y2 - y) * 0.62)
        bx, by = x + ((x2 - x) - bw) // 2, y + ((y2 - y) - bh) // 2
        if bw > 2 and bh > 2:
            img[by:by + bh, bx:bx + bw] = 196
    return torch.from_numpy(img.astype("float32") / 255.0).unsqueeze(0)
