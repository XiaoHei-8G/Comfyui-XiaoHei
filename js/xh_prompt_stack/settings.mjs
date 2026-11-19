// XiaoHei-提示词堆叠 · 节点脸上的齿轮 → 右侧浮出设置窗口
// 1:1 学 ComfyUI-Pixaroma / js/prompt_each/settings.mjs（MIT）的面板结构，
// 定位 / 跟随 / 拖拽直接复用家族 web/shared/node_panel.mjs（当初逐行抄来的那份）。
// 🔴 家族铁律：分隔符不许做成「要手打 \n 语法」的大输入框 ——
//    四个小方片直接点，选「自定义」才在下一层露出一行小输入框。
import { getNodeScreenRect, placeBeside, followNode, makeDraggable } from "../shared/node_panel.mjs";
import { readState, patchState, SEPS } from "./core.mjs";
import { xhIconHTML } from "../xh_ui_kit.js";

const CSS_ID = "xh-stack-settings-css";
const CSS = `
.xh-pss-set{position:fixed;z-index:11030;width:320px;max-width:94vw;display:flex;flex-direction:column;
  background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:9px;overflow:hidden;
  box-shadow:0 16px 44px rgba(0,0,0,.5);font:12px var(--font-family,sans-serif)}
.xh-pss-set-h{flex:none;display:flex;align-items:center;padding:9px 12px;font-weight:600;
  border-bottom:1px solid var(--border,#494a50);cursor:grab;user-select:none}
.xh-pss-set-h .x{margin-left:auto;cursor:pointer;opacity:.7;font-size:14px}
.xh-pss-set-h .x:hover{opacity:1}
.xh-pss-set-b{padding:12px;display:flex;flex-direction:column;gap:14px;max-height:72vh;overflow:auto}
.xh-pss-set-lab{font-size:12px;font-weight:600}
.xh-pss-set-sub{font-size:11px;opacity:.62;line-height:1.45;margin-top:2px}
.xh-pss-set-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.xh-pss-set-chip{background:transparent;color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 10px;
  font-size:11px;cursor:pointer;flex:1;white-space:nowrap}
.xh-pss-set-chip:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-pss-set-chip.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);
  color:var(--background,#171718);font-weight:600}
.xh-pss-set-custom{display:none;margin-top:8px;flex-direction:column;gap:4px}
.xh-pss-set-custom.on{display:flex}
.xh-pss-set-custom input{background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--xh-primary,#E8A33C);border-radius:5px;padding:6px 8px;
  font-size:11.5px;outline:none}
.xh-pss-set-f{flex:none;display:flex;padding:9px 12px;border-top:1px solid var(--border,#494a50)}
.xh-pss-set-f button{margin-left:auto;background:transparent;color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 14px;font-size:11px;cursor:pointer}
`;
function injectCSS() {
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

let _panel = null, _panelNode = null, _stopFollow = null, _userMoved = false, _onChange = null;

function outsideClose(e) {
  if (!_panel) return;
  if (_panel.contains(e.target)) return;
  // 节点脸上的齿轮要豁免：否则按下时先关、click 又立刻开回。
  if (e.target.closest?.("[data-xh-stack-gear], .xh-pss-set, .xh-pss-cf-back")) return;
  closeStackSettings();
}
function escClose(e) {
  if (e.key === "Escape" && _panel) {
    if (document.querySelector(".xh-pss-cf-back")) return;
    e.stopPropagation(); closeStackSettings();
  }
}
export function closeStackSettings() {
  try { _stopFollow?.(); } catch {}
  _stopFollow = null;
  if (_panel) { try { _panel.remove(); } catch {} }
  _panel = null; _panelNode = null; _onChange = null; _userMoved = false;
  document.removeEventListener("pointerdown", outsideClose, true);
  document.removeEventListener("keydown", escClose, true);
}
export function closeStackSettingsFor(node) { if (_panelNode === node) closeStackSettings(); }
export function isStackSettingsOpenFor(node) { return !!_panel && _panelNode === node; }

function section(body, label, sub) {
  const wrap = el("div");
  wrap.append(el("div", "xh-pss-set-lab", label), el("div", "xh-pss-set-sub", sub));
  body.appendChild(wrap);
  return wrap;
}

export function openStackSettings(node, onChange) {
  closeStackSettings();
  injectCSS();
  _onChange = onChange || null;
  _panelNode = node;

  const panel = el("div", "xh-pss-set");
  const head = el("div", "xh-pss-set-h");
  head.append(el("span", null, "提示词堆叠 · 设置"));
  const x = el("span", "x"); x.dataset.xhIconDone = "1"; x.innerHTML = xhIconHTML("x", { size: 14, color: "current" }); x.title = "关闭";
  x.addEventListener("click", closeStackSettings);
  head.appendChild(x);
  panel.appendChild(head);
  makeDraggable(panel, head, {
    onUserMove: () => { _userMoved = true; },
    ignoreSelector: ".xh-pss-set-h .x",
  });

  const body = el("div", "xh-pss-set-b");
  const apply = (patch) => { patchState(node, patch); _onChange?.(node); };

  const w1 = section(body, "每行之间用什么隔开", "只影响「开着」的行；行名不会进提示词。");
  const w2 = section(body, "拖左侧把手换顺序", "关掉的行整段跳过；清空文字不会删掉行和行名。");

  const row = el("div", "xh-pss-set-row");
  const chips = [];
  const custom = el("div", "xh-pss-set-custom");
  const input = document.createElement("input");
  input.type = "text"; input.maxLength = 16;
  input.placeholder = "直接输入想用的字符，比如 ｜";
  input.title = "最多 16 个字；要换行就点上面的「换行」，这里不用敲记号";
  input.value = readState(node).sepCustom || "";
  input.addEventListener("input", (e) => {
    e.stopImmediatePropagation();
    apply({ sepMode: "custom", sepCustom: input.value.slice(0, 16) });
  });
  input.addEventListener("keydown", (e) => e.stopImmediatePropagation());
  input.addEventListener("pointerdown", (e) => e.stopImmediatePropagation());
  custom.append(input, el("div", "xh-pss-set-sub", "要换行就点上面「换行」，这里不用敲记号。"));

  for (const o of SEPS) {
    const b = el("button", "xh-pss-set-chip", o.label);
    b.type = "button"; b.title = o.label;
    b.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      const isCustom = o.mode === "custom";
      custom.classList.toggle("on", isCustom);
      apply({ sepMode: o.mode });
      if (isCustom) input.focus();
    });
    if (readState(node).sepMode === o.mode) b.classList.add("on");
    chips.push(b); row.appendChild(b);
  }
  custom.classList.toggle("on", readState(node).sepMode === "custom");
  w1.append(row, custom);
  // section() 已把 w2 追加进 body，这里保持顺序：w1 在前、w2 在后。
  panel.append(body, (() => {
    const foot = el("div", "xh-pss-set-f");
    const done = el("button", null, "完成");
    done.type = "button";
    done.addEventListener("click", closeStackSettings);
    foot.appendChild(done);
    return foot;
  })());
  document.body.appendChild(panel);
  _panel = panel;

  placeBeside(panel, getNodeScreenRect(node));
  _stopFollow = followNode(panel, node, {
    isCurrent: () => _panel === panel,
    isUserMoved: () => _userMoved,
  });
  // 晚一拍挂，免得「打开面板」这一下点击自己把自己关掉。
  setTimeout(() => {
    if (!_panel) return;
    document.addEventListener("pointerdown", outsideClose, true);
    document.addEventListener("keydown", escClose, true);
  }, 0);
  return panel;
}
