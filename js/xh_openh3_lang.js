// XiaoHei-H3精修 · 家族前端（2026-11-08 新建）
// ① 语言桥：window.XH_LANG accessor + xh:lang-changed 广播（全家族同步）
// ② 中/EN：节点标题 + 参数标签 + 输入/输出端口名（三处齐全，只改 label 不改 name）
// 覆盖本包 8 个节点：视频预处理 / 提示词编码 / 精修 / 低内存解码 /
//                  分块扩散 / 模型补丁 / 官方步长 / 锁定音频
// 铁律：只改 label / title，绝不改 name；class_type 键保持英文，不动序列化。
const { app } = window.comfyAPI.app;
import { ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons, applyComboLabels } from "./xh_ui_kit.js";

ensureLangBridge();

// class_type 键 -> { zh, en } 标题。键必须与 NODE_CLASS_MAPPINGS 完全一致。
const XH_NODES = {
    XHOpenH3AutoInput: { zh: "H3视频预处理 XiaoHei", en: "H3 Video Prepare" },
    XHOpenH3PromptEncodeRelease: { zh: "H3提示词编码 XiaoHei", en: "H3 Prompt Encode" },
    XHOpenH3RefineRelease: { zh: "H3精修 XiaoHei", en: "H3 Refine" },
    XHOpenH3VAEDecodeLowMemory: { zh: "H3低内存解码 XiaoHei", en: "H3 LowMem Decode" },
    XHOpenH3TiledDiffusion: { zh: "H3分块扩散 XiaoHei", en: "H3 Tiled Diffusion" },
    XHOpenH3ModelPatch: { zh: "H3模型补丁 XiaoHei", en: "H3 Model Patch" },
    XHOpenH3Sigmas: { zh: "H3官方步长 XiaoHei", en: "H3 Official Sigmas" },
    XHOpenH3LockAudio: { zh: "H3锁定音频 XiaoHei", en: "H3 Lock Audio" },
};

// 参数名 -> { zh, en } 标签。只改 label，绝不改 name（后端按 name 取参）。
const XH_WIDGETS = {
    // 视频预处理
    video: { zh: "视频", en: "Video" },
    max_frames: { zh: "最大帧数", en: "Max frames" },
    working_resolution: { zh: "工作分辨率", en: "Working resolution" },
    source_scale: { zh: "源缩放", en: "Source scale" },
    // 提示词编码
    clip_name: { zh: "文本编码器", en: "Text encoder" },
    text: { zh: "提示词", en: "Prompt" },
    // 精修
    av_latent: { zh: "联合潜空间", en: "AV latent" },
    conditioning: { zh: "条件", en: "Conditioning" },
    noise: { zh: "噪声", en: "Noise" },
    sampler: { zh: "采样器", en: "Sampler" },
    sigmas: { zh: "步长序列", en: "Sigmas" },
    unet_name: { zh: "H3 主模型", en: "H3 model" },
    main_lora: { zh: "主 LoRA", en: "Main LoRA" },
    curve_branches: { zh: "Sharp 曲线", en: "Sharp curves" },
    strength: { zh: "强度", en: "Strength" },
    head_chunks: { zh: "注意力分块", en: "Head chunks" },
    ff_chunks: { zh: "前馈分块", en: "FF chunks" },
    seq_threshold: { zh: "分块阈值", en: "Seq threshold" },
    enable_tiling: { zh: "启用分块", en: "Enable tiling" },
    method: { zh: "混合方式", en: "Blend method" },
    tile_width: { zh: "块宽", en: "Tile width" },
    tile_height: { zh: "块高", en: "Tile height" },
    tile_overlap: { zh: "块重叠", en: "Tile overlap" },
    // 解码
    vae: { zh: "视频 VAE", en: "Video VAE" },
    samples: { zh: "潜空间样本", en: "Samples" },
    // 模型补丁
    model: { zh: "模型", en: "Model" },
    // 步长
    steps: { zh: "官方步数", en: "Official steps" },
};

// 端口名 -> { zh, en } 标签（输入 / 输出）。只改 label，绝不改 name。
const XH_SLOTS = {
    video: { zh: "视频", en: "video" },
    prepared_images: { zh: "预处理帧", en: "prepared frames" },
    conditioning_audio: { zh: "条件音频", en: "conditioning audio" },
    source_audio: { zh: "源音频", en: "source audio" },
    actual_frame_count: { zh: "实际帧数", en: "frame count" },
    fps: { zh: "帧率", en: "fps" },
    duration: { zh: "时长", en: "duration" },
    report: { zh: "报告", en: "report" },
    conditioning: { zh: "条件", en: "conditioning" },
    av_latent: { zh: "联合潜空间", en: "AV latent" },
    noise: { zh: "噪声", en: "noise" },
    sampler: { zh: "采样器", en: "sampler" },
    sigmas: { zh: "步长序列", en: "sigmas" },
    denoised_av_latent: { zh: "去噪后潜空间", en: "denoised latent" },
    adapter_report: { zh: "补丁报告", en: "adapter report" },
    images: { zh: "图像", en: "images" },
    vae: { zh: "视频 VAE", en: "VAE" },
    samples: { zh: "潜空间样本", en: "samples" },
    locked_av_latent: { zh: "锁音频潜空间", en: "locked latent" },
    model: { zh: "模型", en: "model" },
};

// 下拉框「显示中文、存值仍是英文」（走官方 getOptionLabel 钩子）
//  unet_name / main_lora / curve_branches / clip_name 是文件路径列表 —— **绝不翻译**
const COMBO_LABELS = {
    working_resolution: { source: "保持源比例" },
    method: { gaussian: "高斯（块中心权重大）", uniform: "均匀（简单平均）" },
    steps: { 3: "3 步（官方参考）", 2: "2 步（更快）" },
};

function normalizeType(type) {
    return typeof type === "string" ? type.replace(/^[^\w]+/, "") : type;
}

function conf(type) {
    if (typeof type !== "string") return null;
    return XH_NODES[normalizeType(type)] || null;
}

function applyLangToNode(node) {
    if (!node) return;
    const c = conf(node.type);
    if (!c) return;
    const lang = window.XH_LANG === "en" ? "en" : "zh";
    try {
        // 只有标题仍是默认显示名（或空）时才重写，保留用户的自定义标题
        const defaults = [c.zh, c.en];
        if (c[lang] && (!node.title || defaults.includes(node.title))) {
            node.title = c[lang];
        }
        if (node.widgets) {
            for (const w of node.widgets) {
                const t = w && w.name ? XH_WIDGETS[w.name] : null;
                if (t) w.label = t[lang];
            }
        }
        // 端口名：只改 label。Nodes 2.0 走快照渲染，改完需显式触发重建
        const applySlots = (arr) => {
            for (const s of arr || []) {
                const t = s && s.name ? XH_SLOTS[s.name] : null;
                if (t) s.label = t[lang];
            }
        };
        applySlots(node.inputs);
        applySlots(node.outputs);
        // 下拉框显示中文（值不变）
        applyComboLabels(node, lang, COMBO_LABELS);
        try {
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        } catch (e) {}
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("[XiaoHei-H3精修] 应用语言失败:", e);
    }
}

function applyLangToAll() {
    try {
        const nodes = app.graph ? (app.graph.nodes || app.graph._nodes || []) : [];
        for (const n of nodes) applyLangToNode(n);
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {
        console.warn("[XiaoHei-H3精修] 全局应用语言失败:", e);
    }
}

app.registerExtension({
    name: "XH.OpenH3.FamilyUI",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!conf(nodeData.name)) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                applyLangToNode(this);
                makeXHToolbar(this);
            } catch (e) {
                console.warn("[XiaoHei-H3精修] 工具条创建失败:", e);
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
        onLangChanged(applyLangToAll);
    },
});
