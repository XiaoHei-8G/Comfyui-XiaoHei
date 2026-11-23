import { setXhScBtnIcon, setXhScBtnLabel } from "./viewer_core.js";
import { T, onUiLang } from "./i18n_ui.js";
// SceneCut selected-scenes player: one scene at a time from a list, arrows (or the arrow keys)
// to move between them, with the scene's details beside it. Runs in the "SceneCut Selected
// Scenes" node and on its own page (/xh_scenecut/selected), kept in sync over a BroadcastChannel.
//
//   const p = new XH_SceneCutSelected(container, { resolve, onExpand, onOpenTab, onNavigate, onExport, standalone });
//   p.load(data, { edits, selection });   // viewer JSON from scenecut/viewer.py
//   p.update({ edits, selection });       // the selection changed (live from a SceneCut Viewer)
//   p.goScene(segmentIndex);

import {
  EDIT_COLOR, PICK_COLOR, REL_COLORS, REL_LABELS, applyEdits, el, ensureStyle, fmtTime, reasonText,
  relationOf, scrollWithin, thumbStyle,
} from "./viewer_core.js";
import { openExportDialog } from "./export_dialog.js";

const CSS = `
.scs-root { position: relative; width: 100%; height: 100%; box-sizing: border-box; display: grid;
  grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(140px, 1fr) auto auto auto;
  grid-template-areas: "head" "video" "controls" "info" "chips";
  background: #16161a; color: #e6e6ea; font: 12px/1.35 var(--font-sans, ui-sans-serif, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
  overflow: hidden; outline: none; user-select: none; }
.scs-root.scs-large { grid-template-columns: minmax(0, 1fr) 320px;
  grid-template-rows: auto minmax(160px, 1fr) auto auto;
  grid-template-areas: "head head" "video info" "controls info" "chips chips"; }
.scs-root * { box-sizing: border-box; }
.scs-head { grid-area: head; display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  background: #1e1e23; border-bottom: 1px solid #2c2c33; flex-wrap: wrap; }
.scs-title { font-size: 13px; font-weight: 600; }
.scs-title .scs-of { color: #9a9aa6; font-weight: 400; margin-left: 6px; }
.scs-btn { background: #2a2a31; color: #e6e6ea; border: 1px solid #3a3a43; border-radius: 5px;
  padding: 2px 9px; min-width: 28px; height: 26px; cursor: pointer; font: inherit; white-space: nowrap; }
.scs-btn:hover:not(:disabled) { background: #34343c; }
.scs-btn:disabled { opacity: .4; cursor: default; }
.scs-btn.scs-on { background: #2f5fb3; border-color: #2f5fb3; }
.scs-btn.scs-accent { background: #2f6fd6; border-color: #2f6fd6; color: #fff; font-weight: 600; }
.scs-btn.scs-accent:hover { background: #3d7ff0; }
.scs-btn.scs-export { background: #2e8b57; border-color: #2e8b57; color: #fff; font-weight: 600; }
.scs-btn.scs-export:hover:not(:disabled) { background: #36a066; }
.scs-spacer { flex: 1; }
.scs-video { grid-area: video; position: relative; background: #000; min-height: 0; display: flex;
  align-items: center; justify-content: center; overflow: hidden; }
.scs-video video, .scs-video canvas { max-width: 100%; max-height: 100%; width: auto; height: 100%; display: block; }
.scs-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 64px; z-index: 2;
  border: none; border-radius: 8px; background: rgba(0,0,0,.45); color: #fff; font-size: 26px; cursor: pointer;
  opacity: .75; }
.scs-arrow:hover:not(:disabled) { opacity: 1; background: rgba(47,111,214,.8); }
.scs-arrow:disabled { opacity: .15; cursor: default; }
.scs-prev { left: 8px; } .scs-next { right: 8px; }
.scs-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #999; padding: 16px; text-align: center; }
.scs-controls { grid-area: controls; display: flex; align-items: center; gap: 6px; padding: 5px 8px;
  background: #1e1e23; border-top: 1px solid #2c2c33; }
.scs-track { position: relative; flex: 1; height: 8px; border-radius: 4px; background: #2a2a31; cursor: pointer; min-width: 60px; }
.scs-track > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: #6ea8ff; }
.scs-tc { font-variant-numeric: tabular-nums; color: #ddd; white-space: nowrap; }
.scs-info { grid-area: info; padding: 8px 10px; background: #1a1a1f; border-top: 1px solid #2c2c33;
  overflow-y: auto; min-height: 0; max-height: 150px; user-select: text; }
.scs-root.scs-large .scs-info { border-top: none; border-left: 1px solid #2c2c33; max-height: none; }
.scs-kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; }
.scs-k { color: #9a9aa6; }
.scs-sec { margin-top: 8px; padding-top: 6px; border-top: 1px solid #2a2a30; }
.scs-chips { grid-area: chips; display: flex; gap: 6px; padding: 6px 8px; overflow-x: auto; overflow-y: hidden;
  background: #141418; border-top: 1px solid #2c2c33; min-height: 0; }
.scs-chip { flex: none; width: 96px; border-radius: 5px; border: 2px solid #2c2c33; background: #1f1f25;
  cursor: pointer; overflow: hidden; }
.scs-chip:hover { border-color: #55555f; }
.scs-chip.scs-cur { border-color: #6ea8ff; }
.scs-chip .scs-cl { padding: 1px 5px 2px; font-size: 10.5px; color: #bbb; white-space: nowrap; }
.scs-chip .scv-thumb { border-top: 3px solid transparent; }
`;

function ensureOwnStyle() {
  ensureStyle();
  if (document.getElementById("scs-style")) return;
  const s = el("style");
  s.id = "scs-style";
  s.textContent = CSS;
  document.head.append(s);
}

export class XH_SceneCutSelected {
  constructor(container, opts = {}) {
    ensureOwnStyle();
    this.container = container;
    this.opts = opts;
    this.resolve = opts.resolve || ((n) => n);
    this.data = null;
    this.list = [];          // segment indices shown, in order
    this.k = 0;              // position in list
    this.loop = true;
    this.autoNext = false;
    this._build();
  }

  _build() {
    const root = this.root = el("div", "scs-root");
    root.tabIndex = 0;
    root.sceneCutSelected = this;
    const btn = (parent, label, title, fn, cls, icon, titleKey) => {
      const b = el("button", "scs-btn" + (cls ? ` ${cls}` : ""));
      if (icon) setXhScBtnLabel(b, icon, label);
      else b.textContent = label;
      b.title = title;
      if (titleKey) b.dataset.xhTitle = titleKey;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); root.focus({ preventScroll: true }); });
      parent.append(b);
      return b;
    };
    const head = el("div", "scs-head");
    this.title = el("div", "scs-title", "选中的片段");
    head.append(this.title, el("span", "scs-spacer"));
    if (this.opts.onExport) this.exportBtn = btn(head, "导出片段", "把这些片段切成逐帧精确、带声音的视频文件，并写入 scenes.json，保存到 output/xh_scenecut/<video>/（E）", () => this.exportScenes(), "scs-export", "导出");
    if (this.opts.onOpenTab) btn(head, "新标签页打开", "在独立浏览器标签页打开这个播放器（保持同步）", () => this.opts.onOpenTab(), null, "external-link");
    if (this.opts.onExpand) this.expandBtn = btn(head, "打开大视图", "铺满整个窗口（Esc 返回）", () => this.opts.onExpand(), "scs-accent", "全屏");

    this.videoBox = el("div", "scs-video");
    this.msg = el("div", "scs-msg", "");
    this.prevBtn = el("button", "scs-arrow scs-prev", "‹");
    this.prevBtn.title = "上一个片段（←）";
    this.nextBtn = el("button", "scs-arrow scs-next", "›");
    this.nextBtn.title = "下一个片段（→）";
    this.prevBtn.addEventListener("click", (e) => { e.stopPropagation(); this.go(this.k - 1); root.focus({ preventScroll: true }); });
    this.nextBtn.addEventListener("click", (e) => { e.stopPropagation(); this.go(this.k + 1); root.focus({ preventScroll: true }); });
    this.videoBox.append(this.msg, this.prevBtn, this.nextBtn);

    const ctl = el("div", "scs-controls");
    btn(ctl, "", "上一个片段（←）", () => this.go(this.k - 1), null, "skip-back");
    this.playBtn = btn(ctl, "", "播放 / 暂停（空格）", () => this.togglePlay(), null, "播放");
    btn(ctl, "", "下一个片段（→）", () => this.go(this.k + 1), null, "skip-forward");
    btn(ctl, "‹", T("prevFrameTip"), () => this.stepFrame(-1), null, null, "prevFrameTip");
    btn(ctl, "›", T("nextFrameTip"), () => this.stepFrame(1), null, null, "nextFrameTip");
    this.track = el("div", "scs-track");
    this.fill = el("i");
    this.track.append(this.fill);
    this.track.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      const seek = (ev) => {
        const r = this.track.getBoundingClientRect();
        const s = this.seg();
        if (!s) return;
        const f = s.start + Math.floor(Math.max(0, Math.min(0.9999, (ev.clientX - r.left) / r.width)) * (s.end - s.start));
        this._seekFrame(f);
      };
      seek(e);
      const mv = (ev) => seek(ev);
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", mv);
      window.addEventListener("mouseup", up);
    });
    this.tc = el("span", "scs-tc", "");
    ctl.append(this.track, this.tc);
    this.loopBtn = btn(ctl, T("loop"), T("loopTip"), () => { this.loop = !this.loop; this._syncButtons(); }, null, null, "loopTip");
    this.nextAutoBtn = btn(ctl, T("playAll"), T("playAllTip"), () => { this.autoNext = !this.autoNext; this._syncButtons(); }, null, null, "playAllTip");

    this.info = el("div", "scs-info");
    this.chips = el("div", "scs-chips");
    root.append(head, this.videoBox, ctl, this.info, this.chips);
    this.container.append(root);
    this._ro = new ResizeObserver(() => root.classList.toggle("scs-large", !!this.opts.standalone || root.clientWidth >= 860));
    this._ro.observe(root);
    root.addEventListener("keydown", (e) => this._key(e));
    this._syncButtons();
    this._render();
    onUiLang(() => this._relang(), "xh-scenecut-selected");
  }

  // 语言切换：按钮文案 / title / 详情区全部重刷；接线契约值不动。
  _relang() {
    this.root.querySelectorAll("[data-xh-title]").forEach((b) => { b.title = T(b.dataset.xhTitle); });
    if (this.loopBtn) this.loopBtn.textContent = T("loop");
    if (this.nextAutoBtn) this.nextAutoBtn.textContent = T("playAll");
    this._syncButtons();
    this._render();
  }

  setExpanded(on) {
    if (this.expandBtn) setXhScBtnLabel(this.expandBtn, on ? "关闭" : "全屏", on ? "关闭大视图" : "打开大视图");
  }

  // ------------------------------------------------------------------ data
  load(data, state = {}) {
    const same = this.data && this.data.base === data.base && this.data.proxy?.file === data.proxy?.file;
    const keep = this.seg() ? this.list[this.k] : null;
    this.data = data;
    this.fps = data.source.fps || 25;
    if (!same) this._setupMedia();
    this.update(state, keep);
  }

  update(state = {}, keepIndex = null) {
    if (!this.data) return;
    const keep = keepIndex ?? (this.seg() ? this.list[this.k] : null);
    this.segs = applyEdits(this.data.segments, state.edits || []);
    const sel = (state.selection ?? this.data.selection) || null;
    this.all = !sel || !sel.length;
    this.list = this.all ? this.segs.map((_, i) => i) : [...new Set(sel)].filter((i) => i >= 0 && i < this.segs.length).sort((a, b) => a - b);
    const k = keep != null ? this.list.indexOf(keep) : -1;
    this.k = k >= 0 ? k : Math.min(this.k, Math.max(0, this.list.length - 1));
    this._buildChips();
    this._render(true);
  }

  seg() { return this.segs && this.list.length ? this.segs[this.list[this.k]] : null; }

  current() { return this.list.length ? this.list[this.k] : -1; }

  _setupMedia() {
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.remove(); }
    this.video = null;
    const p = this.data.proxy;
    if (!p) { this.msg.textContent = "没有预览代理：在节点上开启 `proxy` 才能播放片段。"; return; }
    const v = this.video = el("video");
    v.preload = "auto";
    v.playsInline = true;
    v.src = this.resolve(p.file);
    v.addEventListener("play", () => { setXhScBtnIcon(this.playBtn, "暂停"); this._watch(); });
    v.addEventListener("pause", () => { setXhScBtnIcon(this.playBtn, "播放"); this._tick(); });
    v.addEventListener("seeked", () => this._tick());
    v.addEventListener("click", () => this.togglePlay());
    this.videoBox.prepend(v);
  }

  exportScenes() {
    if (!this.opts.onExport || !this.data || !this.list.length) return;
    if (this.video && !this.video.paused) this.video.pause();
    this.opts.onExport({ list: this.list.slice(), all: this.all, segs: this.segs, source: this.data.source,
                         base: this.data.base });
  }

  // ------------------------------------------------------------------ navigation
  go(k, notify = true) {
    if (!this.list.length) return;
    k = Math.max(0, Math.min(this.list.length - 1, k));
    const playing = this.video && !this.video.paused;
    this.k = k;
    this._render(true);
    if (playing) this.video.play();
    if (notify) this.opts.onNavigate?.(this.current());
  }

  goScene(index, notify = false) {
    const k = this.list.indexOf(index);
    if (k >= 0 && k !== this.k) this.go(k, notify);
  }

  togglePlay() {
    const v = this.video, s = this.seg();
    if (!v || !s) return;
    if (v.paused) {
      if (this._frame() >= s.end - 1 || this._frame() < s.start) this._seekFrame(s.start);
      v.play();
    } else v.pause();
  }

  stepFrame(d) {
    const s = this.seg();
    if (!s) return;
    if (this.video && !this.video.paused) this.video.pause();
    this._seekFrame(Math.max(s.start, Math.min(s.end - 1, this._frame() + d)));
  }

  _frame() {
    return this.video ? Math.floor(this.video.currentTime * this.fps + 1e-3) : (this.seg()?.start ?? 0);
  }

  _seekFrame(f) {
    if (this.video) this.video.currentTime = (f + 0.5) / this.fps;
    this._tick(f);
  }

  _watch() {
    const v = this.video;
    if (!v) return;
    const cb = (_, meta) => {
      this._tick(Math.floor((meta?.mediaTime ?? v.currentTime) * this.fps + 1e-3));
      if (!v.paused) v.requestVideoFrameCallback ? v.requestVideoFrameCallback(cb) : requestAnimationFrame(() => cb());
    };
    v.requestVideoFrameCallback ? v.requestVideoFrameCallback(cb) : requestAnimationFrame(() => cb());
  }

  _tick(f = this._frame()) {
    const s = this.seg();
    if (!s) return;
    if (this.video && !this.video.paused && (f >= s.end || f < s.start - 1)) {
      if (this.autoNext && this.k < this.list.length - 1) { this.go(this.k + 1); return; }
      if (this.loop) { this._seekFrame(s.start); return; }
      this.video.pause();
      this._seekFrame(s.end - 1);
      return;
    }
    const n = s.end - s.start, i = Math.max(0, Math.min(n - 1, f - s.start));
    this.fill.style.width = `${((i + 1) / n) * 100}%`;
    this.tc.textContent = `${((i + 1) / this.fps).toFixed(2)} / ${(n / this.fps).toFixed(2)} s · f ${s.start + i}`;
  }

  _syncButtons() {
    this.loopBtn.classList.toggle("scs-on", this.loop);
    this.nextAutoBtn.classList.toggle("scs-on", this.autoNext);
  }

  _key(e) {
    const k = e.key;
    let handled = true;
    if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") this.go(this.k - 1);
    else if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") this.go(this.k + 1);
    else if (k === " ") this.togglePlay();
    else if (k === "Home") this.go(0);
    else if (k === "End") this.go(this.list.length - 1);
    else if (k === ",") this.stepFrame(-1);
    else if (k === ".") this.stepFrame(1);
    else if (k === "l" || k === "L") { this.loop = !this.loop; this._syncButtons(); }
    else if (k === "p" || k === "P") { this.autoNext = !this.autoNext; this._syncButtons(); }
    else if ((k === "e" || k === "E") && this.opts.onExport) this.exportScenes();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // ------------------------------------------------------------------ rendering
  _buildChips() {
    this.chips.replaceChildren();
    const sp = this.data?.sprites;
    this.chipEls = this.list.map((i, k) => {
      const s = this.segs[i];
      const c = el("div", "scs-chip");
      const th = el("div", "scv-thumb");
      const rel = relationOf(s, i);
      th.style.borderTopColor = s.kind === "transition" ? REL_COLORS.transition : REL_COLORS[rel] || REL_COLORS.hard_cut;
      const tiles = s.tiles || [];
      if (sp && tiles.length) thumbStyle(th, sp, tiles[Math.floor(tiles.length / 2)], 92, this.resolve);
      else th.style.height = "52px";
      c.append(th, el("div", "scs-cl", `#${i + 1} · ${((s.end - s.start) / this.fps).toFixed(2)}s`));
      c.title = `片段 ${i + 1}：第 ${s.start}–${s.end - 1} 帧`;
      c.addEventListener("click", (e) => { e.stopPropagation(); this.go(k); this.root.focus({ preventScroll: true }); });
      this.chips.append(c);
      return c;
    });
  }

  _render(seek = false) {
    const s = this.seg();
    const n = this.list.length;
    this.prevBtn.disabled = !n || this.k <= 0;
    this.nextBtn.disabled = !n || this.k >= n - 1;
    this.chipEls?.forEach((c, k) => c.classList.toggle("scs-cur", k === this.k));
    const cur = this.chipEls?.[this.k];
    scrollWithin(this.chips, cur);
    this.title.replaceChildren();
    if (!this.data) {
      this.title.append("选中的片段");
      this.msg.textContent = "运行工作流后，选中的片段会出现在这里。";
      this.info.replaceChildren();
      return;
    }
    if (!s) {
      this.title.append("选中的片段");
      this.msg.textContent = "没有片段。";
      return;
    }
    const i = this.list[this.k];
    this.title.append(`${T("sceneNum")} #${i + 1}`);
    this.title.append(el("span", "scs-of", `${this.k + 1} ${T("of")} ${n} · ${this.all ? T("showingAll") : T("selectedShort")}`));
    this.msg.textContent = this.video ? "" : this.msg.textContent;
    if (seek) {
      if (this.video && !this.video.paused) this.video.pause();
      this._seekFrame(s.start);
    }
    this._renderInfo(s, i);
  }

  _renderInfo(s, i) {
    const d = this.info;
    d.replaceChildren();
    const fps = this.fps;
    const rows = [
      [T("rowScene"), `#${i + 1} ${T("of")} ${this.segs.length}${s.kind === "transition" ? `（${s.transition}${T("transition")}）` : ""}`],
      [T("rowFrames"), `${s.start} – ${s.end - 1}  (${s.end - s.start})`],
      [T("rowTime"), `${fmtTime(s.start / fps)} → ${fmtTime(s.end / fps)}`],
      [T("rowLength"), `${((s.end - s.start) / fps).toFixed(3)} s`],
    ];
    if (i > 0) {
      const rel = s.relation || "hard_cut";
      rows.push(["开始于", REL_LABELS[rel] || rel]);
      if (s.confidence != null) rows.push([T("rowDetector"), `${(s.confidence * 100).toFixed(1)}%`]);
    }
    const g = el("div", "scs-kv");
    for (const [k, v] of rows) g.append(el("span", "scs-k", k), el("span", null, v));
    d.append(g);
    if (s.edited) {
      const e = el("div", "scs-sec", `你修正的切点：从第 ${s.edited.from} 帧移到第 ${s.start} 帧`);
      e.style.color = EDIT_COLOR;
      d.append(e);
    }
    const v = s.validation;
    if (v) {
      const sec = el("div", "scs-sec");
      const head = el("div", null, `${T("validation")} `);
      const b = el("b", null, T(v.decision === "merge" ? "merged" : "kept"));
      b.style.color = v.decision === "merge" ? "#e53935" : PICK_COLOR;
      head.append(b, el("span", "scs-k", ` — ${reasonText(v.guard || v.reason)}`));
      sec.append(head);
      const g2 = el("div", "scs-kv");
      const add = (k, val) => g2.append(el("span", "scs-k", k), el("span", null, val));
      if (v.s_blend != null) add(T("similarity"), `${v.s_blend.toFixed(3)}（${T("threshold")} ${v.threshold?.toFixed(2)}）`);
      if (v.novelty != null) add(T("abruptness"), v.novelty.toFixed(3));
      if (v.flash) add(T("flash"), `是（${(v.flash_conf * 100).toFixed(0)}%）`);
      sec.append(g2);
      d.append(sec);
    }
    if (s.absorbed?.length) {
      d.append(el("div", "scs-sec", `${T("contains")} ${s.absorbed.map((a) => `${a.transition || T("transition")} ${T("frame")}${a.start}–${a.end - 1}`).join("、")}`));
    }
  }

  destroy() {
    this._ro?.disconnect();
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); }
    this.root.remove();
  }
}

// ------------------------------------------------------------------------------------------------
// The standalone page (/xh_scenecut/selected?ch=...&data=...): follows the node over a BroadcastChannel.
export function channelName(id) {
  return `scenecut-selected-${id}`;
}

export function openSelectedPage(root, params) {
  const viewUrl = (info, name) => {
    const q = new URLSearchParams({ filename: name, subfolder: info.subfolder || "scenecut", type: info.type || "temp" });
    return `../view?${q}`;
  };
  let info = null, state = {};
  const fetchJSON = async (path, body) => {
    const r = await fetch(path.replace(/^\/xh_scenecut\//, "./"), body === undefined ? {} :
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok && !d.error) d.error = `HTTP ${r.status}`;
    return d;
  };
  const player = new XH_SceneCutSelected(root, {
    standalone: true,
    resolve: (name) => viewUrl(info || {}, name),
    onNavigate: (index) => bc?.postMessage({ type: "nav", index }),
    onExport: (x) => openSelectedExport(x, () => info, () => state, fetchJSON),
  });
  player.root.focus({ preventScroll: true });

  const load = async (newInfo, newState) => {
    state = newState || state;
    if (!newInfo?.data) return;
    if (info?.data === newInfo.data && player.data) { player.update(state); return; }
    info = newInfo;
    try {
      const res = await fetch(viewUrl(info, info.data));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      player.load(await res.json(), state);
      document.title = `${player.data.source.name} - 选中片段 - XiaoHei 分镜`;
    } catch (err) {
      player.msg.textContent = "预览文件已丢失（ComfyUI 重启会清空临时目录），请重新运行工作流。";
    }
  };

  const ch = params.get("ch");
  const bc = ch && "BroadcastChannel" in window ? new BroadcastChannel(channelName(ch)) : null;
  let gotState = false;
  if (bc) {
    bc.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === "state") {
        gotState = true;
        load(m.info, { edits: m.edits, selection: m.selection }).then(() => {
          if (m.current != null) player.goScene(m.current);
        });
      } else if (m.type === "nav") {
        player.goScene(m.index);
      }
    };
    bc.postMessage({ type: "hello" });
  }
  // Without the node (closed workflow, page reloaded later): what the link was opened with.
  if (params.get("data")) {
    let sel = null, edits = [];
    try { sel = JSON.parse(params.get("sel") || "null"); edits = JSON.parse(params.get("edits") || "[]"); } catch { /* ignore */ }
    setTimeout(() => {
      if (!gotState) load({ data: params.get("data"), subfolder: params.get("subfolder"), type: params.get("type") },
        { edits, selection: sel });
    }, bc ? 800 : 0);
  }
  return player;
}

/** The export dialog for a Selected Scenes player: exactly the scenes it plays. */
export function openSelectedExport(x, getInfo, getState, fetchJSON, onFinished) {
  const frames = x.list.reduce((n, i) => n + (x.segs[i].end - x.segs[i].start), 0);
  const st = getState() || {};
  return openExportDialog({
    fetchJSON,
    source: x.source,
    scopes: [{ id: "list", label: x.all ? "全部分镜（未选择）" : "这些选中的片段", count: x.list.length, frames }],
    scope: "list",
    request: () => ({
      data: getInfo().data, scope: "list", indices: x.list,
      review: { base: x.base, edits: st.edits || [], selection: st.selection || (x.all ? [] : x.list) },
    }),
    onFinished,
  });
}
