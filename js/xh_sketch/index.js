// 小黑·标注 - wiring.
//
// Mark a picture for an edit model: boxes, circles, freehand loops, arrows and
// words drawn right on the node, a note per mark, and out come the marked
// image, a prompt written from the notes, and a mask.
//
// core.mjs state + the prompt mirror | draw.mjs the canvas renderer (mirror of
// the Python drawing) | source.mjs which picture to show | actions.mjs every
// change + undo | input.mjs pointer drawing | controls.mjs shared controls |
// ui.mjs the node face | big.mjs the big view | css.mjs | help.mjs

import { app } from "../../../scripts/app.js";
import { isGraphLoading } from "../shared/graph_loading.mjs";
import { registerNodeHelp } from "../shared/help.mjs";
import { isLiveNode } from "../shared/live_node.mjs";
import { closeNodeSettingsFor, registerNodeAccent } from "../shared/node_settings.mjs";
import { isVueNodes } from "../shared/nodes2.mjs";
import { onRendererChange } from "../shared/renderer_switch.mjs";
import { onRouterChanged } from "../shared/router_changed.mjs";
import { runTab, eachRestoredOutput } from "../shared/run_tab.mjs";
import { onLangChanged } from "../xh_ui_kit.js";
import { CLASS, HIDDEN_INPUT, SETTING_AUTO, injectedState, nextAutoColor, readState } from "./core.mjs";
import { autoColor, uiState } from "./actions.mjs";
import { closeBig, openBig } from "./big.mjs";
import { buildSketchHelp } from "./help.mjs";
import { t } from "./i18n.mjs";
import { loadPicture, runSource, upstreamPicture } from "./source.mjs";
import { MIN_W, WIDGET_NAME, buildFace, contentMin, destroyFace, paintFace, renderFace } from "./ui.mjs";

const DEFAULT_W = 440;
const DEFAULT_H = 640;
const POLL_MS = 700;

registerNodeHelp(CLASS, buildSketchHelp());

registerNodeAccent(CLASS, {
  title: t("accentTitle"),
  rows: [
    {
      kind: "toggle",
      setting: SETTING_AUTO,
      defaultValue: true,
      label: t("accentLabel"),
      hint: t("accentHint"),
    },
  ],
  onRowChange: (node, setting) => {
    if (setting !== SETTING_AUTO) return;
    // Take effect on the NEXT mark: on means "carry on from the last one".
    if (autoColor()) uiState(node).color = nextAutoColor(readState(node).marks);
    node._pixSkRefresh?.(false);
  },
});

// ── which picture the node shows ───────────────────────────────────────────
function onPicture(node) {
  const pic = node._pixSkPic;
  // A run's copy that will not load (the temp folder was cleared) is dropped,
  // and the node falls back to the upstream picture.
  if (pic?.failed && pic.kind === "run" && node._pixSkRun && node._pixSkRun.key === pic.key) {
    node._pixSkRun.failed = true;
    refreshSource(node);
    return;
  }
  paintFace(node);
  node._pixSkBig?.paint?.();
}

function refreshSource(node) {
  if (!node?._pixSkFace) return;
  const up = upstreamPicture(node);
  const run = node._pixSkRun;
  let want = null;
  // The run's copy is the exact picture that came in - trust it for as long as
  // the upstream is the one that produced it.
  if (run && !run.failed && run.forKey === (up ? up.key : null)) want = run;
  else if (up) want = { ...up, kind: "upstream" };
  loadPicture(node, want, () => onPicture(node));
  if (!want) paintFace(node);
}

// ── Classic sizing ─────────────────────────────────────────────────────────
// The node height LiteGraph needs around our body: the slot rows above it
// (widget.y) plus the DOM widget's margin above AND below (DomWidgets.vue:
// height = computedHeight - 2 * margin). COMPUTED, never measured: inside
// onResize node.size is already the new size while the body still has its old
// height (it follows on the next draw), so a measurement there cached a wrong
// value after a row was added or removed, and the floor then let the prompt box
// fall out of the node (measured: 13px at the minimum height).
function chromeH(node) {
  const w = node._pixSkFace?.widget;
  const y = w && w.y > 0 ? w.y : 66;
  const m = w && Number.isFinite(w.margin) ? w.margin : 10;
  return y + 2 * m;
}

function applySketchRun(node, message) {
  const entry = message?.xh_sketch?.[0];
  if (!entry) return;
  // Runtime only, never serialized: the temp copy does not outlive the
  // server, so after a reload the node goes back to the upstream picture.
  node._pixSkRun = runSource(entry, upstreamPicture(node)?.key ?? null);
  refreshSource(node);
}

// ── 装配一个草图节点 ──────────────────────────────────────────────────────
// 幂等：已经有面就直接返回。buildFace 半途抛错会留下「有节点壳、没有 widget」的
// 死状态——ComfyUI 把 onNodeCreated 的异常吞掉，节点就变成一片空白（正是用户
// 看到的样子）。所以失败时清掉半成品 widget 再重试；全失败才打日志，交给 setup
// 里的 heal 兜底，绝不把节点留成空壳。
function mountSketch(node, attempt = 0) {
  if (!node || node._pixSkFace) return;
  try {
    buildFace(node, { onExpand: () => openBig(node) });
  } catch (e) {
    try {
      if (Array.isArray(node.widgets)) node.widgets = node.widgets.filter((w) => w && w.name !== WIDGET_NAME);
      if (Array.isArray(node.domWidgets)) {
        node.domWidgets = node.domWidgets.filter((w) => w && (w.name ?? w.type) !== WIDGET_NAME);
      }
    } catch (e2) {}
    if (attempt < 4) {
      setTimeout(() => mountSketch(node, attempt + 1), 150 * (attempt + 1));
    } else {
      try { console.error("[XiaoHei] 草图节点界面创建失败：", e); } catch (e3) {}
    }
    return;
  }

  node._pixSkRefresh = (structural) => {
    renderFace(node, structural, true);
    node._pixSkBig?.refresh?.(structural);
  };
  // `structural` rebuilds the note rows too. Never a resize: userAction false.
  node._pixSkRepaint = (structural = false) => { renderFace(node, structural, false); };

  // Fresh size, SYNCHRONOUSLY: configure() runs next and restores a saved
  // size, so a deferred write would clobber it on every reload (convention #9).
  if (!Array.isArray(node.size)) node.size = [DEFAULT_W, DEFAULT_H];
  node.size[0] = DEFAULT_W;
  node.size[1] = DEFAULT_H;

  // configure() fills node.properties after this; render once it has.
  queueMicrotask(() => {
    renderFace(node, true, false);
    refreshSource(node);
  });

  // Polls for "the Load Image now holds a different picture": LiteGraph
  // fires nothing when a widget value changes upstream. Stops by itself for
  // a copy that never joins a graph (Ctrl+C, clone - Vue Compat #8), and
  // does nothing for a node left behind in a closed subgraph.
  node._pixSkIdle = 0;
  node._pixSkPoll = setInterval(() => {
    if (!node.graph) {
      if (++node._pixSkIdle > 6) { clearInterval(node._pixSkPoll); node._pixSkPoll = null; }
      return;
    }
    node._pixSkIdle = 0;
    if (!isLiveNode(node)) return;
    refreshSource(node);
  }, POLL_MS);

  // A Switch Pixaroma flipping its branch moves no wire, so ask again.
  node._pixSkRouterOff = onRouterChanged(() => { if (isLiveNode(node)) refreshSource(node); });
  // Same face in both renderers; only a repaint is needed after a flip.
  node._pixSkRendererOff = onRendererChange(() => paintFace(node));
}

// 遍历主图与各子图，把「没有界面的草图节点」补上。用于扩展晚于工作流恢复
// 的时序，以及任何漏网的节点。幂等，随时可重入。
function healSketches() {
  const seen = new Set();
  const visit = (graph) => {
    if (!graph || seen.has(graph)) return;
    seen.add(graph);
    for (const n of graph._nodes || graph.nodes || []) {
      if (!n) continue;
      if (n.comfyClass === CLASS || n.type === CLASS) mountSketch(n);
      const inner = n.subgraph || n._graph;
      if (inner && inner !== graph) visit(inner);
    }
  };
  try { visit(app.graph); } catch (e) {}
  try { for (const sg of app.graph?.subgraphs?.values?.() || []) visit(sg); } catch (e) {}
}

app.registerExtension({
  name: "XiaoHei.Sketch",

  // 家族规范化：切中英时刷新所有草图节点的界面文案 + 帮助面板。
  setup() {
    onLangChanged(() => {
      registerNodeHelp(CLASS, buildSketchHelp());
      const seen = new Set();
      const visit = (graph) => {
        if (!graph || seen.has(graph)) return;
        seen.add(graph);
        for (const n of graph._nodes || graph.nodes || []) {
          if (!n) continue;
          if ((n.comfyClass === CLASS || n.type === CLASS) && n._pixSkFace) {
            try { renderFace(n, true, false); } catch (e) {}
          }
          const inner = n.subgraph || n._graph;
          if (inner && inner !== graph) visit(inner);
        }
      };
      visit(app.graph);
      for (const sg of app.graph?.subgraphs?.values?.() || []) visit(sg);
    }, { tag: "xh-sketch" });

    // 兜底自愈：页面恢复工作流可能早于本扩展的 beforeRegisterNodeDef 打上补丁，
    // 那批节点就没有界面（看到的是一片空白）。这里立即补一次，再在稍后补两次，
    // 覆盖"扩展晚到"和"构建失败重试"两种时序。healSketches 幂等，不会重复建面。
    healSketches();
    setTimeout(healSketches, 800);
    setTimeout(healSketches, 2500);
  },

  // A Run that ended while another workflow tab was open (js/shared/run_tab.mjs).
  onNodeOutputsUpdated(nodeOutputs) {
    eachRestoredOutput(nodeOutputs, CLASS, (node, output) => applySketchRun(node, output));
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== CLASS) return;
    if (nodeType.prototype._pixSkPatched) return;
    nodeType.prototype._pixSkPatched = true;

    const _created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      _created?.apply(this, arguments);
      mountSketch(this);
    };

    const _configure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = _configure?.apply(this, arguments);
      // DOM only: nothing here may write node.size, properties or slots, or a
      // clean workflow opens flagged "modified" (Vue Compat #18).
      delete this._pixSkUi;          // colour / history belong to the node that was open
      renderFace(this, true, false);
      queueMicrotask(() => refreshSource(this));
      return r;
    };

    const _conn = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const r = _conn?.apply(this, arguments);
      queueMicrotask(() => refreshSource(this));
      return r;
    };

    const _executed = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      _executed?.apply(this, arguments);
      // Core calls this on the OPEN tab's node with the run's id. A Run that
      // ended while another workflow tab is open belongs to that tab (decided
      // once the message's listeners ran); core hands it back when that tab
      // opens again: onNodeOutputsUpdated above (js/shared/run_tab.mjs).
      queueMicrotask(() => {
        if (runTab(message) === "other") return;
        applySketchRun(this, message);
      });
    };

    // Classic-only clamps, never during a load (convention #7 + Vue Compat #18).
    // In Nodes 2.0 the rendered size lives in the layout store: the drag floor
    // there is installResizeFloor, set up in ui.mjs.
    const _resize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (!isVueNodes() && !isGraphLoading() && this._pixSkFace) {
        if (size[0] < MIN_W) size[0] = MIN_W;
        const floor = contentMin(this) + chromeH(this);
        if (size[1] < floor) size[1] = floor;
      }
      return _resize?.apply(this, arguments);
    };

    const _draw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function () {
      if (!isVueNodes() && !isGraphLoading() && this.size[0] < MIN_W) this.size[0] = MIN_W;
      return _draw?.apply(this, arguments);
    };

    const _removed = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      if (this._pixSkPoll) { clearInterval(this._pixSkPoll); this._pixSkPoll = null; }
      try { this._pixSkRouterOff?.(); } catch {}
      try { this._pixSkRendererOff?.(); } catch {}
      this._pixSkRouterOff = this._pixSkRendererOff = null;
      closeBig(this);
      try { closeNodeSettingsFor(this); } catch {}
      destroyFace(this);
      return _removed?.apply(this, arguments);
    };
  },
});

// ── graphToPrompt: put the marks into the hidden input ─────────────────────
// Inject only - never prune: Export (API) serialises this same output.
function buildIndex() {
  const index = new Map();
  const seen = new Set();
  const visit = (graph) => {
    if (!graph || seen.has(graph)) return;
    seen.add(graph);
    for (const n of graph._nodes || graph.nodes || []) {
      if (!n) continue;
      if (n.comfyClass === CLASS || n.type === CLASS) index.set(String(n.id), n);
      const inner = n.subgraph || n._graph;
      if (inner && inner !== graph) visit(inner);
    }
  };
  visit(app.graph);
  for (const sg of app.graph?.subgraphs?.values?.() || []) visit(sg);
  return index;
}

function findNode(index, id) {
  const s = String(id);
  if (index.has(s)) return index.get(s);
  const tail = s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : null;
  return tail && index.has(tail) ? index.get(tail) : null;
}

const _origGraphToPrompt = app.graphToPrompt;
app.graphToPrompt = async function (...args) {
  const result = await _origGraphToPrompt.apply(this, args);
  try {
    const out = result?.output;
    if (out) {
      let index = null;
      for (const id in out) {
        const entry = out[id];
        if (!entry || entry.class_type !== CLASS) continue;
        if (!index) index = buildIndex();
        const node = findNode(index, id);
        if (!node) continue;
        entry.inputs = entry.inputs || {};
        entry.inputs[HIDDEN_INPUT] = JSON.stringify(injectedState(node));
      }
    }
  } catch (e) {
    console.error("[XiaoHei.Sketch] could not add the marks to the prompt", e);
  }
  return result;
};
