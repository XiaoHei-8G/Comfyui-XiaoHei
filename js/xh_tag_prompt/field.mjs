// XiaoHei-标签提示词 · 输入框层
// 1:1 学 ComfyUI-Pixaroma / js/prompt/tag_field.mjs（MIT）的透明 textarea + 高亮背景层
// 与 @ / * / # 补全浮层。配色只用 ComfyUI 官方 CSS 变量 + 家族 --xh-primary。
import { scanTokens, candidatesFor } from "./expand.mjs";
import { findTag } from "./library.mjs";

const CSS_ID = "xh-tag-field-css";
const CSS = `
.xh-tag-wrap{position:relative;display:flex;width:100%;min-height:96px;box-sizing:border-box}
.xh-tag-back,.xh-tag-ta{font:12px/1.55 var(--font-family,monospace);padding:8px 10px;
  letter-spacing:0;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;
  box-sizing:border-box;border-radius:5px;tab-size:2}
.xh-tag-back{position:absolute;inset:0;overflow:hidden;color:var(--foreground,#fff);
  background:var(--secondary,#262729);border:1px solid var(--border,#494a50);pointer-events:none;
  scrollbar-gutter:stable}
.xh-tag-ta{position:relative;display:block;flex:1 1 auto;width:100%;height:100%;min-height:0;resize:none;
  color:transparent;caret-color:var(--foreground,#fff);background:transparent;
  border:1px solid transparent;outline:none;overflow:auto;scrollbar-gutter:stable}
.xh-tag-ta::selection{background:color-mix(in srgb,var(--xh-primary,#E8A33C) 40%,transparent)}
.xh-tag-hl{color:var(--xh-primary,#E8A33C);font-weight:600}
.xh-tag-unknown{text-decoration:underline wavy var(--xh-primary,#E8A33C);text-underline-offset:3px}
.xh-tag-ac{position:fixed;z-index:12000;width:290px;max-height:250px;overflow:auto;
  background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:7px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
.xh-tag-ac-h{padding:6px 10px;font-size:11px;opacity:.65;border-bottom:1px solid var(--border,#494a50)}
.xh-tag-ac-i{padding:6px 10px;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:baseline}
.xh-tag-ac-i.on,.xh-tag-ac-i:hover{background:color-mix(in srgb,var(--xh-primary,#E8A33C) 22%,transparent)}
.xh-tag-ac-n{color:var(--xh-primary,#E8A33C);font-weight:600;flex:none}
.xh-tag-ac-d{opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xh-tag-ac-e{padding:8px 10px;font-size:11px;opacity:.65}
`;
function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS;
  document.head.appendChild(s);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** 生成一块「透明 textarea + 彩色背景层」组成的输入框。 */
export function createTagField(onChange) {
  injectCSS();
  const root = document.createElement("div"); root.className = "xh-tag-wrap";
  const back = document.createElement("div"); back.className = "xh-tag-back";
  const ta = document.createElement("textarea"); ta.className = "xh-tag-ta";
  ta.spellcheck = false;
  ta.placeholder = ""; // 占位写在背景层里，透明 textarea 的 placeholder 也会被染透明
  root.append(back, ta);

  let ac = null, acItems = [], acIndex = 0, acToken = null;

  // 节点被拉高 / 拉宽、滚动条出现或消失时，textarea 的内容列会变窄而背景层不变，
  // 两层换行位置就会错开、彩色高亮与光标漂移。照 Pixaroma syncColumns() 的做法：
  // 量出两列真实宽度差，补到背景层的右内边距上（背景层是 absolute，不会反噬布局）。
  function syncColumns() {
    if (!ta.isConnected) return;
    back.style.paddingRight = "";
    back.style.width = "";
    const cs = getComputedStyle(ta), bs = getComputedStyle(back);
    const taText = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const padR = parseFloat(bs.paddingRight) || 0;
    const bdText = back.clientWidth - parseFloat(bs.paddingLeft) - padR;
    if (!(taText > 0) || !(bdText > 0)) return;
    const gap = bdText - taText;
    if (Math.abs(gap) < 0.5) return;
    if (padR + gap >= 0) back.style.paddingRight = (padR + gap) + "px";
    else back.style.width = Math.max(0, back.offsetWidth - gap) + "px";
  }
  let ro = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => syncColumns());
    ro.observe(ta);
  }

  function paintBackdrop() {
    const text = ta.value;
    if (!text) {
      back.innerHTML = `<span style="opacity:.5">敲 @ 调标签、* 随机挑一类、# 每次抽一行；点「标签库」管理</span>`;
      return;
    }
    const spans = scanTokens(text);
    let html = "", i = 0;
    for (const h of spans) {
      html += esc(text.slice(i, h.start));
      const known = h.kind === "tag" ? !!findTag(h.name) : true;
      html += `<span class="${known ? "xh-tag-hl" : "xh-tag-unknown"}">${esc(h.raw)}</span>`;
      i = h.end;
    }
    html += esc(text.slice(i));
    back.innerHTML = html + "\n";
    back.scrollTop = ta.scrollTop;
    back.scrollLeft = ta.scrollLeft;
    syncColumns();
  }

  function closeAC() {
    if (ac) { ac.remove(); ac = null; }
    acItems = []; acToken = null;
  }
  function showAC(sym, query, at) {
    const all = candidatesFor(sym);
    const q = query.toLowerCase();
    const items = all.filter((t) => !q || t.name.toLowerCase().includes(q) || String(t.text).toLowerCase().includes(q));
    if (!items.length) return;
    closeAC();
    ac = document.createElement("div"); ac.className = "xh-tag-ac";
    const groups = new Map();
    for (const it of items) {
      const g = it.cat || (sym === "*" ? "全部分类" : "未分类");
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }
    acItems = [];
    for (const [g, arr] of groups) {
      const h = document.createElement("div"); h.className = "xh-tag-ac-h"; h.textContent = g;
      ac.appendChild(h);
      for (const it of arr) {
        const row = document.createElement("div"); row.className = "xh-tag-ac-i";
        row.innerHTML = `<span class="xh-tag-ac-n">${esc(sym + it.name)}</span><span class="xh-tag-ac-d">${esc(it.text)}</span>`;
        row.addEventListener("pointerdown", (e) => { e.preventDefault(); commit(sym, it.name, at); });
        ac.appendChild(row);
        acItems.push({ el: row, name: it.name, sym, at });
      }
    }
    if (!acItems.length) { const e = document.createElement("div"); e.className = "xh-tag-ac-e"; e.textContent = `没有匹配的${sym === "*" ? "分类" : "标签"}，去「标签库」加一个`; ac.appendChild(e); }
    const foot = document.createElement("div"); foot.className = "xh-tag-ac-h";
    foot.textContent = "↑↓ 选择 · 回车插入 · Esc 关闭";
    ac.appendChild(foot);
    const r = ta.getBoundingClientRect();
    ac.style.left = Math.min(r.left, window.innerWidth - 300) + "px";
    let top = r.bottom + 4;
    if (top + 250 > window.innerHeight) top = Math.max(8, r.top - 254);
    ac.style.top = top + "px";
    document.body.appendChild(ac);
    acIndex = 0; paintAC();
  }
  function paintAC() {
    acItems.forEach((it, i) => it.el.classList.toggle("on", i === acIndex));
    const cur = acItems[acIndex]?.el;
    if (cur && ac) {
      const r = cur.getBoundingClientRect(), ar = ac.getBoundingClientRect();
      if (r.bottom > ar.bottom) ac.scrollTop += r.bottom - ar.bottom;
      else if (r.top < ar.top) ac.scrollTop -= ar.top - r.top;
    }
  }
  function commit(sym, name, at) {
    const before = ta.value.slice(0, at.start);
    const after = ta.value.slice(at.end);
    const lead = before && /[\p{L}\p{N}_@*#]$/u.test(before) ? " " : "";
    const tail = after && /^[\p{L}\p{N}_@*#]/u.test(after) ? " " : "";
    const ins = lead + sym + name + tail;
    ta.value = before + ins + after;
    const pos = (before + lead + sym + name).length;
    ta.setSelectionRange(pos, pos);
    closeAC(); paintBackdrop(); onChange?.(ta.value);
    ta.focus();
  }
  function checkAC() {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const m = /(?:^|[^\p{L}\p{N}_@*#])([@*#])([\p{L}\p{N}_\-]*)$/u.exec(before);
    if (!m) { closeAC(); return; }
    const start = pos - m[1].length - m[2].length;
    showAC(m[1], m[2], { start, end: pos });
  }

  ta.addEventListener("input", () => { paintBackdrop(); checkAC(); onChange?.(ta.value); });
  ta.addEventListener("scroll", () => { back.scrollTop = ta.scrollTop; back.scrollLeft = ta.scrollLeft; });
  ta.addEventListener("click", checkAC);
  ta.addEventListener("blur", () => setTimeout(closeAC, 120));
  ta.addEventListener("keydown", (e) => {
    if (!ac || !acItems.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); acIndex = (acIndex + 1) % acItems.length; paintAC(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; paintAC(); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const it = acItems[acIndex]; if (it) commit(it.sym, it.name, it.at); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAC(); }
  });

  paintBackdrop();
  return {
    root, ta, back,
    getValue: () => ta.value,
    setValue: (v) => { ta.value = typeof v === "string" ? v : ""; paintBackdrop(); },
    refresh: paintBackdrop,
    sync: syncColumns,
    /** 供标签库卡片上的「插入」调用：在当前光标处写入一个记号。 */
    insert: (name, sym) => {
      closeAC();
      const pos = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, pos), after = ta.value.slice(pos);
      const lead = before && /[\p{L}\p{N}_@*#]$/u.test(before) ? " " : "";
      const ins = lead + sym + name + " ";
      ta.value = before + ins + after;
      const p = (before + ins).length;
      ta.setSelectionRange(p, p);
      paintBackdrop(); onChange?.(ta.value); ta.focus();
    },
    destroy: () => { ro?.disconnect(); closeAC(); root.remove(); },
  };
}
