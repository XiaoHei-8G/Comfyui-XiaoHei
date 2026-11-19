// XiaoHei-提示词堆叠 · 节点前端
// 1:1 学 ComfyUI-Pixaroma / js/prompt_stack/index.js（MIT）的四件事：
//   ① addDOMWidget 挂一整块 DOM（可开关 / 可拖拽的一行行提示词 + 底部按钮排）；
//   ② 状态存 node.properties.xhStackState，随工作流存盘读档，不占 widgets_values；
//   ③ 齿轮开右侧浮动设置窗口，分隔符是纯点击的小方片（原版的手打 \n 文本框已删）；
//   ④ 包装 app.graphToPrompt，点「运行」那一刻才把 rows + 分隔符塞进隐藏输入。
import { app } from "../../../scripts/app.js";
import { isSizeLike } from "../xh_ui_kit.js";
import { applyAdaptiveCanvasOnly, isVueNodes } from "../shared/nodes2.mjs";
import { installResizeFloor } from "../shared/resize_floor.mjs";
import { exposePromptWidget } from "../shared/prompt_assistant_compat.mjs";
import { registerNodeSettings } from "../shared/node_settings.mjs";
import {
  readState, writeState, addRow, deleteRow, toggleEnabled,
  clearAllText, resetToDefault, reorderRows, resolveSep, defaultState,
} from "./core.mjs";
import { injectCSS, buildRoot, renderRows } from "./render.mjs";
import { xhConfirm, autoGrowTextareas } from "./interaction.mjs";
import {
  openStackSettings, closeStackSettingsFor,
} from "./settings.mjs";

const CLASS = "XH_PromptStack";
// 尺寸规矩沿用 v1.58.1 修好的那套：根节点撑满 100%、行列表 flex 吃掉多余高度、
// 按钮排与脚注永远贴底；DOM 控件只给「下限」，绝不 lockDomWidgetHeight。
const DEFAULT_W = 430, DEFAULT_H = 210;
const MIN_W = 360, MIN_H = 180, WIDGET_MIN_H = 170;

registerNodeSettings(CLASS, {
  title: "提示词堆叠",
  ownMenuItem: true,
  menuLabel: "提示词堆叠设置",
  open: (node) => openStackSettings(node, () => syncFromState(node)),
});

/**
 * 🔴 节点尺寸只由用户拖拽决定，DOM 绝不反向决定 node.size。
 * 旧版把「量出来的内容高度」同时当 getMinHeight 和拖动下限，实测（Edge 真机）：
 *   · 标签提示词：拉到 700px 时下限也变成 698px → 最小尺寸≈当前尺寸，缩不回去；
 *   · 提示词堆叠：4 行内容把下限顶到 468px → 往回拖到 468 就卡住。
 * 现在下限是常量，内容放不下时由 .xh-pss-list 自己滚动；
 * 只在节点比下限还小时补齐，用户拖过的尺寸一律保留。
 */
function ensureFloor(node) {
  if (!isSizeLike(node.size)) return;
  const w = Math.max(node.size[0], MIN_W);
  const h = Math.max(node.size[1], MIN_H);
  if (w !== node.size[0] || h !== node.size[1]) node.setSize?.([w, h]);
}

function syncFromState(node) {
  const ui = node._xhStackRoot;
  if (!ui) return;
  renderRows(node, ui.list, ui.handlers);
}
function refreshAfter(node) {
  syncFromState(node);
  // 等 DOM 真排完版再补下限，别在重建的同一拍读旧尺寸。
  setTimeout(() => {
    ensureFloor(node);
    node.setDirtyCanvas?.(true, true);
  }, 0);
}

function makeHandlers(node) {
  const onDrop = (fromId, toId, above) => {
    const st = readState(node);
    const fromIdx = st.rows.findIndex((r) => r.id === fromId);
    const toIdxRaw = st.rows.findIndex((r) => r.id === toId);
    if (fromIdx < 0 || toIdxRaw < 0) return;
    let dest = above ? toIdxRaw : toIdxRaw + 1;
    if (fromIdx < dest) dest -= 1;
    if (dest === fromIdx) return;
    reorderRows(node, fromIdx, dest);
    refreshAfter(node);
  };
  return {
    onAdd: () => { addRow(node); refreshAfter(node); },
    onToggleEnabled: (id) => { toggleEnabled(node, id); refreshAfter(node); },
    onDelete: async (id) => {
      const st = readState(node);
      const row = st.rows.find((r) => r.id === id);
      const has = row && ((row.text && row.text.trim()) || (row.label && row.label.trim()));
      if (has) {
        const name = (row.label && row.label.trim()) || `第 ${st.rows.indexOf(row) + 1} 行`;
        const ok = await xhConfirm({
          title: "删掉这一行？",
          message: `「${name}」里的字会一起删掉，删了就找不回来了。`,
          okText: "删掉", cancelText: "先留着",
        });
        if (!ok) return;
      }
      deleteRow(node, id);
      refreshAfter(node);
    },
    onClearAll: async () => {
      const st = readState(node);
      const filled = st.rows.filter((r) => r.text && r.text.trim()).length;
      if (!filled) return;
      const ok = await xhConfirm({
        title: "清空所有文字？",
        message: `会把这 ${st.rows.length} 行里的提示词都清掉，行、行名和开关都保留。`,
        okText: "清空", cancelText: "不清了",
      });
      if (!ok) return;
      clearAllText(node);
      refreshAfter(node);
    },
    onReset: async () => {
      const ok = await xhConfirm({
        title: "恢复默认？",
        message: "会回到刚拖出来的样子：一行、开着、没名字，分隔符也回到逗号空格。",
        okText: "恢复", cancelText: "算了",
      });
      if (!ok) return;
      resetToDefault(node);
      refreshAfter(node);
    },
    onSettings: () => openStackSettings(node, () => refreshAfter(node)),
    onDrop,
  };
}

export function setupNode(node) {
  injectCSS();
  if (node._xhStackRoot) return;
  if (!node.properties?.xhStackState) writeState(node, defaultState());

  // buildRoot 的按钮回调引用同一个 proxy 对象，makeHandlers 之后补齐即可。
  const proxy = {};
  const ui = buildRoot(proxy);
  ui.handlers = makeHandlers(node);
  Object.assign(proxy, ui.handlers);
  node._xhStackRoot = ui;

  const w = node.addDOMWidget("xh_stack_ui", "custom", ui.root, {
    getValue: () => null, setValue: () => {},
    // 🔴 固定下限：绝不在这里量 DOM 高度（会跟 node.size 互相喂食）。
    getMinHeight: () => WIDGET_MIN_H,
    margin: 4, serialize: false,
  });
  // canvasOnly 随渲染器动态求值（家族 shared/nodes2.mjs），两种前端都能撑满。
  applyAdaptiveCanvasOnly(w);
  // 让第三方「提示词小助手」认出第一行的文本框。行列表每次交互都会整块重建，
  // 所以 inputEl 用 getter 取当前 textarea，并监听 ui.root 让第三方重扫重建实例。
  exposePromptWidget(node, w, () => ui.list.querySelector("textarea"), { watch: ui.root });
  // 🔴 拖动下限也必须是常量。measureFn 一旦读「当前 DOM 高度」，用户把节点
  //    拉到 700px 后下限就变成 698px，官方 resize 读到它 = 最小尺寸等于当前
  //    尺寸，节点再也缩不回去（2026-11-12 真机实测）。内容多了由列表滚动。
  const uninstallFloor = installResizeFloor(ui.root, () => WIDGET_MIN_H);
  // 只在「比下限还小」时补默认值，用户拖过的尺寸一律保留。
  if (isSizeLike(node.size)) {
    if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
    if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;
  }

  // 节点变宽 / 从别的 tab 切回来时，把多行文本框重新撑到内容高度。
  let lastW = -1;
  const ro = new ResizeObserver(() => {
    const width = ui.root.clientWidth;
    if (width === lastW) return;
    lastW = width;
    autoGrowTextareas(ui.root);
  });
  ro.observe(ui.root);

  // 打字 / 变宽时只补最小尺寸，不再按内容把节点撑大。
  node._xhStackGrow = () => {
    ensureFloor(node);
    node.setDirtyCanvas?.(true, true);
  };
  const prevRemoved = node.onRemoved;
  node.onRemoved = function (...a) {
    closeStackSettingsFor(node);
    try { uninstallFloor?.(); } catch {}
    ro.disconnect();
    node._xhPaBridge?.dispose?.();
    node._xhPaBridge = null;
    node._xhStackRoot = null;
    node._xhStackGrow = null;
    node._xhStackRefresh = null;
    try { return prevRemoved?.apply(this, a); } catch { return undefined; }
  };

  // configure 晚于 nodeCreated：两拍补一次，把存档里的行回灌到 DOM。
  queueMicrotask(() => syncFromState(node));
  setTimeout(() => syncFromState(node), 0);
  syncFromState(node);
}

// ── 点「运行」那一刻：把开着的行按顺序打包进隐藏输入 ──────────────────────
function findNodes(promptId) {
  const out = new Map();
  const visit = (graph, prefix) => {
    if (!graph) return;
    for (const n of (graph._nodes || graph.nodes || [])) {
      if (!n) continue;
      const full = prefix + String(n.id);
      if (n.comfyClass === CLASS || n.type === CLASS) out.set(full, n);
      const inner = n.subgraph || n.graph || n._graph;
      if (inner && inner !== graph) visit(inner, full + ":");
    }
  };
  visit(app.graph, "");
  return out.get(String(promptId))
    || out.get(String(promptId).split(":").pop()) || null;
}

if (!app._xhStackPatched) {
  app._xhStackPatched = true;
  const origFn = app.graphToPrompt;
  app.graphToPrompt = async function (...args) {
    const result = await origFn.apply(app, args);
    try {
      const prompt = result?.output;
      if (!prompt || typeof prompt !== "object") return result;
      for (const [key, entry] of Object.entries(prompt)) {
        if (!entry || entry.class_type !== CLASS) continue;
        const node = findNodes(key);
        if (!node) { console.warn("[XiaoHei] 提示词堆叠节点没匹配上，隐藏输入保持原样：", key); continue; }
        const st = readState(node);
        entry.inputs = entry.inputs || {};
        // 🔴 只放执行数据：行名（label）只是备注，绝不进提示词；分隔符由设置窗口定的方片换算。
        entry.inputs.XHStackState = JSON.stringify({
          rows: st.rows.map((r) => ({ enabled: !!r.enabled, text: r.text || "" })),
          separator: resolveSep(st),
        });
      }
    } catch (err) {
      console.error("[XiaoHei] 提示词堆叠 graphToPrompt 钩子出错：", err);
    }
    return result;
  };
}

// 工作流加载完成后把存档里的行回灌到 DOM（configure 晚于 nodeCreated）。
if (!app._xhStackLoadPatched) {
  app._xhStackLoadPatched = true;
  const origFn = app.loadGraphData;
  if (typeof origFn === "function") {
    app.loadGraphData = function (...args) {
      const r = origFn.apply(app, args);
      setTimeout(() => {
        try { for (const n of (app.graph?._nodes || [])) if (n?.comfyClass === CLASS) syncFromState(n); }
        catch { /* 图还没建好就跳过，nodeCreated 那两拍会补上 */ }
      }, 0);
      return r;
    };
  }
}

app.registerExtension({
  name: "XiaoHei.PromptStack",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== CLASS) return;
    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      // 只挡「拖得太小挤爆按钮排」，拉大一律放行；Vue(Nodes 2.0) 交给固定下限。
      if (!isVueNodes()) {
        if (isSizeLike(size)) {
          if (size[0] < MIN_W) size[0] = MIN_W;
          if (size[1] < MIN_H) size[1] = MIN_H;
        }
        if (isSizeLike(this.size)) {
          if (this.size[0] < MIN_W) this.size[0] = MIN_W;
          if (this.size[1] < MIN_H) this.size[1] = MIN_H;
        }
      }
      return origResize?.apply(this, arguments);
    };
  },
  nodeCreated(node) { if (node.comfyClass === CLASS) setupNode(node); },
});
