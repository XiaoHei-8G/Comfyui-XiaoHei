// XiaoHei-滑块 前端 —— Nodes 2.0 原生 DOM UI（替代 mxToolkit mxSlider 的 canvas 手绘方案）
// 设计铁律（全部源自 frontend_n2.md + XH_LoraStack 已验证的坑）：
// 1. UI 全部走 addDOMWidget，绝不 onDrawForeground 手画
// 2. 数据唯一载体是后端声明的标准 STRING widget（slider_json），存档/执行走官方链路
// 3. 绝不增删/重排 node.widgets
//
//  2026-10-20：滑块本体（CSS + DOM + 数值同步）已抽到 **xh_ui_kit.js 的 makeXHSlider()**，
//   家族共用同一份实现（悬浮窗的"不透明度"也用它）。
//   本文件只保留本节点特有逻辑： 范围设置行 / 输出类型跟随 decimals / slider_json 存档。
//   ⇒ 以后要改滑块样式，**只改 kit 一处**，所有节点一起变。
const { app } = window.comfyAPI.app;

import {
    onLangEvent, ensureLangBridge, makeXHToolbar, releaseButtons, makeXHSlider,
    XH_GEAR_SVG, xhIconHTML, xhPlaceBeside, xhFollowAnchor, xhMakeDraggable,
} from "./xh_ui_kit.js";
import { getLinkById as xhGetLinkById } from "./xh_compat.js";

ensureLangBridge();
const NODE_TYPE = "XHSlider";
const LANG_KEY = "xh_node_lang"; // 家族统一键，与 XH_Toolbox / H3MemorySaver 等共享
const DEFAULT_CFG = { value: 20, min: 0, max: 100, step: 1, decimals: 0 };

// ── 设置面板（点齿轮弹出，2026-11-16）──────────────────────────────────────
//  样式 1:1 照抄家族「点齿轮蹦出来的面板」：XiaoHei-分组控制 .xh-grp-set /
//  XiaoHei-LoRA堆栈 .xh-pll-set（深色底 + 品牌橙边 + 齿轮标题头 + 行式设置 + 完成）。
//  定位 / 跟随 / 拖拽复用 kit 的 xhPlaceBeside / xhFollowAnchor / xhMakeDraggable。
//  ⛔ 只做 UI：数据仍写唯一的 STRING widget slider_json，widgets_values 下标不动。
const SL_SET_CSS_ID = "xh-sl-set-css";
let _slCssInjected = false;
function injectSliderSettingsCss() {
    if (_slCssInjected && document.getElementById(SL_SET_CSS_ID)) return;
    _slCssInjected = true;
    const css = [
        // 齿轮：与 .xh-grp-gear 同款（20×20 透明、半透明常态、悬停品牌色）。
        // 选择器比 kit 的 .xh-sl-toolbar button 更具体，避免被它的 padding/border 盖掉。
        ".xh-sl-toolbar button.xh-sl-gear{flex:0 0 auto;width:20px;height:20px;padding:0;margin-left:auto;",
        "border:0;border-radius:5px;background:transparent;color:#cfcfcf;opacity:.45;",
        "display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;",
        "transition:opacity .15s,color .15s,filter .15s;}",
        ".xh-sl-toolbar button.xh-sl-gear svg{width:15px;height:15px;display:block;}",
        ".xh-sl-toolbar button.xh-sl-gear:hover{opacity:1;color:var(--xh-primary,#E8A33C);",
        "background:transparent;filter:brightness(1.1);}",
        ".xh-sl-set{position:fixed;z-index:10026;width:320px;max-width:94vw;background:#2b2b2b;",
        "border:1px solid var(--xh-primary,#E8A33C);border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.6);",
        "color:#ddd;font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);font-size:12px;}",
        ".xh-sl-set-top{display:flex;align-items:center;gap:8px;padding:11px 13px;",
        "border-bottom:1px solid #1c1c1c;cursor:grab;user-select:none;}",
        ".xh-sl-set-top svg{width:15px;height:15px;color:#bbb;flex:none;}",
        ".xh-sl-set-top h3{margin:0;font-size:13px;font-weight:600;flex:1;min-width:0;}",
        ".xh-sl-set-top .x{margin-left:auto;color:#8a8a8a;cursor:pointer;font-size:14px;line-height:1;",
        "display:inline-flex;align-items:center;}",
        ".xh-sl-set-top .x:hover{color:#fff;}",
        ".xh-sl-set-body{padding:6px 13px 10px;max-height:62vh;overflow-y:auto;}",
        ".xh-sl-set-body::-webkit-scrollbar{width:7px;}",
        ".xh-sl-set-body::-webkit-scrollbar-thumb{background:#555;border-radius:3px;}",
        ".xh-sl-set-row{display:flex;align-items:center;gap:10px;padding:8px 0;",
        "border-bottom:1px solid #212121;}",
        ".xh-sl-set-row:last-of-type{border-bottom:0;}",
        ".xh-sl-set-row .lab{flex:1;min-width:0;}",
        ".xh-sl-set-row .lab b{display:block;",
        "font:600 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);color:#e2e2e2;}",
        ".xh-sl-set-row .lab small{display:block;color:#888;font-size:10.5px;line-height:1.4;margin-top:1px;}",
        ".xh-sl-set-row input[type=number]{background:#161616;border:1px solid #3a3a3a;border-radius:5px;",
        "color:#fff;font:11px var(--font-sans, ui-sans-serif, system-ui, sans-serif);",
        "padding:4px 7px;width:80px;box-sizing:border-box;text-align:right;}",
        ".xh-sl-set-row input:focus{outline:none;border-color:var(--xh-primary,#E8A33C);}",
        ".xh-sl-set-done{margin:4px 13px 13px;}",
        ".xh-sl-set-done button{width:100%;height:30px;border:0;border-radius:6px;background:var(--xh-primary,#E8A33C);",
        "color:#1c1c1c;font:600 12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);cursor:pointer;}",
        ".xh-sl-set-done button:hover{filter:brightness(1.08);}",
    ].join("");
    let s = document.getElementById(SL_SET_CSS_ID);
    if (!s) { s = document.createElement("style"); s.id = SL_SET_CSS_ID; document.head.appendChild(s); }
    s.textContent = css;
}

let _slPanel = null, _slFollow = null, _slCtx = null, _slOpenAt = 0;
function onSliderOutside(e) {
    if (!_slPanel) return;
    if (Date.now() - _slOpenAt < 250) return;      // 打开瞬间免疫，杜绝「点一下秒关」
    if (_slPanel.contains(e.target)) return;
    if (e.target.closest?.("[data-xh-slider-gear]")) return;  // 齿轮自己管开合
    closeSliderSettings();
}
function onSliderEsc(e) {
    if (e.key === "Escape" && _slPanel) { e.stopPropagation(); closeSliderSettings(); }
}
function closeSliderSettings() {
    if (_slFollow) { try { _slFollow.stop(); } catch (e) {} _slFollow = null; }
    if (_slPanel) { try { _slPanel.remove(); } catch (e) {} _slPanel = null; }
    if (_slCtx) _slCtx.panelInputs = null;
    _slCtx = null;
    document.removeEventListener("pointerdown", onSliderOutside, true);
    document.removeEventListener("keydown", onSliderEsc, true);
}
function closeSliderSettingsFor(ctx) { if (ctx && _slCtx === ctx) closeSliderSettings(); }
function isSliderSettingsOpenFor(ctx) { return !!_slPanel && _slCtx === ctx; }
function toggleSliderSettings(ctx) {
    if (isSliderSettingsOpenFor(ctx)) closeSliderSettings();
    else openSliderSettings(ctx);
}
function openSliderSettings(ctx) {
    closeSliderSettings();
    injectSliderSettingsCss();
    const zh = ctx.lang === "zh";
    const node = ctx.node;
    const panel = document.createElement("div");
    panel.className = "xh-sl-set";
    _slCtx = ctx;
    _slPanel = panel;
    _slOpenAt = Date.now();

    // 头部：家族实心齿轮 + 标题 + 家族「关闭」图标（⛔ 不写 ✕ 字符）
    const top = document.createElement("div");
    top.className = "xh-sl-set-top";
    const gic = document.createElement("span");
    gic.innerHTML = XH_GEAR_SVG;
    const h3 = document.createElement("h3");
    h3.textContent = zh ? "滑块 · 设置" : "Slider · Settings";
    const x = document.createElement("span");
    x.className = "x";
    x.title = zh ? "关闭" : "Close";
    x.innerHTML = xhIconHTML("关闭", { size: 12, color: "current" });
    x.addEventListener("click", (e) => { e.stopPropagation(); closeSliderSettings(); });
    top.append(gic, h3, x);
    panel.appendChild(top);

    // 四个范围参数：与原来内联的 4 个输入框一一对应，改动仍走 ctx.sync()
    const body = document.createElement("div");
    body.className = "xh-sl-set-body";
    const inputs = {};
    const row = (key, label, sub, min, max, step) => {
        const r = document.createElement("div");
        r.className = "xh-sl-set-row";
        const lab = document.createElement("div");
        lab.className = "lab";
        const b = document.createElement("b"); b.textContent = label;
        const small = document.createElement("small"); small.textContent = sub;
        lab.append(b, small);
        const inp = document.createElement("input");
        inp.type = "number";
        if (min != null) inp.min = String(min);
        if (max != null) inp.max = String(max);
        inp.step = String(step == null ? 1 : step);
        inp.value = String(ctx.cfg[key]);
        inp.addEventListener("pointerdown", (e) => e.stopPropagation());
        inp.addEventListener("change", () => {
            let v = parseFloat(inp.value);
            if (!isFinite(v)) v = ctx.cfg[key];
            ctx.cfg[key] = v;
            ctx.sync();                    // normalize + 写回 slider_json
        });
        inputs[key] = inp;
        r.append(lab, inp);
        body.appendChild(r);
    };
    row("min", zh ? "最小" : "Min", zh ? "滑块左端数值" : "Left end of the range", null, null, 1);
    row("max", zh ? "最大" : "Max", zh ? "滑块右端数值" : "Right end of the range", null, null, 1);
    row("step", zh ? "步进" : "Step", zh ? "拖一下跳多少" : "How far one drag moves", 0.0001, null, 0.01);
    row("decimals", zh ? "小数位" : "Decimals", zh ? "0 输出整数，大于 0 输出浮点" : "0 = INT, above 0 = FLOAT", 0, 4, 1);
    panel.appendChild(body);
    ctx.panelInputs = inputs;              // refreshUI 用它把 normalize 后的值回填

    const done = document.createElement("div");
    done.className = "xh-sl-set-done";
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = zh ? "完成" : "Done";
    doneBtn.addEventListener("click", (e) => { e.stopPropagation(); closeSliderSettings(); });
    done.appendChild(doneBtn);
    panel.appendChild(done);

    document.body.appendChild(panel);
    //  锚点优先用节点根 DOM（不随内部重绘失效），面板天然落在节点右侧；
    //  齿轮按钮只在极端兜底时用（它可能被重绘摘出 DOM）。
    const anchor = node?._container || node?.element || ctx.gear || panel;
    const opt = { gap: 14 };
    const rect = anchor?.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    xhPlaceBeside(panel, rect, opt);
    _slFollow = xhFollowAnchor(panel, anchor, opt);
    xhMakeDraggable(panel, top, () => { try { _slFollow?.markUserMoved(); } catch (e) {} });
    requestAnimationFrame(() => {
        if (_slPanel !== panel) return;
        const r = anchor?.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        if (r) xhPlaceBeside(panel, r, opt);   // 字体/图标晚于首帧 ⇒ 用稳定尺寸再定位一次
    });
    setTimeout(() => {
        if (_slPanel !== panel) return;
        document.addEventListener("pointerdown", onSliderOutside, true);
        document.addEventListener("keydown", onSliderEsc, true);
    }, 0);
}

// ---- 与 XiaoHei 家族的语言状态桥接 ----
// 家族包（XH_Toolbox / H3MemorySaver …）用全局变量 window.XH_LANG 存语言态。
// 这里把它包成 getter/setter：家族那边一改，我们这边立刻收到通知刷新 UI（双向联动）。

function getLang() {
    try { return (window.XH_LANG === "en" || localStorage.getItem(LANG_KEY) === "en") ? "en" : "zh"; } catch (e) { return "zh"; }
}
function setLang(l) {
    window.XH_LANG = l; // 走 setter：写 localStorage + 通知全家族（含本包所有实例）
}

// ---- 节点配色（与 XH_LoraStack 同一套：去官方重复色，12 色高辨识度 + 自定义取色器）----

// ---- 样式（一次注入）----

function normalize(c) {
    const num = (v, d) => {
        const n = Number(v);
        return (typeof n === "number" && isFinite(n)) ? n : d;
    };
    c.min = num(c.min, 0);
    c.max = num(c.max, 100);
    if (c.min > c.max) { const t = c.min; c.min = c.max; c.max = t; }
    if (c.min === c.max) c.max = c.min + 1;
    c.step = Math.max(num(c.step, 1), 0.0001);
    c.decimals = Math.min(4, Math.max(0, Math.floor(num(c.decimals, 0))));
    c.value = num(c.value, c.min);
    if (c.value < c.min) c.value = c.min;
    if (c.value > c.max) c.value = c.max;
    const p = Math.pow(10, c.decimals);
    c.value = Math.round(c.value * p) / p;
    return c;
}

function buildUI(node) {
    // 齿轮皮肤必须在建 UI 时就注入：kit 的 .xh-sl-toolbar button 会给按钮加深底和边框，
    // 等第一次点开面板再注入就来不及了（用户第一眼看到的是方块而不是透明小齿轮）。
    injectSliderSettingsCss();
    const ctx = {
        lang: getLang(),
        cfg: { ...DEFAULT_CFG },
        jsonWidget: null,
    };

    // 主行：滑块 + 数值框 ——  家族统一实现（xh_ui_kit.makeXHSlider），本文件不再私有一份
    const sl = makeXHSlider({
        min: 0, max: 100, step: 1, value: DEFAULT_CFG.value, decimals: 0,
        onInput: (v) => { ctx.cfg.value = v; ctx.sync(); },
    });
    const range = sl.range;
    const numBox = sl.numBox;
    const root = sl.root;

    // 工具条：右侧一颗家族实心齿轮（XH_GEAR_SVG，与 XiaoHei-分组控制同款）。
    //  2026-11-16：原来的 kit.makeGearBtn 画的是折叠三角 ▸/▾，且把 4 个设置框撑在节点里。
    //    现在改成「点齿轮 → 节点右侧浮出设置面板」，节点本体高度恒定、不再被撑高。
    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "xh-sl-gear";
    gear.setAttribute("data-xh-slider-gear", "1");
    gear.innerHTML = XH_GEAR_SVG;
    gear.title = ctx.lang === "zh" ? "设置 · 点开右侧参数面板" : "Settings · click to open panel";
    gear.setAttribute("aria-label", gear.title);
    gear.addEventListener("pointerdown", (e) => e.stopPropagation());
    gear.addEventListener("click", (e) => { e.stopPropagation(); toggleSliderSettings(ctx); });
    const { bar: toolbar } = makeXHToolbar(node, { mount: false, appendNodes: [gear] });
    toolbar.classList.add("xh-sl-toolbar");
    root.appendChild(toolbar);

    ctx.node = node;
    ctx.root = root;
    ctx.gear = gear;
    ctx.panelInputs = null;
    ctx.row = sl.row;              //  row 由 makeXHSlider 提供（本文件不再自建）
    ctx.slider = sl;
    ctx.toolbar = toolbar;

    // ---- 渲染 & 同步 ----
    ctx.refreshUI = function () {
        const c = ctx.cfg;
        range.min = String(c.min);
        range.max = String(c.max);
        range.step = String(c.step);
        numBox.min = String(c.min);
        numBox.max = String(c.max);
        numBox.step = String(c.step);
        sl.set(c.value, c.decimals);          //  统一走 kit 组件的 set（不再各写一份）
        // 面板开着时把 normalize 后的值回填（非法输入会被修正，界面要跟上）
        if (ctx.panelInputs) {
            for (const k of ["min", "max", "step", "decimals"]) {
                const el = ctx.panelInputs[k];
                if (el && el.value !== String(c[k])) el.value = String(c[k]);
            }
        }
        if (ctx.gear) {
            const zh = ctx.lang === "zh";
            ctx.gear.title = zh ? "设置 · 点开右侧参数面板" : "Settings · click to open panel";
            ctx.gear.setAttribute("aria-label", ctx.gear.title);
        }
    };

    // 输出类型跟随 decimals（同 mxSlider 行为），类型不匹配的连线自动断开
    ctx.updateOutputType = function () {
        const want = ctx.cfg.decimals > 0 ? "FLOAT" : "INT";
        const out = node.outputs && node.outputs[0];
        if (!out || out.type === want) return;
        if (Array.isArray(out.links)) {
            for (let i = out.links.length - 1; i >= 0; i--) {
                //  2026-10-29：graph.links 在 1.57 是 Map ⇒ 走兼容层
                const l = xhGetLinkById(app.graph, out.links[i]);
                if (l && l.type !== want && l.type !== "*") {
                    const t = app.graph.getNodeById(l.target_id);
                    try { t?.disconnectInput(l.target_slot); } catch (e) {}
                }
            }
        }
        out.type = want;
        if ("localized_name" in out) out.localized_name = want;
    };

    // 节点高度必须随内容变化（ 展开/收起），否则内容被裁掉
    ctx.measure = function () {
        try {
            return (ctx.root.scrollHeight || ctx.root.offsetHeight || 50) + 4;
        } catch (e) {
            return 60;
        }
    };
    ctx.relayout = function () {
        try {
            node.onResize?.(node.size);
            node.setDirtyCanvas?.(true, true);
        } catch (e) {}
    };

    ctx.sync = function () {
        normalize(ctx.cfg);
        ctx.refreshUI();
        ctx.updateOutputType();
        if (ctx.jsonWidget) {
            const txt = JSON.stringify(ctx.cfg);
            if (ctx.jsonWidget.value !== txt) ctx.jsonWidget.value = txt;
        }
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    };

    ctx.loadFromJson = function (txt) {
        let c = txt;
        if (typeof c === "string") {
            try { c = JSON.parse(txt || "{}"); } catch (e) { c = {}; }
        }
        if (!c || typeof c !== "object") c = {};
        ctx.cfg = normalize({ ...DEFAULT_CFG, ...c });
        ctx.refreshUI();
        ctx.updateOutputType();
    };

    // range / numBox 的 input 监听已由 makeXHSlider 内部统一处理（onInput → ctx.sync）
    for (const el of [range, numBox, gear]) {
        el.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    }

    onLangEvent((e) => {
        ctx.lang = (e.detail && e.detail.lang) || getLang();
        ctx.refreshUI();
        // 面板里的文案是打开时按语言生成的 ⇒ 语言切换时重建一次（仍保持打开）
        if (isSliderSettingsOpenFor(ctx)) openSliderSettings(ctx);
    });

    return ctx;
}

const defZh = "滑块 XiaoHei";
const defEn = "Slider XiaoHei";

app.registerExtension({
    name: "XH.Slider",
    async beforeRegisterNodeDef(nodeType, nodeData, appArg) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);
            try {
                const ctx = buildUI(this);

                // 注意：前端 computeLayoutSize 只认 getMinHeight / getHeight，
                // 传 minHeight / minWidth 不生效（源码 domWidget.ts:246~285）
                const w = this.addDOMWidget("xh_slider_ui", "custom", ctx.root, {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => ctx.measure(),
                    getHeight: () => ctx.measure(),
                    afterResize: () => {
                        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
                    },
                });
                if (!w || !w.element) console.error("[XiaoHei-滑块] DOM widget 元素为空，UI 不会显示");
                this._xhSlCtx = ctx;

                // 找到数据载体 widget（后端 STRING 输入自动生成），带延时重试
                const bind = () => {
                    const jw = (this.widgets || []).find((x) => x.name === "slider_json");
                    if (!jw) return false;
                    // 藏掉数据载体行（Nodes 2.0 前端 BaseWidget.hidden 只影响渲染，不影响序列化）
                    jw.hidden = true;
                    ctx.jsonWidget = jw;
                    ctx.loadFromJson(jw.value);
                    return true;
                };
                if (!bind()) {
                    for (const d of [80, 300, 1000]) setTimeout(bind, d);
                }
            } catch (e) {
                console.error("[XiaoHei-滑块] UI 构建失败", e);
            }
            return r;
        };

        // 加载存档：从 widgets_values[0] 恢复（不依赖 DOM widget 序列化）
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                const ctx = this._xhSlCtx;
                const raw = (info?.widgets_values || [])[0];
                if (ctx && typeof raw === "string") {
                    ctx.loadFromJson(raw);
                    const jw = (this.widgets || []).find((x) => x.name === "slider_json");
                    if (jw) {
                        jw.hidden = true;
                        if (jw.value !== raw) jw.value = raw;
                    }
                } else if (!ctx && typeof raw === "string") {
                    this._xhSlPendingJson = raw;
                }
            } catch (e) {}
            return r;
        };

        // 兜底：画布节点加载完成后再刷一次（处理 configure 早于 UI 构建的时序）
        const origLoaded = nodeType.prototype.onLoadedGraphNode;
        nodeType.prototype.onLoadedGraphNode = function (event, info) {
            const r = origLoaded?.apply(this, arguments);
            try {
                const ctx = this._xhSlCtx;
                const raw = this._xhSlPendingJson ?? (info?.widgets_values || [])[0];
                if (ctx && typeof raw === "string") ctx.loadFromJson(raw);
                this._xhSlPendingJson = undefined;
            } catch (e) {}
            return r;
        };

        // 节点移除时把 langBtn 从 kit 的全局集合里摘掉，避免悬挂引用
        const origRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            closeSliderSettingsFor(this._xhSlCtx);   // 节点删了别把浮层留在屏幕上
            return origRemoved?.apply(this, arguments);
        };

        // 标题本地化（只在还是默认名时改，不覆盖用户自定义标题）
        const origNC = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origNC?.apply(this, arguments);
            const applyTitle = () => {
                const lang = getLang();
                if (!this.title || this.title === defZh || this.title === defEn) {
                    this.title = lang === "zh" ? defZh : defEn;
                }
            };
            applyTitle();
            this._xhSlTitleHandler = applyTitle;
            return r;
        };
        onLangEvent(() => {
            for (const n of appArg.graph?._nodes || []) {
                if (n.type === NODE_TYPE && n._xhSlTitleHandler) n._xhSlTitleHandler();
            }
        });
    },
});
