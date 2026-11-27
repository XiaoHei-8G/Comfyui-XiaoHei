// 释放显存（XiaoHei）- 浮动设置面板。
// 1:1 复刻 ComfyUI-Pixaroma / js/free_vram/settings.mjs（MIT）的单例/drag/follow/阈值滑条逻辑。
// 家族规范化：全中文 + 接语言中枢、关闭按钮走家族图标库「关闭」、
//   配色只取官方 CSS 变量（强调色 --xh-primary 随主题）、字体 var(--font-sans)。

import { createAccentSection } from "../shared/node_settings.mjs";
import { followNode, placeBeside, getNodeScreenRect, makeDraggable } from "../shared/node_panel.mjs";
import { xhIconHTML, onLangChanged } from "../xh_ui_kit.js";
import { t } from "./i18n.mjs";
import { THRESHOLD_MIN_GB, readState, writeState } from "./core.mjs";

let _panel = null;
let _panelNode = null;
let _onChange = null;
let _stopFollow = null;
let _userMoved = false; // 用户是否把面板拖到了别处
let _cpHandle = null;   // 当前打开的取色器，关面板时一并收掉
let _cssDone = false;
let _panelRefresh = null; // 切语言时重绘面板

// 滑块上限。刻意是常量而非读显卡：控件范围若在运行后变化，第二次打开行为就不同。
// 64 覆盖所有消费级卡；readState 仍接受到 128，让更大机器上手填的值能往返保留。
const THRESHOLD_MAX_SLIDER = 64;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function injectPanelCSS() {
  if (_cssDone || document.getElementById("xh-fv-panel-css")) return;
  _cssDone = true;
  const style = document.createElement("style");
  style.id = "xh-fv-panel-css";
  style.textContent = [
    ".xh-fv-panel{position:fixed;z-index:10010;width:320px;max-width:94vw;background:var(--background,#171718);border:1px solid var(--border,#494a50);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.6);font:400 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);overflow:hidden;max-height:88vh;display:flex;flex-direction:column;color:var(--foreground,#fff)}",
    ".xh-fv-phead{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border,#494a50);color:var(--foreground,#fff);font-size:13px;font-weight:600;cursor:move;}",
    ".xh-fv-px{border:0;background:transparent;color:var(--foreground,#fff);opacity:.6;font-size:13px;cursor:pointer;padding:3px 6px;border-radius:4px;display:inline-flex;align-items:center;}",
    ".xh-fv-px:hover{opacity:1;color:var(--xh-primary,#E8A33C);}",
    ".xh-fv-px svg{width:13px;height:13px;}",
    ".xh-fv-pbody{padding:12px;display:flex;flex-direction:column;gap:12px;color:var(--foreground,#fff);overflow-y:auto;min-height:0;}",
    ".xh-fv-prow{display:flex;align-items:center;gap:9px;}",
    ".xh-fv-plab{font-size:12px;color:var(--foreground,#fff);}",
    ".xh-fv-psub{font-size:10px;color:var(--foreground,#fff);opacity:.56;margin-top:2px;line-height:1.4;}",
    ".xh-fv-qval{font-size:12px;color:var(--xh-primary,#E8A33C);min-width:74px;text-align:right;white-space:nowrap;}",
    ".xh-fv-qsl{flex:1;min-width:0;accent-color:var(--xh-primary,#E8A33C);}",
    ".xh-fv-qsl:disabled{opacity:.35;}",
    '.xh-fv-sw{width:30px;height:16px;border-radius:8px;background:var(--secondary,#262729);position:relative;display:inline-block;cursor:pointer;flex:0 0 auto;transition:background .15s;border:1px solid var(--border,#494a50);}',
    '.xh-fv-sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--foreground,#fff);opacity:.72;transition:left .15s;}',
    ".xh-fv-sw.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);}",
    ".xh-fv-sw.on::after{left:16px;background:var(--background,#171718);opacity:1;}",
  ].join("\n");
  document.head.appendChild(style);
}

function stopFollowing() {
  _stopFollow?.();
  _stopFollow = null;
}

function outsideClose(e) {
  if (!_panel) return;
  if (_panel.contains(e.target)) return;
  // 家族取色器和通用选项弹层都挂在 document.body，且这是捕获阶段——不放行它们，
  // 一选颜色就会把下面的面板关掉。
  if (e.target.closest?.(".xh-cp-popup, .xh-cp-modal-backdrop, .pix-nset-pop")) return;
  // 节点脸上的齿轮走 click，比这个 pointerdown 晚——不放行它，面板会关了又立刻重开，永远关不掉。
  if (e.target.closest?.(".xh-fv-gear")) return;
  closeSettingsPanel();
}

function escClose(e) {
  if (e.key === "Escape" && _panel) {
    e.stopPropagation();
    closeSettingsPanel();
  }
}

export function closeSettingsPanel() {
  stopFollowing();
  try { _cpHandle?.close?.(); } catch {}
  _cpHandle = null;
  // 切语言监听按面板实例注销，不能全局常驻。
  try { _panelRefresh?.(); } catch {}
  _panelRefresh = null;
  if (_panel) {
    try { _panel.remove(); } catch {}
  }
  _panel = null;
  _panelNode = null;
  _onChange = null;
  // 在关闭时重置，而不是打开时：否则拖过一次的面板会教下一个面板停在原地。
  _userMoved = false;
  document.removeEventListener("pointerdown", outsideClose, true);
  document.removeEventListener("keydown", escClose, true);
}

// onRemoved 钩子：只关闭属于被删节点的面板。
export function closeSettingsPanelFor(node) {
  if (_panelNode === node) closeSettingsPanel();
}

export function isPanelOpenFor(node) {
  return _panelNode === node && !!_panel;
}

function section(body, label, sub) {
  const wrap = el("div");
  wrap.appendChild(el("div", "xh-fv-plab", label));
  if (sub) wrap.appendChild(el("div", "xh-fv-psub", sub));
  body.appendChild(wrap);
  return wrap;
}

function switchRow(node, key, label, sub, after) {
  const row = el("div", "xh-fv-prow");
  const sw = el("span", "xh-fv-sw" + (readState(node)[key] ? " on" : ""));
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", String(!!readState(node)[key]));
  sw.tabIndex = 0;
  const toggle = () => {
    const st = readState(node);
    const next = writeState(node, { [key]: !st[key] });
    sw.classList.toggle("on", next[key]);
    sw.setAttribute("aria-checked", String(!!next[key]));
    after?.(next);
    // 面板里每个控件都通过 _onChange 生效，它不是可选的点缀。
    _onChange?.();
  };
  sw.addEventListener("click", toggle);
  sw.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  });
  const txt = el("div");
  txt.appendChild(el("div", "xh-fv-plab", label));
  txt.appendChild(el("div", "xh-fv-psub", sub));
  row.appendChild(sw);
  row.appendChild(txt);
  return row;
}

export function openSettingsPanel(node, onChange) {
  closeSettingsPanel();
  injectPanelCSS();
  _onChange = onChange || null;
  const panel = el("div", "xh-fv-panel");
  _panel = panel;
  _panelNode = node;

  const head = el("div", "xh-fv-phead");
  head.appendChild(el("span", null, t().panelTitle));
  const x = el("button", "xh-fv-px");
  x.type = "button";
  x.title = t().panelTitle;
  x.innerHTML = xhIconHTML("关闭", { size: 13, color: "current" });
  x.onclick = closeSettingsPanel;
  head.appendChild(x);
  panel.appendChild(head);
  // ✕ 在拖拽把手内部，而 makeDraggable 在 pointerdown 上 preventDefault + setPointerCapture——
  // 没有 ignoreSelector，click 永远到不了，按钮就失效。
  makeDraggable(panel, head, {
    onUserMove: () => { _userMoved = true; },
    ignoreSelector: ".xh-fv-px",
  });

  const body = el("div", "xh-fv-pbody");
  buildRows(node, body);
  panel.appendChild(body);
  document.body.appendChild(panel);
  placeBeside(panel, getNodeScreenRect(node));
  _stopFollow = followNode(panel, node, {
    isCurrent: () => _panel === panel,
    isUserMoved: () => _userMoved,
  });

  // 切语言时只重建行（不重建面板/拖拽/follow），先记下当前滚动位置。
  _panelRefresh = onLangChanged(() => {
    if (_panel !== panel) return;
    const scroll = body.scrollTop;
    body.textContent = "";
    buildRows(node, body);
    head.firstChild.textContent = t().panelTitle;
    x.title = t().panelTitle;
    body.scrollTop = scroll;
  }, { tag: "XiaoHei.FreeVram.Panel" });

  // 延迟挂载，避免「打开面板」那一次 click 立刻又把它关掉。
  setTimeout(() => {
    document.addEventListener("pointerdown", outsideClose, true);
    document.addEventListener("keydown", escClose, true);
  }, 0);
  return panel;
}

function buildRows(node, body) {
  const T = t();
  // ── 释放什么 ──
  section(body, T.secWhat, T.secWhatSub);
  body.appendChild(switchRow(node, "gc", T.gc, T.gcSub));

  // ── 何时 ──
  section(body, T.secWhen, T.secWhenSub);
  body.appendChild(switchRow(node, "everyRun", T.everyRun, T.everyRunSub));

  // 声明在调用它的开关之前：开关回调只在点击时触发，但用 let 更实诚。
  let syncThreshold = () => {};

  const thWrap = el("div");
  thWrap.appendChild(switchRow(node, "useThreshold", T.onlyLow, T.onlyLowSub,
    () => syncThreshold()));

  const thRow = el("div", "xh-fv-prow");
  thRow.style.marginTop = "7px";
  const thSl = el("input", "xh-fv-qsl");
  thSl.type = "range";
  thSl.min = String(THRESHOLD_MIN_GB);
  thSl.max = String(THRESHOLD_MAX_SLIDER);
  thSl.step = "0.5";
  thSl.value = String(readState(node).thresholdGb);
  const thVal = el("span", "xh-fv-qval", "");
  // 读 STATE 而非 thSl.value。range 赋值时会 sanitize：给 100（max 64）存成 64，
  // 读 .value 得 "64"，但存储值仍是 100（readState 允许到 128）——读输入框会让面板
  // 和节点脸对不上。
  syncThreshold = () => {
    const st = readState(node);
    thSl.disabled = !st.useThreshold;
    thVal.style.opacity = st.useThreshold ? "1" : "0.35";
    thVal.textContent = t().underGB(st.thresholdGb);
    thSl.title = st.thresholdGb > THRESHOLD_MAX_SLIDER
      ? t().tipOverSlider(st.thresholdGb)
      : t().tipUnderSlider(st.thresholdGb);
    thVal.title = thSl.title;
  };
  thSl.oninput = () => {
    writeState(node, { thresholdGb: parseFloat(thSl.value) });
    syncThreshold();
    _onChange?.();
  };
  syncThreshold();
  thRow.appendChild(thSl);
  thRow.appendChild(thVal);
  thWrap.appendChild(thRow);
  body.appendChild(thWrap);

  // ── 显示 ──
  section(body, T.secShow);
  body.appendChild(switchRow(node, "showBar", T.showBar, T.showBarSub));

  // 2026-11-25：原「强调色 / 按键颜色」块（createAccentSection）已删除 —— 家族右键
  // 「节点配色 → 按键」是唯一配色入口，齿轮里不再重复一个改同一 accent 的色块。
  // 需要改按键色请右键节点 → 节点配色 → 按键。
}
