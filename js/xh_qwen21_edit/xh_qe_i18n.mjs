// XiaoHei-Qwen21 编辑四件套 · 中/EN 三表（2026-11-09）
// 家族机制唯一真源仍是 web/xh_image_tools_lang.js 的 XH_I18N；
// 本文件只提供复刻件专属词条。
//  按节点类型隔离（byNode）：家族全局 widgets 表里 `mode` = 「切点来源」、
//   `image` = 「音频(整首曲子)」等键跟本组节点语义完全不同，直接并表会翻错。
//  只改显示层：node.title / widget.label / slot.label / COMBO getOptionLabel
//  绝不改 name 与 COMBO values（那是存档值，改了会崩）。

export const QE_NODES_ZH = {
    "XHQwen21Cut": "Qwen21约束裁切 XiaoHei",
    "XHColorCalibrator": "局部色彩校准 XiaoHei",
    "XHImageSliderCompare": "双图滑块对比 XiaoHei",
    "XHLoadImageWithMask": "加载图像(带遮罩) XiaoHei",
};
export const QE_NODES_EN = {
    "XHQwen21Cut": "Qwen21 Constrained Cut XiaoHei",
    "XHColorCalibrator": "Local Color Calibrator XiaoHei",
    "XHImageSliderCompare": "Image Slider Compare XiaoHei",
    "XHLoadImageWithMask": "Load Image (with Mask) XiaoHei",
};

const ZH = {
    widgets: {
        image: "图像",
        mask: "遮罩",
        width: "宽度",
        height: "高度",
        resolution: "分辨率",
    },
    slots: {
        image: "图像",
        mask: "遮罩",
        width: "宽度",
        height: "高度",
        resolution: "分辨率",
        changed_ratio: "改动比例",
    },
    byNode: {
        XHQwen21Cut: {
            widgets: {
                image: "输入图",
                resolution: "目标档位",
                tol_ratio: "容差",
                mode: "适配方式",
                pad_color: "补边灰度",
            },
            slots: {
                image: "图像", width: "宽度", height: "高度", resolution: "分辨率",
            },
        },
        XHColorCalibrator: {
            widgets: {
                image_original: "原图",
                image_edited: "编辑图",
                threshold: "差异阈值",
                expand: "区域外扩",
                open_k: "开运算核",
                close_k: "闭运算核",
                strength: "校准强度",
                outside_mode: "区域外",
                feather: "羽化",
                mask: "外部遮罩",
            },
            slots: {
                image_original: "原图", image_edited: "编辑图", mask: "遮罩",
                image: "图像", changed_ratio: "改动比例",
            },
        },
        XHImageSliderCompare: {
            widgets: {
                image_a: "A 图",
                image_b: "B 图",
                format: "预览格式",
                quality: "WEBP 质量",
            },
            slots: { image_a: "A 图", image_b: "B 图" },
        },
        XHLoadImageWithMask: {
            widgets: { image: "选择图片", mask_file: "遮罩文件" },
            slots: { image: "图像", mask: "遮罩" },
        },
    },
};

const EN = {
    widgets: {
        image: "image",
        mask: "mask",
        width: "width",
        height: "height",
        resolution: "resolution",
    },
    slots: {
        image: "image",
        mask: "mask",
        width: "width",
        height: "height",
        resolution: "resolution",
        changed_ratio: "changed_ratio",
    },
    byNode: {
        XHQwen21Cut: {
            widgets: {
                image: "image", resolution: "resolution", tol_ratio: "tol_ratio",
                mode: "mode", pad_color: "pad_color",
            },
            slots: { image: "image", width: "width", height: "height", resolution: "resolution" },
        },
        XHColorCalibrator: {
            widgets: {
                image_original: "image_original", image_edited: "image_edited",
                threshold: "threshold", expand: "expand", open_k: "open_k",
                close_k: "close_k", strength: "strength",
                outside_mode: "outside_mode", feather: "feather", mask: "mask",
            },
            slots: {
                image_original: "image_original", image_edited: "image_edited", mask: "mask",
                image: "image", changed_ratio: "changed_ratio",
            },
        },
        XHImageSliderCompare: {
            widgets: { image_a: "image_a", image_b: "image_b", format: "format", quality: "quality" },
            slots: { image_a: "image_a", image_b: "image_b" },
        },
        XHLoadImageWithMask: {
            widgets: { image: "image", mask_file: "mask_file" },
            slots: { image: "image", mask: "mask" },
        },
    },
};

export const QE_I18N = { zh: ZH, en: EN };

export function isQENode(type) {
    return typeof type === "string" && !!QE_NODES_ZH[type];
}

/** kind = "widgets" | "slots"；先查节点专属表，再回落全局表。 */
export function qeText(kind, name, lang, type) {
    const p = QE_I18N[lang] || QE_I18N.zh;
    const v = p.byNode?.[type]?.[kind]?.[name] ?? p[kind]?.[name];
    return v || null;
}

/** 下拉只改显示文字，存进工作流的 values 一字不动（applyComboLabels 钩子）。 */
export const QE_COMBO = {
    resolution: { default: "自动（按原图面积）" },
    mode: { crop: "裁切（crop）", pad: "补边（pad）", stretch: "拉伸（stretch）" },
    outside_mode: {
        edited: "保留编辑图（edited）",
        original: "保留原图（original）",
        corrected: "校正图（corrected）",
    },
    format: { WEBP: "WEBP（小）", PNG: "PNG（无损）" },
};
