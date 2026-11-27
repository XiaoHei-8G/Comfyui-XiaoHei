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
            XHColorCalibrator: "局部色彩校准 XiaoHei",
            XHH3SeamCorrection: "H3接缝修正",
            XHImageSliderCompare: "双图滑块对比 XiaoHei",
            XHLoadImageWithMask: "加载图像(带遮罩) XiaoHei",
            XHOpenH3AutoInput: "H3视频预处理 XiaoHei",
            XHOpenH3LockAudio: "H3锁定音频 XiaoHei",
            XHOpenH3ModelPatch: "H3模型补丁 XiaoHei",
            XHOpenH3PromptEncodeRelease: "H3提示词编码 XiaoHei",
            XHOpenH3RefineRelease: "H3精修 XiaoHei",
            XHOpenH3Sigmas: "H3官方步长 XiaoHei",
            XHOpenH3TiledDiffusion: "H3分块扩散 XiaoHei",
            XHOpenH3VAEDecodeLowMemory: "H3低内存解码 XiaoHei",
            XHQwen21Cut: "Qwen21约束裁切 XiaoHei",
            XH_GTA6Builder: "GTA6 提示词 XiaoHei",
            XH_GTA6People: "GTA6 人物 XiaoHei",
            XH_GTA6Theme: "GTA6 主题 XiaoHei",
            XH_PromptFill: "提示词填空 XiaoHei",
            XH_PromptStack: "提示词堆叠 XiaoHei",
            XH_QwenEditAlignComposite: "改图对齐合成 XiaoHei",
            XH_QwenEditDiffMask: "改图差异遮罩 XiaoHei",
            XH_QwenEditMeasureShift: "改图漂移测量 XiaoHei",
            XH_TagPrompt: "标签提示词 XiaoHei",
            XH_WN_DragResolution: "拖拽定尺寸 XiaoHei",
            XH_WN_FrameNumberSelector: "时长/帧数预设 XiaoHei",
            XH_WN_FrameSlicer: "帧切片 XiaoHei",
            XH_WN_H3AutoLongRipple: "改帧传播·长镜头分块 XiaoHei",
            XH_WN_LiquifyImage: "图像液化 XiaoHei",
            XH_WN_LoadVideo: "加载视频·上传 XiaoHei",
            XH_WN_QwenEditMask: "Qwen 改图遮罩 XiaoHei",
            XH_WN_ResizeMegapixels: "按百万像素缩放 XiaoHei",
            XH_WN_ResolutionSuggest: "尺寸建议 XiaoHei",
            XH_WN_RippleApply: "改帧传播·条件合成 XiaoHei",
            XH_WN_RippleClip: "改帧·选片段 XiaoHei",
            XH_WN_RippleFromFrames: "改帧·从帧序列 XiaoHei",
            XH_WN_RippleOutput: "改帧结果输出 XiaoHei",
            XH_WN_SaveVideo: "保存视频 XiaoHei",
            XH_WN_SigmaCurve: "Sigma 曲线 XiaoHei",
            XH_WN_Slider: "数值滑杆 XiaoHei",
            XH_WN_Speedpaint: "速涂画板 XiaoHei",
            XH_WN_VAEDeGrid: "VAE 去网格 XiaoHei",
            XH_WN_ZoomCrop: "缩放裁切 XiaoHei",
            // 2026-11-25 补齐：14 个此前无前端标题表的节点（zh 严格取后端 display）
            XH_PromptPack: "提示词批量 XiaoHei",
            XH_FreeVram: "释放显存 XiaoHei",
            XH_SceneCutLoadVideo: "加载视频·分镜 XiaoHei",
            XH_SceneCutDetect: "分镜检测 XiaoHei",
            XH_SceneCutViewer: "分镜审阅器 XiaoHei",
            XH_SceneCutSelectedScenes: "分镜精选播放 XiaoHei",
            XH_SceneCutContactSheet: "分镜缩略图墙 XiaoHei",
            XH_SceneCutSaveScenes: "分镜导出保存 XiaoHei",
            XH_SceneCutLoadScenes: "分镜列表加载 XiaoHei",
            XH_SceneCutDetectorLoader: "分镜检测器加载 XiaoHei",
            XH_SceneCutDetectAdvanced: "分镜检测高级 XiaoHei",
            XH_SceneCutRefine: "分镜精修 XiaoHei",
            XH_SceneCutValidatorLoader: "分镜校验器加载 XiaoHei",
            XH_SceneCutValidate: "分镜校验高级 XiaoHei",
            // 2026-11-14 原作 1:1 复刻节点：显示名由后端 NODE_DISPLAY_NAME_MAPPINGS 决定，家族 i18n 不插手
        },
    },
    en: {
        nodes: {
            XHColorCalibrator: "Color Calibrator XiaoHei",
            XHH3SeamCorrection: "H3 Seam Correction",
            XHImageSliderCompare: "Image Slider Compare XiaoHei",
            XHLoadImageWithMask: "Load Image With Mask XiaoHei",
            XHOpenH3AutoInput: "H3 Auto Input XiaoHei",
            XHOpenH3LockAudio: "H3 Lock Audio XiaoHei",
            XHOpenH3ModelPatch: "H3 Model Patch XiaoHei",
            XHOpenH3PromptEncodeRelease: "H3 Prompt Encode Release XiaoHei",
            XHOpenH3RefineRelease: "H3 Refine Release XiaoHei",
            XHOpenH3Sigmas: "H3 Sigmas XiaoHei",
            XHOpenH3TiledDiffusion: "H3 Tiled Diffusion XiaoHei",
            XHOpenH3VAEDecodeLowMemory: "H3 VAE Decode Low Memory XiaoHei",
            XHQwen21Cut: "Qwen2.1 Cut XiaoHei",
            XH_GTA6Builder: "GTA6 Prompt XiaoHei",
            XH_GTA6People: "GTA6 People XiaoHei",
            XH_GTA6Theme: "GTA6 Theme XiaoHei",
            XH_PromptFill: "Prompt Fill XiaoHei",
            XH_PromptStack: "Prompt Stack XiaoHei",
            XH_QwenEditAlignComposite: "Qwen Edit Align Composite XiaoHei",
            XH_QwenEditDiffMask: "Qwen Edit Diff Mask XiaoHei",
            XH_QwenEditMeasureShift: "Qwen Edit Measure Shift XiaoHei",
            XH_TagPrompt: "Tag Prompt XiaoHei",
            XH_WN_DragResolution: "Drag Resolution XiaoHei",
            XH_WN_FrameNumberSelector: "Frame Number Selector XiaoHei",
            XH_WN_FrameSlicer: "Frame Slicer XiaoHei",
            XH_WN_H3AutoLongRipple: "H3 Auto Long Ripple XiaoHei",
            XH_WN_LiquifyImage: "Liquify Image XiaoHei",
            XH_WN_LoadVideo: "Load Video (Upload) XiaoHei",
            XH_WN_QwenEditMask: "Qwen Edit Mask XiaoHei",
            XH_WN_ResizeMegapixels: "Resize Megapixels XiaoHei",
            XH_WN_ResolutionSuggest: "Resolution Suggest XiaoHei",
            XH_WN_RippleApply: "Ripple Apply XiaoHei",
            XH_WN_RippleClip: "Ripple Clip XiaoHei",
            XH_WN_RippleFromFrames: "Ripple From Frames XiaoHei",
            XH_WN_RippleOutput: "Ripple Output XiaoHei",
            XH_WN_SaveVideo: "Save Video XiaoHei",
            XH_WN_SigmaCurve: "Sigma Curve XiaoHei",
            XH_WN_Slider: "Slider XiaoHei",
            XH_WN_Speedpaint: "Speedpaint XiaoHei",
            XH_WN_VAEDeGrid: "VAE De-Grid XiaoHei",
            XH_WN_ZoomCrop: "Zoom Crop XiaoHei",
            // 2026-11-25 补齐：14 个此前无前端标题表的节点
            XH_PromptPack: "Prompt Pack XiaoHei",
            XH_FreeVram: "Free Vram XiaoHei",
            XH_SceneCutLoadVideo: "Load Video (Scene Cut) XiaoHei",
            XH_SceneCutDetect: "Scene Detect XiaoHei",
            XH_SceneCutViewer: "Scene Viewer XiaoHei",
            XH_SceneCutSelectedScenes: "Selected Scenes XiaoHei",
            XH_SceneCutContactSheet: "Contact Sheet XiaoHei",
            XH_SceneCutSaveScenes: "Save Scenes XiaoHei",
            XH_SceneCutLoadScenes: "Load Scenes XiaoHei",
            XH_SceneCutDetectorLoader: "Detector Loader XiaoHei",
            XH_SceneCutDetectAdvanced: "Scene Detect Advanced XiaoHei",
            XH_SceneCutRefine: "Scene Refine XiaoHei",
            XH_SceneCutValidatorLoader: "Validator Loader XiaoHei",
            XH_SceneCutValidate: "Scene Validate Advanced XiaoHei",
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
