// 小黑·标注 - the controls both surfaces share (the node face and the big
// view): tools, undo/redo/clear, colours + line width, the numbered notes list,
// and the prompt preview with its "remove the marks" switch.
//
// Built ONCE per surface; sync() only flips classes and text, so a click never
// rebuilds the button it came from. The notes list is the one thing rebuilt,
// and only on a structural change (a mark added, deleted, undone), never while
// typing - a rebuild would steal the note box's focus mid-word.

import { isComfyTextShortcut } from "../shared/text_shortcuts.mjs";
import { xhIconHTML } from "../xh_ui_kit.js";
import {
  COLORS, SWATCHES, WIDTH_KEYS, buildPrompt, injectedState, readState, rgbOf,
} from "./core.mjs";
import {
  clearMarks, deleteMark, redo, refresh, setNote, setRemoveMarks, uiState, undo,
} from "./actions.mjs";
import { colorName, markLabel, t } from "./i18n.mjs";

// 家族规范化：图案全部走家族库 xh_icons（原版是写死 SVG）。size 16 匹配按钮。
const ico = (name) => xhIconHTML(name, { size: 16, color: "current" });

// 工具：id/key 是契约（快捷键 + 后端类型名），不动；title 走 i18n 表。
// icon 是家族图标名，buildTools 里再转成 HTML。
export const TOOLS = [
  { id: "box", key: "B", titleKey: "toolBox", icon: "square" },
  { id: "ellipse", key: "C", titleKey: "toolEllipse", icon: "circle" },
  { id: "pen", key: "P", titleKey: "toolPen", icon: "pencil" },
  { id: "arrow", key: "A", titleKey: "toolArrow", icon: "move-up-right" },
  { id: "text", key: "T", titleKey: "toolText", icon: "type" },
];

const ICON_UNDO = "undo-2";
const ICON_REDO = "redo-2";
const ICON_CLEAR = "trash-2";
const ICON_EXPAND = "maximize-2";

function btn(cls, title, html) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.title = title;
  if (html) b.innerHTML = html;
  return b;
}

function sep(vertical) {
  const s = document.createElement("span");
  s.className = vertical ? "pix-sketch-hsep" : "pix-sketch-sep";
  return s;
}

/** The five tools. Returns sync(). */
export function buildTools(node, host, { vertical = false } = {}) {
  const buttons = TOOLS.map((tool) => {
    const b = btn("pix-sketch-btn", t(tool.titleKey), ico(tool.icon));
    b.dataset.tool = tool.id;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      uiState(node).tool = tool.id;
      refresh(node, false);
    });
    host.appendChild(b);
    return b;
  });
  void vertical;
  return () => {
    const tool = uiState(node).tool;
    for (const b of buttons) {
      b.classList.toggle("on", b.dataset.tool === tool);
      const def = TOOLS.find((x) => x.id === b.dataset.tool);
      if (def) b.title = t(def.titleKey);   // 语言切换即时刷新
    }
  };
}

/** Undo / Redo / Clear, plus the optional Expand and Gear. Returns sync(). */
export function buildActions(node, host, { vertical = false, onExpand = null, onGear = null } = {}) {
  if (vertical) host.appendChild(sep(true));
  const u = btn("pix-sketch-btn", t("undo"), ico(ICON_UNDO));
  const r = btn("pix-sketch-btn", t("redo"), ico(ICON_REDO));
  const c = btn("pix-sketch-btn", t("clear"), ico(ICON_CLEAR));
  u.addEventListener("click", (e) => { e.stopPropagation(); undo(node); });
  r.addEventListener("click", (e) => { e.stopPropagation(); redo(node); });
  c.addEventListener("click", (e) => { e.stopPropagation(); clearMarks(node); });
  host.append(u, r, c);
  let x = null, g = null;
  if (onExpand) {
    x = btn("pix-sketch-btn", t("expand"), ico(ICON_EXPAND));
    x.addEventListener("click", (e) => { e.stopPropagation(); onExpand(); });
    host.appendChild(x);
  }
  if (onGear) {
    g = btn("pix-sketch-btn pix-sketch-gear", t("settings"), "");
    g.addEventListener("click", (e) => { e.stopPropagation(); onGear(); });
    host.appendChild(g);
  }
  return () => {
    const ui = uiState(node);
    const has = readState(node).marks.length > 0;
    u.disabled = !ui.undo.length;
    r.disabled = !ui.redo.length;
    c.disabled = !has;
    u.title = t("undo"); r.title = t("redo"); c.title = t("clear");
    if (x) x.title = t("expand");
    if (g) g.title = t("settings");
  };
}

const WIDTH_TITLE = { S: "widthS", M: "widthM", L: "widthL", XL: "widthXL" };

/** Just Expand and Gear, for the face's floating top-right corner (2026-11-20,
 *  方案 A: they no longer sit in the tool row). Returns sync(). */
export function buildMiniActions(node, host, { onExpand = null, onGear = null } = {}) {
  let x = null, g = null;
  if (onExpand) {
    x = btn("pix-sketch-btn", t("expand"), ico(ICON_EXPAND));
    x.addEventListener("click", (e) => { e.stopPropagation(); onExpand(); });
    host.appendChild(x);
  }
  if (onGear) {
    g = btn("pix-sketch-btn pix-sketch-gear", t("settings"), "");
    g.addEventListener("click", (e) => { e.stopPropagation(); onGear(); });
    host.appendChild(g);
  }
  return () => {
    if (x) x.title = t("expand");
    if (g) g.title = t("settings");
  };
}

/** Colour swatches then the line width. Returns sync(). */
export function buildColors(node, host, { label = true } = {}) {
  const swatches = SWATCHES.map((name) => {
    const s = btn("pix-sketch-sw", t("swatchTip", colorName(name)), "");
    s.style.background = rgbOf(name);
    s.dataset.color = name;
    s.addEventListener("click", (e) => {
      e.stopPropagation();
      uiState(node).color = name;
      refresh(node, false);
    });
    host.appendChild(s);
    return s;
  });
  const grow = document.createElement("span");
  grow.className = "pix-sketch-grow";
  host.appendChild(grow);
  let l = null;
  if (label) {
    l = document.createElement("span");
    l.className = "pix-sketch-wl";
    l.textContent = t("line");
    host.appendChild(l);
  }
  const widths = WIDTH_KEYS.map((k) => {
    const b = btn("pix-sketch-w", t(WIDTH_TITLE[k]), "");
    b.textContent = k;
    b.dataset.w = k;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      uiState(node).width = k;
      refresh(node, false);
    });
    host.appendChild(b);
    return b;
  });
  return () => {
    const ui = uiState(node);
    for (const s of swatches) {
      s.classList.toggle("on", s.dataset.color === ui.color);
      s.title = t("swatchTip", colorName(s.dataset.color));
    }
    for (const b of widths) {
      b.classList.toggle("on", b.dataset.w === ui.width);
      b.title = t(WIDTH_TITLE[b.dataset.w]);
    }
    if (l) l.textContent = t("line");
  };
}

/** The numbered notes, one row per mark. Rebuilt on structural changes only. */
export function renderList(node, host, { hint = null } = {}) {
  const keep = host.scrollTop;     // the list scrolls past four rows: a rebuild must not jump to the top
  host.replaceChildren();
  const marks = readState(node).marks;
  if (!marks.length) {
    const h = document.createElement("div");
    h.className = "pix-sketch-hint";
    h.textContent = hint ?? t("listHint");
    host.appendChild(h);
    return;
  }
  marks.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "pix-sketch-mrow";
    const badge = document.createElement("span");
    badge.className = "pix-sketch-badge";
    badge.textContent = String(i + 1);
    badge.style.background = rgbOf(m.color);
    const c = COLORS[m.color] || COLORS.red;
    badge.style.color = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 > 170 ? "#111" : "#fff";
    const name = document.createElement("span");
    name.className = "pix-sketch-name";
    name.textContent = markLabel(m);
    name.title = m.type === "text" ? `"${m.text}"` : markLabel(m);
    const note = document.createElement("input");
    note.className = "pix-sketch-note";
    note.type = "text";
    note.placeholder = m.type === "text" ? t("noteOptional") : t("noteWhat");
    note.value = m.note || "";
    note.title = t("noteTip");
    note.addEventListener("input", () => setNote(node, i, note.value));
    note.addEventListener("keydown", (e) => {
      // Ctrl+Enter still runs the workflow; everything else stays in the box.
      if (isComfyTextShortcut(e)) return;
      e.stopPropagation();
      if (e.key === "Enter") note.blur();
    });
    const del = btn("pix-sketch-del", t("delTip"), xhIconHTML("删除", { size: 12, color: "current" }));
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteMark(node, i); });
    row.addEventListener("pointerenter", () => { uiState(node).hover = i; refresh(node, false); });
    row.addEventListener("pointerleave", () => {
      if (uiState(node).hover === i) { uiState(node).hover = -1; refresh(node, false); }
    });
    row.append(badge, name, note, del);
    host.appendChild(row);
  });
  host.scrollTop = keep;
}

/** A mark was just drawn: show its row and put the caret in its note, since
 *  what to change there is the next thing to write. preventScroll, because a
 *  plain focus() also scrolls every ancestor to reveal the box, the graph
 *  canvas included. */
export function focusLastNote(host) {
  const notes = host.querySelectorAll(".pix-sketch-note");
  const inp = notes[notes.length - 1];
  if (!inp) return;
  host.scrollTop = host.scrollHeight;
  try { inp.focus({ preventScroll: true }); } catch {}
}

/** The prompt preview (read-only, raised) with the remove-the-marks switch.
 *  `collapsible` (node face, 2026-11-20): starts folded to its header so the
 *  picture gets the height; the caret opens it. The big view keeps it open. */
export function buildPromptBox(node, host, { collapsible = false } = {}) {
  const head = document.createElement("div");
  head.className = "pix-sketch-phead";
  const label = document.createElement("span");
  label.className = "pix-sketch-plabel";
  label.textContent = t("prompt");
  label.title = t("promptTip");
  const sw = document.createElement("label");
  sw.className = "pix-sketch-swc";
  sw.title = t("removeMarksTip");
  const tog = document.createElement("span");
  tog.className = "pix-sketch-tog";
  const swText = document.createElement("span");
  swText.textContent = t("removeMarks");
  sw.append(tog, swText);
  sw.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setRemoveMarks(node, !readState(node).removeMarks);
  });
  head.append(label, sw);
  let caret = null;
  if (collapsible) {
    // Folded by default; the caret is the only thing that opens it.
    host.classList.add("collapsed");
    caret = btn("pix-sketch-caret", t("promptTip"), "");
    caret.textContent = "▾";
    caret.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = host.classList.toggle("collapsed");
      caret.textContent = open ? "▾" : "▴";
      host.dispatchEvent(new CustomEvent("pix-sketch-resize", { bubbles: true }));
    });
    head.appendChild(caret);
  }
  const text = document.createElement("div");
  text.className = "pix-sketch-ptext";
  host.append(head, text);
  return () => {
    const st = readState(node);
    tog.classList.toggle("on", st.removeMarks);
    const p = buildPrompt(injectedState(node).marks, st.removeMarks);
    text.classList.toggle("empty", !p);
    text.textContent = p || t("promptEmpty");
    text.title = p ? t("selectCopy") : "";
    label.textContent = t("prompt"); label.title = t("promptTip");
    swText.textContent = t("removeMarks"); sw.title = t("removeMarksTip");
  };
}
