// 相对路径，⛔ 不写 /extensions/Comfyui-XiaoHei/ 绝对 URL ——
// 粉丝把解压出来的目录改个名（Comfyui-XiaoHei-main 之类）绝对路径就全断，
// 这个文件及其依赖的 scenecut.js / selected_core.js 会整份不执行。
import { xhIconMask, xhIconUrl } from "../xh_icons/index.mjs";
import { T, onUiLang } from "./i18n_ui.js";

// 家族图标助手：所有图案走 js/xh_icons，⛔ 不写死 SVG / 不用符号冒充图标。
export function setXhScBtnIcon(btn, name, size = 14) {
  btn.replaceChildren(xhIconMask(name, { size, color: "current" }));
}
export function setXhScBtnLabel(btn, name, label, size = 14) {
  btn.replaceChildren(xhIconMask(name, { size, color: "current" }), document.createTextNode(" " + label));
}
export function xhScIconHTML(name, size = 15) {
  const u = xhIconUrl(name);
  return `<span class="sc-icon" style="display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;-webkit-mask:url('${u}') center/contain no-repeat;mask:url('${u}') center/contain no-repeat;background:currentColor"></span>`;
}
// SceneCut timeline viewer. Runs inside the "分镜审阅器" node and in the standalone HTML
// report; both hand it the JSON written by scenecut/viewer.py.
//
//   new XH_SceneCutViewer(container, {
//     resolve: (fileName) => url,     // where the proxy and sprite files are
//     standalone,                     // the HTML report: always the large layout
//     onExpand,                       // "Large view" button
//     onReviewChange(review),         // edits or selection changed: {base, edits, selection}
//     onFix(mode, frame, edits),      // -> Promise<{cut, to} | {error}>; enables the fix buttons
//     onExport({ review, selected, segs, source }),  // "导出" button: clips + scenes.json
//   })
//   viewer.load(data); viewer.setReview(review); viewer.destroy();
//
// No dependencies. Everything visual is scoped under .scv-.

const CSS = `
.scv-root { position: relative; width: 100%; height: 100%; box-sizing: border-box; display: grid;
  grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(120px, 1fr) auto auto auto auto auto;
  grid-template-areas: "video" "bar" "review" "timeline" "details" "strip";
  background: #16161a; color: #e6e6ea; font: 12px/1.35 var(--font-sans, ui-sans-serif, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
  overflow: hidden; outline: none; user-select: none; }
.scv-root.scv-large { grid-template-columns: minmax(0, 1fr) 330px;
  grid-template-rows: minmax(160px, 1fr) auto auto auto minmax(120px, 34%);
  grid-template-areas: "视频详情" "bar details" "review details" "timeline timeline" "strip strip"; }
.scv-root * { box-sizing: border-box; }
.scv-video { grid-area: video; position: relative; background: #000; min-height: 0; display: flex;
  align-items: center; justify-content: center; overflow: hidden; }
.scv-video video, .scv-video canvas { max-width: 100%; max-height: 100%; width: auto; height: 100%; display: block; }
.scv-badge { position: absolute; left: 8px; top: 8px; padding: 2px 8px; border-radius: 10px;
  background: rgba(0,0,0,.6); font-size: 11px; pointer-events: none; }
.scv-badge.scv-in { background: rgba(46,160,90,.85); }
.scv-expand { position: absolute; right: 8px; top: 8px; z-index: 3; display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,.25); background: #2f6fd6;
  color: #fff; font: 600 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif); cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.45); }
.scv-expand:hover { background: #3d7ff0; }
.scv-expand svg { width: 14px; height: 14px; }
.scv-note { position: absolute; inset: auto 0 8px 0; text-align: center; color: #aaa; font-size: 11px; pointer-events: none; }
.scv-toast { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 4; max-width: 90%;
  padding: 6px 12px; border-radius: 8px; background: rgba(20,20,24,.92); border: 1px solid #44444e;
  font-size: 12px; pointer-events: none; opacity: 0; transition: opacity .2s; text-align: center; }
.scv-toast.scv-show { opacity: 1; }
.scv-toast.scv-err { border-color: #e57373; color: #ffb4b4; }
.scv-toast.scv-ok { border-color: #3ecf6e; }
.scv-hint { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 6;
  padding: 10px 16px; border-radius: 10px; background: rgba(15,15,18,.9); border: 1px solid #55555f;
  font-size: 13px; pointer-events: none; opacity: 0; transition: opacity .25s; white-space: nowrap; }
.scv-hint.scv-show { opacity: 1; }
.scv-hint kbd { padding: 1px 6px; border-radius: 4px; border: 1px solid #77777f; background: #2a2a31; font: inherit; }
.scv-bar, .scv-review { display: flex; align-items: center; gap: 4px; padding: 5px 8px;
  background: #1e1e23; border-top: 1px solid #2c2c33; flex-wrap: wrap; }
.scv-bar { grid-area: bar; }
.scv-review { grid-area: review; background: #1b1b20; }
.scv-btn { background: #2a2a31; color: #e6e6ea; border: 1px solid #3a3a43; border-radius: 5px;
  padding: 2px 8px; min-width: 28px; height: 24px; cursor: pointer; font: inherit; white-space: nowrap; }
.scv-btn:hover:not(:disabled) { background: #34343c; }
.scv-btn:disabled { opacity: .45; cursor: default; }
.scv-btn.scv-on { background: #2f5fb3; border-color: #2f5fb3; }
.scv-btn.scv-green { border-color: #2e8b57; }
.scv-btn.scv-green.scv-on { background: #2e8b57; border-color: #2e8b57; }
.scv-btn.scv-primary { background: #2e8b57; border-color: #2e8b57; color: #fff; }
.scv-btn.scv-primary:hover:not(:disabled) { background: #36a066; }
.scv-sep { width: 1px; height: 18px; background: #34343c; margin: 0 4px; }
.scv-count { color: #9a9aa6; padding: 0 4px; white-space: nowrap; }
.scv-count b { color: #6fdc8c; }
.scv-tc { font-variant-numeric: tabular-nums; padding: 0 8px; color: #fff; white-space: nowrap; }
.scv-dim { color: #9a9aa6; }
.scv-spacer { flex: 1; }
.scv-stale { grid-area: review; }
.scv-timeline { grid-area: timeline; position: relative; height: 92px; background: #101013;
  border-top: 1px solid #2c2c33; cursor: crosshair; }
.scv-timeline canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.scv-tip { position: absolute; z-index: 5; max-width: 320px; padding: 6px 8px; background: #26262d;
  border: 1px solid #44444e; border-radius: 6px; pointer-events: none; white-space: normal;
  box-shadow: 0 4px 16px rgba(0,0,0,.4); font-size: 11.5px; }
.scv-details { grid-area: details; padding: 8px 10px; background: #1a1a1f; border-top: 1px solid #2c2c33;
  overflow-y: auto; min-height: 0; max-height: 140px; user-select: text; }
.scv-root.scv-large .scv-details { border-top: none; border-left: 1px solid #2c2c33; max-height: none; }
.scv-details h4 { margin: 0 0 4px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.scv-details .scv-kv { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; margin: 4px 0; }
.scv-details .scv-k { color: #9a9aa6; }
.scv-details .scv-sec { margin-top: 8px; padding-top: 6px; border-top: 1px solid #2a2a30; }
.scv-meter { position: relative; height: 6px; background: #2a2a31; border-radius: 3px; margin: 3px 0 2px; }
.scv-meter > i { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 3px; }
.scv-meter > b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #fff; }
.scv-link { color: #8fb4ff; cursor: pointer; }
.scv-link:hover { text-decoration: underline; }
.scv-edited { color: #4dd0e1; }
.scv-strip { grid-area: strip; display: flex; gap: 8px; padding: 8px; overflow-x: auto; overflow-y: hidden;
  background: #141418; border-top: 1px solid #2c2c33; min-height: 0; }
.scv-root.scv-large .scv-strip { flex-wrap: wrap; overflow-y: auto; overflow-x: hidden; align-content: flex-start; }
.scv-card { position: relative; flex: none; width: 132px; border-radius: 6px; background: #1f1f25;
  border: 2px solid #2c2c33; cursor: pointer; overflow: hidden; content-visibility: auto;
  contain-intrinsic-size: 132px 112px; }
.scv-card:hover { border-color: #55555f; }
.scv-card.scv-picked { border-color: #3ecf6e; background: #1c2a21; }
.scv-card.scv-focus { outline: 2px solid #6ea8ff; outline-offset: 2px; }
.scv-thumb { position: relative; width: 100%; background-color: #26262c; background-repeat: no-repeat;
  border-top: 3px solid transparent; }
.scv-prog { position: absolute; left: 0; bottom: 0; height: 3px; background: #fff; display: none;
  box-shadow: 0 0 4px rgba(0,0,0,.8); }
.scv-card.scv-playing .scv-prog { display: block; }
.scv-play { position: absolute; left: 4px; bottom: 6px; font-size: 10px; padding: 0 4px; border-radius: 3px;
  background: rgba(0,0,0,.7); color: #fff; display: none; }
.scv-card.scv-playing .scv-play { display: block; }
.scv-check { position: absolute; right: 4px; top: 4px; width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.85); background: rgba(0,0,0,.45); color: transparent;
  display: flex; align-items: center; justify-content: center; font: bold 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif); opacity: 0;
  transition: opacity .1s; }
.scv-card:hover .scv-check { opacity: 1; }
.scv-check:hover { background: rgba(62,207,110,.5); }
.scv-card.scv-picked .scv-check { opacity: 1; background: #3ecf6e; border-color: #3ecf6e; color: #0b2414; }
.scv-card .scv-l1 { display: flex; gap: 6px; padding: 3px 6px 0; font-size: 11.5px; }
.scv-card .scv-l2 { padding: 0 6px 4px; font-size: 10.5px; color: #9a9aa6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scv-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; padding: 8px; }
.scv-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.6); padding: 2.5vh 2.5vw; }
.scv-overlay > .scv-root { border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
`;

export const REL_COLORS = { start: "#777", hard_cut: "#4285f4", sudden_jump: "#ab47bc", transition: "#fb8c00",
  manual: "#00acc1" };
export const REL_LABELS = { start: "起点", hard_cut: "切点", sudden_jump: "跳切", transition: "转场之后",
  manual: "手动切点" };
export const PICK_COLOR = "#3ecf6e";
export const EDIT_COLOR = "#4dd0e1";
const STAGE_COLORS = { validate: "#e53935", validate_flash: "#f06292", min_length: "#9e9e9e",
  ultra_short: "#7a7a7a", transitions: "#fb8c00", snap: "#bdbdbd", detect: "#bdbdbd" };
const STAGE_LABELS = { validate: "复核", validate_flash: "闪光碎片", min_length: "太短",
  ultra_short: "碎片", transitions: "转场", snap: "吸附", detect: "检测器" };
const REASONS = {
  keep_hard_discontinuity: "画面明显断裂", keep_adj_strong_cut: "相邻帧变化强烈",
  merge_same_shot: "两侧是同一个镜头", merge_same_shot_sscd: "同一镜头（SSCD）",
  keep_cut_sscd: "不同镜头（SSCD）", keep_flash_strong_cut: "闪光，但也是真切点",
  merge_flash: "相机闪光，不是切点", keep_flash_low_conf: "闪光较弱，保留切点",
  default_keep: "保留：没有反对证据", short_guard_keep: "保留：紧邻极短镜头",
  short_guard_merge_flash: "合并：极短镜头旁的闪光",
  keep_after_transition: "转场前是另一个场景",
};
// 语言切换时原地刷新：对象引用被别的模块 import，⛔ 不能整体替换。
export function relangSceneCutTables() {
  REL_LABELS.start = T("relStart");
  REL_LABELS.transition = T("relAfterTransition");
  STAGE_LABELS.validate = T("stageValidation");
  STAGE_LABELS.validate_flash = T("stageFlashSliver");
  STAGE_LABELS.min_length = T("stageTooShort");
  STAGE_LABELS.ultra_short = T("stageFragment");
  STAGE_LABELS.transitions = T("stageTransition");
  STAGE_LABELS.snap = T("stageSnap");
  REASONS.keep_hard_discontinuity = T("reasonKeepHard");
  REASONS.keep_adj_strong_cut = T("reasonKeepAdj");
  REASONS.merge_same_shot = T("reasonMergeSame");
  REASONS.merge_same_shot_sscd = T("reasonMergeSameSscd");
  REASONS.keep_cut_sscd = T("reasonKeepCutSscd");
  REASONS.keep_flash_low_conf = T("reasonKeepFlashLow");
  REASONS.short_guard_keep = T("reasonShortGuardKeep");
  REASONS.short_guard_merge_flash = T("reasonShortGuardMergeFlash");
}
const EXPAND_ICON = xhScIconHTML("全屏");
const CLOSE_ICON = xhScIconHTML("关闭");

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function fmtTime(sec, fine = true) {
  if (!isFinite(sec)) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = fine ? s.toFixed(3).padStart(6, "0") : String(Math.floor(s)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function reasonText(r) {
  if (!r) return "";
  if (REASONS[r]) return REASONS[r];
  return String(r).replace(/_/g, " ");
}

export function relationOf(s, i) {
  return i === 0 ? "start" : s.relation || "hard_cut";
}

/** The segments after the viewer's cut moves (same rules as scenecut/review.py). */
export function applyEdits(base, edits) {
  const segs = base.map((s) => ({ ...s }));
  const at = new Map(segs.map((s, i) => [s.start, i]));
  for (const e of edits || []) {
    const i = at.get(e.cut);
    if (i == null || i === 0 || e.cut === e.to) continue;
    const a = segs[i - 1], b = segs[i];
    if (!(a.start < e.to && e.to < b.end)) continue;
    at.delete(e.cut); at.set(e.to, i);
    const from = b.edited?.from ?? b.start;
    a.end = e.to; b.start = e.to;
    b.edited = { from, mode: e.mode || "manual" };
  }
  return segs;
}

/** Sprite tile geometry and CSS for thumbnail divs. */
export function tileOf(sp, t) {
  if (!sp || t == null) return null;
  const page = Math.floor(t / sp.perPage), k = t % sp.perPage;
  return { page, x: (k % sp.cols) * sp.tileW, y: Math.floor(k / sp.cols) * sp.tileH, w: sp.tileW, h: sp.tileH };
}

export function thumbStyle(div, sp, t, width, resolve) {
  const tile = tileOf(sp, t);
  if (!tile) return;
  const s = width / sp.tileW, size = sp.pageSizes[tile.page];
  div.style.height = `${Math.round(sp.tileH * s)}px`;
  div.style.backgroundImage = `url("${resolve(sp.pages[tile.page])}")`;
  div.style.backgroundSize = `${size[0] * s}px ${size[1] * s}px`;
  div.style.backgroundPosition = `${-tile.x * s}px ${-tile.y * s}px`;
}

/** Scroll `box` (only) so that `item` is visible; unlike scrollIntoView, the page stays put. */
export function scrollWithin(box, item) {
  if (!box || !item) return;
  const b = box.getBoundingClientRect(), r = item.getBoundingClientRect();
  if (r.left < b.left) box.scrollLeft -= b.left - r.left + 4;
  else if (r.right > b.right) box.scrollLeft += r.right - b.right + 4;
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
}

export function ensureStyle() {
  if (document.getElementById("scv-style")) return;
  const s = el("style");
  s.id = "scv-style";
  s.textContent = CSS;
  document.head.append(s);
}

export class XH_SceneCutViewer {
  constructor(container, opts = {}) {
    ensureStyle();
    this.container = container;
    this.opts = opts;
    this.resolve = opts.resolve || ((n) => n);
    this.data = null;
    this.frame = 0;
    this.focus = -1;               // scene clicked / being inspected (blue outline)
    this.cur = -1;                 // scene under the playhead (progress bar on its card)
    this.picked = new Set();       // selected scenes (green)
    this.anchor = -1;              // for shift+click ranges
    this.edits = [];
    this.onlyPicked = false;
    this.view = [0, 1];            // visible frame range on the timeline
    this.showRejected = true;
    this.loop = false;
    this.follow = true;
    this.sprites = [];
    this._dirty = true;
    this._raf = null;
    this._build();
    this._loopDraw();
    onUiLang(() => this._relang(), "xh-scenecut-viewer");
  }

  // 语言切换：标签表 + 详情区重绘；接线契约值一律不动。
  _relang() {
    try {
      relangSceneCutTables();
      const i = this.focus >= 0 ? this.focus : this.cur;
      if (i >= 0) this._renderDetails(i);
      this._dirty = true;
    } catch (e) { /* 数据还没加载，等下次 */ }
  }

  get editable() { return !!this.opts.onFix; }

  // ------------------------------------------------------------------ DOM
  _build() {
    const root = this.root = el("div", "scv-root");
    root.tabIndex = 0;
    root.sceneCutViewer = this;          // handy from the devtools console
    this.videoBox = el("div", "scv-video");
    this.badge = el("div", "scv-badge", "");
    this.note = el("div", "scv-note", "");
    this.toastEl = el("div", "scv-toast");
    this.hintEl = el("div", "scv-hint");
    this.videoBox.append(this.badge, this.note, this.toastEl);
    if (this.opts.onExpand) {
      this.expandBtn = el("button", "scv-expand");
      this.expandBtn.addEventListener("click", (e) => { e.stopPropagation(); this.opts.onExpand(); });
      this.setExpanded(false);
      this.videoBox.append(this.expandBtn);
    }

    const mkbtn = (parent, label, title, fn, cls, icon) => {
      const b = el("button", "scv-btn" + (cls ? ` ${cls}` : ""));
      if (icon) setXhScBtnLabel(b, icon, label);
      else b.textContent = label;
      b.title = title;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(e); root.focus({ preventScroll: true }); });
      parent.append(b);
      return b;
    };
    const bar = this.bar = el("div", "scv-bar");
    mkbtn(bar, "", "上一个切点（↑ 或 Shift+←）", () => this.jumpCut(-1), null, "skip-back");
    mkbtn(bar, "", "上一帧（←）", () => this.step(-1), null, "rewind");
    this.playBtn = mkbtn(bar, "", "播放 / 暂停（空格）", () => this.togglePlay(), null, "播放");
    mkbtn(bar, "", "下一帧（→）", () => this.step(1), null, "fast-forward");
    mkbtn(bar, "", "下一个切点（↓ 或 Shift+→）", () => this.jumpCut(1), null, "skip-forward");
    this.tc = el("span", "scv-tc", "0:00.000");
    this.frameInfo = el("span", "scv-dim", "");
    this.sceneInfo = el("span", "scv-dim", "");
    bar.append(this.tc, this.frameInfo, el("span", "scv-dim", " · "), this.sceneInfo, el("span", "scv-spacer"));
    this.loopBtn = mkbtn(bar, "循环片段", "循环你点击的片段（L）", () => this.toggleLoop());
    this.rejBtn = mkbtn(bar, "被移除的切点", "显示被精修与校验移除的切点（R）", () => this.toggleRejected());
    this.rejBtn.classList.add("scv-on");
    mkbtn(bar, "全览", "时间轴显示整个视频（F）", () => this.fit());

    const rv = this.reviewBar = el("div", "scv-review");
    this.pickBtn = mkbtn(rv, "选中片段", "把你点击的片段（或播放头下的片段）加入选择（S）。Ctrl+点卡片切换，Shift+点卡片选连续范围。",
      () => this.togglePick(this._target()), "scv-green", "勾选");
    mkbtn(rv, "全选", "选中所有片段", () => this.pickAll(true));
    mkbtn(rv, "取消全选", "清空选择", () => this.pickAll(false));
    this.onlyBtn = mkbtn(rv, "只看选中", "缩略条只显示选中的片段，时间轴上其余变暗（O）",
      () => this.toggleOnlyPicked(), "scv-green");
    this.countEl = el("span", "scv-count");
    rv.append(this.countEl);
    if (this.editable) {
      rv.append(el("span", "scv-sep"));
      this.fixBtn = mkbtn(rv, "修正切点", "把播放头放在切点附近错误的帧上，再按这个（A）：切点会自动移到画面真正变化的位置（逐帧与前后片段比对）。",
        () => this.fix("auto"));
      this.joinBtn = mkbtn(rv, "并入最近切点", "播放头所在的帧，以及它到本片段最近切点之间的所有帧，一并移到切点另一侧的片段（M）。",
        () => this.fix("manual"));
      this.undoBtn = mkbtn(rv, "撤销", "撤销上一次切点修正（Ctrl+Z）", () => this.undo());
      this.editCount = el("span", "scv-count");
      rv.append(this.editCount);
    }
    if (this.opts.onExport) {
      rv.append(el("span", "scv-spacer"));
      this.exportBtn = mkbtn(rv, "导出片段", "把选中的片段（或全部片段）切成逐帧精确、带声音的视频文件，并写入 scenes.json，保存到 output/xh_scenecut/<video>/（E）",
        () => this.exportScenes(), "scv-primary", "导出");
    }

    this.tl = el("div", "scv-timeline");
    this.canvas = el("canvas");
    this.tip = el("div", "scv-tip");
    this.tip.style.display = "none";
    this.tl.append(this.canvas, this.tip);

    this.details = el("div", "scv-details");
    this.strip = el("div", "scv-strip");
    root.append(this.videoBox, bar, rv, this.tl, this.details, this.strip, this.hintEl);
    this.container.append(root);

    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(root);
    this._bindTimeline();
    this._bindKeys();
    this._updateCounts();
  }

  _layout() {
    const w = this.root.clientWidth;
    this.root.classList.toggle("scv-large", !!this.opts.standalone || w >= 900);
    this._dirty = true;
  }

  setExpanded(on) {
    if (!this.expandBtn) return;
    this.expandBtn.innerHTML = on ? `${CLOSE_ICON}<span>关闭大视图</span>` : `${EXPAND_ICON}<span>打开大视图</span>`;
    this.expandBtn.title = on ? "返回节点（Esc）" : "全窗口打开审阅器";
  }

  toast(text, kind = "", ms = 2600) {
    const t = this.toastEl;
    t.textContent = text;
    t.className = `scv-toast scv-show${kind ? ` scv-${kind}` : ""}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("scv-show"), ms);
  }

  hint(html, ms = 1800) {
    this.hintEl.innerHTML = html;
    this.hintEl.classList.add("scv-show");
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hintEl.classList.remove("scv-show"), ms);
  }

  // ------------------------------------------------------------------ data
  load(data) {
    const keepReview = this.data && this.data.base === data.base;
    this.data = data;
    const src = data.source;
    this.fps = src.fps || 25;
    this.frames = src.frames;
    this.base = data.segments;
    if (!keepReview) {
      this.edits = [];
      this.picked = new Set(data.selection || []);
      this.focus = -1;
      this.anchor = -1;
    }
    this._recompute();
    this.view = [0, this.frames];
    this.sprites = (data.sprites?.pages || []).map((p) => {
      const img = new Image();
      img.onload = () => { this._dirty = true; };
      img.src = this.resolve(p);
      return img;
    });
    this._setupMedia();
    this._buildStrip();
    this.cur = -1;
    this._setFrame(0, true);
    this._layout();
    this._updateCounts();
  }

  /** Apply a stored review ({base, edits, selection}); returns "applied", "stale" or "empty". */
  setReview(review) {
    if (!this.data) return "empty";
    const r = review || {};
    const has = (r.edits?.length || 0) + (r.selection?.length || 0) > 0;
    if (!has) return "empty";
    if (r.base && r.base !== this.data.base) {
      this.toast(`你之前的审阅（${r.edits?.length || 0} 处修正、选中 ${r.selection?.length || 0} 段）属于另一份分镜列表，未应用。`, "err", 6000);
      return "stale";
    }
    this.edits = (r.edits || []).filter((e) => e && Number.isFinite(e.cut) && Number.isFinite(e.to));
    this.picked = new Set((r.selection || []).filter((i) => i >= 0 && i < this.base.length));
    this._recompute();
    this._buildStrip();
    this._setFrame(this.frame, false, true);
    this._updateCounts();
    return "applied";
  }

  review() {
    return { base: this.data?.base, edits: this.edits.slice(), selection: [...this.picked].sort((a, b) => a - b) };
  }

  _recompute() {
    this.segs = applyEdits(this.base, this.edits);
    this.cutFrames = this.segs.slice(1).map((s) => s.start);
  }

  _changed() {
    this._updateCounts();
    this._dirty = true;
    this.opts.onReviewChange?.(this.review());
  }

  _updateCounts() {
    const n = this.picked.size, total = this.segs?.length || 0;
    this.countEl.innerHTML = n ? `已选 <b>${n}</b> / 共 ${total}` : `未选择`;
    this.onlyBtn.classList.toggle("scv-on", this.onlyPicked);
    if (this.editCount) {
      this.editCount.textContent = this.edits.length ? `${this.edits.length} 处修正` : "";
      this.undoBtn.disabled = !this.edits.length;
    }
    const t = this._target();
    const on = t >= 0 && this.picked.has(t);
    this.pickBtn.classList.toggle("scv-on", on);
    setXhScBtnLabel(this.pickBtn, "勾选", on ? "已选中" : "选中片段");
  }

  _setupMedia() {
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.remove(); }
    if (this.still) this.still.remove();
    this.video = this.still = null;
    const p = this.data.proxy;
    if (p) {
      const v = this.video = el("video");
      v.preload = "auto";
      v.playsInline = true;
      v.src = this.resolve(p.file);
      v.addEventListener("play", () => { setXhScBtnIcon(this.playBtn, "暂停"); this._watchFrames(); });
      v.addEventListener("pause", () => { setXhScBtnIcon(this.playBtn, "播放"); this._syncFromVideo(); });
      v.addEventListener("seeked", () => this._syncFromVideo());
      v.addEventListener("click", () => this.togglePlay());
      this.videoBox.prepend(v);
      this.note.textContent = "";
    } else {
      this.still = el("canvas");
      this.videoBox.prepend(this.still);
      this.note.textContent = "没有预览代理：只有缩略图（在节点上开启 `proxy` 才能播放）。";
    }
  }

  // ------------------------------------------------------------------ frames and playback
  segAt(f) {
    let lo = 0, hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segs[mid].start <= f) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  _target() {
    return this.focus >= 0 ? this.focus : this.cur;
  }

  _setFrame(f, seek, force = false) {
    if (!this.data) return;
    f = Math.max(0, Math.min(this.frames - 1, Math.round(f)));
    this.frame = f;
    if (seek && this.video) {
      this.video.currentTime = (f + 0.5) / this.fps;
    }
    const i = this.segAt(f);
    if (i !== this.cur || force) {
      this.cur = i;
      this._markCards();
      if (this.focus < 0 || !this.loop) this._renderDetails(this.focus >= 0 ? this.focus : i);
      this._updateCounts();
    }
    this._updateProgress();
    const s = this.segs[i];
    this.tc.textContent = fmtTime(f / this.fps);
    this.frameInfo.textContent = `${T("frame")} ${f} / ${this.frames - 1}`;
    this.sceneInfo.textContent = `${T("rowScene")} ${i + 1} / ${this.segs.length} · ${T("frame")} ${f - s.start + 1} ${T("of")} ${s.end - s.start}`;
    const kind = s.kind === "transition" ? ` ${s.transition}` : "";
    this.badge.textContent = `#${i + 1}${kind}${this.picked.has(i) ? "  ✓ 已选中" : ""}`;
    this.badge.classList.toggle("scv-in", this.picked.has(i));
    if (this.still) this._drawStill(i);
    if (this.follow) this._keepVisible(f);
    this._dirty = true;
  }

  _syncFromVideo(mediaTime) {
    if (!this.video) return;
    const t = mediaTime ?? this.video.currentTime;
    const f = Math.floor(t * this.fps + 1e-3);
    if (this.loop && this.focus >= 0 && !this.video.paused) {
      const s = this.segs[this.focus];
      if (f >= s.end || f < s.start) { this._setFrame(s.start, true); return; }
    }
    if (f !== this.frame) this._setFrame(f, false);
  }

  _watchFrames() {
    const v = this.video;
    if (!v) return;
    if (v.requestVideoFrameCallback) {
      const cb = (_, meta) => {
        this._syncFromVideo(meta.mediaTime);
        if (!v.paused) v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
    } else {
      const tick = () => { this._syncFromVideo(); if (!v.paused) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  }

  togglePlay() {
    if (!this.video) return;
    if (this.video.paused) {
      if (this.loop && this.focus >= 0) {
        const s = this.segs[this.focus];
        if (this.frame < s.start || this.frame >= s.end - 1) this._setFrame(s.start, true);
      }
      this.video.play();
    } else this.video.pause();
  }

  step(d) {
    if (this.video && !this.video.paused) this.video.pause();
    this._setFrame(this.frame + d, true);
  }

  jumpCut(d) {
    const cuts = this.cutFrames;
    if (!cuts.length) return;
    let target;
    if (d > 0) target = cuts.find((c) => c > this.frame);
    else target = [...cuts].reverse().find((c) => c < this.frame);
    if (target == null) target = d > 0 ? this.frames - 1 : 0;
    this.step(target - this.frame);
  }

  focusScene(i, play = false) {
    this.focus = i;
    this.anchor = i;
    this._markCards();
    this._renderDetails(i);
    const s = this.segs[i];
    this._zoomTo(s.start, s.end);
    this._setFrame(s.start, true);
    this._updateCounts();
    if (play && this.video) { this.loop = true; this.loopBtn.classList.add("scv-on"); this.video.play(); }
  }

  toggleLoop() {
    this.loop = !this.loop;
    this.loopBtn.classList.toggle("scv-on", this.loop);
    if (this.loop && this.focus < 0) this.focus = this.cur;
    this._markCards();
  }

  toggleRejected() {
    this.showRejected = !this.showRejected;
    this.rejBtn.classList.toggle("scv-on", this.showRejected);
    this._dirty = true;
  }

  // ------------------------------------------------------------------ selection
  togglePick(i, on) {
    if (i == null || i < 0 || !this.segs || i >= this.segs.length) return;
    const want = on ?? !this.picked.has(i);
    if (want) this.picked.add(i); else this.picked.delete(i);
    this._markCards();
    this._setFrame(this.frame, false, true);
    this._changed();
  }

  pickRange(a, b) {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i++) this.picked.add(i);
    this._markCards();
    this._setFrame(this.frame, false, true);
    this._changed();
  }

  pickAll(on) {
    this.picked = on ? new Set(this.segs.map((_, i) => i)) : new Set();
    if (!on && this.onlyPicked) this.onlyPicked = false;
    this._markCards();
    this._applyFilter();
    this._setFrame(this.frame, false, true);
    this._changed();
  }

  toggleOnlyPicked() {
    this.onlyPicked = !this.onlyPicked;
    if (this.onlyPicked && !this.picked.size) this.toast("还没选片段：点卡片上的圆圈、按 S，或 Ctrl+点卡片。");
    this._applyFilter();
    this._updateCounts();
    this._dirty = true;
  }

  _applyFilter() {
    if (!this.cards) return;
    this.cards.forEach((c, i) => { c.style.display = this.onlyPicked && !this.picked.has(i) ? "none" : ""; });
    this._emptyNote?.remove();
    if (this.onlyPicked && !this.picked.size) {
      this._emptyNote = el("div", "scv-empty", "没有选中片段。");
      this.strip.append(this._emptyNote);
    }
  }

  // ------------------------------------------------------------------ cut fixes and saving
  async fix(mode) {
    if (!this.opts.onFix || this._busy) return;
    if (this.video && !this.video.paused) this.video.pause();
    this._busy = true;
    this.toast(mode === "auto" ? "正在寻找画面真正变化的帧……" : "正在移动切点……", "", 8000);
    try {
      const r = await this.opts.onFix(mode, this.frame, this.edits.slice());
      if (!r || r.error) { this.toast(r?.error || "无法修正这个切点。", "err", 5000); return; }
      const k = this.cutFrames.indexOf(r.cut) + 1;
      if (r.to === r.cut) {
        this.toast(`第 ${k + 1} 个切点（第 ${r.cut} 帧）已经在画面变化的位置了。`, "ok");
        return;
      }
      this.edits.push({ cut: r.cut, to: r.to, mode: r.mode || mode });
      this._recompute();
      this._buildStrip();
      this._setFrame(this.frame, false, true);
      this._renderDetails(this._target());
      const moved = r.to - r.cut;
      this.toast(`片段 ${k + 1} 前的切点已从 ${r.cut} 移到 ${r.to}（${moved > 0 ? "+" : ""}${moved} 帧）。Ctrl+Z 可撤销。`, "ok", 4000);
      this._changed();
    } catch (err) {
      this.toast(`修正切点失败：${err.message || err}`, "err", 5000);
    } finally {
      this._busy = false;
    }
  }

  undo() {
    const e = this.edits.pop();
    if (!e) return;
    this._recompute();
    this._buildStrip();
    this._setFrame(this.frame, false, true);
    this.toast(`已撤销：切点 ${e.cut} → ${e.to}`);
    this._changed();
  }

  exportScenes() {
    if (!this.opts.onExport || !this.data) return;
    if (this.video && !this.video.paused) this.video.pause();
    this.opts.onExport({ review: this.review(), selected: [...this.picked], segs: this.segs, source: this.data.source });
  }

  // ------------------------------------------------------------------ thumbnails
  _tile(t) { return tileOf(this.data.sprites, t); }

  _thumbStyle(div, t, width) { thumbStyle(div, this.data.sprites, t, width, this.resolve); }

  _drawStill(i) {
    const tiles = this.segs[i].tiles || [];
    const tile = this._tile(tiles[Math.floor(tiles.length / 2)]);
    const c = this.still;
    if (!tile) return;
    const img = this.sprites[tile.page];
    c.width = tile.w * 2; c.height = tile.h * 2;
    const g = c.getContext("2d");
    if (img && img.complete) g.drawImage(img, tile.x, tile.y, tile.w, tile.h, 0, 0, c.width, c.height);
    else img?.addEventListener("load", () => this._drawStill(i), { once: true });
  }

  // ------------------------------------------------------------------ scene strip
  _buildStrip() {
    const scroll = [this.strip.scrollLeft, this.strip.scrollTop];
    this.strip.replaceChildren();
    this.cards = this.segs.map((s, i) => {
      const card = el("div", "scv-card");
      const th = el("div", "scv-thumb");
      const rel = relationOf(s, i);
      th.style.borderTopColor = s.kind === "transition" ? REL_COLORS.transition : REL_COLORS[rel] || REL_COLORS.hard_cut;
      const tiles = s.tiles || [];
      const mid = tiles[Math.floor(tiles.length / 2)];
      this._thumbStyle(th, mid, 128);
      if (tiles.length > 1) {
        th.addEventListener("mousemove", (e) => {
          const k = Math.min(tiles.length - 1, Math.floor((e.offsetX / th.clientWidth) * tiles.length));
          this._thumbStyle(th, tiles[k], 128);
        });
        th.addEventListener("mouseleave", () => this._thumbStyle(th, mid, 128));
      }
      const check = el("div", "scv-check");
      check.append(xhIconMask("勾选", { size: 12, color: "current" }));
      check.title = "选中 / 取消选中这个片段";
      check.addEventListener("click", (e) => { e.stopPropagation(); this.anchor = i; this.togglePick(i); });
      check.addEventListener("dblclick", (e) => e.stopPropagation());
      const prog = el("div", "scv-prog");
      const playLbl = el("div", "scv-play");
      playLbl.append(xhIconMask("播放", { size: 10, color: "current" }), document.createTextNode(" 播放头"));
      th.append(check, prog, playLbl);
      const l1 = el("div", "scv-l1");
      l1.append(el("b", null, `#${i + 1}`));
      const tag = el("span", null, s.kind === "transition" ? s.transition : REL_LABELS[rel] || rel);
      tag.style.color = s.kind === "transition" ? REL_COLORS.transition : REL_COLORS[rel] || "#ccc";
      l1.append(tag);
      if (s.validation) { const vk = el("span", "scv-dim"); vk.append(xhIconMask("勾选", { size: 11, color: "current" })); l1.append(vk); }
      if (s.edited) { const ek = el("span", "scv-edited"); ek.append(xhIconMask("编辑", { size: 11, color: "current" })); l1.append(ek); }
      const len = (s.end - s.start) / this.fps;
      const extra = (s.absorbed || []).map((a) => `+${a.transition || "转场"}`).join(" ");
      const l2 = el("div", "scv-l2", `${fmtTime(s.start / this.fps)} · ${len.toFixed(2)}s ${extra}`);
      card.append(th, l1, l2);
      card.title = `${T("sceneTip")} ${i + 1}: ${T("framesTip")} ${s.start}-${s.end - 1}.\n${T("cardClick")}\n${T("cardCtrl")}`;
      card.addEventListener("click", (e) => this._cardClick(i, e));
      card.addEventListener("dblclick", (e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) this.focusScene(i, true); });
      this.strip.append(card);
      return card;
    });
    this._markCards();
    this._applyFilter();
    this.strip.scrollLeft = scroll[0];
    this.strip.scrollTop = scroll[1];
  }

  _cardClick(i, e) {
    if (e.ctrlKey || e.metaKey) {
      this.anchor = i;
      this.togglePick(i);
    } else if (e.shiftKey) {
      this.pickRange(this.anchor >= 0 ? this.anchor : i, i);
      this.anchor = i;
    } else {
      this.focusScene(i);
    }
  }

  _markCards() {
    if (!this.cards) return;
    for (const c of this.strip.querySelectorAll(".scv-focus, .scv-playing")) c.classList.remove("scv-focus", "scv-playing");
    this.cards.forEach((c, i) => c.classList.toggle("scv-picked", this.picked.has(i)));
    const cur = this.cards[this.cur], foc = this.cards[this.focus];
    cur?.classList.add("scv-playing");
    foc?.classList.add("scv-focus");
    this._updateProgress();
    const target = foc || cur;
    if (target && this.follow && target.style.display !== "none") {
      const sr = this.strip.getBoundingClientRect(), cr = target.getBoundingClientRect();
      if (cr.left < sr.left || cr.right > sr.right || cr.top < sr.top || cr.bottom > sr.bottom) {
        scrollWithin(this.strip, target);
      }
    }
  }

  _updateProgress() {
    const card = this.cards?.[this.cur];
    if (!card) return;
    const s = this.segs[this.cur];
    const p = card.querySelector(".scv-prog");
    if (p) p.style.width = `${Math.max(3, ((this.frame - s.start + 1) / (s.end - s.start)) * 100)}%`;
  }

  // ------------------------------------------------------------------ details panel
  _renderDetails(i) {
    const s = this.segs?.[i];
    if (!s) return;
    const d = this.details;
    d.replaceChildren();
    const fps = this.fps;
    const head = el("h4", null, `片段 ${i + 1}`);
    if (s.kind === "transition") head.append(el("span", "scv-dim", `${s.transition} 转场`));
    const pick = el("button", "scv-btn scv-green" + (this.picked.has(i) ? " scv-on" : ""));
      setXhScBtnLabel(pick, "勾选", this.picked.has(i) ? "已选中" : "选中");
    pick.title = "加入 / 移出选择（S）";
    pick.addEventListener("click", (e) => { e.stopPropagation(); this.togglePick(i); this._renderDetails(i); });
    head.append(el("span", "scv-spacer"), pick);
    d.append(head);
    const kv = (rows) => {
      const g = el("div", "scv-kv");
      for (const [k, v] of rows) { if (v == null) continue; g.append(el("span", "scv-k", k), el("span", null, v)); }
      return g;
    };
    d.append(kv([
      [T("rowFrames"), `${s.start} – ${s.end - 1}  (${s.end - s.start})`],
      [T("rowTime"), `${fmtTime(s.start / fps)} → ${fmtTime(s.end / fps)}`],
      [T("rowLength"), `${((s.end - s.start) / fps).toFixed(3)} s`],
    ]));

    if (i > 0) {
      const sec = el("div", "scv-sec");
      const rel = s.relation || "hard_cut";
      const t = el("div", null, "切点前移：");
      const tag = el("b", null, REL_LABELS[rel] || rel);
      tag.style.color = REL_COLORS[rel] || "#ccc";
      t.append(tag);
      sec.append(t);
      const rows = [];
      if (s.edited) rows.push([T("fixed"), `${T("byYouFrom")} ${s.edited.from} (${s.start - s.edited.from > 0 ? "+" : ""}${s.start - s.edited.from}，${s.edited.mode === "auto" ? T("fixCut") : T("joinNearest")})`]);
      if (s.confidence != null) rows.push(["检测器", `${(s.confidence * 100).toFixed(1)}% ${T("pctSure")}`]);
      if (s.detectedFrame != null) rows.push(["已移动", `${T("byRefinement")} ${s.detectedFrame} (${s.start - s.detectedFrame > 0 ? "+" : ""}${s.start - s.detectedFrame})`]);
      const g = kv(rows);
      if (s.edited) g.children[1]?.classList.add("scv-edited");
      sec.append(g);
      if (s.validation) sec.append(this._validationBlock(s.validation));
      d.append(sec);
    }
    if (s.absorbed?.length) {
      const sec = el("div", "scv-sec", T("transitionsInside"));
      for (const a of s.absorbed) {
        const l = el("div", "scv-link", `${a.transition || "转场"}  第 ${a.start}–${a.end - 1} 帧`);
        l.addEventListener("click", () => this._setFrame(a.start, true));
        sec.append(l);
      }
      d.append(sec);
    }
    const inside = (this.data.rejected || []).filter((r) => r.frame > s.start && r.frame < s.end);
    if (inside.length) {
      const sec = el("div", "scv-sec", `内部被移除的切点（${inside.length}）：`);
      for (const r of inside.slice(0, 40)) {
        const l = el("div", "scv-link", `${T("frame")} ${r.frame} · ${STAGE_LABELS[r.stage] || r.stage}: ${reasonText(r.reason)}`);
        l.style.color = STAGE_COLORS[r.stage] || "#ccc";
        l.title = r.validation ? this._scoresText(r.validation) : "";
        l.addEventListener("click", () => { this._setFrame(r.frame, true); this._showRejected(r); });
        sec.append(l);
      }
      d.append(sec);
    }
  }

  _showRejected(r) {
    this.tip.style.display = "none";
    const d = this.details;
    const sec = el("div", "scv-sec");
    const t = el("div", null, `已移除第 ${r.frame} 帧的切点：`);
    const b = el("b", null, STAGE_LABELS[r.stage] || r.stage);
    b.style.color = STAGE_COLORS[r.stage] || "#ccc";
    t.append(b);
    sec.append(t, el("div", "scv-dim", reasonText(r.reason)));
    if (r.validation) sec.append(this._validationBlock(r.validation));
    d.prepend(sec);
  }

  _validationBlock(v) {
    const box = el("div");
    const head = el("div", null, `${T("validation")} `);
    const dec = el("b", null, T(v.decision === "merge" ? "merged" : "kept"));
    dec.style.color = v.decision === "merge" ? STAGE_COLORS.validate : "#66bb6a";
    head.append(dec, el("span", "scv-dim", ` — ${reasonText(v.guard || v.reason)}`));
    box.append(head);
    if (v.s_blend != null && v.threshold != null) {
      const m = el("div", "scv-meter");
      const fill = el("i");
      fill.style.width = `${Math.max(0, Math.min(1, v.s_blend)) * 100}%`;
      fill.style.background = v.s_blend >= v.threshold ? "#e57373" : "#64b5f6";
      const mark = el("b");
      mark.style.left = `${v.threshold * 100}%`;
      m.append(fill, mark);
      box.append(el("div", "scv-dim", `同镜头相似度 ${v.s_blend.toFixed(3)}（阈值 ${v.threshold.toFixed(2)}）`), m);
    }
    const rows = [];
    if (v.novelty != null) rows.push([T("abruptness"), v.novelty.toFixed(3)]);
    if (v.s_adj_dense != null) rows.push([T("adjacentFrames"), v.s_adj_dense.toFixed(3)]);
    if (v.motion != null) rows.push([T("motion"), v.motion.toFixed(3)]);
    if (v.flash) rows.push([T("flash"), `是（${(v.flash_conf * 100).toFixed(0)}%，亮度 +${v.flash_amp.toFixed(0)}，持续 ${v.flash_dur} 帧）`]);
    if (v.s_sscd != null) rows.push(["SSCD", v.s_sscd.toFixed(3)]);
    if (v.s_lookback != null) rows.push(["转场之前", `相似度 ${v.s_lookback.toFixed(3)}`]);
    if (v.moved_for_flash != null) rows.push(["已移动", `移到 ${v.moved_for_flash}，紧邻闪光`]);
    const g = el("div", "scv-kv");
    for (const [k, val] of rows) g.append(el("span", "scv-k", k), el("span", null, val));
    box.append(g);
    return box;
  }

  _scoresText(v) {
    const parts = [];
    if (v.s_blend != null) parts.push(`相似度 ${v.s_blend.toFixed(3)} 对阈值 ${v.threshold?.toFixed(2)}`);
    if (v.novelty != null) parts.push(`突变度 ${v.novelty.toFixed(3)}`);
    if (v.flash) parts.push(`闪光 ${(v.flash_conf * 100).toFixed(0)}%`);
    return parts.join(" · ");
  }

  // ------------------------------------------------------------------ timeline
  _x(f, w) { return ((f - this.view[0]) / (this.view[1] - this.view[0])) * w; }
  _f(x, w) { return this.view[0] + (x / w) * (this.view[1] - this.view[0]); }

  fit() { this.view = [0, this.frames]; this._dirty = true; }

  _zoomTo(a, b) {
    const span = Math.max(b - a, this.fps * 2);
    const pad = span * 0.6;
    const cur = this.view[1] - this.view[0];
    if (a >= this.view[0] && b <= this.view[1] && cur < span * 8) return;
    this.view = [Math.max(0, a - pad), Math.min(this.frames, b + pad)];
    this._dirty = true;
  }

  _keepVisible(f) {
    const [a, b] = this.view, span = b - a;
    if (f < a || f > b) {
      const na = Math.max(0, Math.min(this.frames - span, f - span * 0.1));
      this.view = [na, na + span];
    }
  }

  _bindTimeline() {
    const tl = this.tl;
    let drag = null;
    const fAt = (e) => this._f(e.offsetX, tl.clientWidth);
    tl.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !this.data || !tl.clientWidth) return;
      e.preventDefault(); e.stopPropagation();
      this.root.focus({ preventScroll: true });
      if (e.ctrlKey || e.metaKey) { this.togglePick(this.segAt(Math.round(fAt(e)))); return; }
      drag = { pan: e.shiftKey, x: e.clientX, view: [...this.view] };
      if (!drag.pan) { this.follow = false; this.step(Math.round(fAt(e)) - this.frame); }
    });
    const move = (e) => {
      if (!drag) return;
      const w = tl.clientWidth;
      if (!w) return;
      if (drag.pan) {
        const df = ((e.clientX - drag.x) / w) * (drag.view[1] - drag.view[0]);
        const span = drag.view[1] - drag.view[0];
        const a = Math.max(0, Math.min(this.frames - span, drag.view[0] - df));
        this.view = [a, a + span];
        this._dirty = true;
      } else {
        const r = tl.getBoundingClientRect();
        this.step(Math.round(this._f(e.clientX - r.left, w)) - this.frame);
      }
    };
    const up = () => { if (drag) { drag = null; this.follow = true; } };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    this._unbind = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    tl.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();
      const w = tl.clientWidth;
      if (!this.data || !w) return;
      const [a, b] = this.view;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const span = b - a, df = ((e.shiftKey ? e.deltaY : e.deltaX) / w) * span;
        const na = Math.max(0, Math.min(this.frames - span, a + df));
        this.view = [na, na + span];
      } else {
        const fc = this._f(e.offsetX, w);
        const k = Math.exp(e.deltaY * 0.0015);
        let span = Math.max(12, Math.min(this.frames, (b - a) * k));
        let na = fc - (fc - a) * (span / (b - a));
        na = Math.max(0, Math.min(this.frames - span, na));
        this.view = [na, na + span];
      }
      this._dirty = true;
    }, { passive: false });
    tl.addEventListener("mousemove", (e) => this._hover(e));
    tl.addEventListener("mouseleave", () => { this.tip.style.display = "none"; this._hoverItem = null; this._dirty = true; });
    tl.addEventListener("dblclick", (e) => { if (!e.ctrlKey && !e.metaKey) this.focusScene(this.segAt(Math.round(fAt(e))), true); });
  }

  _hover(e) {
    if (!this.data || !this.tl.clientWidth) return;
    const w = this.tl.clientWidth, x = e.offsetX, y = e.offsetY;
    const L = this._lanes();
    let item = null;
    const near = (f) => Math.abs(this._x(f, w) - x) <= 4;
    if (this.showRejected && y >= L.rej[0] - 2 && y <= L.rej[1] + 2) {
      const r = (this.data.rejected || []).find((r) => near(r.frame));
      if (r) item = { kind: "被移除的切点", r };
    }
    if (!item && y >= L.seg[0]) {
      const k = this.cutFrames.findIndex((c) => near(c));
      if (k >= 0) item = { kind: "切点", i: k + 1 };
    }
    if (!item) item = { kind: "seg", i: this.segAt(Math.round(this._f(x, w))) };
    this._hoverItem = item;
    const tip = this.tip;
    tip.replaceChildren();
    if (item.kind === "被移除的切点") {
      const r = item.r;
      const b = el("b", null, `已移除切点 · ${STAGE_LABELS[r.stage] || r.stage}`);
      b.style.color = STAGE_COLORS[r.stage] || "#ccc";
      tip.append(b, el("div", null, `第 ${r.frame} 帧 · ${fmtTime(r.frame / this.fps)}`),
        el("div", "scv-dim", reasonText(r.reason)));
      if (r.validation) tip.append(el("div", "scv-dim", this._scoresText(r.validation)));
    } else if (item.kind === "切点") {
      const s = this.segs[item.i], rel = s.relation || "hard_cut";
      const b = el("b", null, `${REL_LABELS[rel] || rel} → 片段 ${item.i + 1}`);
      b.style.color = REL_COLORS[rel] || "#ccc";
      tip.append(b, el("div", null, `第 ${s.start} 帧 · ${fmtTime(s.start / this.fps)}`));
      if (s.edited) tip.append(el("div", "scv-edited", `由你修正，原在第 ${s.edited.from} 帧`));
      if (s.validation) tip.append(el("div", "scv-dim", `已校验：${reasonText(s.validation.guard || s.validation.reason)}`));
      if (s.detectedFrame != null) tip.append(el("div", "scv-dim", `由 ${s.detectedFrame} 帧精修移动而来`));
    } else {
      const s = this.segs[item.i];
      tip.append(el("b", null, `${T("sceneTip")} ${item.i + 1}${s.kind === "transition" ? ` · ${s.transition}` : ""}${this.picked.has(item.i) ? ` · ${T("selectedShort")}` : ""}`),
        el("div", null, `${fmtTime(s.start / this.fps)} · ${((s.end - s.start) / this.fps).toFixed(2)} s`),
        el("div", "scv-dim", `${T("framesTip")} ${s.start}–${s.end - 1}`));
      const tiles = s.tiles || [];
      const t = this._tile(tiles[Math.floor(tiles.length / 2)]);
      if (t) {
        const th = el("div", "scv-thumb");
        th.style.width = "160px";
        this._thumbStyle(th, tiles[Math.floor(tiles.length / 2)], 160);
        th.style.marginTop = "4px";
        tip.append(th);
      }
    }
    tip.style.display = "block";
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = `${Math.max(4, Math.min(w - tw - 4, x + 12))}px`;
    tip.style.top = `${Math.max(2, y - th - 8)}px`;
    if (y - th - 8 < 0) tip.style.top = `${y + 14}px`;
    this._dirty = true;
  }

  _lanes() {
    const h = this.tl.clientHeight;
    const ruler = [0, 16], rej = [h - 14, h - 2];
    return { ruler, seg: [ruler[1] + 2, rej[0] - 4], rej };
  }

  _loopDraw() {
    const tick = () => {
      if (this._dirty) { this._dirty = false; this._draw(); }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _draw() {
    const c = this.canvas, tl = this.tl;
    const dpr = window.devicePixelRatio || 1;
    const w = tl.clientWidth, h = tl.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!this.data) return;
    if (!(this.view[1] > this.view[0]) || !isFinite(this.view[0])) this.view = [0, this.frames];
    const L = this._lanes();
    const [a, b] = this.view;
    const fps = this.fps;

    // ruler
    g.fillStyle = "#1b1b20"; g.fillRect(0, L.ruler[0], w, L.ruler[1]);
    const secSpan = (b - a) / fps;
    const steps = [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    const step = steps.find((s) => (s / secSpan) * w >= 70) || 7200;
    g.fillStyle = "#8a8a96"; g.strokeStyle = "#34343c"; g.font = "10px var(--font-sans, ui-sans-serif, system-ui, sans-serif)";
    for (let t = Math.ceil(a / fps / step) * step; t * fps <= b; t += step) {
      const x = this._x(t * fps, w);
      g.beginPath(); g.moveTo(x + 0.5, 10); g.lineTo(x + 0.5, L.ruler[1]); g.stroke();
      g.fillText(fmtTime(t, step < 1), x + 3, 10);
    }
    // single frames are visible: tick every frame
    if ((b - a) / w < 0.25) {
      g.fillStyle = "#3a3a44";
      for (let f = Math.ceil(a); f <= b; f++) g.fillRect(Math.round(this._x(f, w)), L.ruler[1] - 4, 1, 4);
    }

    // segments
    const [sy0, sy1] = L.seg;
    const sh = sy1 - sy0;
    const first = this.segAt(Math.max(0, Math.floor(a))), last = this.segAt(Math.min(this.frames - 1, Math.ceil(b)));
    const sp = this.data.sprites;
    for (let i = first; i <= last; i++) {
      const s = this.segs[i];
      const x0 = this._x(s.start, w), x1 = this._x(s.end, w);
      const bw = Math.max(1, x1 - x0);
      if (s.kind === "transition") {
        g.fillStyle = "rgba(251,140,0,.35)"; g.fillRect(x0, sy0, bw, sh);
        g.strokeStyle = "rgba(251,140,0,.7)";
        for (let k = x0 - sh; k < x1; k += 6) {
          g.beginPath(); g.moveTo(Math.max(x0, k), sy0 + Math.max(0, x0 - k)); g.lineTo(Math.min(x1, k + sh), sy0 + Math.min(sh, x1 - k)); g.stroke();
        }
      } else {
        g.fillStyle = i === this.focus ? "#3f5b8f" : (i % 2 ? "#33363f" : "#2a2c34");
        g.fillRect(x0, sy0, bw, sh);
        // thumbnail when there is room for it
        const tiles = s.tiles || [];
        if (sp && tiles.length && bw > 28) {
          const tw = Math.min(bw - 4, (sh - 4) * sp.tileW / sp.tileH);
          const t = this._tile(tiles[Math.floor(tiles.length / 2)]);
          const img = t && this.sprites[t.page];
          if (img && img.complete && tw > 20) {
            const thh = tw * sp.tileH / sp.tileW;
            g.globalAlpha = 0.9;
            g.drawImage(img, t.x, t.y, t.w, t.h, x0 + (bw - tw) / 2, sy0 + (sh - thh) / 2, tw, thh);
            g.globalAlpha = 1;
          }
        }
      }
      if (this.onlyPicked && !this.picked.has(i)) { g.fillStyle = "rgba(10,10,12,.7)"; g.fillRect(x0, sy0, bw, sh); }
      if (this.picked.has(i)) { g.fillStyle = PICK_COLOR; g.fillRect(x0, sy0, bw, 4); }
      for (const ab of s.absorbed || []) {
        g.fillStyle = "rgba(251,140,0,.85)";
        g.fillRect(this._x(ab.start, w), sy1 - 4, Math.max(1, this._x(ab.end, w) - this._x(ab.start, w)), 4);
      }
      if (i > 0) {
        const rel = s.relation || "hard_cut";
        g.fillStyle = s.edited ? EDIT_COLOR : REL_COLORS[rel] || REL_COLORS.hard_cut;
        g.fillRect(Math.round(x0) - 1, sy0, 2, sh);
        if (s.validation) { g.beginPath(); g.arc(x0, sy0 + 7, 2.5, 0, 7); g.fillStyle = "#e6e6ea"; g.fill(); }
        if (s.edited) {
          // where the cut was, and a diamond on the fixed cut
          const xo = this._x(s.edited.from, w);
          g.strokeStyle = EDIT_COLOR; g.setLineDash([2, 3]); g.globalAlpha = 0.7;
          g.beginPath(); g.moveTo(Math.round(xo) + 0.5, sy0); g.lineTo(Math.round(xo) + 0.5, sy1); g.stroke();
          g.setLineDash([]); g.globalAlpha = 1;
          g.fillStyle = EDIT_COLOR;
          g.beginPath(); g.moveTo(x0, sy1 - 9); g.lineTo(x0 + 4, sy1 - 5); g.lineTo(x0, sy1 - 1); g.lineTo(x0 - 4, sy1 - 5); g.closePath(); g.fill();
        }
      }
    }
    if (this._hoverItem?.kind === "seg") {
      const s = this.segs[this._hoverItem.i];
      g.strokeStyle = "rgba(255,255,255,.5)";
      g.strokeRect(this._x(s.start, w) + 0.5, sy0 + 0.5, this._x(s.end, w) - this._x(s.start, w) - 1, sh - 1);
    }

    // rejected cuts
    if (this.showRejected) {
      const [ry0, ry1] = L.rej;
      for (const r of this.data.rejected || []) {
        if (r.frame < a || r.frame > b) continue;
        const x = this._x(r.frame, w);
        g.fillStyle = STAGE_COLORS[r.stage] || "#bbb";
        g.beginPath(); g.moveTo(x, ry0); g.lineTo(x - 4, ry1); g.lineTo(x + 4, ry1); g.closePath(); g.fill();
        g.globalAlpha = 0.35; g.fillRect(Math.round(x) - 0.5, sy0, 1, sh); g.globalAlpha = 1;
      }
    }

    // playhead: a band one frame wide when zoomed in enough to see frames
    const x0 = this._x(this.frame, w), x1 = this._x(this.frame + 1, w);
    if (x1 - x0 >= 4) { g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(x0, 0, x1 - x0, h); }
    const px = (x0 + x1) / 2;
    g.fillStyle = "#fff"; g.fillRect(Math.round(px) - 1, 0, 2, h);
    g.beginPath(); g.moveTo(px - 5, 0); g.lineTo(px + 5, 0); g.lineTo(px, 6); g.closePath(); g.fill();
  }

  // ------------------------------------------------------------------ keys
  _bindKeys() {
    this.root.addEventListener("keydown", (e) => {
      if (!this.data) return;
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      let handled = true;
      if (k === " ") this.togglePlay();
      else if (k === "ArrowLeft") e.shiftKey ? this.jumpCut(-1) : this.step(-1);
      else if (k === "ArrowRight") e.shiftKey ? this.jumpCut(1) : this.step(1);
      else if (k === "ArrowUp") this.jumpCut(-1);
      else if (k === "ArrowDown") this.jumpCut(1);
      else if (k === "Home") this.step(-this.frame);
      else if (k === "End") this.step(this.frames - 1 - this.frame);
      else if (ctrl && (k === "z" || k === "Z") && this.editable) this.undo();
      else if (ctrl) handled = false;
      else if (k === "l" || k === "L") this.toggleLoop();
      else if (k === "r" || k === "R") this.toggleRejected();
      else if (k === "f" || k === "F") this.fit();
      else if (k === "s" || k === "S") this.togglePick(this._target());
      else if (k === "o" || k === "O") this.toggleOnlyPicked();
      else if ((k === "e" || k === "E") && this.opts.onExport) this.exportScenes();
      else if ((k === "a" || k === "A") && this.editable) this.fix("auto");
      else if ((k === "m" || k === "M") && this.editable) this.fix("manual");
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    });
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this._unbind?.();
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); }
    this.root.remove();
  }
}

window.XH_SceneCutViewer = XH_SceneCutViewer;
