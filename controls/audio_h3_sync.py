# XiaoHei-H3 音频同步（XiaoHei 家族 · 2026-10-30）
#
# 治什么：MiniMax H3 画面和声音是**一起生成**的（同一个 joined latent），
#   所以放着不管它会自己编一段声音，嘴型动的是一首根本不存在的歌。
#   本节点把你的真录音塞进 latent 的「声音那一半」并**冻住**，
#   这样模型只剩下一件事可做：画出配得上这段固定声音的画面 ⇒ 嘴型自然对上。
#
# 怎么冻住的：`noise_mask` 是 NestedTensor（画面=1、声音=0）—— 这是 ComfyUI 官方
#   机制（comfy/samplers.py 会拆开 nested denoise_mask 逐步混合），
#   不是 hack：被 0 遮住的那一流全程原样带着走。
#
# 为什么在**波形**上对齐、不在 latent 上补零：给音频 latent 补 0 不是静音 ——
#   0 只是 latent 空间里的另一个点，解出来是一段嗡嗡声；而且那一流随后被冻住，
#   模型会整段照着这个噪声去画。真实采样点补真实 0 才是真静音。
#
#  已知限制（原作者写在源码注释里，照实保留）：`model` 全程原样透传。
#   DiT 是从画面的 sigma 推音频 timestep 的（comfy/ldm/minimax/model.py 里
#   t_a = 1.0 - time_shift_sigma(...)），所以虽然我们把声音按住是干净的，
#   模型仍被告知「它是 noisy 的」。要纠正它需要 ComfyUI 目前不存在的 core hook，
#   不做假补丁去蒙（猜错的代价是隐性的画质损失，看不出来）。
#
#  出处与授权：算法照搬 ComfyUI-Pixaroma 的 `nodes/node_h3_audio_sync.py`
#   + `_h3_sync_helpers.py` + `_audio_window_helpers.py`（MIT License,
#   Copyright (c) 2026 pixaroma）。本文件为 XiaoHei 家族改写：三个偏好从「全局设置面板」
#   改成**节点上的下拉**（看得见、能存档、能跟着工作流走），读数与提示改中文，
#   节点界面加家族状态条与中/EN 切换。数字口径一字未改（帧格 17n+5、
#   音频 latent 40fps、24fps 视频），见文件末尾注释里的官方出处。
#
#  数字全部读自 ComfyUI 官方 comfy_extras/nodes_minimax_h3.py，不靠记忆：
#     FPS 24 / 音频 latent 40fps / 帧格 17n+5 /
#     video latent T = 2 if frames<=5 else ((frames-5)//17)*5+2
#     audio latent T = round(frames / 24 * 40)
#     训练区间 124~362 帧（约 5.2s~15.1s），超出就烂 ⇒ 这就是 15 秒上限的由来。
#
# 零第三方依赖（只用 torch / 官方 API）；torchaudio 仅在采样率不一致时才用。

from __future__ import annotations

import math

import torch

FPS = 24                      # 视频帧率（H3 固定）
AUDIO_LATENT_FPS = 40         # 音频 latent 的帧率
FRAME_STEP = 17               # 帧格：frames = 17n + 5
FRAME_PLUS = 5
TRAINED_MAX_FRAMES = 362

LIMIT_CHOICES = ["5s", "10s", "15s", "20s", "custom", "off"]
CUSTOM_CHOICE = "custom"      # 选它 ⇒ 上限取「自定义秒数」那个框
SHORT_CHOICES = ["silence", "loop"]
OVER_CHOICES = ["warn", "stop"]

#  2026-10-30 新增：**帧数档位**（用户要「帧数摆在台面上、能选」）
#   「最长片段」原来只有整秒档（5/10/15/20s），可 H3 的合法片段长度只有
#   网格上的值（17n+5）⇒ 秒↔帧永远差 83~167ms。现在把**帧档直接列进下拉**，
#   用户想按帧挑就按帧挑，一一对应 H3 的合法长度，不用自己换算。
#   值写成 "124f" 这种带单位的形式 ⇒ 既能当 COMBO 值存，又一眼看得出是帧。
#    老档的 "5s"/"10s"/... 仍然保留在选项里（不删）⇒ 老存档零影响。
FRAME_LIMIT_CHOICES = [
    "124f", "141f", "158f", "175f", "192f", "209f", "226f", "243f",
    "260f", "277f", "294f", "311f", "328f", "345f", "362f",
]
# 帧档 → 帧数
_FRAME_LIMIT_MAP = {c: int(c[:-1]) for c in FRAME_LIMIT_CHOICES}

_MAX_SECONDS = 86400.0        # 一天：超过这个数的秒数是脏数据，不是有人真要的片段


# ── 纯数学（无 torch / 无 ComfyUI，可单独跑数验证）──────────────────────────
def frames_from_latent_t(latent_t) -> int:
    """把 video latent 的时间维反推回帧数。

    正向是 ((frames-5)//17)*5+2，所以 k=(t-2)//5、frames=k*17+5。
    对正向能吐出来的每个值都精确成立 —— 而我们只会收到这种值。
    """
    try:
        t = int(latent_t)
    except (TypeError, ValueError):
        return FRAME_PLUS
    if t <= 2:
        return FRAME_PLUS
    k = (t - 2) // 5
    return k * FRAME_STEP + FRAME_PLUS


def clip_info(video_latent_t, audio_latent_t) -> dict:
    """手上这个 latent 到底代表多长的片子。"""
    frames = frames_from_latent_t(video_latent_t)
    try:
        audio_t = max(0, int(audio_latent_t or 0))
    except (TypeError, ValueError):
        audio_t = 0
    return {
        "frames": frames,
        "seconds": frames / FPS,
        "audio_t": audio_t,
        # 声音那一半自己跨多久。它和 seconds 最多差半个音频 latent 帧（1/80 秒），
        # 因为正向是 round；而音频这边才是要逐采样对齐的那一侧。
        "audio_seconds": (audio_t / AUDIO_LATENT_FPS) if audio_t else 0.0,
    }


def target_samples(audio_latent_t, vae_sample_rate) -> int:
    """audio latent 帧数 → 需要多少个真实采样点。"""
    try:
        t = max(0, int(audio_latent_t or 0))
        sr = max(0, int(vae_sample_rate or 0))
    except (TypeError, ValueError):
        return 0
    return int(round(t / AUDIO_LATENT_FPS * sr))


def over_limit(clip_seconds, limit_seconds) -> bool:
    """超过用户设的上限了吗？limit<=0 = 关掉这个守卫。

     2026-10-30：秒口径的守卫被 0.25s 容差掩盖着真实错位（见 limit_frames 注释），
       新的守卫走**帧口径**（over_limit_frames），这个保留给兼容旧调用。
    """
    try:
        limit = float(limit_seconds)
        clip = float(clip_seconds)
    except (TypeError, ValueError):
        return False
    if limit <= 0:
        return False
    # 留一点容差，否则 15.08s（最长的合法长度）每次都会顶到 15s 上限，
    # 警告就变成没人看的噪音了。
    return clip > limit + 0.25


def limit_frames(choice, custom=None) -> int:
    """上限档位 → H3 合法帧格上「这一档实际允许的最大片段帧数」。0 = 关守卫。

     两种档位（2026-10-30）：
       ① **帧档**（"124f" / "362f" …）= 直接就是帧数，**一字不改**用 ——
          用户按帧挑，这是主路径。
       ② **秒档**（"5s" / "15s" …）= 向上吸附到网格上最小的 ≥ 该秒数的合法帧。
          为什么吸附：H3 的合法片段长度只有网格上的值（17n+5：124/141/…/362），
          而秒档给的是整秒，两套口径对不上：
              5s =120帧 → 124（5.1667s）  差 +166.7ms
              10s=240帧 → 243（10.1250s） 差 +125.0ms
              15s=360帧 → 362（15.0833s） 差  +83.3ms
          原来靠 0.25s 容差盖住 ⇒ 那是**掩盖**，不是修好。现在两边都是整数帧、精确相等。
    """
    c = str(choice).strip()
    # ① 帧档
    if c in _FRAME_LIMIT_MAP:
        return _FRAME_LIMIT_MAP[c]
    # ② 秒档（自定义秒数走这里）
    sec = limit_seconds(choice, custom)
    if sec <= 0:
        return 0
    raw = sec * FPS
    n = max(0, int(math.ceil((raw - FRAME_PLUS) / float(FRAME_STEP))))
    return n * FRAME_STEP + FRAME_PLUS


def over_limit_frames(frames, limit_frames_value) -> bool:
    """帧口径的长度守卫：片段帧数 > 这一档允许的最大合法帧数 ⇒ 超了。

    limit<=0 = 关掉这个守卫（与秒口径一致）。
    """
    try:
        lim = int(limit_frames_value or 0)
        fr = int(frames or 0)
    except (TypeError, ValueError):
        return False
    if lim <= 0:
        return False
    return fr > lim


def limit_seconds(choice, custom=None) -> float:
    """"15s" → 15.0；"off" → 0.0（关守卫）；"custom" → 用「自定义秒数」里那个数。

     2026-10-30：新增**帧档**（"124f" / "362f" …）⇒ 这里换算成秒返回，
       这样任何拿秒的地方（提示文案、状态条）都还能用；**帧口径的精确值走 limit_frames**。
    自定义填 0 / 负数 / 空 ⇒ 视同关掉守卫（0.0），绝不拿脏数去卡死整条链。
    """
    c = str(choice).strip().lower()
    if c in _FRAME_LIMIT_MAP:
        return _FRAME_LIMIT_MAP[c] / float(FPS)
    if c == CUSTOM_CHOICE or c == "自定义":
        v = _as_float(custom, 0.0)
        return v if v > 0 else 0.0
    try:
        v = float(c.rstrip("s"))
    except (TypeError, ValueError):
        return 0.0
    return v if v > 0 else 0.0


def _as_float(v, default=0.0) -> float:
    """来自控件/上游 FLOAT 的值永远别抛异常。"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f or f in (float("inf"), float("-inf")):     # NaN / inf
        return default
    if f > _MAX_SECONDS or f < -_MAX_SECONDS:
        return default
    return f


def plan_window(total_samples, sample_rate, start_s, duration_s) -> dict:
    """算该切波形的哪一段。want=结果必须有几个采样点，take=真实有几个，fill=要补几个。

    "需要多少个" 和 "实际有多少个" 是两个数，这一块的所有 bug 都来自把它们混为一谈，
    所以这里两个都报，调用方不可能「以为对齐了其实短一截」。
    """
    total = max(0, int(total_samples or 0))
    try:
        sr = int(sample_rate or 0)
    except (TypeError, ValueError):
        sr = 0
    if sr <= 0:
        # 没有可用采样率 ⇒ 秒数没意义 ⇒ 整段还回去，别静默返回空音频
        return {"start": 0, "want": total, "take": total, "fill": 0}

    start = int(round(max(0.0, _as_float(start_s)) * sr))
    if start > total:
        start = total

    avail = total - start
    dur = _as_float(duration_s)
    want = avail if dur <= 0 else int(round(dur * sr))
    if want < 0:
        want = 0
    take = min(want, avail)
    return {"start": start, "want": want, "take": take, "fill": want - take}


def apply_window(waveform, plan: dict, when_short: str = "silence"):
    """把 waveform [..., samples] 裁/补到正好 plan["want"] 个采样点。

    when_short: "silence" 补真 0；"loop" 用索引张量循环（要一小时的一段一秒素材
    也只分配一次，不是几千次 concat）。
    """
    want = int(plan.get("want", 0))
    if want <= 0:
        return waveform[..., :0]
    start = int(plan.get("start", 0))
    take = int(plan.get("take", 0))
    piece = waveform[..., start:start + take]
    fill = want - take
    if fill <= 0:
        return piece
    if when_short == "loop" and take > 0:
        idx = torch.arange(fill, device=piece.device) % take
        return torch.cat([piece, piece.index_select(-1, idx)], dim=-1)
    pad = torch.zeros(tuple(waveform.shape[:-1]) + (fill,),
                      dtype=waveform.dtype, device=waveform.device)
    return torch.cat([piece, pad], dim=-1) if take > 0 else pad


class XHH3AudioSync:
    DESCRIPTION = (
        "让 MiniMax H3 唱你给的那条音轨，而不是模型自己编的、毫无意义的声音。接在 "
        "潜变量和采样器之间。H3 特殊在画面和声音是一起生成的，所以事后把歌盖上去没用 "
        "—— 嘴型从头到尾就不是照你的歌动的。本节点把录音塞进声音那一半并冻住，模型 "
        "只剩下「画出配得上的画面」这一件事可做。片段多长它自己从潜变量里算，不用你填秒数；"
        "音轨比片段短就按你选的补静音或循环，并在节点上说明；超过 15 秒会在开跑之前就警告"
        "（H3 只训到约 15 秒）。只适用于 MiniMax H3。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {
                    "tooltip": "【 模型】你的 MiniMax H3 模型，本节点原样透传不改它。 | "
                               "English: your MiniMax H3 model, passed through untouched.",
                }),
                "latent": ("LATENT", {
                    "tooltip": "【 潜变量】H3 那种「画面+声音合在一起」的 latent，"
                               "来自 空 H3 影音潜变量 / H3 图生视频 / H3 参考生视频。 | "
                               "English: the joined picture-and-sound H3 latent.",
                }),
                "audio_vae": ("VAE", {
                    "tooltip": "【 音频 VAE】H3 的音频 VAE，和 H3 条件节点用的是同一个。 | "
                               "English: H3's audio VAE, the same one the H3 conditioning uses.",
                }),
                "track": ("AUDIO", {
                    "tooltip": "【 音轨】你想让画面去演的那条真录音：一首歌、一句台词都行；"
                               "只要其中一段就先用官方「Trim Audio Duration」裁好（本节点总是从"
                               "音轨的第 0 秒开始取）。 | "
                               "English: the real recording the video should perform.",
                }),
                "clip_limit": (LIMIT_CHOICES + FRAME_LIMIT_CHOICES, {
                    "default": "15s",
                    "tooltip": "【⏱ 最长片段】超过这个长度就先提醒（选「不限」就关掉这个守卫）。\n"
                               " **帧数档（124f / 141f / … / 362f）= 直接按帧挑**，一一对应 H3 的"
                               "合法片段长度（17n+5 帧格），不用自己换算秒 —— 画面那边本来就是帧。\n"
                               "· 帧档：124f=5.17s · 158f=6.58s · 209f=8.71s · 243f=10.13s · "
                               "311f=12.96s · 362f=15.08s（H3 训练上限）\n"
                               "· 秒档（5s/10s/15s/20s）：保留兼容老存档，会**向上吸附**到帧格再比"
                               "（5s→124帧、10s→243帧、15s→362帧），两边都是整数帧、精确相等。\n"
                               "· 选「自定义」用下面那个框自己填秒数；选「不限」关掉守卫。\n"
                               " | English: the frame options (124f…362f) pick an exact legal H3 clip "
                               "length (17n+5 grid) — use these when you think in frames. "
                               "The second options are kept for old workflows and snap up to the "
                               "nearest legal frame.",
                }),
                "when_short": (SHORT_CHOICES, {
                    "default": "silence",
                    "tooltip": "【 音轨短了怎么办】补静音=后面填真的 0；循环=把音轨重复到够长。"
                               "（给音频潜变量补 0 不是静音，会解出嗡嗡声，所以是在波形上补。） | "
                               "English: pad with real silence, or loop the track.",
                }),
                "over_mode": (OVER_CHOICES, {
                    "default": "warn",
                    "tooltip": "【 超长了怎么办】只警告=照样跑，控制台和节点上提示你；"
                               "停止=直接报错不跑，省一次废渲染。 | "
                               "English: warn but run, or stop the run.",
                }),
            },
            "optional": {
                "custom_limit": ("FLOAT", {
                    "default": 8.0, "min": 0.0, "max": 3600.0, "step": 0.5,
                    "tooltip": "【 自定义秒数】只有上面选了「自定义」才生效（选别的档位时这一项被忽略）。"
                               "想卡在多长就填多长，比如 7.5；填 0 = 关掉这个守卫，等于「不限」。\n"
                               " 它同样是整秒，会被向上吸附到 H3 的合法帧格（17n+5）再比较。\n"
                               " | English: only used when the dropdown is set to \"custom\"; 0 = no limit; "
                               "snapped up to the nearest legal H3 frame.",
                }),
                #  2026-10-30 新增：音轨起点（帧）。**追加在 optional 末尾**，
                #     不动 required 的声明序 ⇒ 老存档的 positional 数组不受影响
                #    （家族铁律：往 required 中间插控件 = 整档串位）。
                "start_frame": ("INT", {
                    "default": 0, "min": -1048576, "max": 1048576, "step": 1,
                    "tooltip": "【 从第几帧开始取音轨】\n"
                               "· 0（默认）= 从音轨开头取（跟以前一样）\n"
                               "· 正数 = 从第 N 帧起取（24fps，与画面同口径）\n"
                               "· 负数 = 从末尾倒数：-1 = 最后一帧起\n"
                               "\n"
                               " **第 2 段、第 3 段生成时必须填这个**（或者接 XiaoHei-分段表 的"
                               "「起始帧」输出）：本节点只负责「从你给的位置开始取」这一段，"
                               "你要喂哪一段，它自己不知道，喂错了也不会报错 —— 音画直接错位。\n"
                               " 最省事的做法：前面接一个 XiaoHei-按帧裁音频（按帧裁好再喂进来），"
                               "这里就留 0。\n"
                               " | English: start frame of the track (24fps). Set it for segment 2/3, "
                               "or wire the segment table's start-frame output. 0 = from the beginning.",
                }),
            },
        }

    RETURN_TYPES = ("MODEL", "LATENT", "AUDIO")
    RETURN_NAMES = ("model", "latent", "audio")
    OUTPUT_TOOLTIPS = (
        "【 模型】原样透传，接给采样器，让本节点能串在链里而不是绕线。",
        "【 潜变量】声音那一半已经锁成你的音轨的 latent，接给采样器。",
        "【 音轨】裁到正好和画面一样长的那条音轨，接给保存节点 —— 成片才不会音画不等长。",
    )
    FUNCTION = "run"
    CATEGORY = "XiaoHei/音频"

    def run(self, model, latent, audio_vae, track,
            clip_limit="15s", when_short="silence", over_mode="warn", custom_limit=8.0,
            start_frame=0):
        import comfy.nested_tensor

        samples = latent.get("samples") if isinstance(latent, dict) else None
        if samples is None or not getattr(samples, "is_nested", False):
            raise ValueError(
                "XiaoHei] XiaoHei-H3音频同步 需要 MiniMax H3 的 latent（画面和声音合在一起的那种）。"
                "现在这个 latent 只有其中一半，多半是别的模型的。请接「空 H3 影音潜变量」，"
                "或 H3 图生视频 / 参考生视频 的 latent 输出。"
            )

        parts = samples.unbind()
        if len(parts) < 2:
            raise ValueError(
                "XiaoHei] XiaoHei-H3音频同步：这个 latent 没有声音那一半，锁不进去音轨。"
            )
        video_latent, audio_template = parts[0], parts[1]
        target_t = audio_template.shape[-1]
        info = clip_info(video_latent.shape[2], target_t)

        limit = limit_seconds(clip_limit, custom_limit)
        #  2026-10-30：秒档位 → 帧格上限（向上吸附），守卫改走**帧口径**精确比。
        #    原来用「秒 + 0.25s 容差」，等于把 83~167ms 的换算错位盖住了（见 limit_frames 注释）。
        limit_fr = limit_frames(clip_limit, custom_limit)

        # ── 长度守卫：放在所有昂贵计算之前，别跑了半天才报错 ─────────────────
        over = over_limit_frames(info["frames"], limit_fr)
        if over:
            msg = (
                "XiaoHei] XiaoHei-H3音频同步：这个片段 {:.2f}s（{} 帧），超过你设的 {:g}s"
                "（该档位吸附到 H3 合法帧格后 = {} 帧 / {:.4f}s）。"
                "MiniMax H3 只训到约 15 秒，超了通常会烂。请调小 latent 节点的长度，"
                "或者把「最长片段」放宽。"
            ).format(info["seconds"], info["frames"], limit, limit_fr, limit_fr / float(FPS))
            if over_mode == "stop":
                raise ValueError(msg)
            print(msg)

        # ── 先在波形上对齐到片段长度，再编码 ────────────────────────────────
        waveform = track["waveform"]
        #  维度兜底：官方 AUDIO 的规范形状是 [B, C, S]；但个别第三方节点会直接把
        #    comfy_extras/nodes_audio.load() 的 [C, S] 原样塞进来。少一维会让后面的
        #    movedim + VAE.encode 在**很深的官方栈里**抛 IndexError（报错误导、看不出
        #    是本节点的问题），所以这里先补齐，别让它静默炸在别人家代码里。
        if hasattr(waveform, "dim") and waveform.dim() == 2:
            waveform = waveform.unsqueeze(0)
        waveform = waveform[:1]                            # H3 只吃 batch 1
        sample_rate = int(track["sample_rate"])
        vae_rate = int(getattr(audio_vae, "audio_sample_rate", 32000))
        if sample_rate != vae_rate:
            #  用官方 comfy.audio.resample（与官方 H3 条件节点 _encode_ref_audio 同一条路），
            #    只有它不在时才回退 torchaudio —— 别让第三方实现成为唯一路径。
            try:
                import comfy.audio
                waveform = comfy.audio.resample(waveform, sample_rate, vae_rate)
            except Exception:                                        # noqa: BLE001
                import torchaudio
                waveform = torchaudio.functional.resample(waveform, sample_rate, vae_rate)

        track_seconds = waveform.shape[-1] / float(vae_rate or 1)
        want_samples = target_samples(target_t, vae_rate)

        # ── 起点（帧）→ 秒 ───────────────────────────────────────────────────
        #  2026-10-30 新增：原来起点写死 0.0（= 总从音轨开头取），
        #    第 2/3 段生成时必须自己先裁好音轨，喂错了节点也不知道。
        #    现在支持 start_frame（帧，24fps，与画面同口径），还能接分段表的输出。
        sf = int(start_frame or 0)
        #  音轨总帧数用 **round(total_smp / (sr/fps))**，不能写 total_smp*fps//sr：
        #    整数除法会丢精度（359 帧的音轨被算成 358 ⇒ 负数起点差一整帧 = 1.33ms）。
        total_frames = int(round(waveform.shape[-1] * FPS / float(vae_rate or FPS)))
        if sf < 0:
            # 负数 = 从末尾倒数（-1 = 最后一帧起），跟 XiaoHei-按帧裁音频 同一套语义
            sf = max(0, total_frames + sf)
        start_s = sf / float(FPS)
        if sf > 0 and start_s >= (waveform.shape[-1] / float(vae_rate or 1)):
            raise ValueError(
                "XiaoHei] XiaoHei-H3音频同步：起点第 {} 帧（{:.3f}s）超出音轨长度"
                "（{:.3f}s = {} 帧）。请把「从第几帧开始取」改小，或换一条更长的音轨。"
                .format(sf, start_s, waveform.shape[-1] / float(vae_rate or 1), total_frames)
            )

        plan = plan_window(waveform.shape[-1], vae_rate, start_s,
                           want_samples / float(vae_rate or 1))
        fitted = apply_window(waveform, plan, when_short)

        # ── 编码：先清一次显存再编，编不动就再清一次重试，都不行才报错 ──────────
        #  官方 `comfy.sd.VAE.encode` 一旦显存不够会走**分块回退**，而那条回退只认
        #   4D 图像（`encode_tiled_` 取 shape[3]）；H3 音频 VAE 的 latent_dim 是 2、
        #   extra_1d_channel 是 None，两条 1D 分支都进不去 ⇒ 会崩成一句
        #   `IndexError: tuple index out of range`，报在官方栈深处，谁也看不懂。
        #   这里不假装能修（自研 1D 分块会在接缝处引入隐性音质问题，代价看不见），
        #   只做两件事：① 主动腾显存降低触发概率；② 真炸了给一句能照着做的中文。
        encoded = None
        last_err = None
        for _attempt in range(2):
            try:
                encoded = audio_vae.encode(fitted.movedim(1, -1))
                break
            except Exception as e:                                   # noqa: BLE001
                last_err = e
                try:
                    import comfy.model_management
                    comfy.model_management.soft_empty_cache()
                except Exception:                                    # noqa: BLE001
                    pass
        if encoded is None:
            msg = (
                "XiaoHei] XiaoHei-H3音频同步：音频 VAE 编码失败（多半是显存不够，触发了官方的"
                "分块回退，而官方那条回退只认 4D 图像，H3 的音频在这里必炸）。"
                "请按这个顺序试：① 把片段缩短（本节点已算出这个片段是 "
                "{:.2f}s）；② 关掉别的占显存的节点 / 用 --lowvram 起 ComfyUI；"
                "③ 换更大显存的环境。原始错误：{}"
            ).format(info["seconds"], last_err)
            raise ValueError(msg)

        # 编码器会做取整，差的是最后一两个 latent 帧，不是真空洞。
        # 这里重复最后一帧而不是补 0 —— 理由和上面波形对齐是同一个：
        # 0 号 latent 帧不是静音，哪怕只有两帧也压在镜头的最后几秒上。
        have = encoded.shape[-1]
        if have > target_t:
            encoded = encoded[..., :target_t]
        elif have < target_t:
            if have == 0:
                raise ValueError(
                    "XiaoHei] XiaoHei-H3音频同步：音频 VAE 对这条音轨没吐出任何东西。"
                )
            tail = encoded[..., -1:].repeat_interleave(target_t - have, dim=-1)
            encoded = torch.cat([encoded, tail], dim=-1)

        locked = dict(latent)
        locked["samples"] = comfy.nested_tensor.NestedTensor((video_latent, encoded))
        # 1 = 这一流去噪；0 = 完全保持原样。
        locked["noise_mask"] = comfy.nested_tensor.NestedTensor(
            (torch.ones_like(video_latent), torch.zeros_like(encoded))
        )

        fill_s = max(0.0, info["seconds"] - track_seconds)
        #  量化误差：音轨是按【音频 latent 帧】(40fps) 对齐的，不是按视频帧 (24fps)。
        #    官方正向 audio_latent_T = round(frames/24*40) ⇒ 往返一趟最多差半个音频 latent 帧
        #    = 1/80 秒 = 12.5ms。改不了（官方 latent 网格），但**必须让它可见**。
        exact_samples = info["seconds"] * (vae_rate or 1)
        quant_err_ms = (want_samples - exact_samples) / float(vae_rate or 1) * 1000.0
        report = {
            "frames": int(info["frames"]),
            "seconds": round(float(info["seconds"]), 3),
            "track": round(float(track_seconds), 3),
            "fill": round(fill_s, 3),
            "short": fill_s > 0.02,
            "when_short": when_short,
            "limit": limit,
            "over": bool(over),
            # ↓ 2026-10-30 新增（前端状态条用）
            "limit_frames": int(limit_fr),
            "start_frame": int(sf),
            "quant_err_ms": round(float(quant_err_ms), 2),
        }

        tail_txt = "循环补齐" if when_short == "loop" else "末尾补静音"
        if over:
            print("XiaoHei] XiaoHei-H3音频同步：片段 {:.2f}s（{} 帧）超过 {:g}s 上限（= {} 帧），建议缩短。"
                  .format(info["seconds"], info["frames"], limit, limit_fr))
        elif report["short"]:
            print("XiaoHei] XiaoHei-H3音频同步：片段 {:.2f}s · 音轨 {:.2f}s · 短 {:.2f}s，{}。"
                  .format(info["seconds"], track_seconds, fill_s, tail_txt))
        else:
            print("XiaoHei] XiaoHei-H3音频同步：片段 {:.2f}s（{} 帧）· 音轨 {:.2f}s · 已锁定"
                  "（起点帧 {}，对齐量化误差 {:+.2f}ms）。"
                  .format(info["seconds"], info["frames"], track_seconds, sf, quant_err_ms))

        # 还回去的是**裁到片段长度**的音轨 —— 把整条没裁的录音给保存节点，
        # 是唯一会悄悄毁掉成片的事（音画不等长）。
        matched = {"waveform": fitted, "sample_rate": vae_rate}

        return {
            "ui": {"xh_h3_sync": [report]},
            "result": (model, locked, matched),
        }


NODE_CLASS_MAPPINGS = {"XHH3AudioSync": XHH3AudioSync}
NODE_DISPLAY_NAME_MAPPINGS = {"XHH3AudioSync": "H3音频同步"}
