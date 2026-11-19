//  XiaoHei 家族 · 全局自动配色钩子
// ══════════════════════════════════════════════════════════════════════
// 机制移植自 Pixaroma 的 js/brand/index.js（按 CATEGORY 前缀自动上色），
// 配色真源换成 XiaoHei 自己的：分类色板 + 家族 kit 的标题自动黑白。
//
// 为什么要有这层：
//   XiaoHei 70+ 个节点，每个都自己写一遍上色 = 散、容易漂移、新节点又忘了。
//   这里用官方 beforeRegisterNodeDef 钩子，**新增节点自动继承**，一行都不用改。
//
// 两条铁律（抄 Pixaroma 的血泪结论）：
//   ① `if (!this.color)` 守卫 —— 两个用户路径必须赢：
//      · 工作流恢复：存档的 color 在 onNodeCreated 之前就落到节点上了
//      · 用户右键/工具条自己选色：color 已经有值
//      这两种情况下我们**不动**，只给「没上过色的节点」铺默认色。
//   ② 标题栏是亮色 ⇒ 标题字必须自动切黑/白（对比度 ≥4.5），
//      走 kit 的 installTitleAutoColor（canvas）+ installVueTitleAutoColor（Nodes 2.0）。
//
// 配色（按 CATEGORY 后缀分色系，一眼能分清工具/图像/视频/音频）：
//   标题栏 = 亮色（分类色）  节点主体 = darkenHex(色, 0.42)（与 applyNodeColor 同款）
//
// 设置项：XiaoHei → 外观 →「节点配色」= 按分类 / 统一色 / 关闭
//   存 app.ui.settings（官方存储，和原生设置面板同步、持久化）。
//
// 零 Python 改动、零第三方依赖。

import {
  installTitleAutoColor, refreshVueTitles, installVueTitleAutoColor,
  installUnifiedTitleBar, paintVueUnifiedTitle,
} from "./xh_ui_kit.js";
import { isGraphLoading } from "./xh_undo_remount.js";

const { app } = window.comfyAPI.app;

// ═══════════════════════════════════════════════════════════
// ① 分类色板（唯一真源）
// ═══════════════════════════════════════════════════════════

/**
 * 统一色（模式 = 统一色时全家族用这一个）。
 *  2026-10-29：原来用纯白 #ffffff（毫无身份感）⇒ 改成**家族品牌色**（琥珀金）。
 *    「统一色」模式本来就是"整个家族一个记号"的功能 ⇒ 用品牌色正合适。
 */
//  2026-11-17 主题预设化：统一色改读 window.XH_THEME.main()，未加载时回退经典金。
const _theme = () => (typeof window !== "undefined" ? window.XH_THEME : null);
const _uniformHex = () => { const t = _theme(); return t ? t.main() : "#E8A33C"; };

/**
 *  默认模式「统一石墨」（2026-10-29 方案 B；模式名沿用，避免破坏用户已存的设置值）
 *
 * 2026-11-08 用户拍板两处改动：
 *   ① 标题栏色 石墨 #232323 → **午夜蓝 #01386A**，且**不再跟官方浅色主题切 #e9e9e9**。
 *      用户原话「不用官方的那个」指的就是官方 --node-component-header-surface；
 *      深浅主题一律固定午夜蓝。标题字由 installTitleAutoColor 自动切白（11.83:1）。
 *   ② 标题栏左上角的 6px 分类色小方块**取消**（绘制在 xh_ui_kit.js；本文件仍保留
 *      __xhCatHex 作为家族身份链标记， 但不再用于任何显示）。
 *
 * 🔴 2026-11-17 更新：午夜蓝那条已被「主题预设」取代（见下方注释）。
 *   「经典黑金」预设原本也用午夜蓝 ⇒ 名不副实（金按钮配蓝标题），
 *   现已改成暖黑底 + 金色标题字，才是真正的黑金。
 *
 * 分工：
 *   · 标题栏 = 当前主题预设的标题色（全家族一个色，不再五花八门）
 *   · 顶部   = 无（2026-11-06 用户要求去掉黄/金线，标题栏排版全部交回官方）
 *   · 标题前 = 无（2026-11-08 取消小方块）
 *   · 主体   = 官方主题底色，仍跟随官方深/浅色切换（本次不动）
 */
//  主题预设化：标题栏色读所选预设（默认松绿）。
//  2026-11-19：经典黑金预设已删除 ⇒ 兜底从暖黑 #1A1613 改成松绿标题 #0D3527。
const _titleHex = () => { const t = _theme(); return t ? t.title() : "#0D3527"; };
const GRAPHITE_BODY_HEX  = "#262626";   // 节点主体（深色主题）
const GRAPHITE_BODY_LIGHT_HEX  = "#f2f2f2";   // 节点主体（浅色主题）

/**
 * 分类后缀 → 色。
 * 键 = CATEGORY 里 "XiaoHei/" 之后的全部（大小写不敏感）。
 * 新增分类忘了写这里 → 落到 DEFAULT_HEX，不会炸。
 */
/**
 * 分类后缀 → 色。
 *  2026-10-29 **整体降饱和**：原来这 10 个色饱和度太高（天蓝/品红/青绿/草绿/番茄红都很跳），
 *    加上家族品牌色（琥珀金）之后会"两个都抢"。
 *    ⇒ 分类色退到**背景层**（降饱和、仍能一眼分辨类型），品牌色升为**前景层**（唯一的记号）。
 *    色相不变（还是天蓝/靛蓝/…），只是压暗降艳；标题字仍按对比度自动黑/白。
 */
const CATEGORY_HEX = {
  //  键名必须与**前端真实看到的分类后缀**一致（实测 123 个 XiaoHei 节点，见下）。
  //    ComfyUI 前端会把 CATEGORY 本地化：Python 里的 "Image"/"Video"
  //     在前端变成 **"图像"/"视频"** ⇒ 之前写英文键 ⇒ 一个都匹配不上 ⇒ 全落兜底色
  //     （"按分类"模式其实**从来没分对过色**，这是"五花八门"的隐藏根因）。
  //
  //   实测前端真实分类（123 个节点，Playwright 直读 registered_node_types）：
  //     XiaoHei/视频(32) XiaoHei/图像(15) XiaoHei/工具(28) XiaoHei/链提示词(3)
  //     XiaoHei/循环(5) XiaoHei/音频(2) XiaoHei/音频分离(2) XiaoHei/音频工具(1)
  //     XiaoHei/数学(1) XiaoHei/Identity(1) XiaoHei/Model(2) XiaoHei/Control(1)
  //     XiaoHei/SetGet(4) XiaoHei/导演台(1)
  //     （另有 MiniMax H3/* 与 模型/条件/minimax 等**不带 XiaoHei 前缀**的分类）
  "工具":        "#7C8798",  // 石板灰蓝 —— 万能杂项
  "图像":        "#4A93C4",  // 天蓝 —— 图像处理
  "视频":        "#5F77C4",  // 靛蓝 —— 视频处理
  "SetGet":      "#A47355",  // 咖啡棕 —— 变量中转
  "Identity":    "#8C9752",  // 橄榄 —— 身份保持
  "音频":        "#CC6E9C",  // 品红 —— 音频
  "提示词":       "#6BA35A",  // 草绿 —— 提示词链
  "数学":        "#C4635D",  // 番茄红 —— 数值运算
  "循环":        "#6E8FA8",  // 灰蓝 —— 循环控制
  "导演台":       "#B08A5E",  // 沙棕 —— 导演台
  "Model":       "#8F7FB8",  // 淡紫 —— 模型
  "Control":     "#5F9E7E",  // 松绿 —— 控制
};

/** 兜底色（未登记的分类）。 */
const DEFAULT_HEX = "#6E7889";

const CATEGORY_PREFIX = "XiaoHei";

// ═══════════════════════════════════════════════════════════
// ② 模式读取
// ═══════════════════════════════════════════════════════════

const SETTING_ID = "XH.Brand.ColorMode";
//  2026-10-29 新增「统一石墨」模式（用户拍板的方案 B：全家族一个标题色 + 琥珀顶线）
const MODES = ["统一石墨", "按分类", "统一色", "关闭"];
const MODE_GRAPHITE = "统一石墨";

function readMode() {
  try {
    const v = app.ui?.settings?.getSettingValue?.(SETTING_ID);
    if (v && MODES.includes(v)) return v;
  } catch (e) { /* 设置存储还没准备好，用默认 */ }
  //  2026-10-29：默认改成「统一石墨」（用户拍板：默认全家族统一一个颜色，
  //    不要五花八门）。老用户存的旧值（按分类/统一色/关闭）仍照旧生效。
  return MODE_GRAPHITE;
}

/**
 * 特殊分类别名 → 标准分类键。
 *  2026-10-29：实测有 22 个 XiaoHei 节点的分类**不带「XH」前缀**，分类名也不统一
 *   （MiniMax H3/Long Video、MiniMax H3/Internal、模型/条件/minimax …）
 *   ⇒ 统一归到已有分类，保证小方块颜色有意义。
 */
const CATEGORY_ALIAS = {
  "long video": "视频",
  "internal": "工具",
  "presets": "工具",
  "loop": "循环",
  "条件/minimax": "Model",
  "minimax-h3": "视频",
  "minimax h3": "视频",
};

/** 分类后缀 → 亮色 hex。 */
function hexForCategory(cat) {
  if (!cat) return DEFAULT_HEX;
  const m = String(cat).split("/");
  const suffix = (m.length > 1 ? m.slice(1).join("/") : m[0]).trim().toLowerCase();
  if (!suffix) return DEFAULT_HEX;
  //  2026-10-29：先过别名表（MiniMax H3/* 等不带 XiaoHei 前缀的分类）
  if (CATEGORY_ALIAS[suffix]) return CATEGORY_HEX[CATEGORY_ALIAS[suffix]] || DEFAULT_HEX;
  // 「MiniMax H3/Long Video/Loop」这类多级后缀 ⇒ 取第一段再试
  const firstSeg = suffix.split("/")[0].trim();
  if (firstSeg && CATEGORY_ALIAS[firstSeg]) return CATEGORY_HEX[CATEGORY_ALIAS[firstSeg]] || DEFAULT_HEX;
  for (const k of Object.keys(CATEGORY_HEX)) {
    if (k.toLowerCase() === suffix) return CATEGORY_HEX[k];
  }
  // 兜底：后缀里含某个键名（"XiaoHei/音频工具" 也含 "音频"）
  //  必须**按后缀长度倒序**匹配，否则 "音频工具" 会先被 "音频" 抢走 ⇒ 颜色错。
  const keys = Object.keys(CATEGORY_HEX).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (suffix.includes(k.toLowerCase())) return CATEGORY_HEX[k];
  }
  return DEFAULT_HEX;
}

/** 节点是否属于 XiaoHei 家族。 */
export function isXHNode(node) {
  if (!node) return false;
  const cat = String(node.constructor?.category || node.category || "");
  if (cat.startsWith(CATEGORY_PREFIX)) return true;
  const t = String(node.type || node.comfyClass || "");
  return t.startsWith("XiaoHei") || t.startsWith("XH");
}

// ═══════════════════════════════════════════════════════════
// ③ 上色
// ═══════════════════════════════════════════════════════════

function darken(hex, f) {
  const m = String(hex || "").replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(v)) return hex;
  const r = Math.round(parseInt(v.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(v.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(v.slice(4, 6), 16) * f);
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

/**
 * 给一个节点铺自动色。
 * @returns true = 本次真的上了色
 */
export function applyAutoColor(node, mode) {
  if (!node || mode === "关闭") return false;
  if (node.color) return false;              // 守卫：存档色 / 用户选色优先
  const cat = String(node.constructor?.category || node.category || "");

  //  默认模式（2026-11-08 改）
  //   标题栏 = 当前主题预设的标题色， 不按官方浅色 surface 走（用户「不用官方的那个」）
  //   主体   = 官方主题底色，仍随深浅主题切换
  //   __xhCatHex = 只作家族身份链标记， 不再绘制小方块
  if (mode === MODE_GRAPHITE) {
    const light = _isLightThemeSafe();
    const title = _titleHex();
    const body  = light ? GRAPHITE_BODY_LIGHT_HEX  : GRAPHITE_BODY_HEX;
    node.color = title;
    node.bgcolor = body;
    node.__xhAutoColorHex = title;
    node.__xhCatHex = hexForCategory(cat);   // 只作身份链标记，不显示
    node.__xhUnified = true;
    return true;
  }

  const hex = mode === "统一色" ? _uniformHex() : hexForCategory(cat);
  if (!hex) return false;
  node.color = hex;
  node.bgcolor = darken(hex, 0.42);
  node.__xhAutoColorHex = hex;                // 记下「这色是我们上的」
  node.__xhCatHex = hex;                      // 只作身份链标记，不显示
  node.__xhUnified = false;
  return true;
}

/** 浅色主题判断（不依赖 kit，避免循环 import）。 */
function _isLightThemeSafe() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const v = (cs.getPropertyValue("--node-component-header-surface") || "").trim();
    if (!v) return false;
    const m = /rgba?\(([^)]+)\)/.exec(v);
    if (!m) return /^#e|^#f/i.test(v);
    const p = m[1].split(",").map((x) => parseFloat(x));
    return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 > 0.5;
  } catch (e) { return false; }
}


/** 撤销「我们上的色」（只撤自动色，用户自己选的不动）。 */
function stripAutoColor(node) {
  if (!node || !node.__xhAutoColorHex) return false;
  if (node.color === node.__xhAutoColorHex) {
    node.color = undefined;
    node.bgcolor = undefined;
  }
  node.__xhAutoColorHex = null;
  node.__xhCatHex = null;
  node.__xhUnified = false;
  return true;
}

/** 把某个节点刷成当前模式该有的样子。 */
export function refreshNode(node, mode) {
  if (!isXHNode(node)) return;
  const m = mode || readMode();
  stripAutoColor(node);
  if (m === "关闭") return;
  const didAuto = applyAutoColor(node, m);
  //  ⚠️ 2026-11-12 修复回归：installTitleAutoColor 原本被上面的
  //    `if (!applyAutoColor(node, m)) return` 挡掉；而 applyAutoColor 以
  //    `if (node.color) return false` 跳过「手动选色 / 存档色」节点 ——
  //    导致这类节点的标题动态黑/白配色没挂上，浅底节点顶部字看不清。
  //    ⇒ 标题字"看得清"是底线，与 refreshVueTitles 一样无条件执行。
  try { installTitleAutoColor(node); } catch (e) {}
  try { installUnifiedTitleBar(node, node.__xhCatHex); } catch (e) {}
  try { refreshVueTitles(); } catch (e) {}
  if (!didAuto) return;   // 手动选色 / 存档色 ⇒ 不重上色、不重排画布（避免误标"已修改"）
  // 加载工作流期间绝不碰 graph.change() —— 那会把刚载入的干净工作流标成「已修改」。
  if (!isGraphLoading()) {
    try { node.graph && typeof node.graph.change === "function" && node.graph.change(); } catch (e) {}
  }
  try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/** 刷新全画布的 XiaoHei 节点。 */
export function refreshAllXHNodes(mode) {
  const g = app.canvas?.graph;
  if (!g) return;
  const m = mode || readMode();
  for (const n of g._nodes || []) refreshNode(n, m);
}

// ═══════════════════════════════════════════════════════════
// ④ 官方钩子：节点定义注册时包一层 onNodeCreated
// ═══════════════════════════════════════════════════════════

app.registerExtension({
  name: "XH.BrandColors",

  beforeRegisterNodeDef(nodeType, nodeData) {
    const cat = nodeData?.category
      ?? nodeType?.category
      ?? nodeType?.prototype?.category
      ?? "";
    //  2026-10-29 修「22 个 XiaoHei 节点从来没上过色」：
    //   之前只认 CATEGORY 前缀「XH」⇒ 但实测有 22 个 XiaoHei 节点的分类是
    //   「MiniMax H3/Long Video」「模型/条件/minimax」「MiniMax-H3」等**不带该前缀**的
    //   （实测清单见 xh_cats.js）⇒ 它们的 onNodeCreated 被跳过 ⇒ 标题栏保持官方默认色。
    //   ⇒ 判定放宽：**类型名以 XiaoHei 开头**也算家族节点。
    //  类型名在 nodeData.comfyClass；nodeType.name 是 "ComfyNode"（不是类型名！实测）
    const isXhType = /^XiaoHei/.test(String(nodeData?.comfyClass ?? nodeType?.comfyClass ?? ""));
    if (typeof cat !== "string" || (!cat.startsWith(CATEGORY_PREFIX) && !isXhType)) return;

    const orig = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function (...args) {
      const ret = orig?.apply(this, args);
      //  2026-11-06 全量收口：家族身份标记 + 标题栏刷新**无条件**执行。
      //   原来这两件事被包在 `mode !== "关闭" && applyAutoColor(...)` 里面 ——
      //   用户一旦把配色设成「关闭」，或上色返回 false，整条链就不跑：
      //   节点没标记 ⇒ 反查认不出 ⇒ 标题字不加粗；DOM 也不刷新。
      //   ⇒ 这就是「有的节点改了、有的没改」的另一半根因。
      try { this.__xhFamily = true; } catch (e) {}
      try { refreshVueTitles(); } catch (e) {}
      try {
        const mode = readMode();
        //  标题字自动黑白：canvas 模式（drawTitleText）+ Nodes 2.0 模式（DOM）。
        //  ⚠️ 2026-11-12 修复回归：原本被 `if (mode!=="关闭" && applyAutoColor(...))` 包住；
        //    applyAutoColor 以 `if (node.color) return false` 跳过手动选色/存档色节点，
        //    ⇒ 这类节点标题动态配色没挂上（浅底看不清）。现与 refreshVueTitles 一样无条件挂。
        if (mode !== "关闭") {
          try { applyAutoColor(this, mode); } catch (e) {}
        }
        try { installTitleAutoColor(this); } catch (e) {}
        try { installUnifiedTitleBar(this, this.__xhCatHex); } catch (e) {}
      } catch (e) { /* 上色失败绝不能影响节点创建 */ }
      return ret;
    };
  },

  async setup() {
    try { installVueTitleAutoColor(); } catch (e) {}

    //  2026-11-17 主题预设切换 ⇒ 重刷全家族节点标题栏。
    //    refreshNode 内部 stripAutoColor 会先撤掉「我们上的色」再按新预设重铺，
    //    手动选色/存档色的节点（node.color 有值且非 __xhAutoColorHex）不会被碰。
    try {
      document.addEventListener("xh-theme-preset-change", () => {
        setTimeout(() => { try { refreshAllXHNodes(); } catch (e) {} }, 20);
      });
    } catch (e) {}

    // 注册设置项
    try {
      const S = app.ui && app.ui.settings;
      if (S && typeof S.addSetting === "function" && !app._xhBrandSetting) {
        app._xhBrandSetting = true;
        S.addSetting({
          id: SETTING_ID,
          name: "节点配色",
          type: "combo",
          // 2026-11-17：默认模式标题栏走主题预设色，分类小方块已取消；模式名沿用「统一石墨」以免破坏已存设置值
          defaultValue: MODE_GRAPHITE,
          options: MODES,
          tooltip: "XiaoHei 节点的默认配色。统一石墨=全家族标题栏同一个色（跟当前主题预设走，经典黑金=暖黑底金字）；按分类=每类一个色系；统一色=全家族同色；关闭=不上色。只影响没设过颜色的节点，你自己选过的色不会被覆盖。",
          category: ["XiaoHei", "外观", "节点配色"],
          //  2026-10-29：组间顺序只认 sortOrder（降序）+ 组名拼音。
          //    「外观」不写这个就会按拼音排到「连线」后面（wai > lian）⇒ 掉到最底。
          //    与顶栏那 4 项同组 ⇒ 必须写**同一个值**（表在 xh_about.js 的 window.XH_GROUP_ORDER）。
          sortOrder: ((typeof window !== "undefined" && window.XH_GROUP_ORDER && window.XH_GROUP_ORDER.appearance) || 90),
          onChange: (value) => {
            const m = MODES.includes(value) ? value : MODE_GRAPHITE;
            setTimeout(() => refreshAllXHNodes(m), 30);
          },
        });
      }
    } catch (e) {
      console.error("[XiaoHei.Brand] 设置项注册失败：", e);
    }
  },
});
