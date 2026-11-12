// XiaoHei-提示词堆叠 · 行内输入 / 拖拽排序 / 确认层
// 1:1 学 ComfyUI-Pixaroma / js/prompt_stack/interaction.mjs（MIT）：
//   ① 输入框的所有事件都要挡在 DOM 里，不然 ComfyUI 画布会抢快捷键、点一下就取消选中；
//   ② 只有左侧把手能发起拖拽（整行 draggable 会让文本框里选字变成拖行）；
//   ③ Electron 禁用 window.confirm，删除 / 清空 / 重置用自绘小确认层。
import { setLabel, setText } from "./core.mjs";

/** ComfyUI 自己的快捷键（运行 / 保存 / 提示词权重）要放行，其余一律不外泄。 */
function isComfyShortcut(e) {
  if (!(e.ctrlKey || e.metaKey)) return false;
  const k = String(e.key || "").toLowerCase();
  return k === "enter" || k === "s" || k === "arrowup" || k === "arrowdown";
}

export function attachLabelEditor(node, inputEl, rowId) {
  const original = inputEl.value;
  let staged = original;
  inputEl.dataset.committed = original;
  const commit = () => {
    if (staged !== inputEl.dataset.committed) {
      setLabel(node, rowId, staged);
      inputEl.dataset.committed = staged;
    }
  };
  inputEl.addEventListener("input", (e) => {
    e.stopImmediatePropagation();
    staged = inputEl.value;
    node._xhStackRefresh?.();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (isComfyShortcut(e)) { commit(); return; }
    e.stopImmediatePropagation();
    if (e.key === "Enter") { e.preventDefault(); inputEl.blur(); }
    else if (e.key === "Escape") {
      e.preventDefault(); inputEl.value = inputEl.dataset.committed;
      staged = inputEl.dataset.committed; inputEl.blur();
    }
  });
  inputEl.addEventListener("blur", commit);
  inputEl.addEventListener("pointerdown", (e) => e.stopImmediatePropagation());
  inputEl.addEventListener("mousedown", (e) => e.stopImmediatePropagation());
}

export function attachTextareaEditor(node, taEl, rowId) {
  taEl.dataset.committed = taEl.value;
  let pending = false;
  const commit = () => {
    if (taEl.value !== taEl.dataset.committed) {
      setText(node, rowId, taEl.value);
      taEl.dataset.committed = taEl.value;
    }
    pending = false;
  };
  taEl.addEventListener("input", (e) => {
    e.stopImmediatePropagation();
    autoGrow(taEl);
    node._xhStackGrow?.();
    node._xhStackRefresh?.();
    if (!pending) {
      pending = true;
      requestAnimationFrame(commit);
    }
  });
  taEl.addEventListener("keydown", (e) => {
    if (isComfyShortcut(e)) { commit(); return; }
    e.stopImmediatePropagation();
  });
  taEl.addEventListener("blur", commit);
  taEl.addEventListener("pointerdown", (e) => e.stopImmediatePropagation());
  taEl.addEventListener("mousedown", (e) => e.stopImmediatePropagation());
  requestAnimationFrame(() => { autoGrow(taEl); node._xhStackGrow?.(); });
}

/**
 * 🔴 只给「内容最少需要多高」设一个 min-height 下限，绝不写 style.height。
 * 内联 height 会顶死 flex 伸展：用户把节点往下拖大时，行卡片和文本框纹丝不动，
 * 底下留一大块空白（v1.58.1 标签提示词踩过的原坑）。
 * 量 scrollHeight 前必须临时脱离 flex 并把高度归零，否则 textarea 的
 * scrollHeight 至少等于当前可视高度 → 节点拉高 → 下限跟着涨 → 无限喂食。
 * 打字变多 → 下限抬高、节点跟着长；节点拉高 → flex 仍能超过下限继续撑大。
 */
function autoGrow(ta) {
  if (ta.offsetParent === null) return;
  const savedFlex = ta.style.flex, savedH = ta.style.height, savedMin = ta.style.minHeight;
  ta.style.flex = "none";
  ta.style.height = "0px";
  ta.style.minHeight = "0px";
  const need = ta.scrollHeight;
  ta.style.flex = savedFlex;
  ta.style.height = savedH;
  ta.style.minHeight = savedMin;
  const floor = Math.max(38, Math.min(160, (need || 0) + 2));
  ta.style.minHeight = floor + "px";
}

export function autoGrowTextareas(root) {
  if (!root) return;
  root.querySelectorAll(".xh-pss-ta").forEach(autoGrow);
}

/** 自绘确认层：Esc / 点背景 / 取消 = false，确定 / 回车 = true。 */
export function xhConfirm({ title, message, okText = "确定", cancelText = "取消" } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "xh-pss-cf-back";
    const box = document.createElement("div");
    box.className = "xh-pss-cf-box";
    const t = document.createElement("div");
    t.className = "xh-pss-cf-title"; t.textContent = title || "确认一下";
    const m = document.createElement("div");
    m.className = "xh-pss-cf-msg"; m.textContent = message || "";
    const acts = document.createElement("div");
    acts.className = "xh-pss-cf-acts";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = cancelText;
    const ok = document.createElement("button");
    ok.type = "button"; ok.className = "pri"; ok.textContent = okText;
    acts.append(cancel, ok);
    box.append(t, m, acts);
    back.appendChild(box);
    document.body.appendChild(back);

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      window.removeEventListener("keydown", onKey, true);
      back.remove();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); finish(true); }
    };
    window.addEventListener("keydown", onKey, true);
    back.addEventListener("mousedown", (e) => { if (e.target === back) finish(false); });
    cancel.addEventListener("click", () => finish(false));
    ok.addEventListener("click", () => finish(true));
    queueMicrotask(() => ok.focus());
  });
}

// 模块级一份拖拽状态：多行的 handler 共用，才知道「谁被拖了」。
const _drag = { id: null };

export function attachDragHandlers(rowEl, rowId, onDrop) {
  rowEl.addEventListener("dragstart", (e) => {
    if (!e.target.closest?.(".xh-pss-handle")) { e.preventDefault(); return; }
    _drag.id = rowId;
    rowEl.classList.add("is-dragging");
    try { e.dataTransfer.effectAllowed = "move"; } catch {}
    try { e.dataTransfer.setData("text/plain", rowId); } catch {}
  });
  rowEl.addEventListener("dragover", (e) => {
    if (!_drag.id || _drag.id === rowId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch {}
    const rect = rowEl.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    rowEl.classList.toggle("is-drop-above", above);
    rowEl.classList.toggle("is-drop-below", !above);
  });
  rowEl.addEventListener("dragleave", () => {
    rowEl.classList.remove("is-drop-above", "is-drop-below");
  });
  rowEl.addEventListener("drop", (e) => {
    if (!_drag.id || _drag.id === rowId) return;
    e.preventDefault();
    const above = rowEl.classList.contains("is-drop-above");
    rowEl.classList.remove("is-drop-above", "is-drop-below");
    onDrop?.(_drag.id, rowId, above);
    _drag.id = null;
  });
  rowEl.addEventListener("dragend", () => {
    rowEl.classList.remove("is-dragging");
    _drag.id = null;
    rowEl.parentElement?.querySelectorAll(".xh-pss-row").forEach((s) => {
      s.classList.remove("is-drop-above", "is-drop-below", "is-dragging");
    });
  });
}
