// XiaoHei 节点中英文切换 · 补全层
// ---------------------------------------------------------------------------
// 作用：把「主包其他前端文件尚未做中英对照」的节点，补进同一套切换系统。
//       —— 只新增、不改动任何现有文件逻辑；语言键 xh_node_lang 与家族共用
//          （由 web/xh_ui_kit.js 统一管理），本文件只接桥 + 注册。
// 覆盖范围：38 个缺口节点（其余 85 个由各自前端文件负责，互不冲突）。
// 仅做「节点标题」中英切换；控件/端口标签维持各文件既有翻译，避免重复覆盖。
// ---------------------------------------------------------------------------
const { app } = window.comfyAPI.app;
import { ensureLangBridge, onLangChanged } from "./xh_ui_kit.js";

// 语言桥：访问器 + 广播，确保本文件读取到最新语言状态（幂等，重复调用无害）
ensureLangBridge();

const XH_I18N = {
    zh: {
        nodes: {
            XHColorCalibrator: "颜色校准",
            XHH3SeamCorrection: "H3接缝修正",
            XHImageSliderCompare: "图像滑杆对比",
            XHLoadImageWithMask: "加载带蒙版图像",
            XHOpenH3AutoInput: "H3自动输入",
            XHOpenH3LockAudio: "H3锁定音频",
            XHOpenH3ModelPatch: "H3模型补丁",
            XHOpenH3PromptEncodeRelease: "H3提示词编码释放",
            XHOpenH3RefineRelease: "H3精修释放",
            XHOpenH3Sigmas: "H3采样步长",
            XHOpenH3TiledDiffusion: "H3平铺扩散",
            XHOpenH3VAEDecodeLowMemory: "H3低显存VAE解码",
            XHQwen21Cut: "Qwen2.1裁剪",
            XH_PromptStack: "提示词堆叠 XiaoHei",
            XH_QwenEditAlignComposite: "Qwen编辑对齐合成",
            XH_QwenEditDiffMask: "Qwen编辑差异遮罩",
            XH_QwenEditMeasureShift: "Qwen编辑测量偏移",
            XH_TagPrompt: "标签提示词 XiaoHei",
            XH_WN_DragResolution: "拖拽分辨率",
            XH_WN_FrameNumberSelector: "帧号选择器",
            XH_WN_FrameSlicer: "帧切片器",
            XH_WN_H3AutoLongRipple: "H3长镜头涟漪",
            XH_WN_LiquifyImage: "液化图像",
            XH_WN_LoadVideo: "加载视频",
            XH_WN_QwenEditMask: "Qwen编辑遮罩",
            XH_WN_ResizeMegapixels: "按百万像素缩放",
            XH_WN_ResolutionSuggest: "分辨率建议",
            XH_WN_RippleApply: "涟漪应用",
            XH_WN_RippleClip: "涟漪裁剪",
            XH_WN_RippleFromFrames: "涟漪帧生成",
            XH_WN_RippleOutput: "涟漪输出",
            XH_WN_SaveVideo: "保存视频",
            XH_WN_SigmaCurve: "采样曲线",
            XH_WN_Slider: "滑块",
            XH_WN_Speedpaint: "快速绘画",
            XH_WN_VAEDeGrid: "VAE去网格",
            XH_WN_ZoomCrop: "缩放裁剪",
            // 2026-11-14 原作 1:1 复刻节点：显示名由后端 NODE_DISPLAY_NAME_MAPPINGS 决定，家族 i18n 不插手
        },
    },
    en: {
        nodes: {
            XHColorCalibrator: "Color Calibrator",
            XHH3SeamCorrection: "H3 Seam Correction",
            XHImageSliderCompare: "Image Slider Compare",
            XHLoadImageWithMask: "Load Image With Mask",
            XHOpenH3AutoInput: "H3 Auto Input",
            XHOpenH3LockAudio: "H3 Lock Audio",
            XHOpenH3ModelPatch: "H3 Model Patch",
            XHOpenH3PromptEncodeRelease: "H3 Prompt Encode Release",
            XHOpenH3RefineRelease: "H3 Refine Release",
            XHOpenH3Sigmas: "H3 Sigmas",
            XHOpenH3TiledDiffusion: "H3 Tiled Diffusion",
            XHOpenH3VAEDecodeLowMemory: "H3 VAE Decode Low Memory",
            XHQwen21Cut: "Qwen2.1 Cut",
            XH_PromptStack: "Prompt Stack XiaoHei",
            XH_QwenEditAlignComposite: "Qwen Edit Align Composite",
            XH_QwenEditDiffMask: "Qwen Edit Diff Mask",
            XH_QwenEditMeasureShift: "Qwen Edit Measure Shift",
            XH_TagPrompt: "Tag Prompt XiaoHei",
            XH_WN_DragResolution: "Drag Resolution",
            XH_WN_FrameNumberSelector: "Frame Number Selector",
            XH_WN_FrameSlicer: "Frame Slicer",
            XH_WN_H3AutoLongRipple: "H3 Auto Long Ripple",
            XH_WN_LiquifyImage: "Liquify Image",
            XH_WN_LoadVideo: "Load Video",
            XH_WN_QwenEditMask: "Qwen Edit Mask",
            XH_WN_ResizeMegapixels: "Resize Megapixels",
            XH_WN_ResolutionSuggest: "Resolution Suggest",
            XH_WN_RippleApply: "Ripple Apply",
            XH_WN_RippleClip: "Ripple Clip",
            XH_WN_RippleFromFrames: "Ripple From Frames",
            XH_WN_RippleOutput: "Ripple Output",
            XH_WN_SaveVideo: "Save Video",
            XH_WN_SigmaCurve: "Sigma Curve",
            XH_WN_Slider: "Slider",
            XH_WN_Speedpaint: "Speedpaint",
            XH_WN_VAEDeGrid: "VAE De-Grid",
            XH_WN_ZoomCrop: "Zoom Crop",
            // 2026-11-14 原作 1:1 复刻节点：见 zh 表注释，家族 i18n 不插手
        },
    },
};

function normalizeType(type) {
    return typeof type === "string" ? type.replace(/^[^\w]+/, "") : type;
}
function iXHNode(type) {
    if (typeof type !== "string") return false;
    return !!XH_I18N.zh.nodes[normalizeType(type)];
}
function applyLangToNode(node) {
    if (!node || !iXHNode(node.type)) return;
    const lang = window.XH_LANG || "zh";
    const pack = XH_I18N[lang] || XH_I18N.zh;
    try {
        const t = normalizeType(node.type);
        const name = pack.nodes[t];
        const defaultZhName = XH_I18N.zh.nodes[t];
        const defaultEnName = XH_I18N.en.nodes[t];
        // 仅在标题仍是默认(中/英)或为空时才改，绝不覆盖用户手动改的标题
        if (name && (node.title === defaultZhName || node.title === defaultEnName || !node.title)) {
            node.title = name;
        }
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {}
}
function applyLangToAll() {
    try {
        const nodes = app.graph ? app.graph._nodes || [] : [];
        for (const n of nodes) applyLangToNode(n);
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

app.registerExtension({
    name: "XH.I18n.Completion",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!iXHNode(nodeData.name)) return;
        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try { applyLangToNode(this); } catch (e) {}
            return r;
        };
    },
    async setup() {
        // 语言变更时重刷全图（任意家族节点的切换按钮广播 xh:lang-changed 都会触发）
        onLangChanged(() => applyLangToAll());
    },
});
