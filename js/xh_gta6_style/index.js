// GTA6 人物列表 · 节点前端
//
// 移植自 ComfyUI-GTA6-Style（MIT, Loop Forge）的 GTA6Woman / GTA6Man 链表式人物节点。
// 原包一个 group 里「几个人就要几个节点、串成链」，4 个人 = 4 个节点 + 1 个拼装；
// 这里压成一个节点内的一张张卡片，4 个人还是 1 个节点 —— 加人只是加一行。
//
// 四件事与家族其它复刻件完全一致：
//   ① addDOMWidget 挂一整块 DOM（可增删 / 可开关的人物卡片 + 底部按钮排）；
//   ② 状态存 node.properties.xhGta6PeopleState，随工作流存盘读档，不占 widgets_values；
//   ③ 下拉全是「点开就选」，不让用户手打任何分隔符；
//   ④ 包装 app.graphToPrompt，点「运行」那一刻才把 people 塞进隐藏输入。
import { app } from "../../../scripts/app.js";
import { isSizeLike, onLangEvent } from "../xh_ui_kit.js";
import { applyAdaptiveCanvasOnly, isVueNodes } from "../shared/nodes2.mjs";
import { installResizeFloor } from "../shared/resize_floor.mjs";
import { installNativeTextMenu } from "../shared/native_text_menu.mjs";
import { installFamilyButtonPress } from "../shared/button_press.mjs";
import {
  readState, writeState, defaultState, addPerson, deletePerson,
  toggleEnabled, setField, resetToDefault, toPayload,
} from "./core.mjs";
import { injectCSS, buildRoot, renderPeople } from "./render.mjs";
import { g6Text, g6IsEn } from "./xh_g6_i18n.mjs";

const CLASS = "XH_GTA6People";
// 🔴 两处下限都是常量：卡片会越加越多，一旦用「量出来的内容高度」当下限，
//    用户拉高后节点就再也缩不回去（家族踩过，见 Skill §13.46）。
const DEFAULT_W = 470, DEFAULT_H = 300;
const MIN_W = 400, MIN_H = 220, WIDGET_MIN_H = 210;

function ensureFloor(node) {
  if (!isSizeLike(node.size)) return;
  const w = Math.max(node.size[0], MIN_W);
  const h = Math.max(node.size[1], MIN_H);
  if (w !== node.size[0] || h !== node.size[1]) node.setSize?.([w, h]);
}

function syncFromState(node) {
  const ui = node._xhG6Root;
  if (!ui) return;
  renderPeople(node, ui.list, ui.handlers, ui.foot);
}

function refreshAfter(node) {
  syncFromState(node);
  setTimeout(() => {
    ensureFloor(node);
    node.setDirtyCanvas?.(true, true);
  }, 0);
}

function makeHandlers(node) {
  return {
    onAdd: () => { addPerson(node); refreshAfter(node); },
    onReset: () => {
      const st = readState(node);
      const dirty = st.people.length !== 1 || st.people.some(
        (p) => p.hair !== "keep from photo" || p.outfit !== "keep from photo"
          || p.accessory !== "off" || p.pose !== "(from group setup)"
          || (p.details || "").trim() || !p.enabled || p.gender !== "female");
      if (!dirty) return; // 本来就是默认样子，不留无意义的历史记录
      resetToDefault(node);
      refreshAfter(node);
    },
    onToggle: (id) => { toggleEnabled(node, id); refreshAfter(node); },
    onDelete: (id) => { deletePerson(node, id); refreshAfter(node); },
    onGender: (id, g) => { setField(node, id, "gender", g); refreshAfter(node); },
    onField: (id, field, value) => { setField(node, id, field, value); refreshAfter(node); },
    // 打字不重绘：一重绘焦点就丢，用户打到第二个字光标就跳走。
    onDetails: (id, text) => { setField(node, id, "details", text); },
  };
}

export function setupNode(node) {
  injectCSS();
  if (node._xhG6Root) return;
  if (!node.properties?.xhGta6PeopleState) writeState(node, defaultState());

  // buildRoot 的按钮回调引用同一个 proxy 对象，makeHandlers 之后补齐即可。
  const proxy = {};
  const ui = buildRoot(proxy);
  installNativeTextMenu(ui.root);
  installFamilyButtonPress();
  ui.handlers = makeHandlers(node);
  Object.assign(proxy, ui.handlers);
  node._xhG6Root = ui;

  const w = node.addDOMWidget("xh_gta6_people_ui", "custom", ui.root, {
    getValue: () => null, setValue: () => {},
    getMinHeight: () => WIDGET_MIN_H,
    margin: 4, serialize: false,
  });
  applyAdaptiveCanvasOnly(w);
  const uninstallFloor = installResizeFloor(ui.root, () => WIDGET_MIN_H);
  if (isSizeLike(node.size)) {
    if (node.size[0] < MIN_W) node.size[0] = DEFAULT_W;
    if (node.size[1] < MIN_H) node.size[1] = DEFAULT_H;
  }

  const prevRemoved = node.onRemoved;
  node.onRemoved = function (...a) {
    try { uninstallFloor?.(); } catch {}
    node._xhG6Root = null;
    try { return prevRemoved?.apply(this, a); } catch { return undefined; }
  };

  // configure 晚于 nodeCreated：三拍补齐（与家族其它复刻件同一套时序）。
  queueMicrotask(() => syncFromState(node));
  setTimeout(() => syncFromState(node), 0);
  syncFromState(node);
}

// ── 切语言后整块 DOM 要重绘（下拉里显示的是中文名，得跟着换） ─────────────
//
// 🔴 这里必须用 onLangEvent（纯监听），**不能用 onLangChanged**：
//    onLangChanged 会在注册后 150ms 主动执行一次「初始刷新」。本节点的 DOM 是
//    setupNode 里按当前语言直接建出来的，不需要补这一刀；而那一刀落在用户正在
//    「补充」框里打字的时刻，就会整块重绘 ⇒ 焦点跑掉（桩环境实测复现过）。
//    工作流载入后的全量重刷由中枢走 _xhRunLangHandlers(true)，照样会到我们这里。
function repaintAllPeople() {
  try {
    for (const n of (app.graph?._nodes || [])) {
      if (n?.comfyClass === CLASS || n?.type === CLASS) syncFromState(n);
    }
  } catch { /* 图还没建好就跳过 */ }
}
onLangEvent(() => setTimeout(() => { repaintAllPeople(); refreshAllSizeTips(); }, 0));

// ── 点「运行」那一刻：把人物列表打包进隐藏输入 ───────────────────────────
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
  return out.get(String(promptId))
    || out.get(String(promptId).split(":").pop()) || null;
}

if (!app._xhG6PeoplePatched) {
  app._xhG6PeoplePatched = true;
  const origFn = app.graphToPrompt;
  app.graphToPrompt = async function (...args) {
    const result = await origFn.apply(app, args);
    try {
      const prompt = result?.output;
      if (!prompt || typeof prompt !== "object") return result;
      for (const [key, entry] of Object.entries(prompt)) {
        if (!entry || entry.class_type !== CLASS) continue;
        const node = findNodes(key);
        if (!node) {
          console.warn("[XiaoHei] GTA6 人物节点没匹配上，隐藏输入保持原样：", key);
          continue;
        }
        entry.inputs = entry.inputs || {};
        entry.inputs.XHGTA6PeopleState = JSON.stringify(toPayload(readState(node)));
      }
    } catch (err) {
      console.error("[XiaoHei] GTA6 人物 graphToPrompt 钩子出错：", err);
    }
    return result;
  };
}

// 工作流加载完成后把存档里的人物回灌到 DOM。
if (!app._xhG6PeopleLoadPatched) {
  app._xhG6PeopleLoadPatched = true;
  const origFn = app.loadGraphData;
  if (typeof origFn === "function") {
    app.loadGraphData = function (...args) {
      const r = origFn.apply(app, args);
      setTimeout(repaintAllPeople, 0);
      return r;
    };
  }
}

// ── 老工作流兼容：拼装节点的「宽度 / 高度」外接口是后加的，存档里没有这一段 ──
//
// 🔴 为什么必须在前端补（「后端改了、重启了、粉丝还是看不到」的唯一原因）：
//    工作流 JSON 只保存「这个节点当时有哪些 input 槽」，恢复时 litegraph **按存档数组**
//    重建 inputs，绝不会回头按最新 object_info 补一个可选输入口。
//    所以后端 `forceInput` 加得再对，只要节点是从旧工作流恢复的，那两个圆点就永远不出现；
//    只有「从菜单新拖一个节点」才正常 —— 用户看到的正是这个现象，还会以为没更新。
const BUILDER_CLASS = "XH_GTA6Builder";
const BUILDER_EXTRA_PORTS = [["width", "INT"], ["height", "INT"]];

function ensureBuilderPorts(node) {
  if (!node || !Array.isArray(node.inputs)) return;
  const lang = window.XH_LANG || "zh";
  let added = 0;
  for (const [name, type] of BUILDER_EXTRA_PORTS) {
    let s = node.inputs.find((i) => i?.name === name) || null;
    if (!s) {
      node.addInput(name, type);
      s = node.inputs[node.inputs.length - 1] || null;
      added += 1;
    }
    // 🔴 每拍都要补 label，不能只在新加时设一次：ComfyUI 恢复过程中会重建一次 inputs，
    //    重建只保留 name/type、把 label 丢掉；那时口已存在，只设一次的写法就永远补不上了，
    //    界面上会是一条光秃秃的 `width`（中枢 i18n 若已跑完也不会再来管它）。
    if (s && !s.label) {
      const lb = g6Text("slots", name, lang, node.comfyClass || node.type);
      if (lb) s.label = lb;
    }
  }
  if (!added) return;
  // 口多了两个，节点高度不够会被裁掉半个圆点：只增不减，不动用户自己拉过的尺寸。
  try {
    const need = node.computeSize?.();
    if (Array.isArray(need) && node.size[1] < need[1]) node.setSize([node.size[0], need[1]]);
  } catch { /* 量不出来就让 litegraph 自己画 */ }
  try { app.graph?.setDirtyCanvas?.(true, true); } catch { /* 图画布可能还没好 */ }
}

// ── 尺寸来源提示条：外接了宽高就必须让人看见「主题的画幅已经被覆盖」 ────────
//
// 🔴 为什么要这个：外接后实际尺寸由分辨率节点说了算，而主题节点上的「画幅」下拉
//    仍然显示 1248×832（它只是兜底值）。两处数字对不上，谁看都以为坏了。
//    这里给一句准话，用户不用去猜到底谁在生效。
// ⛔ 不报具体像素：前端拿不到上游分辨率节点的实时值（家族节点 / 官方节点 / INT 常量
//    算法各不相同，硬算会算错反而误导）；真实像素在空 Latent 上一眼能看到。
const SIZE_TIP = {
  none: { zh: "尺寸：按主题画幅", en: "size: from theme aspect" },
  both: { zh: "尺寸：由外接决定 · 主题画幅已覆盖", en: "size: external · theme aspect overridden" },
  width: { zh: "尺寸：宽度由外接 · 高度按主题画幅", en: "size: width external · height from theme" },
  height: { zh: "尺寸：高度由外接 · 宽度按主题画幅", en: "size: height external · width from theme" },
};

function sizeTipState(node) {
  const linked = (name) => !!(node.inputs || []).find((i) => i && i.name === name && i.link != null);
  const w = linked("width");
  const h = linked("height");
  if (w && h) return "both";
  if (w) return "width";
  if (h) return "height";
  return "none";
}

function refreshSizeTip(node) {
  const el = node && node._xhG6SizeTip;
  if (!el) return;
  const st = sizeTipState(node);
  el.dataset.state = st;
  el.classList.toggle("on", st !== "none");
  const txt = el.querySelector(".t");
  if (txt) txt.textContent = g6IsEn() ? SIZE_TIP[st].en : SIZE_TIP[st].zh;
}

function mountSizeTip(node) {
  if (node._xhG6SizeTip) { refreshSizeTip(node); return; }
  try { injectCSS(); } catch { /* 样式注不进去也不影响功能 */ }
  const el = document.createElement("div");
  el.className = "xh-g6-tip";
  el.innerHTML = '<span class="d"></span><span class="t"></span>';
  node._xhG6SizeTip = el;
  const w = node.addDOMWidget("xh_gta6_size_tip", "custom", el, {
    getValue: () => null, setValue: () => {},
    getMinHeight: () => 20,
    margin: 2, serialize: false,
  });
  // Nodes 2.0 下 canvasOnly 不是布尔常量，必须走家族这个自适应包装，否则节点整块空白。
  try { applyAdaptiveCanvasOnly(w); } catch { /* 老前端没这个工具也能显示 */ }
  refreshSizeTip(node);
}

function refreshAllSizeTips() {
  try {
    for (const n of (app.graph?._nodes || [])) {
      if (n?.comfyClass === BUILDER_CLASS || n?.type === BUILDER_CLASS) refreshSizeTip(n);
    }
  } catch { /* 图还没建好 */ }
}

app.registerExtension({
  name: "XiaoHei.GTA6People",
  beforeRegisterNodeDef(nodeType, nodeData) {
    // Builder 走下面这段（补口 + 尺寸提示条），不能掉进 People 的尺寸逻辑。
    if (nodeData?.name === BUILDER_CLASS) {
      const proto = nodeType.prototype;
      const origConfigure = proto.onConfigure;
      proto.onConfigure = function (...a) {
        const r = origConfigure?.apply(this, a);
        // 三拍：configure 之后 ComfyUI 有的路径还会再动一次 inputs，补早了会被清掉。
        ensureBuilderPorts(this);
        mountSizeTip(this);
        queueMicrotask(() => { ensureBuilderPorts(this); refreshSizeTip(this); });
        setTimeout(() => { ensureBuilderPorts(this); refreshSizeTip(this); }, 0);
        return r;
      };
      // 插线 / 拔线要立刻改口，不然提示条会一直停在旧状态。
      const origCC = proto.onConnectionsChange;
      proto.onConnectionsChange = function (...a) {
        const r = origCC?.apply(this, a);
        refreshSizeTip(this);
        setTimeout(() => refreshSizeTip(this), 0);
        return r;
      };
      return;
    }
    if (nodeData?.name !== CLASS) return;
    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
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
  nodeCreated(node) {
    if (node.comfyClass === CLASS) setupNode(node);
    // 新建的节点后端本来就会带上宽高口，这里只兜「新建后发现缺」的情况（幂等）。
    if (node.comfyClass === BUILDER_CLASS || node.type === BUILDER_CLASS) {
      setTimeout(() => { ensureBuilderPorts(node); mountSizeTip(node); }, 0);
    }
  },
});
