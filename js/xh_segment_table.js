// XiaoHei-分段表 · 家族前端
// ① 中/EN 切换：节点标题 + 参数控件标签 + 输入/输出端口名（照 xh_mathint.js 规范）
// ② 节点自身配色 （XiaoHei 家族 12 色 + 自定义取色器）
// ③ 「⇄ 输入方式」功能键（2026-10-16）：批量粘贴 ⇄ 逐段填写一键互切
//
// 铁律：只改 label / title，绝不改 name；绝不改 COMBO 的 values；DOM 工具栏 serialize:false 且只 append。
//
// 2026-09-30：分段框改成「每段一个独立框」。
// 2026-10-07：改成纯前端折叠（参考 xh_chainprompt.js）：
//   · 后端固定声明 64 个 seg_N；前端按 num_segments 折叠/展开。
//   · 改数字立即生效，无需写文件 / 拉定义 / 重建画布。
//   · 段数随工作流走，同类节点互不干扰。
// 2026-10-16：布局改版 + 输入方式互切：
//   · 「段数 / 自循环 / 越界自动钳制」三件置顶，「第N段」动态段框放下面（JS 侧重排
//     node.widgets —— 存档按 widget 名字写（widgets_values_named），重排不错位；
//     Python 控件声明顺序一动不动，旧 position 数组回填发生在重排之前）。
//   · 工具栏「⇄」按钮互切两种输入法，切到的模式生效、另一种**隐藏但数据保留**：
//       批量粘贴 → 逐段填写：按行解析 durations 填进 seg_N，段数=有效行数（超 64 夹 64）；
//       逐段填写 → 批量粘贴：把当前可见段框重新生成一行一个的文本。
//   · 批量粘贴模式下粘几行，「段数」自动变几（300ms 防抖；解析规则与后端
//     _parse_durations 逐字一致：去空行 / `#` 行，取每行第一个数字）。
//   · 「 刷新段数」按钮删除（改数字早就是实时生效，按钮 100% 冗余；后端路由同轮删）。
//   · input_mode = 隐藏的 BOOLEAN widget（Python required 末尾追加，旧存档位序不错位）：
//     False = 批量粘贴（默认；旧存档无此字段时的兜底）；True = 逐段填写。
//
// 2026-10-21 三连改（上午「多通道输出」被否：「你额外添加那些通道，我迷茫了」；
//   下午「预设·时长+起始秒两个框」被否：「之前单纯的一个分段功能消失了」；晚定稿）：
//   · 后端 seg_N 段长框**原样复用**，start_N 起始框（0 = 自动接续）；
//   · 「段数」= 老控件 num_segments（默认 1，要几段自己往上加）；
//   · preset_edit「当前编辑第几段」：一次只显示当前那段，其它段自动收起；
//   · **模式开关** ui_mode（连续 / 跳接）：连续 = 只填时长、段间自动首尾相接
//     （老分段表体验），起始框整体藏起（值不丢，后端 0 = 自动接续）；纯前端显隐，后端不读；
//   · **单位开关** unit（秒 / 帧）：秒 = 老行为；帧 = 段框填帧数，端口/段框文案
//     同步换成「帧」；（帧数规矩控件 2026-10-21 深夜已删，合法化交下游）
//   · 6 条通道输出口 + ch_*_mode/val + ch_count **已撤**，RETURN 始终 5 口；
//   · 兼容：通道时代存档（85 值）按布局识别 + 清零 start_N / preset_edit 自愈（healChannelEraArchive）。
//
//  重排的安全性不是「想当然」（2026-10-16 无头 + 前端源码双重实证，改重排前必读）：
//   · 存盘：serialiseWidgetValues **同时写两份** —— widgets_values（positional 数组，
//     按 this.widgets 现序、跳过 serialize:false）＋ widgets_values_named（按名字）。
//   · 读档：LGraphNode.configure 里 `let e=0; for (t of this.widgets) {
//     if (t.serialize===false) continue; getRestoredWidgetValue(id, t.name, e++) }`
//     ⇒ positional 也按 **widgets 现序**（可序列化序号）恢复；且 getRestoredWidgetValue
//     在 `namedValuesRestore=false`（默认关、本节点无 fallbackWidgetsValuesNames）时
//     只走 positional 分支，named 仅在有名字表且开设置时才自动生效。
//   ·  致命时序：createNode → constructor → invokeExtensionsAsync("nodeCreated")
//     ⇒ 我们的 onNodeCreated（含 reorderWidgets）跑在 configure **之前**，
//     读档时 widgets 已是重排序 ⇒ 旧档 positional 按声明序存、按重排序读 ⇒ **串值**
//     （实测 clamp←seg_1 的值、durations←seg_2 的值、num_segments←durations 的值）。
//   · 对策（onConfigure 里 base configure 之后，二选一）：
//     ① 有 widgets_values_named ⇒ applyNamedWidgetValues 按名字修正；
//     ② 纯数组档（API / RunningHub 下载的工作流只有 widgets_values）⇒
//        applyLegacyPositional 按**旧声明序**（index, durations, clamp, seg_1..64,
//        num_segments, all_segments）重新解释，老老档 n+4 布局一并吸收。
//   · 附带修掉一个潜伏 bug：Vue 前端从不给 node.widgets_values 赋值 ⇒ 旧存档迁移
//     以前读恒 undefined、从未真正执行；现由 onConfigure 显式传 info.widgets_values。
const { app } = window.comfyAPI.app;

import { ensureLangBridge, makeXHToolbar, makeBarBtn, onLangChanged, releaseButtons, forceCompactOnSpawn, isSizeLike , paintBarBtn, makeXHSlider, makeXHTimecode, makeXHTimelineBar, makeXHTimelineOverview, lockDomWidgetHeight, currentLang, makeGearBtn} from "./xh_ui_kit.js";

ensureLangBridge();
const NODE_TYPE = "XHSegmentTable";
const MIN_SLOTS = 1;
const MAX_SLOTS = 64;
const DEFAULT_SLOTS = 1;   // 2026-10-16 由 8 改 1（用户要求）：拖出来只给 1 段，要几段自己改「段数」

// 两个开关的存档值（与后端 controls/segment_table.py 双写一致，改一个必须同步另一个）
const UNIT_FRAME = "帧";          // 单位开关：段框填帧数（另一个值是「秒」）
const UI_SIMPLE = "连续";          // 模式开关：只填时长，段间自动首尾相接（老分段表体验）
const UI_FULL = "跳接";            // 时长+起始秒都手填：可跳片头/段间重叠/精确卡点

// ---- 帧数规矩（2026-10-29 加回）----
//  三个字符串与后端 controls/segment_table.py 的 FRAME_RULE_* **逐字一致**（存档值就是它）。
//    算法也与 XiaoHei-帧数对齐（image_tools/py/frame_align.py）一致，改一处必须改三处。
const RULE_NONE = "不调整";
const RULE_H3 = "帧数 = 17 的倍数 + 5";
const RULE_LTX = "帧数 = 8 的倍数 + 1";

/**
 * 把**帧数**吸附到规矩要求的帧格上（帧 → 帧，不经过 fps）。默认**向上对齐**。
 *  JS 的 `%` 对负数返回负值（Python 返回非负）⇒ 必须写双层取模 `((x % m) + m) % m`，
 *    否则同一个数在前后端算出不同结果（这就是当年「a=6 到底是 141 还是 158 帧」的坑）。
 *  2026-10-29 新增 `dir`：-1 = **向下**吸附（减号用），其余 = 向上。
 *    背景：规矩是向上对齐的（243 = 17×14+5 是合法帧格），用户按**减号** 243→242 后
 *    向上吸附会把它弹回 243 ⇒ 「只能加不能减」（用户 2026-10-29 当面报的）。
 *    ⇒ 减号必须落到**上一个更小的合法帧格**（243 → 226 = 17×13+5）。
 */
function snapFrames(n, rule, dir) {
    n = Math.round(Number(n) || 0);
    //  0 = 「这段没填 / 跳过」，绝不能吸成 5 帧或 1 帧（与后端 _snap_frames 同一道闸门）。
    //    否则选了规矩之后所有空段凭空变成 5 帧，整条时间线全乱。
    if (n <= 0) return 0;
    const down = dir === -1;
    if (rule === RULE_H3) {
        // 合法帧格：5, 22, 39, …（= 17k+5，k>=0）
        if (down) {
            // 向下：找 <= n 的最大合法帧格；n 本身合法时保持不变
            const k = Math.floor((n - 5) / 17);
            return k < 0 ? 5 : k * 17 + 5;
        }
        const n0 = Math.max(5, n);                       // H3：帧数 ≡ 5 (mod 17)，至少 5
        return n0 + ((((5 - (n0 % 17)) % 17) + 17) % 17);
    }
    if (rule === RULE_LTX) {
        // 合法帧格：1, 9, 17, …（= 8k+1，k>=0）
        if (down) {
            const k = Math.floor((n - 1) / 8);
            return k < 0 ? 1 : k * 8 + 1;
        }
        const n0 = Math.max(1, n);                       // LTX：帧数 = 8k + 1，至少 1
        return Math.floor((n0 + 6) / 8) * 8 + 1;
    }
    return n;
}

/** 当前规矩（读不到一律当「不调整」，保证老档行为不变）。 */
function readFrameRule(node) {
    const w = findWidget(node, "frame_rule");
    const v = w && w.value;
    return (v === RULE_H3 || v === RULE_LTX) ? v : RULE_NONE;
}

/**
 * 吸附第 i 段的段长。三道闸门，一道都不能省：
 *   ① 单位必须是「帧」（秒模式没有 fps，吸不了，也不该吸）
 *   ② 规矩不能是「不调整」
 *   ③ 值 <= 0 不动（0 = 这段没填，是合法的「跳过」语义）
 *  已经合法就直接返回，不写回 —— 避免无谓触发 callback。
 *  2026-10-29：加 `dir`（-1 = 用户在**减**）⇒ 减号落到**上一个**合法帧格，
 *    不再被向上吸附弹回（用户报的「只能加不能减」）。
 *
 *  **方向怎么来**（不依赖官方内部时序 —— 官方原生 INT 框的 ± 是 canvas 自绘的，
 *    两套画布模式都拿不到 inputEl，也拿不到「官方是加还是减」）：
 *     不能靠 `w.callback(v)` 时 `w.value` 的新旧对比（官方可能已把新值写进去了）。
 *     靠**自己记账**：`node._xh_seg_last[segName]` 存「上一次吸附后确定的值」。
 *       callback 拿到新值时，拿它跟记账比：新值 > 记账 ⇒ 增；< ⇒ 减。
 *       记账在每次吸附后更新（setSegWidgetValue 时）。
 */
function snapSegToRule(node, i, dir) {
    if (!isFramesUnit(node)) return false;
    const rule = readFrameRule(node);
    if (rule === RULE_NONE) return false;
    const w = findWidget(node, "seg_" + i);
    if (!w) return false;
    const cur = Math.round(Number(w.value) || 0);
    if (cur <= 0) return false;
    const snapped = snapFrames(cur, rule, dir);
    if (snapped === cur) return false;
    setSegWidgetValue(node, "seg_" + i, snapped);
    return true;
}

/** 段长的「上一次确定值」记账（用来判断用户是加还是减）。 */
function segLastStore(node) {
    if (!node) return null;
    if (!node._xh_seg_last) node._xh_seg_last = {};
    return node._xh_seg_last;
}
/** 记下当前段长（每次吸附/写入后调用）。 */
function segLastRemember(node, name, v) {
    const st = segLastStore(node);
    if (!st) return;
    try { st[name] = Math.round(Number(v) || 0); } catch (e) {}
}

/** 规矩一改 ⇒ 把所有已填的段重新吸一遍（选了 H3，现有段立刻对齐，不用逐个手点）。 */
function snapAllSegsToRule(node) {
    if (!isFramesUnit(node)) return 0;
    const rule = readFrameRule(node);
    if (rule === RULE_NONE) return 0;
    let n = 0;
    for (let i = 1; i <= MAX_SLOTS; i++) {
        if (snapSegToRule(node, i)) n++;
    }
    return n;
}

/** 写回原生 INT 控件的值（widget.value + 输入框 + 触发重算）。 */
function setSegWidgetValue(node, name, v) {
    const w = findWidget(node, name);
    if (!w) return;
    w.value = v;
    try { if (w.inputEl) w.inputEl.value = v; } catch (e) {}
    //  2026-10-29：记下「确定值」⇒ 下次 callback 能判断用户是加还是减
    segLastRemember(node, name, v);
}

const XH_I18N = {
    zh: {
        nodes: { XHSegmentTable: "分段表 XiaoHei" },
        widgets: {
            index: "索引（接循环）",
            durations: "批量粘贴（一行一个；逐段模式下休眠不生效）",
            clamp: "越界自动钳制",
            num_segments: "段数（改数字实时生效）",
            unit: "单位（秒/帧）",
            preset_edit: "当前编辑第几段",
            ui_mode: "模式（连续/跳接）",
            all_segments: "自循环·跑全部段（不接循环一次出N段）",
            //  2026-10-29 用户指出「帧率规则怎么是英文的」⇒ 补中文标签
            frame_rule: "帧数规矩（段长自动吸到合法帧格）",
        },
        slots: {
            start_sec: "起始秒", duration: "本段时长", end_sec: "结束秒",
            count: "总段数", info: "信息",
            //  2026-11-01 新增：本段与上一段的重叠帧数（音频侧要同步裁掉这么多）
            overlap: "与上段重叠帧数",
        },
        btns: {
            modeTitle: "切换输入方式：批量粘贴 ⇄ 逐段填写（切换时数据自动互相同步）",
            layoutTitle: "切换模式：连续（只填时长，段间自动首尾相接）⇄ 跳接（时长+起始秒，可跳片头/段间重叠）",
            langTitle: "中/EN 切换",
            colorTitle: "节点配色",
        },
    },
    en: {
        nodes: { XHSegmentTable: "Segment Table XiaoHei" },
        widgets: {
            index: "index (from loop)",
            durations: "bulk paste (dormant in field mode)",
            clamp: "clamp",
            num_segments: "segments (live)",
            unit: "unit (sec/frames)",
            preset_edit: "editing segment #",
            ui_mode: "mode (continuous / jump)",
            all_segments: "self-loop · run all segments",
            //  2026-10-29：补英文标签（原来漏了 ⇒ 显示英文原名 frame_rule）
            frame_rule: "Frame rule (snap segment length)",
        },
        slots: {
            start_sec: "start sec", duration: "duration", end_sec: "end sec",
            count: "count", info: "info",
            //  2026-11-01 new: overlap frames with the previous segment
            overlap: "overlap with prev",
        },
        btns: {
            modeTitle: "Toggle input: bulk paste ⇄ per-segment (auto-syncs data)",
            layoutTitle: "Toggle mode: continuous (durations only, auto-chained) ⇄ jump (durations + start sec, skippable)",
            langTitle: "ZH/EN",
            colorTitle: "Node color",
        },
    },
};

function pack(lang) {
    return XH_I18N[lang || window.XH_LANG || "zh"] || XH_I18N.zh;
}

function t(lang, kind, key) {
    const p = pack(lang);
    return (p[kind] && p[kind][key]) || null;
}

/** seg_3 → 「第 3 段(秒)」；start_3 → 「第 3 段·起始秒」。帧单位下括号里变「帧」。
 *   控件名 seg_N / start_N 是存档键，动不得 —— 这里只出显示文案。 */
function segFieldLabel(lang, name, frames) {
    const m = /^(seg|start)_(\d+)$/.exec(name || "");
    if (!m) return null;
    const zh = (lang || window.XH_LANG || "zh") === "zh";
    //  2026-10-21 用户截图：跳接模式下两条滑块的**左端点没对齐**（左边标签「第 1 段·起始秒」
    //    比「第 1 段(秒)」长一截 ⇒ 滑轨起点整体右移）。修法 = 两个标签做成**等长同构**：
    //    段号 + 「·」+ 两字语义（时长 / 起始）+ 同格式单位括号。同字体同字号下宽度相同
    //    ⇒ 滑轨左端天然对齐；不写死像素宽，换语言 / 换单位也不会再跑。
    const unit = frames ? "帧" : "秒";
    if (zh) {
        return m[1] === "seg"
            ? `第 ${m[2]} 段·时长(${unit})`
            : `第 ${m[2]} 段·起始(${unit})`;
    }
    const uen = frames ? "frames" : "sec";
    return m[1] === "seg"
        ? `seg ${m[2]} · length (${uen})`
        : `seg ${m[2]} · start (${uen})`;
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
            const frames = isFramesUnit(node);   // 单位 = 帧 ⇒ 段框/起始框文案跟着换
            for (const w of node.widgets) {
                if (!w || !w.name) continue;
                const lb = t(lang, "widgets", w.name) || segFieldLabel(lang, w.name, frames);
                if (lb) w.label = lb;
            }
        }

        // 段框滑块文案（秒/帧）随语言 + 单位刷新
        try {
            const store = node._xh_seg_sliders;
            if (store) {
                const frames = isFramesUnit(node);
                for (const k in store) {
                    const sd = store[k];
                    if (sd && sd.labelEl) sd.labelEl.textContent = segFieldLabel(lang, k, frames);
                }
            }
        } catch (e2) {}

        // 段标签条文案（第N段 / Seg N）
        try { renderPresetChips(node, lang); } catch (e3) {}

        const applySlotLabels = (arr) => {
            if (!arr) return;
            const frames = isFramesUnit(node);   // 三个时间口在帧单位下改叫「帧」
            for (const s of arr) {
                let lb = t(lang, "slots", s && s.name);
                if (lb && frames && s && (s.name === "start_sec" || s.name === "duration" || s.name === "end_sec")) {
                    lb = lang === "en"
                        ? (s.name === "start_sec" ? "start frame count" : s.name === "duration" ? "frame count" : "end frame count")
                        : (s.name === "start_sec" ? "起始帧数" : s.name === "duration" ? "本段帧数" : "结束帧数");
                }
                if (lb) s.label = lb;
            }
        };
        applySlotLabels(node.inputs);
        applySlotLabels(node.outputs);

        // 按钮文案（忙碌中不动，免得把"进行中"覆盖掉）
        const p = pack(lang);
        if (node._xh_seg_lang_btn) {
            node._xh_seg_lang_btn.textContent = lang === "zh" ? "中" : "EN";
            // 方案 B：中/EN 统一 active 档（蓝底蓝边），不再用两种实心色刷状态
            if (typeof paintBarBtn === "function") paintBarBtn(node._xh_seg_lang_btn, "active");
            else node._xh_seg_lang_btn.style.background = "#3a3a3a";
            node._xh_seg_lang_btn.title = p.btns.langTitle;
        }
        if (node._xh_seg_color_btn) node._xh_seg_color_btn.title = p.btns.colorTitle;
        if (node._xh_seg_mode_btn) {
            node._xh_seg_mode_btn.textContent = modeBtnText(getInputMode(node));
            node._xh_seg_mode_btn.title = p.btns.modeTitle;
        }
        if (node._xh_seg_layout_btn) {
            node._xh_seg_layout_btn.textContent = layoutBtnText(readUiMode(node));
            node._xh_seg_layout_btn.title = p.btns.layoutTitle;
        }
        if (node._xh_seg_gear_btn && node._xh_seg_gear_btn._xhGearPaint) {
            try { node._xh_seg_gear_btn._xhGearPaint(); } catch (e) {}   // 齿轮 title 跟随中/EN
        }

        try {
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        } catch (e) {}
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("[XiaoHei SegmentTable Lang] 应用语言失败:", e);
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


// ---------------------------------------------------------------- 段数相关的工具
function isSegName(name) {
    return typeof name === "string" && /^seg_\d+$/.test(name);
}

/** start_N（2026-10-21 预设起始框）—— 与 seg_N 同一批折叠/清洗规则。 */
function isStartName(name) {
    return typeof name === "string" && /^start_\d+$/.test(name);
}

function countSegWidgets(node) {
    let c = 0;
    for (const w of node.widgets || []) {
        if (w && isSegName(w.name)) c++;
    }
    return c;
}

function readSlotsFromNode(node) {
    let n = NaN;
    for (const w of node.widgets || []) {
        if (w && w.name === "num_segments") { n = Number(w.value); break; }
    }
    if (!Number.isFinite(n)) n = countSegWidgets(node) || DEFAULT_SLOTS;
    return Math.max(MIN_SLOTS, Math.min(Math.round(n), MAX_SLOTS));
}

/** 按 num_segments 折叠 / 展开分段框（只作用于本节点，纯本地）。返回声明总数。
 *   2026-10-16：**批量粘贴模式下分段框整体休眠**（input_mode=false）——
 *     「⇄」按钮的语义就是两种填法二选一，段框在批量模式下不占地方；
 *     只有逐段模式（input_mode=true）才按 num_segments 显示前 n 个。 */
function applySlotVisibility(node) {
    const n = readSlotsFromNode(node);
    const fields = getInputMode(node);   // true = 逐段填写
    let seen = 0;
    for (const w of node.widgets || []) {
        if (!w || !isSegName(w.name || "")) continue;
        seen++;
        const show = seen <= n && fields;
        // 还原上一轮可能覆盖的 computeSize
        if (show) {
            if (w._xh_seg_collapsed) {
                w._xh_seg_collapsed = false;
                if (w._xh_seg_orig_cs) { w.computeSize = w._xh_seg_orig_cs; }
                else { delete w.computeSize; }
            }
        } else {
            if (!w._xh_seg_collapsed) {
                w._xh_seg_orig_cs = w.computeSize;   // 记下原函数，展开时还原
                w._xh_seg_collapsed = true;
            }
            const cs = () => [0, -4]; cs._xh_seg = true;
            w.computeSize = cs;                      // canvas 模式：高度 -4 不绘制
        }
        // 段框本体作为数据载体永远隐藏（可视交给同名家族滑块 DOM widget）
        //  2026-10-28 终版：原生模式下这个框**就是用户要填的框**，不能藏 ⇒ 只按段数门控显隐。
        if (!PLAIN_NATIVE) {
            w._xh_seg_collapsed = true;
            w.computeSize = () => [0, -4];
            w.hidden = true;
            if (w.element) { try { w.element.style.display = "none"; } catch (e) {} }
        } else {
            w.hidden = !show;
            if (w.element) { try { w.element.style.display = show ? "" : "none"; } catch (e) {} }
        }
    }
    //  2026-10-16 durations 多行框紧凑（照 xh_chainprompt.js 同款）：ComfyUI 多行文本框
    //    默认 ~90px 且**没有 maxHeight ⇒ 可无限长高**，节点一虚高它就把全部多余高度吸走
    //    （实测行高 1161px）。统一压到 58px；只给 minHeight 不给 maxHeight（GROWABLE），
    //    用户把节点拖大时仍然只有这个框跟着长（2026-10-13 用户要的行为）。
    for (const w of node.widgets || []) {
        if (!w || w.name !== "durations") continue;
        if (!w._xh_seg_compact) {
            w._xh_seg_compact = true;
            const prevCs = w.computeSize;
            w.computeSize = function () {
                const base = prevCs ? prevCs.apply(this, arguments) : [0, 90];
                return [base[0], Math.min(base[1], 58)];
            };
        }
        // 去掉 addMultilineWidget 默认的 [400,200] minNodeSize 地板（否则节点被撑到最小 400×200）
        try {
            if (w.options && Array.isArray(w.options.minNodeSize) &&
                (w.options.minNodeSize[0] !== 270 || w.options.minNodeSize[1] !== 58)) {
                w.options.minNodeSize = [270, 58];
            }
        } catch (e) {}
        // 只给 minHeight 不给 maxHeight ⇒ 可增长且上限无限，多余竖向空间全归这个框
        try {
            if (!w._xh_seg_layout_grow) {
                w._xh_seg_layout_grow = true;
                w.computeLayoutSize = () => ({ minHeight: 58, minWidth: 0, maxWidth: 1e6 });
            }
        } catch (e) {}
        // min-height 兜底 + 清掉内联 height，让前端的 h-full 生效（内联 height 会压过 h-full）
        //  隐藏态别写 58px：会把 applyMode 刚钉的 0 高又顶回来 ⇒ 空白块复现
        if (w.inputEl) {
            try {
                w.inputEl.style.minHeight = w.hidden ? "0px" : "58px";
                if (w.inputEl.style.height === "58px") w.inputEl.style.height = "";
            } catch (e) {}
        }
    }
    hideInputModeWidget(node);      // input_mode 纯后端字段：视觉隐藏（幂等补挂 element）
    applyPresetVisibility(node);    // 只显示「当前编辑」那一段的框（界面开关决定带不带起始框）
    try {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {}
    applySegMaxByUnit(node, true);  // 2026-10-22：段框刚显现时补上限（不回调显隐，防递归）
    refreshSegSliders(node);        // 段框滑块：按口径显示并同步值/边界/文案
    ensureBulkAutoDetect(node);   // inputEl 挂载后补绑「粘几行→段数变几」（幂等）
    return seen;
}

// ---------------------------------------------------------------- 预设显隐（2026-10-21）
// 用户要的形态（原话）：「设置第二个状态的时候，第一个状态的参数就会隐藏……
//   当我又选择添加第三个状态的时候，前面的参数都会自动隐藏」。
// 实现 = 跟「段数」折叠完全同一个套路：preset_edit 说编辑第几组，就只显示那一组的
// seg_N（时长）+ start_N（起始秒）两个框，其它组视觉隐藏（computeSize=[0,-4] + w.hidden
// + element.display=none 三保险；w.hidden 在这两个控件上是安全的——它们没有共存输入端口）。

function readPresetEdit(node) {
    let n = NaN;
    for (const w of node.widgets || []) {
        if (w && w.name === "preset_edit") { n = Number(w.value); break; }
    }
    const total = readSlotsFromNode(node);          // 上限 = 预设数，编辑位不允许超过它
    if (!Number.isFinite(n)) n = 1;
    const cur = Math.max(1, Math.min(Math.round(n), total));
    const w = (node.widgets || []).find((x) => x && x.name === "preset_edit");
    if (w && Number(w.value) !== cur) {             // 越界写回（如预设数 3→1 而编辑位还停在 3）
        w.value = cur;
        if (w.inputEl) w.inputEl.value = cur;
    }
    return cur;
}

/** 段框显隐（2026-10-21 晚重写，修「连续模式下改段数不往下长」的 bug）。
 *  两种模式（ui_mode，由工具条「模式」按钮切）：
 *   · 连续（默认，老分段表）：**段数内的 seg_N 全显示** —— 改段数就往下长，
 *     加一段填一段；start_N 整体藏（0 = 自动接续，值不丢）。
 *   · 跳接：一次只显示「当前编辑第几段」那一组的 seg_N + start_N 两个框，
 *     其它组自动收起（精调模式，可跳片头/段间重叠）。
 *  批量粘贴模式下 seg_N / start_N 整体休眠（批量行没有对应起始框，后端一律自动接续）。
 *   idx <= slots 门控与 applySlotVisibility 是**同一口径**（那边也按段数折叠）：
 *     本函数若对超编段框放行，会把前者刚折叠的又展开 ⇒ 64 个段框全冒。
 *   折叠状态与 applySlotVisibility **共用一套属性名**（_xh_seg_collapsed / _xh_seg_orig_cs）：
 *     两个函数都会动 seg_N 的 computeSize，各存各的 orig 会互相覆盖 ⇒ 展开时恢复成
 *     二次包装的 [0,-4]，控件"显示着却零高度"。共用一个命名空间后，先跑的
 *     applySlotVisibility 存 orig，本函数只在前者已存的前提下继续折叠，不会二次保存。 */
function applyPresetVisibility(node) {
    const fields = getInputMode(node);           // true = 逐段填写
    const cur = readPresetEdit(node);
    const slots = readSlotsFromNode(node);       // 段数门控：段框只显示前 slots 个
    const uiFull = readUiMode(node) === UI_FULL; // 模式开关：只有「跳接」才一次只显示一段
    for (const w of node.widgets || []) {
        if (!w || !w.name) continue;
        const m = /^(seg|start)_(\d+)$/.exec(w.name);
        if (!m) continue;
        const idx = Number(m[2]);
        const isStart = m[1] === "start";
        // 连续：段数内 seg_N 全显示（改段数就往下长）；跳接：只看当前编辑段
        // start_N：仅「跳接」+ 当前段显示
        //  idx <= slots 不能丢：丢了 = 把 applySlotVisibility 刚折叠的超编段框
        //    又展开 ⇒ 64 个段框全冒（2026-10-21 深夜事故，用户截图 #3）
        //  2026-10-28：起始（start_N）**不再单独出一块**——用户点名「这一块没必要存在」。
        //    有总览时间轴后，起始就在轴上直接拖 / 点段切换，再单独摆一行是重复且占地方。
        //    start_N 数据载体仍在（后端照读，只是不显示），值由总览轴 onSegChange 写回。
        //  2026-10-28 终版：回到原生填写框后，start_N **必须重新显示出来**——
        //    没有总览轴了，起始只能靠框填。判据回到原始设计：
        //    连续 = 只显示 seg_N（起始自动接续）；跳接 = 只显示当前编辑段的 seg_N + start_N。
        const show = fields && idx <= slots && (uiFull ? idx === cur : !isStart);
        if (show) {
            if (w._xh_seg_collapsed) {
                w._xh_seg_collapsed = false;
                if (w._xh_seg_orig_cs) w.computeSize = w._xh_seg_orig_cs;
                else delete w.computeSize;
            }
        } else {
            if (!w._xh_seg_collapsed) {
                w._xh_seg_orig_cs = w.computeSize;   // 记下原函数，展开时还原
                w._xh_seg_collapsed = true;
            }
            const cs = () => [0, -4]; cs._xh_seg = true;
            w.computeSize = cs;                      // canvas 模式：高度 -4 不绘制
        }
        //  2026-10-28 终版 bug 修复：原生模式下，**显示出来的段框必须按当前单位同步 max + 中文标签**。
        //    不同步 ⇒ 切段 / 切模式后该段上限还停在上一次口径
        //    （实锤 bug：帧模式第 1 段 max=600 正常，第 2 段卡在 25 —— 25 是秒口径上限）。
        if (PLAIN_NATIVE && show) {
            try {
                const fr = isFramesUnit(node);
                const lm = segLimitOf(w.name, fr);
                if (w.options && typeof w.options === "object") {
                    w.options = Object.assign({}, w.options, { max: lm.max });
                }
                w.label = segFieldLabel(window.XH_LANG || "zh", w.name, fr);
            } catch (e) {}
        }
        //  2026-10-28 终版：原生模式下按模式门控显隐（连续=只 seg_N，跳接=当前段 seg+start）
        w.hidden = PLAIN_NATIVE ? !show : true;
        if (w.element) { try { w.element.style.display = PLAIN_NATIVE && show ? "" : "none"; } catch (e) {} }
    }
    refreshSegSliders(node);   // 段框滑块：按口径显示并同步值/边界/文案
    renderPresetChips(node);   // 段标签条：数量（段数）/ 高亮（当前段）同步
    try {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

/** 给 preset_edit 挂 callback：改完数字立刻切换显示哪一段（与 num_segments 同款）。 */
function bindPresetEdit(node) {
    if (node._xh_preset_bound) return;
    const w = (node.widgets || []).find((x) => x && x.name === "preset_edit");
    if (!w) return;
    const orig = w.callback;
    w.callback = function (...args) {
        const r = typeof orig === "function" ? orig.apply(this, args) : undefined;
        try {
            applyPresetVisibility(node);
            setTimeout(() => { growNodeSize(node); compactNodeSize(node); }, 30);
        } catch (e) {}
        return r;
    };
    node._xh_preset_bound = true;
}

// ---------------------------------------------------------------- 单位 / 界面开关（2026-10-21）
// 单位（秒/帧）：改的是「段框/端口文案 + 端口标签」，**数据一个字不动**
//   （秒填的 5 和帧填的 124 都存在各自 widget 里，切单位只是换看法；后端按存的单位算）。
// 模式（连续/跳接）：只决定 start_N 显不显示，同样不碰数据。

/** 单位切换的段框侧刷新（帧数规矩控件 2026-10-21 深夜已删，本函数只剩两件事）：
 *  · DOM 模式下把 seg_N/start_N 的输入框步进/显示按单位刷一遍（帧=整数、秒=0.1）；
 *  · 原生 canvas 控件下这两个循环自然落空（没有 inputEl）—— 原生控件的整数化
 *    靠 py 端 INT 声明，不靠前端。 */
function applyUnitVisibility(node) {
    const frames = isFramesUnit(node);
    // 帧单位 ⇒ 段框/起始框整数化（step=1 + 显示取整）；秒单位恢复 0.1 步进。
    //  2026-10-21 深夜：py 端 seg_N/start_N 已声明 INT（根治：原生 canvas 控件下
    //    INT 才是整数显示/步进）⇒ 本循环降级为 **DOM 控件模式下的双保险刷新**；
    //    原生控件没有 inputEl，循环自然落空，不做事也不报错。
    for (const w of node.widgets || []) {
        if (!w || !w.name) continue;
        if (!/^(seg|start)_\d+$/.test(w.name)) continue;
        const el = w.inputEl;
        if (!el) continue;                     // DOM 还没挂：等 input 监听那边补
        try {
            el.step = frames ? "1" : "0.1";
            const v = Number(w.value);
            if (Number.isFinite(v)) el.value = String(frames ? Math.round(v) : v);
        } catch (e) {}
    }
    try {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

// ------------------------------------------------ 段框上限随单位切换（2026-10-22 用户定）
// 需求（用户原话）：「当选择秒的时候，下面默认最多就 30 就行了」。
// 背景：600 秒 = 10 分钟，本地模型（H3/LTX）单次出片就 5-10 秒量级 ⇒ 30 秒天花板富余量。
// 方案（方案 C，用户批准）：py 端 max 帧口径 600（2026-10-28 抬到 1500 后用户又拍板改回 600）；
//   秒单位时把**可见段框**的 max 换成 25，切回帧时恢复 600。
// 家族标准 INT 控件：段框运行时只改 w.options.max（秒=25 / 帧=600）。
// 源码依据（前端原始 Vue 源码，非猜）：
//   - useIntWidget 按 INT 型定型为标准数字控件；
//   - BaseWidget.set options 内部把 _state.options 写入 reactive store
//     => 改 options 会触发 Vue 侧重渲染（官方支路，不是 hack）。
// 重要：set options 会调 syncVisibilityFromOptions() 重算显隐，
//   我们段框显隐自己用 w.hidden 管，改完必须重跑 applySlotVisibility 补回口径。
// 只处理可见段框：折叠的框 Vue 不渲染，改了也看不到。
// 价值钳制：切到秒时已有的超限值压到上限（时长 60 / 起始 3600）（不压就显示和实际值对不上）。
//  2026-10-28 上调（粉丝反馈「想连续跑 1 小时」）：64 段 × 600 帧 = 38400 帧 = 26.7 分钟，
//    跑不满 1 小时 ⇒ 单段时长上限 600 → 1500（帧）/ 30 → 60（秒）；
//    64 × 1500 = 96000 帧 = 66.7 分钟 > 1 小时，64 × 60s = 3840s = 64 分钟 > 1 小时。
const SEG_MAX_SEC = 25;      // 【时长】秒上限（= 600 帧 @24fps；用户拍板单段最长 600 帧）
const SEG_MAX_FRAME = 600;   // 【时长】帧上限（600 帧 ≈ 25s@24fps，与 py 端 SEG_MAX 一致）

// ---- 【起始】上限（2026-10-28 修正，粉丝反馈「起始帧最长只有 600，不够用」）----
// 根因：起始和时长**共用一把尺子**。时长 = 单次出片长度（几秒量级，600 帧绰绰有余）；
//   起始 = 源素材的**绝对位置**（跳片头 / 段间重叠 / 跳着取片段），量级是「整片长度」，
//   ⇒ 600 帧（25 秒 @24fps）连跳个片头都不够；秒单位更惨（被时长的 30 一起钳死）。
// 修正：起始另立一把尺子 = **1 小时**双口径 —— 秒 3600 / 帧 86400（3600×24 @24fps）。
//   86400 与 XiaoHei-加载视频 start_sec 的上限同值（image_tools/py/video_load.py:500）
//   ⇒ 上游不再比下游窄（改之前：上游 600 帧 vs 下游 start_frame 上限 2**53-1，倒挂百倍）。
//   py 端 schema 静态（切单位改不动）⇒ py 写的是帧口径 86400，秒口径 3600 在这里动态压下。
const START_MAX_SEC = 3600;      // 【起始】秒上限 = 1 小时
const START_MAX_FRAME = 86400;   // 【起始】帧上限 = 1 小时 @24fps
//  拖拽条**软量程**（xh_ui_kit 的 hardMax 补丁）：硬上限 86400 直接给条子的话，
//    150px 的条子上 1 像素 ≈ 576 帧 ⇒ 拖不动了。⇒ 条子只跑软量程（≈2 分钟，覆盖
//    绝大多数要拖的场景），数字框照常能打到 1 小时；两者分离靠 makeXHSlider 的 hardMax。
//  两个软量程必须**同一个时长**（120 秒 = 120×24 帧），否则切单位时条子跨度会跳。
const START_DRAG_SEC = 120;      // 【起始】拖拽软量程 = 2 分钟
const START_DRAG_FRAME = 2880;   // 【起始】拖拽软量程 = 2 分钟 @24fps（120×24）

/** 段框上限（「时长 / 起始」×「秒 / 帧」四象限）。
 *  @returns {{max:number, drag:number}} max = 真上限（数字框 + clamp）；drag = 拖拽条软量程 */
function segLimitOf(name, frames) {
    if (isStartName(name)) {                       // 起始：1 小时（软量程 ≈2 分钟）
        return frames
            ? { max: START_MAX_FRAME, drag: START_DRAG_FRAME }
            : { max: START_MAX_SEC, drag: START_DRAG_SEC };
    }
    const m = frames ? SEG_MAX_FRAME : SEG_MAX_SEC;
    return { max: m, drag: m };                    // 时长：软量程 = 真上限（600 本来就够拖）
}

/** 按当前单位设置可见段框的滑块上限。
 *  2026-10-28 起**时长 / 起始各一把尺子**：时长 秒=30 / 帧=600（不变）；
 *  起始 秒=3600 / 帧=86400（粉丝反馈 600 帧不够跳片头）。见 segLimitOf。
 *  改的是 w.options.max（官方滑块量程来源）→ 会触发 Vue 重渲染。
 *  改完后立即重跑 applySlotVisibility 把我们自己的 w.hidden 显隐口径补回去。 */
function applySegMaxByUnit(node, skipVisibility) {
    if (!node) return;
    const frames = isFramesUnit(node);
    let changed = false;
    for (const w of node.widgets || []) {
        if (!w || !w.name) continue;
        if (!/^(seg|start)_\d+$/.test(w.name)) continue;
        //  2026-10-28 终版 bug 修复：**原生模式下不能跳过隐藏的段框**。
        //    跳过 ⇒ 切单位时只有当前可见那一段的 max 更新，其余段永久卡在旧口径
        //    （帧模式第 1 段 600 正常、第 2 段卡在 25 秒 —— 用户报的 bug 根因）。
        if (!PLAIN_NATIVE && w.hidden) continue;      // 折叠的段框：Vue 不渲染 → 不用改
        const lim = segLimitOf(w.name, frames);       // 时长 / 起始 分开取
        const max = lim.max;
        // 价值超上限→ 钳到上限（只在切到秒时；切回帧不钳）
        //  钳制必须在 max 判断**之外**：max 已等于目标值时也要钳（例如从帧切回秒时 max 本就是 30）
        if (!frames) {
            const v = Number(w.value);
            if (Number.isFinite(v) && v > max) {
                w.value = max;       // 改值即可，Vue 重渲染会同步数字显示
            }
        }
        const opts = w.options;                       // 只改 max，其余选项保持原样（±钮用官方标准 INT 自带）
        if (opts && typeof opts === "object" && Number(opts.max) !== max) {
            try {
                w.options = Object.assign({}, opts, { max }); // BaseWidget setter -> store -> Vue 重渲染
                changed = true;
            } catch (e) {}
        }
        // 同步家族滑块：拖拽条吃软量程 lim.drag，数字框吃真上限 max（hardMax 补丁）
        //  schema 没变也要同步（新建 / 重建的滑块实例量程可能还是旧的）
        try {
            const sd = (node._xh_seg_sliders && node._xh_seg_sliders[w.name]);
            if (sd && sd.sl) {
                if (typeof sd.sl.setMaxes === "function") sd.sl.setMaxes(lim.drag, max);
                else { sd.sl.range.max = String(max); sd.sl.numBox.max = String(max); }
                // 2026-10-28：切单位 ⇒ 起始时间码重算（秒 2 框 / 帧 3 框）
                if (typeof sd.sl.setMode === "function") sd.sl.setMode(frames, fpsOf(node));
            }
        } catch (e2) {}
    }
    if (changed && !skipVisibility) {
        // 我们自己的显隐口径不能被 set options 的重算带跑 ⇒ 先修再补
        //  skipVisibility：applySlotVisibility 末尾也会调本函数 ⇒ 那里必须传 true，否则无限递归
        try { applySlotVisibility(node); } catch (e) {}
    }
}

/** 帧单位下段框/起始框**输入即取整**（2026-10-21 深夜）。
 *  背景：py 端 seg_N/start_N 已声明 INT（根治），但 ComfyUI 的 **DOM 控件模式**下
 *  number 输入框仍可能灌进小数（粘贴等）⇒ 这里补一层 input 事件 round，双保险。
 *  原生 canvas 控件没有 inputEl，监听自然绑不上，无副作用。
 *   我们的 listener 在 ComfyUI 内部 handler **之后**绑（DOM 挂载后补绑）：
 *     同一 input 事件里内部 handler 先把 w.value 设成原始文本，这里再覆盖成整数。 */
function bindSegRoundApply(node) {
    if (node._xh_seg_round_bound) return;
    node._xh_seg_round_bound = true;
    const bind = () => {
        for (const w of node.widgets || []) {
            if (!w || !w.name || !/^(seg|start)_\d+$/.test(w.name)) continue;
            const el = w.inputEl;
            if (!el || el._xh_seg_round) continue;
            el._xh_seg_round = true;
            el.addEventListener("input", () => {
                if (!isFramesUnit(node)) return;          // 秒单位：不插手
                const raw = el.value;
                const v = Math.round(Number(raw));
                if (!Number.isFinite(v) || String(v) === raw) return;
                el.value = String(v);
                if (w.value !== v) w.value = v;           // 同步回控件值（后端读它）
            });
        }
    };
    bind();
    setTimeout(bind, 50);                                  // DOM 后挂：补绑
    setTimeout(bind, 300);
}

/** 单位切换：刷文案（段框/端口）+ 段框步进/显示。 */
function bindUnitApply(node) {
    if (node._xh_unit_bound) return;
    const w = findWidget(node, "unit");
    if (!w) return;
    const orig = w.callback;
    w.callback = function (...args) {
        const r = typeof orig === "function" ? orig.apply(this, args) : undefined;
        try {
            applyLang(node);
            applyUnitVisibility(node);
            applySegMaxByUnit(node);        // 2026-10-22：上限随单位切（秒=30 / 帧=600）
            setTimeout(() => { growNodeSize(node); compactNodeSize(node); }, 30);
        } catch (e) {}
        return r;
    };
    node._xh_unit_bound = true;
}

/** 模式切换的统一入口（2026-10-21 晚）：工具条「模式」按钮 / 下拉 / 读档都走这里。
 *  干四件事：
 *   ① 跳接模式下若是批量粘贴态 ⇒ 自动切回逐段（批量行没有起始框，
 *      留着 ⇄ 只会让人切过去后起始框全失灵；数据同步逻辑现成的，不丢）；
 *   ② preset_edit（当前编辑第几段）只在跳接模式显示 —— 连续模式下它就是多余的；
 *   ③ ⇄ 按钮在 full 下藏起（批量粘贴在该模式无意义）；
 *   ④ ui_mode 下拉本体视觉隐藏（按钮是唯一入口，免得两个入口状态不一致）。 */
function applyUiModeAll(node) {
    if (!node) return;
    const uiFull = readUiMode(node) === UI_FULL;

    // ① 跳接 + 批量态 ⇒ 自动纠正为逐段（批量行没有起始框，
    //    留着 ⇄ 只会让人切过去后起始框全失灵；数据同步逻辑现成的，不丢）。
    //     条件别写反：getInputMode()=true 才是逐段，批量态要取反！
    //       （2026-10-21 深夜事故：写成 uiFull && getInputMode(node) ⇒ 逐段态被
    //        toggle 成批量态还 return 跳过 ②③⑤ ⇒ 段框全藏、批量框冒出）
    //    toggleInputMode → applyMode → 会重入本函数，第二次进来已是逐段态，
    //    ① 不再触发；本次调用也继续往下跑（读的都是实时状态，幂等）。
    if (uiFull && !getInputMode(node)) {
        try { toggleInputMode(node); } catch (e) {}
    }

    // ② preset_edit：本体恒隐藏（± 数字框已废弃），改由「段标签条」代它显示
    //     2026-10-21 深夜（用户：「这个参数框用这种加减不合理，参考提示词表那个起跑按键」）：
    //       preset_edit 退化为纯数据载体（名字 / 存档键 / 后端读取全不变），
    //       界面 = 一排「第1段 第2段 …」，点哪段编辑哪段。跳接模式才出现。
    const pe = findWidget(node, "preset_edit");
    if (pe) {
        if (!pe._xh_seg_collapsed) {
            pe._xh_seg_orig_cs = pe.computeSize;
            pe._xh_seg_collapsed = true;
        }
        const cs = () => [0, -4]; cs._xh_seg = true;
        pe.computeSize = cs;
        pe.hidden = true;
        if (pe.element) { try { pe.element.style.display = "none"; } catch (e) {} }
    }
    showPresetChips(node, uiFull);   // 段标签条：跳接模式显示，连续模式藏

    // ③ ⇄ 按钮显隐
    if (node._xh_seg_mode_btn) {
        try { node._xh_seg_mode_btn.style.display = uiFull ? "none" : ""; } catch (e) {}
    }

    // ④ ui_mode 下拉本体隐藏（三保险，照 input_mode 的套路）
    const uw = findWidget(node, "ui_mode");
    if (uw) {
        try {
            if (!uw._xh_seg_mode_hidden_vis) {
                uw._xh_seg_mode_hidden_vis = true;
                uw.computeSize = () => [0, -4];
                uw.computeLayoutSize = undefined;
            }
            uw.hidden = true;
            const el = uw.element || uw.el;
            if (el && el.style) el.style.display = "none";
        } catch (e) {}
    }

    // ⑤ 模式按钮文案（当前状态一眼可见）
    if (node._xh_seg_layout_btn) {
        try {
            node._xh_seg_layout_btn.textContent = layoutBtnText(readUiMode(node));
            node._xh_seg_layout_btn.title = pack().btns.layoutTitle;
        } catch (e) {}
    }

    applyPresetVisibility(node);
    try {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {}
    setTimeout(() => { growNodeSize(node); compactNodeSize(node); }, 30);
}

/** 模式按钮文字（跟 ⇄ 按钮一个脾气：直接显示当前处在哪个状态）。 */
function layoutBtnText(ui) {
    const zh = (window.XH_LANG || "zh") === "zh";
    return ui === UI_FULL
        ? (zh ? "模式·跳接" : "Mode · jump")
        : (zh ? "模式·连续" : "Mode · continuous");
}

/** 点「模式」：切 ui_mode widget 的值（触发 bindUiModeApply 挂的 callback）。 */
function toggleUiMode(node) {
    const w = findWidget(node, "ui_mode");
    if (!w) return;
    w.value = w.value === UI_FULL ? UI_SIMPLE : UI_FULL;
    if (w.callback) { try { w.callback(w.value); } catch (e) {} }
    applyUiModeAll(node);
}

/** 「模式」按钮（挂在工具条 ⇄ 右边）：纯文字，样式走家族 makeBarBtn 同源规格。
 *   不用 emoji 图标（Windows 渲染成彩色 3D 风，跟深色主题不搭，各平台还不一致）——
 *    专业软件工具条全是文字标签，零「土」感、缩放不失真。 */
/** 「恢复默认」按钮（纯文字家族风格，不加 emoji）：一键把所有段时长 seg_N **和** 起始 start_N
 *  都设回声明 default（时长=5、起始=0，随单位秒/帧自动对应；秒=5秒&0秒、帧=5帧&0帧），
 *  同步家族滑块。快捷键 R 也走同一逻辑（见 installResetHotkey）。 */
function createResetBtn(node) {
    const _origTxt = "恢复默认(R)";
    const btn = makeBarBtn("恢复默认(R)", "一键把所有段的时长恢复到默认值（快捷键：选中此节点后按 R）", { role: "neutral" });
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        try {
            const _cnt = resetSegDefaults(node);
            btn.textContent = _cnt > 0 ? ("已恢复 " + _cnt + " 段") : "已恢复!";
            setTimeout(() => { btn.textContent = _origTxt; }, 1100);
        } catch (err) {
            console.error("[XiaoHei-SegTable] 恢复默认失败:", err);
            btn.textContent = "失败";
            setTimeout(() => { btn.textContent = _origTxt; }, 900);
        }
    });
    return btn;
}

/** 「恢复默认」核心：把所有段时长 seg_N **和** 起始 start_N 都设回 default 并同步滑块 UI。
 *   2026-10-22 用户补刀：跳接模式下起始滑块也要跟着归位（之前只动了 seg_N）。 */
function resetSegDefaults(node) {
    if (!node || !node.widgets) return 0;
    // ① 先现场扫「活滑块」：name -> sl（node.widgets 上挂的 DOM 控件 = 页面正在显示的）
    const liveSl = {};      // name -> [sl, ...]：同名控件可能不止一个（重建过就并存两套）
    for (const w of node.widgets) {
        if (w && w._xh_sl_ref && w._xh_seg_name) {
            (liveSl[w._xh_seg_name] = liveSl[w._xh_seg_name] || []).push(w._xh_sl_ref);
        }
    }
    let cnt = 0;
    // ② 单个框恢复（数据载体 + 滑块 UI 全量同步）；isCount=true 才计入"段数"
    const applyOne = (w, d, isCount) => {
        try {
            if (Number(w.value) !== d) w.value = d;
            if (w.inputEl) w.inputEl.value = String(d);
        } catch (e) {}
        let arr = liveSl[w.name] || [];
        const sdOld = (node._xh_seg_sliders || {})[w.name];
        if (sdOld && sdOld.sl && arr.indexOf(sdOld.sl) < 0) arr = arr.concat([sdOld.sl]);
        for (const sl of arr) { try { sl.set(d, 0); } catch (e) {} }
        if (isCount) cnt++;
    };
    for (const w of node.widgets) {
        if (!w || !w.name) continue;
        const isSeg = /^seg_\d+$/.test(w.name);
        const isStart = /^start_\d+$/.test(w.name);
        if (!isSeg && !isStart) continue;        // 时长 + 起始一起恢复，其余不碰
        const dRaw = (w.options && w.options.default != null) ? Number(w.options.default) : (isSeg ? 5 : 0);
        const d = Number.isFinite(dRaw) ? dRaw : (isSeg ? 5 : 0);
        applyOne(w, d, isSeg);   // 段数按时长框计（起始框与之一一对应、同批归位）
    }
    // ③ 统一刷新：显隐口径 + 滑块值 + 段标签 ⇒ 跳接 / 连续两种模式都立刻看得见
    try { refreshSegSliders(node); } catch (e) {}
    try { renderPresetChips(node); } catch (e) {}
    try {
        if (app && app.canvas) {
            const fn = app.canvas.setDirty || app.canvas.setDirtyCanvas;
            if (typeof fn === "function") fn.call(app.canvas, true, true);
        }
    } catch (e) {}
    try { console.info("[XiaoHei-SegTable] 恢复默认：", cnt, "段 → 时长+起始归位"); } catch (e) {}
    return cnt;
}

/** 全局快捷键 R：选中本节点时按 R ⇒ 恢复默认（避开输入框打字场景）。只装一次。 */
let _xhResetKeyInstalled = false;
function installResetHotkey() {
    if (_xhResetKeyInstalled || typeof document === "undefined") return;
    _xhResetKeyInstalled = true;
    document.addEventListener("keydown", (e) => {
        if (e.key !== "r" && e.key !== "R") return;
        const t = e.target;
        if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;  // 输入框不打扰
        const cv = app && app.canvas;
        if (!cv) return;
        let nodes = [];
        if (cv.selected_nodes && typeof cv.selected_nodes === "object") nodes = Object.values(cv.selected_nodes);
        else if (cv.selected_node) nodes = [cv.selected_node];
        let hit = false;
        for (const n of nodes) {
            if (n && typeof n.XH_resetSegDefaults === "function") { n.XH_resetSegDefaults(); hit = true; }
        }
        if (hit) e.preventDefault();
    }, false);
}

//  2026-10-22：家族齿轮（ 折叠/展开参数）—— 与 XiaoHei-滑块 / XiaoHei-链式提示词 / XiaoHei-加载视频 同款
//   kit.makeGearBtn（粗壮实心齿轮 + 亮蓝收起 / 绿展开 + 26×22 + 全事件拦截）。
//   收起 = 只留工具条 + 实时段状态条；展开 = 重跑各显隐口径，按当前模式/单位还原段框。
//   位置按家族规范永远排工具条**最左**（调用方传 prependNodes）。
function segParamsCollapsed(node) {
    try {
        const p = node.properties || (node.properties = {});
        return !!p.xh_seg_collapsed;
    } catch (e) { return false; }
}
function setSegParamsCollapsed(node, collapsed) {
    // 工具条 / 实时段状态条 / input_mode 隐藏载体三样永不收（折叠后还要看"正在跑第几段"）
    const keep = new Set(["xh_segtable_bar", "xh_seg_status", "input_mode"]);
    for (const w of (node.widgets || [])) {
        if (!w || !w.name) continue;
        if (keep.has(w.name)) continue;
        try {
            w.hidden = !!collapsed;
            if (w.element) w.element.style.display = collapsed ? "none" : "";
        } catch (e) {}
    }
    if (!collapsed) {
        // 展开：按创建期同顺序重跑显隐口径，把 seg/start/段标签/单位步进全还原
        try { applySlotVisibility(node); } catch (e) {}
        try { applyMode(node); } catch (e) {}
        try { applyUiModeAll(node); } catch (e) {}
        try { applyUnitVisibility(node); } catch (e) {}
        try { applyPresetVisibility(node); } catch (e) {}
        try { renderPresetChips(node); } catch (e) {}
    }
    try {
        const p = node.properties || (node.properties = {});
        p.xh_seg_collapsed = !!collapsed;
    } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    try { node.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
    setTimeout(() => { try { compactNodeSize(node); } catch (e) {} }, 20);
}

function createGearBtn(node) {
    //  家族统一齿轮（kit.makeGearBtn）：默认展开（段表参数就是核心，不能默认藏）
    const btn = makeGearBtn({
        collapsed: false,
        titleFn: (col) => {
            const zh = (window.XH_LANG || "zh") === "zh";
            return col
                ? (zh ? "点此展开参数" : "Expand parameters")
                : (zh ? "点此收起参数" : "Collapse parameters");
        },
        onToggle: (col) => {
            try { setSegParamsCollapsed(node, col); } catch (err) {
                console.error("[XiaoHei-SegTable] 齿轮折叠失败:", err);
            }
        },
    });
    return btn;
}

//  2026-10-28 终版（用户拍板）：**回到最原始的手动填写框**。
//   原话：「不要滑块也不要时间轴了，就要原始的手动填写框，后面缀一个微调的上下小三角」。
//   ⇒ 段框（seg_N）/ 起始框（start_N）一律用 **ComfyUI 原生 INT 控件**（数字框 + 右侧上下小三角），
//     自建的滑块 / 时间码 / 时间轴色块 / 常驻总览轴 **全部停建**（代码保留，PLAIN_NATIVE 改 false 即可回退）。
//    原生控件此前被 ensureSegSlider 无条件 `w.hidden = true` 藏掉（由 DOM 控件顶替），
//      所以回到原生必须**把它重新设为可见**（showSegSlider 原生分支 + 两处显隐判据）。
const PLAIN_NATIVE = true;

// ---- 极简模式（2026-10-28：用户点名「参数太多，头大 / 反人类」）----
// 默认只留「段数 / 总时长 / 单位 / 时长 / 一次跑完 / 连续⇄跳接」，其余次要参数收起；
// 点工具条上的「完整」随时展开。**只做视觉隐藏，值一个不动**（存档/连线/计算全不变）。
//  2026-10-29：fps / total_len 两个控件已随摆设一起从后端摘掉 ⇒ 从隐藏表里移除。
//    frame_rule（帧数规矩）**故意不进这张表**：它是用户主动要的常用参数，
//    藏进「完整」里每次都要点开才能改，等于白加。
const MINIMAL_HIDE = ["index", "durations", "clamp", "input_mode"];

/** 该控件是否已转成输入端口并连了线（连了就不能用 w.hidden，会连端口一起藏）。 */
function segWidgetLinked(node, name) {
    try {
        const inp = (node.inputs || []).find((i) => i && i.name === name);
        return !!(inp && inp.link != null);
    } catch (e) { return false; }
}

/** 家族标准视觉隐藏：Vue Nodes 只认 w.hidden（实锤见 xh_audio_load.js 注释）。 */
function setSegWidgetHidden(node, name, hidden) {
    const w = findWidget(node, name);
    if (!w) return;
    if (hidden && segWidgetLinked(node, name)) return;   //  有连线 ⇒ 不藏，保住端口
    if (w._xhSegVis === hidden) return;
    w._xhSegVis = hidden;
    try { w.hidden = hidden; } catch (e) {}
    if (!w._xhSegOrigFns) {
        w._xhSegOrigFns = {
            computeSize: w.computeSize,
            getMinHeight: w.getMinHeight,
            hasLayout: "computeLayoutSize" in w,
            computeLayoutSize: w.computeLayoutSize,
            draw: w.draw,
            mouse: w.mouse,
        };
    }
    if (hidden) {
        try { w.computeSize = () => [0, 0]; } catch (e) {}
        try { w.getMinHeight = () => 0; } catch (e) {}
        try { delete w.computeLayoutSize; } catch (e) {}
        try { w.draw = () => {}; } catch (e) {}
        try { w.mouse = () => false; } catch (e) {}
        if (w.element) { try { w.element.style.display = "none"; } catch (e) {} }
    } else {
        const o = w._xhSegOrigFns || {};
        //  原方法多半继承自原型：恢复时「有就赋值、没有就删 own 属性」，绝不写 own undefined
        const restore = (k) => { try { if (o[k] === undefined) { delete w[k]; } else { w[k] = o[k]; } } catch (e) {} };
        restore("computeSize"); restore("getMinHeight"); restore("draw"); restore("mouse");
        try { if (o.hasLayout) w.computeLayoutSize = o.computeLayoutSize; } catch (e) {}
        if (w.element) { try { w.element.style.display = ""; } catch (e) {} }
    }
}

/** 极简开关状态（properties 持久化；默认 true = 极简）。 */
function readMinimal(node) {
    try { return node.properties?.xh_seg_minimal !== false; } catch (e) { return true; }
}

function applyMinimalMode(node) {
    const m = readMinimal(node);
    for (const n of MINIMAL_HIDE) setSegWidgetHidden(node, n, m);
    try {
        if (node._xh_seg_minimal_btn) node._xh_seg_minimal_btn.textContent = m ? "完整" : "极简";
    } catch (e) {}
    setTimeout(() => { try { compactNodeSize(node); } catch (e) {} }, 20);
}

function createMinimalBtn(node) {
    const btn = makeBarBtn(readMinimal(node) ? "完整" : "极简", "极简=只留核心参数；完整=显示全部参数（值始终不变）", { role: "neutral" });
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        try {
            const p = node.properties || (node.properties = {});
            p.xh_seg_minimal = !readMinimal(node);
            applyMinimalMode(node);
        } catch (err) { console.error("[XiaoHei-SegTable] 极简切换失败:", err); }
    });
    return btn;
}

function createLayoutBtn(node) {
    const btn = makeBarBtn(layoutBtnText(readUiMode(node)), pack().btns.layoutTitle, { role: "neutral" });
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        try { toggleUiMode(node); } catch (err) {
            console.error("[XiaoHei-SegTable] 切换模式失败:", err);
        }
    });
    return btn;
}

/** 模式切换：连续 ⇄ 跳接（起始框显隐，数据不丢）。 */
function bindUiModeApply(node) {
    if (node._xh_ui_bound) return;
    const w = findWidget(node, "ui_mode");
    if (!w) return;
    const orig = w.callback;
    w.callback = function (...args) {
        const r = typeof orig === "function" ? orig.apply(this, args) : undefined;
        try {
            applyUiModeAll(node);
        } catch (e) {}
        return r;
    };
    node._xh_ui_bound = true;
}

/** 给 num_segments 挂 callback：改完数字立刻折叠/展开。 */
function bindSlotAutoApply(node) {
    if (node._xh_seg_slot_bound) return;
    const w = (node.widgets || []).find((x) => x && x.name === "num_segments");
    if (!w) return;
    const orig = w.callback;
    w.callback = function (...args) {
        const r = typeof orig === "function" ? orig.apply(this, args) : undefined;
        try {
            applySlotVisibility(node);
            //  2026-10-21 深夜用户定：**段数与「当前编辑第几段」不准联动**——
            //    段数填 10 就固定 10 段；当前编辑第几段由用户自己动态调（1~段数）。
            //    （曾有的「跳接模式改段数自动跳新段」逻辑已删：那是替他做决定。）
            //    越界防呆保留在 readPresetEdit（段数改小 ⇒ 编辑位自动钳到位），
            //    那是防错不是联动。
            applyPresetVisibility(node);
            //  2026-10-28 兜底：段数一变（增减）立即同步段按钮数量。
            //    之前只靠回调链末端 refreshSegSliders→renderPresetChips，多层 callback 包装后
            //    缩减段数偶发漏刷 ⇒ 段按钮停在旧数量（增减不对称）。这里显式兜底。
            renderPresetChips(node);
            setTimeout(() => compactNodeSize(node), 30);
        } catch (e) {}
        return r;
    };
    node._xh_seg_slot_bound = true;
}

// ---------------------------------------------------------------- 输入方式互切（2026-10-16）
// input_mode：隐藏的 BOOLEAN widget（Python required 末尾追加，界面上不直接显示）。
//   false = 批量粘贴（默认）；true = 逐段填写。

function findWidget(node, name) {
    return (node.widgets || []).find((w) => w && w.name === name) || null;
}

/** input_mode 是**纯后端字段**（Python required 末尾追加，只为把模式存进工作流）：
 *  视觉隐藏（家族标准 hideWidgetVisually 同款：computeSize=[0,0] + getMinHeight=0
 *  + computeLayoutSize=undefined + draw/mouse 空 + element display:none）。
 *   铁律（skill §4）：**不能** hardenNoSerialize —— 这个值丢了模式就丢了；
 *    也不设 w.hidden=true（会把共存输入端口一起藏没的元凶，统一走视觉隐藏）。
 *  element 是 Vue 挂载后才有的 ⇒ 幂等补挂：每次 applySlotVisibility 都顺手刷一次。 */
function hideInputModeWidget(node) {
    const w = findWidget(node, "input_mode");
    if (!w) return;
    try {
        if (!w._xh_seg_mode_hidden_vis) {
            w._xh_seg_mode_hidden_vis = true;
            w.computeSize = () => [0, 0];
            w.getMinHeight = () => 0;
            w.computeLayoutSize = undefined;   // Vue 网格：不撤掉这条该行仍算 auto、白吃高度
            w.draw = () => {};
            w.mouse = () => false;
        }
        const el = w.element || w.el;
        if (el && el.style && el.style.display !== "none") {
            el.style.display = "none";
            el.style.height = "0px";
            el.style.overflow = "hidden";
        }
    } catch (e) {}
}

function getInputMode(node) {
    const w = findWidget(node, "input_mode");
    return !!(w && w.value);
}

/** 单位开关：返回 "帧" / "秒"（读不到 / 非法值一律当「秒」= 老行为）。 */
function readUnit(node) {
    const w = findWidget(node, "unit");
    return w && w.value === UNIT_FRAME ? UNIT_FRAME : "秒";
}
function isFramesUnit(node) {
    return readUnit(node) === UNIT_FRAME;
}

/** 模式开关：返回 UI_FULL / UI_SIMPLE（读不到一律当「连续」= 老分段表体验）。
 *  2026-10-21 深夜改名兼容：旧存档存的是「只填时长 / 时长+起始秒」，
 *  读到旧词就地改写成新词，之后存盘就是新值（老档打开不丢模式）。 */
function readUiMode(node) {
    const w = findWidget(node, "ui_mode");
    if (!w) return UI_SIMPLE;
    if (w.value === UI_FULL) return UI_FULL;
    if (w.value === "时长+起始秒") { w.value = UI_FULL; return UI_FULL; }
    if (w.value === "只填时长") { w.value = UI_SIMPLE; return UI_SIMPLE; }
    return UI_SIMPLE;
}

function setInputMode(node, v) {
    const w = findWidget(node, "input_mode");
    if (w) w.value = !!v;
}

/** 与后端 _parse_durations 逐字一致的 JS 版：去空行 / `#` 注释行，取每行第一个数字。
 *   2026-10-16：JS **没有** String.prototype.splitlines（那是 Python 的）——
 *     曾直接照抄成 .splitlines()，浏览器里 TypeError 被 click handler 的 try/catch
 *     吞掉 ⇒ 「⇄」切换 + 自动判段数全部静默失灵。必须手写 split，\r\n / \r / \n 都收。 */
const _SEG_NUM_RE = /-?\d+(?:\.\d+)?/;
function parseDurationsText(text) {
    const vals = [];
    for (const raw of String(text == null ? "" : text).split(/\r\n|\r|\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const m = _SEG_NUM_RE.exec(line);
        if (m) vals.push(parseFloat(m[0]));
    }
    return vals;
}

/** 模式按钮文案：显示**当前**模式（点了就切成另一种）。 */
function modeBtnText(fields) {
    const zh = (window.XH_LANG || "zh") === "zh";
    if (fields) return zh ? "⇄ 逐段填写" : "⇄ Per-segment";
    return zh ? "⇄ 批量粘贴" : "⇄ Bulk paste";
}

/** 批量 → 逐段：把 durations 按行解析填进 seg_N，段数 = 有效行数（空文本则不动分段框）。
 *   2026-10-16：只收 **>0** 的行 —— 与后端 _collect 对齐（0 = 没填，跳过），
 *     否则「3\n0\n5」粘进去后端只认 2 段、前端却显示 3 个框，段数语义分裂。 */
function syncBulkToFields(node, srcSlots) {   //  2026-10-22 补形参（上一轮漏加 → 批量→逐段切换 ReferenceError 崩溃）
    if (srcSlots === undefined) srcSlots = 0;  // 防御：无调用方传参时不崩
    const dur = findWidget(node, "durations");
    const vals = parseDurationsText(dur ? dur.value : "").filter((v) => v > 0);
    //  2026-10-22 修复「切模式丢段数」：切回逐段时，段数取「批量行数」与「切走前段数」的较大者。
    //    · 只是切过去看一眼再切回 ⇒ 批量框是上一步自动生成的，段数不应变小 ⇒ 保住 srcSlots；
    //    · 主动在批量框多粘行 ⇒ 批量行数更大 ⇒ 正常扩段；主动删行 ⇒ 按批量行数（符合直觉）。
    const parsedN = vals.length ? Math.min(vals.length, MAX_SLOTS) : 0;
    const n = Math.max(MIN_SLOTS, Math.min(Math.max(parsedN, srcSlots || 0), MAX_SLOTS));
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const w = findWidget(node, `seg_${i}`);
        if (!w) continue;
        // 超出本次行数的框清零：否则上次残留的 >0 值会在段数改大后混进来
        //  2026-10-21 深夜：seg_N 已 INT ⇒ 粘贴文本里的小数也 round 归正
        // vals 有值且在本段内 ⇒ 用批量值；否则保留原值（防切换丢数据）；超编段清零
        const v = i <= n ? (i <= vals.length ? Math.round(vals[i - 1]) : (Number(w.value) || 0)) : 0;
        if (Number(w.value) !== v) {
            w.value = v;
            if (w.inputEl) w.inputEl.value = v;
        }
    }
    const nw = findWidget(node, "num_segments");
    if (nw && Number(nw.value) !== n) {
        nw.value = n;
        if (nw.inputEl) nw.inputEl.value = n;
    }
    return n;
}

/** 逐段 → 批量：把当前可见（段数范围内）的段框重新生成一行一个的文本。
 *  0 也照写一行（后端解析成 0.0 秒），这样来回切换round-trip 不错位。 */
function syncFieldsToBulk(node) {
    const n = readSlotsFromNode(node);
    const lines = [];
    for (let i = 1; i <= n; i++) {
        const w = findWidget(node, `seg_${i}`);
        const v = w ? Number(w.value) : 0;
        lines.push(Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "0");
    }
    const dur = findWidget(node, "durations");
    if (dur) {
        dur.value = lines.join("\n");
        if (dur.inputEl) dur.inputEl.value = dur.value;
    }
    return lines.length;
}

/** 旧存档（没有 widgets_values_named 的纯数组档）按**当年的运行序**重新解释。
 *   2026-10-16 重排安全性实证链（读 comfyui_frontend_package 1.55.14 源码）：
 *   ① 存盘 serialiseWidgetValues(e)：`for (r of e) { if (r.serialize===false) continue;
 *      t.push(r.value); n[r.name]=r.value }` ⇒ widgets_values 按**widgets 现序**写、named 按名字写。
 *   ② 读档 LGraphNode.configure：`let e=0; for (t of this.widgets) {
 *      if (t.serialize===false) continue; getRestoredWidgetValue(id, t.name, e++) }`
 *      ⇒ positional 按 **widgets 现序**（可序列化序号）恢复。
 *   ③ createNode → constructor → invokeExtensionsAsync("nodeCreated") ⇒ 我们的 onNodeCreated
 *      （含 reorderWidgets）在 configure **之前**就跑完了 ⇒ 读档时 widgets 已是重排序。
 *   ④ 而 v1.14.1 及以前的存档 positional 是按**声明序**（index, durations, clamp,
 *      seg_1..64, num_segments, all_segments = 69 个）存的 ⇒ 直接位置恢复必然串值
 *      （实测：clamp 收到 seg_1 的值、durations 收到 seg_2 的值、num_segments 收到 durations 的值）。
 *   ⇒ 对策：纯数组档（无 named）在这里按**长度精确匹配**某一年代的运行序，把值**按名字**
 *     重新赋一遍，覆盖掉错位恢复。匹配不上的一律不碰（宁可不动，也不乱写）。
 *   · 老老档（MAX_SLOTS 扩容前的 n+4 布局）一并在此处理：末位是 num_segments。
 *   · 2026-10-21：布局表一路补齐 —— 70 值（2026-10-16 改版后）、85 值（通道时代，
 *     多出 ch_count / fps / frame_rule / ch_*_mode / ch_*_val，这套控件已删 ⇒ 按名字找不到，
 *     自动跳过 ⇒ start_N 保持默认 0 = 自动接续，不会把 fps 的 24.0 错安到 start_1 上）、
 *     135 / 138 值（当天「预设」与「两开关」时代的运行序，含 preset_edit / start_N / 三开关）。 */
function applyLegacyPositional(node, wv) {
    if (!Array.isArray(wv) || !wv.length) return;
    const segs = Array.from({ length: MAX_SLOTS }, (_, i) => `seg_${i + 1}`);
    const starts = Array.from({ length: MAX_SLOTS }, (_, i) => `start_${i + 1}`);
    const chTail = [];
    for (let i = 1; i <= 6; i++) chTail.push(`ch_${i}_mode`, `ch_${i}_val`);
    const layouts = [
        // 2026-10-21 晚（本次）运行序：138 个 = 段 + 单位/帧数规矩/界面三开关
        ["index", "durations", "clamp"].concat(segs)
            .concat(["num_segments", "all_segments", "input_mode", "preset_edit"])
            .concat(starts).concat(["unit", "frame_rule", "ui_mode"]),
        // 2026-10-21 下午（预设时代，只活了几小时）运行序：135 个（无三开关）
        ["index", "durations", "clamp"].concat(segs)
            .concat(["num_segments", "all_segments", "input_mode", "preset_edit"])
            .concat(starts),
        // 通道时代（2026-10-21，只活了两天）运行序：85 个
        ["index", "num_segments", "ch_count", "all_segments", "clamp", "durations"]
            .concat(segs).concat(["input_mode", "fps", "frame_rule"]).concat(chTail),
        // 2026-10-16 改版后运行序：70 个
        ["index", "num_segments", "all_segments", "clamp", "durations"]
            .concat(segs).concat(["input_mode"]),
        // 更早的声明序：69 个
        ["index", "durations", "clamp"].concat(segs).concat(["num_segments", "all_segments"]),
    ];
    let order = null;
    for (const L of layouts) {
        if (L.length === wv.length) { order = L; break; }
    }
    if (!order) {
        // 老老档 n+4：index, durations, clamp, seg_1..seg_n, num_segments
        const oldN = wv.length - 4;
        if (oldN < 1 || wv.length >= 69) return;
        order = ["index", "durations", "clamp"]
            .concat(Array.from({ length: oldN }, (_, i) => `seg_${i + 1}`))
            .concat(["num_segments"]);
    }
    let fixed = 0;
    for (let i = 0; i < order.length && i < wv.length; i++) {
        const w = findWidget(node, order[i]);
        if (!w) continue;
        const v = wv[i];
        if (v === undefined || v === null) continue;
        if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") continue;
        if (w.value !== v) {
            w.value = v;
            if (w.inputEl) w.inputEl.value = v;
            fixed++;
        }
    }
    if (fixed) console.log(`[XiaoHei-SegTable] 旧存档按运行序修正 ${fixed} 个 widget 值（数组档长度 ${wv.length}）`);
}

/**  2026-10-16：Vue 前端默认按**位置**恢复 widget 值 —— settingStore 源码实证：
 *    getRestoredWidgetValue 在 `namedValuesRestore=false`（该设置默认关）时走
 *    `positional[i]` 分支，只有开设置或节点带 fallbackWidgetsValuesNames 才按名字恢复。
 *  而我们的 JS 重排（reorderWidgets）会改变 widgets_values 数组的**存盘顺序**
 *  （serialiseWidgetValues 按 this.widgets 现序写 positional 数组）⇒ 位置恢复必然错位。
 *  好在存档里必有 widgets_values_named（serialiseWidgetValues 同时写两份），
 *  这里在 base configure 之后按**名字**修正一遍，重排才敢做。
 *  旧数组存档没有名字表 ⇒ 跳过（那种存档的存盘顺序本就是声明序，位置恢复是对的）。 */
function applyNamedWidgetValues(node, info) {
    const named = info && info.widgets_values_named;
    if (!named || typeof named !== "object") return;
    for (const w of node.widgets || []) {
        if (!w || !w.name || w.serialize === false) continue;
        if (!Object.hasOwn(named, w.name)) continue;
        const v = named[w.name];
        if (v === undefined || v === null) continue;
        if (w.value !== v) {
            w.value = v;
            if (w.inputEl) w.inputEl.value = v;
        }
    }
}

/** 旧存档没有 input_mode 字段：哪种填法有数据就按哪种打开（全新节点 → 逐段填写）。
 *  新存档（info.widgets_values_named 带 input_mode 键）按存的值来，不插手。
 *   2026-10-22：默认模式改成「逐段填写」后，这里原本的「什么都没有 → 批量粘贴」
 *     会把新默认覆盖掉（onConfigure 也会走到这里）⇒ 兜底统一改成「逐段填写」；
 *     老档行为不变：durations 里有内容 → 仍按批量打开（那是老档自己填的数据）。
 *   2026-10-16：判据必须用 onConfigure 的 info —— Vue 前端从不给 node.widgets_values
 *     赋值（settingStore 里只写 info.widgets_values）⇒ 读 node.widgets_values 恒 undefined。
 *   调用时机：必须在 applyNamedWidgetValues / applyLegacyPositional **之后**，
 *     否则读到的是 base configure 错位恢复的污染值（durations 里躺着 seg_2 的数字）。 */
function smartDefaultInputMode(node, info) {
    const named = info && info.widgets_values_named;
    if (named && typeof named === "object" && Object.hasOwn(named, "input_mode")) {
        setInputMode(node, !!named.input_mode);   // 新存档：按存的值来
        return;
    }
    const dur = findWidget(node, "durations");
    if (dur && String(dur.value == null ? "" : dur.value).trim()) { setInputMode(node, false); return; }
    let anySeg = false;
    for (const w of node.widgets || []) {
        if (w && isSegName(w.name) && Number(w.value) > 0) { anySeg = true; break; }
    }
    setInputMode(node, anySeg);   // 有分段数据 → 逐段填写；什么都没有 → 逐段填写（2026-10-22 新默认）
}

/** 布局重排（2026-10-16）：段数 / 自循环 / 越界自动钳制 置顶，动态段框与批量框沉到下面。
 *  只动 node.widgets 数组顺序（Array.sort 稳定，widget 对象本身不动）；
 *  存档按 widget 名字写（widgets_values_named），重排不影响读写；Python 声明顺序未改，
 *  旧 position 数组在 base configure 阶段就按声明序映射完了，重排发生在其后。 */
//  2026-10-21：段数 / 单位 / 当前编辑第几段 / 界面 四个开关置顶
//    （都是「改一下界面就变」的控件，放一起）。
//  frame_rule（帧数规矩）2026-10-21 深夜已删：分段表只吐原始值，合法化交下游。
//    段框区 rank：start_i 必须排在 seg_i **前面**（跳接模式「起始在上、时长在下」，
//    时间逻辑：先从哪开始、再有多长；连续模式只显 seg_N、批量模式没有段框，都不受影响）。
const SEG_TOP_ORDER = ["xh_segtable_bar", "index", "unit", "num_segments", "xh_preset_chips", "preset_edit", "ui_mode", "all_segments", "clamp"];  // 2026-10-21：单位(秒/帧)提到索引正下方；段标签条顶替 preset_edit 的位置
function reorderWidgets(node) {
    if (!node || !Array.isArray(node.widgets)) return;
    const rank = (name) => {
        const i = SEG_TOP_ORDER.indexOf(name);
        if (i >= 0) return i;
        const m = /^(seg|start)_(\d+)$/.exec(name || "");
        if (m) {
            const idx = Number(m[2]) * 2;
            return SEG_TOP_ORDER.length + idx + (m[1] === "start" ? 0 : 1);
        }
        const mx = /^xh_(seg|start)_(\d+)$/.exec(name || "");
        if (mx) {
            const idx = Number(mx[2]) * 2;
            return SEG_TOP_ORDER.length + idx + (mx[1] === "start" ? 0.5 : 1.5);
        }
        return SEG_TOP_ORDER.length;
    };
    node.widgets.sort((a, b) => rank(a && a.name) - rank(b && b.name));
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

/** 按当前模式显隐两种输入法（durations ⇄ seg_N）。
 *  隐藏用与 applySlotVisibility 里 seg 框同款的三保险：computeSize=[0,-4]（画布模式）
 *  + w.hidden（逻辑）+ element.display=none（DOM）；computeLayoutSize 一并撤掉，
 *  免得隐藏的多行框在 Vue 网格里继续占一行 auto。 */
// ---------------------------------------------------------------- 段框 = 家族滑块（2026-10-21 晚，用户定：滑块 + 上下三角微调 都要）
// 每个 seg_N / start_N 仍是后端读值的**数据载体**（名字不变、存档键不变），
// 但前端把它的可视改成「家族统一滑块」（web/xh_ui_kit.js 的 makeXHSlider）：
//   横向拖拽条 + 右侧数字框（浏览器原生 ▲▼ 三角微调 = 用户要的「上下三角箭头」）。
//   与 XiaoHei-滑块 同一套实现、同一套皮肤 —— 家族只有一种滑块。
// 数据载体本体永远视觉隐藏（w.hidden + element display:none，存档照常）；
// 真正显示的是同名的 DOM widget（serialize:false，不进工作流 JSON）。
//  为什么不用官方 "display":"slider"：那个变体数字框写死 64px、且不暴露 ±钮，
//   硬塞 ± 必翻车（2026-10-22 已实证）。自制 DOM 控件走 addDOMWidget，宽度我们说了算，零遮挡零溢出。

/** 读帧率（起始时间码「分:秒:帧」换算用）；读不到 / 非法值一律按 24。 */
function fpsOf(node) {
    const w = findWidget(node, "fps");
    const v = Number(w && w.value);
    return Number.isFinite(v) && v >= 1 ? Math.round(v) : 24;
}

/** 时间轴总览（常驻）：一条轴铺满「总时长」，**所有段同屏**，每段一个独立颜色。
 *  用户要的核心：切到第几段都能看见全局，改任何一段的值，那段色块立刻跟着动。 */
function ensureOverviewBar(node) {
    if (PLAIN_NATIVE) return null;   // 2026-10-28 终版：不用时间轴了，轴不建
    if (!node || !node.widgets) return null;
    if (node._xh_ov && node._xh_ov.widget && node.widgets.indexOf(node._xh_ov.widget) >= 0) return node._xh_ov;
    let bar = null;
    try {
        const tw = findWidget(node, "total_len");
        bar = makeXHTimelineOverview({
            total: Math.max(1, Number(tw && tw.value) || 600),
            fps: fpsOf(node), frames: isFramesUnit(node), segs: [],
            // 轴上拖动 ⇒ 写回对应段的 start_N / seg_N，并同步它们的小控件显示
            onSegChange: (i, s, l) => {
                try {
                    const n = i + 1;
                    const stw = findWidget(node, "start_" + n);
                    const sw = findWidget(node, "seg_" + n);
                    if (stw) { stw.value = s; if (stw.inputEl) stw.inputEl.value = String(s); }
                    if (sw) { sw.value = l; if (sw.inputEl) sw.inputEl.value = String(l); }
                    const store = node._xh_seg_sliders || {};
                    const sd1 = store["start_" + n], sd2 = store["seg_" + n];
                    if (sd1 && sd1.sl && typeof sd1.sl.set === "function") sd1.sl.set(s, 0);
                    if (sd2 && sd2.sl && typeof sd2.sl.set === "function") sd2.sl.set(l, 0);
                } catch (e) {}
            },
            // 点某段 ⇒ 跳接模式下把「当前编辑第几段」切过去（所见即所编辑）
            onSelect: (i) => {
                try {
                    if (readUiMode(node) !== UI_FULL) return;
                    const pw = findWidget(node, "preset_edit");
                    if (!pw) return;
                    const v = i + 1;
                    if (Number(pw.value) === v) return;
                    pw.value = v;
                    if (pw.inputEl) pw.inputEl.value = String(v);
                    refreshSegSliders(node);
                } catch (e) {}
            },
        });
    } catch (e) { return null; }
    let widget = null;
    try {
        widget = node.addDOMWidget("xh_overview", "custom", bar.root, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => 56, getHeight: () => 56,
        });
    } catch (e) { return null; }
    lockDomWidgetHeight(widget, () => 56);
    if (widget && widget.element) widget.element.style.marginTop = "2px";
    // 摆在「总时长」正下方（填完总时长，轴就在下面）
    try {
        const tw = findWidget(node, "total_len");
        const i = tw ? node.widgets.indexOf(tw) : -1;
        const j = node.widgets.indexOf(widget);
        if (i >= 0 && j >= 0 && j !== i + 1) { node.widgets.splice(j, 1); node.widgets.splice(i + 1, 0, widget); }
    } catch (e) {}
    node._xh_ov = { widget: widget, bar: bar };
    return node._xh_ov;
}

/** 切单位（秒 ⇄ 帧）⇒ 「总时长」按 fps 换算，并把上限压到该单位口径（秒 3600 / 帧 86400）。
 *  不换算的话：秒模式填 600 切成帧还是 600 帧（= 25 秒），轴会短得离谱。 */
function applyTotalLenUnit(node, frames) {
    try {
        const w = findWidget(node, "total_len");
        if (!w) return;
        const fps = Math.max(1, fpsOf(node));
        const cur = Number(w.value) || 0;
        const nv = frames ? Math.round(cur * fps) : Math.round(cur / fps);
        w.value = Math.max(1, nv);
        if (w.inputEl) w.inputEl.value = String(w.value);
        if (w.options) w.options.max = frames ? 86400 : 3600;
    } catch (e) {}
}

/** 把节点上各段的真实值同步到总览轴（量程 = total_len）。 */
function syncOverview(node) {
    if (!node || !node.widgets) return;
    const ov = ensureOverviewBar(node);
    if (!ov || !ov.bar) return;
    try {
        const slots = readSlotsFromNode(node);
        //  连续模式下后端是**累加**算起始的（segment_table.py：start[i] = 前几段时长之和），
        //    start_N 框里的值根本不作数 ⇒ 照它读会把 8 段全画在 0 位置重叠成一坨。
        //    ⇒ 连续模式按累加值画（与后端同一算法），跳接模式才读 start_N。
        const uiFull = readUiMode(node) === UI_FULL;
        const segs = [];
        let acc = 0;
        for (let i = 1; i <= slots; i++) {
            const sw = findWidget(node, "seg_" + i);
            if (!sw) continue;
            const l = Math.max(0, Number(sw.value) || 0);
            const stw = findWidget(node, "start_" + i);
            const s = uiFull ? Math.max(0, Number(stw && stw.value) || 0) : acc;
            segs.push({ s: s, l: l });
            acc += l;
        }
        const tw = findWidget(node, "total_len");
        ov.bar.set({
            total: Math.max(1, Number(tw && tw.value) || 600),
            frames: isFramesUnit(node), fps: fpsOf(node), segs: segs,
        });
    } catch (e) {}
}

/** 段数变了 ⇒ 整条轴**自动平均分成 N 段**并写回各段（用户明确要的行为）。
 *  末段吃掉余数，保证各段之和 = 总时长。 */
function autoSplitEvenly(node) {
    if (PLAIN_NATIVE) return;   // 2026-10-28 终版：手动填写模式下**绝不自动改用户填的值**
    if (!node || !node.widgets) return;
    try {
        const slots = Math.max(1, readSlotsFromNode(node));
        const tw = findWidget(node, "total_len");
        const total = Math.max(1, Number(tw && tw.value) || 600);
        const per = Math.max(1, Math.floor(total / slots));
        for (let i = 1; i <= slots; i++) {
            const stw = findWidget(node, "start_" + i);
            const sw = findWidget(node, "seg_" + i);
            const s = (i - 1) * per;
            const l = (i === slots) ? Math.max(1, total - s) : per;
            if (stw) { stw.value = s; if (stw.inputEl) stw.inputEl.value = String(s); }
            if (sw) { sw.value = l; if (sw.inputEl) sw.inputEl.value = String(l); }
        }
        const store = node._xh_seg_sliders || {};
        for (let i = 1; i <= slots; i++) {
            const sd1 = store["start_" + i], sd2 = store["seg_" + i];
            const stw = findWidget(node, "start_" + i), sw = findWidget(node, "seg_" + i);
            if (sd1 && sd1.sl && typeof sd1.sl.set === "function" && stw) sd1.sl.set(Number(stw.value) || 0, 0);
            if (sd2 && sd2.sl && typeof sd2.sl.set === "function" && sw) sd2.sl.set(Number(sw.value) || 0, 0);
            syncStartBarLen(node, "seg_" + i);
        }
    } catch (e) {}
}

/** 总时长改了 ⇒ 各段**按比例同步缩放**（缩放后各段之和 = 新总时长）。
 *   不这么做的话：总时长一拉大，各段相对就变小，轴上挤成一排等宽小条，
 *     「哪段长哪段短」完全看不出来（用户反馈「宽度怎么是统一的」）。
 *  · 连续模式：起始按累加重排；跳接模式：起始也按同一比例缩放（保持相对布局）。 */
function scaleSegsToTotal(node) {
    if (PLAIN_NATIVE) return;   // 同上：手动填写模式下不自动缩放用户填的值
    if (!node || !node.widgets) return;
    try {
        const slots = Math.max(1, readSlotsFromNode(node));
        const tw = findWidget(node, "total_len");
        const total = Math.max(1, Number(tw && tw.value) || 600);
        const uiFull = readUiMode(node) === UI_FULL;
        const st = [], ln = [];
        let sum = 0;
        for (let i = 1; i <= slots; i++) {
            const sw = findWidget(node, "seg_" + i);
            const stw = findWidget(node, "start_" + i);
            const l = Math.max(0, Number(sw && sw.value) || 0);
            st.push(Math.max(0, Number(stw && stw.value) || 0));
            ln.push(l);
            sum += l;
        }
        if (sum <= 0) { autoSplitEvenly(node); return; }
        const k = total / sum;
        let acc = 0;
        for (let i = 1; i <= slots; i++) {
            const l = Math.max(1, Math.round(ln[i - 1] * k));
            const s = uiFull ? Math.max(0, Math.round(st[i - 1] * k)) : acc;
            const stw = findWidget(node, "start_" + i), sw = findWidget(node, "seg_" + i);
            if (stw) { stw.value = s; if (stw.inputEl) stw.inputEl.value = String(s); }
            if (sw) { sw.value = l; if (sw.inputEl) sw.inputEl.value = String(l); }
            acc += l;
        }
        // 末段补掉四舍五入的余数 ⇒ 各段之和精确 = 总时长
        const last = findWidget(node, "seg_" + slots);
        if (last) {
            let s2 = 0;
            for (let i = 1; i < slots; i++) {
                const sw = findWidget(node, "seg_" + i);
                s2 += Math.max(0, Number(sw && sw.value) || 0);
            }
            const fix = Math.max(1, total - s2);
            last.value = fix;
            if (last.inputEl) last.inputEl.value = String(fix);
        }
        const store = node._xh_seg_sliders || {};
        for (let i = 1; i <= slots; i++) {
            const sd2 = store["seg_" + i], sw = findWidget(node, "seg_" + i);
            if (sd2 && sd2.sl && typeof sd2.sl.set === "function" && sw) sd2.sl.set(Number(sw.value) || 0, 0);
        }
    } catch (e) {}
}

/** 其他各段的「段头 / 段尾」位置（时间轴吸附用 ⇒ 拖段时自动贴上邻段，不留缝）。
 *  @param excludeName 要排除的 start_N（自己不吸附自己） */
function segSnapPoints(node, excludeName) {
    const out = [];
    try {
        const slots = readSlotsFromNode(node);
        for (let i = 1; i <= slots; i++) {
            const stn = "start_" + i;
            if (stn === excludeName) continue;
            const sw = findWidget(node, "seg_" + i);
            if (!sw) continue;
            const len = Number(sw.value) || 0;
            const tw = findWidget(node, stn);
            out.push((tw ? Number(tw.value) || 0 : 0), (tw ? Number(tw.value) || 0 : 0) + len);
        }
    } catch (e) {}
    return out;
}

/** seg_N（时长）改了 ⇒ 把同一段 start_N 时间轴的色块宽度同步过来（两控件共享一个值）。 */
function syncStartBarLen(node, segName) {
    try {
        const store = node && node._xh_seg_sliders;
        if (!store) return;
        const sd = store[String(segName).replace(/^seg_/, "start_")];
        const sw = findWidget(node, segName);
        if (sd && sd.sl && typeof sd.sl.setLen === "function" && sw) sd.sl.setLen(Number(sw.value) || 0);
    } catch (e) {}
}

/** 段框滑块登记：node._xh_seg_sliders = { "seg_3": {widget, sl, labelEl}, ... }。 */
function ensureSegSliderStore(node) {
    if (node && !node._xh_seg_sliders) node._xh_seg_sliders = {};
    return node && node._xh_seg_sliders;
}

/** 给某个段框（seg_N / start_N）造/取它对应的家族滑块 DOM widget。
 *  数据载体本体（同名 INT）保持隐藏；滑块驱动它的 .value。 */
function ensureSegSlider(node, name) {
    if (PLAIN_NATIVE) return null;   // 2026-10-28 终版：不建任何自建控件，用原生 INT 框（含上下小三角）
    const store = ensureSegSliderStore(node);
    if (!store || !node || !node.widgets) return null;
    if (store[name] && store[name].widget && node.widgets.indexOf(store[name].widget) >= 0) return store[name];
    if (store[name]) {          // 登记里有、但 widget 已被移出 node.widgets ⇒ 丢弃重建（防僵尸行）
        try {
            const ow = store[name].widget;
            const el = ow && (ow.element || ow.el);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (e) {}
        delete store[name];
    }
    const w = findWidget(node, name);
    if (!w) return null;
    const frames = isFramesUnit(node);
    const lim = segLimitOf(name, frames);                 // 时长 / 起始 各一把尺子
    const min = Number((w.options && w.options.min) != null ? w.options.min : 0);
    // 真上限：schema 给的是帧口径（起始 86400 / 时长 600），秒口径由 applySegMaxByUnit 压下
    // ⇒ 取「schema 值 与 当前单位口径」里更小的那个，两条路径（先建框 / 后切单位）都安全。
    const rawMax = Number((w.options && w.options.max) != null ? w.options.max : lim.max);
    const max = Math.min(Number.isFinite(rawMax) ? rawMax : lim.max, lim.max);
    const step = Number((w.options && w.options.step) != null ? w.options.step : 1) || 1;
    const val = Number(w.value) || 0;
    // 写回数据载体（滑块 / 时间码共用一套写回逻辑）
    //  2026-10-29：写回**之前**先按「用户方向」吸附（减号 → 落到上一个合法帧格）。
    //    不这么做的话：滑块写回原值 → 数据载体 callback 里的 snapSegToRule（无方向）
    //    只会**向上**吸附 ⇒ 减号减一格后被弹回原值 ⇒ 「只能加不能减」。
    //    这里带方向吸完，callback 里那次无方向吸附对已合法的值是幂等的（直接返回 false）。
    const onVal = (v, dir) => {
        try {
            let nv = v;
            // 只对「段长 seg_N」做规矩吸附；起始 start_N 是素材位置，不吸附（见后端注释）
            if (!isStartName(name) && dir) {
                try {
                    const rule = readFrameRule(node);
                    if (rule !== RULE_NONE && isFramesUnit(node)) {
                        const cur = Math.round(Number(v) || 0);
                        if (cur > 0) {
                            const snapped = snapFrames(cur, rule, dir);
                            if (snapped !== cur) nv = snapped;
                        }
                    }
                } catch (e) {}
            }
            if (Number(w.value) !== nv) {
                w.value = nv;
                if (w.inputEl) w.inputEl.value = String(nv);
            }
            syncOverview(node);   // 2026-10-28：段值一改，总览轴上那段色块立刻跟着动
        } catch (e) {}
    };
    let sl = null;
    try {
        if (isStartName(name)) {
            //  2026-10-28（第二次重做，用户点名「反人类」）：起始改「时间轴色块」。
            //   上一版「分:秒:帧」三框是把 Resolve 的**读数框**当成了主交互 —— 已被证明难用。
            //   现按业界共识（剪映 / Premiere / DaVinci / ComfyUI 生态节点全一致）：
            //     色块左边=起始、宽度=时长 ⇒ 一屏看见这段在哪、多长；
            //     拖色块=改起始 · 拖两端=改时长 · 点轨道=跳过去 · ←/→=微调 1 帧 · 读数框可打字。
            //   seg_N（时长）仍走滑块：单段最长 62 秒，量级小，滑块没毛病，不动它。
            const segName = name.replace(/^start_/, "seg_");
            const segW = findWidget(node, segName);
            sl = makeXHTimelineBar({
                min: min, max: max,
                value: val,
                lenValue: Number(segW && segW.value) || 1,
                lenMax: segLimitOf(segName, frames).max,
                fps: fpsOf(node), frames: frames,
                segNo: (String(name).match(/\d+/) || [""])[0],
                label: segFieldLabel(window.XH_LANG || "zh", name, frames),
                snapPoints: () => segSnapPoints(node, name),
                onInput: onVal,
                // 拖色块右端改时长 ⇒ 写回 seg_N 数据载体 + 同步时长滑块的显示
                onLenInput: (v) => {
                    try {
                        const sw = findWidget(node, segName);
                        if (sw) {
                            sw.value = v;
                            if (sw.inputEl) sw.inputEl.value = String(v);
                        }
                        const st2 = ensureSegSliderStore(node);
                        const sd2 = st2 && st2[segName];
                        if (sd2 && sd2.sl && typeof sd2.sl.set === "function") sd2.sl.set(v, 0);
                    } catch (e) {}
                },
            });
        } else {
            sl = makeXHSlider({
                // max = 拖拽条**软量程**（手感），hardMax = 数字框真上限（不挡人）
                min: min, max: lim.drag, hardMax: max, step: 1, value: val, decimals: 0,   // 加减每次 ±1（用户定）
                numWidth: 44,       //  2026-10-21 数字框 CSS 默认 74px 太宽（用户点名「太长，缩一半」）
                label: segFieldLabel(window.XH_LANG || "zh", name, frames),
                // 2026-10-28：时长变了 ⇒ 同一段的时间轴色块宽度跟着变（两控件共享一个值）
                //  2026-10-29：把**方向**（+1 增 / -1 减）也传下去 ⇒ 减号能落到上一个合法帧格
                onInput: (v, dir) => { onVal(v, dir); syncStartBarLen(node, name); },
            });
        }
    } catch (e) { return null; }
    let widget = null;
    try {
        widget = node.addDOMWidget("xh_" + name, "custom", sl.root, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => (widget && widget._xh_shown ? 50 : 0),
            getHeight: () => (widget && widget._xh_shown ? 50 : 0),
        });
    } catch (e) { return null; }
        widget._xh_shown = false;
        //  锁高（家族唯一实现）：Vue 行高只看 hasLayoutSize，不撤 computeLayoutSize 就白吃高度
        lockDomWidgetHeight(widget, () => (widget && widget._xh_shown ? 50 : 0));
        if (widget && widget.element) widget.element.style.marginTop = "2px";
    // 数据载体本体：永远视觉隐藏（存档照常生效）
    try {
        w.hidden = true;
        const el = w.element || w.el;
        if (el && el.style) { el.style.display = "none"; el.style.height = "0px"; el.style.overflow = "hidden"; }
    } catch (e) {}
    // 把 DOM widget 插到数据载体后面，保证段框顺序不乱
    try {
        const i = node.widgets.indexOf(w);
        const j = node.widgets.indexOf(widget);
        if (i >= 0 && j > i) { node.widgets.splice(j, 1); node.widgets.splice(i + 1, 0, widget); }
    } catch (e) {}
    //  2026-10-21 深夜（用户反馈「恢复默认在跳接模式下没实现」）：
    //    把滑块实例直接挂在**活的 DOM 控件对象**上（_xh_sl_ref）——
    //    恢复默认要能从 node.widgets 现场抓到"页面上真正显示的那个滑块"。
    //    只信 _xh_seg_sliders 表的话，切模式/读档重建后表里可能指到旧实例 ⇒
    //    值改了、看到的条子纹丝不动，用户视角就是"按钮没反应"。
    try {
        widget._xh_sl_ref = sl;
        widget._xh_seg_name = name;
        // 等宽数字：段号 1 → 10 位数变化时标签宽度不跳，同一列永远对齐
        const lb = sl.row.firstChild;
        if (lb && lb.style) lb.style.fontVariantNumeric = "tabular-nums";
    } catch (e) {}
    store[name] = { widget: widget, sl: sl, labelEl: sl.row.firstChild || null };
    return store[name];
}

/** 显示 / 隐藏某个段框滑块（按可见段框口径）；同时同步值 / 边界 / 文案。 */
function showSegSlider(node, name, show) {
    const w = findWidget(node, name);
    // 2026-10-28 终版：原生模式 ⇒ 直接控制**原生 INT 框**显隐（数字框 + 右侧上下小三角）
    if (PLAIN_NATIVE) {
        if (!w) return;
        try {
            const frames = isFramesUnit(node);
            const lim = segLimitOf(name, frames);
            const rawMax = Number((w.options && w.options.max) != null ? w.options.max : lim.max);
            const max = Math.min(Number.isFinite(rawMax) ? rawMax : lim.max, lim.max);
            if (w.options) w.options.max = max;         // 秒/帧口径的上限照旧由 applySegMaxByUnit 压
            // 中文标签：原生控件画的是 w.label || w.name，不设就显示 "seg_1"
            try { w.label = segFieldLabel(window.XH_LANG || "zh", name, frames); } catch (e) {}
            w.hidden = !show;
            const el = w.element || w.el;
            if (el && el.style) el.style.display = show ? "" : "none";
        } catch (e) {}
        return;
    }
    const sd = ensureSegSlider(node, name);
    if (!sd || !sd.widget) return;
    try {
        sd.widget._xh_shown = show;
        sd.widget.hidden = !show;
        const el = sd.widget.element || sd.widget.el;
        if (el && el.style) el.style.display = show ? "" : "none";
    } catch (e) {}
    if (show && w) {
        try {
            const frames = isFramesUnit(node);
            const lim = segLimitOf(name, frames);
            const rawMax = Number((w.options && w.options.max) != null ? w.options.max : lim.max);
            const max = Math.min(Number.isFinite(rawMax) ? rawMax : lim.max, lim.max);
            // 拖拽条软量程 / 数字框硬上限分开同步（hardMax 补丁；旧实例无 setMaxes 时退回同值）
            if (typeof sd.sl.setMaxes === "function") sd.sl.setMaxes(lim.drag, max);
            else { sd.sl.range.max = String(max); sd.sl.numBox.max = String(max); }
            // 2026-10-28：起始时间码跟着单位 / 帧率重算（秒 = 分:秒 两框，帧 = 分:秒:帧 三框）
            if (typeof sd.sl.setMode === "function") sd.sl.setMode(frames, fpsOf(node));
            sd.sl.set(Number(w.value) || 0, 0);
            // 2026-10-28：时间轴色块（起始控件）的宽度 = 同段时长，切单位 / 刷新时都要重同步
            try {
                if (isStartName(name)) {
                    const sn = name.replace(/^start_/, "seg_");
                    const sw = findWidget(node, sn);
                    if (typeof sd.sl.setLenMax === "function") sd.sl.setLenMax(segLimitOf(sn, frames).max);
                    if (sw && typeof sd.sl.setLen === "function") sd.sl.setLen(Number(sw.value) || 0);
                } else {
                    syncStartBarLen(node, name);
                }
            } catch (e) {}
            if (sd.labelEl) sd.labelEl.textContent = segFieldLabel(window.XH_LANG || "zh", name, frames);
        } catch (e) {}
    }
}

/** 段框滑块统一刷新：按「段数 / 当前编辑段 / 模式 / 输入方式」口径，
 *  决定每个 seg_N / start_N 是否显示，并同步值、边界、文案。 */
function refreshSegSliders(node) {
    if (!node || !node.widgets) return;
    //  2026-10-29：初始化「段长记账」（用来判断用户是加还是减）。
    //    官方原生 INT 框的 ± 是 canvas 自绘的，两套画布模式都拿不到 ± 方向 ⇒ 自己记账。
    //    只在「还没记过」时记（别覆盖用户已经改过的值）。
    try {
        const st = segLastStore(node);
        if (st) {
            for (let i = 1; i <= MAX_SLOTS; i++) {
                const nm = "seg_" + i;
                if (st[nm] == null) {
                    const w = findWidget(node, nm);
                    const v = w ? Math.round(Number(w.value) || 0) : 0;
                    if (v > 0) st[nm] = v;
                }
            }
        }
    } catch (e) {}
    // 2026-10-28：帧率 / 总时长 / 段数 改动 ⇒ 时间轴要跟着重算（只绑一次，避免重复套回调）
    const bindOnce = (name, after) => {
        try {
            const w = findWidget(node, name);
            if (!w) return;
            const k = "_xh_bound_" + name;
            if (w[k]) return;
            w[k] = true;
            const _orig = w.callback;
            w.callback = (v) => {
                try { if (typeof _orig === "function") _orig(v); } catch (e) {}
                try { after(v); } catch (e) {}
            };
        } catch (e) {}
    };
    //  双保险：ComfyUI 的 widget.callback 不一定每次改值都触发（不同版本行为不一），
    //    出现过「段数填 6，轴画 6 段、但段按钮只画出 1 个」的错位。
    //    ⇒ 直接监听段数输入框：input = 实时重画（轴 + 段按钮），change = 确认后自动平均分。
    try {
        const nw = findWidget(node, "num_segments");
        const ie = nw && nw.inputEl;
        if (ie && !ie._xh_live_bound) {
            ie._xh_live_bound = true;
            const live = (doSplit) => {
                try {
                    const n = readSlotsFromNode(node);
                    const prev = node._xh_ov_last_slots;
                    node._xh_ov_last_slots = n;
                    if (doSplit && prev != null && prev !== n) autoSplitEvenly(node);
                    refreshSegSliders(node);
                } catch (e) {}
            };
            ie.addEventListener("input", () => live(false));
            ie.addEventListener("change", () => live(true));
        }
    } catch (e) {}
    try {
        //  2026-10-29：fps / total_len 两个控件已从后端摘掉 ⇒ 对应的 bindOnce 一并移除
        //    （findWidget 返回 null，bindOnce 会静默跳过，但留着是误导，删干净）。
        //  帧数规矩吸附：段长一改就吸到合法帧格（只吸「帧」单位 + 规矩 ≠ 不调整）。
        //  2026-10-29：带**方向** —— 减号要落到**上一个**合法帧格，
        //    否则向上吸附会把减掉的值弹回去 ⇒「只能加不能减」（用户当面报的）。
        //    方向从「记账」判断（官方原生 INT 框的 ± 是 canvas 自绘，拿不到 ± 方向）：
        //    记账 = 上一次**确定**的值；新值比它大 ⇒ 增，比它小 ⇒ 减。
        for (let i = 1; i <= MAX_SLOTS; i++) {
            bindOnce("seg_" + i, (v) => {
                const segName = "seg_" + i;
                const st = segLastStore(node);
                const last = st ? Number(st[segName]) : NaN;
                const nv = Math.round(Number(v) || 0);
                let dir = 0;
                if (Number.isFinite(last) && Number.isFinite(nv)) dir = nv > last ? 1 : (nv < last ? -1 : 0);
                // 方向判定要在吸附**之前**拿「用户点完 ± 后的原值」，
                // 而 w.value 此刻已是原值 ⇒ 用它跟记账比。
                if (snapSegToRule(node, i, dir)) {
                    // 吸附完成 ⇒ 更新记账（下次加减就能正确判方向）
                    const ww = findWidget(node, segName);
                    if (ww) segLastRemember(node, segName, ww.value);
                    refreshSegSliders(node);
                } else {
                    // 没吸附（值已合法 / 没规矩 / 秒单位）⇒ 记账同步为当前值
                    if (nv > 0) segLastRemember(node, segName, nv);
                }
            });
        }
        bindOnce("frame_rule", () => {
            //  防误伤（与下面 num_segments 同款坑）：读档 / 初始化时 ComfyUI 也会走 callback，
            //    那时若立刻全量吸附，就会**改掉老工作流里手工调好的段值** ⇒ 首次只记录、不吸附。
            const cur = readFrameRule(node);
            const prev = node._xh_last_rule;
            node._xh_last_rule = cur;
            if (prev == null || prev === cur) return;
            if (snapAllSegsToRule(node) > 0) refreshSegSliders(node);
        });
        bindOnce("num_segments", () => {
            //  防误伤：读档 / 初始化时 ComfyUI 也会走 callback，
            //    那时若平均分就会**覆盖老工作流里手工调好的段值** ⇒ 首次只记录、不重排。
            const n = readSlotsFromNode(node);
            const prev = node._xh_ov_last_slots;
            node._xh_ov_last_slots = n;
            if (prev == null || prev === n) return;
            autoSplitEvenly(node);
            refreshSegSliders(node);
        });
    } catch (e) {}
    const fields = getInputMode(node);
    const slots = readSlotsFromNode(node);
    const uiFull = readUiMode(node) === UI_FULL;
    const cur = readPresetEdit(node);
    // 2026-10-28：单位真的切了（秒 ⇄ 帧）⇒ 总时长换算（首次 / 读档不换算，保住存档值）
    try {
        const fr = isFramesUnit(node);
        if (node._xh_last_frames != null && node._xh_last_frames !== fr) applyTotalLenUnit(node, fr);
        node._xh_last_frames = fr;
    } catch (e) {}
    const names = [];
    for (const w of node.widgets) {
        if (!w || !w.name) continue;
        if (/^(seg|start)_\d+$/.test(w.name)) names.push(w.name);
    }
    for (const name of names) {
        const w = findWidget(node, name);
        if (!w) continue;
        const m = /^(seg|start)_(\d+)$/.exec(name);
        if (!m) continue;
        const idx = Number(m[2]);
        const isStart = m[1] === "start";
        //  2026-10-28：起始（start_N）**不再单独出一块**——用户点名「这一块没必要存在」。
        //    有总览时间轴后，起始就在轴上直接拖 / 点段切换，再单独摆一行是重复且占地方。
        //    start_N 数据载体仍在（后端照读，只是不显示），值由总览轴 onSegChange 写回。
        //  2026-10-28 终版：回到原生填写框后，start_N **必须重新显示出来**——
        //    没有总览轴了，起始只能靠框填。判据回到原始设计：
        //    连续 = 只显示 seg_N（起始自动接续）；跳接 = 只显示当前编辑段的 seg_N + start_N。
        const show = fields && idx <= slots && (uiFull ? idx === cur : !isStart);
        if (!show) {
            //  2026-10-21 懒创建：不显示的段框**不建** DOM 滑块。
            //    之前给全部 64 段 ×2 都 addDOMWidget（128 个隐藏 DOM），读档再清空
            //    登记表重建 ⇒ 旧滑块整批变孤儿：多出一行「第 1 段(秒)」僵尸行
            //    （spawn 时单位默认「秒」，标签就卡在秒）+ 一个空白块。只建要显示的。
            const sd = node._xh_seg_sliders && node._xh_seg_sliders[name];
            if (sd) showSegSlider(node, name, false);
            continue;
        }
        showSegSlider(node, name, true);
    }
    // 2026-10-28：段框刷新完 ⇒ 总览轴按最新值重画（常驻，连续 / 跳接都在）
    syncOverview(node);
    //  段数改了必须**重画一遍段标签条**（第1段/第2段…小按钮）。
    //    只靠 showPresetChips 的懒创建，会出现「选了 6 段但只画出 1 个按钮」。
    try { renderPresetChips(node); } catch (e) {}
}

// ---------------------------------------------------------------- 当前编辑段 · 段标签条（2026-10-21 深夜）
// 用户原话：「『当前编辑第几段』这个参数框，我觉得用这种加减不合理。可以参考提示词表里面
//   的那个起跑按键，当我放上去的时候，下面会出现第一段、第二段、第三段这种显示方式」
// ⇒ 把 preset_edit 的 ± 数字框换成**常驻段标签条**：点哪段就编辑哪段，当前段绿底高亮
//   （色值照抄提示词表选段面板 #ffffff / #4a4a4a —— 一眼是同一套东西）。
//   preset_edit 本体退化为隐藏数据载体（名字 / 存档键 / 后端读取全部不变）。
//  只在「跳接」模式显示（连续模式下它本来就多余，跟原 preset_edit 同口径）。

/** 段标签条每行几个：**不写死**，见 presetChipsHeight 按节点宽度实时算 */
/** 单个标签行高（padding 3+3 + line-height 16 + border 2 ≈ 24，留 2px 余量） */
const PRESET_CHIP_ROW_H = 26;

/** 标签条高度 = 行数 × 行高 + 上下留白（段数变化时跟着变）。
 *   行数按**节点实际宽度**算，不写死每行几个：用户拉宽/默认宽度不同时不至于溢出。
 *     每个标签估 54px（"第10段" ≈ 36px 字 + 16 padding + 2 border），gap 6。 */
function presetChipsHeight(node) {
    const n = Math.max(1, Math.min(readSlotsFromNode(node), MAX_SLOTS));
    const nodeW = isSizeLike(node.size) ? Number(node.size[0]) : 0;
    const avail = Math.max(120, (nodeW || 300) - 28);        // 减掉节点左右内边距
    const perRow = Math.max(2, Math.floor((avail + 6) / 60)); // 54 + 6
    return Math.ceil(n / perRow) * PRESET_CHIP_ROW_H + 10;
}

/** 写 preset_edit（走它的 callback ⇒ 界面立刻切到那一段）。 */
function setPresetEdit(node, n) {
    const w = findWidget(node, "preset_edit");
    if (!w) return;
    const v = Math.max(1, Math.min(Math.round(n), readSlotsFromNode(node)));
    if (Number(w.value) !== v) {
        try {
            w.value = v;
            if (w.inputEl) w.inputEl.value = String(v);
            w.callback?.(v);
        } catch (e) {}
    }
    renderPresetChips(node);
}

/** 重绘标签条：数量 = 段数，当前段绿底。段数 / 编辑位 / 语言任一变化都调它。 */
function renderPresetChips(node, lang) {
    const sd = node && node._xh_preset_chips;
    const el = sd && sd.el;
    if (!el) return;
    const n = Math.max(1, Math.min(readSlotsFromNode(node), MAX_SLOTS));
    const cur = readPresetEdit(node);
    const zh = (lang || window.XH_LANG || "zh") === "zh";
    el.innerHTML = "";
    for (let i = 1; i <= n; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = zh ? ("第" + i + "段") : ("Seg " + i);
        const active = i === cur;
        b.style.cssText =
            "padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;" +
            "white-space:nowrap;line-height:16px;font-family:inherit;" +
            "border:1px solid " + (active ? "#8a8a8a" : "#333333") + ";" +
            //  2026-10-29：激活=官方白键 #e8e8e8 ⇒ **必须配深墨字**，写死 #fff 会白底白字。
            "background:" + (active ? "#e8e8e8" : "#252525") + ";color:" + (active ? "#1c1c1c" : "#e8e8e8") + ";";
        b.onmouseenter = () => { if (!active) b.style.background = "#3a3a3a"; };
        b.onmouseleave = () => { if (!active) b.style.background = "#252525"; };
        b.title = zh ? ("编辑第 " + i + " 段的时长 / 起始") : ("Edit segment " + i);
        b.addEventListener("click", (ev) => {
            ev.stopPropagation();
            setPresetEdit(node, i);
            try { growNodeSize(node); compactNodeSize(node); } catch (e) {}
        });
        el.appendChild(b);
    }
    try {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

/** 建（懒创建）段标签条 DOM 控件；已存在且还挂在 node.widgets 里就复用。
 *   复用前必须校验 widget 仍在 node.widgets —— 读档重建过节点时旧 DOM 会变孤儿。 */
function ensurePresetChips(node) {
    if (!node || !node.widgets) return null;
    if (node._xh_preset_chips && node._xh_preset_chips.widget &&
        node.widgets.indexOf(node._xh_preset_chips.widget) >= 0) {
        return node._xh_preset_chips;
    }
    if (node._xh_preset_chips) {   // 清孤儿
        try {
            const ow = node._xh_preset_chips.widget;
            const oel = ow && (ow.element || ow.el);
            if (oel && oel.parentNode) oel.parentNode.removeChild(oel);
        } catch (e) {}
        node._xh_preset_chips = null;
    }
    const el = document.createElement("div");
    el.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 4px;box-sizing:border-box;";
    let widget = null;
    try {
        widget = node.addDOMWidget("xh_preset_chips", "custom", el, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => (widget && widget._xh_shown ? presetChipsHeight(node) : 0),
            getHeight: () => (widget && widget._xh_shown ? presetChipsHeight(node) : 0),
        });
    } catch (e) { return null; }
    widget._xh_shown = false;
    //  锁高（家族唯一实现）：标签条收起时高度必须归 0，否则节点底部留一条空白
    lockDomWidgetHeight(widget, () => (widget && widget._xh_shown ? presetChipsHeight(node) : 0));
    // 插到 preset_edit 前面：本体是隐藏数据载体，标签条顶它的位置
    try {
        const pe = findWidget(node, "preset_edit");
        if (pe) {
            const i = node.widgets.indexOf(pe);
            const j = node.widgets.indexOf(widget);
            if (i >= 0 && j > i) { node.widgets.splice(j, 1); node.widgets.splice(i, 0, widget); }
        }
    } catch (e) {}
    node._xh_preset_chips = { widget: widget, el: el };
    renderPresetChips(node);
    return node._xh_preset_chips;
}

/** 显示 / 隐藏段标签条（跳接模式才显示）。 */
function showPresetChips(node, show) {
    if (!node) return;
    if (!show) {
        const sd = node._xh_preset_chips;
        if (sd && sd.widget) {
            try {
                sd.widget._xh_shown = false;
                sd.widget.hidden = true;
                const el = sd.widget.element || sd.widget.el;
                if (el && el.style) el.style.display = "none";
            } catch (e) {}
        }
        return;
    }
    const sd = ensurePresetChips(node);
    if (!sd || !sd.widget) return;
    try {
        sd.widget._xh_shown = true;
        sd.widget.hidden = false;
        const el = sd.widget.element || sd.widget.el;
        if (el && el.style) el.style.display = "";
    } catch (e) {}
    renderPresetChips(node);
}

function applyMode(node) {
    const fields = getInputMode(node);       // true = 逐段填写
    const dur = findWidget(node, "durations");
    if (dur) {
        const show = !fields;
        if (show) {
            if (dur._xh_seg_mode_hidden) {
                dur._xh_seg_mode_hidden = false;
                if (dur._xh_seg_orig_cs) dur.computeSize = dur._xh_seg_orig_cs;
                else delete dur.computeSize;
                dur.computeLayoutSize = dur._xh_seg_orig_cls;   // 可能是 undefined，照写
            }
        } else {
            if (!dur._xh_seg_mode_hidden) {
                dur._xh_seg_orig_cs = dur.computeSize;
                dur._xh_seg_orig_cls = dur.computeLayoutSize;
                dur._xh_seg_mode_hidden = true;
            }
            const cs = () => [0, -4]; cs._xh_seg = true;
            dur.computeSize = cs;
            //  2026-10-21 Vue Nodes 实测：光 hidden=true + computeSize=[0,-4] 收不干净，
            //    隐藏的 durations 仍按 58px minHeight 占位 ⇒ 两个开关下面多出一块空白。
            //    把 layout 也钉成 0 高（maxHeight:0），行内 min-height 在下面一并清。
            dur.computeLayoutSize = () => ({ minHeight: 0, maxHeight: 0, minWidth: 0, maxWidth: 1e6 });
        }
        dur.hidden = !show;
        if (dur.element) {
            try { dur.element.style.display = show ? "" : "none"; } catch (e) {}
        }
        //  Vue Nodes 下 element 常为 undefined ⇒ 直接压 inputEl 的 display / min-height
        if (dur.inputEl) {
            try {
                dur.inputEl.style.display = show ? "" : "none";
                dur.inputEl.style.minHeight = show ? "58px" : "0px";
            } catch (e) {}
        }
    }
    applySlotVisibility(node);
    applyUiModeAll(node);       // 模式：preset_edit/⇄按钮/ui_mode下拉按存的模式恢复显隐
    if (node._xh_seg_mode_btn) node._xh_seg_mode_btn.textContent = modeBtnText(fields);
    compactNodeSize(node);
    growNodeSize(node);              // 逐段模式内容变高 ⇒ 只长高地跟一次（不压低）
}

/** 点「⇄」：先按**源模式**把数据同步进目标模式，再翻 input_mode，最后重排显隐。 */
function toggleInputMode(node) {
    const srcSlots = readSlotsFromNode(node);   // 切走前段数（切回时兜底，绝不丢）
    const next = !getInputMode(node);
    if (next) syncBulkToFields(node, srcSlots);  // 批量 → 逐段
    else syncFieldsToBulk(node);                // 逐段 → 批量
    setInputMode(node, next);
    applyMode(node);
}

/** 「⇄ 输入方式」按钮（挂在工具条  右边，2026-10-16 取代原「 刷新段数」位置）。 */
function createModeBtn(node) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.busy = "0";
    btn.textContent = modeBtnText(getInputMode(node));
    btn.title = pack().btns.modeTitle;
    btn.style.cssText = `
        background: #3a3a3a;          // 方案 B active 档
        border-color: #4a4a4a;
        color: #e8e8e8;               // 官方 neutral-100（深底上的正文用暖灰，不用纯白）
        border: 1px solid rgba(0,0,0,0.35);
        border-radius: 4px;
        width: auto;
        height: 22px;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        padding: 0 8px;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        white-space: nowrap;
        overflow: hidden;
        pointer-events: auto;
        user-select: none;
        transition: filter 0.15s;
    `;
    btn.onmouseenter = () => { btn.style.filter = "brightness(1.25)"; };
    btn.onmouseleave = () => { btn.style.filter = "none"; };

    btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); }, true);
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        try { toggleInputMode(node); } catch (err) {
            console.error("[XiaoHei-SegTable] 切换输入方式失败:", err);
        }
    });
    return btn;
}

/** 批量粘贴模式下的「真正的自动判断」：粘几行，段数自动变几（300ms 防抖）。
 *  inputEl 是 Vue 挂载后才有的，所以每次 applySlotVisibility 都试着补绑一次（幂等）。 */
function ensureBulkAutoDetect(node) {
    if (getInputMode(node)) return;                 // 逐段模式下文本框休眠，不监听
    const dur = findWidget(node, "durations");
    if (!dur || !dur.inputEl || dur._xh_seg_bulk_bound) return;
    dur._xh_seg_bulk_bound = true;
    dur.inputEl.addEventListener("input", () => {
        clearTimeout(node._xh_seg_bulk_timer);
        node._xh_seg_bulk_timer = setTimeout(() => {
            try {
                if (getInputMode(node)) return;
                const vals = parseDurationsText(dur.value).filter((v) => v > 0);   // 与后端 _collect 对齐：0 = 没填
                if (!vals.length) return;
                const n = Math.max(MIN_SLOTS, Math.min(vals.length, MAX_SLOTS));
                const nw = findWidget(node, "num_segments");
                if (nw && Number(nw.value) !== n) {
                    nw.value = n;
                    if (nw.inputEl) nw.inputEl.value = n;
                    applySlotVisibility(node);      // 段框跟着变（批量模式下不可见，纯同步数值）
                }
            } catch (e) {}
        }, 300);
    });
}

/** inputEl 挂载时机不保证（onNodeCreated/onConfigure 时可能还没渲染）——
 *  补几个延迟档位试绑，ensureBulkAutoDetect 自身幂等，绑过一次就停。 */
function scheduleBulkBind(node) {
    for (const d of [300, 900, 2200]) {
        setTimeout(() => { try { ensureBulkAutoDetect(node); } catch (e) {} }, d);
    }
}

/** 把节点高度收缩到内容实际高度（消掉底部大空白；只收缩不放大）。 */
function compactNodeSize(node) {
    if (!node || node._xh_seg_user_resized) return; // 用户调过 → 一个像素都不动
    const fix = () => {
        try {
            if (node._xh_seg_user_resized) return;
            const cs = node.computeSize ? node.computeSize() : null;
            if (cs && isSizeLike(node.size) && node.size[1] > cs[1]) {
                node._xh_seg_auto_sizing = true;   // 上锁：本次改尺寸不是用户干的，别被 onResize 误判
                node.size[1] = cs[1];              // 只压高度；宽度原样保留
                node._xh_seg_auto_sizing = false;
                node.setDirtyCanvas?.(true, true);
                node.graph?.setDirtyCanvas?.(true, true);
            }
        } catch (e) {}
    };
    fix();
    setTimeout(fix, 200); // DOM 挂载 / 布局稳定后再收一次
}

/** 切到逐段模式时内容变高 ⇒ compactNodeSize「只缩不涨」会把段框截在节点底边外。
 *  这里补一个**只长高不压低**的跟随（同样尊重 _xh_seg_user_resized 护栏）。 */
function growNodeSize(node) {
    if (!node || node._xh_seg_user_resized) return;
    const fix = () => {
        try {
            if (node._xh_seg_user_resized) return;
            const cs = node.computeSize ? node.computeSize() : null;
            if (cs && isSizeLike(node.size) && node.size[1] < cs[1]) {
                node._xh_seg_auto_sizing = true;
                node.size[1] = cs[1];
                node._xh_seg_auto_sizing = false;
                node.setDirtyCanvas?.(true, true);
                node.graph?.setDirtyCanvas?.(true, true);
            }
        } catch (e) {}
    };
    fix();
    setTimeout(fix, 200);
}

// ---------------------------------------------------------------- 非法值兜底
// num_segments / preset_edit 被用户清空后 value 会变成 ""，提交时前端可能弹 INT 转换错误。
// seg_N / start_N 是 FLOAT，清空时也会变成 ""，序列化 / 载入前统一钳回合法值。
const INT_PARAM_NAMES = new Set(["num_segments", "preset_edit"]);

function sanitizeWidgets(node) {
    for (const w of node.widgets || []) {
        if (!w || !w.name) continue;
        const raw = typeof w.value === "string" ? w.value.trim() : w.value;
        const n = Number(raw);
        if (INT_PARAM_NAMES.has(w.name)) {
            if (typeof raw !== "number" && (raw === "" || !Number.isFinite(n))) {
                w.value = w.name === "preset_edit" ? 1 : DEFAULT_SLOTS;
                if (w.inputEl) w.inputEl.value = w.value;
            } else if (typeof w.value === "string") {
                w.value = Math.max(1, Math.min(Math.round(n), MAX_SLOTS));
                if (w.inputEl) w.inputEl.value = w.value;
            }
        } else if (isSegName(w.name) || isStartName(w.name)) {
            //  2026-10-21 深夜：seg_N/start_N 已 INT 化 ⇒ 无论老档存的 600.0 还是
            //    字符串，一律 round 归正（状态干净，不是迁就老档）。
            if (typeof raw !== "number" && (raw === "" || !Number.isFinite(n))) {
                w.value = 0;
                if (w.inputEl) w.inputEl.value = w.value;
            } else if (Number.isFinite(n)) {
                w.value = Math.round(n);
                if (w.inputEl) w.inputEl.value = w.value;
            }
        }
    }
}

/**  通道时代（2026-10-21 只活了两天）存档自愈：
 *  那种存档的 positional 里第 71 位是 fps=24.0，会错安到新控件 start_1 上（= 预设①起点变 24 秒，
 *  静默错位！）；named 里又没有 start_* 键可修正。⇒ 识别出通道时代存档就把 start_N 全部清零、
 *  preset_edit 打回 1。
 *   2026-10-28 修「普通存档被误清零」：原判定把 "fps" 当成通道时代标记键，但**当前节点自己
 *  就有 fps 控件**（时间码换算用），于是任何普通存档的 named 都含 fps ⇒ 被误判成通道时代 ⇒
 *  start_N 全清零、preset_edit 重置成 1（用户报：重启后起始帧归零、当前编辑段被掰回 1）。
 *  ⇒ 判定键收窄到**只有通道时代才有的 ch_ 系列键**（ch_count / ch_1_mode / ch_1_val / …），
 *  这些键当前节点绝不存在，不会再误伤；纯数组档仍按长度 72~86（= 通道时代布局）。 */
function healChannelEraArchive(node, info) {
    let isChannelEra = false;
    const named = info && info.widgets_values_named;
    if (named && typeof named === "object") {
        // 只认通道时代专属的 ch_ 键（当前节点无此键），fps / frame_rule 已回归常规控件，不可再作标记
        isChannelEra = Object.keys(named).some((k) => k.startsWith("ch_"));
    } else if (Array.isArray(info && info.widgets_values)) {
        const L = info.widgets_values.length;
        isChannelEra = L >= 72 && L <= 86;   // 通道时代布局（含 ch_* 控件），当前节点纯数组档为 140，不落入此区间
    }
    if (!isChannelEra) return false;
    let fixed = 0;
    for (const w of node.widgets || []) {
        if (!w || !w.name) continue;
        if (isStartName(w.name) && Number(w.value) !== 0) {
            w.value = 0;
            if (w.inputEl) w.inputEl.value = 0;
            fixed++;
        } else if (w.name === "preset_edit" && Number(w.value) !== 1) {
            w.value = 1;
            if (w.inputEl) w.inputEl.value = 1;
            fixed++;
        }
    }
    if (fixed) console.log(`[XiaoHei-SegTable] 通道时代存档自愈：清零 ${fixed}个 start_N / preset_edit（防 fps=24 错安成起点）`);
    return true;
}

/** 通道时代存档带了 6 条 ch_N 输出口，新后端已缩回 5 口。
 *  只摘「没有线」的多余口（有线的极端情况保留不动，绝不制造悬空 link）。 */
function healOutputs(node) {
    if (!node || !Array.isArray(node.outputs) || node.outputs.length <= 5) return;
    for (let i = node.outputs.length - 1; i >= 5; i--) {
        const o = node.outputs[i];
        const links = o && o.links;
        if (Array.isArray(links) && links.length) continue;   // 有线 ⇒ 不敢摘
        node.outputs.splice(i, 1);
    }
}

//  2026-10-24 重做「状态条永远待运行」（用户点名：跑到第几段毫无反应）。
//   三条通道并行，任何一条通就有反馈：
//   ① 后端自定义事件 xh-segtable/seg —— 准，带真实段号 + 总段数；
//   ② ComfyUI 原生 executing 兜底 —— 自定义事件万一不通，靠「分段表被调用几次」数段号；
//   ③ execution_start —— 一开跑立刻切「运行中…」，不用等轮到分段表。
//   另外：Vue 会重建 DOM，缓存引用可能变游离节点（改了看不见）⇒ 每次更新前 isConnected 校验，
//   断了就从 widget 重新取回来。

/**  2026-10-26 修「段号永远不显示」（用户点名：只看到「运行中…」在闪）。
 *  根因＝**新版前端事件载荷换了位置**（实测 comfyui_frontend_package/static/assets/api-*.js）：
 *    · 服务器自定义事件 → `super.dispatchEvent(new CustomEvent(t.type,{detail:t.data}))`
 *      ⇒ 监听器收到的是 **CustomEvent**，真正的数据在 `event.detail` 里；
 *      旧代码直接读 `d.id` / `d.seg` ⇒ 全是 undefined ⇒ 只画出「● 运行中…」。
 *    · `executing` 事件 → `dispatchCustomEvent('executing', t.data.display_node||t.data.node)`
 *      ⇒ `event.detail` 是**节点 id 字符串本身**，不是 `{node:id}` 对象；
 *      旧代码读 `e.detail.node` ⇒ undefined ⇒ 兜底通道也是死的。
 *    · `execution_start` 等 → `dispatchCustomEvent(t.type, t.data)` ⇒ detail 是对象。
 *  ⇒ 统一用本函数解包：先看 .detail，没有就把事件对象本身当载荷。
 */
function xhSegPayload(ev) {
    if (!ev) return null;
    if (ev.detail !== undefined && ev.detail !== null) return ev.detail;
    return ev;
}

/** 取状态条真正还在页面上的 DOM；被重建过就从 widget 里重新取回。 */
function xhSegLiveEl(n) {
    try {
        let el = n && n._xh_seg_status_el;
        if (el && el.isConnected) return el;
        const w = n && n._xh_seg_status_w;
        const cands = [w && w.element, w && w.inputEl];
        for (const c of cands) {
            if (c && c.isConnected) { n._xh_seg_status_el = c; return c; }
        }
    } catch (e) {}
    return null;
}

/** 呼吸闪动开关（Web Animations，复位时 cancel）。 */
function xhSegBlink(el, on) {
    try {
        if (el._xh_seg_anim) { el._xh_seg_anim.cancel(); el._xh_seg_anim = null; }
        if (!on || typeof el.animate !== "function") return;
        el._xh_seg_anim = el.animate(
            [{ opacity: 1 }, { opacity: 0.42 }, { opacity: 1 }],
            { duration: 900, iterations: Infinity }
        );
    } catch (e) {}
}

/** 统一绘制。seg<=0 = 已开跑但还没轮到本节点；all = 自循环一次性输出全部段。 */
function xhSegPaint(n, seg, total, all, startFrame) {
    const el = xhSegLiveEl(n);
    if (!el) return false;
    const en = (typeof currentLang === "function" && currentLang() === "en");
    el.style.transition = "background-color 0.25s ease";
    el.style.color = "#ffffff";
    if (!seg || seg < 1) {
        el.textContent = en ? "● Running…" : "● 运行中…";
        el.style.backgroundColor = "rgba(52,120,246,0.55)";
        xhSegBlink(el, true);
        return true;
    }
    const t = (total && total > 0) ? total : "?";
    const sfx = (typeof startFrame === "number" && startFrame >= 0)
        ? (en ? (" · from " + startFrame) : (" · 起始 " + startFrame))
        : "";
    if (all) {
        el.textContent = en
            ? ("● All " + t + " segments dispatched")
            : ("● 已一次性输出全部 " + t + " 段");
    } else {
        el.textContent = en
            ? ("● Segment " + seg + " / " + t + " running" + sfx)
            : ("● 正在跑 第 " + seg + " / " + t + " 段" + sfx);
    }
    el.style.backgroundColor = "rgba(39,174,96,0.62)";
    xhSegBlink(el, true);
    n._xh_seg_status_last = seg;
    return true;
}

/** 总段数（给兜底通道用）。 */
function xhSegTotalOf(n) {
    try {
        for (const w of (n && n.widgets) || []) {
            if (w && w.name === "num_segments") {
                const v = Number(w.value);
                if (v > 0) return v;
            }
        }
    } catch (e) {}
    return 0;
}

/** 该分段表是否开了「自循环·跑全部段」：节点只执行 1 次却产出 N 段。
 *  开了就不靠 executing 计数（否则会误显「第 1/N 段」），交给后端 seg 事件显示「全部 N 段」。 */
function xhSegIsAllMode(n) {
    try {
        for (const w of (n && n.widgets) || []) {
            if (w && w.name === "all_segments" && w.value) return true;
        }
    } catch (e) {}
    return false;
}

/** ① 后端自定义事件（真段号）。 */
function xhSegTableOnProgress(ev) {
    try {
        const d = xhSegPayload(ev);            //  2026-10-26：解包 .detail（新版前端）
        if (!d || typeof d !== "object") return;
        const target = parseInt(String(d.id != null ? d.id : ""), 10);   // 2026-10-24: parseInt tolerates '599_2' / '599:1'
        if (!app || !app.graph || !app.graph.nodes) return;
        let hit = false;
        if (target) {
            for (const n of app.graph.nodes) {
                if (!n || parseInt(String(n.id), 10) !== target) continue;
                _xhSegBackendSeen = true;
                xhSegPaint(n, Number(d.seg), Number(d.total), !!d.all, Number(d.start));
                hit = true;
                break;
            }
        }
        // 2026-10-24 兜底：id 对不上（循环体 id 变形 / 子图）就广播——
        //    画布上一般只有一个分段表，宁可在唯一的那个上显示真段号，也别干等「运行中…」
        if (!hit) {
            for (const n of app.graph.nodes) {
                if (!n || !n._xh_seg_status_w) continue;
                _xhSegBackendSeen = true;
                xhSegPaint(n, Number(d.seg), Number(d.total), !!d.all, Number(d.start));
            }
        }
    } catch (e) {
        console.warn("[XiaoHei-分段表] 段进度处理出错:", e);
    }
}

/** ② 原生 executing 兜底：分段表每执行一次 = 取一段。 */
function xhSegOnExecuting(ev) {
    try {
        //  2026-10-26：新版前端 executing 的 detail 是**节点 id 字符串**（display_node||node），
        //    不是 {node:id} 对象；老版才是对象。两种都认。
        const d = xhSegPayload(ev);
        let nid = d;
        if (d && typeof d === "object" && !Array.isArray(d)) {
            nid = (d.node !== undefined && d.node !== null) ? d.node
                : ((d.display_node !== undefined && d.display_node !== null) ? d.display_node : null);
        }
        if (nid === undefined || nid === null || nid === "") return;
        //  2026-10-26 修复：不再被「后端已报过段号」锁死 —— 循环体内 2/3/4 段靠 executing 计数照样驱动。
        if (!app || !app.graph || !app.graph.nodes) return;
        const t = parseInt(String(nid), 10);   // 2026-10-24: same as above, tolerate loop-body suffix
        if (!Number.isFinite(t)) return;
        for (const n of app.graph.nodes) {
            if (!n || Number(n.id) !== t || !n._xh_seg_status_w) continue;
            if (xhSegIsAllMode(n)) return;   // 自循环一次性输出全部段：交给后端 seg 事件显示「全部 N 段」
            const total = xhSegTotalOf(n);
            _xhSegRunCount = _xhSegRunCount + 1;
            if (total > 0) _xhSegRunCount = Math.min(_xhSegRunCount, total);
            xhSegPaint(n, _xhSegRunCount, total);
            return;
        }
    } catch (e) {}
}

/** ③ 开跑即亮。 */
function xhSegOnExecutionStart() {
    _xhSegBackendSeen = false;
    _xhSegRunCount = 0;
    try {
        for (const n of ((app && app.graph && app.graph.nodes) || [])) {
            if (n && n._xh_seg_status_w) xhSegPaint(n, 0, 0);
        }
    } catch (e) {}
}
//  2026-10-23 修复「待运行永远不动」（用户点名）：
//   `window.comfyAPI.api` **不是** ComfyApi 实例，只是个命名空间壳（没有 addEventListener）。
//   原来那行直接拿壳去挂监听 ⇒ 抛 TypeError 被 try 吞掉 ⇒ 事件一次都没订阅 ⇒ 状态条永远是「待运行」。
//   真实例在这几扇门后面：comfyAPI.api.api / comfyAPI.app.app.api / app.api（同坑注释见 web/xh_about.js 的 _api()）。
//   另外补：跑完 / 报错 / 中断时把状态条复位回「待运行」，不然会一直停在「正在跑 第 N/N 段」。
let _xhSegApiBound = null;
let _xhSegBackendSeen = false;   // 本次运行后端有没有报过真段号
let _xhSegRunCount = 0;          // 兜底计数：本次运行分段表被执行了几次

function xhSegApi() {
    const cands = [
        (typeof window !== "undefined" && window.app) ? window.app.api : null,
        window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api,
        window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app && window.comfyAPI.app.app.api,
        app && app.api,
    ];
    for (const c of cands) {
        if (c && typeof c.addEventListener === "function") return c;
    }
    return null;
}

/** 把所有分段表节点的状态条复位成「待运行 / Idle」。 */
function resetSegStatus() {
    _xhSegBackendSeen = false;
    _xhSegRunCount = 0;
    try {
        const nodes = (app && app.graph && app.graph.nodes) || [];
        for (const n of nodes) {
            const el = xhSegLiveEl(n);
            if (!el) continue;
            xhSegBlink(el, false);
            el.textContent = (typeof currentLang === "function" && currentLang() === "en") ? "Idle" : "待运行";
            el.style.backgroundColor = "#252525";
            el.style.color = "#e8e8e8";
            n._xh_seg_status_last = 0;
        }
    } catch (e) {}
}

/** 挂监听；api 还没就绪就返回 false，由 setup() 的轮询重试。 */
function bindSegProgress() {
    const api = xhSegApi();
    if (!api) return false;
    if (_xhSegApiBound === api) return true;
    try {
        api.addEventListener("xh-segtable/seg", xhSegTableOnProgress);
        //  2026-10-24：原生事件兜底（自定义事件万一不通，这两条官方事件一定到）
        api.addEventListener("execution_start", xhSegOnExecutionStart);
        api.addEventListener("executing", xhSegOnExecuting);
        for (const ev of ["execution_success", "execution_error", "execution_interrupted"]) {
            api.addEventListener(ev, () => resetSegStatus());
        }
        _xhSegApiBound = api;
        console.log("[XiaoHei-分段表] 段进度监听已挂上");
        return true;
    } catch (e) {
        console.warn("[XiaoHei-分段表] 段进度监听挂载失败:", e);
        return false;
    }
}
bindSegProgress();

app.registerExtension({
    name: "XH.SegmentTable",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        installResetHotkey();          // 全局快捷键 R（选中本节点⇒恢复默认），只装一次
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                //  2026-10-16：折叠前先记下构造期写进 node.size 的虚高值（实测 1800）——
                //    前端在 createNode 里就按全部 64 行算好尺寸，我们的折叠在它之后才跑。
                const spawnH = isSizeLike(this.size) ? this.size[1] : null;
                this._xh_seg_sliders = {};  // 段框滑块登记（seg_3 → {widget, sl, labelEl}）
                this._xh_preset_chips = null;   // 段标签条登记（懒创建，跳接模式才建）

                //  2026-10-21：实时段状态条（接循环时显示「正在跑 第 X/N 段」+ 段切换闪绿底）
                try {
                    this._xh_seg_status_el = document.createElement("div");
                    const _idle = (typeof currentLang === "function" && currentLang() === "en") ? "Idle" : "待运行";
                    this._xh_seg_status_el.textContent = _idle;
                    this._xh_seg_status_el.style.cssText =
                        "display:flex;align-items:center;justify-content:center;height:26px;" +
                        "font-size:12px;color:#e8e8e8;background:#252525;border-radius:4px;margin:2px 0;";
                    const _sw = this.addDOMWidget("xh_seg_status", "custom", this._xh_seg_status_el,
                        { serialize:false, hideOnZoom:false, getMinHeight:()=>26, getHeight:()=>26 });
                    lockDomWidgetHeight(_sw, 26);
                    this._xh_seg_status_w = _sw;
                    this._xh_seg_status_last = 0;
                } catch (e) {}
                const modeBtn = createModeBtn(this);
                const layoutBtn = createLayoutBtn(this);
                const resetBtn = createResetBtn(this);
                const minimalBtn = createMinimalBtn(this);   // 2026-10-28：极简 ⇄ 完整（默认极简）
                const gearBtn = createGearBtn(this);   //  折叠/展开参数（家族统一齿轮，工具条最左）
                //  2026-10-22 用户定：「模式」按钮排到「⇄ 逐段填写」**左边**——
                //    模式决定"填法长什么样"（连续/跳接），先选模式再选输入方式，顺序才合逻辑。
                //     只改前端显示顺序，后端 INPUT_TYPES 声明一字不动（widgets_values 数组顺序不受影响）。
                // 标准工具条（中/EN + ）—— 家族唯一实现见 web/xh_ui_kit.js
                //    按家族规范排最左（prependNodes）： · 中 ·  · 模式 · ⇄逐段填写 · 恢复默认(R)
                const { bar, langBtn, colorBtn } = makeXHToolbar(this, { widgetName: "xh_segtable_bar", prependNodes: [gearBtn], appendNodes: [minimalBtn, layoutBtn, modeBtn, resetBtn] });
                this._xh_seg_minimal_btn = minimalBtn;
                this._xh_seg_lang_btn = langBtn;
                this._xh_seg_color_btn = colorBtn;
                this._xh_seg_mode_btn = modeBtn;
                this._xh_seg_layout_btn = layoutBtn;
                this._xh_seg_reset_btn = resetBtn;
                this._xh_seg_gear_btn = gearBtn;
                this.XH_resetSegDefaults = () => resetSegDefaults(this);

                applyLang(this);
                bindSlotAutoApply(this);
                bindPresetEdit(this);
                bindUnitApply(this);               // 单位：切秒/帧刷文案
                bindSegRoundApply(this);           // 帧单位下段框/起始框输入即取整
                bindUiModeApply(this);             // 模式：连续 ⇄ 跳接
                reorderWidgets(this);              // 段数/单位/当前编辑/界面/自循环/钳制置顶，段框沉底
                applySlotVisibility(this);         // 先装 durations 58px 紧凑，applyMode 隐藏时才能存对原函数
                applyMode(this);                   // 初始显隐（新节点默认批量粘贴）
                applyUnitVisibility(this);         // 段框步进/显示按存的单位恢复
                applySegMaxByUnit(this);            // 2026-10-22：上限随单位（新节点默认秒 → 30）
                applyUiModeAll(this);              // 模式：preset_edit/⇄按钮/ui_mode下拉按存的模式恢复显隐
                applyMinimalMode(this);            // 2026-10-28：默认极简（次要参数收起，值不变）
                // 2026-10-28 终版：给原生段框套上中文标签（否则显示 "seg_1"）+ 按单位的上限
                try { refreshSegSliders(this); } catch (e) {}
                // 读档（onConfigure）可能重建控件 ⇒ 晚一拍再钉一次，防隐藏状态被冲掉
                setTimeout(() => { try { applyMinimalMode(this); } catch (e) {} }, 400);
                compactNodeSize(this);             // 新节点收紧一次
                scheduleBulkBind(this);            // 挂载后补绑「粘几行→段数变几」
                //  2026-10-28 兜底：段数（num_segments）增减偶发不刷新段框/段按钮（增减不对称）。
                //    轻量轮询检测段数变化 ⇒ 变化即同步段框显隐 + 段按钮数量。开销极低（仅读一个控件值）。
                try {
                    let _lastSlots = readSlotsFromNode(this);
                    const _iv = setInterval(() => {
                        if (this._xh_removed) { clearInterval(_iv); return; }
                        const cur = readSlotsFromNode(this);
                        if (cur !== _lastSlots) {
                            _lastSlots = cur;
                            try {
                                applySlotVisibility(this);   // 段框显隐（末尾调 refreshSegSliders）
                                renderPresetChips(this);     // 段按钮数量同步
                            } catch (e) {}
                        }
                    }, 400);
                    this._xh_slot_poll = _iv;
                } catch (e) {}
                //  2026-10-16 强制收缩（用户截图点名「框太长」）：构造期虚高 + ur 误触发
                //    让 compactNodeSize 永久罢工，这里带 spawnH 护栏直接钉回内容高度。
                forceCompactOnSpawn(this, {
                    maxExcess: 400,
                    spawnSize: spawnH,
                    lockKeys: ["_xh_seg_auto_sizing"],
                    userKeys: ["_xh_seg_user_resized"],
                });
            } catch (e) {
                console.warn("[XiaoHei SegmentTable] 工具栏创建失败:", e);
            }
            return r;
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                if (!this._xh_seg_sliders) this._xh_seg_sliders = {};  // 段框滑块登记（读档**复用**，勿清空：清空会把已建滑块整批变孤儿）
                //  2026-10-16 先修正 widget 值（base configure 已按位置错位恢复完）：
                //    · 有 named（前端存的档）⇒ 按名字修正，天然免疫重排；
                //    · 纯数组档（API/RH 下载的档只有 widgets_values）⇒ 按旧声明序重新解释。
                //    两者互斥：named 存在时 positional 是按重排序存的，不能再按旧声明序解释。
                if (info && info.widgets_values_named) {
                    applyNamedWidgetValues(this, info);
                } else {
                    applyLegacyPositional(this, info && info.widgets_values);
                }
                sanitizeWidgets(this);
                applyLang(this);
                bindSlotAutoApply(this);
                bindPresetEdit(this);              // 改「当前编辑第几段」实时折叠/展开
                bindUnitApply(this);               // 单位开关
                bindSegRoundApply(this);           // 帧单位下段框/起始框输入即取整
                bindUiModeApply(this);             // 界面开关
                healChannelEraArchive(this, info); // 通道时代存档：清零 start_N / preset_edit（防 fps 错安成起点）
                healOutputs(this);                 // 通道时代存档：摘掉多出来的 6 条 ch_N 输出口（无线的才摘）
                //  2026-10-16 旧存档没有 input_mode 字段：哪种填法有数据就按哪种打开
                //    （全新/空存档 → 批量粘贴）。新存档按存的值来。
                smartDefaultInputMode(this, info);
                reorderWidgets(this);        // 段数/单位/当前编辑/界面/自循环/钳制置顶，段框沉底
                applySlotVisibility(this);   // 先装 durations 58px 紧凑，applyMode 隐藏时才能存对原函数
                const savedH = isSizeLike(this.size) ? this.size[1] : 0;
                applyMode(this);             // 读档**不做**数据同步，只按存的模式显隐
                applyUnitVisibility(this);   // 段框步进/显示按存的单位恢复
                applySegMaxByUnit(this);      // 2026-10-22：读档后上限跟存的单位对齐
                applyUiModeAll(this);        // 模式：preset_edit/⇄按钮/ui_mode下拉按存的模式恢复显隐
                //  2026-10-22：齿轮折叠状态跨存档恢复（收着的读档后继续收着）
                try {
                    if (segParamsCollapsed(this)) setSegParamsCollapsed(this, true);
                    if (this._xh_seg_gear_btn && this._xh_seg_gear_btn._xhGearSet) {
                        this._xh_seg_gear_btn._xhGearSet(segParamsCollapsed(this));
                    }
                } catch (e2) {}
                scheduleBulkBind(this);     // 挂载后补绑「粘几行→段数变几」
                //  2026-10-16 两档判定（照 xh_chainprompt.js）：
                //    · 存档高度远超内容（> +150px）⇒ 几乎肯定是 bug 留下的 inflated 尺寸，重开即收回；
                //    · 用户在 +150px 以内手动拖大的仍保留（不动）。
                try {
                    const cs = this.computeSize ? this.computeSize() : null;
                    if (cs && savedH > cs[1] + 150) this._xh_seg_user_resized = false;
                    else if (cs && savedH > cs[1] + 40) this._xh_seg_user_resized = true;
                } catch (e2) {}
                //  2026-10-16 强制收缩（读档路径）：构造期虚高可能在 Vue 挂载后再次写回，
                //    compactNodeSize 收一次不够；spawnH 护栏保证只缩「还等于读档时那个虚高值」的。
                forceCompactOnSpawn(this, {
                    maxExcess: 400,
                    spawnSize: savedH,
                    lockKeys: ["_xh_seg_auto_sizing"],
                    userKeys: ["_xh_seg_user_resized"],
                });
            } catch (e) {}
            return r;
        };

        // 识别用户手动拖拽尺寸
        const origOnResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            const r = origOnResize?.apply(this, arguments);
            try {
                if (!this._xh_seg_auto_sizing) this._xh_seg_user_resized = true;
            } catch (e) {}
            return r;
        };

        // 序列化前把非法值钳回
        const origOnSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (o) {
            try { sanitizeWidgets(this); } catch (e) {}
            return origOnSerialize?.apply(this, arguments) ?? o;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this._xh_removed = true;
            try { if (this._xh_slot_poll) { clearInterval(this._xh_slot_poll); this._xh_slot_poll = null; } } catch (e) {}
            releaseButtons(this);
            return origOnRemoved?.apply(this, arguments);
        };
    },

    async setup() {
        // 语言变更 + 工作流载入重刷 —— 统一走 kit（等价实现，见 web/xh_ui_kit.js）
        onLangChanged(() => applyLangToAll());
        //  2026-10-23：段进度监听兜底重试（模块 import 时 api 实例可能还没就绪）
        if (!bindSegProgress()) {
            let _tries = 0;
            const _iv = setInterval(() => {
                _tries += 1;
                if (bindSegProgress() || _tries > 40) clearInterval(_iv);
            }, 500);
        }
    },
});
