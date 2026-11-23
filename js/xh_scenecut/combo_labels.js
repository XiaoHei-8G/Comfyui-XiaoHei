// 分镜节点：显示层 —— 下拉契约值 + 端口名/控件名「显示中文、存档值不变」
// 铁律：只改 options.getOptionLabel / widget.label / slot.label / slot.localized_name，
//   绝不改 w.name / w.options.values / slot.name（那是工作流存档 + 接线契约，改了会崩）。
// 这些英文值是算法内部直接 == 比较的契约（torch.device / mode=="keep" / backend=="auto"），
// 端口名是 class_type 的输入标识，都必须保持英文存档；所以走家族现成的显示层钩子。
import { app } from "../../../scripts/app.js";
import { applyComboLabels, ensureLangBridge, onLangChanged } from "../xh_ui_kit.js";
import { PATH_PRESETS } from "./i18n_ui.js";

ensureLangBridge();

// ── 下拉契约值：{ widget 名: { 英文存档值: 中文显示 } } ────────────────────
const LABELS = {
    output_images: {
        off: "关闭（不输出帧）",
        all: "全部帧",
        first: "每个片段取首帧",
        middle: "每个片段取中间帧",
        "全部帧": "全部帧",
        "每个片段取首帧": "每个片段取首帧",
        "每个片段取中间帧": "每个片段取中间帧",
        "关闭": "关闭（不输出帧）",
    },
    device: {
        default: "默认（ComfyUI 自动调度）",
        cpu: "处理器（CPU）",
        "cuda:0": "显卡 0", "cuda:1": "显卡 1", "cuda:2": "显卡 2", "cuda:3": "显卡 3",
    },
    decoder: { auto: "自动", ffmpeg: "FFmpeg", pyav: "PyAV" },
    precision: { fp32: "FP32 精度", bf16: "BF16 精度（更快）" },
    transitions: {
        merge_previous: "并入前一个镜头",
        merge_next: "并入后一个镜头",
        split: "切点落在转场中间",
        keep: "保留转场为独立片段",
    },
    clips: {
        none: "不切视频（仅分镜列表）",
        h264: "H.264（mp4，通用）",
        h264_nvenc: "H.264 英伟达显卡加速（mp4）",
        h265: "H.265 / HEVC（mp4）",
        h265_10bit: "H.265 10 位（mp4）",
        hevc_nvenc: "H.265 英伟达显卡加速（mp4）",
        prores: "ProRes 422 HQ（mov）",
        ffv1: "FFV1 无损（mkv）",
    },
    quality: { high: "高画质", medium: "中等", small: "小文件", "高画质": "高画质", "中等": "中等", "小文件": "小文件" },
    sscd: { none: "不使用 SSCD", "sscd_disc_large.torchscript.pt": "SSCD（大模型）" },
};

// ── 端口名 / 控件名：{ 英文存档名: 中文显示 } ────────────────────────────
// 只写 label / localized_name，name 保持英文。覆盖 12 个节点全部输入控件 + 连线槽。
const PORT_LABELS = {
    // 控件（widget）
    path: "分镜列表路径",
    preset: "检测预设",
    validate: "复核器",
    device: "运行设备",
    output_images: "输出图像",
    proxy: "使用代理预览",
    proxy_height: "代理画面高度",
    thumbs_per_scene: "每镜缩略图数",
    save_report: "保存报告",
    report_prefix: "报告保存位置",
    frames_per_scene: "每镜取帧数",
    thumb_width: "缩略图宽度",
    columns: "每行数量",
    rows: "每页行数",
    first_scene: "起始镜头",
    max_pages: "最多页数",
    filename_prefix: "切片保存位置",
    clips: "切片格式",
    quality: "画质",
    audio: "音频",
    include_signals: "包含音频轨",
    video_path: "视频路径",
    model: "检测模型",
    overlap: "窗口重叠",
    confidence: "置信度阈值",
    batch_windows: "批量窗口数",
    decoder: "解码器",
    precision: "计算精度",
    transitions: "转场处理",
    min_shot_seconds: "最短镜头秒数",
    snap_radius: "切点吸附范围",
    ultra_short_seconds: "极短镜头秒数",
    dinov3: "DINOv3 模型",
    sscd: "SSCD 模型",
    window: "复核窗口",
    flash_sensitivity: "闪光敏感度",
    adaptive_threshold: "自适应阈值",
    threshold: "判定阈值",
    dense_weight: "密集镜头权重",
    short_guard_seconds: "短镜保护秒数",
    flash_cleanup: "闪帧清理",
    // 连线槽（slot）
    video: "视频",
    scenes: "分镜列表",
    images: "图像序列",
    fps: "帧率",
    frame_count: "总帧数",
    duration: "时长",
    review: "审阅数据",
    detector: "检测器",
    validator: "复核器",
    summary: "摘要",
    shot_count: "镜头数",
    // 输出槽类型名（label 中文，name/类型标识不动）
    VIDEO: "视频",
    IMAGE: "图像",
    INT: "整数",
    FLOAT: "数值",
    STRING: "文本",
    XH_SCENECUT_SCENES: "分镜列表",
    XH_SCENECUT_DETECTOR: "分镜检测器",
    XH_SCENECUT_VALIDATOR: "分镜复核器",
};

const ALL = [
    "XH_SceneCutLoadVideo", "XH_SceneCutDetect", "XH_SceneCutViewer", "XH_SceneCutSelectedScenes",
    "XH_SceneCutContactSheet", "XH_SceneCutSaveScenes", "XH_SceneCutLoadScenes",
    "XH_SceneCutDetectorLoader", "XH_SceneCutDetectAdvanced", "XH_SceneCutRefine",
    "XH_SceneCutValidatorLoader", "XH_SceneCutValidate",
];

const lang = () => (window.XH_LANG || (typeof window.XH_I18N !== "undefined" ? window.XH_I18N.lang?.() : "zh") || "zh");

function paint(node) {
    if (!node || !ALL.includes(node.type)) return;
    applyComboLabels(node, lang(), LABELS);
    const isZh = lang() === "zh";
    // 控件名：只改 label，name 不动（存档值）
    for (const w of node.widgets || []) {
        const lb = isZh ? PORT_LABELS[w.name] : undefined;
        if (lb && w.label !== lb) w.label = lb;
        else if (!isZh && w.label && PORT_LABELS[w.name] && w.label !== w.name) w.label = w.name;
    }
    // 路径默认值：跟随语言切换。只动值恰好等于旧/新默认值的输入框，
    // 用户自己填的路径一个字都不碰；路径不是接线契约，改它不会断线。
    for (const w of node.widgets || []) {
        const spec = PATH_PRESETS[w.name];
        if (!spec || typeof w.value !== "string") continue;
        const v = w.value.trim().replace(/\\/g, "/");
        const src = isZh ? [spec.en, ...(spec.legacy || [])] : [spec.zh];
        const dst = isZh ? spec.zh : spec.en;
        if (src.includes(v) && w.value !== dst) w.value = dst;
    }
    // 连线槽：label + localized_name 双写（Nodes 2.0 快照渲染读 localized_name）
    for (const arr of [node.inputs, node.outputs]) {
        for (const s of arr || []) {
            if (!s || !s.name) continue;
            const lb = isZh ? PORT_LABELS[s.name] : undefined;
            if (lb) {
                if (s.label !== lb) s.label = lb;
                if (s.localized_name !== lb) s.localized_name = lb;
            } else if (!isZh && PORT_LABELS[s.name]) {
                if (s.label !== s.name) s.label = s.name;
                if (s.localized_name) delete s.localized_name;
            }
        }
    }
    // 端口快照重建（家族统一机制）
    try {
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        node.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

export function installSceneCutComboLabels() {
    onLangChanged(() => {
        try {
            const graph = app?.graph || window.comfyAPI?.app?.app?.graph;
            for (const n of graph?._nodes || []) paint(n);
        } catch (e) {}
    });
}

export function paintSceneCutCombo(node) {
    paint(node);
    // 工作流载入是异步的：configure 后再补一次，防止 widget / slot 晚于 onNodeCreated 出现
    const orig = node.onConfigure;
    node.onConfigure = function (...args) {
        const r = orig?.apply(this, args);
        paint(this);
        return r;
    };
}
