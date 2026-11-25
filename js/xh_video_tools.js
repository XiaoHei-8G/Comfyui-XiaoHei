// XiaoHei-视频工具 · 家族前端（一个 js 管两个节点：合成并保存视频 / 视频拼接）
// ① 中/EN 切换：节点标题 + 参数控件标签 + 输入/输出端口名
// ② 下拉框显示中文，但**存档值仍是英文**（走 options.getOptionLabel，函数不进 JSON）
// ③ 节点自身配色 （XiaoHei 家族 12 色 + 自定义取色器）
//
// 铁律：只改 label / title，绝不改 name；绝不改 COMBO 的 values；DOM 工具栏 serialize:false 且只 append。
const { app } = window.comfyAPI.app;

import { ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons, lockDomWidgetHeight } from "./xh_ui_kit.js";

ensureLangBridge();
const NODE_TYPES = ["XHComposeVideo", "XHConcatVideo", "XHVideoCombine"];
const XH_I18N = {
    zh: {
        nodes: {
            XHComposeVideo: "合成并保存视频 XiaoHei",
            XHConcatVideo: "视频拼接 XiaoHei",
            XHVideoCombine: "视频合成 XiaoHei",
        },
        widgets: {
            images: "图像", fps: "帧率", filename_prefix: "文件名前缀", audio: "音频",
            video_paths: "视频路径列表", reencode: "重新编码",
            audio_path: "音频路径", audio_mode: "音频模式", audio_volume: "音频音量",
            // XHVideoCombine
            frame_rate: "帧率", format: "格式", pix_fmt: "像素格式", crf: "画质",
            save_metadata: "保存元数据", trim_to_audio: "裁到音频长度",
            pingpong: "乒乓播放", loop_count: "循环次数", save_output: "保存到 output",
        },
        slots: {
            file_path: "文件路径", output_path: "输出路径",
            images: "图像", audio: "音频",
            audio_path: "音频路径", video_paths: "视频路径列表",
            video: "视频",
        },
        combo: {
            audio_mode: { replace: "替换原音频", mix: "混合进原音频" },
            format: {
                "video/h264-mp4": "MP4 视频（H.264）",
                "image/gif": "GIF 动图",
                "image/webp": "WebP 动图",
            },
            pix_fmt: {
                yuv420p: "yuv420p（通用）",
                yuv420p10le: "yuv420p 10bit（细腻）",
                yuv422p: "yuv422p",
                yuv444p: "yuv444p（无损色度）",
                rgb24: "rgb24",
            },
        },
    },
    en: {
        nodes: {
            XHComposeVideo: "Compose Video XiaoHei",
            XHConcatVideo: "Concat Video XiaoHei",
            XHVideoCombine: "Video Combine XiaoHei",
        },
        widgets: {
            images: "images", fps: "fps", filename_prefix: "filename prefix", audio: "audio",
            video_paths: "video paths", reencode: "reencode",
            audio_path: "audio path", audio_mode: "audio mode", audio_volume: "audio volume",
            // XHVideoCombine
            frame_rate: "frame rate", format: "format", pix_fmt: "pixel format", crf: "quality",
            save_metadata: "save metadata", trim_to_audio: "trim to audio",
            pingpong: "pingpong", loop_count: "loop count", save_output: "save to output",
        },
        slots: {
            file_path: "file path", output_path: "output path",
            images: "images", audio: "audio",
            audio_path: "audio path", video_paths: "video paths",
            video: "video",
        },
        combo: {},
    },
};

function t(lang, kind, key) {
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack[kind] && pack[kind][key]) || null;
}

function applyComboValueLabels(node, lang) {
    if (!node || !node.widgets) return;
    const zh = (lang || window.XH_LANG || "zh") === "zh";
    for (const w of node.widgets) {
        if (!w || w.type !== "combo" || !w.options) continue;
        const table = zh ? (XH_I18N.zh.combo || {})[w.name] : null;
        if (table) {
            w.options.getOptionLabel = (v) => (v == null ? "" : (table[String(v)] || String(v)));
        } else {
            delete w.options.getOptionLabel;
        }
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

function applyLang(node, lang) {
    if (!node) return;
    lang = lang || window.XH_LANG || "zh";
    try {
        const want = t(lang, "nodes", node.type);
        const zhT = XH_I18N.zh.nodes[node.type];
        const enT = XH_I18N.en.nodes[node.type];
        if (want && (!node.title || node.title === zhT || node.title === enT)) node.title = want;

        if (node.widgets) {
            for (const w of node.widgets) {
                if (!w || !w.name) continue;
                const lb = t(lang, "widgets", w.name);
                if (lb) w.label = lb;
            }
        }
        applyComboValueLabels(node, lang);

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
        console.warn("[XiaoHei VideoTools Lang] 应用语言失败:", e);
    }
}

function nodesOfType() {
    try {
        return (app.graph?.nodes || app.graph?._nodes || []).filter((n) => NODE_TYPES.includes(n.type));
    } catch (e) { return []; }
}
function applyLangToAll() {
    const lang = window.XH_LANG || "zh";
    for (const n of nodesOfType()) applyLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ---------------------------------------------------------------------------
// XiaoHei-视频合成：音画对齐自检条（2026-10-26 新增）
//
// 为什么加这个：2026-10-26 在 LTX 续接工作流里踩过一次大坑 ——
//   帧率填 25、子图实际 24 ⇒ 画面被压快 4.17%（192 帧只播 7.68 秒），
//   音轨仍是 8.00 秒 ⇒ 音画偏差 −0.32 秒（8 帧），越到片尾嘴越跑在声音前面。
//   画面本身完全正常，肉眼很难发现，只能靠「声音和嘴对不上」反推。
//
// 这个条在**跑之前**就把账算给你看：
//   · 帧数 ÷ 帧率 = 画面时长
//   · 音轨采样数 ÷ 采样率 = 声音时长
//   · 两者差 > 0.25 秒 ⇒ 红色告警，直接点名「帧率可能填错了」。
// ---------------------------------------------------------------------------

/** 从 IMAGE 张量上取帧数（batch 维）。 */
function xhVcFrameCount(images) {
    try {
        if (!images) return 0;
        if (Array.isArray(images)) return images.length;
        if (typeof images.length === "number" && !images.shape) return images.length;
        const shp = images.shape || images.size?.();
        if (Array.isArray(shp) && shp.length) return Number(shp[0]) || 0;
        return 0;
    } catch (e) { return 0; }
}

/**
 *  images 是**连线输入**，前端拿不到张量 ⇒ 只能从「上游节点」反推帧数。
 *   两条路：
 *   ① 上游输出 slot 的 value（跑过之后才有）
 *   ② 上游节点的**控件值**（跑之前就能算）—— 常见来源：
 *      · RepeatImageBatch.amount        → 直接就是帧数
 *      · ImageFromBatch.length          → 取几帧
 *      · XiaoHei-分段表 的 seg_N              → 段长（秒）× 帧率
 *   ② 是「跑之前就报警」的关键 —— 用户改帧率时立刻能看出对不对。
 */
function xhVcUpstreamFrameCount(node) {
    try {
        const inp = (node.inputs || []).find((s) => s && s.name === "images");
        if (!inp || inp.link == null) return 0;
        const g = node.graph || (window.comfyAPI?.app?.app?.graph);
        const link = g && g.links && (typeof g.links.get === "function"
            ? g.links.get(inp.link)
            : (g.links || []).find((l) => l && (l[0] === inp.link || l.id === inp.link)));
        if (!link) return 0;
        const srcId = (typeof link.getInputNode === "function") ? link.getInputNode()?.id
            : (link[1] != null ? link[1] : link.origin_id);
        const src = g && (g.getNodeById ? g.getNodeById(srcId)
            : (g.nodes || []).find((n) => n.id === srcId));
        if (!src) return 0;

        // ① 上游输出 slot 的 value（跑过之后有）
        const outs = (src.outputs || []);
        const outIdx = (typeof link.getInputSlot === "function") ? link.getInputSlot()
            : (link[2] != null ? link[2] : link.origin_slot);
        const slot = outs[outIdx];
        let val = null;
        if (slot && "value" in slot) val = slot.value;
        if (val == null && outs[0] && "value" in outs[0]) val = outs[0].value;
        const n = xhVcFrameCount(val);
        if (n > 0) return n;

        // ② 上游控件里的帧数线索（跑之前就有）
        const widgets = src.widgets || [];
        const pick = (name) => {
            for (const w of widgets) {
                if (w && w.name === name) {
                    const v = w.value;
                    return (v && typeof v === "object" && "value" in v) ? v.value : v;
                }
            }
            return undefined;
        };
        const amount = Number(pick("amount"));
        if (Number.isFinite(amount) && amount > 0) return Math.round(amount);
        const length = Number(pick("length"));
        if (Number.isFinite(length) && length > 0) return Math.round(length);
        const frameCount = Number(pick("frame_count"));
        if (Number.isFinite(frameCount) && frameCount > 0) return Math.round(frameCount);
        const frames = Number(pick("frames"));
        if (Number.isFinite(frames) && frames > 0) return Math.round(frames);
        return 0;
    } catch (e) { return 0; }
}

/** 从 AUDIO 上取时长（秒）。取不到返回 null。 */
function xhVcAudioSeconds(audio) {
    try {
        if (!audio) return null;
        const w = audio.waveform;
        const sr = Number(audio.sample_rate);
        if (!w || !sr) return null;
        let n = 0;
        const shp = w.shape || w.size?.();
        if (Array.isArray(shp) && shp.length >= 2) n = Number(shp[shp.length - 1]) || 0;
        else if (Array.isArray(shp) && shp.length === 1) n = Number(shp[0]) || 0;
        else if (typeof w.length === "number") n = w.length;
        if (!n) return null;
        return n / sr;
    } catch (e) { return null; }
}

/**
 *  audio 同样是**连线输入**，前端拿不到 ⇒ 从上游节点反查。
 *   ① 上游输出 slot 的 value（跑过之后有）—— {"waveform","sample_rate"}
 *   ② 上游节点的 info 字符串里解析（XiaoHei-视频取音 的 info 写着「音轨 X.XX 秒」）
 */
function xhVcUpstreamAudio(node) {
    try {
        const inp = (node.inputs || []).find((s) => s && s.name === "audio");
        if (!inp || inp.link == null) return null;
        const g = node.graph || (window.comfyAPI?.app?.app?.graph);
        const link = g && g.links && (typeof g.links.get === "function"
            ? g.links.get(inp.link)
            : (g.links || []).find((l) => l && (l[0] === inp.link || l.id === inp.link)));
        if (!link) return null;
        const srcId = (typeof link.getInputNode === "function") ? link.getInputNode()?.id
            : (link[1] != null ? link[1] : link.origin_id);
        const src = g && (g.getNodeById ? g.getNodeById(srcId)
            : (g.nodes || []).find((n) => n.id === srcId));
        if (!src) return null;
        const outs = (src.outputs || []);
        const outIdx = (typeof link.getInputSlot === "function") ? link.getInputSlot()
            : (link[2] != null ? link[2] : link.origin_slot);
        const slot = outs[outIdx];
        if (slot && slot.value && slot.value.waveform) return slot.value;
        for (const o of outs) {
            if (o && o.value && o.value.waveform) return o.value;
        }
        return null;
    } catch (e) { return null; }
}

/**
 * 从上游节点的 **info 字符串**里抠音轨秒数（跑之前也能用）。
 *   XiaoHei-视频取音 的 info 形如：
 *     "[XiaoHei-视频取音] 有音轨\n· 画面 192 帧 @24.000 fps = 8.00 秒 ｜ 音轨 8.00 秒 ｜ 差 0.00 秒"
 */
function xhVcUpstreamInfoSeconds(node) {
    try {
        const inp = (node.inputs || []).find((s) => s && s.name === "audio");
        if (!inp || inp.link == null) return null;
        const g = node.graph || (window.comfyAPI?.app?.app?.graph);
        const link = g && g.links && (typeof g.links.get === "function"
            ? g.links.get(inp.link)
            : (g.links || []).find((l) => l && (l[0] === inp.link || l.id === inp.link)));
        if (!link) return null;
        const srcId = (typeof link.getInputNode === "function") ? link.getInputNode()?.id
            : (link[1] != null ? link[1] : link.origin_id);
        const src = g && (g.getNodeById ? g.getNodeById(srcId)
            : (g.nodes || []).find((n) => n.id === srcId));
        if (!src) return null;
        const outs = (src.outputs || []);
        for (const o of outs) {
            const v = o && o.value;
            if (typeof v === "string" && v.length) {
                const m = v.match(/音轨\s*([\d.]+)\s*秒/);
                if (m) return Number(m[1]);
            }
        }
        return null;
    } catch (e) { return null; }
}

function xhVcWidgetValue(node, name) {
    try {
        for (const w of (node.widgets || [])) {
            if (w && w.name === name) {
                const v = w.value;
                return (v && typeof v === "object" && "value" in v) ? v.value : v;
            }
        }
    } catch (e) {}
    return undefined;
}

/** 刷新自检条文字。 */
function xhVcSyncCheck(node) {
    try {
        const el = node && node._xh_vc_check_el;
        if (!el) return;
        const zh = (window.XH_LANG || "zh") === "zh";

        //  帧数：优先用「上次真跑出来的」帧数（后端回报，最准），
        //    其次从上游控件推断（跑之前也能算）。
        const cached = node._xh_vc_sync || null;
        const frames = (cached && cached.frames > 0) ? cached.frames
            : (xhVcUpstreamFrameCount(node) || xhVcFrameCount(xhVcWidgetValue(node, "images")));
        const fps = Number(xhVcWidgetValue(node, "frame_rate"));

        //  音轨秒数：优先用「上次真跑出来的」真实音轨长度，
        //    其次从上游 slot / info 解析。
        const cachedAudio = (cached && cached.audioSec != null) ? cached.audioSec : null;
        const aud = cachedAudio
            || xhVcAudioSeconds(xhVcUpstreamAudio(node))
            || xhVcAudioSeconds(xhVcWidgetValue(node, "audio"))
            || xhVcUpstreamInfoSeconds(node);

        let text, color, bg;
        if (!frames) {
            text = zh ? "未接图像帧" : "no images connected";
            color = "#e8e8e8"; bg = "#252525";
        } else if (!fps || fps <= 0) {
            text = zh ? "帧率无效" : "invalid frame rate";
            color = "#e8e8e8"; bg = "#252525";
        } else {
            const vSec = frames / fps;
            if (aud === null) {
                text = zh
                    ? `画面 ${frames} 帧 @ ${fps}fps = ${vSec.toFixed(2)} 秒（无音轨）`
                    : `${frames} frames @ ${fps}fps = ${vSec.toFixed(2)}s (no audio)`;
                color = "#e8e8e8"; bg = "#252525";
            } else {
                const diff = vSec - aud;
                const absd = Math.abs(diff);
                if (absd > 0.25) {
                    text = zh
                        ? ` 音画不齐：画面 ${vSec.toFixed(2)}s vs 声音 ${aud.toFixed(2)}s（差 ${diff > 0 ? "+" : ""}${diff.toFixed(2)}s）—— 帧率可能填错了`
                        : ` audio/video mismatch: video ${vSec.toFixed(2)}s vs audio ${aud.toFixed(2)}s (${diff > 0 ? "+" : ""}${diff.toFixed(2)}s) — frame rate?`;
                    color = "#ffffff"; bg = "rgba(214,69,69,0.68)";
                } else {
                    text = zh
                        ? `✓ 音画对齐：画面 ${vSec.toFixed(2)}s ≈ 声音 ${aud.toFixed(2)}s`
                        : `✓ in sync: video ${vSec.toFixed(2)}s ≈ audio ${aud.toFixed(2)}s`;
                    color = "#ffffff"; bg = "rgba(39,174,96,0.55)";
                }
            }
        }
        el.textContent = text;
        el.style.color = color;
        el.style.backgroundColor = bg;
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {}
}

/**
 *  后端回报的音画自检数据（真数据，前端自己算不出来）。
 *
 *  **载荷在 event.detail 里**（2026-10-26 刚踩过这个坑）：
 *   新版 ComfyUI 前端把服务器事件包成 CustomEvent，
 *   `super.dispatchEvent(new CustomEvent(t.type,{detail:t.data}))`
 *   ⇒ 监听器收到的是 CustomEvent，真实数据在 `.detail`。
 *   直接读 `d.seg` / `d.frames` 会全是 undefined（分段表段号显示不了就是这个原因）。
 */
function xhVcOnSync(ev) {
    try {
        const d = (ev && ev.detail !== undefined && ev.detail !== null) ? ev.detail : ev;
        if (!d || typeof d !== "object") return;
        const id = parseInt(String(d.id), 10);
        if (!Number.isFinite(id)) return;
        const g = (window.comfyAPI?.app?.app?.graph);
        const nodes = (g && g.nodes) || [];
        for (const n of nodes) {
            if (!n || parseInt(String(n.id), 10) !== id) continue;
            if (n.type !== "XHVideoCombine") continue;
            // 存下后端给的真值，前端重画时优先用
            n._xh_vc_sync = {
                frames: Number(d.frames) || 0,
                fps: Number(d.fps) || 0,
                videoSec: (d.video_sec == null) ? null : Number(d.video_sec),
                audioSec: (d.audio_sec == null) ? null : Number(d.audio_sec),
                diff: (d.diff == null) ? null : Number(d.diff),
            };
            xhVcPaintSync(n);
            return;
        }
    } catch (e) {}
}

/** 用后端回报的真值重画自检条。 */
function xhVcPaintSync(node) {
    try {
        const el = node && node._xh_vc_check_el;
        const s = node && node._xh_vc_sync;
        if (!el || !s) return;
        const zh = (window.XH_LANG || "zh") === "zh";
        const frames = s.frames || 0;
        const fps = s.fps || 0;
        const vSec = s.videoSec;
        const aSec = s.audioSec;
        if (!frames || !fps) return;

        let text, color, bg;
        if (aSec == null || vSec == null) {
            text = zh
                ? `画面 ${frames} 帧 @ ${fps}fps = ${vSec ? vSec.toFixed(2) : "?"} 秒（无音轨）`
                : `${frames} frames @ ${fps}fps = ${vSec ? vSec.toFixed(2) : "?"}s (no audio)`;
            color = "#e8e8e8"; bg = "#252525";
        } else {
            const diff = vSec - aSec;
            if (Math.abs(diff) > 0.25) {
                text = zh
                    ? ` 音画不齐：画面 ${vSec.toFixed(2)}s vs 声音 ${aSec.toFixed(2)}s（差 ${diff > 0 ? "+" : ""}${diff.toFixed(2)}s）—— 帧率可能填错了`
                    : ` audio/video mismatch: video ${vSec.toFixed(2)}s vs audio ${aSec.toFixed(2)}s (${diff > 0 ? "+" : ""}${diff.toFixed(2)}s) — frame rate?`;
                color = "#ffffff"; bg = "rgba(214,69,69,0.68)";
            } else {
                text = zh
                    ? `✓ 音画对齐：画面 ${vSec.toFixed(2)}s ≈ 声音 ${aSec.toFixed(2)}s`
                    : `✓ in sync: video ${vSec.toFixed(2)}s ≈ audio ${aSec.toFixed(2)}s`;
                color = "#ffffff"; bg = "rgba(39,174,96,0.55)";
            }
        }
        el.textContent = text;
        el.style.color = color;
        el.style.backgroundColor = bg;
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {}
}

/** 建自检条 + 挂刷新钩子。 */
function xhVcMakeCheckBar(node) {
    try {
        const el = document.createElement("div");
        el.style.cssText =
            "display:flex;align-items:center;justify-content:center;height:26px;" +
            "font-size:11px;color:#e8e8e8;background:#252525;border-radius:4px;margin:2px 0;" +
            "padding:0 6px;text-align:center;line-height:1.2;";
        el.textContent = "";
        const w = node.addDOMWidget("xh_vc_check", "custom", el, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => 26, getHeight: () => 26,
        });
        //  必须锁高：Vue Nodes 里 DOMWidgetImpl 原型自带 computeLayoutSize
        //   ⇒ 行高变 "auto" ⇒ 整格 flex:1 撑满 ⇒ 节点上下留大白、拖高空白等比变大。
        //   唯一正解是 lockDomWidgetHeight（定死 getMinHeight + computeSize，
        //   并把 computeLayoutSize 抹成 undefined），光写 computeSize 无效。
        lockDomWidgetHeight(w, 26);
        try {
            w.serialize = false;
            if (w.options) w.options.serialize = false;
            w.serializeValue = () => undefined;
        } catch (e) {}
        node._xh_vc_check_el = el;
        node._xh_vc_check_w = w;

        // 帧率 / 图像批 / 音轨 任一变化都重算
        //  关键：**帧率一变就用「上次真跑出来的音轨长度」重新算偏差** ⇒
        //    跑过一轮之后，用户改帧率立刻能看到红字警告（不用再跑一次才发现）。
        const refresh = () => setTimeout(() => xhVcSyncCheck(node), 30);
        for (const nm of ["frame_rate", "images", "audio"]) {
            try {
                const wid = (node.widgets || []).find((x) => x && x.name === nm);
                if (wid && wid.callback) {
                    const orig = wid.callback;
                    wid.callback = function (v) { const r = orig?.apply(this, arguments); refresh(); return r; };
                }
            } catch (e) {}
        }
        // 输入口接上/断开时也重算
        try {
            node.onConnectionsChange = ((orig) => function (...a) {
                const r = orig?.apply(this, a);
                refresh();
                return r;
            })(node.onConnectionsChange);
        } catch (e) {}

        //  画布空闲时也定期刷新（上游控件改了 amount 之类也能跟上）
        try {
            const iv = setInterval(() => {
                if (!node._xh_vc_check_el) { clearInterval(iv); return; }
                xhVcSyncCheck(node);
            }, 1500);
        } catch (e) {}

        setTimeout(() => xhVcSyncCheck(node), 60);
    } catch (e) {
        console.warn("[XiaoHei VideoTools] 自检条创建失败:", e);
    }
}


app.registerExtension({
    name: "XH.VideoTools",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODE_TYPES.includes(nodeData.name)) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                // 标准工具条（中/EN + ）—— 家族唯一实现见 web/xh_ui_kit.js
                const { bar, langBtn, colorBtn } = makeXHToolbar(this, { widgetName: "xh_video_bar" });
                this._xhLangBtn = langBtn;

                // XiaoHei-视频合成 专属：音画对齐自检条（跑之前就把账算给你看）
                if (nodeData.name === "XHVideoCombine") {
                    xhVcMakeCheckBar(this);
                }

                applyLang(this);
            } catch (e) {
                console.warn("[XiaoHei VideoTools] 工具栏创建失败:", e);
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
        // 语言变更 + 工作流载入重刷 —— 统一走 kit（等价实现，见 web/xh_ui_kit.js）
        onLangChanged(() => {
            applyLangToAll();
            for (const n of nodesOfType()) {
                if (n.type === "XHVideoCombine") xhVcPaintSync(n);
            }
        });

        //  挂「后端音画自检」事件监听（api 实例可能还没就绪 ⇒ 轮询重试）
        const bind = () => {
            try {
                const cands = [
                    (typeof window !== "undefined" && window.app) ? window.app.api : null,
                    window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api,
                    window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app && window.comfyAPI.app.app.api,
                    app && app.api,
                ];
                for (const c of cands) {
                    if (c && typeof c.addEventListener === "function") {
                        c.addEventListener("xh-videocombine/sync", xhVcOnSync);
                        console.log("[XiaoHei VideoTools] 音画自检监听已挂上");
                        return true;
                    }
                }
            } catch (e) {
                console.warn("[XiaoHei VideoTools] 音画自检监听挂载失败:", e);
            }
            return false;
        };
        if (!bind()) {
            let tries = 0;
            const t = setInterval(() => {
                tries += 1;
                if (bind() || tries > 120) clearInterval(t);
            }, 500);
        }
    },
});
