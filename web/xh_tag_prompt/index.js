// XiaoHei-标签提示词 · 节点前端
// 1:1 学 ComfyUI-Pixaroma / js/prompt/index.js（MIT）的四件事：
//   ① addDOMWidget 挂一整块 DOM（透明 textarea + 高亮层 + 按钮排）；
//   ② 状态存 node.properties.tagPromptState，不进 widgets_values；
//   ③ 齿轮 / 标签库 / 预览都作用在当前节点上，库靠打开时传入的回调写回；
//   ④ 包装 app.graphToPrompt，点「运行」那一刻才把 @/*/# 展开并塞进隐藏输入。
import { app } from "../../../scripts/app.js";
import { xhIconHTML, isSizeLike } from "../xh_ui_kit.js";
import { applyAdaptiveCanvasOnly, isVueNodes } from "../shared/nodes2.mjs";
import { installResizeFloor } from "../shared/resize_floor.mjs";
import { registerNodeSettings } from "../shared/node_settings.mjs";
import { createTagField } from "./field.mjs";
import { openTagEditor } from "./editor.mjs";
import { openTagSettings, closeTagSettingsFor, readState, writeState, getDefaultOrder } from "./settings.mjs";
import { previewExpand, runExpand, hasTokens } from "./expand.mjs";
import { subscribe, reloadLibrary, flushLibrary } from "./library.mjs";

const CLASS = "XH_TagPrompt";
const CSS_ID = "xh-tag-prompt-css";
// 尺寸规矩（1:1 学 Pixaroma js/prompt/index.js）：
//   · 根节点必须 width/height:100%，否则前端把 DOM widget 容器撑高时，我们的内容还是原来那点高；
//   · 输入框 / 预览用 flex:1 吃掉多出来的高度，按钮排与脚注 flex:0 0 auto 永远贴着底；
//   · addDOMWidget 只给「最小高度」，绝不写死 computeSize（家族 lockDomWidgetHeight 是给
//     固定高度按钮控件用的，套到这里就会把节点拉高出来的空间全部空着 —— 2026-11-12 事故）。
const DEFAULT_W = 470, DEFAULT_H = 260;
const MIN_W = 440, MIN_H = 210, WIDGET_MIN_H = 200;
const CSS = `
.xh-tp{display:flex;flex-direction:column;gap:7px;padding:8px 10px;box-sizing:border-box;
  width:100%;height:100%;overflow:hidden;
  color:var(--foreground,#fff);font:12px var(--font-family,sans-serif)}
.xh-tp > .xh-tag-wrap{flex:2 1 0;min-height:96px}
.xh-tp-bar{display:flex;gap:5px;flex-wrap:wrap;align-items:center;flex:0 0 auto}
.xh-tp-btn{background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 9px;font-size:11.5px;cursor:pointer}
.xh-tp-btn:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-tp-btn.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);
  color:var(--background,#171718);font-weight:600}
.xh-tp-btn.gear{width:30px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0}
.xh-tp-prev{display:none;flex:1 1 0;min-height:30px;
  background:var(--secondary,#262729);border:1px solid var(--border,#494a50);
  border-radius:5px;padding:7px 9px;font-size:11.5px;white-space:pre-wrap;overflow-wrap:break-word;
  overflow:auto;opacity:.9}
.xh-tp-prev.on{display:block}
.xh-tp-prev .lab{display:block;opacity:.6;font-size:11px;margin-bottom:4px}
.xh-tp-foot{font-size:11px;opacity:.55;flex:0 0 auto}
`;
function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS;
  document.head.appendChild(s);
}
function btn(label, title) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "xh-tp-btn"; b.textContent = label; b.title = title;
  return b;
}

registerNodeSettings(CLASS, {
  title: "标签提示词",
  ownMenuItem: true,
  menuLabel: "标签提示词设置",
  open: (node) => openTagSettings(node, () => renderPreview(node)),
});

function syncFromState(node) {
  const r = node._xhTagRoot;
  if (!r) return;
  r.field.setValue(readState(node).text);
  r.prevBtn.classList.toggle("on", readState(node).showExpanded);
  renderPreview(node);
}

function renderPreview(node) {
  const r = node._xhTagRoot;
  if (!r) return;
  const st = readState(node);
  const text = r.field.getValue();
  const last = node._xhTagLastRun;
  const show = st.showExpanded && (hasTokens(text) || !!last);
  r.prev.classList.toggle("on", show);
  if (!show) { r.prev.textContent = ""; return; }
  const body = last && last.src === text ? last.out : previewExpand(text).out;
  r.prev.innerHTML = "";
  const lab = document.createElement("span"); lab.className = "lab";
  lab.textContent = last && last.src === text ? "上次运行真正送出去的字" : "展开预览（随机项还没抽，点「运行」才定）";
  r.prev.append(lab, document.createTextNode(body));
}

export function setupNode(node) {
  injectCSS();
  if (node._xhTagRoot) return;
  reloadLibrary();

  const root = document.createElement("div"); root.className = "xh-tp";
  const field = createTagField((text) => { writeState(node, { text }); renderPreview(node); });
  const prev = document.createElement("div"); prev.className = "xh-tp-prev";

  const bar = document.createElement("div"); bar.className = "xh-tp-bar";
  const copy = btn("复制", "把整个提示词复制到剪贴板");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(field.getValue()); } catch { /* 权限不给就算了 */ }
  });
  const replace = btn("替换", "用剪贴板里的文字替换整个提示词");
  replace.addEventListener("click", async () => {
    try { field.setValue(await navigator.clipboard.readText()); writeState(node, { text: field.getValue() }); renderPreview(node); }
    catch { /* 同上 */ }
  });
  const clear = btn("清空", "清空提示词");
  clear.addEventListener("click", () => { field.setValue(""); writeState(node, { text: "" }); renderPreview(node); });
  const tags = btn("标签库", "打开标签库：新建、修改、插入标签");
  tags.addEventListener("click", () => openTagEditor({ onInsert: (name, sym) => field.insert(name, sym) }));
  const prevBtn = btn("预览", "在下方显示真正会送出去的字");
  prevBtn.addEventListener("click", () => {
    const next = !readState(node).showExpanded;
    writeState(node, { showExpanded: next });
    prevBtn.classList.toggle("on", next);
    renderPreview(node);
  });
  const gear = btn("", "打开本节点的设置");
  gear.className = "xh-tp-btn gear";
  gear.dataset.xhTagGear = "1";
  gear.innerHTML = xhIconHTML("设置", { size: 14, color: "current" });
  gear.addEventListener("click", () => openTagSettings(node, () => renderPreview(node)));
  bar.append(copy, replace, clear, tags, prevBtn, gear);

  const foot = document.createElement("div"); foot.className = "xh-tp-foot";
  foot.textContent = "XiaoHei · 标签只存本机，分享工作流请用标签库里的导出";
  root.append(field.root, prev, bar, foot);

  const w = node.addDOMWidget("xh_tag_ui", "custom", root, {
    getValue: () => null, setValue: () => {},
    getMinHeight: () => WIDGET_MIN_H, margin: 4, serialize: false,
  });
  // canvasOnly 随渲染器切换动态求值（家族 shared/nodes2.mjs），两种前端都能撑满。
  applyAdaptiveCanvasOnly(w);
  // 🔴 拖动下限必须是常量。旧版用 measureRootContent 量「当前 DOM 高度」，
  //    而输入框 / 展开预览都是 flex:1 会被节点拉高的元素：拉到 700px 时下限
  //    跟着变成 698px，官方 resize 一读就等于「最小尺寸=当前尺寸」，节点再也
  //    缩不回去（2026-11-12 Edge 真机实测 210→225 / 700→698）。
  //    「显示展开预览」开关打开还会再多吃一块高度，让这个下限更大。
  //    现在固定成 WIDGET_MIN_H，内容放不下由各处自己滚动，尺寸只听用户拖拽。
  const uninstallFloor = installResizeFloor(root, () => WIDGET_MIN_H);
  // 🔴 只在「比下限还小」时补默认值。以前无条件写 470×260，会把用户拖过的尺寸抢回去，
  //    刷新 / 读档后节点又缩回原样（2026-11-12 与「拉高不跟随」一起修）。
  if (isSizeLike(node.size)) {
    if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
    if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;
  }

  const unsub = subscribe(() => { field.refresh(); renderPreview(node); });
  const prevRemoved = node.onRemoved;
  node.onRemoved = function (...a) {
    unsub?.(); flushLibrary(); closeTagSettingsFor(node);
    uninstallFloor?.();
    field.destroy();
    try { return prevRemoved?.apply(this, a); } catch { return undefined; }
  };

  node._xhTagRoot = { root, field, prev, prevBtn, gear };
  // 新节点取一次全局默认顺序；configure() 之后再用 microtask + 下一拍把存档读回来。
  if (node.properties?.tagPromptState?.order == null) writeState(node, { order: getDefaultOrder() });
  queueMicrotask(() => syncFromState(node));
  setTimeout(() => syncFromState(node), 0);
}

// ── 点「运行」那一刻：展开 @/*/# 并注入隐藏输入 ───────────────────────────
function findNodes(promptId) {
  const out = new Map();
  const visit = (graph, prefix) => {
    if (!graph) return;
    for (const n of (graph._nodes || graph.nodes || [])) {
      if (!n) continue;
      const full = prefix + String(n.id);
      if (n.comfyClass === CLASS || n.type === CLASS) out.set(full, n);
      const inner = n.subgraph || n.graph || n._graph;
      if (inner && inner !== graph) visit(inner, full + ":");
    }
  };
  visit(app.graph, "");
  return out.get(String(promptId)) || null;
}

if (!app._xhTagPromptPatched) {
  app._xhTagPromptPatched = true;
  const origFn = app.graphToPrompt;
  const orig = (...a) => origFn.apply(app, a);
  app.graphToPrompt = async function (...args) {
    const result = await orig(...args);
    try {
      const prompt = result?.output;
      if (!prompt || typeof prompt !== "object") return result;
      for (const [key, entry] of Object.entries(prompt)) {
        if (!entry || entry.class_type !== CLASS) continue;
        const node = findNodes(key);
        if (!node) { console.warn("[XiaoHei] 标签提示词节点没匹配上，隐藏输入保持原样：", key); continue; }
        const st = readState(node);
        const expanded = runExpand(st.text).out;
        node._xhTagLastRun = { src: st.text, out: expanded };
        queueMicrotask(() => renderPreview(node));
        entry.inputs = entry.inputs || {};
        // 🔴 只放执行数据；showExpanded 这类外观设置绝不进来，改一下不该触发重跑。
        entry.inputs.TagPromptState = JSON.stringify({ text: expanded, order: st.order, sep: st.sep });
      }
    } catch (err) {
      console.error("[XiaoHei] 标签提示词 graphToPrompt 钩子出错：", err);
    }
    return result;
  };
}

// 工作流加载完成后，把存档里的文字回灌到 DOM 里（configure 晚于 nodeCreated）。
if (!app._xhTagLoadPatched) {
  app._xhTagLoadPatched = true;
  const origFn = app.loadGraphData;
  if (typeof origFn === "function") {
    app.loadGraphData = function (...args) {
      const r = origFn.apply(app, args);
      setTimeout(() => {
        try {
          for (const n of (app.graph?._nodes || [])) if (n?.comfyClass === CLASS) syncFromState(n);
        } catch { /* 图还没建好就跳过，nodeCreated 那两拍会补上 */ }
      }, 0);
      return r;
    };
  }
}

app.registerExtension({
  name: "XiaoHei.TagPrompt",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== CLASS) return;
    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      // 只挡「拖得太小挤爆按钮排」，拉大一律放行；Vue(Nodes 2.0) 的下限交给
      // installResizeFloor 在拖动那一刻钉，这里只管经典渲染器（照 Pixaroma 原版）。
      if (!isVueNodes()) {
        if (isSizeLike(size)) {
          if (size[0] < MIN_W) size[0] = MIN_W;
          if (size[1] < MIN_H) size[1] = MIN_H;
        }
        if (isSizeLike(this.size)) {
          if (this.size[0] < MIN_W) this.size[0] = MIN_W;
          if (this.size[1] < MIN_H) this.size[1] = MIN_H;
        }
      }
      return origResize?.apply(this, arguments);
    };
  },
  nodeCreated(node) { if (node.comfyClass === CLASS) setupNode(node); },
});
