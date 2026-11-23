import { xhScIconHTML, setXhScBtnLabel } from "./viewer_core.js";
import { T, onUiLang } from "./i18n_ui.js";
// 下拉契约值显示中文（存档值仍是英文/既定值，函数不进工作流 JSON）
import { installSceneCutComboLabels, paintSceneCutCombo } from "./combo_labels.js";
// SceneCut frontend:
//   - a server-side file picker and a playable preview for "SceneCut Load Video (Path)"
//   - the "SceneCut Viewer" node (timeline, cut fixes, selection, save buttons)
//   - the "SceneCut Selected Scenes" node (follows the viewer's selection; opens in its own tab)
//
// The browser's own file dialog never reveals a file's real path, so picking a video with it
// would mean uploading (copying) the whole file into ComfyUI. The picker lists the folders of
// the machine ComfyUI runs on instead and fills in the path; nothing is copied.

import { XH_SceneCutViewer } from "./viewer_core.js";
import { XH_SceneCutSelected, channelName, openSelectedExport } from "./selected_core.js";
import { openExportDialog, scopesFor } from "./export_dialog.js";

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;

const LAST_DIR_KEY = "XH.SceneCut.browse.lastDir";
const VIEW_KEY = "XH.SceneCut.browse.view";
const STYLE_ID = "scenecut-browse-style";

const CSS = `
.sc-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center; }
.sc-dialog { width: min(820px, 94vw); height: min(600px, 88vh); display: flex; flex-direction: column;
  background: var(--comfy-menu-bg, #202020); color: var(--fg-color, #ddd);
  border: 1px solid var(--border-color, #444); border-radius: 10px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.5); font: 13px/1.4 var(--font-sans, ui-sans-serif, system-ui, sans-serif); }
.sc-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid var(--border-color, #444); }
.sc-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; }
.sc-bar { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border-color, #444); }
.sc-bar input { flex: 1; min-width: 0; }
.sc-dialog input[type=text] { background: var(--comfy-input-bg, #2a2a2a); color: var(--input-text, #eee);
  border: 1px solid var(--border-color, #444); border-radius: 6px; padding: 5px 8px; font: inherit; }
.sc-dialog button { background: var(--comfy-input-bg, #2a2a2a); color: var(--input-text, #eee);
  border: 1px solid var(--border-color, #444); border-radius: 6px; padding: 5px 12px; font: inherit;
  cursor: pointer; }
.sc-dialog button:hover:not(:disabled) { filter: brightness(1.25); }
.sc-dialog button:disabled { opacity: .45; cursor: default; }
.sc-dialog button.sc-primary { background: var(--xh-rest, #2f6fd6); border-color: var(--xh-rest-bd, #2f6fd6); color: var(--xh-on-rest, #fff); }
.sc-main { flex: 1; display: flex; min-height: 0; }
.sc-places { width: 150px; flex: none; overflow-y: auto; padding: 6px;
  border-right: 1px solid var(--border-color, #444); }
.sc-place { padding: 5px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; color: var(--descrip-text, #aaa); }
.sc-place:hover { background: rgba(255,255,255,.07); color: var(--fg-color, #ddd); }
.sc-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.sc-row { display: grid; grid-template-columns: 22px 1fr 84px 92px; align-items: center; gap: 6px;
  padding: 4px 12px; cursor: pointer; user-select: none; }
.sc-row:hover { background: rgba(255,255,255,.06); }
.sc-row.sc-sel { background: var(--xh-overlay, rgba(47,111,214,.35)); }
.sc-row .sc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-row .sc-meta { color: var(--descrip-text, #999); font-size: 12px; text-align: right;
  font-variant-numeric: tabular-nums; }
.sc-icon { width: 16px; height: 16px; opacity: .8; }
.sc-msg { padding: 16px; color: var(--descrip-text, #999); }
.sc-msg.sc-err { color: #e57373; }
.sc-foot { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-top: 1px solid var(--border-color, #444); }
.sc-foot label { display: flex; align-items: center; gap: 4px; color: var(--descrip-text, #aaa); }
.sc-foot .sc-chosen { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; color: var(--descrip-text, #aaa); text-align: right; }
.sc-note { padding: 6px 12px; font-size: 12px; color: #e0b050;
  border-bottom: 1px solid var(--border-color, #444); }
.sc-grid { flex: 1; overflow-y: auto; padding: 10px; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; align-content: start; }
.sc-card { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 8px;
  border: 1px solid transparent; cursor: pointer; user-select: none; min-width: 0; }
.sc-card:hover { background: rgba(255,255,255,.06); }
.sc-card.sc-sel { background: var(--xh-overlay, rgba(47,111,214,.35));
  border-color: var(--xh-rest, #2f6fd6); }
.sc-thumb { width: 100%; aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; position: relative;
  background: var(--comfy-input-bg, #2a2a2a); display: flex; align-items: center; justify-content: center; }
.sc-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.sc-card-name { font-size: 12px; line-height: 1.3; overflow: hidden; word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.sc-card-meta { font-size: 11px; color: var(--descrip-text, #999); font-variant-numeric: tabular-nums; }
`;

const ICONS = {
  folder: xhScIconHTML("文件夹", 15),
  video: xhScIconHTML("视频", 15),
  file: xhScIconHTML("文件", 15),
  folderBig: xhScIconHTML("文件夹", 34),
  videoBig: xhScIconHTML("视频", 34),
  fileBig: xhScIconHTML("文件", 34),
};

function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function fmtSize(n) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

function fmtDate(t) {
  const d = new Date(t * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function joinPath(dir, name, sep) {
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

async function fetchListing(path, opts) {
  const q = new URLSearchParams({ path: path || "", all: opts.all ? "1" : "0", hidden: opts.hidden ? "1" : "0" });
  const r = await api.fetchApi(`/xh_scenecut/browse?${q}`);
  const data = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    document.head.append(h("style", { id: STYLE_ID }, CSS));
  }
}

/** Open the picker. Resolves to the chosen absolute path, or null when cancelled. */
function pickVideo(start) {
  ensureStyle();
  return new Promise((resolve) => {
    const opts = { all: false, hidden: false };
    let current = null;      // last listing
    let selected = null;     // file name selected in `current`
    let view = localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";

    const pathInput = h("input", { type: "text", spellcheck: "false", placeholder: T("folderPath") });
    const filterInput = h("input", { type: "text", spellcheck: "false", placeholder: T("filterFiles"), style: "width:140px" });
    const upBtn = h("button", { title: T("parentFolder") }, T("up"));
    const viewBtn = h("button", { title: T("gridTip") });
    const paintViewBtn = () => {
      setXhScBtnLabel(viewBtn, view === "grid" ? "列表" : "网格视图",
        view === "grid" ? T("listView") : T("gridView"));
      viewBtn.title = view === "grid" ? T("listTip") : T("gridTip");
    };
    paintViewBtn();
    const list = h("div", { class: "sc-list", tabindex: "0" });
    const grid = h("div", { class: "sc-grid", tabindex: "0" });
    list.style.display = view === "list" ? "" : "none";
    grid.style.display = view === "grid" ? "" : "none";
    const places = h("div", { class: "sc-places" });
    const note = h("div", { class: "sc-note", style: "display:none" });
    const chosen = h("div", { class: "sc-chosen" });
    const selectBtn = h("button", { class: "sc-primary", disabled: "" }, T("selectFile"));
    const allBox = h("input", { type: "checkbox" });
    const hiddenBox = h("input", { type: "checkbox" });

    const close = (value) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const confirm = () => {
      if (!current || !selected) return;
      localStorage.setItem(LAST_DIR_KEY, current.path);
      close(joinPath(current.path, selected, current.sep));
    };

    const setSelected = (name) => {
      selected = name;
      for (const row of list.querySelectorAll(".sc-row")) {
        row.classList.toggle("sc-sel", row.dataset.file === name);
      }
      for (const card of grid.querySelectorAll(".sc-card")) {
        card.classList.toggle("sc-sel", card.dataset.file === name);
      }
      chosen.textContent = name || "";
      if (name) selectBtn.removeAttribute("disabled"); else selectBtn.setAttribute("disabled", "");
    };

    const renderPlaces = (items) => {
      places.replaceChildren(...(items || []).map((p) =>
        h("div", { class: "sc-place", title: p.path, onclick: () => go(p.path) }, p.name)));
    };

    const render = () => {
      const f = filterInput.value.trim().toLowerCase();
      const keep = (n) => !f || n.toLowerCase().includes(f);
      const rows = [], cards = [];
      for (const d of current.dirs.filter(keep)) {
        const open = () => go(joinPath(current.path, d, current.sep));
        rows.push(h("div", { class: "sc-row", title: d, onclick: open },
          h("span", { html: ICONS.folder }), h("span", { class: "sc-name" }, d), h("span"), h("span")));
        cards.push(h("div", { class: "sc-card", title: d, onclick: open },
          h("div", { class: "sc-thumb" }, h("span", { html: ICONS.folderBig })),
          h("div", { class: "sc-card-name" }, d)));
      }
      for (const file of current.files.filter((x) => keep(x.name))) {
        const full = joinPath(current.path, file.name, current.sep);
        const pick = () => setSelected(file.name);
        const open = () => { setSelected(file.name); confirm(); };
        const row = h("div", {
          class: "sc-row", title: file.name,
          onclick: pick,
          ondblclick: open,
        },
          h("span", { html: file.video ? ICONS.video : ICONS.file }),
          h("span", { class: "sc-name" }, file.name),
          h("span", { class: "sc-meta" }, fmtSize(file.size)),
          h("span", { class: "sc-meta" }, fmtDate(file.mtime)));
        row.dataset.file = file.name;
        rows.push(row);

        const thumb = h("div", { class: "sc-thumb" });
        if (file.video) {
          // 图标先垫底：缩略图还没加载好 / 加载失败时都能看到东西，不会是一块空白
          thumb.append(h("span", { html: ICONS.videoBig }));
          const img = h("img", {
            src: api.apiURL(`/xh_scenecut/thumb?${new URLSearchParams({ path: full })}`),
            loading: "lazy", decoding: "async", alt: "",
          });
          img.addEventListener("error", () => img.remove());  // 坏文件退回图标，不弹错
          thumb.append(img);
        } else {
          thumb.append(h("span", { html: ICONS.fileBig }));
        }
        const card = h("div", { class: "sc-card", title: file.name, onclick: pick, ondblclick: open },
          thumb,
          h("div", { class: "sc-card-name" }, file.name),
          h("div", { class: "sc-card-meta" }, `${fmtSize(file.size)} · ${fmtDate(file.mtime)}`));
        card.dataset.file = file.name;
        cards.push(card);
      }
      if (!rows.length) {
        const msg = f ? "没有符合筛选条件的内容。" :
          (opts.all ? "这个文件夹是空的。" : "这里没有文件夹或视频。");
        rows.push(h("div", { class: "sc-msg" }, msg));
        cards.push(h("div", { class: "sc-msg" }, msg));
      }
      if (current.truncated) {
        const msg = "只显示前 5000 项，请用筛选缩小范围。";
        rows.push(h("div", { class: "sc-msg" }, msg));
        cards.push(h("div", { class: "sc-msg" }, msg));
      }
      list.replaceChildren(...rows);
      grid.replaceChildren(...cards);
      setSelected(current.files.some((x) => x.name === selected) ? selected : null);
    };

    const go = async (path, pick) => {
      const busy = () => h("div", { class: "sc-msg" }, T("loading"));
      list.replaceChildren(busy());
      grid.replaceChildren(busy());
      try {
        current = await fetchListing(path, opts);
      } catch (e) {
        list.replaceChildren(h("div", { class: "sc-msg sc-err" }, e.message));
        grid.replaceChildren(h("div", { class: "sc-msg sc-err" }, e.message));
        if (e.data?.places) renderPlaces(e.data.places);
        return;
      }
      pathInput.value = current.path;
      filterInput.value = "";
      upBtn.disabled = !current.parent;
      renderPlaces(current.places);
      note.style.display = current.restricted ? "" : "none";
      note.textContent = current.restricted
        ? "浏览范围仅限左侧列出的文件夹（在服务端设置 XH_SCENECUT_BROWSE_ROOTS 可放开）。"
        : "";
      selected = pick || null;
      render();
      (view === "grid" ? grid : list).focus();
    };

    const onKey = (e) => {
      const typing = e.target === pathInput || e.target === filterInput;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === "Enter" && e.target === pathInput) { e.preventDefault(); go(pathInput.value); }
      else if (e.key === "Enter" && !typing) { e.preventDefault(); confirm(); }
      else if (e.key === "Backspace" && !typing && current?.parent) { e.preventDefault(); go(current.parent); }
      else return;
      e.stopPropagation();
    };

    upBtn.addEventListener("click", () => current?.parent && go(current.parent));
    filterInput.addEventListener("input", () => current && render());
    viewBtn.addEventListener("click", () => {
      view = view === "grid" ? "list" : "grid";
      localStorage.setItem(VIEW_KEY, view);
      list.style.display = view === "list" ? "" : "none";
      grid.style.display = view === "grid" ? "" : "none";
      paintViewBtn();
      (view === "grid" ? grid : list).focus();
    });
    selectBtn.addEventListener("click", confirm);
    allBox.addEventListener("change", () => { opts.all = allBox.checked; current && go(current.path, selected); });
    hiddenBox.addEventListener("change", () => { opts.hidden = hiddenBox.checked; current && go(current.path, selected); });

    const overlay = h("div", { class: "sc-overlay", onmousedown: (e) => { if (e.target === overlay) close(null); } },
      h("div", { class: "sc-dialog", role: "dialog", "aria-label": "选择视频" },
        h("div", { class: "sc-head" },
          h("h3", {}, "选择视频"),
          h("button", { title: T("closeEsc"), onclick: () => close(null) }, "×")),
        h("div", { class: "sc-bar" }, upBtn, pathInput, filterInput, viewBtn),
        note,
        h("div", { class: "sc-main" }, places, list, grid),
        h("div", { class: "sc-foot" },
          h("label", {}, allBox, T("allFiles")),
          h("label", {}, hiddenBox, "Hidden"),
          chosen,
          h("button", { onclick: () => close(null) }, T("cancel")),
          selectBtn)));

    document.addEventListener("keydown", onKey, true);
    document.body.append(overlay);

    // Start in the folder of the current value, else where the last pick was made.
    const startFile = start && /\.[a-z0-9]{2,5}$/i.test(start) ? start.split(/[\\/]/).pop() : null;
    go(start || localStorage.getItem(LAST_DIR_KEY) || "", startFile);
  });
}

app.registerExtension({
  name: "XH.SceneCut.LoadVideoBrowse",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "XH_SceneCutLoadVideo") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      const pathWidget = this.widgets?.find((w) => w.name === "path");
      // 家族化浏览按钮：DOM 按钮（原生 button widget 塞不进家族图标），走 T() 双语 + 家族图标库 + 主题色。
      const bar = document.createElement("div");
      bar.style.cssText = "width:100%;display:flex;padding:2px 0;";
      const browse = document.createElement("button");
      browse.type = "button";
      browse.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:26px;cursor:pointer;"
        + "background:var(--xh-rest,var(--comfy-input-bg,#2a2a2a));color:var(--xh-on-rest,var(--input-text,#eee));"
        + "border:1px solid var(--xh-rest-bd,var(--border-color,#444));border-radius:6px;"
        + "font:12px var(--font-sans,ui-sans-serif,system-ui,sans-serif);";
      const paintBrowse = () => {
        setXhScBtnLabel(browse, "文件夹", T("browse"));
        browse.title = T("browseTip");
      };
      paintBrowse();
      onUiLang(paintBrowse, "xh-sc-loadvideo-browse");
      browse.addEventListener("click", (e) => { e.stopPropagation(); void pickVideo((pathWidget?.value || "").trim().replace(/^["']|["']$/g, "")).then((picked) => {
        if (picked && pathWidget) {
          pathWidget.value = picked;
          pathWidget.callback?.(picked);
          this.setDirtyCanvas?.(true, true);
          app.graph.setDirtyCanvas(true, true);
        }
      }); });
      bar.append(browse);
      const bw = this.addDOMWidget("scenecut_browse", "div", bar, { serialize: false, getMinHeight: () => 30 });
      bw.serialize = false;
      addVideoPreview(this, pathWidget);
      return r;
    };
  },
});



// ------------------------------------------------------------------------------------------------
// Shared helpers

const bus = (window.__xhSceneCutBus ||= new EventTarget());

function viewUrl(name, subfolder = "scenecut", type = "temp") {
  const q = new URLSearchParams({ filename: name, subfolder, type });
  return api.apiURL(`/view?${q}`);
}

async function postJSON(route, body) {
  const r = await api.fetchApi(route, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok && !d.error) d.error = `HTTP ${r.status}`;
  return d;
}

function hideWidget(w) {
  if (!w) return;
  w.hidden = true;
  w.computeSize = () => [0, -4];
}

function cleanPath(v) {
  return (v || "").trim().replace(/^["']|["']$/g, "");
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)} s`;
}

const NAV_HINT = "按住 <kbd>Ctrl</kbd> + 滚轮缩放画布 · <kbd>Ctrl</kbd> + 拖动平移";

/**
 * Canvas navigation over a node's DOM widget: Ctrl+wheel zooms the canvas, Ctrl+drag or
 * middle-drag pans it. A plain wheel scrolls whatever can scroll under the pointer; elsewhere it
 * shows a hint, so nobody gets stuck zoomed in on a big widget. `exclude` (the timeline) keeps its
 * own wheel handling. Returns a cleanup function.
 */
function bindCanvasNav(host, { exclude = null, inOverlay = () => false, hint = () => {} } = {}) {
  // Nodes 2.0 forwards every wheel event over a node to the canvas before it reaches the widget,
  // unless the target is inside a focused [data-capture-wheel] element (Ctrl+wheel still goes to
  // the canvas). Clicking the widget focuses it, so the wheel works inside it after a click.
  host.dataset.captureWheel = "true";
  if (host.tabIndex < 0 && !host.hasAttribute("tabindex")) host.tabIndex = -1;
  const canScroll = (el, e) => {
    const cs = getComputedStyle(el);
    const dy = e.deltaY;
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return "y";
    }
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      const d = Math.abs(e.deltaX) > Math.abs(dy) ? e.deltaX : dy;
      if ((d > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) || (d < 0 && el.scrollLeft > 0)) return "x";
    }
    return null;
  };
  const onWheel = (e) => {
    if (inOverlay()) return;
    if (exclude && e.target.closest?.(exclude)) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      app.canvas?.processMouseWheel?.(e);
      return;
    }
    for (let el = e.target; el && el !== host.parentElement; el = el.parentElement) {
      const dir = canScroll(el, e);
      if (dir === "y") return;                          // native vertical scroll
      if (dir === "x") {                                // a horizontal strip: scroll it with the wheel
        e.preventDefault();
        el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        return;
      }
      if (el === host) break;
    }
    e.preventDefault();
    hint();
  };
  let pan = null;
  const onDown = (e) => {
    if (inOverlay()) return;
    const middle = e.button === 1, ctrl = e.button === 0 && (e.ctrlKey || e.metaKey);
    if (!middle && !ctrl) return;
    if (ctrl && exclude && e.target.closest?.(exclude)) return;   // ctrl+click there has its own meaning
    pan = { x: e.clientX, y: e.clientY, moved: false };
    if (middle) { e.preventDefault(); e.stopPropagation(); }
  };
  const onMove = (e) => {
    if (!pan) return;
    if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 4) return;
    pan.moved = true;
    const ds = app.canvas?.ds;
    if (ds) {
      ds.offset[0] += (e.clientX - pan.x) / ds.scale;
      ds.offset[1] += (e.clientY - pan.y) / ds.scale;
      app.canvas.setDirty(true, true);
    }
    pan.x = e.clientX; pan.y = e.clientY;
    e.preventDefault();
  };
  const onUp = () => {
    if (pan?.moved) {
      // swallow the click that ends a drag (it would toggle a card's selection)
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    }
    pan = null;
  };
  host.addEventListener("wheel", onWheel, { passive: false, capture: true });
  host.addEventListener("pointerdown", onDown, { capture: true });
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  return () => {
    host.removeEventListener("wheel", onWheel, { capture: true });
    host.removeEventListener("pointerdown", onDown, { capture: true });
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
  };
}

/** Full-window mode for a DOM widget's content. */
function makeOverlay(getRoot, host, onChange) {
  let overlay = null, onEsc = null;
  const close = () => {
    if (!overlay) return;
    host.append(getRoot());
    overlay.remove();
    overlay = null;
    document.removeEventListener("keydown", onEsc, true);
    onChange(false);
  };
  const open = () => {
    if (overlay) return close();
    overlay = document.createElement("div");
    overlay.className = "scv-overlay";
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    overlay.append(getRoot());
    document.body.append(overlay);
    onEsc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onEsc, true);
    getRoot().focus({ preventScroll: true });
    onChange(true);
  };
  return { open, close, isOpen: () => !!overlay };
}

function makeStatus(host, text) {
  const status = document.createElement("div");
  status.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"
    + "color:#888;font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);background:#16161a;border-radius:6px;padding:12px;text-align:center;";
  status.textContent = text;
  host.append(status);
  return (t) => { status.textContent = t; status.style.display = t ? "flex" : "none"; };
}

/** Store the workflow now: node.properties changes go unnoticed by the workflow's change tracker
 * until something else changes, so a reload right after a run would lose the viewer's results. */
function persistGraph() {
  try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch { /* older frontends */ }
}

function toastInfo(detail, severity = "info", life = 5000) {
  app.extensionManager?.toast?.add?.({ severity, summary: "XiaoHei 分镜", detail, life });
}

async function fetchJSON(path, body) {
  if (body === undefined) {
    const r = await api.fetchApi(path);
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok && !d.error) d.error = `HTTP ${r.status}`;
    return d;
  }
  return postJSON(path, body);
}

/** A toast when an export finishes (shown whether or not its dialog is still open). */
function exportFinished(st, hidden) {
  if (st.state === "done" && hidden) {
    const n = st.files?.length || 0;
    toastInfo(`${T("exportDone")} ${n ? `${n} ${T("clipsWord")} 和 ` : ""}scenes.json ${T("inFolder")} ${st.folder}`, "success", 8000);
  } else if (st.state === "error") {
    toastInfo(`导出失败：${st.error}`, "error", 10000);
  }
}

// ------------------------------------------------------------------------------------------------
// Load Video (Path): a small playable preview of the file

function addVideoPreview(node, pathWidget) {
  const box = document.createElement("div");
  box.style.cssText = "width:100%;height:100%;min-height:150px;display:flex;flex-direction:column;gap:4px;"
    + "background:var(--xh-surface,#111);border:1px solid var(--xh-border,#333);border-radius:6px;overflow:hidden;position:relative;";
  const video = document.createElement("video");
  video.controls = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.style.cssText = "flex:1;min-height:0;width:100%;object-fit:contain;background:#000;display:none;";
  const info = document.createElement("div");
  info.style.cssText = "font:11px var(--font-sans, ui-sans-serif, system-ui, sans-serif);color:#aaa;padding:2px 6px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  const msg = document.createElement("div");
  msg.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;color:#777;font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);padding:8px;text-align:center;";
  msg.textContent = T("previewEmpty");
  box.append(video, msg, info);
  const hint = document.createElement("div");
  hint.className = "scv-hint";
  box.append(hint);
  const w = node.addDOMWidget("scenecut_preview", "div", box, { serialize: false, getMinHeight: () => 170 });
  w.serialize = false;
  bindCanvasNav(box, {
    hint: () => {
      hint.innerHTML = NAV_HINT;
      hint.classList.add("scv-show");
      clearTimeout(hint._t);
      hint._t = setTimeout(() => hint.classList.remove("scv-show"), 1800);
    },
  });

  let current = null, triedProxy = false, timer = null, probeInfo = null;
  const show = (text) => { msg.textContent = text; msg.style.display = text ? "flex" : "none"; video.style.display = text ? "none" : "block"; };
  const paintInfo = () => {
    if (!probeInfo) return;
    const d = probeInfo;
    info.textContent = `${d.width}×${d.height} · ${d.fps_float.toFixed(3).replace(/\.?0+$/, "")} ${T("fpsUnit")} · ${fmtDuration(d.duration)} · ${d.codec}${d.has_audio ? " · " + T("withAudio") : ""}`;
  };
  onUiLang(() => {
    paintInfo();
    if (current && !probeInfo) return;
    if (!current && msg.style.display !== "none") msg.textContent = T("previewEmpty");
  }, "xh-sc-loadvideo-preview");
  const load = async (path) => {
    path = cleanPath(path);
    if (path === current) return;
    current = path;
    triedProxy = false;
    probeInfo = null;
    info.textContent = "";
    if (!path) { video.removeAttribute("src"); video.load(); show(T("previewEmpty")); return; }
    show(T("loading"));
    const r = await api.fetchApi(`/xh_scenecut/probe?${new URLSearchParams({ path })}`);
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (current !== path) return;
    if (!r.ok) { show(d.error || T("previewFail")); return; }
    probeInfo = d;
    paintInfo();
    info.title = d.path;
    video.src = api.apiURL(`/xh_scenecut/media?${new URLSearchParams({ path })}`);
    show("");
  };
  video.addEventListener("error", async () => {
    if (!current || triedProxy) { if (current) show(T("previewUnplayable")); return; }
    triedProxy = true;
    const path = current;
    show(T("previewMaking"));
    const r = await api.fetchApi(`/xh_scenecut/preview?${new URLSearchParams({ path })}`);
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (current !== path) return;
    if (!r.ok) { show(d.error || T("previewFail")); return; }
    video.src = viewUrl(d.filename, d.subfolder, d.type);
    show("");
  });
  if (pathWidget) {
    const cb = pathWidget.callback;
    pathWidget.callback = function (v) {
      const out = cb?.apply(this, arguments);
      clearTimeout(timer);
      timer = setTimeout(() => load(v), 400);
      return out;
    };
  }
  const onConfigure = node.onConfigure;
  node.onConfigure = function () {
    onConfigure?.apply(this, arguments);
    load(pathWidget?.value);
  };
  if (!node.size || node.size[1] < 300) node.setSize([Math.max(node.size?.[0] || 0, 360), 340]);
  setTimeout(() => load(pathWidget?.value), 0);
}

// ------------------------------------------------------------------------------------------------
// Connecting an images output turns its output_images option on.

app.registerExtension({
  name: "XH.SceneCut.ImageOutputs",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!String(nodeData.name).startsWith("XH_SceneCut")) return;
    if (!(nodeData.output || []).includes("IMAGE")) return;
    const onConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (type, slot, connected) {
      const r = onConnectionsChange?.apply(this, arguments);
      const OUTPUT = window.LiteGraph?.OUTPUT ?? 2;
      if (type !== OUTPUT || !connected || this.outputs?.[slot]?.type !== "IMAGE") return r;
      const w = this.widgets?.find((x) => x.name === "output_images");
      if (!w || w.value !== "关闭" || app.configuringGraph) return r;
      const viewerLike = nodeData.name === "XH_SceneCutViewer" || nodeData.name === "XH_SceneCutSelectedScenes";
      w.value = viewerLike ? "全部帧" : "每个片段取首帧";
      w.callback?.(w.value);
      toastInfo(`${nodeData.display_name || nodeData.name}：输出帧设为 "${w.value}"（请在节点上修改）。`);
      return r;
    };
  },
});

// ------------------------------------------------------------------------------------------------
// SceneCut Viewer node

app.registerExtension({
  name: "XH.SceneCut.Viewer",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "XH_SceneCutViewer") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      const node = this;
      const reviewW = this.widgets?.find((w) => w.name === "review");
      hideWidget(reviewW);
      const host = document.createElement("div");
      host.style.cssText = "width:100%;height:100%;min-height:420px;position:relative;";
      const setStatus = makeStatus(host, "运行工作流后，分镜会出现在这里。");
      const widget = this.addDOMWidget("xh_scenecut_viewer", "div", host, { serialize: false, getMinHeight: () => 420 });
      widget.serialize = false;          // display only: keep it out of widgets_values
      if (!this.size || this.size[0] < 760) this.setSize([840, 880]);

      let viewer = null, info = null;
      const overlay = makeOverlay(() => viewer.root, host, (on) => { viewer.setExpanded(on); viewer._layout(); });
      const unbindNav = bindCanvasNav(host, {
        exclude: ".scv-timeline", inOverlay: overlay.isOpen, hint: () => viewer?.hint(NAV_HINT),
      });

      const readReview = () => { try { return JSON.parse(reviewW?.value || "{}"); } catch { return {}; } };
      const publish = () => {
        node.sceneCutLive = viewer?.data ? { info, data: viewer.data, review: viewer.review() } : null;
        bus.dispatchEvent(new CustomEvent("viewer", { detail: { node } }));
      };
      const writeReview = (review) => {
        if (reviewW) {
          const empty = !review.edits.length && !review.selection.length;
          reviewW.value = empty ? "" : JSON.stringify(review);
          reviewW.callback?.(reviewW.value);
        }
        node.setDirtyCanvas?.(true, true);
        persistGraph();
        publish();
      };

      const load = async (newInfo) => {
        if (viewer?.data && info?.data === newInfo.data) { info = newInfo; return; }
        try {
          setStatus(T("loading"));
          const res = await fetch(viewUrl(newInfo.data, newInfo.subfolder, newInfo.type));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          info = newInfo;
          if (!viewer) {
            viewer = new XH_SceneCutViewer(host, {
              resolve: (name) => viewUrl(name, info.subfolder, info.type),
              onExpand: overlay.open,
              onReviewChange: writeReview,
              onFix: (mode, frame, edits) => postJSON("/xh_scenecut/review/fix", { data: info.data, mode, frame, edits }),
              onExport: ({ review, selected, segs, source }) => openExportDialog({
                fetchJSON, source,
                scopes: scopesFor(segs, selected),
                scope: selected.length ? "selected" : "all",
                request: (scope) => ({ data: info.data, review, scope }),
                onFinished: exportFinished,
              }),
            });
          }
          viewer.load(data);
          viewer.setReview(readReview());
          setStatus("");
          if (newInfo.report) viewer.toast(`HTML 报告已保存：output/${newInfo.report}`, "ok", 6000);
          publish();
        } catch (err) {
          setStatus("预览文件已丢失（ComfyUI 重启会清空临时目录），请重新运行节点。");
          console.warn("分镜审阅器：", err);
        }
      };

      const onExecuted = this.onExecuted;
      this.onExecuted = function (output) {
        onExecuted?.apply(this, arguments);
        const entry = output?.xh_scenecut_viewer?.[0];
        if (!entry) return;
        this.properties = this.properties || {};
        this.properties.xh_scenecut_viewer = entry;
        persistGraph();
        load(entry);
      };
      const onConfigure = this.onConfigure;
      this.onConfigure = function () {
        onConfigure?.apply(this, arguments);
        hideWidget(reviewW);
        const entry = this.properties?.xh_scenecut_viewer;
        if (entry) load(entry);
      };
      const onRemoved = this.onRemoved;
      this.onRemoved = function () {
        onRemoved?.apply(this, arguments);
        overlay.close();
        unbindNav();
        viewer?.destroy();
        node.sceneCutLive = null;
        bus.dispatchEvent(new CustomEvent("viewer", { detail: { node } }));
      };
      return r;
    };
  },
});

// ------------------------------------------------------------------------------------------------
// SceneCut Selected Scenes node

function upstreamViewer(node) {
  const slot = node.inputs?.findIndex((i) => i.name === "scenes") ?? -1;
  const imagesSlot = node.inputs?.find((i) => i.name === "images");
  if (slot < 0 || imagesSlot?.link != null) return null;
  const up = node.getInputNode?.(slot);
  return up && (up.comfyClass === "XH_SceneCutViewer" || up.type === "XH_SceneCutViewer") ? up : null;
}

app.registerExtension({
  name: "XH.SceneCut.SelectedScenes",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "XH_SceneCutSelectedScenes") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      const node = this;
      this.properties = this.properties || {};
      this.properties.xh_scenecut_channel ||= Math.random().toString(36).slice(2, 10);
      const host = document.createElement("div");
      host.style.cssText = "width:100%;height:100%;min-height:360px;position:relative;";
      const setStatus = makeStatus(host, "接上分镜审阅器（或分镜列表）再运行工作流。");
      const widget = this.addDOMWidget("xh_scenecut_selected", "div", host, { serialize: false, getMinHeight: () => 360 });
      widget.serialize = false;
      if (!this.size || this.size[0] < 560) this.setSize([660, 640]);

      let player = null, own = null, info = null, state = { edits: [], selection: null };
      let bc = null, bcName = null;
      const overlay = makeOverlay(() => player.root, host, (on) => player.setExpanded(on));
      const unbindNav = bindCanvasNav(host, {
        inOverlay: overlay.isOpen,
        hint: () => {
          if (!player) return;
          let h = player.root.querySelector(".scv-hint");
          if (!h) { h = document.createElement("div"); h.className = "scv-hint"; player.root.append(h); }
          h.innerHTML = NAV_HINT;
          h.classList.add("scv-show");
          clearTimeout(h._t);
          h._t = setTimeout(() => h.classList.remove("scv-show"), 1800);
        },
      });

      const broadcast = () => {
        if (!bc || !info) return;
        // plain copies: node properties are reactive proxies, which cannot be posted
        const msg = { type: "state", info, edits: state.edits, selection: state.selection, current: player?.current() };
        try { bc.postMessage(JSON.parse(JSON.stringify(msg))); } catch (err) { console.warn("分镜精选：", err); }
      };
      const channel = () => {
        const name = channelName(node.properties.xh_scenecut_channel);
        if (bc && bcName === name) return bc;
        bc?.close();
        bcName = name;
        bc = "BroadcastChannel" in window ? new BroadcastChannel(name) : null;
        if (bc) {
          bc.onmessage = (ev) => {
            const m = ev.data || {};
            if (m.type === "hello") broadcast();
            else if (m.type === "nav" && player) player.goScene(m.index);
          };
        }
        return bc;
      };
      const openTab = () => {
        if (!info) return;
        channel();
        const q = new URLSearchParams({
          ch: node.properties.xh_scenecut_channel, data: info.data, subfolder: info.subfolder, type: info.type,
          sel: JSON.stringify(state.selection || null), edits: JSON.stringify(state.edits || []),
          title: player?.data?.source?.name || "选中的片段",
        });
        window.open(api.apiURL(`/xh_scenecut/selected?${q}`), `scenecut-${node.properties.xh_scenecut_channel}`);
      };

      const refresh = async () => {
        const up = upstreamViewer(node);
        let src = null;
        if (up?.sceneCutLive) {
          const live = up.sceneCutLive;
          src = { info: live.info, edits: live.review.edits, selection: live.review.selection };
        } else if (own) {
          src = { info: own, edits: [], selection: own.selection };
        }
        if (!src) { setStatus("接上分镜审阅器（或分镜列表）再运行工作流。"); return; }
        state = { edits: [...(src.edits || [])].map((e) => ({ ...e })),
          selection: src.selection?.length ? [...src.selection] : null };
        try {
          if (!player) {
            player = new XH_SceneCutSelected(host, {
              resolve: (name) => viewUrl(name, info?.subfolder, info?.type),
              onExpand: overlay.open,
              onOpenTab: openTab,
              onNavigate: (index) => channel()?.postMessage({ type: "nav", index }),
              onExport: (x) => openSelectedExport(x, () => info, () => state, fetchJSON, exportFinished),
            });
          }
          if (!player.data || info?.data !== src.info.data) {
            setStatus(T("loading"));
            const res = await fetch(viewUrl(src.info.data, src.info.subfolder, src.info.type));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            info = { data: src.info.data, subfolder: src.info.subfolder, type: src.info.type };
            player.load(await res.json(), state);
          } else {
            player.update(state);
          }
          setStatus("");
          channel();
          broadcast();
        } catch (err) {
          setStatus("预览文件已丢失（ComfyUI 重启会清空临时目录），请重新运行工作流。");
          console.warn("分镜精选：", err);
        }
      };

      const onViewer = (e) => { if (e.detail.node === upstreamViewer(node)) refresh(); };
      bus.addEventListener("viewer", onViewer);

      const onConnectionsChange = this.onConnectionsChange;
      this.onConnectionsChange = function () {
        const out = onConnectionsChange?.apply(this, arguments);
        if (!app.configuringGraph) setTimeout(refresh, 0);
        return out;
      };
      const onExecuted = this.onExecuted;
      this.onExecuted = function (output) {
        onExecuted?.apply(this, arguments);
        const entry = output?.xh_scenecut_selected?.[0];
        if (!entry) return;
        own = entry;
        this.properties.xh_scenecut_selected = entry;
        persistGraph();
        refresh();
      };
      const onConfigure = this.onConfigure;
      this.onConfigure = function () {
        onConfigure?.apply(this, arguments);
        own = this.properties?.xh_scenecut_selected || null;
        setTimeout(refresh, 0);
      };
      const onRemoved = this.onRemoved;
      this.onRemoved = function () {
        onRemoved?.apply(this, arguments);
        bus.removeEventListener("viewer", onViewer);
        overlay.close();
        unbindNav();
        bc?.close();
        player?.destroy();
      };
      return r;
    };
  },
});

// ── 分镜节点：下拉契约值「显示中文、存档值不变」────────────────────────────
// device / decoder / precision / transitions / sscd 的英文值是算法内部比较的契约，
// 不能改存档值；只挂显示钩子。语言切换时统一重刷。
app.registerExtension({
  name: "XH.SceneCut.ComboLabels",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!/^XH_SceneCut/.test(nodeData.name || "")) return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      paintSceneCutCombo(this);
      return r;
    };
  },
  async setup() {
    installSceneCutComboLabels();
  },
});
