//  XiaoHei 家族自研节点：H3 长镜头·分块改帧传播
//   ① 双语状态行：后端 ui.text 吐 {"zh","en"}，前端按 currentLang() 挑，语言一切换就重绘。
//       只处理界面读数；送进模型的 prompt 一个字不碰。
//   ② 动态锚点：照抄家族 wn_ripple.js / ripple_timeline.mjs 的 Autogrow 算法，
//      默认只露 edited_anchor_1；接上第 N 个才露出第 N+1 个，断开自动收回。
//   ③ 悬浮说明：节点说明 / 输入端口 / 输出端口 / widget 全部按 XiaoHei-LANG 中英双向切换。
//      英文原文是唯一真源，翻译一律走 wnUIFull()，不写死中文，切 EN 能还原。
import { app } from "../../../scripts/app.js";
import { currentLang, onLangChanged, lockDomWidgetHeight, xhDecorateButton } from "../xh_ui_kit.js";
import { repaint } from "../shared/repaint.mjs";
import { wrapText } from "../shared/text_wrap.mjs";
import { wnBiLine, wnUIFull, wnDesc, wnText } from "./xh_wn_i18n.mjs";
import { anchorInputCount } from "./ripple_timeline.mjs";

const NODE_ID = "XH_WN_H3AutoLongRipple";
const ANCHOR_INPUT = /^edited_anchor_(\d+)$/;
const MOUNTED = new Set();
const widgetOf = (node, name) => (node.widgets || []).find((w) => w && w.name === name);
const pick = (item) => wnUIFull(wnBiLine(item, currentLang()), currentLang());
const slotId = (slot) => Number(ANCHOR_INPUT.exec(slot?.name ?? "")?.[1]) || 0;
const L = (en) => wnUIFull(en, currentLang());

// ── 每段时长：按 H3 合法帧格（17k+5 / 24fps）跳档，不再 0.01 假精度 ──────────
//   相邻两档差 17 帧 = 17/24 s；precision/round 必须显式钉死，否则前端会按
//   step 推导出 1 位小数（10.1），把值取整到 0.1 反而破坏档位对齐。
const FPS = 24;
const GRID_STEP = 17 / FPS;
const GRID_OFFSET = 5;
const ROUND_SEC = 0.01;
const TRAIN_MIN = 107;   // frame_number_presets.json：H3 训练窗口约 107~362 帧
const TRAIN_MAX = 362;

/** 与 long_ripple_core.duration_frames() 完全同构：秒数 → 17k+5 合法帧数。 */
function snappedFrames(seconds) {
    const d = Number(seconds);
    if (!Number.isFinite(d) || d <= 0) return GRID_OFFSET;
    return Math.max(GRID_OFFSET,
        GRID_OFFSET + 17 * Math.floor((d * FPS - GRID_OFFSET) / 17 + 0.5));
}

/** 只读提示行：按 currentLang() 现场生成，天然跟随中/EN 开关（动态数字不进词典）。 */
function snapText(node) {
    const S = node.xhSegmentState;
    // 状态行与面板同源：写回 widget 万一被 Vue 覆盖，读数也不会跟面板打架。
    const frames = S?.capF > 0 ? S.capF
                               : snappedFrames(widgetOf(node, "chunk_duration")?.value);
    const secs = (frames / FPS).toFixed(2);
    const outside = frames < TRAIN_MIN || frames > TRAIN_MAX;
    if (S?.dirty) {
        const modeZh = { average: "平均分段", cuts: "按镜头切点", single: "整片一段" }[S.mode];
        const modeEn = { average: "even segments", cuts: "shot cuts", single: "one shot" }[S.mode];
        return T(
            `→ 三层模式：L1 ${modeZh}；镜头超过 ${frames} 帧 · ${secs} 秒就按 H3 帧数上限自动补切`,
            `→ Hierarchical: L1 ${modeEn}; shots over ${frames} frames · ${secs} s `
            + `are auto-split at the H3 frame cap`);
    }
    if (widgetOf(node, "cut_mode")?.value === "manual") {
        return currentLang() === "zh"
            ? `→ 手动分段：段长由镜头切点决定；过长的镜头自动补切，单段上限 ${frames} 帧 · ${secs} 秒`
            : `→ Manual cuts: lengths follow your shot boundaries; long shots auto-split at ${frames} frames · ${secs} s`;
    }
    return currentLang() === "zh"
        ? `→ 实际 ${frames} 帧 · ${secs} 秒${outside ? "（ 训练窗口外）" : ""}`
        : `→ ${frames} frames · ${secs} s${outside ? "   outside trained window" : ""}`;
}

/** 注册期：把 object_info 里的 0.01 步进改成一档。语言切换会重建 nodeData，故每次同步都设。 */
function applyGridSpec(nodeData) {
    const spec = nodeData?.input?.required?.chunk_duration;
    if (!Array.isArray(spec) || !spec[1] || typeof spec[1] !== "object") return;
    spec[1].step = GRID_STEP;
    spec[1].round = ROUND_SEC;
}

/** 实例期：已加载节点/旧工作流的 widget 早建好了，直接改 options 才立即生效。
 *  ComfyUI 前端 number widget：step/step2 管加减，precision 管显示位数，round 管取整。 */
function applyGridStep(node) {
    const w = widgetOf(node, "chunk_duration");
    if (!w) return;
    if (!w.options) w.options = {};
    w.options.step = GRID_STEP;
    w.options.step2 = GRID_STEP;
    w.options.precision = 2;
    w.options.round = ROUND_SEC;
}

// ── 悬浮说明的英文原文（与 long_ripple_node.py 的 tooltip / DESCRIPTION 逐字对齐）──
const NODE_DESC_EN = (
    "Long-take H3 Ripple edit propagation. Splits a long window into legal 17k+5 chunks, carries each edit "
    + "through every chunk, trims the overlap and returns one continuous shot with the source audio. "
    + "This is an XiaoHei original node built on top of WepeNerd's open-source RippleApply chain."
);
const OUTPUT_TT_EN = [
    "One continuous edited shot, trimmed back to the source frame count.",
    "Source audio of the whole window, passed through unchanged.",
    "24.0 fps (H3 grid).",
    "Plain-text chunk plan, one row per segment.",
];
const WIDGET_TT_EN = {
    prompt: "Keep WepeNerd's default propagation prompt.",
    chunk_duration: "Seconds per chunk, snapped to H3's 17k+5 frame grid.",
    overlap_frames: "Requested overlap; rounded DOWN to a legal 17k+5 count.",
    seed: "Base seed; chunk N uses seed + N.",
    chunk_mode: "enable = split into chunks; disable = one single pass.",
    dry_run: "Print the chunk plan only; no model is loaded or sampled.",
    seam_blend: "Cross-fade the overlap frames instead of a hard cut.",
    carry_tail: "Use the previous chunk's last frame as this chunk's frame-0 guide.",
    memory_mode: "How each rendered chunk is held: cpu moves it to RAM, "
        + "lowmem writes into one preallocated RAM buffer, "
        + "disk streams chunks to a temp folder first.",
    //  2026-11-10 三层父子模型（与 long_ripple_node.py 的 tooltip 逐字一致）
    cut_mode: "L1 segment mode: average = equal-length segments, cuts = your own shot "
        + "boundaries in the segment panel, single = one segment for the whole video, "
        + "manual = legacy text syntax (compatibility only).",
    cut_points: "Legacy cut text, superseded by the on-node segment plan panel. "
        + "The panel writes a structured JSON plan here; leave the old "
        + "8.5H, 19.2C:20 syntax untouched to keep legacy behaviour.",
    segment_count: "L1 segment count for average mode; 0 = auto from the H3 frame cap. "
        + "Ignored when the segment plan panel supplies its own count.",
};
const INPUT_TT_EN = {
    model: "H3 diffusion model (UNETLoader, LoRAs already applied).",
    clip: "CLIP text encoder used by Ripple Apply.",
    vae: "VAE used to encode the source window and decode each chunk.",
    ripple: "WN_RIPPLE from the Ripple Clip node: window, markers, geometry and audio.",
    sampler: "Sampler object (for example KSamplerSelect lcm).",
    sigmas: "Sigmas schedule (for example BasicScheduler simple / 6 steps).",
    edited_images: "Edited frames in marker time order. Overrides the edits attached on Ripple Clip.",
};
const anchorTT = (id) =>
    `Exactly one edited image for marker ${id}. Overrides edited_images / uploaded edits.`;

/** 注册期：把 nodeData 里的说明类字段翻成当前语言（只改显示元数据，不动 name/type/value）。 */
function applyDefTooltips(nodeData) {
    if (!nodeData) return;
    const lang = currentLang();
    nodeData.description = wnDesc(NODE_ID, lang, NODE_DESC_EN);
    if (Array.isArray(nodeData.output_tooltips)) {
        nodeData.output_tooltips = OUTPUT_TT_EN.map((en) => wnUIFull(en, lang));
    }
    if (Array.isArray(nodeData.input_tooltips)) {
        const names = [...Object.keys(nodeData.input?.required ?? {}),
                       ...Object.keys(nodeData.input?.optional ?? {})];
        nodeData.input_tooltips = names.map((name, index) => {
            const en = inputTT(name);
            return en ? wnUIFull(en, lang) : nodeData.input_tooltips[index];
        });
    }
    for (const group of ["required", "optional"]) {
        const inputs = nodeData.input?.[group];
        if (!inputs) continue;
        for (const [name, spec] of Object.entries(inputs)) {
            if (!Array.isArray(spec) || !spec[1] || typeof spec[1] !== "object") continue;
            const en = inputTT(name);
            if (en) spec[1].tooltip = wnUIFull(en, lang);
        }
    }
}

function inputTT(name) {
    if (ANCHOR_INPUT.test(name)) return anchorTT(slotId({ name }));
    return INPUT_TT_EN[name] ?? WIDGET_TT_EN[name] ?? null;
}

/** 实例级：画布 hover 读的是 widget.tooltip / slot.tooltip，语言切换时逐个重写。 */
function applyNodeTooltips(node) {
    if (!node) return;
    const lang = currentLang();
    for (const w of node.widgets || []) {
        if (!w || w.name === "wn_long_ripple_messages") continue;
        // 参数标签强制跟随语言：Nodes 2.0 的 DOM 面板会把中文当原文写回，这里兜底重设 label
        const label = wnText("widgets", w.name, lang);
        if (label && w.label !== label) w.label = label;
        const en = WIDGET_TT_EN[w.name];
        if (!en) continue;
        const text = wnUIFull(en, lang);
        if (w.tooltip !== text) w.tooltip = text;
        if (w.options && w.options.tooltip !== text) w.options.tooltip = text;
    }
    for (const slot of node.inputs || []) {
        const en = inputTT(slot?.name ?? "");
        if (!en) continue;
        const text = wnUIFull(en, lang);
        if (slot.tooltip !== text) slot.tooltip = text;
    }
    for (const [index, slot] of (node.outputs || []).entries()) {
        const en = OUTPUT_TT_EN[index];
        if (!en) continue;
        const text = wnUIFull(en, lang);
        if (slot.tooltip !== text) slot.tooltip = text;
    }
    repaint(node);
}

// ── 动态锚点：复用家族 anchorInputCount() 的 Autogrow 规则 ────────────────────
function syncAnchors(node, max) {
    if (!max || !node.inputs) return false;
    const lang = currentLang();
    const anchors = node.inputs
        .map((input, index) => ({ input, index, id: slotId(input) }))
        .filter((entry) => entry.id);
    const connected = anchors.filter((e) => e.input.link != null).map((e) => e.id);
    // 无上游 marker 可推导时 = 已连最大编号 + 1；已连端口永不删除。
    const wanted = anchorInputCount(connected, null, max);
    const kept = new Set(connected), removed = [];
    for (const entry of anchors) {
        if (entry.input.link != null) continue;
        if (entry.id > wanted || kept.has(entry.id)) removed.push(entry.index);
        else kept.add(entry.id);
    }
    for (const index of removed.sort((a, b) => b - a)) node.removeInput(index);
    let changed = removed.length > 0;
    const gone = new Set(removed);
    for (const entry of anchors) {
        if (gone.has(entry.index)) continue;
        const text = wnUIFull(anchorTT(entry.id), lang);
        if (entry.input.tooltip !== text) { entry.input.tooltip = text; changed = true; }
    }
    for (let id = 1; id <= wanted; id++) {
        if (kept.has(id)) continue;
        node.addInput(`edited_anchor_${id}`, "IMAGE",
            { tooltip: wnUIFull(anchorTT(id), lang) });
        changed = true;
    }
    return changed;
}

/** 端口增减时保留用户手动拉高的节点高度（家族 resizeForSlots 同一口径）。 */
function resizeForSlots(node, change) {
    const before = node.computeSize?.()[1] ?? 0;
    if (!change() || !node.size) return;
    const after = node.computeSize?.()[1] ?? 0;
    node.setSize?.([node.size[0], Math.max(after, node.size[1] + after - before)]);
}

// ── 2026-11-10 分段计划：原生 STRING 彻底隐藏 + 纯点击 DOM 按钮面板 ────────────
//    上一版只在 canvas 上盖自绘 draw，Nodes 2.0 的 Vue 根本不认，textarea 原样露着。
//     本版照家族 hideIdColorsWidget / xh_calculator 的实证写法：w.hidden = true 是 Vue
//     唯一认的开关，再挂 node.addDOMWidget 做真正的按钮面板。
//    这是新建节点：默认就是「按镜头切点」逐行点击，没有「启用」「兼容旧语法」状态。
//    cut_points 的 value 仍是结构化 JSON 字符串，后端 parse_spec() 照收，参数契约不动。
const PANEL_ROW_H = 24;
const PANEL_NOTE_H = 26;
const PANEL_MAX_ROWS = 24;
const PANEL_DOM_NAME = "xh_wn_segment_plan";
const LEGACY_CUT = /^(\d+(?:\.\d+)?)([fF])?\s*([HhCc])?\s*(?::\s*(\d+))?$/;
const T = (zh, en) => (currentLang() === "zh" ? zh : en);

// MiniMax H3 单次生成的合法帧数网格：17k+5（5 / 22 / … / 243 / 260 / …）。
// 切点加减一律走这个网格，不再用 0.5 秒（12 帧）这种跟模型无关的人为步长。
const H3_STEP = 17;
const H3_OFFSET = 5;
function snapFrame(frame) {
    const f = Number(frame) || 0;
    return H3_OFFSET + Math.max(0, Math.round((f - H3_OFFSET) / H3_STEP)) * H3_STEP;
}
function stepFrame(frame, dir) {
    const f = Number(frame) || 0;
    const base = H3_OFFSET + Math.round((f - H3_OFFSET) / H3_STEP) * H3_STEP;
    // 首次点击先把任意起点吸附到网格，且保证 + 一定变大、− 一定变小。
    const next = dir > 0 ? (base > f ? base : base + H3_STEP)
                         : (base < f ? base : base - H3_STEP);
    return Math.max(H3_OFFSET, next);
}

function panelDefaults() {
    // capF / blockov 是面板自己的真源：点击只改这里，不再依赖被隐藏数字框的 value 或 callback。
    return { mode: "cuts", count: 0, rows: [], dirty: true, legacy: false,
             capF: 243, blockov: 9 };
}

function readPanelValue(raw, node) {
    const S = panelDefaults();
    if (node) {
        // 首次加载：数值从两个原生 widget 读一次，之后一律以面板状态为准。
        S.capF = capFrames(widgetOf(node, "chunk_duration")?.value);
        S.blockov = Math.max(0, Math.min(240,
            Math.round(Number(widgetOf(node, "overlap_frames")?.value ?? 9))));
    }
    const text = String(raw ?? "").trim();
    if (!text) return S;
    if (text.startsWith("{")) {
        try {
            const d = JSON.parse(text);
            S.mode = ["average", "cuts", "single"].includes(d.mode) ? d.mode : "average";
            S.count = Math.max(0, Math.round(Number(d.count) || 0));
            // 旧存档里可能留着 on/off/chunks：界面已没有开关，一律归一成 auto，
            // 免得一段被看不见的旧设置偷偷强制均分，或状态行冒出假的「不分块」。
            S.rows = (Array.isArray(d.rows) ? d.rows : []).map((r) => ({
                frame: Math.max(1, Math.round(Number(r.frame) || 0)),
                kind: String(r.kind || "C").toUpperCase().startsWith("H") ? "H" : "C",
                overlap: Math.max(0, Math.round(Number(r.overlap) || 0)),
                split: "auto", chunks: 2,
            })).slice(0, PANEL_MAX_ROWS);
            // 块参数随计划一起存档，刷新后不会被 Vue 重建 widget 时的旧值覆盖。
            if (Number.isFinite(Number(d.capF)) && Number(d.capF) > 0)
                S.capF = Math.max(5, Math.min(362, Math.round(Number(d.capF))));
            if (Number.isFinite(Number(d.blockov)))
                S.blockov = Math.max(0, Math.min(240, Math.round(Number(d.blockov))));
            S.dirty = true;
            return S;
        } catch (e) { /* 落到旧语法显示 */ }
    }
    // 旧文本框语法：只显示成结构化行，绝不写回 widget ⇒ 老工作流行为一字不变。
    S.legacy = true;
    S.mode = "cuts";
    for (const part of text.split(/[,;\n\r，；]+/)) {
        const m = LEGACY_CUT.exec(part.replace(/\s+/g, ""));
        if (!m) continue;
        const frame = m[2] ? Math.round(Number(m[1])) : Math.round(Number(m[1]) * FPS);
        if (!(frame > 0)) continue;
        const kind = (m[3] || "C").toUpperCase().startsWith("H") ? "H" : "C";
        S.rows.push({ frame, kind,
            overlap: kind === "H" ? 0 : (m[4] != null ? Number(m[4]) : 9),
            split: "auto", chunks: 2 });
        if (S.rows.length >= PANEL_MAX_ROWS) break;
    }
    return S;
}

// 上一版「canvas 自绘面板」已整段删除：Nodes 2.0 的 Vue 不认 draw，留着只会误导。
// 界面统一走下面的 DOM 按钮面板；高度由 domPanelHeight() 与 lockDomWidgetHeight() 管。

/** 家族实证：Vue(Nodes 2.0) 唯一认的隐藏开关是 w.hidden；只挡 element 是假修。 */
function hideNativeWidget(w) {
    if (!w) return;
    try { w.hidden = true; } catch (e) {}
    try { w.options = w.options || {}; w.options.hidden = true; } catch (e) {}
    try { w.computeSize = () => [0, 0]; } catch (e) {}
    try { w.getMinHeight = () => 0; } catch (e) {}
    try { w.draw = () => {}; } catch (e) {}
    try { w.mouse = () => false; } catch (e) {}
    for (const el of [w.inputEl, w.element, w.el]) {
        if (!el?.style) continue;
        try {
            el.style.display = "none";
            el.style.height = "0px";
            el.style.minHeight = "0px";
            el.style.overflow = "hidden";
        } catch (e) {}
    }
}

/** 被面板接管的参数一律不露脸：文本框 + 三个老下拉 + 两个误导数字框，界面只留按钮面板。
 *  chunk_duration / overlap_frames 的值仍留在 widget.value 里喂后端，由面板格子点一下写回。 */
function hideManagedWidgets(node) {
    for (const name of ["cut_points", "cut_mode", "segment_count", "chunk_mode",
                        "chunk_duration", "overlap_frames"]) {
        hideNativeWidget(widgetOf(node, name));
    }
}

/** L3 块参数层常驻：H3 帧数上限是物理硬约束，任何模式都可能触发补切，
 *  参数不能藏（上一版跟着「分块 关」收起，结果参数看不见、规则照样在跑）。 */
function showBlockParams(S) {
    return true;
}

/** 秒数 → H3 17k+5 帧数（与文件顶部 snappedFrames 同一套网格，面板代码块自包含）。 */
function capFrames(value) {
    const d = Number(value);
    if (!Number.isFinite(d) || d <= 0) return 5;
    return Math.max(5, 5 + 17 * Math.floor((d * FPS - 5) / 17 + 0.5));
}

/** 把面板状态写回被隐藏的原生 widget（后端仍从这两个参数取值）。
 *   全链路容错：Nodes 2.0 的 callback 抛错、Vue 托管 value、DOM 元素重建都不能挡住面板重绘。
 *   刻意不调用 w.callback：上一版 ± 点了没反应就是它抛异常，把整个点击流程掐断了。 */
function writeWidgetValue(node, name, value) {
    const w = widgetOf(node, name);
    if (!w) return;
    try { w.value = value; } catch (e) {}
    if (Number(w.value) !== value && typeof w.setValue === "function") {
        try { w.setValue(value); } catch (e) {}
    }
    for (const el of [w.inputEl, w.element, w.el]) {
        try {
            if (el && typeof el === "object" && "value" in el) el.value = String(value);
        } catch (e) {}
    }
}

function writeBackBlockParams(node, S) {
    writeWidgetValue(node, "chunk_duration", Number((S.capF / FPS).toFixed(4)));
    writeWidgetValue(node, "overlap_frames", S.blockov);
}

function domPanelHeight(S) {
    let h = 6 + 16 + 3 + 20 + 3;                    // padding + 标题 + L1 模式行
    if (S.mode === "cuts") h += 20 + 3 + Math.max(1, S.rows.length) * (PANEL_ROW_H + 3);
    else h += 20 + 3;
    h += PANEL_NOTE_H + 3;                          // 一行人话说明：超长自动补切、无开关
    if (showBlockParams(S)) h += 20 + 3;           // L3 单块上限 / 块间重叠，常驻
    return h + 6;
}

/** 面板结构抽成纯数据：测试桩不依赖 DOM 也能验「按层展开 / 纯点击」。 */
function panelModel(S) {
    const zh = currentLang() === "zh";
    const secs = (S.capF / FPS).toFixed(2);
    return {
        title: zh ? "分段计划 · 点格子修改" : "Segment plan · click a cell",
        showBlocks: showBlockParams(S),
        // 唯一一条规则写成人话，动态数字跟着 L3 参数走；中/EN 现场生成，不进词典。
        note: zh
            ? `镜头超过 ${S.capF} 帧（${secs} 秒）就按 H3 帧数上限自动补切，块间重叠 ${S.blockov} 帧；这是硬约束，没有开关。`
            : `Over ${S.capF}f (${secs} s) auto-split at the H3 cap, ${S.blockov}f block overlap; hard limit, no switch.`,
        modes: [
            ["average", zh ? "平均分段" : "Even"],
            ["cuts", zh ? "按镜头切点" : "Shot cuts"],
            ["single", zh ? "整片一段" : "One shot"],
        ],
        rows: S.rows.map((r, i) => ({
            index: i,
            pos: `${(r.frame / FPS).toFixed(2)}s / ${r.frame}f`,
            kind: r.kind === "H" ? (zh ? "硬切 H" : "Hard H") : (zh ? "连续 C" : "Cont. C"),
            overlap: `${zh ? "重叠" : "ov"} ${r.overlap}`,
            showOverlap: r.kind === "C",
        })),
    };
}

function makeButton(parent, label, opts, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    //  2026-11-13 家族图标统一：＋ / − / 加切点 / 删末个 之类符号按钮统一走家族装饰器，
    //    普通文字按钮（镜头类型 H / S 等）保持原样。
    if (!xhDecorateButton(b, label)) b.textContent = label;
    b.style.cssText = "box-sizing:border-box;height:20px;padding:0 6px;margin:0;"
        + "border:0.5px solid #5a5a5a;border-radius:4px;background:#3a3a3a;color:#e8e8e8;"
        + "font:11px Arial,'Microsoft YaHei',sans-serif;cursor:pointer;white-space:nowrap;"
        + "flex:" + (opts?.flex || "0 0 auto") + ";min-width:0;";
    if (opts?.width) {
        b.style.width = opts.width;
        b.style.padding = "0";
        b.style.textAlign = "center";
        b.style.flex = "0 0 " + opts.width;
    }
    if (opts?.title) b.title = opts.title;
    if (opts?.hard) { b.style.background = "#7d2b2b"; b.style.borderColor = "#a33"; }
    else if (opts?.active) { b.style.background = "#2d69a5"; b.style.borderColor = "#2d69a5"; }
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        try { onClick(); } catch (err) { console.warn("[XiaoHei 长镜头] 面板按钮异常:", err); }
    });
    parent.appendChild(b);
    return b;
}

/** 紧凑三连：− 数值 + 挨在一起，两侧都能点，不再出现只能加不能减的格子。 */
function makeStepper(parent, label, opts, onMinus, onPlus) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:2px;flex:0 0 auto;min-width:0;";
    parent.appendChild(wrap);
    const title = opts?.title || "";
    makeButton(wrap, "−", { width: "18px", title }, onMinus);
    const val = document.createElement("span");
    val.textContent = label;
    val.style.cssText = "flex:0 0 " + (opts?.labelWidth || "60px") + ";text-align:center;"
        + "color:#e6e6e6;font:11px Arial,'Microsoft YaHei',sans-serif;line-height:20px;"
        + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    if (title) val.title = title;
    wrap.appendChild(val);
    makeButton(wrap, "+", { width: "18px", title }, onPlus);
    return wrap;
}

/** 每次点击 / 切语言都整块重绘：文字按 currentLang() 现场生成，中 EN 即时跟随。 */
function renderPanelDom(P) {
    if (!P?.root) return;
    const { root, S, node, widget, domW } = P;
    const zh = currentLang() === "zh";
    const m = panelModel(S);
    root.textContent = "";
    root.style.height = domPanelHeight(S) + "px";
    const title = document.createElement("div");
    title.textContent = m.title;
    title.style.cssText = "height:16px;line-height:16px;color:#8fd0ff;font-size:11px;margin-bottom:3px;";
    root.appendChild(title);
    const row = (h) => {
        const d = document.createElement("div");
        d.style.cssText = "display:flex;align-items:center;gap:3px;height:" + h + "px;margin-bottom:3px;";
        root.appendChild(d);
        return d;
    };
    const act = (a) => panelAction(S, a, node, widget, P);
    const modeRow = row(20);
    for (const [key, label] of m.modes) {
        makeButton(modeRow, label, { active: S.mode === key, flex: "1 1 0" },
            () => act({ type: "mode", value: key }));
    }
    if (S.mode === "cuts") {
        const bar = row(20);
        makeButton(bar, zh ? `＋ 加切点 (${S.rows.length})` : `+ Add cut (${S.rows.length})`,
            { flex: "1 1 0" }, () => act({ type: "add" }));
        makeButton(bar, zh ? "－ 删末个" : "- Remove last",
            { flex: "1 1 0" }, () => act({ type: "remove" }));
        if (!m.rows.length) {
            const hint = row(PANEL_ROW_H);
            hint.textContent = zh ? "还没有切点：点「＋ 加切点」按镜头顺序加"
                                  : "No cuts yet: press + Add cut";
            hint.style.color = "#9a9a9a";
        }
        for (const r of m.rows) {
            const line = row(PANEL_ROW_H);
            line.style.overflow = "hidden";
            const posTitle = zh
                ? "切点位置：每点一次 ±17 帧（MiniMax H3 的 17k+5 帧网格）"
                : "Cut position: ±17 frames per click (MiniMax H3 17k+5 grid)";
            makeStepper(line, r.pos, { labelWidth: "88px", title: posTitle },
                () => act({ type: "row", index: r.index, col: 0, delta: -1 }),
                () => act({ type: "row", index: r.index, col: 0, delta: 1 }));
            makeButton(line, r.kind, { flex: "0 1 auto", hard: S.rows[r.index].kind === "H" },
                () => act({ type: "row", index: r.index, col: 1 }));
            if (r.showOverlap) {
                const ovTitle = zh ? "该接缝重叠帧数：±5 帧（0–240）"
                                   : "Seam overlap: ±5 frames (0–240)";
                makeStepper(line, r.overlap, { labelWidth: "52px", title: ovTitle },
                    () => act({ type: "row", index: r.index, col: 2, delta: -1 }),
                    () => act({ type: "row", index: r.index, col: 2, delta: 1 }));
            }
        }
    } else if (S.mode === "average") {
        const bar = row(20);
        const lab = document.createElement("span");
        lab.textContent = zh ? `段数 ${S.count || "自动"}` : `Segments ${S.count || "auto"}`;
        lab.style.cssText = "flex:1 1 auto;text-align:center;color:#d6d6d6;";
        bar.appendChild(lab);
        makeButton(bar, "−", { flex: "1 1 0" }, () => act({ type: "count", delta: -1 }));
        makeButton(bar, "＋", { flex: "1 1 0" }, () => act({ type: "count", delta: 1 }));
    } else {
        const bar = row(20);
        bar.textContent = zh ? "整片算 1 段；段内按 H3 帧数上限自动分块"
                             : "1 segment for the whole video; auto-split into H3-sized blocks";
        bar.style.color = "#bdbdbd";
    }
    const note = document.createElement("div");
    note.textContent = m.note;
    note.style.cssText = "box-sizing:border-box;height:" + PANEL_NOTE_H + "px;"
        + "margin-bottom:3px;padding-top:2px;font-size:11px;line-height:12px;"
        + "color:#a9c7dd;white-space:normal;overflow:hidden;";
    root.appendChild(note);
    if (m.showBlocks) {
        // L3：常驻。读数一律取面板状态 S，不再读被隐藏的 widget（它可能已被 Vue 覆盖）。
        const capF = S.capF;
        const ov = S.blockov;
        const bar = row(20);
        bar.style.overflow = "visible";
        const tag = document.createElement("span");
        tag.textContent = zh ? "段内补切" : "in-shot blocks";
        tag.style.cssText = "flex:0 0 auto;color:#8fd0ff;white-space:nowrap;";
        bar.appendChild(tag);
        const capLab = document.createElement("span");
        capLab.textContent = zh ? "单块上限" : "max block";
        capLab.style.cssText = "flex:0 0 auto;color:#bdbdbd;white-space:nowrap;";
        bar.appendChild(capLab);
        makeStepper(bar, `${capF}f`, {
            labelWidth: "34px",
            title: zh ? `一块最多生成几帧（${capF} 帧 · ${(capF / FPS).toFixed(2)} 秒）：镜头超过它就自动补切。每点一次 ±17 帧（MiniMax H3 的 17k+5 网格）`
                      : `Max frames per block (${capF} frames · ${(capF / FPS).toFixed(2)} s): a longer shot is auto-split. ±17 frames per click (MiniMax H3 17k+5 grid)`,
        }, () => act({ type: "cap", delta: -1 }), () => act({ type: "cap", delta: 1 }));
        const ovLab = document.createElement("span");
        ovLab.textContent = zh ? "块间重叠" : "block ov";
        ovLab.style.cssText = "flex:0 0 auto;color:#bdbdbd;white-space:nowrap;";
        bar.appendChild(ovLab);
        makeStepper(bar, `${ov}f`, {
            labelWidth: "30px",
            title: zh ? "段内补切出来的块之间重叠几帧。镜头接缝的重叠在每行单独设，不归这里管。"
                      : "Overlap between auto-split blocks inside one shot. Shot seams are set per row.",
        }, () => act({ type: "blockov", delta: -1 }), () => act({ type: "blockov", delta: 1 }));
    }
    if (domW) lockDomWidgetHeight(domW, () => domPanelHeight(S));
    try {
        const h = node.computeSize?.()[1];
        if (h) node.setSize?.([node.size[0], h]);
    } catch (e) {}
    repaint(node);
}

function syncVisibility(node) {
    hideManagedWidgets(node);
}

function commitPanel(S, node, widget, P) {
    S.dirty = true;
    S.legacy = false;
    // 唯一真源：面板写结构化 JSON 进 cut_points，后端 parse_spec() 直接读它。
    // capF / blockov 一并存档（parse_spec 忽略未知字段），刷新后不会丢。
    widget.value = JSON.stringify({ v: 1, mode: S.mode, count: S.count, rows: S.rows,
                                    capF: S.capF, blockov: S.blockov });
    const modeW = widgetOf(node, "cut_mode");
    if (modeW) modeW.value = S.mode;
    const countW = widgetOf(node, "segment_count");
    if (countW) countW.value = S.count;
    // 后端仍从这两个独立参数取值：容错写回，不调 callback（上一版就是它抛错掐断点击）。
    writeBackBlockParams(node, S);
    // 每次点击都补一遍：Vue 可能在回调后重建 element，只隐藏一次会漏。
    hideManagedWidgets(node);
    renderPanelDom(P || node._xhSegmentPanel);
}

function panelAction(S, action, node, widget, P) {
    // 任何一路异常都只记日志，绝不能挡住下面的重绘：上一版 ± 点了没反应就栽在这里。
    try {
    switch (action.type) {
        case "mode": S.mode = action.value; break;
        case "count": S.count = Math.max(0, Math.min(512, S.count + action.delta)); break;
        case "add":
            if (S.rows.length < PANEL_MAX_ROWS) {
                const last = S.rows.length ? S.rows[S.rows.length - 1].frame : 0;
                S.rows.push({ frame: snapFrame(last + Math.round(FPS * 5)), kind: "C",
                              overlap: 9, split: "auto", chunks: 2 });
            }
            break;
        case "remove": S.rows.pop(); break;
        case "cap": {
            // 只改面板状态：±17 帧（H3 17k+5 网格），写回交给 commitPanel 的容错通道。
            const next = stepFrame(S.capF, action.delta < 0 ? -1 : 1);
            S.capF = Math.max(5, Math.min(362, next));
            break;
        }
        case "blockov": {
            // 只改面板状态：±5 帧，减到 0 停住；镜头接缝仍由逐行格子单独管。
            S.blockov = Math.max(0, Math.min(240,
                S.blockov + (action.delta < 0 ? -5 : 5)));
            break;
        }
        case "row": {
            const r = S.rows[action.index];
            if (!r) break;
            const dir = action.delta < 0 ? -1 : 1;
            switch (action.col) {
                case 0: r.frame = stepFrame(r.frame, dir); break;
                case 1:
                    r.kind = r.kind === "H" ? "C" : "H";
                    r.overlap = r.kind === "H" ? 0 : 9;
                    break;
                case 2:
                    if (r.kind === "C") r.overlap = Math.max(0, Math.min(240, r.overlap + dir * 5));
                    break;
            }
            break;
        }
    }
    } catch (e) {
        console.warn("[XiaoHei 长镜头] 分段面板点击异常:", e);
    }
    commitPanel(S, node, widget, P);
}

function installSegmentPanel(node) {
    // 刷新 / 连线变化后 Vue 可能重建 element：反复补挂隐藏，别指望一次就生效。
    if (node._xhSegmentPanel) {
        hideManagedWidgets(node);
        node._xhSegmentPanel.render();
        return;
    }
    const w = widgetOf(node, "cut_points");
    if (!w || typeof node.addDOMWidget !== "function") return;
    const S = readPanelValue(w.value, node);
    w.value = JSON.stringify({ v: 1, mode: S.mode, count: S.count, rows: S.rows,
                               capF: S.capF, blockov: S.blockov });
    const modeW = widgetOf(node, "cut_mode");
    if (modeW) modeW.value = S.mode;
    const countW = widgetOf(node, "segment_count");
    if (countW) countW.value = S.count;
    node.xhSegmentState = S;
    writeBackBlockParams(node, S);
    hideManagedWidgets(node);

    const root = document.createElement("div");
    root.style.cssText = "box-sizing:border-box;padding:6px 8px;overflow:hidden;"
        + "font-family:Arial,'Microsoft YaHei',sans-serif;font-size:11px;color:#e6e6e6;"
        + "background:rgba(20,20,20,0.28);border-radius:6px;";
    let domW = null;
    try {
        domW = node.addDOMWidget(PANEL_DOM_NAME, "custom", root, {
            serialize: false, hideOnZoom: false,
            getMinHeight: () => domPanelHeight(S),
            getHeight: () => domPanelHeight(S),
            afterResize: () => { try { node.setDirtyCanvas?.(true, true); } catch (e) {} },
        });
    } catch (e) {
        console.warn("[XiaoHei 长镜头] 分段面板挂载失败:", e);
    }
    if (domW) lockDomWidgetHeight(domW, () => domPanelHeight(S));
    const P = { root, domW, S, node, widget: w, render: null };
    P.render = () => renderPanelDom(P);
    node._xhSegmentPanel = P;
    P.render();
    // 构造期 Vue 按「多行 textarea」算过一次初始高度，隐藏后要补写几次才压得下去。
    for (const ms of [0, 120, 350]) {
        setTimeout(() => {
            try {
                const h = node.computeSize?.()[1];
                if (h && node.size) {
                    node.size[1] = h;              // Float64Array 也支持下标原地写
                    node.setDirtyCanvas?.(true, true);
                }
            } catch (e) {}
        }, ms);
    }
}

function installMessages(node) {
    const state = { lines: [], rows: 0 };
    const hint = () => {
        const dry = widgetOf(node, "dry_run")?.value;
        const mode = widgetOf(node, "chunk_mode")?.value;
        const mem = widgetOf(node, "memory_mode")?.value ?? "lowmem";
        const memLabel = L(mem);   // 下拉值走词典：中文显示中文档位，EN 还原英文 key
        const cut = widgetOf(node, "cut_mode")?.value ?? "average";
        const cutLabel = L(cut);
        if (dry !== false) {
            return {
                zh: `预览模式：只算分块计划，不加载模型、不烧显存（分段：${cutLabel}；内存：${memLabel}）。关掉「只算计划」才真采样。`,
                en: `Preview mode: plan only, no model loaded (cut_mode: ${cutLabel}; memory_mode: ${memLabel}). Turn off dry_run to sample.`
            };
        }
        return {
            zh: `真采样模式（分块：${mode === "disable" ? "关闭" : "开启"}；分段：${cutLabel}；内存：${memLabel}）。运行后这里逐段显示进度。`,
            en: `Sampling mode (chunk_mode: ${mode === "disable" ? "disable" : "enable"}; cut_mode: ${cutLabel}; memory_mode: ${memLabel}). Per-chunk progress appears here.`
        };
    };
    // 首行是「吸附结果」只读行；其余照旧走 {zh,en} → wnUIFull 的词典链路。
    const lines = () => [snapText(node), ...[hint(), ...state.lines].map(pick)];

    const widget = {
        name: "wn_long_ripple_messages",
        type: "wn_long_ripple_messages",
        value: "",
        serialize: false,
        options: { serialize: false },
        computeSize: (width) => [width ?? 340, 16 * Math.max(state.rows || 0, lines().length * 2) + 8],
        draw(ctx, _node, width, y) {
            ctx.save();
            ctx.font = "11px Arial, sans-serif";
            ctx.textBaseline = "top";
            let row = 0;
            for (const [index, text] of lines().entries()) {
                ctx.fillStyle = index === 0 ? "#8fd0ff" : index === 1 ? "#cfcfcf" : "#e0a050";
                for (const piece of wrapText(ctx, text, width - 28)) {
                    ctx.fillText(piece, 14, y + 3 + 16 * row++);
                }
            }
            ctx.restore();
            if (row !== state.rows) {
                state.rows = row;
                queueMicrotask(() => node.setSize?.([node.size[0], node.computeSize()[1]]));
            }
        },
        mouse: () => false,
    };
    node.addCustomWidget ? node.addCustomWidget(widget) : node.widgets?.push(widget);

    const onExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        state.lines = Array.isArray(message?.text) ? message.text : [];
        state.rows = 0;
        node.setSize?.([node.size[0], node.computeSize()[1]]);
        repaint(node);
        return onExecuted?.apply(this, arguments);
    };

    // 开关一变，提示行要跟着换；Nodes 2.0 下 setDirtyCanvas 不够，必须 triggerDraw
    for (const name of ["chunk_duration", "dry_run", "chunk_mode", "memory_mode",
                        "cut_mode", "cut_points", "segment_count"]) {
        const w = widgetOf(node, name);
        if (!w) continue;
        const cb = w.callback;
        w.callback = function () {
            const value = cb?.apply(this, arguments);
            state.rows = 0;
            repaint(node);
            return value;
        };
    }

    MOUNTED.add(node);
    node.xhLongRippleRefresh = () => {
        state.rows = 0;
        node.setSize?.([node.size[0], node.computeSize()[1]]);
        repaint(node);
    };
}

const allLongNodes = () => ((app.graph?._nodes ?? app.graph?.nodes ?? []))
    .filter((n) => n && n.type === NODE_ID);

onLangChanged(() => {
    const seen = new Set();
    for (const n of [...MOUNTED, ...allLongNodes()]) {
        if (seen.has(n)) continue;
        seen.add(n);
        try { n.xhLongRippleRefresh?.(); n._xhSegmentPanel?.render?.(); n.wnLongSync?.(); } catch (e) { /* 单个节点失败不影响其它 */ }
    }
}, { initialDelay: 260 });

app.registerExtension({
    name: "XH.WN.H3AutoLongRipple",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_ID) return;
        const max = Object.keys(nodeData.input?.optional ?? {})
            .filter((name) => ANCHOR_INPUT.test(name)).length || 16;
        applyDefTooltips(nodeData);
        applyGridSpec(nodeData);

        nodeType.prototype.wnLongSync = function () {
            if (this._wnLongSyncing) return;
            this._wnLongSyncing = true;
            try {
                resizeForSlots(this, () => syncAnchors(this, max));
                applyDefTooltips(nodeData);   // 语言切换后刷新共享 nodeData
                applyGridSpec(nodeData);      // nodeData 可能被语言层重建，重新钉死步进
                applyGridStep(this);          // 旧节点 widget 已建好，改 options 才立即生效
                installSegmentPanel(this);   // 幂等：刷新后 Vue 重建 element 时补挂隐藏
                syncVisibility(this);
                applyNodeTooltips(this);
            } finally {
                this._wnLongSyncing = false;
            }
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            installMessages(this);
            installSegmentPanel(this);     // 必须在 widgets 建好之后
            this.wnLongSync?.();
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            queueMicrotask(() => this.wnLongSync?.());
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            setTimeout(() => this.wnLongSync?.(), 0);
            return result;
        };
    },
});

// 页面刷新时工作流里的节点可能早就过了 onNodeCreated / onConfigure：载入后补一次同步，
// 保证「默认只露一个锚点」和中文悬浮说明立刻生效，不必手动碰一下连线。
setTimeout(() => {
    for (const n of allLongNodes()) {
        try { n.xhLongRippleRefresh?.(); n._xhSegmentPanel?.render?.(); n.wnLongSync?.(); } catch (e) { /* 忽略单个节点 */ }
    }
}, 1200);
