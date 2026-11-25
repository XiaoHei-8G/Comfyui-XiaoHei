# XiaoHei-提示词填空（提示词填空 XiaoHei）
# 定位：模板 + 词库填空器节点化。节点脸上就一个「打开编辑器」按钮 + seed + 输出口；
#   真正的模板骨架 / 词库 / 锁定 / 选中预设存在节点的一个隐藏 STRING widget（fill_config）里，
#   随工作流走 ⇒ 分享给粉丝、跑到 RunningHub 云端都带得过去。
# 分工：确定性随机填充在【后端】做（云端不经过本地前端，故不能靠前端注入）：
#   后端读 fill_config + seed，对每个未锁定空位用 seed 决定性地从词库抽一个词，替换 {{空位}}。
#   同一个 seed + 同一份配置 ⇒ 永远同一条词；锁定空位用固定值，不参与随机。
# 零第三方依赖：只用标准库 json / re / hashlib。
import json
import re
import hashlib

_SLOT_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")

# 内置官方预设（H3 视频 · 官方三段式）。前端口径与此保持一致；
# 这里也放一份，保证粉丝用纯 API / 云端拿到旧版工作流（fill_config 为空）时仍有可用默认。
_DEFAULT_CONFIG = {
    "preset": "h3_video_official",
    "prefix": "",
    "template": (
        "integrated_multimodal_description: [Shot 1] {{style}}, {{shot_size}} frames {{subject}}. "
        "The camera {{motion}} {{amplitude}} {{speed}} toward {{focus}}. {{dialogue}}\n\n"
        "overall_soundscape: {{ambient}}\n\n"
        "non_diegetic_music: {{music}}"
    ),
    "slots": {
        "style": {"options": ["Cinematic", "live-action", "2D-animated", "3D CG", "claymation", "watercolor", "vintage film"], "locked": False, "fixed": "Cinematic"},
        "motion": {"options": ["Zoom In", "Zoom Out", "Push In", "Pull Out", "Pan Left", "Pan Right", "Truck Left", "Truck Right", "Tilt Up", "Tilt Down", "Pedestal Up", "Pedestal Down", "Arc Shot", "Tracking Shot", "Static Shot", "Shake Slightly", "Shake Strongly", "POV", "Roll Clockwise", "Roll Counterclockwise"], "locked": False, "fixed": "Push In"},
        "amplitude": {"options": ["with small amplitude", "with large amplitude"], "locked": False, "fixed": "with small amplitude"},
        "speed": {"options": ["at slow speed", "at fast speed"], "locked": False, "fixed": "at slow speed"},
        "music": {"options": ["N/A"], "locked": False, "fixed": "N/A"},
        "subject": {"options": [], "locked": True, "fixed": "a young woman standing by a rain-covered window"},
        "shot_size": {"options": [], "locked": True, "fixed": "a medium shot"},
        "focus": {"options": [], "locked": True, "fixed": "her face"},
        "dialogue": {"options": [], "locked": True, "fixed": ""},
        "ambient": {"options": [], "locked": True, "fixed": "Steady rain taps against the window with low room ambience."},
    },
}


def _normalize_config(raw):
    """把前端传来的配置洗成可信结构：只认 dict 的 slots，每个 slot 只认 list 的 options。"""
    cfg = raw if isinstance(raw, dict) else {}
    template = cfg.get("template")
    if not isinstance(template, str) or not template.strip():
        template = _DEFAULT_CONFIG["template"]
    prefix = cfg.get("prefix")
    if not isinstance(prefix, str):
        prefix = ""
    raw_slots = cfg.get("slots")
    slots = {}
    if isinstance(raw_slots, dict):
        for key, val in raw_slots.items():
            key = str(key)
            if not isinstance(val, dict):
                continue
            opts = val.get("options")
            opts = [str(x) for x in opts if isinstance(x, str) and x != ""] if isinstance(opts, list) else []
            fixed = val.get("fixed")
            fixed = str(fixed) if isinstance(fixed, (str, int, float)) else ""
            slots[key] = {"options": opts, "locked": bool(val.get("locked")), "fixed": fixed}
    if not slots:
        slots = {k: dict(v) for k, v in _DEFAULT_CONFIG["slots"].items()}
    preset = cfg.get("preset")
    preset = str(preset) if isinstance(preset, str) else "custom"
    return {"preset": preset, "prefix": prefix, "template": template, "slots": slots}


def _pick(seed, key, options):
    """确定性抽词：seed + 空位名参与哈希，同一 seed 同一空位永远同一结果。"""
    if not options:
        return None
    digest = hashlib.sha256(("{}|{}".format(int(seed), key)).encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(options)
    return options[idx]


def fill(config, seed):
    """返回 (填好的提示词, 每个空位的取值字典)。"""
    cfg = _normalize_config(config)
    try:
        # 统一到无符号 32 位，与前端 pickAsync 的 (seed >>> 0) 完全同口径；
        # widget 上限 0xFFFFFFFF，若不归一化，seed>2^31 时前后端哈希输入会不同。
        s = int(seed) & 0xFFFFFFFF
    except (TypeError, ValueError):
        s = 0
    picks = {}

    def repl(m):
        key = m.group(1).strip()
        slot = cfg["slots"].get(key)
        if slot is None:
            return m.group(0)  # 没定义这个词库就原样留着 {{key}}，方便用户发现漏配
        if slot["locked"]:
            val = slot["fixed"]  # 锁定的空位完全听用户的：填固定值，哪怕用户故意留空串
        else:
            val = _pick(s, key, slot["options"])
            if val is None:
                # 未锁定、词库为空：有固定值就用它，否则保留 {{key}} 让用户发现漏配
                val = slot["fixed"] if slot["fixed"].strip() else m.group(0)
        picks[key] = val
        return val

    body = _SLOT_RE.sub(repl, cfg["template"])
    prefix = cfg["prefix"].strip()
    text = (prefix + "\n\n" + body) if prefix else body
    return text, picks


class XH_PromptFill:
    DESCRIPTION = (
        "【干什么】提示词填空器：一段带 {{空位}} 的模板，加每个空位的候选词库，"
        "按 seed 一次随机填满，输出一条完整提示词。空位可以上锁固定（比如角色外貌），只随机其余的。\n"
        "【怎么配】点节点上的「打开编辑器」→ 左边改模板、中间管词库分组（每一项都能加词/删词/上锁/填固定值）、"
        "右边看填好的预览；选一套预设就切到那套模型的骨架和词库。\n"
        "【可复现】同一个 seed + 同一份配置永远出同一条词，调工作流不会跑一次变一次；想换一批词就改 seed。\n"
        "【存在哪】模板/词库/锁定/当前预设全存在节点里，随工作流分享、随工作流上云，粉丝拿到就是配好的。\n"
        "【输出】STRING：填好的提示词，直接接提示词编码 / H3 提示词节点。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0xFFFFFFFF,
                        "step": 1,
                        "control_after_generate": True,
                        "tooltip": "【种子】同一个 seed 永远填出同一条词；换一批词就改它。 | English: Seed for reproducible fills.",
                    },
                ),
            },
            "optional": {
                "text_in": (
                    "STRING",
                    {
                        "forceInput": True,
                        "tooltip": "可选：接上游文字，拼在填好的提示词后面。不接就只输出填空结果。 | English: Optional upstream text, appended after the filled prompt.",
                    },
                ),
            },
            # 前端编辑器写回的整份配置（模板/词库/锁定/预设），随工作流走；用户不手打。
            "hidden": {"fill_config": ("STRING", {"default": ""})},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("按 seed 填好的完整提示词（有上游时拼接在后面）。",)
    FUNCTION = "run"
    CATEGORY = "XiaoHei/提示词"

    @staticmethod
    def is_changed(seed, fill_config="", **kwargs):
        return (str(seed), str(fill_config))

    def run(self, seed, fill_config="", text_in=None):
        try:
            cfg = json.loads(fill_config) if isinstance(fill_config, str) and fill_config.strip() else {}
        except (ValueError, TypeError, RecursionError):
            cfg = {}
        text, _picks = fill(cfg, seed)
        if isinstance(text_in, (list, tuple)):
            text_in = text_in[0] if text_in else ""
        if isinstance(text_in, str) and text_in.strip():
            text = text + "\n\n" + text_in
        return (text,)


NODE_CLASS_MAPPINGS = {"XH_PromptFill": XH_PromptFill}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_PromptFill": "提示词填空 XiaoHei"}
