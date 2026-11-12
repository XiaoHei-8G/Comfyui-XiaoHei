// XiaoHei-H3音频同步 · 家族前端（2026-10-30 · v1）
//
// ① 中/EN 切换：节点标题 + 参数控件标签 + 输入/输出端口名（三张表齐）
// ② 工具条（家族 makeXHToolbar：中/EN + 配色走右键画板）
// ③ **状态条**（本节点的信息出口）：跑一次之后在节点上直接显示
//    「片段多长 / 音轨多长 / 短多少怎么补的 / 是否超长」—— 后端只发数字，
//    文案在前端按当前语言生成 ⇒ 中英文切换时状态条不会残留另一种语言。
// ④ 下拉显示中文、存值仍是英文（applyComboLabels， 绝不改 options.values）
//
// ── 为什么状态条的文本由前端写 ────────────────────────────────────────────
//   后端 ui 只给结构化的数字（frames / seconds / track / fill / over / when_short），
//   不给成品句子。Pixaroma 原版是后端拼好英文句子再显示 —— 那样做中/EN 一切换
//   旧句子还挂在节点上。数字 + 前端组句，两边永远同步。
//
// ── 家族铁律 ──────────────────────────────────────────────────────────────
//   · 只改 label / title，绝不改 name（改了后端取值就崩）
//   · DOM 控件固定高 ⇒ lockDomWidgetHeight（Vue 行高只看 hasLayoutSize，
//     只写 computeSize 无效）
//   · 工具条可能污染 widgets_values ⇒ onConfigure 里调 fixWidgetValuesFromSaved 自愈
//   · 事件拦截一律冒泡阶段，绝不用捕获（会掐掉按钮自己的 handler）

import {
    ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons,
    lockDomWidgetHeight, fixWidgetValuesFromSaved, applyComboLabels,
} from "./xh_ui_kit.js";

const { app } = window.comfyAPI.app;

ensureLangBridge();

const NODE_TYPE = "XHH3AudioSync";
const BAR_WIDGET = "xh_h3sync_bar";
const INFO_WIDGET = "xh_h3sync_info";
const INFO_H = 26;

const XH_I18N = {
    zh: {
        nodes: { XHH3AudioSync: "H3音频同步" },
        widgets: {
            clip_limit: "最长片段",
            when_short: "音轨短了",
            over_mode: "超长了",
            custom_limit: "自定义秒数",
            //  2026-10-30 新增：索引类参数统一「索引（原名）」格式（家族铁律）
            start_frame: "索引（起始帧）",
        },
        slots: {
            model: "模型",
            latent: "潜变量",
            audio_vae: "音频VAE",
            track: "音轨",
            audio: "对齐后音轨",
        },
    },
    en: {
        nodes: { XHH3AudioSync: "H3 Audio Sync" },
        widgets: {
            clip_limit: "longest clip",
            when_short: "when short",
            over_mode: "when longer",
            custom_limit: "custom seconds",
            start_frame: "Index (start frame)",
        },
        slots: {
            model: "model",
            latent: "latent",
            audio_vae: "audio_vae",
            track: "track",
            audio: "matched audio",
        },
    },
};

// 存值 → 显示文字（ 只换显示，values 一字不动）
//  2026-10-30：新增帧档（124f / 141f / … / 362f）—— 显示成「124 帧 (5.2s)」
//    让用户**在台面上直接看到帧数**，不用自己换算秒。
const FRAME_OPTS = {};
for (let n = 7; n <= 21; n++) {
    const f = 17 * n + 5;
    FRAME_OPTS[f + "f"] = `${f} 帧 (${(f / 24).toFixed(2)}s)`;
}
const FRAME_OPTS_EN = {};
for (let n = 7; n <= 21; n++) {
    const f = 17 * n + 5;
    FRAME_OPTS_EN[f + "f"] = `${f}f (${(f / 24).toFixed(2)}s)`;
}

const COMBO_LABELS = {
    zh: {
        clip_limit: {
            "5s": "5 秒", "10s": "10 秒", "15s": "15 秒", "20s": "20 秒",
            custom: "自定义", off: "不限",
            ...FRAME_OPTS,
        },
        when_short: { silence: "补静音", loop: "循环" },
        over_mode: { warn: "只警告", stop: "停止运行" },
    },
    en: {
        clip_limit: {
            "5s": "5s", "10s": "10s", "15s": "15s", "20s": "20s",
            custom: "custom", off: "no limit",
            ...FRAME_OPTS_EN,
        },
        when_short: { silence: "silence", loop: "loop" },
        over_mode: { warn: "warn only", stop: "stop run" },
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
        refreshCustomVisibility(node);   // 语言切换后下拉还在，联动不能丢
        paintInfo(node);                      // 状态条跟着语言重画（死角：不能只靠创建时写一次）
    } catch (e) {
        console.warn("H3AudioSync Lang] 应用语言失败:", e);
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

// 下拉一改就联动（包住原来的 callback，绝不覆盖它）
function hookClipLimit(node) {
    if (!node || !node.widgets || node._xhClipHooked) return;
    const w = node.widgets.find((x) => x && x.name === "clip_limit");
    if (!w) return;
    node._xhClipHooked = true;
    const prev = w.callback;
    w.callback = function () {
        const r = prev ? prev.apply(this, arguments) : undefined;
        try { refreshCustomVisibility(node); } catch (e) {}
        return r;
    };
}

// 「自定义秒数」只在上面选了「自定义」时才露出来（照 xh_camangle 的联动写法）
//  判断用 widget.value（存值永远是英文 custom），绝不用显示出来的中文。
function refreshCustomVisibility(node) {
    if (!node || !node.widgets) return;
    const modeW = node.widgets.find((w) => w && w.name === "clip_limit");
    const cw = node.widgets.find((w) => w && w.name === "custom_limit");
    if (!modeW || !cw) return;
    const show = modeW.value === "custom";
    try { cw.hidden = !show; } catch (e) {}
    try { node.setSize?.(node.computeSize?.() || node.size); } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

function applyLangToAll() {
    const lang = window.XH_LANG || "zh";
    for (const n of nodesOfType()) applyLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ── 状态条 ──────────────────────────────────────────────────────────────
function infoEl(node) {
    const w = (node.widgets || []).find((x) => x && x.name === INFO_WIDGET);
    return w && w.element ? w.element : null;
}

function infoText(node, lang) {
    const r = node._xhSyncReport;
    const zh = (lang || window.XH_LANG || "zh") === "zh";
    if (!r) {
        //  没跑之前也把「帧数摆在台面上」：告诉用户这个节点按帧工作、
        //    以及当前选的上限是第几帧（不用跑就能看到）。
        const lw = (node.widgets || []).find((x) => x && x.name === "clip_limit");
        const lv = lw ? lw.value : "";
        const frames = FRAME_OPTS[lv] ? parseInt(lv, 10)
            : (typeof lv === "string" && /^\d+f$/.test(lv) ? parseInt(lv, 10) : null);
        const lim = frames ? (zh ? `上限 ${frames} 帧（${(frames / 24).toFixed(2)}s）` : `limit ${frames}f (${(frames / 24).toFixed(2)}s)`)
            : "";
        return zh
            ? ` 按帧工作 · 片段帧数跑完显示${lim ? " · " + lim : ""}`
            : ` frame-based · clip frames shown after a run${lim ? " · " + lim : ""}`;
    }
    const s = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : "0.00");
    //  2026-10-30：量化误差（官方音频 latent 网格 40fps 造成的固有误差，最多 ±12.5ms）
    //    以前它是隐形的暗坑，现在明确显示出来 —— 让人知道这不是 bug。
    const q = (v) => (Number.isFinite(v) ? (Number(v) >= 0 ? "+" : "") + Number(v).toFixed(1) : "0.0");
    // 起点帧（第 2/3 段生成时才非 0）
    const sf = (Number.isFinite(r.start_frame) && r.start_frame !== 0)
        ? (zh ? ` · 起点帧 ${r.start_frame}` : ` · from frame ${r.start_frame}`)
        : "";
    if (r.over) {
        const lim = (Number.isFinite(r.limit_frames) && r.limit_frames > 0)
            ? (zh ? `${r.limit_frames} 帧` : `${r.limit_frames}f`)
            : `${r.limit}s`;
        return zh
            ? ` 片段 ${s(r.seconds)}s（${r.frames} 帧）超过上限 ${lim}，建议缩短潜变量`
            : ` clip ${s(r.seconds)}s (${r.frames}f) past the ${lim} limit`;
    }
    if (r.short) {
        const how = r.when_short === "loop"
            ? (zh ? "循环补齐" : "looped")
            : (zh ? "末尾补静音" : "padded with silence");
        return zh
            ? `片段 ${s(r.seconds)}s（${r.frames} 帧）· 音轨 ${s(r.track)}s · 短 ${s(r.fill)}s，${how}${sf}`
            : `clip ${s(r.seconds)}s (${r.frames}f) · track ${s(r.track)}s · ${s(r.fill)}s short, ${how}${sf}`;
    }
    return zh
        ? ` 片段 ${s(r.seconds)}s（${r.frames} 帧）· 音轨 ${s(r.track)}s · 已锁定${sf} · 对齐误差 ${q(r.quant_err_ms)}ms`
        : ` clip ${s(r.seconds)}s (${r.frames}f) · track ${s(r.track)}s · locked${sf} · align err ${q(r.quant_err_ms)}ms`;
}

function paintInfo(node) {
    const el = infoEl(node);
    if (!el) return;
    const r = node._xhSyncReport;
    const txt = infoText(node, window.XH_LANG || "zh");
    el.textContent = txt;
    // 正常=家族中性字色；超长=警示；短了=提醒
    const c = r && r.over ? "#e05858" : (r && r.short ? "#e6b800" : "#d5dde5");
    el.style.color = c;
    el.title = txt;
}

function buildInfo(node) {
    if ((node.widgets || []).some((w) => w && w.name === INFO_WIDGET)) return;
    const el = document.createElement("div");
    el.style.cssText =
        "width:100%;box-sizing:border-box;padding:4px 8px;font-size:12px;line-height:18px;"
        + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
        + "background:rgba(0,0,0,0.22);border-radius:6px;color:#d5dde5;";
    el.textContent = infoText(node, window.XH_LANG || "zh");
    let w = null;
    try {
        w = node.addDOMWidget(INFO_WIDGET, "custom", el, {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => INFO_H,
        });
        lockDomWidgetHeight(w, INFO_H);
        try {
            w.serialize = false;
            if (w.options) w.options.serialize = false;
            w.serializeValue = () => undefined;
        } catch (e) {}
    } catch (e) {
        console.warn("H3AudioSync] 状态条挂载失败:", e);
    }
}

app.registerExtension({
    name: "XH.H3AudioSync",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            try {
                buildInfo(this);
                makeXHToolbar(this, { widgetName: BAR_WIDGET });
                applyLang(this);
                hookClipLimit(this);
            } catch (e) {
                console.warn("H3AudioSync] 界面创建失败:", e);
            }
            return r;
        };

        // 跑完流程：后端 ui.xh_h3_sync → 状态条
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted ? onExecuted.apply(this, arguments) : undefined;
            try {
                const rep = message?.xh_h3_sync;
                if (rep) {
                    const one = Array.isArray(rep) ? rep[0] : rep;
                    if (one && typeof one === "object") {
                        this._xhSyncReport = one;
                        paintInfo(this);
                        // 状态条可能还没挂载（首帧）⇒ 下一拍再刷一次
                        const self = this;
                        setTimeout(() => paintInfo(self), 30);
                        setTimeout(() => paintInfo(self), 300);
                    }
                }
            } catch (e) {}
        };

        // 读档：工具条可能污染 widgets_values ⇒ 家族自愈
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            try { fixWidgetValuesFromSaved(this, this._xhSavedInfo || arguments?.[0]); } catch (e) {}
            try { applyLang(this); } catch (e) {}
            return r;
        };

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function () {
            this._xhSavedInfo = arguments?.[0];
            return configure ? configure.apply(this, arguments) : undefined;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            try { releaseButtons(this); } catch (e) {}
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };

        onLangChanged(() => applyLangToAll());
    },
});
