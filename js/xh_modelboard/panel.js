// 小黑模型管理器 —— 全屏遮罩面板。纯原生 JS，不依赖 Vue / 构建工具。
//  2026-11-19 家族化：图案统一走家族图标库（xhIconHTML → currentColor 跟主题）。
import { xhIconHTML } from "../xh_ui_kit.js";
// 视图切换按钮：图标走家族库 + 文字，切主题自动跟随。
function viewBtnHTML(view) {
  return view === "grid"
    ? xhIconHTML("layout-grid", { size: 14, color: "current" }) + " 网格"
    : xhIconHTML("list", { size: 14, color: "current" }) + " 列表";
}
const API = "/xh_mb";
const BATCH = 60;

const S = {
  tree: [],
  types: [],          // 官方 24 类（含空分类）
  extra: [],          // 未归类 / 第三方目录
  extraTree: [],
  total: 0,
  type: "",
  dir: "",
  q: "",
  fav: false,
  sort: "name",
  view: "grid",
  items: [],
  rendered: 0,
  expanded: new Set(),
  detailKey: "",
  detailMode: "local",
  open: false,
  mode: "local",       // local = 本地模型 / lib = 资源库
  libGroups: [],
  libItems: [],
  libGroup: "",
  libDir: "",          // 资源库：选中的官方安装目录（type key）
  libSeriesOpen: false, // 资源库：按系列分组那一块是否展开
  libShown: [],
  libRendered: 0,
  libId: "",
  staging: "",        // 下载暂存夹（网盘下载落点，一键归位的来源）；存 localStorage
};

const STAGING_KEY = "xh_mb.staging";
try { S.staging = localStorage.getItem(STAGING_KEY) || ""; } catch (_) { S.staging = ""; }

let mask = null;
let grid = null;
let sideList = null;
let crumb = null;
let countEl = null;
let subEl = null;
let emptyEl = null;
let detailEl = null;
let toastEl = null;
let searchEl = null;
let pathSel = null;
let sortSel = null;
let favBtn = null;
let fileInput = null;
let searchTimer = null;
let toastTimer = null;
let sideHeadText = null;

const ESC = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

function fmtSize(n) {
  n = Number(n) || 0;
  if (n <= 0) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + " " + u[i];
}

function fmtTime(sec) {
  const t = Number(sec) || 0;
  if (!t) return "-";
  const d = new Date(t * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shortName(name, max) {
  const m = max || 34;
  return name.length > m ? name.slice(0, m - 2) + "…" : name;
}

// 「官方 key · 中文」；第三方目录两者同名时只显示一次
function typeTxt(it) {
  const t = String((it && it.type) || "").trim();
  const l = String((it && it.type_label) || "").trim();
  if (!t) return l;
  if (!l || l === t) return t;
  return `${t} · ${l}`;
}

// 样式版本号：改动 panel.css 后把这个数字 +1，浏览器就不会再吃旧缓存
//  24 = 2026-11-19 家族化覆盖层（主色接 --xh-primary / 字体接 --font-sans）
//  25 = 2026-11-21 下载到模型目录（网盘链接 → 暂存夹 → 一键归位）
const CSS_VER = "25";

// 关键布局的内联兜底：即使外部样式表缺失或版本对不上，卡片也不会被压扁
const HARD_CSS = `
#xhmb-mask .xhmb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr))!important;grid-auto-rows:min-content!important;align-items:start!important;align-content:start!important;gap:12px!important;overflow-y:auto!important;padding:14px!important}
#xhmb-mask .xhmb-grid.listmode{display:flex!important;flex-direction:column!important;gap:5px!important;padding:10px!important}
#xhmb-mask .xhmb-card{background:#22282d!important;border:1px solid #313940!important;border-radius:9px!important;overflow:hidden!important;cursor:pointer!important;display:flex!important;flex-direction:column!important;align-self:start!important;flex:0 0 auto!important;height:auto!important;min-height:196px!important;transition:border-color .15s,transform .15s!important}
#xhmb-mask .xhmb-card.rowmode{display:grid!important;grid-template-columns:54px minmax(180px,1.4fr) minmax(120px,1fr) minmax(150px,1.2fr)!important;align-items:center!important;align-self:stretch!important;width:auto!important;gap:10px!important;padding:6px 10px!important;min-height:0!important;flex:0 0 auto!important;height:auto!important}
#xhmb-mask .xhmb-card.rowmode.librow{grid-template-columns:118px minmax(200px,1.6fr) 0 minmax(150px,1fr)!important}
#xhmb-mask .xhmb-card.rowmode .xhmb-thumb{width:54px!important;height:54px!important;min-height:54px!important;max-height:54px!important;border:1px solid #3a434b!important;border-radius:5px!important;background:#1b2025!important}
#xhmb-mask .xhmb-card.rowmode .xhmb-noimg{font-size:9.5px!important;line-height:1.3!important;white-space:normal!important;overflow:hidden!important;max-width:52px!important;text-align:center!important;gap:0!important}
#xhmb-mask .xhmb-card.rowmode .xhmb-noimg span{display:none!important}
#xhmb-mask .xhmb-card-body{padding:8px 10px 10px!important;min-height:0!important}
#xhmb-mask .xhmb-card-name{font-size:12px!important;line-height:1.45!important;color:#e3e9ee!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#xhmb-mask .xhmb-card-sub{font-size:11px!important;line-height:1.5!important;color:#717c84!important;margin-top:3px!important}
#xhmb-mask .xhmb-card-path{font-size:11px!important;line-height:1.5!important;color:#6d98b5!important;margin-top:3px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#xhmb-mask .xhmb-noimg{font-size:11px!important;color:#5c666d!important;line-height:1.6!important}
`;

function ensureCSS() {
  if (!document.getElementById("xhmb-hard")) {
    const st = document.createElement("style");
    st.id = "xhmb-hard";
    st.textContent = HARD_CSS;
    document.head.appendChild(st);
  }
  if (document.getElementById("xhmb-css")) return;
  const l = document.createElement("link");
  l.id = "xhmb-css";
  l.rel = "stylesheet";
  l.href = new URL("./panel.css?v=" + CSS_VER, import.meta.url).href;
  document.head.appendChild(l);
}

async function req(path, opts) {
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
  if (!res.ok) throw new Error((data && data.error) || text || ("HTTP " + res.status));
  return data || {};
}

function toast(msg, bad) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = "xhmb-toast" + (bad ? " bad" : "");
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = "none"; }, 1800);
}

// ---------------- 构建 -----------------------------

function build() {
  if (mask) return;
  ensureCSS();

  mask = document.createElement("div");
  mask.id = "xhmb-mask";
  mask.className = "xhmb-mask";
  mask.innerHTML = `
    <div class="xhmb-win">
      <div class="xhmb-head">
        <div class="xhmb-titles">
          <span class="xhmb-title">小黑模型管理器</span>
          <span class="xhmb-sub"></span>
        </div>
        <div class="xhmb-tabs">
          <button class="xhmb-tab on" data-act="mode" data-mode="local">本地模型</button>
          <button class="xhmb-tab" data-act="mode" data-mode="lib">资源库</button>
        </div>
        <div class="xhmb-head-btns">
          <button class="xhmb-btn" data-act="rescan" title="重新扫描本地模型目录">重新扫描</button>
          <button class="xhmb-x" data-act="close" title="关闭（Esc）">${xhIconHTML("x", { size: 16, color: "current" })}</button>
        </div>
      </div>

      <div class="xhmb-toolbar">
        <div class="xhmb-search-wrap">
          <span class="xhmb-ico">${xhIconHTML("search", { size: 14, color: "current" })}</span>
          <input class="xhmb-search" placeholder="搜索模型名 / 标签 / 备注" spellcheck="false">
        </div>
        <div class="xhmb-sel-wrap xhmb-pathwrap" title="按路径快速跳转">
          <span class="xhmb-sel-ico">${xhIconHTML("folder", { size: 14, color: "current" })}</span>
          <select class="xhmb-path"></select>
        </div>
        <div class="xhmb-sel-wrap">
          <span class="xhmb-sel-ico">${xhIconHTML("arrow-up-down", { size: 14, color: "current" })}</span>
          <select class="xhmb-sort">
            <option value="name">按名称</option>
            <option value="time">按修改时间</option>
            <option value="size">按大小</option>
            <option value="fav">收藏优先</option>
          </select>
        </div>
        <button class="xhmb-btn xhmb-fav" data-act="favonly">★ 只看收藏</button>
        <button class="xhmb-btn xhmb-viewbtn" data-act="view">${viewBtnHTML("grid")}</button>
        <span class="xhmb-count"></span>
      </div>

      <div class="xhmb-crumb"></div>

      <div class="xhmb-body">
        <div class="xhmb-side">
          <div class="xhmb-side-head">
            <span class="xhmb-side-label">模型分类</span>
            <div class="xhmb-side-btns">
              <button class="xhmb-mini" data-act="expandall">全展开</button>
              <button class="xhmb-mini" data-act="collapseall">全折叠</button>
            </div>
          </div>
          <div class="xhmb-side-list"></div>
        </div>
        <div class="xhmb-main">
          <div class="xhmb-grid"></div>
          <div class="xhmb-empty" style="display:none">这里还没有模型</div>
        </div>
      </div>

      <div class="xhmb-detail" style="display:none"></div>
      <div class="xhmb-toast" style="display:none"></div>
    </div>`;

  document.body.appendChild(mask);

  grid = mask.querySelector(".xhmb-grid");
  sideList = mask.querySelector(".xhmb-side-list");
  crumb = mask.querySelector(".xhmb-crumb");
  countEl = mask.querySelector(".xhmb-count");
  subEl = mask.querySelector(".xhmb-sub");
  emptyEl = mask.querySelector(".xhmb-empty");
  detailEl = mask.querySelector(".xhmb-detail");
  toastEl = mask.querySelector(".xhmb-toast");
  searchEl = mask.querySelector(".xhmb-search");
  pathSel = mask.querySelector(".xhmb-path");
  sortSel = mask.querySelector(".xhmb-sort");
  favBtn = mask.querySelector(".xhmb-fav");
  sideHeadText = mask.querySelector(".xhmb-side-label");

  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  mask.appendChild(fileInput);
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (f) uploadImage(f);
  });

  mask.addEventListener("mousedown", (e) => { if (e.target === mask) closeBoard(); });
  mask.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  mask.addEventListener("keydown", (e) => e.stopPropagation());
  mask.addEventListener("click", onClick);

  grid.addEventListener("scroll", () => {
    if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 260) renderBatch();
  });

  searchEl.addEventListener("input", () => {
    S.q = searchEl.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      dropDetail();
      if (S.mode === "lib") { renderLibCrumb(); resortLib(); }
      else loadList();
    }, 320);
  });

  pathSel.addEventListener("change", () => {
    dropDetail();
    const v = pathSel.value;
    if (S.mode === "lib") {
      S.libDir = "";
      S.libGroup = "";
      if (v) {
        const bits = v.split("||");
        if (bits[0] === "D") S.libDir = bits[1] || "";
        else if (bits[0] === "G") S.libGroup = bits[1] || "";
      }
      renderLibSide();
      renderLibCrumb();
      resortLib();
      return;
    }
    if (!v) {
      S.type = "";
      S.dir = "";
    } else {
      const bits = v.split("||");
      S.type = bits[0] || "";
      S.dir = bits[1] || "";
      if (S.type) S.expanded.add("T::" + S.type);
      const segs = S.dir ? S.dir.split("/") : [];
      let acc = [];
      for (const s of segs) {
        acc.push(s);
        S.expanded.add(S.type + "::" + acc.join("/"));
      }
    }
    renderSide();
    renderCrumb();
    loadList();
  });

  sortSel.addEventListener("change", () => {
    S.sort = sortSel.value;
    if (S.mode === "lib") resortLib();
    else resort();
  });

  document.addEventListener("keydown", (e) => {
    if (!S.open) return;
    if (e.key === "Escape") {
      if (detailEl.style.display === "block") closeDetail();
      else closeBoard();
    }
  });
}

// ---------------- 数据 -----------------------------

async function loadTypes() {
  const d = await req("/types");
  S.tree = d.tree || [];
  S.types = d.types || [];
  S.extra = d.extra || [];
  S.extraTree = d.extra_tree || [];
  S.total = d.total || 0;
  if (subEl) subEl.textContent = `共 ${S.total} 个模型`;
  fillPath();
  renderSide();
  renderCrumb();
}

function dirsFor(key) {
  const a = (S.tree || []).find((x) => x.key === key);
  if (a) return a.dirs || [];
  const b = (S.extraTree || []).find((x) => x.key === key);
  return b ? (b.dirs || []) : [];
}

function fillPath() {
  if (S.mode === "lib") {
    const out = ['<option value="">全部资源</option>'];
    for (const d of libDirRows()) {
      out.push(`<option value="D||${ESC(d.type)}">装到 ${ESC(d.path)}（${d.files} 个文件）</option>`);
    }
    for (const g of S.libGroups) {
      out.push(`<option value="G||${ESC(g.id)}">系列：${ESC(g.name)}（${g.count} 条）</option>`);
    }
    pathSel.innerHTML = out.join("");
    pathSel.value = S.libDir ? "D||" + S.libDir : (S.libGroup ? "G||" + S.libGroup : "");
    return;
  }
  const out = ['<option value="">全部类型 / 全部路径</option>'];
  const walk = (list, typeKey, depth) => {
    for (const d of list) {
      const pad = "\u3000".repeat(depth);
      out.push(`<option value="${ESC(typeKey)}||${ESC(d.path)}">${pad}${ESC(d.name)}（${d.count}）</option>`);
      walk(d.dirs, typeKey, depth + 1);
    }
  };
  for (const t of S.types) {
    out.push(`<option value="${ESC(t.key)}||">${ESC(t.key)}｜全部（${t.count}）</option>`);
    walk(dirsFor(t.key), t.key, 1);
  }
  for (const e of S.extra) {
    out.push(`<option value="${ESC(e.key)}||">未归类 › ${ESC(e.key)}（${e.count}）</option>`);
    walk(dirsFor(e.key), e.key, 1);
  }
  pathSel.innerHTML = out.join("");
  pathSel.value = S.type ? S.type + "||" + S.dir : "";
}

function sideRows() {
  const rows = [];
  for (const t of (S.types.length ? S.types : S.tree)) {
    const dirs = dirsFor(t.key);
    const open = S.expanded.has("T::" + t.key);
    rows.push({
      kind: "type", type: t.key, dir: "", label: t.key, cn: t.label || "",
      path: t.path || "", count: t.count || 0, depth: 0, kids: dirs.length > 0, open,
    });
    if (open) collectDirs(dirs, t.key, 1, rows);
  }
  if ((S.extra || []).length) {
    const open = S.expanded.has("G::extra");
    const sum = S.extra.reduce((a, b) => a + (b.count || 0), 0);
    rows.push({
      kind: "group", type: "", dir: "", label: "未归类", cn: "官方清单之外的第三方目录",
      path: "models/*", count: sum, depth: 0, kids: true, open,
    });
    if (open) {
      for (const e of S.extra) {
        const dirs = dirsFor(e.key);
        const eo = S.expanded.has("T::" + e.key);
        rows.push({
          kind: "type", type: e.key, dir: "", label: e.key, cn: "第三方目录",
          path: e.path || "", count: e.count || 0, depth: 1, kids: dirs.length > 0, open: eo, third: true,
        });
        if (eo) collectDirs(dirs, e.key, 2, rows);
      }
    }
  }
  return rows;
}

function collectDirs(list, typeKey, depth, rows) {
  for (const d of list) {
    const id = typeKey + "::" + d.path;
    const open = S.expanded.has(id);
    rows.push({
      kind: "dir", type: typeKey, dir: d.path, label: d.name, cn: "", path: "",
      count: d.count, depth, kids: (d.dirs || []).length > 0, open,
    });
    if (open) collectDirs(d.dirs || [], typeKey, depth + 1, rows);
  }
}

function renderSide() {
  if (!sideList) return;
  if (S.mode === "lib") return renderLibSide();
  if (sideHeadText) sideHeadText.textContent = "模型分类 · 官方目录";
  const rows = sideRows();
  sideList.innerHTML = rows.map((r) => {
    const on = r.kind !== "group" && r.type === S.type && (r.dir || "") === (S.dir || "");
    const tid = r.kind === "group" ? "G::extra" : (r.kind === "type" ? "T::" + r.type : r.type + "::" + r.dir);
    const arrow = r.kids
      ? `<span class="xhmb-arrow${r.open ? " open" : ""}" data-act="toggle" data-id="${tid}">${xhIconHTML("chevron-right", { size: 14, color: "current" })}</span>`
      : `<span class="xhmb-arrow ghost"></span>`;
    const zero = (!r.count && r.kind !== "group") ? " zero" : "";
    const third = r.third ? " third" : "";
    const cls = `xhmb-tr${on ? " on" : ""}${r.kind === "type" ? " istype" : ""}${r.kind === "group" ? " isgroup" : ""}${zero}${third}`;
    if (r.kind === "dir") {
      return `<div class="${cls}" data-kind="dir" data-type="${ESC(r.type)}" data-dir="${ESC(r.dir)}"
        style="padding-left:${8 + r.depth * 14}px" title="${ESC(r.label)}">
        ${arrow}<span class="xhmb-tl">${ESC(r.label)}</span><span class="xhmb-pen" data-act="renpen"
        data-type="${ESC(r.type)}" data-dir="${ESC(r.dir)}" title="改磁盘上的文件夹名">${xhIconHTML("pencil", { size: 13, color: "current" })}</span><i>${r.count}</i></div>`;
    }
    const sub = r.path ? `<span class="xhmb-tp">${ESC(r.path)}</span>` : "";
    const dot = r.kind === "type" ? `<span class="xhmb-dot" style="background:${typeColor(r.type)}"></span>` : "";
    return `<div class="${cls}" data-kind="${r.kind}" data-type="${ESC(r.type)}" data-dir=""
      style="padding-left:${8 + r.depth * 14}px" title="${ESC(r.label)}${r.cn ? " · " + ESC(r.cn) : ""}">
      ${arrow}${dot}<span class="xhmb-tcol"><span class="xhmb-tk">${ESC(r.label)}</span>${sub}</span><i>${r.count}</i></div>`;
  }).join("");
}

function renderCrumb() {
  if (!crumb) return;
  if (S.mode === "lib") return renderLibCrumb();
  const bits = [`<span class="xhmb-crumb-item${!S.type && !S.dir ? " on" : ""}" data-act="crumb" data-type="" data-dir="">全部模型</span>`];
  if (S.type) {
    const t = (S.types || []).find((x) => x.key === S.type) || (S.tree || []).find((x) => x.key === S.type);
    bits.push(`<span class="xhmb-sep">›</span>`);
    bits.push(`<span class="xhmb-crumb-item${!S.dir ? " on" : ""}" data-act="crumb" data-type="${ESC(S.type)}" data-dir="">${ESC(t ? t.key : S.type)}</span>`);
    if (S.dir) {
      const segs = S.dir.split("/");
      let acc = [];
      segs.forEach((s, i) => {
        acc.push(s);
        const p = acc.join("/");
        bits.push(`<span class="xhmb-sep">›</span>`);
        bits.push(`<span class="xhmb-crumb-item${i === segs.length - 1 ? " on" : ""}" data-act="crumb" data-type="${ESC(S.type)}" data-dir="${ESC(p)}">${ESC(s)}</span>`);
      });
    }
  }
  if (S.q) bits.push(`<span class="xhmb-sep">·</span><span class="xhmb-crumb-q">关键词「${ESC(S.q)}」</span>`);
  if (S.fav) bits.push(`<span class="xhmb-sep">·</span><span class="xhmb-crumb-q">只看收藏</span>`);
  bits.push(`<button class="xhmb-mini xhmb-crumb-clear" data-act="clearcrumb">清除筛选</button>`);
  crumb.innerHTML = bits.join("");
  crumb.style.display = "flex";
}

async function loadList() {
  const p = new URLSearchParams();
  if (S.type) p.set("type", S.type);
  if (S.dir) p.set("dir", S.dir);
  if (S.q) p.set("q", S.q);
  if (S.fav) p.set("fav", "1");
  let d = {};
  try {
    d = await req("/list?" + p.toString());
  } catch (e) {
    toast("读取失败：" + e.message, true);
    return;
  }
  S.items = d.items || [];
  resort(true);
  // 兜底：详情里那个模型已经不在当前结果里（换了筛选、搜索、重扫），就把详情收掉
  if (S.detailKey && !S.items.some((x) => x.key === S.detailKey)) closeDetail();
}

function resort(rebuild) {
  const by = S.sort;
  const arr = S.items.slice();
  arr.sort((a, b) => {
    if (by === "fav" && !!a.fav !== !!b.fav) return a.fav ? -1 : 1;
    if (by === "size") return (b.size || 0) - (a.size || 0);
    if (by === "time") return (b.mtime || 0) - (a.mtime || 0);
    return String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
  });
  S.items = arr;
  if (rebuild !== false) {
    S.rendered = 0;
    grid.innerHTML = "";
    grid.scrollTop = 0;
    countEl.textContent = `显示 ${S.items.length} 个`;
    emptyEl.style.display = S.items.length ? "none" : "block";
    renderBatch();
  }
}

// ---------------- 卡片 / 列表 -----------------------------

function thumbHTML(it, color, compact) {
  const imgStyle = "display:block;width:100%;height:100%;object-fit:cover;position:static;max-height:none;max-width:none";
  if (!it.has_img) {
    const c = color || "#8b959c";
    const main = compact ? "无图" : "无预览图";
    const sub = compact ? "" : `<span style="color:${c}">点开可上传</span>`;
    return `<div class="xhmb-noimg" style="display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(160deg,${c}26,#1b2025 72%)">${main}${sub}</div>`;
  }
  return `<img loading="lazy" src="${API}/image?key=${encodeURIComponent(it.key)}&v=${it.img_v}" alt="" style="${imgStyle}">`;
}

// 缩略图外框的尺寸写死成内联样式 —— 宿主的全局 CSS 再怎么写也压不薄
function thumbBox(h) {
  return `style="display:block;position:relative;flex:0 0 ${h}px;width:100%;height:${h}px;min-height:${h}px;max-height:${h}px;overflow:hidden;background:#1b2025"`;
}

function card(it) {
  const el = document.createElement("div");
  el.className = "xhmb-card" + (S.view === "list" ? " rowmode" : "");
  el.dataset.key = it.key;
  // 本地卡片也按官方类型色：左边一条竖线，跟资源库那边一个规矩
  const c = typeColor(it.type);
  el.style.borderLeft = `3px solid ${c}`;
  const chips = (it.tags || []).slice(0, 4)
    .map((t) => `<span class="xhmb-chip">${ESC(t)}</span>`).join("");
  const libMark = it.lib ? `<span class="xhmb-haslib" title="资源库里有这条的来源">${xhIconHTML("package", { size: 12, color: "current" })} 来源</span>` : "";
  const pathLine = it.dirrel ? `<div class="xhmb-card-path" title="${ESC(it.dirrel)}">${xhIconHTML("folder", { size: 12, color: "current" })} ${ESC(shortName(it.dirrel, 30))}</div>` : "";
  if (S.view === "list") {
    el.innerHTML = `
      <div class="xhmb-thumb" ${thumbBox(54)}>${thumbHTML(it, c, true)}${it.fav ? '<span class="xhmb-star">★</span>' : ""}</div>
      <div class="xhmb-row-main">
        <div class="xhmb-card-name" title="${ESC(it.name)}">${ESC(it.name)}</div>
        <div class="xhmb-card-sub">${ESC(typeTxt(it))} · ${fmtSize(it.size)} · ${fmtTime(it.mtime)}${libMark}</div>
        ${pathLine}
      </div>
      <div class="xhmb-row-tags">${chips}</div>
      <div class="xhmb-row-note">${it.note ? xhIconHTML("pencil", { size: 12, color: "current" }) + " " + ESC(shortName(it.note, 40)) : ""}</div>`;
    return el;
  }
  el.innerHTML = `
    <div class="xhmb-thumb" ${thumbBox(150)}>${thumbHTML(it, c)}${it.fav ? '<span class="xhmb-star">★</span>' : ""}</div>
    <div class="xhmb-card-body">
      <div class="xhmb-card-name" title="${ESC(it.name)}">${ESC(shortName(it.name))}</div>
      <div class="xhmb-card-sub">${ESC(typeTxt(it))} · ${fmtSize(it.size)}${libMark}</div>
      ${pathLine}
      ${chips ? `<div class="xhmb-chips">${chips}</div>` : ""}
    </div>`;
  return el;
}

function renderBatch() {
  if (S.mode === "lib") return renderLibBatch();
  if (S.rendered >= S.items.length) return;
  const next = S.items.slice(S.rendered, S.rendered + BATCH);
  const frag = document.createDocumentFragment();
  for (const it of next) frag.appendChild(card(it));
  grid.appendChild(frag);
  S.rendered += next.length;
  if (grid.scrollHeight <= grid.clientHeight && S.rendered < S.items.length) renderBatch();
}

function refreshCard(key) {
  const it = S.items.find((x) => x.key === key);
  if (!it) return;
  const old = Array.from(grid.children).find((c) => c.dataset.key === key);
  if (old) old.replaceWith(card(it));
}

// ---------------- 资源库 -----------------------------

function setMode(m) {
  if (!mask || S.mode === m) return;
  S.mode = m;
  for (const b of mask.querySelectorAll('[data-act="mode"]')) {
    b.classList.toggle("on", b.dataset.mode === m);
  }
  const pathWrap = mask.querySelector(".xhmb-pathwrap");
  const sideBtns = mask.querySelector(".xhmb-side-btns");
  if (pathWrap) pathWrap.style.display = "";
  if (favBtn) favBtn.style.display = m === "lib" ? "none" : "";
  if (sideBtns) sideBtns.style.display = m === "lib" ? "none" : "";
  if (sideHeadText) sideHeadText.textContent = m === "lib" ? "资源库 · 官方安装目录" : "模型分类";
  if (searchEl) searchEl.placeholder = m === "lib" ? "搜索资源名 / 包内文件" : "搜索模型名 / 标签 / 备注";
  S.q = "";
  if (searchEl) searchEl.value = "";
  S.fav = false;
  if (favBtn) favBtn.classList.remove("on");
  closeDetail();
  if (m === "lib") loadLibrary();
  else { loadTypes().then(loadList); }
}

async function loadLibrary() {
  let d = {};
  try {
    d = await req("/library");
  } catch (e) {
    toast("资源库读取失败：" + e.message, true);
    return;
  }
  S.libGroups = d.groups || [];
  S.libItems = d.items || [];
  S.libGroup = "";
  S.libDir = "";
  if (subEl) subEl.textContent = `资源库 ${d.total || 0} 条 · 已装 ${d.files_inst || 0}/${d.files || 0} 个文件`;
  fillPath();
  renderSide();
  renderCrumb();
  resortLib();
}

// 资源库按「官方安装目录」归类：每条资源的每个文件看它自己的类型前缀，
// 跟本地扫盘无关——本地装没装只决定这一格显示已装还是待下载。
function libFileType(f) {
  if (!f) return "";
  if (f.type) return f.type;
  return String(f.key || "").split("/")[0];
}

function libDirRows() {
  const m = new Map();
  for (const it of S.libItems || []) {
    for (const f of it.files || []) {
      const t = libFileType(f);
      if (!t) continue;
      let r = m.get(t);
      if (!r) { r = { type: t, files: 0, inst: 0, items: new Set() }; m.set(t, r); }
      r.files++;
      if (f.installed) r.inst++;
      r.items.add(it.id);
    }
  }
  const order = (S.types || []).map((t) => t.key);
  const rows = [];
  for (const k of order) {
    const r = m.get(k);
    if (r) rows.push(r);
  }
  for (const [k, r] of m) {
    if (order.indexOf(k) === -1) rows.push(r);
  }
  return rows.map((r) => {
    const meta = (S.types || []).find((t) => t.key === r.type);
    return {
      type: r.type,
      cn: meta ? meta.label : "第三方目录",
      path: meta && meta.path ? meta.path : "models/" + r.type,
      files: r.files,
      inst: r.inst,
      items: r.items.size,
    };
  });
}

function renderLibSide() {
  if (!sideList) return;
  if (sideHeadText) sideHeadText.textContent = "资源库 · 官方安装目录";
  const dirs = libDirRows();
  const allFiles = dirs.reduce((a, b) => a + b.files, 0);
  const allInst = dirs.reduce((a, b) => a + b.inst, 0);
  const rows = [];
  rows.push(`<div class="xhmb-tr istype${!S.libDir && !S.libGroup ? " on" : ""}" data-kind="lib" data-libdir="" data-libgroup="" title="资源库共 ${S.libItems.length} 条 · ${allFiles} 个文件，已装 ${allInst}">
    <span class="xhmb-arrow ghost"></span><span class="xhmb-tl">全部资源</span><i>${S.libItems.length}</i></div>`);
  for (const d of dirs) {
    rows.push(`<div class="xhmb-tr${d.type === S.libDir ? " on" : ""}" data-kind="lib" data-libdir="${ESC(d.type)}" data-libgroup="" title="${ESC(d.type)} · 装到 ${ESC(d.path)}，${d.files} 个文件，已装 ${d.inst}">
      <span class="xhmb-arrow ghost"></span><span class="xhmb-dot" style="background:${typeColor(d.type)}"></span><span class="xhmb-tcol"><span class="xhmb-tk">${ESC(d.type)}</span><span class="xhmb-tp">${ESC(d.path)}</span></span><i>${d.files}</i></div>`);
  }
  const sumEntries = S.libGroups.reduce((a, b) => a + (b.count || 0), 0);
  rows.push(`<div class="xhmb-tr isgroup" data-kind="libgroup" data-libdir="" data-libgroup="" title="按系列分组（${S.libGroups.length} 个组，点开可切回系列视图）">
    <span class="xhmb-arrow${S.libSeriesOpen ? " open" : ""}">${xhIconHTML("chevron-right", { size: 14, color: "current" })}</span><span class="xhmb-tcol"><span class="xhmb-tk">按系列分组</span><span class="xhmb-tp">${S.libGroups.length} 个组 · 折叠</span></span><i>${sumEntries}</i></div>`);
  if (S.libSeriesOpen) {
    for (const g of S.libGroups) {
      rows.push(`<div class="xhmb-tr third${g.id === S.libGroup ? " on" : ""}" data-kind="lib" data-libdir="" data-libgroup="${ESC(g.id)}" style="padding-left:22px" title="${ESC(g.name)} · 已装 ${g.files_inst}/${g.files} 个文件">
        <span class="xhmb-arrow ghost"></span><span class="xhmb-tl">${ESC(g.name)}</span><i>${g.count}</i></div>`);
    }
  }
  sideList.innerHTML = rows.join("");
  sideList.scrollTop = 0;
}

function renderLibCrumb() {
  if (!crumb) return;
  const g = S.libGroups.find((x) => x.id === S.libGroup);
  const bits = [`<span class="xhmb-crumb-item${S.libGroup || S.libDir ? "" : " on"}" data-act="libcrumb" data-libgroup="" data-libdir="">资源库</span>`];
  if (S.libDir) {
    const d = libDirRows().find((x) => x.type === S.libDir) || { type: S.libDir, path: "models/" + S.libDir };
    bits.push(`<span class="xhmb-sep">›</span>`);
    bits.push(`<span class="xhmb-crumb-item on" data-act="libcrumb" data-libgroup="" data-libdir="${ESC(S.libDir)}">${ESC(d.type)}<span class="xhmb-crumb-path">${ESC(d.path)}</span></span>`);
  }
  if (g) {
    bits.push(`<span class="xhmb-sep">›</span>`);
    bits.push(`<span class="xhmb-crumb-item on" data-act="libcrumb" data-libgroup="${ESC(g.id)}" data-libdir="">${ESC(g.name)}</span>`);
  }
  if (S.q) bits.push(`<span class="xhmb-sep">·</span><span class="xhmb-crumb-q">关键词「${ESC(S.q)}」</span>`);
  bits.push(`<button class="xhmb-mini xhmb-crumb-clear" data-act="clearcrumb">清除筛选</button>`);
  crumb.innerHTML = bits.join("");
  crumb.style.display = "flex";
}

function resortLib() {
  const q = (S.q || "").toLowerCase();
  let arr = S.libItems.slice();
  if (S.libDir) {
    arr = arr.filter((x) => (x.files || []).some((f) => libFileType(f) === S.libDir));
  }
  if (S.libGroup) arr = arr.filter((x) => x.group === S.libGroup);
  if (q) {
    arr = arr.filter((x) => {
      const hay = (x.name + " " + x.note + " " + (x.files || []).map((f) => f.name).join(" ")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  const by = S.sort;
  arr.sort((a, b) => {
    if (by === "size") return (b.size || 0) - (a.size || 0);
    if (by === "time") return (b.inst || 0) - (a.inst || 0);
    if (by === "fav") return (b.inst - b.miss) - (a.inst - a.miss) || (b.total - a.total);
    return String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
  });
  S.libShown = arr;
  S.libRendered = 0;
  grid.innerHTML = "";
  grid.scrollTop = 0;
  if (S.libDir) {
    const d = libDirRows().find((x) => x.type === S.libDir) || { files: 0, inst: 0 };
    countEl.textContent = `${arr.length} 条资源 · ${d.files} 个文件 · 已装 ${d.inst}`;
  } else {
    countEl.textContent = `显示 ${arr.length} 条`;
  }
  emptyEl.textContent = "资源库里还没有条目";
  emptyEl.style.display = arr.length ? "none" : "block";
  renderLibBatch();
  // 同理：详情那条资源已经不在当前分组/搜索里，就收掉
  if (S.detailMode === "lib" && S.libId && !arr.some((x) => x.id === S.libId)) closeDetail();
}

// 资源库卡片上的方块字：直接写系列全名（LTX 2.5 / MiniMax H3），
// 不再用两字母缩写——H3 跟 MiniMax H3 Amed 这类长得像的系列会分不清。
function seriesName(it) {
  return String(it.group_name || it.group || "其它").trim() || "其它";
}

// 官方文档里只给了五个数据类型的颜色：MODEL 淡紫、CLIP 黄、VAE 玫红、
// CONDITIONING 橙、LATENT 粉。官方目录没有全给，剩下的按语义就近归类：
// LoRA / 嵌入 / 微调补丁按「微调」一色，controlnet 系按 CONDITIONING 的橙，
// 放大类按蓝，插帧/光流按青，音频按品红，检测/分割/背景移除按灰。
const TYPE_COLOR = {
  checkpoints: "#b58fd6",
  diffusion_models: "#b58fd6",
  diffusers: "#b58fd6",
  text_encoders: "#e8c15a",
  clip: "#e8c15a",
  clip_vision: "#e8c15a",
  style_models: "#e8c15a",
  vae: "#d96a7a",
  vae_approx: "#d96a7a",
  loras: "#78c07a",
  embeddings: "#78c07a",
  hypernetworks: "#78c07a",
  model_patches: "#78c07a",
  controlnet: "#e08a4a",
  t2i_adapter: "#e08a4a",
  gligen: "#e08a4a",
  photomaker: "#e08a4a",
  upscale_models: "#5aa8d8",
  latent_upscale_models: "#5aa8d8",
  frame_interpolation: "#4ec9b0",
  optical_flow: "#4ec9b0",
  audio_encoders: "#c07ad0",
  detection: "#8b959c",
  classifiers: "#8b959c",
  background_removal: "#8b959c",
  geometry_estimation: "#8b959c",
};

function typeColor(k) {
  return TYPE_COLOR[k] || "#8b959c";
}

// 一条资源打成哪个颜色：选中目录时按目录，否则取它包里文件最多的那个类型
function libMainType(it) {
  if (S.libDir) return S.libDir;
  const cnt = {};
  for (const f of it.files || []) {
    const t = libFileType(f);
    if (t) cnt[t] = (cnt[t] || 0) + 1;
  }
  let best = "", n = -1;
  Object.keys(cnt).forEach((k) => { if (cnt[k] > n) { n = cnt[k]; best = k; } });
  return best;
}
function glyphSize(t, listMode) {
  const n = Array.from(t).length;
  if (listMode) {
    if (n <= 4) return 16;
    if (n <= 8) return 13;
    if (n <= 12) return 11;
    return 9.5;
  }
  if (n <= 4) return 28;
  if (n <= 7) return 23;
  if (n <= 10) return 19;
  if (n <= 14) return 16;
  return 14;
}

// 这条资源涉及哪几个官方安装目录（按官方顺序排），卡片第三行用
function libDirsTxt(it) {
  const ks = [];
  for (const f of it.files || []) {
    const t = libFileType(f);
    if (t && ks.indexOf(t) < 0) ks.push(t);
  }
  if (!ks.length) return "";
  const order = (S.types || []).map((x) => x.key);
  ks.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return ks.length === 1 ? "models/" + ks[0] : "models/" + ks[0] + " +" + (ks.length - 1);
}

function libCard(it) {
  const el = document.createElement("div");
  el.className = "xhmb-card" + (S.view === "list" ? " rowmode librow" : "");
  el.dataset.lib = it.id;
  const mono = seriesName(it);
  const pack = it.kind === "pack";
  const single = it.total === 1;
  const done = it.total > 0 && it.inst >= it.total;
  let kindTxt = `整包 · ${it.total} 个文件`;
  if (!pack) kindTxt = single ? (it.files[0] && it.files[0].type_label || "单文件") : `${it.total} 个文件`;
  let statTxt = single ? (it.inst ? "已装" : "未装") : `已装 ${it.inst}/${it.total}`;
  if (S.libDir) {
    const sub = (it.files || []).filter((f) => libFileType(f) === S.libDir);
    const subInst = sub.filter((f) => f.installed).length;
    kindTxt = pack ? `整包 · 此目录 ${sub.length} 个文件` : (sub.length === 1 ? (sub[0].type_label || S.libDir) : `此目录 ${sub.length} 个文件`);
    statTxt = sub.length === 1 ? (subInst ? "已装" : "未装") : `此目录已装 ${subInst}/${sub.length}`;
  }
  const h = S.view === "list" ? 54 : 96;
  const w = "100%";
  const fs = glyphSize(mono, S.view === "list");
  // 按 ComfyUI 官方类型色给整张卡上色：主模型紫、CLIP 黄、VAE 红…
  const c = typeColor(libMainType(it));
  el.style.borderLeft = `3px solid ${c}`;
  const monoBox = `<div class="xhmb-mono" style="display:flex;align-items:center;justify-content:center;flex:0 0 ${w};width:${w};height:${h}px;min-height:${h}px;max-height:${h}px;overflow:hidden;padding:6px;text-align:center;white-space:normal;word-break:break-word;line-height:1.16;background:linear-gradient(135deg,${c}3d,#1b2025);color:${c};font-size:${fs}px;font-weight:600;letter-spacing:0" title="${ESC(mono)}">${ESC(mono)}</div>`;
  const stat = `<span class="xhmb-inst${done ? " done" : ""}">${statTxt}</span>`;
  // 第三行：这条资源装到哪个官方目录（大字已经是系列全名，这里不重复系列）
  let dirTxt = libDirsTxt(it);
  if (S.libDir && dirTxt === "models/" + S.libDir) dirTxt = "";
  const dirLine = dirTxt ? `<div class="xhmb-card-path">${ESC(dirTxt)}</div>` : "";
  if (S.view === "list") {
    el.innerHTML = `
      ${monoBox}
      <div class="xhmb-row-main">
        <div class="xhmb-card-name" title="${ESC(it.name)}">${ESC(it.name)}</div>
        <div class="xhmb-card-sub">${ESC(kindTxt)} · ${stat}</div>
        ${dirLine}
      </div>
      <div class="xhmb-row-tags"></div>
      <div class="xhmb-row-note">${it.note ? xhIconHTML("pencil", { size: 12, color: "current" }) + " " + ESC(shortName(it.note, 40)) : ""}</div>`;
    return el;
  }
  el.innerHTML = `
    ${monoBox}
    <div class="xhmb-card-body">
      <div class="xhmb-card-name" title="${ESC(it.name)}">${ESC(shortName(it.name))}</div>
      <div class="xhmb-card-sub">${ESC(kindTxt)}</div>
      ${dirLine}
      <div class="xhmb-libstat">${stat}</div>
    </div>`;
  return el;
}

function renderLibBatch() {
  if (S.libRendered >= S.libShown.length) return;
  const next = S.libShown.slice(S.libRendered, S.libRendered + BATCH);
  const frag = document.createDocumentFragment();
  for (const it of next) frag.appendChild(libCard(it));
  grid.appendChild(frag);
  S.libRendered += next.length;
  if (grid.scrollHeight <= grid.clientHeight && S.libRendered < S.libShown.length) renderLibBatch();
}

function openLibDetail(id) {
  const it = S.libItems.find((x) => x.id === id);
  if (!it) return;
  S.libId = id;
  S.detailMode = "lib";
  const filesHtml = (it.files || []).map((f) => `
    <div class="xhmb-file-row">
      <span class="xhmb-file-flag${f.installed ? " ok" : ""}">${f.installed ? "已装" : "未装"}</span>
      <span class="xhmb-file-name" title="${ESC(f.key)}">${ESC(f.name)}</span>
      <span class="xhmb-file-size">${fmtSize(f.size)}</span>
    </div>`).join("");
  detailEl.innerHTML = `
    <div class="xhmb-d-head">
      <span>资源库 · ${it.kind === "pack" ? "整包" : "单文件"}</span>
      <button class="xhmb-x" data-act="dclose">${xhIconHTML("x", { size: 16, color: "current" })}</button>
    </div>
    <div class="xhmb-d-body">
      <div class="xhmb-d-left">
        <div class="xhmb-mono-big" style="font-size:${glyphSize(seriesName(it), false) + 8}px;letter-spacing:0;text-align:center;padding:10px;line-height:1.18;white-space:normal;word-break:break-word;background:linear-gradient(135deg,${typeColor(libMainType(it))}3d,#1b2025);color:${typeColor(libMainType(it))}">${ESC(seriesName(it))}</div>
        <div class="xhmb-d-dim">${it.total} 个文件 · 已装 ${it.inst}</div>
      </div>
      <div class="xhmb-d-right">
        <div class="xhmb-row"><label>资源名</label><b title="${ESC(it.name)}">${ESC(it.name)}</b>
          <button class="xhmb-mini" data-act="copylibname">复制</button></div>
        <div class="xhmb-row"><label>分组</label><span>${ESC(it.group_name)}</span></div>
        <div class="xhmb-row"><label>文件</label><span>${it.total} 个 · 已装 ${it.inst} · 未装 ${it.miss}</span></div>
        <div class="xhmb-field">
          <label>网盘链接<span class="xhmb-tip">夸克网盘 · 「打开」去网盘，「复制」发给别人</span></label>
          <div class="xhmb-urlrow">
            <input class="xhmb-url" readonly spellcheck="false" value="${ESC(it.url)}">
            <button class="xhmb-mini" data-act="openurl">打开</button>
            <button class="xhmb-mini" data-act="copyurl">复制</button>
          </div>
        </div>
        ${it.code ? `<div class="xhmb-row"><label>提取码</label><span>${ESC(it.code)}</span></div>` : ""}
        <div class="xhmb-download">
          <div class="xhmb-dl-title">${xhIconHTML("download", { size: 15, color: "current" })} 下载到模型目录</div>
          <div class="xhmb-dl-steps">
            <span>① 复制并打开网盘</span><span>② 下载到暂存夹</span><span>③ 一键归位</span>
          </div>
          <button class="xhmb-dl-main" data-act="dlopen">${xhIconHTML("external-link", { size: 14, color: "current" })} 复制网盘链接并打开</button>
          <div class="xhmb-dl-stage">
            <label>下载暂存夹<span class="xhmb-tip">网盘下载到哪 · 改一次以后都用它</span></label>
            <div class="xhmb-urlrow">
              <input class="xhmb-url xhmb-stage-input" spellcheck="false" placeholder="点右边「取默认」或粘贴文件夹路径" value="${ESC(S.staging)}">
              <button class="xhmb-mini" data-act="stagedefault" title="填入系统下载目录">取默认</button>
              <button class="xhmb-mini" data-act="stageopen" title="在资源管理器打开暂存夹">打开</button>
            </div>
          </div>
          <button class="xhmb-dl-import" data-act="doimport">${xhIconHTML("move-right", { size: 14, color: "current" })} 一键归位到 models</button>
          <div class="xhmb-dl-hint">下载好后点「一键归位」：按本条 ${it.total} 个文件的清单，自动移进 models 对应目录。已装的会跳过，不会覆盖。</div>
        </div>
        ${it.note ? `<div class="xhmb-row"><label>说明</label><span class="xhmb-mini-txt">${ESC(it.note)}</span></div>` : ""}
        <div class="xhmb-field">
          <label>包含的模型<span class="xhmb-tip">按本地扫盘结果标出已装 / 未装</span></label>
          <div class="xhmb-filelist">${filesHtml || `<div class="xhmb-card-sub">（没有关联文件）</div>`}</div>
        </div>
      </div>
    </div>`;
  detailEl.style.display = "block";
}

// 详情页当前看的是哪条资源
function currentUrl() {
  if (S.detailMode === "lib") {
    const lib = S.libItems.find((x) => x.id === S.libId);
    return lib ? lib.url : "";
  }
  const it = S.items.find((x) => x.key === S.detailKey);
  return it ? it.url : "";
}

// ---------------- 详情 -----------------------------

function openDetail(key) {
  const it = S.items.find((x) => x.key === key);
  if (!it) return;
  S.detailKey = key;
  S.detailMode = "local";
  const img = it.has_img
    ? `<img src="${API}/image?key=${encodeURIComponent(key)}&v=${it.img_v}" alt="">`
    : `<div class="xhmb-d-noimg">还没有预览图<br><span>点这里选一张，或把图拖进来</span></div>`;
  // 已装好的模型不再挂下载链接，改成指向资源库里的出处
  const libRow = it.lib
    ? `<div class="xhmb-row"><label>来源</label><span class="xhmb-mini-txt">资源库 · ${ESC(it.lib_name || "已收录")}</span>
        <button class="xhmb-mini" data-act="openlib" data-id="${ESC(it.lib)}">查看</button></div>`
    : "";

  detailEl.innerHTML = `
    <div class="xhmb-d-head">
      <span>模型详情</span>
      <button class="xhmb-x" data-act="dclose">${xhIconHTML("x", { size: 16, color: "current" })}</button>
    </div>
    <div class="xhmb-d-body">
      <div class="xhmb-d-left">
        <div class="xhmb-d-img">
          ${img}
          <div class="xhmb-d-hint">点击更换 · 或拖入图片</div>
        </div>
        <div class="xhmb-d-dim">预览图只存本地，不动模型文件</div>
      </div>
      <div class="xhmb-d-right">
        <div class="xhmb-row"><label>文件名</label><b class="xhmb-fname" title="${ESC(it.name)}">${ESC(it.name)}</b>
          <button class="xhmb-mini" data-act="copy">复制</button></div>
        <div class="xhmb-row"><label>类型</label><span>${ESC(typeTxt(it))}</span></div>
        <div class="xhmb-row"><label>大小</label><span>${fmtSize(it.size)}</span></div>
        <div class="xhmb-row"><label>修改时间</label><span>${fmtTime(it.mtime)}</span></div>
        <div class="xhmb-row"><label>相对路径</label><span class="xhmb-mini-txt">${ESC(it.rel)}</span></div>
        <div class="xhmb-row"><label>绝对路径</label><span class="xhmb-mini-txt">${ESC(it.abs || "-")}</span>
          <button class="xhmb-mini" data-act="copyabs">复制</button></div>
        <div class="xhmb-row xhmb-row-loc"><label>位置</label>
          <button class="xhmb-mini xhmb-locbtn" data-act="opendir" title="打开这个模型所在的文件夹">${xhIconHTML("folder-open", { size: 14, color: "current" })} 打开文件夹</button>
          <button class="xhmb-mini xhmb-locbtn" data-act="reveal" title="在资源管理器里选中这个模型文件">${xhIconHTML("map-pin", { size: 14, color: "current" })} 定位文件</button>
        </div>
        ${libRow}
        <div class="xhmb-field">
          <label>标签<span class="xhmb-tip">逗号分隔，最多 12 个 · 点标签可跳转搜索</span></label>
          <input class="xhmb-tags" spellcheck="false" placeholder="人像, 二次元, 8G可用" value="${ESC((it.tags || []).join(", "))}">
          <div class="xhmb-chips xhmb-d-chips">${(it.tags || []).map((t) => `<span class="xhmb-chip clickable" data-act="tag" data-tag="${ESC(t)}">${ESC(t)}</span>`).join("")}</div>
        </div>
        <div class="xhmb-field">
          <label>备注</label>
          <textarea class="xhmb-note" rows="6" spellcheck="false" placeholder="权重建议、适用底模、踩坑记录…">${ESC(it.note || "")}</textarea>
        </div>
        <div class="xhmb-d-actions">
          <button class="xhmb-btn primary" data-act="save">保存标注</button>
          <button class="xhmb-btn" data-act="dfav">${it.fav ? "★ 已收藏" : "☆ 收藏"}</button>
          <button class="xhmb-btn danger" data-act="reset">清空标注</button>
        </div>
      </div>
    </div>`;
  detailEl.style.display = "block";

  const box = detailEl.querySelector(".xhmb-d-img");
  box.addEventListener("click", () => fileInput.click());
  box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("drag"); });
  box.addEventListener("dragleave", () => box.classList.remove("drag"));
  box.addEventListener("drop", (e) => {
    e.preventDefault();
    box.classList.remove("drag");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) uploadImage(f);
  });

  const tagsInput = detailEl.querySelector(".xhmb-tags");
  tagsInput.addEventListener("blur", () => {
    const cur = normTags(it.tags || []);
    const next = normTags(tagsInput.value.replace(/，/g, ",").split(","));
    if (cur.join("|") !== next.join("|")) saveMeta({ tags: next }, true);
  });

  const noteInput = detailEl.querySelector(".xhmb-note");
  noteInput.addEventListener("blur", () => {
    if ((it.note || "") !== noteInput.value) saveMeta({ note: noteInput.value }, true);
  });
}

function normTags(arr) {
  const out = [];
  for (let t of arr) {
    t = String(t || "").trim();
    if (t && out.indexOf(t) === -1) out.push(t);
  }
  return out.slice(0, 12);
}

function closeDetail() {
  if (!detailEl) return;
  detailEl.style.display = "none";
  detailEl.innerHTML = "";
  S.detailKey = "";
  S.libId = "";
  S.detailMode = "";
}

// 只要筛选条件变了（切目录、切页签、搜词、清筛选、路径下拉），
// 详情里那个模型就可能已经不在当前结果里了，一律关掉。
function dropDetail() {
  if (detailEl && detailEl.style.display === "block") closeDetail();
}

async function saveMeta(patch, quiet) {
  if (!S.detailKey) return;
  try {
    const d = await req("/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ key: S.detailKey }, patch)),
    });
    const it = S.items.find((x) => x.key === S.detailKey);
    if (it && d.item) Object.assign(it, d.item);
    renderSide();
    refreshCard(S.detailKey);
    if (!quiet) toast("已保存");
  } catch (e) {
    toast("保存失败：" + e.message, true);
  }
}

async function uploadImage(file) {
  if (!S.detailKey) return;
  if (!file.type || !/^image\//.test(file.type)) { toast("只接受图片文件", true); return; }
  if (file.size > 10 * 1024 * 1024) { toast("图片超过 10MB", true); return; }
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) || [".png"])[0].toLowerCase();
  try {
    const res = await fetch(
      `${API}/image?key=${encodeURIComponent(S.detailKey)}&ext=${encodeURIComponent(ext)}`,
      { method: "POST", body: file }
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.ok === false) throw new Error(d.error || "上传失败");
    const it = S.items.find((x) => x.key === S.detailKey);
    if (it) { it.has_img = true; it.img_v = d.img_v; refreshCard(it.key); }
    if (S.detailKey) openDetail(S.detailKey);
    toast("预览图已保存");
  } catch (e) {
    toast("上传失败：" + e.message, true);
  }
}

async function copyText(t) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(t);
    else {
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("已复制");
  } catch (_) {
    toast("复制失败，手动选一下", true);
  }
}

// ---------------- 下载 / 一键归位 -----------------------------

function stageInput() {
  const inp = detailEl.querySelector(".xhmb-stage-input");
  return inp ? inp.value.trim() : S.staging;
}

function saveStaging(path) {
  S.staging = path || "";
  try {
    if (S.staging) localStorage.setItem(STAGING_KEY, S.staging);
    else localStorage.removeItem(STAGING_KEY);
  } catch (_) { /* 隐私模式下写不了，忽略 */ }
}

// 复制网盘链接（带提取码）并打开夸克页面。浏览器不能写本地指定目录，
// 所以这一步只负责把链接准备好 + 打开，落盘交给网盘，归位交给后端。
async function dlOpen() {
  const lib = S.libItems.find((x) => x.id === S.libId);
  if (!lib || !lib.url) { toast("这条资源没有网盘链接", true); return; }
  const code = (lib.code || "").trim();
  const text = code ? `${lib.url} 提取码: ${code}` : lib.url;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(code ? "链接和提取码已复制，去网盘下载" : "链接已复制，去网盘下载");
  } catch (_) {
    toast("复制失败，手动选一下链接", true);
  }
  window.open(lib.url, "_blank", "noopener, noreferrer");
}

async function stageDefault() {
  try {
    const r = await req("/staging");
    const inp = detailEl.querySelector(".xhmb-stage-input");
    if (inp) inp.value = r.staging || "";
    saveStaging(r.staging || "");
    toast("已填入系统下载目录");
  } catch (e) {
    toast("取默认值失败：" + e.message, true);
  }
}

async function stageOpen() {
  const staging = stageInput();
  if (!staging) { toast("先填一个暂存夹路径", true); return; }
  saveStaging(staging);
  try {
    await req("/openstaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staging }),
    });
  } catch (e) {
    toast("打开失败：" + e.message, true);
  }
}

function showImportResult(r) {
  const rows = (r.results || []).map((f) => {
    const map = {
      moved: ["已归位", "ok"],
      exists: ["已装·跳过", "skip"],
      missing: ["暂存夹里没找到", "miss"],
      skip: ["跳过", "skip"],
    };
    const [label, cls] = map[f.status] || ["跳过", "skip"];
    const why = f.why ? `（${f.why}）` : f.dest ? `→ ${f.dest}` : "";
    return `<div class="xhmb-ir-row"><span class="xhmb-ir-flag ${cls}">${label}</span><span class="xhmb-ir-name" title="${ESC(f.dest || f.name)}">${ESC(f.name)}</span><span class="xhmb-ir-why" title="${ESC(why)}">${ESC(why)}</span></div>`;
  }).join("");
  let box = document.getElementById("xhmb-import-result");
  if (!box) {
    box = document.createElement("div");
    box.id = "xhmb-import-result";
    box.className = "xhmb-import-result";
    const anchor = detailEl.querySelector(".xhmb-dl-import");
    if (anchor) anchor.insertAdjacentElement("afterend", box);
    else return;
  }
  box.innerHTML = `
    <div class="xhmb-ir-head">归位结果：移进 ${r.moved || 0} / ${r.total || 0} 个
      <button class="xhmb-mini" data-act="irclear">收起</button></div>
    <div class="xhmb-ir-list">${rows || "（没有文件）"}</div>`;
}

async function doImport() {
  const lib = S.libItems.find((x) => x.id === S.libId);
  if (!lib) { toast("找不到这条资源", true); return; }
  const staging = stageInput();
  saveStaging(staging);              // 记住用户这次填的路径
  const btn = detailEl.querySelector('[data-act="doimport"]');
  if (btn) { btn.disabled = true; btn.textContent = "正在归位…"; }
  try {
    const r = await req("/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lib.id, staging }),
    });
    if (r.ok === false) { toast(r.error || "归位失败", true); return; }
    // 归位后本地台账变了，刷新本地列表和这条资源的已装标记
    await loadList();
    const fresh = await req("/library");
    S.libItems = fresh.items || [];
    S.libGroups = fresh.groups || [];
    openLibDetail(lib.id);          // 重渲染（会清掉旧结果框）
    showImportResult(r);            // 重渲染后再插入结果
    toast(r.moved ? `归位成功 ${r.moved} 个文件` : "没有可归位的文件");
  } catch (e) {
    toast("归位失败：" + e.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = xhIconHTML("move-right", { size: 14, color: "current" }) + " 一键归位到 models";
    }
  }
}

// ---------------- 事件 -----------------------------

function onClick(e) {
  const actEl = e.target.closest("[data-act]");
  if (actEl) {
    const act = actEl.dataset.act;
    if (act === "toggle") {
      const id = actEl.dataset.id;
      if (S.expanded.has(id)) S.expanded.delete(id);
      else S.expanded.add(id);
      renderSide();
      return;
    }
    if (act === "close") { closeBoard(); return; }
    if (act === "dclose") { closeDetail(); return; }
    if (act === "mode") { setMode(actEl.dataset.mode || "local"); return; }
    if (act === "openlib") { openLibDetail(actEl.dataset.id || ""); return; }
    if (act === "copylibname") {
      const lib = S.libItems.find((x) => x.id === S.libId);
      if (lib) copyText(lib.name);
      return;
    }
    if (act === "libcrumb") {
      dropDetail();
      S.libGroup = actEl.dataset.libgroup || "";
      S.libDir = actEl.dataset.libdir || "";
      fillPath();
      renderLibSide();
      renderLibCrumb();
      resortLib();
      return;
    }
    if (act === "favonly") {
      dropDetail();
      S.fav = !S.fav;
      favBtn.classList.toggle("on", S.fav);
      renderCrumb();
      loadList();
      return;
    }
    if (act === "view") {
      S.view = S.view === "grid" ? "list" : "grid";
      actEl.innerHTML = viewBtnHTML(S.view);
      grid.classList.toggle("listmode", S.view === "list");
      if (S.mode === "lib") resortLib();
      else resort();
      return;
    }
    if (act === "rescan") { rescan(); return; }
    if (act === "expandall") {
      for (const t of S.types) {
        if (!t.count) continue;
        S.expanded.add("T::" + t.key);
        const walk = (list) => {
          for (const d of list) {
            S.expanded.add(t.key + "::" + d.path);
            walk(d.dirs || []);
          }
        };
        walk(dirsFor(t.key));
      }
      if ((S.extra || []).length) S.expanded.add("G::extra");
      for (const e of S.extra) {
        S.expanded.add("T::" + e.key);
        const walk = (list) => {
          for (const d of list) {
            S.expanded.add(e.key + "::" + d.path);
            walk(d.dirs || []);
          }
        };
        walk(dirsFor(e.key));
      }
      renderSide();
      return;
    }
    if (act === "collapseall") { S.expanded.clear(); renderSide(); return; }
    if (act === "crumb") {
      dropDetail();
      S.type = actEl.dataset.type || "";
      S.dir = actEl.dataset.dir || "";
      fillPath();
      renderSide();
      renderCrumb();
      loadList();
      return;
    }
    if (act === "clearcrumb") {
      dropDetail();
      S.type = ""; S.dir = ""; S.q = ""; S.fav = false;
      S.libGroup = ""; S.libDir = "";
      searchEl.value = "";
      favBtn.classList.remove("on");
      if (S.mode === "lib") {
        fillPath();
        renderLibSide();
        renderLibCrumb();
        resortLib();
      } else {
        fillPath();
        renderSide();
        renderCrumb();
        loadList();
      }
      return;
    }
    if (act === "save") { doSave(); return; }
    if (act === "reset") { doReset(); return; }
    if (act === "dfav") {
      const it = S.items.find((x) => x.key === S.detailKey);
      if (it) saveMeta({ fav: !it.fav });
      return;
    }
    if (act === "copy") {
      const it = S.items.find((x) => x.key === S.detailKey);
      if (it) copyText(it.name);
      return;
    }
    if (act === "copyabs") {
      const it = S.items.find((x) => x.key === S.detailKey);
      if (it) copyText(it.abs || it.rel);
      return;
    }
    if (act === "opendir" || act === "reveal") { revealIt(act === "reveal"); return; }
    if (act === "renpen") {
      openRenameDialog(actEl.dataset.type || "", actEl.dataset.dir || "");
      return;                                  // 别继续走到「点行就筛选」那一步
    }
    if (act === "renok") { submitRename(); return; }
    if (act === "rencancel") { closeRenameDialog(); return; }
    if (act === "openurl") {
      const url = currentUrl();
      if (url) window.open(url, "_blank", "noopener, noreferrer");
      return;
    }
    if (act === "copyurl") {
      const url = currentUrl();
      if (url) copyText(url);
      return;
    }
    if (act === "dlopen") { dlOpen(); return; }
    if (act === "stagedefault") { stageDefault(); return; }
    if (act === "stageopen") { stageOpen(); return; }
    if (act === "doimport") { doImport(); return; }
    if (act === "irclear") {
      const box = document.getElementById("xhmb-import-result");
      if (box) box.remove();
      return;
    }
    if (act === "tag") {
      const tag = actEl.dataset.tag || "";
      if (!tag) return;
      dropDetail();
      S.q = tag;
      searchEl.value = tag;
      renderCrumb();
      loadList();
      return;
    }
  }

  const tr = e.target.closest(".xhmb-tr");
  if (tr) {
    if (S.mode === "lib") {
      if (tr.dataset.kind === "libgroup") {
        S.libSeriesOpen = !S.libSeriesOpen;
        renderLibSide();
        return;
      }
      S.libDir = tr.dataset.libdir || "";
      S.libGroup = tr.dataset.libgroup || "";
      dropDetail();
      fillPath();
      renderLibSide();
      renderLibCrumb();
      resortLib();
      return;
    }
    if (tr.dataset.kind === "group") {
      const id = "G::extra";
      if (S.expanded.has(id)) S.expanded.delete(id);
      else S.expanded.add(id);
      renderSide();
      return;
    }
    S.type = tr.dataset.type || "";
    S.dir = tr.dataset.dir || "";
    dropDetail();
    fillPath();
    renderSide();
    renderCrumb();
    loadList();
    return;
  }

  const cardEl = e.target.closest(".xhmb-card");
  if (cardEl) {
    if (cardEl.dataset.lib) openLibDetail(cardEl.dataset.lib);
    else openDetail(cardEl.dataset.key);
  }
}

// 打开所在文件夹 / 在资源管理器里定位文件。后端会把窗口拽到 ComfyUI 前面。
async function revealIt(select) {
  const it = S.items.find((x) => x.key === S.detailKey);
  if (!it) return;
  try {
    await req(select ? "/reveal" : "/openfolder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: it.key }),
    });
    toast(select ? "已在资源管理器里选中并滚到它：" + it.name : "已打开文件夹：" + (it.dirrel || "模型目录"));
  } catch (e) {
    toast("打不开：" + e.message, true);
  }
}

// ---------------- 文件夹改名 ------------------------

let renamer = null;

function closeRenameDialog() {
  const el = document.getElementById("xhmb-dlg");
  if (el) el.remove();
  renamer = null;
}

function openRenameDialog(type, rel) {
  closeRenameDialog();
  if (!type || !rel) return;
  const label = rel.split("/").pop();
  const wrap = document.createElement("div");
  wrap.id = "xhmb-dlg";
  wrap.className = "xhmb-dlg";
  wrap.innerHTML = `
    <div class="xhmb-dlg-box">
      <div class="xhmb-dlg-h">改文件夹名</div>
      <div class="xhmb-dlg-sub">${ESC(type)} / ${ESC(rel)}</div>
      <input class="xhmb-dlg-in" type="text" spellcheck="false" autocomplete="off" value="${ESC(label)}">
      <div class="xhmb-dlg-tip">会真的改磁盘上的文件夹名。这个目录下所有模型的标签、备注、收藏、预览图会一起迁移过去。ComfyUI 正在读里面的模型时可能改不动，关掉加载再试。</div>
      <div class="xhmb-dlg-err"></div>
      <div class="xhmb-dlg-f">
        <button class="xhmb-btn xhmb-dlg-ok" data-act="renok">确定</button>
        <button class="xhmb-btn" data-act="rencancel">取消</button>
      </div>
    </div>`;
  mask.appendChild(wrap);
  renamer = { type, rel };
  const inp = wrap.querySelector(".xhmb-dlg-in");
  inp.focus();
  inp.select();
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeRenameDialog();
    }
    e.stopPropagation();
  });
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) {          // 点外面那层黑幕才关，点对话框本身不关
      closeRenameDialog();
      e.stopPropagation();
    }
  });
}

async function submitRename() {
  const dlg = document.getElementById("xhmb-dlg");
  if (!dlg || !renamer) return;
  const inp = dlg.querySelector(".xhmb-dlg-in");
  const errEl = dlg.querySelector(".xhmb-dlg-err");
  const okBtn = dlg.querySelector('[data-act="renok"]');
  const name = (inp.value || "").trim();
  const oldName = renamer.rel.split("/").pop();
  errEl.textContent = "";
  if (!name) { errEl.textContent = "名字不能空着"; return; }
  if (name === oldName) { errEl.textContent = "名字没变"; return; }
  okBtn.disabled = true;
  try {
    const r = await req("/renamefolder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: renamer.type, rel: renamer.rel, name }),
    });
    const oldRel = renamer.rel;
    const newRel = r.new.slice(renamer.type.length + 1);
    // 目录改名了，当前筛选路径和展开状态都要跟着挪，否则列表瞬间空
    if (S.dir === oldRel) S.dir = newRel;
    else if (S.dir.startsWith(oldRel + "/")) S.dir = newRel + S.dir.slice(oldRel.length);
    const oldId = renamer.type + "::" + oldRel;
    if (S.expanded.has(oldId)) {
      S.expanded.delete(oldId);
      S.expanded.add(renamer.type + "::" + newRel);
    }
    toast(`已改名：${oldName} → ${name}，跟着迁走 ${r.moved} 条标注`);
    closeRenameDialog();
    await loadTypes();
    await loadList();
    renderCrumb();
  } catch (e) {
    errEl.textContent = e.message || "改名失败";
    okBtn.disabled = false;
  }
}

function doSave() {
  if (!S.detailKey) return;
  const tagsInput = detailEl.querySelector(".xhmb-tags");
  const noteInput = detailEl.querySelector(".xhmb-note");
  saveMeta({
    tags: normTags((tagsInput.value || "").replace(/，/g, ",").split(",")),
    note: noteInput.value || "",
  });
}

function doReset() {
  if (!S.detailKey) return;
  saveMeta({ reset: true });
  const tagsInput = detailEl.querySelector(".xhmb-tags");
  const noteInput = detailEl.querySelector(".xhmb-note");
  if (tagsInput) tagsInput.value = "";
  if (noteInput) noteInput.value = "";
  openDetail(S.detailKey);
}

async function rescan() {
  toast("正在扫描模型目录…");
  try {
    const d = await req("/rescan", { method: "POST" });
    toast(`扫描完成，共 ${d.total} 个模型`);
    await loadTypes();
    if (S.mode === "lib") await loadLibrary();
    else await loadList();
  } catch (e) {
    toast("扫描失败：" + e.message, true);
  }
}

// ---------------- 开关 -----------------------------

export async function openBoard(opts) {
  build();
  S.open = true;
  mask.style.display = "flex";
  for (const b of mask.querySelectorAll('[data-act="mode"]')) {
    b.classList.toggle("on", b.dataset.mode === S.mode);
  }
  if (opts && opts.rescan) {
    await rescan();
  } else {
    try {
      if (S.mode === "lib") await loadLibrary();
      else {
        await loadTypes();
        await loadList();
      }
    } catch (e) {
      toast("读取模型数据失败：" + e.message, true);
    }
  }
}

export function closeBoard() {
  if (!mask) return;
  closeDetail();
  mask.style.display = "none";
  S.open = false;
}
