// ══════════════════════════════════════════════════════════════════════
//  XiaoHei 家族 · 节点「选中工具条」命令（官方扩展钩子 · 两套画布模式通吃）
// ══════════════════════════════════════════════════════════════════════
// 2026-10-29：借鉴 Pixaroma 的 js/help_toolbar/index.js（**读源码，不是看截图**）。
//
// Pixaroma 根本不是用 DOM 硬塞的，它走的是 ComfyUI **官方扩展钩子**：
//     app.registerExtension({
//       commands: [{ id, label, icon, function }],       // 注册命令
//       getSelectionToolboxCommands(item) { ... },       // 官方来问：选中项要显示哪些命令
//     })
// 官方在**两种画布渲染器**下都会调这个钩子（Pixaroma 源码原话：
//   "the node map in both renderers"）⇒ 旧版 LiteGraph 和 Nodes 2.0 都能显示，
//   所以 XiaoHei 家族不用再自己算坐标、不用 monkey-patch，两模式天然一致。
//
// 我们注册的命令（**只对 XiaoHei 家族节点生效**）：
//     XH.ShowGuide  → 打开 XiaoHei 自己的指南（帮助浏览器），并定位到该节点说明页
//   中/EN 语言键       → 切换家族中英文。图标是一个主题色圆钮，内显当前语言「中」/「EN」，
//                       （用 html[data-xh-lang] + CSS 切换文字，点一下即切，不需要重绘工具条）
//    按键配色（原 XH.ShowNodeStyle 命令）→ 2026-11-11 已融合进「节点配色」面板（xh_node_style.js 的「按键」页签），命令已移除。
//  2026-11-06 家族齿轮统一： 只留给「设置」，这颗改外观的已换调色板图标；
//    节点脸上收起高级参数的按钮也已换成 ▸/▾ 箭头（见 xh_ui_kit.js makeGearBtn）。
//
//  与 Pixaroma 的区别（用户明确要求，别搞混）：
//    它加的是「齿轮(节点设置) + 问号(它自己的帮助)」；
//    我们加的是「语言切换 + **我们自己的** ?（XiaoHei 指南）」。
//
// 命令图标：官方把 command.icon 渲染成 `<i :class="command.icon">`，
//   所以图标长相由我们自己的 CSS 画（圆底 + mask/文字），
//   配色用官方主题变量 --base-foreground / --base-background ⇒ 深浅色自动适配，
//   和官方按钮的 `bg-base-foreground text-base-background` 同一套。

const { app } = window.comfyAPI.app;

import { currentLang, toggleLang, ensureLangBridge, onLangChanged } from "./xh_ui_kit.js";
import { opeXHColorPickerPopup, BUTTON_PALETTE } from "./xh_color_picker.js";
// 2026-11-25：「按键」页签必须落到家族真正在用的 accent 变量上（--pix-acc）。
// 只写 --xh-acc 等于写了个没人读的变量，按钮纹丝不动 —— 这就是「按键配色无效」的根因。
import { setNodeAccent, repaintAccent } from "./shared/node_settings.mjs";

ensureLangBridge();

const HELP_CMD = "XH.ShowGuide";
const LANG_CMD = "XH.ToggleLang";
const CSS_ID = "xh-node-toolbar-css";

// 转义工具：# 之类要转义，让 SVG 能塞进 data URI 的 mask
const enc = (s) => s.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23").replace(/"/g, "'");

//  按键配色已融合进「节点配色」面板（xh_node_style.js 的「按键」页签）：
//    原 STYLE_CMD 命令已删，按键色真逻辑（applyBtnColor 等）改为 export 供面板复用。
const SVG_PALETTE = enc(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' " +
    "stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 " +
    "0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996 " +
    "c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z'/>" +
    "<circle cx='13.5' cy='6.5' r='.5' fill='black'/>" +
    "<circle cx='17.5' cy='10.5' r='.5' fill='black'/>" +
    "<circle cx='8.5' cy='7.5' r='.5' fill='black'/>" +
    "<circle cx='6.5' cy='12.5' r='.5' fill='black'/>" +
    "</svg>"
);

// lucide circle-help（官方帮助按钮同款轮廓线），做 mask 用；# 之类要转义
const SVG_HELP = enc(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' " +
    "stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'>" +
    "<circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/>" +
    "<path d='M12 17h.01'/></svg>"
);

function injectIconCSS() {
    if (document.getElementById(CSS_ID)) return;
    const el = document.createElement("style");
    el.id = CSS_ID;
    el.textContent = `
    /*  2026-11-11：家族蓝 #1A1613 圆底 + 纯白字。帮助=单独「?」，语言=单颗圆钮内显当前语言
       font-style: normal 必加：官方把命令图标渲染成 <i> 标签，浏览器默认 <i> 是斜体(italic)，
       我们的 ::before 文字会继承这股斜体 ⇒ 之前「?」和「中/EN」全是歪的。强制正体 + 居中。 */
    .xh-tb-help, .xh-tb-lang {
      display: inline-flex; align-items: center; justify-content: center;
      font-style: normal !important; font-style: normal;
      width: 26px; height: 26px; border-radius: 50%;
      background: var(--xh-rest, #1A1613);
      color: #ffffff; text-align: center;
      vertical-align: middle; pointer-events: auto; cursor: pointer;
      font-size: 17px; font-weight: 800; line-height: 1;
    }
    .xh-tb-help::before { content: "?"; font-style: normal; }
    .xh-tb-lang::before {
      display: block; color: #ffffff;
      font-style: normal; font-weight: 800; line-height: 1;
      letter-spacing: 0;          /* 不挤压，避免视觉歪斜 */
    }
    /* 兜底：没拿到 data-xh-lang 时也显示「中」，不空、不显怪字符 */
    .xh-tb-lang::before { content: "中"; font-size: 17px; }
    html[data-xh-lang="zh"] .xh-tb-lang::before { content: "中"; font-size: 17px; }
    html[data-xh-lang="en"] .xh-tb-lang::before { content: "EN"; font-size: 12px; }

    /* 节点按键颜色面板 */
    .xh-style-pop {
      position: fixed; z-index: 100000;
      background: var(--xh-surface,#252525); color: var(--xh-text,#e8e8e8);
      border: 1px solid var(--xh-border,#333); border-radius: 8px;
      padding: 12px; width: 250px;
      box-shadow: 0 8px 26px rgba(0,0,0,.55); font-size: 13px;
    }
    .xh-style-pop h4 { margin: 0 0 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .xh-style-pop .x { margin-left: auto; cursor: pointer; opacity: .7; font-weight: 400; }
    .xh-style-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    .xh-style-sw {
      width: 34px; height: 34px; border-radius: 6px; border: 1px solid rgba(255,255,255,.3);
      cursor: pointer; flex: 0 0 auto; overflow: hidden;
      background-image: linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%);
      background-size: 12px 12px; background-position: 0 0,0 6px,6px -6px,-6px 0;
    }
    .xh-style-sw > i { display: block; width: 100%; height: 100%; }
    .xh-style-btn {
      background: var(--xh-surface,#252525); color: var(--xh-text,#e8e8e8);
      border: 1px solid var(--xh-border,#333); border-radius: 4px;
      padding: 4px 10px; font-size: 12px; cursor: pointer;
    }
    .xh-style-btn:hover { filter: brightness(1.2); }

    /* 按键色：采用与 Pixaroma(--pix-acc) 同机制的 CSS 变量方案。
       颜色只写进节点根(及各个 widget 元素)的 --xh-acc 变量；哪些元素变、哪些不变，
       完全由每个节点自己的 CSS 决定（吃 var(--xh-acc) 的元素才变）。
       因此标题栏折叠箭头、参数下拉、节点容器/行底色等不吃该变量的元素
       永远不会被染色 —— 从根上杜绝「一大片」误染。
       家族按键(.xh-bar-btn)与 LoRA 堆栈的 .xh-pll-add 等已在各自 CSS 里
       用 var(--xh-acc, <默认>) 消费此变量，故会被正确染色；文字色走 --xh-acc-tx。

       ※ 原生控件（ComfyUI 自带的开关/滑块/勾选框）不吃 --xh-acc，它们由 ComfyUI 自己的
       accent-color 规则上色；下面这两条外科式规则把「被染色的节点」内的原生控件 accent-color
       与选中态背景重定向到 --xh-acc，从而开关/滑块/勾选框一起跟随节点色（对齐 Pixaroma 给
       原生控件用 accent-color 的做法）。仅作用于挂了 .xh-has-accent 的节点，不影响其它节点。 */
    [data-node-id].xh-has-accent input[type="checkbox"],
    [data-node-id].xh-has-accent input[type="range"],
    [data-node-id].xh-has-accent [role="switch"] {
      accent-color: var(--xh-acc, #8a8a8a) !important;
    }

    /* 原生勾选框选中态：跟随 accent（轨道/方块填充） */
    [data-node-id].xh-has-accent input[type="checkbox"]:checked {
      background-color: var(--xh-acc, #8a8a8a) !important;
      border-color: var(--xh-acc, #8a8a8a) !important;
    }

    /* 节点布尔开关 = PrimeVue ToggleSwitch（unstyled）。真实结构是
       button[role="switch"]  >  span(轨道)  ，旋钮是它的 ::before（或再嵌套的 span）。
       之前只给 button 设 background，会被内部 span 盖住 → 只露出"外圈"。
       这里选中态时把 按钮本身 + 内部 span(轨道) 一起填 accent，
       旋钮(::before / 嵌套 span)保持白色以保证在彩色轨道上可见。 */
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"],
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] {
      background-color: var(--xh-acc, #8a8a8a) !important;
      border-color: var(--xh-acc, #8a8a8a) !important;
    }
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"] > span,
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] > span,
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"] > *,
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] > * {
      background-color: var(--xh-acc, #8a8a8a) !important;
    }
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"] > span::before,
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] > span::before,
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"] > *::before,
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] > *::before,
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"] > span > span,
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] > span > span,
    [data-node-id].xh-has-accent [role="switch"][aria-checked="true"] > * > *,
    [data-node-id].xh-has-accent [role="switch"][data-state="checked"] > * > * {
      background-color: #ffffff !important;
    }
  `;
    document.head.appendChild(el);
}

/** 当前选中的节点（两套渲染器都拿得到，抄 Pixaroma 的取法）。 */
function selectedNodes() {
    const c = app.canvas;
    if (!c) return [];
    const nodes = [];
    try { if (c.selected_nodes) nodes.push(...Object.values(c.selected_nodes)); } catch (e) {}
    try { if (c.selectedItems) for (const it of c.selectedItems) if (it && it.comfyClass) nodes.push(it); } catch (e) {}
    return nodes;
}

/** 这个节点是不是 XiaoHei 家族的？（家族节点类型一律 XiaoHei 前缀） */
function iXHClass(cls) {
    const t = String(cls || "");
    return t.startsWith("XiaoHei") || t.startsWith("XH");
}

// ── 节点按键颜色（调色板面板） ──────────────────────────────────────────────
// 颜色规范化：支持 #abc / #aabbcc / abc / aabbcc，统一返回小写 #rrggbb 或 null
export function normalizeHex(v) {
    if (!v) return null;
    let s = String(v).trim();
    if (s[0] !== "#") s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) s = "#" + s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}
// 按键文字色：按相对亮度选深字/浅字（铁律：浅底必须配深字，避免白底白字看不见）
function btnTextColor(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) return "var(--xh-text,#e8e8e8)";
    const f = (c) => { const n = parseInt(c,16)/255; return n <= 0.03928 ? n/12.92 : Math.pow((n+0.055)/1.055, 2.4); };
    const L = 0.2126*f(m[1]) + 0.7152*f(m[2]) + 0.0722*f(m[3]);
    return L > 0.5 ? "#1c1c1c" : "var(--xh-text,#e8e8e8)";
}
// 节点根 DOM（Nodes 2.0 / LiteGraph 两套渲染器都尽量拿到）
function nodeRoot(node) {
    if (!node) return null;
    if (node.element && node.element.querySelector) return node.element;
    if (node.id != null) {
        const el = document.querySelector(`[data-node-id="${node.id}"]`);
        if (el) return el;
    }
    return null;
}
// ── 按键色持久化 + 重涂（修复「临时变色、退出即恢复」） ──────────────────
// 关键：颜色真源只存 node.properties.xhBtnColor（随工作流存档/重载），
//      DOM 上的 class/变量是「派生显示」，每次节点 DOM 变动都从 properties 重涂，
//      所以不会因重渲染丢失；重载由 nodeCreated(microtask+rAF) 与
//      afterConfigureGraph 双路从 properties 重涂（见下方 2026-11-06 段）。
const _btnColorObs = new WeakMap();   // root 元素 → MutationObserver

// 依据 node.properties.xhBtnColor 把颜色重涂到「应上色的元素」上（幂等、精确筛选）。
// 仅对：家族按键 / 增量±按钮 / 布尔开关(role=switch) / 滑块(input[type=range]、role=slider、.p-slider-handle) 生效；
// 排除：标题栏(.title，含折叠箭头) 与 参数下拉(COMBO：combobox/select/.p-select 等)。
// 语义红键 .xh-bar-btn-danger 永不重涂。颜色真源仍只是 node.properties，DOM 是派生显示。
// 节点根(及每个 widget 元素)挂 --xh-acc / --xh-acc-tx 变量；哪些元素消费它们、
// 从而变色，由每个节点各自的 CSS 决定（LoRA 堆栈的 .xh-pll-add / 家族 .xh-bar-btn
// 已在各自 CSS 里用 var(--xh-acc, <默认>) 消费）。
// 节点容器/标题栏/下拉等不吃该变量 ⇒ 永不误染。颜色真源仍是 node.properties.xhBtnColor。
export function repaintBtnColor(node) {
    const root = nodeRoot(node);
    // 真源：pixAccent（accentOf 读它）优先，兼容老工作流的 xhBtnColor
    const hex = normalizeHex(node?.properties?.xhBtnColor)
        || normalizeHex(node?.properties?.pixAccent);
    const targets = [];
    if (root) targets.push(root);
    for (const w of (node?.widgets || [])) {
        const e = w?.element || w?.inputEl;
        if (e && e.style) targets.push(e);
    }
    if (!hex) {                              // 清除：摘掉变量，交回各自默认色
        targets.forEach((t) => {
            t.style.removeProperty("--xh-acc");
            t.style.removeProperty("--xh-acc-tx");
            t.style.removeProperty("--node-component-surface-highlight");
        });
        if (root) root.classList.remove("xh-has-accent");
        return;
    }
    const tx = btnTextColor(hex);           // 浅底配深字 / 深底配浅字（铁律）
    // ① 家族按键 / XiaoHei 自定义控件（.xh-bar-btn / .xh-pll-add / .xh-sl-row 等）消费 --xh-acc
    targets.forEach((t) => { t.style.setProperty("--xh-acc", hex); t.style.setProperty("--xh-acc-tx", tx); });
    // ② 把 ComfyUI 原生控件的 accent 变量重定向到 --xh-acc（该变量仅被 accent-color 消费，
    //    故只影响开关/滑块/勾选框的选中色，不误伤其它）。双保险 + 上面外科式规则一起生效。
    if (root) {
        root.style.setProperty("--node-component-surface-highlight", "var(--xh-acc)");
        root.classList.add("xh-has-accent");
    }
}

// 监听节点 DOM 变动（按钮被重建/增删），自动从 properties 重涂，扛住重渲染
function watchBtnColor(node) {
    const root = nodeRoot(node);
    if (!root || _btnColorObs.has(root)) return;
    let raf = 0;
    const obs = new MutationObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; try { repaintBtnColor(node); } catch (e) {} });
    });
    obs.observe(root, { childList: true, subtree: true });   // 仅 childList：避免自身重涂触发死循环
    _btnColorObs.set(root, obs);
}
function unwatchBtnColor(node) {
    const root = nodeRoot(node);
    const obs = root && _btnColorObs.get(root);
    if (obs) { obs.disconnect(); _btnColorObs.delete(root); }
}
// 标记画布变脏，让 ComfyUI 自动存档/下次保存带上本次改动（仅用户手动改色时调用）
function tryMarkDirty() {
    try { if (app?.graph && typeof app.graph.setDirtyCanvas === "function") app.graph.setDirtyCanvas(true, true); } catch (e) {}
}

// 应用 / 清除按键色（用户从面板点选时走这里）：写 properties + 立即重涂 + 持久化
export function applyBtnColor(node, hex) {
    if (!node) return;
    if (!node.properties) node.properties = {};
    if (!hex) {                        // 清除
        delete node.properties.xhBtnColor;
        setNodeAccent(node, null);     // 清 pixAccent ⇒ 回到主题默认色（不冻成今天的色）
        repaintAccent(node);           // --pix-acc / --xh-acc 一起回默认
        repaintBtnColor(node);         // 摘掉 xh-has-accent + 原生控件重定向
        unwatchBtnColor(node);
        tryMarkDirty();
        return;
    }
    const c = normalizeHex(hex);
    if (!c) return;
    // ① 真源写 pixAccent：accentOf 优先级最高，切主题预设不会把它冲掉
    setNodeAccent(node, c);
    // ② 家族 CSS（.pix-sketch-btn:hover / 色板选中框 / LoRA 加号 …）全吃 --pix-acc
    repaintAccent(node);
    // ③ 老键保留，旧版本节点与已存工作流仍读得到；--xh-acc / 原生开关滑块由它负责
    node.properties.xhBtnColor = c;
    repaintBtnColor(node);
    watchBtnColor(node);
    tryMarkDirty();
}
// ── 载入 / 切工作流回来后恢复按键色（2026-11-06 修） ──────────────────────
// 官方前端实测（app-BEFBFi8M.js）：节点构造函数里 invokeExtensionsAsync("nodeCreated")
// → 之后 rootGraph.configure() 才把 properties 从工作流 JSON 恢复回来。
// 旧写法在 nodeCreated 里先读 xhBtnColor（此时必为 undefined）就 return，于是
// 「切到别的工作流再切回来」颜色不再重涂。Pixaroma 的 settleNodeAccent 也是同坑
// （其源码注释 Vue Compat #8：onNodeCreated → configure ENTER → EXIT → microtask）。
// 修法：① 检查挪进 microtask；② rAF 二次，等 Nodes 2.0 的 DOM 挂上再涂一遍；
//       ③ 挂官方 afterConfigureGraph，覆盖 open / tab 切换 / undo 全路径。
// 全程只读 properties 重涂，绝不写、绝不标脏 ⇒ 打开工作流不会被判「已修改」。
function restoreBtnColor(node) {
    if (!node || !normalizeHex(node?.properties?.xhBtnColor)) return;
    try { repaintBtnColor(node); watchBtnColor(node); } catch (e) {}
}
function scheduleBtnColorRestore(node) {
    if (!node || node.__xhBtnColorSettleQueued) return;
    const cls = String(node?.comfyClass || node?.type || "");
    if (!iXHClass(cls)) return;
    node.__xhBtnColorSettleQueued = true;
    queueMicrotask(() => {
        node.__xhBtnColorSettleQueued = false;
        try { restoreBtnColor(node); } catch (e) {}
    });
    // DOM 挂载晚于 configure：下一帧再涂一次，并补挂 MutationObserver
    try {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => { try { restoreBtnColor(node); } catch (e) {} });
        }
    } catch (e) {}
}
// 官方 afterConfigureGraph 时机：graph.configure() 已完成、properties 已恢复。
// 遍历主图 + 子图，凡带 xhBtnColor 的节点一律重涂（幂等、按 properties 判，不认类名）。
function repaintAllBtnColors() {
    const A = (typeof app !== "undefined" && app) || (typeof window !== "undefined" && window.app);
    const root = A && (A.rootGraph || A.graph);
    if (!root) return;
    const graphs = [root];
    try { for (const g of (root.subgraphs?.values?.() || [])) graphs.push(g); } catch (e) {}
    for (const g of graphs) {
        for (const n of (g?._nodes || g?.nodes || [])) {
            if (n && normalizeHex(n?.properties?.xhBtnColor)) {
                try { repaintBtnColor(n); watchBtnColor(n); } catch (e) {}
            }
        }
    }
}
// 节点是否含按键/开关（无按键则不显示调色板，用户原话：没按键没必要）
export function nodeHasButtons(node) {
    if (!node) return false;
    if ((node.widgets || []).some((w) => w && w.type === "button")) return true;
    const root = nodeRoot(node);
    if (root && root.querySelector && root.querySelector("button")) return true;
    return false;
}

/**
 * 清掉历史上遗留的内容区「中/EN」键（.xh-lang-content）。
 *  2026-11-13：makeXHToolbar 已改为**默认不创建**它 —— 根因是「节点创建早于官方钩子首次命中」
 *  的时序竞态，旧兜底判断误把新前端当成老前端，节点一出生就塞一颗「中」，点一下才被删。
 *  本函数现在只负责：① 清掉旧版本 / 已打开工作流残留在 DOM 的按钮；
 *  ② 万一某节点显式传 contentLang:true（真老前端兜底），仍由官方钩子收口。
 *  清理很轻（一次 querySelectorAll），setup / 载入工作流 / 选中节点时各跑一次。
 */
function dropContentLangButtons() {
    try {
        const list = document.querySelectorAll(".xh-lang-content");
        if (list && list.length) list.forEach((b) => b.remove());
    } catch (e) {}
}

//  2026-11-11：原「按键配色」独立浮窗（openNodeStylePanel）已融合进「节点配色」面板
//    （xh_node_style.js 的「按键」页签），此处不再保留该浮窗。按键色真逻辑由下方
//    applyBtnColor / repaintBtnColor（已 export）提供，持久化/重载恢复仍在 nodeCreated /
//    afterConfigureGraph 钩子里跑（下方 registerExtension 内），行为不变。

/** 打开 XiaoHei 自己的指南，并尽量定位到该节点的说明页。 */
function openGuide() {
    try {
        const H = window.XHHelp;
        if (!H) { console.warn("XH.NodeToolbar] XHHelp 未就绪，帮助浏览器可能没加载"); return; }
        //  2026-11-08：两套画布给的类型字段不一样（Vue 选中项是 comfyClass，
        //    LiteGraph 节点可能只有 type）⇒ 两个都认，否则取不到 class_type，
        //    问号只会打开帮助首页、不会定位到这个节点的说明页。
        const node = selectedNodes().find((n) => iXHClass((n && (n.comfyClass || n.type)) || ""));
        const cls = node && (node.comfyClass || node.type);
        if (cls && typeof H.openNode === "function") { H.openNode(cls); return; }
        if (typeof H.open === "function") H.open();
    } catch (e) { /* 指南没起来就算了 */ }
}

function syncLangAttr() {
    try {
        document.documentElement.setAttribute("data-xh-lang", currentLang() === "zh" ? "zh" : "en");
    } catch (e) {}
}

app.registerExtension({
    name: "XH.NodeToolbar",

    commands: [
        {
            id: HELP_CMD,
            label: "XiaoHei 帮助",
            icon: "xh-tb-help",
            function: () => openGuide(),
        },
        {
            id: LANG_CMD,
            label: "中/EN 切换",
            icon: "xh-tb-lang",
            function: () => {
                toggleLang();
                syncLangAttr();
            },
        },
    ],

    // 官方来问：选中项要显示哪些命令。返回 id 数组，官方负责渲染。
    getSelectionToolboxCommands(item) {
        try {
            //  仅清历史残留。kit 已默认不创建内容区语言键，这里不再承担"判定"职责。
            //  __xhTbHookHits 保留自增供调试，⛔ 不要再拿它决定要不要往节点里塞按钮。
            window.__xhTbHookHits = (window.__xhTbHookHits || 0) + 1;
            dropContentLangButtons();
            //  2026-11-11：多字段兜底（comfyClass || type || comfyType），
            //    改名后显示名去前缀、各渲染器取的字段不一，单认 comfyClass 会漏判→按钮消失。
            const cls = item && (item.comfyClass || item.type || item.comfyType);
            if (!iXHClass(cls)) return [];
            // 仅保留「?」帮助 + 圆形中/EN 语言切换；按键配色已并入「节点配色」面板（不再单独成命令）
            return [HELP_CMD, LANG_CMD];
        } catch (e) { return []; }
    },

    // 加载已存的按键色：properties 在 configure() 之后才恢复，onNodeCreated 时还读不到。
    //  别在钩子体里先判 properties（旧 bug 就在这：必为 undefined ⇒ 直接 return，
    //    切工作流回来颜色不再重涂）。判断放进 microtask，参照 Pixaroma settleNodeAccent。
    // 注意：加载路径只读 properties 重涂，绝不写、也不标脏（不破坏干净存档）。
    nodeCreated(node) {
        try { scheduleBtnColorRestore(node); } catch (e) {}
    },

    // 官方：graph.configure() 完成、properties 已恢复。打开工作流 / 切 tab / undo
    // 全走这里（Pixaroma 亦确认 loadGraphData 是唯一漏斗）。下一帧再兜一次，
    // 等 Nodes 2.0 的节点 DOM 挂载完成后再涂，并把 MutationObserver 挂上。
    afterConfigureGraph() {
        try {
            repaintAllBtnColors();
            dropContentLangButtons();     // 打开 / 切换工作流后清一次历史残留
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(() => {
                    try { repaintAllBtnColors(); dropContentLangButtons(); } catch (e) {}
                });
            }
        } catch (e) {}
    },

    setup() {
        injectIconCSS();
        syncLangAttr();
        onLangChanged(() => syncLangAttr());
        //  不刷新页面也能立刻清掉上一版本留在节点里的「中」（DOM 挂载有早有晚，兜几次）
        dropContentLangButtons();
        for (const d of [0, 200, 800, 2000]) setTimeout(dropContentLangButtons, d);
    },
});

if (typeof window !== "undefined") {
    window.__xhTbHookHits = window.__xhTbHookHits || 0;
    window.__xhTbOfficial = true;      // 本前端支持官方钩子（说明文件已被加载）
}
