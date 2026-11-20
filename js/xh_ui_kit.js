//  2026-11-11：顶栏四颗按钮的图案统一走自家图标库（唯一真源、零硬编码路径）。
import { xhIconUrl } from "./xh_icons/index.mjs";
//  2026-11-20：家族按钮按压反馈（全家族唯一真源），顶层调一次 ⇒ 页面加载即全局注入，
//  画布上有没有提示词节点都生效。定义见 shared/button_press.mjs。
import { installFamilyButtonPress } from "./shared/button_press.mjs";
try { installFamilyButtonPress(); } catch (e) {}

//  XiaoHei 家族 UI 套件 —— 家族 UI 规范的**唯一实现**，所有 xh_*.js 共用
//
// 规范（2026-10-01 定稿，取自 xh_tone.js）：
//   ① 语言桥：window.XH_LANG 做成 accessor —— 任何地方赋值都会
//      a) 写 localStorage(xh_node_lang)  b) 广播 `xh:lang-changed` 事件
//      ⇒ 全家族节点语言状态同步（点一个节点上的 中/EN，所有 XiaoHei 节点一起切）
//   ② 标准工具条：36×22 的「中/EN」按钮（中=#8a8a8a / EN=#c0392b）
//      （2026-10-28 起  配色键已删 → 配色统一走节点右键的完整画板）
//   ③ 颜色块：XiaoHei 家族 12 色 + 自定义取色器（写 node.color / node.bgcolor）
//   ④ 工具条走 addDOMWidget({serialize:false})，绝不进工作流 JSON
//   ⑤ 节点框上色后，标题栏底色是亮色 → 标题文字按底色自动切黑/白（installTitleAutoColor）
//
// 用法：
//   import { ensureLangBridge, makeXHToolbar, onLangChanged } from "./xh_ui_kit.js";
//   ensureLangBridge();                      // 文件顶部，早于任何 window.XH_LANG 使用
//   // onNodeCreated 里： makeXHToolbar(this);
//   // setup 里：          onLangChanged(() => applyLangToAll());
//
// 铁律：只改 label / title，绝不改 name；绝不改 COMBO 的 values；DOM 只 append 不乱插。
const { app } = window.comfyAPI.app;
export const XH_LANG_KEY = "xh_node_lang";

// ---- ⓪ 主题判定：**亮度比较法**（2026-10-29，抄 Pixaroma shared/light_theme.mjs）----
//  别用 `body.classList.contains("theme-light")` / `html.dataset.theme` 这类标志位：
//    ComfyUI 官方根本不写这两个（实测），旧代码这么判 ⇒ lightTheme 恒 false
//    ⇒ 浅色主题下标题栏不做 lighten、颜色对不上官方。
//  也别用 `prefers-color-scheme`（那是**操作系统**偏好，不是 ComfyUI 主题）。
//  只认调色板自己写出来的颜色：`<html>` 的 --bg-color vs --fg-color 比亮度（无阈值）。
//   拿不到 → 只比 body 的**背景**；再拿不到 → 深色（本包按深色画的）。
//  与 xh_settings_panel.js 的 officialTheme() 是**同一套算法的两份拷贝**
//    （本文件加载更晚，那边不能依赖这边）。改一处必须同步改另一处。
export function xhParseCssColor(s) {
    s = String(s || "").trim();
    if (!s) return null;
    if (s[0] === "#") {
        const h = s.slice(1);
        if (h.length !== 6 && h.length !== 8) return null;
        if (!/^[0-9a-f]+$/i.test(h)) return null;
        const n = (i) => parseInt(h.slice(i, i + 2), 16);
        return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
    const m = /rgba?\(([^)]+)\)/i.exec(s);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((v) => !isFinite(v))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
export function xhLuminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function xhIsLightTheme() {
    try {
        const hs = getComputedStyle(document.documentElement);
        const bg = xhParseCssColor(hs.getPropertyValue("--bg-color"));
        const fg = xhParseCssColor(hs.getPropertyValue("--fg-color"));
        if (bg && fg) return xhLuminance(bg) > xhLuminance(fg);
        if (document.body) {
            const bbg = xhParseCssColor(getComputedStyle(document.body).backgroundColor);
            if (bbg && bbg[3] > 0.5) return xhLuminance(bbg) > 0.5;
        }
    } catch (e) { /* 落到兜底 */ }
    return false;
}
if (typeof window !== "undefined") window.XH_isLightTheme = xhIsLightTheme;

export function currentLang() {
    return window.XH_LANG || "zh";
}

// ---- ① 语言桥（幂等：已有 accessor 就直接返回）----
export function ensureLangBridge() {
    let cur = "zh";
    try { cur = localStorage.getItem(XH_LANG_KEY) || window.XH_LANG || "zh"; } catch (e) { cur = window.XH_LANG || "zh"; }
    try {
        const d = Object.getOwnPropertyDescriptor(window, "XH_LANG");
        if (d && (d.get || d.set)) return false;      // 已被别的家族文件装过
        let _l = cur;
        Object.defineProperty(window, "XH_LANG", {
            get: () => _l,
            set: (v) => {
                _l = v;
                try { localStorage.setItem(XH_LANG_KEY, v); } catch (e) {}
                window.dispatchEvent(new CustomEvent("xh:lang-changed", { detail: { lang: v } }));
            },
            configurable: true,
            enumerable: true,
        });
        return true;
    } catch (e) {
        window.XH_LANG = cur;
        return false;
    }
}

export function toggleLang() {
    window.XH_LANG = currentLang() === "zh" ? "en" : "zh";
    return window.XH_LANG;
}

// ---- ③ 家族 12 色 + 自定义取色器 ----
export const XH_PALETTE = [
    { zh: "番茄红", en: "Tomato", hex: "#D64541" },
    { zh: "南瓜橙", en: "Orange", hex: "#E07B39" },
    { zh: "金黄", en: "Gold", hex: "#DCA02B" },
    { zh: "草绿", en: "Green", hex: "#4BA14B" },
    { zh: "青绿", en: "Teal", hex: "#17A2A2" },
    { zh: "天蓝", en: "Sky", hex: "#8a8a8a" },
    { zh: "靛蓝", en: "Indigo", hex: "#5A6FD8" },
    { zh: "紫", en: "Purple", hex: "#9B59D0" },
    { zh: "品红", en: "Magenta", hex: "#DE4FA3" },
    { zh: "咖啡棕", en: "Brown", hex: "#A0674A" },
    { zh: "橄榄", en: "Olive", hex: "#7E8C3A" },
    { zh: "石板灰", en: "Slate", hex: "#8a8a8a" },
];

export function darkenHex(hex, f) {
    const m = String(hex || "").replace("#", "");
    const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
    if (v.length < 6) return hex;
    const r = Math.round(parseInt(v.slice(0, 2), 16) * f);
    const g = Math.round(parseInt(v.slice(2, 4), 16) * f);
    const b = Math.round(parseInt(v.slice(4, 6), 16) * f);
    return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

export function applyNodeColor(node, hex) {
    //  2026-10-13 修复「点默认没反应」：原来用 delete node.color / delete node.bgcolor。
    //   Vue Nodes 模式下 delete 不触发响应式重渲染（赋值才触发）⇒ 界面纹丝不动；
    //   而选颜色（赋值）一直有效，正好对上用户实测「颜色能上、默认收不回」。
    //   改成显式赋 undefined：LiteGraph 判 falsy 走默认色、序列化时 undefined 被丢弃，等价于删掉。
    if (!hex) { node.color = undefined; node.bgcolor = undefined; }
    else { node.color = hex; node.bgcolor = darkenHex(hex, 0.42); }
    // 发一次图变更事件：Vue 前端靠它把 node 颜色同步进响应式 store（canvas 模式无害）
    try { node.graph && typeof node.graph.change === "function" && node.graph.change(); } catch (e) {}
    installTitleAutoColor(node);   // 兜底：没走 makeXHToolbar 的调用方也能有清晰标题字
    refreshVueTitles();            // Vue 节点：DOM 标题栏也要跟着换字色
    syncVueNodeColorDom(node);     // Vue 节点兜底：清/写标题栏容器 inline 背景色（防 Vue 不重渲染）
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/**
 * Vue Nodes 的标题栏背景兜底（2026-10-13）。
 * 标题栏底色挂在 .lg-node → .lg-node-header 之间某个带 inline background-color 的容器上。
 * 不管 Vue 有没有重渲染，这里直接按 node 当前颜色把 inline 背景对齐：
 *   node.color 有值 → 写成 applyLightThemeColor 同款亮色（深色主题原样、浅色主题 lighten）
 *   node.color 空  → 清空 inline 背景，交回主题默认
 * 幂等；找不到 DOM（canvas 模式）直接返回 false。
 */
function syncVueNodeColorDom(node) {
    if (!node || node.id === undefined || node.id === null) return false;
    let header = null;
    try { header = document.querySelector(`.lg-node-header[data-testid="node-header-${node.id}"]`); } catch (e) { return false; }
    if (!header) return false;
    const _lum = (h) => { const v = String(h || "").replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(v)) return null; const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((u) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    //  2026-10-29：原来是 `body.classList.contains("theme-light")||html.dataset.theme==="light"`，
    //    官方根本不写这两个 ⇒ 恒 false ⇒ 浅色主题下标题栏永远不 lighten。改用亮度比较法。
    const lightTheme = xhIsLightTheme();
    let touched = false;
    // 沿祖先链找第一个带 inline backgroundColor 的容器，最多 6 层（实测 1 层即中）
    let el = header.parentElement;
    for (let i = 0; i < 6 && el; i++) {
        const inline = el.style && el.style.backgroundColor;
        if (inline) {
            if (!node.color) {
                el.style.backgroundColor = "";   // 默认：清掉，交回主题
            } else {
                // 浅色主题下官方会 lighten(.5)；深色主题原样。粗略对齐官方 applyLightThemeColor。
                el.style.backgroundColor = lightTheme ? _lightenHex(node.color, 0.5) : node.color;
            }
            touched = true;
            break;
        }
        el = el.parentElement;
    }
    return touched;
}

/** 变亮：hex 每通道向 255 插值 t（0~1）。与官方 lighten 语义近似，仅供 DOM 兜底用。 */
function _lightenHex(hex, t) {
    const m = String(hex || "").replace("#", "");
    const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
    if (!/^[0-9a-f]{6}$/i.test(v)) return hex;
    return "#" + [0, 2, 4].map((i) => Math.round(parseInt(v.slice(i, i + 2), 16) + (255 - parseInt(v.slice(i, i + 2), 16)) * t).toString(16).padStart(2, "0")).join("");
}

// ---- ⑤ 标题栏文字自动黑/白（2026-10-05）----
//
// 背景：家族上色写的是 node.color = 用户选的**亮色**（标题栏底）、
//       node.bgcolor = darkenHex(hex, 0.42)（节点主体）。
//      而标题文字色由 LiteGraph 决定：
//         ctx.fillStyle = this.selected ? NODE_SELECTED_TITLE_COLOR
//                                       : (this.constructor.title_text_color || default_title_color)
//      其中 default_title_color 是画布主题色（深色主题 #999）—— 亮底压浅灰字，
//      实测家族 12 色的对比度只有 1.04~1.63（WCAG 要求 ≥ 4.5），必然看不清。
//
// 做法（不改 LiteGraph 绘制逻辑、零复刻）：包一层**实例**的 drawTitleText，
//   把入参 default_title_color 换成「按底色算出的黑/白」，其余原样交给官方实现。
//   · 前端源码实测 title_text_color 全项目**零赋值** ⇒ constructor 上是 undefined
//     ⇒ 入参永远生效，不必去改类级静态属性（也就不会波及其他节点）。
//   · 选中态走官方分支（NODE_SELECTED_TITLE_COLOR），原样不干预。
//   · low_quality（拖动中降质绘制）也放过，省掉一次无谓的重算。
//   · try/catch 兜底：前端哪天删了这个入参，最坏只是「回到老样子」，不会报错。
//
// 判据：黑字 / 白字取对比度大者 ⇒ max ≥ √21 = 4.58 > 4.5，对任意底色恒成立。
//    必须用纯 #000 / #fff：黑字若改成 #151515，数学下限掉到 4.32 就不保证了。
//    以后往 XH_PALETTE 加新色也**不用调任何阈值** —— 判据自带保证。

function _srgbToLinear(u8) {
    const c = u8 / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 相对亮度（0~1）；色值非法返回 null。支持 #abc / #aabbcc。 */
export function hexLuminance(hex) {
    const m = String(hex || "").replace("#", "").trim();
    const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
    if (!/^[0-9a-f]{6}$/i.test(v)) return null;
    return 0.2126 * _srgbToLinear(parseInt(v.slice(0, 2), 16))
        + 0.7152 * _srgbToLinear(parseInt(v.slice(2, 4), 16))
        + 0.0722 * _srgbToLinear(parseInt(v.slice(4, 6), 16));
}

/**
 *  2026-10-28：给定底色，返回**对比度最高的深/浅字色**（用于「主色实心底」上的文字）。
 * WCAG：对比度(黑)=(L+.05)/.05，对比度(白)=1.05/(L+.05)，取大的；
 * 两个都 < 4.5 ⇒ 用官方墨色 #1c1c1c（比纯黑柔和，亮底上最稳）。
 */
export function pickOnColor(bgHex) {
    const L = hexLuminance(bgHex);
    if (L === null) return "#1c1c1c";
    const onBlack = (L + 0.05) / 0.05;
    const onWhite = 1.05 / (L + 0.05);
    if (onBlack >= onWhite) return onBlack >= 4.5 ? "#000000" : "#1c1c1c";
    return onWhite >= 4.5 ? "#ffffff" : "#1c1c1c";
}

/** 给定底色，返回对比度更高的标题文字色（#000000 / #ffffff）；判断不了返回 null。 */
export function pickTitleTextColor(bgHex) {
    const L = hexLuminance(bgHex);
    if (L === null) return null;
    const onBlack = (L + 0.05) / 0.05;
    const onWhite = 1.05 / (L + 0.05);
    return onBlack >= onWhite ? "#000000" : "#ffffff";
}

/**
 * 让「标题栏底色 ↔ 标题文字色」始终看得清。**幂等**；makeXHToolbar 已自动调用。
 * 只作用于传进来的这一个节点实例：不碰类原型、不影响别的节点、不进工作流 JSON。
 * @returns true = 本次挂上了
 */
export function installTitleAutoColor(node) {
    if (!node || node.__xhTitleAuto) return false;
    const proto = Object.getPrototypeOf(node);
    if (!proto || typeof proto.drawTitleText !== "function") return false;
    const orig = node.drawTitleText;          // 原型上的官方实现
    node.drawTitleText = function (ctx, opts) {
        try {
            const o = opts || {};
            if (!o.low_quality && !this.selected) {
                // 🔴 2026-11-17：主题指定了标题字色时（classic = 黑底金字）优先用主题色，
                //   自动黑白会把金色刷成白字，黑金就白做了。
                const want = _xhThemeTitleFg(this.color) || pickTitleTextColor(this.color);
                if (want) {
                    return orig.call(this, ctx, Object.assign({}, o, { default_title_color: want }));
                }
            }
        } catch (e) { /* 出任何岔子就落回官方绘制 */ }
        return orig.call(this, ctx, opts);
    };
    node.__xhTitleAuto = true;
    return true;
}

// ---- ⑥ Vue Nodes（Nodes 2.0）标题栏文字自动黑/白（2026-10-05 浏览器实测后补）----
//
// 背景：Comfy.VueNodes.Enabled = true 时 LiteGraph.vueNodesMode 为 true，
//   **canvas 完全不绘制节点**（⑤ 那套 drawTitleText 一次都不会被调用），
//   节点改由 Vue 组件渲染成 DOM。实测结构（headless Chromium 直读）：
//     .graph-canvas-container
//       └ div[style: transform scale/translate]                    ← 视图缩放层
//         └ div.lg-node[style: transform: translate(x,y); z-index]  ← 节点根
//           └ div[style: background-color: rgb(220,160,43)]         ← 标题栏底色 = node.color（亮色）
//             └ div
//               └ div.lg-node-header[data-testid="node-header-<id>"]
//                      class 里带 text-node-component-slot-text，**没有任何 inline style**
//
//   标题栏**背景** = 那颗 inline background-color（用户选的亮色）；
//   标题文字的**颜色**只由 class 决定 → var(--node-component-slot-text)：
//   深色主题 = smoke-700 = rgb(160,160,160)、浅色主题 = ash-800。
//   ⇒ 亮底压中灰字，实测对比度 1.04~1.63（WCAG 要 ≥ 4.5），必然看不清。
//
// 做法：`.lg-node-header` 上没有 style 绑定（Vue patch 不会擦掉它），
//   所以**直接给它设 inline color** 最稳：沿祖先链找第一个不透明背景色 →
//   用 WCAG 取对比度更高的纯黑/纯白 → 写进 style.color。
//   用 MutationObserver 兜住所有节点（新建 / 加载 / 重渲染 / 上色都会触发），rAF 节流。
//
//  为什么不去读 node.color：浅色主题下 ComfyUI 会先把颜色 lighten(.5) 再上图，
//   读 DOM 的**真实**背景色才不会猜错（也不依赖它的内部实现）。
//  ⑤（canvas 那套）保留互补：关掉 Vue Nodes 后 drawTitleText 会恢复被调用。

export const XH_VUE_HEADER_SEL = ".lg-node-header";

/** 沿祖先链找第一个不透明背景色，返回 "#rrggbb"；找不到返回 null。 */
function _xhOpaqueBg(el) {
    let e = el;
    for (let i = 0; i < 8 && e; i++) {
        let bg = "";
        try { bg = getComputedStyle(e).backgroundColor || ""; } catch (err) { break; }
        const m = /rgba?\(([^)]+)\)/.exec(bg);
        if (m) {
            const p = m[1].split(",").map((x) => parseFloat(x));
            const a = p.length > 3 ? p[3] : 1;
            if (a > 0.5) {
                return "#" + p.slice(0, 3)
                    .map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
            }
        }
        e = e.parentElement;
    }
    return null;
}

/** "rgb(r,g,b)" / "#rrggbb" → "#rrggbb"；半透明或无解返回 null。 */
function _xhCssToHex(c) {
    const m = /rgba?\(([^)]+)\)/.exec(String(c || ""));
    if (!m) {
        const s = String(c || "").trim();
        // 🔴 2026-11-18：必须统一小写 —— 主题预设存的是 "#F0C070"（大写），
        //   computed style 转出来是 "#f0c070"（小写）。不归一化 ⇒ ours 判定失败
        //   ⇒ 切预设时误以为「这是作者自己设的色」⇒ 标题字卡在上一套主题不变。
        return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
    }
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length > 3 && p[3] < 0.5) return null;
    return "#" + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

/** WCAG 对比度（0~21）。 */
function _xhContrast(aHex, bHex) {
    const a = hexLuminance(aHex);
    const b = hexLuminance(bHex);
    if (a === null || b === null) return 0;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * 给单个标题栏元素上色。**最小干预**：原生字色对底色本来就看得清（≥4.5）就不碰它 ——
 * 没上过色的节点保持 ComfyUI 自己的观感，只有真看不清的才改成纯黑/纯白。
 * 幂等：值没变不写（避免 MutationObserver 自激）。
 *
 * ⚠️ 2026-11-12 修复：早期只给 `.lg-node-header` 本身设 color，但标题文字往往嵌在
 * 更深的子节点里、且子节点自带 color（如 slot-text 类），父级设色盖不过去 ⇒ 浅底时
 * 文字仍是官方浅灰、看不清。现下钻到**所有后代**一并落色（header 内的按钮/图标统一成
 * 标题色也合理），确保任意嵌套层级的文字都能被正确黑白化。
 */
/** 主题指定的标题字色（classic 预设 = 黑底金字）；没有 / 对比度不够 ⇒ 返回 null 走自动黑白。 */
function _xhThemeTitleFg(bgHex) {
    try {
        const t = (typeof window !== "undefined" ? window.XH_THEME : null);
        if (!t || typeof t.titleFg !== "function") return null;
        const fg = t.titleFg();
        if (!fg) return null;
        // 铁律：看得清优先 —— 主题字色对比度不足 4.5 就丢弃，回退自动黑白。
        if (bgHex && _xhContrast(bgHex, fg) < 4.5) return null;
        return fg;
    } catch (e) { return null; }
}

/**
 * 给单个标题栏元素上色。**最小干预**：原生字色对底色本来就看得清（≥4.5）就不碰它 ——
 * 没上过色的节点保持 ComfyUI 自己的观感，只有真看不清的才改成纯黑/纯白。
 * 幂等：值没变不写（避免 MutationObserver 自激）。
 *
 * ⚠️ 2026-11-12 修复：早期只给 `.lg-node-header` 本身设 color，但标题文字往往嵌在
 *   更深的子节点里、且子节点自带 color（如 slot-text 类），父级设色盖不过去 ⇒ 浅底时
 *   文字仍是官方浅灰、看不清。现下钻到**所有后代**一并落色（header 内的按钮/图标统一成
 *   标题色也合理），确保任意嵌套层级的文字都能被正确黑白化。
 *
 * 🔴 2026-11-17：主题指定了标题字色时（classic 预设 = 黑底金字 #F0C070），
 *   **必须用主题色而不是自动黑白** —— 自动黑白会把金色标题刷成白字，黑金就白做了。
 *   主题色仍受「对比度 ≥4.5」约束，不合格就回退自动黑白（看得清是底线）。
 *
 * @param el       标题栏元素
 * @param isFamily 是不是家族节点 —— 主题字色**只给家族节点**，
 *                 官方节点必须保持 ComfyUI 原生观感（⛔ 别把官方节点刷成金字）。
 */
export function paintVueHeader(el, isFamily) {
    if (!el || !el.style) return false;
    // 背景色探测容错：直接从 el 起，逐级向上（最多 8 层），仍失败再试父/祖父一层
    const bg = _xhOpaqueBg(el)
        || _xhOpaqueBg(el.parentElement)
        || _xhOpaqueBg(el.parentElement && el.parentElement.parentElement);
    if (!bg) return false;
    // 主题字色只对家族节点生效（官方节点不碰）
    const themed = isFamily ? _xhThemeTitleFg(bg) : null;
    const want = themed || pickTitleTextColor(bg);
    if (!want) return false;

    let changed = false;
    const apply = (t) => {
        if (!t || !t.style) return;
        //  统一小写再比（主题 hex 是大写，computed 是小写 —— 2026-11-18 踩过）
        if (t.dataset && String(t.dataset.xhTitleFg || "").toLowerCase() === String(want || "").toLowerCase()) return;
        // 已经看得清（≥4.5）的，不插手（保护非家族节点的原生观感）
        //  ⚠️ 主题字色是例外：它就是「标题该长什么样」的答案，不再走「看得清就别碰」
        //     （否则 classic 的黑底金字会被自动黑白刷成白字，黑金就白做了）。
        if (!themed) {
            try {
                const cur = getComputedStyle(t).color || "";
                const curHex = _xhCssToHex(cur);
                // 🔴 2026-11-17：当前字色是**上一次主题刷上去的**（标记与实际色一致）
                //   ⇒ 说明这是我们自己写的，可以放心覆盖成新的 want（切预设时回退）。
                //   官方原生色没有标记 ⇒ 看得清就别碰（保护原版观感）。
                const ours = !!(t.dataset && t.dataset.xhTitleFg && curHex
                    && _xhCssToHex(t.dataset.xhTitleFg) === curHex);
                if (!ours && curHex && _xhContrast(bg, curHex) >= 4.5) {
                    if (t.dataset) t.dataset.xhTitleFg = curHex;
                    return;
                }
            } catch (e) { /* 忽略，走落色兜底 */ }
        }
        try { t.style.color = want; if (t.dataset) t.dataset.xhTitleFg = want; changed = true; } catch (e) {}
    };

    apply(el);
    try {
        const kids = el.querySelectorAll ? el.querySelectorAll("*") : [];
        for (const k of kids) apply(k);
    } catch (e) { /* 单个失败不影响整体 */ }
    return changed;
}

let _xhVueRaf = 0;

/** 扫全画布刷新所有标题栏。rAF 合并 —— 连调多次只真正跑一次。 */
export function refreshVueTitles() {
    if (_xhVueRaf) return;
    const run = () => {
        _xhVueRaf = 0;
        //  2026-11-06：样式**无条件**注入。原来只在 paintVueUnifiedTitle 里调，
        //    而那个函数要「判定为家族节点」才会走到 —— 反查链一断，整包 CSS 都不进 DOM。
        //    ⇒ 用户刷新后看到「有的节点变了、有的没变」，就是这么来的。
        installXHFamilyTitleStyle();
        let list = [];
        try { list = document.querySelectorAll(XH_VUE_HEADER_SEL); } catch (e) { return; }
        for (const el of list) {
            //  🔴 2026-11-17：**先判家族再刷色** —— paintVueHeader 现在要知道
            //    「是不是家族节点」才能决定用不用主题字色（官方节点绝不能被刷成金字）。
            let isXiaoHei = false, cat = null;
            //  2026-10-29「统一石墨」：Nodes 2.0 也要金线 + 分类色小方块
            //    （旧画布由 installUnifiedTitleBar 负责；两模式表现必须一致）
            //  2026-11-06：判据 = 「是不是家族节点」，不是「有没有分类色」
            //    （配色「关闭」时 __xhCatHex=null，按色判断会整片失效）。
            try {
                const info = _xhCatHexOfDom(el);
                isXiaoHei = !!info.isXH;
                cat = info.cat;
            } catch (e) { /* 忽略，走文本兜底 */ }
            //  文本兜底（零依赖）：家族识别主锚点是 CATEGORY 前缀「XiaoHei」（见 xh_brand.js
            //    CATEGORY_PREFIX），以及 class_type 的「XH_」前缀（底层类型名未改）。节点标题已不再
            //    带品牌前缀，故这里仅作最后的宽松兜底；真正可靠的是上面的 _xhCatHexOfDom + 第三重
            //    data-xh-family 属性（子图 / Vue 重渲染时仍认得出来）。
            if (!isXiaoHei) {
                try { isXiaoHei = /\s*XH|XiaoHei-|XiaoHei/.test(el.textContent || ""); } catch (e) {}
            }
            //  第三重兜底（2026-11-08 改）：有些家族节点把 this.title 设成空串
            //    （XiaoHei-标签 就是 this.title = ""），文本判据必漏；但只要之前成功认过一次，
            //    节点根上就留着 data-xh-family="1"（Vue 只 patch 自己的 class，不擦 data-*）
            //    ⇒ 照样认得出来。 分类小方块 .xh-cat-dot 已取消，不能再拿它当判据。
            //  2026-11-13 修：原来三处都写成未定义的 `isXH` ⇒ 每次刷新标题栏必抛
            //    ReferenceError，整轮 run() 被拦腰截断，标题栏加粗 / 金线全都不生效。
            //    这里也改成「只在还没认出来时补认」，不能用 data-* 结果覆盖掉上面已判定的 true。
            if (!isXiaoHei) {
                try {
                    const r = el.closest?.(".lg-node") || el.closest?.("[data-node-id]");
                    isXiaoHei = r?.dataset?.xhFamily === "1";
                } catch (e) {}
            }
            if (isXiaoHei) {
                //  🔴 2026-11-17：判定完成后再刷字色 —— 家族节点才吃主题字色。
                try { paintVueHeader(el, true); } catch (e) { /* 单个失败不带翻整轮 */ }
                // 身份写到**节点根**：Vue 只 patch 自己绑定的 class，不会擦掉自定义 data-*。
                // 这样即便 header 被重建、class 丢了，加粗 CSS 依然命中。
                try {
                    const root = el.closest?.(".lg-node") || el.closest?.("[data-node-id]");
                    if (root && root.dataset) root.dataset.xhFamily = "1";
                } catch (e) { /* noop */ }
                try { paintVueUnifiedTitle(el, cat); } catch (e) { /* 装饰失败不影响节点 */ }
            } else {
                // 官方节点：仍做「看得清」修复（官方标题字色对比度不足时的兜底），
                // 但**不吃主题字色**（isFamily=false ⇒ 只走自动黑白）。
                try { paintVueHeader(el, false); } catch (e) { /* 单个失败不带翻整轮 */ }
            }
        }
    };
    try { _xhVueRaf = requestAnimationFrame(run); } catch (e) { run(); }
}

/**
 * 从 DOM 元素反查它对应的节点，返回 { isXH, cat }。
 * 依据：Vue 节点根 div 带 data-node-id（实测官方模板 `:data-node-id="nodeData.id"`）。
 *  2026-11-06：isXiaoHei 和 cat **必须分开** —— 配色「关闭」时 cat=null，
 *    但节点仍是家族节点，标题栏对齐 / 加粗照样要做。
 */
function _xhCatHexOfDom(el) {
    try {
        const root = el.closest ? el.closest("[data-node-id]") : null;
        let id = root && root.getAttribute("data-node-id");
        // 官方 NodeHeader 根 div 自带 data-testid="node-header-<id>"（源码实证
        // GraphView-*.js 的 NodeHeader 模板），比 closest 更直接，子图里也不会丢。
        if (id === null || id === undefined) {
            const m = /node-header-(.+)$/.exec(el.getAttribute?.("data-testid") || "");
            if (m) id = m[1];
        }
        if (id === null || id === undefined) return { isXH: false, cat: null };
        //  ComfyUI 1.57 的 node.id 是**字符串**（实测 "72"），老版本是数字 ⇒ 两种都要比
        //  2026-11-06：app 挂载点有多个版本，全试一遍；nodes 容器 _nodes / nodes 都认。
        const A = window.app || window.comfyAPI?.app?.app;
        const g = A?.canvas?.graph || A?.graph || window.graph;
        if (!g) return { isXH: false, cat: null };
        const nid = Number(id);
        const nodes = g._nodes || g.nodes || [];
        for (const nd of nodes) {
            if (!nd) continue;
            if (nd.id === id || nd.id === nid || String(nd.id) === String(id)) {
                return { isXH: _xhIsFamilyNode(nd), cat: nd.__xhCatHex || null };
            }
        }
    } catch (e) { /* 忽略 */ }
    return { isXH: false, cat: null };
}

/** 家族节点判定：类名 / 标题前缀 / 已写过 __xhCatHex 标记，任一命中即可。 */
function _xhIsFamilyNode(nd) {
    try {
        const cls = String(nd.comfyClass || nd.type || "");
        if (/^XH|XH[-_]/i.test(cls)) return true;
        const t = String(nd.title || "");
        if (/\s*XH|XiaoHei-/i.test(t)) return true;
        if (Object.prototype.hasOwnProperty.call(nd, "__xhCatHex")) return true;
        // 2026-11-06：品牌扩展在 onNodeCreated 里无条件写的家族身份标记，
        // 标题被改名 / 配色设为「关闭」时也照样在 ⇒ 反查链最后的保险。
        if (nd.__xhFamily === true) return true;
        return false;
    } catch (e) { return false; }
}

let _xhVueObserver = null;

/**
 * 幂等：给 Vue Nodes 的标题栏挂上自动配色。makeXHToolbar 会自动调用。
 * 返回 true = 本次挂上了（Vue 模式）；false = 已挂过或环境不支持（canvas 模式）。
 */
export function installVueTitleAutoColor() {
    if (_xhVueObserver) { refreshVueTitles(); return false; }
    const host = (() => {
        try { return document.getElementById("graph-canvas-container") || document.body; } catch (e) { return null; }
    })();
    if (!host) return false;
    try {
        _xhVueObserver = new MutationObserver(() => refreshVueTitles());
        _xhVueObserver.observe(host, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ["class", "style"],
        });
    } catch (e) { _xhVueObserver = null; return false; }
    refreshVueTitles();
    return true;
}

/**
 * 通用取色弹窗（家族唯一实现）—— XiaoHei 12 色 + 自定义取色器 + 「默认」项。
 * **只管弹窗和取色，不碰任何状态**：选中后一律回调 onPick(hex)。
 *
 * @param anchorBtn 锚点按钮（弹窗对齐它）
 * @param opts.id             弹窗 DOM id（默认 xh_palette_pop；同一时刻同名只留一个）
 * @param opts.current        当前色，用于给已选项加高亮描边
 * @param opts.onPick         (hex) 选中回调
 * @param opts.resetLabel     「默认」项文案（默认 中文=默认 / EN=Default）
 * @param opts.resetValue     「默认」项回传值（默认 null；allowTransparent=true 时为 "transparent"）
 * @param opts.allowTransparent 「默认」项回传 "transparent" 而不是 null
 */
export function showXHPicker(anchorBtn, opts = {}) {
    const id = opts.id || "xh_palette_pop";
    const old = document.getElementById(id);
    if (old) old.remove();
    const box = document.createElement("div");
    box.id = id;
    box.style.cssText = "position:fixed;z-index:99999;background:#222;border:1px solid #555;border-radius:6px;padding:6px;display:flex;flex-wrap:wrap;gap:4px;width:176px;box-shadow:0 4px 12px rgba(0,0,0,.5);";
    const isZh = currentLang() === "zh";
    const curHex = String(opts.current || "").toLowerCase();
    const fire = (hex) => { if (typeof opts.onPick === "function") opts.onPick(hex); };
    const onDoc = (e) => {
        if (!box.contains(e.target) && e.target !== anchorBtn && !anchorBtn.contains(e.target)) {
            box.remove(); document.removeEventListener("pointerdown", onDoc, true);
        }
    };
    const closeAnd = (fn) => () => { try { fn(); } finally { box.remove(); document.removeEventListener("pointerdown", onDoc, true); } };

    const reset = document.createElement("button");
    reset.textContent = opts.resetLabel || (isZh ? "默认" : "Default");
    reset.style.cssText = "width:100%;background:#333;color:#e8e8e8;border:1px solid #555;border-radius:4px;padding:3px 0;font-size:11px;cursor:pointer;";
    const resetVal = opts.resetValue !== undefined ? opts.resetValue : (opts.allowTransparent ? "transparent" : null);
    reset.onclick = closeAnd(() => { fire(resetVal); });
    box.appendChild(reset);

    // 2026-10-31：允许调用方追加「常用色」（例：上色场景要纯绿/纯红/品红等鲜艳色，
    //   品牌 12 色里没有）。不传 extraSwatches = 行为与原来完全一致（向后兼容）。
    const extraSw = Array.isArray(opts.extraSwatches) ? opts.extraSwatches : [];
    XH_PALETTE.concat(extraSw).forEach((col) => {
        const d = document.createElement("button");
        d.style.cssText = `width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,.35);cursor:pointer;background:${col.hex};${col.hex.toLowerCase() === curHex ? "outline:2px solid #fff;outline-offset:1px;" : ""}`;
        d.title = isZh ? col.zh : col.en;
        d.onclick = closeAnd(() => { fire(col.hex); });
        box.appendChild(d);
    });

    const custom = document.createElement("button");
    custom.textContent = isZh ? "自定义…" : "Custom…";
    custom.style.cssText = "width:100%;background:#333;color:#e8e8e8;border:1px solid #555;border-radius:4px;padding:3px 0;font-size:11px;cursor:pointer;margin-top:2px;";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.style.cssText = "position:absolute;width:0;height:0;padding:0;border:none;opacity:0;pointer-events:none;";
    if (/^#[0-9a-f]{6}$/i.test(opts.current || "")) picker.value = opts.current;
    picker.addEventListener("input", () => { fire(picker.value); });
    picker.addEventListener("change", closeAnd(() => { fire(picker.value); }));
    custom.onclick = (e) => { e.stopPropagation(); picker.click(); };
    box.appendChild(picker);
    box.appendChild(custom);

    const rect = anchorBtn.getBoundingClientRect();
    box.style.top = (rect.bottom + 4) + "px";
    box.style.left = rect.left + "px";
    document.body.appendChild(box);
    setTimeout(() => document.addEventListener("pointerdown", onDoc, true), 0);
}

/**
 * 节点框取色弹窗 —— 已被 XiaoHei 的完整画板取代（web/xh_color_picker.js）。
 *  保留是为了兼容老调用方；新代码请直接用 xh_color_picker.js 的 createXHColorPicker。
 */
export function showXHPalette(node, anchorBtn, onPick) {
    const pick = typeof onPick === "function" ? onPick : null;
    showXHPicker(anchorBtn, {
        id: "xh_palette_pop",
        current: node.color,
        resetValue: null,
        onPick: (hex) => { applyNodeColor(node, hex); if (pick) pick(hex); },
    });
}

/**
 * 通用下拉弹窗（2026-10-20 新增，家族唯一实现）—— 每一行 = 色块 + 文字，当前项打勾高亮。
 *  为什么不用原生 <select>：Chromium 的 <option> **只渲染文本节点**，
 *    option.innerHTML 里塞的 <span> 会被整条丢弃 —— 色块永远画不出来。
 *    这就是「下拉里看不到色块」的唯一根因，跟主题 / CSS 无关，只能自绘。
 * @param anchor 触发元素（按钮）
 * @param opts.items    [{value,label,hex?,color?,tip?}] —— hex 合法才画色块
 * @param opts.color    行文字色（不给用中性浅灰；调用方一般传 readableOn(hex)）
 * @param opts.current  当前值（按字符串比）
 * @param opts.onPick   (value)=>void
 * @param opts.id       弹窗 id（同一时刻同名只留一个）
 * @returns {{close:()=>void}}
 */
export function showXHDropdown(anchor, opts = {}) {
    const id = opts.id || "xh_dropdown_pop";
    const old = document.getElementById(id);
    if (old) old.remove();
    const items = (opts.items || []).filter((it) => it && it.value !== undefined && it.value !== null);
    const cur = String(opts.current == null ? "" : opts.current);
    const fallbackTx = opts.color || "#dde3ea";
    const fire = (v) => { if (typeof opts.onPick === "function") opts.onPick(v); };

    // 色块：hex 非法（工作流里存了脏值 / 手填了色名）时画**空心虚线框**，
    //  不能退回中性灰 —— 那个灰跟「全部颜色」的色块一模一样，用户会以为是同一个颜色。
    const validHex = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || "")) ? String(h) : "");

    const box = document.createElement("div");
    box.id = id;
    box.style.cssText = "position:fixed;z-index:99999;min-width:136px;max-height:314px;overflow-y:auto;"
        + "background:#1c1f26;border:1px solid #4a5260;border-radius:6px;padding:4px;"
        + "box-shadow:0 6px 18px rgba(0,0,0,.62);font-size:13px;";

    const close = () => {
        box.remove();
        document.removeEventListener("pointerdown", onDoc, true);
    };
    const onDoc = (e) => {
        if (!box.contains(e.target) && !anchor.contains(e.target)) close();
    };

    items.forEach((it) => {
        const on = String(it.value) === cur;
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 9px;border-radius:4px;"
            + "cursor:pointer;white-space:nowrap;user-select:none;-webkit-user-select:none;"
            + "font-weight:" + (on ? 700 : 600) + ";"
            + "background:" + (on ? BAR_COLORS.ACTIVE_BG : "transparent") + ";"
            + "color:" + (on ? BAR_COLORS.ACTIVE_TX : (it.color || fallbackTx)) + ";";
        if (it.hex) {
            const ok = validHex(it.hex);
            const sw = document.createElement("span");
            sw.style.cssText = "display:inline-block;width:13px;height:13px;border-radius:3px;flex:none;"
                + (ok
                    ? "background:" + ok + ";border:1px solid rgba(255,255,255,.45);box-shadow:0 0 0 1px rgba(0,0,0,.45);"
                    : "background:transparent;border:1px dashed rgba(255,255,255,.40);")
                + (ok ? "" : 'title="这个值没有对应颜色"');
            row.appendChild(sw);
        }
        const tx = document.createElement("span");
        tx.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;";
        tx.textContent = it.label;
        row.appendChild(tx);
        if (on) {
            const ck = document.createElement("span");
            ck.textContent = "\u2713";
            ck.style.cssText = "font-size:12px;opacity:.95;";
            row.appendChild(ck);
        }
        if (it.tip) row.title = it.tip;
        row.onmouseenter = () => { if (!on) row.style.background = "rgba(255,255,255,.07)"; };
        row.onmouseleave = () => { if (!on) row.style.background = "transparent"; };
        row.onclick = (e) => { e.stopPropagation(); close(); fire(it.value); };
        box.appendChild(row);
    });

    document.body.appendChild(box);
    const r = anchor.getBoundingClientRect();
    const bw = box.offsetWidth, bh = box.offsetHeight;
    // 下方放不下就翻到上方；左右贴边内收
    let top = r.bottom + 4;
    if (top + bh > window.innerHeight - 8 && r.top - bh - 4 > 8) top = r.top - bh - 4;
    let left = r.left;
    if (left + bw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - bw - 8);
    box.style.top = Math.max(8, top) + "px";
    box.style.left = left + "px";
    setTimeout(() => document.addEventListener("pointerdown", onDoc, true), 0);
    return { close };
}

// ---- ② 标准按钮 ----
const _LANG_BTNS = new Set();

// ================================================================
//  浮层定位工具（2026-10-29 新增，家族唯一实现）
//
// 起因（用户原话）：「当我点击这个节点的这个齿齿轮这个按键的时候，
//   会蹦出来一个设置离得老远。正常的话就在旁边啊。」
//
// 根因：老代码把浮层**硬编码**到屏幕右侧 ——
//   panel.style.left = window.innerWidth - 340 + "px"; panel.style.top = "80px";
//   ⇒ 面板永远钉在视口右上角，跟节点在哪毫无关系。
//
// 本模块提供三件套（照抄 ComfyUI-Pixaroma 的 settings.mjs / info_panel.mjs 做法）：
//   xhGetNodeRect(node)   取节点在屏幕上的矩形（Nodes 2.0 走 [data-node-id]，旧版画布走坐标换算）
//   xhPlaceBeside(panel, rect)  把浮层摆到节点旁边；右边放不下就翻到左边；再放不下就贴边
//   xhFollowNode(panel, node)   画布缩放/平移时持续跟随节点；用户自己拖走后就停跟随
//   xhMakeDraggable(panel, handle) 面板可拖动（拖标题栏）
// ================================================================

/** 节点在屏幕上的矩形。找不到返回 null（调用方要能兜底）。 */
export function xhGetNodeRect(node) {
    // Nodes 2.0（Vue）：DOM 里有 data-node-id
    if (node && node.id != null) {
        const e = document.querySelector(`[data-node-id="${node.id}"]`);
        if (e) {
            const r = e.getBoundingClientRect();
            if (r.width || r.height) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
    }
    // 旧版画布（LiteGraph）：用画布缩放/偏移换算
    try {
        const cv = window.app?.canvas, ds = cv?.ds, cvs = cv?.canvas;
        if (!ds || !cvs || !node?.pos || !node?.size) return null;
        const cr = cvs.getBoundingClientRect();
        const titleH = window.LiteGraph?.NODE_TITLE_HEIGHT || 30;
        const sc = ds.scale || 1;
        const off = ds.offset || [0, 0];
        const left = cr.left + (node.pos[0] + off[0]) * sc;
        const top = cr.top + (node.pos[1] - titleH + off[1]) * sc;
        return { left, top, right: left + node.size[0] * sc, bottom: top + (node.size[1] + titleH) * sc };
    } catch (e) { return null; }
}

/**
 * 把浮层摆到节点旁边。
 * 规则：优先节点右侧 → 放不下翻到节点左侧 → 再放不下就贴视口右边。
 * @param {HTMLElement} panel position:fixed 的浮层
 * @param {object|null} rect   xhGetNodeRect 的结果
 * @param {object} opt        { gap=12, pad=8, preferBottom=false }
 */
export function xhPlaceBeside(panel, rect, opt = {}) {
    if (!panel) return;
    const gap = opt.gap ?? 12;
    const pad = opt.pad ?? 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = panel.offsetWidth || 0, mh = panel.offsetHeight || 0;
    if (!rect) {
        // 兜底：居中（而不是甩到屏幕边缘）
        panel.style.left = Math.max(pad, Math.round((vw - mw) / 2)) + "px";
        panel.style.top = Math.max(pad, Math.round((vh - mh) / 2)) + "px";
        return;
    }
    let left, top;
    if (opt.preferLeft) {
        // 从锚点左侧弹出：left = 锚点左缘 - gap - 面板宽
        left = rect.left - gap - mw;
        top = rect.top;
        if (left < pad) left = rect.right + gap;                       // 左边放不下 → 翻到右边
        if (left + mw > vw - pad) left = Math.max(pad, vw - mw - pad); // 还放不下 → 贴右
    } else if (opt.preferBottom) {
        left = rect.left;
        top = rect.bottom + gap;
        if (top + mh > vh - pad) top = Math.max(pad, rect.top - gap - mh);
    } else {
        left = rect.right + gap;
        top = rect.top;
        if (left + mw > vw - pad) left = rect.left - gap - mw;   // 右边放不下 → 翻到左边
        if (left < pad) left = Math.max(pad, vw - mw - pad);      // 还放不下 → 贴右边
    }
    if (top + mh > vh - pad) top = Math.max(pad, vh - mh - pad);
    panel.style.left = Math.round(left) + "px";
    panel.style.top = Math.round(top) + "px";
}

/**
 * 让浮层一直贴着锚点元素：画布缩放/平移/节点被拖动时跟着走；用户拖走浮层后不再跟随。
 *  用**锚点元素的 getBoundingClientRect** 而不是 app.canvas.ds ——
 *    Nodes 2.0（Vue）下 ds 不反映节点位置，只有 DOM 元素的 rect 是真的。
 *    锚点元素在两套画布模式下都存在（DOM widget 会被前端摆到节点上）。
 */
export function xhFollowAnchor(panel, anchorEl, opt = {}) {
    let raf = null;
    let lastKey = "";
    let userMoved = false;
    const tick = () => {
        if (!panel || !panel.isConnected || !anchorEl || !anchorEl.isConnected) { raf = null; return; }
        raf = requestAnimationFrame(tick);
        if (userMoved) return;
        const r = anchorEl.getBoundingClientRect();
        //  ⛔ 异常帧保护：锚点尺寸为 0 或坐标 NaN（Vue 重排/元素替换的过渡态）时跳过本帧，
        //    绝不用异常值去重定位面板 —— 否则面板会被甩到屏幕顶部/抽搐。
        if (!r || !isFinite(r.left) || !isFinite(r.top) || r.width <= 0 || r.height <= 0) return;
        const key = Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "," + Math.round(r.height);
        if (key === lastKey) return;      // 绝大多数帧在这里就 return 了
        lastKey = key;
        xhPlaceBeside(panel, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, opt);
    };
    raf = requestAnimationFrame(tick);
    return {
        stop() { if (raf != null) cancelAnimationFrame(raf); raf = null; },
        markUserMoved() { userMoved = true; },
    };
}

/** 浮层可拖动（拖 handle 元素）。拖完自动通知跟随器别再抢位置。 */
export function xhMakeDraggable(panel, handle, onUserMove) {
    if (!panel || !handle) return;
    handle.addEventListener("pointerdown", (e) => {
        if (e.target.closest && e.target.closest(".x")) return;   // 关闭按钮不触发拖动
        e.preventDefault();
        const r = panel.getBoundingClientRect();
        const ox = e.clientX - r.left, oy = e.clientY - r.top;
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        const move = (ev) => {
            if (!panel.isConnected) return up();
            if (!(ev.buttons & 1)) return up();
            if (typeof onUserMove === "function") onUserMove();
            panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ev.clientX - ox)) + "px";
            panel.style.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, ev.clientY - oy)) + "px";
        };
        let done = false;
        const up = () => {
            if (done) return;
            done = true;
            try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
            handle.removeEventListener("pointermove", move, true);
            handle.removeEventListener("pointerup", up, true);
            handle.removeEventListener("pointercancel", up, true);
            handle.removeEventListener("lostpointercapture", up, true);
        };
        handle.addEventListener("pointermove", move, true);
        handle.addEventListener("pointerup", up, true);
        handle.addEventListener("pointercancel", up, true);
        handle.addEventListener("lostpointercapture", up, true);
    });
}

// ================================================================
//工具条按钮皮肤 —— 方案 B（2026-10-20，家族唯一实现）
// 用户原话：「提示词表那个功能键的，你用的是个白色白底儿的那个……你觉得合适吗？
//            我希望我们做这个节点上按键的时候，就符合那种大众专业的一些按键的风格。」
// 改前家族一条工具条上有 5 套并存皮肤（实心 #ffffff / #8a8a8a / #8a8a8a / #252525 /
// 淡紫 #EEEDFE 白底 + 0.5px 边框），外加 bold 字重 = "不专业"的三个成因。
// 方案 B 规则：**层级用明度表达，不用色相**。主角（齿轮 / 主操作）= 蓝实心；
//             配角（其余全部）= 同一档暗底 #252525 + 1px rgba(255,255,255,.10) 描边。
// ================================================================

/** 工具条配色常量 —— 家族唯一数据源，勿在节点里另写 hex */
// ════════════════════════════════════════════════════════════════════════════//  2026-10-29：官方主题是**动态**的（用户随时可切深/浅）⇒ 定时刷新 CSS 变量，
//    让所有 DOM 元素（顶栏按钮 / 设置面板 / 帮助面板 / 节点里的 DOM widget）跟着变。
//    1 秒一次足够跟手，开销可忽略（只读几个 CSS 变量）。
try {
    if (typeof window !== "undefined" && !window.__xhCssVarTimer) {
        window.__xhCssVarTimer = setInterval(() => { try { syncXhCssVars(); } catch (e) {} }, 1000);
    }
} catch (e) {}


//  2026-10-29 · XiaoHei 家族核心品牌色（唯一真源）
//
//  用户拍板：家族要有一个统一的「记号色」，用法照 Pixaroma 的分工 ——
//    · 节点壳子（底/描边/正文）= 官方色，随官方主题走；
//    · 记号色（主操作按钮 / 小字 / 图标 / logo）= 品牌色，一个色打天下。
//
//  选色：琥珀金 #E8A33C（用户从三个候选里选的）
//    · 和黑白灰底最搭、高级感强；
//    · 深底上是够亮的暖金，浅底上也压得住；
//    · 暖色是 10 个分类色里唯一没被占满的方向（分类色里暖的只有暗棕/暗橄榄），
//      ⇒ 品牌色与分类色不会互相冒充。
//   浅底必须配深字 —— 所以 MAIN 配 BRAND_TX(深墨 #1c1c1c)，这是家族铁律。
// ════════════════════════════════════════════════════════════════════════════
//  2026-11-17 主题预设化：品牌色不再写死，改成 getter 读 window.XH_THEME。
//    · 没装/未加载主题模块 ⇒ 回退到经典黑金原值（老工作流观感不变）。
//    · 契约不变：变量名、字段名字一个不改，只换取值来源。
//    · syncXhCssVars() 每秒无条件写 --xh-brand/--xh-rest ⇒ 这里动态取值才会跟主题走。
const _xhTheme = () => (typeof window !== "undefined" ? window.XH_THEME : null);
export const XH_BRAND = {
    get MAIN()      { const t = _xhTheme(); return t ? t.main() : "#E8A33C"; },   // 瞬时信号色，随预设
    TX:             "#1c1c1c",   // 品牌色上的字（深墨）—— WCAG 由 --xh-on-primary 覆盖，此处为静态兜底
    BORDER:         "rgba(0,0,0,.22)",
    get TEXT_DARK() { const t = _xhTheme(); return t ? t.textDark() : "#E8A33C"; },
    get TEXT_LIGHT(){ const t = _xhTheme(); return t ? t.textLight() : "#9A6412"; },
    get ON_LIGHT()  { const t = _xhTheme(); return t ? t.lightMain() : "#B5761D"; },
    ON_LIGHT_TX:    "#ffffff",
    // 常态主操作底 = 节点标题栏色，随预设切换（classic = 暖黑 #1A1613）
    get REST()      { const t = _xhTheme(); return t ? t.title() : "#1A1613"; },
    REST_TX:        "#ffffff",
    REST_BD:        "rgba(255,255,255,.28)",
};

/** 把任意 CSS 颜色串转成 canvas 能用的 rgb()（官方变量可能是 oklch/color() 形式）。 */
function _xhToRgb(colorStr) {
    try {
        if (!colorStr) return null;
        const c = document.createElement("canvas"); c.width = 1; c.height = 1;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#000000";
        ctx.fillStyle = colorStr;                 // 非法值 ⇒ fillStyle 保持上一个值
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        if (d[0] === 0 && d[1] === 0 && d[2] === 0) {
            // 可能是纯黑，也可能是解析失败 ⇒ 用探针再判一次（写白色看是否变化）
            ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1, 1);
            const d2 = ctx.getImageData(0, 0, 1, 1).data;
            if (d2[0] === 255 && d2[1] === 255 && d2[2] === 255 && colorStr.trim() !== "#ffffff") {
                return null;   // 解析失败
            }
        }
        return `rgb(${d[0]},${d[1]},${d[2]})`;
    } catch (e) { return null; }
}

/** 相对亮度（0=黑 1=白） */
function _xhLum(rgbStr) {
    try {
        const m = /rgb\(([^)]+)\)/.exec(rgbStr || "");
        if (!m) return 0;
        const p = m[1].split(",").map((x) => parseFloat(x) / 255);
        return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    } catch (e) { return 0; }
}

/**
 *  实时读取**官方主题色**（跟随官方浅/深色切换）。
 * 官方前端 1.57 有：--comfy-menu-bg / --comfy-input-bg / --comfy-menu-secondary-bg
 *  canvas 绘制**取不到 CSS 变量** ⇒ 必须 getComputedStyle 读出实际值再喂给 canvas。
 *  官方切主题是动态的 ⇒ 缓存 400ms 足够跟手，又不至于每帧读样式。
 */
let _xhPalCache = null, _xhPalAt = 0;
export function officialPalette() {
    const now = Date.now();
    if (_xhPalCache && now - _xhPalAt < 400) return _xhPalCache;
    const out = {
        surface: "#252525", border: "#333333", text: "#e8e8e8",
        input: "#141414", secondary: "#2a2a2a",
    };
    try {
        const cs = getComputedStyle(document.documentElement);
        const g = (n) => _xhToRgb((cs.getPropertyValue(n) || "").trim());
        const menuBg = g("--comfy-menu-bg");
        const inputBg = g("--comfy-input-bg");
        const menu2 = g("--comfy-menu-secondary-bg");
        if (menuBg) out.surface = menuBg;
        if (inputBg) out.input = inputBg;
        if (menu2) out.secondary = menu2;
        // 描边/正文/次要字/激活态：官方没有直接变量 ⇒ 按表面亮度推导（保持层次）
        const lum = _xhLum(out.surface);
        const light = lum > 0.5;
        out.isLight = light;
        out.border = light ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.14)";
        out.text = light ? "#1c1c1c" : "#e8e8e8";
        out.secondTx = light ? "#5f5f5f" : "#8a8a8a";
        out.activeBg = light ? "#dedede" : "#3a3a3a";
        out.activeBd = light ? "#c4c4c4" : "#4a4a4a";
        out.activeTx = light ? "#1c1c1c" : "#ffffff";
        // 输入框底：官方 --comfy-input-bg 优先，没有则按表面亮度推一档
        if (!inputBg) out.input = light ? "#f2f2f2" : "#141414";
    } catch (e) {}
    _xhPalCache = out; _xhPalAt = now;
    //  每次刷新色板时同步 CSS 变量 ⇒ DOM 元素跟着官方主题变
    try { syncXhCssVars(); } catch (e) {}
    return out;
}

/** 当前是不是浅色主题（决定品牌色用 MAIN 还是 ON_LIGHT） */
export function isLightTheme() {
    try { return !!officialPalette().isLight; } catch (e) { return false; }
}

/**
 *  2026-10-29 把**品牌色 + 官方主题色**注入成 CSS 变量（:root）——
 *    这样**所有 DOM 元素**（顶栏按钮、设置面板、帮助面板、节点里的 DOM widget）
 *    都能用同一套色，且随官方主题自动跟随（canvas 绘制的部分走 JS 取值，两边同源）。
 *
 *  变量清单：
 *    --xh-brand       品牌色（琥珀金）
 *    --xh-brand-tx    品牌色上的字（深墨）
 *    --xh-brand-text  品牌色小字（深底亮版 / 浅底深版，自动切）
 *    --xh-surface     官方面板底
 *    --xh-border      描边
 *    --xh-text        正文色
 *    --xh-input       输入框底
 *    --xh-second      次要字
 *    --xh-primary     瞬时信号色（= 琥珀金：hover / 打开 / 运行 / 成功 / 聚焦）
 *    --xh-on-primary  瞬时信号上的字（深墨）
 *    --xh-rest        ⏱ 常态主操作底（= 主题标题色，2026-11-17）
 *    --xh-on-rest     常态主操作上的字（白）
 *    --xh-rest-bd     常态主操作的淡描边
 */
export function syncXhCssVars() {
    try {
        if (typeof document === "undefined") return;
        const root = document.documentElement;
        const set = (k, v) => { try { root.style.setProperty(k, v); } catch (e) {} };
        // ① 只属于 kit 的变量：无条件写（品牌记号 / 常态主操作按钮）
        set("--xh-brand", XH_BRAND.MAIN);
        set("--xh-brand-tx", XH_BRAND.TX);
        set("--xh-brand-text", brandTextColor());
        set("--xh-rest", XH_BRAND.REST);
        set("--xh-on-rest", XH_BRAND.REST_TX);
        set("--xh-rest-bd", XH_BRAND.REST_BD);

        // ②  界面变量的**唯一真源** = `xh_settings_panel.js` 的 THEMES（一次写全套深/浅）。
        //    2026-11-08 修「官方切亮色 → 浮窗白底浅字、字全看不清」：
        //      以前这里每秒无条件覆盖 --xh-surface / --xh-text / --xh-border /
        //      --xh-primary / --xh-on-primary，但 THEMES 里还有 --xh-side / --xh-card /
        //      --xh-input-bg / --xh-sub 等它**不写** ⇒ 变量集被搅成半深半浅：
        //      侧栏和输入框是白底，正文色却还是深色主题的浅字 ⇒ 白底白字。
        //    ⇒ 改成「只在变量还没被写入时补一份 dark 兜底」， 绝不覆盖 THEMES。
        //      这样官方切亮色时 applyTheme 一次写全套 light（白底深字），自洽可读；
        //      即便 settings_panel 尚未加载，浮窗也有完整 dark 值，不会半套。
        const FALLBACK = {
            "--xh-surface": "#1c1c1c", "--xh-side": "#141414", "--xh-card": "#252525",
            "--xh-border": "#333333", "--xh-text": "#e8e8e8", "--xh-sub": "#8a8a8a",
            "--xh-text-strong": "#ffffff", "--xh-input": "#141414", "--xh-input-bg": "#141414",
            "--xh-second": "#8a8a8a", "--xh-primary": "#E8A33C", "--xh-on-primary": "#1c1c1c",
            "--xh-on-primary-dim": "#5a5a5a", "--xh-hover": "rgba(255,255,255,.08)",
            "--xh-overlay": "rgba(255,255,255,.08)", "--xh-chip-bg": "rgba(255,255,255,.06)",
            "--xh-title-bg": "rgba(255,255,255,.05)", "--xh-bar-bg": "rgba(0,0,0,.25)",
            "--xh-foot-bg": "rgba(0,0,0,.25)", "--xh-shadow": "rgba(0,0,0,.7)",
            "--xh-danger": "#e05858",
        };
        for (const k in FALLBACK) {
            if (!root.style.getPropertyValue(k)) set(k, FALLBACK[k]);
        }
    } catch (e) {}
}

/** 品牌色小字：深底用亮版、浅底用深版（保证可读） */
export function brandTextColor() {
    return isLightTheme() ? XH_BRAND.TEXT_LIGHT : XH_BRAND.TEXT_DARK;
}

/** 品牌色主操作按钮底：深底用 MAIN、浅底用深一档的 ON_LIGHT */
export function brandButtonBg() {
    return isLightTheme() ? XH_BRAND.ON_LIGHT : XH_BRAND.MAIN;
}
export function brandButtonTx() {
    return isLightTheme() ? XH_BRAND.ON_LIGHT_TX : XH_BRAND.TX;
}

/**
 * 家族中性色 + 主操作色的**唯一真源**。
 *  2026-10-29 改成 **getter**（值随官方主题实时变化）：
 *    · 之前这些是**写死的**（按用户本机深色界面的像素抄的）⇒ 官方换浅色主题时 XiaoHei 不跟随；
 *    · 现在 SURFACE/BORDER/TEXT/ACTIVE/SECOND 都从**官方 CSS 变量实时读**
 *      （--comfy-menu-bg / --comfy-input-bg / --comfy-menu-secondary-bg）⇒
 *      **XiaoHei 的节点壳子就是官方的颜色**，深浅自动一致。
 *  PRIMARY 档现在是**瞬时信号色（琥珀金）**：用在 hover / 打开 / 运行成功 /
 *    聚焦描边 / 选中高亮。 2026-11-08 起**不再**做常态实心按钮底 —— 那活归 REST。
 *    （深蓝标题栏旁边一颗常亮暖金太扎眼，且违背「大面积低彩、彩度只给信号点」。）
 *  对外接口**完全没变**（还是 BAR_COLORS.XXX），所有老调用点不用改。
 *  浅底**必须配深字**：品牌色上配深墨 #1c1c1c（家族铁律）。
 */
export const BAR_COLORS = {
    get SURFACE()    { return officialPalette().surface; },   // 中性按钮底（= 官方面板底）
    get BORDER()     { return officialPalette().border; },    // 中性按钮描边
    get TEXT()       { return officialPalette().text; },      // 中性按钮字
    get PRIMARY()    { return brandButtonBg(); },             // ⏱ 瞬时信号色（琥珀金）， 不是常态按钮底
    //  浅底**必须配深字**：品牌色上留白字等于看不见 ⇒ 深墨。
    get PRIMARY_TX() { return brandButtonTx(); },
    // ── ⏱ 常态主操作（2026-11-17）：主题标题色 + 白字 ──────────────
    get REST()       { return XH_BRAND.REST; },
    get REST_TX()    { return XH_BRAND.REST_TX; },
    get REST_BD()    { return XH_BRAND.REST_BD; },
    get ACTIVE_BG()  { return officialPalette().activeBg; },  // 激活态底
    get ACTIVE_BD()  { return officialPalette().activeBd; },  // 激活态描边
    get ACTIVE_TX()  { return officialPalette().activeTx; },  // 激活态字
    get SECOND_TX()  { return officialPalette().secondTx; },  // 次要/说明文字
    //  danger 档（2026-10-20 用户拍板「危险按钮保留红色实心」）：
    //    破坏性操作（停止 / 清空列表 / 删除 LoRA）的红色是**语义色**，不是皮肤不一致。
    //     语义色**不跟随主题**（铁律：禁止中性化），深浅主题都用同一个克制深红。
    DANGER_BG:  "#e05858",
    DANGER_BD:  "rgba(255,255,255,.22)",
    DANGER_TX:  "#ffffff",
};

//  挂一份到 window：给「不能静态 import 本模块」的调用方用。
//    典型 = xh_about.js（设置面板徽章）—— web/ 下按字母序加载，xh_about.js 排在
//    xh_ui_kit.js **之前**，它顶层 import 本模块会因 app.js 未就绪而抛；
//    而设置面板的渲染函数是在用户点开面板时才跑的，那一刻本模块早已加载完。
//    ⇒ 只在**渲染时**读 window.XH_BAR_COLORS 才拿得到颜色（顶层读必为 undefined）。
if (typeof window !== "undefined") window.XH_BAR_COLORS = BAR_COLORS;
//  对比度工具也挂一份到 window —— 有些文件（xh_settings_panel.js）**没有 import**
//    （用的是 window.comfyAPI.app 全局风格），只能从 window 拿。
if (typeof window !== "undefined") window.XH_pickOnColor = pickOnColor;

/** 按钮统一尺寸 —— 22px 高是家族标准（工具条行高 28px 的一半多一像素，肉眼刚好贴满不挤） */
export const BAR_BTN_H = 22;
export const BAR_BTN_W_MIN = 26;
export const BAR_BTN_PAD = "0 9px";

/**
 * 🔴 家族「版式令牌」唯一真源（2026-11-15 立）。
 *   以前 Skill 只统一了**零件**（按钮配色 / 图标 / 命名 / 齿轮 / 锁高），规矩写在 md 里；
 *   整块面板的尺寸没人管 ⇒ xh_group.js 写 `2px #444` / `4px` / `#2d7d2d` 而**不违反任何一条铁律**。
 *   ⇒ 把间距 / 圆角 / 描边 / 字号三档 / 状态色 / 动效全收成常量，节点只准引用，
 *     ⛔ 不许再在节点里写死 hex 或 `2px solid`。
 *   颜色一律 getter，跟 BAR_COLORS 一样实时跟随官方深浅主题（浅底必须配深字）。
 */
export const XH_TOKENS = {
    // 已有家族标准（22 / 4 / 12）—— 原样收编，不推倒重来
    BTN_H: BAR_BTN_H,
    BTN_RADIUS: 4,
    BTN_FONT: 12,
    // 面板版式（此前完全没有统一过的一层）
    CARD_RADIUS: 12,
    BORDER_W: 1,
    ROW_GAP: 8,
    PAD_X: 12,
    PAD_Y: 8,
    FONT_LG: 13,
    FONT_MD: 12,
    FONT_SM: 11,
    DUR: 180,
    get BORDER()       { return officialPalette().border; },
    get CARD_BG()      { return officialPalette().surface; },
    get TEXT()         { return officialPalette().text; },
    get SUB()          { return officialPalette().secondTx; },
    get ACCENT()       { return brandButtonBg(); },      // ⏱ 瞬时信号色：只给「当前动作 / 刚点过」
    get STATE_ON_BG()  { return isLightTheme() ? "rgba(45,125,45,.16)" : "rgba(90,170,105,.20)"; },
    get STATE_ON_TX()  { return officialPalette().text; },
    get STATE_OFF_BG() { return isLightTheme() ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.05)"; },
    get STATE_OFF_TX() { return officialPalette().secondTx; },
};
if (typeof window !== "undefined") window.XH_TOKENS = XH_TOKENS;

/** 家族卡片：一行一卡。节点只准用这个拼样式，别自己写 border / radius / padding。 */
export function xhCardCss(extra = "") {
    const T = XH_TOKENS;
    return `display:flex;align-items:center;gap:10px;`
        + `padding:${T.PAD_Y}px ${T.PAD_X}px;margin:0 0 ${T.ROW_GAP}px;`
        + `border:${T.BORDER_W}px solid ${T.BORDER};border-radius:${T.CARD_RADIUS}px;`
        + `background:${T.CARD_BG};transition:border-color ${T.DUR}ms ease,background ${T.DUR}ms ease;`
        + `cursor:pointer;box-sizing:border-box;` + extra;
}

/**
 * 统一外观。四档（ 2026-10-29 全部改为官方中性黑白灰，层级靠**明度**不靠色相）：
 *   "neutral" （默认，配角）面板灰底 #252525 + #333 描边 + 近白字 + 字重 600
 *   "primary"（主角）    官方白键 #e8e8e8 + **深墨字 #1c1c1c** + 字重 700
 *   "active" （状态）    #3a3a3a 底 / #4a4a4a 边 / 白字 + 字重 700
 *   "danger" （破坏性）  红实心 #e05858 + 白字 + 字重 700 ——  别中性化，红是语义色
 *  primary 档是**浅底**，字色必须走 PRIMARY_TX（深墨）；写死白色会白底白字看不见。
 */
export function paintBarBtn(btn, role = "neutral") {
    if (!btn) return btn;
    if (btn.classList) btn.classList.add("xh-bar-btn");   //  齿轮「按键颜色」统一挂钩点（danger 键额外加 .xh-bar-btn-danger 排除）
    const C = BAR_COLORS;
    const base =
        "display:flex;align-items:center;justify-content:center;height:" + BAR_BTN_H + "px;"
        + "min-width:" + BAR_BTN_W_MIN + "px;padding:" + BAR_BTN_PAD + ";margin:0;"
        + "border-radius:4px;font-size:12px;font-family:inherit;cursor:pointer;flex:0 0 auto;"
        + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:auto;"
        + "user-select:none;-webkit-user-select:none;line-height:1;"
        + "transition:filter .15s,background .15s,border-color .15s,color .15s;";

    if (role === "danger") {
        //  危险操作保留红色实心（用户拍板）：破坏性语义不能被"中性化"掉，
        //    否则用户会习惯性点下去 —— 但压成深红，别像原来那样大红块抢整条工具条的戏。
        btn.style.cssText = base
            + "background:" + C.DANGER_BG + ";border:1px solid " + C.DANGER_BD + ";"
            + "color:" + C.DANGER_TX + ";font-weight:700;";
        btn.classList.add("xh-bar-btn-danger");   //  排除：按键色不改语义红键（铁律：语义色禁止中性化）
    } else if (role === "primary") {
        // ⏱ 2026-11-17：常态 = 主题标题色 + 白字（与节点标题栏同源）；
        //    hover / 打开态由 CSS 走 --xh-primary 琥珀金 ⇒ 金只亮一下，不再常亮。
        //  齿轮「按键颜色」：背景/文字走 --xh-acc 变量，用户选色即跟随（仅本节点生效）
        if (btn.classList) btn.classList.add("xh-bar-btn-primary");
        btn.style.cssText = base
            + "background:var(--xh-acc," + C.REST + ");border:1px solid " + C.REST_BD + ";"
            + "color:var(--xh-acc-tx," + C.REST_TX + ");font-weight:700;";
    } else if (role === "active") {
        btn.style.cssText = base
            + "background:var(--xh-acc," + C.ACTIVE_BG + ");border:1px solid " + C.ACTIVE_BD + ";"
            + "color:var(--xh-acc-tx," + C.ACTIVE_TX + ");font-weight:700;";
    } else {
        // 主路：中性暗底 + 1px 半透明白描边（0.5px 缩放会渲染成毛边， 别再用）
        //  齿轮「按键颜色」：背景/文字走 --xh-acc 变量
        btn.style.cssText = base
            + "background:var(--xh-acc," + C.SURFACE + ");border:1px solid " + C.BORDER + ";"
            + "color:var(--xh-acc-tx," + C.TEXT + ");font-weight:600;";   // 600 = 12px 密排下的清晰上限
    }
    btn.style.boxShadow = "";
    //  记下档位：hover 反馈方向要跟底色反着来 ——
    //    暗底按钮（neutral/active/danger）**提亮**才看得出；白键已经是最亮，
    //    brightness(1.28) 几乎无变化 ⇒ 白键必须**压暗**才有 hover 反馈。
    btn._xhRole = role;
    return btn;
}

/** hover 亮度系数：primary 现在也是暗底（主题标题色）⇒ 全部一律提亮。
 *   primary 的 hover 变色（琥珀金瞬时信号）由 CSS `.xh-bar-btn-primary:hover` 负责，这里只管亮度。 */
export function barBtnHoverFilter(role) {
    return "brightness(1.28)";
}

/**
 * 家族统一工具条按钮（方案 B 唯一实现）。
 * @param text按钮文字（或用 html 塞 SVG 图标）
 * @param tip  tooltip
 * @param opts.role  "neutral"(默认) | "primary" | "active"
 * @param opts.width 指定宽度（px），不传按内容自适应
 */
// ══════════════════════════════════════════════════════════════════════
//  2026-11-13 家族图标统一：清理 emoji 后留下的「前导空格」按钮文案
// ══════════════════════════════════════════════════════════════════════
//  早前把 Windows 彩色 emoji 从按钮上删掉时只删了字符，文案里留下一个前导空格
//  （" 刷新" / " Upload"），也没补上自家图标库的图案 ⇒ 节点上到处是没图案的按钮。
//  这里按语义把空格换成 2350 枚图标库里的对应图案；匹配不到就只把空格去掉。
//  ⛔ 不改文案表、不改存档值、不改参数 label（只动按钮显示层）。
export const XH_BTN_ICON_WORDS = [
    [/^全关|^All Off/i, "开关"],
    [/^全开|^All On/i, "开关"],
    [/^刷新|^Refresh/i, "刷新"],
    [/^重置|^Reset/i, "重置"],
    [/^撤销|^撤|^Undo/i, "撤销"],
    [/^扫描|^Scan/i, "扫描"],
    [/^悬浮|^Float/i, "扩展"],
    [/^文件夹|^Folder/i, "文件夹"],
    [/^选文件|^选文件夹|^ File|^ Folder/i, "文件"],
    [/^传视频|^上传|^Upload/i, "上传"],
    [/^加音频|^Add audio/i, "音乐"],
    [/^每次随机|^Random/i, "刷新"],
    [/^生成固定值|^Roll fixed/i, "锁定"],
    [/^用上次|^Reuse last/i, "历史"],
    [/^起跑|^Start/i, "播放"],
    [/^分割|^Split/i, "拆分"],
    [/^清空|^Clear/i, "删除"],
    [/^编辑|^Edit/i, "编辑"],
    [/^更新|^Update/i, "刷新"],
    [/^添加|^加|^Add/i, "加"],
    [/^应用|^Apply/i, "勾选"],
];

/**
 * 🔴 2026-11-14 越界防线：上表里**只含中文分支**的条目。
 *
 * 为什么单独切一份：
 *   ComfyUI 官方 / 第三方插件的按钮文案是**英文**（Save / Refresh / Clear / Edit / Apply / Add …），
 *   家族自己的按钮文案是**中文**（刷新 / 上传 / 清空 / 编辑 / 应用 …）。
 *   ⇒ 「命中中文词」就是「这按钮必是家族自己的」的铁证，可以安全地在任何位置补图案；
 *   而「命中英文词」（Refresh / Clear / Edit / Update / Start / Split / Upload / Random …）
 *   官方自己也有同样的词，**绝不能单凭文案就动手**，必须另加 DOM 范围判据。
 *
 * ⚠️ 切的时候**只保留中文那一段**，不能直接用整条正则：
 *   `/^全关|^All Off/i` 整条拿来判，"All Off" 也会命中 ⇒ 官方英文按钮又被误伤。
 *   所以按 `|` 拆开，只留含中文的分支，再用 `^(?:…)` 拼回去。
 *
 *   配套：xh_icon_fill.js 的全页面兜底扫描（sweep）就靠这条区分，
 *   避免把官方按钮（`<i class="icon"> Save` 这种带前导空格的）也重写成家族样式。
 */
export const XH_BTN_ICON_WORDS_ZH = (() => {
    const out = [];
    for (const [re, icon] of XH_BTN_ICON_WORDS) {
        const zhParts = re.source.split("|").filter((p) => /[\u4e00-\u9fff]/.test(p));
        if (!zhParts.length) continue;
        try {
            out.push([new RegExp("^(?:" + zhParts.join("|") + ")", re.flags.replace("g", "")), icon]);
        } catch (e) { /* 单条正则构造失败就跳过，不影响其余 */ }
    }
    return out;
})();

/** 文案是否命中「纯中文家族词」；命中即判定为家族自己的按钮。 */
export function isFamilyChineseWord(text) {
    if (typeof text !== "string" || !text) return false;
    const clean = text.trim();
    if (!clean) return false;
    return XH_BTN_ICON_WORDS_ZH.some(([re]) => re.test(clean));
}

//  2026-11-13 家族图标统一（用户「一个一个检查，能换的都给它换了」）：
//    有些老节点还把 Unicode 图案直接写进按钮文案（"＋ 加一个排除区" / "✕" / "▲" / "▶"）。
//    这些不是 emoji，但同样不属于自家 2350 枚图标库。这里做统一显示层替换：
//    ⛔ 只认「开头 / 结尾 / 纯符号」的图案，中间夹的 "+"（如 "Ctrl + Z"）不动；
//    ⛔ 只动显示层，文案表、存档值、参数 label 一律不改。
// 2026-11-13 补：画板（Pixaroma 1:1 复刻）里还用到 ▴▾ ↻↺ ⇄ 这几个文字符号。
const XH_SYM_CLASS = "＋+−－✚✕✖✗✓✔▲▼▴▾◀▶⏵⏸↶↷⟲↻↺⟳⇄⇆↔⚙☲";
const XH_SYM_AT_EDGE = new RegExp("^[\\s" + XH_SYM_CLASS + "]|[" + XH_SYM_CLASS + "]\\s*$");
const XH_SYM_STRIP = new RegExp("^[\\s" + XH_SYM_CLASS + "]+|[" + XH_SYM_CLASS + "\\s]+$", "g");
const XH_SYMBOL_ICON = [
    [/✕|✖|✗/, "关闭"], [/✓|✔/, "勾选"],
    [/▲|▴/, "chevron-up"], [/▼|▾/, "chevron-down"],
    [/◀/, "chevron-left"], [/⏸/, "暂停"], [/⏵|▶/, "播放"],
    [/↶|⟲/, "撤销"], [/↷/, "重做"], [/＋|✚|\+/, "加"], [/−|－/, "minus"],
    [/↻|↺|⟳/, "重置"], [/⇄|⇆|↔/, "arrow-left-right"],
    [/⚙/, "设置"], [/☲/, "列表"],
];

/** 把「前导空格 / 非家族 Unicode 图案」补成家族图标；没命中的返回 false，调用方照旧 textContent。 */
export function xhDecorateButton(btn, text) {
    if (!btn || typeof text !== "string") return false;
    const hasLeadingBlank = /^\s+\S/.test(text);
    const hasEdgeSymbol = XH_SYM_AT_EDGE.test(text);
    if (!hasLeadingBlank && !hasEdgeSymbol) return false;
    const clean = text.replace(XH_SYM_STRIP, "").trim();
    const sym = XH_SYMBOL_ICON.find(([re]) => re.test(text));
    const word = XH_BTN_ICON_WORDS.find(([re]) => re.test(clean));
    const icon = sym ? sym[1] : (word ? word[1] : null);
    btn.textContent = "";
    if (icon) {
        btn.insertAdjacentHTML("afterbegin", xhIconHTML(icon, { size: 12, color: "current" }));
        if (clean) btn.appendChild(document.createTextNode(" " + clean));
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
    } else {
        btn.appendChild(document.createTextNode(clean));
    }
    btn.dataset.xhIconDone = "1";
    return true;
}

export function makeBarBtn(text, tip, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    if (text != null && !xhDecorateButton(btn, text)) btn.textContent = text;
    if (tip) btn.title = tip;
    paintBarBtn(btn, opts.role || "neutral");
    if (opts.width) btn.style.width = opts.width + "px";

    //  2026-10-29：hover 方向按档位走（白键压暗、暗底提亮），写死 1.28 白键无反馈。
    btn.onmouseenter = () => { btn.style.filter = barBtnHoverFilter(btn._xhRole); };
    btn.onmouseleave = () => { btn.style.filter = "none"; };
    ["pointerdown", "mousedown", "dblclick", "keydown", "click"].forEach((ev) =>
        btn.addEventListener(ev, (e) => e.stopPropagation())
    );
    return btn;
}

export function styleLangBtn(btn, lang) {
    if (!btn) return;
    lang = lang || currentLang();
    btn.textContent = lang === "zh" ? "中" : "EN";
    // 方案 B：不再用 #8a8a8a / #c0392b 两种实心色刷状态（那是"5套皮肤并存"之一），
    // 改用 active 档（蓝底蓝边蓝字），状态一眼可辨又与全家族同源。
    paintBarBtn(btn, "active");
}

export function makeLangBtn(node) {
    const btn = makeBarBtn(null, null, { width: 36 });
    btn.onclick = (e) => { e.stopPropagation(); toggleLang(); };
    styleLangBtn(btn);
    _LANG_BTNS.add(btn);
    if (node) node._xhLangBtn = btn;
    return btn;
}

//  2026-10-28：节点工具条上的  配色键**已删除**（用户要求「多余，没必要存在」）。
//    配色统一走：节点右键 →  节点配色 → 完整画板（web/xh_color_picker.js），
//    对**任何节点**都开放（官方节点也能配）。
//    工具条只剩「中/EN」。

export function releaseButtons(node) {
    if (node && node._xhLangBtn) _LANG_BTNS.delete(node._xhLangBtn);
}

/**
 *  家族通用 toast（底部浮出一行小字，2.6 秒后自动消失）。
 *  ComfyUI 桌面版是 Electron，**原生 alert / prompt / confirm 全被禁**
 *    ⇒ 任何「提示用户一句话」的场合都不能用 alert，必须用这个。
 */
export function xhToast(msg, opts) {
    if (typeof document === "undefined") return;
    const o = opts || {};
    try {
        const old = document.getElementById("xh-family-toast");
        if (old) old.remove();
        const t = document.createElement("div");
        t.id = "xh-family-toast";
        t.textContent = String(msg == null ? "" : msg);
        t.style.cssText =
            "position:fixed;left:50%;bottom:" + (o.bottom || 34) + "px;transform:translateX(-50%);z-index:100000;"
            + "max-width:min(520px,86vw);white-space:pre-wrap;text-align:center;"
            + "background:var(--xh-surface,#252525);color:var(--xh-text,#e8e8e8);"
            + "border:1px solid var(--xh-primary,#ffffff);border-radius:8px;"
            + "padding:9px 16px;font-size:13px;line-height:1.5;"
            + "box-shadow:0 8px 26px rgba(0,0,0,.55);pointer-events:none;";
        document.body.appendChild(t);
        setTimeout(() => t.remove(), o.ms || 2600);
    } catch (e) { /* 忽略 */ }
}
if (typeof window !== "undefined") window.XHToast = xhToast;

// ══════════════════════════════════════════════════════════════════════
//  帮助图标 = 语义名「帮助」→ 库内 circle-help（XH 图标库，web/xh_icons/）
//  2026-11-12：原手绘 XH_HELP_SVG 已删 —— 库里 circle-help.svg 现成的，
//    统一走 xhIconHTML("帮助")，零手写 SVG。
// ────────────────────────────────────────────────────────────────────────

// ── 通用：SVG 源码 → mask 图标 ──────────────────────────────────────────
//  两条硬约束（2026-10-28 真机踩坑，见 skill frontend_n2.md §21）：
//   ① data URI 必须**整体 encodeURIComponent**（SVG 里的空格会把 CSS url() 截断
//      ⇒ mask 失效、图标变成一个白方块）；
//   ② SVG 源码里**必须用双引号**（encodeURIComponent 不转义单引号，
//      而 CSS 的 url('…') 用单引号包着 ⇒ 裸单引号会提前闭合 CSS 字符串）。
const _iconCssDone = new Set();

/** 注入一条 mask 图标样式（幂等，同一个 cls 只注一次）。 */
export function ensureIconCSS(svg, cls) {
    if (typeof document === "undefined" || _iconCssDone.has(cls)) return;
    _iconCssDone.add(cls);
    const url = "data:image/svg+xml," + encodeURIComponent(svg);
    const st = document.createElement("style");
    st.id = "xh-icon-" + cls;
    st.textContent =
      "." + cls + "{" +
      "display:inline-block;vertical-align:-3px;width:24px;height:24px;" +
      "background:currentColor;" +
      "-webkit-mask:url('" + url + "') center/contain no-repeat;" +
      "mask:url('" + url + "') center/contain no-repeat;" +
      "}";
    document.head.appendChild(st);
}

/** 由 SVG 源码生成图标 HTML（返回 <span>，直接塞进按钮 innerHTML）。 */
export function iconFromSVG(svg, cls) {
    ensureIconCSS(svg, cls);
    return '<span class="' + cls + '"></span>';
}

/**  2026-11-11 用户「按键这个框窄窄的有点小，稍微大一些」：
 *  顶栏四颗按钮的图案尺寸**唯一真源**。CSS 里的 min-width/min-height/padding
 *  也照这个数字配套（20px 图案 + 5px 8px 内边距 = 36×30 的方框）。
 *  改尺寸只改这一个常量 + CSS 那三行，别再四个调用点各写各的数字。
 *  实测改前：图案 16px、内边距 3px 6px ⇒ 方框约 29×22，比官方 4px 8px 还窄。
 */
export const XH_TB_ICON_SIZE = 20;

/**
 *  2026-11-11：顶栏按钮专用 —— 自家图标库图案的 HTML 字符串版。
 * 走统一入口 xhIconUrl（语义名 → 文件 URL），调用处零路径、零文件名。
 * 用 CSS mask + background:currentColor ⇒ 图案颜色跟着按钮文字走：
 *   关态按钮文字白 → 白图案；开态 / 门面文字深墨 → 深墨图案。
 * 与 xhIconMask 同一套规范（24 网格 / 2px / currentColor），只是返回字符串，
 * 方便塞进 makeToolbarButton 的 innerHTML。
 */
export function xhIconHTML(name, opts = {}) {
    const { size = XH_TB_ICON_SIZE, color = "current", title = "" } = opts;
    let url = "";
    try { url = xhIconUrl(name); } catch (e) { /* 图标库没就绪也不能炸整排按钮 */ }
    const bg = color === "current" ? "currentColor"
             : color === "brand" ? "var(--xh-primary,#E8A33C)" : color;
    const style = "display:inline-block;width:" + size + "px;height:" + size + "px;"
        + "vertical-align:middle;flex-shrink:0;background-color:" + bg + ";";
    if (!url) return '<span class="xh-icon-mask" style="' + style + '">?</span>';
    //  2026-11-11 用户「再说一遍，它不显示图案字」：真机截图里三颗按钮全空白。
    //    根因（已实测）：这里原来写 url("http://...svg")，而整段 style 用双引号包成
    //    HTML 属性 —— 浏览器在 url( 后面那个 " 处就把 style 属性提前闭合，
    //    mask 声明全丢 ⇒ 只剩一个没有图案的色块/空白。对齐线那颗走 xhIconMask
    //    （DOM 逐条赋值 style，不经过 HTML 属性解析）所以一直显示正常。
    //  修法：URL 一律用单引号（在双引号 HTML 属性里合法），并把 mask 简写拆成
    //    与 xhIconMask 完全相同的逐条声明，四颗从此同一套写法、同一套结果。
    const u = "url('" + String(url).replace(/'/g, "%27") + "')";
    const mask = "-webkit-mask-image:" + u + ";mask-image:" + u + ";"
        + "-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;"
        + "-webkit-mask-position:center;mask-position:center;"
        + "-webkit-mask-size:contain;mask-size:contain;";
    return '<span class="xh-icon-mask"' + (title ? ' title="' + title + '"' : "")
         + ' style="' + style + mask + '"></span>';
}

/**
 *  帮助图标 HTML（官方 lucide--circle-help，圆圈里一个问号）。
 *  2026-10-28：原名 `lampIconHTML`（手绘灯泡）已废弃并移除 —— 用户嫌太丑、且官方没有灯泡。
 *  2026-11-11：这个只给**节点面板 / 帮助窗口标题**用；顶栏那颗已改走
 *    xhIconHTML("帮助")（自家图标库），别把两处混为一谈。
 */
export function helpIconHTML(cls) {
    //  2026-11-12：改走图标库（语义名「帮助」→ circle-help），不再手绘 SVG。
    return xhIconHTML("帮助", { size: 24, color: "current" });
}

// ══════════════════════════════════════════════════════════════════════
//  顶栏按钮统一样式 —— **唯一真源**（XiaoHei / 帮助 / 工作流 三颗共用）
// ══════════════════════════════════════════════════════════════════════
//  2026-10-28 用户暴怒定案（真机截图取证）：
//   「那个工作流的那个图标，它怎么不是黄色呀，能不能统一起来呀？
//     跟那个问号一样，会变化成黄色。哎，XiaoHei 也是。要跟那个问号达成同样的效果，
//     风格要一致，同样效果」
//
//    根因（别再犯）：**三处各写各的 CSS，还抢同一个 style id**
//     · xh_settings_panel.js   → <style id="xh-tb-btn-css">  打开态 = 淡紫 #8a8a8a
//     · xh_workflow_browser_v12.js → <style id="xh-tb-btn-css"> 打开态 = 主色黄（**被挤掉了**）
//     · xh_help_browser.js     → <style id="xh-help-browser-css"> 打开态 = 淡黄底 + 黄图标
//     web/ 下按字母序加载 ⇒ 设置面板那份**先注入**，工作流那份 `getElementById` 命中直接 return
//     ⇒ 工作流按钮和 XiaoHei 按钮显示淡紫，只有问号是黄的 —— 三种颜色三种风格。
//
//    修法：样式**只在本文件注入一次**，三颗按钮共用同一个 class（`.xh-tb`）、
//      同一个打开态 class（`.xh-tb-open`）⇒ 不可能再分叉。
//
//    尺寸规范（2026-11-11 用户「方框窄窄的有点小，稍微大一些」）：
//      图案 20px（唯一真源 XH_TB_ICON_SIZE）+ 内边距 5px 8px + 最小 36×30，
//      四颗同宽同高、图案居中。改前是 16px / 3px 6px / 约 29×22，
//      比官方 .comfyui-button 的 4px 8px 还窄一圈。只动尺寸，配色一行不动。
//
//    颜色规范（四颗按钮完全一致，2026-11-11 用户要求「照抄 ComfyUI 官方顶栏按钮」）：
//     常态   **官方按钮底色** var(--secondary) + **官方前景色** var(--foreground) 的图案
//     悬停   实心家族黄底 + 深墨字 #1c1c1c（瞬时信号）
//     打开   实心家族黄底 + 深墨字（常驻，移开鼠标不掉、刷新保留）
//     门面   图案仍是小黑爪印，但 2026-11-15 起**取消常亮黄**（用户「点它的时候才显示」）：
//            常态官方灰 + 浅色爪印 ⇒ 点开设置面板才亮黄 + 深墨爪印，关面板退回灰。
//            门面身份靠图案本身，⛔ 不靠常亮底色抢「运行」按钮的视觉焦点。
//      不自造颜色：一度硬编码一枚中灰、还称之为「浅灰」，用户当场指出官方那个
//        底色是黑的不是灰。从官方截图与官方 CSS 实测：顶栏背景 #171718(--background)、
//        按钮底 #262729(--secondary)、图案 #C0C0C1~#fff(--foreground)、边框 #494a50(--border)。
//        用官方变量还自动跟随浅色主题，不会再出现「浅色主题白图案糊掉」。
//      图案是 CSS mask + currentColor，按钮文字色一变，图案自动跟着翻；
//        本包 syncXhCssVars 只写 --xh-* 变量，不会污染官方这几个变量。
//    为什么是「实心黄底 + 深墨字」而不是「淡黄底 + 黄字」：
//      淡黄（黄 14% 混透明）叠在深紫底上出来是**暗绿褐色**（实测 #3f4124），
//      根本不像「黄」—— 用户看到的就是这个效果所以他不认。
//      实心主色底 + WCAG 算出的深墨字（--xh-on-primary，亮黄⇒深墨）才是真黄。
//    选择器必须带 `.comfyui-button` 前缀 + `:not(:disabled)`：
//      官方 hover 规则是 `.comfyui-button:not(:disabled):hover`（权重 0,3,0）且带 !important
//      ⇒ 我们的 `.xh-tb:hover`（0,2,0）会被官方**压过去**，悬停根本不生效。
//      用 `.comfyui-button.xh-tb:hover:not(:disabled)`（0,4,0）才稳赢。
export const XH_TB_CLASS = "xh-tb";
export const XH_TB_OPEN_CLASS = "xh-tb-open";

/** 注入顶栏按钮统一样式（幂等：整个页面只注一次）。 */
export function ensureToolbarButtonCSS() {
    if (typeof document === "undefined") return;
    //  顺手同步一次品牌色/官方色 CSS 变量（DOM 元素要靠它上色）
    try { syncXhCssVars(); } catch (e) {}
    if (document.getElementById("xh-tb-btn-css")) return;
    const st = document.createElement("style");
    st.id = "xh-tb-btn-css";
    st.textContent = `
/* ── XiaoHei 家族顶栏按钮（门面 / 帮助 / 工作流 / 对齐线 四颗共用同一份样式）── */
/*  2026-11-11：常态配色 1:1 照抄 ComfyUI 官方顶栏按钮，用官方变量跟随主题。
   深色主题 = 底 #262729（近黑）+ 图案 #fff；浅色主题自动翻，不再硬编码自造灰。 */
.comfyui-button.xh-tb{
  background-color:var(--secondary,#262729) !important;
  color:var(--foreground,#ffffff) !important;
  border-color:var(--border,#494a50) !important;
  font-weight:900 !important;
  font-size:17px !important;
  padding:5px 8px !important;
  min-width:36px !important;
  min-height:30px !important;
  box-sizing:border-box !important;
  align-items:center !important;
  justify-content:center !important;
  border-radius:0 !important;
  transition:background-color .15s,color .15s,border-color .15s !important;
}
/* 图案色不写死白：用官方 --foreground 上色，深浅主题由官方决定；
   currentColor 让图案跟随按钮文字，开态 / 门面又自动翻成深墨。 */
body .comfyui-button.xh-tb .xh-icon-mask{vertical-align:middle;}
/* ⏱ 2026-11-17：常态主按钮 = 主题标题色；hover 才亮一下琥珀金（瞬时信号）。
   用 !important 盖过 paintBarBtn 写的内联背景；--xh-acc 用户自定义按键色仍优先于常态。 */
.xh-bar-btn.xh-bar-btn-primary:hover:not(:disabled){
  background-color:var(--xh-primary,#E8A33C) !important;
  color:var(--xh-on-primary,#1c1c1c) !important;
  border-color:var(--xh-primary,#E8A33C) !important;
}
/*  2026-11-15：删除「门面常亮品牌色」规则 .xh-tb-brand（无条件琥珀金底）。
    用户原话「不要让它一直显现出我们的黄色，点它的时候它才显示」。
    现在四颗按钮共用同一套：常态官方灰 → hover / 按下亮一下 →
    面板打开 .xh-tb-open 常驻黄 → 关面板退回灰。
    老 DOM 万一还带 xh-tb-brand，删规则后自然落回 .xh-tb 常态灰，不会出错。 */
/* 按下瞬间：家族黄（点它就有反馈；松开后面板开着由 .xh-tb-open 接着亮） */
.comfyui-button.xh-tb:active:not(:disabled){
  background-color:var(--xh-primary,#E8A33C) !important;
  color:var(--xh-on-primary,#1c1c1c) !important;
  border-color:var(--xh-primary,#E8A33C) !important;
}
/* 悬停：品牌色实心 + 深墨字（浅底必须配深字） */
.comfyui-button.xh-tb:hover:not(:disabled){
  background-color:var(--xh-primary,#E8A33C) !important;
  color:var(--xh-on-primary,#1c1c1c) !important;
  border-color:var(--xh-primary,#E8A33C) !important;
}
/* 打开：品牌色 */
/*  2026-11-11：打开态原来是 #ffffff 白底 + 深墨字，正是用户说的
   「常驻那个背景白、图案黑」。现在白底深图这套配色从顶栏彻底消失：
   打开态统一成家族常驻黄 + 深墨图案（用户此前定的常驻色，保留）。 */
.comfyui-button.xh-tb.xh-tb-open{
  background-color:var(--xh-primary,#E8A33C) !important;
  color:#1c1c1c !important;
  border-color:var(--xh-primary,#E8A33C) !important;
}
.comfyui-button.xh-tb.xh-tb-open:hover:not(:disabled){
  background-color:var(--xh-primary,#E8A33C) !important;
  color:#1c1c1c !important;
  filter:brightness(1.08) !important;
}
`;
    document.head.appendChild(st);
}

/**
 * 造一颗「家族统一样式」的顶栏按钮。
 * @param html  按钮内容（文字或 iconFromSVG 出来的图标）
 * @param title 悬停提示
 * @param onClick 点击回调
 */
export function makeToolbarButton(html, title, onClick) {
    ensureToolbarButtonCSS();
    const btn = document.createElement("button");
    btn.className = "comfyui-button " + XH_TB_CLASS;
    if (html != null) btn.innerHTML = html;
    if (title) btn.title = title;
    if (typeof onClick === "function") btn.onclick = onClick;
    return btn;
}

/** 把按钮的「打开态」同步成统一样式（面板开 = 黄，关 = 回常态）。 */
export function setToolbarButtonOpen(btn, open) {
    try { if (btn) btn.classList.toggle(XH_TB_OPEN_CLASS, !!open); } catch (e) { /* 忽略 */ }
}

//  挂一份到 window：给**不能 import 本模块**的文件用。
//    xh_settings_panel.js 顶层没有 import（web/ 按字母序加载时 app.js 可能未就绪，
//    顶层 import 会抛），它改用 window 取这几个函数（调用发生在 setup()，那时已就绪）。
if (typeof window !== "undefined") {
    //  2026-10-29：品牌色也挂一份给**不能 import 本模块**的文件用
    //    （xh_settings_panel.js 顶层没有 import，只能走 window）
    window.XH_BRAND = XH_BRAND;
    window.XH_brandTextColor = brandTextColor;
    window.XH_brandButtonBg = brandButtonBg;
    window.XH_brandButtonTx = brandButtonTx;
    window.XH_isLightTheme = isLightTheme;
    window.XH_officialPalette = officialPalette;
    window.XH_ensureToolbarButtonCSS = ensureToolbarButtonCSS;
    window.XH_TB_ICON_SIZE = XH_TB_ICON_SIZE;
    window.XH_makeToolbarButton = makeToolbarButton;
    window.XH_setToolbarButtonOpen = setToolbarButtonOpen;
    //  给不能 import kit 的 xh_settings_panel.js 用（它走 window 取函数）
    window.XH_iconHTML = xhIconHTML;
    window.XH_TB_CLASS = XH_TB_CLASS;
    window.XH_TB_OPEN_CLASS = XH_TB_OPEN_CLASS;
}

/**
 * 把 DOM widget 提到 node.widgets 最前面（置顶）。
 * serialize:false 的 widget 不参与 widgets_values 序列化，移动顺序不影响存档。
 * 这样中/EN +  永远贴在节点内容区最上方，不会被参数控件挤到中间/底部。
 */
export function pinWidgetToTop(node, widget) {
    if (!node || !widget || !Array.isArray(node.widgets)) return;
    const i = node.widgets.indexOf(widget);
    if (i > 0) {
        node.widgets.splice(i, 1);
        node.widgets.unshift(widget);
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/**
 *  把 DOM widget 的行高**永久钉死**为 px（家族唯一实现，2026-10-14 第三轮修「节点上下一大片空白」）。
 *
 * 为什么必须连 `computeLayoutSize` 一起撤掉 —— 前端源码实证（comfyui_frontend_package 1.55.14）：
 *   ① 画布布局 `_arrangeWidgets`：`if(e.computeSize){高度=computeSize()[1]+4}` →
 *      我们给了 computeSize ⇒ 走「固定」分支，画布模式下本来就正常。
 *   ② **Vue Nodes（Nodes 2.0）根本不看 computeSize**。它把控件渲染成 CSS Grid
 *      （`WidgetGrid` → `lg-node-widgets`，`flex:1`），每行的尺寸是：
 *          rowSize = shouldExpand(type) || hasLayoutSize ? "auto" : "min-content"
 *      （源码：settingStore 里 `deriveWidgetRenderState` → `hasLayoutSize: typeof e.computeLayoutSize === "function"`）
 *      而 `DOMWidgetImpl` 的**基类自带** `computeLayoutSize` ⇒ 每个 DOM widget 的行都是 `auto`
 *      ⇒ 节点多出来的竖向空间被**平均灌进所有 `auto` 行**（工具条行 / 状态行 / 文本框行）
 *      ⇒ 工具条下面、状态条下面各留一大块空白，而且**节点拖得越大、空白越大**。
 *      官方节点没这毛病，是因为它的控件不是 DOM widget（native textarea 走 `shouldExpand`，
 *      只有文本框那一行是 `auto`）—— 所以「只有文本款跟着变大」。
 *
 *   修法：本函数已用 computeSize 把高度定死，于是**把 computeLayoutSize 抹掉**
 *      · Vue：`hasLayoutSize = false` ⇒ 行变 `min-content` ⇒ 不再吸收空白
 *      · 画布：`_arrangeWidgets` 先命中 `e.computeSize` 分支，行为不变
 *   只对「固定高度」的 DOM widget 用（工具条 / 状态条 / 信息条 / 按钮条 / 开关轨…）；
 *   **会生长的**（图片画廊 / 3D 预览 / 视频播放器 / LoRA 行栈 / 滑块）**不要调**，
 *   它们就该吃掉多余空间。
 *
 * @param widget addDOMWidget 返回的 widget
 * @param px     固定高度（px）；也可以传**函数** `() => 高度`（高度会变、但对「节点尺寸」不敏感的
 *               场景，例如视频播放器按宽高比算出的高度）—— 函数每次问都要给同一个答案，
 *               绝不能用 `node.size` 反推，否则会和节点尺寸互相喂成无限增长。
 */
export function lockDomWidgetHeight(widget, px) {
    if (!widget) return null;
    const resolve = (typeof px === "function") ? px : () => px;
    const size = () => Math.max(1, Math.round(Number(resolve()) || 1));
    try { widget.computeSize = (w) => [w || 200, size()]; } catch (e) {}
    try { widget.getMinHeight = () => size(); } catch (e) {}
    try { if (widget.options) widget.options.getMinHeight = () => size(); } catch (e) {}
    try { widget.computeLayoutSize = undefined; } catch (e) {}
    return widget;
}

/**
 *  2026-10-16 无头浏览器真机实锤：Vue 前端（settingStore 的 ComfyNode）构造节点时会把
 *    `node.size` **换成 Float64Array**（调用栈：setInitialSize ← new ComfyNode ← expandToFitContent）。
 *    `Array.isArray(new Float64Array([400,1994]))` === **false**！
 *    ⇒ 全族所有 `Array.isArray(node.size)` 守卫**集体失效**：
 *      compactNodeSize / forceCompactOnSpawn / SetGet refreshLayout 从来没真正执行过一次，
 *      「拖出来就巨高」从头到尾没修掉就是这个原因（2026-10-13/16 两轮修复全打在空气上）。
 *    判断「能不能当 [w, h] 用」必须**数组和类型化数组都认**；读 `size[1]` / 写 `size[1]=x`
 *    对两者都通用（Float64Array 支持下标读写，且前端认原地写 —— 实测写 360/800 都立即生效）。
 *
 * @param v 待判断的值（通常是 node.size 或 computeSize() 的返回值）
 * @returns 是否为可当 [宽, 高] 用的序列
 */
export function isSizeLike(v) {
    return !!v && typeof v === "object" && typeof v.length === "number" && v.length >= 2
        && typeof v[0] === "number" && typeof v[1] === "number";
}

/**
 *  2026-10-16「生成/读档虚高」通杀补丁 —— XiaoHei 家族节点一拖出来就巨高的根因与解法。
 * 改这个函数前先读这段（无头浏览器真机测量实锤，不是猜的）：
 *
 *  根因链：
 *   ① 节点**构造期**（LiteGraph.createNode）前端就按**全部声明控件**算初始 size 并写进
 *      node.size —— 提示词表 32 个 prompt 框 → 实测 size[1]=1994；分段表 64 行 → 1800；
 *      MSR / 视频加载默认收起的 6~7 个高级参数也各吃一份。**此时我们的折叠代码还没跑**
 *      （onNodeCreated 在构造之后才调）。
 *   ② 我们在 onNodeCreated 里 w.hidden 折叠掉多余控件，但 **node.size 不缩**。
 *   ③ Vue 网格铁律（前端 settingStore 源码）：只要有一行是 `auto`（`textarea` 就在
 *      shouldExpand 名单里），整个 widget 网格 `flex:1` 撑满节点身体 ⇒ 多出的高度
 *      **全灌进那个多行框**（提示词表实测 prompt_0 行高 1465px）；没有多行框的节点
 *      则底部留一条空白。
 *   ④ 老 compactNodeSize 想缩，但 `_xh_*_user_resized` 被生成期间的前端布局同步
 *      **误触发**成 true（实测两个节点 spawn 后 ur 全是 true）⇒ 永久罢工。
 *   ⑤  2026-10-16 无头真机实锤（前两轮修复全死在这一点上）：Vue 前端把 node.size
 *      换成 **Float64Array**（setInitialSize ← new ComfyNode），`Array.isArray(node.size)`
 *      恒为 false ⇒ compactNodeSize / 本函数 / SetGet refreshLayout 的 Array.isArray 守卫
 *      **每次都直接 return，一次都没执行过**。已全族改用 isSizeLike()（数组/类型化数组都认）。
 *
 *  实测两条定心事实：
 *   · createNode 一造出来 size 就是虚高值（构造期写好，早于 onNodeCreated/onConfigure）；
 *   · add 之后 2 秒内 size 稳定不反弹 ⇒ **带锁单次写回就能钉住**，不存在无限反馈环。
 *
 *  本函数的对策（排 5 个延迟任务 +120/+350/+700/+1300/+2200ms）：
 *   · 只在「高度明显高于内容（> cs + maxExcess）」时才动手，只改高度不碰宽度；
 *   · **spawnSize 护栏**：调用方在折叠前把 node.size[1] 传进来，之后只缩「还等于这个
 *     虚高值」的情况 —— 用户一拖动尺寸就绝不等于它 ⇒ 绝不跟用户抢尺寸（2026-10-01
 *      「改框数把手动拖大的节点缩回原形」事故的教训）；
 *   · 没传 spawnSize 时退化成「第一次见到就缩」（120ms 内人类不可能拖完节点）；
 *   · 写尺寸时给 lockKeys / _xh_auto_sizing 上锁，防止被 onResize 误判成用户操作；
 *     确认缩的是 bug 虚高时，把 userKeys（被误触发的 user_resized）一并清掉，
 *     让后续 compactNodeSize 恢复正常工作。
 *
 * @param node    节点实例
 * @param opts.maxExcess  认为「虚高」的最小超出量 px。巨肥通病（提示词表 +1634 /
 *                        分段表 +1312）用默认 400；只藏一两个小控件的节点传 12~100。
 * @param opts.spawnSize  折叠前读到的 node.size[1]（构造期虚高值）。给了就只缩相等的。
 * @param opts.lockKeys   本节点 onResize 用的 auto_sizing 锁名数组（如 ["_xh_cp_auto_sizing"]）
 * @param opts.userKeys   本节点的 user_resized 标志名数组（如 ["_xh_cp_user_resized"]）
 */
export function forceCompactOnSpawn(node, opts = {}) {
    if (!node) return;
    const maxExcess = Number.isFinite(opts.maxExcess) ? opts.maxExcess : 400;
    const spawnSize = Number.isFinite(opts.spawnSize) ? opts.spawnSize : null;
    const lockKeys = Array.isArray(opts.lockKeys) ? opts.lockKeys : [];
    const userKeys = Array.isArray(opts.userKeys) ? opts.userKeys : [];
    const DELAYS = [120, 350, 700, 1300, 2200];
    let seen = null;      // 第一次见到的虚高值（布局延迟写回时按它认亲）
    let handsOff = false; // 用户动过尺寸 ⇒ 收手
    const shrink = (cs) => {
        try { node._xh_auto_sizing = true; } catch (e) {}
        for (const k of lockKeys) { try { node[k] = true; } catch (e) {} }
        try { node.size[1] = cs[1]; } catch (e) {}
        for (const k of lockKeys) { try { node[k] = false; } catch (e) {} }
        try { node._xh_auto_sizing = false; } catch (e) {}
        for (const k of userKeys) { try { if (k in node) node[k] = false; } catch (e) {} }
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
        try { node.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
    };
    for (const d of DELAYS) {
        setTimeout(() => {
            try {
                if (handsOff || !node || !isSizeLike(node.size)) return;
                const cs = node.computeSize ? node.computeSize() : null;
                if (!isSizeLike(cs)) return;
                const cur = node.size[1];
                const excess = cur - cs[1];
                if (excess <= maxExcess) { seen = null; return; }   // 已经紧凑，重置认亲值
                // ① 还等于出生时那个虚高值 ⇒ 铁定是 bug（用户拖过就绝不相等）
                if (spawnSize !== null && Math.abs(cur - spawnSize) <= 4) { shrink(cs); return; }
                // ② 第一次见到虚高：120ms 内人类不可能拖完 ⇒ 记下就缩；之后才见到 ⇒ 记下等认亲
                if (seen === null) {
                    if (d > 120) return;          // 迟到 sighting 且没有 spawnSize 佐证 ⇒ 不赌，收手
                    seen = cur;
                } else if (Math.abs(cur - seen) > 4) {
                    handsOff = true; return;      // 值变了 = 用户动过 ⇒ 收手
                }
                shrink(cs);
            } catch (e) {}
        }, d);
    }
}

/**
 * 给节点挂标准工具条（只有「中/EN」），内部 addDOMWidget，返回 {bar, langBtn, colorBtn:null, widget}。
 *
 *  工具条会**强制置顶**：addDOMWidget 后把该 widget 移到 node.widgets 数组最前面，
 *    中/EN +  永远贴在节点内容区最上方。
 *    （serialize:false 的 widget 不参与 widgets_values 序列化，移动顺序不影响存档。）
 *
 * 宽度自适应：bar 设了 width:100%，ComfyUI 会把 DOM widget 分配到节点内容区整宽，
 *    按钮横向排满（中/EN 与  永远并排）；图片画廊同理，节点拉宽时自动多排几列。
 * 高度：由 `lockDomWidgetHeight(widget, 28)` 钉死 —— 画布与 Vue Nodes 两种模式下
 *    都**不再吸收**节点多余的竖向空间（2026-10-14 修复）；多余空间改由文本框 /
 *    3D 预览等真正「可生长」的控件吃下，与官方节点行为一致。
 *
 * @param node 节点实例
 * @param opts.widgetName DOM widget 名（默认 xh_ui_bar）
 * @param opts.prependNodes 放在「中/EN」**左边**的额外元素（可选）
 * @param opts.appendNodes  放在「」**右边**的额外元素（可选）
 * @param opts.mount        false = **只造条不挂载**（返回的 widget 为 null），
 *                          由调用方自己 addDOMWidget —— 给「工具条要嵌在复合容器里 /
 *                          要贴节点底部而不是置顶」的节点用（XiaoHei-Slider / XiaoHei-LoopStack /
 *                          XiaoHei-SetGet / XiaoHei-图片列表 / XiaoHei-标签 / XiaoHei-计时器 等）。
 *                          条本身的样式、按钮、拼装顺序、事件拦截仍是家族唯一实现。
 * @param opts.colorOnPick  【已废弃 2026-10-28】 按钮已删；改用 node.setNodeColor(hex)（见 xh_label.js）。
 */
export function makeXHToolbar(node, opts = {}) {
    installTitleAutoColor(node);        // 家族节点一律：标题文字按标题栏底色自动黑/白
    installVueTitleAutoColor();         // Vue Nodes：canvas 不画标题，改在 DOM 标题栏上落字色
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;gap:6px;padding:3px 4px;width:100%;box-sizing:border-box;flex-wrap:wrap;background:transparent;";
    for (const el of (opts.prependNodes || [])) if (el) bar.appendChild(el);
    //  🔴🔴 2026-11-13：内容区「中/EN」键**从根上不再创建**（用户被"鬼影"烦了三轮）。
    //    根因（时序竞态，⛔ 别再恢复下面这段兜底）：
    //      旧逻辑拿 window.__xhTbHookHits 判断"官方选中工具条是否可用"，为 0 就把
    //      makeLangBtn() 塞进节点内容区（.xh-lang-content）。但官方钩子
    //      getSelectionToolboxCommands **只有用户点选节点时**才被调用 ⇒ 节点创建
    //      (onNodeCreated) 永远早于第一次点选 ⇒ 计数恒为 0 ⇒ 每个节点一出生就被塞一颗「中」；
    //      等用户点一下，钩子命中 + dropContentLangButtons() 才把它删掉 ⇒ 看起来就是
    //      "点一下鬼影才消失"。分辨率选择器还被两个扩展各挂一次工具条 ⇒ 一次冒两颗。
    //    修法：**不再创建**。中/EN 唯一入口 = 官方选中工具条（xh_node_toolbar.js 的
    //      LANG_CMD，选中节点才浮出），节点本体一律不挂 —— 事后 removeChild 永远有时序漏网。
    //    ⛔ 不许改回默认开启，⛔ 不许再用 __xhTbHookHits 做运行时判定。
    //    contentLang:true 只留给"确实跑在不支持官方钩子的老前端"的显式兜底，默认关闭；
    //    noLang 仍兼容旧调用方（历史上声音播放节点传过），现在等价于默认值。
    const langBtn = (opts.contentLang === true && !opts.noLang) ? makeLangBtn(node) : null;
    if (langBtn) {
        langBtn.classList.add("xh-lang-content");   // 老前端专用；钩子命中时仍会被清掉
        bar.appendChild(langBtn);
    }
    //  2026-10-28： 配色键已删（配色走右键菜单的完整画板，对任何节点都开放）。
    //    返回值里仍保留 colorBtn 字段（恒为 null），避免老调用方解构后崩。
    for (const el of (opts.appendNodes || [])) if (el) bar.appendChild(el);
    ["pointerdown", "mousedown", "dblclick", "keydown", "click"].forEach((ev) =>
        bar.addEventListener(ev, (e) => e.stopPropagation())
    );
    //  barHeight：工具条 DOM 控件锁定的行高。默认 28（常规小按钮工具条）；
    //    声音播放节点塞了 92px 大闹钟，需要传更大的值（如 112），否则会被 28px 条框裁掉。
    const barH = Math.max(1, Math.round(Number(opts.barHeight) || 28));
    let widget = null;
    if (opts.mount !== false) {
        try {
            widget = node.addDOMWidget(opts.widgetName || "xh_ui_bar", "custom", bar, {
                serialize: false,
                hideOnZoom: false,
                getMinHeight: () => barH,
            });
            //  插槽定高（2026-10-11 二轮 → 2026-10-14 三轮才真正修好，见 lockDomWidgetHeight 注释）：
            //    只写 computeSize 对 **Vue Nodes 无效** —— Vue 把控件渲染成 Grid，
            //    行高只看 `hasLayoutSize = !!computeLayoutSize`，DOM widget 基类自带它，
            //    所以工具条行永远是 `auto`，节点多出的高度全灌进来 → 按钮 28px、下面空一大块。
            //    必须连 computeLayoutSize 一起撤掉，行才会变 `min-content`。
            //    节点多出的高度改流向文本框 / 3D 预览等真正的「可生长」控件（与官方节点行为一致）。
            lockDomWidgetHeight(widget, barH);
        } catch (e) {
            console.warn("[XiaoHei UI Kit] 工具条挂载失败:", e);
        }
        //  序列化加固（2026-10-10）：本机 ComfyUI 新前端**不认** options.serialize=false，
        //    照样把工具条写进 widgets_values（就是数组开头那个 ""）；切换工作流重载时
        //    positional 回填会整体错位一格 → 下拉框变红 / 显示成数字。三重堵住。
        try {
            if (widget) {
                widget.serialize = false;
                if (widget.options) widget.options.serialize = false;
                widget.serializeValue = () => undefined;
            }
        } catch (e) {}
        pinWidgetToTop(node, widget);                   // widgets 数组置顶：中/EN +  永远在节点内容区最上方

        //  消除工具条上下留白（2026-10-11，用户反馈节点顶部长块空白）：
        //    Vue 节点把 widgets 渲染成 flex 列，DOM widget 的包装容器默认可被拉伸，
        //    节点多余的竖向空间全灌进工具条行 → 按钮 28px、上下各空一大块。
        //    修法：工具条自身定高不伸缩 + 渲染后把它的包装容器 flex 锁死为「不拉伸」。
        bar.style.flex = "0 0 auto";
        bar.style.height = barH + "px";
        bar.style.overflow = "hidden";
        const _lockBarRow = () => {
            try {
                const el = widget && widget.element;
                const p = el && el.parentElement;
                if (p) {
                    p.style.flex = "0 0 auto";
                    p.style.height = barH + "px";
                    p.style.overflow = "hidden";
                    p.style.minHeight = "0";
                }
            } catch (e) {}
        };
        setTimeout(_lockBarRow, 0);
        setTimeout(_lockBarRow, 300);                   // Vue 二次渲染后再锁一次
        onLangChanged(() => setTimeout(_lockBarRow, 50)); // 语言切换重排后再锁（kit 末尾已挂全局事件，这里复用）
    }
    //  2026-10-29：节点顶部那条官方工具条上的「中/EN + 」由 web/xh_node_toolbar.js
    //    用官方钩子 getSelectionToolboxCommands 注册（两套画布模式通吃），这里不再管。
    return { bar, langBtn, colorBtn: null, widget };
}

// ---- ④ 下拉框「显示中文、存值不变」（官方钩子 options.getOptionLabel）----
//
// 铁律：**绝不改 w.options.values**（那是存档值），只用 getOptionLabel 换显示文字。
// 函数不进工作流 JSON，所以分享出去不会污染别人的图。
//
// @param table { widgetName: { value: "中文显示" } }；英文态直接删掉钩子 → 回落显示原值
export function applyComboLabels(node, lang, table) {
    if (!node || !node.widgets || !table) return;
    const zh = (lang || "zh") === "zh";
    for (const w of node.widgets) {
        if (!w || !w.options) continue;
        const map = table[w.name];
        if (!map) continue;
        if (zh) {
            w.options.getOptionLabel = (v) => (v == null ? "" : (map[String(v)] || String(v)));
        } else {
            try { delete w.options.getOptionLabel; } catch (e) {}
        }
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/**
 * 双向下拉标签（2026-10-11）：中/EN 两种语言**都**装 getOptionLabel 钩子，
 * 解决「原值是中文 → EN 态显示中文；原值是英文 → 中文态显示英文」的双向问题。
 * applyComboLabels 只覆盖「zh 映射 / en 回落」单向场景，本函数是它的双向版。
 *
 * 铁律不变：**绝不改 w.options.values**（存档值），只换显示文字。
 *
 * @param table { widgetName: { 原值: { zh: "中文显示|null", en: "EN display|null" } } }
 *   某语言为 null / 缺失 → 回落显示原值。
 */
export function applyComboLabelsBi(node, lang, table) {
    if (!node || !node.widgets || !table) return;
    const l = (lang || currentLang()) === "zh" ? "zh" : "en";
    for (const w of node.widgets) {
        if (!w || !w.options) continue;
        const map = table[w.name];
        if (!map) continue;
        w.options.getOptionLabel = (v) => {
            if (v == null) return "";
            const e = map[String(v)];
            if (!e) return String(v);
            return e[l] || String(v);
        };
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

// 常用的「精度 / 设备」中文显示（多个节点共用，避免各写一份；中文态纯中文，英文态回落原值）
/**
 *  切换工作流重载时「下拉框变红 / 显示成数字」的自愈（2026-10-10）
 *
 * 病根：XiaoHei 工具条 DOM widget（xh_ui_bar）被新前端写进 widgets_values，占了第 0 格；
 *       而它是在 onNodeCreated 里才挂载、并被 pinWidgetToTop 塞到 node.widgets 最前面的。
 *       挂载时机在「首次加载」与「切回来」时不一致 → positional 回填整体错位一格
 *       → COMBO 拿到隔壁槽位的数字 → 不在 options.values 里 → 变红 + 显示成数字。
 *
 * 用法：beforeRegisterNodeDef 里包 onConfigure，调 fixWidgetValuesFromSaved(this, info)。
 *
 * 策略：① 有 widgets_values_named → 按**名字**回填（与顺序无关，永远对）；
 *       ② 无 named → positional 纠偏：存档比真实 widget 多 1 项、且首尾是空值（工具条残留）
 *          就剔掉再对位；
 *       ③ 长度对不上就**不动**（宁可不动，也不乱写）。
 */
export function fixWidgetValuesFromSaved(node, saved) {
    if (!node || !Array.isArray(node.widgets) || !saved) return;
    const BAR = "xh_ui_bar";
    //  2026-10-15：排除条件从「只认 xh_ui_bar 这个名字」改成「与前端序列化判据一致」。
    //    前端（settingStore-*.js）存档时的循环是：
    //        for (const [idx, w] of widgets.entries())
    //            if (!w.name || w.options.serialize === false) continue;   // ← 不存档
    //    而 positional 纠偏要把「存档数组」与「真实 widget」对齐 ——
    //    若 real 里仍留着**不存档**的自定义 DOM widget（如 XiaoHei Set/Get 的通道行 xh_sg_rowN、
    //    或其它带自绘行的节点），长度必然对不上 ⇒ 直接落到「③ 不动」，自愈形同虚设。
    //    补上 options.serialize === false 的排除后，real 就与前端存档口径一致。严格更正确，无回归。
    const real = node.widgets.filter((w) => w && w.name !== BAR && !(w.options && w.options.serialize === false));
    if (!real.length) return;
    const dirty = () => { try { node.setDirtyCanvas?.(true, true); } catch (e) {} };

    // ① 按名字回填（最可靠）
    const named = saved.widgets_values_named;
    if (named && typeof named === "object") {
        for (const w of real) {
            if (!(w.name in named)) continue;
            const v = named[w.name];
            if (v === undefined) continue;
            // COMBO 只在值合法时写回，避免又把不在选项里的值塞进去
            if (w.type === "combo" && Array.isArray(w.options && w.options.values)) {
                if (!w.options.values.includes(v)) continue;
            }
            w.value = v;
        }
        dirty();
        return;
    }

    // ② 老存档（只有 widgets_values）positional 纠偏
    const vals = saved.widgets_values;
    if (!Array.isArray(vals) || !vals.length) return;
    const isBlank = (x) => x === "" || x === null || x === undefined;
    let arr = vals.slice();
    if (arr.length === real.length + 1) {
        if (isBlank(arr[0])) arr = arr.slice(1);                        // 工具条残留在开头
        else if (isBlank(arr[arr.length - 1])) arr = arr.slice(0, -1);  // 残留在结尾
    }
    if (arr.length !== real.length) return;                             // 对不上就不动
    real.forEach((w, i) => {
        let v = arr[i];
        if ((w.type === "boolean" || w.type === "toggle") && typeof v === "number") v = !!v;
        w.value = v;
    });
    dirty();
}

// ================================================================
//  家族铁律：循环索引参数一律置顶（2026-10-29 用户定案）
//
// 用户原话：「以后我们所有的关于循环可循环节点那个所有索引功能的参数一定要放在第一位
//   ……前面的统一叫索引，后面一个括号儿啊叫它该叫的名字。」
//
// 为什么用**前端重排**而不是改 Python 的 INPUT_TYPES 声明顺序：
//   · 改后端声明顺序 = 改 widget 顺序 = 老存档的 positional 数组全部串位
//     （老存档只有位置没有名字，官方 `createWidgetRestorationState` 走 positional 分支）。
//   · 前端重排只动 node.widgets 数组顺序（Array.sort 稳定），Python 声明序不变
//     ⇒ 后端 API 契约完全不动 ⇒ 老存档照样对得上。
//   · 存档侧：官方 `serialiseWidgetValues` 同时写 `widgets_values` 与 `widgets_values_named`
//     两份（见 LGraphNode.ts:225），named 按名字 ⇒ **重排不影响读写**。
//   · 保险：调完再跑一次 applyNamedWidgetValues（按名字回填一遍），
//     即使前端设置项 namedValuesRestore 关着（默认关，走 positional 分支）也不会错位。
//     —— 这套做法在 XiaoHei-分段表 上已经用了半年（SEG_TOP_ORDER + reorderWidgets），
//        本函数是把它**抽成家族通用**，不再每个节点各抄一遍。
//
// 用法：
//   xhPinIndexWidget(node, "start_index");        // 把 start_index 提到最前
//   xhPinIndexWidget(node, "index", { after: [...] }); // 放到指定几个之后
// ================================================================

/**
 * 把指定 widget 提到 node.widgets 的最前面（其余顺序保持不变）。
 * @param {object} node
 * @param {string} name       要置顶的 widget 名
 * @param {object} opt        { after: [names...] } 指定插在谁后面（默认最前）
 */
export function xhPinIndexWidget(node, name, opt = {}) {
    if (!node || !Array.isArray(node.widgets) || !name) return;
    const ws = node.widgets;
    const idx = ws.findIndex((w) => w && w.name === name);
    if (idx < 0) return;
    const w = ws.splice(idx, 1)[0];
    let to = 0;
    const after = Array.isArray(opt.after) ? opt.after : [];
    if (after.length) {
        // 插在 after 列表里**最后一个**存在的 widget 之后
        let last = -1;
        for (const a of after) {
            const i = ws.findIndex((x) => x && x.name === a);
            if (i > last) last = i;
        }
        to = last >= 0 ? last + 1 : 0;
    } else {
        //  2026-10-29 用户纠正：「索引应该在这些**功能键的下面**，你怎么跑到最最上面了？」
        //    ⇒ 默认插到**工具条（家族功能键那一行）之后**，不是节点最顶。
        //    工具条 = 第一个「不存档的 DOM widget」（makeXHToolbar 挂的，serialize:false）。
        //     顺序陷阱：makeXHToolbar 用 pinWidgetToTop 把工具条 unshift 到 #0；
        //      若索引也 unshift 到 #0，就会把工具条挤到 #1 ⇒ 索引跑到功能键**上面**。
        //      所以这里取「工具条位置 + 1」，让它落在功能键**下面**。
        const barIdx = ws.findIndex((x) => x && x.serialize === false);
        to = barIdx >= 0 ? barIdx + 1 : 0;
    }
    ws.splice(to, 0, w);
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/**
 * 按名字回填 widget 值（存档安全网）。
 *  必须在**所有**重排/改名都做完之后调用，否则 positional 分支会把值写错格子。
 */
export function xhApplyNamedWidgetValues(node, info) {
    const named = info && info.widgets_values_named;
    if (!named || typeof named !== "object") return;
    for (const w of node.widgets || []) {
        if (!w || !w.name || w.serialize === false) continue;
        if (!Object.hasOwn(named, w.name)) continue;
        const v = named[w.name];
        if (v === undefined || v === null) continue;
        if (w.value !== v) {
            w.value = v;
            if (w.inputEl) w.inputEl.value = v;
        }
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/**
 *  家族通用：widget 类型兜底清洗（2026-10-29 「start_offset 无法转换为 INT」血案）
 *
 * 【真实后端日志铁证】
 *   Failed to convert an input value to a INT value: start_offset, , invalid literal for int() with base 10: ''
 *   Value not in list: source: '' not in ['文本框', '文件夹']
 *
 * 【成因链（五步，缺一不可）】
 *   ① 老存档的 `widgets_values_named` 里**缺**后加的参数（v1 时代的提示词表就没有
 *      source / start_offset / prompt_folder / all_segments 这几个键）；
 *   ② 官方读档 `LiteGraph.namedValuesRestore` 默认 **关**（LiteGraphGlobal.ts:378）
 *      ⇒ 官方走 **positional**（`widgets_values` 位置数组）；
 *   ③ 官方 positional 灌值是「**按 widgets 数组下标**」取
 *      （LGraphNode.ts:1265-1280：`for (const widget of this.widgets) { positionalIndex++ }`）
 *      ⇒ 只要 widgets 数组顺序和存档时的顺序不同，**全部错位**；
 *   ④ 家族按名回填（xhApplyNamedWidgetValues）只修 named 里**有的**键
 *      ⇒ 缺的那几个保留着官方错位灌进来的**空串**；
 *   ⑤ 空串不是合法 INT / 不是合法 COMBO 选项 ⇒ 后端 `validate_inputs` 直接拒绝执行，
 *      前端弹「无效输入 / 输入值类型错误」。
 *
 * 【本函数的职责】
 *   把**类型非法**的 widget 值回落到合法默认值（INT→0 / BOOLEAN→false / COMBO→首选项…）。
 *    只清「非法值」，**绝不动合法值** ⇒ 用户填的东西一个都不会丢。
 *    默认值由调用方按节点传入（各节点后端默认值不一样，不能瞎猜）。
 *
 * @param {object} node
 * @param {object} defaults  { 参数名: 默认值 }，只校验这里列出的参数
 * @param {object} [comboOptions] { 参数名: [合法选项...] }，COMBO 越界也回默认值
 * @returns {boolean} 有没有改动
 */
export function xhSanitizeWidgetTypes(node, defaults, comboOptions) {
    if (!node || !Array.isArray(node.widgets) || !defaults) return false;
    let changed = false;
    for (const w of node.widgets) {
        if (!w || !w.name) continue;
        if (!Object.hasOwn(defaults, w.name)) continue;
        const def = defaults[w.name];
        const v = w.value;

        // ① 类型不符（INT 拿到字符串、BOOLEAN 拿到数字…）—— 这是**真错**，必须清。
        //     BOOLEAN 的**空串不算错**：老存档里「后加的布尔参数」常存空串，
        //      后端 `_to_bool("", True)` 本来就会兜底成默认值 ⇒ 保持原样，
        //      改了反而让存档字节变化（存档往返校验会误报「串位」）。
        let bad = false;
        if (typeof def === "number") bad = typeof v !== "number" || !Number.isFinite(v);
        else if (typeof def === "boolean") bad = typeof v !== "boolean" && v !== "";
        else if (typeof def === "string") bad = typeof v !== "string" && v !== null && v !== undefined;

        // ② null / undefined ⇒ 默认（undefined 说明这个控件压根没值）
        if (!bad && (v === null || v === undefined)) bad = true;

        // ③ COMBO 值不在合法选项里
        //     空串对 COMBO 是**真错**（后端 `Value not in list: source: ''` 直接拒绝执行）
        if (!bad && comboOptions) {
            const opts = comboOptions[w.name];
            if (opts && opts.indexOf(v) === -1) bad = true;
        }
        if (!bad) continue;

        try {
            w.value = def;
            if (w.inputEl) w.inputEl.value = def;
            changed = true;
        } catch (e) {}
    }
    try { if (changed) node.setDirtyCanvas?.(true, true); } catch (e) {}
    return changed;
}

// ================================================================
//  家族铁律登记表：循环索引参数置顶（2026-10-29 用户定案）
//
// 用户原话：「以后我们所有的关于循环可循环节点那个所有索引功能的参数一定要放在第一位
//   ……前面的统一叫索引，后面一个括号儿啊叫它该叫的名字。」
//
// 【登记表】节点类型 → 索引 widget 名（按置顶优先级排列，第一个排最前）
//   · 只登记**真正的循环索引**（接 XiaoHei-循环 的 index / 轮次），
//     不含 clip_index（剪哪段潜变量）、prompt_index（素材规划台）这类同名不同义的。
//   · 「名字里带 index」≠「循环索引」——判定看语义，不看拼写。
//
// 【为什么前端重排而不是改 Python 声明序】
//   改后端 INPUT_TYPES 顺序 = 改 widget 顺序 = 老存档 positional 数组整体串位。
//   前端重排只动 node.widgets 数组顺序，Python 声明序不动 ⇒ 后端契约零改动。
//   存档侧：官方 serialiseWidgetValues 同时写 widgets_values 与 widgets_values_named
//   （LGraphNode.ts:225），named 按名字 ⇒ 重排不影响读写。
//   保险：重排后再跑一次 xhApplyNamedWidgetValues（按名字回填），双保险。
//
// 【怎么用】
//   import { xhPinFamilyIndex } from "./xh_ui_kit.js";
//   xhPinFamilyIndex(this);        // 建节点时
//   xhPinFamilyIndex(this, info);  // 读档时（顺带按名字回填）
// ================================================================
const XH_INDEX_FIRST = {
    //  循环家族
    XH_ChainPromptSelector: ["start_index"],       // 提示词表：起始段
    XHSegmentTable: ["index"],                      // 分段表：索引（接循环）
    XHBeatCueTable: ["index"],                      // 音乐卡点表：取第几段
    XHImageGetByIndex: ["index"],                   // 图像按序取：序号
    XHImageRangeFromBatch: ["start_index"],         // 取帧范围：起始帧
    XHAudioTrimFrames: ["start_frame"],              // 按帧裁音频：起始帧（与取帧范围同构）
    XHH3AudioSync: ["start_frame"],                  // H3音频同步：音轨起始帧（2026-10-30 新增）
    XHForLoopStart: ["start_index"],                // 循环开始：起始索引
    XHLoopIteration: ["iteration_index"],           // 循环迭代（内部）：轮次
    //  导演台循环家族
    XHFiniteLoopSegment: ["iteration_index"],
    XHFiniteLoopPrepare: ["iteration_index"],
    XHFiniteLoopAccumulate: ["iteration_index"],
    XHFiniteLatentContinuation: ["iteration"],
    XHFiniteSegmentFinalize: ["iteration"],
    XHSegmentVideoArchive: ["iteration_index"],
    //  XHLoadAudio 的 start_index **故意不登记**：它只在「循环模式」下可见，
    //   而循环模式走的是自绘列表 UI（xh_audioload_list DOM widget），
    //   参数区整块隐藏 ⇒ 置顶对用户不可见、没有意义。
};

/**
 * 按家族登记表把节点的循环索引参数提到最前。
 * @param {object} node
 * @param {object} [info] 读档时的 info（给了就顺便按名字回填 widget 值）
 */
export function xhPinFamilyIndex(node, info) {
    if (!node || !node.type) return;
    const names = XH_INDEX_FIRST[node.type];
    if (!names || !Array.isArray(node.widgets)) return;
    for (const nm of names) xhPinIndexWidget(node, nm);
    if (info) {
        try {
            // ① 老 positional 存档（无 named）⇒ 先按旧序还原成名字表
            const legacy = xhRestoreLegacyNamed(node, info);
            const src = legacy || info;
            // ② 按名字回填（与顺序无关，永远对）
            xhApplyNamedWidgetValues(node, src);
        } catch (e) {}
    }
    //  2026-10-29：类型兜底（named 里缺键 / positional 错位 ⇒ 空串 / 类型不符 ⇒ 后端拒绝执行）
    try { xhSanitizeFamilyTypes(node); } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/**
 *  家族级「widget 类型兜底」登记表（2026-10-29）
 *
 * 【为什么需要这张表】
 *   官方读档 `namedValuesRestore` 默认**关** ⇒ 走 positional（按 widgets 数组下标）。
 *   只要 widgets 顺序和存档时的顺序不同 ⇒ **全部错位**；
 *   而 named 回填只修 named 里**有的**键 ⇒ 新加/老档缺失的参数保留着错位灌进来的空串
 *   ⇒ 后端 `validate_inputs` 直接拒绝（前端弹「无效输入 / 输入值类型错误」）。
 *   真实案例（2026-10-29）：Qwen_文生图2512.json 的 v1 老档里
 *   `source` / `start_offset` / `prompt_folder` / `all_segments` 全是空串。
 *
 * 【登记规则】
 *   · 只登记**后端 required 里的数值型 / 枚举型**参数（INT / BOOLEAN / COMBO）；
 *   · 默认值必须与后端 `INPUT_TYPES` 的 `"default"` **逐字一致**（改了后端必须同步改这里）；
 *   · COMBO 的合法选项也一并登记，值不在选项里就回默认。
 *
 * 【只清非法值，不动合法值】⇒ 用户真正填的东西一个都不会丢。
 */
const XH_TYPE_DEFAULTS = {
    // XiaoHei-提示词表（后端 chain_prompt/nodes.py）
    XH_ChainPromptSelector: {
        values: {
            num_slots: 1,          // DEFAULT_SLOTS
            source: "文本框",        // 后端 source 的默认选项
            prompt_folder: "",
            start_index: 0,
            start_offset: 0,
            loop: false,
            follow_loop_turn: true,
            all_segments: false,
            restart_index: 0,
        },
        combos: {
            source: ["文本框", "文件夹"],
        },
    },
    // XiaoHei-分段表（后端 controls/segment_table.py）
    XHSegmentTable: {
        values: {
            index: 0,
            num_segments: 1,        // DEFAULT_SEG_SLOTS
            preset_edit: 1,         // DEFAULT_PRESET_EDIT
            clamp: false,
            all_segments: false,
            input_mode: true,
        },
        combos: {},
    },
    // XiaoHei-加载音频（后端 controls/audio_load.py）
    XHLoadAudio: {
        values: {
            start_index: 0,
            loop: true,
        },
        combos: {},
    },
    // XiaoHei-按帧裁音频（后端 controls/audio_trim_frames.py）
    //    默认值必须与后端 INPUT_TYPES 的 "default" 逐字一致
    XHAudioTrimFrames: {
        values: {
            start_frame: 0,
            length_frames: 0,
            fps: 24,
            when_short: "loop",
        },
        combos: {
            when_short: ["silence", "loop", "error"],
        },
    },
    // XiaoHei-H3音频同步（后端 controls/audio_h3_sync.py）
    //    start_frame 是 2026-10-30 新增的 optional 末尾控件（没动 required 声明序）
    XHH3AudioSync: {
        values: {
            clip_limit: "15s",
            when_short: "silence",
            over_mode: "warn",
            custom_limit: 8.0,
            start_frame: 0,
        },
        combos: {
            //  帧档（124f…362f）是 2026-10-30 新增的合法值，必须一起登记，
            //    否则读档时值不在选项里会被回退成默认（15s）。
            clip_limit: ["5s", "10s", "15s", "20s", "custom", "off",
                "124f", "141f", "158f", "175f", "192f", "209f", "226f", "243f",
                "260f", "277f", "294f", "311f", "328f", "345f", "362f"],
            when_short: ["silence", "loop"],
            over_mode: ["warn", "stop"],
        },
    },
};

/** 对某个节点做类型兜底清洗（走家族登记表）。 */
export function xhSanitizeFamilyTypes(node) {
    if (!node || !node.type) return false;
    const spec = XH_TYPE_DEFAULTS[node.type];
    if (!spec) return false;
    return xhSanitizeWidgetTypes(node, spec.values, spec.combos);
}

/** 查某节点的索引参数名（给审计/回归脚本用）。 */
export function xhFamilyIndexNames(type) {
    return (XH_INDEX_FIRST[type] || []).slice();
}

// ================================================================
//  老存档（positional，无 named）兼容 —— 索引置顶的「安全网」
//
// 【为什么需要】
//   置顶 = 改 node.widgets 的顺序 ⇒ **存盘顺序也变了**（官方 serialiseWidgetValues
//   按 this.widgets 现序写 positional 数组）。于是：
//     · 新存档（有 widgets_values_named）：官方按**名字**回填 ⇒ 与顺序无关 ⇒ 永远对。
//     · 老存档（只有 widgets_values 位置数组）：存的是**旧顺序** ⇒ 与新顺序错位。
//   实测：本机 55 个 XiaoHei 循环节点的真实存档里，109 个带 named、只有 1 个（2026-10-14
//   的卡点表工作流）不带 ⇒ 影响面极小，但**必须兜住**，否则那个工作流一打开就串位。
//
// 【怎么兜】
//   记下各节点**置顶前**的声明序（= 旧存档的存盘序），读档时把老 positional
//   按旧序**还原成名字表**，再走正常的按名字回填 ⇒ 老档零迁移成本。
//    旧序表只登记「真的动过顺序」的节点；没动过的不用管。
// ================================================================
const XH_INDEX_OLD_ORDER = {
    //  提示词表**故意不在这里**：它有 32 个 prompt_N 框，通用旧序表只能覆盖前 9 项，
    //   后面 32 项会丢。它自己有一套成熟迁移（migrateLegacyWidgetsValues，按
    //   properties.xh_cp_layout 版本号 + 类型模式识别 v1/v2/v3/v4），别去抢。
    // 音乐卡点表：index 从第 13 位提到最前
    XHBeatCueTable: ["audio", "target_sec", "fps", "frame_mod", "frame_offset", "bars_per_seg",
        "bar_offset_beats", "max_segments", "start_offset", "mode", "min_seg_sec", "max_seg_sec",
        "snap_to_bar", "index"],
    // 图像按序取：index 从第 1 位提到最前
    XHImageGetByIndex: ["images", "index", "index_from_one", "clamp"],
    // 循环开始：start_index 从第 1 位提到最前
    XHForLoopStart: ["num_iterations", "start_index", "step", "cache_iterations"],
};

/**
 * 老 positional 存档 → 还原成名字表（只在「该节点动过顺序」且「存档没 named」时做）。
 * @returns {object|null} 还原出的名字表；不需要处理时返回 null
 */
export function xhRestoreLegacyNamed(node, info) {
    if (!node || !info) return null;
    if (info.widgets_values_named && typeof info.widgets_values_named === "object") return null;  // 新档走官方按名字回填
    const oldOrder = XH_INDEX_OLD_ORDER[node.type];
    if (!oldOrder) return null;
    const vals = info.widgets_values;
    if (!Array.isArray(vals) || !vals.length) return null;

    // 存档数组里可能夹着不存档的 DOM widget 空位（老版工具条会占一格）
    let arr = vals.slice();
    const isBlank = (x) => x === "" || x === null || x === undefined;
    if (arr.length > oldOrder.length && isBlank(arr[0])) arr = arr.slice(1);

    // 长度对不上就不猜（宁可不动，也不要乱写）
    if (arr.length < oldOrder.length) return null;

    const named = {};
    for (let i = 0; i < oldOrder.length; i++) named[oldOrder[i]] = arr[i];
    // 后面的（prompt_N / seg_N / batch_count 等）没有旧序表 ⇒ 保持位置对应，不动。
    //  这里用 **node.widgets 当前下标** 去猜名字是错的 —— 此刻 widgets 已经重排过，
    //   下标 i 对应的不是旧序第 i 个。改成：只处理「旧序表覆盖到的那几项」，
    //   其余一律**不猜**（宁可少认几个，也不要写错格子）。
    //  2026-10-31 修：返回值结构必须与 xhApplyNamedWidgetValues 的期望一致 ——
    //   那个函数读的是 `info.widgets_values_named`，
    //   而这里原来返回的是**裸名字表** {num_iterations:3, ...}
    //   ⇒ 调用处 `const src = legacy || info; xhApplyNamedWidgetValues(node, src);`
    //      读到 src.widgets_values_named === undefined ⇒ **直接 return，什么都没回填**
    //   ⇒ 「缺 named 的老档」安全网形同虚设，所有家族节点的中招。
    //   真实事故：XHForLoopStart 的 num_iterations=3 被读成 0 ⇒ 循环跑 0 轮
    //   ⇒ 循环结束节点 outputs 为空 ⇒ 列表拼批报「没收到任何 IMAGE 批次」。
    return { widgets_values_named: named };
}

// XiaoHei-视频分段轴 的**节点专属文案表**（2026-10-31 用户投诉「中英文切换没做好」后补）
//    这个节点的 UI 是自己搭的（不是官方 widget）⇒ 文案不能塞进 widgets/slots 表，
//      必须单独一张表，切语言时整体替换。
//   规则：zh / en 键**逐字对齐**，缺一个键就补一个，绝不留半中文半英文。
const XH_TL_I18N = {
    zh: {
        upload: " 传视频",
        uploading: "上传中…",
        uploadFail: "上传失败",
        uploadOk: " 已选择",
        pickFile: " 选文件",
        pickFolder: " 选文件夹",
        folderOk: " %d 个视频",
        folderFail: " %s",
        play: "⏵",
        pause: "⏸",
        prevFrame: "◀帧",
        nextFrame: "帧▶",
        split: "＋分割",
        undo: "↶撤",
        reset: "⟲重置",
        frameInfo: "帧 %d/%d (%.2fs)",
        segCount: "%d 段",
        pickVideo: "先选个视频",
        probeFail: "探测失败",
        cannotPlay: "视频打不开",
        segTitle: "第 %d 段 · 帧 %d~%d（%d 帧）",
        hintOverview: "拖色块改位置 · 拖两端改长度 · 点轨道跳转 · ←/→ 微调 1 帧",
        hintNoVideo: "先「 传视频」或「 选文件」",
    },
    en: {
        upload: " Upload",
        uploading: "Uploading…",
        uploadFail: "Upload failed",
        uploadOk: " Ready",
        pickFile: " File",
        pickFolder: " Folder",
        folderOk: " %d videos",
        folderFail: " %s",
        play: "⏵",
        pause: "⏸",
        prevFrame: "◀f",
        nextFrame: "f▶",
        split: "+ Split",
        undo: "↶ Undo",
        reset: "⟲ Reset",
        frameInfo: "frame %d/%d (%.2fs)",
        segCount: "%d segs",
        pickVideo: "Pick a video first",
        probeFail: "probe failed",
        cannotPlay: "cannot play",
        segTitle: "Segment %d · frames %d~%d (%d f)",
        hintOverview: "drag block = move · drag edges = resize · click track = seek · ←/→ = 1 frame",
        hintNoVideo: "Use  Upload or  File first",
    },
};
// 暴露给分段轴模块取（避免分段轴自己再抄一份）
//  这张表放在 kit 里（kit 无任何 import ⇒ 不会与 lang.js 形成循环依赖）
export function xhTLText(key) {
    const pack = XH_TL_I18N[currentLang()] || XH_TL_I18N.zh;
    return pack[key] || key;
}

export const XH_COMBO_COMMON = {
    fp16: "半精度（快·省）",
    bf16: "脑浮点（稳）",
    fp32: "全精度（慢·占显存）",
    cuda: "显卡",
    cpu: "处理器",
};

// ---- 全局：语言一变，所有已注册按钮一起换字 ----
//  2026-11-10：不再自己 addEventListener，改由下方唯一中枢登记（priority -1000 最先跑），
//    否则全包会有 2 个以上的语言监听器，"一个大脑"就不成立。

// ══════════════════════════════════════════════════════════════════════
//  2026-11-10：家族语言「唯一调度中枢」—— 一个大脑管全部中英切换
//   旧实现：每个 onLangChanged() 各自 addEventListener ⇒ 全家族 39 个独立监听器，
//           执行顺序由模块加载顺序决定，几套逻辑抢着刷同一节点的标题/参数/端口
//           ⇒ 谁后跑谁覆盖 ⇒ 标题英文、参数中文、端口中英混杂。
//           且 app.graph.configure 只有第一个注册者会重刷，其余 38 个全漏。
//   新实现：所有回调只登记进 _XH_LANG_HANDLERS，全局只有 1 个事件监听器统一派发。
//           · priority 升序；主表 FamilyUI 用 priority=1000 最后跑、以它的翻译为准
//           · 每个回调单独 try/catch ⇒ 一个节点抛错绝不牵连其它节点
//           · 读档 configure 后由中枢统一全量重刷，不再只刷第一个
//   38 个调用方文件一行都不用改，行为全部收口到这里。
// ══════════════════════════════════════════════════════════════════════
const _XH_LANG_HANDLERS = [];
let _xhLangDispatchBound = false;
window.__XH_LANG_HANDLERS = _XH_LANG_HANDLERS;   // 控制台可查：「谁在管语言」

function _xhRunLangHandlers(fromConfigure = false) {
    const lang = currentLang();
    const list = _XH_LANG_HANDLERS.slice().sort((a, b) =>
        (a.priority - b.priority) || (a.seq - b.seq));
    for (const h of list) {
        if (fromConfigure && !h.wrapConfigure) continue;
        try { h.fn(lang); }
        catch (e) { console.warn("[XiaoHei UI Kit] 语言回调失败:", h.tag || h.seq, e); }
    }
}

function _xhBindLangDispatch() {
    if (_xhLangDispatchBound) return;
    _xhLangDispatchBound = true;
    // 按钮换字并入中枢（最先跑）⇒ 全包全局只剩下面这 1 个事件监听器
    _XH_LANG_HANDLERS.push({
        fn: (lang) => { for (const b of _LANG_BTNS) styleLangBtn(b, lang); },
        priority: -1000, seq: -1, wrapConfigure: true, tag: "LangButtons",
    });
    window.addEventListener("xh:lang-changed", () => _xhRunLangHandlers(false));
    // 工作流载入后：由中枢统一全量重刷（旧实现只有第一个注册者会重刷）
    try {
        const g = app.graph;
        if (g && g.configure && !g.__xhLangUnifiedWrapped) {
            const orig = g.configure.bind(g);
            g.configure = function (...args) {
                const r = orig.apply(g, args);
                setTimeout(() => _xhRunLangHandlers(true), 250);
                return r;
            };
            g.__xhLangUnifiedWrapped = true;
        }
    } catch (e) {}
}

/**
 * 登记"语言变化"处理：立刻执行一次，之后由家族唯一中枢统一派发。
 * @param {Function} handler  (lang) => void
 * @param {object} opts  { initialDelay, wrapConfigure, priority, tag }
 *        priority 越大越晚执行；主表固定 1000（最后跑、以它的翻译为准）。
 */
function _xhRegisterLangHandler(fn, opts = {}) {
    const rec = {
        fn,
        priority: Number(opts.priority) || 0,
        seq: _XH_LANG_HANDLERS.length,
        wrapConfigure: opts.wrapConfigure !== false,
        tag: opts.tag || "",
    };
    _XH_LANG_HANDLERS.push(rec);
    _xhBindLangDispatch();
    return rec;
}

export function onLangChanged(handler, opts = {}) {
    const rec = _xhRegisterLangHandler(handler, opts);
    // 首次执行仍按调用方自己的延迟，保证模块刚加载时节点就有正确文字
    setTimeout(() => {
        try { handler(currentLang()); }
        catch (e) { console.warn("[XiaoHei UI Kit] 语言回调首次执行失败:", rec.tag || rec.seq, e); }
    }, opts.initialDelay ?? 150);
}

/**
 * 等价 window.addEventListener("xh:lang-changed", fn)，但由唯一中枢派发。
 * 回调仍收到 { detail: { lang } } 事件对象 ⇒ 老代码一行不用改逻辑。
 * 与 onLangChanged 的区别：不额外"立刻执行一次"（保持纯监听语义）。
 */
export function onLangEvent(handler, opts = {}) {
    return _xhRegisterLangHandler((lang) => handler({ detail: { lang } }), opts);
}

// ══════════════════════════════════════════════════════════════════════
// ⑤ 家族统一滑块（唯一实现）—— XiaoHei-滑块节点、悬浮窗不透明度 等一律共用
// ══════════════════════════════════════════════════════════════════════
//  2026-10-20 补记（用户原话："家族还有一个节点是拥有滑块的……能不能统一风格统一一下"）：
//    之前做悬浮窗时又画了一套自制滑块（深蓝大把手 + 进度填充），跟家族 XiaoHei-滑块 长得完全不一样。
//    ⇒ 把 XiaoHei-滑块 节点的滑块抽到这里，**一处实现、两处使用**，外观从此只有一种。
//    外观 = 家族原版：原生 input[type=range] + accent-color 家族蓝 + 右侧数字框（74px）。
//    `zoom:1.2` 是应用户"大一些、明显一些"的要求，只整体放大 20%（accent-color 造型保留）；
//    不支持 zoom 的浏览器自动退回原尺寸，不会有样式破掉的风险。
let _xhSliderCssDone = false;
function ensureXHSliderCss() {
    if (_xhSliderCssDone) return;
    _xhSliderCssDone = true;
    const el = document.createElement("style");
    el.textContent = `
    .xh-sl-root{display:flex;flex-direction:column;gap:4px;padding:6px;width:100%;
        box-sizing:border-box;font-family:sans-serif;font-size:12px;color:inherit;}
    .xh-sl-row{display:flex;gap:6px;align-items:center;}
    .xh-sl-row .xh-sl-label{flex:0 0 auto;font-size:11px;color:#e8e8e8;white-space:nowrap;}
    .xh-sl-row input[type=range]{flex:1 1 auto;min-width:0;cursor:pointer;
        accent-color:var(--xh-acc,#8a8a8a);zoom:1.2;}
    /*  2026-10-21 用户截图：数字框原生 ▲▼ 上三角被裁一刀 ——
       根因是 input 没定高，仅靠 font-size+padding 撑出约 18px，原生 spinner 需要更高
       才画得下上下两个三角。钉 24px + line-height:1 + border-box 让它完整显示。 */
    .xh-sl-row input[type=number]{width:74px;flex:none;font-size:12px;padding:0 4px;
        height:24px;line-height:1;box-sizing:border-box;
        border-radius:3px;border:1px solid rgba(0,0,0,.3);background:#1c1c1c;color:#e8e8e8;
        text-align:right;}
    .xh-sl-toolbar{display:flex;gap:4px;align-items:center;}
    .xh-sl-toolbar .spacer{flex:1;}
    /* 方案 B：与 makeBarBtn 同源（暗底 + 1px 半透明白描边 + 字重 600）， 不再 #252525/bold */
    .xh-sl-toolbar button{border:1px solid rgba(255,255,255,.10);border-radius:4px;padding:2px 8px;
        font-size:11px;font-weight:600;cursor:pointer;color:#e8e8e8;background:#252525;}
    .xh-sl-toolbar button:hover{background:#3a3a3a;}
    .xh-sl-toolbar button.xh-sl-lang{width:36px;height:22px;padding:0;font-size:12px;}
    .xh-sl-settings{display:flex;gap:6px;align-items:center;flex-wrap:wrap;
        background:rgba(127,127,127,.12);border:1px solid rgba(0,0,0,.2);
        border-radius:4px;padding:4px;}
    .xh-sl-settings label{display:flex;gap:3px;align-items:center;font-size:11px;opacity:.85;}
    .xh-sl-settings input[type=number]{width:62px;font-size:11px;padding:1px 3px;border-radius:3px;
        border:1px solid rgba(0,0,0,.3);background:#1c1c1c;color:#e8e8e8;}
    .xh-sl-settings.hidden{display:none;}
    `;
    document.head.appendChild(el);
}

/**
 * 家族统一滑块。
 * @param {object} o
 *   min / max / step / value / decimals  基本参数
 *   label      可选，左侧文字（XiaoHei-滑块 节点本身不需要，悬浮窗这种需要）
 *   numWidth   数字框宽度**下限**，默认 44（家族规格）；
 *              实际宽度按硬上限位数自适应（2026-10-28）：位数越多越宽，够显示 86400 这种 5 位数
 *   onInput    (v, dir)=>{}  拖动/输入数字后回调（**set() 不会触发它**，避免回环）
 *               2026-10-29 新增第二参 `dir`：**增减方向** +1=增 / -1=减 / 0=无方向（首次/拖动）
 *                 背景：XiaoHei-分段表 的「帧数规矩」是**向上吸附**（243 是合法帧格，减号减到 242
 *                 会被吸回 243 ⇒ 用户看到「只能加不能减」）⇒ 调用方要靠方向决定吸上还是吸下。
 *                  老调用方只收第一个参数 ⇒ **零影响**（向后兼容）。
 * @returns {{root:HTMLElement,row:HTMLElement,range:HTMLInputElement,
 *            numBox:HTMLInputElement,set:(v:number,dec?:number)=>void,get:()=>number}}
 */
export function makeXHSlider(o = {}) {
    ensureXHSliderCss();
    const min = Number.isFinite(Number(o.min)) ? Number(o.min) : 0;
    const maxRaw = Number(o.max);
    let max = Number.isFinite(maxRaw) && maxRaw !== min ? maxRaw : min + 100;
    //  2026-10-28：可选「硬上限」hardMax —— 拖拽条量程 与 数字框上限 分离。
    //    背景：XiaoHei-分段表 的「起始」框上限抬到 86400（1 小时）后，若拖拽条量程也跟着变
    //    86400，150px 的条子上 1 像素 ≈ 576 帧 ⇒ 拖不动了（数字框还能打，但手感没了）。
    //    ⇒ 拖拽条用 max（软量程，好拖）；数字框 与 clamp 用 hardMax（真上限，不挡人）。
    //  不传 hardMax 时 hardMax === max ⇒ 行为与改动前**一字不差**，家族其它滑块零影响。
    const hRaw = Number(o.hardMax);
    let hardMax = Number.isFinite(hRaw) ? hRaw : max;
    if (!(hardMax > max)) hardMax = max;      // 硬上限永远不小于拖拽量程（非法值兜底）
    const step = Math.max(Number(o.step) || 1, 0.0001);
    let decimals = Math.min(4, Math.max(0, Math.floor(Number(o.decimals ?? 0) || 0)));

    const root = document.createElement("div");
    root.className = "xh-sl-root";
    const row = document.createElement("div");
    row.className = "xh-sl-row";

    let labelEl = null;
    if (o.label) {
        labelEl = document.createElement("span");
        labelEl.className = "xh-sl-label";
        labelEl.textContent = o.label;
        row.appendChild(labelEl);
    }

    const range = document.createElement("input");
    range.type = "range";
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    const numBox = document.createElement("input");
    numBox.type = "number";
    numBox.min = String(min);
    numBox.max = String(hardMax);      // 2026-10-28：数字框吃硬上限（拖拽条吃软量程）
    numBox.step = String(step);
    //  2026-10-28：数字框宽度按**硬上限位数**自适应（不再写死）。
    //    背景：分段表 2026-10-21 应要求把数字框从 74px 缩到 44px（"太长，缩一半"）⇒ 只够 3 位。
    //    2026-10-28 把上限抬到 1500 / 86400 后，44px 把 1500 裁成 "150"、10000+ 裁成 "100"，
    //    看着像"上限坏 / 越改越乱"，其实是框太窄显示不全（值本身一直是对的）。
    //    ⇒ 位数越多框越宽；小量程时仍回落到 numWidth（44px），不破坏"别太长"的观感。
    const numW = () => {
        const digits = String(Math.abs(Math.round(Number(hardMax) || 0))).length;
        return Math.max(Number(o.numWidth) || 44, digits * 8 + 24);
    };
    numBox.style.width = numW() + "px";
    if (labelEl) labelEl.title = o.labelTitle || "";
    range.title = o.tip || "";

    row.appendChild(range);
    row.appendChild(numBox);
    root.appendChild(row);

    // 家族铁律：DOM 控件必须吞掉画布事件，否则拖滑块会变成拖节点
    for (const el of [range, numBox]) {
        ["pointerdown", "mousedown", "dblclick", "keydown", "click"].forEach((ev) =>
            el.addEventListener(ev, (e) => e.stopPropagation(), true)
        );
    }

    const clamp = (v) => {
        let x = Number(v);
        if (!Number.isFinite(x)) x = min;
        const p = Math.pow(10, decimals);
        x = Math.round(x * p) / p;
        return Math.min(hardMax, Math.max(min, x));   // 2026-10-28：按硬上限钳（软量程只管条子）
    };
    const paint = (v, dec) => {
        const d = dec == null ? decimals : dec;
        const shown = Math.min(hardMax, Math.max(min, Number(v)));
        range.value = String(Math.min(shown, max));   // 超出软量程 ⇒ 条子顶到头，数字框仍显示真值
        numBox.value = Number(shown).toFixed(d);
    };
    let lastEmitted = Number(o.value == null ? min : o.value);   // 上一次的值（用来判方向）
    const emit = (raw, dir) => {
        const v = clamp(raw);
        paint(v);
        //  2026-10-29：把**增减方向**一起传给调用方。
        //    dir：+1 增 / -1 减 / 0 无方向（拖动条、首次输入）。
        //    判定：新值 > 旧值 ⇒ 增；新值 < 旧值 ⇒ 减；相等 ⇒ 无方向。
        let d = dir === 1 ? 1 : dir === -1 ? -1 : 0;
        if (!d) {
            const prev = Number(lastEmitted);
            if (Number.isFinite(prev)) d = v > prev ? 1 : (v < prev ? -1 : 0);
        }
        lastEmitted = v;
        try { o.onInput?.(v, d); } catch (e) { console.warn("[XiaoHei Slider] onInput 抛错:", e); }
    };
    range.addEventListener("input", () => emit(range.value, 0));
    numBox.addEventListener("change", () => emit(numBox.value, 0));

    paint(clamp(o.value == null ? min : o.value));

    return {
        root, row, range, numBox,
        /** 更新显示（**不触发 onInput**，用于外部同步回填） */
        set: (v, dec) => paint(clamp(v), dec),
        get: () => Number(range.value),
        setDecimals: (d) => { decimals = Math.min(4, Math.max(0, Math.floor(Number(d) || 0))); paint(clamp(range.value)); },
        /**
         * 2026-10-28：运行时改量程 —— 拖拽条 rangeMax（软，管手感）/ 数字框 hard（硬，管上限）。
         * XiaoHei-分段表 切单位时用：帧 软2880/硬86400，秒 软120/硬3600（软量程都是 2 分钟）。
         * @param {number} rangeMax 拖拽条量程
         * @param {number} hard     数字框与 clamp 的硬上限（< rangeMax 时自动抬到 rangeMax）
         */
        setMaxes: (rangeMax, hard) => {
            const rm = Number(rangeMax);
            if (Number.isFinite(rm) && rm !== min) max = rm;
            const hm = Number(hard);
            hardMax = (Number.isFinite(hm) && hm > max) ? hm : max;
            range.max = String(max);
            numBox.max = String(hardMax);
            numBox.style.width = numW() + "px";   // 2026-10-28：量程（位数）变了 ⇒ 宽度跟着变
            paint(clamp(Number(numBox.value)));
        },
    };
}

/**
 * 家族统一「时间码」控件（2026-10-28，XiaoHei-分段表 的「起始」专用）。
 *  为什么不用滑块：起始上限 86400 帧（1 小时），单数字框要么显示不全（要 5 位宽），
 *    要么滑轨 1px ≈ 576 帧根本拖不动。⇒ 按「分 : 秒 : 帧」拆成小框，每框最多 2 位数。
 *   · 秒单位：分 / 秒（2 框）       值 = 分×60 + 秒
 *   · 帧单位：分 / 秒 / 帧（3 框）  值 = (分×60 + 秒)×fps + 帧
 *  超范围自动进位：在「帧」框打 50000 ⇒ 自动进成 34:43:08（@24fps），不用自己换算。
 * @param {object} o  min / max（硬上限，按当前单位口径）/ value / fps / frames / label / onInput
 * @returns 与 makeXHSlider **同接口**（root / row / set / get / setMaxes），额外多 setMode
 */
export function makeXHTimecode(o = {}) {
    ensureXHSliderCss();
    const min = Number.isFinite(Number(o.min)) ? Number(o.min) : 0;
    let hardMax = Number.isFinite(Number(o.max)) ? Number(o.max) : 86400;
    let fps = Math.max(1, Math.round(Number(o.fps) || 24));
    let frames = !!o.frames;

    const root = document.createElement("div");
    root.className = "xh-sl-root";
    const row = document.createElement("div");
    row.className = "xh-sl-row";

    let labelEl = null;
    if (o.label) {
        labelEl = document.createElement("span");
        labelEl.className = "xh-sl-label";
        labelEl.textContent = o.label;
        row.appendChild(labelEl);
    }

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:3px;flex:1 1 auto;min-width:0;";
    row.appendChild(wrap);

    //  内联样式压过 .xh-sl-row input[type=number] 的 74px / 右对齐（三个框放不下）
    const mkBox = (w, mx) => {
        const b = document.createElement("input");
        b.type = "number";
        b.min = "0";
        b.max = String(mx);
        b.step = "1";
        b.style.cssText = "width:" + w + "px;flex:none;font-size:12px;height:24px;line-height:1;"
            + "box-sizing:border-box;text-align:center;border-radius:3px;"
            + "border:1px solid rgba(0,0,0,.3);background:#1c1c1c;color:#e8e8e8;";
        return b;
    };
    const mkColon = () => {
        const s = document.createElement("span");
        s.textContent = ":";
        s.style.cssText = "flex:none;font-size:12px;opacity:.65;";
        return s;
    };

    const bMin = mkBox(46, 60);                     // 分 0..60
    const c1 = mkColon();
    const bSec = mkBox(46, 59);                     // 秒 0..59
    const c2 = mkColon();
    const bFrm = mkBox(46, Math.max(0, fps - 1));   // 帧 0..fps-1（仅帧单位显示）
    wrap.appendChild(bMin); wrap.appendChild(c1);
    wrap.appendChild(bSec); wrap.appendChild(c2);
    wrap.appendChild(bFrm);
    root.appendChild(row);

    // 家族铁律：DOM 控件必须吞掉画布事件，否则点输入框会变成拖节点
    for (const b of [bMin, bSec, bFrm]) {
        ["pointerdown", "mousedown", "dblclick", "keydown", "click"].forEach((ev) =>
            b.addEventListener(ev, (e) => e.stopPropagation(), true));
    }

    const clampV = (v) => Math.max(min, Math.min(hardMax, Math.round(Number(v) || 0)));

    /** 值 → 三框 */
    const toBoxes = (v) => {
        const x = clampV(v);
        if (!frames) {
            const m = Math.floor(x / 60);
            return [m, x - m * 60, 0];
        }
        const perMin = fps * 60;
        const m = Math.floor(x / perMin);
        const r = x - m * perMin;
        const s = Math.floor(r / fps);
        return [m, s, r - s * fps];
    };
    /** 三框 → 值（超范围逐级进位：帧 → 秒 → 分，最后再按硬上限夹） */
    const fromBoxes = (m, s, f) => {
        let M = Math.max(0, Math.round(Number(m) || 0));
        let S = Math.max(0, Math.round(Number(s) || 0));
        let F = Math.max(0, Math.round(Number(f) || 0));
        if (frames) {
            if (F >= fps) { S += Math.floor(F / fps); F = F % fps; }
        } else { F = 0; }
        if (S >= 60) { M += Math.floor(S / 60); S = S % 60; }
        return clampV(frames ? ((M * 60 + S) * fps + F) : (M * 60 + S));
    };

    const paint = (v) => {
        const t = toBoxes(v);
        bMin.value = String(t[0]);
        bSec.value = String(t[1]);
        bFrm.value = String(t[2]);
        const d = frames ? "" : "none";       // 秒单位：藏起第三个框和它前面的冒号
        bFrm.style.display = d;
        c2.style.display = d;
        bFrm.max = String(Math.max(0, fps - 1));
    };
    const emit = () => {
        const v = fromBoxes(bMin.value, bSec.value, bFrm.value);
        paint(v);
        try { o.onInput?.(v); } catch (e) { console.warn("[XiaoHei Timecode] onInput 抛错:", e); }
    };
    //  只听 change（失焦 / 回车），**绝不听 input**：打字途中进位会把正在敲的数打乱
    //    （例如想敲 50000，刚敲到 "50" 就被进成 0:2:2，后面全乱）
    for (const b of [bMin, bSec, bFrm]) b.addEventListener("change", emit);

    paint(clampV(o.value == null ? min : o.value));

    return {
        root, row, labelEl,
        range: bMin, numBox: bMin,          // 兼容旧调用方（读 range/numBox 不会炸）
        set: (v) => paint(v),
        get: () => fromBoxes(bMin.value, bSec.value, bFrm.value),
        setMaxes: (_drag, hard) => { const h = Number(hard); if (Number.isFinite(h)) hardMax = h; },
        /** 单位 / 帧率变了：重算三框（帧单位 3 框，秒单位 2 框） */
        setMode: (fr, f) => {
            frames = !!fr;
            const nf = Math.round(Number(f));
            if (Number.isFinite(nf) && nf >= 1) fps = nf;
            paint(fromBoxes(bMin.value, bSec.value, bFrm.value));
        },
    };
}

/**
 *  2026-10-28：XiaoHei-分段表「起始」的主控件 —— 时间轴色块（业界唯一正解）。
 *
 * 为什么不是滑块 / 不是数字框（调研结论，剪映 / Premiere / DaVinci / ComfyUI
 * 生态节点 ComfyTV·NKD·LNL 全部一致）：
 *   · 滑块：1 小时铺在 200px 上 ⇒ 1px≈432 帧，物理上拖不准；
 *   · 数字框：让人把"时间"换算成"几万帧"，是反人类的心智负担（上一版已实证被骂）；
 *   · 时间轴：**位置即意义** —— 色块左边=起始、宽度=时长，一屏看见这段在哪、多长，
 *     拖色块=改起始、拖两端=改时长、点空白=跳过去、←/→=微调 1 帧。
 *
 * 量程自适应：轨道只铺到「最晚一段的结束 ×1.15」（下限 30 秒口径）⇒
 *   短片（几段 ×几秒）色块够大好拖；要跳到 50 分钟处就在输入框打 50:00，
 *   量程自动跟着撑开，之后可在附近拖 —— 闭环自洽，不需要缩放按钮。
 *
 * 接口与 makeXHSlider / makeXHTimecode 对齐（set / setMaxes / setMode / root / row），
 * ⇒ 分段表现有的显示·隐藏·切单位·恢复默认逻辑一行都不用改就能驱动它。
 * 新增：setLen（时长→色块宽度）、setReadonly（连续模式只读）。
 */
export function makeXHTimelineBar(o = {}) {
    ensureXHSliderCss();
    const min = Number.isFinite(Number(o.min)) ? Number(o.min) : 0;
    let hardMax = Number.isFinite(Number(o.max)) ? Number(o.max) : 86400;
    let lenMax = Number.isFinite(Number(o.lenMax)) ? Number(o.lenMax) : 1500;
    let fps = Math.max(1, Math.round(Number(o.fps) || 24));
    let frames = !!o.frames;
    let ro = !!o.readonly;

    const clampV = (v) => Math.max(min, Math.min(hardMax, Math.round(Number(v) || 0)));
    const clampL = (v, s) => {
        let l = Math.max(1, Math.min(lenMax, Math.round(Number(v) || 0)));
        const room = hardMax - Math.max(0, Math.round(Number(s) || 0));
        return Math.min(l, Math.max(1, room));
    };

    const root = document.createElement("div");
    root.className = "xh-sl-root";
    const row = document.createElement("div");
    row.className = "xh-sl-row";
    root.appendChild(row);

    let labelEl = null;
    if (o.label) {
        labelEl = document.createElement("span");
        labelEl.className = "xh-sl-label";
        labelEl.textContent = o.label;
        row.appendChild(labelEl);
    }

    // ---- 轨道（时间轴本体）----
    const track = document.createElement("div");
    track.style.cssText = "position:relative;flex:1 1 auto;min-width:70px;height:24px;box-sizing:border-box;"
        + "border:1px solid rgba(0,0,0,.35);border-radius:3px;background:#171717;overflow:hidden;"
        + "touch-action:none;cursor:pointer;";
    row.appendChild(track);

    // ---- 色块（左边=起始，宽度=时长）----
    const seg = document.createElement("div");
    seg.style.cssText = "position:absolute;top:2px;height:18px;min-width:14px;box-sizing:border-box;"
        + "border-radius:3px;overflow:hidden;display:flex;align-items:center;justify-content:center;"
        + "font-size:10px;line-height:1;color:#e8e8e8;user-select:none;background:#252525;";
    seg.tabIndex = 0;
    const mkHandle = (side) => {
        const h = document.createElement("span");
        h.dataset.h = side === "left" ? "l" : "r";
        h.style.cssText = "position:absolute;top:0;height:100%;width:7px;cursor:ew-resize;"
            + "background:rgba(255,255,255,.32);" + side + ":0;";
        return h;
    };
    seg.appendChild(mkHandle("left"));
    seg.appendChild(mkHandle("right"));
    track.appendChild(seg);

    // ---- 读数行：起始（可打字）→ 结束 · 时长 ----
    const readRow = document.createElement("div");
    readRow.style.cssText = "display:flex;align-items:center;gap:4px;margin:3px 0 0 "
        + (labelEl ? "0" : "0") + ";font-size:10px;line-height:1;color:#8a8a8a;";
    root.appendChild(readRow);
    const tcIn = document.createElement("input");
    tcIn.type = "text";
    tcIn.spellcheck = false;
    tcIn.style.cssText = "width:58px;flex:none;font-size:10px;height:16px;line-height:1;box-sizing:border-box;"
        + "text-align:center;border-radius:2px;border:1px solid rgba(0,0,0,.3);background:#1c1c1c;"
        + "color:#e8e8e8;padding:0 2px;";
    const mkTx = (w) => {
        const s = document.createElement("span");
        s.style.cssText = "flex:none;font-size:10px;line-height:1;" + (w ? "min-width:" + w + "px;" : "");
        return s;
    };
    const arrowTx = mkTx(0), endTx = mkTx(0), durTx = mkTx(0);
    arrowTx.textContent = "→";
    readRow.appendChild(tcIn); readRow.appendChild(arrowTx);
    readRow.appendChild(endTx); readRow.appendChild(durTx);

    // 家族铁律：DOM 控件必须吞掉画布事件，否则点一下就变成拖节点 / 触发画布快捷键
    //  2026-10-31 修：track/seg 是 tcIn 与色块手柄的**祖先**，
    //   用 capture(true) 拦截 ⇒ 事件到不了 target、也进不了冒泡阶段
    //   ⇒ **本组件自己的 bubble 拖动 handler 永远不执行**（实测：拖了没反应）。
    //    改成冒泡阶段拦截：照样挡住画布，又不影响自己的 handler。
    for (const el of [track, seg, tcIn]) {
        ["pointerdown", "mousedown", "dblclick", "click", "keydown", "wheel", "contextmenu"].forEach((ev) =>
            el.addEventListener(ev, (e) => e.stopPropagation()));
    }

    const cur = { s: clampV(o.value == null ? min : o.value), l: 1 };
    cur.l = clampL(o.lenValue == null ? 1 : o.lenValue, cur.s);

    // ---- 值 ↔ 时间码文本 ----
    const fmtTC = (v) => {
        const x = Math.max(0, Math.round(Number(v) || 0));
        if (!frames) {
            const m = Math.floor(x / 60);
            return m + ":" + String(x - m * 60).padStart(2, "0");
        }
        const per = fps * 60, m = Math.floor(x / per), r = x - m * per;
        const s = Math.floor(r / fps);
        return m + ":" + String(s).padStart(2, "0") + ":" + String(r - s * fps).padStart(2, "0");
    };
    /** "12:30" / "12:30:12" / 纯数字（按当前单位解释）。解析不了返回 null。 */
    const parseTC = (str) => {
        const t = String(str == null ? "" : str).trim();
        if (!t) return null;
        if (t.indexOf(":") < 0) {
            const n = Number(t);
            return Number.isFinite(n) ? n : null;
        }
        const p = t.split(":").map((x) => Math.max(0, Math.round(Number(String(x).trim()) || 0)));
        if (!frames) return (p[0] || 0) * 60 + (p[1] || 0);
        return ((p[0] || 0) * 60 + (p[1] || 0)) * fps + (p[2] || 0);
    };

    const snapPts = () => { try { const a = o.snapPoints?.(); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    /** 自然量程：铺到「最晚一段结束 ×1.15」，下限 30 秒口径（帧口径 = 30×fps） */
    const autoSpan = () => {
        let mx = cur.s + cur.l;
        for (const p of snapPts()) if (Number.isFinite(p)) mx = Math.max(mx, p);
        const floor = frames ? fps * 30 : 30;
        return Math.min(Math.max(mx, floor) * 1.15, Math.max(hardMax, 1));
    };
    //  视窗（滚轮缩放 + 自动跟随）：只有「0 → 全程」一把尺子的话，
    //    1 小时的片子里 8 秒的段只占 1px，照样拖不动（滑块的老毛病会原样复现）。
    //    ⇒ v0 = 窗口起点、vspan = 窗口跨度；滚轮以光标为锚缩放，
    //      且当前段永远被框在窗口里（在读数框打 50:00，窗口自动跟过去，附近就能精细拖）。
    let v0 = 0, vspan = 0;
    const ensureView = () => {
        const asp = autoSpan();
        if (!Number.isFinite(vspan) || vspan <= 0) vspan = asp;
        const s = cur.s, e = s + cur.l;
        if (e - s > vspan * 0.9) vspan = Math.min((e - s) * 1.15, Math.max(hardMax, 1));
        if (s < v0) v0 = Math.max(0, s - vspan * 0.05);
        else if (e > v0 + vspan) v0 = Math.max(0, e + vspan * 0.05 - vspan);
        if (vspan < hardMax && v0 + vspan > hardMax) v0 = Math.max(0, hardMax - vspan);
    };

    const paint = () => {
        ensureView();
        const w = Math.max(1, track.getBoundingClientRect().width || 1);
        const L = Math.max(0, Math.min(100, ((cur.s - v0) / vspan) * 100));
        const W = Math.max(0, (cur.l / vspan) * 100);
        seg.style.left = L + "%";
        seg.style.width = W + "%";
        seg.style.background = ro ? "#4a4a4a" : "#252525";
        seg.style.cursor = ro ? "default" : "grab";
        seg.textContent = (o.segNo != null && w * (W / 100) >= 22) ? String(o.segNo) : "";
        if (ro) { seg.title = "连续模式：起始由前面几段累加得出，不用填"; }
        else {
            seg.title = "拖动=改起始 · 拖两端=改时长 · 点轨道=跳过去 · 滚轮=缩放 · ←/→=微调 1 帧（Shift=±10）";
        }
        tcIn.value = fmtTC(cur.s);
        tcIn.disabled = false;
        endTx.textContent = fmtTC(cur.s + cur.l);
        durTx.textContent = " · " + cur.l + (frames ? "帧" : "s");
        readRow.style.opacity = ro ? ".75" : "1";
    };

    const fireStart = (v) => { try { o.onInput?.(v); } catch (e) { console.warn("[XiaoHei Timeline] onInput 抛错:", e); } };
    const fireLen = (v) => { try { o.onLenInput?.(v); } catch (e) { console.warn("[XiaoHei Timeline] onLenInput 抛错:", e); } };
    /** 吸附：靠近别的段头/段尾（≤5px）就贴过去，免得拼出缝 */
    const snap = (v) => {
        const tol = (vspan / Math.max(1, track.getBoundingClientRect().width || 1)) * 5;
        for (const p of snapPts()) if (Number.isFinite(p) && Math.abs(p - v) <= tol) return clampV(p);
        return clampV(v);
    };

    // ---- 拖动 ----
    let drag = null;
    track.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (ro) return;
        const r = track.getBoundingClientRect();
        const w = Math.max(1, r.width);
        const span = vspan;
        const h = e.target && e.target.dataset ? e.target.dataset.h : null;
        if (h === "l" || h === "r") {
            drag = { m: h, x0: e.clientX, s0: cur.s, l0: cur.l, w, span };
        } else if (e.target === seg || seg.contains(e.target)) {
            drag = { m: "m", x0: e.clientX, s0: cur.s, l0: cur.l, w, span };
        } else {
            // 点空白：跳过去（业界「点哪到哪」，保持时长）
            const v = clampV(v0 + ((e.clientX - r.left) / w) * span);
            cur.s = Math.max(min, Math.min(v, Math.max(min, hardMax - cur.l)));
            paint(); fireStart(cur.s);
            drag = { m: "m", x0: e.clientX, s0: cur.s, l0: cur.l, w, span };
        }
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
        try { seg.focus(); } catch (err) {}
    });
    track.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dv = ((e.clientX - drag.x0) / drag.w) * drag.span;
        if (drag.m === "m") {
            const s = Math.max(min, Math.min(snap(drag.s0 + dv), Math.max(min, hardMax - cur.l)));
            cur.s = s; paint(); fireStart(s);
        } else if (drag.m === "r") {
            const l = clampL(drag.l0 + dv, cur.s);
            cur.l = l; paint(); fireLen(l);
        } else {
            const end = drag.s0 + drag.l0;
            const s = Math.max(min, Math.min(snap(drag.s0 + dv), Math.max(min, end - 1)));
            cur.l = clampL(end - s, s); cur.s = s;
            paint(); fireStart(s); fireLen(cur.l);
        }
    });
    const endDrag = () => { drag = null; };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("lostpointercapture", endDrag);

    // ---- 键盘微调（←/→ = ±1，Shift = ±10）----
    seg.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault(); e.stopPropagation();
        if (ro) return;
        const d = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1);
        const v = Math.max(min, Math.min(clampV(cur.s + d), Math.max(min, hardMax - cur.l)));
        cur.s = v; paint(); fireStart(v);
    });

    // ---- 滚轮缩放（以光标为锚）：跨度大看得全，跨度小拖得准 ----
    track.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = track.getBoundingClientRect();
        const w = Math.max(1, r.width);
        const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / w));
        const anchor = v0 + ratio * vspan;
        const nv = Math.max(1, Math.min(Math.max(hardMax, 1), vspan * (e.deltaY > 0 ? 1.3 : 1 / 1.3)));
        v0 = Math.max(0, anchor - ratio * nv);
        vspan = nv;
        paint();
    });

    // ---- 输入框：打字精确跳转（"47:30" / "47:30:12" / 纯数字）----
    //  只听 change（失焦 / 回车），不听 input —— 打字途中被打断会乱
    tcIn.addEventListener("change", () => {
        if (ro) { paint(); return; }
        const v = parseTC(tcIn.value);
        if (v == null) { paint(); return; }
        const s = Math.max(min, Math.min(clampV(v), Math.max(min, hardMax - cur.l)));
        cur.s = s; paint(); fireStart(s);
    });

    paint();

    return {
        root, row, labelEl,
        range: track, numBox: tcIn,              // 兼容旧调用方（读 range / numBox 不炸）
        set: (v) => { cur.s = clampV(v); cur.l = clampL(cur.l, cur.s); paint(); },
        setLen: (v) => { cur.l = clampL(v, cur.s); paint(); },
        get: () => cur.s,
        getLen: () => cur.l,
        setMaxes: (_drag, hard) => { const h = Number(hard); if (Number.isFinite(h)) hardMax = h; paint(); },
        setLenMax: (m) => { const h = Number(m); if (Number.isFinite(h)) lenMax = h; paint(); },
        setMode: (fr, f) => {
            frames = !!fr;
            const nf = Math.round(Number(f));
            if (Number.isFinite(nf) && nf >= 1) fps = nf;
            paint();
        },
        setReadonly: (b) => { ro = !!b; paint(); },
    };
}

/**
 *  2026-10-28：XiaoHei-分段表「时间轴总览」—— 一条常驻长轴，量程 = 用户填的「总时长」，
 *   **所有段同屏显示**（每段一个独立颜色），改任何一段的起始 / 时长，那段色块立刻跟着动。
 *
 * 与 makeXHTimelineBar（每段一条轴）的分工：
 *   · 总览轴：看全局分布、拖任意段、点段切换编辑目标 —— 常驻，不随「当前编辑段」切换；
 *   · 单段轴：精确值（打字 / 微调）—— 只在跳接模式显示当前段。
 *
 * 量程固定 = total（用户填的总时长）⇒ **不做视窗缩放**（用户明确要求"轴就是总时长那么长"）。
 * @param {object} o  total / fps / frames / segs[{s,l}] / onSegChange(i,s,l) / onSelect(i)
 */
export function makeXHTimelineOverview(o = {}) {
    ensureXHSliderCss();
    let total = Math.max(1, Number(o.total) || 600);
    let fps = Math.max(1, Math.round(Number(o.fps) || 24));
    let frames = !!o.frames;
    //  2026-10-31 新增 continuous（连续分段模式）：
    //   「分段表」语义 = 每段**长度固定**，起点上限 = total - len（clampS）。
    //   「视频分段轴」语义 = 各段**首尾相接连续覆盖全片**，长度会变 ⇒ 那个钳位是错的
    //   （实测：段起点被钳在 total-l，拖了半天纹丝不动）。
    //   ⇒ continuous=true 时起点上限放宽到 total-1，长度由调用方按比例重排。
    let cont = !!o.continuous;
    let segs = Array.isArray(o.segs) ? o.segs.map((g) => ({ s: Number(g?.s) || 0, l: Number(g?.l) || 0 })) : [];

    const root = document.createElement("div");
    root.className = "xh-sl-root";
    root.style.cssText = "display:flex;flex-direction:column;gap:2px;";

    const ruler = document.createElement("div");
    ruler.style.cssText = "position:relative;height:13px;flex:none;";
    const track = document.createElement("div");
    track.style.cssText = "position:relative;height:28px;flex:none;box-sizing:border-box;"
        + "border:1px solid rgba(0,0,0,.35);border-radius:3px;background:#171717;overflow:hidden;"
        + "touch-action:none;cursor:default;";
    root.appendChild(ruler);
    root.appendChild(track);

    // 家族铁律：DOM 控件必须吞掉画布事件
    //  2026-10-31 修（用户投诉「滑动也不好滑动」的真凶）：
    //   这里**不能加 capture（true）**！
    //   ruler/track 是段块的**祖先** ⇒ 捕获阶段一调 stopPropagation，
    //   事件就**到不了 target、也进不了冒泡阶段** ⇒
    //   **本组件自己在 track 上绑的 bubble 拖动 handler 永远不执行**（实测：拖了没反应）。
    //   （makeXHSlider 没这问题：它绑在 range **自身**上，target 阶段不受影响。）
    //    改成**冒泡阶段**拦截：照样挡住画布（画布在祖先上），
    //      又不影响本组件自己的 handler（同节点的其它 listener 不受 stopPropagation 影响）。
    for (const el of [ruler, track]) {
        ["pointerdown", "mousedown", "dblclick", "click", "keydown", "wheel", "contextmenu"].forEach((ev) =>
            el.addEventListener(ev, (e) => e.stopPropagation()));
    }

    const fmtTC = (v) => {
        const x = Math.max(0, Math.round(Number(v) || 0));
        if (!frames) {
            const m = Math.floor(x / 60);
            return m + ":" + String(x - m * 60).padStart(2, "0");
        }
        const per = fps * 60, m = Math.floor(x / per), r = x - m * per, s = Math.floor(r / fps);
        return m + ":" + String(s).padStart(2, "0") + ":" + String(r - s * fps).padStart(2, "0");
    };
    /** 段色：按段序均匀分布色相 ⇒ 段数多少都能一眼分清 */
    const colorOf = (i, n) => "hsl(" + Math.round((i * 360) / Math.max(1, n)) + ",58%,58%)";

    const trackW = () => Math.max(1, track.getBoundingClientRect().width || 1);
    const clampS = (v, l) => cont
        // 连续模式：长度会变 ⇒ 起点上限不能按 total-l 算
        ? Math.max(0, Math.min(total - 1, Math.round(Number(v) || 0)))
        : Math.max(0, Math.min(total - Math.max(1, l), Math.round(Number(v) || 0)));
    const clampL = (v, s) => Math.max(1, Math.min(total - Math.max(0, s), Math.round(Number(v) || 0)));

    const paintRuler = () => {
        const marks = [0, 0.25, 0.5, 0.75, 1];
        let h = "";
        for (const m of marks) {
            const p = m * 100;
            h += '<i style="position:absolute;top:8px;left:' + p + '%;width:1px;height:4px;'
                + 'background:rgba(255,255,255,.28)"></i>';
            if (m === 0 || m === 0.5 || m === 1) {
                h += '<span style="position:absolute;top:0;left:' + p + '%;transform:translateX(-50%);'
                    + 'font-size:9px;line-height:1;color:#8a8a8a;white-space:nowrap">' + fmtTC(total * m) + '</span>';
            }
        }
        ruler.innerHTML = h;
    };

    let blocks = [];
    const rebuild = () => {
        track.innerHTML = "";
        blocks = segs.map((g, i) => {
            const b = document.createElement("div");
            b.className = "xh-ov-b";
            b.dataset.i = String(i);
            b.tabIndex = 0;
            b.style.cssText = "position:absolute;top:2px;height:22px;min-width:6px;box-sizing:border-box;"
                + "border-radius:3px;overflow:hidden;display:flex;align-items:center;justify-content:center;"
                + "font-size:10px;line-height:1;color:#0f1726;user-select:none;cursor:grab;outline:none;";
            const mkH = (side) => {
                const h = document.createElement("span");
                h.dataset.h = side === "left" ? "l" : "r";
                h.style.cssText = "position:absolute;top:0;height:100%;width:6px;cursor:ew-resize;"
                    + "background:rgba(0,0,0,.30);" + side + ":0;";
                return h;
            };
            const num = document.createElement("span");
            num.style.cssText = "pointer-events:none;font-size:10px;line-height:1;";
            b.appendChild(mkH("left"));
            b.appendChild(num);
            b.appendChild(mkH("right"));
            track.appendChild(b);
            return { el: b, num };
        });
    };

    const paint = () => {
        if (blocks.length !== segs.length) rebuild();
        const w = trackW();
        segs.forEach((g, i) => {
            const bk = blocks[i];
            if (!bk) return;
            bk.el.style.left = Math.max(0, Math.min(100, (g.s / total) * 100)) + "%";
            bk.el.style.width = Math.max(0, (g.l / total) * 100) + "%";
            bk.el.style.background = colorOf(i, segs.length);
            bk.el.title = "第 " + (i + 1) + " 段 · 起始 " + fmtTC(g.s) + " · 长度 " + g.l + (frames ? "帧" : "s")
                + " · 拖动改起始 / 拖两端改长度 / ←→ 微调 1 帧";
            bk.num.textContent = w * (g.l / total) >= 18 ? String(i + 1) : "";
        });
        paintRuler();
    };

    const fire = (i) => { try { o.onSegChange?.(i, segs[i].s, segs[i].l); } catch (e) { console.warn("[XiaoHei Overview] onSegChange 抛错:", e); } };
    /** 吸附：贴到邻段的头/尾（≤5px），拼长片不留缝 */
    const snapS = (v, i) => {
        const tol = (total / trackW()) * 5;
        const cand = [];
        if (i > 0 && segs[i - 1]) cand.push(segs[i - 1].s + segs[i - 1].l);
        if (i + 1 < segs.length && segs[i + 1]) cand.push(segs[i + 1].s, segs[i + 1].s - segs[i].l);
        if (i > 0 && segs[i - 1]) cand.push(segs[i - 1].s);
        for (const p of cand) if (Number.isFinite(p) && Math.abs(p - v) <= tol) return clampS(p, segs[i].l);
        return clampS(v, segs[i].l);
    };

    let drag = null;
    track.addEventListener("pointerdown", (e) => {
        const b = e.target && e.target.closest ? e.target.closest(".xh-ov-b") : null;
        if (!b) return;
        e.stopPropagation();
        const i = Number(b.dataset.i);
        if (!Number.isFinite(i) || !segs[i]) return;
        const h = e.target && e.target.dataset ? e.target.dataset.h : null;
        drag = { i, m: h === "l" || h === "r" ? h : "m", x0: e.clientX, s0: segs[i].s, l0: segs[i].l, w: trackW() };
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
        try { b.focus(); } catch (err) {}
        try { o.onSelect?.(i); } catch (err) {}
    });
    track.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const g = segs[drag.i];
        if (!g) return;
        const dv = ((e.clientX - drag.x0) / drag.w) * total;
        if (drag.m === "m") {
            g.s = snapS(drag.s0 + dv, drag.i);
        } else if (drag.m === "r") {
            g.l = clampL(drag.l0 + dv, g.s);
        } else {
            const end = drag.s0 + drag.l0;
            const s = Math.max(0, Math.min(snapS(drag.s0 + dv, drag.i), Math.max(0, end - 1)));
            g.l = clampL(end - s, s);
            g.s = s;
        }
        paint(); fire(drag.i);
    });
    const endDrag = () => { drag = null; };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("lostpointercapture", endDrag);

    // 键盘微调：←/→ = ±1（Shift = ±10）
    track.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const b = e.target && e.target.closest ? e.target.closest(".xh-ov-b") : null;
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        const i = Number(b.dataset.i);
        if (!Number.isFinite(i) || !segs[i]) return;
        const d = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1);
        segs[i].s = clampS(segs[i].s + d, segs[i].l);
        paint(); fire(i);
    });

    paint();

    return {
        root, track,
        /** 外部同步：量程 / 单位 / 帧率 / 各段数值 */
        set: (n) => {
            if (n && Number.isFinite(Number(n.total))) total = Math.max(1, Number(n.total));
            if (n && typeof n.frames === "boolean") frames = n.frames;
            if (n && Number.isFinite(Number(n.fps))) fps = Math.max(1, Math.round(Number(n.fps)));
            if (n && typeof n.continuous === "boolean") cont = n.continuous;
            if (n && Array.isArray(n.segs)) {
                segs = n.segs.map((g) => ({ s: Number(g?.s) || 0, l: Number(g?.l) || 0 }));
            }
            paint();
        },
        getSegs: () => segs.map((g) => ({ s: g.s, l: g.l })),
    };
}

/** 滑块所在 DOM widget 的动态高度（XiaoHei-滑块 节点已验证：getMinHeight/getHeight 比 lockDomWidgetHeight 管用） */
export function sliderHeight(el, fallback = 44) {
    try {
        return (el?.scrollHeight || el?.offsetHeight || fallback) + 4;
    } catch (e) {
        return fallback;
    }
}

// ---- ⑬  齿轮按钮（家族唯一样式，2026-10-20）------------------------------
//
// 为什么抽到 kit：家族里带齿轮的节点有 4 个（XiaoHei-滑块 / XiaoHei-链式提示词 / XiaoHei-加载视频 /
// XiaoHei-MSR中继），此前是**两份 emoji（）+ 两份自写 SVG**，底色 #252525 偏暗、齿画得细、
// 挂载位置还各不相同（prepend / append 混用）。用户明确要求「统一起来」⇒ 一处实现。
//
// 图标：8 齿**粗壮实心**齿轮（齿根 r=8.7 / 齿顶 r=11.4，中心孔 r=3.9），
//       同一 fill 描边 0.9 + round join 把尖角磨圆 ⇒ 15px 下依旧「有肉」，不再是细线团。
// 颜色：收起=官方暗底 #252525 + 近白箭头（原 #ffffff 白底白图标看不清）、
//       展开=官方白键 #e8e8e8 + 深墨箭头，**两态明度差大 ⇒ 一眼分辨状态**。
// 尺寸：26×22（与家族其它小按钮同排不突兀）。
// 位置：**永远排工具条最左**（调用方一律传 makeXHToolbar 的 prependNodes）。
//
// 用法：
//   const gear = makeGearBtn({
//       titleFn: (col) => col ? "点开展开参数" : "点此收起参数",   // 语言切换自动跟随
//       onToggle: (col) => setCollapsed(node, col),
//   });
//   makeXHToolbar(node, { prependNodes: [gear] });

//  2026-11-06 家族齿轮统一： 图标**只留给「设置」**（改交互偏好、不影响出图结果）。
//    本按钮是「展开/收起高级参数」——里面藏的是**会改出图结果的真参数**，不是设置，
//    所以改用折叠箭头：收起=▸（点开展示），展开=▾（点它收起），两态方向不同。
export const XH_MORE_SVG_EXPAND =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" '
    + 'style="display:block;flex:0 0 auto">'
    + '<path d="M8 4.8 L18 12 L8 19.2 Z"/></svg>';
export const XH_MORE_SVG_COLLAPSE =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" '
    + 'style="display:block;flex:0 0 auto">'
    + '<path d="M4.8 8 L19.2 8 L12 18 Z"/></svg>';

/**  旧齿轮图标：仅保留导出做兼容，家族折叠按钮已不再使用（见上）。 */
export const XH_GEAR_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" '
    + 'style="display:block;flex:0 0 auto">'
    + '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 '
    + '.12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 '
    + '0 0 0-.48-.41h-3.84a.5.5 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 '
    + '0 0-.59.22L2.74 8.87a.5.5 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 '
    + '1.58a.5.5 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 '
    + '2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39'
    + '.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 '
    + '0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>';

/** 折叠按钮底色（收起 / 展开）—— 家族统一，勿在节点里另写 */
export const GEAR_BG_COLLAPSED = "#252525";   // 官方暗底（收起参数）
export const GEAR_BG_OPEN = "#e8e8e8";        // 官方白键（展开参数）
/** 折叠按钮图标色（跟着底色走：暗底用近白、白底用深墨）—— 保证两态都看得清 */
export const GEAR_TX_COLLAPSED = "#e8e8e8";
export const GEAR_TX_OPEN = "#1c1c1c";

/**
 * 家族统一「更多参数」折叠按钮（ 不是它， 只用于设置）。
 * @param opts.collapsed 初始是否收起（默认 true）
 * @param opts.title     静态 title（无 titleFn 时用）
 * @param opts.titleFn   (collapsed) => string，动态 title；语言切换后调 btn._xhGearPaint() 即刷新
 * @param opts.onToggle  (collapsed) => void，点击后调用（collapsed 为**切换后**的状态）
 * @returns HTMLButtonElement，附带 _xhGearCollapsed / _xhGearSet(c) / _xhGearPaint()
 */
export function makeGearBtn(opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    // 图标在 paint() 里按折叠状态画（▸ / ▾），别在这儿写死。
    btn.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:26px;height:22px;padding:0;"
        //  2026-10-29：底色两态不同（收起暗 #252525 / 展开白键 #e8e8e8）⇒
        //    图标色必须跟着状态走（暗底配近白、白底配深墨），写死一个色必有一态看不见。
        + "border:1px solid #333333;border-radius:4px;color:#e8e8e8;cursor:pointer;"
        + "flex:0 0 auto;font-family:inherit;"
        + "user-select:none;transition:filter .15s,background .15s,box-shadow .15s;";

    const paint = () => {
        const col = !!btn._xhGearCollapsed;
        // 只在方向变了才重建图标：paint() 会被语言切换反复调用，别把调用方塞进来的内容冲掉。
        const icon = col ? XH_MORE_SVG_EXPAND : XH_MORE_SVG_COLLAPSE;
        if (btn._xhMoreIcon !== icon) { btn.innerHTML = icon; btn._xhMoreIcon = icon; }
        btn.style.background = col ? GEAR_BG_COLLAPSED : GEAR_BG_OPEN;
        btn.style.color = col ? GEAR_TX_COLLAPSED : GEAR_TX_OPEN;
        btn.style.boxShadow = col ? "none" : "inset 0 0 0 1px rgba(0,0,0,.25)";
        const t = (typeof opts.titleFn === "function") ? opts.titleFn(col) : opts.title;
        if (t) btn.title = t;
    };

    btn._xhGearCollapsed = opts.collapsed !== false;
    btn._xhGearSet = (c) => { btn._xhGearCollapsed = !!c; paint(); };
    btn._xhGearPaint = paint;
    paint();

    btn.addEventListener("mouseenter", () => { btn.style.filter = "brightness(1.28)"; });
    btn.addEventListener("mouseleave", () => { btn.style.filter = ""; });
    if (typeof opts.onToggle === "function") {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            btn._xhGearCollapsed = !btn._xhGearCollapsed;
            paint();
            opts.onToggle(btn._xhGearCollapsed, btn);
        });
    }
    ["pointerdown", "mousedown", "dblclick", "keydown", "click"].forEach((ev) =>
        btn.addEventListener(ev, (e) => e.stopPropagation()));

    return btn;
}

// ════════════════════════════════════════════════════════════════════════════
//  2026-11-08 · 标题栏装饰**全部撤掉**（用户拍板）
//   历史：2026-10-29「统一石墨」方案 B 曾给标题栏加 2px 琥珀金顶线 +
//         标题文字前 6px 分类色小方块，旧画布（canvas 覆写）与 Nodes 2.0（DOM）各做一套。
//   现状：金线 2026-11-06 撤、小方块 2026-11-08 撤 ⇒  标题栏不再叠加任何自绘装饰，
//         排版完全交回官方；标题栏**颜色**由 xh_brand.js 的 GRAPHITE_TITLE_HEX 决定
//         （现由主题预设决定，classic = 暖黑 #1A1613 + 金色标题字）。
//   保留：家族身份标记（__xhCatHex / __xhUnifiedTitle / xh-family-header class /
//         data-xh-family），标题字加粗仍靠这套，别顺手删。
// ════════════════════════════════════════════════════════════════════════════

//  2026-11-08：顶部金线（2026-11-06 撤）与分类色小方块（本次撤）相关的
//    XH_ACCENT_PX / XH_DOT_PX / XH_DOT_X 三个常量已全部删除。
//    标题栏不再叠加任何自绘装饰，排版完全交回官方。

/** 品牌色（从 XH_BRAND 取，浅色主题自动切深版）。 */
function _xhAccentColor() {
    try { return brandButtonBg(); } catch (e) { return "#E8A33C"; }
}

/**
 * 给单个节点做「默认模式」的家族标记（旧版画布模式）。
 *  2026-11-08 用户拍板：标题栏左上角的分类色小方块**取消**。
 *    原来这里包装 drawTitleBarBackground / drawTitleText 画 6px 方块，
 *    连同 Nodes 2.0 的 .xh-cat-dot DOM 一起全部停掉 ⇒ 本函数**不再包装任何 canvas 方法**，
 *    标题栏排版完全交回官方，只剩「身份标记」职责。
 * 幂等：装过就不重复装。
 * @param node   节点实例
 * @param catHex 分类色（只作身份链标记， 不显示）
 */
export function installUnifiedTitleBar(node, catHex) {
    if (!node) return false;
    if (node.__xhUnifiedTitle) { node.__xhCatHex = catHex || node.__xhCatHex; return true; }
    //  这两个标记必须保留：_xhIsFamilyNode() 靠 hasOwnProperty("__xhCatHex") 认家族节点，
    //    删了会让标题为空串的节点（如 XiaoHei-标签）丢失标题加粗。
    node.__xhUnifiedTitle = true;
    if (catHex) node.__xhCatHex = catHex;
    return true;
}

// ════════════════════════════════════════════════════════════════════════════
//  2026-11-06 最终版（用户拍板，前面几版全部作废）
//   「你就不能够恢复到官方的那个宽度吗？标题那个字没有在重心位置它偏下了，
//     被分割了。节点顶部的黄色的条条不要了。」
//   ⇒ ① 标题栏**一行布局 CSS 都不写**：宽高 / 内边距 / 字号 / 行高 / 对齐
//        全部交回官方 NodeHeader 自己渲染，家族节点与官方节点排版零差异；
//     ② 顶部黄条（金线）Vue + 旧 canvas 两处都不画，并清掉已写进 DOM 的旧渐变；
//     ③ 家族唯一差异 = 标题字 font-weight:700（用户明确要过，且不动盒模型）。
//    不许再往 .lg-node-header 上加 padding / max-height / line-height 之类的覆盖。
// ════════════════════════════════════════════════════════════════════════════
const XH_FAMILY_TITLE_STYLE_ID = "xh-family-title-style";

const XH_TITLE_CSS = `
/*  2026-11-06 用户最终拍板：标题栏**完全交回官方渲染**。
   之前那套 padding / font-size / line-height / min-height / max-height 覆盖，
   把标题字挤得偏下、还被 32px 上限切掉（用户原话「没有在重心位置它偏下了，被分割了」）。
   ⇒ 一行布局 CSS 都不留：标题栏宽高、内边距、字号、行高、对齐全部由官方
     NodeHeader 自己算，家族节点和官方节点在排版上**零差异**。 */
/* ① 顶部黄条：连旧代码写进 DOM 的 inline 渐变一起压掉。
      外部 !important 胜过无 !important 的 inline ⇒ 哪怕页面没重启、旧 JS 还在画，
      这道黄条也立刻消失。官方 header surface 本来就没有背景图 ⇒ 零副作用。 */
.bg-node-component-header-surface { background-image: none !important; }
/* ② 家族唯一保留的差异：标题字加粗。font-weight 不改盒模型，不会把字推离重心。 */
.lg-node-header.xh-family-header [data-testid="node-title"],
.lg-node-header.xh-family-header [data-testid="node-title"] *,
.lg-node-header.xh-family-header .text-node-component-slot-text,
.lg-node-header.xh-family-header .text-node-component-slot-text *,
.lg-node[data-xh-family="1"] .lg-node-header [data-testid="node-title"],
.lg-node[data-xh-family="1"] .lg-node-header [data-testid="node-title"] *,
.lg-node[data-xh-family="1"] .lg-node-header .text-node-component-slot-text,
.lg-node[data-xh-family="1"] .lg-node-header .text-node-component-slot-text * {
  font-weight: 700 !important;
}
`;

function installXHFamilyTitleStyle() {
    try {
        let st = document.getElementById(XH_FAMILY_TITLE_STYLE_ID);
        if (!st) {
            st = document.createElement("style");
            st.id = XH_FAMILY_TITLE_STYLE_ID;
            document.head.appendChild(st);
        }
        //  不能「存在就 return」：页面没重启时旧的 <style>（带 padding/max-height）
        //   还挂在 head 上，光改 js 不生效 ⇒ 用户刷新后看到的还是被挤偏下的旧样式。
        //   ⇒ 每次都用最新版覆盖 textContent（字符串相等才跳过，幂等）。
        if (st.textContent !== XH_TITLE_CSS) st.textContent = XH_TITLE_CSS;
    } catch (e) { /* 样式注入失败不影响节点功能 */ }
}

//  2026-11-06 全量收口（用户第三次追问「都改了吗」后的根因修复）：
//   原来这段 CSS **只**在 refreshVueTitles() 的 rAF 回调里才注入，而 rAF 要等
//   setup() / onNodeCreated / MutationObserver 任一路径触发才跑。只要那一轮没跑
//   （扩展加载顺序、Vue 首屏晚于 setup、observer 挂早了没收到 mutation），
//   整包标题栏样式就**一条都没进 DOM** ⇒ 用户刷新后看到「跟没改一样」。
//   ⇒ 模块一加载立刻注入（幂等，函数内部有 getElementById 守卫），不再依赖任何钩子。
try {
    if (typeof document !== "undefined" && document.head) installXHFamilyTitleStyle();
} catch (e) { /* noop */ }

/**
 * Nodes 2.0 模式：清理旧装饰 + 给标题栏打家族标记。
 *  2026-11-08：分类色小方块取消 ⇒ 这里不再插 .xh-cat-dot，
 *    反而要**移除**页面上残留的旧 dot（不重启时旧 DOM 还赖着）。
 * @param el     标题栏元素（.lg-node-header）
 * @param catHex 分类色（仅为兼容调用点保留， 不再用于显示）
 * @returns true = 本次真的改了
 */
export function paintVueUnifiedTitle(el, catHex) {
    if (!el || !el.style) return false;
    installXHFamilyTitleStyle();
    try { if (!el.classList.contains("xh-family-header")) el.classList.add("xh-family-header"); } catch (e) {}
    let changed = false;
    try {
        //  2026-11-06 用户：「节点顶部的黄色的条条不要了」。
        //    不再画金线；同时把**旧代码已经写进 DOM 的 inline 渐变**清掉，
        //    否则不重启时那道黄条还赖在标题栏上。只清我们自己的 linear-gradient，
        //    不碰官方可能设置的其它背景。
        const surface = el.closest ? (el.closest(".bg-node-component-header-surface") || el.parentElement?.parentElement) : null;
        if (surface && surface.style) {
            const bi = surface.style.backgroundImage || "";
            if (bi && /linear-gradient/i.test(bi)) {
                surface.style.removeProperty("background-image");
                surface.style.removeProperty("background-size");
                surface.style.removeProperty("background-repeat");
                surface.style.removeProperty("background-position");
                changed = true;
            }
        }
        //  2026-11-08：移除旧的分类色小方块（含不重启时残留的 DOM）。
        //    querySelectorAll 兜住历史版本可能插在不同宿主（文字元素 / header）里的多个 dot。
        const stale = el.querySelectorAll ? el.querySelectorAll(".xh-cat-dot") : [];
        for (const d of stale) { try { d.remove(); changed = true; } catch (e) {} }
    } catch (e) { return false; }
    return changed;
}

// ================================================================
//  调试入口：把家族关键工具挂到 window.__XH_KIT__
//   用途：回归脚本 / 浏览器控制台直接调用，不必去翻模块。
//    只暴露只读/幂等的工具，不暴露会改画布状态的重排函数。
// ================================================================
try {
    if (typeof window !== "undefined") {
        window.__XH_KIT__ = {
            version: "1.34.3",
            xhSanitizeFamilyTypes,
            xhSanitizeWidgetTypes,
            xhPinFamilyIndex,
            xhPinIndexWidget,
            xhApplyNamedWidgetValues,
            xhFamilyIndexNames,
        };
    }
} catch (e) { /* noop */ }
