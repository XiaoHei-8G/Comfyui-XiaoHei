//  XiaoHei 家族 · 变更捕获网（让 DOM 控件的改动被 ComfyUI 记进工作流）
// ══════════════════════════════════════════════════════════════════════
// 机制移植自 Pixaroma 的 js/shared/graph_changed.mjs。
//
// ── 为什么需要 ──────────────────────────────────────────────────────────
//   ComfyUI 的 ChangeTracker 是在 **mouseup** 时抓一次画布快照
//   （window 级 mouseup 监听 + 包一层 processMouseUp，都调 captureCanvasState）。
//   原生控件在 mousedown / processNodeWidgets 阶段就提交了值 ⇒ 快照时新值已在图里
//   ⇒ 变更被记下来了。
//
//   但 XiaoHei 的 DOM 控件是在 **click** 里提交的，click 严格晚于 mouseup
//   ⇒ 官方那次快照永远抓到的是「改动前」的状态 ⇒ 这次改动**谁都没记**。
//   实测（Pixaroma）：点一下选图片，live widget 已经是新值，
//   但 workflow.isModified 一直是 false —— 画布上不出现「脏」提示，
//   关掉时也不问你要不要存 ⇒ 下次打开工作流，你的改动**静默回退**。
//   而且同一个原因，Ctrl+Z 也撤不掉这次改动。
//
//   修法：不要去 55 个节点的写路径里各插一句（容易在「加载路径」误触发，
//   把干净工作流标成已修改）—— 而是用一张**被动网**兜住所有：
//   捕获阶段监听 click / change，命中 XiaoHei 自己的界面就通知官方抓一次快照。
//
//   三个非显然但缺一不可的要求：
//   ① 必须是**捕获阶段**（capture=true），不是冒泡 —— XiaoHei 很多控件自己调
//      e.stopPropagation()，冒泡监听器对它们**永远不会触发**。
//   ② 捕获跑在目标 handler **之前**，也就是在值提交之前 —— 所以必须靠
//      120ms 防抖把真正的抓取推到 click 处理完之后，否则又拍到改动前。
//   ③ 加载工作流时绝不能触发 —— 否则干净工作流会被标成「已修改」。
//      isGraphLoading() 门禁专门管这个。
//
// 纯被动、纯增量：只调用官方自己也会调的那个函数，不覆盖任何东西，
// 别的节点包完全不受影响。快照没发现变化就是 no-op。

import { isGraphLoading, iXHNode } from "./xh_undo_remount.js";

const { app } = window.comfyAPI.app;

let _timer = null;
let _netInstalled = false;

/** 拿当前工作流的 ChangeTracker（不同前端版本位置不一样，两处都试）。 */
function activeChangeTracker() {
  try {
    return (
      app?.extensionManager?.workflow?.activeWorkflow?.changeTracker
      || app?.workflowManager?.activeWorkflow?.changeTracker
      || null
    );
  } catch (e) {
    return null;
  }
}

/** 抓一次画布快照 = 官方「用户改了点什么」的判定入口。 */
function capture() {
  const ct = activeChangeTracker();
  if (!ct) return;
  // captureCanvasState 是现名；checkState 是改名前的别名（会打弃用警告）。
  if (typeof ct.captureCanvasState === "function") ct.captureCanvasState();
  else if (typeof ct.checkState === "function") ct.checkState();
}

/** 通知官方「图变了」。合并成一次（长按方向键连点几十次也只抓一次）。 */
export function notifyGraphChanged() {
  if (isGraphLoading()) return;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    if (isGraphLoading()) return;   // 等待期间开始了加载
    try {
      capture();
    } catch (e) {
      // 降级成「这次改动没被追踪」，绝不在用户操作里抛异常。
      console.warn("XH.ChangeNet] 未能通知 ComfyUI 图已变更", e);
    }
  }, 120);
}

/** 事件目标是不是落在 XiaoHei 自己的界面上。 */
function isOurTarget(t) {
  if (!t || typeof t.closest !== "function") return false;

  // ① 节点内部的 DOM（XiaoHei 节点里的滑块 / 时间轴 / 预览 / 分段表 / 文本框…）
  //    —— 按「所在节点是不是 XiaoHei 节点」判定，不靠 class 名，各个控件命名不统一。
  const nodeEl = t.closest('.lg-node[data-node-id]');
  if (nodeEl) {
    const id = nodeEl.getAttribute("data-node-id");
    const g = app.canvas?.graph;
    const n = g && id != null ? g.getNodeById?.(id) : null;
    if (n && iXHNode(n)) return true;
    // 画布节点查不到（正在创建/销毁）时，兜底看节点元素的 class 标记。
    if (!n && nodeEl.classList && nodeEl.classList.contains("xh-node")) return true;
  }

  // ② 浮在画布外的 XiaoHei 浮窗（设置面板 / 帮助浏览器 / 节点导航 / 工作流浏览器…）
  //    —— 这些 class 一律带 xh- / xh_ 前缀。
  if (t.closest('[class*="xh-"], [class*="xh_"]')) return true;

  return false;
}

export function installChangeNet() {
  if (_netInstalled || typeof document === "undefined") return;
  _netInstalled = true;

  const onUserAction = (e) => {
    if (!isOurTarget(e.target)) return;
    notifyGraphChanged();
  };

  // click 覆盖绝大多数控件；change 补上「键盘提交的 checkbox」和
  // 「藏在按钮后面的 <input type=file>」这两条不产生 click 的路。
  document.addEventListener("click", onUserAction, true);
  document.addEventListener("change", onUserAction, true);
}

// 自动装（这个文件本身就是「永远加载」的那一个）
installChangeNet();
