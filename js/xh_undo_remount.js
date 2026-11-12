//  XiaoHei 家族 · 工作流「加载中」守卫 + Ctrl+Z 后 DOM 控件重挂
// ══════════════════════════════════════════════════════════════════════
// 机制移植自 Pixaroma 的 js/shared/graph_loading.mjs + js/shared/undo_dom_remount.mjs。
//
// ── 为什么需要「加载中」守卫 ────────────────────────────────────────────
//   LiteGraph 恢复存档连线是在**图级别**、且发生在每个节点的 onConfigure
//   返回**之后**。所以任何在 onConnectionsChange 里改「会进工作流 JSON 的状态」
//   （activeIndex / node.size / slots / properties）的节点，重新打开工作流、
//   切标签页、Ctrl+Z 之后，保存的状态会被连线重放覆盖掉。
//   官方没有这个开关 → 这里包一层 app.loadGraphData（打开/切页/撤销的唯一入口）。
//
// ── 为什么需要「撤销后重挂」─────────────────────────────────────────────
//   Nodes 2.0（Vue 渲染）下 Ctrl+Z / Ctrl+Y = app.loadGraphData(旧状态)，
//   它把**每个节点重建成新对象**（id 不变）。而 Vue 的 WidgetDOM 只在
//   onMounted 里挂 widget.element ⇒ 新节点的 element 永远不上页面，
//   页面留着**旧 element**，它绑的是已经作废的旧节点对象。
//   实测（Pixaroma，81 节点工作流）：一次 Ctrl+Z 后 81 个可见控件里 70 个变死，
//   之后在提示词框里打的字进了死对象 ⇒ 保存/运行用的还是老文本。
//    XiaoHei 的 DOM 控件（滑块、时间轴、预览、分段表、音频播放器）全都中招。
//
//   做法：loadGraphData 之前记录每个 XiaoHei DOM widget 的「宿主 div」，
//   load 之后把**活节点**的 widget element 重新 mount 回那个宿主。
//   纯 DOM 操作，不写任何会序列化的东西 ⇒ 不会把工作流标脏。
//   只碰 XiaoHei 家族节点，别人的包一根手指都不动。
//
// 零 Python 改动、零第三方依赖。

const { app } = window.comfyAPI.app;

const CATEGORY_PREFIX = "XiaoHei";

// ═══════════════════════════════════════════════════════════
// ① 加载中守卫
// ═══════════════════════════════════════════════════════════

let _loading = false;

export function isGraphLoading() {
  return _loading;
}

// ═══════════════════════════════════════════════════════════
// ② XiaoHei 节点判定
// ═══════════════════════════════════════════════════════════

/** 节点是否属于 XiaoHei 家族（按 CATEGORY 前缀 + 类型名前缀双判据）。 */
export function iXHNode(node) {
  if (!node) return false;
  const cat = String(node.constructor?.category || node.category || "");
  if (cat.startsWith(CATEGORY_PREFIX)) return true;
  const t = String(node.type || node.comfyClass || "");
  return t.startsWith("XiaoHei") || t.startsWith("XH");
}

/** Nodes 2.0（Vue 渲染）是否启用。实时读，不缓存。 */
export function isVueNodes() {
  try { return !!window.LiteGraph?.vueNodesMode; } catch (e) { return false; }
}

// ═══════════════════════════════════════════════════════════
// ③ 撤销后重挂
// ═══════════════════════════════════════════════════════════

const RETRY_MS = [0, 50, 150, 400, 1000];

/** 调试计数（挂 window，方便真机排查：window.__xhRemountStats）。 */
const STATS = { snapshot: 0, remountCalls: 0, mounted: 0, skipped: 0, waiting: 0, noVue: 0 };
if (typeof window !== "undefined") window.__xhRemountStats = STATS;

/**
 * Nodes 2.0 里每个 widget 的宿主元素 = element 的父节点。
 * Classic 模式下父节点是官方的 .dom-widget 包装（不是我们的，不管，
 * 而且 Classic 也不会 stale —— 它按 widget.id 做 key）。
 */
function hostOf(el) {
  const h = el?.parentElement;
  if (!h || h.classList.contains("dom-widget") || !h.closest(".lg-node")) return null;
  return h;
}

/** load 之前：记下每个 XiaoHei DOM widget 的宿主。 */
function snapshot() {
  const out = [];
  const g = app.canvas?.graph;
  if (!g || !isVueNodes()) { STATS.noVue++; return out; }
  for (const n of g._nodes || []) {
    if (!iXHNode(n)) continue;
    for (const w of n.widgets || []) {
      const el = w?.element;
      if (!(el instanceof HTMLElement) || !el.isConnected || !w.name) continue;
      const host = hostOf(el);
      if (host) out.push({ id: String(n.id), name: w.name, host, oldEl: el, done: false });
    }
  }
  STATS.snapshot += out.length;
  return out;
}

/** load 之后：一轮重挂。返回 true = 还有的要等下一轮。 */
function remount(notes) {
  const g = app.canvas?.graph;
  if (!g || !isVueNodes()) { STATS.noVue++; return false; }
  STATS.remountCalls++;
  let waiting = false;
  for (const s of notes) {
    if (s.done) continue;
    // Vue 自己重渲染了这个节点（换了节点类型 / 切了标签页）：它的新宿主已经挂对了，不管。
    if (!s.host.isConnected) { s.done = true; STATS.skipped++; continue; }
    const nodeEl = s.host.closest(".lg-node");
    if (!nodeEl || nodeEl.getAttribute("data-node-id") !== s.id) { s.done = true; STATS.skipped++; continue; }
    const n = g.getNodeById(s.id);
    if (!n) { waiting = true; STATS.waiting++; continue; }
    if (!iXHNode(n)) { s.done = true; STATS.skipped++; continue; }
    const w = (n.widgets || []).find((x) => x && x.name === s.name);
    const el = w?.element;
    // 节点可能晚一拍才建 DOM widget：下一轮再看。
    if (!(el instanceof HTMLElement)) { waiting = true; STATS.waiting++; continue; }
    // 已经在页面上了（前端修好了，或节点自己重挂过）：不动。
    if (el.isConnected) { s.done = true; STATS.skipped++; continue; }
    // 宿主里已经换了别的东西：绝不能覆盖。
    const first = s.host.firstElementChild;
    if (first && first !== s.oldEl) { s.done = true; STATS.skipped++; continue; }
    try { s.host.replaceChildren(el); } catch (_e) { /* 忽略 */ }
    s.done = true;
    STATS.mounted++;
  }
  return waiting;
}

function schedule(notes, i) {
  setTimeout(() => {
    let again = false;
    try { again = remount(notes); } catch (_e) { again = false; }
    if (again && i + 1 < RETRY_MS.length) schedule(notes, i + 1);
  }, RETRY_MS[i]);
}

/** 调试出口：手工取一次快照 / 手工跑一轮重挂（真机验证用）。 */
export function __xhDebugSnapshot() { return snapshot(); }
export function __xhDebugRemount(notes) { return remount(notes); }

// ═══════════════════════════════════════════════════════════
// ④ 装钩子（只装一次）
// ═══════════════════════════════════════════════════════════

if (app && typeof app.loadGraphData === "function" && !app._xhGraphLoadWrapped) {
  app._xhGraphLoadWrapped = true;
  const _orig = app.loadGraphData;
  app.loadGraphData = function (...args) {
    _loading = true;
    let notes = [];
    try { notes = snapshot(); } catch (_e) { notes = []; }
    let r;
    try {
      r = _orig.apply(this || app, args);
    } finally {
      // loadGraphData 可能同步也可能异步：等它 settle，再留 300ms 尾巴
      // （连线重放晚一拍才落地）。
      Promise.resolve(r).finally(() => {
        setTimeout(() => { _loading = false; }, 300);
        if (notes.length) schedule(notes, 0);
      });
    }
    return r;
  };
}
