// 释放显存（XiaoHei）- 节点脸。
// 1:1 复刻 ComfyUI-Pixaroma / js/free_vram/ui.mjs（MIT）的 DOM 结构与渲染逻辑：
//   一个 DOM widget，两种渲染器共用。三行：模式芯片 + 齿轮、整卡色条、上次读数。
// 家族规范化四处：全中文 + 接语言中枢、齿轮换家族实心 XH_GEAR_SVG、
//   配色只取官方 CSS 变量（--foreground/--secondary/--border/--background，
//   强调色 --xh-primary 随主题预设）、字体 var(--font-sans)。契约串一律不翻译。

import { applyAdaptiveCanvasOnly, isVueNodes } from "../shared/nodes2.mjs";
import { installCanvasZoomPassthrough } from "../shared/canvas_zoom.mjs";
import { installNodeAccent } from "../shared/node_settings.mjs";
import { installResizeFloor } from "../shared/resize_floor.mjs";
import { XH_GEAR_SVG, onLangChanged } from "../xh_ui_kit.js";
import { t } from "./i18n.mjs";
import {
  BAR_H, GAP, PAD_X, PAD_Y, READOUT_H, ROW_H, VUE_GAP_CANCEL,
  contentHeight, formatBytes, modeList, readReport, readState, writeState,
} from "./core.mjs";

const ROOT_CLASS = "xh-fv-root";
const WIDGET_NAME = "free_vram_ui";
// 命名空间化：避免将来某个前端占用类型名、渲染成它自己的 widget（Show Text 那个坑）。
const WIDGET_TYPE = "xh_free_vram";

let _cssDone = false;

export function injectCSS() {
  if (_cssDone) return;
  _cssDone = true;
  const css = `
  .${ROOT_CLASS}{
    box-sizing:border-box; display:flex; flex-direction:column; gap:${GAP}px;
    padding:${PAD_Y}px ${PAD_X}px;
    font:400 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    color:var(--foreground,#fff); user-select:none;
    /* 透明而非面板色：不透明根会盖住节点画在它上方的端口标签。 */
    background:transparent;
    /* 多出来的空间堆在行下方，不在各行之间分摊。宿主是 "flex flex-col *:flex-1"，
       本根会拿到 flex:1、可能比内容高——被拉伸时也不能挪动读数行。 */
    justify-content:flex-start;
  }
  .${ROOT_CLASS} > *{ flex:0 0 auto; }
  .${ROOT_CLASS}.is-vue{ margin-top:-${VUE_GAP_CANCEL}px; }
  .xh-fv-row{ display:flex; align-items:center; gap:6px; min-height:${ROW_H}px; }

  /* 永不换行。换行会让三颗芯片被拖窄时把色条和读数挤到一起；芯片自己缩小即可。 */
  .xh-fv-chips{ display:flex; gap:4px; flex:1 1 auto; min-width:0; flex-wrap:nowrap; overflow:hidden; }
  .xh-fv-chip{
    flex:1 1 auto; min-width:26px; box-sizing:border-box;
    background:var(--secondary,#262729); border:1px solid var(--border,#494a50);
    border-radius:4px; color:var(--foreground,#fff); font-size:12px;
    padding:4px 6px; cursor:pointer; text-align:center; line-height:1.1;
    font-family:inherit; white-space:nowrap; overflow:hidden;
  }
  .xh-fv-chip:hover{ border-color:var(--xh-primary,#E8A33C); }
  .xh-fv-chip.on, .xh-fv-chip.on:hover{
    background:var(--xh-primary,#E8A33C); border-color:var(--xh-primary,#E8A33C);
    color:var(--background,#171718); font-weight:600;
  }

  /* 家族实心齿轮（XH_GEAR_SVG，例外图案，不用 Lucide 细线、不用 emoji）。 */
  .xh-fv-gear{
    flex:none; width:16px; height:16px; padding:0; margin:0; line-height:0;
    background:none; border:none; cursor:pointer; color:var(--foreground,#fff);
    display:flex; align-items:center; justify-content:center;
  }
  .xh-fv-gear svg{ width:15px; height:15px; }
  .xh-fv-gear:hover{ color:var(--xh-primary,#E8A33C); }

  .xh-fv-bar{
    height:${BAR_H}px; border-radius:4px; background:var(--secondary,#262729);
    overflow:hidden; display:flex; flex:none;
  }
  .xh-fv-bar i{ display:block; height:100%; min-width:0; }
  /* 三段色用前景透明度 + 主题色，跟随明暗/主题预设，不写死十六进制。 */
  .xh-fv-used{ background:var(--foreground,#fff); opacity:.32; }
  .xh-fv-just{ background:var(--xh-primary,#E8A33C); opacity:1; }
  .xh-fv-was{ background:var(--foreground,#fff); opacity:.14; }
  /* 每段前缘一条发丝线，让相邻两段边界清晰；用 inset 阴影，不占布局。 */
  .xh-fv-bar i + i{ box-shadow:inset 1px 0 0 var(--background,#171718); }

  .xh-fv-readout{
    min-height:${READOUT_H}px; display:flex; align-items:center; gap:6px;
    font-size:11px; white-space:nowrap; overflow:hidden;
  }
  .xh-fv-lead{ color:var(--xh-primary,#E8A33C); overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .xh-fv-lead b{ font-size:13px; font-weight:600; }
  .xh-fv-tail{ margin-left:auto; color:var(--foreground,#fff); opacity:.42; flex:none; }
  .xh-fv-readout.idle .xh-fv-lead{ color:var(--foreground,#fff); opacity:.42; }
  .xh-fv-readout.warn .xh-fv-lead{ color:#d9a441; }
  .xh-fv-readout.bad .xh-fv-lead{ color:#e8694a; }
  `;
  const el = document.createElement("style");
  el.id = "xh-fv-css";
  el.textContent = css;
  document.head.appendChild(el);
}

export function buildFace(node, openPanel) {
  const root = document.createElement("div");
  root.className = ROOT_CLASS;

  const row = document.createElement("div");
  row.className = "xh-fv-row";
  const bar = document.createElement("div");
  bar.className = "xh-fv-bar";
  const readout = document.createElement("div");
  readout.className = "xh-fv-readout";
  root.append(row, bar, readout);

  node._xhFvRoot = root;
  node._xhFvRow = row;
  node._xhFvBar = bar;
  node._xhFvReadout = readout;
  node._xhFvOpenPanel = openPanel;

  const widget = node.addDOMWidget(WIDGET_NAME, WIDGET_TYPE, root, {
    serialize: false,
    getMinHeight: () => contentHeight(readState(node).showBar),
  });
  // 两个 flag 不同：options.serialize 让它不进 PROMPT，widget.serialize 让它不进 WORKFLOW。
  widget.serialize = false;
  // canvasOnly：Classic 下 true（不进 Parameters 页），Nodes 2.0 下 false（否则 Vue body 空）——实时 getter。
  applyAdaptiveCanvasOnly(widget);
  installCanvasZoomPassthrough(root);
  installNodeAccent(node, root);
  // 只在拖动 resize 把手时钉一个内容下限，不写 node.size，干净工作流不会显示「已修改」。
  node._xhFvFloorOff = installResizeFloor(root, () => contentHeight(readState(node).showBar));

  node._xhFvWidget = widget;

  // 切中英文时重绘脸（芯片标签/读数/悬停都会更新）。
  node._xhFvLangOff = onLangChanged(() => renderFace(node), { tag: "XiaoHei.FreeVram.Lang" });
  return widget;
}

function renderChips(node, st, row) {
  const wrap = document.createElement("div");
  wrap.className = "xh-fv-chips";
  for (const mode of modeList()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xh-fv-chip" + (st.mode === mode.id ? " on" : "");
    b.textContent = mode.label;
    b.title = mode.title;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      writeState(node, { mode: mode.id });
      renderFace(node);
    });
    wrap.appendChild(b);
  }
  row.appendChild(wrap);
}

function paintBar(node, st, bar) {
  bar.style.display = st.showBar ? "" : "none";
  if (!st.showBar) return;
  const T = t();
  const report = readReport(node);
  const parts = Array.isArray(report?.bar) ? report.bar : null;
  bar.textContent = "";
  if (!parts) {
    bar.title = T.barTip;
    return;
  }
  const [used, just, was] = parts;
  for (const [tone, frac] of [["used", used], ["just", just], ["was", was]]) {
    const seg = document.createElement("i");
    seg.className = `xh-fv-${tone}`;
    seg.style.width = `${Math.max(0, Math.min(1, Number(frac) || 0)) * 100}%`;
    bar.appendChild(seg);
  }
  bar.title = [
    T.barInUse(formatBytes(report.total - report.after)),
    T.barJust(formatBytes(report.after - report.before)),
    T.barAlready(formatBytes(report.before)),
    T.barCard(formatBytes(report.total), report.device),
  ].join("\n");
}

/**
 * 输入没接线时为 true——这是本节点唯一需要的连线。
 * 输出可选：节点是 OUTPUT_NODE，没有下游 ComfyUI 也会执行它。
 */
function inputUnwired(node) {
  const inp = node?.inputs?.[0];
  if (!inp) return false;
  return inp.link == null;
}

/** 单位只印一次；两边同单位时省略分子单位，避免读成两个数字。 */
function freeOfTotal(report) {
  const free = formatBytes(report.after);
  const total = formatBytes(report.total, 0);
  const unit = total.split(" ")[1];
  const shownTotal = (unit && free.endsWith(` ${unit}`))
    ? total.split(" ")[0] + " " + unit
    : total;
  return t().freeOf(free, shownTotal);
}

function paintReadout(node, st, readout) {
  readout.textContent = "";
  readout.className = "xh-fv-readout";
  const T = t();
  const lead = document.createElement("span");
  lead.className = "xh-fv-lead";
  const tail = document.createElement("span");
  tail.className = "xh-fv-tail";
  readout.append(lead, tail);

  const report = readReport(node);

  // 输入决定何时执行，所以只有它没接才值得提示——这种状态下节点故意什么都不做。
  if (inputUnwired(node)) {
    readout.classList.add("warn");
    lead.textContent = T.unwiredHint;
    lead.title = T.unwiredTip;
    return;
  }

  if (!report) {
    readout.classList.add("idle");
    lead.textContent = st.useThreshold
      ? T.waitingBelow(formatBytes(st.thresholdGb * 1024 ** 3, 0))
      : T.waiting;
    return;
  }

  if (report.ok === false) {
    readout.classList.add("bad");
    lead.textContent = report.message || T.errFree;
    lead.title = lead.textContent;
    return;
  }

  if (report.skipped) {
    readout.classList.add("idle");
    lead.textContent = report.unwired ? T.nothingWired : T.skipped;
    lead.title = report.message || "";
    tail.textContent = report.after == null ? "" : freeOfTotal(report);
    tail.title = lead.title;
    return;
  }

  if (report.cached) {
    readout.classList.add("idle");
    lead.textContent = T.cachedEarlier(formatBytes(report.freed));
    lead.title = T.cachedTip;
    tail.textContent = T.skipped;
    tail.title = lead.title;
    return;
  }

  // 「释放 0 B」像是坏了。通常它诚实表示没有可释放的东西，就这么说。
  if (!report.freed) {
    readout.classList.add("idle");
    lead.textContent = T.nothingToFree;
    lead.title = T.nothingToFreeTip;
    tail.textContent = freeOfTotal(report);
    tail.title = lead.title;
    return;
  }

  const amount = document.createElement("b");
  amount.textContent = formatBytes(report.freed);
  // 后端 label 由 mode 决定，是英文 "freed"/"returned"；显示层用语言表映射，不直出英文。
  const label = report.mode === "cache" ? T.returned : T.freed;
  lead.textContent = `${label} `;
  lead.appendChild(amount);
  // 用原始两对值，不是 report.before/after——那两个现在跟随本模式采用的视图。
  const cBefore = report.comfyBefore ?? report.before;
  const cAfter = report.comfyAfter ?? report.after;
  lead.title = T.tipReadout(
    formatBytes(cBefore), formatBytes(cAfter),
    formatBytes(report.driverBefore), formatBytes(report.driverAfter),
  );
  tail.textContent = freeOfTotal(report);
  tail.title = lead.title;
}

export function renderFace(node) {
  const row = node?._xhFvRow;
  const bar = node?._xhFvBar;
  const readout = node?._xhFvReadout;
  if (!row || !bar || !readout) return;
  const st = readState(node);
  // 每次渲染都重断言：渲染器可能在节点待在画布上时翻转，而它俩只有一个存在那个 gap。
  node._xhFvRoot?.classList.toggle("is-vue", isVueNodes());

  row.textContent = "";
  renderChips(node, st, row);

  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "xh-fv-gear";
  gear.title = t().gearTip;
  gear.innerHTML = XH_GEAR_SVG;
  gear.addEventListener("click", (e) => {
    e.stopPropagation();
    node._xhFvOpenPanel?.(node);
  });
  row.appendChild(gear);

  paintBar(node, st, bar);
  paintReadout(node, st, readout);
  node.setDirtyCanvas?.(true, false);
}

export function destroyFace(node) {
  try { node._xhFvFloorOff?.(); } catch {}
  node._xhFvFloorOff = null;
  try { node._xhFvLangOff?.(); } catch {}
  node._xhFvLangOff = null;
  node._xhFvRoot = null;
  node._xhFvRow = null;
  node._xhFvBar = null;
  node._xhFvReadout = null;
  node._xhFvWidget = null;
}
