// XiaoHei 分组控制器 - Nodes 2.0 兼容（2026-09-29 升级版）
// 对齐 rgthree Fast Groups Bypasser 的三条能力：颜色/标题过滤、单开限制、自动刷新。
// 组内节点判定沿用中心点法（与 rgthree fast_groups_service 一致）。
const { app } = window.comfyAPI.app;
import { onLangEvent, ensureLangBridge, paintBarBtn } from "./xh_ui_kit.js";

// ── 设置面板样式（齿轮弹出浮层，仿 XiaoHei-LoRA堆栈 .xh-pll-set；class 名独立避免冲突）──
let _xhGrpStyleInjected = false;
function injectGroupStyle() {
    if (_xhGrpStyleInjected) return;
    _xhGrpStyleInjected = true;
    const css =
        ".xh-grp-gear{flex:0 0 auto;width:30px;height:26px;display:flex;align-items:center;justify-content:center;"
        + "background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);border-radius:5px;"
        + "cursor:pointer;user-select:none;color:#bbb;}"
        + ".xh-grp-gear svg{width:16px;height:16px;display:block;}"
        + ".xh-grp-gear:hover{border-color:var(--xh-acc,#E8A33C);color:var(--xh-acc,#E8A33C);}"
        + ".xh-grp-set{position:fixed;z-index:10026;width:320px;max-width:94vw;background:#2b2b2b;"
        + "border:1px solid #E8A33C;border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.6);"
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
        + ".xh-grp-set-row select:focus,.xh-grp-set-row input:focus{outline:none;border-color:#E8A33C;}"
        + ".xh-grp-set-done{margin:4px 13px 13px;}"
        + ".xh-grp-set-done button{width:100%;height:30px;border:0;border-radius:6px;background:#E8A33C;color:#1c1c1c;font:600 12px 'Segoe UI';cursor:pointer;}"
        + ".xh-grp-set-done button:hover{filter:brightness(1.08);}";
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
const GROUP_W = 270;
const GROUP_MIN_W = 250;

// 中英文标签
const LABELS = {
    zh: { title: "分组控制", refresh: " 刷新", disableAll: " 全关", enableAll: " 全开", noGroups: "没有找到组，请先 Ctrl+G 创建组", on: "开", off: "关", blocked: "「只保留一个」限制下不能关掉最后一个",
        gearExpand: "展开控制区（刷新 / 筛选）",
        gearCollapse: "收起控制区，只留组列表",
        slots: { opt: "信号输入", OPT_CONNECTION: "控制信号" } },
    en: { title: "Group Control", refresh: " Refresh", disableAll: " All Off", enableAll: " All On", noGroups: "No groups found. Create one with Ctrl+G first", on: "ON", off: "OFF", blocked: "『always one』restriction: cannot turn off the last one",
        gearExpand: "Expand controls (refresh / filter)",
        gearCollapse: "Collapse controls, keep group list",
        slots: { opt: "signal", OPT_CONNECTION: "control" } },
};

// 输入 / 输出端口名本地化：只改 label，绝不改 name（后端按 name 找端口）。
// Nodes 2.0 端口标签走快照渲染，改完必须显式触发重建（官方 Subgraph 改名同机制）。
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

function groupNodes(g) {
    const b = g._bounding || g.bounding;
    const nodes = [];
    if (!b) return nodes;
    const graph = app.graph;
    graph.nodes.forEach((n) => {
        if (n.type === NODE_TYPE) return;
        const cx = n.pos[0] + (n.size[0] || 200) * 0.5;
        const cy = n.pos[1] + (n.size[1] || 100) * 0.5;
        if (cx >= b[0] && cx < b[0] + b[2] && cy >= b[1] && cy < b[1] + b[3]) nodes.push(n);
    });
    return nodes;
}

function entryActive(g) {
    return groupNodes(g).some((n) => n.mode === MODE_ON);
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
            //  捕获 ComfyUI 反序列化进来的尺寸（用户此前保存的手动尺寸），先于下面覆盖
            const _loadedSize = (this.size && this.size.length === 2 && this.size[0] > 0) ? [this.size[0], this.size[1]] : null;
            this.size = [GROUP_W, 200];
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
                self0._userSize = [size[0], size[1]];
                self0._manualSized = true;
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
            container.style.cssText = `position:relative;width:100%;box-sizing:border-box;font-size:13px;color:#e0e0e0;`;
            this._container = container;

            try {
                this.addDOMWidget("groups", "custom", container, { serialize: false, hideOnZoom: false, minWidth: GROUP_MIN_W, minHeight: 150 });
            } catch (e) {}

            injectGroupStyle();

            setTimeout(() => this._render(), 300);

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

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (this._timer) clearInterval(this._timer);
            this._timer = null;
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
            gs.push(...(graph._groups || graph.groups || []));
            try {
                const subs = graph.subgraphs?.values?.();
                if (subs) {
                    let s;
                    while ((s = subs.next().value)) gs.push(...(s.groups || []));
                }
            } catch (e) {}

            // 颜色过滤（逗号分隔，支持 ComfyUI 色名与 hex）
            const filterColors = String(P.matchColors || "").split(",").map((c) => fullColor(c)).filter((c) => c && c !== "#");
            // 标题过滤（字符串或正则）
            const mt = String(P.matchTitle || "").trim();
            let titleRe = null;
            if (mt) {
                try { titleRe = new RegExp(mt, "i"); } catch (e) { titleRe = null; }
            }
            let entries = gs.filter((g) => {
                const b = g._bounding || g.bounding;
                if (!b || b[2] <= 0 || b[3] <= 0) return false;
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

        //  手动尺寸保护：所有写 this.size 的出口统一走这里；手动过则保留用户宽、
        //   高度取「用户值」与「内容需要」的较大者（保证内容绝不会被裁切）。无缩放因子（已恢复原样）。
        nodeType.prototype._applySize = function (w, h) {
            if (this._manualSized && this._userSize) {
                this.size = [this._userSize[0], Math.max(this._userSize[1], h)];
            } else {
                this.size = [w, h];
            }
        };

        nodeType.prototype._render = function () {
            const c = this._container;
            if (!c) return;
            const lang = getLang(this);
            const L = LABELS[lang];
            applyPortLabels(this, lang); // 端口名跟着语言走（只改 label）
            c.innerHTML = "";

            // 标题栏 = 标准工具条：▼（节点折叠）最左 → 家族工具条（中/EN/）→  设置（最右）
            const cb = document.createElement("button");
            cb.textContent = this._collapsed ? "▶" : "▼";
            paintBarBtn(cb, "neutral");   // 折叠是常规操作不是主操作 → 中性暗底
            cb.style.cssText = cb.style.cssText
                + "flex:0 0 auto;cursor:pointer;font-size:14px;padding:0 6px;line-height:18px;transition:all 0.2s;";
            cb.onclick = () => { this._collapsed = !this._collapsed; this._render(); };
            cb.onmouseover = () => cb.style.filter = "brightness(1.2)";
            cb.onmouseout = () => cb.style.filter = "none";

            // 工具条：▼ 常驻；▼ 收起时只剩 ▼，展开时并排 全关 / 全开 / 颜色筛选 / 排序 / 限制。
            // （2026-11-09 改：去掉齿轮，颜色筛选+排序从齿轮面板拿出来直接放工具条；主题按钮按用户要求去掉）
            const tb = document.createElement("div");
            tb.style.cssText = "display:flex;align-items:center;gap:6px;border-bottom:1px solid #333;padding-right:6px;flex-wrap:wrap;";
            tb.appendChild(cb);   // ▼ 常驻（点了切换下面那排的显隐）
            if (!this._collapsed) {
                const P = this.properties || {};
                const restriction = P.toggleRestriction || "default";
                const entries = this._collectGroups();
                const mkBtn = (text, fn) => {
                    const b = document.createElement("button");
                    b.textContent = text;
                    paintBarBtn(b, "primary");
                    b.style.cssText = b.style.cssText
                        + "padding:4px 10px;cursor:pointer;transition:all 0.15s;font-size:13px;";
                    b.onmouseover = () => b.style.filter = "brightness(1.2)";
                    b.onmouseout = () => b.style.filter = "none";
                    b.onclick = (e) => { e.stopPropagation(); b.style.transform = "scale(0.9)"; setTimeout(() => { b.style.transform = ""; fn(); }, 80); };
                    return b;
                };
                // 全部禁用：always one 时保留第一组开着
                tb.appendChild(mkBtn(L.disableAll, () => {
                    entries.forEach((g, i) => {
                        const on = restriction === "always one" && i === 0;
                        groupNodes(g).forEach((n) => (n.mode = on ? MODE_ON : MODE_OFF));
                    });
                    app.graph.setDirtyCanvas(true, true);
                    this._render();
                }));
                // 全部启用：单开限制下只开第一组
                tb.appendChild(mkBtn(L.enableAll, () => {
                    entries.forEach((g, i) => {
                        const on = restriction.includes(" one") ? i === 0 : true;
                        groupNodes(g).forEach((n) => (n.mode = on ? MODE_ON : MODE_OFF));
                    });
                    app.graph.setDirtyCanvas(true, true);
                    this._render();
                }));
                // 颜色筛选（真正生效：下拉选色 → 写 matchColors → 实时过滤组列表）
                tb.appendChild(this._makeColorFilterBtn());
                // 排序
                const sortSel = document.createElement("select");
                [["position", lang === "zh" ? "按位置" : "Position"], ["alphanumeric", lang === "zh" ? "按名称" : "Name"]].forEach(([v, t]) => {
                    const o = document.createElement("option"); o.value = v; o.textContent = t; sortSel.appendChild(o);
                });
                sortSel.value = P.sort === "alphanumeric" ? "alphanumeric" : "position";
                sortSel.style.cssText = "flex:none;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#e0e0e0;font:12px system-ui;padding:3px 6px;cursor:pointer;";
                sortSel.addEventListener("pointerdown", (e) => e.stopPropagation());
                sortSel.addEventListener("change", () => { P.sort = sortSel.value; this._sig = this._signature(); this._render(); });
                tb.appendChild(sortSel);
                // 开关限制（单开 / 必留一个）
                const resSel = document.createElement("select");
                [["default", lang === "zh" ? "默认" : "Default"], ["max one", lang === "zh" ? "最多开一个" : "Max one"], ["always one", lang === "zh" ? "必须留一个" : "Always one"]].forEach(([v, t]) => {
                    const o = document.createElement("option"); o.value = v; o.textContent = t; resSel.appendChild(o);
                });
                resSel.value = P.toggleRestriction || "default";
                resSel.style.cssText = "flex:none;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#e0e0e0;font:12px system-ui;padding:3px 6px;cursor:pointer;";
                resSel.addEventListener("pointerdown", (e) => e.stopPropagation());
                resSel.addEventListener("change", () => { P.toggleRestriction = resSel.value; this._sig = this._signature(); this._render(); });
                tb.appendChild(resSel);
            }
            c.appendChild(tb);

            // （筛选行已移除：颜色/标题筛选移入齿轮设置面板、排序已在面板，计数徽章随之删除）

            // 提示条
            if (this._toast) {
                const toast = document.createElement("div");
                toast.style.cssText = `padding:4px 10px;font-size:11px;color:#ffd0d0;background:rgba(192,57,43,0.25);`;
                toast.textContent = this._toast.msg;
                c.appendChild(toast);
            }

            const list = document.createElement("div");
            list.style.cssText = `padding:6px 8px;`;
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
            const lang = getLang(node);
            const P = node.properties = node.properties || {};
            const btn = document.createElement("button");
            btn.type = "button";
            btn.style.cssText = "display:flex;align-items:center;gap:6px;flex:none;max-width:150px;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#e0e0e0;font:12px system-ui;padding:4px 8px;cursor:pointer;";
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
                    d.style.cssText = "display:none;position:fixed;z-index:10030;background:#1c1c1c;border:1px solid #444;border-radius:6px;padding:4px;max-height:200px;overflow-y:auto;min-width:160px;box-shadow:0 6px 18px rgba(0,0,0,.6);";
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
                    it.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:12px;color:#e0e0e0;";
                    const isw = document.createElement("span"); isw.style.cssText = "width:13px;height:13px;border-radius:3px;flex:none;background:" + hex + ";border:1px solid rgba(255,255,255,0.4);";
                    const itx = document.createElement("span"); itx.textContent = label;
                    it.appendChild(isw); it.appendChild(itx);
                    it.onmouseenter = () => it.style.background = "#2a2a2a";
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

        // 只重画列表（筛选输入时调用，保住光标）
        nodeType.prototype._renderList = function () {
            const list = this._listEl;
            if (!list) return;
            const lang = getLang(this);
            const L = LABELS[lang];
            const P = this.properties || {};
            const restriction = P.toggleRestriction || "default";
            const entries = this._collectGroups();
            const total = this._collectGroups(true).length;

            list.innerHTML = "";
            if (entries.length === 0) {
                list.innerHTML = `<div style="padding:20px;text-align:center;color:#888;">${L.noGroups}</div>`;
                this._applySize(GROUP_W, this._ctrlCollapsed ? 88 : 130);
                app.graph.setDirtyCanvas(true, true);
                return;
            }

            entries.forEach((g) => {
                const title = g.title || "未命名组";
                const gc = groupColor(g);
                const isOn = entryActive(g);
                const card = document.createElement("div");
                card.style.cssText = `display:flex;align-items:flex-start;padding:5px 8px;margin:4px 0;border:2px solid #444;border-radius:4px;background:rgba(255,255,255,0.03);transition:border-color 0.2s;`;

                // 颜色小方块（2026-10-26 用户要求：圆点 → 方块，与筛选按钮上的色块同款）
                //   样式对齐 mkSwatchEl：13px + 3px 圆角 + 1px 亮白边 + 外侧 1px 暗描边，
                //   深色组色（黑/棕）靠亮边分界，在 #444 卡片上也分得清。
                if (gc && gc !== "#") {
                    const dot = document.createElement("span");
                    dot.style.cssText = `width:13px;height:13px;border-radius:3px;flex:none;margin-right:7px;`
                        + `background:${gc};border:1px solid rgba(255,255,255,0.45);`
                        + `box-shadow:0 0 0 1px rgba(0,0,0,0.5);`;
                    dot.title = `${title}　组色`;
                    card.appendChild(dot);
                }

                const name = document.createElement("span");
                //  2026-11-08 修：去掉 overflow:hidden+ellipsis 截断 —— 节点放大时布局宽被锁在基准 270px，
                //    ellipsis 会按基准宽把长组名砍掉，放大只是把「砍过的名字」一起放大，名字拉不出来。
                //    改为正常换行 + min-width:0（flex 子项必须，否则不收缩不换行），名字完整显示、节点高度自适应。
                name.style.cssText = `flex:1;min-width:0;font-weight:bold;font-size:12px;line-height:1.25;white-space:normal;word-break:break-word;overflow:visible;`;
                name.textContent = title;
                name.title = title;
                card.appendChild(name);

                // 导航按钮 - 开关左边
                const nodes = groupNodes(g);
                const navBtn = document.createElement("button");
                navBtn.textContent = "";
                paintBarBtn(navBtn, "neutral");   // 定位按钮：中性档
                navBtn.style.cssText = navBtn.style.cssText
                    + "width:24px;height:24px;font-size:13px;cursor:pointer;margin-left:8px;transition:all 0.15s;";
                navBtn.onmouseover = () => navBtn.style.filter = "brightness(1.28)";
                navBtn.onmouseout = () => navBtn.style.filter = "none";
                navBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (nodes.length > 0 && app.canvas && typeof app.canvas.centerOnNode === "function") {
                        app.canvas.centerOnNode(nodes[0]);
                    }
                };
                card.appendChild(navBtn);

                // 开关
                const toggle = document.createElement("div");
                toggle.style.cssText = `display:flex;align-items:center;gap:2px;margin-left:8px;padding:2px 4px;border-radius:4px;cursor:pointer;position:relative;width:50px;height:22px;font-size:11px;font-weight:bold;transition:background 0.2s,transform 0.15s;background:${isOn ? "#2d7d2d" : "#c0392b"};color:${isOn ? "#fff" : "#ffd0d0"};`;
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    toggle.style.transform = "scale(0.9)";
                    setTimeout(() => { toggle.style.transform = ""; this._toggleEntry(g); }, 80);
                };
                const lbl = document.createElement("span");
                lbl.style.cssText = `position:absolute;top:3px;font-size:11px;font-weight:bold;`;
                lbl.textContent = isOn ? L.on : L.off;
                toggle.appendChild(lbl);
                card.appendChild(toggle);

                // 2026-10-20：#8a8a8a 是上轮清掉的旧色，此处统一到家族 #8a8a8a
                card.onmouseover = () => card.style.borderColor = "#8a8a8a";
                card.onmouseout = () => card.style.borderColor = "#444";

                list.appendChild(card);
            });

            //  2026-11-08 修：高度直接用真实内容高（c.scrollHeight，layout px，已含换行后的组名），
            //   不再用 headH + 行数*42 的死公式 —— 否则长组名换行后会被节点底边裁掉。
            const contentH = c.scrollHeight || 0;
            this._entryCount = entries.length;   // 缓存组数，供拖拽时 _syncHeight 实时校正框高
            this._applySize(GROUP_W, contentH);
            app.graph.setDirtyCanvas(true, true);
            this._ready = true;
        };

    },
});
