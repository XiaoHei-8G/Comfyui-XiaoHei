""" 小黑插件 · 角色设定表 —— 模型后端适配器注册表（能力表）

设计要点（2026-11-11 与用户敲定）：
  · 「万能」不是把 prompt 翻译成各方言，而是把「模型无关的内核」和「模型相关的适配层」拆开。
  · 每个后端只声明一张**能力表**，节点查表裁剪 prompt / 尺寸 / 参考图编号，逻辑只写一遍。
  ·  ref_channel 是关键字段：参考图到底从「文本侧编号」还是「latent 侧拼接」进模型。
    MOSS-Image Edit 的图根本不走文字 ⇒ 在它上面写 <Picture 3> 是无效噪音。
  · 只把 implemented=True 的后端暴露到下拉；未实现的留**空槽**，能力表先占位，
    以后填一个就改 implemented=True + 补 render 分支，主节点一行不动。

 不猜原则：Flux3 / Kling 的具体参考图口径本次未核源码，能力值一律填 None + 备注
   「待核源码」，绝不凭印象编一个数字出来误导以后接的人。
"""
from __future__ import annotations

import threading

CAPABILITY_KEYS = (
    "ref_channel",   # text_tag | latent_concat | node_managed | none | None(待核)
    "ref_slots",     # 最多几张参考图
    "tag_syntax",    # 文本侧编号模板，如 "<Picture {n}>"；None = 不能写编号
    "size_align",    # 宽高对齐粒度
    "has_negative",  # 要不要负向提示词
    "is_video",      # 是否视频模型（决定要不要写帧 / 镜头 / 音景）
)

_LOCK = threading.Lock()
_ADAPTERS = {}


def register_adapter(key, *, zh, en, capabilities, implemented=False, notes=""):
    if not isinstance(key, str) or not key:
        raise ValueError("adapter key must be a non-empty string")
    cap = dict(capabilities)
    unknown = set(cap) - set(CAPABILITY_KEYS)
    if unknown:
        raise ValueError("unknown capability keys: %s" % sorted(unknown))
    for k in CAPABILITY_KEYS:
        cap.setdefault(k, None)
    with _LOCK:
        if key in _ADAPTERS:
            raise ValueError("adapter already registered: %s" % key)
        _ADAPTERS[key] = {
            "key": key, "zh": str(zh), "en": str(en),
            "capabilities": cap, "implemented": bool(implemented),
            "notes": str(notes),
        }
    return _ADAPTERS[key]


def implemented():
    """下拉里能选的，只有真正实现了 render 分支的后端。"""
    with _LOCK:
        return {k: v for k, v in _ADAPTERS.items() if v["implemented"]}


def reserved():
    """已占位、未实现的空槽（面板状态条可显示，下拉不出现）。"""
    with _LOCK:
        return {k: v for k, v in _ADAPTERS.items() if not v["implemented"]}


def all_adapters():
    with _LOCK:
        return dict(_ADAPTERS)


def get(key):
    with _LOCK:
        return _ADAPTERS.get(key)


def get_capability(key, field, default=None):
    a = get(key)
    if not a:
        return default
    v = a["capabilities"].get(field, default)
    return default if v is None else v


def adapter_names():
    return tuple(implemented())


# ---------------------------------------------------------------------------
# 已实现：MiniMax H3 原生 Ref2VA（5 张参考图 + <Picture N> 文本侧编号）
#   取证：comfy/text_encoders/minimax.py 的 TE 模板 = "<Picture 1>: " + vision block
#        comfy_extras/nodes_minimax_h3.py 的 ref_images.ref_image_0..4
# ---------------------------------------------------------------------------
register_adapter(
    "h3", zh="MiniMax H3（已实现）", en="MiniMax H3 (ready)",
    capabilities={
        "ref_channel": "text_tag",
        "ref_slots": 5,
        "tag_syntax": "<Picture {n}>",
        "size_align": 32,
        "has_negative": False,
        "is_video": True,
    },
    implemented=True,
    notes="原生 MiniMaxH3ReferenceToVideo；一次执行一张表，采样取第 1 帧存静态图。",
)

# ---------------------------------------------------------------------------
# 空槽：能力已核过源码/文档的先填好；没核过的一律 None，不猜。
# ---------------------------------------------------------------------------
register_adapter(
    "qwen21", zh="Qwen-Image 2.1（待实现）", en="Qwen-Image 2.1 (reserved)",
    capabilities={
        "ref_channel": "text_tag",
        "ref_slots": 10,
        "tag_syntax": "<image{n}>",
        "size_align": 16,
        "has_negative": True,
        "is_video": False,
    },
    notes="本机 comfy/text_encoders/qwen_image21.py 动态生成 <imageN> + vision block；"
          "注意 comfy_extras/nodes_qwen.py 的 image1/2/3 是 Qwen-Image 1.0 老节点（3 张）。",
)
register_adapter(
    "moss", zh="MOSS-Image Edit（待实现）", en="MOSS-Image Edit (reserved)",
    capabilities={
        "ref_channel": "latent_concat",
        "ref_slots": 4,
        "tag_syntax": None,
        "size_align": 16,
        "has_negative": False,
        "is_video": False,
    },
    notes="参考图由 VAE 编码后在 timestep 0 拼到生成图前面，文本编码器看不到图 ⇒ "
          "prompt 里禁止写图片编号，角色分工交给 ref_roles_json 让下游摆图。",
)
register_adapter(
    "krea2", zh="Krea 2（待实现）", en="Krea 2 (reserved)",
    capabilities={
        "ref_channel": "node_managed",
        "ref_slots": 3,
        "tag_syntax": None,
        "size_align": 16,
        "has_negative": False,
        "is_video": False,
    },
    notes="本地 Raw/Turbo 是纯文生图；参考图靠 edit LoRA 的节点自己拼，2~3 张。",
)
for _key, _zh, _en in (
    ("flux3", "Flux3（待核实）", "Flux3 (to verify)"),
    ("kling", "Kling（待核实）", "Kling (to verify)"),
):
    register_adapter(
        _key, zh=_zh, en=_en,
        capabilities={k: None for k in CAPABILITY_KEYS},
        notes=" 具体参考图槽数 / 标签语法 / 对齐粒度本次未核源码，刻意留空，"
              "接的时候先去读它的 TE 模板再填，别照 H3 猜。",
    )
