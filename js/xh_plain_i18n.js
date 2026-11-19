// XiaoHei-纯后端节点双语补齐（web/xh_plain_i18n.js）
// 2026-10-26 新增。
//
// 【干什么】XiaoHei 包里有 31 个节点只有后端 Python，web/ 里没有双语表
//   （有的是压根没前端，有的有前端但只管交互不管翻译）。切到 EN 时这些节点
//   标题/控件名仍显示中文 ⇒ 用户报的「中英文显示不全」。
//
// 【怎么做】一张表 + 一个通用 applyLang：
//   · 标题   —— 只在「标题是系统自动生成的」时才改，用户手改过的一律不动
//   · 控件   —— 只改 w.label（ 绝不改 w.name，改了存档就串位）
//   · 端口   —— 改 s.label + 触发 node:slot-label:changed 让界面重画
//
// 【不做什么】 不加工具条、不加 DOM、不改布局、不改节点尺寸。
//   这些节点里有一部分（滑块 / 计时器 / 标签 / LoRA堆栈 / 循环…）已经有自己的
//   前端在管界面，本文件只补翻译，跟它们各管各的，不抢。
//
//  控件改名两条红线（家族铁律）：只改 label 不改 name；下拉只改显示不改 values。
//  本文件 CRLF 行尾（与 web/ 目录一致）。

import { ensureLangBridge, onLangChanged, currentLang, xhPinFamilyIndex } from "./xh_ui_kit.js";

//  家族标准：app 必须从 comfyAPI 解构（裸用 app 在新版 Vite 前端会 ReferenceError）
const { app } = window.comfyAPI.app;

ensureLangBridge();

const EXT_NAME = "XH.PlainI18N";

// ---------------------------------------------------------------------------
// 双语表：{ 节点类型: { zh:{title,widgets,slots}, en:{...} } }
//   title   节点标题
//   widgets 控件标签（key = 控件名， 和后端 INPUT_TYPES 的 key 一字不差）
//   slots   端口标签（key = 端口名；没写就退化用 widgets 同名标签）
// ---------------------------------------------------------------------------
const PLAIN = {
    H3LTXAdapterConvert: {
        zh: {
            title: "H3LTX-转换",
            widgets: {
                adapter: "适配器", latent: "潜变量", pixel_frames: "像素帧",
                pixel_height: "像素高", pixel_width: "像素宽",
                input_is_raw: "输入是原始帧", drop_last_frame: "丢最后一帧", unload_after: "用完卸载",
            },
            slots: {
                ltx_latent: "LTX潜变量", pixel_frames: "像素帧",
                width: "宽", height: "高", report: "报告",
            },
        },
        en: {
            title: "H3LTX-Convert",
            widgets: {
                adapter: "Adapter", latent: "Latent", pixel_frames: "Pixel Frames",
                pixel_height: "Pixel Height", pixel_width: "Pixel Width",
                input_is_raw: "Input Is Raw", drop_last_frame: "Drop Last Frame", unload_after: "Unload After",
            },
            slots: {
                ltx_latent: "LTX Latent", pixel_frames: "Pixel Frames",
                width: "Width", height: "Height", report: "Report",
            },
        },
    },

    H3LTXAdapterLoader: {
        zh: {
            title: "H3LTX-适配器加载",
            widgets: { model_name: "模型名", device: "设备", precision: "精度", reload: "重载" },
            slots: { adapter: "适配器" },
        },
        en: {
            title: "H3LTX-Adapter Loader",
            widgets: { model_name: "Model", device: "Device", precision: "Precision", reload: "Reload" },
            slots: { adapter: "Adapter" },
        },
    },

    XHBBoxRegion: {
        zh: {
            title: "区域限定框",
            widgets: {
                center_x: "中心X占比", center_y: "中心Y占比",
                box_w: "区域宽占比", box_h: "区域高占比",
                image: "图像", width: "手动宽", height: "手动高",
            },
            slots: { image: "图像", BBOX: "限定框" },
        },
        en: {
            title: "BBox Region",
            widgets: {
                center_x: "Center X %", center_y: "Center Y %",
                box_w: "Box W %", box_h: "Box H %",
                image: "Image", width: "Manual W", height: "Manual H",
            },
            slots: { image: "Image", BBOX: "BBox" },
        },
    },

    XHBackgroundRemove: {
        zh: {
            title: "去背景",
            widgets: {
                image: "输入图像", model: "模型", mask_feather: "掩码羽化",
                mask_offset: "掩码偏移", invert: "反转",
            },
            slots: { image: "图像", mask: "遮罩" },
        },
        en: {
            title: "Remove Background",
            widgets: {
                image: "Image", model: "Model", mask_feather: "Mask Feather",
                mask_offset: "Mask Offset", invert: "Invert",
            },
            slots: { image: "Image", mask: "Mask" },
        },
    },

    XHBeatCueTable: {
        zh: {
            title: "音乐卡点表",
            widgets: {
                audio: "音频", target_sec: "目标秒数", fps: "帧率",
                frame_mod: "帧格模数", frame_offset: "帧格偏移",
                bars_per_seg: "每段几小节", bar_offset_beats: "起拍位置",
                max_segments: "最多几段", start_offset: "整体平移", mode: "切点来源",
                min_seg_sec: "最短一段", max_seg_sec: "最长一段",
                snap_to_bar: "吸附到乐句",
                //  2026-10-29 用户定案：索引类参数统一「索引（原名）」格式 + 置顶
                index: "索引（取第几段）", batch_count: "列表一次给几段",
            },
            slots: {
                durations: "时长表", frames: "帧数表", count: "段数", info: "信息",
                start_sec: "起点秒", duration_sec: "时长秒", frames_now: "这段帧数",
                start_sec_list: "起点秒(列表)", duration_sec_list: "时长秒(列表)", frames_now_list: "帧数(列表)",
            },
        },
        en: {
            title: "Beat Cue Table",
            widgets: {
                audio: "Audio", target_sec: "Target Sec", fps: "FPS",
                frame_mod: "Frame Mod", frame_offset: "Frame Offset",
                bars_per_seg: "Bars / Seg", bar_offset_beats: "Bar Offset",
                max_segments: "Max Segments", start_offset: "Start Offset", mode: "Cue Source",
                min_seg_sec: "Min Seg Sec", max_seg_sec: "Max Seg Sec",
                snap_to_bar: "Snap to Bar", index: "Index (which segment)", batch_count: "Batch Count",
            },
            slots: {
                durations: "Durations", frames: "Frames", count: "Count", info: "Info",
                start_sec: "Start Sec", duration_sec: "Duration Sec", frames_now: "Frames Now",
                start_sec_list: "Start Sec List", duration_sec_list: "Duration Sec List", frames_now_list: "Frames Now List",
            },
        },
    },

    XHFloatVideo: {
        zh: {
            title: "悬浮任意窗口",
            widgets: {
                size_preset: "尺寸预设", corner: "停靠角", opacity: "不透明度",
                width: "宽", height: "高", title_keyword: "窗口标题关键字",
            },
            slots: {},
        },
        en: {
            title: "Float Any Window",
            widgets: {
                size_preset: "Size Preset", corner: "Corner", opacity: "Opacity",
                width: "Width", height: "Height", title_keyword: "Title Keyword",
            },
            slots: {},
        },
    },

    XHGroupController: {
        zh: {
            title: "分组控制",
            widgets: { opt: "分组" },
            slots: { OPT_CONNECTION: "分组连接" },
        },
        en: {
            title: "Group Controller",
            widgets: { opt: "Group" },
            slots: { OPT_CONNECTION: "Group Link" },
        },
    },

    XHH3LatentContinuation: {
        zh: {
            title: "H3 latent接续",
            widgets: {
                positive: "正向提示", target_latent: "目标潜变量", previous_latent: "上一段潜变量",
                overlap_frames: "重叠帧数", is_first: "是否第一段", drift_control: "漂移控制",
                hard_lock: "接缝锁定模式", model: "模型", sigmas: "Sigmas",
            },
            slots: {
                positive: "正向提示", masked_target: "遮罩后目标", patched_model: "打补丁模型",
            },
        },
        en: {
            title: "H3 Latent Continuation",
            widgets: {
                positive: "Positive", target_latent: "Target Latent", previous_latent: "Previous Latent",
                overlap_frames: "Overlap Frames", is_first: "Is First", drift_control: "Drift Control",
                hard_lock: "Seam Lock", model: "Model", sigmas: "Sigmas",
            },
            slots: {
                positive: "Positive", masked_target: "Masked Target", patched_model: "Patched Model",
            },
        },
    },

    XHH3TemporalCorrection: {
        zh: {
            title: "H3 动作校正",
            widgets: { model: "模型", tau: "校正强度", log_diagnostics: "诊断日志" },
            slots: { model: "模型" },
        },
        en: {
            title: "H3 Motion Correction",
            widgets: { model: "Model", tau: "Strength", log_diagnostics: "Diagnostics" },
            slots: { model: "Model" },
        },
    },

    XHImageBatchMulti: {
        zh: {
            title: "图像批量合并",
            widgets: { image_1: "第 1 张图", image_2: "第 2 张图" },
            slots: { images: "合并图" },
        },
        en: {
            title: "Batch Images",
            widgets: { image_1: "Image 1", image_2: "Image 2" },
            slots: { images: "Images" },
        },
    },

    XHImageCompare: {
        zh: {
            title: "图像对比拼图",
            widgets: {
                text1: "标题1", text2: "标题2", text3: "标题3", size_base: "基准图",
                text_color: "文字颜色", bg_color: "背景色", font_size: "字号",
                image1: "图1", image2: "图2", image3: "图3",
            },
            slots: { IMAGE: "拼图" },
        },
        en: {
            title: "Image Compare",
            widgets: {
                text1: "Title 1", text2: "Title 2", text3: "Title 3", size_base: "Base",
                text_color: "Text Color", bg_color: "BG Color", font_size: "Font Size",
                image1: "Image 1", image2: "Image 2", image3: "Image 3",
            },
            slots: { IMAGE: "Image" },
        },
    },

    XHImageContrast: {
        zh: {
            title: "图像对比度",
            widgets: { image: "输入图像", contrast: "对比度", brightness: "亮度", strength: "作用强度" },
            slots: { image: "图像" },
        },
        en: {
            title: "Image Contrast",
            widgets: { image: "Image", contrast: "Contrast", brightness: "Brightness", strength: "Strength" },
            slots: { image: "Image" },
        },
    },

    XHImageGetByIndex: {
        zh: {
            title: "图像按序取",
            widgets: { images: "图像批次", index: "序号", index_from_one: "从 1 开始", clamp: "越界夹取" },
            slots: { IMAGE: "图像", actual_index: "实际序号" },
        },
        en: {
            title: "Image By Index",
            widgets: { images: "Images", index: "Index", index_from_one: "1-based", clamp: "Clamp" },
            slots: { IMAGE: "Image", actual_index: "Actual Index" },
        },
    },

    XHImageList: {
        zh: {
            title: "图片列表",
            widgets: { images: "图像批次", all_segments: "自循环·逐张输出" },
            slots: { IMAGE: "图像", count: "总数" },
        },
        en: {
            title: "Image List",
            widgets: { images: "Images", all_segments: "Auto-loop: one per run" },
            slots: { IMAGE: "Image", count: "Count" },
        },
    },

    XHImageMaskScale: {
        zh: {
            title: "图像遮罩缩放",
            widgets: {
                input: "输入", resize_mode: "调整类型", size: "目标尺寸",
                interpolation: "缩放方法", divisible_by: "整除对齐",
            },
            slots: { input: "输入", resized: "缩放后" },
        },
        en: {
            title: "Mask Scale",
            widgets: {
                input: "Input", resize_mode: "Mode", size: "Size",
                interpolation: "Interpolation", divisible_by: "Divisible By",
            },
            slots: { input: "Input", resized: "Resized" },
        },
    },

    XHImageResizeV2: {
        zh: {
            title: "图像缩放v2",
            widgets: {
                image: "输入图像", width: "目标宽度", height: "目标高度",
                upscale_method: "缩放算法", keep_proportion: "保持比例方式", pad_color: "补边颜色",
                crop_position: "裁切/补边锚点", divisible_by: "整除对齐", mask: "可选蒙版", device: "计算设备",
            },
            slots: { image: "图像", mask: "蒙版", IMAGE: "图像", width: "宽", height: "高" },
        },
        en: {
            title: "Image Resize v2",
            widgets: {
                image: "Image", width: "Width", height: "Height",
                upscale_method: "Method", keep_proportion: "Keep Proportion", pad_color: "Pad Color",
                crop_position: "Anchor", divisible_by: "Divisible By", mask: "Mask (opt)", device: "Device",
            },
            slots: { image: "Image", mask: "Mask", IMAGE: "Image", width: "Width", height: "Height" },
        },
    },

    XHImageSize: {
        zh: {
            title: "图像尺寸",
            widgets: { image: "输入图像" },
            slots: { image: "图像", width: "宽", height: "高", batch_size: "张数", info: "信息" },
        },
        en: {
            title: "Image Size",
            widgets: { image: "Image" },
            slots: { image: "Image", width: "Width", height: "Height", batch_size: "Batch Size", info: "Info" },
        },
    },

    XHLabel: {
        zh: { title: "标签", widgets: {}, slots: {} },
        en: { title: "Label", widgets: {}, slots: {} },
    },

    XHLoopIteration: {
        zh: {
            title: "循环迭代",
            widgets: {
                //  2026-10-29 用户定案：索引类参数统一「索引（原名）」格式 + 置顶
                iteration_index: "索引（轮次）", is_first: "是否第一轮", is_last: "是否最后一轮",
                reuse_cache: "允许复用缓存",
                current_iteration_value: "回传值 0", current_iteration_value_1: "回传值 1",
                current_iteration_value_2: "回传值 2", current_iteration_value_3: "回传值 3",
                list_item: "列表当前项", list_item_2: "列表2当前项", list_item_3: "列表3当前项",
            },
            slots: {
                index: "第几轮", is_first: "第一轮", is_last: "最后一轮",
                current_value: "回传值 0", current_value_1: "回传值 1",
                current_value_2: "回传值 2", current_value_3: "回传值 3",
                list_item: "列表当前项", list_item_2: "列表2当前项", list_item_3: "列表3当前项",
            },
        },
        en: {
            title: "Loop Iteration",
            widgets: {
                iteration_index: "Index (turn)", is_first: "Is First", is_last: "Is Last",
                reuse_cache: "Reuse Cache",
                current_iteration_value: "Value 0", current_iteration_value_1: "Value 1",
                current_iteration_value_2: "Value 2", current_iteration_value_3: "Value 3",
                list_item: "List Item", list_item_2: "List Item 2", list_item_3: "List Item 3",
            },
            slots: {
                index: "Index", is_first: "Is First", is_last: "Is Last",
                current_value: "Value 0", current_value_1: "Value 1",
                current_value_2: "Value 2", current_value_3: "Value 3",
                list_item: "List Item", list_item_2: "List Item 2", list_item_3: "List Item 3",
            },
        },
    },

    XHLoopProgress: {
        zh: {
            title: "循环进度",
            widgets: { start_id: "开始节点 ID", position: "第几轮", total: "总轮数" },
            slots: { progress: "进度文字" },
        },
        en: {
            title: "Loop Progress",
            widgets: { start_id: "Start Node ID", position: "Position", total: "Total" },
            slots: { progress: "Progress Text" },
        },
    },

    XHLoopResult: {
        zh: {
            title: "循环收尾",
            widgets: { close_id: "结束节点 ID" },
            slots: {},
        },
        en: {
            title: "Loop Result",
            widgets: { close_id: "End Node ID" },
            slots: {},
        },
    },

    XHPowerLoraStack: {
        zh: {
            title: "LoRA堆栈",
            widgets: { loras_json: "LoRA 列表", model: "模型", clip: "CLIP" },
            slots: { model: "模型", clip: "CLIP", MODEL: "模型", CLIP: "CLIP" },
        },
        en: {
            title: "LoRA Stack",
            widgets: { loras_json: "LoRA List", model: "Model", clip: "CLIP" },
            slots: { model: "Model", clip: "CLIP", MODEL: "Model", CLIP: "CLIP" },
        },
    },

    XHPureLoraStack: {
        zh: {
            title: "纯LoRA堆栈",
            widgets: { loras_json: "LoRA 列表", model: "模型" },
            slots: { model: "模型", MODEL: "模型" },
        },
        en: {
            title: "Pure LoRA Stack",
            widgets: { loras_json: "LoRA List", model: "Model" },
            slots: { model: "Model", MODEL: "Model" },
        },
    },

    XHRefSheetBuilder: {
        zh: {
            title: "参考图拼接板",
            widgets: {
                image_1: "第 1 格", preset: "目标画幅", inputcount: "参考图数量", layout: "版式",
                gap: "格间距", crop_fill: "裁切填满", pad_color: "补边色", divisible_by: "整除对齐",
                image_2: "第 2 格", image_3: "第 3 格",
            },
            slots: { ref_sheet: "拼接板", width: "宽", height: "高" },
        },
        en: {
            title: "Ref Sheet",
            widgets: {
                image_1: "Slot 1", preset: "Preset", inputcount: "Slots", layout: "Layout",
                gap: "Gap", crop_fill: "Crop Fill", pad_color: "Pad Color", divisible_by: "Divisible By",
                image_2: "Slot 2", image_3: "Slot 3",
            },
            slots: { ref_sheet: "Ref Sheet", width: "Width", height: "Height" },
        },
    },

    XHSeamFeather: {
        zh: {
            title: "衔接淡化",
            widgets: {
                images: "图像批次", reference: "参考帧", frames: "衔接帧数", strength: "强度",
                falloff: "衰减", mode: "模式", ref_pick: "参考选取", blur_radius: "模糊半径",
            },
            slots: { images: "图像", reference: "参考帧" },
        },
        en: {
            title: "Seam Feather",
            widgets: {
                images: "Images", reference: "Reference", frames: "Frames", strength: "Strength",
                falloff: "Falloff", mode: "Mode", ref_pick: "Ref Pick", blur_radius: "Blur",
            },
            slots: { images: "Images", reference: "Reference" },
        },
    },

    XHShapeMaskOverlay: {
        zh: {
            title: "形状遮罩覆盖",
            widgets: {
                shape: "形状", coord_center: "坐标中心", location_x: "偏移X", location_y: "偏移Y",
                shape_width: "形状基准宽", shape_height: "形状基准高", scale: "缩放", rotation: "旋转",
                opacity: "不透明度", blur_radius: "模糊半径", background_color: "背景颜色",
                shape_color: "形状颜色", frame_width: "画布宽", frame_height: "画布高",
                feather: "羽化", invert: "反相", mask_locate: "遮罩定位", mask_margin: "遮罩边距",
                image: "原图(可选)", mask: "遮罩(可选)",
            },
            slots: { image: "原图", mask: "遮罩", IMAGE: "图像", MASK: "遮罩", BOX2: "框" },
        },
        en: {
            title: "Shape Mask Overlay",
            widgets: {
                shape: "Shape", coord_center: "Coord Center", location_x: "Offset X", location_y: "Offset Y",
                shape_width: "Base W", shape_height: "Base H", scale: "Scale", rotation: "Rotation",
                opacity: "Opacity", blur_radius: "Blur", background_color: "BG Color",
                shape_color: "Shape Color", frame_width: "Canvas W", frame_height: "Canvas H",
                feather: "Feather", invert: "Invert", mask_locate: "Mask Locate", mask_margin: "Mask Margin",
                image: "Image (opt)", mask: "Mask (opt)",
            },
            slots: { image: "Image", mask: "Mask", IMAGE: "Image", MASK: "Mask", BOX2: "Box" },
        },
    },

    XHSlider: {
        zh: { title: "滑块", widgets: { slider_json: "滑块设置" }, slots: { X: "数值" } },
        en: { title: "Slider", widgets: { slider_json: "Slider Settings" }, slots: { X: "Value" } },
    },

    XHStoryboardGrid: {
        zh: {
            title: "宫格底板",
            widgets: {
                width: "底板宽度", height: "底板高度", layout_mode: "排版方式", num_panels: "格数",
                columns: "列数", rows: "行数", border_thickness: "边框粗细",
                background_gray_value: "格子灰度", invert_colors: "反色", cell_alpha: "格内透明",
            },
            slots: { image: "底板", cell_mask: "格遮罩", info: "信息" },
        },
        en: {
            title: "Storyboard Grid",
            widgets: {
                width: "Board W", height: "Board H", layout_mode: "Layout Mode", num_panels: "Panels",
                columns: "Columns", rows: "Rows", border_thickness: "Border",
                background_gray_value: "Cell Gray", invert_colors: "Invert", cell_alpha: "Cell Alpha",
            },
            slots: { image: "Board", cell_mask: "Cell Mask", info: "Info" },
        },
    },

    XHStoryboardPanelCrop: {
        zh: {
            title: "宫格切图",
            widgets: {
                image: "输入宫格", columns: "列数", rows: "行数", shave_edges_pixels: "内缩像素",
                offset_y: "纵向偏移", offset_x: "横向偏移", target_aspect_ratio: "目标比例",
                padding_mode: "填充方式", order: "输出顺序",
            },
            slots: { image: "宫格", images: "切出的图", grid_preview: "预览", panel_count: "格数" },
        },
        en: {
            title: "Storyboard Crop",
            widgets: {
                image: "Grid Image", columns: "Columns", rows: "Rows", shave_edges_pixels: "Shave Px",
                offset_y: "Offset Y", offset_x: "Offset X", target_aspect_ratio: "Target AR",
                padding_mode: "Padding", order: "Order",
            },
            slots: { image: "Grid", images: "Panels", grid_preview: "Preview", panel_count: "Count" },
        },
    },

    XHTimer: {
        zh: { title: "计时器", widgets: {}, slots: {} },
        en: { title: "Timer", widgets: {}, slots: {} },
    },

    XHTrackColorize: {
        zh: {
            title: "跟踪上色",
            widgets: { track_data: "跟踪数据", opacity: "ID色浓度", draw_numbers: "编号", images: "原视频帧" },
            slots: { images: "原视频帧", image: "上色后" },
        },
        en: {
            title: "Track Colorize",
            widgets: { track_data: "Track Data", opacity: "ID Color", draw_numbers: "Draw Numbers", images: "Frames" },
            slots: { images: "Frames", image: "Colorized" },
        },
    },
};

const TYPES = Object.keys(PLAIN);

// ---------------------------------------------------------------------------
// 应用
// ---------------------------------------------------------------------------
function entry(type, lang) {
    const e = PLAIN[type];
    if (!e) return null;
    return e[lang] || e.zh || null;
}

// 「标题还是系统自动生成」才允许改 —— 用户手改过的标题一律不碰
function isAutoTitle(node, type) {
    const t = node.title;
    if (!t) return true;
    const cands = [type];
    for (const lg of ["zh", "en"]) {
        const e = PLAIN[type] && PLAIN[type][lg];
        if (e && e.title) cands.push(e.title);
    }
    // 老标题兜底：后端 NODE_DISPLAY_NAME_MAPPINGS 里的中文名
    if (node.__xhPlainBaseTitle) cands.push(node.__xhPlainBaseTitle);
    return cands.some((b) => b && String(t).indexOf(b) === 0);
}

function applySlotLabel(node, slot, idx, isOut, label) {
    if (!slot || !label) return;
    slot.label = label;
    try {
        node.graph?.trigger?.("node:slot-label:changed", {
            nodeId: String(node.id),
            slotType: isOut ? 2 : 1,
            slotIndex: idx,
            label,
        });
    } catch (e) { /* 老前端没这个事件，忽略 */ }
}

function applyPlainLang(node, lang) {
    try {
        const type = node.type;
        const e = entry(type, lang);
        if (!e) return;

        // ① 标题
        if (e.title && isAutoTitle(node, type)) node.title = e.title;

        // ② 控件：只改 label， 绝不改 name（改了 widgets_values 会串位）
        for (const w of (node.widgets || [])) {
            if (!w || !w.name) continue;
            const lb = (e.widgets || {})[w.name] || (e.slots || {})[w.name];
            if (lb) w.label = lb;
        }

        // ③ 端口
        (node.inputs || []).forEach((s, i) => {
            if (!s || !s.name) return;
            const lb = (e.slots || {})[s.name] || (e.widgets || {})[s.name];
            if (lb) applySlotLabel(node, s, i, false, lb);
        });
        (node.outputs || []).forEach((s, i) => {
            if (!s || !s.name) return;
            const lb = (e.slots || {})[s.name] || (e.widgets || {})[s.name];
            if (lb) applySlotLabel(node, s, i, true, lb);
        });

        try { node.setDirtyCanvas?.(true, true); } catch (err) { /* noop */ }
    } catch (err) {
        console.warn("PlainI18N] 应用语言失败:", err);
    }
}

function nodesOfPlainTypes() {
    let list = [];
    try {
        list = app.graph?.nodes || app.graph?._nodes || [];
    } catch (e) { return []; }
    return list.filter((n) => n && TYPES.indexOf(n.type) >= 0);
}

function applyPlainLangToAll() {
    const lang = currentLang();
    for (const n of nodesOfPlainTypes()) applyPlainLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* noop */ }
}

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const type = nodeData && nodeData.name;
        if (!type || TYPES.indexOf(type) < 0) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                // 记下后端给的原标题，作为「系统自动生成」的兜底判定
                if (!this.__xhPlainBaseTitle) this.__xhPlainBaseTitle = this.title;
                applyPlainLang(this, currentLang());
                //  2026-10-29：循环索引参数置顶（家族铁律，登记表在 kit 里）
                try { xhPinFamilyIndex(this); } catch (e) {}
            } catch (e) {
                console.warn("PlainI18N] onNodeCreated 失败:", e);
            }
            return r;
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                if (!this.__xhPlainBaseTitle) this.__xhPlainBaseTitle = this.title;
                // 读档时先按用户改过的标题判定：读档后 title 来自 json，可能是旧语言
                applyPlainLang(this, currentLang());
                //  2026-10-29：读档时同样置顶 + 按名字回填（重排安全网）
                try { xhPinFamilyIndex(this, info); } catch (e) {}
            } catch (e) { /* noop */ }
            return r;
        };
    },
});

onLangChanged(() => applyPlainLangToAll());

// 兜底：画布整体重建（切工作流 / 刷新）后补一遍
try {
    const _origClear = app.graph?.clear;
    if (_origClear) {
        app.graph.clear = function () {
            const r = _origClear.apply(this, arguments);
            setTimeout(applyPlainLangToAll, 0);
            return r;
        };
    }
} catch (e) { /* noop */ }
