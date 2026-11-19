// XiaoHei-提示词批量 · 节点前端
// 1:1 复刻 ComfyUI-Pixaroma / js/prompt_pack/index.js（MIT, Copyright (c) 2026 pixaroma）。
// 四件事逐条照抄：
//   ① addDOMWidget 挂一整块 DOM（分隔药丸 + 文本框 + 三颗按钮 + 计数胶囊）；
//   ② 状态存 node.properties.xhPackState，随工作流存盘读档，不占 widgets_values；
//   ③ 包装 app.graphToPrompt，每次提交前把「这一轮要用的那条」塞进隐藏输入；
//   ④ 包装 app.queuePrompt / api.queuePrompt，一条提示词提交一次工作流，
//      并用 race-safe 的 completedCount + 双 Set 追踪「剩 N 条」倒数。
// 家族化：署名 XiaoHei、全中文文案、配色只取官方 CSS 变量、图标走自有图标库；
//   🔴 resize 下限一律常量 WIDGET_MIN_H（DOM 绝不反向决定 node.size，§13.46）；
//   🔴 每个全局包装都有一次性标志，重复 import 不会叠两层。

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { isVueNodes, applyAdaptiveCanvasOnly } from "../shared/nodes2.mjs";
import { installResizeFloor } from "../shared/resize_floor.mjs";
import { exposePromptWidget } from "../shared/prompt_assistant_compat.mjs";
import { installCanvasZoomPassthrough } from "../shared/canvas_zoom.mjs";
import { installNativeTextMenu } from "../shared/native_text_menu.mjs";
import { registerNodeAccent, installNodeAccent } from "../shared/node_settings.mjs";
import { isQueueLoopActive, beginQueueLoop, endQueueLoop } from "../shared/queue_drivers.mjs";
import {
  CLASS, STATE_INPUT, STATE_PROP, readState, restoreFromProperties,
  parsePrompts, findFirstPromptPackNode,
} from "./core.mjs";
import { injectCSS, buildRoot, applyState, updateCounter } from "./render.mjs";
import { wireEvents, showNoPromptsToast } from "./interaction.mjs";

const LOG = "[XiaoHei.PromptPack]";
// 默认即最小尺寸：新拖出来的节点是紧凑的，需要更多文本框空间再自己拉大。
const DEFAULT_W = 400, DEFAULT_H = 210;
const MIN_W = 400, MIN_H = 210;
const WIDGET_MIN_H = 160;

function ensureFloor(node) {
  if (!Array.isArray(node.size)) return;
  if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
  if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;
}

export function setupNode(node) {
  injectCSS();
  if (node._xhPpRoot) return;
  restoreFromProperties(node);

  const root = buildRoot();
  node._xhPpRoot = root;
  installCanvasZoomPassthrough(root);
  installNativeTextMenu(root);
  installNodeAccent(node, root);

  const w = node.addDOMWidget("xh_pack_ui", "custom", root, {
    getValue: () => null, setValue: () => {},
    // 🔴 固定下限，绝不在这里量 DOM 高度（会跟 node.size 互相喂食）。
    getMinHeight: () => WIDGET_MIN_H,
    margin: 4, serialize: false,
  });
  applyAdaptiveCanvasOnly(w);
  // 让第三方「提示词小助手」认出主文本框：只补 widget 外观属性，不增删 widget。
  exposePromptWidget(node, w, () => root.querySelector("textarea"));
  // 🔴 拖动下限同样是常量。一旦 measureFn 读「当前 DOM 高度」，用户把节点
  //    拉到 700px 后下限就变成 698px，节点再也缩不回去（2026-11-12 真机实测）。
  //    内容放不下由文本框自己滚动，绝不反向写 node.size。
  node._xhPpFloorOff = installResizeFloor(root, () => WIDGET_MIN_H);
  ensureFloor(node);

  wireEvents(node, root);
  applyState(root, readState(node));

  const prevRemoved = node.onRemoved;
  node.onRemoved = function (...a) {
    try { node._xhPpFloorOff?.(); } catch (_e) { /* ignore */ }
    node._xhPpFloorOff = null;
    node._xhPpRoot = null;
    node._xhPaBridge?.dispose?.();
    node._xhPaBridge = null;
    try { return prevRemoved?.apply(this, a); } catch (_e) { return undefined; }
  };
  node.setDirtyCanvas?.(true, true);
  // configure 晚于 nodeCreated：两拍补一次，把存档里的字回灌到 DOM。
  queueMicrotask(() => { if (node._xhPpRoot) applyState(node._xhPpRoot, readState(node)); });
  setTimeout(() => { if (node._xhPpRoot) applyState(node._xhPpRoot, readState(node)); }, 0);
}

// 子图安全：ComfyUI 会把子图节点拍平成 "5:12" 这样的复合 ID，
// app.graph.getNodeById 只认顶层，所以自己遍历所有嵌套子图建索引。
function buildPackNodeIndex() {
  const index = new Map();
  const visit = (graph) => {
    if (!graph) return;
    const nodes = graph._nodes || graph.nodes || [];
    for (const n of nodes) {
      if (!n) continue;
      if (n.comfyClass === CLASS || n.type === CLASS) index.set(String(n.id), n);
      const inner = n.subgraph || n.graph || n._graph;
      if (inner && inner !== graph) visit(inner);
    }
  };
  visit(app.graph);
  return index;
}

function findPackNode(index, promptId) {
  const sId = String(promptId);
  if (index.has(sId)) return index.get(sId);
  const tail = sId.includes(":") ? sId.slice(sId.lastIndexOf(":") + 1) : null;
  if (tail && index.has(tail)) return index.get(tail);
  return null;
}

// ── 点「运行」那一刻：把当前这一轮的提示词注入隐藏输入 ──────────────────
if (!app._xhPackGraphPatched) {
  app._xhPackGraphPatched = true;
  const origFn = app.graphToPrompt;
  app.graphToPrompt = async function (...args) {
    const result = await origFn.apply(app, args);
    try {
      const prompt = result?.output;
      if (prompt && typeof prompt === "object") {
        let index = null;
        for (const key of Object.keys(prompt)) {
          const entry = prompt[key];
          if (!entry || entry.class_type !== CLASS) continue;
          if (!index) index = buildPackNodeIndex();
          const node = findPackNode(index, key);
          if (!node) continue;
          const state = node.properties?.[STATE_PROP];
          if (!state) continue;
          const activePrompt = (state.activePrompt || "").trim();
          entry.inputs = entry.inputs || {};
          entry.inputs[STATE_INPUT] = JSON.stringify({ version: 1, activePrompt });
        }
      }
    } catch (err) {
      console.error(LOG, "graphToPrompt 钩子出错", err);
    }
    return result;
  };
}

// ── 工作流加载完成后回灌存档 ────────────────────────────────────────────
if (!app._xhPackLoadPatched) {
  app._xhPackLoadPatched = true;
  const origLoad = app.loadGraphData;
  if (typeof origLoad === "function") {
    app.loadGraphData = function (...args) {
      const r = origLoad.apply(app, args);
      setTimeout(() => {
        try {
          for (const n of (app.graph?._nodes || [])) {
            if ((n?.comfyClass === CLASS || n?.type === CLASS) && n._xhPpRoot) {
              restoreFromProperties(n);
              applyState(n._xhPpRoot, readState(n));
            }
          }
        } catch (_e) { /* 图还没建好，nodeCreated 那两拍会补上 */ }
      }, 0);
      return r;
    };
  }
}

app.registerExtension({
  name: "XiaoHei.PromptPack",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== CLASS) return;
    // 传统渲染器才夹尺寸；Nodes 2.0 的渲染尺寸在 Vue layout 里，
    // 这里改 node.size 会跟它脱节、切工作流时节点乱跳。
    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (!isVueNodes()) {
        if (Array.isArray(size)) {
          if (size[0] < MIN_W) size[0] = MIN_W;
          if (size[1] < MIN_H) size[1] = MIN_H;
        }
        if (Array.isArray(this.size)) {
          if (this.size[0] < MIN_W) this.size[0] = MIN_W;
          if (this.size[1] < MIN_H) this.size[1] = MIN_H;
        }
      }
      return origResize?.apply(this, arguments);
    };
  },
  nodeCreated(node) {
    if (node.comfyClass === CLASS || node.type === CLASS) setupNode(node);
  },
});

// ── 批量追踪：按「工作流真正执行完」倒数，不是按提交成功倒数 ─────────────
// race-safe 双 Set 设计（原版 2026-05 修过）：极简工作流可能在 queuePrompt
// 的 HTTP 响应回来之前就已经执行完并发出 executing-null，朴素的
// 「响应里加 pid / 完成里删 pid」会丢掉这次竞态，永远卡在「剩 N 条」。
// 所以用 completedCount 记总完成数，把早到的完成 pid 先存进 earlyFinishedPids，
// 等响应回来再认领。
if (!app._xhPackQueuePatched) {
  app._xhPackQueuePatched = true;

  const _batch = {
    node: null,
    total: 0,
    pendingPids: new Set(),
    earlyFinishedPids: new Set(),
    completedCount: 0,
    activeCapture: false,
  };

  // 包装底层 api.queuePrompt：不同 ComfyUI 版本里 app.queuePrompt 的返回形状
  // 不一样，底层这个一定带 .prompt_id。只在自己的批量循环期间捕获，
  // 免得把别人提交的任务也算进来。
  const _origApiFn = api.queuePrompt;
  const _origApi = (...a) => _origApiFn.apply(api, a);
  api.queuePrompt = async function (...args) {
    const res = await _origApi(...args);
    if (_batch.activeCapture && res &&
        _batch.completedCount + _batch.pendingPids.size < _batch.total) {
      const pid = res.prompt_id != null ? String(res.prompt_id) : null;
      if (pid) {
        if (_batch.earlyFinishedPids.has(pid)) {
          _batch.earlyFinishedPids.delete(pid);
          _batch.completedCount++;
          _refreshBatchCounter();
        } else {
          _batch.pendingPids.add(pid);
        }
      }
    }
    return res;
  };

  function _refreshBatchCounter() {
    const node = _batch.node;
    if (!node || !node._xhPpRoot) return;
    const state = node.properties?.[STATE_PROP];
    if (!state) return;
    const remaining = Math.max(0, _batch.total - _batch.completedCount);
    if (remaining === 0) {
      _batch.node = null;
      _batch.total = 0;
      _batch.pendingPids.clear();
      _batch.earlyFinishedPids.clear();
      _batch.completedCount = 0;
      updateCounter(node._xhPpRoot, state);
    } else {
      updateCounter(node._xhPpRoot, state,
        { running: true, remaining, total: _batch.total });
    }
    node.setDirtyCanvas(true, true);
  }

  function _handleFinish(pid) {
    if (!pid) return;
    if (_batch.pendingPids.has(pid)) {
      _batch.pendingPids.delete(pid);
      _batch.completedCount++;
      _refreshBatchCounter();
    } else if (_batch.activeCapture &&
               _batch.completedCount + _batch.pendingPids.size < _batch.total) {
      _batch.earlyFinishedPids.add(pid);
    }
  }

  api.addEventListener("executing", (event) => {
    const detail = event?.detail;
    // detail.node === null 表示整条工作流跑完；逐节点的 executing 跳过。
    if (detail == null) return;
    if (detail.node !== null && detail.node !== undefined) return;
    const pid = detail.prompt_id != null ? String(detail.prompt_id) : null;
    _handleFinish(pid);
  });
  // 有些版本用 execution_success / execution_error 代替 executing-null，
  // 两个都听，报错时倒数也不会永远卡住。
  api.addEventListener("execution_success", (event) => {
    const pid = event?.detail?.prompt_id != null ? String(event.detail.prompt_id) : null;
    _handleFinish(pid);
  });
  api.addEventListener("execution_error", (event) => {
    const pid = event?.detail?.prompt_id != null ? String(event.detail.prompt_id) : null;
    _handleFinish(pid);
  });

  // app.queuePrompt 包装：每次点「运行」，把框里的 N 条提示词拆开，
  // 每条提交一次工作流；每次提交前先改 state.activePrompt，
  // 上面的 graphToPrompt 钩子就会把正确的那条包进隐藏输入。
  const _origAppFn = app.queuePrompt;
  const _origApp = (...a) => _origAppFn.apply(app, a);
  app.queuePrompt = async function (...args) {
    // 家族别的队列驱动（提示词表 / LoRA 等）已经在循环这一轮 → 直接放行，
    // 共享锁让各驱动互斥，避免 N×M 次相乘。
    if (isQueueLoopActive()) return _origApp(...args);

    const ppNode = findFirstPromptPackNode(app);
    if (!ppNode) return _origApp(...args);

    const state = readState(ppNode);
    const prompts = parsePrompts(state.text, state.mode);
    if (prompts.length === 0) {
      showNoPromptsToast(app);
      return;
    }

    const root = ppNode._xhPpRoot;
    const total = prompts.length;
    _batch.node = ppNode;
    _batch.total = total;
    _batch.pendingPids.clear();
    _batch.earlyFinishedPids.clear();
    _batch.completedCount = 0;

    // 立刻显示「剩 N 条」，别等第一条工作流跑完才给反馈。
    if (root) {
      ppNode.properties = ppNode.properties || {};
      if (!ppNode.properties[STATE_PROP]) ppNode.properties[STATE_PROP] = state;
      updateCounter(root, ppNode.properties[STATE_PROP],
        { running: true, remaining: total, total });
      ppNode.setDirtyCanvas(true, true);
    }

    const results = [];
    beginQueueLoop();
    _batch.activeCapture = true;
    try {
      for (let i = 0; i < prompts.length; i++) {
        ppNode.properties = ppNode.properties || {};
        if (!ppNode.properties[STATE_PROP]) ppNode.properties[STATE_PROP] = state;
        ppNode.properties[STATE_PROP].activePrompt = prompts[i];
        try {
          // 保留 number 与 queueNodeIds（「执行到选中的输出节点」），
          // 只把 batchCount 强制为 1 —— 每条提示词本来就是一次独立运行。
          const loopArgs = args.slice();
          loopArgs[1] = 1;
          const r = await _origApp(...loopArgs);
          results.push(r);
        } catch (err) {
          console.error(LOG, "某一条提交失败，继续跑剩下的", err);
        }
      }
    } finally {
      _batch.activeCapture = false;
      endQueueLoop();
    }

    // 兜底：一个 pid 都没追到（不支持的旧版 api 形状），把计数恢复成常态，
    // 别让「剩 N 条」永远挂在脸上。
    if (_batch.pendingPids.size === 0 &&
        _batch.completedCount === 0 &&
        _batch.earlyFinishedPids.size === 0 && root) {
      _batch.node = null;
      _batch.total = 0;
      updateCounter(root, ppNode.properties[STATE_PROP]);
      ppNode.setDirtyCanvas(true, true);
    }
    return results[results.length - 1];
  };
}

// 右键菜单 / 齿轮里的节点配色项（家族通用设置面板）。
registerNodeAccent(CLASS, { title: "提示词批量" });
