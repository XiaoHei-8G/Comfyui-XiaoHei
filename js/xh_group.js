// XiaoHei 分组控制器 - Nodes 2.0 兼容（2026-09-29 升级版）
// 对齐 rgthree Fast Groups Bypasser 的三条能力：颜色/标题过滤、单开限制、自动刷新。
// 组内节点判定：官方 _children / _nodes 归属优先，回退中心点法；且一律用「组所属那张图」的节点
//   （🔴 子图里的分组是本节点核心能力，主图 0 组时全靠它 —— 见下方 GROUP_SCOPE 说明）。
const { app } = window.comfyAPI.app;
import { onLangEvent, ensureLangBridge, paintBarBtn, xhIconHTML, xhDecorateButton, XH_TOKENS, xhCardCss, xhPlaceBeside, xhFollowAnchor, xhMakeDraggable, XH_GEAR_SVG } from "./xh_ui_kit.js";

// ── 设置面板样式（齿轮弹出浮层，仿 XiaoHei-LoRA堆栈 .xh-pll-set；class 名独立避免冲突）──
let _xhGrpStyleInjected = false;
function injectGroupStyle() {
    if (_xhGrpStyleInjected) return;
    _xhGrpStyleInjected = true;
    const css =
        ".xh-grp-gear{flex:0 0 auto;width:20px;height:20px;display:flex;align-items:center;justify-content:center;"
        + "background:transparent;border:0;border-radius:5px;cursor:pointer;user-select:none;"
        + "color:#cfcfcf;opacity:.45;transition:opacity .15s,color .15s,filter .15s;}"
        + ".xh-grp-gear svg{width:15px;height:15px;display:block;}"
        + ".xh-grp-gear:hover{opacity:1;color:var(--xh-acc,#E8A33C);filter:brightness(1.1);}"
        + ".xh-grp-set{position:fixed;z-index:10026;width:320px;max-width:94vw;background:#2b2b2b;"
        + "border:1px solid var(--xh-primary,#E8A33C);border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.6);"
        + "color:#ddd;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;}"
        + ".xh-grp-set-top{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid #1c1c1c;cursor:grab;}"
        + ".xh-grp-set-top svg{width:15px;height:15px;color:#bbb;flex:none;}"
        + ".xh-grp-set-top h3{margin:0;font-size:13px;font-weight:600;flex:1;min-width:0;}"
        + ".xh-grp-set-top .x{margin-left:auto;color:#8a8a8a;cursor:pointer;font-size:14px;line-height:1;}"
        + ".xh-grp-set-top .x:hover{color:#fff;}"
        + ".xh-grp-set-body{padding:6px 13px 10px;max-height:62vh;overflow-y:auto;}"
        + ".xh-grp-set-body::-webkit-scrollbar{width:7px;}"
        + ".xh-grp-set-body::-webkit-scrollbar-thumb{background:#555;border-radius:3px;}"
        + ".xh-grp-set-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #212121;}"
        + ".xh-grp-set-row:last-of-type{border-bottom:0;}"
        + ".xh-grp-set-row .lab{flex:1;min-width:0;}"
        + ".xh-grp-set-row .lab b{display:block;font:600 12px 'Segoe UI';color:#e2e2e2;}"
        + ".xh-grp-set-row .lab small{display:block;color:#888;font-size:10.5px;line-height:1.4;margin-top:1px;}"
        + ".xh-grp-set-row select,.xh-grp-set-row input[type=text]{background:#161616;border:1px solid #3a3a3a;border-radius:5px;color:#fff;font:11px monospace;padding:4px 7px;max-width:150px;}"
        + ".xh-grp-set-row select:focus,.xh-grp-set-row input:focus{outline:none;border-color:var(--xh-primary,#E8A33C);}"
        + ".xh-grp-set-done{margin:4px 13px 13px;}"
        + ".xh-grp-set-done button{width:100%;height:30px;border:0;border-radius:6px;background:var(--xh-primary,#E8A33C);color:#1c1c1c;font:600 12px 'Segoe UI';cursor:pointer;}"
        + ".xh-grp-set-done button:hover{filter:brightness(1.08);}"
        //  2026-11-15 用户「整个大小变小一些」：高 26→22 / 左右 12→9 / 字 13→11.5 / 圆角 6→5；
        //    顺手把写死的 system-ui 换成官方 --font-sans（家族字体铁律）。齿轮 20×20 保持不动。
        + ".xh-grp-btn{height:22px;padding:0 9px;border-radius:5px;"
        + "font:400 11.5px var(--font-sans, ui-sans-serif, system-ui, sans-serif);"
        + "cursor:pointer;flex:none;"
        + "display:inline-flex;align-items:center;justify-content:center;background:#2a2a2c;"
        + "transition:transform .08s ease,background .12s ease,border-color .12s ease;}"
        + ".xh-grp-off{color:#f85149;border:1px solid #f85149;box-shadow:0 0 5px rgba(248,81,73,.6),0 0 11px rgba(248,81,73,.35);}"
        + ".xh-grp-on{color:#3fb950;border:1px solid #3fb950;box-shadow:0 0 5px rgba(63,185,80,.6),0 0 11px rgba(63,185,80,.35);}"
        + ".xh-grp-off:hover{border-color:#ff7b7b;box-shadow:0 0 8px rgba(248,81,73,.85),0 0 16px rgba(248,81,73,.5);}"
        + ".xh-grp-on:hover{border-color:#5fd97a;box-shadow:0 0 8px rgba(63,185,80,.85),0 0 16px rgba(63,185,80,.5);}"
        + ".xh-grp-off:active,.xh-grp-off.xh-grp-press{background:#f85149;color:#fff;transform:scale(.94);box-shadow:0 0 11px rgba(248,81,73,.95),0 0 22px rgba(248,81,73,.6);}"
        + ".xh-grp-on:active,.xh-grp-on.xh-grp-press{background:#3fb950;color:#06210f;transform:scale(.94);box-shadow:0 0 11px rgba(63,185,80,.95),0 0 22px rgba(63,185,80,.6);}"
        + ".xh-grp-off.is-active{background:#f85149;color:#fff;box-shadow:0 0 7px rgba(248,81,73,.8),0 0 14px rgba(248,81,73,.45);}"
        + ".xh-grp-on.is-active{background:#3fb950;color:#06210f;box-shadow:0 0 7px rgba(63,185,80,.8),0 0 14px rgba(63,185,80,.45);}"
        + ".xh-grp-card-off{opacity:.4;}"   // 关闭的组：整张卡片（色块+组名+滑块+箭头）一起压暗
        + ".xh-grp-mark{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;}"
        + ".xh-grp-mark svg{width:16px;height:16px;display:block;}"
        + "@keyframes xhGrpBlink{0%,100%{opacity:1;}50%{opacity:.22;}}"
        + ".xh-grp-blink{animation:xhGrpBlink 1.1s ease-in-out infinite;}";
    const el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
}

// ① 语言桥：window.XH_LANG 变 accessor —— 赋值即写 localStorage + 广播 xh:lang-changed
ensureLangBridge();
// ② 家族同步：别的 XiaoHei 节点切语言时，所有分组控制节点跟着重绘（本节点是自绘 DOM）
onLangEvent(() => {
    try {
        for (const n of (app.graph ? (app.graph.nodes || app.graph._nodes || []) : [])) {
            if (n && n.type === NODE_TYPE && typeof n._render === "function") n._render();
        }
    } catch (e) {}
});

const NODE_TYPE = "XHGroupController";
const MODE_ON = 0;   // LiteGraph.ALWAYS
const MODE_OFF = 4;  // LiteGraph.BYPASS（旁路；rgthree Bypasser 同款）

//  2026-11-06「标题栏对齐官方」：宽度唯一真源。
//    官方普通节点默认 270px；本节点原先写死 360（+ addDOMWidget minWidth 340）
//    ⇒ 截图实测家族蓝标题栏 637px / 官方紫标题栏 477px = 1.34 倍 = 360/270。
//    标题栏宽度 = 节点宽度（xh_ui_kit.js:3089 roundRect(0,-th,size[0],th)），
//    所以收窄节点才能真正把标题栏收成官方长度。
//     _render() 每次都会重写 size ⇒ 只改 onNodeCreated 的初始值没用，5 处必须一起改。
//     minWidth 必须同步降到 270 以下，否则 Vue 下 DOM 会把节点撑回 340。
const GROUP_W = 340;   // 2026-11-15 修：新建节点默认就够宽（组名+滑块一行放得下），不再窄到必须手动拖
const GROUP_MIN_W = 250;

// 中英文标签
const LABELS = {
    zh: { title: "分组控制 XiaoHei", refresh: " 刷新", disableAll: "全关", enableAll: "全开", noGroups: "没有找到组，请先 Ctrl+G 创建组", on: "开", off: "关", blocked: "「只保留一个」限制下不能关掉最后一个",
        statRoot: "主图", statSub: "子图", subFrom: "来自子图：", manySub: "个子图",
        nonGroup: "个非组对象已挡掉", rootGroup: "主图上的分组", subGroup: "里的分组", unnamedSub: "未命名子图",
        gearExpand: "展开控制区（刷新 / 筛选）",
        gearCollapse: "收起控制区，只留组列表" },
    //  🔴 2026-11-15 用户报「切英文后全开/全关按钮里那个小图案还在，漏了删掉」——根因修复：
    //    这两个英文文案当年删 emoji 时只删了字符，**前导空格没删干净**（" All Off" / " All On"）。
    //    js/xh_icon_fill.js 的全页兜底 sweep 见到「前导空格 + 家族 DOM」就调 xhDecorateButton()，
    //    词表里 `^All Off → "开关"` 命中 ⇒ 补上 toggle-right 图标 ⇒ 英文模式凭空多出 ⊙ 图案。
    //    中文文案 "全关" / "全开" 本来就没空格 ⇒ 不补 ⇒ 只有切英文才冒图案。
    //  ⚠️ refresh 的 " Refresh" 是**故意**留的（图标统一方案 B 靠它补图案），别一起删。
    en: { title: "Group Control XiaoHei", refresh: " Refresh", disableAll: "All Off", enableAll: "All On", noGroups: "No groups found. Create one with Ctrl+G first", on: "ON", off: "OFF", blocked: "『always one』restriction: cannot turn off the last one",
        statRoot: "root", statSub: "subgraph", subFrom: "From subgraph: ", manySub: "subgraphs",
        nonGroup: "non-group object(s) filtered", rootGroup: "Group on the root graph", subGroup: "Group in subgraph: ", unnamedSub: "Unnamed subgraph",
        gearExpand: "Expand controls (refresh / filter)",
        gearCollapse: "Collapse controls, keep group list" },
};

// 端口名本地化：本节点已无数据端口（2026-11-15 端口整段删除，节点变纯面板），
// 下面这个函数现在 dict 取不到 → 直接 return，调用处（_render 里的 applyPortLabels）安全空跑。
function applyPortLabels(node, l) {
    if (!node) return;
    const dict = (LABELS[l] || LABELS.zh).slots;
    if (!dict) return;
    const apply = (arr) => {
        for (const s of arr || []) {
            const lb = s && dict[s.name];
            if (lb) s.label = lb;
        }
    };
    apply(node.inputs);
    apply(node.outputs);
    try {
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
    } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ---- 家族语言桥接（window.XH_LANG，与家族其他节点双向联动）----
function getLang(node) {
    let l;
    try { l = window.XH_LANG; } catch (e) {}
    if (l !== "zh" && l !== "en") l = node?.properties?.lang;
    return l === "en" ? "en" : "zh";
}
// setLang 已于 2026-10-05 移除：点「中/EN」现在走 kit 的语言桥（写 localStorage + 广播全家族），
// 本文件的顶层 xh:lang-changed 监听负责重绘，不再需要自己写 node.properties.lang。

// ---- 颜色归一化（照抄 rgthree getFullColor 语义）----
function fullColor(color) {
    if (!color) return "";
    const NC = (typeof LGraphCanvas !== "undefined" && LGraphCanvas.node_colors) || {};
    color = String(color).trim();
    if (NC[color]) color = NC[color].groupcolor;
    color = color.replace("#", "").toLocaleLowerCase();
    if (color.length === 3) color = color.replace(/(.)(.)(.)/, "$1$1$2$2$3$3");
    return "#" + color;
}

function groupColor(g) {
    return fullColor(g.color || g._color || "");
}

// ---- 颜色可读性（2026-10-20 新增）--------------------------------
// 根因：option.style.color =组色，把组色当字色用了 —— 组色是**画在分组框边框上**的，
// 不是给文字用的。实测 10 个官方色在 #1c1c1c 底上，棕 3.76 / 淡蓝 3.45 / 紫 2.68 / 黑 1.69
// 全部低于 WCAG AA 正文 4.5:1，"黑"那一项几乎隐形。
// 修法：字色 = 组色**向白混合**到刚好 4.6:1 —— 保留色相与饱和度，只提亮度。
//  绝不能"一律提到 10:1"：那会把红绿蓝全变成灰白，10 行看着一模一样，色彩识别全废。
const XH_SEL_BG = "#1c1c1c";
function _srgbLum(hex) {
    const c = hex.replace("#", "");
    const v = [0, 2, 4].map((i) => {
        let x = parseInt(c.slice(i, i + 2), 16) / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function _contrast(fg, bg) {
    const a = _srgbLum(fg), b = _srgbLum(bg);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
}
function _mixWhite(hex, t) {
    const c = hex.replace("#", "");
    const p = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    return "#" + p.map((x) => {
        const v = Math.round(x + (255 - x) * t);
        return v.toString(16).padStart(2, "0");
    }).join("");
}
// 返回在深底上可读的字色；已达标则原样返回（红绿蓝青黄一点不动）
export function readableOn(hex, bg = XH_SEL_BG, target = 4.6) {
    if (!hex || hex === "#") return hex;
    if (_contrast(hex, bg) >= target) return hex;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (_contrast(_mixWhite(hex, mid), bg) < target) lo = mid; else hi = mid;
    }
    return _mixWhite(hex, hi);
}

// ---- 节点自身配色（与 XH_LoraStack / XH_Slider 同一套：去官方重复色，12 色高辨识度 + 自定义取色器）----

//  2026-11-15：官方前端 1.59 的 LGraphGroup 把 _bounding / _pos / _size 做成 bounds 的
//    mutation view（src/lib/litegraph/src/LGraphGroup.ts:110-128），旧版则是普通数组。
//    统一在这里取 [x, y, w, h] 四元组，后面所有几何判定都走它。
// 🔴🔴 子图里的分组 = 本节点的核心能力（2026-11-15 用户澄清「之前我说错了」）：
//    我们遍历 graph.subgraphs，孤海的「忽略多组」只读主图 graph._groups。
//    实测 ① H3_文生图_中文.json：主图 0 组、子图「文生图（MiniMax H3 Image）」5 组
//    （模型加载 / 条件设置 / 采样 / 提示词增强 / 用户提示词）—— 它们全是 LGraphGroup，
//    不是节点对象，⛔ 不许当成「混入的脏数据」排除掉，也不许在证据行里那么写。
//    Subgraph extends LGraph（官方 LGraph.ts:3514），其 groups getter 返回子图自己的 _groups；
//    graph.subgraphs 是 rootGraph._subgraphs 的 Map（官方 LGraph.ts:934）。
//    用 WeakMap 记「这个组属于哪张图」，零污染官方对象、零存档风险、组被销毁自动回收。
const GROUP_SCOPE = new WeakMap();
function markGroupScope(g, graph, name, isSub) {
    if (g && typeof g === "object")
        GROUP_SCOPE.set(g, { graph, name: name || null, isSub: isSub === undefined ? !!name : !!isSub });
}
function scopeOf(g) {
    return (g && typeof g === "object" && GROUP_SCOPE.get(g))
        || { graph: app.graph, name: null, isSub: false };
}

function groupBounds(g) {
    if (!g) return null;
    const b = g._bounding || g.bounding;
    if (b && Number(b[2]) > 0 && Number(b[3]) > 0) return b;
    const p = g._pos || g.pos, s = g._size || g.size;
    if (p && s && Number(s[0]) > 0 && Number(s[1]) > 0)
        return [Number(p[0]) || 0, Number(p[1]) || 0, Number(s[0]), Number(s[1])];
    return null;
}

//  LGraphNode 必有 addInput / type / inputs+outputs；LGraphGroup 这四样一个都没有。
function isNodeObject(x) {
    return !!x && (typeof x.addInput === "function" || typeof x.addOutput === "function"
        || (typeof x.type === "string" && x.type.length > 0)
        || (Array.isArray(x.inputs) && Array.isArray(x.outputs)));
}

// 🔴🔴 列表只认「真组」（2026-11-15 用户：「核心本来是检测组，怎么在检测节点？」）
//    把任何节点对象挡在门外，包括 graph._nodes 里的引用。组名长得像节点名不是 bug，
//    但节点对象混进 graph._groups 时必须拦掉，否则列表就变成「检测节点」了。
function isRealGroup(g, nodeSet) {
    if (!g || typeof g !== "object") return false;
    if (nodeSet && nodeSet.has(g)) return false;
    if (isNodeObject(g)) return false;
    return !!groupBounds(g);
}

function groupNodes(g) {
    // 🔴 组属于哪张图就用哪张图的节点：子图组的 bounding 是子图局部坐标，
    //    拿主图节点去套会算出 0 个 / 错节点 ⇒ 节点数、开关状态、定位全错。
    //    （① H3_文生图_中文.json 主图 0 组、5 组全在子图里，正是这个场景。）
    const graph = scopeOf(g).graph || app.graph;
    const all = graph.nodes || graph._nodes || [];
    // ① 官方归属优先：新版 LGraphGroup 用 _children(Set) / _nodes(deprecated) 记录组内成员，
    //    这是「谁属于这个组」的真源；组重叠 / 嵌套 / 画布缩放都不会把隔壁节点算进来。
    let owned = [];
    try {
        const ch = g._children;
        if (ch && typeof ch.forEach === "function") {
            ch.forEach((x) => { if (isNodeObject(x) && x.type !== NODE_TYPE) owned.push(x); });
        } else if (Array.isArray(g._nodes)) {
            owned = g._nodes.filter((x) => isNodeObject(x) && x.type !== NODE_TYPE);
        }
    } catch (e) { owned = []; }
    if (owned.length) return owned;

    // ② 旧版 / 官方归属未维护时回退中心点法（rgthree fast_groups_service 同款口径）
    const b = groupBounds(g);
    const nodes = [];
    if (!b) return nodes;
    for (const n of all) {
        if (!n || n.type === NODE_TYPE || !isNodeObject(n)) continue;
        const cx = n.pos[0] + (n.size[0] || 200) * 0.5;
        const cy = n.pos[1] + (n.size[1] || 100) * 0.5;
        if (cx >= b[0] && cx < b[0] + b[2] && cy >= b[1] && cy < b[1] + b[3]) nodes.push(n);
    }
    return nodes;
}

function entryActive(g) {
    //  官方 LGraphNode.mode 默认 0（ALWAYS）；虚拟节点 / 刚反序列化的节点可能还没写 mode，
    //  那种按「启用」算，别让整列开关误显示成红「关」（2026-11-15 截图就是全红）。
    return groupNodes(g).some((n) => n.mode === MODE_ON || n.mode == null);
}

app.registerExtension({
    name: "XH.GroupController",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        nodeType.isVirtualNode = true;

        // 属性面板可编辑（右键节点 → Properties）
        nodeType["@matchColors"] = { type: "string" };
        nodeType["@matchTitle"] = { type: "string" };
        nodeType["@sort"] = { type: "combo", values: ["position", "alphanumeric"] };
        nodeType["@toggleRestriction"] = { type: "combo", values: ["default", "max one", "always one"] };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            this.title = "分组控制";
            this.serialize_widgets = false;
            this.widgets = [];
            //  高度策略（2026-11-15 改）：节点要像「手动开关摆在那儿」一样紧凑，
            //    高度始终贴合内容，不再保留旧尺寸做下限 —— 否则删掉内联工具栏后旧高度（200）会顶出大块空白。
            //  捕获 ComfyUI 反序列化进来的尺寸（用户此前保存的手动尺寸），先于下面覆盖
            const _loadedSize = (this.size && this.size.length === 2 && this.size[0] > 0) ? [this.size[0], this.size[1]] : null;
            this.size = [GROUP_W, 120];
            this._collapsed = false;
            this._toast = null;
            this._paletteOpen = false;
            //  手动尺寸保护（2026-11-08）：用户拖拽或加载时保存的手动尺寸都要被尊重，
            //    _render() 不再用内容高度把它覆盖掉。
            this._userSize = _loadedSize;          // 加载态即为「手动基线」，未手动过则为 null
            this._manualSized = !!_loadedSize;
            this._ready = false;
            const self0 = this;
            this.onResize = function (size) {
                if (!self0._ready) return;         // 首次渲染完成前不记，避免加载期间误判
                //  ⛔ 必须走 _measureH() 读「真实内容高」。以前直接读 container.scrollHeight，
                //    而它被 _applySize 设的 min-height 撑着 ⇒ 拖宽后永远读到旧的大高度 ⇒
                //    size[1] 被钳住、computeSize 也报大值 ⇒ 底部留白 + 缩不动（2026-11-15 截图）。
                const h = self0._measureH();
                const widthChanged = Math.abs((size[0] || 0) - (self0.size[0] || 0)) > 1;
                self0.size[0] = Math.max(size[0], GROUP_MIN_W);
                self0.size[1] = Math.max(size[1], h);
                self0._userSize = [self0.size[0], self0.size[1]];
                self0._manualSized = true;
                //  只拖高（宽度没变）不回收，保留用户主动放大的高度；拖宽才按新宽度重算贴合。
                if (widthChanged) self0._scheduleWidthSync();
            };

            const P = (this.properties = this.properties || {});
            P.matchColors = P.matchColors ?? "";
            P.matchTitle = P.matchTitle ?? "";
            P.sort = P.sort ?? "position";
            P.toggleRestriction = P.toggleRestriction ?? "default";
            P.lang = P.lang ?? "zh";
            //  齿轮收纳态（true = 控制区收起，只留组列表）；存 properties 随工作流存档
            P.ctrlCollapsed = P.ctrlCollapsed === true;
            this._ctrlCollapsed = P.ctrlCollapsed;

            const container = document.createElement("div");
            //  margin-top:-10px ⇢ 抵消 ComfyUI 框架在「原生标题栏」与「DOM 内容」之间默认留的间距
            //    （孤海同款节点在本机实测：加 -10px 后顶部不再空一大片，直接贴住标题栏）。
            container.style.cssText = `position:relative;width:100%;box-sizing:border-box;font-size:13px;color:#e0e0e0;margin-top:-10px;`;
            this._container = container;

            //  ⛔ 核心修复（2026-11-15）：拖宽节点会让组名不再换行 ⇒ 内容变矮，但
            //    LiteGraph 不会为此重绘（组签名没变），旧框高就留在底部变成大块空白。
            //    用 ResizeObserver 盯「布局宽度」(offsetWidth，不受画布 zoom 的 transform 影响)，
            //    宽度一变就下一帧重算内容高、把 size[1] 拉回贴合 ⇒ 空白消失、也能缩小。
            try {
                if (typeof ResizeObserver !== "undefined") {
                    let lastW = 0;
                    this._ro = new ResizeObserver(() => {
                        const w = container.offsetWidth || 0;
                        if (!w) return;
                        if (lastW && w === lastW) return;   // 只有宽度变化才处理，避免高度回调自激
                        const changed = !!lastW;
                        lastW = w;
                        if (changed && this._ready) this._scheduleWidthSync();
                    });
                    this._ro.observe(container);
                }
            } catch (e) { this._ro = null; }

            try {
                //  ⛔ 之前 minHeight 写死 150 会把 DOM 撑到≥150、节点留大块空白（已改内容驱动）。
                //    副作用：节点能被拖到比内容还小 ⇒ DOM 溢出边框（凸出来）。
                //    修复 = 孤海同款：给 DOM widget 报「最小高 = 内容高」（getMinHeight），
                //    LiteGraph 的 resizeNode 据此钳制 ⇒ 节点「缩不动」（可放大、不可缩到内容以下）；
                //    容器再设 CSS minHeight 双保险，即使极端情况下也不凸出。
                this._domWidget = this.addDOMWidget("groups", "custom", container, {
                    serialize: false, hideOnZoom: false, minWidth: GROUP_MIN_W, minHeight: 0,
                    getMinHeight: () => this._measureH(),
                });
                if (this._domWidget) {
                    //  widget 自己也要报高度，配合 computeLayoutSize 把内容高当布局下限
                    this._domWidget.computeSize = () => [Math.max(this.size[0] || GROUP_W, GROUP_MIN_W), this._measureH()];
                }
            } catch (e) { this._domWidget = null; }

            injectGroupStyle();

            //  2026-11-13 修：以前只有一条 300ms 定时器。真机实测「打开分享来的工作流」时
            //    graph.configure / loadGraphData 会重建节点，这条定时器常常打在已被丢弃的实例上
            //    ⇒ 新实例 _ready 永远 false、_container 是空 div，整个分组列表（含定位箭头）全白。
            //  改成幂等多重保险：只在尚未渲染成功时补渲染，正常渲染完后 800ms 自动刷新照旧接管。
            const self = this;
            const kick = () => {
                if (self._ready || !self._container) return;
                try { self._render(); } catch (e) { /* 等下一拍再补 */ }
            };
            this._kickRender = kick;
            try { requestAnimationFrame(kick); } catch (e) { setTimeout(kick, 0); }
            setTimeout(kick, 300);
            setTimeout(kick, 900);

            // 自动刷新：每 800ms 比对签名（组列表/颜色/开关态/过滤条件），变了才重绘
            this._sig = "";
            this._timer = setInterval(() => {
                if (!this.graph) return;
                if (this._paletteOpen) return;   // 调色期间暂停自动刷新，避免打断取色
                // (颜色下拉打开时已在下方用 getElementById 暂停自动刷新)
                if (document.getElementById("xh_group_color_pop")) return;   // 颜色下拉开着时别重画，否则点中就消失
                const sig = this._signature();
                if (sig !== this._sig) {
                    this._sig = sig;
                    this._render();
                }
            }, 800);
            return r;
        };

        //  2026-11-13：LiteGraph 读档走 configure → onConfigure，不保证会再走 onNodeCreated。
        //    读档后补一拍，确保刚反序列化出来的节点也把列表（和图案）画出来。
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure?.apply(this, arguments);
            const self = this;
            setTimeout(() => {
                if (!self._ready && self._container) { try { self._render(); } catch (e) {} }
            }, 160);
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (this._timer) clearInterval(this._timer);
            this._timer = null;
            try { this._ro && this._ro.disconnect(); } catch (e) {}
            this._ro = null;
            try { cancelAnimationFrame(this._syncRAF); } catch (e) {}
            if (this._colorDropEl) { try { this._colorDropEl.remove(); } catch (e) {} this._colorDropEl = null; }
            return onRemoved?.apply(this, arguments);
        };

        nodeType.prototype._signature = function () {
            const P = this.properties || {};
            const gs = this._collectGroups();
            const parts = gs.map((g) => `${g.title}|${groupColor(g)}|${entryActive(g) ? 1 : 0}`);
            return [P.matchColors, P.matchTitle, P.sort, P.toggleRestriction, this._collapsed ? 1 : 0, parts.join(";")].join("#");
        };

        // 收集组：主图 + 子图，按属性过滤与排序
        nodeType.prototype._collectGroups = function (ignoreFilters) {
            const P = this.properties || {};
            let gs = [];
            const graph = app.graph;
            const mainGroups = graph._groups || graph.groups || [];
            mainGroups.forEach((g) => { markGroupScope(g, graph, null, false); gs.push(g); });

            // 🔴 子图分组是核心能力：官方 LGraph.ts:934 `get subgraphs(){ return rootGraph._subgraphs }`（Map），
            //    Subgraph extends LGraph ⇒ s.groups / s._groups 都是子图自己的组，且都是 LGraphGroup 不是节点。
            //    ⛔ 旧写法 `while ((s = subs.next().value))` 遇到 falsy 值会提前断，改 for-of 全量遍历。
            let subCount = 0;
            const subNames = [];
            try {
                const subs = graph.subgraphs || graph._subgraphs;
                const vals = subs && typeof subs.values === "function" ? subs.values()
                    : (subs && typeof subs[Symbol.iterator] === "function" ? subs[Symbol.iterator]() : null);
                if (vals) {
                    for (const s of vals) {
                        if (!s) continue;
                        const subGroups = s.groups || s._groups || [];
                        const sname = String(s.name || s.title || "").trim() || null;
                        subCount += subGroups.length;
                        if (subGroups.length && sname && !subNames.includes(sname)) subNames.push(sname);
                        subGroups.forEach((g) => { markGroupScope(g, s, sname, true); gs.push(g); });
                    }
                }
            } catch (e) {}
            //  证据行用的来源统计（与过滤无关，先存下来）。
            this._xhScopeStat = { main: mainGroups.length, sub: subCount, names: subNames };

            // 颜色过滤（逗号分隔，支持 ComfyUI 色名与 hex）
            const filterColors = String(P.matchColors || "").split(",").map((c) => fullColor(c)).filter((c) => c && c !== "#");
            // 标题过滤（字符串或正则）
            const mt = String(P.matchTitle || "").trim();
            let titleRe = null;
            if (mt) {
                try { titleRe = new RegExp(mt, "i"); } catch (e) { titleRe = null; }
            }
            // 🔴 只挡真正的节点对象（type / addInput / inputs+outputs），再做颜色 / 标题过滤。
            //    子图里的分组是 LGraphGroup，一个节点特征都没有 ⇒ 一定会被列出来，
            //    ⛔ 不许把「名字长得像节点」当成排除理由（2026-11-15 用户澄清）。
            const nodeSet = new Set(graph._nodes || graph.nodes || []);
            const realGroups = gs.filter((g) => isRealGroup(g, nodeSet));
            if (!ignoreFilters) this._xhDropped = Math.max(0, gs.length - realGroups.length);

            let entries = realGroups.filter((g) => {
                const b = groupBounds(g);
                if (!b || Number(b[2]) <= 0 || Number(b[3]) <= 0) return false;
                if (!ignoreFilters) {
                    if (filterColors.length) {
                        const gc = groupColor(g);
                        if (!gc || !filterColors.includes(gc)) return false;
                    }
                    if (titleRe && !titleRe.test(g.title || "")) return false;
                }
                return true;
            });

            if (P.sort === "alphanumeric") {
                entries.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
            } else {
                // position：按 30px 网格，先 Y 后 X（与 rgthree 一致）
                entries.sort((a, b) => {
                    const pa = a._pos || [0, 0], pb = b._pos || [0, 0];
                    const ay = Math.floor(pa[1] / 30), by = Math.floor(pb[1] / 30);
                    if (ay !== by) return ay - by;
                    return Math.floor(pa[0] / 30) - Math.floor(pb[0] / 30);
                });
            }
            return entries;
        };

        // 兼容旧调用
        nodeType.prototype._getGroups = function () {
            return this._collectGroups().map((g) => ({ title: g.title || "未命名组", nodes: groupNodes(g), group: g }));
        };

        // 切换一组：带「只能开一个 / 必须保留一个」限制
        nodeType.prototype._toggleEntry = function (target) {
            const P = this.properties || {};
            const restriction = P.toggleRestriction || "default";
            const entries = this._collectGroups();
            const hasActive = entryActive(target);
            let newValue = !hasActive;
            if (newValue && restriction.includes(" one")) {
                // 先关掉其他所有组，再开这组
                entries.forEach((g) => { if (g !== target) groupNodes(g).forEach((n) => (n.mode = MODE_OFF)); });
            } else if (!newValue && restriction === "always one") {
                // 不允许关掉唯一开着的组
                const othersOn = entries.some((g) => g !== target && entryActive(g));
                if (!othersOn) {
                    this._flash(LABELS[getLang(this)].blocked);
                    return;
                }
            }
            groupNodes(target).forEach((n) => (n.mode = newValue ? MODE_ON : MODE_OFF));
            this._render();
        };

        nodeType.prototype._flash = function (msg) {
            if (this._toast) clearTimeout(this._toast);
            this._toast = { msg, until: Date.now() + 1800 };
            this._render();
            setTimeout(() => { if (this._toast && Date.now() >= this._toast.until) { this._toast = null; this._render(); } }, 1900);
        };

        //  ── 尺寸策略（2026-11-15 二修：根除「拖宽后底部留白 + 缩不动」）──
        //  ⛔ 病根：以前 _applySize 把 container.style.minHeight 写成当时的内容高。节点刚建
        //    只有 270 宽，组名换行 ⇒ 内容高偏大，这把锁就钉死在那个高值；之后 scrollHeight
        //    被 min-height 撑着永远 ≥ 它，onResize / computeSize / getMinHeight 三处全读到
        //    假高度 ⇒ 框高拉不回、也钳到不许缩小。而「拖宽」不改组签名、不会触发 _render，
        //    所以 _render 里那句「测量前清零」根本没机会跑。
        //  ✅ 修法：① 彻底不设 minHeight（防凸出交给 computeSize/getMinHeight 钳制拖拽）；
        //    ② 所有测量统一走 _measureH()；③ ResizeObserver 盯宽度，变了就重算贴合。
        nodeType.prototype._measureH = function () {
            const c = this._container;
            if (!c) return this._contentH || 56;
            if (c.style.minHeight) c.style.minHeight = "0px";   // 清掉任何历史残留锁
            const h = Math.ceil(c.scrollHeight || c.getBoundingClientRect().height || 0);
            return h > 0 ? h : (this._contentH || 56);
        };

        //  宽度变化后把框高拉回真实内容高（连用户主动拖高留下的空白也一并收掉）
        nodeType.prototype._syncToContent = function () {
            if (!this._ready || !this._container) return;
            const h = this._measureH();
            this._contentH = h;
            const w = Math.max(this.size[0] || GROUP_W, GROUP_MIN_W);
            if (Math.abs((this.size[1] || 0) - h) > 2) {
                this.size = [w, h];
                try { app.graph.setDirtyCanvas(true, true); } catch (e) {}
            }
        };
        nodeType.prototype._scheduleWidthSync = function () {
            const self = this;
            try { cancelAnimationFrame(this._syncRAF); } catch (e) {}
            this._syncRAF = requestAnimationFrame(() => {
                //  rAF 里再测一次：等 DOM 按新宽度完成排版
                try { self._syncToContent(); } catch (e) {}
            });
        };

        nodeType.prototype._applySize = function (w, h) {
            this._contentH = h;
            //  ⛔ 不再设 container.style.minHeight —— 它是所有高度失真的源头。
            if (this._container && this._container.style.minHeight) this._container.style.minHeight = "0px";
            const newW = Math.max(this.size[0] || w, GROUP_MIN_W);   // 保留用户拖出来的宽度
            this.size = [newW, Math.max(h, 1)];                      // 高度直接贴合内容
        };

        //  LiteGraph 用 computeSize 的返回值当「节点最小尺寸」钳制 resizeNode。
        nodeType.prototype.computeSize = function () {
            return [Math.max(this.size[0] || GROUP_W, GROUP_MIN_W), Math.max(this._measureH(), 1)];
        };

        nodeType.prototype._render = function () {
            const c = this._container;
            if (!c) return;
            //  ⛔ 必须先清零上轮残留的 minHeight，再重建并测量 scrollHeight。
            //    否则旧下限（例如上一轮被拖高/多渲几行时的高值）会撑大 scrollHeight ⇒
            //    测出的「内容高」失真、_applySize 据此设的 minHeight 也失真 ⇒ 框高永远缩不回、底部留大块空白。
            c.style.minHeight = "0px";
            const lang = getLang(this);
            const L = LABELS[lang];
            applyPortLabels(this, lang); // 端口名跟着语言走（只改 label）
            c.innerHTML = "";

            const T = XH_TOKENS;

            // 标题栏：只留一个家族齿轮（小、半透明），点它从节点右侧弹出参数面板。
            //  2026-11-15 用户要求：① 去掉「检测到 N 个分组 / N 组·N 开」统计；
            //    ② 把原来左上角的折叠箭头换成家族齿轮；③ 折叠里的参数整捆搬进齿轮面板。
            //  ⛔ 节点本体不再有内联工具栏 / 摘要统计 ⇒ 只剩「标题栏 + 组列表」，最简洁。
            const tb = document.createElement("div");
            //  控件行（参考 PIX「Group Switch」：标题栏下方一行 = [全关 全开 … 齿轮(最右)]）。
            //    齿轮放最右（margin-left:auto），全开/全关回到节点本体做快捷操作。
            tb.style.cssText = `display:flex;align-items:center;gap:${T.ROW_GAP}px;`
                + `border-bottom:${T.BORDER_W}px solid ${T.BORDER};padding:4px ${T.PAD_X}px;`;

            // 全开 / 全关 快捷按钮（落在控件行左侧、齿轮左边；逻辑与齿轮面板内一致）
            const entries0 = this._collectGroups();
            const restriction0 = (this.properties || {}).toggleRestriction || "default";
            //  全开/全关 快捷按钮：纯中文「全关/全开」；红=关/绿=开；套赛博朋克霓虹光晕描边（暗底上显眼、跟暗色节点风一体）；
            //    按下实色填充+缩放下沉=实实在在的反馈（先显 150ms 再重建，否则看不到动画）。
            //  2026-11-15：整组从左侧移到右侧、紧贴齿轮并排（margin-left:auto 只挂「全关」）。
            const mkQuick = (text, fn, cls) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "xh-grp-btn " + (cls || "");
                //  🔴 双保险：这两个按钮设计上就是纯文字 ⇒ 直接打家族兜底的幂等标记，
                //    让 js/xh_icon_fill.js 的 sweep 永远跳过它们（即便将来文案又被加上空格）。
                b.dataset.xhIconDone = "1";
                b.appendChild(document.createTextNode(text));
                b.addEventListener("pointerdown", (e) => e.stopPropagation());
                b.onclick = (e) => { e.stopPropagation(); fn(b); };
                return b;
            };
            //  按下反馈：先给按钮加 xh-grp-press（实色+缩放，CSS 定义）保留 150ms 让人看到，
            //    再 _render 重建（否则同步重建会瞬间销毁按钮、压根看不到按下动画），同时组内开关实时翻转。
            const doQuick = (btn, apply) => {
                btn.classList.add("xh-grp-press");
                apply();
                app.graph.setDirtyCanvas(true, true);
                setTimeout(() => { btn.classList.remove("xh-grp-press"); this._render(); }, 150);
            };
            const allOff = entries0.length > 0 && entries0.every((g) => !entryActive(g));
            const allOn  = entries0.length > 0 && entries0.every((g) => entryActive(g));
            const applyOff = () => entries0.forEach((g, i) => {
                const on = restriction0 === "always one" && i === 0;
                groupNodes(g).forEach((n) => (n.mode = on ? MODE_ON : MODE_OFF));
            });
            const applyOn = () => entries0.forEach((g, i) => {
                const on = restriction0.includes(" one") ? i === 0 : true;
                groupNodes(g).forEach((n) => (n.mode = on ? MODE_ON : MODE_OFF));
            });
            const bAllOff = mkQuick(L.disableAll, (b) => doQuick(b, applyOff), "xh-grp-off" + (allOff ? " is-active" : ""));
            bAllOff.style.marginLeft = "auto";   // 整组推到右侧（不再给齿轮 auto，否则两者抢空间）
            tb.appendChild(bAllOff);
            tb.appendChild(mkQuick(L.enableAll, (b) => doQuick(b, applyOn), "xh-grp-on" + (allOn ? " is-active" : "")));

            const gb = document.createElement("button");
            gb.type = "button";
            gb.className = "xh-grp-gear";
            gb.innerHTML = XH_GEAR_SVG;   // 家族实心齿轮（15×15）
            gb.title = lang === "en" ? "Settings · click to open panel" : "设置 · 点开右侧参数面板";
            gb.setAttribute("aria-label", gb.title);
            gb.addEventListener("pointerdown", (e) => e.stopPropagation());
            gb.onclick = (e) => { e.stopPropagation(); this._toggleGearPanel(); };
            //  ⚠️ 不再给齿轮 margin-left:auto（会和上方全关的 auto 抢空间）；整组靠全关的 auto 推到右侧。
            tb.appendChild(gb);
            this._xhGrpGearBtn = gb;   // 齿轮按钮（仅作 UI，不再充当浮层锚点；锚点改用更稳的 node.element）
            c.appendChild(tb);

            //  （2026-11-15：筛选输入框已随其它参数搬进齿轮面板，节点本体不再内联搜索框。）

            // 提示条
            if (this._toast) {
                const toast = document.createElement("div");
                toast.style.cssText = `padding:4px 10px;font-size:11px;color:#ffd0d0;background:rgba(192,57,43,0.25);`;
                toast.textContent = this._toast.msg;
                c.appendChild(toast);
            }

            const list = document.createElement("div");
            list.style.cssText = `padding:${T.PAD_Y}px ${T.PAD_X}px;`;
            this._listEl = list;
            c.appendChild(list);
            this._renderList();
        };

        // 官方 9 色的中文名（色表取自前端源码 LGraphCanvas.node_colors）
        const COLOR_NAME_ZH = {
            red: "红", brown: "棕", green: "绿", blue: "蓝", pale_blue: "淡蓝",
            cyan: "青", purple: "紫", yellow: "黄", black: "黑", white: "白",
        };
        const OFFICIAL_ORDER = ["red", "brown", "green", "blue", "pale_blue", "cyan", "purple", "yellow", "black", "white"];

        // 颜色下拉：官方色常驻（不受当前工作流影响），再追加工作流里出现过的自定义色
        nodeType.prototype._colorChoices = function () {
            const lang = getLang(this);
            const NC = (typeof LGraphCanvas !== "undefined" && LGraphCanvas.node_colors) || {};
            const out = [];
            const seen = new Set();
            const push = (value, hex) => {
                if (!hex || hex === "#" || seen.has(hex)) return;
                seen.add(hex);
                const zh = COLOR_NAME_ZH[value] || value;
                out.push({ value, hex, label: lang === "zh" ? zh : value.replace(/_/g, " ") });
            };
            const keys = [
                ...OFFICIAL_ORDER.filter((k) => NC[k]),
                ...Object.keys(NC).filter((k) => !OFFICIAL_ORDER.includes(k)),
            ];
            keys.forEach((k) => push(k, fullColor(NC[k].groupcolor || NC[k])));
            // 工作流里用到但不在官方表里的颜色
            this._collectGroups(true).forEach((g) => push(groupColor(g), groupColor(g)));
            // 当前存档里存的值（可能是手填的多色串）
            const cur = String(this.properties?.matchColors || "").trim();
            if (cur && !out.some((o) => o.value === cur)) {
                out.push({ value: cur, hex: fullColor(cur), label: cur });
            }
            return out;
        };

        // 颜色筛选按钮：下拉选色 → 写 matchColors → 实时过滤组列表（真正生效，非皮）
        nodeType.prototype._makeColorFilterBtn = function () {
            const node = this;
            const T = XH_TOKENS;
            const lang = getLang(node);
            const P = node.properties = node.properties || {};
            const btn = document.createElement("button");
            btn.type = "button";
            btn.style.cssText = `display:flex;align-items:center;gap:6px;flex:none;max-width:150px;`
                + `background:${T.CARD_BG};border:${T.BORDER_W}px solid ${T.BORDER};`
                + `border-radius:${T.BTN_RADIUS + 2}px;color:${T.TEXT};`
                + `font:${T.FONT_MD}px system-ui;padding:4px 8px;cursor:pointer;`;
            const sw = document.createElement("span");
            sw.style.cssText = "width:12px;height:12px;border-radius:3px;flex:none;background:#333;border:1px solid rgba(255,255,255,0.4);";
            const tx = document.createElement("span");
            tx.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            btn.appendChild(sw); btn.appendChild(tx);
            const sync = () => {
                const cur = String(P.matchColors || "").trim();
                const choices = node._colorChoices();
                const item = choices.find((o) => o.value === cur);
                sw.style.background = item ? item.hex : "#333";
                tx.textContent = item ? item.label : (cur || (lang === "zh" ? "全部" : "All"));
            };
            sync();
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (!node._colorDropEl) {
                    const d = document.createElement("div");
                    d.id = "xh_group_color_pop";
                    d.style.cssText = `display:none;position:fixed;z-index:10030;`
                        + `background:${T.CARD_BG};border:${T.BORDER_W}px solid ${T.BORDER};`
                        + `border-radius:${T.BTN_RADIUS + 2}px;padding:4px;max-height:200px;`
                        + `overflow-y:auto;min-width:160px;box-shadow:0 6px 18px rgba(0,0,0,.6);`;
                    document.body.appendChild(d);
                    node._colorDropEl = d;
                }
                const d = node._colorDropEl;
                const close = () => {
                    d.style.display = "none";
                    if (node._colorDropHandler) { document.removeEventListener("pointerdown", node._colorDropHandler, true); node._colorDropHandler = null; }
                };
                if (d.style.display === "block") { close(); return; }
                const r = btn.getBoundingClientRect();
                d.style.left = r.left + "px";
                d.style.top = (r.bottom + 4) + "px";
                d.innerHTML = "";
                const mk = (value, label, hex) => {
                    const it = document.createElement("div");
                    it.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px 6px;`
                        + `border-radius:${T.BTN_RADIUS}px;cursor:pointer;`
                        + `font-size:${T.FONT_MD}px;color:${T.TEXT};`;
                    const isw = document.createElement("span"); isw.style.cssText = "width:13px;height:13px;border-radius:3px;flex:none;background:" + hex + ";border:1px solid rgba(255,255,255,0.4);";
                    const itx = document.createElement("span"); itx.textContent = label;
                    it.appendChild(isw); it.appendChild(itx);
                    it.onmouseenter = () => it.style.background = T.STATE_OFF_BG;
                    it.onmouseleave = () => it.style.background = "transparent";
                    it.onclick = (ev) => {
                        ev.stopPropagation();
                        P.matchColors = value;
                        node._sig = node._signature();
                        sync();
                        close();
                        node._render();
                    };
                    d.appendChild(it);
                };
                mk("", lang === "zh" ? "全部颜色" : "All colors", "#333");
                node._colorChoices().forEach((o) => mk(o.value, o.label, o.hex));
                d.style.display = "block";
                node._colorDropHandler = (ev) => {
                    if (d.style.display !== "block") return;
                    if (d.contains(ev.target) || btn.contains(ev.target)) return;
                    close();
                };
                document.addEventListener("pointerdown", node._colorDropHandler, true);
            });
            return btn;
        };

        // ── 齿轮设置面板：把原折叠里的全部参数收进去，点齿轮从「节点右侧」弹出 ──
        //  2026-11-15 用户先要左侧弹出，后（同轮）明确改要右侧（「往右放」）；
        //    左侧弹会把面板压在节点本体上、点控件时鼠标落到节点体触发外部点击关闭 ⇒ 闪一下无效。
        //    改右侧（preferLeft 去掉，xhPlaceBeside 默认走右边）⇒ 面板在齿轮右侧、不压节点、控件可正常操作。
        let _xhGrpSet = null;     // 当前面板 DOM
        let _xhGrpFollow = null;  // xhFollowAnchor 句柄
        let _xhGrpOpenAt = 0;     // 打开时间戳：防「打开瞬间被外部点击误关 ⇒ 闪一下」

        function _xhGrpOutside(e) {
            if (!_xhGrpSet) return;
            if (Date.now() - _xhGrpOpenAt < 250) return;   // 打开后 250ms 内忽略一切点击，杜绝秒关闪退
            if (_xhGrpSet.contains(e.target)) return;                       // 点在面板里
            if (e.target.closest && e.target.closest(".xh-grp-gear")) return; // 点齿轮（交给 toggle）
            if (_xhGrpSet._node && _xhGrpSet._node._colorDropEl
                && _xhGrpSet._node._colorDropEl.contains(e.target)) return;  // 点颜色下拉（它自己管）
            if (_xhGrpSet._node) _xhGrpSet._node._closeGearPanel();
        }

        nodeType.prototype._toggleGearPanel = function () {
            if (_xhGrpSet && _xhGrpSet._node === this) this._closeGearPanel();
            else this._openGearPanel();
        };

        nodeType.prototype._closeGearPanel = function () {
            if (_xhGrpFollow) { try { _xhGrpFollow.stop && _xhGrpFollow.stop(); } catch (e) {} _xhGrpFollow = null; }
            if (_xhGrpSet) { try { _xhGrpSet.remove(); } catch (e) {} _xhGrpSet = null; }
            document.removeEventListener("pointerdown", _xhGrpOutside, true);
        };

        nodeType.prototype._openGearPanel = function () {
            this._closeGearPanel();
            _xhGrpOpenAt = Date.now();   // 记时间戳，配合 _xhGrpOutside 的 250ms 免疫窗
            const node = this;
            const lang = getLang(node);
            const L = LABELS[lang];
            const P = node.properties = node.properties || {};
            const restriction = P.toggleRestriction || "default";
            const entries = node._collectGroups();
            const T = XH_TOKENS;

            const panel = document.createElement("div");
            panel.className = "xh-grp-set";
            panel._node = node;

            // 头部：齿轮图标 + 标题 + 关闭（家族「关闭」图标，不用 ✕ 字符）
            const top = document.createElement("div");
            top.className = "xh-grp-set-top";
            const gic = document.createElement("span");
            gic.innerHTML = XH_GEAR_SVG;
            const h3 = document.createElement("h3");
            h3.textContent = lang === "zh" ? "分组控制 · 设置" : "Group Control · Settings";
            const x = document.createElement("span");
            x.className = "x";
            x.innerHTML = xhIconHTML("关闭", { size: 12, color: "current" });
            x.addEventListener("click", (e) => { e.stopPropagation(); node._closeGearPanel(); });
            top.append(gic, h3, x);
            panel.appendChild(top);

            const body = document.createElement("div");
            body.className = "xh-grp-set-body";

            // 行工厂：左标签（标题 + 说明），右控件
            const row = (label, sub, ctrl) => {
                const r = document.createElement("div");
                r.className = "xh-grp-set-row";
                const lab = document.createElement("div");
                lab.className = "lab";
                const b = document.createElement("b"); b.textContent = label; lab.appendChild(b);
                if (sub) { const s = document.createElement("small"); s.textContent = sub; lab.appendChild(s); }
                r.appendChild(lab);
                if (ctrl) r.appendChild(ctrl);
                body.appendChild(r);
                return r;
            };

            //  2026-11-15：全关 / 全开已放回节点本体控件行（齿轮左侧），面板里不再重复一份。

            // 颜色筛选
            row(lang === "zh" ? "颜色筛选" : "Color filter",
                lang === "zh" ? "只显示某颜色的组" : "Show only groups of one color", node._makeColorFilterBtn());

            // 排序
            const sortSel = document.createElement("select");
            [["position", lang === "zh" ? "按位置" : "Position"], ["alphanumeric", lang === "zh" ? "按名称" : "Name"]].forEach(([v, t]) => {
                const o = document.createElement("option"); o.value = v; o.textContent = t; sortSel.appendChild(o);
            });
            sortSel.value = P.sort === "alphanumeric" ? "alphanumeric" : "position";
            sortSel.addEventListener("pointerdown", (e) => e.stopPropagation());
            sortSel.addEventListener("change", () => { P.sort = sortSel.value; node._sig = node._signature(); node._render(); });
            row(lang === "zh" ? "排序" : "Sort", "", sortSel);

            // 开关限制（单开 / 必留一个）
            const resSel = document.createElement("select");
            [["default", lang === "zh" ? "默认" : "Default"], ["max one", lang === "zh" ? "最多开一个" : "Max one"], ["always one", lang === "zh" ? "必须留一个" : "Always one"]].forEach(([v, t]) => {
                const o = document.createElement("option"); o.value = v; o.textContent = t; resSel.appendChild(o);
            });
            resSel.value = P.toggleRestriction || "default";
            resSel.addEventListener("pointerdown", (e) => e.stopPropagation());
            resSel.addEventListener("change", () => { P.toggleRestriction = resSel.value; node._sig = node._signature(); node._render(); });
            row(lang === "zh" ? "开关限制" : "Toggle limit",
                lang === "zh" ? "单开 / 必留一个" : "Max one / always one", resSel);

            // 筛选分组（按组名实时过滤）
            const search = document.createElement("input");
            search.type = "text";
            search.placeholder = lang === "en" ? "Filter groups…" : "筛选分组…";
            search.value = String(P.xhFilter || "");
            search.addEventListener("pointerdown", (e) => e.stopPropagation());
            search.addEventListener("input", () => { P.xhFilter = search.value; node._renderList(); });
            row(lang === "zh" ? "筛选分组" : "Filter",
                lang === "zh" ? "按组名实时过滤" : "Live filter by name", search);

            panel.appendChild(body);
            document.body.appendChild(panel);
            _xhGrpSet = panel;

            //  锚点优先用「节点根 DOM」(node.element)：它不随 _render 重建内部 DOM 而失效，
            //    且按节点右缘定位 ⇒ 面板天然落在节点右侧（满足「往右放」）。
            //    ⚠️ 不用 node._xhGrpGearBtn 当锚：_render 每次清空重建节点内部，旧齿轮按钮被摘出 DOM
            //      ⇒ 跟随器拿到 isConnected=false 的死锚点、外部点击监听也更易误判关闭（闪一下/无效）。
            //    异常帧保护在 xhFollowAnchor 内已做（锚点尺寸=0/坐标 NaN 时跳过本帧，绝不甩到顶部）。
            //  锚点钉在「真实可见卡片」(this._container) 右缘 ⇒ 面板 left = 卡片右缘 + gap，
            //    不再用 node.element（其 getBoundingClientRect().right 在 Vue 模式下偏内 ⇒ 面板压住节点 15~25px）。
            //    gap 拉到 14，确保面板与节点之间留清晰空隙、绝不重叠。
            const anchor = node._container || node.element || node._xhGrpGearBtn || node._domWidget || panel;
            const opt = { gap: 14 };
            const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
            xhPlaceBeside(panel, rect, opt);
            _xhGrpFollow = xhFollowAnchor(panel, anchor, opt);
            //  字体/图标可能晚于首帧渲染 ⇒ offsetWidth 初算偏小，等一帧用稳定尺寸再定位一次，避免被排到屏外。
            requestAnimationFrame(() => {
                if (_xhGrpSet !== panel) return;
                const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
                if (r) xhPlaceBeside(panel, r, opt);
            });
            xhMakeDraggable(panel, top, () => { try { _xhGrpFollow && _xhGrpFollow.markUserMoved && _xhGrpFollow.markUserMoved(); } catch (e) {} });

            setTimeout(() => document.addEventListener("pointerdown", _xhGrpOutside, true), 0);
        };

        // 只重画列表（筛选输入时调用，保住光标）
        nodeType.prototype._renderList = function () {
            const list = this._listEl;
            if (!list) return;
            const T = XH_TOKENS;
            const lang = getLang(this);
            const L = LABELS[lang];
            const P = this.properties || {};
            const restriction = P.toggleRestriction || "default";
            const allEntries = this._collectGroups();
            const total = this._collectGroups(true).length;
            const kw = String((this.properties || {}).xhFilter || "").trim().toLowerCase();
            const entries = kw
                ? allEntries.filter((g) => String(g.title || "").toLowerCase().includes(kw))
                : allEntries;

            list.innerHTML = "";

            //  （2026-11-15：常驻统计「检测到 N 个分组…」已按用户要求删除，节点列表区只保留组卡片。）

            if (entries.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = `padding:16px;text-align:center;color:${T.SUB};font-size:${T.FONT_MD}px;`;
                empty.textContent = L.noGroups;
                list.appendChild(empty);
                //  空状态也按真实内容高（齿轮行 + 提示），只给一个极小下限避免变成一条线；不再写死 150/88。
                this._applySize(GROUP_W, Math.max(this._measureH(), 56));
                app.graph.setDirtyCanvas(true, true);
                return;
            }

            entries.forEach((g) => {
                const title = g.title || "未命名组";
                const gc = groupColor(g);
                const nodes = groupNodes(g);
                const isOn = entryActive(g);
                const card = document.createElement("div");
                card.style.cssText = xhCardCss("padding:7px 11px;");
                if (!isOn) card.classList.add("xh-grp-card-off");  // 关闭的组：整张卡片（色块+组名+滑块+箭头）一起压暗

                // 组色方块：直接用 CSS 画实心圆角色块（绝对实，不依赖矢量图标填充）
                //  组开着就呼吸闪烁（.xh-grp-blink）
                if (gc && gc !== "#") {
                    const mark = document.createElement("span");
                    mark.className = "xh-grp-mark";
                    mark.style.cssText = `flex:none;width:18px;height:18px;border-radius:5px;background:${gc};`
                        + `box-shadow:0 0 0 1px rgba(0,0,0,.25) inset,0 0 4px rgba(255,255,255,.12);`;
                    mark.title = `${title}　组色`;
                    if (isOn) mark.classList.add("xh-grp-blink");
                    card.appendChild(mark);
                }

                const name = document.createElement("span");
                //  2026-11-08 修：去掉 overflow:hidden+ellipsis 截断 —— 节点放大时布局宽被锁在基准 270px，
                //    ellipsis 会按基准宽把长组名砍掉，放大只是把「砍过的名字」一起放大，名字拉不出来。
                //    改为正常换行 + min-width:0（flex 子项必须，否则不收缩不换行），名字完整显示、节点高度自适应。
                name.style.cssText = `flex:1;min-width:0;font-size:16px;font-weight:800;color:${T.TEXT};line-height:1.3;letter-spacing:.3px;white-space:normal;word-break:break-word;overflow:visible;`;
                //  组身份靠「组色细条 + N 节点 + 证据行」表明（组名可任意改，不会被误认成节点）；不再叠组图标。
                const sc = scopeOf(g);
                const scopeTip = sc.isSub
                    ? (lang === "en" ? `${L.subGroup}${sc.name || L.unnamedSub}`
                        : `子图「${sc.name || L.unnamedSub}」${L.subGroup}`)
                    : L.rootGroup;

                name.textContent = title;
                name.title = (lang === "en" ? "Group: " : "组：") + title + (scopeTip ? " · " + scopeTip : "");
                card.appendChild(name);

                // 导航按钮 - 开关左边
                const navBtn = document.createElement("button");
                //  定位按钮：家族实心有力箭头 arrow-big-right（用户点名原 arrow-right 太飘），
                //    品牌金色，点击行为不变（centerOnNode 跳到该分组）。
                //  ⛔ 别再写死 SVG / emoji / 路径；换图案只改语义表或直接传 Lucide 名，调用处一行不动。
                navBtn.innerHTML = xhIconHTML("arrow-big-right", { size: 15, color: "brand" });
                navBtn.title = lang === "en" ? "Center on this group" : "定位到该分组";
                paintBarBtn(navBtn, "neutral");   // 定位按钮：中性档
                navBtn.style.cssText = navBtn.style.cssText
                    + `width:${T.BTN_H}px;height:${T.BTN_H}px;font-size:${T.FONT_MD}px;cursor:pointer;margin-left:0;transition:all ${T.DUR}ms;`
                    + "display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;";
                navBtn.onmouseover = () => navBtn.style.filter = "brightness(1.28)";
                navBtn.onmouseout = () => navBtn.style.filter = "none";
                navBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (nodes.length > 0 && app.canvas && typeof app.canvas.centerOnNode === "function") {
                        app.canvas.centerOnNode(nodes[0]);
                    }
                };
                card.appendChild(navBtn);

                // 开关：官方 ComfyUI 原生滑动块（track + 滑动白点），家族眼睛图标整段取消。
                //  用户 2026-11-15 点名：「眼睛图案取消，换成 ComfyUI 官方那个普通滑块开关」。
                //  轨道关=中性灰、开=家族主题主色(var(--xh-primary)，随预设切换)；白点左/右滑动表开关。
                //  2026-11-17：原来是官方 var(--primary,#4a90e2) 不跟家族主题，已改为主题色。
                const toggle = document.createElement("div");
                toggle.style.cssText = `position:relative;flex:none;width:54px;height:26px;border-radius:13px;`
                    + `cursor:pointer;transition:background ${T.DUR}ms ease;`
                    + `background:${isOn ? "var(--xh-primary,#E8A33C)" : "rgba(255,255,255,0.14)"};`;
                toggle.title = isOn ? L.on : L.off;
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    this._xhFlashTitle = title;
                    this._toggleEntry(g);
                };
                const knob = document.createElement("span");
                knob.style.cssText = `position:absolute;top:4px;left:4px;width:18px;height:18px;border-radius:50%;`
                    + `background:#fff;transition:transform ${T.DUR}ms ease;`
                    + (isOn ? "transform:translateX(32px);" : "");
                toggle.appendChild(knob);
                card.appendChild(toggle);

                // 点整行即切换（0 步操作）；导航钮 / 开关自己 stopPropagation，不会双触发
                card.onclick = () => { this._xhFlashTitle = title; this._toggleEntry(g); };
                // 家族黄只在「刚点过这一行」出现一下，700ms 后退回常态（呼应顶栏狗爪规矩）
                const isFlash = this._xhFlashTitle === title;
                if (isFlash) {
                    card.style.borderColor = T.ACCENT;
                    setTimeout(() => { if (card.isConnected) card.style.borderColor = T.BORDER; }, 700);
                    this._xhFlashTitle = null;
                }
                card.onmouseover = () => { if (!isFlash) card.style.borderColor = T.ACCENT; };
                card.onmouseout = () => { if (!isFlash) card.style.borderColor = T.BORDER; };

                list.appendChild(card);
            });

            //  2026-11-08 修：高度直接用真实内容高（c.scrollHeight，layout px，已含换行后的组名），
            //   不再用 headH + 行数*42 的死公式 —— 否则长组名换行后会被节点底边裁掉。
            //  2026-11-13 修原有 bug：这里以前直接用了 `_render()` 里的局部变量 c，
            //    在 _renderList 作用域里根本不存在 ⇒ 每次渲染末尾抛 ReferenceError，
            //    _render 被拦腰截断，容器只剩一个空 div（真机实测）。改读实例上的容器。
            const contentH = this._measureH() || list.scrollHeight || 56;
            this._entryCount = entries.length;   // 缓存组数
            this._applySize(GROUP_W, contentH);
            app.graph.setDirtyCanvas(true, true);
            this._ready = true;
        };
    },

    //  2026-11-13：整图读档完成后的最后一道兜底。前面 onNodeCreated / onConfigure
    //    各自有延时补渲染，但 ComfyUI 有时会在 configure 之后再把节点重建一次；
    //    这里只扫「还没渲染成功」的分组控制节点，幂等、不打断用户正在操作的节点。
    afterConfigureGraph() {
        setTimeout(() => {
            try {
                const ns = app.graph ? (app.graph.nodes || app.graph._nodes || []) : [];
                for (const n of ns) {
                    if (!n || n.type !== NODE_TYPE) continue;
                    if (n._ready || !n._container || typeof n._render !== "function") continue;
                    try { n._render(); } catch (e) { /* 交给下一次刷新 */ }
                }
            } catch (e) { /* 图尚未 ready，忽略 */ }
        }, 320);
    },
});
