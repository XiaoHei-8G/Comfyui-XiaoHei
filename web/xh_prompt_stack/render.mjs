// XiaoHei-提示词堆叠 · 节点 DOM 外观
// 1:1 学 ComfyUI-Pixaroma / js/prompt_stack/render.mjs（MIT）的行结构与按钮排。
// 家族化：全部中文、配色只取 ComfyUI 官方 CSS 变量（--secondary / --foreground /
// --border / --background），开态与拖拽指示线用家族品牌色 --xh-primary；
// 图案一律走自有图标库 xhIconHTML，零硬编码 SVG 路径。
import { readState } from "./core.mjs";
import { attachLabelEditor, attachTextareaEditor, attachDragHandlers } from "./interaction.mjs";
import { xhIconHTML } from "../xh_ui_kit.js";

const CSS_ID = "xh-prompt-stack-css";
const CSS = `
.xh-pss{display:flex;flex-direction:column;gap:7px;padding:8px 10px;box-sizing:border-box;
  width:100%;height:100%;overflow:hidden;
  color:var(--foreground,#fff);font:12px var(--font-family,sans-serif)}
.xh-pss-list{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;
  display:flex;flex-direction:column;gap:6px}
.xh-pss-row{flex:1 1 auto;min-height:fit-content;display:flex;flex-direction:column;gap:5px;
  padding:7px;border-radius:5px;position:relative;
  background:var(--secondary,#262729);border:1px solid var(--border,#494a50)}
.xh-pss-row.is-off{opacity:.45}
.xh-pss-row.is-dragging{opacity:.35}
.xh-pss-row.is-drop-above{box-shadow:0 -2px 0 0 var(--xh-primary,#E8A33C)}
.xh-pss-row.is-drop-below{box-shadow:0 2px 0 0 var(--xh-primary,#E8A33C)}
.xh-pss-head{display:flex;align-items:center;gap:6px;min-height:20px}
.xh-pss-handle{display:inline-flex;align-items:center;justify-content:center;width:16px;height:18px;
  cursor:grab;color:var(--foreground,#fff);opacity:.55;flex:0 0 auto;user-select:none}
.xh-pss-handle:active{cursor:grabbing}
.xh-pss-handle:hover{opacity:1}
.xh-pss-toggle{min-width:30px;height:18px;padding:0 7px;border-radius:9px;flex:0 0 auto;
  display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;
  background:transparent;color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);cursor:pointer;user-select:none}
.xh-pss-toggle:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-pss-toggle.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);
  color:var(--background,#171718)}
.xh-pss-label{flex:1;min-width:0;background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:4px;padding:3px 7px;
  font-size:11px;outline:none}
.xh-pss-label:focus{border-color:var(--xh-primary,#E8A33C)}
.xh-pss-label::placeholder{opacity:.5}
.xh-pss-del{width:18px;height:18px;padding:0;flex:0 0 auto;display:inline-flex;
  align-items:center;justify-content:center;background:transparent;border:none;
  color:var(--foreground,#fff);opacity:.55;cursor:pointer}
.xh-pss-del:hover{opacity:1;color:var(--xh-primary,#E8A33C)}
.xh-pss-del:disabled{opacity:.25;cursor:not-allowed}
.xh-pss-ta{width:100%;flex:1 1 auto;min-height:38px;resize:none;box-sizing:border-box;
  background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:4px;padding:6px 8px;
  font:12px/1.5 var(--font-family,monospace);outline:none;overflow-y:auto}
.xh-pss-ta:focus{border-color:var(--xh-primary,#E8A33C)}
.xh-pss-ta::placeholder{opacity:.5}
.xh-pss-actions{flex:0 0 auto;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.xh-pss-btn{background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 9px;
  font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.xh-pss-btn:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-pss-btn.gear{width:30px;height:26px;padding:0;justify-content:center}
.xh-pss-btn:disabled{opacity:.4;cursor:not-allowed}
.xh-pss-foot{flex:0 0 auto;font-size:11px;opacity:.55}
.xh-pss-cf-back{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
  align-items:center;justify-content:center;z-index:11040;
  font:12px var(--font-family,sans-serif);color:var(--foreground,#fff)}
.xh-pss-cf-box{background:var(--secondary,#262729);border:1px solid var(--border,#494a50);
  border-radius:9px;min-width:280px;max-width:420px;padding:16px 18px}
.xh-pss-cf-title{font-size:13px;font-weight:600;margin-bottom:8px}
.xh-pss-cf-msg{font-size:11.5px;opacity:.75;line-height:1.5;margin-bottom:16px}
.xh-pss-cf-acts{display:flex;gap:8px;justify-content:flex-end}
.xh-pss-cf-acts button{background:transparent;color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 14px;
  font-size:11.5px;cursor:pointer}
.xh-pss-cf-acts button.pri{background:var(--xh-primary,#E8A33C);
  border-color:var(--xh-primary,#E8A33C);color:var(--background,#171718);font-weight:600}
`;

export function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 造一整块 DOM：行列表 + 底部按钮排 + 脚注。事件由 index.js 传进来的 handlers 挂。 */
export function buildRoot(handlers) {
  const root = el("div", "xh-pss");
  const list = el("div", "xh-pss-list");
  const actions = el("div", "xh-pss-actions");
  const buttons = {};

  const add = el("button", "xh-pss-btn");
  add.type = "button";
  add.innerHTML = xhIconHTML("plus", { size: 12, color: "current" }) + "<span>加一行</span>";
  add.title = "在末尾加一行空提示词";
  add.addEventListener("click", () => handlers.onAdd());
  buttons.add = add;

  const clear = el("button", "xh-pss-btn", "清空文字");
  clear.type = "button";
  clear.title = "清空每一行的提示词（保留行、行名和开关）";
  clear.addEventListener("click", () => handlers.onClearAll());
  buttons.clear = clear;

  const reset = el("button", "xh-pss-btn", "恢复默认");
  reset.type = "button";
  reset.title = "回到刚拖出来的样子：一行、开着、没名字";
  reset.addEventListener("click", () => handlers.onReset());
  buttons.reset = reset;

  const gear = el("button", "xh-pss-btn gear");
  gear.type = "button";
  gear.dataset.xhStackGear = "1";
  gear.title = "打开本节点的设置（改每行之间的分隔符）";
  gear.innerHTML = xhIconHTML("settings", { size: 14, color: "current" });
  gear.addEventListener("click", () => handlers.onSettings());
  buttons.gear = gear;

  actions.append(add, clear, reset, gear);
  const foot = el("div", "xh-pss-foot", "XiaoHei · 行名不进提示词，关掉的行会跳过；拖左侧把手换顺序");
  root.append(list, actions, foot);
  return { root, list, buttons };
}

/** 按当前状态重建所有行（原版每次交互后整体重绘，简单可靠）。 */
export function renderRows(node, list, handlers) {
  const state = readState(node);
  list.innerHTML = "";
  for (const row of state.rows) {
    const rowEl = el("div", "xh-pss-row" + (row.enabled ? "" : " is-off"));
    rowEl.dataset.id = row.id;
    rowEl.draggable = false;

    const head = el("div", "xh-pss-head");
    const handle = el("span", "xh-pss-handle");
    handle.draggable = true;
    handle.title = "按住拖到别的位置换顺序";
    handle.innerHTML = xhIconHTML("grip-vertical", { size: 14, color: "current" });

    const toggle = el("div", "xh-pss-toggle" + (row.enabled ? " on" : ""), row.enabled ? "开" : "关");
    toggle.title = row.enabled ? "点一下：这段先不用" : "点一下：这段要算进去";
    toggle.addEventListener("click", () => handlers.onToggleEnabled(row.id));

    const label = document.createElement("input");
    label.type = "text"; label.className = "xh-pss-label";
    label.value = row.label || "";
    label.placeholder = `第 ${state.rows.indexOf(row) + 1} 行（可不填名字）`;
    label.title = "只是给你自己看的备注，不会进提示词";
    attachLabelEditor(node, label, row.id);

    const del = el("button", "xh-pss-del");
    del.type = "button"; del.title = "删掉这一行";
    del.disabled = state.rows.length <= 1;
    del.innerHTML = xhIconHTML("trash-2", { size: 13, color: "current" });
    del.addEventListener("click", () => handlers.onDelete(row.id));

    head.append(handle, toggle, label, del);
    rowEl.appendChild(head);

    const ta = document.createElement("textarea");
    ta.className = "xh-pss-ta";
    ta.value = row.text || "";
    ta.rows = 2;
    ta.placeholder = "写这一段的提示词…";
    rowEl.appendChild(ta);
    attachTextareaEditor(node, ta, row.id);

    attachDragHandlers(rowEl, row.id, handlers.onDrop);
    list.appendChild(rowEl);
  }
  refreshActionButtons(node, list.parentElement);
}

/** 按当前 DOM 里真实输入的内容更新「清空文字 / 恢复默认」的可用状态。 */
export function refreshActionButtons(node, root) {
  if (!root) return;
  const state = readState(node);
  const tas = [...root.querySelectorAll(".xh-pss-ta")];
  const labels = [...root.querySelectorAll(".xh-pss-label")];
  const anyText = tas.some((t) => t.value && t.value.trim());
  const anyLabel = labels.some((t) => t.value && t.value.trim());
  const anyOff = state.rows.some((r) => !r.enabled);
  const clear = root.querySelector(".xh-pss-actions button:nth-child(2)");
  const reset = root.querySelector(".xh-pss-actions button:nth-child(3)");
  if (clear) clear.disabled = !anyText;
  if (reset) reset.disabled = !(anyText || anyLabel || anyOff || state.rows.length !== 1
    || state.sepMode !== "comma");
  node._xhStackRefresh = () => refreshActionButtons(node, root);
}

// 🔴 这里刻意不提供任何「内容高度测量」函数。
// v1.59.0 曾有 measureContentHeight() + is-measuring，被拿去当 getMinHeight /
// installResizeFloor 的 measureFn，结果 4 行内容把拖动下限顶到 468px，
// 用户拉高后缩不回去（v1.58.x 的标签提示词更严重：700px → 下限 698px）。
// 现在两处下限都是常量，多的内容由 .xh-pss-list 自己滚动；
// 谁要再加「量 DOM 高度」的函数，先去读 Skill §13.46。
