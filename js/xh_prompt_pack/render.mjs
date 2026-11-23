// XiaoHei-提示词批量 · 节点 DOM 外观
// 1:1 复刻 ComfyUI-Pixaroma / js/prompt_pack/render.mjs（MIT）的 DOM 结构：
//   三颗分隔药丸 + 一整块文本框 + 底部三颗按钮 + 右下计数胶囊。
// 家族化四处：全中文文案、配色只取官方 CSS 变量（--secondary / --foreground /
//   --border / --background），品牌色 --xh-primary 只用于悬停/选中/运行态，
//   图案全部走自有图标库 xhIconHTML（零硬编码 SVG / 零 emoji / 零字母冒充），
//   字体统一 var(--font-sans, ui-sans-serif, system-ui, sans-serif)。
import { MODES, parsePrompts } from "./core.mjs";
import { xhIconHTML, onLangChanged } from "../xh_ui_kit.js";

const CSS_ID = "xh-prompt-pack-css";
const CSS = `
.xh-pp-root{display:flex;flex-direction:column;gap:6px;padding:6px;width:100%;
  box-sizing:border-box;color:var(--foreground,#fff);
  font:400 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif)}
.xh-pp-modebar{display:flex;flex-wrap:wrap;gap:4px;flex:0 0 auto;user-select:none}
.xh-pp-modepill{flex:1 1 auto;min-width:64px;box-sizing:border-box;
  background:var(--secondary,#262729);border:1px solid var(--border,#494a50);
  border-radius:4px;color:var(--foreground,#fff);cursor:pointer;
  font:400 11px var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  padding:4px 0;text-align:center;transition:background .1s,color .1s,border-color .1s}
.xh-pp-modepill:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-pp-modepill.active{background:var(--xh-primary,#E8A33C);
  border-color:var(--xh-primary,#E8A33C);color:var(--background,#171718)}
.xh-pp-tawrap{position:relative;flex:1 1 auto;min-height:100px;display:flex}
.xh-pp-ta{flex:1 1 auto;width:100%;height:100%;box-sizing:border-box;
  background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:4px;padding:6px 8px;
  font:400 12px/1.5 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  resize:none;outline:none}
.xh-pp-ta:focus{border-color:var(--xh-primary,#E8A33C)}
.xh-pp-ta::placeholder{opacity:.5}
.xh-pp-bottombar{display:flex;flex-wrap:wrap;align-items:center;
  justify-content:space-between;flex:0 0 auto;gap:8px;padding:0 2px}
.xh-pp-actions{display:flex;flex-wrap:wrap;gap:4px;flex:0 1 auto;min-width:0;
  user-select:none}
.xh-pp-actbtn{box-sizing:border-box;min-width:86px;user-select:none;
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  background:var(--secondary,#262729);border:1px solid var(--border,#494a50);
  border-radius:4px;color:var(--foreground,#fff);cursor:pointer;
  font:400 11px var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  padding:4px 8px;transition:background .1s,color .1s,border-color .1s}
.xh-pp-actbtn:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-pp-actbtn:disabled{color:var(--foreground,#fff);opacity:.35;cursor:default;
  background:var(--secondary,#262729);border-color:var(--border,#494a50)}
.xh-pp-actbtn:disabled:hover{border-color:var(--border,#494a50)}
.xh-pp-actbtn.is-flashing,.xh-pp-actbtn.is-flashing:hover{
  background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);
  color:var(--background,#171718)}
.xh-pp-counter{font:400 10.5px var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-variant-numeric:tabular-nums;color:var(--foreground,#fff);opacity:.6;
  background:var(--secondary,#262729);padding:2px 8px;border-radius:10px;
  user-select:none;white-space:nowrap}
.xh-pp-counter.active{color:var(--xh-primary,#E8A33C);opacity:1;
  border:1px solid var(--xh-primary,#E8A33C)}
.xh-pp-counter.empty{opacity:.3}
`;

export function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** 一颗带家族图标的动作按钮；文字单独放 span，翻转反馈只改这个 span，
 *  不会把图标 innerHTML 冲掉（§13.49 状态翻转文案铁律）。 */
function mkActBtn(icon, label, title, langKey) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "xh-pp-actbtn";
  b.title = title;
  b.innerHTML = xhIconHTML(icon, { size: 12, color: "current" })
    + '<span class="xh-pp-btnlabel"></span>';
  b.querySelector(".xh-pp-btnlabel").textContent = label;
  b.dataset.xhIconDone = "1";
  if (langKey) b.dataset.xhPpLang = langKey;
  return b;
}
// 🔴 按钮文案走家族语言中枢（2026-11-21 用户拍板）：「粘贴替换」→「粘贴」，
//    三颗按钮以前硬编码中文、切英文纹丝不动，这里一并接 onLangChanged。
const BTN_LANG = {
  copy:  { zh: ["复制全部", "把框里全部文字复制到剪贴板"], en: ["Copy all", "Copy all text in the box to the clipboard"] },
  paste: { zh: ["粘贴", "用剪贴板里的文字覆盖框里的内容（剪贴板是空的或只有图片时不会清空）"], en: ["Paste", "Replace the box with text from the clipboard (empty or image-only clipboard leaves it untouched)"] },
  clear: { zh: ["清空", "立刻清空框里的文字（不弹确认）"], en: ["Clear", "Clear the text immediately (no confirmation)"] },
};
const L = (zh, en) => (window.XH_LANG === "en" ? en : zh);
function applyBtnLang() {
  for (const b of document.querySelectorAll(".xh-pp-actbtn[data-xh-pp-lang]")) {
    const rec = BTN_LANG[b.dataset.xhPpLang];
    if (!rec) continue;
    const pair = L(rec.zh, rec.en);
    const span = b.querySelector(".xh-pp-btnlabel");
    // 只改文字 span，绝不动 innerHTML（图标还在里面）。
    if (span) span.textContent = pair[0];
    b.title = pair[1];
  }
}
onLangChanged(applyBtnLang, { tag: "XiaoHei.PromptPack.BtnLang" });

/** 造一整块 DOM。事件由 interaction.mjs::wireEvents 挂。 */
export function buildRoot() {
  const root = document.createElement("div");
  root.className = "xh-pp-root";

  // 分隔药丸：数量、label、实际拆分全由 core.mjs 的 MODES 驱动。
  const modebar = document.createElement("div");
  modebar.className = "xh-pp-modebar";
  const pills = MODES.map((m) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "xh-pp-modepill";
    pill.textContent = m.label;
    pill.dataset.mode = m.id;
    pill.title = m.title;
    // 纯文字控件主动打幂等标记，防全页兜底把它当成「要补图案」（§13.54）。
    pill.dataset.xhIconDone = "1";
    modebar.appendChild(pill);
    return pill;
  });

  const tawrap = document.createElement("div");
  tawrap.className = "xh-pp-tawrap";
  const ta = document.createElement("textarea");
  ta.className = "xh-pp-ta";
  ta.placeholder = "把一整块提示词粘到这里……\n\n顶上选好它们是怎么分开的，右下角会显示能拆出几条。\n点「运行」，一条提示词自动跑一次工作流。";
  ta.spellcheck = false;
  tawrap.appendChild(ta);

  const bottombar = document.createElement("div");
  bottombar.className = "xh-pp-bottombar";
  const actions = document.createElement("div");
  actions.className = "xh-pp-actions";

  const mkLangBtn = (key, icon) => {
    const pair = L(BTN_LANG[key].zh, BTN_LANG[key].en);
    return mkActBtn(icon, pair[0], pair[1], key);
  };
  const copyBtn = mkLangBtn("copy", "copy");
  const replaceBtn = mkLangBtn("paste", "clipboard-paste");
  const clearBtn = mkLangBtn("clear", "trash-2");
  clearBtn.disabled = true;
  actions.append(copyBtn, replaceBtn, clearBtn);

  const counter = document.createElement("div");
  counter.className = "xh-pp-counter empty";
  counter.textContent = "0 条提示词";
  counter.title = "现在框里能拆出几条提示词；运行时倒数还剩几条没跑完。";

  bottombar.append(actions, counter);
  root.append(modebar, tawrap, bottombar);
  root._xhPp = { ta, counter, copyBtn, replaceBtn, clearBtn, pills };
  return root;
}

export function applyState(root, state, runState) {
  const els = root._xhPp;
  if (!els) return;
  if (els.ta.value !== state.text) els.ta.value = state.text;
  for (const pill of els.pills || []) {
    pill.classList.toggle("active", pill.dataset.mode === state.mode);
  }
  updateCounter(root, state, runState);
  updateClearButton(root, state);
}

/** 计数胶囊：运行态显示「剩 N 条」，平时显示「N 条提示词」。
 *  数字来自 core.mjs 的 parsePrompts —— 与队列循环同一个函数，不会数错。 */
export function updateCounter(root, state, runState) {
  const els = root._xhPp;
  if (!els || !els.counter) return;
  const total = parsePrompts(state?.text || "", state?.mode).length;
  els.counter.classList.remove("active", "empty");
  if (runState && runState.running) {
    els.counter.classList.add("active");
    els.counter.textContent = `剩 ${runState.remaining} 条`;
  } else if (total === 0) {
    els.counter.classList.add("empty");
    els.counter.textContent = "0 条提示词";
  } else {
    els.counter.textContent = `${total} 条提示词`;
  }
}

export function updateClearButton(root, state) {
  const els = root._xhPp;
  if (!els || !els.clearBtn) return;
  els.clearBtn.disabled = !(state?.text && state.text.length > 0);
}

/** 只翻转文字 span，图标保持不动。 */
export function flashBtnText(btn, label) {
  const lab = btn.querySelector(".xh-pp-btnlabel");
  if (!lab) return;
  const orig = lab.textContent;
  lab.textContent = label;
  btn.classList.add("is-flashing");
  setTimeout(() => {
    lab.textContent = orig;
    btn.classList.remove("is-flashing");
  }, 700);
}
