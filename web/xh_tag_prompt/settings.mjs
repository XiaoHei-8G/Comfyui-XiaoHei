// XiaoHei-标签提示词 · 节点脸上的齿轮 → 右侧浮出设置窗口
// 1:1 学 ComfyUI-Pixaroma / js/prompt_each/settings.mjs（MIT）的面板结构：
//   标题栏 + X、每段「小标题 + 一行灰说明 + 二选一小方片 / 开关」，
//   可拖、跟随节点、点画布或 Esc 关闭。
// 骨架不自己重写：直接复用家族 web/shared/node_panel.mjs（当初逐行从
//   Pixaroma 抄进来的那份，含丢失 pointerup、缩放跟随、ResizeObserver 三处修好的坑）。
// 🔴 家族铁律 §13.33：这里的都是「设置」，外观开关不写进提交给后端的 state，
//    改一下不该让整张图重跑；order / sep 才是真执行数据。
import { app } from "../../../scripts/app.js";
import { getNodeScreenRect, placeBeside, followNode, makeDraggable } from "../shared/node_panel.mjs";

export const STATE_KEY = "tagPromptState";
export const DEFAULT_ORDER_SETTING = "XH.Tag.DefaultOrder";
export const SEPS = [
  { value: ", ", label: "逗号空格" },
  { value: "\n", label: "换行" },
  { value: " ", label: "空格" },
];

export function readState(node) {
  const s = (node?.properties && node.properties[STATE_KEY]) || {};
  return {
    text: typeof s.text === "string" ? s.text : "",
    order: s.order === "wired" ? "wired" : "mine",
    sep: typeof s.sep === "string" ? s.sep : ", ",
    showExpanded: s.showExpanded !== false,
  };
}
export function writeState(node, patch) {
  node.properties = node.properties || {};
  node.properties[STATE_KEY] = { ...readState(node), ...patch };
}
export function getDefaultOrder() {
  try { return app.ui?.settings?.getSettingValue?.(DEFAULT_ORDER_SETTING) === "wired" ? "wired" : "mine"; }
  catch { return "mine"; }
}
export async function setDefaultOrder(v) {
  try { await app.ui?.settings?.setSettingValueAsync?.(DEFAULT_ORDER_SETTING, v === "wired" ? "wired" : "mine"); }
  catch { /* 设置没就绪也不影响本次会话 */ }
}

const CSS_ID = "xh-tag-settings-css";
const CSS = `
.xh-tags{position:fixed;z-index:11020;width:320px;max-width:94vw;display:flex;flex-direction:column;
  background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:9px;overflow:hidden;
  box-shadow:0 16px 44px rgba(0,0,0,.5);font:12px var(--font-family,sans-serif)}
.xh-tags-h{flex:none;display:flex;align-items:center;padding:9px 12px;font-weight:600;
  border-bottom:1px solid var(--border,#494a50);cursor:grab;user-select:none}
.xh-tags-h .x{margin-left:auto;cursor:pointer;opacity:.7;font-size:14px}
.xh-tags-h .x:hover{opacity:1}
.xh-tags-b{padding:12px;display:flex;flex-direction:column;gap:14px;max-height:72vh;overflow:auto}
.xh-tags-lab{font-size:12px;font-weight:600}
.xh-tags-sub{font-size:11px;opacity:.62;line-height:1.45;margin-top:2px}
.xh-tags-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.xh-tags-chip{background:transparent;color:var(--foreground,#fff);border:1px solid var(--border,#494a50);
  border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer;flex:1;white-space:nowrap}
.xh-tags-chip:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-tags-chip.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);
  color:var(--background,#171718);font-weight:600}
.xh-tags-swrow{display:flex;align-items:center;gap:10px;margin-top:7px}
.xh-tags-sw{width:34px;height:18px;border-radius:9px;flex:none;cursor:pointer;position:relative;
  background:transparent;border:1px solid var(--border,#494a50)}
.xh-tags-sw::after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;
  background:var(--foreground,#fff);opacity:.6;transition:left .12s,opacity .12s}
.xh-tags-sw.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C)}
.xh-tags-sw.on::after{left:18px;opacity:1;background:var(--background,#171718)}
.xh-tags-f{flex:none;display:flex;padding:9px 12px;border-top:1px solid var(--border,#494a50)}
.xh-tags-f button{margin-left:auto;background:transparent;color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 14px;font-size:11px;cursor:pointer}
`;
function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS;
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
  if (e.target.closest?.("[data-xh-tag-gear], .xh-tage, .xh-tag-ac")) return;
  closeTagSettings();
}
function escClose(e) {
  if (e.key === "Escape" && _panel) {
    if (document.querySelector(".xh-tag-ac")) return;
    e.stopPropagation(); closeTagSettings();
  }
}
export function closeTagSettings() {
  try { _stopFollow?.(); } catch {}
  _stopFollow = null;
  if (_panel) { try { _panel.remove(); } catch {} }
  _panel = null; _panelNode = null; _onChange = null; _userMoved = false;
  document.removeEventListener("pointerdown", outsideClose, true);
  document.removeEventListener("keydown", escClose, true);
}
export function closeTagSettingsFor(node) { if (_panelNode === node) closeTagSettings(); }
export function isTagSettingsOpenFor(node) { return !!_panel && _panelNode === node; }

function section(body, label, sub) {
  const wrap = el("div");
  wrap.append(el("div", "xh-tags-lab", label), el("div", "xh-tags-sub", sub));
  body.appendChild(wrap);
  return wrap;
}
function chipRow(wrap, options, current, onPick) {
  const row = el("div", "xh-tags-row");
  const btns = [];
  for (const o of options) {
    const b = el("button", "xh-tags-chip" + (o.value === current ? " on" : ""), o.label);
    b.type = "button"; b.title = o.title || o.label;
    b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      onPick(o.value);
    });
    row.appendChild(b); btns.push(b);
  }
  wrap.appendChild(row);
}

export function openTagSettings(node, onChange) {
  closeTagSettings();
  injectCSS();
  _onChange = onChange || null;
  _panelNode = node;

  const panel = el("div", "xh-tags");
  const head = el("div", "xh-tags-h");
  head.append(el("span", null, "⚙ 标签提示词 · 设置"));
  const x = el("span", "x", "✕"); x.title = "关闭";
  x.addEventListener("click", closeTagSettings);
  head.appendChild(x);
  panel.appendChild(head);
  makeDraggable(panel, head, {
    onUserMove: () => { _userMoved = true; },
    ignoreSelector: ".xh-tags-h .x",
  });

  const body = el("div", "xh-tags-b");
  const st = readState(node);
  const apply = (patch) => { writeState(node, patch); _onChange?.(node); };

  const w1 = section(body, "谁排前面", "接了上游文字时，决定两段提示词输出的先后；没接上游时这项用不上。");
  chipRow(w1, [
    { value: "mine", label: "我写的在前", title: "本框内容在前，上游文字在后" },
    { value: "wired", label: "上游在前", title: "上游文字在前，本框内容在后" },
  ], st.order, (v) => apply({ order: v }));

  const w2 = section(body, "两段之间用什么隔开", "两段文字拼起来时中间放什么；没接上游时用不上。");
  chipRow(w2, SEPS.map((s) => ({ value: s.value, label: s.label })), st.sep, (v) => apply({ sep: v }));

  const w3 = section(body, "显示展开预览", "在输入框下方先看一遍真正会送出去的字；这只影响显示，不影响出图。");
  const swRow = el("div", "xh-tags-swrow");
  const sw = el("div", "xh-tags-sw" + (st.showExpanded ? " on" : ""));
  sw.title = "开关展开预览";
  const swLab = el("span", "xh-tags-sub", st.showExpanded ? "已开启" : "已关闭");
  sw.addEventListener("click", () => {
    const next = !sw.classList.contains("on");
    sw.classList.toggle("on", next);
    swLab.textContent = next ? "已开启" : "已关闭";
    apply({ showExpanded: next });
  });
  swRow.append(sw, swLab); w3.appendChild(swRow);

  const w4 = section(body, "新节点的默认顺序", "只影响以后新建的标签提示词节点，不改手上这一个。");
  chipRow(w4, [
    { value: "mine", label: "我写的在前" },
    { value: "wired", label: "上游在前" },
  ], getDefaultOrder(), (v) => setDefaultOrder(v));

  const foot = el("div", "xh-tags-f");
  const done = el("button", null, "完成"); done.type = "button";
  done.addEventListener("click", closeTagSettings);
  foot.appendChild(done);
  panel.append(body, foot);
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
