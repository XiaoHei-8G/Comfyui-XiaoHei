// XiaoHei-分辨率选择器 · 家族前端
// ① 中/EN 切换：节点标题 + 参数控件标签 + 输入/输出端口名（照 xh_mathint.js 规范）
// ② 下拉框「宽高比」显示中文，但**存档值仍是官方那 8 个英文串**（走官方 options.getOptionLabel，函数不进 JSON）
// ③ 实时预览条：节点上直接显示最终生效的 `1024 × 1024 · 1.00 MP`
//    —— 与后端 controls/resolution_select.py **同一套公式**（含 Python 的「四舍六入五成双」取整），
//       所以节点上看到的就是真跑出来的值，不是估算。
// ④ 节点自身配色 （XiaoHei 家族 12 色 + 自定义取色器）
//
// 铁律：只改 label / title，绝不改 name；绝不改 COMBO 的 values；DOM 控件 serialize:false 且只 append。
const { app } = window.comfyAPI.app;

import {
    ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons, applyComboLabels, lockDomWidgetHeight,
} from "./xh_ui_kit.js";

ensureLangBridge();
const NODE_TYPE = "XHResolutionSelect";
const XH_I18N = {
    zh: {
        nodes: { XHResolutionSelect: "分辨率选择器" },
        widgets: {
            aspect_ratio: "宽高比",
            megapixels: "百万像素 (MP)",
            multiple: "倍数对齐",
        },
        //  slots 表按【端口名】查（不是类型名）：输出口叫 width / height。
        slots: { width: "宽", height: "高" },
    },
    en: {
        nodes: { XHResolutionSelect: "Resolution Selector" },
        widgets: {
            aspect_ratio: "aspect ratio",
            megapixels: "megapixels (MP)",
            multiple: "multiple of",
        },
        slots: { width: "width", height: "height" },
    },
};

// 必须与 controls/resolution_select.py 的 ASPECT_RATIOS 逐条对应（键 = 存档值）
const RATIO_TABLE = {
    "1:1 (Square)": [1, 1],
    "2:3 (Portrait Photo)": [2, 3],
    "3:2 (Photo)": [3, 2],
    "3:4 (Portrait Standard)": [3, 4],
    "4:3 (Standard)": [4, 3],
    "9:16 (Portrait Widescreen)": [9, 16],
    "16:9 (Widescreen)": [16, 9],
    "21:9 (Ultrawide)": [21, 9],
    "4:5 (Social Portrait)": [4, 5],
    "9:21 (Phone Fullscreen)": [9, 21],
    "16:10 (Laptop)": [16, 10],
    "2:1 (Panorama)": [2, 1],
    "自定义 (Custom)": [null, null],
};
const DEFAULT_RATIO = "1:1 (Square)";

// 下拉「宽高比」的中文显示（存档值不动）
const RATIO_LABELS = {
    "1:1 (Square)": "1:1 方形",
    "2:3 (Portrait Photo)": "2:3 竖版照片",
    "3:2 (Photo)": "3:2 横版照片",
    "3:4 (Portrait Standard)": "3:4 竖版标准",
    "4:3 (Standard)": "4:3 横版标准",
    "9:16 (Portrait Widescreen)": "9:16 竖屏（短视频）",
    "16:9 (Widescreen)": "16:9 横屏",
    "21:9 (Ultrawide)": "21:9 超宽屏",
    "4:5 (Social Portrait)": "4:5 竖版社交",
    "9:21 (Phone Fullscreen)": "9:21 手机全屏竖",
    "16:10 (Laptop)": "16:10 笔记本",
    "2:1 (Panorama)": "2:1 全景",
    "自定义 (Custom)": "自定义宽高比",
};

function t(lang, kind, key) {
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack[kind] && pack[kind][key]) || null;
}

function widgetValue(node, name, fallback) {
    const w = (node.widgets || []).find((x) => x && x.name === name);
    if (!w) return fallback;
    const v = w.value;
    return (v === undefined || v === null || v === "") ? fallback : v;
}

// Python 的 round() 是「四舍六入五成双」，JS 的 Math.round 是「逢五进一」——
// 后端是 Python，前端必须跟着用同一套，否则预览条会和实际输出差 1 个倍数。
function pyRound(x) {
    const f = Math.floor(x);
    const d = x - f;
    if (Math.abs(d - 0.5) < 1e-9) return (f % 2 === 0) ? f : f + 1;
    return Math.round(x);
}

function compute(node) {
    const ratio = String(widgetValue(node, "aspect_ratio", DEFAULT_RATIO));
    let w_ratio, h_ratio;
    if (ratio === "自定义 (Custom)") {
        w_ratio = parseFloat(widgetValue(node, "custom_w", 16)) || 16;
        h_ratio = parseFloat(widgetValue(node, "custom_h", 9)) || 9;
        if (!(w_ratio > 0) || !(h_ratio > 0)) { w_ratio = 16; h_ratio = 9; }
    } else {
        const pair = RATIO_TABLE[ratio] || RATIO_TABLE[DEFAULT_RATIO];
        w_ratio = pair[0]; h_ratio = pair[1];
    }
    let mp = parseFloat(widgetValue(node, "megapixels", 1));
    let mult = parseInt(widgetValue(node, "multiple", 8), 10);
    if (!isFinite(mp) || mp < 0.01) mp = 0.01;
    if (!isFinite(mult) || mult < 1) mult = 1;
    const scale = Math.sqrt((mp * 1024 * 1024) / (w_ratio * h_ratio));
    let width = pyRound((w_ratio * scale) / mult) * mult;
    let height = pyRound((h_ratio * scale) / mult) * mult;
    width = Math.max(mult, width);
    height = Math.max(mult, height);
    return { width, height, mp: (width * height) / (1024 * 1024), isCustom: ratio === "自定义 (Custom)", cw: w_ratio, ch: h_ratio };
}

// 选中「自定义宽高比」才显示 custom_w / custom_h 两个框，否则隐藏（不占地方）
function toggleCustomRatio(node) {
    if (!node || !node.widgets) return;
    const ratio = String(widgetValue(node, "aspect_ratio", DEFAULT_RATIO));
    const isCustom = ratio === "自定义 (Custom)";
    for (const name of ["custom_w", "custom_h"]) {
        const w = node.widgets.find((x) => x && x.name === name);
        if (!w) continue;
        w.hidden = !isCustom;
        // 显示名中文化（不影响存档 key，存档仍用 custom_w / custom_h）
        if (!w._xhLabelSet) {
            w.label = (name === "custom_w") ? "自定义宽比" : "自定义高比";
            w._xhLabelSet = true;
        }
    }
    refreshPreview(node);
}

// 33MP ≈ 8K（7680×4320）档，超过即显存吃紧；预览条变红警示。
const SAFE_MP = 33.0;

// 按「长边」给个常见的 K 档位（横竖都看长边，避免竖屏误判）
// 口径 = 水平分辨率 K（业界 K 标准）：2K≈2048 / 4K≈3840 / 6K≈6144 / 8K≈7680
function kLabelOf(width, height) {
    // 「≈几K」= 长边水平像素 ÷ 1024，四舍五入到最近的 K。
    //   K 的本义就是「水平方向大约几千像素」：4K≈3840、8K≈7680、12K=12288、16K=15360，
    //   中间的 9K/10K/11K 等只要分辨率落到那个区间就会自然显示（不再只列行业标准档）。
    const long = Math.max(width, height);
    const k = Math.max(1, Math.round(long / 1024));
    return k + "K";
}

function fmt(n) {
    return String(Math.round(n));
}

function refreshPreview(node) {
    if (!node || !node._xhResText) return;
    try {
        const r = compute(node);
        const k = kLabelOf(r.width, r.height);
        const mult = widgetValue(node, "multiple", 8);
        const over = r.mp > SAFE_MP;
        // 四段分色：宽×高=青 / MP=绿 / ≈K=金 / ×倍数=紫 / 超33MP=红；分隔符用半透明灰不抢戏
        const SEP = '<span style="color:#6b6b70;font-weight:400;">  ·  </span>';
        const prefix = r.isCustom
            ? '<span style="color:#9aa0aa;">自定义 ' + fmt(r.cw) + ':' + fmt(r.ch) + "</span>" + SEP
            : "";
        node._xhResText.innerHTML = prefix +
            '<span style="color:#56C5FF;">' + fmt(r.width) + "×" + fmt(r.height) + "</span>" + SEP +
            '<span style="color:#7EE787;">' + r.mp.toFixed(2) + " MP</span>" + SEP +
            '<span style="color:#FFC857;">≈' + k + "</span>" + SEP +
            '<span style="color:#C79BF2;">×' + mult + "</span>" +
            (over ? '<span style="color:#FF6B6B;">  超33MP</span>' : "");
        if (node._xhResBar) {
            node._xhResBar.style.background = over
                ? "rgba(220, 60, 60, 0.34)"
                : "rgba(255,255,255,0.10)";
        }
        node.setDirtyCanvas?.(true, true);
    } catch (e) {
        console.warn("Resolution] 预览刷新失败:", e);
    }
}

// ---- 实时预览条（DOM widget，serialize:false，只 append）----
function makePreviewBar(node) {
    const el = document.createElement("div");
    el.style.cssText = "display:flex;align-items:center;justify-content:flex-start;padding:6px 8px;"
        + "width:100%;box-sizing:border-box;border-radius:6px;"
        + "background:rgba(255,255,255,0.10);"
        + "font-family:system-ui,-apple-system,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;"
        + "font-size:12px;font-weight:700;letter-spacing:normal;"
        + "color:#ffffff;text-shadow:0 1px 2px rgba(0,0,0,0.35);"
        + "user-select:none;cursor:default;";
    // 左侧运行指示小圆点：空闲暗灰，队列运行时亮绿闪烁
    const dot = document.createElement("span");
    dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:#555;"
        + "flex:0 0 auto;display:inline-block;margin-right:8px;";
    el.appendChild(dot);
    node._xhResDot = dot;
    const text = document.createElement("span");
    el.appendChild(text);
    node._xhResText = text;
    node._xhResBar = el;

    let w = null;
    try {
        w = node.addDOMWidget("xh_resolution_preview", "custom", el, {
            serialize: false,      //  绝不进工作流 JSON
            hideOnZoom: false,
            getMinHeight: () => 26,
        });
    } catch (e) {
        console.warn("Resolution] 预览条挂载失败:", e);
    }
    //  2026-10-13 修复：预览条只给了 getMinHeight，没 computeSize → 拖高节点时被撑成大片空条。钉死固定高度。
    //     2026-10-14 补：Vue Nodes 下行高只看 hasLayoutSize ⇒ lockDomWidgetHeight 连 computeLayoutSize 一起撤。
    lockDomWidgetHeight(w, 26);

    // 参数一改就重算：包住原回调，绝不覆盖
    for (const name of ["aspect_ratio", "megapixels", "multiple", "custom_w", "custom_h"]) {
        const wd = (node.widgets || []).find((x) => x && x.name === name);
        if (!wd || wd._xhResHooked) continue;
        wd._xhResHooked = true;
        const orig = wd.callback;
        wd.callback = function () {
            const r = orig ? orig.apply(this, arguments) : undefined;
            toggleCustomRatio(node);   // 顺带刷新预览 + 切换自定义框显隐
            return r;
        };
    }

    refreshPreview(node);
    return w;
}

function applyLang(node, lang) {
    if (!node) return;
    lang = lang || window.XH_LANG || "zh";
    try {
        const want = t(lang, "nodes", NODE_TYPE);
        const zhT = XH_I18N.zh.nodes[NODE_TYPE];
        const enT = XH_I18N.en.nodes[NODE_TYPE];
        if (want && (!node.title || node.title === zhT || node.title === enT)) node.title = want;

        if (node.widgets) {
            for (const w of node.widgets) {
                if (!w || !w.name) continue;
                const lb = t(lang, "widgets", w.name);
                if (lb) w.label = lb;
            }
        }
        applyComboLabels(node, lang, { aspect_ratio: RATIO_LABELS });

        const applySlots = (arr) => {
            if (!arr) return;
            for (const s of arr) {
                const lb = t(lang, "slots", s && s.name);
                if (lb) s.label = lb;
            }
        };
        applySlots(node.inputs);
        applySlots(node.outputs);

        try {
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        } catch (e) {}
        refreshPreview(node);
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("Resolution Lang] 应用语言失败:", e);
    }
}

function nodesOfType() {
    try {
        return (app.graph?.nodes || app.graph?._nodes || []).filter((n) => n.type === NODE_TYPE);
    } catch (e) { return []; }
}
function applyLangToAll() {
    const lang = window.XH_LANG || "zh";
    for (const n of nodesOfType()) applyLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}


app.registerExtension({
    name: "XH.ResolutionSelect",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                // 标准工具条（中/EN + ）—— 家族唯一实现见 web/xh_ui_kit.js
                const { langBtn } = makeXHToolbar(this, { widgetName: "xh_resolution_bar" });
                this._xhLangBtn = langBtn;

                makePreviewBar(this);
                applyLang(this);
            } catch (e) {
                console.warn("ResolutionSelect] 界面创建失败:", e);
            }
            return r;
        };

        //  工作流载入 / 切换后重刷预览条（2026-10-09 修 bug）
        // 根因：onNodeCreated 时 widgets 还是默认值（1:1 / 1.0MP → 1024×1024），
        //       存档值要到 graph.configure() 灌进 widgets 之后才有；而 kit 里挂在
        //       app.graph.configure 上的重刷层，在「切换工作流 → graph 对象重建」后会失效。
        // 修法：挂在节点原型的 onConfigure 上 —— LiteGraph 在**本节点的 widgets_values
        //       应用完毕之后**必调它，graph 怎么重建都不受影响。
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origOnConfigure?.apply(this, arguments);
            try { toggleCustomRatio(this); } catch (e) {}
            return r;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            return origOnRemoved?.apply(this, arguments);
        };
    },

    async setup() {
        // 语言变更 + 工作流载入重刷 —— 统一走 kit（等价实现，见 web/xh_ui_kit.js）
        onLangChanged(() => applyLangToAll());

        // 全局队列运行状态 → 点亮分辨率节点预览条左侧小圆点（空闲暗灰 / 运行亮绿闪烁）
        try {
            if (!window.__xhResDotStyle) {
                const st = document.createElement("style");
                st.textContent = "@keyframes xhResBlink{0%,100%{opacity:1}50%{opacity:0.15}}"
                    + ".xh-res-running{animation:xhResBlink .9s ease-in-out infinite;box-shadow:0 0 6px #7EE787;}";
                document.head.appendChild(st);
                window.__xhResDotStyle = true;
            }
            let running = false;
            const setRunning = (on) => {
                if (running === on) return;
                running = on;
                for (const n of nodesOfType()) {
                    if (!n._xhResDot) continue;
                    n._xhResDot.classList.toggle("xh-res-running", on);
                    n._xhResDot.style.background = on ? "#7EE787" : "#555";
                }
            };
            const api = app && app.api;
            if (api && api.addEventListener) {
                api.addEventListener("execution_start", () => setRunning(true));
                api.addEventListener("execution_success", () => setRunning(false));
                api.addEventListener("execution_error", () => setRunning(false));
                api.addEventListener("status", (e) => {
                    const info = (e && e.detail && (e.detail.status && e.detail.status.exec_info)) || (e && e.detail && e.detail.exec_info);
                    if (info && typeof info.queue_remaining === "number") {
                        setRunning(info.queue_remaining > 0);
                    }
                });
            }
        } catch (e) {
            console.warn("ResolutionSelect] 运行指示点挂载失败:", e);
        }
    },
});
