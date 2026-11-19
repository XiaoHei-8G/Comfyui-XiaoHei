// 小黑·说明 - starter buttons.
//
// A starter sets the button (title, icon, colour) and, when the note is still
// empty, writes the empty headings of that kind of note. Picked from what
// workflow notes usually carry. Offered once when a node is dropped, and later
// from the right-click menu.

import { app } from "../../../scripts/app.js";
import { renderIconHTML } from "../xh_note/icons.mjs";
import { readCfg, writeCfg, iconUrl, inkFor, unitWidth, M, clampS, NODE, themeAccentHex } from "./core.mjs";
import { isVueNodes } from "../shared/nodes2.mjs";
import { isLiveNode } from "../shared/live_node.mjs";
import { xhIconHTML } from "../xh_ui_kit.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// sections: [icon, heading, kind ("ol" | "ul" | "p"), lines[]]
export const STARTERS = [
  { id: "readme", name: "说明", icon: "info", color: "#E8A33C",
    h1: "使用说明", intro: "这套工作流是做什么的，一两句话写清。",
    sections: [
      ["to-do", "怎么用", "ol", ["第一步", "第二步", "点运行"]],
      ["checkmark", "需要准备什么", "ul", ["模型（见「模型」按钮）", "自定义节点（如果有）"]],
    ] },
  { id: "models", name: "模型", title: "下载模型", icon: "download-model", color: "#E8A33C",
    h1: "模型清单", intro: "把每个文件下载好，放进它下面写的目录。",
    sections: [
      ["download-model", "主模型（Diffusion）", "p", ["文件名、大小、放哪个目录。"]],
      ["download-model", "文本编码器", "p", ["文件名、大小、放哪个目录。"]],
      ["download-model", "VAE", "p", ["文件名、大小、放哪个目录。"]],
    ] },
  { id: "nodes", name: "节点", title: "节点说明", icon: "node-v5", color: "#3d7cc9",
    h1: "节点说明", intro: "这套工作流里每个节点在干什么。",
    sections: [
      ["node-v5", "需要安装的自定义节点", "ul", ["名称，以及去哪下载"]],
      ["node-v6", "每个节点做什么", "ul", ["节点名：它做什么"]],
      ["edit", "你需要改的节点", "ul", ["节点名：要改哪个参数"]],
    ] },
  { id: "settings", name: "参数", icon: "gear", color: "#2a9d8f",
    h1: "推荐参数", intro: "出图效果最好的那组设置。",
    sections: [
      ["gear", "推荐设置", "ul", ["步数：", "CFG：", "采样器和调度器："]],
      ["image", "能用的尺寸", "ul", ["宽 x 高"]],
      ["idea", "可以试着改的地方", "ul", ["参数：改了会怎样"]],
    ] },
  { id: "prompt", name: "提示词", icon: "prompt", color: "#8a5cc7",
    h1: "提示词技巧", intro: "这个模型该怎么写提示词。",
    sections: [
      ["prompt", "怎么写提示词", "p", ["先说描述什么，按什么顺序。"]],
      ["question-v2", "示例提示词", "ul", ["一条示例提示词"]],
      ["idea", "有用的词", "ul", ["某个词或短语，以及它的作用"]],
    ] },
  { id: "runtimes", name: "耗时", title: "运行耗时", icon: "run-timer", color: "#3f9a4f",
    h1: "运行耗时", intro: "跑一次要多久，吃多少显存。",
    sections: [
      ["run-timer", "各尺寸耗时", "ul", ["1024 x 1024：在你这张卡上多少秒"]],
      ["model-v4", "显存和内存", "ul", ["大约占多少 GB 显存"]],
      ["attention", "显存不够", "ul", ["小显存卡上要改什么"]],
    ] },
  { id: "tips", name: "技巧", icon: "idea", color: "#c9921a",
    h1: "小技巧", intro: "一些小改动，效果差别很大。",
    sections: [
      ["idea", "经验技巧", "ul", ["一条技巧"]],
      ["checkmark", "什么效果最好", "ul", ["哪组设置出的图最好"]],
    ] },
  { id: "attention", name: "注意", icon: "attention", color: "#c0392b",
    h1: "运行前必读", intro: "点运行之前先检查这些。",
    sections: [
      ["attention", "开跑前检查", "ul", ["需要确认的事项"]],
      ["question-v2", "常见报错与解决", "ul", ["报错：怎么修"]],
    ] },
  { id: "links", name: "链接", icon: "link", color: "#4a6fa5",
    h1: "相关链接", intro: "用编辑器里的 YouTube / Discord / 按钮工具加按钮。",
    sections: [
      ["link", "视频教程", "p", ["给教程视频加一个按钮。"]],
      ["link", "模型页面", "p", ["给模型的下载页加一个按钮。"]],
      ["link", "交流群", "p", ["加一个群按钮。"]],
    ] },
  { id: "blank", name: "空白", title: "说明", icon: "notebook", color: "#3a3a3a", h1: null, sections: [] },
];

export function starterById(id) {
  return STARTERS.find((s) => s.id === id) || null;
}

// The note body for a starter: plain Note HTML (the sanitizer's own tags and
// classes), so the editor treats it exactly like text typed by hand.
export function starterContent(st) {
  if (!st || !st.h1) return "";
  const ic = (id) => renderIconHTML(id, st.color);
  let html = `<h1>${esc(st.h1)}</h1>`;
  if (st.intro) html += `<p>${esc(st.intro)}</p>`;
  html += `<hr>`;
  for (const [icon, heading, kind, lines] of st.sections) {
    html += `<h3>${ic(icon)}${esc(heading)}</h3>`;
    if (kind === "p") html += lines.map((l) => `<p>${esc(l)}</p>`).join("");
    else html += `<${kind}>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</${kind}>`;
  }
  return html;
}

// One starter as a SECTION of a longer note (the editor's Template button):
// its heading becomes an h2 with the starter's icon, then the same empty
// headings starterContent writes. `rule` puts a line above it, to separate it
// from what is already in the note.
export function starterSection(st, rule = false) {
  if (!st || !st.h1) return "";
  const ic = (id) => renderIconHTML(id, st.color);
  let html = rule ? "<hr>" : "";
  html += `<h2>${ic(st.icon)}${esc(st.h1)}</h2>`;
  if (st.intro) html += `<p>${esc(st.intro)}</p>`;
  for (const [icon, heading, kind, lines] of st.sections) {
    html += `<h3>${ic(icon)}${esc(heading)}</h3>`;
    if (kind === "p") html += lines.map((l) => `<p>${esc(l)}</p>`).join("");
    else html += `<${kind}>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</${kind}>`;
  }
  return html;
}

// Current scale of the button, from its width (both renderers carry the scale
// in the width).
export function currentScale(node, info) {
  return clampS((node.size?.[0] || 0) / unitWidth(info));
}

// Make the button hug its content again at the SAME scale, after the title or
// icon changed. A user action only (it writes node.size).
export function refitToContent(node, oldInfo, newInfo) {
  try {
    const s = currentScale(node, oldInfo);
    const w = Math.round(unitWidth(newInfo) * s);
    if (isVueNodes()) {
      // Nodes 2.0 takes a width write; the height follows the content.
      node.setSize?.([w, node.size[1]]);
    } else {
      node.size[0] = w;
      node.size[1] = Math.round(M.h * s);
    }
    node.setDirtyCanvas?.(true, true);
  } catch (_e) {}
}

// Apply a starter. The note text is only written when the note is still empty,
// so a starter can never wipe what someone wrote.
export function applyStarter(node, st) {
  if (!node || !st) return;
  const cfg = readCfg(node);
  const oldInfo = cfg.info;
  // Spread the current info: the window size and text size stay.
  const info = { ...oldInfo, title: st.title || st.name, icon: st.icon, color: st.color };
  const next = { ...cfg, info };
  if (!String(cfg.content || "").trim()) next.content = starterContent(st);
  refitToContent(node, oldInfo, info);
  writeCfg(node, next);
}

// ── The "start from" popup, shown when a node is dropped ────────────────────
let _pop = null;
let _popCleanup = null;

const CSS = [
  ".xh-info-start{position:fixed;z-index:10020;width:340px;background:#252525;border:1px solid #444;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.6);padding:10px;font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);color:#ddd;}",
  ".xh-info-start-h{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;color:#999;letter-spacing:.05em;margin:0 2px 8px;}",
  ".xh-info-start-x{border:0;background:transparent;color:#999;font-size:14px;cursor:pointer;padding:0 4px;line-height:1;}",
  ".xh-info-start-x:hover{color:#fff;}",
  ".xh-info-start-g{display:grid;grid-template-columns:1fr 1fr;gap:6px;}",
  ".xh-info-start-o{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:#1d1d1d;border:1px solid transparent;font:inherit;font-size:12.5px;color:#ddd;cursor:pointer;text-align:left;}",
  ".xh-info-start-o:hover,.xh-info-start-o:focus-visible{border-color:var(--xh-primary,#E8A33C);outline:none;color:#fff;}",
  ".xh-info-start-sq{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none;}",
  ".xh-info-start-ic{width:14px;height:14px;display:block;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat;}",
  ".xh-info-start-f{font-size:11px;color:#888;margin:8px 2px 0;}",
].join("\n");
let _cssDone = false;
function injectCSS() {
  if (_cssDone) return;
  _cssDone = true;
  const s = document.createElement("style");
  s.setAttribute("data-xh-info-start", "1");
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function closeStarterPopup() {
  try { _popCleanup?.(); } catch (_e) {}
  _popCleanup = null;
  if (_pop) { try { _pop.remove(); } catch (_e) {} }
  _pop = null;
}
export function starterPopupOpen() { return !!(_pop && _pop.isConnected); }

// Where the node is on screen, in both renderers.
export function nodeScreenRect(node) {
  try {
    if (isVueNodes()) {
      const el = document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
      if (el && node._xhInfoRoot && el.contains(node._xhInfoRoot)) return el.getBoundingClientRect();
    }
    const c = app.canvas;
    const r = c.canvas.getBoundingClientRect();
    const ds = c.ds;
    const x = r.left + (node.pos[0] + ds.offset[0]) * ds.scale;
    const y = r.top + (node.pos[1] + ds.offset[1]) * ds.scale;
    return { left: x, top: y, right: x + node.size[0] * ds.scale, bottom: y + node.size[1] * ds.scale,
      width: node.size[0] * ds.scale, height: node.size[1] * ds.scale };
  } catch (_e) {
    return { left: 200, top: 200, right: 300, bottom: 240, width: 100, height: 40 };
  }
}

export function showStarterPopup(node) {
  closeStarterPopup();
  injectCSS();
  const pop = document.createElement("div");
  pop.className = "xh-info-start";
  const head = document.createElement("div");
  head.className = "xh-info-start-h";
  head.textContent = "从模板开始";
  const x = document.createElement("button");
  x.type = "button";
  x.className = "xh-info-start-x";
  x.title = "留一个空白说明按钮";
  x.innerHTML = xhIconHTML("关闭", { size: 12, color: "current" });
  x.addEventListener("click", () => closeStarterPopup());
  head.appendChild(x);
  pop.appendChild(head);
  const grid = document.createElement("div");
  grid.className = "xh-info-start-g";
  for (const st of STARTERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xh-info-start-o";
    b.title = st.h1 ? `${st.name}: sets the button and writes the empty headings` : "A plain button with an empty note";
    const sq = document.createElement("span");
    sq.className = "xh-info-start-sq";
    sq.style.background = st.color;
    const ic = document.createElement("span");
    ic.className = "xh-info-start-ic";
    ic.style.setProperty("--i", `url("${iconUrl(st.icon)}")`);
    ic.style.background = inkFor(st.color);
    sq.appendChild(ic);
    b.appendChild(sq);
    b.appendChild(document.createTextNode(st.name));
    b.addEventListener("click", () => {
      closeStarterPopup();
      if (isLiveNode(node)) applyStarter(node, st);
    });
    grid.appendChild(b);
  }
  pop.appendChild(grid);
  const foot = document.createElement("div");
  foot.className = "xh-info-start-f";
  foot.textContent = "以后想改：右键这个按钮 → 编辑。";
  pop.appendChild(foot);
  document.body.appendChild(pop);
  _pop = pop;

  // Beside the node, kept on screen.
  const r = nodeScreenRect(node);
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.right + 12;
  if (left + pw > window.innerWidth - 8) left = r.left - pw - 12;
  if (left < 8) left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left));
  let top = Math.max(8, Math.min(window.innerHeight - ph - 8, r.top));
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;

  // Close on a click elsewhere, Esc, or when the node goes away.
  const onDown = (e) => { if (!pop.contains(e.target)) closeStarterPopup(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); closeStarterPopup(); }
  };
  const poll = setInterval(() => { if (!isLiveNode(node) || !node.graph) closeStarterPopup(); }, 400);
  const t = setTimeout(() => {
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
  }, 0);
  _popCleanup = () => {
    clearTimeout(t);
    clearInterval(poll);
    document.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("keydown", onKey, true);
  };
  requestAnimationFrame(() => { try { grid.firstChild?.focus({ preventScroll: true }); } catch (_e) {} });
}

export { NODE };
