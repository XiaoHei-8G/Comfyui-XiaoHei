// XiaoHei-图像工具 · 家族前端（2026-10-01 升级到家族规范）
// ① 语言桥：window.XH_LANG accessor + xh:lang-changed 广播（全家族同步）
// ② 中/EN：节点标题 + 参数标签 + 输入/输出端口名（含动态端口 image_1..image_N）
// ③  家族 12 色 + 自定义取色器（本版新增，之前缺）
// ④ 动态输入槽：给 XHImageBatchMulti 加「 更新输入口」按钮
//    （逻辑移植自 comfyui-kjnodes/web/js/jsnodes.js 的 setupDynamicInputs，行为一致）
//
// 只改 label / title，绝不改 name —— 后端按 name 取参数，改了会坏。
// 工具条走 addDOMWidget({serialize:false}) 且只 append，禁止 unshift（会顶乱 widgets_values 下标）。
const { app } = window.comfyAPI.app;
import { ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons, applyComboLabels, showXHPicker, fixWidgetValuesFromSaved , paintBarBtn, xhPlaceBeside, xhFollowAnchor, xhIconHTML, xhDecorateButton} from "./xh_ui_kit.js";
//  2026-11-08：1:1 复刻的 WepeNerd 24 个节点接进家族中/EN 三表（专属词条，不污染家族原有词条）
import { WN_NODES_ZH, WN_NODES_EN, WN_COMBO, isWNNode, wnText, wnUIFull } from "./xh_wepenerd/xh_wn_i18n.mjs";
//  2026-11-09：XiaoHei-Qwen21 编辑四件套（复刻 BlueBox）接进家族中/EN 三表
import { QE_NODES_ZH, QE_NODES_EN, isQENode, qeText, QE_COMBO } from "./xh_qwen21_edit/xh_qe_i18n.mjs";
//  2026-11-14 晚：小黑·全能角色设定表 = 原作 1:1 复刻。
//  设计器里的 DOM 文案由 reference13_zh.mjs 单独中文化；节点标题 / 控件标签 /
//  输入·输出端口名仍归家族三表管（见下方 CS_* 隔离表），两条线同由 window.XH_LANG 驱动。
// XiaoHei-视频分段轴 的节点专属 UI（播放器 + 帧轨道）—— 只放控件，不调工具条/中文（那边统一管）
import { setupXHVideoTimeline } from "./xh_video_timeline.js";
import { getLinkById as xhGetLinkById } from "./xh_compat.js";
//  2026-11-08：复用「XiaoHei-图片列表」的缩略图 URL 口径，给画板参考图回溯用
//   坑 19：ESM 导入名对不上会让整个扩展静默消失 ⇒ 已核对 xh_image_list.js 的 export 名 = viewUrl
import { viewUrl as xhImgListViewUrl } from "./xh_image_list.js";

ensureLangBridge();

//  2026-11-13 家族图标统一：工具条按钮存了中英双语文案，切语言会重写 textContent。
//    统一走家族装饰器，符号图案（＋ 加一个排除区）才不会在切语言后变回裸字符，
//    也不会因为 data-xh-icon-done 幂等标记而把图标卡住。
function setXHBtnLabel(b, t) {
    if (!b) return;
    delete b.dataset.xhIconDone;
    if (!xhDecorateButton(b, t || "")) b.textContent = t || "";
}

const XH_I18N = {
    zh: {
        nodes: {
            XHImageResizeV2: "图像缩放v2",
            XHImageBatchMulti: "图像批量合并",
            XHRefSheetBuilder: "参考图拼接板",
            XHImageMaskScale: "图像遮罩缩放",
            XHImageSize: "图像尺寸",
            // 宫格故事板三件套（2026-10-09）
            XHStoryboardGrid: "宫格底板",
            XHImageContrast: "图像对比度",
            XHStoryboardPanelCrop: "宫格切图",
            // 形状遮罩覆盖（2026-10-09）
            XHShapeMaskOverlay: "形状遮罩覆盖",
            // 区域限定框（2026-10-10，喂 SAM3_Detect.bboxes）
            XHBBoxRegion: "区域限定框",
            // 万能遮罩（2026-10-12 建为「智能遮脸」，2026-10-25 改名：SAM3 一体化，什么都能遮）
            XHSmartFaceMask: "万能遮罩",
            //  音乐卡点表（2026-10-14，纯 numpy 节拍分析，零第三方依赖）
            XHBeatCueTable: "音乐卡点表",
            // 去背景（2026-10-18 登记，补家族语言机制）
            XHBackgroundRemove: "去背景",
            // XiaoHei-H3 latent接续（2026-10-23 家族模式化：从 widgets 挪进 nodes）
            XHH3LatentContinuation: "H3 latent接续",
            // XiaoHei-H3 动作校正（2026-10-23，TST 推理时校正，零第三方依赖）
            XHH3TemporalCorrection: "H3 动作校正",
            // XiaoHei-跟踪上色（2026-10-25：SAM3 跟踪结果按 ID 调色板重上色，跟万能遮罩三口一色）
            XHTrackColorize: "跟踪上色",
            // XiaoHei-遮罩上色（2026-10-31：减脸露表情 + 外部色源，零新增依赖）
            XHMaskTint: "遮罩上色",
            // XiaoHei-身份配色（2026-10-31：官方 SCAIL2ColoredMask 的可指定颜色版）
            XHIdentityColorize: "身份配色",
            // XiaoHei-视频分段轴（2026-10-31：播放器上拖拽切段，分段重跑识别不串号）
            XHVideoTimeline: "视频分段轴",
            // XiaoHei-列表拼批（2026-10-31：把循环「累计」出来的 IMAGE 列表拼成一批）
            XHImageListConcat: "列表拼批",
            H3LTXAdapterConvert: "H3LTX-转换",
            H3LTXAdapterLoader: "H3LTX-适配器加载",
            XHAudioDuration: "音频取时长",
            XHAudioFromVideo: "视频取音",
            XHAudioTrimFrames: "按帧裁音频",
            XHBooleanSwitch: "切换",
            XHBooleanToggle: "布尔开关",
            XHCalculator: "计算器",
            XHCameraAnglePrompt: "机位描述",
            XHCameraParam: "相机参数",
            XHColorCorrect: "色彩校正",
            XHCompareVideos: "视频对比",
            XHComposeVideo: "合成并保存视频",
            XHConcatVideo: "视频拼接",
            XHFloatVideo: "悬浮任意窗口",
            XHForLoopEnd: "循环结束",
            XHForLoopStart: "循环开始",
            XHFrameAlign: "帧数对齐",
            XHGet: "获取",
            XHGroupController: "分组控制",
            XHH3AudioSync: "H3音频同步",
            XHImageCacheRead: "图像读取",
            XHImageCacheWrite: "图像落盘",
            XHImageCompare: "图像对比拼图",
            XHImageGetByIndex: "图像按序取",
            XHImageList: "图片列表",
            XHImagePrecision: "图像精度",
            XHImageRangeFromBatch: "取帧范围",
            XHImageScaleByAspectRatio: "按比例缩放",
            XHLTXIdentityOverlap: "LTX锁脸",
            XHLabel: "标签",
            XHLabelPix: "浮字标签",
            XHLoadAudio: "加载音频",
            XHLoadVideo: "加载视频",
            XHLoopIteration: "循环迭代",
            XHLoopProgress: "循环进度",
            XHLoopResult: "循环收尾",
            XHMSRRelayEncode: "MSR精修编码",
            XHMathExpression: "表达式求值",
            XHMathFloat: "浮点运算",
            XHMathInt: "整数运算",
            XHMultiGet: "多路获取",
            XHMultiSet: "多路设置",
            XHNumberConvert: "数值转换",
            XHNumberCounter: "数字计数器",
            XHPaint: "画板",
            XHPowerLoraStack: "LoRA堆栈",
            XHPureLoraStack: "纯LoRA堆栈",
            XHResolutionSelect: "分辨率选择器",
            XHSamplerSelect: "采样器选择",
            XHSeamCorrect: "接缝修正",
            XHSeamFeather: "衔接淡化",
            XHSeed: "种子",
            XHSegmentConcat: "分段拼接",
            XHSegmentTable: "分段表",
            XHSet: "设置",
            XHShowText: "预览任意",
            XHSimpleMath: "简易数学",
            XHSlider: "滑块",
            XHSolidMask: "实心遮罩",
            XHSoundPlayer: "声音播放",
            XHTimer: "计时器",
            XHToneCompensate: "色调补偿",
            XHVAEDecodeTiled: "平铺VAE解码",
            XHVideoCombine: "视频合成",
            XHVoiceSeparatorLoader: "人声分离(模型加载)",
            XHVoiceSeparatorSampler: "人声分离(采样)",
            XH_ChainPromptSelector: "提示词表",
            XH_DynamicPromptJoin: "提示词联结(动态)",
        },
        widgets: {
            //  音乐卡点表
            audio: "音频(整首曲子)",
            // XiaoHei-H3 latent接续
            overlap_frames: "重叠帧数",
            hard_lock: "接缝锁定",
            is_first: "是否首轮",
            drift_control: "漂移控制",
            // XiaoHei-H3 动作校正（TST）
            tau: "校正强度",
            log_diagnostics: "诊断日志",
            target_sec: "参考段长(秒·仅①用)",
            batch_count: "列表一次给几段(0=到尾)",
            fps: "帧率",
            frame_mod: "帧格模数",
            frame_offset: "帧格偏移",
            bars_per_seg: "每段几小节",
            bar_offset_beats: "起拍位置(0-3)",
            max_segments: "最多几段",
            start_offset: "整体平移(秒)",
            //  音乐卡点表 v1.9.27：不齐分 + 单段直出
            mode: "切点来源",
            min_seg_sec: "最短一段(秒)",
            max_seg_sec: "最长一段(秒,0=自动)",
            snap_to_bar: "吸附到乐句",
            //  2026-10-29 用户定案：索引类参数统一「索引（原名）」格式 + 置顶
            index: "索引（取第几段）",
            // 图像缩放 v2
            width: "目标宽度",
            height: "目标高度",
            upscale_method: "缩放算法",
            keep_proportion: "保持比例方式",
            pad_color: "补边颜色",
            crop_position: "裁切位置",
            divisible_by: "整除对齐",
            device: "计算设备",
            // 图像遮罩缩放
            resize_mode: "调整类型",
            size: "目标尺寸",
            interpolation: "缩放方法",
            // 图像批量合并
            inputcount: "输入口数量",
            xh_update_inputs: " 更新输入口",
            // 参考图拼接板
            preset: " 目标画幅",
            layout: " 版式",
            gap: " 格间距",
            crop_fill: " 裁切填满",
            // 宫格故事板
            layout_mode: " 排版方式",
            num_panels: " 格数",
            columns: " 列数",
            rows: " 行数",
            border_thickness: "▮ 边框粗细",
            background_gray_value: " 格子灰度",
            invert_colors: " 反色",
            cell_alpha: "◻ 格内透明",
            contrast: "◑ 对比度",
            brightness: " 亮度",
            strength: " 作用强度",
            // XiaoHei-遮罩上色
            face_expand: " 脸部外扩",
            // XiaoHei-身份配色
            id_colors: " 各身份颜色",
            sort_by: " 排序方式",
            object_indices: " 只取哪几个",
            replacement_mode: " 替换模式",
            // XiaoHei-视频分段轴
            segments: " 分段数据(时间轴生成)",
            shave_edges_pixels: " 内缩像素",
            offset_y: "↕ 纵向偏移",
            offset_x: "↔ 横向偏移",
            target_aspect_ratio: " 目标比例",
            padding_mode: " 填充方式",
            order: " 输出顺序",
            // 形状遮罩覆盖（二合一 / 2026-10-12）
            shape: "形状",
            coord_center: "坐标中心",
            location_x: "偏移 X",
            location_y: "偏移 Y",
            shape_width: "形状基准宽",
            shape_height: "形状基准高",
            scale: "缩放",
            rotation: "旋转",
            opacity: "不透明度",
            blur_radius: "模糊半径",
            background_color: "背景颜色",
            shape_color: "形状颜色",
            frame_width: "画布宽(0=跟随原图)",
            frame_height: "画布高(0=跟随原图)",
            color: "填充色",
            feather: "边缘羽化",
            invert: "反转填充",
            mask_locate: "用mask定位画形状",
            mask_margin: "定位外扩%",
            // 区域限定框（2026-10-10）
            center_x: "中心X占比",
            center_y: "中心Y占比",
            box_w: "区域宽占比",
            box_h: "区域高占比",
            // 万能遮罩（2026-10-12 建为「智能遮脸」，2026-10-25 改名）
            search_mode: "搜索范围",
            exclude_cx: "排除区中心X(占比)",
            exclude_cy: "排除区中心Y(占比)",
            exclude_w: "排除区宽(占比)",
            exclude_h: "排除区高(占比)",
            exclude_enable: "启用排除区",
            exclude_color: "排除块颜色",
            //  2026-10-25：多个排除区（第 2..N 个框，由编辑器里的「＋加一个排除区」维护）
            exclude_zones: "附加排除区(JSON·编辑器维护)",
            //  2026-11-08：搜索区 6 参数（原先只登记在 en 表 ⇒ 中文模式露英文原名，用户截图反馈）
            search_enable: "启用搜索区",
            search_cx: "搜索区中心X(占比)",
            search_cy: "搜索区中心Y(占比)",
            search_w: "搜索区宽(占比)",
            search_h: "搜索区高(占比)",
            search_zones: "附加搜索区(JSON·编辑器维护)",
            mask_margin: "定位外扩%",
            pick_mode: "选哪个目标",
            face_ratio: "目标高占比(裁上部)",
            shape_scale: "形状缩放",
            region_x: "区域中心X",
            region_y: "区域中心Y",
            region_w: "区域宽",
            region_h: "区域高",
            fallback_draw: "找不到目标兜底画形状",
            threshold: "检测阈值",
            refine_iterations: "细化次数",
            shape_color: "遮挡色",
            //  v1.9.5：head（目标框以上）的「四向外扩」——单位：左/右=目标宽，上/下=目标高
            expand_left: "左扩(目标宽倍)",
            expand_right: "右扩(目标宽倍)",
            expand_top: "上扩(目标高倍)",
            expand_bottom: "下扩(目标高倍)",
            //  v1.9.7：auto 取色的取色基准
            color_pick_ref: "取色基准",
            //  v1.9.8：内置提示词（把 CLIP 线接到本节点，就能直接在这儿写 face / face:2）
            prompt: "提示词(内置)",
            //  v1.9.11（2026-10-25）：① 模式拆分 / ② 多目标 / ③ ID 上色（多人替换地基）
            mask_mode: " 模式",
            target_scope: " 要哪几个目标",
            target_index: " 第几个(0起)",
            target_count: " 前几个",
            id_paint: " ID 上色",
            id_sort: " 排序规则",
            id_color: " ID 颜色",
            id_alpha: "◐ ID 叠加浓度",
            //  2026-10-25：深度图合成
            depth_mode: " 深度用法",
            depth_near: " 只留最近的",
            opacity: "不透明度",
            blur_radius: "模糊半径",
            feather: "羽化",
            rotation: "旋转",
            invert: "反转",
            face_box: "目标框",
            // 去背景（2026-10-18）
            image: "输入图像",
            model: "模型",
            mask_feather: "掩码羽化",
            mask_offset: "掩码偏移",
            invert: "反转",
            // XiaoHei-跟踪上色（2026-10-25）
            draw_numbers: "画1234编号",
        },
        slots: {
            //  音乐卡点表
            durations: "每段秒数(给分段表)",
            // XiaoHei-H3 latent接续
            target_latent: "目标latent",
            previous_latent: "上段latent",
            masked_target: "掩码latent",
            patched_model: "打补丁模型",
            positive: "条件",
            model: "模型",
            sigmas: "采样调度",
            frames: "每段帧数(清单)",
            count: "总段数",
            start_sec: "本段起始秒",
            duration_sec: "本段时长",
            frames_now: "本段帧数",
            start_sec_list: "起始秒[全N段]",
            duration_sec_list: "时长[全N段]",
            frames_now_list: "帧数[全N段]",
            // 图像缩放 v2
            image: "图像",
            mask: "蒙版",
            IMAGE: "图像",
            MASK: "蒙版",
            // XiaoHei-遮罩上色
            face_mask: " 脸部遮罩(可空)",
            color_source: " 色源图(可空)",
            // XiaoHei-身份配色
            driving_track_data: " 追踪数据",
            ref_track_data: " 参考图追踪(可空)",
            pose_video_mask: " 彩色块(视频)",
            reference_image_mask: " 参考图彩色块",
            // XiaoHei-视频分段轴
            //  2026-11-13：参数 label 里的 Unicode ▶ 不是家族图案，去掉（英文侧本来就没有）。
            start_frame: " 起始帧",
            seg_frames: " 本段帧数",
            segments_info: " 分段信息",
            video: " 视频",
            // XiaoHei-列表拼批
            frame_count: " 总帧数",
            report: " 拼批报告",
            width: "宽度",
            height: "高度",
            batch_size: "批次大小",
            info: "信息",
            // 图像遮罩缩放（MatchType 端口：接 IMAGE 就是图像，接 MASK 就是蒙版）
            input: "图像/蒙版",
            resized: "缩放结果",
            // 图像批量合并
            images: "图像批次",
            // 宫格故事板
            cell_mask: "格子蒙版",
            grid_preview: "网格预览",
            panel_count: "面板数",
            // 参考图拼接板（image_1..3 由 slotLabel() 的正则统一处理，
            // 不写在这里，避免与 ^image_(\d+)$ 抢命中）
            ref_sheet: "参考表",
            // BBox Region (2026-10-10)
            BBOX: "区域框",
            BOX2: "边界框2",
            //  v1.9.8：内置提示词要用到的 CLIP 输入端口
            clip: "CLIP(提示词)",
            //  v1.9.11：输出口目标框（之前中英都漏映射 → 中文态挂英文）
            face_box: "目标框",
            //  v1.9.11（2026-10-25）：逐目标 mask / ID 分区图（多人替换地基）
            masks: "逐目标mask(一人一张)",
            id_map: "ID分区图(一人一色)",
            //  2026-10-25：深度图输入口（SAM3 给「谁」，深度给「谁在前」）
            depth_map: "深度图(白=近)",
            //  音乐卡点表
            audio: "音频",
            durations: "每段秒数表",
            frames: "每段帧数表",
            count: "总段数",
            // XiaoHei-跟踪上色（2026-10-25）：官方 SAM3_VideoTrack 的跟踪数据口
            track_data: "跟踪数据",
        },
    },
        en: {
            nodes: {
                XHImageResizeV2: "Resize Image v2",
                XHImageBatchMulti: "Image Batch Multi",
                XHRefSheetBuilder: "Ref Sheet Builder",
                XHImageMaskScale: "Image Mask Scale",
                XHImageSize: "Image Size",
                // Storyboard kit (2026-10-09)
                XHStoryboardGrid: "Storyboard Grid",
                XHImageContrast: "Image Contrast",
                XHStoryboardPanelCrop: "Panel Crop",
                XHShapeMaskOverlay: "Shape Mask Overlay",
                XHBBoxRegion: "BBox Region",
                XHSmartFaceMask: "Universal Mask",
                XHBeatCueTable: "Beat Cue Table",
                XHBackgroundRemove: "Background Remove",
                XHH3LatentContinuation: "H3 latent continuation",
                // XiaoHei-H3 action correction (TST, 2026-10-23)
                XHH3TemporalCorrection: "H3 action correction",
                // XiaoHei-Track Colorize (2026-10-25: SAM3 track data -> XiaoHei ID palette + numbers)
                XHTrackColorize: "Track Colorize",
                // XiaoHei-Mask Tint (2026-10-31)
                XHMaskTint: "Mask Tint",
                // XiaoHei-Identity Colorize (2026-10-31: official SCAIL2ColoredMask with user colors)
                XHIdentityColorize: "Identity Colorize",
                // XiaoHei-Video Timeline (2026-10-31)
                XHVideoTimeline: "Video Timeline",
                // XiaoHei-Image List Concat (2026-10-31)
                XHImageListConcat: "Image List Concat",
                H3LTXAdapterConvert: "H3 LTXAdapter Convert",
                H3LTXAdapterLoader: "H3 LTXAdapter Loader",
                XHAudioDuration: "XHAudio Duration",
                XHAudioFromVideo: "XHAudio From Video",
                XHAudioTrimFrames: "XHAudio Trim Frames",
                XHBooleanSwitch: "XHBoolean Switch",
                XHBooleanToggle: "XHBoolean Toggle",
                XHCalculator: "XHCalculator",
                XHCameraAnglePrompt: "XHCamera Angle Prompt",
                XHCameraParam: "XHCamera Param",
                XHColorCorrect: "XHColor Correct",
                XHCompareVideos: "XHCompare Videos",
                XHComposeVideo: "XHCompose Video",
                XHConcatVideo: "XHConcat Video",
                XHFloatVideo: "XHFloat Video",
                XHForLoopEnd: "XHFor Loop End",
                XHForLoopStart: "XHFor Loop Start",
                XHFrameAlign: "XHFrame Align",
                XHGet: "XHGet",
                XHGroupController: "XHGroup Controller",
                XHH3AudioSync: "XHH3 Audio Sync",
                XHImageCacheRead: "XHImage Cache Read",
                XHImageCacheWrite: "XHImage Cache Write",
                XHImageCompare: "XHImage Compare",
                XHImageGetByIndex: "XHImage Get By Index",
                XHImageList: "XHImage List",
                XHImagePrecision: "XHImage Precision",
                XHImageRangeFromBatch: "XHImage Range From Batch",
                XHImageScaleByAspectRatio: "XHImage Scale By Aspect Ratio",
                XHLTXIdentityOverlap: "XHLTXIdentity Overlap",
                XHLabel: "XHLabel",
                XHLabelPix: "XHLabel Pix",
                XHLoadAudio: "XHLoad Audio",
                XHLoadVideo: "XHLoad Video",
                XHLoopIteration: "XHLoop Iteration",
                XHLoopProgress: "XHLoop Progress",
                XHLoopResult: "XHLoop Result",
                XHMSRRelayEncode: "XHMSRRelay Encode",
                XHMathExpression: "XHMath Expression",
                XHMathFloat: "XHMath Float",
                XHMathInt: "XHMath Int",
                XHMultiGet: "XHMulti Get",
                XHMultiSet: "XHMulti Set",
                XHNumberConvert: "XHNumber Convert",
                XHNumberCounter: "XHNumber Counter",
                XHPaint: "XHPaint",
                XHPowerLoraStack: "XHPower Lora Stack",
                XHPureLoraStack: "XHPure Lora Stack",
                XHResolutionSelect: "XHResolution Select",
                XHSamplerSelect: "XHSampler Select",
                XHSeamCorrect: "XHSeam Correct",
                XHSeamFeather: "XHSeam Feather",
                XHSeed: "XHSeed",
                XHSegmentConcat: "XHSegment Concat",
                XHSegmentTable: "XHSegment Table",
                XHSet: "XHSet",
                XHShowText: "Preview as Text",
                XHSimpleMath: "XHSimple Math",
                XHSlider: "XHSlider",
                XHSolidMask: "XHSolid Mask",
                XHSoundPlayer: "XHSound Player",
                XHTimer: "XHTimer",
                XHToneCompensate: "XHTone Compensate",
                XHVAEDecodeTiled: "XHVAEDecode Tiled",
                XHVideoCombine: "XHVideo Combine",
                XHVoiceSeparatorLoader: "XHVoice Separator Loader",
                XHVoiceSeparatorSampler: "XHVoice Separator Sampler",
                XH_ChainPromptSelector: "Chain Prompt Selector",
                XH_DynamicPromptJoin: "Dynamic Prompt Join",
            },
        widgets: {
            audio: "audio (whole track)",
            // XiaoHei-H3 latent continuation
            overlap_frames: "Overlap frames",
            hard_lock: "seam lock",
            is_first: "Is first",
            drift_control: "Drift-Control",
            // XiaoHei-H3 action correction (TST)
            tau: "correction strength (tau)",
            log_diagnostics: "diagnostics log",
            target_sec: "ref. length (sec, mode ①)",
            batch_count: "batch size (0=all)",
            fps: "fps",
            frame_mod: "frame modulus",
            frame_offset: "frame offset",
            bars_per_seg: "bars per segment",
            bar_offset_beats: "bar start (beat)",
            max_segments: "max segments",
            start_offset: "shift all (sec)",
            //  Beat cue table v1.9.27: uneven cuts + single-segment outputs
            mode: "cut source",
            min_seg_sec: "min segment (sec)",
            max_seg_sec: "max segment (0=auto)",
            snap_to_bar: "snap to phrase",
            index: "Index (which segment)",
            width: "width",
            height: "height",
            upscale_method: "Upscale Method",
            keep_proportion: "Keep Proportion",
            pad_color: "Pad Color",
            crop_position: "Crop Anchor",
            divisible_by: "Divisible By",
            device: "device",
            // Image Mask Scale
            resize_mode: "Resize Mode",
            size: "size",
            interpolation: "interpolation",
            divisible_by: "Divisible By",
            inputcount: "Inputs",
            xh_update_inputs: " Update inputs",
            preset: " Target canvas",
            layout: " Layout",
            gap: " Gap",
            crop_fill: " Crop to fill",
            // Storyboard kit
            layout_mode: "layout mode",
            num_panels: "panels",
            columns: "columns",
            rows: "rows",
            border_thickness: "border thickness",
            background_gray_value: "cell gray",
            invert_colors: "invert colors",
            cell_alpha: "transparent cells",
            contrast: "contrast",
            brightness: "brightness",
            strength: "strength",
            // XiaoHei-Mask Tint
            face_expand: "face expand",
            // XiaoHei-Identity Colorize
            id_colors: "identity colors",
            sort_by: "sort order",
            object_indices: "which identities",
            replacement_mode: "replacement mode",
            // XiaoHei-Video Timeline
            segments: "segments (from timeline)",
            shave_edges_pixels: "shave edges",
            offset_y: "offset Y",
            offset_x: "offset X",
            target_aspect_ratio: "target ratio",
            padding_mode: "padding mode",
            order: "output order",
            // Shape Mask Overlay (merged 2026-10-12)
            shape: "shape",
            coord_center: "anchor",
            location_x: "offset X",
            location_y: "offset Y",
            shape_width: "base width",
            shape_height: "base height",
            scale: "scale",
            rotation: "rotation",
            opacity: "opacity",
            blur_radius: "blur radius",
            background_color: "background color",
            shape_color: "shape color",
            frame_width: "canvas width (0=image)",
            frame_height: "canvas height (0=image)",
            color: "fill color",
            feather: "edge feather",
            invert: "invert fill",
            mask_locate: "locate+shape by mask",
            mask_margin: "locate margin %",
            // BBox Region (2026-10-10)
            center_x: "center X ratio",
            center_y: "center Y ratio",
            box_w: "region W ratio",
            box_h: "region H ratio",
            // Smart Face Mask (2026-10-12)
            search_mode: "search area",
            exclude_cx: "exclude center X ratio",
            exclude_cy: "exclude center Y ratio",
            exclude_w: "exclude W ratio",
            exclude_h: "exclude H ratio",
            exclude_enable: "enable exclude",
            exclude_color: "exclude block color",
            //  2026-11-08：删掉这里误写的 6 条中文（下方 430 行附近已有正确的英文版，JS 后者覆盖前者）
            // 2026-10-25: extra exclusion zones (2..N), maintained by the editor's "+ Add zone"
            exclude_zones: "extra exclusion zones (JSON, editor-managed)",
            // 2026-10-25: search area (detect only inside) — mirror of the exclusion zones
            search_enable: "enable search area",
            search_cx: "search area center X",
            search_cy: "search area center Y",
            search_w: "search area width",
            search_h: "search area height",
            search_zones: "extra search zones (JSON, editor-managed)",
            mask_margin: "locate margin %",
            pick_mode: "which face",
            face_ratio: "face height ratio (top crop)",
            shape_scale: "shape scale",
            region_x: "region center X",
            region_y: "region center Y",
            region_w: "region width",
            region_h: "region height",
            fallback_draw: "draw shape if no face",
            threshold: "threshold",
            refine_iterations: "refine passes",
            shape_color: "overlay color",
            expand_left: "expand L (x face W)",
            expand_right: "expand R (x face W)",
            expand_top: "expand top (x face H)",
            expand_bottom: "expand bottom (x face H)",
            color_pick_ref: "color-pick face",
            prompt: "prompt (built-in)",
            //  v1.9.11 (2026-10-25): mode split / multi-target / ID paint
            mask_mode: "mode",
            target_scope: "which targets",
            target_index: "Nth target (0-based)",
            target_count: "first N",
            id_paint: "ID paint",
            id_sort: "sort order",
            id_color: "ID color",
            id_alpha: "ID overlay opacity",
            depth_mode: "depth usage",
            depth_near: "keep nearest only",
            opacity: "opacity",
            blur_radius: "blur radius",
            feather: "feather",
            rotation: "rotation",
            invert: "invert",
            face_box: "target box",
            // Background Remove (2026-10-18)
            image: "input image",
            model: "model",
            mask_feather: "mask feather",
            mask_offset: "mask offset",
            invert: "invert",
            // XiaoHei-Track Colorize (2026-10-25)
            draw_numbers: "draw 1234 numbers",
        },
        slots: {
            //  Beat cue table
            durations: "durations",
            // XiaoHei-H3 latent continuation
            target_latent: "Target latent",
            previous_latent: "Previous latent",
            masked_target: "Masked target",
            patched_model: "Patched model",
            positive: "positive",
            model: "model",
            sigmas: "sigmas",
            frames: "frames",
            count: "count",
            start_sec: "start sec",
            duration_sec: "duration",
            frames_now: "frames",
            start_sec_list: "start sec [all N]",
            duration_sec_list: "duration [all N]",
            frames_now_list: "frames [all N]",
            image: "image",
            mask: "mask",
            IMAGE: "IMAGE",
            MASK: "MASK",
            // XiaoHei-Mask Tint
            face_mask: "face mask (optional)",
            color_source: "color source (optional)",
            // XiaoHei-Identity Colorize
            driving_track_data: "track data",
            ref_track_data: "reference track (optional)",
            pose_video_mask: "colored mask (video)",
            reference_image_mask: "reference colored mask",
            // XiaoHei-Video Timeline
            start_frame: "start frame",
            seg_frames: "frames in segment",
            segments_info: "segments info",
            video: "video",
            // XiaoHei-Image List Concat
            frame_count: "total frames",
            report: "concat report",
            width: "width",
            height: "height",
            batch_size: "Batch Size",
            info: "info",
            // Image Mask Scale (MatchType port)
            input: "input",
            resized: "resized",
            images: "images",
            ref_sheet: "Ref Sheet",
            // Storyboard kit
            cell_mask: "Cell Mask",
            grid_preview: "Grid Preview",
            panel_count: "Panel Count",
            // BBox Region
            BBOX: "BBOX",
            BOX2: "BOX2",
            //  v1.9.11：CLIP 输入端口必须有 en 映射 —— slotLabel() 命中不到时会「保留上一次的
            //   label」，切到英文就会挂着一串中文（原 bug：永远显示 "CLIP(提示词)"）。
            clip: "CLIP (prompt)",
            //  v1.9.11：输出口目标框（必须两边都给 —— 缺一边就会「挂上一次的语言」）
            face_box: "target box",
            // v1.9.11 (2026-10-25): per-target masks / ID map
            masks: "per-target masks",
            id_map: "ID map",
            // 2026-10-25: depth map input (white = closer)
            depth_map: "depth map (white=near)",
            audio: "audio",
            durations: "durations",
            frames: "frames",
            count: "count",
            // XiaoHei-Track Colorize (2026-10-25): official SAM3_VideoTrack data port
            track_data: "Track Data",
        },
    },
};

// 下拉框「中文态纯中文、英文态回落原值」（走官方 getOptionLabel 钩子；key 是英文存值，不动）
// upscale_method / keep_proportion / crop_position / preset / device 的**值本身就是中文**，无需映射
const COMBO_LABELS = {
    //  2026-10-31：XiaoHei-身份配色 的排序方式（用户原话：「这英文我看不懂」）
    //   值 = 存档值（不动），只换显示文字。
    sort_by: {
        none: "不排序（按SAM3原序·颜色跟人走）",
        left_to_right: "从左到右（左边的人排第1）",
        area: "从大到小（最大的人排第1）",
    },
    //  v1.9.7：万能遮罩 auto 取色的「取色基准」——多目标时以哪个目标为中心往外扩去取色
    color_pick_ref: {
        center: "最靠中间的目标",
        largest: "最大的目标",
        union: "全部目标(并集)",
    },
    layout: {
        horizontal: "横向排列",
        vertical: "纵向排列",
        grid: "网格",
    },
    resize_mode: {
        shorter_dimension: "按短边缩放",
        longer_dimension: "按长边缩放",
        width: "按宽度",
        height: "按高度",
    },
    interpolation: {
        lanczos: "兰索斯",
        "nearest-exact": "最近邻",
        bilinear: "双线性",
        bicubic: "双三次",
        area: "区域平均",
    },
    // 宫格故事板
    layout_mode: {
        auto: "按格数自动",
        manual: "手动列×行",
    },
    order: {
        row_major: "行优先（左→右）",
        column_major: "列优先（上→下）",
    },
    padding_mode: {
        center_crop_zoom: "居中裁切放大",
        letterbox_black: "缩放补黑边",
    },
    target_aspect_ratio: {
        original_proportions: "保持原比例",
        "1:1 (Square)": "1:1 方图",
        "16:9 (Widescreen)": "16:9 横屏",
        "9:16 (Vertical)": "9:16 竖屏",
        "21:9 (Ultrawide)": "21:9 超宽",
    },
    // 形状遮罩覆盖（二合一 / 2026-10-12：11 种形状）
    // 万能遮罩额外有 sam_mask（SAM 原始遮罩）+ head（目标框以上整块融合）；老节点没有该选项，加了也不影响它
    shape: {
        //  v1.17.7：「SAM原始遮罩(只遮脸)」→「SAM3遮罩」—— 这节点现在什么都能遮了，
        //   写什么提示词就找什么（face=脸 / person=人 / hand=手…）。只改显示文字，原值 sam_mask 不动。
        sam_mask: "SAM3遮罩(AI找什么遮什么)",
        head: "目标框以上(四向外扩)",
        manual_box: "手动框(不用模型)",
        circle: "圆",
        square: "正方",
        rectangle: "矩形",
        semicircle: "半圆",
        quarter_circle: "1/4圆",
        ellipse: "椭圆(扁)",
        triangle: "三角",
        cross: "十字",
        star: "星形",
        radial: "放射扇形",
    },
    coord_center: {
        image_center: "画布中心",
        left_top: "左上角",
    },
    // 万能遮罩搜索范围（2026-10-12）
    search_mode: {
        whole_image: "全图找",
        center_region: "只在中心区域找",
        custom_box: "自定义框内找",
    },
    //  v1.9.11（2026-10-25）：模式 / 多目标 / ID 上色 —— 显示中文、存值仍是英文
    mask_mode: {
        //  2026-10-25：① ② 数字前缀全部换成符号（用户原话「SAM 前面不要用 1 这个数字」），
        //   且「手动模式」改名「手遮模式」—— 跟画布红框标签「手遮框1」、工具条大按钮同词根
        sam: " SAM模式(接模型·自动找)",
        manual: " 手遮模式(不接模型·红框遮)",
    },
    target_scope: {
        all: "全部(一个不少)",
        index: "只要第 N 个",
        first_n: "只要前 N 个",
    },
    id_paint: {
        off: "关(用遮挡色)",
        palette: "调色板(一人一色)",
        single: "统一一个颜色",
    },
    id_sort: {
        detect: "检测顺序(会跳)",
        left_right: "从左到右(最稳)",
        area: "面积从大到小",
    },
    //  2026-10-25：深度图合成（SAM3 给「谁」，深度给「谁在前」）
    depth_mode: {
        off: "关(不用深度)",
        sort: "① 按远近排序(最近的拿红)",
        occlusion: "② 重叠归前面那个人",
        both: "③ 两个都要 推荐",
    },
    //  音乐卡点表「切点来源」+「吸附开关」（2026-10-14）
    mode: {
        grid: "① 按小节线均分(卡拍)",
        structure: "② 按内容换段(长短不一)",
        gap: "③ 按气口(能量空档)",
    },
    snap_to_bar: {
        on: "开 · 拽到最近小节线",
        off: "关 · 保持原位置",
    },
};

function normalizeType(type) {
    return typeof type === "string" ? type.replace(/^[^\w]+/, "") : type;
}

function isXHNode(type) {
    if (typeof type !== "string") return false;
    return !!XH_I18N.zh.nodes[normalizeType(type)];
}

// 动态端口（image_1 / image_2 / …）单独处理
function slotLabel(name, lang) {
    if (!name) return null;
    const m = /^image_(\d+)$/.exec(name);
    if (m) return lang === "zh" ? `图像 ${m[1]}` : `image_${m[1]}`;
    const pack = XH_I18N[lang];
    return (pack && pack.slots[name]) || null;
}

// 形状遮罩覆盖：把 color 文本框换成「填充色」色块 + 家族取色器（showXHPicker）
// 返回要并进工具条的 DOM 元素；原生 color 文本框只做视觉隐藏（不动 name、不删 widgets）
// 工具条右侧的两个取色块（2026-10-12 二合一升级）：形状色 + 背景色。
// 绑定到后端 shape_color / background_color 两个 STRING(hex) 控件；把原生输入框视觉隐藏。
// 通用件：把一个后端 STRING(hex) 控件换成「小标签 + 色块」。
// 点色块弹家族取色器（XiaoHei 12 色 + 自定义）；原生文本框只做视觉隐藏（不删 widget、不改 name）。
// 返回 { box, refresh }；refresh() 用于切语言时重刷标签文案。tip 传了才加 hover 提示（老节点不传 ⇒ 行为零变化）。
function mkColorSwatch(node, wName, zhLabel, enLabel, fallback, resetZh, resetEn, tip, extraSwatches) {
    const cw = (node.widgets || []).find((w) => w && w.name === wName);
    const box = document.createElement("div");
    //  v1.9.15：flex:0 0 auto —— 色板本身**永不被压缩**（工具条空间不够时，
    //   该缩的是后面那句可省略的长提示，绝不能把色板挤没）
    box.style.cssText = "display:flex;align-items:center;gap:3px;flex:0 0 auto;";
    const label = document.createElement("span");
    label.style.cssText = "font-size:11px;color:#e8e8e8;white-space:nowrap;flex:0 0 auto;";
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.style.cssText = "width:40px;height:20px;border:1px solid rgba(255,255,255,.35);border-radius:4px;cursor:pointer;flex:0 0 auto;";
    if (tip) swatch.title = tip;
    const refresh = () => {
        const lang = window.XH_LANG || "zh";
        label.textContent = lang === "zh" ? zhLabel : enLabel;
        const v = cw && cw.value;
        //  v1.9.2：值 = "auto" 时显示斜纹（表示「自动跟背景」，不是某个具体色）
        if (String(v || "").trim().toLowerCase() === "auto") {
            swatch.style.background = "repeating-linear-gradient(45deg,#5a5a5a 0 4px,#9d9d9d 4px 8px)";
            swatch.title = (tip ? tip + " · " : "") + (lang === "zh" ? "当前=自动(跟背景)" : "current = auto (match background)");
        } else {
            swatch.style.background = v || fallback;
            if (tip) swatch.title = tip;
        }
    };
    swatch.onclick = (e) => {
        e.stopPropagation();
        if (!cw) return;
        showXHPicker(swatch, {
            id: "xh_shape_" + wName + "_pop",
            current: cw.value || fallback,
            resetLabel: (window.XH_LANG === "zh" ? resetZh : resetEn),
            resetValue: fallback,
            extraSwatches: extraSwatches || [],
            onPick: (hex) => { if (hex && cw) { cw.value = hex; refresh(); } },
        });
    };
    box.appendChild(label); box.appendChild(swatch);
    // 视觉隐藏原生文本框（不删、不改 hidden）
    //  2026-10-31 修：Vue Nodes 模式下输入框挂在 **cw.inputEl**（老版画布才是 element/el）。
    //    原先只取 element||el ⇒ Vue 下原生文本框**根本没被藏住** ⇒ 面板里同时出现
    //    「工具条色块」和「原生文本框」两套，两套还各说各话（同色铁律：状态别让人猜）。
    if (cw) {
        cw.computeSize = () => [0, 0];
        cw.getMinHeight = () => 0;
        cw.draw = () => {};
        cw.mouse = () => false;
        const el = cw.inputEl || cw.element || cw.el;
        if (el && el.style) { el.style.display = "none"; el.style.height = "0px"; el.style.overflow = "hidden"; }
    }
    refresh();
    return { box, refresh };
}

// XiaoHei-遮罩上色：上色场景的常用色（品牌 12 色里没有的鲜艳纯色）。
// 追加在家族调色板之后，不替换它 ⇒ 品牌色 + 常用色 + 自定义，三层都有。
const XH_TINT_COMMON = [
    { zh: "纯绿(绿幕)", en: "Pure Green", hex: "#00FF00" },
    { zh: "纯红", en: "Pure Red", hex: "#FF0000" },
    { zh: "品红", en: "Magenta", hex: "#FF00FF" },
    { zh: "纯蓝", en: "Pure Blue", hex: "#0000FF" },
    { zh: "纯黄", en: "Pure Yellow", hex: "#FFFF00" },
    { zh: "纯青", en: "Pure Cyan", hex: "#00FFFF" },
    { zh: "纯白", en: "Pure White", hex: "#FFFFFF" },
    { zh: "纯黑", en: "Pure Black", hex: "#000000" },
];

// XiaoHei-遮罩上色：color 文本框换成可视化色块（家族取色器：品牌 12 色 + 上色常用色 + 自定义）。
// 原生文本框只做视觉隐藏（不删 widget、不改 name ⇒ 不影响 widgets_values 存档位）。
//
//  2026-10-31 用户反馈：「色号是个绿幕也也没，我没看出来有什么什么作用」
//   根因：后端 run() 的逻辑是「**色源图口一接，色号就完全不参与**」，
//         而多身份上色的标准接法必然接色源图 ⇒ 色号永远是个摆设。
//   ⇒ 修法：**按接线显隐** —— 接了色源图就藏掉色号（并给一句说明它被谁接管），
//     没接色源图才显示色号。界面从此「只显示当前真正生效的那个参数」。
//    只藏不删：色号 widget 仍在 widgets 里 ⇒ widgets_values 存档位不动（老档照样能读）。
function buildTintColorControl(node) {
    // 幂等：重复调用不要再包一层 onConfigure/onRemoved/onConnectionsChange
    if (node._xhTintBuilt) return node._xhTintWrap;
    node._xhTintBuilt = true;

    const wrap = document.createElement("div");
    node._xhTintWrap = wrap;
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:0 0 auto;";
    const sw = mkColorSwatch(
        node, "color", "色号", "Tint", "#00FF00", "默认绿", "Default Green",
        (window.XH_LANG === "zh"
            ? "没接「色源图」时，铺在遮罩区上的纯色（点开有常用色板 + 自定义）"
            : "solid color painted on the masked area (no color source connected)"),
        XH_TINT_COMMON);
    wrap.appendChild(sw.box);

    // 「色源图已接管」的说明条（接了色源图时替代色号显示）
    const note = document.createElement("span");
    note.style.cssText = "font-size:10px;color:#7fd1a0;white-space:nowrap;flex:0 0 auto;";
    wrap.appendChild(note);

    // 色源图口接了没？（Vue 模式下输入口在 node.inputs 上）
    const hasColorSource = () => {
        const inp = (node.inputs || []).find((i) => i && i.name === "color_source");
        return !!(inp && inp.link != null);
    };

    const refresh = () => {
        const on = hasColorSource();
        // 色号控件：接了色源图就藏掉**整行**（含标签）。
        //  只动 w.hidden —— 原生输入框由 mkColorSwatch 永久隐藏（工具条色块代替它），
        //    这里千万别去改它的 display，否则没接色源图时输入框会重复露出来。
        //    w.hidden 与序列化无关 ⇒ 值照样存、照样参与执行（官方 legacy facade）。
        const cw = (node.widgets || []).find((w) => w && w.name === "color");
        if (cw) {
            try { cw.hidden = on; } catch (e) {}
        }
        // 工具条上的色块本体也藏（mkColorSwatch 建的是独立 DOM，不受 w.hidden 管）
        sw.box.style.display = on ? "none" : "flex";
        // 说明条
        const zh = (window.XH_LANG || "zh") === "zh";
        note.textContent = on
            ? (zh ? " 颜色由「色源图」决定（色号已让位）" : " color comes from the color source")
            : "";
        sw.refresh();
    };

    node._xhFillRefresh = () => { refresh(); };   // 语言切换时重刷（顺带刷显隐）
    node._xhTintRefresh = refresh;

    // 插拔「色源图」线 ⇒ 显隐要跟着翻（照家族万能遮罩的 onConnectionsChange 范式）
    const occ = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const r = occ ? occ.apply(this, arguments) : undefined;
        try { refresh(); } catch (e) {}
        return r;
    };

    //  轮询兜底：新前端插线的回调路径不保证一定触发 onConnectionsChange
    //   （本次实测 connectOutput 都不存在 ⇒ 只能靠事件）⇒ 加一层低频轮询，
    //   **只在状态变化时才写 DOM**（不闪、不费）。
    let lastOn = null;
    const tick = () => {
        if (!node || node._xhTintDead) return;
        try {
            const on = hasColorSource();
            if (on !== lastOn) { lastOn = on; refresh(); }
        } catch (e) {}
    };
    const timer = setInterval(tick, 700);
    node._xhTintTimer = timer;
    // 节点被删 ⇒ 停掉轮询（否则定时器泄漏）
    const orm = node.onRemoved;
    node.onRemoved = function () {
        node._xhTintDead = true;
        try { clearInterval(timer); } catch (e) {}
        return orm ? orm.apply(this, arguments) : undefined;
    };

    // 读档后也要重算（线是随档回来的）
    const ocf = node.onConfigure;
    node.onConfigure = function () {
        const r = ocf ? ocf.apply(this, arguments) : undefined;
        try { refresh(); } catch (e) {}
        return r;
    };

    refresh();
    return wrap;
}

function buildFillColorControl(node) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:0 0 auto;";

    const a = mkColorSwatch(node, "shape_color", "形状色", "Shape", "#e8e8e8", "默认灰", "Default Gray");
    const b = mkColorSwatch(node, "background_color", "背景色", "BG", "#000000", "默认黑", "Default Black");
    wrap.appendChild(a.box);
    wrap.appendChild(b.box);
    node._xhFillRefresh = () => { a.refresh(); b.refresh(); };   // 语言切换时重刷文案
    return wrap;
}

// ══════════════════════════════════════════════════════════════════════
// XiaoHei-身份配色（XHIdentityColorize）—— 可视化「各身份颜色」编辑器
//
// 【要解决的诉求（用户原话 2026-10-31）】
//   「我不管是通过这个那个还是哪个的节点啊，我要就是得到的效果是我能够控制颜色，
//     控制颜色，控制颜色，控制生出来的视频的。彩色块儿是颜色」
//   「第一个人物添加添加按钮也好，添加按键也好……从左到右第一个是什么颜色，
//     第二个什么颜色，第三个什么颜色」
//
// 【交互设计】
//   节点 body 里挂一条「身份色板」：
//     [1■][2■][3■][4■][5■] [＋] [清空]
//     ↑ 每个方块 = 一个身份（第1个方块 = 排序后第1个人），点一下弹家族取色器换色
//     ↑ 数字角标写明这是第几个身份，用户一眼知道「从左到右第1个人」对应哪块
//     ↑ 「＋」= 再加一个人（多一个色块）
//   数据落在后端 id_colors 控件里（JSON 数组），改色 ⇒ 写回控件 ⇒ 存档跟着走。
//
// 【为什么不用原生文本框】
//   id_colors 是 STRING 控件，值是 JSON 数组 ["#FF0000",...]。
//   手敲 JSON 用户不会 ⇒ 视觉隐藏它，改用上面的色板编辑（同「遮罩上色」的做法）。
//    只做视觉隐藏，**绝不删 widget / 不改 name** ⇒ widgets_values 存档位不动。
// ══════════════════════════════════════════════════════════════════════

// 身份配色板默认色（用户没配时的兜底；与后端 _OFFICIAL_PALETTE 同序）
const XH_IDCOLOR_DEFAULT = ["#FF0000", "#00FF00", "#1F78B5", "#FF800D", "#9467BD", "#00FFFF"];

function xhIdColor_parse(raw) {
    const s = String(raw || "").trim();
    if (!s) return [];
    if (s.startsWith("[")) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
        } catch (e) { /* 落到下面按逗号切 */ }
    }
    return s.replace(/，/g, ",").replace(/、/g, ",").split(",").map((x) => x.trim()).filter(Boolean);
}

function xhIdColor_write(node, list) {
    const cw = (node.widgets || []).find((w) => w && w.name === "id_colors");
    if (!cw) {
        console.warn("[XiaoHei 身份配色] 节点上没有「id_colors」参数 ⇒ ComfyUI 是旧版后端，请【完全重启 ComfyUI】");
        return;
    }
    cw.value = JSON.stringify(list);
    try { cw.callback && cw.callback(cw.value); } catch (e) {}
    try { node.graph?.setDirtyCanvas(true, true); } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

function buildIdColorControl(node) {
    if (node._xhIdColorUI) return node._xhIdColorUI;

    const root = document.createElement("div");
    root.style.cssText = "width:100%;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:3px;flex-wrap:wrap;";
    root.appendChild(row);

    const tip = document.createElement("div");
    tip.style.cssText = "font-size:10px;color:#8a93a6;line-height:1.35;";
    root.appendChild(tip);

    const state = { list: [] };

    function refreshText() {
        const zh = (window.XH_LANG || "zh") === "zh";
        tip.textContent = zh
            ? "每个色块 = 一个身份（按下面「排序方式」排完后的第几个人）。点色块换色，＋ 加一个人。"
            : "Each swatch = one identity (in sorted order). Click a swatch to recolor, ＋ to add one.";
    }

    function draw() {
        row.innerHTML = "";
        state.list.forEach((hex, i) => {
            const cell = document.createElement("div");
            cell.style.cssText = "position:relative;display:inline-flex;";

            const b = document.createElement("button");
            b.type = "button";
            b.style.cssText = "width:22px;height:22px;border:1px solid rgba(255,255,255,.35);border-radius:4px;cursor:pointer;padding:0;background:" + hex + ";";
            b.title = (window.XH_LANG || "zh") === "zh"
                ? ("第 " + (i + 1) + " 个身份：" + hex + "（点开换色）")
                : ("Identity " + (i + 1) + ": " + hex);
            b.addEventListener("mousedown", (e) => e.preventDefault());
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                showXHPicker(b, {
                    id: "xh_idcolor_pop_" + (node.id || "0") + "_" + i,
                    current: hex,
                    resetLabel: (window.XH_LANG || "zh") === "zh" ? "默认" : "Default",
                    resetValue: XH_IDCOLOR_DEFAULT[i % XH_IDCOLOR_DEFAULT.length],
                    extraSwatches: XH_TINT_COMMON,
                    onPick: (h) => {
                        if (!h) return;
                        state.list[i] = h;
                        xhIdColor_write(node, state.list);
                        draw();
                    },
                });
            });
            cell.appendChild(b);

            // 序号角标：让用户一眼知道「从左到右第 1 个人」对应哪块
            const badge = document.createElement("span");
            badge.textContent = String(i + 1);
            badge.style.cssText = "position:absolute;right:-3px;top:-4px;min-width:11px;height:11px;line-height:10px;text-align:center;"
                + "font:9px/10px monospace;color:#100c13;background:#f2ff59;border-radius:6px;pointer-events:none;";
            cell.appendChild(badge);
            row.appendChild(cell);
        });

        // 「＋ 加一个人」
        const add = document.createElement("button");
        add.type = "button";
        //  2026-11-13 家族图标统一：Unicode ＋ → 图标库「加」→ plus。
        add.innerHTML = xhIconHTML("加", { size: 12, color: "current" });
        add.title = (window.XH_LANG || "zh") === "zh" ? "再加一个身份" : "Add one identity";
        add.style.cssText = "width:22px;height:22px;border:1px dashed #6a6a6a;border-radius:4px;cursor:pointer;"
            + "display:inline-flex;align-items:center;justify-content:center;"
            + "background:#2b2b2b;color:#e8e8e8;font:13px sans-serif;line-height:1;";
        add.addEventListener("mousedown", (e) => e.preventDefault());
        add.addEventListener("click", (e) => {
            e.stopPropagation();
            state.list.push(XH_IDCOLOR_DEFAULT[state.list.length % XH_IDCOLOR_DEFAULT.length]);
            xhIdColor_write(node, state.list);
            draw();
        });
        row.appendChild(add);

        // 「清空」
        const clr = document.createElement("button");
        clr.type = "button";
        clr.textContent = (window.XH_LANG || "zh") === "zh" ? "清空" : "Clear";
        clr.title = (window.XH_LANG || "zh") === "zh" ? "清空（后端会退回官方默认 6 色板）" : "Clear (falls back to the official 6-color palette)";
        clr.style.cssText = "height:22px;padding:0 6px;border:1px solid #444;border-radius:4px;cursor:pointer;"
            + "background:#2b2b2b;color:#c9d1e0;font:11px sans-serif;";
        clr.addEventListener("mousedown", (e) => e.preventDefault());
        clr.addEventListener("click", (e) => {
            e.stopPropagation();
            state.list = [];
            xhIdColor_write(node, state.list);
            draw();
        });
        row.appendChild(clr);
    }

    function syncFromWidget() {
        const cw = (node.widgets || []).find((w) => w && w.name === "id_colors");
        const parsed = xhIdColor_parse(cw && cw.value);
        state.list = parsed.length ? parsed : [];
        draw();
    }

    // 视觉隐藏原生 id_colors 文本框（只藏，不删 ⇒ 存档位不动）
    //  Vue Nodes 模式：**唯一有效的开关是 w.hidden = true**
    //    （同 xh_video_timeline.js 藏 segments 的做法；官方 xh_chainprompt.js 同样说明）
    function hideIdColorsWidget() {
        const cw = (node.widgets || []).find((w) => w && w.name === "id_colors");
        if (!cw) return;
        try { cw.hidden = true; } catch (e) {}
        try { cw.computeSize = () => [0, 0]; } catch (e) {}
        try { cw.getMinHeight = () => 0; } catch (e) {}
        try { cw.draw = () => { }; } catch (e) {}
        try { cw.mouse = () => false; } catch (e) {}
        const el = cw.inputEl || cw.element || cw.el;
        if (el && el.style) {
            el.style.display = "none";
            el.style.height = "0px";
            el.style.minHeight = "0px";
            el.style.overflow = "hidden";
        }
    }

    // 挂成独立 DOM widget（放在节点 body，不占工具条的 28px 高度）
    try {
        node.addDOMWidget("xh_id_color_ui", "custom", root, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => 46,
        });
    } catch (e) { console.warn("[XiaoHei 身份配色] DOM widget 挂载失败:", e); }

    syncFromWidget();
    hideIdColorsWidget();
    refreshText();

    // 读档后同步（老档的 id_colors 也要显示出来）
    try {
        const origCfg = node.onConfigure;
        node.onConfigure = function () {
            const r = origCfg ? origCfg.apply(this, arguments) : undefined;
            try { hideIdColorsWidget(); } catch (e) {}
            try { syncFromWidget(); } catch (e) {}
            return r;
        };
    } catch (e) {}

    const ui = {
        root,
        refresh: () => { refreshText(); syncFromWidget(); },
    };
    node._xhIdColorUI = ui;
    return ui;
}

// XiaoHei-万能遮罩：工具条右侧两个色板 —— 遮挡色（最终盖在目标上的色）+ 排除块色（只喂 SAM3 看）。
// 2026-10-12 v1.9.1：原来这俩是手敲 hex 的文本框，用户看不懂 ⇒ 全部换成可视化色板。
function buildSMFColorControl(node) {
    const wrap = document.createElement("div");
    //  v1.9.15：由 flex:0 0 auto 改为 **flex:1 1 0**（基准 0 + 可伸可缩）。
    //   关键坑：flex-wrap 的**换行判定按 flex-basis（内容宽度）**算，光加 flex-shrink/min-width:0
    //   没用 —— 内容 441 > 剩余 272 依然换行，而插槽定高 ⇒ 第二行被裁（用户报的「功能键消失」）。
    //   把 basis 设 0：换行判定里它只占 0，永远排得下 ⇒ 不换行；宽度由剩余空间分配。
    wrap.style.cssText = "display:flex;align-items:center;gap:8px;flex:1 1 0;min-width:0;";
    //  v1.9.2：遮挡色默认灰白 #e8e8e8；右侧多一个「自动」按钮 → 让遮挡色跟着目标周围的背景色走
    const a = mkColorSwatch(node, "shape_color", "遮挡色", "Overlay", "#e8e8e8", "默认灰白", "Default Gray",
        (window.XH_LANG === "zh" ? "最终盖在目标上的颜色；点右侧「自动」可让它跟背景色走" : "final overlay color on the target; click Auto to match the surrounding background"));
    const acw = (node.widgets || []).find((w) => w && w.name === "shape_color");
    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    paintBarBtn(autoBtn, "neutral");
    autoBtn.style.cssText = autoBtn.style.cssText
        + "height:20px;padding:0 6px;font:11px sans-serif;";   // 保留它 20px 的小尺寸;
    const refreshAuto = () => {
        const zh = (window.XH_LANG || "zh") === "zh";
        const on = acw && String(acw.value || "").trim().toLowerCase() === "auto";
        autoBtn.textContent = zh ? "自动" : "Auto";
        //  2026-11-15 用户拍板：自动键点亮时不要变绿（与模式键同一诉求）。
        //   改「中性高亮」：亮一档的石墨底 + 亮描边 + 加粗亮字，开/关闭仍然一眼可辨，
        //   且走官方主题变量（深浅主题自动适配），不再写死 hex。
        autoBtn.style.background = on ? "var(--color-background-info, #3b4250)" : "var(--color-background-secondary, #2b2b2b)";
        autoBtn.style.color = on ? "var(--color-text-primary, #e9edf2)" : "var(--color-text-secondary, #c9d1e0)";
        autoBtn.style.borderColor = on ? "var(--color-border-info, #6b7688)" : "var(--color-border-tertiary, #3a3a3a)";
        autoBtn.style.fontWeight = on ? "700" : "600";
        autoBtn.title = zh
            ? (on ? "当前=自动跟背景（点一下改回灰白）" : "点一下：遮挡色自动探测背景色（取目标左/右/上外扩那一圈里最多的颜色，用「左扩/右扩/上扩」调远近）")
            : (on ? "current = auto (match background); click to set back to gray" : "click: auto-sample the median color around the face");
    };
    autoBtn.onclick = (e) => {
        e.stopPropagation();
        if (!acw) return;
        const on = String(acw.value || "").trim().toLowerCase() === "auto";
        acw.value = on ? "#e8e8e8" : "auto";
        a.refresh(); refreshAuto();
        refreshHead();          //  v1.9.5：head 提示里会显示「色=auto」与否，跟着刷
    };
    a.box.appendChild(autoBtn);
    refreshAuto();
    const b = mkColorSwatch(node, "exclude_color", "排除块色", "Exclude", "#000000", "默认黑", "Default Black",
        (window.XH_LANG === "zh"
            ? "盖住排除区的颜色（只喂 SAM3 看，不出现在最终输出里；默认纯黑）"
            : "color painted over the excluded area (fed to SAM3 only, not in the output; default black)"));
    wrap.appendChild(a.box);
    wrap.appendChild(b.box);
    //  v1.9.5：shape=head（目标框以上）时，范围由 expand_left/right/top/bottom 四个参数决定 ⇒ 给个可见提示
    //  v1.9.15：这句**必须可收缩**（flex:0 1 auto + min-width:0 + 省略号）。
    //   它是工具条里唯一的长文本，也是唯一该让位的东西；不然它一出现就把
    //   中/EN、、色板挤到第二行，而插槽定高 ⇒ 那一行直接被裁掉（用户报的「功能键消失」）。
    const headHint = document.createElement("span");
    headHint.style.cssText =
        "font-size:10px;color:#7fd1a0;white-space:nowrap;" +
        "flex:0 1 auto;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;";
    const refreshHead = () => {
        const sw = (node.widgets || []).find((w) => w && w.name === "shape");
        const on = sw && String(sw.value || "").trim().toLowerCase() === "head";
        const zh = (window.XH_LANG || "zh") === "zh";
        const auto = acw && String(acw.value || "").trim().toLowerCase() === "auto";
        if (!on) { headHint.textContent = ""; return; }
        headHint.textContent = zh
            ? (auto ? "目标框以上：范围看「左/右/上/下扩」· 色=auto(跟背景)" : "目标框以上：范围看「左/右/上/下扩」· 点「自动」可跟背景融合")
            : (auto ? "face-up rect: see expand L/R/top/bottom · color = auto" : "face-up rect: see expand L/R/top/bottom · click Auto to blend into background");
    };
    wrap.appendChild(headHint);
    //  2026-11-08 修「工具条不跟随中/EN」：原来这里是**直接赋值**，把 mkSMFModeBtn /
    //   mkSMFResetBtn 先前挂好的刷新链整条冲掉 ⇒ 切 EN 后蓝色模式按钮和「默认」按钮还留中文。
    //   改成「包一层」保留旧链（与 mkSMFIdColorRow:1196 同一写法），色板照刷、前面的也照刷。
    const prevFillRefresh = node._xhFillRefresh;
    node._xhFillRefresh = () => {
        try { prevFillRefresh && prevFillRefresh(); } catch (e) {}
        a.refresh(); b.refresh(); refreshAuto(); refreshHead();
    };
    node._xhSMFHeadRefresh = refreshHead;
    refreshHead();
    // shape 下拉切到/离开 head 时，实时刷新那句提示（包一层 widget.callback，不动原逻辑）
    const swShape = (node.widgets || []).find((w) => w && w.name === "shape");
    if (swShape && !swShape._xhSMFHeadHooked) {
        swShape._xhSMFHeadHooked = true;
        const ocb = swShape.callback;
        swShape.callback = function (v) {
            const r = ocb ? ocb.apply(this, arguments) : undefined;
            try { node._xhSMFHeadRefresh && node._xhSMFHeadRefresh(); } catch (e) {}
            return r;
        };
    }
    return wrap;
}

// XiaoHei-万能遮罩：ID 颜色可视化色板（2026-10-25，用户反馈「ID 颜色还是手敲 hex，该配个色板」）。
//   · 复用 mkColorSwatch 同款取色器，点色板弹盘选色，不再手敲 hex
//   · 三模式联动（smfIdColorMode）：off = 整行藏；palette = 置灰 + 黄字警告「内置调色板第1个=红，此色不生效」；
//     single = 正常可点。治「设了 #E2E4BA 出来却是红圆」的灵异事件
//   · 挂在编辑器 wrap 顶部（stage 之前），零 addDOMWidget 下标风险；语言切换走 _xhFillRefresh 链
function mkSMFIdColorRow(node) {
    // 没有 id_color widget 的节点（老 XHShapeMaskOverlay 等）不建行 —— 返回 null，调用方跳过
    if (!(node.widgets || []).find((w) => w && w.name === "id_color")) return null;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 2px 6px;box-sizing:border-box;";
    const a = mkColorSwatch(node, "id_color", "ID 颜色", "ID", "#1F78B5", "默认蓝", "Default Blue",
        (window.XH_LANG === "zh"
            ? "ID 上色选 single 时，所有目标用这个颜色盖（半透明叠加，肉眼核对用）"
            : "color used for every target when id_paint=single (semi-transparent overlay for visual check)"));
    row.appendChild(a.box);
    const warn = document.createElement("span");
    warn.style.cssText = "font-size:10px;color:#e6c86a;white-space:normal;line-height:1.3;flex:1 1 auto;min-width:0;";
    row.appendChild(warn);
    node._xhIdRow = row;
    node._xhIdSwatch = a;
    node._xhIdWarn = warn;
    // 语言切换链：包一层，不动别人挂的 _xhFillRefresh
    const oldRefresh = node._xhFillRefresh;
    node._xhFillRefresh = () => { try { oldRefresh && oldRefresh(); } catch (e) {} try { a.refresh(); smfIdColorMode(node); } catch (e) {} };
    smfIdColorMode(node);
    return row;
}
// ID 颜色三模式联动：off 藏 / palette 置灰+黄字 / single 正常。applySMFMode 与 id_paint 回调都会调它
function smfIdColorMode(node) {
    if (!node || !node._xhIdRow) return;
    const row = node._xhIdRow, sw = node._xhIdSwatch, warn = node._xhIdWarn;
    const wp = (node.widgets || []).find((w) => w && w.name === "id_paint");
    const mode = wp ? String(wp.value || "off").trim().toLowerCase() : "off";
    const zh = (window.XH_LANG || "zh") === "zh";
    const btn = sw && sw.box ? sw.box.querySelector("button") : null;
    if (mode === "off") {
        row.style.display = "none";
        return;
    }
    row.style.display = "flex";
    if (mode === "palette") {
        if (btn) { btn.style.filter = "grayscale(1)"; btn.style.opacity = "0.45"; btn.style.pointerEvents = "none"; }
        if (warn) {
            warn.textContent = zh
                ? " palette 走内置调色板（第1个=红），此色不生效；切 single 才用它"
                : " palette uses the built-in palette (1st = red); this color applies only in single mode";
        }
    } else {   // single
        if (btn) { btn.style.filter = ""; btn.style.opacity = ""; btn.style.pointerEvents = ""; }
        if (warn) { warn.textContent = ""; }
    }
}

//  2026-11-08：模式入口改成「两大组 + 大白话用途」。
//   用户定案：必须一眼分清「① 节点模式（不接模型）」和「② SAM3 模式（接模型）」，别把两层揉成四格平铺。
//   · 工具条只留一颗按钮（宽度不变），常驻显示当前属于哪一组；点开浮层里两大块分区列用途。
//   ·  不新增 widget、不改 INPUT_TYPES：当前用途由现有参数反推 ⇒ 存档天然一致，
//     也不会出现「预设显示一套、参数实际是另一套」的假状态。
//   · 用途按钮只做「一键把相关参数写对」，写完照样能自由细调。
const SMF_GROUP_UI = {
    zh: {
        node: { title: "① 节点模式 · 不接模型", desc: "自己画，不用模型、不吃显存",
                items: [["node_manual", "我拖框", "红框拖到哪遮到哪，形状自己挑"]] },
        sam:  { title: "② SAM3 模式 · 接模型", desc: "它来找，模型线必须接上",
                items: [
                    ["sam_auto", "全自动", "它圈啥就遮啥"],
                    ["sam_locate", "只借位置", "它找位置，遮成啥形状我挑"],
                    ["sam_range", "我划范围", "我拖个框限定它在哪找、或挑第几块"],
                    ["sam_palette", "分块涂色", "找到好几块时，一块一个颜色"],
                ] },
        noModel: " 还没接 SAM3 模型 —— 先把模型线接上，这组才跑得起来",
        tip: "点一下就设好，之后参数还能自己细调",
    },
    en: {
        node: { title: "1 · Node mode · no model", desc: "Draw it yourself, no model needed",
                items: [["node_manual", "Drag a box", "Drag the red box where you want it"]] },
        sam:  { title: "2 · SAM3 mode · model wired", desc: "Let the model find it",
                items: [
                    ["sam_auto", "Fully automatic", "Use exactly what it finds"],
                    ["sam_locate", "Position only", "It finds the spot, you pick the shape"],
                    ["sam_range", "I set the range", "Limit where it looks, or pick which one"],
                    ["sam_palette", "Color by region", "One color per region"],
                ] },
        noModel: "SAM3 model is not wired — connect it first",
        tip: "One click sets the params; you can still fine-tune them",
    },
};
// 当前用途 = 从现有参数反推（唯一真值来源，不另存一份状态）
function xhSMF_presetOf(node) {
    if (xhSMF_isManual(node)) return "node_manual";
    const gv = (n) => { const w = xhSM_getW(node, n); return w ? String(w.value) : ""; };
    if (gv("search_enable") === "true") return "sam_range";
    if (gv("id_paint") === "palette") return "sam_palette";
    if (gv("shape") === "sam_mask") return "sam_auto";
    return "sam_locate";
}
// 一键把该用途需要的参数写对（mask_mode 必须先切：形状档位跟着模式换，后写 shape 才合法）
function xhSMF_applyPreset(node, key) {
    const set = (n, v) => xhSM_setW(xhSM_getW(node, n), v);
    if (key === "node_manual") {
        set("mask_mode", "manual");
        set("search_enable", false);
        set("id_paint", "off");
    } else {
        set("mask_mode", "sam");
        set("shape", key === "sam_locate" ? "head" : "sam_mask");
        set("search_enable", key === "sam_range");
        set("id_paint", key === "sam_palette" ? "palette" : "off");
    }
    try { applySMFMode(node); } catch (e) {}
}
function mkSMFModeBtn(node) {
    const btn = document.createElement("button");
    btn.type = "button";
    paintBarBtn(btn, "neutral");
    btn.style.cssText = btn.style.cssText
        + "height:20px;padding:0 8px;font:11px sans-serif;white-space:nowrap;flex:0 0 auto;";
    const wired = () => {
        const mi = (node.inputs || []).find((x) => x && x.name === "model");
        return !!(mi && mi.link != null);
    };
    let panel = null, follow = null, closeDown = null;
    const close = () => {
        try { follow && follow.stop(); } catch (e) {}
        try { closeDown && document.removeEventListener("pointerdown", closeDown, true); } catch (e) {}
        try { panel && panel.remove(); } catch (e) {}
        panel = null; follow = null; closeDown = null;
    };
    const refresh = () => {
        const zh = (window.XH_LANG || "zh") === "zh";
        const L = zh ? SMF_GROUP_UI.zh : SMF_GROUP_UI.en;
        const manual = xhSMF_isManual(node);
        const key = xhSMF_presetOf(node);
        const grp = manual ? L.node : L.sam;
        const it = grp.items.find((x) => x[0] === key) || grp.items[0];
        const gname = manual ? (zh ? "节点模式" : "Node mode") : (zh ? "SAM3 模式" : "SAM3 mode");
        //  2026-11-15 家族图标统一：尾部 Unicode "▾" → 图标库「展开」(chevrons-up-down)。
        //   ⛔ 只替换原有符号的位置，不新增元素、不动文案；textContent 会冲掉图标 ⇒ 必须走 innerHTML。
        btn.innerHTML = (manual ? "① " : "② ") + gname + " · " + it[1] + " "
            + xhIconHTML("展开", { size: 11, color: "current" });
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        //  2026-11-15 用户拍板：模式键不要亮绿（「一点也不符合节点气质」）。
        //   原先 manual=#3ad17a 亮绿 / sam=#4a6fd8 亮蓝，都是节点里写死的彩底 ⇒ 一并中性化。
        //   底/字/描边全走官方主题变量（深浅主题自动适配，浅底自动配深字），两种模式靠 ①/② 文案区分。
        btn.style.background = "var(--color-background-secondary, #343a42)";
        btn.style.color = "var(--color-text-primary, #e9edf2)";
        btn.style.borderColor = "var(--color-border-secondary, #5a6472)";
        btn.title = grp.title + " — " + grp.desc;
    };
    const mkGroup = (L, g, isNodeGroup, curKey, noModel) => {
        const box = document.createElement("div");
        box.style.cssText = "border:1px solid var(--color-border-secondary, rgba(0,0,0,.25));border-left:3px solid "
            + (isNodeGroup ? "#0F6E56" : "#185FA5") + ";border-radius:8px;padding:8px 10px;margin-bottom:8px;";
        const h = document.createElement("div");
        h.textContent = g.title;
        h.style.cssText = "font:500 12px sans-serif;color:var(--color-text-primary,#222);margin-bottom:2px;";
        const d = document.createElement("div");
        d.textContent = g.desc;
        d.style.cssText = "font:11px sans-serif;color:var(--color-text-secondary,#666);margin-bottom:6px;";
        box.appendChild(h); box.appendChild(d);
        g.items.forEach(([k, label, desc]) => {
            const b = document.createElement("button");
            b.type = "button";
            const on = k === curKey;
            //  2026-11-13 家族图标统一：选中态原来是字符串 "  ✓"，改成图标库「勾选」。
            //    ⛔ 不能交给 DOM 兜底：选中/取消会反复重设 textContent，幂等标记会让图标卡死。
            b.textContent = label;
            if (on) b.insertAdjacentHTML("beforeend", " " + xhIconHTML("勾选", { size: 11, color: "current" }));
            b.title = desc;
            b.style.cssText = "display:block;width:100%;text-align:left;margin:3px 0;padding:5px 8px;"
                + "font:12px sans-serif;border-radius:6px;cursor:pointer;"
                + "border:1px solid " + (on ? (isNodeGroup ? "#0F6E56" : "#185FA5") : "var(--color-border-tertiary, rgba(0,0,0,.15))") + ";"
                + "background:" + (on ? "var(--color-background-info, rgba(74,111,216,.12))" : "transparent") + ";"
                + "color:var(--color-text-primary,#222);";
                if (!isNodeGroup && !wired()) { b.disabled = true; b.style.opacity = "0.45"; b.style.cursor = "not-allowed"; }
            b.onclick = (e) => {
                e.stopPropagation();
                if (!isNodeGroup && !wired()) { refresh(); return; }
                xhSMF_applyPreset(node, k);
                close(); refresh();
            };
            box.appendChild(b);
        });
        if (!isNodeGroup && noModel) {
            const n = document.createElement("div");
            n.textContent = noModel;
            n.style.cssText = "font:11px sans-serif;color:#A32D2D;margin-top:4px;";
            box.appendChild(n);
        }
        return box;
    };
    const open = () => {
        close();
        const zh = (window.XH_LANG || "zh") === "zh";
        const L = zh ? SMF_GROUP_UI.zh : SMF_GROUP_UI.en;
        const key = xhSMF_presetOf(node);
        const noModel = wired() ? "" : L.noModel;
        panel = document.createElement("div");
        panel.style.cssText = "position:absolute;z-index:10000;width:260px;padding:10px;"
            + "background:var(--color-background-primary,#fff);"
            + "border:1px solid var(--color-border-secondary,rgba(0,0,0,.3));border-radius:10px;"
            + "box-shadow:0 4px 16px rgba(0,0,0,.18);";
        panel.appendChild(mkGroup(L, L.node, true, key, noModel));
        panel.appendChild(mkGroup(L, L.sam, false, key, noModel));
        const tip = document.createElement("div");
        tip.textContent = L.tip;
        tip.style.cssText = "font:11px sans-serif;color:var(--color-text-tertiary,#888);margin-top:2px;";
        panel.appendChild(tip);
        document.body.appendChild(panel);
        xhPlaceBeside(panel, btn.getBoundingClientRect(), { gap: 10, preferBottom: true });
        follow = xhFollowAnchor(panel, btn, { gap: 10, preferBottom: true });
        closeDown = (e) => { if (panel && !panel.contains(e.target) && e.target !== btn) close(); };
        document.addEventListener("pointerdown", closeDown, true);
    };
    btn.onclick = (e) => { e.stopPropagation(); if (panel) close(); else open(); };
    node._xhModeBtnRefresh = refresh;
    const occ = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const r = occ ? occ.apply(this, arguments) : undefined;
        try { refresh(); applySMFMode(node); } catch (e) {}
        return r;
    };
    const oldRefresh = node._xhFillRefresh;
    node._xhFillRefresh = () => { try { oldRefresh && oldRefresh(); } catch (e) {} try { refresh(); } catch (e) {} };
    refresh();
    return btn;
}

// BOOLEAN(toggle) 的 on/off 显示文本（后端 label_on/label_off 只在创建时读一次，切语言必须重写 options）
const TOGGLE_ONOFF = {
    zh: { invert: { on: "反转(形状外填充)", off: "正常(形状内填充)" }, mask_locate: { on: "开(用mask定位)", off: "关(直接填mask)" },
          exclude_enable: { on: "开(先盖排除区再找目标)", off: "关(全图找目标)" },
          is_first: { on: "首轮(不续接)", off: "续接段" },
          drift_control: { on: "开", off: "关" },
          search_enable: { on: "开(只在搜索区里找)", off: "关(全图找)" },
          hard_lock: { on: "硬锁：重叠区全冻", off: "渐变：平滑过渡" } },
    en: { invert: { on: "Invert (fill outside)", off: "Normal (fill inside)" }, mask_locate: { on: "On (locate+shape)", off: "Off (fill mask)" },
          exclude_enable: { on: "On (block area first)", off: "Off (search whole image)" },
          is_first: { on: "First (no cont.)", off: "Continuation" },
          drift_control: { on: "On", off: "Off" },
          search_enable: { on: "On (search zones only)", off: "Off (whole image)" },
          hard_lock: { on: "Hard lock (freeze overlap)", off: "Gradient (smooth)" } },
};

//  2026-11-08：登记复刻节点类型 ⇒ isXHNode() 认它们，自动获得工具条 + 中/EN 切换
Object.assign(XH_I18N.zh.nodes, WN_NODES_ZH);
Object.assign(XH_I18N.en.nodes, WN_NODES_EN);
//  2026-11-09：节点标题登记（widgets / slots 走 qeText 按节点隔离表）
Object.assign(XH_I18N.zh.nodes, QE_NODES_ZH);
Object.assign(XH_I18N.en.nodes, QE_NODES_EN);
//  2026-11-14 晚：角色设定表接入家族中/EN 三处覆盖。
//  🔴 用「按节点隔离」表，不并入全局 widgets / slots：全局表里 prompt / width / height
//  已被别的节点占用（如「提示词(内置)」「宽度」），混用会翻错，也会污染其它家族节点。
const CS_NODES_ZH = { XiaoHeiCharacterSheet: "小黑·全能角色设定表" };
const CS_NODES_EN = { XiaoHeiCharacterSheet: "XiaoHei Character Sheet" };
const CS_I18N = {
    zh: {
        widgets: {
            state_json: "角色表状态", character_image: "角色主图",
            reference_image_1: "附加参考 1", reference_image_2: "附加参考 2", reference_image_3: "附加参考 3",
            use_layout_image: "使用排版参考图", style: "风格",
            model_format: "下游模型格式",
        },
        slots: {
            prompt: "提示词", width: "宽度", height: "高度",
            layout_image: "排版参考图", character_image: "角色主图",
            reference_image_1: "附加参考 1", reference_image_2: "附加参考 2", reference_image_3: "附加参考 3",
            state_json: "角色表状态", use_layout_image: "使用排版参考图", style: "风格",
            model_format: "下游模型格式", negative_prompt: "负向提示词",
        },
    },
    en: {
        widgets: {
            state_json: "state_json", character_image: "character_image",
            reference_image_1: "reference_image_1", reference_image_2: "reference_image_2", reference_image_3: "reference_image_3",
            use_layout_image: "use_layout_image", style: "style",
            model_format: "model_format",
        },
        slots: {
            prompt: "prompt", width: "width", height: "height",
            layout_image: "layout_image", character_image: "character_image",
            reference_image_1: "reference_image_1", reference_image_2: "reference_image_2", reference_image_3: "reference_image_3",
            state_json: "state_json", use_layout_image: "use_layout_image", style: "style",
            model_format: "model_format", negative_prompt: "negative_prompt",
        },
    },
};
function csText(kind, key, lang) {
    const pack = CS_I18N[lang] || CS_I18N.zh;
    return (pack && pack[kind] && pack[kind][key]) || null;
}
Object.assign(XH_I18N.zh.nodes, CS_NODES_ZH);
Object.assign(XH_I18N.en.nodes, CS_NODES_EN);

function applyLangToNode(node) {
    if (!node || !isXHNode(node.type)) return;
    const _cs = normalizeType(node.type) === "XiaoHeiCharacterSheet";
    const _wn = isWNNode(node.type);
    const _qe = isQENode(node.type);   //  2026-11-09 Qwen21 四件套
    const lang = window.XH_LANG || "zh";
    const pack = XH_I18N[lang] || XH_I18N.zh;
    try {
        const t = normalizeType(node.type);
        const name = pack.nodes[t];
        const defaultZhName = XH_I18N.zh.nodes[t];
        const defaultEnName = XH_I18N.en.nodes[t];
        // 只有标题还是默认显示名时才重写，保留用户自定义的标题
        const _wnTitle = _wn ? wnText("nodes", t, lang) : null;
        if (_wnTitle) { node.title = _wnTitle; }
        else if (name && (node.title === defaultZhName || node.title === defaultEnName || !node.title)) {
            node.title = name;
        }

        // 参数控件标签（只改 label，绝不改 name）；toggle 额外重写 on/off 显示文本
        if (node.widgets) {
            for (const w of node.widgets) {
                if (w && w.name) {
                    const _wnLb = _wn ? wnText("widgets", w.name, lang) : null;
                    const _qeLb = _qe ? qeText("widgets", w.name, lang, t) : null;
                    const _csLb = _cs ? csText("widgets", w.name, lang) : null;
                    if (_wnLb) w.label = _wnLb;
                    else if (_qeLb) w.label = _qeLb;
                    else if (_csLb) w.label = _csLb;
                    else if (pack.widgets[w.name]) w.label = pack.widgets[w.name];
                }
                const tg = w && w.name && TOGGLE_ONOFF[lang] && TOGGLE_ONOFF[lang][w.name];
                if (tg && w.options) {
                    if (tg.on) w.options.on = tg.on;
                    if (tg.off) w.options.off = tg.off;
                }
            }
        }

        // 输入 / 输出端口名
        const applySlots = (arr) => {
            for (const s of arr || []) {
                const _wnSlotLb = _wn ? wnText("slots", s && s.name, lang) : null;
                const _qeSlotLb = _qe ? qeText("slots", s && s.name, lang, t) : null;
                const _csSlotLb = _cs ? csText("slots", s && s.name, lang) : null;
                const lb = _wnSlotLb || _qeSlotLb || _csSlotLb || slotLabel(s && s.name, lang);
                if (lb) s.label = lb;
            }
        };
        applySlots(node.inputs);
        applySlots(node.outputs);
        // 下拉框显示中文（值不变）
        applyComboLabels(node, lang, _wn ? WN_COMBO : (_qe ? QE_COMBO : COMBO_LABELS));

        // Nodes 2.0 的端口标签走「快照」渲染，改完必须显式触发一次重建才看得见
        try {
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        } catch (e) {}
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("[XiaoHei ImageTools] 应用语言失败:", e);
    }
}

//  2026-11-10：收集**全部**图里的节点（Vue Nodes 2.0 的 rootGraph + 子图）。
//   旧实现只读 app.graph.nodes ⇒ 子图 / 分组里的节点切语言时永远漏刷。
function _xhCollectGraphNodes() {
    const seenGraphs = new Set();
    const seenNodes = new Set();
    const out = [];
    const addGraph = (g) => {
        if (!g || seenGraphs.has(g)) return;
        seenGraphs.add(g);
        const arr = g.nodes || g._nodes || [];
        for (const n of arr) {
            if (n && !seenNodes.has(n)) { seenNodes.add(n); out.push(n); }
        }
        for (const key of ["subgraphs", "graphs", "_subgraphs"]) {
            let subs;
            try { subs = g[key]; } catch (e) { continue; }
            if (!subs) continue;
            try {
                if (typeof subs.values === "function") { for (const sg of subs.values()) addGraph(sg); }
                else if (Array.isArray(subs)) { for (const sg of subs) addGraph(sg); }
                else if (typeof subs === "object") { for (const k of Object.keys(subs)) addGraph(subs[k]); }
            } catch (e) {}
        }
    };
    try { addGraph(app.rootGraph || app.graph); } catch (e) {}
    try { addGraph(app.graph); } catch (e) {}
    try { if (app.graph && app.graph.graph) addGraph(app.graph.graph); } catch (e) {}
    return out;
}

function applyLangToAll() {
    //  每个节点、每个刷新钩子单独兜底：任何一处抛错都不得中断整条刷新链
    for (const n of _xhCollectGraphNodes()) {
        try { applyLangToNode(n); }
        catch (e) { console.warn("[XiaoHei ImageTools] 节点语言刷新失败:", n && n.type, e); }
        const hooks = [
            () => n._xhFillRefresh && n._xhFillRefresh(),
            () => n._xhIdColorUI && n._xhIdColorUI.refresh && n._xhIdColorUI.refresh(),
            () => n._xhModeBtnRefresh && n._xhModeBtnRefresh(),
            () => n._xhSMFResetRefresh && n._xhSMFResetRefresh(),
            () => n._xhSMFGear && n._xhSMFGear._xhGearPaint && n._xhSMFGear._xhGearPaint(),
        ];
        for (const h of hooks) { try { h(); } catch (e) {} }
    }
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════════
//  2026-11-10 全家族文字「一个大脑」最终兜底（priority=2000，中枢里最后跑）
//    病根：DOM 里写死的中文/英文只在节点创建时本地化一次，切换语言不重刷；
//          canvas 文字走 L() 会跟着切 ⇒ 同一节点里中英混杂。
//    做法：把主表 + WN/QE 三表 + 文件内成对标签配成「中文↔英文」精确双向映射，
//          由唯一中枢切换时统一扫一遍所有可见文本节点。
//     绝不改 name / value / combo 存档值；只动文本节点与 placeholder / aria-label。
// ══════════════════════════════════════════════════════════════════════
const _XH_EXTRA_BIDI = [
    [
        "色号",
        "Tint"
    ],
    [
        "默认绿",
        "Default Green"
    ],
    [
        "形状色",
        "Shape"
    ],
    [
        "默认灰",
        "Default Gray"
    ],
    [
        "背景色",
        "BG"
    ],
    [
        "默认黑",
        "Default Black"
    ],
    [
        "遮挡色",
        "Overlay"
    ],
    [
        "默认灰白",
        "Default Gray"
    ],
    [
        "排除块色",
        "Exclude"
    ],
    [
        "ID 颜色",
        "ID"
    ],
    [
        "默认蓝",
        "Default Blue"
    ],
    [
        "加一帧",
        "Add a frame"
    ],
    [
        "正常",
        "Normal"
    ],
    [
        "自动",
        "Auto"
    ],
    [
        "矩形",
        "rectangle"
    ]
];
const _XH_TXT_ZH2EN = new Map();
const _XH_TXT_EN2ZH = new Map();
//  官方通用端口名：ZH 模式保持英文，避免全局 DOM 扫描误改非 XiaoHei 家族节点。
//    EN 模式下中文只可能来自 XiaoHei 家族（官方 UI 无中文）⇒ 那一侧不受此限制。
const _XH_GENERIC_EN = new Set([
    "image", "images", "mask", "masks", "conditioning", "clip", "model", "latent",
    "width", "height", "seed", "steps", "cfg", "text", "positive", "negative",
    "audio", "video", "VAE", "Image", "Mask", "CLIP", "Model"
]);
let _xhBidiBuilt = false;
// 本次会话里「被我们翻成英文」的原中文：切回 ZH 时按记录精确还原。
// 这样官方节点的 image/mask/conditioning 永远不会被碰，而 XiaoHei 节点能严格来回一致。
const _XH_DOM_RESTORE = new Map();

function _xhAddBidi(zh, en) {
    if (typeof zh !== "string" || typeof en !== "string") return;
    const z = zh.trim(), e = en.trim();
    if (!z || !e || z === e) return;
    if (!_XH_TXT_ZH2EN.has(z)) _XH_TXT_ZH2EN.set(z, e);
    if (!_XH_TXT_EN2ZH.has(e)) _XH_TXT_EN2ZH.set(e, z);
}
function _xhPairDeep(zNode, eNode) {
    if (typeof zNode === "string" && typeof eNode === "string") { _xhAddBidi(zNode, eNode); return; }
    if (!zNode || !eNode || typeof zNode !== "object" || typeof eNode !== "object") return;
    for (const k of Object.keys(zNode)) {
        if (Object.prototype.hasOwnProperty.call(eNode, k)) _xhPairDeep(zNode[k], eNode[k]);
    }
}
function _xhBuildBidi() {
    if (_xhBidiBuilt) return;
    _xhBidiBuilt = true;
    try {
        for (const kind of ["nodes", "widgets", "slots", "combo", "ui", "text"]) {
            _xhPairDeep(XH_I18N.zh[kind], XH_I18N.en[kind]);
        }
        _xhPairDeep(WN_NODES_ZH, WN_NODES_EN);
        _xhPairDeep(QE_NODES_ZH, QE_NODES_EN);
        if (typeof TOGGLE_ONOFF !== "undefined") _xhPairDeep(TOGGLE_ONOFF.zh, TOGGLE_ONOFF.en);
        if (typeof WN_COMBO !== "undefined") _xhPairDeep(WN_COMBO.zh, WN_COMBO.en);
        if (typeof QE_COMBO !== "undefined") _xhPairDeep(QE_COMBO.zh, QE_COMBO.en);
        for (const [z, e] of _XH_EXTRA_BIDI) _xhAddBidi(z, e);
        //  以 ZH->EN 为准修正反向表 ⇒ zh→en→zh 严格幂等；
        //    同一英文对应多个中文时优先选不带 emoji 的（节点名禁 emoji 铁律）。
        const _hasIcon = (s) => s && /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(s);
        for (const [z, e] of _XH_TXT_ZH2EN) {
            const cur = _XH_TXT_EN2ZH.get(e);
            if (!cur || (_hasIcon(cur) && !_hasIcon(z))) _XH_TXT_EN2ZH.set(e, z);
        }
        // 历史遗留：video 端口中文侧带 ，强制以干净中文为准，保证严格幂等
        for (const [z, e] of [["视频", "video"]]) {
            _XH_TXT_ZH2EN.set(z, e); _XH_TXT_EN2ZH.set(e, z);
        }
    } catch (err) { console.warn("[XiaoHei I18N] 双向表构建失败:", err); }
}

/** 精确整串、双向、幂等；没命中就原样返回（绝不猜、绝不碰存档值）。 */
function _xhBidi(text, lang) {
    _xhBuildBidi();
    if (typeof text !== "string") return text;
    const t = text.trim();
    if (!t) return text;
    if (lang !== "en" && _XH_GENERIC_EN.has(t)) return text;
    const tbl = (lang === "en") ? _XH_TXT_ZH2EN : _XH_TXT_EN2ZH;
    if (tbl.has(t)) return text.replace(t, tbl.get(t));
    try {
        const out = wnUIFull(t, lang);          // WN 全量双向（含动态数字串规则）
        if (out && out !== t) return text.replace(t, out);
    } catch (err) {}
    return text;
}

const _XH_DOM_SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CANVAS", "SVG", "NOSCRIPT", "PRE", "CODE"]);
function _xhRelocalizeDom() {
    const lang = window.XH_LANG || "zh";
    if (!document || !document.body || typeof document.createTreeWalker !== "function") return;
    const edits = [];
    try {
        const walker = document.createTreeWalker(document.body, 4 /* SHOW_TEXT */, {
            acceptNode(n) {
                if (!n || !n.nodeValue || !n.nodeValue.trim()) return 3;  // FILTER_REJECT
                const raw = n.nodeValue, t = raw.trim();
                //  长段落 / 多行 / 可编辑区 ⇒ 工作流说明便签、笔记，绝不能碰
                if (t.length > 60 || /[\r\n]/.test(raw)) return 3;
                const p = n.parentElement;
                if (!p || _XH_DOM_SKIP.has(p.tagName) || p.isContentEditable) return 3;
                try { if (p.closest("[contenteditable], .comfy-markdown, .markdown-note")) return 3; } catch (err) {}
                return 1;                                                   // FILTER_ACCEPT
            }
        });
        while (walker.nextNode()) {
            const n = walker.currentNode;
            const raw = n.nodeValue, key = raw.trim();
            let out = raw;
            if (lang === "en") {
                out = _xhBidi(raw, "en");
                if (out !== raw) {
                    const ent = out.trim();
                    if (ent && !/[\u4e00-\u9fff]/.test(ent)) _XH_DOM_RESTORE.set(ent, key);
                }
            } else {
                // 先还原本次会话翻过的（含通用端口名如 video），再走表内翻译；
                // 表内翻译对通用端口名有保护 ⇒ 官方节点不受影响。
                if (_XH_DOM_RESTORE.has(key)) out = raw.replace(key, _XH_DOM_RESTORE.get(key));
                else out = _xhBidi(raw, "zh");
            }
            if (out !== raw) edits.push([n, out]);
        }
    } catch (err) { console.warn("[XiaoHei I18N] DOM 扫描失败:", err); }
    for (const [n, v] of edits) { try { n.nodeValue = v; } catch (err) {} }
    // 属性只碰 placeholder / aria-label（title 是后端中文 tooltip，保持中文，不参与切换）
    try {
        for (const attr of ["placeholder", "aria-label"]) {
            for (const el of document.querySelectorAll("[" + attr + "]")) {
                const raw = el.getAttribute(attr);
                if (!raw || raw.length > 80) continue;
                const out = _xhBidi(raw, lang);
                if (out !== raw) el.setAttribute(attr, out);
            }
        }
    } catch (err) {}
    return edits.length;
}

/** 中枢最终处理：主表(1000)刷完标题/参数/端口后，这里统一收尾所有 DOM 文本 + 重绘 canvas。 */
function _xhFinalTextPass() {
    const n1 = _xhRelocalizeDom();
    // canvas 类自定义文字（时间轴/帧轨道）靠重绘走 L() 跟随语言
    for (const n of _xhCollectGraphNodes()) {
        try { n.wnRipple && n.wnRipple.refresh && n.wnRipple.refresh(); } catch (err) {}
        try { n.wnRefreshMessages && n.wnRefreshMessages(); } catch (err) {}
    }
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (err) {}
    // Vue 响应式可能在事件后重建 DOM ⇒ 延迟再刷一次，保证最终一致
    setTimeout(() => { try { _xhRelocalizeDom(); } catch (err) {} }, 180);
    return n1;
}


// ─── 动态输入槽：移植自 comfyui-kjnodes web/js/jsnodes.js 的 setupDynamicInputs ───
// 按前缀重建槽位，使槽数 = 计数控件的值。计数控件的回调在「API 重载」时也会触发
// （此时带 canvas 参数的是交互操作，跳过重建，避免拖数字时节点乱跳）。
function setupDynamicInputs(node, { type, prefix, countWidget = "inputcount", slotOptions } = {}) {
    const rebuild = () => {
        if (!node.inputs) node.inputs = [];
        const countW = node.widgets?.find((w) => w.name === countWidget);
        if (!countW) return;
        const target = countW.value;
        const current = node.inputs.filter((i) => i.name?.startsWith(prefix)).length;
        if (target === current) return;
        if (target < current) {
            for (let i = 0; i < current - target; i++) node.removeInput(node.inputs.length - 1);
        } else {
            for (let i = current + 1; i <= target; i++) node.addInput(`${prefix}${i}`, type, slotOptions);
        }
        // 新槽也要跟着语言走
        applyLangToNode(node);
        try {
            node.graph?.setDirtyCanvas(true, true);
        } catch (e) {}
    };

    // name 用英文键（不进 widgets_values），显示文字交给 label → 可随语言切换
    node.addWidget("button", "xh_update_inputs", null, rebuild);

    const countW = node.widgets?.find((w) => w.name === countWidget);
    if (countW) {
        const origCb = countW.callback; // guard: may be nullish
        countW.callback = function (value, canvas) {
            const r = origCb ? origCb.apply(this, arguments) : undefined;
            if (!canvas) rebuild(); // bare = API 重载；跳过交互式拖拽
            return r;
        };
    }
    return rebuild;
}

// ─── 形状遮罩覆盖：内嵌可视化拖拽编辑器（网格 + 可拖拽/缩放的形状） ───
// 纯前端：在节点 body 上画出「带网格的源图 + 半透明形状叠加 + 四角缩放句柄」。
// 拖形状=移动，拖角=缩放，坐标自动写回 location_x/y/shape_width/height。
// 形状从上游 LoadImage 的 images 直接取预览 URL，不依赖任何外部文件。
// ==== XHShapeMaskOverlay：节点内嵌可视化编辑器（DOM canvas 版，2026-10-10）====
// 旧版用 onDrawForeground canvas 钩子画编辑器 —— 在新版 DOM 节点渲染（Vue 节点）下根本不执行，
// 编辑器永远看不见。现改为 DOM widget 内嵌 <canvas>：与渲染模式无关、必定可见，拖拽走 DOM 事件。
function xhSM_getW(node, name) { return (node.widgets || []).find((w) => w && w.name === name); }
//  2026-10-25：万能遮罩「是不是手动模式」的唯一判定 —— 必须与后端 use_manual 逐字对齐：
//   use_manual = model_missing or shape=="manual_box" or mask_mode=="manual"
//   红框显隐 / 标签命名 / 按钮禁用全走它。修复前只认 mask_mode ⇒ 「SAM模式+没接MODEL线」时
//   后端按手动跑（拿红框当遮罩框），前端却因 exclude_enable 默认关把红框整套藏了
//   ⇒ 用户没框可拖、遮罩按默认位置(0.19/0.346)画 ⇒ 「跑十几遍遮不住」。
//   没有这些 widget/输入的节点（老 XHShapeMaskOverlay / 区域限定框）一律 false，行为不变。
function xhSMF_isManual(node) {
    try {
        const wM = xhSM_getW(node, "mask_mode");
        if (wM && String(wM.value) === "manual") return true;
        const wS = xhSM_getW(node, "shape");
        if (wS && String(wS.value) === "manual_box") return true;
        const mi = (node.inputs || []).find((x) => x && x.name === "model");
        if (mi && (mi.link === null || mi.link === undefined)) return true;   // MODEL 口没接线
    } catch (e) {}
    return false;
}
function xhSM_setW(w, v) { if (!w) return; w.value = v; try { w.callback && w.callback(v, null); } catch (e) {} }

// 坐标中心桥（2026-10-12）：编辑器内部一律用「绝对像素中心 (ax,ay)」，
// 而 widget 的 location_x/y 是「相对 coord_center 锚点的偏移」——通过这两个函数互转。
// 圆心模型（Apt 同款）：left_top 锚点时，对称形状 cx = offset + min(sw,sh)/2。
// 为让编辑器所见即所得，这里用「形状中心绝对坐标」为中介，只在 left_top 下做半径补偿。
function xhSM_refWH(node) {
    const wF = xhSM_getW(node, "frame_width"), wH = xhSM_getW(node, "frame_height");
    const fw = wF ? Number(wF.value) : 0, fh = wH ? Number(wH.value) : 0;
    if (fw > 0 && fh > 0) return { w: fw, h: fh };
    if (node._xhEd && node._xhEd.imgW && node._xhEd.imgH) return { w: node._xhEd.imgW, h: node._xhEd.imgH };
    return { w: 1536, h: 1024 };
}
function xhSM_shapeName(node) {
    const w = xhSM_getW(node, "shape"); return (w && w.value) || "circle";
}
// 由 widget 值算出「形状中心的绝对像素坐标」
function xhSM_getCenter(node) {
    const R = xhSM_refWH(node);
    const wCX = xhSM_getW(node, "location_x"), wCY = xhSM_getW(node, "location_y");
    const wCC = xhSM_getW(node, "coord_center");
    const lx = Number(wCX && wCX.value) || 0, ly = Number(wCY && wCY.value) || 0;
    const cc = (wCC && wCC.value) || "image_center";
    const sw = Number((xhSM_getW(node, "shape_width") || {}).value) || 0;
    const sh = Number((xhSM_getW(node, "shape_height") || {}).value) || 0;
    const shape = xhSM_shapeName(node);
    if (cc === "image_center") return { x: R.w / 2 + lx, y: R.h / 2 + ly };
    // left_top：还原后端语义下的中心
    const radius = Math.max(1, Math.floor(Math.min(sw, sh) / 2));
    if (shape === "rectangle") return { x: lx + Math.floor(sw / 2), y: ly + Math.floor(sh / 2) };
    if (shape === "ellipse") return { x: lx + radius, y: ly + Math.floor(radius * 0.7) };
    if (shape === "semicircle") return { x: lx + radius, y: ly };
    if (shape === "quarter_circle") return { x: lx, y: ly };
    return { x: lx + radius, y: ly + radius };
}
// 由「形状中心绝对像素坐标」反写 widget 偏移
function xhSM_setCenter(node, ax, ay) {
    const R = xhSM_refWH(node);
    const wCC = xhSM_getW(node, "coord_center");
    const cc = (wCC && wCC.value) || "image_center";
    const sw = Number((xhSM_getW(node, "shape_width") || {}).value) || 0;
    const sh = Number((xhSM_getW(node, "shape_height") || {}).value) || 0;
    const shape = xhSM_shapeName(node);
    let lx, ly;
    if (cc === "image_center") { lx = ax - R.w / 2; ly = ay - R.h / 2; }
    else {
        const radius = Math.max(1, Math.floor(Math.min(sw, sh) / 2));
        if (shape === "rectangle") { lx = ax - Math.floor(sw / 2); ly = ay - Math.floor(sh / 2); }
        else if (shape === "ellipse") { lx = ax - radius; ly = ay - Math.floor(radius * 0.7); }
        else if (shape === "semicircle") { lx = ax - radius; ly = ay; }
        else if (shape === "quarter_circle") { lx = ax; ly = ay; }
        else { lx = ax - radius; ly = ay - radius; }
    }
    xhSM_setW(xhSM_getW(node, "location_x"), Math.round(lx));
    xhSM_setW(xhSM_getW(node, "location_y"), Math.round(ly));
}

// ─────────────────────────────────────────────────────────────────────────────
//  2026-11-08：画板「参考图」沿连线向上游回溯
//   （XiaoHei-万能遮罩 / XiaoHei-区域限定框 / 形状遮罩覆盖 共用同一个 xhSM_srcURL）
//   症状：image 口直接接「加载图像」⇒ 秒出图；改接「XiaoHei-图片列表 → XiaoHei-图像按序取」⇒ 只剩网格+红框。
//   根因：后者既没有名为 image 的 widget，也没有执行预览 src.images ⇒ 原实现返回 null。
//   修法：再往上一层找到「XiaoHei-图片列表」，从它 images widget 的有序 JSON 里挑第 N 张拼 URL。
//    只用于画布参考图：不参与出图、不写存档、不动端口/widget 顺序。
//    index 接循环变量时，未执行前端拿不到当前轮次 ⇒ 用 index widget 的静态值（默认 0 = 第一张）。
//     取图口径（0-based / 负数倒数 / 越界钳制）对齐后端 image_get.py。
// ─────────────────────────────────────────────────────────────────────────────
function xhSM_widget(node, name) {
    return ((node && node.widgets) || []).find((w) => w && w.name === name) || null;
}

// 取某个输入口的直接上游节点（graph.links 在 1.57+ 是 Map ⇒ 一律走 xhGetLinkById 兼容层）
function xhSM_upstream(graph, node, inputName) {
    try {
        const inp = ((node && node.inputs) || []).find((i) => i && i.name === inputName);
        if (!inp || inp.link == null) return null;
        const link = xhGetLinkById(graph, inp.link);
        if (!link) return null;
        return graph.getNodeById(link.origin_id) || null;
    } catch (e) { return null; }
}

// 把「图片列表」的条目展开成一张张图（顺序 = 后端 image_list.py::_resolve_paths 的出图顺序）
//   · 普通 / abs 条目 = 1 张；· folder 条目 = order[] 里的每个文件名（来自 /xh/imglist/list）
function xhSM_flattenList(items) {
    const out = [];
    for (const it of items) {
        if (!it || typeof it !== "object") continue;
        if ((it.type || "") === "folder") {
            const dir = String(it.name || "").replace(/\/+$/, "");
            for (const fn of (Array.isArray(it.order) ? it.order : [])) {
                if (!fn) continue;
                out.push({ type: "abs", name: dir + "/" + String(fn).replace(/\\/g, "/") });
            }
        } else {
            out.push(it);
        }
    }
    return out;
}

// 纯函数（可脱浏览器单测）：按 index 挑一张；负数倒数 / 越界钳制 对齐后端 image_get.py
function xhSM_pickListEntry(items, index, indexFromOne, clamp) {
    const flat = xhSM_flattenList(items);
    if (!flat.length) return null;
    let i = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
    if (indexFromOne) i -= 1;
    if (i < 0) i += flat.length;
    if (clamp !== false) i = Math.max(0, Math.min(flat.length - 1, i));
    else if (i < 0 || i >= flat.length) return null;
    return flat[i] || null;
}

// ① 直连「XiaoHei-图片列表」⇒ 第 0 张；② 隔一层「XiaoHei-图像按序取」⇒ 再往上一层找列表，按 index 取
function xhSM_listPreviewURL(node, src) {
    try {
        const listNode = xhSM_widget(src, "images") ? src : xhSM_upstream(node.graph, src, "images");
        if (!listNode) return null;
        const w = xhSM_widget(listNode, "images");
        if (!w) return null;                       // 没有列表数据 ⇒ 不是「XiaoHei-图片列表」
        let items;
        try { items = typeof w.value === "string" ? JSON.parse(w.value) : w.value; } catch (e) { return null; }
        if (!Array.isArray(items) || !items.length) return null;
        const first = items[0];
        if (!first || typeof first !== "object" || !(first.name || first.type === "folder")) return null;
        const viaGetter = (listNode !== src);
        const wIdx = viaGetter ? xhSM_widget(src, "index") : null;
        const wOne = viaGetter ? xhSM_widget(src, "index_from_one") : null;
        const wClamp = viaGetter ? xhSM_widget(src, "clamp") : null;
        const entry = xhSM_pickListEntry(
            items,
            wIdx ? wIdx.value : 0,
            !!(wOne && wOne.value),
            wClamp ? wClamp.value !== false : true
        );
        if (!entry) return null;
        const rel = xhImgListViewUrl(entry);
        const apiObj = (app && app.api) || (window.comfyAPI && window.comfyAPI.api);
        return (apiObj && apiObj.apiURL) ? apiObj.apiURL(rel) : rel;
    } catch (e) { return null; }
}

function xhSM_srcURL(node) {
    // 上游图像：优先读 LoadImage 的 image widget 值（type=input），回退执行预览 images，
    // 最后回溯「图像按序取 → 图片列表」拿第 N 张当参考图
    try {
        const inp = node.inputs && node.inputs.find((i) => i.name === "image");
        if (!inp || inp.link == null) return null;
        //  2026-10-29：graph.links 在 1.57 是 Map ⇒ 走兼容层
        const link = xhGetLinkById(node.graph, inp.link);
        if (!link) return null;
        const src = node.graph.getNodeById(link.origin_id);
        if (!src) return null;
        const apiObj = (app && app.api) || (window.comfyAPI && window.comfyAPI.api);
        const mk = (q) => (apiObj && apiObj.apiURL ? apiObj.apiURL("/view?" + q) : "/view?" + q);
        const wImg = (src.widgets || []).find((w) => w && w.name === "image");
        if (wImg && typeof wImg.value === "string" && wImg.value) {
            return mk(`filename=${encodeURIComponent(wImg.value)}&type=input`);
        }
        const imgs = src.images;
        if (imgs && imgs.length) {
            const im = imgs[0];
            return mk(`filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || "")}&type=${encodeURIComponent(im.type || "input")}`);
        }
        //  2026-11-08 新增：隔了一层「图像按序取」/ 直连「图片列表」时，取列表里的静态参考图
        return xhSM_listPreviewURL(node, src);
    } catch (e) {}
    return null;
}

function xhSM_setup(node) {
    if (node._xhEd) return;                         // 幂等
    // ── DOM 结构：wrap > [stage > (canvas 背景/网格 + overlay 形状/句柄), tip]
    const wrap = document.createElement("div");
    wrap.style.cssText = "width:100%;padding:6px 8px;box-sizing:border-box;background:#141414;border-radius:8px;";
    const stage = document.createElement("div");
    stage.style.cssText = "position:relative;width:100%;min-height:140px;background:#1c1c1c;border-radius:6px;overflow:hidden;line-height:0;";
    const cv = document.createElement("canvas");
    cv.width = 320; cv.height = 213;                 // 初始内部分辨率，之后 fit() 按参考宽高比调整
    cv.style.cssText = "width:100%;height:auto;display:block;background:#1c1c1c;border-radius:6px;";
    const ov = document.createElement("div");
    ov.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:crosshair;";
    const shapeEl = document.createElement("div");
    shapeEl.style.cssText = "position:absolute;box-sizing:border-box;background:rgba(255,80,80,.30);border:2px dashed #ff5050;";
    ov.appendChild(shapeEl);
    const mkH = () => {
        const d = document.createElement("div");
        d.style.cssText = "position:absolute;width:11px;height:11px;margin:-6px 0 0 -6px;background:#fff;border:1px solid #ff5050;box-sizing:border-box;cursor:nwse-resize;";
        return d;
    };
    const hEl = { tl: mkH(), tr: mkH(), bl: mkH(), br: mkH() };
    for (const k in hEl) ov.appendChild(hEl[k]);
    const tip = document.createElement("div");
    tip.style.cssText = "color:#8a93a6;font:11px sans-serif;padding:4px 2px 0;text-align:center;line-height:1.4;";
    stage.appendChild(cv); stage.appendChild(ov);
    wrap.appendChild(stage); wrap.appendChild(tip);

    const ed = node._xhEd = { img: null, url: null, imgW: 0, imgH: 0, box: null, mode: null, ax: null, ay: null, last: [0, 0], cv, dead: false, miss: 0 };

    try {
        node.addDOMWidget("xh_shape_editor", "custom", wrap, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => Math.round((cv.height || 200) + 34),
        });
    } catch (e) { console.warn("[XiaoHei] 编辑器 DOM widget 挂载失败:", e); }

    // 节点移除 → 停掉动画循环（实例级包装，原型上的 releaseButtons 仍会被调到）
    const orm = node.onRemoved;
    node.onRemoved = function () { ed.dead = true; return orm ? orm.apply(this, arguments) : undefined; };

    function refWH() {
        // 坐标系：优先「画布宽/画布高」控件（填目标图尺寸）；否则用已加载图的尺寸；否则 1536×1024
        const wF = xhSM_getW(node, "frame_width"), wH = xhSM_getW(node, "frame_height");
        const fw = wF ? Number(wF.value) : 0, fh = wH ? Number(wH.value) : 0;
        if (fw > 0 && fh > 0) return { w: fw, h: fh };
        if (ed.imgW && ed.imgH) return { w: ed.imgW, h: ed.imgH };
        return { w: 1536, h: 1024 };
    }
    function fit() {
        const W = Math.max(160, Math.round(wrap.clientWidth) - 16);
        const r = refWH();
        const H = Math.max(90, Math.round(W * r.h / r.w));
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    }

    function draw() {
        const W = cv.width || 320, H = cv.height || 213;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#1c1c1c"; ctx.fillRect(0, 0, W, H);
        ed.L = { x: 0, y: 0, w: W, h: H };
        if (ed.img && ed.imgW) { try { ctx.drawImage(ed.img, 0, 0, W, H); } catch (e) {} }
        // 网格
        ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1;
        const cols = 8, rows = Math.max(4, Math.round(cols * (H / W)));
        for (let i = 0; i <= cols; i++) { const x = W * i / cols; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let j = 0; j <= rows; j++) { const y = H * j / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        // 状态行：参考尺寸 + 当前形状参数（永远画，肉眼可确认编辑器活着）
        const R = refWH();
        const wSW = xhSM_getW(node, "shape_width"), wSH = xhSM_getW(node, "shape_height");
        const c0 = xhSM_getCenter(node);
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, H - 18, W, 18);
        ctx.fillStyle = "#c9d1e0"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
        const zh = (window.XH_LANG || "zh") === "zh";
        const cxT = Math.round(c0.x), cyT = Math.round(c0.y);
        const swT = Math.round(Number(wSW && wSW.value) || 0), shT = Math.round(Number(wSH && wSH.value) || 0);
        ctx.fillText(zh
            ? `参考 ${R.w}×${R.h} · 中心 ${cxT},${cyT} · 尺寸 ${swT}×${shT}`
            : `Ref ${R.w}×${R.h} · Center ${cxT},${cyT} · Size ${swT}×${shT}`, 6, H - 5);
    }

    // 形状用真实 DOM 绘制（canvas 挂了也照样看得见、拖得动）
    function syncShape() {
        const W = cv.width || 320, H = cv.height || 213, R = refWH();
        const wShape = xhSM_getW(node, "shape");
        const wSW = xhSM_getW(node, "shape_width"), wSH = xhSM_getW(node, "shape_height");
        const wScale = xhSM_getW(node, "scale"), wRot = xhSM_getW(node, "rotation");
        const scaleV = Math.max(0.01, Number(wScale && wScale.value) || 1);
        const rotV = Math.round(Number(wRot && wRot.value) || 0);
        const swRaw = Number(wSW && wSW.value) || 0, shRaw = Number(wSH && wSH.value) || 0;
        const sw = swRaw * scaleV, sh = shRaw * scaleV;
        if (!(sw > 0 && sh > 0)) { shapeEl.style.display = "none"; for (const k in hEl) hEl[k].style.display = "none"; ed.box = null; return; }
        const c0 = xhSM_getCenter(node);
        const st = (wShape && wShape.value) || "circle";
        // 对称形状取 min(w,h) 当直径（与后端一致）；矩形用独立宽高
        let bw = sw, bh = sh;
        if (st !== "rectangle") { const d = Math.min(sw, sh); bw = d; bh = d; }
        if (st === "ellipse") bh = Math.max(1, d * 0.7);
        const b = { x: (c0.x / R.w) * W - (bw / R.w) * W / 2, y: (c0.y / R.h) * H - (bh / R.h) * H / 2, w: (bw / R.w) * W, h: (bh / R.h) * H };
        ed.box = b;
        const zh2 = (window.XH_LANG || "zh") === "zh";
        tip.textContent = zh2
            ? "拖红框【边缘】缩放 · 拖【中心】移动 · 点空白定位中心"
            : "Drag box EDGE to resize · Drag CENTER to move · Click empty to center";
        shapeEl.style.display = "block";
        shapeEl.style.left = (b.x / W * 100) + "%";
        shapeEl.style.top = (b.y / H * 100) + "%";
        shapeEl.style.width = (b.w / W * 100) + "%";
        shapeEl.style.height = (b.h / H * 100) + "%";
        shapeEl.style.transform = rotV ? `rotate(${rotV}deg)` : "none";
        shapeEl.style.transformOrigin = "50% 50%";
        shapeEl.style.borderRadius = (st === "circle" || st === "ellipse" || st === "radial") ? "50%" : "0";
        let clip = "none", border = "2px dashed #ff5050";
        if (st === "triangle") { clip = "polygon(50% 0%,100% 100%,0% 100%)"; border = "0"; }
        else if (st === "semicircle") { clip = "none"; shapeEl.style.borderRadius = "50% 50% 0 0 / 100% 100% 0 0"; }
        else if (st === "quarter_circle") { shapeEl.style.borderRadius = "100% 0 0 0"; }
        else if (st === "star") { clip = "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"; border = "0"; }
        else if (st === "cross") { clip = "polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)"; border = "0"; }
        else if (st === "square" || st === "rectangle") { shapeEl.style.borderRadius = "0"; }
        shapeEl.style.clipPath = clip;
        shapeEl.style.border = border;
        const hp = { tl: [0, 0], tr: [100, 0], bl: [0, 100], br: [100, 100] };
        for (const k in hEl) {
            hEl[k].style.display = "block";
            hEl[k].style.left = hp[k][0] + "%";
            hEl[k].style.top = hp[k][1] + "%";
            hEl[k].style.margin = k === "tl" ? "-6px 0 0 -6px" : k === "tr" ? "-6px 0 0 -5px" : k === "bl" ? "-5px 0 0 -6px" : "-5px 0 0 -5px";
        }
    }

    function ensureImg() {
        const url = xhSM_srcURL(node);
        if (!url || url === ed.url) return;
        ed.url = url;
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = () => { ed.img = im; ed.imgW = im.naturalWidth; ed.imgH = im.naturalHeight; fit(); };
        im.onerror = () => { ed.img = null; };     // 图加载失败也不能影响编辑器
        im.src = url;
    }

    if (typeof ResizeObserver !== "undefined") { try { new ResizeObserver(() => fit()).observe(wrap); } catch (e) {} }
    //  循环永不停：DOM widget 是异步挂载的，早期 isConnected=false 时绝不能 return 掉循环
    fit(); draw(); syncShape();
    (function loop() {
        if (ed.dead) return;
        try {
            if (wrap.isConnected) { ed.miss = 0; ensureImg(); fit(); draw(); syncShape(); }
            else if (++ed.miss > 3600) { ed.dead = true; return; }   // ~60s 仍未挂载（节点已废弃）→ 收工
        } catch (e) {}
        requestAnimationFrame(loop);
    })();

    function pos(e) {
        const r = ov.getBoundingClientRect();
        return [(e.clientX - r.left) / (r.width || 1) * (cv.width || 320), (e.clientY - r.top) / (r.height || 1) * (cv.height || 213)];
    }
    function toImg(mx, my) { const W = cv.width || 320, H = cv.height || 213, R = refWH(); return { x: mx / W * R.w, y: my / H * R.h }; }

    ov.addEventListener("pointerdown", (e) => {
        const [mx, my] = pos(e);
        if (!ed.box) {                                   // 还没有形状 → 先按默认尺寸落一个
            const R = refWH();
            xhSM_setW(xhSM_getW(node, "shape_width"), Math.round(R.w * 0.12));
            xhSM_setW(xhSM_getW(node, "shape_height"), Math.round(R.h * 0.16));
            const p = toImg(mx, my);
            xhSM_setCenter(node, p.x, p.y);
            syncShape(); e.preventDefault(); return;
        }
        const p = toImg(mx, my);
        xhSM_setCenter(node, p.x, p.y);
        ed.mode = "move"; ed.last = [mx, my];
        try { ov.setPointerCapture(e.pointerId); } catch (er) {}
        e.preventDefault();
    });
    shapeEl.addEventListener("pointerdown", (e) => {
        const b = ed.box;
        if (!b) return;
        const [mx, my] = pos(e);
        const fx = (mx - b.x) / (b.w || 1), fy = (my - b.y) / (b.h || 1);
        // 边缘带（画布 px）：距任一边 < max(10px, 短边30%) → 缩放（对边锚定）；中心区 → 移动
        const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
        const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
        const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
        const doX = nearL || nearR, doY = nearT || nearB;
        if (doX || doY) {
            ed.mode = "resize";
            ed.ax = doX ? (nearL ? b.x + b.w : b.x) : null;    // 锚点 = 对边；null = 该轴不动
            ed.ay = doY ? (nearT ? b.y + b.h : b.y) : null;
        } else {
            ed.mode = "move";
        }
        ed.last = [mx, my];
        try { ov.setPointerCapture(e.pointerId); } catch (er) {}
        e.stopPropagation(); e.preventDefault();
    });
    // 悬停光标反馈：边缘=缩放、中心=移动
    shapeEl.addEventListener("pointermove", (e) => {
        if (ed.mode) return;
        const b = ed.box;
        if (!b) return;
        const [mx, my] = pos(e);
        const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
        const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
        const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
        const doX = nearL || nearR, doY = nearT || nearB;
        shapeEl.style.cursor = (doX && doY) ? ((nearL === nearT) ? "nwse-resize" : "nesw-resize")
                             : doX ? "ew-resize" : doY ? "ns-resize" : "move";
    });
    for (const k in hEl) {
        hEl[k].addEventListener("pointerdown", (e) => {
            const [mx, my] = pos(e);
            const b = ed.box;
            if (!b) return;
            const opp = { tl: [b.x + b.w, b.y + b.h], tr: [b.x, b.y + b.h], bl: [b.x + b.w, b.y], br: [b.x, b.y] }[k];
            ed.mode = "resize";
            ed.ax = opp[0]; ed.ay = opp[1];
            ed.last = [mx, my];
            try { ov.setPointerCapture(e.pointerId); } catch (er) {}
            e.stopPropagation(); e.preventDefault();
        });
    }
    ov.addEventListener("pointermove", (e) => {
        if (!ed.mode) return;
        const [mx, my] = pos(e);
        const p = toImg(mx, my), lp = toImg(ed.last[0], ed.last[1]);
        if (ed.mode === "move") {
            // 增量移动：把中心绝对坐标整体平移
            const c0 = xhSM_getCenter(node);
            xhSM_setCenter(node, c0.x + (p.x - lp.x), c0.y + (p.y - lp.y));
        } else {
            const wSW = xhSM_getW(node, "shape_width"), wSH = xhSM_getW(node, "shape_height");
            const wScale = xhSM_getW(node, "scale");
            const scaleV = Math.max(0.01, Number(wScale && wScale.value) || 1);
            if (ed.ax !== null && ed.ax !== undefined) {       // X 轴缩放（对边锚定）
                const ai = toImg(ed.ax, 0);
                const ncx = (p.x + ai.x) / 2;                  // 新中心绝对 X
                const nsw = Math.max(8, Math.round(Math.abs(p.x - ai.x) / scaleV));
                xhSM_setW(wSW, nsw);
                const cur = xhSM_getCenter(node);
                xhSM_setCenter(node, ncx, cur.y);
            }
            if (ed.ay !== null && ed.ay !== undefined) {       // Y 轴缩放（对边锚定）
                const ai = toImg(0, ed.ay);
                const ncy = (p.y + ai.y) / 2;
                const nsh = Math.max(8, Math.round(Math.abs(p.y - ai.y) / scaleV));
                xhSM_setW(wSH, nsh);
                const cur = xhSM_getCenter(node);
                xhSM_setCenter(node, cur.x, ncy);
            }
        }
        ed.last = [mx, my];
        syncShape();
        e.preventDefault();
    });
    const end = () => { ed.mode = null; ed.ax = null; ed.ay = null; };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
    ov.addEventListener("pointerleave", end);
}

function xhSM_attach(nodeType) {
    const t = nodeType.prototype;
    const oc = t.onNodeCreated;
    t.onNodeCreated = function () {
        const r = oc ? oc.apply(this, arguments) : undefined;
        if (normalizeType(this.type) === "XHShapeMaskOverlay") { try { xhSM_setup(this); } catch (e) {} }
        if (normalizeType(this.type) === "XHBBoxRegion") { try { xhBBox_setup(this); } catch (e) {} }
        if (normalizeType(this.type) === "XHSmartFaceMask") { try { xhSMF_setup(this); } catch (e) {} }
        return r;
    };
}

// XiaoHei-区域限定框 / XiaoHei-万能遮罩 共用的可视化拖拽编辑器（§7 DOM canvas，比例模型 0~1）
// 复用 xhSM_getW/setW/srcURL。四个 widget 都是「占真实图的比例」，
// 因此所有几何都在 [0,1] 区间，canvas 按真实图比例显示，拖拽即真实像素比例，永不错位。
// 2026-10-12 v1.9.0：参数化 widget 名 → 万能遮罩的排除区（exclude_cx/cy/w/h）复用同一套编辑器。
function xhBBox_setup(node) {
    return xhBox_setup(node, {
        cx: "center_x", cy: "center_y", w: "box_w", h: "box_h",
        refW: "width", refH: "height", dom: "xh_bbox_editor",
        bg: "rgba(58,209,122,.28)", border: "#3ad17a",
        tipZh: "拖绿框【边缘】缩放 · 拖【中心】移动 · 点空白定位中心",
        tipEn: "Drag box EDGE to resize · Drag CENTER to move · Click empty to set center",
    });
}
// XiaoHei-万能遮罩：排除区拖拽编辑器（红框 = 这块不找目标）
// ── 更多参数：XiaoHei-万能遮罩 的「高级参数」（很少动，收起来让面板干净）──
//    用官方受支持的 legacy facade `widget.hidden`（与 XiaoHei-加载视频 同机制）：
//    不绘制、不参与布局算高、与序列化无关（不会挪动 widgets_values 下标）。
const SMF_ADV_KEYS = [
    "threshold", "refine_iterations", "fallback_draw", "color_pick_ref",
    "mask_margin", "blur_radius", "rotation",
    "expand_left", "expand_right", "expand_top", "expand_bottom",
    "exclude_cx", "exclude_cy", "exclude_w", "exclude_h", "exclude_color",
    //  v1.9.11：多目标 / ID 上色的「细调项」（默认收进更多参数里，面板不乱）
    "target_index", "target_count", "id_alpha",
    //  2026-10-25：深度合成（默认收进更多参数 —— 不接深度图时完全用不上）
    "depth_mode", "depth_near",
    //  2026-10-25：多个排除区的「第 2..N 个框」—— 平时用编辑器里的「＋加一个排除区」维护，
    //   这个 JSON 串只是存档载体，默认收进更多参数（要手写/粘贴 JSON 时展开更多参数就能看到）
    "exclude_zones",
    //  2026-10-25：搜索区（只在区里找）—— 排除区的反面。排除区四参在更多参数里、搜索区对称也收进更多参数；
    //   绿框的日常维护同样走编辑器里的「＋加一个搜索区」
    "search_cx", "search_cy", "search_w", "search_h", "search_zones",
];
//  v1.17.7：只有 SAM 模式才用得上的参数（手动模式下永远藏起来，免得看着迷糊）
const SMF_SAM_ONLY = [
    "prompt",                                          // 手动模式不跑 SAM3，提示词没地方用
    "threshold", "refine_iterations", "fallback_draw",
    "target_scope", "target_index", "target_count",    // 多目标：手动模式就一个框，谈不上「第几个」
    "id_sort",                                         // 排序：手动模式只有一个目标
    "color_pick_ref",                                  // 取色基准：手动模式没有「目标」
];
//  v1.17.7：形状下拉「按模式给档位」—— 每个模式只给真的用得上的那些。
//    铁律：只动「可选项(options.values)」，原值一个不删 —— 老存档存的还是原值，照跑不误。
// ════════════════════════════════════════════════════════════════════════════
//  2026-11-08 v1.48.0 ·「缩面板」四件套（用户：参数太多看着头皮发麻）
//   ① 默认只留 4~5 个核心参数：按「当前模式 + 当前用途」自动挑，用不上的一律收起
//   ② 折叠状态写 node.properties ⇒ 载入工作流 / 切图不再丢（实例字段必丢，官方只恢复 properties）
//   ③ 载入自愈：越界数值夹回合法范围（专治 ComfyUI 1.58「输入超出范围 - target_count」）
//   ④ 一键恢复默认：老档里被改乱的值一键归位
// ════════════════════════════════════════════════════════════════════════════
const SMF_CORE_MANUAL = ["shape", "shape_scale", "opacity", "invert", "exclude_enable"];
const SMF_CORE_SAM = ["shape", "prompt", "threshold", "target_scope", "id_paint"];

// 「现在真正用得上」的参数才算核心 —— 选了第几个/前几个/搜索区/单色 ID，对应控件才自动露出来
function xhSMF_coreOf(node) {
    const manual = xhSMF_isManual(node);
    const core = (manual ? SMF_CORE_MANUAL : SMF_CORE_SAM).slice();
    //  2026-11-15：两个总开关「无条件常显」—— 收起态也必须够得着。
    //    旧写法是「只有自己=开才 push 进 core」⇒ 一关就整个消失、再也点不到（死循环）。
    if (!core.includes("exclude_enable")) core.push("exclude_enable");
    if (!core.includes("search_enable")) core.push("search_enable");
    const gv = (k) => String((xhSM_getW(node, k) || {}).value ?? "");
    const on = (k) => !!(xhSM_getW(node, k) || {}).value;
    if (!manual) {
        let preset = "sam_locate";
        try { preset = xhSMF_presetOf(node); } catch (e) {}
        if (preset === "sam_palette") core.push("id_alpha");
        const scope = gv("target_scope");
        if (scope === "index") core.push("target_index");
        if (scope === "first_n") core.push("target_count");
        const ip = gv("id_paint");
        if (ip === "single" || ip === "palette") core.push("id_color", "id_alpha");
    }
    return core;
}

// ════════════════════════════════════════════════════════════════════════════
//  2026-11-15 ·「一条决策链 + 三级显隐」（用户：简洁、该藏的藏、该折的折、该显的显）
//   L0 长显：核心参数 + 排除区/搜索区总开关（永不因收起而消失）
//   L1 因果显：当前组合下**不生效**的参数整个不挂 ⇒ 从根上消灭「调了没反应」的假参数
//   L2 分区折叠：其余参数归 4 区，各区独立收放（状态写 properties ⇒ 载入不丢）
//  🔴 铁律：一个参数不删、值不动、端口不动、SMF_ORDER_NOW / 存档位不动，只重排 w.hidden。
// ════════════════════════════════════════════════════════════════════════════
const SMF_SECTIONS = [
    { key: "find", zh: "找目标", en: "Find",
      keys: ["prompt", "threshold", "refine_iterations", "target_scope", "target_index",
             "target_count", "id_sort", "id_paint", "fallback_draw"] },
    { key: "color", zh: "颜色与融合", en: "Color",
      keys: ["id_color", "id_alpha", "shape_color", "opacity", "blur_radius",
             "exclude_color", "color_pick_ref", "depth_mode", "depth_near"] },
    { key: "zones", zh: "圈定范围", en: "Zones",
      keys: ["exclude_cx", "exclude_cy", "exclude_w", "exclude_h", "exclude_zones",
             "search_cx", "search_cy", "search_w", "search_h", "search_zones"] },
    { key: "shape", zh: "形状微调", en: "Shape",
      keys: ["shape_scale", "mask_margin", "expand_left", "expand_right",
             "expand_top", "expand_bottom", "rotation", "invert"] },
];
const SMF_SECTION_OF = {};
for (const _sec of SMF_SECTIONS) for (const _k of _sec.keys) SMF_SECTION_OF[_k] = _sec.key;

// L1：当前组合下后端根本不读的参数（依据 docs/小黑万能遮罩详解.md §参数表 / §211 / §287 / §370）
function xhSMF_inertOf(node) {
    const s = new Set();
    const gv = (k) => String((xhSM_getW(node, k) || {}).value ?? "");
    const on = (k) => !!(xhSM_getW(node, k) || {}).value;
    const manual = xhSMF_isManual(node);
    if (manual) for (const k of SMF_SAM_ONLY) s.add(k);       // 手动模式不跑 SAM3
    const scope = gv("target_scope");
    if (scope !== "index") s.add("target_index");              // 没选「第几个」⇒ 序号无效
    if (scope !== "first_n") s.add("target_count");            // 没选「前几个」⇒ 数量无效
    if (gv("id_paint") === "off") { s.add("id_color"); s.add("id_alpha"); }   // ID 上色关 ⇒ 色号/浓度是假参数
    //  手动模式下红框 = 遮罩框本体（后端直接拿它画），exclude_enable 关着也生效 ⇒ 不藏
    if (!manual && !on("exclude_enable"))
        for (const k of ["exclude_cx", "exclude_cy", "exclude_w", "exclude_h", "exclude_color", "exclude_zones"]) s.add(k);
    if (!on("search_enable"))
        for (const k of ["search_cx", "search_cy", "search_w", "search_h", "search_zones"]) s.add(k);
    if (gv("depth_mode") === "off") s.add("depth_near");       // 没开深度 ⇒ 「只留最近的」无效
    const shape = gv("shape");
    if (shape === "head") {                                    // head 只看四向外扩
        s.add("mask_margin"); s.add("shape_scale"); s.add("rotation");
    } else {                                                   // 其余形状四向外扩不参与
        for (const k of ["expand_left", "expand_right", "expand_top", "expand_bottom"]) s.add(k);
    }
    return s;
}

// L2：分区展开状态（properties 持久化，载入不丢；默认全折 ⇒ 点齿轮不再一泄 40 项）
function xhSMF_sectionState(node) {
    let s = {};
    try { node.properties = node.properties || {}; s = node.properties.xh_smf_sections || {}; } catch (e) { return {}; }
    const out = {};
    for (const sec of SMF_SECTIONS) out[sec.key] = !!s[sec.key];
    return out;
}
function xhSMF_toggleSection(node, key) {
    try {
        node.properties = node.properties || {};
        const s = node.properties.xh_smf_sections || (node.properties.xh_smf_sections = {});
        s[key] = !s[key];
        if (s[key] && node._xhSMFCollapsed) setSMFCollapsed(node, false);  // 点分区⇒自动展开整体，一键直达
        applySMFMode(node);
        node.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

// 摘要逐词分色（2026-11-15 用户要求「每一个词都有颜色、带不同颜色」）。
//  语义色沿用家族既有体系：金铜=用途、蓝=形状、红=排除区、绿=搜索区（与画布红绿框同源），
//  紫=提示词、橙=ID上色；状态字跟所属词同色（关则压暗）。分隔符保持中性暗灰，避免整行花掉。
const SMF_SUM_TONE = {
    preset:  { c: "#e6b800", bg: "rgba(230,184,0,.16)" },   // 家族金铜（唯一允许的常亮金）
    prompt:  { c: "#c9a7f5", bg: "rgba(201,167,245,.14)" },
    shape:   { c: "#8ab6f0", bg: "rgba(138,182,240,.14)" },
    exclude: { c: "#f08a8a", bg: "rgba(240,138,138,.16)" },
    search:  { c: "#7fd6a0", bg: "rgba(127,214,160,.15)" },
    id:      { c: "#f0b45f", bg: "rgba(240,180,95,.15)" },
};
// 摘要分段：pure text 由 xhSMF_summaryOf 拼出（tooltip / 测试桩 / 兼容全靠它），
//  渲染层用同一份分段逐词上色 ⇒ 两边永远不会漂移。sep = 该词前面的连接符。
function xhSMF_summaryParts(node) {
    const zh = (window.XH_LANG || "zh") === "zh";
    const gv = (k) => { const w = xhSM_getW(node, k); return w ? String(w.value) : ""; };
    const on = (k) => !!(xhSM_getW(node, k) || {}).value;
    let key = "sam_locate";
    try { key = xhSMF_presetOf(node); } catch (e) {}
    const L = zh ? SMF_GROUP_UI.zh : SMF_GROUP_UI.en;
    const all = L.node.items.concat(L.sam.items);
    const JOIN = " · ";
    const P = [];
    const put = (t, tone, sep, dim) => { if (t) P.push({ t: String(t), tone, sep: sep || "", dim: !!dim }); };
    put((all.find((x) => x[0] === key) || all[0])[1], "preset", "");
    if (!xhSMF_isManual(node) && gv("prompt")) put(gv("prompt"), "prompt", JOIN);
    const sh = gv("shape");
    if (sh) put(sh === "sam_mask" ? (zh ? "SAM3遮罩" : "SAM3 mask")
        : sh === "head" ? (zh ? "目标框以上" : "head box") : sh, "shape", JOIN);
    const exOn = on("exclude_enable"), seOn = on("search_enable");
    put(zh ? "排除区" : "exclude", "exclude", JOIN);
    put(exOn ? (zh ? "开" : "on") : (zh ? "关" : "off"), "exclude", " ", !exOn);
    put(zh ? "搜索区" : "search", "search", JOIN);
    put(seOn ? (zh ? "开" : "on") : (zh ? "关" : "off"), "search", " ", !seOn);
    const ip = gv("id_paint");
    if (ip && ip !== "off") put((zh ? "ID上色 " : "ID ") + ip, "id", JOIN);
    return P;
}
// 一句话摘要：收起时也能一眼确认「我现在配成了啥」（纯读现有参数，不另存状态）
function xhSMF_summaryOf(node) {
    return xhSMF_summaryParts(node).map((p) => p.sep + p.t).join("");
}

// 数值自愈：ComfyUI 1.58 起对 min/max 做校验（value_smaller_than_min）。
// 老档 / 工具条占位错位存下的非法值，会让节点一载入就报「输入超出范围」。这里统一夹回合法区间。
function xhSMF_sanitize(node) {
    if (!node) return 0;
    let fixed = 0;
    const known = new Set(SMF_ORDER_NOW);
    for (const w of node.widgets || []) {
        if (!w || !known.has(w.name)) continue;   // 工具条 / 色板 / 拖拽编辑器都不是参数，别碰
        const o = w.options || {};
        if (Array.isArray(o.values)) continue;    // COMBO：值可能被汉化过，不动
        if (typeof o.min !== "number" || typeof o.max !== "number") continue;
        let v = Number(w.value);
        if (!Number.isFinite(v)) v = Number(SMF_DEFAULT[w.name]);
        if (!Number.isFinite(v)) continue;
        const nv = Math.min(o.max, Math.max(o.min, v));
        if (nv !== Number(w.value)) { xhSM_setW(w, nv); fixed++; }
    }
    // 组合归位：「全部(一个不少)」时那两个数字控件根本不参与计算，放回出厂值免得看着乱
    try {
        const scope = String((xhSM_getW(node, "target_scope") || {}).value || "all");
        if (scope === "all") {
            for (const k of ["target_index", "target_count"]) {
                const w = xhSM_getW(node, k);
                if (w && Number(w.value) !== Number(SMF_DEFAULT[k])) {
                    xhSM_setW(w, SMF_DEFAULT[k]); fixed++;
                }
            }
        }
    } catch (e) {}
    return fixed;
}

// 折叠状态跨实例存活：LGraph.configure 会销毁重建节点实例 ⇒ JS 实例字段必丢，
// node.properties 是官方唯一保证恢复 + 序列化的载体。
function xhSMF_restoreState(node) {
    if (!node) return false;
    try { node.properties = node.properties || {}; } catch (e) { return false; }
    //  2026-11-15：总折叠键删掉后，这一层「全局收起」彻底退役 ⇒ 恒定展开。
    //   折叠唯一真源 = 四个分区（默认全折），所以恒定 false 反而更简洁：参数仍按分区藏着。
    //   ⛔ 老存档里的 xh_smf_collapsed=true 必须忽略：否则 applySMFMode 会把所有非核心参数压住，
    //      分区按钮点开也露不全 ⇒ 看起来像「点了没反应」。
    node._xhSMFCollapsed = false;
    return false;
}

// Vue(Nodes 2.0) 的 widget 可见性是 computed 派生，且 widget 可能晚于 onNodeCreated 建好
// ⇒ 单次 applySMFMode 不够，多帧重试；节点删掉后自动停（不泄漏）。
function xhSMF_scheduleApply(node) {
    [0, 60, 180, 420, 900].forEach((d) => setTimeout(() => {
        try {
            if (!node || node._xhSMFDead) return;
            applySMFMode(node);
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        } catch (e) {}
    }, d));
}

// 工具条「重置 · 默认」键（图标走家族「重置」）：老工作流参数被改乱 / 提示「输入超出范围」时一键归位
function mkSMFResetBtn(node) {
    const b = document.createElement("button");
    b.type = "button";
    paintBarBtn(b, "neutral");
    b.style.cssText = b.style.cssText
        + "height:20px;padding:0 7px;font:11px sans-serif;white-space:nowrap;flex:0 0 auto;";
    //  2026-11-08：文案原来写死中文、title 只在建节点时读一次语言 ⇒ 切 EN 永远不跟随。
    //   改成按当前语言重刷，并挂进 _xhFillRefresh 链（包一层，不动别人挂的）。
    const refresh = () => {
        const zh = (window.XH_LANG || "zh") === "zh";
        //  2026-11-15：Unicode "↺" → 家族「重置」(rotate-ccw)；每次 refresh 先清空再塞，幂等。
        b.textContent = "";
        b.insertAdjacentHTML("afterbegin", xhIconHTML("重置", { size: 11, color: "current" }));
        b.appendChild(document.createTextNode(" " + (zh ? "默认" : "Reset")));
        b.style.display = "inline-flex";
        b.style.alignItems = "center";
        b.style.justifyContent = "center";
        b.title = zh
            ? "一键把所有参数写回出厂值（老工作流参数被改乱、或提示「输入超出范围」时点它）"
            : "Reset every parameter to its factory default";
    };
    refresh();
    node._xhSMFResetRefresh = refresh;
    const prevFillRefresh = node._xhFillRefresh;
    node._xhFillRefresh = () => { try { prevFillRefresh && prevFillRefresh(); } catch (e) {} try { refresh(); } catch (e) {} };
    b.onclick = (e) => {
        e.stopPropagation();
        for (const k of SMF_ORDER_NOW) {
            if (!(k in SMF_DEFAULT)) continue;
            xhSM_setW(xhSM_getW(node, k), SMF_DEFAULT[k]);
        }
        try { applySMFMode(node); } catch (err) {}
        try { node.setDirtyCanvas && node.setDirtyCanvas(true, true); } catch (err) {}
    };
    ["pointerdown", "mousedown", "dblclick", "keydown"].forEach((ev) =>
        b.addEventListener(ev, (e) => e.stopPropagation()));
    return b;
}
const SMF_SHAPE_RENDER = ["rectangle", "circle", "square", "ellipse", "semicircle",
                          "quarter_circle", "triangle", "cross", "star", "radial"];
// SAM 模式：SAM3遮罩 / 目标框以上(四向外扩) / 借 SAM3 定位再套上的 10 种形状
const SMF_SHAPE_SAM = ["sam_mask", "head"].concat(SMF_SHAPE_RENDER);
// 手动模式：直接画得出来的 10 种形状（「手动框」不再单列 —— 选了手动模式本身就是手动框）
const SMF_SHAPE_MANUAL = SMF_SHAPE_RENDER.slice();
function smfApplyShapeOptions(node, manual) {
    const ws = (node.widgets || []).find((x) => x && x.name === "shape");
    if (!ws || !ws.options) return;
    let want = manual ? SMF_SHAPE_MANUAL : SMF_SHAPE_SAM;
    if (!want.includes(String(ws.value))) {
        // 跨模式残留 / 老存档：manual_box 直接归位到手动模式（与后端旧行为完全一致）
        if (String(ws.value) === "manual_box") {
            const wm = (node.widgets || []).find((x) => x && x.name === "mask_mode");
            if (wm) wm.value = "manual";
            want = SMF_SHAPE_MANUAL;
        }
        ws.value = want.includes(String(ws.value)) ? String(ws.value) : want[0];
    }
    ws.options.values = want.slice();
}
//  v1.17.7：参数重排后的「老存档迁移」。
//   判据：老布局 widgets_values[0] = 形状原值（sam_mask / head / circle …）；
//         新布局 [0] = mask_mode（"sam" / "manual"）。
//   长度 23 = ≤1.17.5（还没模式/多目标/ID 上色）；31 = 1.17.6（8 个新参数追加在末尾）。
//   新布局长度不齐（31/33/34）⇒ 只把后续新参数的默认值补到末尾（depth_*/exclude_zones/search_*）。
//   命中 ⇒ 按「名字」重排成新顺序，再交给 fixWidgetValuesFromSaved 常规对位 —— 老工作流一行都不用改。
const SMF_ORDER_OLD = ["shape", "exclude_enable", "exclude_cx", "exclude_cy", "exclude_w", "exclude_h",
    "exclude_color", "threshold", "shape_scale", "mask_margin", "shape_color", "opacity", "blur_radius",
    "rotation", "invert", "fallback_draw", "refine_iterations", "expand_left", "expand_right",
    "expand_top", "expand_bottom", "color_pick_ref", "prompt"];
const SMF_ORDER_176 = SMF_ORDER_OLD.concat(["mask_mode", "target_scope", "target_index", "target_count",
    "id_paint", "id_sort", "id_color", "id_alpha"]);
const SMF_ORDER_NOW = ["mask_mode", "shape", "prompt", "threshold", "refine_iterations",
    "target_scope", "target_index", "target_count", "id_sort", "id_paint", "id_color", "id_alpha",
    "exclude_enable", "exclude_cx", "exclude_cy", "exclude_w", "exclude_h", "exclude_color",
    "shape_scale", "mask_margin", "expand_left", "expand_right", "expand_top", "expand_bottom",
    "shape_color", "opacity", "blur_radius", "rotation", "invert", "fallback_draw", "color_pick_ref"];
//  2026-10-25：深度合成（SAM3 给「谁」+ 深度给「谁在前」）
const SMF_ORDER_NOW31 = SMF_ORDER_NOW.slice();   // 加深度之前那版（31 项），用于老存档补齐
SMF_ORDER_NOW.push("depth_mode", "depth_near");  // 新参数一律追加末尾 ⇒ 老存档零影响
//  2026-10-25：多个排除区（第 2..N 个框，JSON）—— 照样追加末尾 ⇒ 老存档零迁移
const SMF_ORDER_NOW33 = SMF_ORDER_NOW.slice();   // 加深度之后、加多排除区之前（33 项），用于老存档补齐
SMF_ORDER_NOW.push("exclude_zones");             // ⇒ 34 项
//  2026-10-25：搜索区（只在区里找）—— 排除区的反面，照样追加末尾 ⇒ 老存档零迁移
const SMF_ORDER_NOW34 = SMF_ORDER_NOW.slice();   // 加搜索区之前（34 项），用于老存档补齐
SMF_ORDER_NOW.push("search_enable", "search_cx", "search_cy", "search_w", "search_h", "search_zones"); // ⇒ 40 项（当前版）
const SMF_DEFAULT = {
    mask_mode: "sam", shape: "sam_mask", prompt: "person", threshold: 0.5, refine_iterations: 2,
    target_scope: "all", target_index: 0, target_count: 3, id_sort: "left_right", id_paint: "off",
    id_color: "#1F78B5", id_alpha: 0.45, exclude_enable: false, exclude_cx: 0.19, exclude_cy: 0.346,
    exclude_w: 0.379, exclude_h: 0.692, exclude_color: "#000000", shape_scale: 1.0, mask_margin: 15,
    expand_left: 0.5, expand_right: 0.5, expand_top: 0.9, expand_bottom: 0.0,
    shape_color: "#e8e8e8", opacity: 1.0, blur_radius: 0, rotation: 0, invert: false,
    fallback_draw: false, color_pick_ref: "center",
    depth_mode: "off", depth_near: 0.0,
    //  2026-10-25：多个排除区 —— 默认空 = 只有第 1 个框（老 4 参），行为与旧版完全一致
    exclude_zones: "",
    //  2026-10-25：搜索区 —— 默认关 + 居中 6 成，不开时行为与旧版逐字节一致
    search_enable: false, search_cx: 0.5, search_cy: 0.5, search_w: 0.6, search_h: 0.6,
    search_zones: "",
};
function xhSMF_migrate(node, saved) {
    if (!node || !saved || !Array.isArray(saved.widgets_values)) return;
    if (saved.widgets_values_named) return;                 // 新前端按名字存档 ⇒ 与顺序无关，不用迁
    let v = saved.widgets_values;
    if (v.length && (v[0] === "" || v[0] === null || v[0] === undefined)) v = v.slice(1);  // 工具条残留空位
    if (!v.length) return;
    if (String(v[0]) === "sam" || String(v[0]) === "manual") {
        // 已是新布局，但长度是旧档位 ⇒ 把新参数默认值补齐到末尾
        if (v.length === SMF_ORDER_NOW31.length) {              // 31 = 加深度之前那版
            saved.widgets_values = v.concat([
                SMF_DEFAULT.depth_mode,
                SMF_DEFAULT.depth_near,
                SMF_DEFAULT.exclude_zones,
                SMF_DEFAULT.search_enable,
                SMF_DEFAULT.search_cx,
                SMF_DEFAULT.search_cy,
                SMF_DEFAULT.search_w,
                SMF_DEFAULT.search_h,
                SMF_DEFAULT.search_zones,
            ]);
        } else if (v.length === SMF_ORDER_NOW33.length) {       // 33 = 加深度后、加多排除区前
            saved.widgets_values = v.concat([
                SMF_DEFAULT.exclude_zones,
                SMF_DEFAULT.search_enable,
                SMF_DEFAULT.search_cx,
                SMF_DEFAULT.search_cy,
                SMF_DEFAULT.search_w,
                SMF_DEFAULT.search_h,
                SMF_DEFAULT.search_zones,
            ]);
        } else if (v.length === SMF_ORDER_NOW34.length) {       // 34 = 加多排除区后、加搜索区前
            saved.widgets_values = v.concat([
                SMF_DEFAULT.search_enable,
                SMF_DEFAULT.search_cx,
                SMF_DEFAULT.search_cy,
                SMF_DEFAULT.search_w,
                SMF_DEFAULT.search_h,
                SMF_DEFAULT.search_zones,
            ]);
        }
        return;
    }
    let old = null;
    if (v.length === SMF_ORDER_OLD.length) old = SMF_ORDER_OLD;
    else if (v.length === SMF_ORDER_176.length) old = SMF_ORDER_176;
    if (!old) return;
    const byName = {};
    old.forEach((k, i) => { byName[k] = v[i]; });
    // 老档位 manual_box（「不用模型」那个隐藏档）→ 新布局的「手动模式」，行为完全一致
    if (String(byName.shape) === "manual_box") { byName.mask_mode = "manual"; byName.shape = "rectangle"; }
    saved.widgets_values = SMF_ORDER_NOW.map((k) => (k in byName ? byName[k] : SMF_DEFAULT[k]));
    try { console.log("[XiaoHei-万能遮罩] 老存档参数顺序已自动迁移 → 新顺序"); } catch (e) {}
}
function setSMFCollapsed(node, collapsed) {
    if (!node) return;
    const col = !!collapsed;
    node._xhSMFCollapsed = col;
    //  v1.48.0：写进 properties ⇒ 载入工作流后不丢，齿轮图标与参数状态也不会对不上
    try { node.properties = node.properties || {}; node.properties.xh_smf_collapsed = col; } catch (e) {}
    //  展开时若四个分区全折着，自动亮起「找目标」区给即时反馈（避免「点了没反应」）。
    //  2026-11-15：总折叠键删除后本函数仅剩分区按钮的兜底调用，逻辑保留不删以防老档兼容。
    if (!col) {
        try {
            const s = node.properties.xh_smf_sections || (node.properties.xh_smf_sections = {});
            if (!SMF_SECTIONS.some((sec) => !!s[sec.key])) s.find = true;
        } catch (e) {}
    }
    try { node._xhSMFGear && node._xhSMFGear._xhGearSet && node._xhSMFGear._xhGearSet(col); } catch (e) {}
    applySMFMode(node);
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}
function applySMFMode(node) {
    if (!node) return;
    const col = !!node._xhSMFCollapsed;
    const hide = (k, on) => {
        const w = xhSM_getW(node, k);
        if (!w) return;
        try { w.hidden = !!on; } catch (e) {}
        // Vue(Nodes 2.0) 的 deriveWidgetVisibility 读 hidden ?? options.hidden ⇒ 两处都写，双保险
        try { w.options = w.options || {}; w.options.hidden = !!on; } catch (e) {}
        //  不动 DOM display：Vue widget 的 element 可能是节点容器，硬设 none 会把整块节点藏掉，
        //    且恢复时 display="" 会冲掉原本的 flex 布局。官方两条读法 + 多帧重算已足够。
    };
    //  2026-11-15：三级显隐统一在这里判定（原先「收起只留 core / 展开全放」会一泄 40 项，
    //    且 ID上色关、深度关、形状不对时仍挂着一堆调了没反应的假参数）。
    const inert = xhSMF_inertOf(node);
    const core = new Set(xhSMF_coreOf(node));
    const secOpen = xhSMF_sectionState(node);
    hide("mask_mode", true);   // 模式统一由工具条分组浮层管，原生下拉视觉隐藏（值照存）
    for (const k of SMF_ORDER_NOW) {
        if (k === "mask_mode") continue;
        // L0：控制台挂载成功后两个总开关由红绿胶囊接管 ⇒ 原生 widget 只存值、不再重复画
        if (node._xhSMFDeckReady && (k === "exclude_enable" || k === "search_enable")) { hide(k, true); continue; }
        if (inert.has(k)) { hide(k, true); continue; }        // L1 假参数：任何状态都不挂
        if (core.has(k)) { hide(k, false); continue; }         // L0 长显
        if (col) { hide(k, true); continue; }                  // 收起态：其余全收
        const sec = SMF_SECTION_OF[k];
        hide(k, sec ? !secOpen[sec] : false);                  // L2 展开态：按分区各自收放
    }
    try { smfIdColorMode(node); } catch (e) {}
    try { smfApplyShapeOptions(node, xhSMF_isManual(node)); } catch (e) {}
    try { node._xhSMFDeckRefresh && node._xhSMFDeckRefresh(); } catch (e) {}
    try { node._xhModeBtnRefresh && node._xhModeBtnRefresh(); } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}
function xhSMFModeHook(node) {
    if (!node || node._xhSMFModeHooked) return;
    node._xhSMFModeHooked = true;
    applySMFMode(node);
    // 模式一变 / 深度用法一变 ⇒ 重算显隐（深度=关时把「只留最近的」藏起来）
    //  2026-10-25：id_paint 一变 ⇒ ID 颜色色板三模式联动（palette→single 时置灰要立刻解除）
    //  2026-11-15：因果显的触发源补齐 —— 形状 / 要哪几个目标 / 两个总开关一变，
    //    立刻重算 inert（否则刚打开的分区里还挂着上一组合的假参数）。
    for (const wname of ["mask_mode", "depth_mode", "id_paint", "shape", "target_scope",
                         "exclude_enable", "search_enable"]) {
        const wm = (node.widgets || []).find((w) => w && w.name === wname);
        if (!wm || wm._xhSMFCbHooked) continue;
        wm._xhSMFCbHooked = true;
        const prev = wm.callback;
        wm.callback = function () {
            try { prev && prev.apply(this, arguments); } catch (e) {}
            try { applySMFMode(node); } catch (e) {}
        };
    }
}

function xhSMF_setup(node) {
    const r = xhBox_setup(node, {
        cx: "exclude_cx", cy: "exclude_cy", w: "exclude_w", h: "exclude_h",
        refW: null, refH: null, dom: "xh_exclude_editor",
        //  2026-10-25：多个排除区 —— 红框 = 第 1 个框（老参数），附加框（虚线）= 第 2..N 个框
        zones: "exclude_zones",
        //  2026-10-25：框序号标签前缀跟着模式走 —— 接模型=排除区/搜索区；不接模型=手遮框/搜索范围。
        //   参数 gi = 组索引（0=红/排除区，1=绿/搜索区）
        tagPFn: (gi) => {
            const man = xhSMF_isManual(node);
            const zh = (window.XH_LANG || "zh") === "zh";
            if (gi === 1) return man ? { zh: "搜索范围", en: "range" } : { zh: "搜索区", en: "search" };
            return man ? { zh: "手遮框", en: "overlay" } : { zh: "排除区", en: "zone" };
        },
        bg: "rgba(214,69,65,.30)", border: "#e0554f",
        tipZh: "排除区1：接了模型=这块不找目标，不接模型=直接手遮 · 拖【边缘】缩放 · 拖【中心】移动 · 下方「＋」加排除区2、3、4…(虚线)",
        tipEn: "Zone 1: with model = don't detect here; without = manual overlay · Drag EDGE/CENTER · use ＋ below for zones 2,3,4… (dashed)",
        //  2026-10-25：搜索区（绿框组）—— 排除区的反面：SAM3 只在绿框里找，区外涂黑。
        //   手动模式下 = 手遮框的活动范围（形状只在绿框里画）。颜色/几何内部定，调用方只给 widget 名。
        search: {
            cx: "search_cx", cy: "search_cy", w: "search_w", h: "search_h", zones: "search_zones",
            enable: "search_enable",
        },
        deck: true,   // 2026-11-15：常显控制台（双开关 / 分区 / 摘要）挂进已有 wrap
    });
    try { xhSMFModeHook(node); } catch (e) {}    //  v1.9.11：模式切换 → SAM 专属参数自动显隐
    return r;
}
// 2026-11-15：常显控制台 —— 双开关 + 分区折叠 + 一句话摘要。
//  ⛔ 不新增 addDOMWidget：本机前端不认 serialize:false，多一个 DOM 控件照样写进
//     widgets_values（40→41）⇒ xhSMF_migrate 的档位判定全失效、老存档会迁移错。
//    所以挂进「已有的框编辑器 wrap」内部，只加高度、零新增控件。
function mkSMFDeck(node) {
    //  2026-11-15：四个分区各配一枚家族语义图标（全部经 semantic.mjs 校验指向真实 svg）。
    //    find=搜索/search · color=颜色选择/palette · zones=框选/square-dashed · shape=形状/shapes
    const SEC_ICONS = { find: "搜索", color: "颜色选择", zones: "框选", shape: "形状" };
    const root = document.createElement("div");
    root.style.cssText = "width:100%;box-sizing:border-box;display:grid;gap:4px;margin-bottom:6px;";
    const zhNow = () => (window.XH_LANG || "zh") === "zh";
    const mkBtn = () => {
        const b = document.createElement("button");
        b.type = "button";
        b.style.cssText = "flex:1;min-width:0;padding:3px 6px;border-radius:5px;cursor:pointer;"
            + "font:11px sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
            + "background:#232323;color:#c9d1e0;border:1px solid #3a3a3a;";
        ["pointerdown", "mousedown", "dblclick", "keydown", "click"].forEach((ev) =>
            b.addEventListener(ev, (e) => e.stopPropagation()));
        return b;
    };
    // 行 1：范围双开关（红=排除区 / 绿=搜索区）—— 点一下直接写回原生 widget，值与存档位都不动
    const rowSw = document.createElement("div");
    rowSw.style.cssText = "display:flex;gap:6px;";
    const mkSwitch = (wname, zhT, enT, onCol) => {
        const b = mkBtn();
        b.dataset.zh = zhT; b.dataset.en = enT; b.dataset.w = wname; b.dataset.col = onCol;
        b.onclick = (e) => {
            e.stopPropagation();
            const w = xhSM_getW(node, wname);
            if (!w) return;
            xhSM_setW(w, !w.value);
            try { applySMFMode(node); } catch (err) {}
            try { node.setDirtyCanvas?.(true, true); } catch (err) {}
            refresh();
        };
        return b;
    };
    const swEx = mkSwitch("exclude_enable", "排除区", "Exclude", "#f85149");
    const swSe = mkSwitch("search_enable", "搜索区", "Search", "#3fb950");
    rowSw.appendChild(swEx); rowSw.appendChild(swSe);
    // 行 2：四个分区，各自收放（带当前可用项数）
    const rowSec = document.createElement("div");
    rowSec.style.cssText = "display:flex;gap:4px;";
    const secBtns = {};
    for (const sec of SMF_SECTIONS) {
        const b = mkBtn();
        b.onclick = (e) => { e.stopPropagation(); xhSMF_toggleSection(node, sec.key); refresh(); };
        secBtns[sec.key] = b;
        rowSec.appendChild(b);
    }
    // 行 3：一句话摘要（2026-11-15 逐词分色）
    const sum = document.createElement("div");
    sum.style.cssText = "font:11px sans-serif;color:#8a93a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.9;";
    const paintSummary = () => {
        sum.textContent = "";
        for (const p of xhSMF_summaryParts(node)) {
            if (p.sep) {
                const d = document.createElement("span");
                d.textContent = p.sep;
                d.style.cssText = "color:#5f6a78;font-weight:400;";
                sum.appendChild(d);
            }
            const tone = SMF_SUM_TONE[p.tone] || SMF_SUM_TONE.shape;
            const s = document.createElement("span");
            s.textContent = p.t;
            s.style.cssText = "color:" + tone.c + ";background:" + tone.bg + ";"
                + "border-radius:4px;padding:1px 5px;font-weight:600;"
                + (p.dim ? "opacity:.6;" : "");
            sum.appendChild(s);
        }
        sum.title = sum.textContent;   // tooltip 仍是纯文本，不含样式
    };
    root.appendChild(rowSw); root.appendChild(rowSec); root.appendChild(sum);
    const paintSwitch = (b, wname) => {
        const zh = zhNow();
        const isOn = !!(xhSM_getW(node, wname) || {}).value;
        const label = zh ? b.dataset.zh : b.dataset.en;
        b.textContent = label + " · " + (isOn ? (zh ? "开" : "on") : (zh ? "关" : "off"));
        b.style.borderColor = isOn ? b.dataset.col : "#3a3a3a";
        b.style.color = isOn ? b.dataset.col : "#8a93a6";
        b.style.background = isOn ? "rgba(255,255,255,.06)" : "#232323";
    };
    const refresh = () => {
        try {
            paintSwitch(swEx, "exclude_enable");
            paintSwitch(swSe, "search_enable");
            const st = xhSMF_sectionState(node), inert = xhSMF_inertOf(node), zh = zhNow();
            for (const sec of SMF_SECTIONS) {
                const b = secBtns[sec.key];
                const n = sec.keys.filter((k) => !inert.has(k)).length;
                //  2026-11-15：▾/▸ 裸字符 → 每区一枚家族语义图标；展开态靠底色区分，不再靠箭头。
                //  ⛔ 图标占的是原来符号的位置（不新增一道），文字原样保留。
                b.textContent = "";
                b.insertAdjacentHTML("afterbegin", xhIconHTML(SEC_ICONS[sec.key] || "分组", { size: 11, color: "current" }));
                const tx = document.createElement("span");
                tx.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
                tx.textContent = " " + (zh ? sec.zh : sec.en) + " " + n;
                b.appendChild(tx);
                b.style.display = "inline-flex";
                b.style.alignItems = "center";
                b.style.justifyContent = "center";
                b.style.borderColor = st[sec.key] ? "#4a6fd8" : "#3a3a3a";
                b.style.color = st[sec.key] ? "#dbe6ff" : "#8a93a6";
                b.style.background = st[sec.key] ? "rgba(74,111,216,.18)" : "#232323";
            }
            paintSummary();
        } catch (e) {}
    };
    node._xhSMFDeckRefresh = refresh;
    const prevFill = node._xhFillRefresh;
    node._xhFillRefresh = () => { try { prevFill && prevFill(); } catch (e) {} try { refresh(); } catch (e) {} };
    refresh();
    return root;
}

function xhBox_setup(node, N) {
    if (node._xhBBox) return;                         // 幂等
    const wrap = document.createElement("div");
    wrap.style.cssText = "width:100%;padding:6px 8px;box-sizing:border-box;background:#141414;border-radius:8px;";
    const stage = document.createElement("div");
    stage.style.cssText = "position:relative;width:100%;min-height:140px;background:#1c1c1c;border-radius:6px;overflow:hidden;line-height:0;";
    const cv = document.createElement("canvas");
    cv.width = 320; cv.height = 213;
    cv.style.cssText = "width:100%;height:auto;display:block;background:#1c1c1c;border-radius:6px;";
    const ov = document.createElement("div");
    ov.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:crosshair;";
    //  2026-10-25：双组框 —— 红组 = 排除区（必有），绿组 = 搜索区（传了 N.search 才有）。
    //   每组 = 主框（第 1 个框：el + 序号 tag + 4 个缩放手柄，手柄挂 ov）+ 附加框列表（第 2..N 个）。
    const GRPS = [{
        cx: N.cx, cy: N.cy, w: N.w, h: N.h, zones: N.zones,
        bg: N.bg, border: N.border, tagCol: "#ff9a90",
        //  2026-10-25：红组也接上总开关（跟绿组对称）—— 「启用排除区」关着 ⇒ 红框整套隐藏 + 红按钮禁用。
        //   v1.17.6 起 exclude_enable 默认关 ⇒ 新节点拖出来画布干干净净，想排除再开。
        enable: "exclude_enable",
        tipZh: N.tipZh, tipEn: N.tipEn,
        main: null, els: [],
    }];
    if (N.search) {
        GRPS.push({
            cx: N.search.cx, cy: N.search.cy, w: N.search.w, h: N.search.h, zones: N.search.zones,
            bg: "rgba(58,209,122,.20)", border: "#3ad17a", tagCol: "#7ce8a8",
            //  总开关：搜索区关着时绿框整套隐藏（不然默认关还画个大绿框，用户以为出 bug）
            enable: N.search.enable || "search_enable",
            tipZh: "搜索区1：SAM3 只在绿框里找，区外涂黑(手遮模式下=形状只在这里画) · 拖【边缘】缩放 · 拖【中心】移动 · 下方「＋」加搜索区2、3、4…",
            tipEn: "Search zone 1: SAM3 detects only inside (manual mode = overlay only here) · Drag EDGE/CENTER · ＋ below for zones 2,3,4…",
            main: null, els: [],
        });
    }
    //  2026-10-25：红组总开关的「手动模式豁免」——
    //   手动模式（后端 use_manual：选了 manual / shape=manual_box / 没接 MODEL 线）下，红框（排除区框）
    //   就是【遮罩框】本体（后端直接拿它当遮罩画），exclude_enable 默认关 ⇒ 若不豁免，
    //   手动用户打开节点：框被藏、＋按钮全禁用，直接没法用。
    //   判定用 xhSMF_isManual（与后端逐字对齐）—— 曾只认 mask_mode，漏了「没接模型」这一种，
    //   导致 SAM 模式+拔了 MODEL 线的用户红框被藏、遮不住脸（2026-10-25 用户实报 bug）。
    const boxGroupOn = (gi) => {
        if (gi !== 0) return true;                                   // 绿组：照旧跟随 search_enable
        return !xhSMF_isManual(node);                                // 手动 ⇒ 红组恒开（无视 exclude_enable）
    };
    const mkMain = (g) => {
        const el = document.createElement("div");
        el.style.cssText = "position:absolute;box-sizing:border-box;background:" + g.bg + ";border:2px dashed " + g.border + ";";
        ov.appendChild(el);
        const tag = document.createElement("div");
        //  2026-11-15：标签压在【图片本身】上，浅粉 10px 在浅色图上直接化掉（用户实报）。
        //   改成「深底胶囊 + 亮字 + 组色左条」⇒ 任何底图都清楚；总高仍 15px、top 不变 ⇒ 零布局影响。
        tag.style.cssText = "position:absolute;left:2px;top:-15px;color:" + g.tagCol + ";"
            + "background:rgba(20,20,20,.88);border-left:3px solid " + g.border + ";"
            + "padding:1px 6px 1px 5px;border-radius:0 3px 3px 0;"
            + "font:500 11px/13px sans-serif;white-space:nowrap;pointer-events:none;";
        el.appendChild(tag);
        const hs = {};
        for (const k of ["tl", "tr", "bl", "br"]) {
            const d = document.createElement("div");
            d.style.cssText = "position:absolute;width:11px;height:11px;margin:-6px 0 0 -6px;background:#fff;border:1px solid " + g.border + ";box-sizing:border-box;cursor:nwse-resize;";
            hs[k] = d; ov.appendChild(d);
        }
        return { el, tag, hs };
    };
    for (const g of GRPS) g.main = mkMain(g);
    // 红组别名 —— 下游红框逻辑（拖拽/显隐/取色）一个字都不用改
    const boxEl = GRPS[0].main.el, tagEl = GRPS[0].main.tag, hEl = GRPS[0].main.hs;
    const tip = document.createElement("div");
    tip.style.cssText = "color:#8a93a6;font:11px sans-serif;padding:4px 2px 0;text-align:center;line-height:1.4;";
    stage.appendChild(cv); stage.appendChild(ov);
    //  2026-10-25：ID 颜色色板行 —— 挂框编辑器 wrap 顶部（stage 之前）；三模式联动见 smfIdColorMode。
    //    必须挂在这（xhBox_setup，万能遮罩的编辑器）而不是 xhSM_setup —— 后者只给老节点 XHShapeMaskOverlay 用；
    //   v11 曾加错地方 ⇒ 万能遮罩上色板整个不显示。高度 +20 同步进 getMinHeight，不然被定高裁掉。
    //  2026-11-15：常显控制台（双开关 / 分区 / 摘要）—— 只挂进已有 wrap，不新增 DOM widget。
    //    挂成功才置 _xhSMFDeckReady ⇒ applySMFMode 才敢把原生两个开关藏起来（失败时原生照常兜底）。
    if (N.deck) {
        try {
            const _deck = mkSMFDeck(node);
            if (_deck) { wrap.appendChild(_deck); node._xhSMFDeckReady = true; }
        } catch (e) { console.warn("[XiaoHei] 万能遮罩控制台挂载失败:", e); }
    }
    try { const _idRow = mkSMFIdColorRow(node); if (_idRow) wrap.appendChild(_idRow); } catch (e) { console.warn("[XiaoHei] ID 色板挂载失败:", e); }
    wrap.appendChild(stage); wrap.appendChild(tip);

    const ed = node._xhBBox = { img: null, url: null, imgW: 0, imgH: 0, box: null, mode: null, ax: null, ay: null, last: null, cv, dead: false, miss: 0,
        //  2026-10-25：附加框（第 2..N 个）的拖拽状态 —— zg=正在拖哪一组（0=红/排除区，1=绿/搜索区）
        zmode: null, zidx: null, zax: null, zay: null, zg: 0 };

    try {
        node.addDOMWidget(N.dom, "custom", wrap, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => Math.round((cv.height || 200) + (N.zones ? 62 : 34) + (N.search ? 31 : 0) + 20 + (N.deck ? 78 : 0)),
        });
    } catch (e) { console.warn("[XiaoHei] 区域限定框编辑器挂载失败:", e); }

    const orm = node.onRemoved;
    node.onRemoved = function () { ed.dead = true; return orm ? orm.apply(this, arguments) : undefined; };

    //  2026-10-25：多框工具条 —— 每组一对按钮（红=排除区 / 绿=搜索区），按 GRPS 循环建
    if (N.zones || N.search) {
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:6px;padding:6px 2px 0;";
        const mkBtn = (zhT, enT, fn) => {
            const b = document.createElement("button");
            b.style.cssText = "flex:1;padding:4px 6px;border:1px solid #3a3a3a;border-radius:5px;background:#232323;color:#c9d1e0;font:11px sans-serif;cursor:pointer;";
            b.dataset.zh = zhT; b.dataset.en = enT;
            setXHBtnLabel(b, (window.XH_LANG || "zh") === "zh" ? zhT : enT);
            b.addEventListener("click", fn);
            bar.appendChild(b);
            return b;
        };
        ed.btnAdd = []; ed.btnClr = [];
        GRPS.forEach((g, gi) => {
            // 新框默认位置两组错开：红组丢右上、绿组丢左下 —— 不叠一起
            const dflt = (gi === 0) ? { cx: 0.72, cy: 0.26, w: 0.18, h: 0.16 }
                                    : { cx: 0.28, cy: 0.74, w: 0.18, h: 0.16 };
            ed.btnAdd.push(mkBtn(
                gi === 0 ? "＋ 加一个排除区" : "＋ 加一个搜索区",
                gi === 0 ? "＋ Add exclusion zone" : "＋ Add search zone",
                () => {
                    const arr = readZones(g);
                    arr.push({ cx: dflt.cx, cy: dflt.cy, w: dflt.w, h: dflt.h });
                    writeZones(arr, g);
                }));
            ed.btnClr.push(mkBtn(
                gi === 0 ? " 清空附加区" : " 清空搜索区",
                gi === 0 ? " Clear extra zones" : " Clear search zones",
                () => { writeZones([], g); }));
        });
        wrap.appendChild(bar);
    }

    function refWH() {
        // 坐标系：优先已加载预览图真实尺寸；否则手动宽高；否则 1536×1024 默认
        if (ed.imgW && ed.imgH) return { w: ed.imgW, h: ed.imgH };
        const wW = N.refW ? xhSM_getW(node, N.refW) : null;
        const wH = N.refH ? xhSM_getW(node, N.refH) : null;
        const mw = wW ? Number(wW.value) : 0, mh = wH ? Number(wH.value) : 0;
        if (mw > 0 && mh > 0) return { w: mw, h: mh };
        return { w: 1536, h: 1024 };
    }
    function fit() {
        const W = Math.max(160, Math.round(wrap.clientWidth) - 16);
        const r = refWH();
        const H = Math.max(90, Math.round(W * r.h / r.w));
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    }
    function clampF(v) { return Math.max(0, Math.min(1, v)); }
    //  2026-10-25：框序号标签前缀 —— 调用方可传 tagPFn(gi) 按模式动态给（万能遮罩：SAM=排除区/搜索区，
    //   手动=手遮框/搜索范围），不传的节点（XiaoHei-区域限定框）用默认「区域」。主框 = 前缀+1，附加框 = 前缀+2,3,4…
    function tagPF(gi) { return N.tagPFn ? N.tagPFn(gi) : { zh: "区域", en: "zone" }; }

    function draw() {
        const W = cv.width || 320, H = cv.height || 213;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#1c1c1c"; ctx.fillRect(0, 0, W, H);
        if (ed.img && ed.imgW) { try { ctx.drawImage(ed.img, 0, 0, W, H); } catch (e) {} }
        // 网格
        ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1;
        const cols = 8, rows = Math.max(4, Math.round(cols * (H / W)));
        for (let i = 0; i <= cols; i++) { const x = W * i / cols; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let j = 0; j <= rows; j++) { const y = H * j / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        // 中心十字参考
        ctx.strokeStyle = "rgba(58,209,122,.45)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        // 状态行（每帧重绘，切 EN 也跟着翻）
        const R = refWH();
        const wCX = xhSM_getW(node, N.cx), wCY = xhSM_getW(node, N.cy);
        const wBW = xhSM_getW(node, N.w), wBH = xhSM_getW(node, N.h);
        const cxT = Math.round((Number(wCX && wCX.value) || 0) * 100);
        const cyT = Math.round((Number(wCY && wCY.value) || 0) * 100);
        const bwT = Math.round((Number(wBW && wBW.value) || 0) * 100);
        const bhT = Math.round((Number(wBH && wBH.value) || 0) * 100);
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, H - 18, W, 18);
        ctx.fillStyle = "#c9d1e0"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
        const zh = (window.XH_LANG || "zh") === "zh";
        let zTail = "";
        //  2026-10-25：两组同时开着 ⇒ 状态行直接告诉用户「最终 SAM3 能看的区域」的算法，不用猜
        //   处理顺序：先裁搜索区（区外涂黑）→ 再挖排除区（区内涂黑）⇒ 有效区 = 搜索区内 − 排除区
        const _exOn = !!(xhSM_getW(node, "exclude_enable") || {}).value;
        const _seOn = !!(xhSM_getW(node, "search_enable") || {}).value;
        if (N.zones) {
            zTail += zh ? ` · 附加区 ×${readZones(GRPS[0]).length}` : ` · extra zones ×${readZones(GRPS[0]).length}`;
        }
        if (N.search) {
            zTail += zh ? ` · 搜索区 ×${readZones(GRPS[1]).length}` : ` · search ×${readZones(GRPS[1]).length}`;
        }
        if (_exOn && _seOn) {
            zTail += zh ? ` · 有效区=搜索区内−排除区` : ` · effective = search − exclude`;
        } else if (_seOn) {
            zTail += zh ? ` · 有效区=搜索区内` : ` · effective = inside search`;
        } else if (_exOn) {
            zTail += zh ? ` · 有效区=全图−排除区` : ` · effective = all − exclude`;
        }
        ctx.fillText(zh
            ? `参考 ${R.w}×${R.h} · 中心 ${cxT}%,${cyT}% · 区域 ${bwT}%×${bhT}%${zTail}`
            : `Ref ${R.w}×${R.h} · Center ${cxT}%,${cyT}% · Region ${bwT}%×${bhT}%${zTail}`, 6, H - 5);
    }

    function syncBox(g) {
        const W = cv.width || 320, H = cv.height || 213;
        //  2026-10-25：绿组跟随 search_enable 开关 —— 关着就整套隐藏，不占画面
        //    2026-10-25 补：红组（gi=0）在手动模式下豁免 —— 那时红框=遮罩框，必须恒显
        if (g.enable && boxGroupOn(GRPS.indexOf(g))) {
            const wEn = xhSM_getW(node, g.enable);
            if (wEn && !wEn.value) {
                g.main.el.style.display = "none";
                for (const k in g.main.hs) g.main.hs[k].style.display = "none";
                return;
            }
        }
        const wCX = xhSM_getW(node, g.cx), wCY = xhSM_getW(node, g.cy);
        const wBW = xhSM_getW(node, g.w), wBH = xhSM_getW(node, g.h);
        const cx = Number(wCX && wCX.value) || 0, cy = Number(wCY && wCY.value) || 0;
        const bw = Number(wBW && wBW.value) || 0, bh = Number(wBH && wBH.value) || 0;
        const el = g.main.el, tag = g.main.tag, hs = g.main.hs;
        if (!(bw > 0 && bh > 0)) { el.style.display = "none"; for (const k in hs) hs[k].style.display = "none"; if (g === GRPS[0]) ed.box = null; return; }
        const b = { x: cx * W - bw * W / 2, y: cy * H - bh * H / 2, w: bw * W, h: bh * H };
        if (g === GRPS[0]) ed.box = b;
        const zh2 = (window.XH_LANG || "zh") === "zh";
        if (g.tipZh) tip.textContent = zh2 ? g.tipZh : g.tipEn;
        el.style.display = "block";
        tag.style.display = "block";
        const _tp = tagPF(GRPS.indexOf(g));
        tag.textContent = zh2 ? _tp.zh + " 1" : _tp.en + " 1";
        el.style.left = (b.x / W * 100) + "%";
        el.style.top = (b.y / H * 100) + "%";
        el.style.width = (b.w / W * 100) + "%";
        el.style.height = (b.h / H * 100) + "%";
        const hp = { tl: [0, 0], tr: [100, 0], bl: [0, 100], br: [100, 100] };
        for (const k in hs) {
            hs[k].style.display = "block";
            hs[k].style.left = hp[k][0] + "%";
            hs[k].style.top = hp[k][1] + "%";
        }
    }
    function syncShape() { syncBox(GRPS[0]); }   // 红组别名（下游旧调用点不改）

    // ----------------  2026-10-25：多个排除区（第 2..N 个框，虚线框）----------------
    //   数据载体 = N.zones 指定的 widget（万能遮罩的 exclude_zones，JSON 数组 [{cx,cy,w,h}, ...]）。
    //   红框（第 1 个框）仍是老 4 参；这里只管第 2..N 个。
    //    不传 zones / search 的节点（XiaoHei-区域限定框）整套不启用，一个字节的行为都不变。
    //    2026-10-25：双组参数化 —— g = GRPS[0]（红/排除区）或 GRPS[1]（绿/搜索区），DOM 状态挂 g.els。
    function readZones(g) {
        const out = [];
        const w = xhSM_getW(node, g.zones);
        let arr = [];
        try { arr = JSON.parse(String((w && w.value) || "")); if (!Array.isArray(arr)) arr = []; } catch (e) { arr = []; }
        for (const it of arr) {
            try {
                if (it && typeof it === "object" && !Array.isArray(it)) {
                    out.push({ cx: clampF(Number(it.cx) || 0), cy: clampF(Number(it.cy) || 0),
                               w: clampF(Number(it.w) || 0), h: clampF(Number(it.h) || 0) });
                } else if (Array.isArray(it) && it.length >= 4) {
                    out.push({ cx: clampF(Number(it[0]) || 0), cy: clampF(Number(it[1]) || 0),
                               w: clampF(Number(it[2]) || 0), h: clampF(Number(it[3]) || 0) });
                }
            } catch (e) {}
        }
        return out;
    }
    function writeZones(arr, g) {
        const w = xhSM_getW(node, g.zones);
        if (!w) {
            //  2026-10-25：不再静默 —— 按钮出现了但参数不存在 = ComfyUI 主程序还是旧后端（只刷新网页不重启就这样）
            console.warn("[XiaoHei] 万能遮罩：节点上没有「" + N.zones + "」参数 ⇒ ComfyUI 是旧版后端，请【完全重启 ComfyUI】（关掉黑框重开，不是刷新网页）");
            return;
        }
        // 统一写成 dict 形式、保留 3 位小数 —— JSON 短且稳，后端 _parse_exclude_zones 两种写法都吃
        xhSM_setW(w, (arr && arr.length) ? JSON.stringify(arr.map((z) => ({
            cx: Math.round(z.cx * 1000) / 1000, cy: Math.round(z.cy * 1000) / 1000,
            w: Math.round(z.w * 1000) / 1000, h: Math.round(z.h * 1000) / 1000,
        }))) : "");
    }
    function mkZoneEl(g) {
        const el = document.createElement("div");
        el.style.cssText = "position:absolute;box-sizing:border-box;background:" + (g === GRPS[0] ? "rgba(214,69,65,.16)" : "rgba(58,209,122,.14)") + ";border:2px dashed " + g.border + ";";
        const hs = {};
        for (const k of ["tl", "tr", "bl", "br"]) {
            const d = document.createElement("div");
            d.style.cssText = "position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;background:#fff;border:1px solid " + g.border + ";box-sizing:border-box;cursor:nwse-resize;";
            hs[k] = d; el.appendChild(d);
        }
        const del = document.createElement("div");
        del.style.cssText = "position:absolute;right:-9px;top:-9px;width:16px;height:16px;border-radius:50%;background:" + g.border + ";color:#fff;font:bold 12px/15px sans-serif;text-align:center;cursor:pointer;";
        //  2026-11-15：乘号 "×" → 家族「关闭」(x) 真图标，16px 圆里居中。
        del.innerHTML = xhIconHTML("关闭", { size: 10, color: "current" });
        del.style.display = "flex";
        del.style.alignItems = "center";
        del.style.justifyContent = "center";
        el.appendChild(del);
        const tag = document.createElement("div");
        //  2026-11-15：附加框（排除区2/3/4…、搜索区2/3/4…）同一套深底亮字，跟主框保持一致；
        //   顺手补 pointer-events:none ⇒ 标签不再挡住框内拖拽。
        tag.style.cssText = "position:absolute;left:2px;top:-15px;color:" + g.tagCol + ";"
            + "background:rgba(20,20,20,.88);border-left:3px solid " + g.border + ";"
            + "padding:1px 6px 1px 5px;border-radius:0 3px 3px 0;"
            + "font:500 11px/13px sans-serif;white-space:nowrap;pointer-events:none;";
        el.appendChild(tag);
        ov.appendChild(el);
        return { el, hs, del, tag };
    }
    function bindZone(i, z, g) {
        const gi = GRPS.indexOf(g);
        // 框体：边缘→缩放(对边锚定)，中心→移动（与红框同一套手感）
        z.el.addEventListener("pointerdown", (e) => {
            const arr = readZones(g); if (i >= arr.length) return;
            const [mx, my] = pos(e);
            const W = cv.width || 320, H = cv.height || 213;
            const b = { x: arr[i].cx * W - arr[i].w * W / 2, y: arr[i].cy * H - arr[i].h * H / 2, w: arr[i].w * W, h: arr[i].h * H };
            const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
            const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
            const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
            const doX = nearL || nearR, doY = nearT || nearB;
            ed.zmode = (doX || doY) ? "resize" : "move";
            ed.zidx = i; ed.zg = gi;
            ed.zax = doX ? (nearL ? b.x + b.w : b.x) : null;
            ed.zay = doY ? (nearT ? b.y + b.h : b.y) : null;
            ed.last = [mx, my];
            try { ov.setPointerCapture(e.pointerId); } catch (er) {}
            e.stopPropagation(); e.preventDefault();
        });
        z.el.addEventListener("pointermove", (e) => {
            if (ed.zmode) return;
            const arr = readZones(g); if (i >= arr.length) return;
            const [mx, my] = pos(e);
            const W = cv.width || 320, H = cv.height || 213;
            const b = { x: arr[i].cx * W - arr[i].w * W / 2, y: arr[i].cy * H - arr[i].h * H / 2, w: arr[i].w * W, h: arr[i].h * H };
            const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
            const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
            const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
            const doX = nearL || nearR, doY = nearT || nearB;
            z.el.style.cursor = (doX && doY) ? ((nearL === nearT) ? "nwse-resize" : "nesw-resize")
                                : doX ? "ew-resize" : doY ? "ns-resize" : "move";
        });
        for (const k in z.hs) {
            z.hs[k].addEventListener("pointerdown", (e) => {
                const arr = readZones(g); if (i >= arr.length) return;
                const W = cv.width || 320, H = cv.height || 213;
                const b = { x: arr[i].cx * W - arr[i].w * W / 2, y: arr[i].cy * H - arr[i].h * H / 2, w: arr[i].w * W, h: arr[i].h * H };
                const opp = { tl: [b.x + b.w, b.y + b.h], tr: [b.x, b.y + b.h], bl: [b.x + b.w, b.y], br: [b.x, b.y] }[k];
                ed.zmode = "resize"; ed.zidx = i; ed.zg = gi; ed.zax = opp[0]; ed.zay = opp[1];
                ed.last = pos(e);
                try { ov.setPointerCapture(e.pointerId); } catch (er) {}
                e.stopPropagation(); e.preventDefault();
            });
        }
        z.del.addEventListener("pointerdown", (e) => {
            const arr = readZones(g);
            if (i < arr.length) { arr.splice(i, 1); writeZones(arr, g); }
            e.stopPropagation(); e.preventDefault();
        });
    }
    function syncZones() {
        for (const g of GRPS) {
            if (!g.zones) continue;
            //  2026-10-25：绿组附加框同样跟随总开关隐藏（红组手动模式下豁免，见 boxGroupOn）
            if (g.enable && boxGroupOn(GRPS.indexOf(g))) {
                const wEn = xhSM_getW(node, g.enable);
                if (wEn && !wEn.value) {
                    for (const z of g.els) z.el.style.display = "none";
                    continue;
                }
            }
            const arr = readZones(g);
            while (g.els.length < arr.length) { const z = mkZoneEl(g); g.els.push(z); bindZone(g.els.length - 1, z, g); }
            while (g.els.length > arr.length) { const z = g.els.pop(); try { z.el.remove(); } catch (e) {} }
            const W = cv.width || 320, H = cv.height || 213;
            const gi = GRPS.indexOf(g);
            arr.forEach((zn, i) => {
                const z = g.els[i]; if (!z) return;
                if (!(zn.w > 0 && zn.h > 0)) { z.el.style.display = "none"; return; }
                const b = { x: zn.cx * W - zn.w * W / 2, y: zn.cy * H - zn.h * H / 2, w: zn.w * W, h: zn.h * H };
                z.el.style.display = "block";
                z.el.style.left = (b.x / W * 100) + "%";
                z.el.style.top = (b.y / H * 100) + "%";
                z.el.style.width = (b.w / W * 100) + "%";
                z.el.style.height = (b.h / H * 100) + "%";
                const _tp2 = tagPF(gi);
                z.tag.textContent = (window.XH_LANG || "zh") === "zh" ? `${_tp2.zh} ${i + 2}` : `${_tp2.en} ${i + 2}`;
                const hp = { tl: [0, 0], tr: [100, 0], bl: [0, 100], br: [100, 100] };
                for (const k in z.hs) { z.hs[k].style.display = "block"; z.hs[k].style.left = hp[k][0] + "%"; z.hs[k].style.top = hp[k][1] + "%"; }
            });
        }
    }
    function zoneDrag(e) {
        const [mx, my] = pos(e);
        const p = toFrac(mx, my), lp = toFrac(ed.last[0], ed.last[1]);
        const g = GRPS[ed.zg || 0];
        //  2026-10-25：zidx < 0 = 主框（第 1 个框，几何在 4 个 widget 里）；否则 = 附加框（JSON 里第 zidx 个）
        const isMain = (ed.zidx == null || ed.zidx < 0);
        let arr;
        if (isMain) {
            const wCX = xhSM_getW(node, g.cx), wCY = xhSM_getW(node, g.cy);
            const wBW = xhSM_getW(node, g.w), wBH = xhSM_getW(node, g.h);
            arr = [{ cx: Number(wCX && wCX.value) || 0, cy: Number(wCY && wCY.value) || 0,
                     w: Number(wBW && wBW.value) || 0, h: Number(wBH && wBH.value) || 0 }];
        } else {
            arr = readZones(g);
        }
        const i = isMain ? 0 : ed.zidx;
        if (i == null || i >= arr.length) { ed.zmode = null; return; }
        if (ed.zmode === "move") {
            arr[i].cx = clampF(arr[i].cx + (p.x - lp.x));
            arr[i].cy = clampF(arr[i].cy + (p.y - lp.y));
        } else {
            const W = cv.width || 320, H = cv.height || 213;
            if (ed.zax !== null && ed.zax !== undefined) {
                const axf = ed.zax / W;
                arr[i].cx = clampF((p.x + axf) / 2);
                arr[i].w = Math.max(0.01, Math.min(1, Math.abs(p.x - axf)));
            }
            if (ed.zay !== null && ed.zay !== undefined) {
                const ayf = ed.zay / H;
                arr[i].cy = clampF((p.y + ayf) / 2);
                arr[i].h = Math.max(0.01, Math.min(1, Math.abs(p.y - ayf)));
            }
        }
        if (isMain) {
            // 主框：写回 4 个 widget（红主框归 ov pointerdown 管，走到这里的一般是绿主框）
            xhSM_setW(xhSM_getW(node, g.cx), arr[0].cx);
            xhSM_setW(xhSM_getW(node, g.cy), arr[0].cy);
            xhSM_setW(xhSM_getW(node, g.w), arr[0].w);
            xhSM_setW(xhSM_getW(node, g.h), arr[0].h);
        } else {
            writeZones(arr, g);
        }
        ed.last = [mx, my];
        syncZones(); syncBox(g);
        e.preventDefault();
    }
    //  2026-10-25：绿主框（搜索区第 1 框）拖拽绑定 —— 红主框不经过这里（走 ov pointerdown 老逻辑）
    function bindMain(g) {
        if (g === GRPS[0]) return;
        const el = g.main.el;
        el.addEventListener("pointerdown", (e) => {
            const [mx, my] = pos(e);
            const W = cv.width || 320, H = cv.height || 213;
            const wCX = xhSM_getW(node, g.cx), wCY = xhSM_getW(node, g.cy);
            const wBW = xhSM_getW(node, g.w), wBH = xhSM_getW(node, g.h);
            const cx = (Number(wCX && wCX.value) || 0) * W, cy = (Number(wCY && wCY.value) || 0) * H;
            const bw = (Number(wBW && wBW.value) || 0) * W, bh = (Number(wBH && wBH.value) || 0) * H;
            if (!(bw > 0 && bh > 0)) return;
            const b = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
            const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
            const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
            const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
            const doX = nearL || nearR, doY = nearT || nearB;
            ed.zmode = (doX || doY) ? "resize" : "move";
            ed.zg = GRPS.indexOf(g); ed.zidx = -1;                 // -1 = 主框
            ed.zax = doX ? (nearL ? b.x + b.w : b.x) : null;
            ed.zay = doY ? (nearT ? b.y + b.h : b.y) : null;
            ed.last = [mx, my];
            try { ov.setPointerCapture(e.pointerId); } catch (er) {}
            e.stopPropagation(); e.preventDefault();
        });
        for (const k in g.main.hs) {
            g.main.hs[k].addEventListener("pointerdown", (e) => {
                const W = cv.width || 320, H = cv.height || 213;
                const wCX = xhSM_getW(node, g.cx), wCY = xhSM_getW(node, g.cy);
                const wBW = xhSM_getW(node, g.w), wBH = xhSM_getW(node, g.h);
                const cx = (Number(wCX && wCX.value) || 0) * W, cy = (Number(wCY && wCY.value) || 0) * H;
                const bw = (Number(wBW && wBW.value) || 0) * W, bh = (Number(wBH && wBH.value) || 0) * H;
                if (!(bw > 0 && bh > 0)) return;
                const b = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
                const opp = { tl: [b.x + b.w, b.y + b.h], tr: [b.x, b.y + b.h], bl: [b.x + b.w, b.y], br: [b.x, b.y] }[k];
                ed.zmode = "resize"; ed.zg = GRPS.indexOf(g); ed.zidx = -1; ed.zax = opp[0]; ed.zay = opp[1];
                ed.last = pos(e);
                try { ov.setPointerCapture(e.pointerId); } catch (er) {}
                e.stopPropagation(); e.preventDefault();
            });
        }
    }
    for (const g of GRPS) bindMain(g);

    function ensureImg() {
        const url = xhSM_srcURL(node);
        if (!url || url === ed.url) return;
        ed.url = url;
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = () => { ed.img = im; ed.imgW = im.naturalWidth; ed.imgH = im.naturalHeight; fit(); };
        im.onerror = () => { ed.img = null; };
        im.src = url;
    }

    if (typeof ResizeObserver !== "undefined") { try { new ResizeObserver(() => fit()).observe(wrap); } catch (e) {} }
    //  循环永不停：DOM widget 异步挂载，早期 isConnected=false 绝不能 return 掉循环
    fit(); draw(); for (const g of GRPS) syncBox(g); syncZones();
    (function loop() {
        if (ed.dead) return;
        try {
            if (wrap.isConnected) {
                ed.miss = 0; ensureImg(); fit(); draw();
                for (const g of GRPS) syncBox(g);
                syncZones();
                // 工具条文字跟着语言切换翻（便宜，一帧一次无感）；重启提示优先级更高，不被覆盖
                const _langZh = (window.XH_LANG || "zh") === "zh";
                if (ed.btnAdd) ed.btnAdd.forEach((b, gi) => {
                    if (!(ed.btnMiss && ed.btnMiss[gi])) setXHBtnLabel(b, _langZh ? b.dataset.zh : b.dataset.en);
                });
                if (ed.btnClr) ed.btnClr.forEach((b, gi) => {
                    if (!(ed.btnMiss && ed.btnMiss[gi])) setXHBtnLabel(b, _langZh ? b.dataset.zh : b.dataset.en);
                });
                //  2026-10-25：后端缺对应 zones 参数（=ComfyUI 没重启）、或绿组总开关关着 ⇒ 该组按钮禁掉+黄字
                if (ed.btnAdd) {
                    if (!ed.btnMiss) ed.btnMiss = GRPS.map(() => false);
                    GRPS.forEach((g, gi) => {
                        if (!g.zones) return;
                        const miss = !xhSM_getW(node, g.zones);
                        // 按组取中文名（红组=排除区 / 绿组=搜索区）—— 文案不写死，不然红组关着也提示「先开搜索区开关」
                        const _gzh = gi === 0 ? "排除区" : "搜索区";
                        let off = false;
                        //  2026-10-25 补：红组在手动模式下不参与「总开关没开」判定（那时红框=遮罩框）
                        if (g.enable && boxGroupOn(gi)) {
                            const wEn = xhSM_getW(node, g.enable);
                            off = !!(wEn && !wEn.value);          // 该组总开关没开
                        }
                        const bad = miss || off;
                        if (bad !== ed.btnMiss[gi]) {
                            ed.btnMiss[gi] = bad;
                            const bA = ed.btnAdd[gi], bC = ed.btnClr ? ed.btnClr[gi] : null;
                            if (!bA) return;
                            bA.disabled = bad;
                            if (bC) bC.disabled = bad;
                            bA.style.opacity = bad ? "0.55" : "1";
                            if (bC) bC.style.opacity = bad ? "0.55" : "1";
                            const _tip = miss
                                ? (_langZh ? "ComfyUI 是旧版后端：请完全重启 ComfyUI（关掉黑框重开）" : "Old backend: fully restart ComfyUI")
                                : (off ? (_langZh ? _gzh + "总开关还关着：打开上面的「启用" + _gzh + "」才能用这组框" : "Enable the " + (gi === 0 ? "exclusion" : "search") + " switch first") : "");
                            bA.title = _tip;
                            if (bC) bC.title = _tip;
                            if (bad) {
                                const _wt = off ? (_langZh ? " 先开" + _gzh + "开关" : " Enable " + (gi === 0 ? "exclusion" : "search") + " first") : (_langZh ? " 需重启ComfyUI" : " Restart ComfyUI");
                                bA.textContent = _wt;
                                if (bC) bC.textContent = _wt;
                            }
                        }
                    });
                }
            }
            else if (++ed.miss > 3600) { ed.dead = true; return; }
        } catch (e) {}
        requestAnimationFrame(loop);
    })();

    function pos(e) {
        const r = ov.getBoundingClientRect();
        return [(e.clientX - r.left) / (r.width || 1) * (cv.width || 320), (e.clientY - r.top) / (r.height || 1) * (cv.height || 213)];
    }
    function toFrac(mx, my) { const W = cv.width || 320, H = cv.height || 213; return { x: mx / W, y: my / H }; }

    // 画布 pointerdown：点空白/框外 → 中心移到点，进入移动模式
    ov.addEventListener("pointerdown", (e) => {
        const [mx, my] = pos(e);
        const p = toFrac(mx, my);
        const wCX = xhSM_getW(node, N.cx), wCY = xhSM_getW(node, N.cy);
        xhSM_setW(wCX, clampF(p.x));
        xhSM_setW(wCY, clampF(p.y));
        ed.mode = "move"; ed.last = [mx, my];
        try { ov.setPointerCapture(e.pointerId); } catch (er) {}
        syncShape(); e.preventDefault();
    });
    // 框内 pointerdown：边缘→缩放(对边锚定)，中心区→移动
    boxEl.addEventListener("pointerdown", (e) => {
        const b = ed.box; if (!b) return;
        const [mx, my] = pos(e);
        const fx = (mx - b.x) / (b.w || 1), fy = (my - b.y) / (b.h || 1);
        const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
        const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
        const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
        const doX = nearL || nearR, doY = nearT || nearB;
        if (doX || doY) {
            ed.mode = "resize";
            ed.ax = doX ? (nearL ? b.x + b.w : b.x) : null;     // 锚点 = 对边(px)，move 时转比例
            ed.ay = doY ? (nearT ? b.y + b.h : b.y) : null;
        } else {
            ed.mode = "move";
        }
        ed.last = [mx, my];
        try { ov.setPointerCapture(e.pointerId); } catch (er) {}
        e.stopPropagation(); e.preventDefault();
    });
    // 悬停光标反馈
    boxEl.addEventListener("pointermove", (e) => {
        if (ed.mode) return;
        const b = ed.box; if (!b) return;
        const [mx, my] = pos(e);
        const edge = Math.max(10, Math.min(b.w, b.h) * 0.3);
        const nearL = Math.abs(mx - b.x) < edge, nearR = Math.abs(mx - (b.x + b.w)) < edge;
        const nearT = Math.abs(my - b.y) < edge, nearB = Math.abs(my - (b.y + b.h)) < edge;
        const doX = nearL || nearR, doY = nearT || nearB;
        boxEl.style.cursor = (doX && doY) ? ((nearL === nearT) ? "nwse-resize" : "nesw-resize")
                             : doX ? "ew-resize" : doY ? "ns-resize" : "move";
    });
    for (const k in hEl) {
        hEl[k].addEventListener("pointerdown", (e) => {
            const b = ed.box; if (!b) return;
            const [mx, my] = pos(e);
            const opp = { tl: [b.x + b.w, b.y + b.h], tr: [b.x, b.y + b.h], bl: [b.x + b.w, b.y], br: [b.x, b.y] }[k];
            ed.mode = "resize";
            ed.ax = opp[0]; ed.ay = opp[1];
            ed.last = [mx, my];
            try { ov.setPointerCapture(e.pointerId); } catch (er) {}
            e.stopPropagation(); e.preventDefault();
        });
    }
    ov.addEventListener("pointermove", (e) => {
        if (ed.zmode) { zoneDrag(e); return; }   //  2026-10-25：附加排除区（虚线框）拖拽中
        if (!ed.mode) return;
        const [mx, my] = pos(e);
        const p = toFrac(mx, my), lp = toFrac(ed.last[0], ed.last[1]);
        const wCX = xhSM_getW(node, N.cx), wCY = xhSM_getW(node, N.cy);
        const wBW = xhSM_getW(node, N.w), wBH = xhSM_getW(node, N.h);
        if (ed.mode === "move") {
            xhSM_setW(wCX, clampF((Number(wCX.value) || 0) + (p.x - lp.x)));
            xhSM_setW(wCY, clampF((Number(wCY.value) || 0) + (p.y - lp.y)));
        } else {
            const W = cv.width || 320, H = cv.height || 213;
            if (ed.ax !== null && ed.ax !== undefined) {
                const axf = ed.ax / W;
                xhSM_setW(wCX, clampF((p.x + axf) / 2));
                xhSM_setW(wBW, Math.max(0.01, Math.min(1, Math.abs(p.x - axf))));
            }
            if (ed.ay !== null && ed.ay !== undefined) {
                const ayf = ed.ay / H;
                xhSM_setW(wCY, clampF((p.y + ayf) / 2));
                xhSM_setW(wBH, Math.max(0.01, Math.min(1, Math.abs(p.y - ayf))));
            }
        }
        ed.last = [mx, my];
        syncShape(); e.preventDefault();
    });
    const end = () => { ed.mode = null; ed.ax = null; ed.ay = null; ed.zmode = null; ed.zidx = null; ed.zax = null; ed.zay = null; ed.zg = 0; };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
    ov.addEventListener("pointerleave", end);
}

app.registerExtension({
    name: "XH.ImageTools.FamilyUI",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!isXHNode(nodeData.name)) return;
        xhSM_attach(nodeType);  // 形状遮罩覆盖：挂可视化拖拽编辑器（非该节点自动早退）

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                if (normalizeType(nodeData.name) === "XHImageBatchMulti") {
                    setupDynamicInputs(this, {
                        type: "IMAGE",
                        prefix: "image_",
                        slotOptions: { shape: 7 },
                    });
                }
                let appendNodes = [];
                let prependNodes = [];
                if (normalizeType(nodeData.name) === "XHShapeMaskOverlay") {
                    const ctl = buildFillColorControl(this);   // 工具条右侧加「填充色」色块
                    if (ctl) appendNodes.push(ctl);
                }
                if (normalizeType(nodeData.name) === "XHMaskTint") {
                    // XiaoHei-遮罩上色：工具条右侧加「色号」色块（品牌 12 色 + 上色常用色 + 自定义）
                    const ctl = buildTintColorControl(this);
                    if (ctl) appendNodes.push(ctl);
                }
                if (normalizeType(nodeData.name) === "XHVideoTimeline") {
                    // XiaoHei-视频分段轴：节点专属的 <video> 播放器 + 帧轨道（拖拽切段）
                    try { setupXHVideoTimeline(this); } catch (e) { console.warn("[XiaoHei ImageTools] 分段轴 UI 失败:", e); }
                }
                if (normalizeType(nodeData.name) === "XHSmartFaceMask") {
                    //  2026-11-08：两大组模式入口（① 节点模式·不接模型 / ② SAM3 模式·接模型），点开浮层选用途。
                    //    位置按用户指定：紧贴「 节点颜色」按钮右边 ⇒ 必须先于色板 push 进 appendNodes
                    //   （工具条渲染顺序 = prepend → 语言 →  → appendNodes，appendNodes 内谁先 push 谁靠左）。
                    //   状态刷新挂 applySMFMode 末尾 + onConnectionsChange + 语言链
                    appendNodes.push(mkSMFModeBtn(this));
                    appendNodes.push(mkSMFResetBtn(this));   //  v1.48.0 一键恢复默认
                    const ctl = buildSMFColorControl(this);    // 工具条右侧加「遮挡色 / 排除块色」色板
                    if (ctl) appendNodes.push(ctl);
                    //  2026-11-15 用户拍板：工具条最左那个白底 ▾ 总折叠键删掉。
                    //   它是上一代「全收/全放」开关，和下面四个分区按钮叠成两层折叠、互相抢状态；
                    //   分区按钮已能各自收放，删掉后工具条少一个抢眼的控件，节点更简洁。
                    //   ⛔ 不 push 任何 prependNodes（makeXHToolbar 收空数组没问题）。
                    //   setSMFCollapsed 仍保留（分区按钮展开时会调它），restoreState 里把全局折叠恒定为展开。
                }
                applyLangToNode(this);
                //  2026-11-08：复刻件自带大量 DOM widget ⇒ 不挂内容区工具条，
                //   避免多一个 serialize:false 行顶乱 widgets_values；中/EN 走官方选中工具条
                // （xh_node_toolbar.js 已认 XH_ 类，选中节点即出现「中/EN」）。
                //  角色设定表自带原作 DOM 设计器，再挂一条家族工具条 = 多一个
                //  serialize:false 的 DOM 控件（widgets_values 有串位风险）；
                //  中/EN 与帮助统一走官方选中工具条（xh_node_toolbar.js 认 XiaoHei 前缀）。
                if (!isWNNode(nodeData.name) && normalizeType(nodeData.name) !== "XiaoHeiCharacterSheet") {
                    makeXHToolbar(this, { appendNodes, prependNodes });
                }
                // XiaoHei-身份配色：节点 body 里挂「身份色板」（一排色块 + ＋加一个人）
                //    必须在 makeXHToolbar **之后**调用 —— 工具条用 pinWidgetToTop 置顶到
                //     widgets 最前；身份色板是 DOM widget，晚挂才排在参数区下面。
                if (normalizeType(nodeData.name) === "XHIdentityColorize") {
                    try { buildIdColorControl(this); } catch (e) { console.warn("[XiaoHei ImageTools] 身份色板挂载失败:", e); }
                }
                // 万能遮罩：折叠只由四个分区按钮管（默认全折），不再有工具条总折叠键
                if (normalizeType(nodeData.name) === "XHSmartFaceMask") {
                    xhSMF_restoreState(this);     //  恒定展开，参数显隐交给分区状态
                    xhSMF_sanitize(this);
                    xhSMF_scheduleApply(this);    //  Vue 侧 widget 晚建 ⇒ 多帧重试
                }
            } catch (e) {
                console.warn("[XiaoHei ImageTools] onNodeCreated 失败:", e);
            }
            return r;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            return origOnRemoved?.apply(this, arguments);
        };

        //  自愈：工具条 xh_ui_bar 占格导致 widgets_values 错位 → 切换工作流后下拉变红/变数字
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                //  v1.17.7：参数重排了 ⇒ 先把老存档的 widgets_values 按名字重排（只重排，不回填）
                if (normalizeType(nodeData.name) === "XHSmartFaceMask") xhSMF_migrate(this, info);
            } catch (e) {}
            try { fixWidgetValuesFromSaved(this, info); } catch (e) {}
            //  2026-11-08：读档会拿存档里的端口 label 盖掉显示层 ⇒ 重新按当前语言刷一遍
            try { if (isWNNode(nodeData.name) || isQENode(nodeData.name) || normalizeType(nodeData.name) === "XiaoHeiCharacterSheet") applyLangToNode(this); } catch (e) {}
            try {
                // 值回填完**之后**再重算「模式显隐 / 形状档位」—— 顺序不能反，否则档位是拿旧值算的
                if (normalizeType(nodeData.name) === "XHSmartFaceMask") {
                    xhSMF_sanitize(this);        //  v1.48.0 越界值夹回合法范围
                    xhSMF_restoreState(this);    //  v1.48.0 折叠状态从 properties 恢复
                    applySMFMode(this);
                    xhSMF_scheduleApply(this);   //  Vue computed 缓存 ⇒ 多帧重试
                }
            } catch (e) {}
            return r;
        };
    },

    async setup() {
        //  2026-11-10：唯一中枢里主表排最后（priority=1000）。
        //   专属模块先刷各自的 DOM 控件，主表最后统一标题 / 参数 / 端口，
        //   顺序固定 ⇒ 不再互相覆盖 ⇒ 中英切换一次到位。
        onLangChanged(applyLangToAll, { priority: 1000, tag: "XH.ImageTools.FamilyUI" });
        //  最终兜底：所有写死文字统一收口（仍是同一个监听器，不新增大脑）
        onLangChanged(_xhFinalTextPass, { priority: 2000, tag: "XH.ImageTools.FinalText" });
    },
});
