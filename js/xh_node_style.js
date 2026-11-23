//  XiaoHei 家族 · 节点配色面板（整份移植自 Pixaroma 的 js/node_colors/index.js）
// ══════════════════════════════════════════════════════════════════════
// 原版 = 可拖动的浮动面板（按住标题栏拖）+ 大号 SV 取色面 + 色相条 + FAVS 收藏夹
//        + Title/Body 双色号条 + 联动链条 + 45 格双色预设 + 恢复默认 + 中文帮助。
// 本文件是**原版代码搬运**，只改了：英文文案→中文、class 前缀 xh-→xh-（避免与 Pixaroma 包
// 同时装时样式互相覆盖）、品牌橙XiaoHei 主蓝。结构 / 尺寸 / 交互 / 拖拽逻辑一字未改。
//
// 与 XiaoHei 自己的关系：
//   · 面板对**任何节点**开放（官方节点也能配）—— 原版也是这样的
//   · XiaoHei 家族另有「全家族自动配色」（xh_brand.js），手动色优先级更高
//   · XHLabel 自带颜色管理 ⇒ 通过它暴露的 setNodeColor() 走（否则被 _refresh 覆盖）
//
// 零 Python 改动、零第三方依赖。

import { installTitleAutoColor, refreshVueTitles, helpIconHTML, xhIconHTML } from "./xh_ui_kit.js";
import { creatXHColorPicker } from "./xh_color_picker.js";
import { iXHNode, isVueNodes } from "./xh_undo_remount.js";
import { refreshNode } from "./xh_brand.js";
//  2026-11-11：按键配色从选中工具条孤儿命令融合进本面板「按键」页签，
//   真逻辑（applyBtnColor 等）由 xh_node_toolbar.js export 复用。
import { applyBtnColor, repaintBtnColor, normalizeHex, nodeHasButtons } from "./xh_node_toolbar.js";

const { app } = window.comfyAPI.app;
const BRAND = "#ffffff";


/* ══════════════════════════════════════════════════════════════════════
   原版 CSS（搬运）
   ══════════════════════════════════════════════════════════════════════ */

function injectCSS() {
  if (document.getElementById('xh-node-colors-css')) return;
  const s = document.createElement('style');
  s.id = 'xh-node-colors-css';
  s.textContent = `
.xh-nc-modal {
  background: #1c1c1c;
  color: #e0e0e0;
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  font: 13px system-ui, sans-serif;
}
.xh-nc-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.88);
  padding: 7px 18px;
  border-radius: 4px;
  font: 12px system-ui, sans-serif;
  cursor: pointer;
  min-width: 84px;
  transition: background 0.1s, border-color 0.1s;
}
.xh-nc-btn:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.3);
}
.xh-nc-btn.primary {
  background: #ffffff;
  border-color: #ffffff;
  /*  黄底必须配深字（官方墨色 #1c1c1c），白字在黄底上几乎看不见 */
  color: #1c1c1c;
}
.xh-nc-btn.primary:hover {
  background: #e85a3a;
  border-color: #e85a3a;
}
/* ── Palette popup shell (free-floating, draggable; both renderers) ── */
.xh-nc-pal {
  width: 470px;          /* embedded-picker layout: comfortable square picker + a small 15-wide preset grid */
  max-width: 96vw;
  min-width: 0;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 16px;
}
.xh-nc-pal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.xh-nc-pal-title { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.xh-nc-pal-close {
  background: transparent; border: none; color: #999;
  font-size: 15px; line-height: 1; cursor: pointer;
  padding: 3px 7px; border-radius: 4px;
}
.xh-nc-pal-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
.xh-nc-pal-scroll { overflow-y: auto; overflow-x: hidden; padding-right: 4px; }

/* ── Redesigned palette: embedded picker + favourites strip + dark/orange
   hex bars + small full-width preset grid (replaces the preview box +
   separate "Pick custom" modal). ── */
.xh-nc-pal-scroll { flex: 1 1 auto; min-height: 0; }
.xh-nc-prow { display: flex; gap: 12px; align-items: flex-start; margin: 0 0 2px; }
.xh-nc-pickerwrap { flex: 1 1 auto; min-width: 0; display: flex; }
.xh-nc-pickerwrap .xh-cp { width: 100%; gap: 0; }
/* FIXED-height SV plane — NOT aspect-ratio, NOT flex-stretch. The shared
   picker's renderSV writes canvas.height = clientHeight on every paint, so ANY
   layout-derived height (flex stretch, OR aspect-ratio inside a flex row) feeds
   back and the plane grows on every drag (the More-colors modal is immune only
   because it's a fixed-WIDTH block, not a flex item). A fixed CSS px height makes
   clientHeight constant => canvas.height constant => no feedback. Hue matches it.
   min-width:0 lets the SV shrink so the 16px hue strip fits beside it (a canvas's
   intrinsic width otherwise acts as a min-content floor and pushes the hue out). */
.xh-nc-pickerwrap .xh-cp-sv { height: 300px; min-width: 0; border-radius: 6px; border-color: #3a3a3a; }
.xh-nc-pickerwrap .xh-cp-hue { width: 16px; height: 300px; border-radius: 6px; border-color: #3a3a3a; }
.xh-nc-pickerwrap .xh-cp-hexrow { display: none; }
/* 66px keeps the 8-row favourites column ~300px tall to match the SV height,
   so the picker and favourites bottoms line up. */
.xh-nc-favcol { flex: 0 0 66px; display: flex; flex-direction: column; }
.xh-nc-favlbl { font: 11px system-ui, sans-serif; letter-spacing: 0.06em; color: #8a8688; margin: 0 0 6px; }
.xh-nc-favgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; align-content: start; }
.xh-nc-sw {
  width: 100%; aspect-ratio: 1; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
  cursor: pointer; transition: border-color 0.1s;
}
.xh-nc-sw:hover { border-color: #ffffff; }
.xh-nc-fav-empty {
  width: 100%; aspect-ratio: 1; border-radius: 5px;
  border: 1px dashed rgba(255,255,255,0.2);
}
.xh-nc-addfav {
  width: 100%; aspect-ratio: 1; border-radius: 5px;
  border: 1px dashed #ffffff; color: #ffffff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; line-height: 1; cursor: pointer; transition: background 0.1s;
}
.xh-nc-addfav:hover { background: rgba(246,103,68,0.14); }
.xh-nc-hexwrap { display: flex; gap: 8px; margin: 10px 0 0; }
.xh-nc-hexbar {
  flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 8px;
  background: #161616; border: 1px solid #252525; border-radius: 6px; padding: 6px 9px;
}
.xh-nc-chip { width: 18px; height: 18px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); flex: 0 0 auto; }
.xh-nc-hxk { font: 11px system-ui, sans-serif; color: #8a8688; flex: 0 0 auto; }
.xh-nc-hxv {
  flex: 1 1 auto; min-width: 0; background: transparent; border: none; outline: none;
  color: #ffffff; font: 12.5px "Consolas", monospace; letter-spacing: 0.03em; padding: 0;
}
/* clean flat slider (no native stroke / focus ring / hover colour shift) */
.xh-nc-slider {
  -webkit-appearance: none; appearance: none;
  flex: 1 1 auto; min-width: 0; height: 6px; cursor: pointer; margin: 0;
  background: linear-gradient(to right, #ffffff 0%, #ffffff var(--fill, 50%), #252525 var(--fill, 50%), #252525 100%);
  border-radius: 3px; border: none; outline: none;
}
.xh-nc-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 13px; height: 13px; border-radius: 50%;
  background: #ffffff; border: none; box-shadow: 0 0 3px rgba(0,0,0,0.5);
  cursor: pointer; margin-top: -3.5px;
}
.xh-nc-slider::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%;
  background: #ffffff; border: none; box-shadow: 0 0 3px rgba(0,0,0,0.5); cursor: pointer;
}
.xh-nc-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: transparent; border: none; }
.xh-nc-slider::-moz-range-track { height: 6px; border-radius: 3px; background: transparent; border: none; }
.xh-nc-seg {
  display: flex; background: #1d1d1d; border: 1px solid #252525;
  border-radius: 7px; padding: 3px; gap: 3px; margin: 0 0 11px;
}
.xh-nc-seg button {
  flex: 1; text-align: center; font: 12px system-ui, sans-serif;
  padding: 5px 0; border-radius: 5px; color: #bdbdc2;
  background: transparent; border: none; cursor: pointer; transition: background 0.1s, color 0.1s;
}
.xh-nc-seg button.on { background: #ffffff; color: #1c1c1c; }
.xh-nc-presetlbl {
  font: 11px system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
  color: #888; margin: 13px 0 6px;
}
.xh-nc-presetgrid { display: grid; grid-template-columns: repeat(15, 1fr); gap: 4px; }
.xh-nc-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; }
.xh-nc-hint { font: 11px system-ui, sans-serif; color: #8a8688; flex: 1 1 auto; }
.xh-nc-hint b { color: #ffffff; font-weight: 400; }
  `;
  document.head.appendChild(s);
}


function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}


const XH_PRESET_COLORS = [
  
  { label: "XiaoHei 橙", color: "#f66744" },
  { label: "Dark Gray",       color: "#4a4a4e" },
  { label: "Light Red",    color: "#d57b7b" },
  { label: "Soft Red",     color: "#d35050" },
  { label: "Mid Red",      color: "#cf2a2a" },
  { label: "Light Orange", color: "#d5a57b" },
  { label: "Soft Orange",  color: "#d38d50" },
  { label: "Mid Orange",   color: "#cf772a" },
  { label: "Mid Gold",     color: "#cfa62a" },
  { label: "Light Lime",   color: "#c3d57b" },
  { label: "Soft Lime",    color: "#b9d350" },
  { label: "Mid Lime",     color: "#aecf2a" },
  { label: "Light Green",  color: "#8ad57b" },
  { label: "Soft Green",   color: "#65d350" },
  { label: "Rich Green",   color: "#38b21f" },
  { label: "Soft Teal",    color: "#50d3a3" },
  { label: "Mid Teal",     color: "#2acf93" },
  { label: "Deep Teal",    color: "#189164" },
  { label: "Soft Cyan",    color: "#50c2d3" },
  { label: "Rich Cyan",    color: "#1f9eb2" },
  { label: "Light Blue",   color: "#7ba1d5" },
  { label: "Soft Blue",    color: "#5086d3" },
  { label: "Mid Blue",     color: "#2a6fcf" },
  { label: "Light Violet", color: "#9c7bd5" },
  { label: "Soft Violet",  color: "#8050d3" },
  { label: "Light Pink",   color: "#d57bba" },
  { label: "Soft Pink",    color: "#d350ac" },
  { label: "Mid Pink",     color: "#cf2a9e" },
  
  
  { label: "Light Indigo", color: "#9b8ad5" },
  { label: "Soft Indigo",  color: "#6a5fd3" },
  { label: "Mid Indigo",   color: "#4a3fcf" },
  { label: "Light Aqua",   color: "#8ad5cf" },
  { label: "Rich Red",     color: "#b52833" },
  { label: "Rich Orange",  color: "#b5602a" },
  { label: "Rich Amber",   color: "#b5862a" },
  { label: "Rich Gold",    color: "#9e8a2a" },
  { label: "Rich Lime",    color: "#7a9e2a" },
  { label: "Rich Green",   color: "#2f9e3f" },
  { label: "Rich Emerald", color: "#1f9e6a" },
  { label: "Rich Teal",    color: "#1f9285" },
  { label: "Rich Cyan",    color: "#1f85a8" },
  { label: "Rich Sky",     color: "#2f7fc0" },
  { label: "Rich Blue",    color: "#2a55cf" },
  { label: "Rich Violet",  color: "#6a3fcf" },
  { label: "Rich Purple",  color: "#9e3fc0" },
  
];


function darkBodyFor(hex) {
  const c = hexToRgb(hex) || { r: 36, g: 36, b: 36 };
  const mix = (ch) => Math.round(0.85 * 0x24 + 0.15 * ch);
  const to2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return "#" + to2(mix(c.r)) + to2(mix(c.g)) + to2(mix(c.b));
}
const NODE_PAIRS = XH_PRESET_COLORS.map((c) => ({ label: c.label, title: c.color, body: darkBodyFor(c.color) }));



const FAVS_KEY = "XH.NodeColors.Favorites";
const FAVORITE_SLOTS = 15;
function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const out = new Array(FAVORITE_SLOTS).fill(null);
    for (let i = 0; i < Math.min(arr.length, FAVORITE_SLOTS); i++) out[i] = arr[i];
    return out;
  } catch (_e) { return new Array(FAVORITE_SLOTS).fill(null); }
}
function setFavorites(arr) {
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(arr)); } catch (_e) {}
}
function saveFavoriteSlot(index, title, body) {
  const arr = getFavorites();
  arr[index] = { title, body };
  setFavorites(arr);
}


function makeTwoToneSwatch(titleHex, bodyHex) {
  const el = document.createElement("div");
  el.className = "xh-nc-sw";
  el.style.background =
    `linear-gradient(to bottom, ${titleHex} 0%, ${titleHex} 40%, ${bodyHex} 40%, ${bodyHex} 100%)`;
  return el;
}

function makeSingleSwatch(hex) {
  const el = document.createElement("div");
  el.className = "xh-nc-sw";
  el.style.background = hex;
  return el;
}

// Dark hex bar with a live color chip + orange code (typeable). Used by the
// embedded palettes — group shows one, node shows two (Title / Body). getVal()
// seeds the field; onCommit(hex) fires on a valid 6-digit hex. Returns a
// `set(hex)` to refresh the chip + value when the color changes elsewhere
// (SV drag, swatch click, toggle).
function buildHexBar(label, getVal, onCommit) {
  const el = document.createElement("div");
  el.className = "xh-nc-hexbar";
  const chip = document.createElement("span");
  chip.className = "xh-nc-chip";
  el.appendChild(chip);
  if (label) {
    const k = document.createElement("span");
    k.className = "xh-nc-hxk";
    k.textContent = label;
    el.appendChild(k);
  }
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "xh-nc-hxv";
  inp.spellcheck = false;
  inp.setAttribute("aria-label", (label || "color") + " hex");
  el.appendChild(inp);
  // Keep the palette's drag / outside-close from hijacking the field.
  inp.addEventListener("mousedown", (e) => e.stopPropagation());
  inp.addEventListener("pointerdown", (e) => e.stopPropagation());
  inp.addEventListener("input", () => {
    let v = inp.value.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) { chip.style.background = v; onCommit(v); }
  });
  const set = (v) => { inp.value = v || ""; chip.style.background = v || "transparent"; };
  set(getVal());
  // Click the swatch to copy the color code (with a brief green flash).
  chip.style.cursor = "pointer";
  chip.title = "复制色值";
  chip.addEventListener("mousedown", (e) => e.stopPropagation());
  chip.addEventListener("pointerdown", (e) => e.stopPropagation());
  chip.addEventListener("click", () => {
    const hex = (inp.value || "").trim();
    if (!hex) return;
    const flash = () => { const o = chip.style.boxShadow; chip.style.boxShadow = "0 0 0 2px #3ec371"; setTimeout(() => { chip.style.boxShadow = o; }, 600); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(hex).then(flash).catch(() => {}); }
    else { try { const ta = document.createElement("textarea"); ta.value = hex; ta.style.cssText = "position:fixed;opacity:0;"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); flash(); } catch (_e) {} }
  });
  return { el, set };
}



function makePalShell(titleText) {
  injectCSS();
  const modal = document.createElement("div");
  modal.className = "xh-nc-modal xh-nc-pal";
  modal.style.position = "fixed";
  modal.style.zIndex = "10000";
  modal.style.left = "-9999px";
  modal.style.top = "0px";

  const header = document.createElement("div");
  header.className = "xh-nc-pal-header";
  const titleEl = document.createElement("div");
  titleEl.className = "xh-nc-pal-title";
  titleEl.textContent = titleText;
  const closeX = document.createElement("button");
  closeX.type = "button";
  closeX.className = "xh-nc-pal-close";
  //  2026-11-13 家族图标统一：Unicode ✕ → 图标库「关闭」→ x。
  closeX.innerHTML = xhIconHTML("关闭", { size: 12, color: "current" });
  closeX.title = "Close";
  header.appendChild(titleEl);
  header.appendChild(closeX);
  modal.appendChild(header);

  document.body.appendChild(modal);

  // Cleanups registered by the caller (e.g. picker.destroy() to release the
  // shared picker's window mousemove/mouseup listeners) run once on close.
  const cleanups = [];
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("pointerdown", onDocDown, true);
    window.removeEventListener("keydown", onKey, true);
    for (const fn of cleanups) { try { fn(); } catch (_e) {} }
    if (modal.parentNode) modal.remove();
  }
  closeX.addEventListener("click", close);
  function onDocDown(e) { if (!modal.contains(e.target) && !e.target.closest(".xh-help-backdrop")) close(); }
  function onKey(e) {
    if (document.querySelector(".xh-help-backdrop")) return; // help popup open → it handles Esc
    if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); }
  }
  // Defer the outside-pointerdown listener so the click that opened the
  // popup doesn't immediately close it (Load Image popup pattern).
  setTimeout(() => document.addEventListener("pointerdown", onDocDown, true), 0);
  window.addEventListener("keydown", onKey, true);

  makeDraggable(modal, header);

  return {
    modal, close,
    place: (rect) => placeBeside(modal, rect),
    onClose: (fn) => { if (typeof fn === "function") cleanups.push(fn); },
  };
}

// Drag the panel by its header so the user can move it off whatever it
// overlaps. Pointer capture keeps the drag smooth and stops the
// outside-pointerdown close from firing mid-drag.
function makeDraggable(modal, handle) {
  handle.style.cursor = "move";
  let sx = 0, sy = 0, sl = 0, st = 0, dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".xh-nc-pal-close")) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const r = modal.getBoundingClientRect();
    sl = r.left; st = r.top;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    e.stopPropagation();
    modal.style.left = (sl + e.clientX - sx) + "px";
    modal.style.top = (st + e.clientY - sy) + "px";
  });
  const end = (e) => {
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

// Position the panel beside a screen rect (the node/group): to its right,
// flipping to the left or clamping into the viewport as needed. No rect →
// center it.
function placeBeside(modal, rect) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = modal.offsetWidth, mh = modal.offsetHeight;
  const gap = 12, pad = 8;
  if (!rect) {
    modal.style.left = Math.max(pad, (vw - mw) / 2) + "px";
    modal.style.top = Math.max(pad, (vh - mh) / 2) + "px";
    return;
  }
  let left = rect.right + gap;
  if (left + mw > vw - pad) left = rect.left - gap - mw; // flip to the left
  if (left < pad) left = Math.max(pad, vw - mw - pad);   // last resort: pin right
  let top = rect.top;
  if (top + mh > vh - pad) top = vh - mh - pad;
  if (top < pad) top = pad;
  modal.style.left = left + "px";
  modal.style.top = top + "px";
}

// Screen-pixel rect of a node (DOM in Nodes 2.0, geometry math in legacy).
function getNodeScreenRect(node) {
  if (isVueNodes() && node?.id != null) {
    const el = document.querySelector('[data-node-id="' + node.id + '"]');
    if (el) return el.getBoundingClientRect();
  }
  const c = app.canvas;
  const ds = c?.ds, canvasEl = c?.canvas;
  if (!ds || !canvasEl || !node?.pos || !node?.size) return null;
  const cr = canvasEl.getBoundingClientRect();
  const titleH = (window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 30;
  const scale = ds.scale || 1, off = ds.offset || [0, 0];
  const left = cr.left + (node.pos[0] + off[0]) * scale;
  const top = cr.top + (node.pos[1] - titleH + off[1]) * scale;
  const width = node.size[0] * scale;
  const height = (node.size[1] + titleH) * scale;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

// Screen-pixel rect of a group (canvas-painted in both renderers → math).
function getGroupScreenRect(group) {
  const c = app.canvas;
  const ds = c?.ds, canvasEl = c?.canvas;
  if (!ds || !canvasEl) return null;
  const b = group?._bounding
    || (group?.pos && group?.size ? [group.pos[0], group.pos[1], group.size[0], group.size[1]] : null);
  if (!b) return null;
  const cr = canvasEl.getBoundingClientRect();
  const scale = ds.scale || 1, off = ds.offset || [0, 0];
  const left = cr.left + (b[0] + off[0]) * scale;
  const top = cr.top + (b[1] + off[1]) * scale;
  const width = b[2] * scale, height = b[3] * scale;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function palToolBtn(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "xh-nc-btn";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}




function makXHHelpBtn() {
  //  2026-10-28：原来这里是个「?」问号按钮，弹一个临时浮层。
  //   用户原话：「我们不叫问号，不用这个问号的图像，我们用灯泡…我不想用那个 EMOJI」
  //   「而之前我们的是这个笑脸儿，把这个笑脸儿换成灯泡儿」
  //   ⇒ 改成**手绘描边灯泡 SVG**（kit 的共享件），点击**跳到「灯泡」帮助浏览器**的
  //     「节点配色」专题页 —— 和 Pixaroma 的 ? 按钮（openHelpFor 跳帮助浏览器）一个路子。
  const b = document.createElement("button");
  b.type = "button";
  b.title = "打开帮助：节点配色说明";
  b.style.cssText = "width:26px;height:26px;flex:0 0 auto;border-radius:50%;" +
    "background:#ffffff;color:#1c1c1c;border:none;cursor:pointer;" +
    "display:inline-flex;align-items:center;justify-content:center;line-height:1;";
  b.innerHTML = helpIconHTML();
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      if (window.XHHelp && typeof window.XHHelp.openTopic === "function") {
        window.XHHelp.openTopic("colors");
      }
    } catch (_e) { /* 帮助浏览器还没起来就算了 */ }
  });
  return b;
}
function openNodeColorsPalette(targets, node) {
  const suffix = targets.length > 1 ? `（${targets.length} 个节点）` : "";
  const { modal, place, onClose } = makePalShell(`XiaoHei 节点配色${suffix}`);

  const applied = captureColors(node);
  let titleHex = applied.title, bodyHex = applied.body;
  let target = "title"; // which color the single picker edits: "title" | "body" | "btn"
  let linked = false;   // link: Body follows Title (Body = a darker tint of Title)
  // 按键配色（2026-11-11 从选中工具条孤儿命令 XH.ShowNodeStyle 融进本面板）
  let btnHex = normalizeHex(node?.properties?.xhBtnColor) || null;
  const applyBtnNow = () => { for (const n of targets) applyBtnColor(n, btnHex); };
  let linkBtn = null, linkIco = null;
  const syncLink = () => {
    if (!linkBtn) return;
    linkBtn.style.background = linked ? "#ffffff" : "rgba(255,255,255,0.05)";
    linkBtn.style.border = "1px solid " + (linked ? "#ffffff" : "rgba(255,255,255,0.14)");
    linkIco.style.background = linked ? "#fff" : "#bbb";
  };

  // Apply the current title+body to all target nodes; co-selected groups get
  // the more-saturated of the two as their single color (one pick → both).
  const applyNow = () => {
    applyColors(targets, titleHex, bodyHex);

  };

  // ── Title / Body / 按键 toggle: which color the one picker edits ──
  const hasBtns = nodeHasButtons(node);
  const seg = document.createElement("div");
  seg.className = "xh-nc-seg";
  const titleBtn = document.createElement("button"); titleBtn.type = "button"; titleBtn.textContent = "标题栏";
  const bodyBtn  = document.createElement("button"); bodyBtn.type  = "button"; bodyBtn.textContent  = "节点体";
  seg.appendChild(titleBtn); seg.appendChild(bodyBtn);
  let btnBtn = null;
  if (hasBtns) { btnBtn = document.createElement("button"); btnBtn.type = "button"; btnBtn.textContent = "按键"; seg.appendChild(btnBtn); }
  modal.appendChild(seg);
  const syncSeg = () => {
    titleBtn.classList.toggle("on", target === "title");
    bodyBtn.classList.toggle("on", target === "body");
    if (btnBtn) btnBtn.classList.toggle("on", target === "btn");
  };

  // ── Picker + favourites row ──
  const prow = document.createElement("div"); prow.className = "xh-nc-prow";
  const pickerWrap = document.createElement("div"); pickerWrap.className = "xh-nc-pickerwrap";
  const picker = creatXHColorPicker({
    initialColor: titleHex, swatches: [], hideReset: true,
    onChange: (c) => {
      if (c == null) return;
      if (target === "btn") { btnHex = c; applyBtnNow(); refreshHex(); return; }
      if (target === "title") { titleHex = c; if (linked) bodyHex = darkBodyFor(c); }
      else { bodyHex = c; if (linked) { linked = false; syncLink(); } }
      applyNow();
      refreshHex();
    },
  });
  pickerWrap.appendChild(picker.element);
  prow.appendChild(pickerWrap);
  onClose(() => picker.destroy());

  const favCol = document.createElement("div"); favCol.className = "xh-nc-favcol";
  const favLbl = document.createElement("div"); favLbl.className = "xh-nc-favlbl"; favLbl.textContent = "收藏";
  favCol.appendChild(favLbl);
  const favGrid = document.createElement("div"); favGrid.className = "xh-nc-favgrid";
  favCol.appendChild(favGrid);
  prow.appendChild(favCol);
  modal.appendChild(prow);

  // Apply a stored / preset pair, then sync the picker + hex bars to it.
  const applyPair = (t, b) => {
    titleHex = t; bodyHex = b;
    applyNow();
    if (target === "btn") { target = "title"; syncSeg(); syncHexVisibility(); }
    picker.setColor(titleHex);
    refreshHex();
  };
  function renderFavorites() {
    favGrid.innerHTML = "";
    const add = document.createElement("div");
    add.className = "xh-nc-addfav"; add.textContent = "+";
    add.title = "把当前配色存进收藏";
    add.addEventListener("click", () => {
      const favs = getFavorites();
      let idx = favs.findIndex((f) => !f);
      if (idx < 0) idx = FAVORITE_SLOTS - 1; // all full → overwrite the last
      saveFavoriteSlot(idx, titleHex, bodyHex);
      renderFavorites();
    });
    favGrid.appendChild(add);
    const favs = getFavorites();
    for (let i = 0; i < FAVORITE_SLOTS; i++) {
      const f = favs[i];
      if (f) {
        const sw = makeTwoToneSwatch(f.title, f.body);
        sw.title = `收藏 ${i + 1} — 点击套用，右键删除`;
        sw.addEventListener("click", () => applyPair(f.title, f.body));
        sw.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          const a = getFavorites().slice(); a[i] = null; setFavorites(a); renderFavorites();
        });
        favGrid.appendChild(sw);
      } else {
        const empty = document.createElement("div");
        empty.className = "xh-nc-fav-empty"; empty.title = `收藏 ${i + 1}（空）`;
        favGrid.appendChild(empty);
      }
    }
  }
  renderFavorites();

  // ── Hex bars (Title / Body / 按键): dark field, orange code, live chip ──
  const hexWrap = document.createElement("div"); hexWrap.className = "xh-nc-hexwrap";
  const titleBar = buildHexBar("标题栏", () => titleHex, (v) => { titleHex = v; if (linked) { bodyHex = darkBodyFor(v); bodyBar.set(bodyHex); } applyNow(); if (target === "title") picker.setColor(v); });
  const bodyBar  = buildHexBar("节点体",  () => bodyHex,  (v) => { bodyHex  = v; if (linked) { linked = false; syncLink(); } applyNow(); if (target === "body")  picker.setColor(v); });
  // 按键色 Hex 条（仅按键页签显示）
  const btnBar = buildHexBar("按键", () => btnHex, (v) => { btnHex = v; applyBtnNow(); if (target === "btn") picker.setColor(v); });
  btnBar.el.style.display = "none";
  // link toggle between Title & Body (when on, Body = a darker tint of Title)
  linkBtn = document.createElement("button"); linkBtn.type = "button"; linkBtn.title = "联动标题与正文（正文 = 标题加深）";
  linkBtn.style.cssText = "flex:0 0 auto;width:30px;align-self:stretch;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;padding:0;";
  linkIco = document.createElement("span");
  linkIco.style.cssText = "width:16px;height:16px;transform:rotate(45deg);background:currentColor;-webkit-mask:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22none%22 stroke=%22%23000%22 stroke-width=%222.2%22 d=%22M9.5 14.5 14.5 9.5M8 12H6.5a4 4 0 0 1 0-8H10M16 12h1.5a4 4 0 0 1 0 8H14%22/%3E%3C/svg%3E') center/contain no-repeat;mask:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22none%22 stroke=%22%23000%22 stroke-width=%222.2%22 d=%22M9.5 14.5 14.5 9.5M8 12H6.5a4 4 0 0 1 0-8H10M16 12h1.5a4 4 0 0 1 0 8H14%22/%3E%3C/svg%3E') center/contain no-repeat;";
  linkBtn.appendChild(linkIco);
  linkBtn.addEventListener("click", () => {
    linked = !linked;
    if (linked) { bodyHex = darkBodyFor(titleHex); bodyBar.set(bodyHex); if (target === "body") picker.setColor(bodyHex); }
    applyNow(); refreshHex(); syncLink();
  });
  syncLink();
  hexWrap.appendChild(titleBar.el); hexWrap.appendChild(linkBtn); hexWrap.appendChild(bodyBar.el); hexWrap.appendChild(btnBar.el);
  modal.appendChild(hexWrap);
  // 切换页签时显隐对应的 Hex 条（标题栏/节点体 ↔ 按键）
  const syncHexVisibility = () => {
    const showTB = target !== "btn";
    titleBar.el.style.display = showTB ? "" : "none";
    linkBtn.style.display = showTB ? "" : "none";
    bodyBar.el.style.display = showTB ? "" : "none";
    btnBar.el.style.display = target === "btn" ? "" : "none";
  };
  function refreshHex() { titleBar.set(titleHex); bodyBar.set(bodyHex); btnBar.set(btnHex); }

  // Toggle wiring. setColor does NOT fire onChange, so toggling re-applies nothing.
  titleBtn.addEventListener("click", () => { target = "title"; syncSeg(); syncHexVisibility(); picker.setColor(titleHex); });
  bodyBtn.addEventListener("click",  () => { target = "body";  syncSeg(); syncHexVisibility(); picker.setColor(bodyHex); });
  if (btnBtn) btnBtn.addEventListener("click", () => { target = "btn"; syncSeg(); syncHexVisibility(); picker.setColor(btnHex || "#1A1613"); });
  syncSeg(); syncHexVisibility();

  // ── Preset node colors (one compact grid, derived from the group palette) ──
  const scroll = document.createElement("div");
  scroll.className = "xh-nc-pal-scroll";
  modal.appendChild(scroll);
  const plbl = document.createElement("div"); plbl.className = "xh-nc-presetlbl"; plbl.textContent = "节点配色预设";
  scroll.appendChild(plbl);
  const grid = document.createElement("div"); grid.className = "xh-nc-presetgrid";
  for (const p of NODE_PAIRS) {
    const sw = makeTwoToneSwatch(p.title, p.body);
    sw.title = p.label;
    sw.addEventListener("click", () => applyPair(p.title, p.body));
    grid.appendChild(sw);
  }
  scroll.appendChild(grid);

  // ── Footer: save hint + Reset ──
  const foot = document.createElement("div"); foot.className = "xh-nc-foot";
  const hint = document.createElement("span"); hint.className = "xh-nc-hint";
  hint.innerHTML = "<b>+</b> 保存当前 · 点击套用";
  foot.appendChild(hint);
  foot.appendChild(makXHHelpBtn());
  foot.appendChild(palToolBtn("恢复默认配色", () => {
    resetColors(targets);
    for (const n of targets) applyBtnColor(n, null);   // 顺带清掉按键色
    const c = captureColors(node);
    titleHex = c.title; bodyHex = c.body; btnHex = null;
    picker.setColor(target === "title" ? titleHex : (target === "body" ? bodyHex : "#1A1613"));
    refreshHex();
  }));
  modal.appendChild(foot);

  place(getNodeScreenRect(node));
}




// ══════════════════════════════════════════════════════════════════════
// XiaoHei 侧：取色/应用/复位 + 右键菜单 + 快捷键
// ══════════════════════════════════════════════════════════════════════
//
//  2026-11-06：选中节点上方的官方浮动工具条里**不再放节点配色调色板**。
//    原因：工具条上已有 xh_node_toolbar.js 的「按键颜色」调色板，两颗并排看着一样；
//    节点配色在「更多选项 / 右键菜单  节点配色」和 Shift+\ 快捷键里都有，功能不丢。
//    ⇒ 删掉工具条图标件 + COLOR_CMD + getSelectionToolboxCommands，其余逻辑原样保留。

const OPEN_CMD = "XH.OpenColors";
const CLIP_KEY = "XH.NodeColorClipboard";

// ══════════════════════════════════════════════════════════════════════
//  2026-11-13 右键菜单图标：家族统一改用**官方 MDI 字体图标**
// ──────────────────────────────────────────────────────────────────────
//  为什么不塞进 content：官方 treeUtil-DQP-z4_o.js 的 ContextMenu.addItem 会把含标签的
//  content 先过 DOMPurify：ALLOWED_TAGS 只有 span/b/i/em/strong、ALLOWED_ATTR 只有 style，
//  style 内 CSS 属性又只准 display/color/background-color/padding-left/border-left
//  ⇒ <svg> / <img> / class / mask 全被剥光。Vue「更多选项」菜单更直接把 content 当纯文本 label。
//  所以 content 保持纯文字，图标在**菜单 DOM 出现后由我们自己 createElement 插进去**
//  （自己建的 DOM 不过 sanitizer）。图标源 = 官方全局已加载的 Material Design Icons 7.4.47。
//  自家 2350 枚 Lucide SVG（js/xh_icons/）版权没问题，但这一格塞不进；节点内 UI / 浮层照常用。
// ══════════════════════════════════════════════════════════════════════
const MENU_ICONS = {
    "节点配色": "mdi-palette",
    "复制节点颜色": "mdi-content-copy",
    "粘贴节点颜色": "mdi-content-paste",
    "恢复默认配色": "mdi-backup-restore",
};
const MENU_ICON_CSS_ID = "xh-menu-icon-css";

/** 按菜单文字找图标；兼容多选后缀「（N 个节点）」。 */
function xhMenuIconFor(text) {
    const s = String(text || "").trim();
    for (const label of Object.keys(MENU_ICONS)) {
        if (s === label || s.startsWith(label + "（")) return MENU_ICONS[label];
    }
    return null;
}

function xhInjectMenuIconCSS() {
    if (document.getElementById(MENU_ICON_CSS_ID)) return;
    const st = document.createElement("style");
    st.id = MENU_ICON_CSS_ID;
    st.textContent = `
.xh-menu-icon.mdi {
  display: inline-block;
  width: 16px; height: 16px;
  margin-right: 8px;
  font-size: 16px; line-height: 16px;
  vertical-align: -3px;
  pointer-events: none;
  flex-shrink: 0;
  color: var(--xh-primary, #E8A33C);
  color: color-mix(in srgb, var(--xh-primary, #E8A33C) 78%, currentColor);
}
`;
    document.head.appendChild(st);
}

/** 给单个菜单项前面插一枚官方图标，幂等。 */
function xhDecorateMenuEntry(el, hintedIcon) {
    if (!el || el.dataset.xhMenuIcon || el.querySelector(".xh-menu-icon")) return;
    // 传统 LiteGraph 菜单把整个菜单项对象挂在 el.value 上，最稳；Vue 菜单只能按文字认。
    // 任何一路给脏值都继续往下找，别把整项图标吞掉。
    const valid = (v) => typeof v === "string" && /^mdi-[a-z0-9-]+$/.test(v);
    const icon = valid(hintedIcon) ? hintedIcon
               : valid(el.value?.xhIcon) ? el.value.xhIcon
               : xhMenuIconFor(el.textContent);
    if (!valid(icon)) return;
    const i = document.createElement("i");
    i.className = "mdi " + icon + " xh-menu-icon";
    i.setAttribute("aria-hidden", "true");
    el.insertBefore(i, el.firstChild);
    el.dataset.xhMenuIcon = icon;
}

/** 菜单是「用完即毁」的动态 DOM ⇒ 观察 body 下新增节点，两套渲染器一并覆盖。 */
function xhInstallMenuIcons() {
    xhInjectMenuIconCSS();
    if (window.__xhMenuIconsInstalled) return;
    window.__xhMenuIconsInstalled = true;

    const scan = (root) => {
        if (!root || root.nodeType !== 1) return;
        const SEL = ".litemenu-entry, [role='menuitem']";
        try {
            if (root.matches?.(SEL)) xhDecorateMenuEntry(root);
            for (const el of root.querySelectorAll?.(SEL) || []) xhDecorateMenuEntry(el);
        } catch (e) { /* 单项失败不影响其它菜单 */ }
    };

    const start = () => {
        scan(document.body);
        // 一帧内多次 DOM 变动合并成一次扫描：画布/日志频繁增删节点也不拖慢界面。
        const pending = new Set();
        let scheduled = false;
        const flush = () => {
            scheduled = false;
            for (const n of pending) scan(n);
            pending.clear();
        };
        const mo = new MutationObserver((records) => {
            for (const r of records) for (const n of r.addedNodes) pending.add(n);
            if (!scheduled && pending.size) {
                scheduled = true;
                (window.requestAnimationFrame || ((f) => setTimeout(f, 16)))(flush);
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
}

/** 节点当前生效的颜色（显式覆盖 → 类默认 → LiteGraph 主题默认）。 */
function captureColors(node) {
  const dt = (typeof window.LiteGraph !== "undefined" && window.LiteGraph.NODE_DEFAULT_COLOR) || "#1d1d1d";
  const db = (typeof window.LiteGraph !== "undefined" && window.LiteGraph.NODE_DEFAULT_BGCOLOR) || "#2a2a2a";
  return {
    title: node?.color || node?.constructor?.color || dt,
    body: node?.bgcolor || node?.constructor?.bgcolor || db,
  };
}

/** 把标题栏色 + 节点体色刷到一批节点。 */
function applyColors(nodes, titleHex, bodyHex) {
  for (const n of nodes) {
    if (!n) continue;
    //  自带颜色管理的节点（如 XHLabel）会用自己的 _refresh 重写 color/bgcolor
    //   ⇒ 必须走它暴露的 setNodeColor 入口，否则会被下一次刷新覆盖掉。
    let handled = false;
    try {
      if (typeof n.setNodeColor === "function") { n.setNodeColor(titleHex); handled = true; }
    } catch (e) { handled = false; }
    if (!handled) {
      n.color = titleHex;
      n.bgcolor = bodyHex;
    }
    n.__xhAutoColorHex = null;          // 手动色，不再算「自动色」
    try { installTitleAutoColor(n); } catch (e) {}
  }
  try { refreshVueTitles(); } catch (e) {}
  try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
  try { app.canvas?.setDirty?.(true, true); } catch (e) {}
}

/**
 * 复位：清掉手动色。
 *  Nodes 2.0 里 node.color / node.bgcolor 是**响应式 accessor**，
 *   `delete` 会把 accessor 本身删掉 ⇒ Vue 节点不再重渲染、之后所有赋值都变非响应式
 *   ⇒ 颜色静默失效直到刷新页面。必须**赋 undefined** 走 setter。
 * XiaoHei 节点清完后再让品牌钩子按分类补回默认色；官方节点回主题默认色。
 */
function resetColors(nodes) {
  for (const n of nodes) {
    if (!n) continue;
    n.color = undefined;
    n.bgcolor = undefined;
    n.__xhAutoColorHex = null;
    try {
      if (typeof n.setNodeColor === "function") { n.setNodeColor(null); continue; }
    } catch (e) { /* 落回通用分支 */ }
    if (iXHNode(n)) {
      try { refreshNode(n); } catch (e) {}
    } else {
      try { installTitleAutoColor(n); } catch (e) {}
    }
  }
  try { refreshVueTitles(); } catch (e) {}
  try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}

/** 多选时一次改所有选中节点；否则只改右键的那个。 */
function getTargetNodes(currentNode) {
  const sel = app.canvas?.selected_nodes;
  if (sel) {
    const nodes = Object.values(sel).filter(Boolean);
    if (nodes.length > 1 && currentNode && nodes.includes(currentNode)) return nodes;
  }
  return currentNode ? [currentNode] : [];
}

/** 当前选中的节点（工具条按钮 / 快捷键用）。 */
function selectedNodes() {
  const c = app.canvas;
  if (!c) return [];
  const pool = [];
  if (c.selected_nodes) pool.push(...Object.values(c.selected_nodes));
  if (c.selectedItems) for (const it of c.selectedItems) if (it && it.comfyClass) pool.push(it);
  return pool.filter(Boolean);
}

// ── 会话剪贴板（复制/粘贴颜色）──
let colorClipboard = null;   // { title, body }
function readClip() {
  if (colorClipboard) return colorClipboard;
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    if (raw) { const o = JSON.parse(raw); if (o && typeof o.title === "string") { colorClipboard = o; return o; } }
  } catch (e) { /* 忽略 */ }
  return null;
}
function writeClip(pair) {
  colorClipboard = pair;
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(pair)); } catch (e) {}
}

app.registerExtension({
  name: "XH.NodeStyle",

  setup() {
    injectCSS();
    xhInstallMenuIcons();   // 右键菜单四项的官方 MDI 图标（DOM 后注入，绕开菜单 HTML 白名单）
  },

  commands: [
    {
      id: OPEN_CMD,
      label: "打开节点配色面板",
      function: () => {
        const nodes = selectedNodes();
        if (nodes.length) openNodeColorsPalette(nodes, nodes[0]);
      },
    },
  ],

  // Shift+\\ 快捷键（走官方 keybinding 系统 ⇒ 可在设置里改键）。
  //  单反斜杠 "\" 已被 Pixaroma 占用，两包同装会报 "Keybinding on \ already exists" ⇒ 这里用 Shift+\
  keybindings: [
    { combo: { key: "\\", shift: true }, commandId: OPEN_CMD },
  ],

  //  2026-11-06：不再实现 getSelectionToolboxCommands ⇒ 工具条上不再多出一颗调色板。
  //    节点配色统一从右键菜单「 节点配色」/ 更多选项 / Shift+\ 进（功能不丢）。

  // 右键菜单四项的图标统一由 MENU_ICONS + xhDecorateMenuEntry 注入（官方 MDI 字体图标）。

  // 节点右键菜单 —— 对**任何节点**开放（官方节点也能配）。
  getNodeMenuItems(node) {
    if (!node) return [];
    const targets = getTargetNodes(node);
    const suffix = targets.length > 1 ? `（${targets.length} 个节点）` : "";
    const items = [
      null,
      {
        content: `节点配色${suffix}`,
        xhIcon: MENU_ICONS["节点配色"],
        callback: () => openNodeColorsPalette(targets, node),
      },
      {
        content: "复制节点颜色",
        xhIcon: MENU_ICONS["复制节点颜色"],
        callback: () => { writeClip(captureColors(node)); notifyGraphChangedSafe(); },
      },
    ];
    if (readClip()) {
      items.push({
        content: `粘贴节点颜色${suffix}`,
        xhIcon: MENU_ICONS["粘贴节点颜色"],
        callback: () => {
          const c = readClip();
          if (!c) return;
          applyColors(targets, c.title, c.body);
          notifyGraphChangedSafe();
        },
      });
    }
    items.push({
      content: `恢复默认配色${suffix}`,
      xhIcon: MENU_ICONS["恢复默认配色"],
      callback: () => { resetColors(targets); notifyGraphChangedSafe(); },
    });
    return items;
  },
});

/** 颜色改了要通知 ComfyUI 记一次（否则工作流不标脏）。动态 import 避免循环依赖。 */
function notifyGraphChangedSafe() {
  try {
    import("./xh_graph_changed.js").then((m) => m.notifyGraphChanged?.()).catch(() => {});
  } catch (e) { /* 忽略 */ }
}

// 对外暴露（调试台 / 别的脚本可调）
try {
  window.XHNodeColors = {
    openColorPanel: (targets, node) => openNodeColorsPalette(targets, node || targets[0]),
    applyColors, resetColors, captureColors,
  };
} catch (e) { /* 忽略 */ }
