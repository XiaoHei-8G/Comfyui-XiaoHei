import { BRAND } from "../shared/index.mjs";

// ─── Defaults ────────────────────────────────────────────────
export const DEFAULTS = {
  text: "XiaoHei 浮字标签",
  fontSize: 18,
  fontFamily: "Arial",
  fontColor: "#ffffff",
  textAlign: "left",
  backgroundColor: "#333333",
  padding: 10,
  borderRadius: 6,
  opacity: 1,
  fontWeight: "normal",
  lineHeight: 1,
};

// ⚠️ 前四个字符串是**存档契约**（老工作流的 label_json 里就是它们），一律不改，
//    新字体只能往后追加（2026-11-26）。
export const FONT_CHOICES = [
  "Arial",
  "Times New Roman",
  "Courier New",
  "Impact",
  // ↓ 2026-11-26 追加：等线 / 仿宋（Windows·macOS 都自带）+ 得意黑（随包内置）
  "DengXian",
  "FangSong",
  "Smiley Sans Oblique",
];

// 中文优先字体栈：前四款本来是西文字体，中文必然 fallback 到系统默认中文字体，
// 结果四个按钮的「小黑」长得一模一样，用户根本分不出区别。改成差异明显的
// 中文字体，落在按钮 / 预览 / 画布上都能一眼看出是不同字体。
// ⚠️ 只换「显示用字体」，「等宽」对汉字本来就没有视觉差异，第 3 格改用楷体；
//    FONT_CHOICES 的存档值一律不动，老工作流不受影响。
// 🔴 最后一条「Smiley Sans Oblique（得意黑）」是**内置字体**：文件在 ./fonts/ 里随包
//    分发，粉丝不用装系统字体，字形跟你机器上完全一致（为什么必须内置、授权怎么算，
//    见 §13.80 与本目录 fonts/README.txt）。
export const FONT_STACKS = [
  "'Microsoft YaHei','PingFang SC','Hiragino Sans GB',Arial,'Segoe UI Emoji','Noto Color Emoji',sans-serif",
  "'SimSun','Songti SC','Noto Serif CJK SC','Times New Roman','Segoe UI Emoji','Noto Color Emoji',serif",
  "'KaiTi','STKaiti','Kaiti SC','Courier New','Segoe UI Emoji','Noto Color Emoji',monospace",
  "'SimHei','Heiti SC','Microsoft YaHei',Impact,'Segoe UI Emoji','Noto Color Emoji',sans-serif",
  "'DengXian','等线','Microsoft YaHei','PingFang SC','Segoe UI Emoji','Noto Color Emoji',sans-serif",
  "'FangSong','仿宋','STFangsong','Songti SC','SimSun','Segoe UI Emoji','Noto Color Emoji',serif",
  "'Smiley Sans Oblique','SmileySans-Oblique','Microsoft YaHei','PingFang SC',sans-serif",
];

// 按钮上显示的文字（用户点名：把样例英文换成汉字「小黑」）。
export const FONT_SAMPLE_TEXT = "小黑";
// 中文名，用于 title 提示与无障碍标签。
export const FONT_LABELS = ["黑体", "宋体", "楷体", "粗黑", "等线", "仿宋", "得意黑"];
export const FONT_HINTS = [
  "黑体·无衬线（微软雅黑）",
  "宋体·衬线",
  "楷体·手写体",
  "粗黑·黑体",
  "等线·细现代无衬线（Windows 自带）",
  "仿宋·公文感（Windows 自带）",
  "得意黑·标题冲击体（随包内置，谁装都一样）",
];
// 兼容旧引用
export const FONT_SHORT = FONT_LABELS;

// ─── 内置字体加载（2026-11-26）─────────────────────────────────
// 为什么不用 <style>@font-face：canvas 绘制不需要样式表，但需要字体真的注册进
// `document.fonts`。用 FontFace API 直接注册，任何入口（编辑器 / 画布 / 节点 DOM）
// 都能拿到，也省掉一次 CSS 注入。
// 🔴 首屏坑：字体没加载完时 canvas 用 fallback 画，之后**不会自动重绘**。所以所有
//    绘制方都要挂 onEmbeddedFontsReady()，加载完成后补一次重绘（§13.80）。
const EMBEDDED_FONT_FAMILY = "Smiley Sans Oblique";
const EMBEDDED_FONT_URL = new URL("./fonts/SmileySans-Oblique.woff2", import.meta.url).href;

let _fontState = "idle"; // idle | loading | ready
let _fontFace = null;
const _fontWaiters = [];

function flushFontWaiters() {
  _fontState = "ready";
  const ws = _fontWaiters.splice(0);
  for (const fn of ws) { try { fn(); } catch (_e) {} }
}

/** 字体加载完就跑一次 cb（已在就同步跑）。多次调用只下载一次。 */
export function onEmbeddedFontsReady(cb) {
  if (typeof cb !== "function") return;
  if (_fontState === "ready") { try { cb(); } catch (_e) {} return; }
  _fontWaiters.push(cb);
  if (_fontState === "loading") return;
  _fontState = "loading";
  if (typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") {
    flushFontWaiters();
    return;
  }
  try {
    // 字体本身是斜体设计，但**声明成 normal**：家族节点里没有 italic 请求，
    // 声明成 oblique 会导致 font-style:normal 匹配不上 ⇒ 直接 fallback。
    _fontFace = new FontFace(EMBEDDED_FONT_FAMILY, `url("${EMBEDDED_FONT_URL}") format("woff2")`);
    document.fonts.add(_fontFace);
    _fontFace.load().then(flushFontWaiters, flushFontWaiters);
  } catch (_e) {
    flushFontWaiters();
  }
}

// 把存档里的字体名翻译成实际可用的 CSS 字体栈。
export function stackOf(family) {
  const i = FONT_CHOICES.indexOf(family);
  if (i >= 0) return FONT_STACKS[i];
  // 老工作流/手改过 json 的未知字体名：原样保留，别吞掉用户设置
  return `'${family}','Segoe UI Emoji','Noto Color Emoji',system-ui,sans-serif`;
}

// (Legacy curated swatch arrays removed — the editor now uses the shared
//  PIXAROMA_PALETTE from js/shared/color_picker.mjs.)

// ─── 对比预设（背景 + 文字一次定）──────────────────────────────
// 2026-11-25 用户要求：逐个调「背景」「文字」两个色太麻烦，要几组全世界通用的
// 高对比配对，一键套用。这里全部按 WCAG 2.1 对比度筛选，覆盖浅底深字 / 深底浅字 /
// 警示黄 / 新闻蓝 / 强调红，外加最常用的「透明底白字」（压在视频画面上用）。
// ⚠️ 只影响新建/点击时的配色，不改 DEFAULTS，老工作流存档值一个字不动。
export const COLOR_PRESETS = [
  { id: "dark-on-light", bg: "#ffffff", fg: "#000000", name: "白底黑字" },
  { id: "light-on-dark", bg: "#000000", fg: "#ffffff", name: "黑底白字" },
  { id: "dark-on-yellow", bg: "#ffe100", fg: "#000000", name: "黄底黑字" },
  { id: "yellow-on-dark", bg: "#000000", fg: "#ffe100", name: "黑底黄字" },
  { id: "light-on-blue", bg: "#0b3d91", fg: "#ffffff", name: "蓝底白字" },
  { id: "light-on-red", bg: "#c8102e", fg: "#ffffff", name: "红底白字" },
  { id: "light-on-clear", bg: "transparent", fg: "#ffffff", name: "透明底白字" },
];

// WCAG 2.1 相对亮度 → 对比度。预设卡片的提示里标真实比值，不靠手感写死数字。
// 返回 null 表示算不了（透明底、非 #RRGGBB），调用方自己回退文案。
export function contrastRatio(bg, fg) {
  const lum = (hex) => {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return null;
    const ch = [0, 2, 4].map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      if (Number.isNaN(v)) return null;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    if (ch.some((v) => v === null)) return null;
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const a = lum(bg);
  const b = lum(fg);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ─── Helpers ─────────────────────────────────────────────────
export function fontStr(cfg) {
  return `${cfg.fontWeight === "bold" ? "bold " : ""}${cfg.fontSize}px ${stackOf(cfg.fontFamily)}`;
}

export function measureLabel(cfg) {
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d");
  // 按行内分段测量：每段用自己那套字体量，行宽 = 各段之和。
  // 纯文本时每行只有一段，结果与改造前完全一致。
  const rich = richLines(cfg);
  let maxW = 0;
  const rowLh = [];
  for (const runs of rich) {
    let sum = 0;
    let maxSize = cfg.fontSize;
    for (const r of runs) {
      ctx.font = runFont(cfg, r);
      sum += ctx.measureText(r.text).width;
      maxSize = Math.max(maxSize, r.size || cfg.fontSize);
    }
    maxW = Math.max(maxW, sum);
    // 行高按**该行最大字号**算：某一段被放大到 34px 时整行要跟着变高，
    // 否则大字号会被固定的行高挤扁 / 溢出到下一行。
    rowLh.push(maxSize * cfg.lineHeight);
  }
  if (!rowLh.length) rowLh.push(cfg.fontSize * cfg.lineHeight);
  const totalH = rowLh.reduce((a, b) => a + b, 0);
  return {
    w: Math.ceil(maxW) + cfg.padding * 2,
    h: Math.ceil(totalH) + cfg.padding * 2,
    // lines 仍是「每行纯文本」，老调用方（缩略、命中测试）不用改
    lines: rich.map((runs) => runs.map((r) => r.text).join("")),
    rich,
    rowLh,
    lh: rowLh[0],
  };
}

// ─── 富文本（行内分段样式）────────────────────────────────────
// 2026-11-25 从老「标签」节点（XHLabel）移植过来：选中一段文字单独改字号 /
// 颜色 / 加粗，整块其它文字不受影响。
//
// 数据模型（关键，别改坏）：
//   cfg.text  ← 纯文本，**存档契约**，老工作流只有它，一个字节都不能变
//   cfg.rich  ← 受限 HTML（只有 <span style> / <br> / <div>），有它优先渲染
// 两者同时写：text 给测量兜底与搜索，rich 给渲染。rich 为空 ⇒ 退回纯文本渲染，
// 所以老工作流、手改过 json 的、被别的工具清过 rich 的，全都照常显示。
const RICH_TAGS = new Set(["SPAN", "BR", "DIV", "P", "B", "STRONG", "I", "EM", "U"]);
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);
const RICH_STYLE_KEYS = ["font-size", "color", "font-weight", "font-style", "text-decoration"];

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// contentEditable 吐出来的 HTML 不可信（粘一段网页进来就带一堆样式/脚本）。
// 白名单清洗：只留 RICH_TAGS，属性只留 style 里的五项，其余全剥。
export function sanitizeRich(html) {
  const src = String(html == null ? "" : html);
  if (!src) return "";
  if (typeof document === "undefined") return "";
  const box = document.createElement("div");
  box.innerHTML = src;
  const clean = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      if (!RICH_TAGS.has(child.tagName)) {
        // 不在白名单的标签：保留文字，去掉标签本身
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
        clean(node);
        return;
      }
      for (const attr of Array.from(child.attributes)) {
        if (attr.name !== "style") child.removeAttribute(attr.name);
      }
      for (const prop of Array.from(child.style)) {
        if (!RICH_STYLE_KEYS.includes(prop)) child.style.removeProperty(prop);
      }
      clean(child);
    }
  };
  clean(box);
  return box.innerHTML;
}

/** 存档 → 用于渲染的 HTML（rich 优先，没有就把纯文本转义成 HTML）。 */
export function richHtmlOf(cfg) {
  const rich = cfg.rich ? sanitizeRich(cfg.rich) : "";
  if (rich) return rich;
  // 纯文本：换行转 <br>，其余 HTML 转义（防止标注里写 "<div>" 被当标签）
  return escapeHtml(cfg.text || "").replace(/\n/g, "<br>");
}

/** 把 rich HTML 拆成「一行 = 若干 run」的结构，供 canvas 测量与绘制。 */
export function richLines(cfg) {
  const html = richHtmlOf(cfg);
  const lines = [];
  let cur = [];
  const pushLine = () => { lines.push(cur); cur = []; };
  const pushText = (text, st) => {
    if (!text) return;
    const parts = String(text).split("\n");
    parts.forEach((p, i) => {
      if (i > 0) pushLine();
      if (p) cur.push({ text: p, size: st.size || cfg.fontSize, bold: !!st.bold, italic: !!st.italic, color: st.color || cfg.fontColor });
    });
  };
  if (typeof document === "undefined") { pushText(cfg.text || "", {}); pushLine(); }
  else {
    const box = document.createElement("div");
    box.innerHTML = html;
    const walk = (node, st) => {
      if (node.nodeType === 3) { pushText(node.nodeValue, st); return; }
      if (node.nodeType !== 1) return;
      if (node.tagName === "BR") { pushLine(); return; }
      const nst = { ...st };
      const s = node.style || {};
      const fs = parseFloat(s.fontSize);
      if (fs > 0) nst.size = fs;
      if (s.color) nst.color = s.color;
      if (node.tagName === "B" || node.tagName === "STRONG") nst.bold = true;
      if (node.tagName === "I" || node.tagName === "EM") nst.italic = true;
      if (s.fontWeight && (String(s.fontWeight) === "bold" || parseInt(s.fontWeight, 10) >= 600)) nst.bold = true;
      if (s.fontStyle === "italic") nst.italic = true;
      const isBlock = BLOCK_TAGS.has(node.tagName);
      if (isBlock && cur.length) pushLine();
      for (const ch of node.childNodes) walk(ch, nst);
      if (isBlock && cur.length) pushLine();
    };
    for (const ch of box.childNodes) walk(ch, {});
    if (cur.length) pushLine();
  }
  if (!lines.length) lines.push([]);
  // 去掉末尾因 <br> 多出来的空行（保留用户真敲的空行，只削掉最后一个）
  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

function runFont(cfg, run) {
  const size = run.size || cfg.fontSize;
  const bold = run.bold || cfg.fontWeight === "bold";
  return `${bold ? "bold " : ""}${run.italic ? "italic " : ""}${size}px ${stackOf(cfg.fontFamily)}`;
}

// ─── Canvas rendering (shared by preview and node draw) ──────
export function renderLabelToCanvas(ctx, cfg, m, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = cfg.opacity;
  if (cfg.backgroundColor !== "transparent") {
    ctx.fillStyle = cfg.backgroundColor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, m.w, m.h, cfg.borderRadius);
    else ctx.rect(0, 0, m.w, m.h);
    ctx.fill();
  }
  ctx.globalAlpha = cfg.opacity;
  ctx.textBaseline = "alphabetic";
  const rows = m.rich || [];
  let y = cfg.padding;
  for (let i = 0; i < rows.length; i++) {
    const runs = rows[i];
    const rowH = m.rowLh?.[i] ?? m.lh ?? cfg.fontSize * cfg.lineHeight;
    if (runs.length) {
      // 混排字号时按该行最大字号的基线对齐，小字才不会往上飘
      let maxSize = cfg.fontSize;
      for (const r of runs) maxSize = Math.max(maxSize, r.size || cfg.fontSize);
      const baseline = y + maxSize * 0.82;
      // 先量整行宽度，再按对齐决定起点（canvas 的 textAlign 对分段绘制不适用）
      let total = 0;
      for (const r of runs) {
        ctx.font = runFont(cfg, r);
        r._w = ctx.measureText(r.text).width;
        total += r._w;
      }
      let x = cfg.padding;
      if (cfg.textAlign === "center") x = (m.w - total) / 2;
      else if (cfg.textAlign === "right") x = m.w - cfg.padding - total;
      for (const r of runs) {
        ctx.font = runFont(cfg, r);
        ctx.fillStyle = r.color || cfg.fontColor;
        ctx.fillText(r.text, x, baseline);
        x += r._w;
      }
    }
    y += rowH;
  }
  ctx.globalAlpha = 1;
}

// ─── DOM rendering (Nodes 2.0 node body) ─────────────────────
// The crisp-HTML mirror of renderLabelToCanvas. Maps the SAME cfg to CSS, so
// the Nodes 2.0 label matches the Legacy canvas paint closely (and stays sharp
// at any zoom / large font). white-space:pre preserves the \n line breaks +
// spaces; the background pill is the element background + border-radius.
export function applyLabelToDom(el, cfg) {
  // 富文本优先：cfg.rich 有内容就按受限 HTML 渲染（行内 span 的字号/颜色/加粗
  // 直接生效）；没有 rich 的老存档退回纯文本，显示与改造前完全一致。
  const rich = cfg.rich ? sanitizeRich(cfg.rich) : "";
  if (rich) el.innerHTML = rich;
  else el.textContent = cfg.text || "";
  el.style.fontFamily = stackOf(cfg.fontFamily);
  el.style.fontSize = `${cfg.fontSize}px`;
  el.style.fontWeight = cfg.fontWeight === "bold" ? "bold" : "normal";
  el.style.lineHeight = String(cfg.lineHeight);
  el.style.color = cfg.fontColor;
  el.style.textAlign = cfg.textAlign;
  el.style.padding = `${cfg.padding}px`;
  el.style.opacity = String(cfg.opacity);
  if (cfg.backgroundColor && cfg.backgroundColor !== "transparent") {
    el.style.background = cfg.backgroundColor;
    el.style.borderRadius = `${cfg.borderRadius}px`;
  } else {
    el.style.background = "transparent";
    el.style.borderRadius = "0";
  }
}

// CSS for the Nodes 2.0 label box + the node-frame hide (once).
let _vueCssInjected = false;
export function injectVueLabelCSS() {
  if (_vueCssInjected) return;
  _vueCssInjected = true;
  const s = document.createElement("style");
  s.id = "xh-lbl-vue-css";
  s.textContent = `
.xh-lbl-vue {
    display: inline-block; box-sizing: border-box; white-space: pre;
    user-select: none;
    /* ComfyUI's widget host is a flex column; without these the element gets
       STRETCHED to the node's (too-narrow) width, so the background pill ends at
       the node edge while the text overflows past it. align-self + flex:none
       make it size to the TEXT, so the pill always wraps the full text. */
    align-self: flex-start; flex: 0 0 auto;
    /* pointer-events:none is CRITICAL: Label is a title-less node, so its whole
       body is this element. If it captured the mouse, the place-on-canvas click
       (and node dragging) would land on it instead of the node, and the node
       would get stuck to the cursor. With none, clicks pass through to the node;
       editing is via double-click (legacy) / right-click "Edit Label". */
    pointer-events: none;
}
/* Make the Label node read as FLOATING TEXT in Nodes 2.0: hide the Vue node
   card/frame at rest so only the label shows (the hover toolbar + resize
   handles are a separate Vue overlay and stay). Scoped via :has() so it only
   touches Label nodes; no-op in legacy (no .lg-node there). */
.lg-node:has(.xh-lbl-vue) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
.lg-node:has(.xh-lbl-vue) .lg-node-content { padding: 0 !important; }
/* THE PLACEMENT FIX: ComfyUI wraps our label in widget containers
   (.lg-node-widgets > .lg-node-widget > a flex host) that are ALL
   pointer-events:auto, so they eat the place-on-canvas / drag click (the node
   itself is pointer-events:none - all node interaction goes through the canvas
   by hit-test). Make the ENTIRE widget subtree of a Label node click-through so
   placement / drag / right-click reach the canvas. Safe because a Label has no
   interactive controls in its body - it's display-only text. Verified via the
   ancestor-chain console diagnostic (2026-06-01). */
.lg-node:has(.xh-lbl-vue) .lg-node-widgets,
.lg-node:has(.xh-lbl-vue) .lg-node-widgets * {
    pointer-events: none !important;
    /* overflow:visible so the widget wrappers never clip the label text when
       the node is momentarily a hair narrower than the rendered text (the node
       is resized to the real text width a frame later by _xhLblFit). */
    overflow: visible !important;
}
/* Tighten the selection / resize box to HUG the label. Every floor below was
   found by reading the compiled frontend (agent investigation 2026-06-01):
   a hardcoded 225px node min-width, a widget grid that forces 80px+125px
   columns, a 12px reorder-handle gutter + 12px right padding, ~20px of body
   padding (pt-1 pb-3 gap-1), and a selection outline drawn 7px OUTSIDE the node.
   Combined with _xhLblFit writing node.size = the real label size, this makes
   the box wrap the label. */
/* 1. Kill the min-WIDTH (225px) AND min-HEIGHT (node.size[1] + ~30px title
   height) on the node + its frame wrappers, so the box shrinks to the label in
   both dimensions. The min-height is what left the bottom handles low. */
.lg-node:has(.xh-lbl-vue),
.lg-node:has(.xh-lbl-vue) > div,
.lg-node:has(.xh-lbl-vue) > div > div { min-width: 0 !important; min-height: 0 !important; }
/* 2. Collapse the widget grid to a single content-sized column (drops the
   80px+125px column minimums, the right padding, row gaps, and the gutter). */
.lg-node:has(.xh-lbl-vue) .lg-node-widgets {
    grid-template-columns: max-content !important;
    padding-right: 0 !important;
    row-gap: 0 !important;
    gap: 0 !important;
}
.lg-node:has(.xh-lbl-vue) .lg-node-widget { gap: 0 !important; }
.lg-node:has(.xh-lbl-vue) .lg-node-widget > *:first-child { display: none !important; }
/* 3. Remove the node body's vertical padding + gap (pt-1 pb-3 gap-1) that adds
   space below the label. Broad substring match in case the class prefix varies. */
.lg-node:has(.xh-lbl-vue) [class*="component-node-background"] {
    padding: 0 !important;
    gap: 0 !important;
}
/* 4. Pull the selection outline in from -7px so the handles hug the box. */
.lg-node:has(.xh-lbl-vue) [data-testid="node-state-outline-overlay"],
.lg-node:has(.xh-lbl-vue) > div.absolute.outline-none { inset: -2px !important; }
/* 5. Hide the resize handles. The label auto-sizes to its text (_xhLblFit), so
   manual resize is a no-op (it snaps back) - the grips are just clutter. They're
   the only direct-child divs of the node that hold an icon <svg>; the size
   fallback (.h-5.w-5) catches them if the markup shifts. Selecting / moving /
   deleting / double-click-to-edit all still work (those aren't these handles). */
.lg-node:has(.xh-lbl-vue) > div:has(> svg),
.lg-node:has(.xh-lbl-vue) > div.h-5.w-5 { display: none !important; }
/* 6. Hide the Nodes 2.0 node FOOTER row (the muted status strip that holds the
   category chip, e.g. "XH" from the "XH/..." category). A newer
   frontend added this row; on a title-less, transparent Label it's pure clutter
   AND reserves a ~37px strip below the text, so the node frame can't hug the
   label (the "contour" floating below + around the pill). The node sizes to its
   content, so removing the footer lets the frame shrink back to the label.
   We hide the node-body child that CONTAINS the chip (the footer row, robust to
   its utility classes changing) PLUS the chip itself as a fallback. Scoped to
   Label nodes via :has(); the label content is .xh-lbl-vue (no such class), so
   only the footer/chip are hit. */
/*  MATCH THE FOOTER ROW BY ITS OWN CLASS, NEVER WITH A NESTED DESCENDANT
   :has() (viewport-lag report 2026-08-26, reproduced and measured live).
   This rule used to read "> div:has(.bg-node-component-surface)". An INNER
   descendant :has() has to be evaluated against every div in the document, so
   Chrome re-runs it on every class change anywhere in the graph - and ComfyUI
   changes node classes constantly while you pan, zoom, hover and select.
   MEASURED in Nodes 2.0 on a 56-node graph, toggling a class over 40 frames:
   0.33 ms/frame with our CSS off, 7.56 ms/frame as shipped, 1.01 ms/frame
   after this change - so ONE selector was ~90% of the cost, roughly 4.5 ms of
   a 16.7 ms frame budget on its own. Monitor and Run Timer carried the same
   rule and got the same fix.
   A direct-child :has(> svg) (rule 5) measured FREE, so it is specifically the
   DESCENDANT form that is expensive - do not assume :has() is always the
   problem, and re-measure before trading one selector for another.
   The footer row is the muted status strip; ".text-muted-foreground" selects
   exactly the same elements (verified live: same 4 nodes, none left visible).
   If a future frontend renames that utility class the row comes back, but the
   chip below is still hidden, so it degrades to a small gap rather than a
   broken label. */
.lg-node:has(.xh-lbl-vue) [class*="component-node-background"] > div.text-muted-foreground,
.lg-node:has(.xh-lbl-vue) .bg-node-component-surface { display: none !important; }
/* 7. Hide the node's RESTING border. A newer frontend draws it as an absolute
   child overlay (<div class="pointer-events-none absolute border border-solid
   ...">) instead of a border on .lg-node, so the host border:none rule above does
   not reach it. It rendered as a faint rounded contour around the pill with a LARGER
   corner radius than the label (the node frame's radius vs the pill's), reading as
   an unwanted second outline. The resting border has NO data-testid; the SELECTION
   outline overlay DOES (handled by rule #4 above), so :not([data-testid]) hides
   only the resting frame and a picked label still shows a hugging outline. */
.lg-node:has(.xh-lbl-vue) > div.absolute.border:not([data-testid]) { display: none !important; }
`;
  document.head.appendChild(s);
}

// ─── CSS injection (once) ────────────────────────────────────
let _cssInjected = false;
export function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.xh-lbl-overlay {
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', system-ui, sans-serif;
}
.xh-lbl-panel {
    background: #171718; border: 1px solid #2e2e2e; border-radius: 10px;
    width: 720px; max-height: 90vh; overflow-y: auto;
    box-shadow: 0 16px 48px rgba(0,0,0,0.7); position: relative;
    scrollbar-width: thin; scrollbar-color: #444 transparent;
}
.xh-lbl-panel::-webkit-scrollbar { width: 5px; }
.xh-lbl-panel::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
.xh-lbl-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid #242424; position: sticky; top: 0;
    background: #171718; z-index: 1;
}
.xh-lbl-title { display: flex; align-items: center; gap: 6px; color: #e0e0e0; font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
.xh-lbl-title-logo { width: 18px; height: 18px; }
.xh-lbl-title-brand { color: var(--xh-primary,#E8A33C); }
.xh-lbl-close {
    background: none; border: none; color: #555; font-size: 18px;
    cursor: pointer; padding: 0 2px; line-height: 1;
}
.xh-lbl-close:hover { color: #ddd; }
.xh-lbl-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
/* Section label */
.xh-lbl-lbl {
    display: block; color: #555; font-size: 9px; margin-bottom: 4px;
    text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;
}
.xh-lbl-field textarea {
    width: 100%; box-sizing: border-box;
    background: #1e1e1f; border: 1px solid #2e2e2e; border-radius: 5px;
    color: #d0d0d0; padding: 7px 9px; font-size: 13px;
    font-family: inherit; outline: none; resize: vertical; min-height: 46px;
}
.xh-lbl-field textarea:focus { border-color: var(--xh-primary,#E8A33C); }
/* 正文（contenteditable）：外观跟原 textarea 一致，多出来的能力是「选中一段
   后右键单独改字号/颜色/加粗」。white-space:pre-wrap 让换行与空格照原样。 */
.xh-lbl-field .xh-lbl-text {
    width: 100%; box-sizing: border-box; min-height: 46px; max-height: 132px; overflow-y: auto;
    background: #1e1e1f; border: 1px solid #2e2e2e; border-radius: 5px;
    color: #d0d0d0; padding: 7px 9px; font-size: 13px; font-family: inherit;
    outline: none; white-space: pre-wrap; overflow-wrap: break-word; line-height: 1.45;
    user-select: text; cursor: text;
}
.xh-lbl-field .xh-lbl-text:focus { border-color: var(--xh-primary,#E8A33C); }
.xh-lbl-field .xh-lbl-text::-webkit-scrollbar { width: 5px; }
.xh-lbl-field .xh-lbl-text::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
/* 文字框下面那行常驻提示（富文本怎么用） */
.xh-lbl-field .xh-lbl-hint { margin-top: 5px; color: #6f6f75; font-size: 10.5px; line-height: 1.4; }
.xh-lbl-preview {
    border-radius: 6px; border: 1px solid #222;
    padding: 12px; height: 200px; box-sizing: border-box; display: flex;
    align-items: center; justify-content: center; overflow: hidden;
    /* subtle checkerboard so a transparent background reads as transparent */
    background-color: #111;
    background-image:
      linear-gradient(45deg, #1b1b1b 25%, transparent 25%, transparent 75%, #1b1b1b 75%),
      linear-gradient(45deg, #1b1b1b 25%, transparent 25%, transparent 75%, #1b1b1b 75%);
    background-size: 16px 16px;
    background-position: 0 0, 8px 8px;
}
.xh-lbl-preview canvas { display: block; max-width: 100%; max-height: 100%; }
/* Toggle button group */
.xh-lbl-btns { display: flex; gap: 5px; flex-wrap: nowrap; align-items: stretch; }
.xh-lbl-btn {
    flex: 1 1 0; min-width: 0;
    padding: 7px 8px; border: 1px solid #333; border-radius: 5px;
    background: #232325; color: #888; font-size: 12px; cursor: pointer;
    transition: all 0.12s; line-height: 1.4;
    display: flex; align-items: center; justify-content: center;
}
.xh-lbl-btn:hover { border-color: #555; color: #bbb; }
.xh-lbl-btn.active { background: color-mix(in srgb, var(--xh-primary,#E8A33C) 13%, transparent); border-color: var(--xh-primary,#E8A33C); color: var(--xh-primary,#E8A33C); }
/* 字体按钮：每个都写「小黑」，靠字形区分 —— 单独占区、格够宽、字号够大才看得清。
   7 款排一行会压成小方块（20px 的「小黑」挤不下），改成 4 列网格 = 4+3 两行。 */
.xh-lbl-fontrow { gap: 6px; display: grid; grid-template-columns: repeat(4, 1fr); }
.xh-lbl-fontrow .xh-lbl-fontbtn { padding: 8px 4px; min-height: 40px; }
.xh-lbl-fontbtn { font-size: 20px; letter-spacing: 0.02em; font-weight: 400; }
.xh-lbl-stylerow { margin-top: 6px; }
.xh-lbl-bold { font-weight: bold; min-width: 26px; text-align: center; }
/* Divider inside button row — align-self:center so the short line sits in the
   middle of the row instead of dropping to the top (a fixed-height flex item in
   an align-items:stretch row defaults to flex-start). */
.xh-lbl-vsep { width: 1px; height: 20px; background: #333; margin: 0 3px; flex-shrink: 0; align-self: center; }
/* Spacing & Style — 2-col grid of slider fields */
.xh-lbl-spacing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 14px; }
/* Footer */
.xh-lbl-footer {
    display: flex; justify-content: flex-end; align-items: center; gap: 6px;
    padding: 8px 14px; border-top: 1px solid #242424; position: sticky; bottom: 0;
    background: #171718;
}
.xh-lbl-footer button {
    padding: 6px 16px; border: none; border-radius: 5px;
    font-size: 12px; cursor: pointer; font-weight: 500;
}
.xh-lbl-btn-cancel { background: #252527; color: #aaa; border: 1px solid #333; }
.xh-lbl-btn-cancel:hover { background: #2e2e30; }
.xh-lbl-btn-save { background: var(--xh-primary,#E8A33C); color: #fff; border: 1px solid transparent; }
.xh-lbl-btn-save:hover { opacity: 0.88; }
/* Align icon buttons */
.xh-lbl-align-icon { display: flex; flex-direction: column; gap: 2px; width: 13px; align-items: flex-start; }
.xh-lbl-align-icon span { display: block; height: 2px; background: currentColor; border-radius: 1px; }
.xh-lbl-align-left .xh-lbl-align-icon span:nth-child(1) { width: 13px; }
.xh-lbl-align-left .xh-lbl-align-icon span:nth-child(2) { width: 9px; }
.xh-lbl-align-left .xh-lbl-align-icon span:nth-child(3) { width: 11px; }
.xh-lbl-align-center .xh-lbl-align-icon { align-items: center; }
.xh-lbl-align-center .xh-lbl-align-icon span:nth-child(1) { width: 13px; }
.xh-lbl-align-center .xh-lbl-align-icon span:nth-child(2) { width: 9px; }
.xh-lbl-align-center .xh-lbl-align-icon span:nth-child(3) { width: 11px; }
.xh-lbl-align-right .xh-lbl-align-icon { align-items: flex-end; }
.xh-lbl-align-right .xh-lbl-align-icon span:nth-child(1) { width: 13px; }
.xh-lbl-align-right .xh-lbl-align-icon span:nth-child(2) { width: 9px; }
.xh-lbl-align-right .xh-lbl-align-icon span:nth-child(3) { width: 11px; }
/* (Help is the shared themed popup from js/shared/help.mjs - no editor-local
    help-overlay CSS needed.) */
/* Round help button (matches the Group Colors / toolbar look) */
.xh-lbl-help-btn {
    width: 28px; height: 28px; border-radius: 50%;
    border: none; background: var(--xh-primary,#E8A33C); color: #fff; font-size: 13px; font-weight: 700;
    cursor: pointer; line-height: 1; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
}
.xh-lbl-help-btn:hover { filter: brightness(1.12); }
/* Reset sits next to Help on the left (the spacer pushes Cancel/Save right).
   Ghost style so it reads as a low-emphasis utility action, clearly distinct
   from the bordered-gray Cancel button at the other end of the footer. */
.xh-lbl-footer-spacer { flex: 1 1 auto; }
.xh-lbl-btn-reset { background: transparent; color: #888; border: 1px solid transparent; }
.xh-lbl-btn-reset:hover { background: rgba(255,255,255,0.06); color: #ddd; }
/* Slider + editable number + spinner arrows (matches .pix-nc-slider) */
/* inline label (left of the slider) so the row is one line - saves height */
/* min-width fits the longest label ("Line Height") so all four sliders in the
   2-col Spacing grid stay the SAME length (a shorter min let that one row's
   nowrap label steal width from its slider). */
.xh-lbl-slbl { flex: 0 0 auto; min-width: 68px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #777; white-space: nowrap; }
.xh-lbl-sliderrow { display: flex; align-items: center; gap: 8px; }
.xh-lbl-slider {
    -webkit-appearance: none; appearance: none;
    flex: 1 1 auto; min-width: 0; height: 6px; cursor: pointer; margin: 0;
    background: linear-gradient(to right, var(--xh-primary,#E8A33C) 0%, var(--xh-primary,#E8A33C) var(--fill, 50%), #3a3a40 var(--fill, 50%), #3a3a40 100%);
    border-radius: 3px; border: none; outline: none;
}
.xh-lbl-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 13px; height: 13px; border-radius: 50%;
    background: var(--xh-primary,#E8A33C); border: none; box-shadow: 0 0 3px rgba(0,0,0,0.5);
    cursor: pointer; margin-top: -3.5px;
}
.xh-lbl-slider::-moz-range-thumb {
    width: 13px; height: 13px; border-radius: 50%;
    background: var(--xh-primary,#E8A33C); border: none; box-shadow: 0 0 3px rgba(0,0,0,0.5); cursor: pointer;
}
.xh-lbl-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: transparent; border: none; }
.xh-lbl-slider::-moz-range-track { height: 6px; border-radius: 3px; background: transparent; border: none; }
.xh-lbl-spin {
    display: flex; align-items: stretch; flex: 0 0 auto; height: 24px;
    background: #161616; border: 1px solid #3a3a40; border-radius: 6px; overflow: hidden;
}
.xh-lbl-spinval {
    width: 44px; min-width: 44px; text-align: right; font-size: 12px; color: #ddd;
    background: transparent; border: none; outline: none; padding: 0 4px;
    font-variant-numeric: tabular-nums;
}
.xh-lbl-spinbtns { display: flex; flex-direction: column; width: 15px; flex: 0 0 auto; border-left: 1px solid #3a3a40; }
.xh-lbl-spinbtns button {
    flex: 1 1 0; border: none; background: rgba(255,255,255,0.05); color: #aaa;
    font-size: 7px; line-height: 1; cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
}
.xh-lbl-spinbtns button:last-child { border-top: 1px solid #3a3a40; }
.xh-lbl-spinbtns button:hover { background: rgba(255,255,255,0.12); color: #fff; }
/* Background / Text color buttons — Prompt-Multi-style segmented pills: solid
   orange when active, gray when inactive. They select which target the picker +
   swatches edit; the selected colour's label + editable hex code shows in the
   bar under the picker (.xh-lbl-hexbar). */
.xh-lbl-cbars { display: flex; gap: 6px; margin-bottom: 10px; }
.xh-lbl-cbar {
    flex: 1 1 0; min-width: 0; box-sizing: border-box;
    padding: 9px 8px; border-radius: 6px; cursor: pointer; text-align: center;
    font: 13px system-ui, sans-serif;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.85); transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.xh-lbl-cbar:hover { background: var(--xh-primary,#E8A33C); border-color: var(--xh-primary,#E8A33C); color: #fff; }
.xh-lbl-cbar.active { background: var(--xh-primary,#E8A33C); border-color: var(--xh-primary,#E8A33C); color: #fff; }
/* 对比预设：一键同时定「背景 + 文字」。卡片本身就是效果预览——卡底 = 背景色，
   中间的「字」= 文字色，不用点开就能看出这组配得清不清楚。 */
.xh-lbl-prelabel { font: 11px system-ui, sans-serif; color: #8a8a90; margin-bottom: 6px; }
.xh-lbl-presets {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
    gap: 6px; margin-bottom: 10px;
}
.xh-lbl-preset {
    height: 34px; padding: 0; border-radius: 6px; cursor: pointer; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(255,255,255,0.18);
    transition: border-color 0.12s, box-shadow 0.12s;
}
.xh-lbl-preset:hover { border-color: #999; }
.xh-lbl-preset.active {
    border-color: var(--xh-primary,#E8A33C);
    box-shadow: 0 0 0 1px var(--xh-primary,#E8A33C);
}
.xh-lbl-preset-tx { font: 700 15px/1 system-ui, sans-serif; pointer-events: none; }
/* 透明底：斜纹棋盘表示「没有背景」，压在画面上用 */
.xh-lbl-preset.is-transp {
    background-color: #3a3a3a;
    background-image:
      linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%),
      linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%);
    background-size: 10px 10px;
    background-position: 0 0, 5px 5px;
}
/* Hex bar under the picker (Group "Body #hex" style): dark interior, swatch
   chip, the selected target's label (gray) + its editable hex code (orange).
   It replaces the picker's own hex field (hidden below), and the label switches
   between "Background" and "Text" with the selected button. */
.xh-lbl-hexbar {
    display: flex; align-items: center; gap: 8px; margin-top: 8px;
    background: #161616; border: 1px solid #3a3a40; border-radius: 6px; padding: 7px 9px;
}
.xh-lbl-hexbar-chip {
    width: 18px; height: 18px; border-radius: 4px; flex: 0 0 auto;
    border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;
}
.xh-lbl-hexbar-chip.is-transp {
    background-color: #3a3a3a;
    background-image:
      linear-gradient(45deg, transparent 44%, #e0504a 44%, #e0504a 56%, transparent 56%),
      linear-gradient(45deg, #777 25%, transparent 25%, transparent 75%, #777 75%),
      linear-gradient(45deg, #777 25%, transparent 25%, transparent 75%, #777 75%);
    background-size: 100% 100%, 8px 8px, 8px 8px;
    background-position: 0 0, 0 0, 4px 4px;
}
.xh-lbl-hexbar-k { font: 11px system-ui, sans-serif; color: #8a8a90; flex: 0 0 auto; }
.xh-lbl-hexbar-v {
    flex: 1 1 auto; min-width: 0; background: transparent; border: none; outline: none;
    color: var(--xh-primary,#E8A33C); font: 12.5px "Consolas", monospace; letter-spacing: 0.03em; padding: 0;
}
.xh-lbl-hexbar-v::placeholder { color: #6a6a70; font-style: italic; letter-spacing: 0; }
/* Colors: SV picker (left) | swatch grid (right), filling the full width.
   The grid is a perfect 9x4 of the 36 palette colours, so it always fills
   complete rows (no empty cells) whether or not Transparent is shown. */
.xh-lbl-colorrow { display: flex; gap: 14px; align-items: flex-start; }
.xh-lbl-pickercol { flex: 1 1 0; min-width: 0; }
.xh-lbl-swatchcol { flex: 1 1 0; min-width: 0; }
.xh-lbl-swgrid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 5px; align-content: start; }
.xh-lbl-swtile {
    aspect-ratio: 1; min-width: 0; padding: 0; border-radius: 5px; cursor: pointer;
    border: 2px solid transparent; box-sizing: border-box; background-clip: padding-box;
}
.xh-lbl-swtile:hover { border-color: #888; }
.xh-lbl-swtile.active { border-color: #fff; }
/* Transparent — Background only, a labelled control below the grid (so it is
   never a half-empty grid cell). Hidden for Text via inline display:none in JS. */
.xh-lbl-transbtn {
    margin-top: 8px; width: 100%; box-sizing: border-box;
    display: flex; align-items: center; gap: 8px;
    padding: 7px 9px; border-radius: 6px; cursor: pointer; font-size: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); color: #aaa;
    transition: all 0.12s;
}
.xh-lbl-transbtn:hover { border-color: var(--xh-primary,#E8A33C); color: #ddd; }
.xh-lbl-transbtn.active { border-color: var(--xh-primary,#E8A33C); color: var(--xh-primary,#E8A33C); }
.xh-lbl-transbtn-sw {
    width: 18px; height: 18px; border-radius: 4px; flex: 0 0 auto; box-sizing: border-box;
    border: 1px solid rgba(255,255,255,0.2);
    background-color: #3a3a3a;
    background-image:
      linear-gradient(45deg, transparent 44%, #e0504a 44%, #e0504a 56%, transparent 56%),
      linear-gradient(45deg, #777 25%, transparent 25%, transparent 75%, #777 75%),
      linear-gradient(45deg, #777 25%, transparent 25%, transparent 75%, #777 75%);
    background-size: 100% 100%, 8px 8px, 8px 8px;
    background-position: 0 0, 0 0, 4px 4px;
}
/* Embedded picker (no internal swatches): fill the left column + give the SV
   plane a usable height. min-width:0 on the picker + its SV row + the SV canvas
   is REQUIRED: a flex-item <canvas> keeps its intrinsic 168px width unless told
   it may shrink, which otherwise pushed the hue strip out over the swatches. */
.xh-lbl-panel .pix-cp { width: 100%; max-width: none; margin: 0; min-width: 0; }
.xh-lbl-panel .xh-cp-sv-row { min-width: 0; }
/* Height is a close default; _alignColorColumns() refines it at open so the
   picker's bottom lines up exactly with the swatch grid's bottom row.
   border-box so the JS height set == the measured height (exact alignment). */
.xh-lbl-panel .xh-cp-sv { height: 146px; min-width: 0; box-sizing: border-box; }
/* Match the picker's SV/hue outlines to the surrounding wells; the shared
   picker's default #444 reads lighter than everything else in this section. */
.xh-lbl-panel .xh-cp-sv, .xh-lbl-panel .xh-cp-hue { border-color: #3a3a40; }
/* Hide the picker's own hex field — our labelled .xh-lbl-hexbar replaces it
   (it shows the selected target's name + code and changes with the buttons). */
.xh-lbl-panel .xh-cp-hexrow { display: none; }
`;
  document.head.appendChild(style);
}
