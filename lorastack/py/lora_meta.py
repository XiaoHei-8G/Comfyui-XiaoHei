"""LoRA 触发词 / 元数据读取 —— 纯标准库实现，离线优先。

照抄 ComfyUI-Pixaroma 的 nodes/_lora_helpers.py 的「读文件头」逻辑：
  - 只读取 safetensors 的小 JSON 头（8 字节长度 + 那段 JSON），**绝不读张量**，
    秒读、不占显存、不联网。
  - 触发词来源：① 文件头 metadata 里的 `modelspec.trigger_phrase` / `ss_trigger_words`
    （作者声明的触发词），② 训练标签 `ss_tag_frequency`（按词频取前若干），
    ③ 文件同目录的 .civitai.info / .json 副车文件（trainedWords / activation text）。
  - Civitai 联网查找是可选开关（Pixaroma 也只在用户手动点时才联网），本模块
    **不打开任何 socket**，默认就是纯离线读文件元数据 —— 跟 XiaoHei 的本地优先风格一致。

本文件不 import comfy / folder_paths / torch，因此可在 ComfyUI 运行时之外直接单测。
路径解析交给调用方（core.py 用 folder_paths 把相对名解成绝对路径）。
"""
import json
import os
import re
import struct

# 真实 LoRA 头也就几十 KB；上限设得很高，防止坏掉的长度字段让我们分配几个 G。
_MAX_HEADER_BYTES = 200 * 1024 * 1024
# 频率派生出的候选触发词最多展示多少条。
_MAX_TRIGGERS = 20

_PREVIEW_EXTS = (
    ".preview.png", ".preview.jpeg", ".preview.jpg", ".preview.webp",
    ".png", ".jpg", ".jpeg", ".webp",
)


def read_safetensors_metadata(path):
    """返回文件 __metadata__ 字典（str->str），任何异常都返回 {}。

    只读头部（8 字节小端长度 + 那么多字节的 JSON），绝不读张量块。绝不抛异常：
    文件坏、缺失、超大 -> {}。
    """
    try:
        with open(path, "rb") as f:
            raw = f.read(8)
            if len(raw) != 8:
                return {}
            n = struct.unpack("<Q", raw)[0]
            if n <= 0 or n > _MAX_HEADER_BYTES:
                return {}
            head = f.read(n)
            if len(head) != n:
                return {}
        obj = json.loads(head)
    except Exception:
        return {}
    if not isinstance(obj, dict):
        return {}
    meta = obj.get("__metadata__")
    return meta if isinstance(meta, dict) else {}


def _as_json(val):
    """safetensors 的 metadata 值永远是字符串；结构化的那些是 JSON 字符串要二次解析。
    返回解析后的对象，否则 None。"""
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return None
    return None


def derive_trigger_words(meta, limit=_MAX_TRIGGERS):
    """从训练元数据尽力抽触发词。

    顺序：先放显式触发短语（modelspec.trigger_phrase / ss_trigger_words），
    再放 ss_tag_frequency 里词频最高的训练标签（跨所有数据集目录求和），
    大小写不敏感去重，最多 limit 条。啥都没有返回 []。绝不抛异常。
    """
    if not isinstance(meta, dict):
        return []
    out = []
    seen = set()

    def add(word):
        w = (word or "").strip()
        if not w:
            return
        key = w.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(w)

    phrase = meta.get("modelspec.trigger_phrase") or meta.get("ss_trigger_words") or ""
    if isinstance(phrase, str):
        for part in phrase.split(","):
            add(part)

    freq = _as_json(meta.get("ss_tag_frequency"))
    counts = {}
    if isinstance(freq, dict):
        for dataset in freq.values():
            if not isinstance(dataset, dict):
                continue
            for tag, c in dataset.items():
                try:
                    counts[tag] = counts.get(tag, 0) + int(c)
                except (TypeError, ValueError):
                    continue
    # sorted() 稳定，词频相同保留首次出现（插入）顺序。
    for tag, _c in sorted(counts.items(), key=lambda kv: -kv[1]):
        add(tag)
        if len(out) >= limit:
            break
    return out[:limit]


def explicit_trigger_words(meta, limit=_MAX_TRIGGERS):
    """只取作者声明的触发短语（modelspec.trigger_phrase / ss_trigger_words），
    绝不取训练标签。auto-tick 时只勾这些，避免把二十个 booru 标签塞进提示词。绝不抛异常。"""
    if not isinstance(meta, dict):
        return []
    phrase = meta.get("modelspec.trigger_phrase") or meta.get("ss_trigger_words") or ""
    if not isinstance(phrase, str):
        return []
    out = []
    seen = set()
    for part in phrase.split(","):
        w = part.strip()
        if not w:
            continue
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(w)
        if len(out) >= limit:
            break
    return out


def base_model_family(meta):
    """粗略的基底模型家族：'SDXL' / 'SD1.5' / 'SD2' / 'SD3' / 'Flux' / ''（未知）。绝不抛异常。"""
    if not isinstance(meta, dict):
        return ""
    hay = " ".join(
        str(meta.get(k, "")) for k in (
            "ss_base_model_version", "ss_sd_model_name", "modelspec.architecture",
            "modelspec.implementation", "ss_network_module",
        )
    ).lower()
    if not hay.strip():
        return ""
    if "flux" in hay:
        return "Flux"
    if "sd3" in hay or "sd_3" in hay or "stable-diffusion-3" in hay:
        return "SD3"
    if "sdxl" in hay or "xl_base" in hay or "xl-base" in hay or "illustrious" in hay or "pony" in hay:
        return "SDXL"
    if "sd_v2" in hay or "sd2" in hay or "v2-1" in hay or "768-v" in hay:
        return "SD2"
    if ("sd_v1" in hay or "sd1" in hay or "v1-5" in hay or "v1.5" in hay
            or "sd-v1" in hay or "1-5-pruned" in hay):
        return "SD1.5"
    return ""


def read_sidecar_info(lora_path):
    """读 LoRA 旁的副车文件（<base>.civitai.info，其次 <base>.json）。
    返回 {name?, base_model?, triggers?} 或 {}。不联网。绝不抛异常。"""
    base = os.path.splitext(lora_path)[0]
    for ext in (".civitai.info", ".json"):
        sp = base + ext
        if not os.path.isfile(sp):
            continue
        try:
            with open(sp, "r", encoding="utf-8") as f:
                obj = json.load(f)
        except Exception:
            continue
        if not isinstance(obj, dict):
            continue
        info = {}
        tw = obj.get("trainedWords")
        if isinstance(tw, list):
            info["triggers"] = [str(w).strip() for w in tw if str(w).strip()]
        elif isinstance(obj.get("activation text"), str):
            info["triggers"] = [w.strip() for w in obj["activation text"].split(",") if w.strip()]
        model = obj.get("model")
        if isinstance(model, dict) and model.get("name"):
            info["name"] = str(model["name"])
        if obj.get("baseModel"):
            info["base_model"] = str(obj["baseModel"])
        mid = _clean_id(obj.get("modelId"))
        if mid is not None:
            info["model_id"] = mid
        vid = _clean_id(obj.get("id"))
        if vid is not None:
            info["version_id"] = vid
        if info:
            return info
    return {}


def find_preview_path(lora_path):
    """返回 LoRA 旁预览图的路径（.preview.png 等），没有则 None。"""
    base = os.path.splitext(lora_path)[0]
    for ext in _PREVIEW_EXTS:
        p = base + ext
        if os.path.isfile(p):
            return p
    return None


def _clean_id(v):
    """Civitai model/version id -> 干净 int，否则 None。拒绝 dict/list/垃圾，避免拼出坏 URL。"""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.isdigit():
        return int(v)
    return None


def _title_from_meta(meta, lora_path):
    for k in ("modelspec.title", "ss_output_name"):
        v = meta.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return os.path.splitext(os.path.basename(lora_path))[0]


def build_lora_info(lora_path):
    """统一、离线的 LoRA 信息：title / base_model / rank / alpha / num_images /
    date / triggers / source('file'|'sidecar') / has_preview。
    副车数据（来自某次 Civitai 拉取）存在时，覆盖文件派生数据。绝不抛异常。"""
    meta = read_safetensors_metadata(lora_path)
    file_triggers = derive_trigger_words(meta)
    info = {
        "title": _title_from_meta(meta, lora_path),
        "base_model": base_model_family(meta),
        "rank": meta.get("ss_network_dim", "") or "",
        "alpha": meta.get("ss_network_alpha", "") or "",
        "num_images": meta.get("ss_num_train_images", "") or "",
        "date": meta.get("modelspec.date", "") or "",
        "triggers": file_triggers,
        # 两套分别返回，信息面板好做 File / Sidecar 切换：
        # `triggers` 默认取合并结果（sidecar 胜出）以兼容老行为；
        # `file_triggers` 永远是文件自己的词；`explicit_triggers` 是作者声明短语。
        "file_triggers": file_triggers,
        "sidecar_triggers": [],
        "explicit_triggers": explicit_trigger_words(meta),
        "source": "file",
        "has_preview": find_preview_path(lora_path) is not None,
    }
    side = read_sidecar_info(lora_path)
    if side.get("triggers"):
        info["sidecar_triggers"] = side["triggers"]
        info["triggers"] = side["triggers"]
        info["source"] = "sidecar"
    if side.get("name"):
        info["title"] = side["name"]
    if side.get("base_model") and not info["base_model"]:
        info["base_model"] = side["base_model"]
    if side.get("model_id") is not None:
        info["model_id"] = side["model_id"]
    if side.get("version_id") is not None:
        info["version_id"] = side["version_id"]
    return info


def collect_triggers(state):
    """从 state（已解析的 loras 列表）里，收集**启用** LoRA 的选中触发词，
    用 state 里的 sep 连接。顺序按首次出现。绝不抛异常。"""
    out, seen = [], set()
    sep = ", "
    loras = state.get("loras") if isinstance(state, dict) else None
    if not loras:
        return ""
    for e in loras:
        if not isinstance(e, dict) or not e.get("on"):
            continue
        trg = e.get("triggers")
        if isinstance(trg, list):
            for w in trg:
                w = str(w).strip()
                if not w:
                    continue
                k = w.lower()
                if k not in seen:
                    seen.add(k)
                    out.append(w)
    if isinstance(state.get("sep"), str):
        sep = state["sep"]
    return sep.join(out)
