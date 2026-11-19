// XiaoHei-标签提示词 · 全屏标签库编辑器
// 1:1 学 ComfyUI-Pixaroma / js/prompt/library_editor.mjs（MIT）的结构：
//   顶栏（标题 / 搜索 / 关闭）＋ 左侧分类（文字 / 清单 两组）＋ 右侧新建区与卡片
//   ＋ 底部导出 / 导入 / 完成。卡片上的「插入」通过打开时传入的 onInsert 回调
//   写回当前节点，所以库不绑死任何一个节点。
// 🔴 ComfyUI 桌面版禁用 window.prompt / confirm / alert：新建分类用行内输入框，
//    删除用「再点一次确认」，导入冲突用行内三选一，全部不碰原生弹窗。
import {
  reloadLibrary, commitLibrary, flushLibrary,
  getCategories, tagsInCat, isListTag, tagLines, catOf, sideOfCat,
  cleanName, uniqueTagName, exportLibraryJSON, parseImport, applyImport,
  TEXT_BUCKET, LIST_BUCKET,
} from "./library.mjs";
import { xhIconHTML } from "../xh_ui_kit.js";

const CSS_ID = "xh-tag-editor-css";
const CSS = `
.xh-tage{position:fixed;inset:0;z-index:11000;display:flex;flex-direction:column;
  background:var(--background,#171718);color:var(--foreground,#fff);font:12px var(--font-family,sans-serif)}
.xh-tage-bar{flex:none;display:flex;align-items:center;gap:10px;padding:9px 14px;
  background:var(--secondary,#262729);border-bottom:1px solid var(--border,#494a50)}
.xh-tage-bar .ttl{font-size:14px;font-weight:600;white-space:nowrap}
.xh-tage-bar .priv{opacity:.6;font-size:11px;white-space:nowrap}
.xh-tage-bar input{flex:1;max-width:320px;background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 9px;outline:none}
.xh-tage-bar input:focus{border-color:var(--xh-primary,#E8A33C)}
.xh-tage-x{margin-left:auto;cursor:pointer;opacity:.7;font-size:15px;padding:0 6px}
.xh-tage-x:hover{opacity:1}
.xh-tage-main{flex:1;display:flex;min-height:0}
.xh-tage-side{flex:none;width:190px;overflow:auto;padding:12px 10px;border-right:1px solid var(--border,#494a50)}
.xh-tage-h{font-size:11px;opacity:.6;padding:10px 8px 4px}
.xh-tage-cat{display:flex;gap:6px;align-items:center;padding:6px 9px;border-radius:5px;cursor:pointer}
.xh-tage-cat:hover{background:color-mix(in srgb,var(--xh-primary,#E8A33C) 16%,transparent)}
.xh-tage-cat.on{background:var(--xh-primary,#E8A33C);color:var(--background,#171718);font-weight:600}
.xh-tage-cat .n{margin-left:auto;opacity:.65}
.xh-tage-newcat{width:100%;box-sizing:border-box;margin-top:8px;background:var(--secondary,#262729);
  color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 8px;outline:none}
.xh-tage-content{flex:1;overflow:auto;padding:14px 16px}
.xh-tage-create{display:grid;grid-template-columns:150px minmax(220px,1fr) 170px max-content;gap:10px;align-items:start;
  padding:12px;border:1px solid var(--border,#494a50);border-radius:8px;margin-bottom:14px}
.xh-tage-create input,.xh-tage-create textarea{width:100%;box-sizing:border-box;
  background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:7px 9px;outline:none;font:12px var(--font-family,sans-serif)}
.xh-tage-create textarea{min-height:56px;resize:vertical}
.xh-tage-create button.pri{white-space:nowrap;min-width:66px;padding:7px 12px;align-self:start}
.xh-tage-lbl{font-size:11px;opacity:.65;margin-bottom:4px}
.xh-tage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.xh-tage-card{border:1px solid var(--border,#494a50);border-radius:8px;padding:10px;
  background:var(--secondary,#262729);display:flex;flex-direction:column;gap:7px}
.xh-tage-card .nm{font-size:13px;font-weight:600;width:100%;box-sizing:border-box;
  background:transparent;color:var(--xh-primary,#E8A33C);border:0;border-bottom:1px solid transparent;outline:none;padding:2px 0}
.xh-tage-card .nm:focus{border-bottom-color:var(--xh-primary,#E8A33C)}
.xh-tage-card textarea{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;
  background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:6px 8px;outline:none;font:12px var(--font-family,sans-serif)}
.xh-tage-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.xh-tage-btn{background:transparent;color:var(--foreground,#fff);border:1px solid var(--border,#494a50);
  border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer}
.xh-tage-btn:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-tage-btn.pri{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);color:var(--background,#171718);font-weight:600}
.xh-tage-btn.on{background:color-mix(in srgb,var(--xh-primary,#E8A33C) 26%,transparent);border-color:var(--xh-primary,#E8A33C)}
.xh-tage-pill{background:color-mix(in srgb,var(--xh-primary,#E8A33C) 20%,transparent);
  border:1px solid var(--border,#494a50);border-radius:10px;padding:2px 9px;font-size:11px;cursor:pointer}
.xh-tage-sp{flex:1}
.xh-tage-foot{flex:none;display:flex;gap:8px;padding:9px 14px;border-top:1px solid var(--border,#494a50);
  background:var(--secondary,#262729);align-items:center}
.xh-tage-empty{padding:30px;text-align:center;opacity:.6}
.xh-tage-menu{position:fixed;z-index:12000;background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:6px;padding:4px;min-width:120px;
  box-shadow:0 10px 30px rgba(0,0,0,.45)}
.xh-tage-menu div{padding:6px 10px;cursor:pointer;border-radius:4px;font-size:12px}
.xh-tage-menu div:hover{background:color-mix(in srgb,var(--xh-primary,#E8A33C) 22%,transparent)}
.xh-tage-warn{border:1px solid var(--xh-primary,#E8A33C);border-radius:6px;padding:8px 10px;margin-bottom:12px}
`;
function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS;
  document.head.appendChild(s);
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

let _ov = null, _work = null, _curCat = "全部", _search = "", _opts = null;

function commit() { commitLibrary(clone(_work)); }
function commitNow() { _work = clone(commitLibrary(clone(_work))); }

function openCatMenu(anchor, tag) {
  document.querySelectorAll(".xh-tage-menu").forEach((e) => e.remove());
  const m = el("div", "xh-tage-menu");
  const side = isListTag(tag) ? "list" : "text";
  const add = (label, value) => {
    const d = el("div", null, label);
    d.addEventListener("click", () => { tag.cat = value; commitNow(); m.remove(); render(); });
    m.appendChild(d);
  };
  add("不归类", "");
  for (const c of getCategories(side)) if (![TEXT_BUCKET, LIST_BUCKET].includes(c)) add(c, c);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, window.innerWidth - 140) + "px";
  m.style.top = (r.bottom + 3) + "px";
  document.body.appendChild(m);
  setTimeout(() => document.addEventListener("pointerdown", function away(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", away); }
  }), 0);
}

function renderSide(host) {
  host.innerHTML = "";
  const all = el("div", "xh-tage-cat" + (_curCat === "全部" ? " on" : ""));
  all.append(el("span", null, "全部标签"), el("span", "n", String(_work.tags.length)));
  all.addEventListener("click", () => { _curCat = "全部"; render(); });
  host.appendChild(all);
  for (const [side, label] of [["text", "文字分类"], ["list", "清单分类"]]) {
    host.appendChild(el("div", "xh-tage-h", label));
    for (const c of getCategories(side)) {
      if (!_work.categories.includes(c) && ![TEXT_BUCKET, LIST_BUCKET].includes(c)) continue;
      const row = el("div", "xh-tage-cat" + (_curCat === c ? " on" : ""));
      const n = _work.tags.filter((t) => catOf(t) === c).length;
      row.append(el("span", null, c), el("span", "n", String(n)));
      row.addEventListener("click", () => { _curCat = c; render(); });
      host.appendChild(row);
    }
  }
  host.appendChild(el("div", "xh-tage-h", "分类"));
  const btn = el("button", "xh-tage-btn", "＋ 新建分类（清单）");
  btn.style.width = "100%";
  btn.addEventListener("click", () => {
    const inp = el("input", "xh-tage-newcat");
    inp.placeholder = "输入名字后回车；名字前加 * 建文字分类";
    host.appendChild(inp); inp.focus();
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { inp.remove(); return; }
      if (e.key !== "Enter") return;
      const raw = inp.value.trim(); if (!raw) { inp.remove(); return; }
      const asList = !raw.startsWith("*");
      const name = asList ? raw : raw.slice(1).trim();
      if (name && !_work.categories.includes(name)) {
        _work.categories.push(name);
        if (asList && !_work.listCats.includes(name)) _work.listCats.push(name);
        commitNow();
      }
      inp.remove(); render();
    });
  });
  host.appendChild(btn);
}

function renderCreate(host) {
  const box = el("div", "xh-tage-create");
  const c1 = el("div"), c2 = el("div");
  c1.appendChild(el("div", "xh-tage-lbl", "标签名字"));
  const nameIn = el("input"); nameIn.placeholder = "例如 油画风";
  c1.appendChild(nameIn);
  c2.appendChild(el("div", "xh-tage-lbl", "展开成什么内容（清单类一行一个选项）"));
  const textIn = el("textarea"); textIn.placeholder = "厚涂笔触、伦勃朗光、画布纹理…";
  c2.appendChild(textIn);
  const sideWrap = el("div");
  sideWrap.appendChild(el("div", "xh-tage-lbl", "类型"));
  const seg = el("div", "xh-tage-row");
  let asList = false;
  const bText = el("button", "xh-tage-btn on", "文字");
  const bList = el("button", "xh-tage-btn", "清单");
  const paint = () => { bText.classList.toggle("on", !asList); bList.classList.toggle("on", asList); };
  bText.addEventListener("click", () => { asList = false; paint(); });
  bList.addEventListener("click", () => { asList = true; paint(); });
  seg.append(bText, bList); sideWrap.appendChild(seg);
  sideWrap.appendChild(el("div", "xh-tage-lbl", "建好后去卡片上点分类小标签归类"));
  const create = el("button", "xh-tage-btn pri", "新建");
  create.addEventListener("click", () => {
    const name = cleanName(nameIn.value);
    if (!name) { nameIn.focus(); return; }
    const rec = { name: uniqueTagName(name), cat: "", text: textIn.value };
    if (asList) rec.kind = "list";
    _work.tags.unshift(rec);
    commitNow(); nameIn.value = ""; textIn.value = ""; render();
  });
  textIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || (!asList && e.metaKey))) { e.preventDefault(); create.click(); }
  });
  box.append(c1, c2, sideWrap, create);
  host.appendChild(box);
}

function renderCards(host) {
  let tags = _work.tags;
  if (_curCat !== "全部") tags = tags.filter((t) => catOf(t) === _curCat);
  if (_search.trim()) {
    const q = _search.trim().toLowerCase();
    tags = tags.filter((t) => t.name.toLowerCase().includes(q) || String(t.text).toLowerCase().includes(q));
  }
  if (!tags.length) { host.appendChild(el("div", "xh-tage-empty", "这里还没有标签，在上面新建，或点底部「导入」。")); return; }
  const grid = el("div", "xh-tage-grid");
  for (const t of tags) {
    const card = el("div", "xh-tage-card");
    const nm = el("input", "xh-tage-nm nm"); nm.className = "nm"; nm.value = t.name;
    let oldName = t.name;
    nm.addEventListener("blur", () => {
      const n = cleanName(nm.value);
      if (!n || n === oldName) { nm.value = t.name; return; }
      t.name = uniqueTagName(n, t); oldName = t.name; nm.value = t.name; commitNow();
    });
    nm.addEventListener("keydown", (e) => e.stopPropagation());
    const head = el("div", "xh-tage-row");
    head.append(nm);
    const pill = el("span", "xh-tage-pill", catOf(t));
    pill.title = "点一下换分类";
    pill.addEventListener("click", () => openCatMenu(pill, t));
    head.appendChild(pill);
    const ta = el("textarea"); ta.value = t.text;
    ta.addEventListener("input", () => { t.text = ta.value; commit(); });
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    const row = el("div", "xh-tage-row");
    const ins = el("button", "xh-tage-btn pri", "插入");
    ins.title = isListTag(t) ? `插入 #${t.name}（每次运行抽一行）` : `插入 @${t.name}（整段文字）`;
    ins.addEventListener("click", () => {
      _opts?.onInsert?.(t.name, isListTag(t) ? "#" : "@");
      const old = ins.textContent; ins.textContent = "已插入 ✓";
      setTimeout(() => { ins.textContent = old; }, 850);
    });
    const bText = el("button", "xh-tage-btn", "文字");
    const bList = el("button", "xh-tage-btn", "清单" + (isListTag(t) ? ` · ${tagLines(t.text).length}` : ""));
    const paintKind = () => {
      bText.classList.toggle("on", !isListTag(t));
      bList.classList.toggle("on", isListTag(t));
      ins.title = isListTag(t) ? `插入 #${t.name}（每次运行抽一行）` : `插入 @${t.name}（整段文字）`;
    };
    bText.addEventListener("click", () => { delete t.kind; t.cat = ""; commitNow(); render(); });
    bList.addEventListener("click", () => { t.kind = "list"; t.cat = ""; commitNow(); render(); });
    paintKind();
    const del = el("button", "xh-tage-btn", "删");
    let armed = false, timer = null;
    del.addEventListener("click", () => {
      if (!armed) {
        armed = true; del.textContent = "确定删？"; del.style.borderColor = "var(--xh-primary,#E8A33C)";
        timer = setTimeout(() => { armed = false; del.textContent = "删"; del.style.borderColor = ""; }, 3000);
      } else {
        clearTimeout(timer);
        _work.tags = _work.tags.filter((x) => x !== t);
        commitNow(); render();
      }
    });
    row.append(ins, bText, bList, el("span", "xh-tage-sp"), del);
    card.append(head, ta, row);
    grid.appendChild(card);
    // 文字/清单切换会重渲染，这里补一次按钮态
    bText.classList.toggle("on", !isListTag(t));
    bList.classList.toggle("on", isListTag(t));
  }
  host.appendChild(grid);
}

function render() {
  if (!_ov) return;
  const side = _ov.querySelector(".xh-tage-side");
  const content = _ov.querySelector(".xh-tage-content");
  renderSide(side);
  content.innerHTML = "";
  renderCreate(content);
  renderCards(content);
}

export function closeTagEditor() {
  if (!_ov) return;
  flushLibrary();
  _ov.remove(); _ov = null; _work = null; _opts = null;
  document.querySelectorAll(".xh-tage-menu").forEach((e) => e.remove());
}
export function tagEditorOpen() { return !!_ov; }

export function openTagEditor(opts = {}) {
  closeTagEditor();
  injectCSS();
  _opts = opts;
  _work = clone(reloadLibrary());
  _curCat = "全部"; _search = "";

  const ov = el("div", "xh-tage");
  const bar = el("div", "xh-tage-bar");
  const ttl = el("span", "ttl");
  ttl.innerHTML = xhIconHTML("library", { size: 14, color: "current" }) + "<span>标签库</span>";
  ttl.style.cssText = "display:inline-flex;align-items:center;gap:6px";
  bar.append(ttl);
  const search = el("input"); search.placeholder = "搜名字或内容";
  search.addEventListener("input", () => { _search = search.value; render(); });
  search.addEventListener("keydown", (e) => e.stopPropagation());
  bar.append(search, el("span", "priv", "只存在你本机 · 换插件不丢 · 不进工作流 · 分享要靠导出"));
  const x = el("span", "xh-tage-x"); x.dataset.xhIconDone = "1"; x.innerHTML = xhIconHTML("x", { size: 14, color: "current" }); x.title = "关闭";
  x.addEventListener("click", closeTagEditor);
  bar.appendChild(x);
  const main = el("div", "xh-tage-main");
  main.append(el("div", "xh-tage-side"), el("div", "xh-tage-content"));
  const foot = el("div", "xh-tage-foot");
  const exp = el("button", "xh-tage-btn", "导出");
  exp.addEventListener("click", () => {
    const blob = new Blob([exportLibraryJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "XiaoHei-标签库.json";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const imp = el("button", "xh-tage-btn", "导入");
  const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.style.display = "none";
  file.addEventListener("change", async () => {
    const f = file.files?.[0]; if (!f) return;
    const parsed = parseImport(await f.text());
    file.value = "";
    const old = ov.querySelector(".xh-tage-warn"); old?.remove();
    if (parsed.error) { showWarn(parsed.error); return; }
    const doImport = (mode) => {
      const r = applyImport(parsed, mode);
      _work = clone(reloadLibrary());
      ov.querySelector(".xh-tage-warn")?.remove();
      render();
      showWarn(`导入完成：新增 ${r.added} 个标签。`);
    };
    if (!parsed.conflicts.length) { doImport("both"); return; }
    const w = el("div", "xh-tage-warn");
    w.append(el("div", null, `有 ${parsed.conflicts.length} 个重名标签（${parsed.conflicts.slice(0, 5).join("、")}${parsed.conflicts.length > 5 ? "…" : ""}），怎么处理？`));
    const row = el("div", "xh-tage-row"); row.style.marginTop = "6px";
    for (const [label, mode] of [["保留双方", "both"], ["覆盖我的", "replace"], ["跳过", "skip"]]) {
      const b = el("button", "xh-tage-btn", label);
      b.addEventListener("click", () => doImport(mode));
      row.appendChild(b);
    }
    w.appendChild(row);
    contentPrepend(w);
  });
  function contentPrepend(node) { ov.querySelector(".xh-tage-content").prepend(node); }
  function showWarn(msg) { const w = el("div", "xh-tage-warn", msg); contentPrepend(w); setTimeout(() => w.remove(), 4000); }
  imp.addEventListener("click", () => file.click());
  const done = el("button", "xh-tage-btn pri", "完成");
  done.addEventListener("click", closeTagEditor);
  foot.append(exp, imp, file, el("span", "xh-tage-sp"), done);
  ov.append(bar, main, foot);
  document.body.appendChild(ov);
  _ov = ov;
  render();
  // 打开时已 reloadLibrary() 重读过设置，所以另一个标签页的改动不会丢；
  // 编辑期间不重渲染，否则会抢走正在打字的输入焦点。
  return ov;
}
