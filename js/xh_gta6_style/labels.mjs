// GTA6 风格 · 中文显示名总表（唯一真源）
//
// 🔴 铁律：这里只放「显示文字」，一个英文字都不要改。
//   下拉框真正存进工作流的仍是 nodes/gta6_style/data/presets.json 里的英文原名
//   （提示词必须是英文，后端按英文名反查英文描述句）。
//   前端拿到英文值 → 这里换中文显示，靠的是 ComfyUI 官方钩子 options.getOptionLabel
//   和家族自绘下拉 showXHDropdown，都不碰 options.values。
//
// 键 = presets.json 里的 "name" 原文，必须逐字一致（含大小写、括号、方括号）。

/** 特殊值（不是预设项，是「不选」和「跟谁走」） */
export const G6_SPECIAL = {
  KEEP: "keep from photo",
  OFF: "off",
  THEME: "(from theme)",
  GS_FROM: "(from group setup)",
};

export const G6_SPECIAL_ZH = {
  "keep from photo": "保留照片里的",
  "off": "不用",
  "(from theme)": "跟主题走",
  "(from group setup)": "跟整体构图走",
};

export const PRESET_ZH = {
  // ── 画风档位 ──────────────────────────────────────────────────────────
  style_variant: {
    "Key art (default)": "主视觉（默认）",
    "Character loading screen (gritty)": "角色载入画面（写实粗粝）",
    "Glam (cover art)": "华丽封面版",
    "Sketchy ink": "草稿墨线",
    "Synthwave album (flat)": "合成波专辑（平涂）",
  },

  // ── 整体色相 ──────────────────────────────────────────────────────────
  palette: {
    "Sunset peach > lavender (default)": "落日蜜桃→薰衣草（默认）",
    "Dusk violet + pink band": "黄昏紫罗兰＋粉霞带",
    "Daytime teal + pastel pink": "日间青绿＋粉彩粉",
    "Club teal + lilac + lime": "夜店青＋丁香紫＋青柠",
    "Workshop periwinkle + cream": "工坊蓝紫＋奶油白",
    "Hazy lime + sand": "朦胧青柠＋沙色",
    "Interior lavender + amber": "室内薰衣草＋琥珀",
    "Neon night violet + teal": "霓虹夜紫＋青绿",
    "Swamp green + gold": "沼泽绿＋金",
    "Smog orange + ember": "雾霾橙＋余烬红",
  },

  // ── 打光（由主题带出，不是独立控件，留给自绘下拉/提示用） ─────────────
  lighting: {
    "Warm rim light, cool shadow (default)": "暖轮廓光＋冷阴影（默认）",
    "Low sunset backlight": "低角度落日逆光",
    "Crisp midday sun": "清透正午阳",
    "Neon dual-tone rim": "霓虹双色轮廓光",
    "Club lights + gold glints": "夜店灯＋金饰反光",
    "Window light + palm shadows": "窗光＋棕榈影",
    "Searchlight at dusk": "黄昏探照灯",
  },

  // ── 背景画法 ──────────────────────────────────────────────────────────
  background_treatment: {
    "Screen-print posterised (default)": "丝网印刷色调分离（默认）",
    "Painterly sky + palm silhouettes": "手绘天空＋棕榈剪影",
    "Detailed illustrated set": "精细插画场景",
    "Soft-focus graphic city": "柔焦图形城市",
  },

  // ── 地点 ──────────────────────────────────────────────────────────────
  location: {
    "Beach art-deco strip": "海滩装饰艺术街",
    "Downtown waterfront marina": "市中心滨水码头",
    "Roadside gas station": "公路边加油站",
    "Rooftop over the city": "城市上空天台",
    "Motel room": "汽车旅馆房间",
    "Nightclub VIP": "夜店贵宾区",
    "Boatyard workshop": "船厂工棚",
    "Keys bridge over the bay": "海湾长桥",
    "Graffiti industrial lot": "涂鸦工业空地",
    "Neon boutique strip": "霓虹精品街",
    "Neon street block": "霓虹街区",
    "Swamp airboat dock": "沼泽气船码头",
    "Island keys shoreline": "群岛海岸线",
    "Port town at night": "夜里的小港镇",
    "Refinery town": "炼油厂小镇",
    "Forest river": "森林河流",
    "Beach + lifeguard tower": "沙滩＋救生塔",
    "Hotel pool party": "酒店泳池派对",
    "Bank exterior": "银行门口",
    "Plain gradient backdrop": "纯色渐变背景",
  },

  // ── 车辆 / 船 / 飞机 ─────────────────────────────────────────────────
  vehicle: {
    "Black 70s muscle car": "黑色 70 年代肌肉车",
    "Black fastback, red tail lights": "黑色溜背＋红尾灯",
    "Red 70s sports coupe": "红色 70 年代跑车",
    "Black luxury box SUV": "黑色豪华方盒 SUV",
    "Yellow supercar, scissor doors": "黄色剪刀门超跑",
    "Open-top convertible": "敞篷车",
    "Pink sportbike": "粉色摩托跑车",
    "Police cruiser, lights on": "警车（警灯闪）",
    "Speedboat": "快艇",
    "Small fishing boat": "小渔船",
    "Airboat": "沼泽气船",
    "Police helicopter + searchlight": "警用直升机＋探照灯",
    "News helicopter": "新闻直升机",
    "Seaplane": "水上飞机",
    "Float helicopter": "浮筒直升机",
  },

  // ── 整套主题 ──────────────────────────────────────────────────────────
  theme: {
    "Sunset key art": "落日晚霞主视觉",
    "Dusk heist": "黄昏劫案",
    "Daytime marina": "日间码头",
    "Rooftop searchlight": "天台探照灯",
    "Golden hour backlight": "黄金时刻逆光",
    "Romance close-up": "浪漫特写",
    "Motel hideout": "汽车旅馆躲藏",
    "Nightclub": "夜店",
    "Boatyard": "船厂",
    "Day on the water": "水上日光",
    "Neon night street": "霓虹夜街",
    "Industrial heat haze": "工业热浪",
    "Synthwave beach": "合成波海滩",
    "Swamp run": "沼泽逃亡",
    "Pool party": "泳池派对",
  },

  // ── 整体站位 ──────────────────────────────────────────────────────────
  group_setup: {
    "auto": "自动（按人数和车辆挑）",
    "Hero pose, facing viewer": "主角站姿·正面",
    "Key-art lineup": "主视觉队列",
    "Side by side": "并排站",
    "Close together": "靠近一点",
    "Walking toward viewer": "一起朝镜头走",
    "Leaning on the car": "靠车站",
    "Sitting on the car hood": "坐车头",
    "Relaxed hangout": "随意闲站",
    "Action, mid-heist": "动作·劫案进行中",
  },

  // ── 构图（主题内部带出，不单独出控件） ───────────────────────────────
  framing: {
    "Wide, figures on left third (default)": "宽画幅·人物在左三分之一（默认）",
    "Low-angle hero, 3/4 body": "低角度英雄机位·四分之三身",
    "Close two-shot, chest up": "近景双人·胸口以上",
    "Full body, centred": "全身居中",
    "Vertical poster": "竖版海报",
    "Wide group shot": "宽画幅群像",
  },

  // ── 画幅 ──────────────────────────────────────────────────────────────
  aspect: {
    "Landscape 3:2 (1248x832)": "横版 3:2（1248×832）",
    "Widescreen 16:9, YouTube / desktop (1344x768)": "宽屏 16:9·油管/桌面（1344×768）",
    "Ultrawide 21:9 (1568x672)": "超宽 21:9（1568×672）",
    "Tablet 4:3 (1184x896)": "平板 4:3（1184×896）",
    "Square 1:1 (1024x1024)": "方形 1:1（1024×1024）",
    "Social portrait 4:5, Instagram (928x1152)": "社交竖版 4:5·小红书/INS（928×1152）",
    "Tablet portrait 3:4 (896x1184)": "平板竖版 3:4（896×1184）",
    "Portrait 2:3, poster (832x1248)": "竖版 2:3·海报（832×1248）",
    "Phone 9:16, wallpaper / Shorts / Reels (768x1344)": "手机 9:16·壁纸/竖屏短视频（768×1344）",
  },

  // ── 单人姿态 ──────────────────────────────────────────────────────────
  pose: {
    "Facing viewer, square-on": "正面直视",
    "Three-quarter view": "四分之三侧身",
    "Side profile": "纯侧面",
    "Looking back over shoulder": "回头看镜头",
    "Arms folded": "抱臂",
    "Hands in pockets": "手插兜",
    "Leaning back": "往后靠",
    "Sitting": "坐着",
    "Crouching": "蹲着",
    "Walking toward viewer": "朝镜头走",
    "Aiming a pistol": "双手举枪瞄准",
    "Pistol held low": "垂手拎枪",
    "Raising a drink": "举杯",
    "On the phone": "打电话",
    "Hand behind head": "手放脑后",
    "Pointing at temple": "手指太阳穴",
    "Checking watch": "看手表",
  },

  // ── 女 · 发型 ─────────────────────────────────────────────────────────
  "female.hair": {
    "High curly ponytail": "高马尾卷",
    "Wind-swept ponytail": "风吹马尾",
    "Big shoulder-length curls": "齐肩大卷",
    "Long spiral curls": "长螺旋卷",
    "Braids + half-up buns": "编发＋半丸子",
    "Sleek straight": "顺直长发",
    "Messy beach waves": "凌乱沙滩卷",
    "Natural afro": "自然爆炸头",
    "Long locs": "长脏辫",
    "Long box braids": "长盒辫",
    "Sleek black bob with bangs": "黑直波波头＋刘海",
    "Space buns": "双丸子头",
    "Silk headscarf": "丝质头巾",
  },

  // ── 女 · 服装 ─────────────────────────────────────────────────────────
  "female.outfit": {
    "Magenta crop top + camo leggings": "洋红短上衣＋迷彩紧身裤",
    "Black cami + denim cut-offs": "黑色吊带＋牛仔短裤",
    "Cropped hoodie + frayed shorts": "短款卫衣＋破毛边短裤",
    "Denim jacket + mini skirt": "牛仔外套＋迷你裙",
    "Palm-print shirt + white crop": "棕榈印花衬衫＋白短上衣",
    "Black tee + cut-offs + high-tops": "黑 T＋牛仔短裤＋高帮鞋",
    "Football jersey + bikini": "橄榄球衣＋比基尼",
    "Fur jacket + leopard top": "皮草外套＋豹纹上衣",
    "Shredded jeans + fishnets": "破洞牛仔裤＋渔网袜",
    "Bikini top + sarong": "比基尼＋纱笼",
  },

  // ── 女 · 配饰 ─────────────────────────────────────────────────────────
  "female.accessory": {
    "Large gold hoops": "大金圈耳环",
    "Thin gold pendant necklace": "细金吊坠项链",
    "Layered gold body chains": "多层金链＋腰链",
    "Iced-out nameplate chains": "闪钻名牌链＋长美甲",
    "Fingerless gloves": "露指手套",
    "Ankle monitor": "电子脚镣",
    "Bandana mask": "方巾蒙面",
    "Sunglasses on head": "墨镜推头上",
  },

  // ── 男 · 发型 ─────────────────────────────────────────────────────────
  "male.hair": {
    "Short crop": "短寸",
    "Cornrow braids": "贴头辫",
    "Long slicked back": "后梳长发",
    "Messy under backwards cap": "反戴帽＋乱发",
    "Swept-back grey": "灰白后梳",
    "Close buzz": "极短寸头",
    "Short twists": "短拧辫",
    "High-top fade": "高顶渐变",
    "Slick undercut": "后梳削边",
    "Man bun": "男士丸子头",
    "Shaved head": "光头",
  },

  // ── 男 · 胡子 ─────────────────────────────────────────────────────────
  "male.facial_hair": {
    "Short stubble": "短胡茬",
    "Full trimmed beard": "整修络腮胡",
    "Grey goatee": "灰白山羊胡",
    "Thin goatee": "细山羊胡",
    "Scruffy moustache": "凌乱小胡子",
    "Light chin strap": "浅下巴线胡",
  },

  // ── 男 · 服装 ─────────────────────────────────────────────────────────
  "male.outfit": {
    "White tank + camo cargo shorts": "白背心＋迷彩工装短裤",
    "White tank + olive cargos": "白背心＋橄榄工装裤",
    "Palm shirt over tee + khakis": "棕榈衬衫叠穿＋卡其裤",
    "Graphic tee + brown chinos": "印花 T＋棕色休闲裤",
    "Army training tee + jeans": "军训 T＋牛仔裤",
    "Dark tank top": "深色背心",
    "Baroque bomber + black tee": "巴洛克夹克＋黑 T",
    "Faded Hawaiian shirt": "褪色夏威夷衬衫",
    "Floral shirt + board shorts": "花卉衬衫＋冲浪短裤",
    "Red oversized tee + ripped jeans": "红色宽大 T＋破洞牛仔",
    "Cream linen suit": "米白亚麻西装",
    "White tee + jeans biker": "白 T＋牛仔＋摩托头盔",
  },

  // ── 男 · 配饰 ─────────────────────────────────────────────────────────
  "male.accessory": {
    "Thin silver chain": "细银链＋皮手绳",
    "Cuban link chain + gold rings": "古巴链＋金戒指",
    "Gold chain + gold watch": "金链＋金表",
    "Gold chain + rings + iced watch": "金链＋戒指＋闪表",
    "Tinted sunglasses": "紫调墨镜",
    "Aviators": "飞行员墨镜",
    "Sunglasses on head": "墨镜推头上",
    "Browline glasses + gloves": "眉框眼镜＋驾驶手套",
    "Fish tattoo sleeves": "鱼纹满臂纹身",
    "Forearm tattoos": "前臂纹身",
    "Bandana mask": "方巾蒙面",
  },
};

/** 模式（后端 MODES，三选一） */
export const MODES = [
  "one photo, one person",
  "one photo per person (image 1, 2, ...)",
  "text only (no photo)",
];
export const MODES_ZH = {
  "one photo, one person": "一张照片·一个人",
  "one photo per person (image 1, 2, ...)": "一人一张照片",
  "text only (no photo)": "纯文字（不用照片）",
};

/** 留标题位（后端 TITLE_SPACE） */
export const TITLE_SPACE_ZH = {
  "off": "不留标题位",
  "auto": "自动留",
  "left side": "留左边",
  "right side": "留右边",
  "top": "留上方",
};

/** 通用查表：给了英文原名就返回中文，查不到原样返回（英文态同表）。 */
export function zhOf(group, value) {
  const t = PRESET_ZH[group];
  return (t && t[value]) || G6_SPECIAL_ZH[value] || value || "";
}

// 🔴 下拉候选项的英文原名 **有序列表**：键的插入顺序就是 presets.json 里的顺序。
//   前端之所以要这份表：XH_GTA6People 节点没有任何原生控件（整块 UI 是 DOM），
//   拿不到 options.values；又不能为了拿列表去读 /object_info（人物项根本没暴露）。
//   所以英文名列表 = Object.keys(PRESET_ZH[*])，中文名同表 —— 一份数据两用，不会漂。
//   ⚠️ 键必须跟 PRESET_ZH 的键**一模一样**（含 "female.hair" 这种带点的）：
//      曾经写成嵌套的 {hair:{female,male}}，结果 dropdownItems("male.hair") 取到 undefined，
//      男角色的下拉只剩「保留照片里的」一项 —— 桩环境里一眼看出来的真 bug。
const K = (g) => Object.keys(PRESET_ZH[g]);

export const G6_OPTIONS = {
  "female.hair": K("female.hair"),
  "male.hair": K("male.hair"),
  "female.facial_hair": [],
  "male.facial_hair": K("male.facial_hair"),
  "female.outfit": K("female.outfit"),
  "male.outfit": K("male.outfit"),
  "female.accessory": K("female.accessory"),
  "male.accessory": K("male.accessory"),
  pose: K("pose"),
  theme: K("theme"),
  style_variant: K("style_variant"),
  location: K("location"),
  palette: K("palette"),
  vehicle: K("vehicle"),
  aspect: K("aspect"),
  group_setup: K("group_setup"),
};

/** 原生下拉的中文显示表（applyComboLabels 用；值一字不动）。 */
export const G6_COMBO = {
  theme: PRESET_ZH.theme,
  style_variant: PRESET_ZH.style_variant,
  background: { "(from theme)": "跟主题走", ...PRESET_ZH.location },
  hue: { "(from theme)": "跟主题走", ...PRESET_ZH.palette },
  vehicle: { "off": "不用", ...PRESET_ZH.vehicle },
  aspect: PRESET_ZH.aspect,
  mode: MODES_ZH,
  group_setup: PRESET_ZH.group_setup,
  title_space: TITLE_SPACE_ZH,
};
