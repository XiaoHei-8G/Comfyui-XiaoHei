// XiaoHei-视频取音 · 家族前端
// ① 中/EN 切换：节点标题 + 参数控件标签 + 输入/输出端口名（照 xh_tone.js 规范）
// ② 节点自身配色 （XiaoHei 家族标准工具条）
//
// 铁律：只改 label / title，绝不改 name；DOM 工具栏 serialize:false 且只 append。
//  头部必须有 `const { app } = window.comfyAPI.app;`（新版 Vite 前端无 window.app 全局，
//    裸用 app 会 ReferenceError ⇒ 扩展不注册 ⇒ 节点变空壳，2026-10-26 血案）。
const { app } = window.comfyAPI.app;

import { ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons } from "./xh_ui_kit.js";

ensureLangBridge();
const NODE_TYPE = "XHAudioFromVideo";
const XH_I18N = {
    zh: {
        nodes: { XHAudioFromVideo: "视频取音" },
        widgets: {
            output_frames: "同时输出画面帧",
        },
        //  slots 表按【端口名】查（不是类型名）：
        //    video / output_frames 是输入口，audio / frames / fps / info 是输出口。
        slots: {
            video: "视频",
            output_frames: "输出画面帧",
            audio: "音轨",
            frames: "画面帧",
            fps: "帧率",
            info: "信息",
        },
    },
    en: {
        nodes: { XHAudioFromVideo: "Audio From Video" },
        widgets: {
            output_frames: "also output frames",
        },
        slots: {
            video: "video",
            output_frames: "output frames",
            audio: "audio",
            frames: "frames",
            fps: "fps",
            info: "info",
        },
    },
};

function t(lang, kind, key) {
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack[kind] && pack[kind][key]) || null;
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
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("VideoAudio Lang] 应用语言失败:", e);
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
    name: "XH.AudioFromVideo",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                // 标准工具条（中/EN + ）—— 家族唯一实现见 web/xh_ui_kit.js
                const { bar, langBtn, colorBtn } = makeXHToolbar(this, { widgetName: "xh_vid_audio_bar" });
                this._xhLangBtn = langBtn;

                applyLang(this);
            } catch (e) {
                console.warn("AudioFromVideo] 工具栏创建失败:", e);
            }
            return r;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            return origOnRemoved?.apply(this, arguments);
        };
    },

    async setup() {
        // 语言变更 + 工作流载入重刷 —— 统一走 kit
        onLangChanged(() => applyLangToAll());
    },
});
