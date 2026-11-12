// XiaoHei-按帧裁音频 · 家族前端
// ① 中/EN 切换：节点标题 + 参数控件标签 + 输入/输出端口名（三张表齐）
// ② 工具条（家族 makeXHToolbar）
// ③ 下拉显示中文、存值仍是英文（applyComboLabels， 绝不改 options.values）
// ④ 索引类参数置顶（xhPinFamilyIndex：start_frame 与 XiaoHei-取帧范围 同构，
//    都是"从第几帧开始" ⇒ 走同一张置顶登记表）
//
// 家族铁律：
//   · 只改 label / title，绝不改 name（改了后端取值就崩）
//   · COMBO 的 values 一字不动，只换显示文字
//   · 只调 kit 的现成实现，不另写一套

import {
    ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons,
    applyComboLabels, xhPinFamilyIndex,
} from "./xh_ui_kit.js";

const { app } = window.comfyAPI.app;

ensureLangBridge();

const NODE_TYPE = "XHAudioTrimFrames";

const XH_I18N = {
    zh: {
        nodes: { XHAudioTrimFrames: "按帧裁音频" },
        widgets: {
            //  2026-10-29 用户定案：索引类参数统一「索引（原名）」格式 + 置顶
            start_frame: "索引（起始帧）",
            length_frames: "取几帧",
            fps: "成片帧率",
            when_short: "短了怎么办",
            audio: "音轨（输入）",
        },
        slots: {
            audio: "音轨",
            info: "裁切信息",
        },
    },
    en: {
        nodes: { XHAudioTrimFrames: "Audio Trim Frames" },
        widgets: {
            start_frame: "Index (start frame)",
            length_frames: "num frames",
            fps: "output fps",
            when_short: "when short",
            audio: "audio",
        },
        slots: {
            audio: "audio",
            info: "trim info",
        },
    },
};

// 存值 → 显示文字（ 只换显示，values 一字不动）
const COMBO_LABELS = {
    zh: {
        when_short: { silence: "补静音", loop: "循环", error: "报错" },
    },
    en: {
        when_short: { silence: "silence", loop: "loop", error: "error" },
    },
};

function t(lang, group, key) {
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack && pack[group] && pack[group][key]) || null;
}

function nodesOfType() {
    try {
        return (app.graph?.nodes || app.graph?._nodes || []).filter((n) => n.type === NODE_TYPE);
    } catch (e) { return []; }
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

        applyComboLabels(node, lang, COMBO_LABELS[lang] || COMBO_LABELS.zh);
    } catch (e) {
        console.warn("AudioTrimFrames Lang] 应用语言失败:", e);
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

function applyLangToAll() {
    const lang = window.XH_LANG || "zh";
    for (const n of nodesOfType()) applyLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}


app.registerExtension({
    name: "XH.AudioTrimFrames",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                // 标准工具条（中/EN）—— 家族唯一实现见 web/xh_ui_kit.js
                makeXHToolbar(this, { widgetName: "xh_audiotrim_bar" });
                applyLang(this);
                //  索引类参数置顶（start_frame 走家族登记表）
                try { xhPinFamilyIndex(this); } catch (e) {}
            } catch (e) {
                console.warn("AudioTrimFrames] 工具栏创建失败:", e);
            }
            return r;
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                //  读档时同样置顶 + 按名字回填（重排安全网）
                try { xhPinFamilyIndex(this, arguments[0]); } catch (e) {}
                applyLang(this);
            } catch (e) {}
            return r;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            return origOnRemoved?.apply(this, arguments);
        };
    },

    async setup() {
        onLangChanged(() => applyLangToAll());
    },
});
