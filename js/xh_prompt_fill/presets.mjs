// 提示词填空 XiaoHei · 官方预设库（全中文版）
// 结构依据 = 本机 MiniMax Design 官方提示词技能库：
//   · 骨架 = H3官方9技能提示词/references/base-en.txt §2.2 三段结构 + §2.1 四种开头指令
//   · 词库 = 同文件 §4.1 视觉风格7 / §4.2 切镜8 / §4.3 运镜表20+幅度2+速度2 / §4.7 静音N/A
// 2026-11-24 按用户要求整体中文化：模板句子、候选词、空位名、默认值、前缀全部中文。
//   H3 是国产模型、中文提示词原生支持（官方广场本身即中文），三段结构标记也用中文。
//   如需严格英文原文，仍可取 base-en.txt；本预设只保证结构同源、措辞本地化。
// 每个预设 = {id, nameZh, nameEn, note, prefixOptions, template, slots}。
// slots[key] = { labelZh, labelEn, options:[{v,zh}], locked, fixed, free }。
//   options 为空 + free=true 表示自由填写（官方未枚举，不硬凑词库）。

const STYLE = [
  ["电影感", "电影感"], ["真人实拍", "真人实拍"], ["二维动画", "二维动画"],
  ["三维动画", "三维动画"], ["黏土定格", "黏土定格"], ["水彩", "水彩"], ["复古胶片", "复古胶片"],
];
const CUT = [
  ["镜头切到", "镜头切到"], ["画面切到", "画面切到"],
  ["画面转到", "画面转到"], ["画面变为", "画面变为"],
  ["画面切换到", "画面切换到"], ["叠化转场", "叠化转场"],
  ["淡入淡出", "淡入淡出"], ["擦除转场", "擦除转场"],
];
const MOTION = [
  ["变焦推近", "变焦推近"], ["变焦拉远", "变焦拉远"], ["推进", "推进"], ["拉出", "拉出"],
  ["左摇", "左摇"], ["右摇", "右摇"], ["左移", "左移"], ["右移", "右移"],
  ["上仰", "上仰"], ["下俯", "下俯"], ["升高", "升高"], ["降低", "降低"],
  ["环绕", "环绕"], ["跟拍", "跟拍"], ["固定不动", "固定不动"],
  ["轻微晃动", "轻微晃动"], ["剧烈晃动", "剧烈晃动"], ["主观视角", "主观视角"],
  ["顺时针滚转", "顺时针滚转"], ["逆时针滚转", "逆时针滚转"],
];
const AMPL = [["小幅度", "小幅度"], ["大幅度", "大幅度"]];
const SPEED = [["慢速", "慢速"], ["快速", "快速"]];
const MUSIC = [["无（静音）", "无（静音）"]];

const opt = (list) => list.map(([v, zh]) => ({ v, zh }));
const freeSlot = (labelZh, labelEn, fixed = "") => ({ labelZh, labelEn, options: [], locked: true, fixed, free: true });

export const H3_VIDEO = {
  id: "h3_video_official",
  nameZh: "H3 视频 · 官方三段式",
  nameEn: "H3 Video · Official 3-part",
  note: "骨架取自 MiniMax 官方 base-en.txt §2.2 三段结构，词库取自 §4.1/4.2/4.3；已整体中文化。",
  prefixOptions: [
    { v: "", zh: "纯文生视频（无参考图）" },
    { v: "目标视频在第 0.00 秒处，完整参考 <图1>（来自[镜头1]）。", zh: "首帧参考 I2VA" },
    { v: "参考图与目标视频的对齐方式——图1（来自镜头1）对齐目标视频的 0.00 秒，图2（来自镜头N）对齐目标视频的 S.SS 秒。", zh: "首尾帧参考 FL2VA" },
    { v: "参考图与目标视频的对齐方式——<图1>（来自[镜头N]）对齐目标视频的 S.SS 秒。", zh: "尾帧参考 L2VA" },
  ],
  template:
    "画面描述：[镜头1] {{风格}}，{{景别}} 画面中是 {{主体}}。镜头 {{运镜}} {{幅度}} {{速度}} 朝向 {{朝向}}。{{台词}} [镜头2] 在 {{切镜时间}}，{{切镜}} 画面转到新的场景。\n\n" +
    "整体音效：{{环境音}}\n\n" +
    "背景配乐：{{配乐}}",
  slots: {
    "风格": { labelZh: "视觉风格", labelEn: "Visual style", options: opt(STYLE), locked: false, fixed: "电影感", free: false },
    "切镜": { labelZh: "切镜方式", labelEn: "Cut", options: opt(CUT), locked: false, fixed: "镜头切到", free: false },
    "运镜": { labelZh: "运镜类型", labelEn: "Camera motion", options: opt(MOTION), locked: false, fixed: "推进", free: false },
    "幅度": { labelZh: "运镜幅度", labelEn: "Amplitude", options: opt(AMPL), locked: false, fixed: "小幅度", free: false },
    "速度": { labelZh: "运镜速度", labelEn: "Speed", options: opt(SPEED), locked: false, fixed: "慢速", free: false },
    "配乐": { labelZh: "配乐 / 静音", labelEn: "Music", options: opt(MUSIC), locked: false, fixed: "无（静音）", free: false },
    "主体": freeSlot("主体 / 场景", "Subject / scene", "一位站在雨中窗边的年轻女子"),
    "景别": freeSlot("景别", "Shot size", "中景"),
    "朝向": freeSlot("镜头朝向", "Camera focus", "她的脸"),
    "台词": freeSlot("台词", "Dialogue", ""),
    "切镜时间": freeSlot("切镜时间点", "Cut time", "00:03.500"),
    "环境音": freeSlot("环境音描述", "Ambient sound", "持续的雨声敲打窗户，伴着低沉的室内环境音。"),
  },
};

// 通用图片提示词骨架（Nano Banana / FLUX / Qwen-Image 类通用，纯结构、非某模型硬契约）。
// 标为「通用模板」——不冒充官方；官方图片规范见 H3-Image 图像提示词 skill 的 PE 规范（是"写法规则"不是填空模板）。
export const IMAGE_GENERAL = {
  id: "image_general",
  nameZh: "图片通用 · 主体+环境+光线",
  nameEn: "Image · Subject + Scene + Light",
  note: "通用图片提示词结构（非官方模板，仅作填空骨架）。要严格官方写法请用 H3-Image 的 PE 规范。",
  prefixOptions: [{ v: "", zh: "无前缀" }],
  template: "{{主体}}，{{场景}}，{{光线}}，{{镜头}}，{{风格}}",
  slots: {
    "风格": { labelZh: "风格", labelEn: "Style", options: opt(STYLE), locked: false, fixed: "电影感", free: false },
    "镜头": { labelZh: "镜头 / 介质", labelEn: "Lens / medium", options: opt([["35mm 写实", "35mm 写实"], ["85mm 人像", "85mm 人像"], ["广角", "广角"], ["微距", "微距"], ["油画", "油画"], ["三维渲染", "三维渲染"]]), locked: false, fixed: "35mm 写实", free: false },
    "主体": freeSlot("主体", "Subject", "一只小黑猫"),
    "场景": freeSlot("场景", "Scene", "夜晚雨中霓虹闪烁的街道"),
    "光线": freeSlot("光线", "Lighting", "柔和的电影感轮廓光"),
  },
};

export const PRESETS = [H3_VIDEO, IMAGE_GENERAL];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || H3_VIDEO;
}

// 把预设展成可存进 fill_config 的纯数据（只留 v/options/locked/fixed，配置整体中文）。
export function presetToConfig(preset) {
  const slots = {};
  for (const [key, s] of Object.entries(preset.slots)) {
    slots[key] = {
      options: s.options.map((o) => o.v),
      locked: !!s.locked,
      fixed: s.fixed || "",
    };
  }
  return {
    preset: preset.id,
    prefix: (preset.prefixOptions && preset.prefixOptions[0] && preset.prefixOptions[0].v) || "",
    template: preset.template,
    slots,
  };
}
