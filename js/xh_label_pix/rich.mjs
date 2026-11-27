// 浮字标签 · 行内富文本编辑（2026-11-25 从老「标签」节点 XHLabel 移植）
//
// 为什么要有这个文件：老节点删除后，「选中一段文字单独改字号 / 颜色 / 加粗」
// 这个能力必须留在浮字标签上，否则是功能退化。原来那套写死在 js/xh_label.js 里
// （跟老节点强耦合），这里抽成独立模块，只依赖一个 contenteditable 根元素。
//
// 交互照 Word 的习惯：**左键选中 → 右键 → 点一下**，不需要记任何语法。
// 与「排版」区滑块的关系：滑块改整块字号（容器级），这里给选中文字包一层内联
// span（段级，优先级更高）。设过格式的字会「锁定」不再跟滑块变，点「清除格式」恢复。

export const RICH_SIZES = [12, 16, 20, 28, 36, 44, 56];
export const RICH_COLORS = ["#FFFFFF", "#00E5FF", "#FF6B35", "#4BA14B", "#FFD166"];

const CSS_ID = "xh-lbl-rich-css";

function ensureCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = `
.xh-lbl-rich-menu {
    position: fixed; z-index: 100002; display: flex; flex-direction: column; gap: 6px;
    background: #252525; border: 1px solid #3a3a3a; border-radius: 8px; padding: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,.55); font: 12px system-ui, sans-serif;
    color: #e8e8e8; user-select: none;
}
.xh-lbl-rich-menu .xh-lbl-rich-lab { font-size: 11px; color: #8a8a90; letter-spacing: .5px; }
.xh-lbl-rich-menu .xh-lbl-rich-row { display: flex; gap: 4px; }
.xh-lbl-rich-btn {
    cursor: pointer; font: 12px system-ui, sans-serif; line-height: 1; padding: 4px 6px;
    background: #252525; color: #e8e8e8; border: 1px solid #3a3a3a; border-radius: 4px;
    transition: border-color .12s, color .12s, background .12s;
}
.xh-lbl-rich-btn:hover { border-color: var(--xh-primary,#E8A33C); color: var(--xh-primary,#E8A33C); }
.xh-lbl-rich-sw {
    width: 20px; height: 20px; border-radius: 50%; cursor: pointer; padding: 0;
    border: 2px solid #3a3a3a; box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);
}
.xh-lbl-rich-sw:hover { border-color: #e8e8e8; }
.xh-lbl-rich-hr { height: 1px; background: #3a3a3a; margin: 1px 0; }
`;
  document.head.appendChild(s);
}

// ─── 选区解析（带「最近一次有效选区」记忆）──────────────────────
// 为什么必须有记忆：contenteditable 里右键点得稍微偏出选中文字一点点，浏览器就把
// 选区塌成一个光标点，菜单随即不弹 —— 用户看到的现象是「右键改色加粗根本没做」。
// 2026-11-25 用真鼠标事件实测复现过（点完颜色再右键就撞上）。这里记住最近一次非空
// 选区：右键时当前选区优先，塌了就回退到记忆，保证「选中过就能改」。
const lastRange = new WeakMap();

function elOf(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

function rememberSelection(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const el = elOf(r.commonAncestorContainer);
  if (!el || !root.contains(el)) return;
  lastRange.set(root, r.cloneRange());
}

function forgetSelection(root) {
  lastRange.delete(root);
}

function cachedRange(root) {
  const r = lastRange.get(root);
  if (!r || r.collapsed) return null;
  const el = elOf(r.commonAncestorContainer);
  // 重新 build / 重置后老 Range 会指向已摘掉的节点，必须校验还在树里
  if (!el || !root.contains(el)) { lastRange.delete(root); return null; }
  return r;
}

/** 这次操作要作用在哪段文字上：当前选区优先，塌了 / 跑出根就回退到记忆。 */
function resolveRange(root) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    const el = elOf(r.commonAncestorContainer);
    if (el && root.contains(el)) return { sel, range: r };
  }
  const c = cachedRange(root);
  if (c) return { sel: null, range: c.cloneRange() };
  return null;
}

function fireInput(root) {
  try { root.dispatchEvent(new Event("input", { bubbles: true })); } catch (_e) {}
}

/** 给当前选区包一层 span；跨样式选区走 extract + insert 兜底。 */
export function wrapSelection(root, styleObj) {
  const hit = resolveRange(root);
  if (!hit) return false;
  const { sel, range } = hit;
  const span = document.createElement("span");
  Object.assign(span.style, styleObj);
  try {
    range.surroundContents(span);
  } catch (_e) {
    try {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    } catch (_e2) {
      return false;
    }
  }
  // 应用后把选区重新套到 span 上：用户接着右键还能继续改同一段。
  try {
    const s = sel || window.getSelection();
    if (s) {
      s.removeAllRanges();
      const r2 = document.createRange();
      r2.selectNodeContents(span);
      s.addRange(r2);
      lastRange.set(root, r2.cloneRange());
    }
  } catch (_e) {}
  fireInput(root);
  return true;
}

/** 清掉选中文字的段级格式，恢复跟随整块字号 / 颜色。 */
export function clearSelectionFormat(root) {
  const hit = resolveRange(root);
  if (!hit) return false;
  // execCommand 只认「当前选区」，回退到记忆里的选区时先把它塞回选区里
  try {
    const s = window.getSelection();
    if (s) { s.removeAllRanges(); s.addRange(hit.range.cloneRange()); }
  } catch (_e) {}
  try { document.execCommand("removeFormat"); } catch (_e) { return false; }
  forgetSelection(root);
  fireInput(root);
  return true;
}

function closeMenu() {
  document.querySelectorAll(".xh-lbl-rich-menu").forEach((el) => el.remove());
}

/**
 * 在鼠标位置弹出格式菜单。
 * @param {number} x 视口坐标
 * @param {number} y 视口坐标
 * @param {HTMLElement} root contenteditable 根
 */
export function openFormatMenu(x, y, root) {
  ensureCSS();
  closeMenu();
  const panel = document.createElement("div");
  panel.className = "xh-lbl-rich-menu";

  const lab = (t) => {
    const d = document.createElement("div");
    d.className = "xh-lbl-rich-lab";
    d.textContent = t;
    return d;
  };
  // 按钮不能抢焦点，否则选区一失就无从下手
  const keep = (el) => {
    el.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    return el;
  };
  const mkBtn = (text, extra, fn) => {
    const b = keep(document.createElement("button"));
    b.type = "button";
    b.className = "xh-lbl-rich-btn";
    b.textContent = text;
    if (extra) b.style.cssText += extra;
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      fn();
      closeMenu();
    });
    return b;
  };

  // 字号
  panel.appendChild(lab("选中文字 · 字号"));
  const sizeRow = document.createElement("div");
  sizeRow.className = "xh-lbl-rich-row";
  for (const s of RICH_SIZES) {
    sizeRow.appendChild(mkBtn(String(s), "min-width:30px;text-align:center;", () => {
      wrapSelection(root, { fontSize: `${s}px` });
    }));
  }
  panel.appendChild(sizeRow);

  // 颜色
  panel.appendChild(lab("颜色"));
  const colorRow = document.createElement("div");
  colorRow.className = "xh-lbl-rich-row";
  for (const c of RICH_COLORS) {
    const b = keep(document.createElement("button"));
    b.type = "button";
    b.className = "xh-lbl-rich-sw";
    b.title = c;
    b.style.background = c;
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      wrapSelection(root, { color: c });
      closeMenu();
    });
    colorRow.appendChild(b);
  }
  panel.appendChild(colorRow);

  panel.appendChild(Object.assign(document.createElement("div"), { className: "xh-lbl-rich-hr" }));

  const bottom = document.createElement("div");
  bottom.className = "xh-lbl-rich-row";
  bottom.appendChild(mkBtn("加粗", "font-weight:700;flex:1;", () => {
    wrapSelection(root, { fontWeight: "700" });
  }));
  bottom.appendChild(mkBtn("清除格式", "flex:1;", () => {
    clearSelectionFormat(root);
  }));
  panel.appendChild(bottom);

  document.body.appendChild(panel);
  // 夹在视口内
  const r = panel.getBoundingClientRect();
  const nx = Math.min(x, Math.max(8, window.innerWidth - r.width - 8));
  const ny = Math.min(y, Math.max(8, window.innerHeight - r.height - 8));
  panel.style.left = `${nx}px`;
  panel.style.top = `${ny}px`;
}

/** 给一个 contenteditable 根绑定「右键选中文字 → 格式菜单」。 */
export function attachRichEditing(root) {
  ensureCSS();
  // 选区一有变化就记下来（记忆只在根内部有效，见 resolveRange）
  const onSelChange = () => rememberSelection(root);
  document.addEventListener("selectionchange", onSelChange);
  // 左键单击把选区塌掉 = 用户主动放弃选择，清掉记忆；
  // 右键塌掉不走这里（button !== 0），所以「右键偏出一点」仍然能改。
  const onMouseUp = (e) => {
    if (e.button !== 0) return;
    setTimeout(() => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) forgetSelection(root);
    }, 0);
  };
  root.addEventListener("mouseup", onMouseUp);
  root.addEventListener("contextmenu", (e) => {
    if (!resolveRange(root)) return;   // 没选中过就当普通右键，不拦
    e.preventDefault();
    e.stopPropagation();
    openFormatMenu(e.clientX, e.clientY, root);
  });
  // 点别处 / 滚动 / Esc 关掉菜单
  const away = (e) => {
    if (!e.target?.closest?.(".xh-lbl-rich-menu")) closeMenu();
  };
  document.addEventListener("mousedown", away, true);
  window.addEventListener("scroll", closeMenu, true);
  const onKey = (e) => { if (e.key === "Escape") closeMenu(); };
  document.addEventListener("keydown", onKey, true);
  return () => {
    document.removeEventListener("selectionchange", onSelChange);
    root.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousedown", away, true);
    window.removeEventListener("scroll", closeMenu, true);
    document.removeEventListener("keydown", onKey, true);
    forgetSelection(root);
    closeMenu();
  };
}

/** 富文本 → 纯文本（存档里 cfg.text 用这个，保证搜索 / 老逻辑读到的是干净文字）。
 *
 * ⚠️ 不能用 innerText：它对**没有挂进文档**的游离节点会退化成 textContent，
 * 于是 `<div>甲</div><div>乙</div>` 会变成「甲乙」——换行全丢，纯文本备份就废了。
 * 这里自己按「块级元素 / BR 都算换行」遍历，跟 render.mjs 的 richLines 同一套规则。
 */
export function richToText(html) {
  const BLOCKS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);
  const box = document.createElement("div");
  box.innerHTML = String(html || "");
  const lines = [];
  let cur = "";
  const flush = () => { lines.push(cur); cur = ""; };
  const walk = (node) => {
    if (node.nodeType === 3) {
      const parts = String(node.nodeValue).split("\n");
      parts.forEach((p, i) => {
        if (i > 0) flush();
        cur += p;
      });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === "BR") { flush(); return; }
    const isBlock = BLOCKS.has(node.tagName);
    if (isBlock && cur) flush();
    for (const ch of node.childNodes) walk(ch);
    if (isBlock && cur) flush();
  };
  walk(box);
  if (cur) flush();
  // 去掉文档末尾因块级收尾多出来的空行，但保留用户真敲的中间空行
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n").replace(/\u00a0/g, " ");
}
