""" 小黑插件 · 角色设定表 —— 视图注册表（可插拔，零第三方依赖）

来源：13 个视图的定义与相机约定复刻自 H3-Character-Sheet-Designer v1.3
     （MIT, Copyright (c) 2026 ukr8b3g-cmyk），见包内 NOTICE/LICENSE 口径。
改造：原包把视图写死成元组，这里改成**注册表**，主节点永远只认 all_views()。

以后要加第 14、15 个视图，两条路，主节点 / 前端一行都不用改：
  ① 代码注册：register_view("face_smile", zh="微笑特写", en="Smiling close-up", ...)
  ② 丢文件：往 charsheet/views_ext/ 放一个 .json（单对象或数组），
     load_extensions() 启动时自动读。字段见 _from_dict()。
"""
from __future__ import annotations

import json
import os
import threading

GROUPS = ("portrait", "body", "clothing", "detail")
_LOCK = threading.Lock()
_VIEWS = {}
_SEQ = [0]

# 原包 PRESETS['five']：默认 5 视图，保持行为一致
DEFAULT_VIEW_IDS = ("face_front", "face_left", "body_front", "body_left", "body_back")


def register_view(vid, *, zh, en, description, group="detail", aspect=1.0,
                  order=None, source="builtin"):
    """注册一个视图。vid 是存档值，绝不许改；重复注册直接拒绝，防止静默覆盖。"""
    if not isinstance(vid, str) or not vid or not vid.replace("_", "").isalnum():
        raise ValueError("view id must be a non-empty alphanumeric/underscore string")
    if group not in GROUPS:
        raise ValueError("unknown view group: %s" % group)
    if not isinstance(description, str) or not description.strip():
        raise ValueError("view description must not be empty")
    with _LOCK:
        if vid in _VIEWS:
            raise ValueError("view already registered: %s" % vid)
        _SEQ[0] += 1
        _VIEWS[vid] = {
            "id": vid, "zh": str(zh), "en": str(en),
            "description": description.strip(), "group": group,
            "aspect": float(aspect), "source": source,
            "order": int(order) if order is not None else _SEQ[0],
        }
    return _VIEWS[vid]


def _from_dict(d, source):
    if not isinstance(d, dict):
        raise ValueError("view extension entry must be an object")
    return register_view(
        d.get("id") or d.get("vid"),
        zh=d.get("zh") or d.get("id"),
        en=d.get("en") or d.get("id"),
        description=d.get("description") or d.get("en") or d.get("id"),
        group=d.get("group", "detail"),
        aspect=d.get("aspect", 1.0),
        order=d.get("order"),
        source=source,
    )


def load_extensions(dirpath):
    """扫描 views_ext/*.json。坏文件只警告、跳过，绝不让整个子模块挂掉。"""
    loaded = []
    if not dirpath or not os.path.isdir(dirpath):
        return loaded
    for name in sorted(os.listdir(dirpath)):
        if not name.lower().endswith(".json"):
            continue
        path = os.path.join(dirpath, name)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            entries = data if isinstance(data, list) else [data]
            for d in entries:
                loaded.append(_from_dict(d, "ext:" + name)["id"])
        except Exception as exc:      # noqa: BLE001
            print("[XiaoHei/CharacterSheet]  视图扩展读取失败 %s: %s" % (name, exc))
    return loaded


def all_views():
    """按 order 返回全部已注册视图（内置 + 扩展）。"""
    with _LOCK:
        return tuple(sorted(_VIEWS.values(), key=lambda v: (v["order"], v["id"])))


def view_ids():
    return tuple(v["id"] for v in all_views())


def get_view(vid):
    with _LOCK:
        return _VIEWS.get(vid)


def builtin_count():
    return sum(1 for v in all_views() if v["source"] == "builtin")


def _builtin():
    P, B, C, D = GROUPS
    items = [
        ("face_front", "正面头像", "Front portrait", P, 0.84,
         "One front-facing bust, complete head and hair through the upper chest. Both eyes visible; no waist, legs or feet."),
        ("face_left", "左侧头像", "Left profile portrait", P, 0.68,
         "One strict anatomical left-profile bust. The nose points to the RIGHT edge of the sheet. One visible eye."),
        ("face_right", "右侧头像", "Right profile portrait", P, 0.68,
         "One strict anatomical right-profile bust. The nose points to the LEFT edge. Preserve asymmetric features; do not mirror."),
        ("face_3q_left", "左侧 3/4 头像", "Left three-quarter portrait", P, 0.80,
         "One anatomical left three-quarter bust at 45 degrees, nose toward the RIGHT edge, both eyes visible with the farther eye foreshortened."),
        ("face_3q_right", "右侧 3/4 头像", "Right three-quarter portrait", P, 0.80,
         "One anatomical right three-quarter bust at 45 degrees, nose toward the LEFT edge, both eyes visible with the farther eye foreshortened."),
        ("face_back", "后脑头像", "Rear portrait", P, 0.84,
         "One direct rear bust, complete back of head and hair through the upper chest. No face or eyes visible; do not turn the head."),
        ("body_front", "全身正面", "Full-body front", B, 0.53,
         "One full-body front view in a neutral standing pose, complete head through both feet or footwear, with clear space above and below."),
        ("body_left", "全身左侧", "Full-body left profile", B, 0.19,
         "One strict anatomical left-profile full-body standing view. Nose, chest and toes point to the RIGHT edge. Preserve asymmetric clothing."),
        ("body_back", "全身背面", "Full-body back", B, 0.55,
         "One direct rear full-body standing view, complete head through feet. No face visible; do not turn the head."),
        ("clothing_front", "服装正面", "Clothing front", C, 0.64,
         "One front-facing clothing detail, cropped from the base of the neck to the lowest garment edge. Keep the head outside the frame."),
        ("clothing_back", "服装背面", "Clothing back", C, 0.64,
         "One direct rear clothing detail, cropped from the base of the neck to the lowest garment edge. Keep the head outside the frame."),
        ("hands", "双手", "Hands detail", D, 1.0,
         "One isolated close-up of exactly two complete hands, one left and one right, cropped at the wrists. No head, torso or whole figure."),
        ("feet", "足部 / 鞋", "Feet and footwear", D, 1.0,
         "One isolated close-up of exactly one left and one right complete foot or footwear, including visible boot shafts. No head or torso."),
    ]
    for vid, zh, en, group, aspect, desc in items:
        register_view(vid, zh=zh, en=en, description=desc, group=group, aspect=aspect)


_builtin()

EXT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "views_ext")
load_extensions(EXT_DIR)
