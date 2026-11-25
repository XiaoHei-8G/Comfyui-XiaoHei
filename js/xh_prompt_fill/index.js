// 提示词填空 XiaoHei · 节点前端
// 节点脸上：一个「打开编辑器」按钮 + seed（原生 INT widget）+ STRING 输出口，干净利落。
// 配置（模板/词库/锁定/预设）存进 fill_config 隐藏 widget，随工作流走、上云可用；用户不手打。
// 确定性随机填充在后端做；前端不注入任何东西到隐藏输入，云端/本地行为完全一致。
import { app } from "../../../scripts/app.js";
import { xhIconHTML, onLangChanged, makeBarBtn, lockDomWidgetHeight } from "../xh_ui_kit.js";
import { openEditor } from "./editor.mjs";
import { presetToConfig, H3_VIDEO } from "./presets.mjs";
import { T } from "./i18n.mjs";

const CLASS = "XH_PromptFill";
const CSS_ID = "xh-pf-node-css";
const CSS = `
.xhpf-node{display:flex;flex-direction:column;gap:5px;padding:4px 0}
.xhpf-row{display:flex;align-items:center;gap:6px}
.xhpf-open{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:5px}
.xhpf-status{font-size:10.5px;opacity:.62;padding-left:2px;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
`;
function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

const DEFAULT_CONFIG = JSON.stringify(presetToConfig(H3_VIDEO));
const nodes = new Set();

function configOf(node) {
  const w = node.widgets && node.widgets.find((x) => x && x.name === "fill_config");
  return (w && typeof w.value === "string" && w.value.trim()) ? w.value : DEFAULT_CONFIG;
}
function writeConfig(node, json) {
  const w = node.widgets && node.widgets.find((x) => x && x.name === "fill_config");
  if (w) { w.value = json; if (typeof w.callback === "function") w.callback(json); }
}
function seedOf(node) {
  const w = node.widgets && node.widgets.find((x) => x && x.name === "seed");
  return w ? (parseInt(w.value, 10) >>> 0) : 0;
}
function refreshStatus(node) {
  const st = node._xhPf && node._xhPf.status;
  if (!st) return;
  try {
    const cfg = JSON.parse(configOf(node));
    const n = Object.keys(cfg.slots || {}).length;
    const preset = cfg.preset === "h3_video_official" ? "H3 视频" : (cfg.preset === "image_general" ? "图片通用" : "自定义");
    st.title = T("预设") + ": " + preset + " · " + n + " " + T("空位");
    st.textContent = st.title;
  } catch { st.textContent = ""; }
}

function setupNode(node) {
  injectCSS();
  if (node._xhPf) return;
  // 隐藏 fill_config：视觉藏起来，但照常存档（§13.4：存储 widget 不许 options.serialize=false）。
  // ComfyUI 对 hidden 输入不一定建 widget；找不到就自己补一个，否则编辑完配置存不住、上云也带不走。
  let cfgW = node.widgets && node.widgets.find((x) => x && x.name === "fill_config");
  if (!cfgW && typeof node.addWidget === "function") {
    cfgW = node.addWidget("STRING", "fill_config", DEFAULT_CONFIG, () => {}, { serialize: true });
  }
  if (cfgW) {
    if (typeof cfgW.value !== "string" || !cfgW.value.trim()) cfgW.value = DEFAULT_CONFIG;
    cfgW.computeSize = () => [0, 0];
    cfgW.getMinHeight = () => 0;
    cfgW.computeLayoutSize = undefined;
    cfgW.draw = () => {};
    cfgW.mouse = () => false;
    const dom = cfgW.inputEl || cfgW.element || cfgW.el;
    if (dom && dom.style) { dom.style.display = "none"; dom.style.height = "0px"; dom.style.overflow = "hidden"; }
  }

  const root = document.createElement("div"); root.className = "xhpf-node";
  const row = document.createElement("div"); row.className = "xhpf-row";
  const open = makeBarBtn("打开编辑器", "打开模板 / 词库 / 预览编辑器");
  open.classList.add("xhpf-open");
  open.dataset.xhPfOpen = "1";
  open.innerHTML = xhIconHTML("书本", { size: 14, color: "current" }) + "<span>" + T("打开编辑器") + "</span>";
  open.dataset.xhIconDone = "1";
  const status = document.createElement("div"); status.className = "xhpf-status";
  row.append(open, status);
  root.appendChild(row);

  const w = node.addDOMWidget("xh_pf_ui", "custom", root, {
    getValue: () => null, setValue: () => {}, getMinHeight: () => 34, margin: 4, serialize: false,
  });
  lockDomWidgetHeight(w, 34);
  // status 已在 row 内（与按钮同一行），此处不再 append — 否则被移到第二行、34px 锁高会裁切。

  open.addEventListener("click", () => {
    openEditor({
      config: configOf(node),
      seed: seedOf(node),
      onApply: (json, seed) => {
        writeConfig(node, json);
        const sw = node.widgets && node.widgets.find((x) => x && x.name === "seed");
        if (sw) { sw.value = seed >>> 0; if (typeof sw.callback === "function") sw.callback(sw.value); }
        refreshStatus(node);
      },
    });
  });

  node._xhPf = { root, open, status };
  nodes.add(node);
  refreshStatus(node);
  const origRemoved = node.onRemoved;
  node.onRemoved = function (...a) {
    nodes.delete(node);
    try { return origRemoved?.apply(this, a); } catch { return undefined; }
  };
  queueMicrotask(() => refreshStatus(node));
}

function relang() {
  for (const node of nodes) {
    const st = node._xhPf && node._xhPf.status;
    if (st) refreshStatus(node);
    const b = node._xhPf && node._xhPf.open;
    if (b) {
      const span = b.querySelector("span");
      if (span) span.textContent = T("打开编辑器");
      b.title = T("打开编辑器");
    }
  }
}
onLangChanged(relang, { tag: "XiaoHei.PromptFill.Lang" });

app.registerExtension({
  name: "XiaoHei.PromptFill",
  nodeCreated(node) { if (node.comfyClass === CLASS || node.type === CLASS) setupNode(node); },
  setup() { /* 保留：onLangChanged 已在模块顶层注册 */ },
});
