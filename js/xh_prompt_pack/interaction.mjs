// XiaoHei-提示词批量 · 事件接线
// 1:1 复刻 ComfyUI-Pixaroma / js/prompt_pack/interaction.mjs（MIT）的交互：
//   文本框实时计数、三颗动作按钮、分隔药丸、键盘/指针事件拦截。
// 家族化：文案全中文、toast 署名 XiaoHei、翻转反馈走 render.mjs::flashBtnText
//   （只改文字 span，不冲掉按钮里的家族图标）。
import { app } from "../../../scripts/app.js";
import { setText, setMode, readState } from "./core.mjs";
import { applyState, updateCounter, updateClearButton, flashBtnText } from "./render.mjs";

const SUMMARY = "XiaoHei-提示词批量";

function toast(severity, msg) {
  const t = app?.extensionManager?.toast;
  if (t?.add) t.add({ severity, summary: SUMMARY, detail: msg, life: 2000 });
  else console.warn("[XiaoHei.PromptPack]", msg);
}

export function wireEvents(node, root) {
  const els = root._xhPp;
  if (!els) return;

  // 打字实时更新状态与计数（用 input，不用 change）。
  els.ta.addEventListener("input", () => {
    setText(node, els.ta.value);
    const state = readState(node);
    updateCounter(root, state);
    updateClearButton(root, state);
  });

  // 拦住 ComfyUI / LiteGraph 的全局快捷键（Q 排队、Delete 删节点…）。
  // 必须 stopImmediatePropagation：官方在 document 层监听，stopPropagation 拦不住。
  // 例外：Ctrl/Cmd+Enter 放行，让「在框里直接按快捷键运行」照常生效。
  els.ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") return;
    e.stopImmediatePropagation();
  });
  els.ta.addEventListener("pointerdown", (e) => e.stopImmediatePropagation());
  els.ta.addEventListener("mousedown", (e) => e.stopImmediatePropagation());

  els.copyBtn.addEventListener("click", async () => {
    const txt = els.ta.value || "";
    if (!txt) { toast("info", "框里是空的，没东西可复制"); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard not available");
      await navigator.clipboard.writeText(txt);
      flashBtnText(els.copyBtn, "已复制");
    } catch (err) {
      console.warn("[XiaoHei.PromptPack] 复制失败", err);
      toast("warn", "复制失败，剪贴板不可用");
    }
  });

  els.replaceBtn.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard read not available");
      const txt = await navigator.clipboard.readText();
      // 空剪贴板直接返回，绝不误清掉已有提示词。
      if (!txt) { toast("info", "剪贴板里没有文字，框里的东西没动"); return; }
      setText(node, txt);
      applyState(root, readState(node));
      flashBtnText(els.replaceBtn, "已替换");
      node.setDirtyCanvas(true, true);
    } catch (err) {
      console.warn("[XiaoHei.PromptPack] 粘贴失败", err);
      toast("warn", "粘贴失败，剪贴板不可用");
    }
  });

  els.clearBtn.addEventListener("click", () => {
    if (els.clearBtn.disabled) return;
    setText(node, "");
    applyState(root, readState(node));
    node.setDirtyCanvas(true, true);
  });

  for (const pill of els.pills || []) {
    pill.addEventListener("click", () => {
      setMode(node, pill.dataset.mode);
      applyState(root, readState(node));
      node.setDirtyCanvas(true, true);
    });
  }

  // 按钮上的 pointer 事件不要触发节点拖动。
  for (const b of [els.copyBtn, els.replaceBtn, els.clearBtn, ...(els.pills || [])]) {
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("mousedown", (e) => e.stopPropagation());
  }
}

/** 框里一条提示词都没有时点「运行」的提示。
 *  先用官方 toast，老版本退回一条横幅（配色只取官方变量 + 品牌色）。 */
export function showNoPromptsToast(appArg) {
  const msg = "框里还没有提示词，先粘一块进去再点运行。";
  const tm = appArg?.extensionManager?.toast;
  if (tm && typeof tm.add === "function") {
    try {
      tm.add({ severity: "warn", summary: SUMMARY, detail: msg, life: 4000 });
      return;
    } catch (_e) { /* fall through */ }
  }
  console.warn("[XiaoHei.PromptPack] " + msg);
  try {
    const banner = document.createElement("div");
    banner.textContent = msg;
    banner.style.cssText = "position:fixed;top:60px;right:20px;"
      + "background:var(--secondary,#262729);color:var(--foreground,#fff);"
      + "font:400 13px var(--font-sans, ui-sans-serif, system-ui, sans-serif);"
      + "padding:10px 14px;border-radius:6px;"
      + "border:2px solid var(--xh-primary,#E8A33C);z-index:99999;";
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
  } catch (_e) { /* ignore */ }
}
