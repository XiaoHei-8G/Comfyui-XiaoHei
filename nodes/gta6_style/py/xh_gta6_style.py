# 1:1 移植 ComfyUI-GTA6-Style（MIT, Loop Forge）的「主题 + 人物 + 拼装」三段结构。
#
# 原包 4 个 class_type：GTA6Theme / GTA6Woman / GTA6Man / GTA6PromptBuilder ——
# 一个 group setup 里「几个人就要几个节点」串成链，4 个人 = 6 个节点。
# 这里压成 3 个：
#   XH_GTA6Theme   主题（调色 / 打光 / 背景 / 地点 / 车辆 / 画幅）
#   XH_GTA6People  人物列表（前端「＋ 加一个人」可加任意行，一人一行，行能开关）
#   XH_GTA6Builder 拼装（一个主题 + 一个列表 → 提示词 + 宽高 + 纯风格句）
# 英语提示词原文一字不改（照抄 data/presets.json 的 text 字段），
# 因为目标模型 Qwen-Image 2.1 的提示词惯例是英文；中文只做界面显示，见前端 labels.mjs。
#
# 引用原作者的算法分工：主题只挑「英文描述句」，人物只挑「行级覆盖」，
# 拼装按 Qwen PE-I2I 的七段顺序落句：操作+身份 → 逐人覆盖 → 渲染 → 站位/车 →
# 用户补充 → 场景/招牌/背景 → 构图。全程肯定句（作者工作流 KSampler CFG=1，
# 负向提示词在数学上不起作用，所以「不要文字」只能写成「招牌都画成空白板」）。
#
# 移植时修掉原包两个真 bug：
#   ① 留标题位的模板把动词写死成复数 ⇒ 单人输出「the figure stand ...」；
#      改成 {occupy/occupies}、{fill/fills} 跟着人数走。
#   ② 混合性别且某性别 ≥2 人时序数错乱 ⇒ 3 人（女/男/女）会输出
#      「the first woman ... the third woman」（男人丢序数、第二个女人被叫成第三个）；
#      改成「序数按性别内部数」。
import json
import pathlib

_DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "presets.json"
DB = json.loads(_DATA.read_text(encoding="utf-8"))

KEEP = "keep from photo"
OFF = "off"
THEME = "(from theme)"
GS_FROM = "(from group setup)"

MODES = ["one photo, one person", "one photo per person (image 1, 2, ...)", "text only (no photo)"]
# 画幅 / 外接宽高的对齐口径：9 档预设全是 32 的倍数（1248 / 832 / 1344 / 768…），
# 外接分辨率选择器送进来的宽高也按这个规律取整最稳。
ALIGN = 32
SIDE_MIN, SIDE_MAX = 64, 8192


def _side(v, fallback=1024):
    """外接宽高兜底：不可用→fallback，夹到 64~8192，再按 32 对齐。
    静默修正会让人以为没生效，所以改了就 print 一行（ComfyUI 控制台可见）。"""
    if v is None:
        return fallback
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return fallback
    n = max(SIDE_MIN, min(SIDE_MAX, n))
    snapped = int(round(n / ALIGN)) * ALIGN
    snapped = max(SIDE_MIN, min(SIDE_MAX, snapped))
    if snapped != n:
        print(f"[XiaoHei GTA6] 外接尺寸 {n} 不是 {ALIGN} 的倍数，已对齐为 {snapped}。")
    return snapped
TITLE_SPACE = ["off", "auto", "left side", "right side", "top"]

NUM = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"}
ORD = {1: "first", 2: "second", 3: "third", 4: "fourth",
       5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth"}
PRON = {"female": ("she", "her", "her", "woman"), "male": ("he", "his", "him", "man")}


def names(items):
    return [i["name"] for i in items]


def by_name(items, n):
    return next((i for i in items if i["name"] == n), None)


def cap(s):
    return s[:1].upper() + s[1:]


def join(items):
    items = [i for i in items if i]
    if not items:
        return ""
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


# ---------------------------------------------------------------- 主题
class XH_GTA6Theme:
    DESCRIPTION = (
        "【干什么】定整张图的「电影感」：从 15 套官方美术图里挑一套，一次定好配色、打光、"
        "背景画法、地点和画幅；也能单独换背景地点或整体色相。\n"
        "【怎么配】主题先选一套当底子；下面「背景地点」「整体色相」默认跟主题走，"
        "想改才单独选；「车辆」要出车（跑车 / 快艇 / 直升机）才选，不要就留「不用」。\n"
        "【画幅】9 档预设全部是 1.03~1.07 百万像素、且都是 32 的倍数（这个模型的甜点带）。"
        "要用别的尺寸不用改这里 —— 拼装节点左边有 width / height 两个输入口，"
        "接上分辨率选择器（官方或本家族的都行）就以外接为准，构图判断也会跟着走。"
        "8G 显存接 0.6~1.0MP 跑得更快；大显存 1.2~2.0MP，再大不是显存问题、是画质会散。\n"
        "【怎么用】theme 输出口接「GTA6 提示词 XiaoHei」的主题输入口。"
        "招牌文字留空 = 全图不出现任何文字，招牌一律画成空白板 —— 这是刻意的，"
        "写「no text」没用（工作流 CFG=1，负向提示词不起作用）。\n"
        "【存在哪】全部是节点上的下拉选项，随工作流一起保存和分享。\n"
        "【输出】theme：一份主题设定（配色 / 打光 / 背景 / 地点 / 车辆 / 宽高）。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "theme": (names(DB["theme"]), {"default": DB["theme"][0]["name"],
                                           "tooltip": "整套外观的底子：配色 + 打光 + 背景画法 + 地点 + 构图，一选全定。"}),
            "style_variant": (names(DB["style_variant"]), {"default": DB["style_variant"][0]["name"],
                                                           "tooltip": "画风档位：主视觉 / 角色载入画面 / 华丽封面 / 草稿墨线 / 合成波平涂。"}),
            "background": ([THEME] + names(DB["location"]), {"default": THEME,
                                                             "tooltip": "单独换地点。选「跟主题走」就用上面主题自带的地点。"}),
            "hue": ([THEME] + names(DB["palette"]), {"default": THEME,
                                                     "tooltip": "单独换整体色相。选「跟主题走」就用上面主题自带的配色。"}),
            "vehicle": ([OFF] + names(DB["vehicle"]), {"default": OFF,
                                                       "tooltip": "要不要出车 / 船 / 飞机。选「不用」就纯人物。"}),
            "sign_text": ("STRING", {"default": "", "tooltip":
                                     "背景招牌上要写的字，原样照写。留空 = 全图不出文字，招牌画成空白板。"}),
            "aspect": (names(DB["aspect"]), {"default": DB["aspect"][0]["name"],
                                             "tooltip":
                                                 "画幅。9 档预设全部落在 1.03~1.07 百万像素、"
                                                 "且都是 32 的倍数 —— 这是这个模型的甜点带，不是删剩的档位。\n"
                                                 "想用别的尺寸不必改这里：把「GTA6 提示词 XiaoHei」"
                                                 "左边新加的 width / height 两个输入口接上分辨率选择器"
                                                 "（官方 Resolution Selector，或本家族的「分辨率选择器 XiaoHei」），"
                                                 "那边给多少这里就跟着走，构图和「留标题位」的横竖判断也会跟着变。\n"
                                                 "8G 显存接 0.6~1.0MP 跑得快；大显存 1.2~2.0MP，"
                                                 "再往上不是显存问题、是画质会散（模型本身在 1MP 附近训练），"
                                                 "要 4K 成片请用 1MP 出图再放大。"}),
        }}

    RETURN_TYPES = ("XH_GTA6_THEME",)
    RETURN_NAMES = ("theme",)
    OUTPUT_TOOLTIPS = ("主题设定：配色 / 打光 / 背景画法 / 地点 / 车辆 / 宽高，接提示词节点的 theme 口。",)
    FUNCTION = "build"
    CATEGORY = "XiaoHei/提示词/GTA6 风格"

    def build(self, theme, style_variant, background, hue, vehicle, sign_text, aspect):
        t = by_name(DB["theme"], theme)
        a = by_name(DB["aspect"], aspect)
        # 兜底：手改过工作流 JSON / 装了不同版本的工作流，名字可能对不上。
        # 不兜的话下面 t["lighting"] 会抛英文 KeyError/TypeError，报错看不懂。
        if t is None:
            raise ValueError(f"主题「{theme}」在当前预设里找不到，请重新选一个主题。")
        if a is None:
            raise ValueError(f"画幅「{aspect}」在当前预设里找不到，请重新选一个画幅。")
        return ({
            "variant": by_name(DB["style_variant"], style_variant),
            "lighting": by_name(DB["lighting"], t["lighting"])["text"],
            "bg": by_name(DB["background_treatment"], t["background_treatment"])["text"],
            "palette": by_name(DB["palette"], t["palette"] if hue == THEME else hue)["text"],
            "location": by_name(DB["location"], t["location"] if background == THEME else background),
            "vehicle": by_name(DB["vehicle"], vehicle),
            "sign_text": sign_text.strip(),
            "framing": t.get("framing"),
            "w": a["w"],
            "h": a["h"],
        },)


# ---------------------------------------------------------------- 人物
def _blank_person(gender="female"):
    return {"gender": gender, "keep": [], "details": "", "pose": "",
            "hair": "", "facial_hair": "", "outfit": "", "accessory": ""}


def _build_person(raw):
    """把前端存的一行 JSON 翻成内部人物 dict（字段口径与原包 _person 完全一致）。"""
    gender = raw.get("gender") if raw.get("gender") in ("female", "male") else "female"
    sec = DB[gender]
    p = _blank_person(gender)
    details = raw.get("details")
    p["details"] = details.strip() if isinstance(details, str) else ""

    pose = by_name(DB["pose"], raw.get("pose") or "")
    p["pose"] = pose["text"] if pose else ""

    lists = {
        "hair": sec["hair"],
        "outfit": sec["outfit"],
        "accessory": sec["accessory"],
    }
    # 胡子只对男性有意义：女性行里残留的胡子值（先选男又改回女）必须整条丢掉，
    # 否则 "keep from photo" 会把 facial hair 塞进 keep ⇒ 输出
    # "keeping her facial identity, hairstyle, facial hair and clothing"。
    if gender == "male":
        lists["facial_hair"] = sec.get("facial_hair", [])
    for field, table in lists.items():
        v = raw.get(field)
        if not isinstance(v, str) or not v:
            continue
        if v == KEEP:
            p["keep"].append(field)
            continue
        item = by_name(table, v)
        p[field] = item["text"] if item else ""
    return p


class XH_GTA6People:
    DESCRIPTION = (
        "【干什么】写「图里有几个人、每个人长什么样」。一个人一行，行能加、能删、能单独关掉，"
        "顺序就是画面里从左到右的顺序。\n"
        "【怎么配】点「＋ 加一个人」加一行；每行先选性别，再选发型 / 服装 / 配饰"
        "（男角色多一个「胡子」）。每个下拉第一项都是「保留照片里的」，照片模式想照抄原样就留它。\n"
        "【怎么用】输出口接「GTA6 提示词 XiaoHei」的人物输入口。纯文字模式（不用照片）"
        "必须把发型和服装选出来，不然模型只知道「一个女人」什么样子都不知道。"
        "「补充」一栏写画面里要她做的小动作或血统年龄，会接在该人物的描述后面。\n"
        "【存在哪】每行的选择存在节点属性里，随工作流一起保存和分享，不占参数槽位。\n"
        "【输出】people：人物列表（几个人就有几项，含每人的长相 / 穿着 / 姿态 / 补充）。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            # 前端注入：{"people":[{"gender","hair","facial_hair","outfit","accessory","pose","details","enabled"}]}
            "hidden": {"XHGTA6PeopleState": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = ("XH_GTA6_PEOPLE",)
    RETURN_NAMES = ("people",)
    OUTPUT_TOOLTIPS = ("人物列表：每一行一个人，顺序 = 画面里从左到右。",)
    FUNCTION = "build"
    CATEGORY = "XiaoHei/提示词/GTA6 风格"

    @staticmethod
    def _parse(raw):
        try:
            state = json.loads(raw) if isinstance(raw, str) else {}
        except (ValueError, TypeError, RecursionError):
            state = {}
        if not isinstance(state, dict):
            state = {}
        rows = state.get("people")
        return rows if isinstance(rows, list) else []

    def build(self, XHGTA6PeopleState="{}"):
        people = []
        for raw in self._parse(XHGTA6PeopleState):
            if not isinstance(raw, dict) or raw.get("enabled") is False:
                continue
            people.append(_build_person(raw))
        if not people:
            raise ValueError("「GTA6 人物 XiaoHei」里一个人都没有：点「＋ 加一个人」至少加一行，"
                             "并确认这一行是「开」着的。")
        return (people,)

    @classmethod
    def IS_CHANGED(cls, XHGTA6PeopleState="{}"):
        return XHGTA6PeopleState


# ---------------------------------------------------------------- 拼装
def _title_block(side, n):
    fig = "the figure" if n == 1 else "the figures"
    occupy = "occupies" if n == 1 else "occupy"
    fill = "fills" if n == 1 else "fill"
    above = "above the head" if n == 1 else "above their heads"
    if side == "left":
        return (f"Compose a wide landscape frame like official crime-game key art: {fig} {occupy} the right half of the "
                f"frame, shown from the knees up, while the left half is open sky and simple distant background with no "
                f"figures in it, leaving a large empty space for a title.")
    if side == "right":
        return (f"Compose a wide landscape frame like official crime-game key art: {fig} {occupy} the left half of the "
                f"frame, shown from the knees up, while the right half is open sky and simple distant background with no "
                f"figures in it, leaving a large empty space for a title.")
    return (f"Compose the frame like an official crime-game cover poster: {fig} {fill} the lower half of the frame, "
            f"while the upper half {above} is open sky with only palm silhouettes at the edges, leaving a large empty "
            f"space for a title.")


def _refs(people, mode):
    """给每个人一个指代短语 + 代词。修掉原包「混合性别时序数错乱」的 bug。"""
    n = len(people)
    counts = {g: sum(p["gender"] == g for p in people) for g in ("female", "male")}
    seen = {"female": 0, "male": 0}
    text_mode, per_photo = mode == MODES[2], mode == MODES[1]
    for i, p in enumerate(people, 1):
        sub, pos, obj, noun = PRON[p["gender"]]
        seen[p["gender"]] += 1
        gidx = seen[p["gender"]]
        p.update(sub=sub, pos=pos, obj=obj, noun=noun)
        if n == 1 or counts[p["gender"]] == 1:
            ref = f"the {noun}"
        elif mode == MODES[0] and n == 2:
            ref = f"the {noun} on the {'left' if i == 1 else 'right'}"
        elif mode == MODES[0]:
            ref = f"the {ORD.get(i, str(i) + 'th')} person from the left"
        else:
            # 同一性别里排第几：3 人（女/男/女）→ the first woman / the man / the second woman
            ref = f"the {ORD.get(gidx, str(gidx) + 'th')} {noun}"
        p["ref"] = ref
        p["first"] = f"{ref} in <image{i}>" if per_photo else ref
        p["r_sub"] = sub if n == 1 else ref
        p["r_obj"] = obj if n == 1 else ref
        p["r_pos"] = pos if n == 1 else ref + "'s"


def _render(v, lighting, who):
    return [f"Render {who} with {v['shading']}.",
            f"Light {who} with {lighting}.",
            f"Draw {who} with {v['line_art']}.",
            f"Show {v['detail']}."]


class XH_GTA6Builder:
    DESCRIPTION = (
        "【干什么】把主题 + 人物列表拼成一段完整的英文提示词，同时给出配套的宽高和一段「纯风格句」。\n"
        "【怎么配】主题输入接主题节点，人物输入接人物节点；选「一张照片一个人」就得正好一个人，"
        "多人合影要选「一人一张照片」；「自己再补几句」写动作、道具、额外场景细节，"
        "插在人物之后、背景之前；「留标题位」按官方主视觉那样空出一块天地，方便后期加片名。\n"
        "【怎么用】prompt 输出口接提示词编码节点（Qwen-Image 2.1 编码器），"
        "width / height 接空 Latent 的长宽；style_only 只有画风那几句，"
        "想把它接到你自己写的提示词后面时用。\n"
        "【换尺寸】左边 width / height 是覆盖口：接上分辨率选择器"
        "（官方 Resolution Selector 或本家族「分辨率选择器 XiaoHei」）就以外接为准，"
        "不接就用主题节点的画幅。构图和「留标题位」的横竖判断都会用最终尺寸。\n"
        "🔴 别绕过本节点把分辨率直接接空 Latent —— 那样图变了、提示词里的构图句还是老画幅，人物会被裁。\n"
        "【存在哪】拼装在运行时完成，不额外存东西；改主题或人物里的任何一项，提示词跟着变。\n"
        "【输出】prompt 整段提示词；width / height 画幅像素；style_only 纯画风句。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "theme": ("XH_GTA6_THEME", {"tooltip": "接「GTA6 主题 XiaoHei」的 theme 输出口。"}),
            "mode": (MODES, {"default": MODES[0], "tooltip":
                             "照片怎么给：一张照片一个人（单人）；一人一张照片（多人，按 图1/图2 顺序）；"
                             "纯文字（完全不用照片，靠下拉描述造人）。"}),
            "group_setup": (names(DB["group_setup"]), {"default": "auto", "tooltip":
                                                      "整体站位。留「auto」会按人数和车辆自动挑一个。"}),
            "your_prompt": ("STRING", {"multiline": True, "default": "", "tooltip":
                                       "自己补的话：动作、道具、额外场景细节。插在人物之后、背景之前。"}),
            "title_space": (TITLE_SPACE, {"default": "off", "tooltip":
                                          "按官方主视觉那样空出一大块给片名：「auto」横版 1-2 人留左边，"
                                          "竖版或 3 人以上留上方；「off」用主题自带的构图。"}),
        }, "optional": {
            "people": ("XH_GTA6_PEOPLE", {"tooltip": "接「GTA6 人物 XiaoHei」的 people 输出口。"}),
            # 宽高覆盖口：forceInput ⇒ 只长出一个接线圆点，不长数字框（用户要的是外接，不是手填）。
            # 不接 = None = 照主题节点的画幅；接了 = 以外部为准，构图 / 留标题位的横竖判断一起跟着走。
            "width": ("INT", {"default": 0, "forceInput": True, "tooltip":
                              "接分辨率选择器的 width（官方 Resolution Selector 或本家族的"
                              "「分辨率选择器 XiaoHei」都行）。不接就用主题节点的画幅。\n"
                              "🔴 要换尺寸请接这里，别只把分辨率绕过本节点直接接空 Latent —— "
                              "那样图变小了、提示词里的构图句还按老画幅写，人物会被裁掉。"}),
            "height": ("INT", {"default": 0, "forceInput": True, "tooltip":
                               "接分辨率选择器的 height。不接就用主题节点的画幅。\n"
                               "只接一个、另一个不接也能跑，但比例可能不对，会给控制台提示。"}),
        }}

    RETURN_TYPES = ("STRING", "INT", "INT", "STRING")
    RETURN_NAMES = ("prompt", "width", "height", "style_only")
    OUTPUT_TOOLTIPS = (
        "整段英文提示词，接提示词编码节点。",
        "画幅宽度像素，接空 Latent 的宽。",
        "画幅高度像素，接空 Latent 的高。",
        "只有画风那几句（画法 / 打光 / 背景 + 配色），可以拼到自己写的提示词后面。",
    )
    FUNCTION = "build"
    CATEGORY = "XiaoHei/提示词/GTA6 风格"

    def build(self, theme, mode, group_setup, your_prompt, title_space="off", people=None,
              width=None, height=None):
        if not isinstance(theme, dict) or "variant" not in theme:
            raise ValueError("「GTA6 提示词 XiaoHei」的主题口没接上，或接到的不是「GTA6 主题 XiaoHei」。")
        # 宽高：外接优先，不接就用主题画幅。
        # 必须先算出来 —— 下面「留标题位 auto」要按最终宽高判断横竖，用主题的会判错。
        if (width is None) != (height is None):
            print("[XiaoHei GTA6] width / height 只接了一个，另一个仍用主题画幅，比例可能不对。")
        w = theme["w"] if width is None else _side(width, theme["w"])
        h = theme["h"] if height is None else _side(height, theme["h"])
        src = list(people or [])
        if not src:
            raise ValueError("「GTA6 提示词 XiaoHei」没接到人物：把「GTA6 人物 XiaoHei」的 people 输出口"
                             "连到本节点的人物输入口。")
        people = [dict(p) for p in src]
        n = len(people)
        text_mode, per_photo = mode == MODES[2], mode == MODES[1]
        if mode == MODES[0] and n != 1:
            raise ValueError("「一张照片一个人」只收一个人。多人请把模式改成「一人一张照片」——"
                             "一整张合影直接转插画，实测人物长相会跑。")
        _refs(people, mode)
        group = n != 1
        v = theme["variant"]
        medium = v["medium"]
        S = []

        # 1. 操作 + 身份
        all_keep = all({"hair", "outfit"} <= set(p["keep"]) for p in people)
        if text_mode:
            descs = [f"a {p['noun']}" + (f" {p['details']}" if p["details"] else "") for p in people]
            S.append(f"Create {medium}, showing {join(descs)}.")
        elif n == 1:
            p = people[0]
            kept = ["facial identity"] + [k for k, f in
                                          (("hairstyle", "hair"), ("facial hair", "facial_hair"),
                                           ("clothing", "outfit")) if f in p["keep"]]
            S.append(f"Create a new illustrated scene of the {p['noun']} in the image, keeping {p['pos']} {join(kept)} "
                     f"exactly as shown in the image, and change the rendering medium from photograph to {medium}.")
        else:
            who = join([p["first"] for p in people]) if per_photo else f"the {NUM.get(n, n)} people in the image"
            where = "their image" if per_photo else "the image"
            kept = "facial identity, hairstyle and clothing" if all_keep else "facial identity"
            S.append(f"Create a new illustrated scene of {who}, keeping each person's {kept} exactly as shown in "
                     f"{where}, and change the rendering medium from photograph to {medium}.")

        # 2. 逐人覆盖
        for i, p in enumerate(people, 1):
            if group and not text_mode and not all_keep:
                kept = [k for k, f in (("hairstyle", "hair"), ("facial hair", "facial_hair"),
                                       ("clothing", "outfit")) if f in p["keep"]]
                if kept:
                    S.append(f"Keep {p['r_pos']} {join(kept)} as shown in "
                             f"{'<image%d>' % i if per_photo else 'the image'}.")
            if p.get("hair"):
                S.append(f"Give {p['r_obj']} {p['hair']}." if text_mode
                         else f"Restyle {p['r_pos']} hair into {p['hair']}.")
            if p.get("facial_hair"):
                S.append(f"Give {p['r_obj']} {p['facial_hair']}.")
            if p.get("outfit"):
                S.append(f"Dress {p['r_obj']} in {p['outfit']}"
                         + (f", with {p['accessory']}" if p.get("accessory") else "") + ".")
            elif p.get("accessory"):
                S.append(f"Add {p['accessory']} to {p['r_obj']}.")
            if p["details"] and not text_mode:
                S.append(f"Show {p['r_obj']} {p['details']}.")

        # 3. 渲染
        who = "every figure" if group else people[0]["obj"]
        S += _render(v, theme["lighting"], who)
        if not text_mode and group:
            S.append("Redraw every face, body and garment fully in this illustrated style, so each person matches "
                     "the drawn look of the scene around them.")

        # 4. 站位 + 车辆
        veh = theme["vehicle"]
        car = veh["text"] if veh else "a car"
        gs = by_name(DB["group_setup"], group_setup) or by_name(DB["group_setup"], "auto")
        if group_setup == "auto":
            key = "Leaning on the car" if veh and veh["place"] == "behind" else (
                "Key-art lineup" if group else "Hero pose, facing viewer")
            gs = by_name(DB["group_setup"], key)
        all_ref = join([p["ref"] for p in people]) if n <= 2 else f"all {NUM.get(n, n)} people"
        t = gs["group"] if group else gs["solo"]
        if n == 1 and people[0]["pose"] and group_setup == "auto":
            t = ""  # 单人自己的姿态盖掉自动站位
        if t:
            t = t.replace("{All}", cap(all_ref)).replace("{Sub}", cap(people[0]["sub"]) if n == 1 else "")
            t = t.replace("{car}", car).replace("{pos}", people[0]["pos"] if n == 1 else "their")
            S.append(t)
        if veh and not gs.get("car"):
            them = "them" if group else people[0]["obj"]
            S.append({
                "behind": f"{cap(car)} is parked behind {them}.",
                "sky": f"{cap(car)} flies overhead in the sky.",
                "aboard": f"{cap('they' if group else people[0]['sub'])} ride{'' if group else 's'} aboard {car}.",
            }[veh["place"]])

        for p in people:
            if p["pose"]:
                S.append(f"{cap(p['r_sub'])} {p['pose'].replace('{pos}', p['pos'])}.")

        # 5. 用户补充
        if isinstance(your_prompt, str) and your_prompt.strip():
            S.append(your_prompt.strip())

        # 6. 场景 / 招牌 / 背景
        loc = theme["location"]
        S.append(f"Set the scene {loc['text']}.")
        st = theme["sign_text"]
        if not st:
            S.append("All signage is drawn as blank panels and abstract neon shapes.")
        elif loc.get("sign"):
            S.append(cap(loc["sign"].replace("{text}", st))
                     + ", and any other signs are blank panels and abstract neon shapes.")
        else:
            S.append(f'A sign in the background reads "{st}", and any other signs are blank panels and '
                     f'abstract neon shapes.')
        S.append(f"Build the background as {theme['bg']}, using {theme['palette']}.")

        # 7. 构图
        portrait = h > w
        side = title_space if title_space in ("auto", "left side", "right side", "top") else "off"
        if side == "auto":
            # ⚠️ 这里必须给 "left side"，不能给 "left"：下面判断的是三元组
            #    ("left side", "right side", "top")。原包/我们移植时都写成 "left"，
            #    于是「auto + 横版 1~2 人」永远匹配不上、静默落回默认构图 ——
            #    tooltip 承诺的「横版留左边」从来没生效过。2026-11-26 修。
            side = "top" if portrait or h == w or n >= 3 else "left side"
        if side in ("left side", "right side", "top"):
            S.append(_title_block({"left side": "left", "right side": "right", "top": "top"}[side], n))
        else:
            fr = theme["framing"]
            if not fr:
                big = n >= 3
                fr = ("Full body, centred" if big else "Low-angle hero, 3/4 body") if portrait else (
                    "Wide group shot" if big else "Wide, figures on left third (default)")
            S.append(f"Compose {by_name(DB['framing'], fr)['text']}.")

        prompt = " ".join(S).replace("{fig}", "the figure" if n == 1 else "the figures")
        style_only = " ".join([f"Draw it as {medium}."] + _render(v, theme["lighting"], "the figures")
                              + [f"Build the background as {theme['bg']}, using {theme['palette']}."]
                              ).replace("{fig}", "the figures")
        return (prompt, w, h, style_only)


NODE_CLASS_MAPPINGS = {
    "XH_GTA6Theme": XH_GTA6Theme,
    "XH_GTA6People": XH_GTA6People,
    "XH_GTA6Builder": XH_GTA6Builder,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XH_GTA6Theme": "GTA6 主题 XiaoHei",
    "XH_GTA6People": "GTA6 人物 XiaoHei",
    "XH_GTA6Builder": "GTA6 提示词 XiaoHei",
}
