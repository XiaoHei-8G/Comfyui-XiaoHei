// XiaoHei-视频对比 · 前端实现（web/xh_video_compare.js）
// 2026-10-24 新增。复刻 comfyui-easy-media 的 Compare Videos 前端交互，XiaoHei 家族化：
//   · 多路网格同步播放（≤4 格，主从时钟）
//   · 三种模式：网格同播 / 单看大图 / 两两滑块对比
//   · 「 选择文件」弹层：input/temp/output 三目录扫盘多选（后端 /xh/videocompare/files）
//   · 差值信息条：每路 fps/帧数/时长 + 相对第 1 路的差值
//   · ⇄ 互换按钮（纯前端交换显示顺序，不动后端池）
//   · 家族标准：makeXHToolbar 工具条（中/EN + ）/ 齿轮折叠 / lockDomWidgetHeight 锁高
//     / i18n 三表（标题 + 控件 + 端口）/ ensureLangBridge 语言桥
//  控件规范见 references/xh_style.md；DOM 锁高见 frontend_n2.md §13.7。
//  本文件 CRLF 行尾（与 web/ 目录一致）。

import { getLinkById as xhGetLinkById } from "./xh_compat.js";
import { ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons, lockDomWidgetHeight, makeGearBtn, forceCompactOnSpawn, currentLang, makeBarBtn, paintBarBtn, BAR_COLORS, fixWidgetValuesFromSaved } from "./xh_ui_kit.js";

//  家族标准：app 必须从 comfyAPI 解构（新版 Vite 前端不挂 window.app 全局，
//    裸用 app 会 ReferenceError → 整个扩展没注册 → 节点变空壳，2026-10-26 实锤修复）
const { app } = window.comfyAPI.app;

ensureLangBridge();

const NODE_TYPE = "XHCompareVideos";
const MAX_CELLS = 4;
const FONT_STACK =
    '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

// ---------------------------------------------------------------------------
// i18n 三表（标题 nodes / 控件 widgets / 端口 slots）—— 4B.1 缺一不可
// ---------------------------------------------------------------------------
const XH_I18N = {
    zh: {
        nodes: { [NODE_TYPE]: "视频对比" },
        widgets: {
            compare_video: "对比设置",
        },
        slots: {
            source: "源视频",
            output: "目标视频",
        },
        ui: {
            mode: "模式",
            //  原版 EasyMedia 四种模式（1:1 语义）：擦除 / 并排 / 只看源 / 看成片
            modeCompare: "擦除对比",
            modeCompareTip: "拖动白线擦除对比源视频与成品",
            modeSide: "并排",
            modeSideTip: "多路并排同步播放",
            modeSource: "只看源",
            modeSourceTip: "只看第一路源视频",
            modeOutput: "看成片",
            modeOutputTip: "只看第二路成品视频",
            pick: "选择文件",
            swap: "⇄ 互换",
            swapNeed2: "至少 2 路",
            swapDone: "已互换",
            gearExpand: "展开对比设置",
            gearCollapse: "收起对比设置",
            save: "保存",
            saving: "存盘中…",
            saved: "已存档",
            noInput: "没有可对比的视频\n\n接 source / output 口，或点「选择文件」多选",
            loading: "加载中…",
            dirInput: "输入目录",
            dirTemp: "临时目录",
            dirOutput: "输出目录",
            pickOk: "确定",
            pickCancel: "取消",
            pickUp: "上移",
            pickDown: "下移",
            pickEmpty: "这个目录里没有视频文件",
            pickHint: "勾选要对比的视频（可多选，最多 4 个）",
            infoBar: "信息",
            cell: "路",
            framesDiff: "帧差",
            durDiff: "时长差",
            base: "基准",
            truncated: "入池视频超过 4 个，只取前 4 个",
            fps: "帧率",
            frames: "帧数",
            dur: "时长",
            saveOn: "保存输出：开",
            saveOff: "保存输出：关",
            liveTag: "实时预览",
            liveInfo: "实时预览（还没跑工作流；跑一次后这里显示后端处理结果）",
        },
    },
    en: {
        nodes: { [NODE_TYPE]: "Video Compare" },
        widgets: {
            compare_video: "Compare Settings",
        },
        slots: {
            source: "Source",
            output: "Output",
        },
        ui: {
            mode: "Mode",
            modeCompare: "Wipe",
            modeCompareTip: "Drag the divider to wipe between source and output",
            modeSide: "Side by side",
            modeSideTip: "All videos side by side in sync",
            modeSource: "Source",
            modeSourceTip: "Show only the source video",
            modeOutput: "Output",
            modeOutputTip: "Show only the output video",
            pick: "Pick Files",
            swap: "⇄ Swap",
            swapNeed2: "Need 2+",
            swapDone: "Swapped",
            gearExpand: "Expand compare settings",
            gearCollapse: "Collapse compare settings",
            save: "Save",
            saving: "Saving…",
            saved: "Saved",
            noInput: "No video to compare\n\nConnect source/output, or click \"Pick Files\"",
            loading: "Loading…",
            dirInput: "Input",
            dirTemp: "Temp",
            dirOutput: "Output",
            pickOk: "OK",
            pickCancel: "Cancel",
            pickUp: "Up",
            pickDown: "Down",
            pickEmpty: "No video files in this directory",
            pickHint: "Select videos to compare (multi-select, up to 4)",
            infoBar: "Info",
            cell: "#",
            framesDiff: "frame diff",
            durDiff: "dur diff",
            base: "base",
            truncated: "More than 4 videos pooled — using the first 4",
            fps: "fps",
            frames: "frames",
            dur: "dur",
            saveOn: "Save output: ON",
            saveOff: "Save output: OFF",
            liveTag: "Live",
            liveInfo: "Live preview (workflow not run yet; run once to see backend results)",
        },
    },
};

function t(node, key) {
    const lang = currentLang();
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack.ui && pack.ui[key]) || XH_I18N.zh.ui[key] || key;
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
//  模式 1:1 对齐原版 EasyMedia CompareMode：
//    compare      擦除对比（两路重叠 + clip-path 白线擦除）← 原版核心，旧 pair 从没实现
//    side-by-side 并排（多路同播，等同旧 grid）
//    source       只看源（第一路铺满）← 旧 single
//    output       看成片（第二路铺满）
//  老存档 grid/single/pair 在 normalizeMode 里映射过来，老工作流照常读。
const MODES = ["compare", "side-by-side", "source", "output"];
function normalizeMode(m) {
    if (m === "grid") return "side-by-side";
    if (m === "single") return "source";
    if (m === "pair") return "compare";
    return MODES.includes(m) ? m : "compare";
}

function freshState() {
    return {
        mode: "compare",       // compare | side-by-side | source | output（原版四态）
        cells: [],             // [{ref, meta, videoEl, tagEl, loaded:bool}] —— 来自 onExecuted payload
        order: [],             // 显示顺序（cells 下标数组，⇄ 互换用）
        sourceIdx: 0,          // 源是哪格（默认第一路）
        outputIdx: 1,          // 成品是哪格（默认第二路；master 时钟跟它走，原版同款）
        split: 50,             // 擦除分割线位置 0~100（原版 split state）
        pointerInside: false,  // 鼠标是否在擦除舞台内（原版 isPointerInside → 拖拽时关过渡动画）
        saved: false,          // 后端是否已存档（信息条提示）
        hint: "",
        liveMode: false,       // true = 正在显示「连接即预览」（还没跑工作流）
        liveTimer: null,       // 实时预览去抖定时器
        picker: null,          // 弹层 DOM（节点级，同时只开一个）
    };
}

function getSettingsWidget(node) {
    return (node.widgets || []).find((w) => w && w.name === "compare_video") || null;
}

function readSettings(node) {
    const w = getSettingsWidget(node);
    if (!w || !w.value) return {};
    try {
        const v = JSON.parse(w.value);
        return v && typeof v === "object" ? v : {};
    } catch (e) {
        return {};
    }
}

function writeSettings(node, patch) {
    const st = { ...readSettings(node), ...patch };
    const w = getSettingsWidget(node);
    if (w) {
        w.value = JSON.stringify(st);
        try { if (w.options) w.options.serialize = true; } catch (e) {}
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    return st;
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------
function refToUrl(ref) {
    if (!ref || !ref.filename) return "";
    const type = ref.type || "temp";
    const sub = ref.subfolder || "";
    return `/view?filename=${encodeURIComponent(ref.filename)}&type=${encodeURIComponent(type)}&subfolder=${encodeURIComponent(sub)}`;
}

// ---------------------------------------------------------------------------
// 网格 / 单元
// ---------------------------------------------------------------------------
function gridCols(n) {
    if (n <= 1) return 1;
    if (n <= 2) return 2;
    return 2;
}

function makeCell(node, idx) {
    const cell = document.createElement("div");
    cell.style.cssText =
        "position:relative;box-sizing:border-box;background:#141414;border-radius:6px;overflow:hidden;"
        + `font-family:${FONT_STACK};min-width:0;`;

    const tag = document.createElement("div");
    tag.style.cssText =
        "position:absolute;left:6px;top:6px;z-index:3;padding:1px 7px;border-radius:4px;"
        + "background:rgba(0,0,0,.55);color:#e8ecf1;font-size:11px;line-height:1.5;pointer-events:none;";

    const ve = document.createElement("video");
    ve.muted = true;
    ve.loop = true;
    ve.playsInline = true;
    ve.preload = "metadata";
    ve.setAttribute("controlsList", "nodownload");
    ve.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;background:#141414;";

    const hint = document.createElement("div");
    hint.style.cssText =
        "position:absolute;inset:0;display:none;align-items:center;justify-content:center;"
        + "color:#c9ced6;font-size:12px;pointer-events:none;";

    cell.appendChild(ve);
    cell.appendChild(tag);
    cell.appendChild(hint);
    return { el: cell, videoEl: ve, tagEl: tag, hintEl: hint, loaded: false };
}

// ---------------------------------------------------------------------------
// 同步时钟（1:1 原版：master = output 那一路，没有则退回 source）
//   原版 handleTimeUpdate: const master = outputRef.current ?? sourceRef.current
//   我们这里用 st.outputIdx 指向的第二路当 master，跟原版语义一致。
// ---------------------------------------------------------------------------
function masterCell(st) {
    if (!st) return null;
    const out = st.cells[st.outputIdx];
    return out || st.cells[st.sourceIdx] || st.cells[0] || null;
}

function syncAll(node, masterTime) {
    const st = node._xhCMP;
    if (!st) return;
    const m = masterCell(st);
    for (const c of st.cells) {
        if (c === m) continue;
        if (c.videoEl && Math.abs((c.videoEl.currentTime || 0) - masterTime) > 0.08) {
            try { c.videoEl.currentTime = masterTime; } catch (e) {}
        }
    }
}

function bindSyncEvents(node) {
    const st = node._xhCMP;
    if (!st) return;
    st.cells.forEach((c, i) => {
        const ve = c.videoEl;
        ve.addEventListener("loadeddata", () => {
            c.loaded = true;
            maybeStart(node);
            relayout(node);
        });
        ve.addEventListener("play", () => {
            for (const o of st.cells) {
                if (o === c) continue;
                try { o.videoEl.play?.(); } catch (e) {}
            }
        });
        ve.addEventListener("pause", () => {
            for (const o of st.cells) {
                if (o === c) continue;
                try { o.videoEl.pause?.(); } catch (e) {}
            }
        });
        ve.addEventListener("seeking", () => syncAll(node, ve.currentTime));
        ve.addEventListener("timeupdate", () => {
            if (c === masterCell(st)) syncAll(node, ve.currentTime);
        });
        // 播放区不吃画布手势
        ["pointerdown", "mousedown", "dblclick", "wheel"].forEach((ev) =>
            c.el.addEventListener(ev, (e) => e.stopPropagation()));
        // 单击格子 → 看它这一路（第一路=只看源，其余=看成片），双击回并排
        c.el.addEventListener("click", () => {
            if (st.mode === "side-by-side" && st.cells.length > 1) {
                if (i === st.sourceIdx) { st.outputIdx = i; setMode(node, "source"); }
                else { st.outputIdx = i; setMode(node, "output"); }
            }
        });
    });
}

function maybeStart(node) {
    const st = node._xhCMP;
    if (!st || !st.cells.length) return;
    // 全部加载完才起播（最慢的一路不拖后腿）
    if (st.cells.every((c) => c.loaded)) {
        const m = masterCell(st);
        try { m?.videoEl.play?.(); } catch (e) {}
    }
}

// ---------------------------------------------------------------------------
// 模式切换（原版四态 1:1）
// ---------------------------------------------------------------------------
function setMode(node, mode) {
    const st = node._xhCMP;
    if (!st) return;
    st.mode = normalizeMode(mode);
    // 擦除 / 单看要跟着「显示顺序」走 —— 互换后 ⇄ 立刻反映到 A/B
    if (st.cells.length) {
        st.sourceIdx = (st.order && st.order[0] != null) ? st.order[0] : 0;
        st.outputIdx = (st.order && st.order[1] != null) ? st.order[1] : Math.min(1, st.cells.length - 1);
    }
    writeSettings(node, { mode: st.mode });
    renderCells(node);
    paintModeBtns(node);
    relayout(node);
}

// 把擦除分割线刷到 DOM（原版 displaySplit + clipPath + 白线，逐字对齐）
//   displaySplit：source 模式=100（成品被擦没）、output=0（成品铺满）、
//                 擦除=用户拖的 split、并排=50（两路各半，走 CSS 不用 clip）
function paintSplit(node) {
    const st = node._xhCMP;
    if (!st || !st.stageEl) return;
    const canCompare = st.cells.length >= 2;
    const m = st.mode;
    const displaySplit = m === "source" ? 100 : m === "output" ? 0
        : m === "side-by-side" ? 50 : st.split;
    // 成品路（output）用 clip-path 擦除：inset(0 0 0 X%) 只露右半边
    const outCell = st.cells[st.outputIdx];
    if (outCell && outCell.videoEl) {
        if (m === "compare" || m === "source" || m === "output") {
            outCell.videoEl.style.clipPath = `inset(0 0 0 ${displaySplit}%)`;
            outCell.videoEl.style.transition = st.pointerInside ? "none" : "clip-path 180ms ease";
        } else {
            outCell.videoEl.style.clipPath = "";
            outCell.videoEl.style.transition = "";
        }
    }
    // 并排态靠 cell 的 grid 分栏，video 100% 铺满自己的 cell，不用改 video 尺寸
    // 白线：只在擦除态显示（原版 canCompare && (compare||side-by-side)，
    //   我们并排态用 CSS 分栏，白线只擦除态画，视觉更干净）
    if (st.dividerEl) {
        const show = canCompare && m === "compare";
        st.dividerEl.style.display = show ? "block" : "none";
        st.dividerEl.style.left = `${displaySplit}%`;
        st.dividerEl.style.transition = st.pointerInside ? "none" : "left 180ms ease";
    }
}

// 舞台拖拽换算（原版 updateSplitFromPointer 1:1）：
//   localX = (clientX - rect.left) / scale；percent = localX / width * 100
function updateSplitFromPointer(node, clientX) {
    const st = node._xhCMP;
    if (!st || st.mode !== "compare" || st.cells.length < 2 || !st.stageEl) return;
    const rect = st.stageEl.getBoundingClientRect();
    if (!rect) return;
    const scale = (node.graph && node.graph.canvas && node.graph.canvas.scale) || 1;
    const s = scale > 0 ? scale : 1;
    const localX = (clientX - rect.left) / s;
    const width = rect.width / s;
    const percent = width > 0 ? (localX / width) * 100 : 50;
    st.split = Math.max(0, Math.min(100, percent));
    paintSplit(node);
}

function renderCells(node) {
    const st = node._xhCMP;
    if (!st) return;
    const n = st.cells.length;

    // order 只在「没初始化 / 长度变了 / 含越界下标」时重建，⇄ 互换不被抹掉
    if (!Array.isArray(st.order) || st.order.length !== n
        || st.order.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) {
        st.order = [];
        for (let i = 0; i < n; i++) st.order.push(i);
    }
    if (!st.gridEl) return;

    // 擦除/单看态：两个 video 完全重叠在一个舞台里（原版 absolute inset-0）
    const wipe = st.mode === "compare" || st.mode === "source" || st.mode === "output";
    st.gridEl.innerHTML = "";
    st.gridEl.style.position = wipe ? "relative" : "";
    st.gridEl.style.gridTemplateColumns = wipe ? "" : `repeat(${gridCols(n)}, 1fr)`;
    st.gridEl.style.display = wipe ? "block" : "grid";

    let showIdx;
    if (st.mode === "source") showIdx = [st.sourceIdx];
    else if (st.mode === "output") showIdx = [st.outputIdx];
    else if (st.mode === "compare") {
        // 擦除：两路重叠；不足两路则退化成只显示有的那一路
        showIdx = n >= 2 ? [st.sourceIdx, st.outputIdx] : [0];
    }
    else showIdx = st.order;                                  // side-by-side：全部并排

    for (const i of showIdx) {
        const c = st.cells[i];
        if (!c) continue;
        if (wipe) {
            // 原版：absolute inset-0 h-full w-full object-contain
            c.el.style.position = "absolute";
            c.el.style.inset = "0";
            c.el.style.width = "100%";
            c.el.style.height = "100%";
        } else {
            c.el.style.position = "";
            c.el.style.inset = "";
            c.el.style.width = "";
            c.el.style.height = "";
        }
        st.gridEl.appendChild(c.el);
        c.tagEl.textContent = cellTag(node, i);
        // 主格（master=output）显示原生 controls，其余隐藏
        c.videoEl.controls = (c === masterCell(st)) && !wipe;
        c.el.style.cursor = st.mode === "side-by-side" && n > 1 ? "zoom-in" : "default";
        c.videoEl.style.left = "";
        c.videoEl.style.width = "";
    }

    // 白线 + 手柄（擦除态才有）：作为舞台最后一个子元素叠在两路之上
    if (wipe && st.dividerEl) st.gridEl.appendChild(st.dividerEl);
    if (st.mode === "source" && n > 1) {
        const m = st.cells[st.sourceIdx];
        if (m) {
            m.el.addEventListener("dblclick", () => setMode(node, "side-by-side"), { once: true });
            m.el.style.cursor = "zoom-out";
        }
    }
    paintSplit(node);
}

// 舞台：白线 + 圆形手柄 + 拖拽监听（原版 CompareVideoWidget stage 1:1）
function buildStage(node, grid) {
    const st = node._xhCMP;
    if (!st) return;
    st.stageEl = grid;

    const divider = document.createElement("div");
    divider.style.cssText =
        "position:absolute;top:0;bottom:0;width:1px;background:#fff;box-shadow:0 0 4px rgba(0,0,0,.6);"
        + "z-index:4;pointer-events:none;display:none;";
    const handle = document.createElement("div");
    handle.style.cssText =
        "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;"
        + "border-radius:50%;background:#fff;border:2px solid var(--xh-primary,#E8A33C);box-sizing:border-box;";
    divider.appendChild(handle);
    st.dividerEl = divider;

    // pointer 事件挂舞台本身（原版 onPointerMove → updateSplitFromPointer）
    grid.addEventListener("pointerdown", (e) => {
        const s = node._xhCMP;
        if (!s || s.mode !== "compare") return;
        e.stopPropagation();
        s.pointerInside = true;
        s.dragging = true;
        try { grid.setPointerCapture?.(e.pointerId); } catch (err) {}
        updateSplitFromPointer(node, e.clientX);
    });
    grid.addEventListener("pointermove", (e) => {
        const s = node._xhCMP;
        if (!s || s.mode !== "compare") return;
        s.pointerInside = true;
        if (s.dragging) updateSplitFromPointer(node, e.clientX);
    });
    const endDrag = (e) => {
        const s = node._xhCMP;
        if (!s) return;
        s.dragging = false;
        try { grid.releasePointerCapture?.(e.pointerId); } catch (err) {}
    };
    grid.addEventListener("pointerup", endDrag);
    grid.addEventListener("pointercancel", endDrag);
    grid.addEventListener("pointerenter", () => { if (node._xhCMP) node._xhCMP.pointerInside = true; });
    grid.addEventListener("pointerleave", () => {
        const s = node._xhCMP;
        if (!s) return;
        s.pointerInside = false;
        // 原版：离开擦除舞台 split 回中（50）
        if (s.mode === "compare") { s.split = 50; paintSplit(node); }
    });
}

function cellTag(node, i) {
    const st = node._xhCMP;
    const c = st.cells[i];
    if (!c || !c.meta) return `${t(node, "cell")}${i + 1}`;
    const m = c.meta;
    // 实时预览格：显示上游文件名 + 实时标记
    if (m.live) return `${m.filename || ""} · ${t(node, "liveTag")}`.replace(/^ · /, "");
    const parts = [`${t(node, "cell")}${i + 1}`];
    if (m.frame_count) parts.push(`${m.frame_count}f`);
    return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// 信息条（差值）
// ---------------------------------------------------------------------------
function refreshInfo(node) {
    const st = node._xhCMP;
    if (!st || !st.infoEl) return;
    const cells = st.cells;
    if (!cells.length) {
        st.infoEl.textContent = st.hint === "no_input" ? t(node, "noInput").replace(/\n/g, " ")
            : (st.hint || "");
        return;
    }
    const base = cells[0].meta || {};
    const lines = [];
    if (st.hint === "truncated") lines.push(" " + t(node, "truncated"));
    cells.forEach((c, i) => {
        const m = c.meta || {};
        const seg = [`${t(node, "cell")}${i + 1}`];
        seg.push(`${t(node, "fps")} ${m.fps ? m.fps.toFixed(2) : "-"}`);
        seg.push(`${t(node, "frames")} ${m.frame_count ?? "-"}`);
        seg.push(`${t(node, "dur")} ${m.duration ? m.duration.toFixed(2) + "s" : "-"}`);
        if (i > 0) {
            if (base.frame_count && m.frame_count) {
                seg.push(`${t(node, "framesDiff")} ${m.frame_count - base.frame_count > 0 ? "+" : ""}${m.frame_count - base.frame_count}`);
            }
            if (base.duration && m.duration) {
                const d = m.duration - base.duration;
                seg.push(`${t(node, "durDiff")} ${d > 0 ? "+" : ""}${d.toFixed(2)}s`);
            }
        } else if (cells.length > 1) {
            seg.push(`(${t(node, "base")})`);
        }
        lines.push(seg.join(" · "));
    });
    if (st.liveMode) lines.push("● " + t(node, "liveInfo"));
    if (st.saved) lines.push("✓ " + t(node, "saved"));
    st.infoEl.textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// 文件选择弹层
// ---------------------------------------------------------------------------
async function openPicker(node) {
    const st = node._xhCMP;
    if (!st || st.picker) return;
    const s = readSettings(node);
    const chosen = [];   // [{source_type, file_path}]

    const wrap = document.createElement("div");
    wrap.style.cssText =
        "position:absolute;left:0;top:0;width:100%;box-sizing:border-box;z-index:30;"
        + "background:#1b2027;border:1px solid #333333;border-radius:8px;padding:8px;"
        + `font-family:${FONT_STACK};color:#e8e8e8;font-size:12px;box-shadow:0 6px 24px rgba(0,0,0,.45);`;

    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:4px;margin-bottom:6px;";
    const listBox = document.createElement("div");
    listBox.style.cssText =
        "max-height:220px;overflow:auto;border:1px solid #2a3340;border-radius:6px;"
        + "background:#141820;padding:4px;margin-bottom:6px;";
    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:6px;justify-content:flex-end;";

    wrap.appendChild(tabs);
    wrap.appendChild(listBox);
    wrap.appendChild(btns);
    st.picker = wrap;

    let curDir = "output";
    let files = [];

    async function loadDir(d) {
        curDir = d;
        listBox.textContent = t(node, "loading");
        try {
            const r = await fetch(`/xh/videocompare/files?dir=${encodeURIComponent(d)}`);
            const j = await r.json();
            files = (j && j.files) || [];
            renderList();
        } catch (e) {
            listBox.textContent = " " + (e && e.message ? e.message : String(e));
        }
    }

    function renderList() {
        listBox.innerHTML = "";
        if (!files.length) {
            listBox.textContent = t(node, "pickEmpty");
            return;
        }
        files.forEach((f) => {
            const row = document.createElement("label");
            row.style.cssText =
                "display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:4px;cursor:pointer;";
            row.addEventListener("pointerdown", (e) => e.stopPropagation());
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = chosen.some((c) => c.source_type === curDir && c.file_path === f.name);
            cb.addEventListener("change", () => {
                const i = chosen.findIndex((c) => c.source_type === curDir && c.file_path === f.name);
                if (cb.checked && i < 0) chosen.push({ source_type: curDir, file_path: f.name });
                if (!cb.checked && i >= 0) chosen.splice(i, 1);
            });
            const nm = document.createElement("span");
            nm.textContent = f.name;
            nm.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            const kb = document.createElement("span");
            kb.textContent = f.size_kb > 1024 ? (f.size_kb / 1024).toFixed(1) + "MB" : f.size_kb + "KB";
            kb.style.cssText = "opacity:.6;font-size:11px;";
            row.appendChild(cb);
            row.appendChild(nm);
            row.appendChild(kb);
            listBox.appendChild(row);
        });
    }

    for (const d of ["input", "temp", "output"]) {
        const b = document.createElement("button");
        b.textContent = t(node, d === "input" ? "dirInput" : d === "temp" ? "dirTemp" : "dirOutput");
        b.style.cssText =
            "flex:1;padding:3px 0;border:1px solid #333333;border-radius:4px;background:#252525;"
            + `color:#e8e8e8;font-size:12px;cursor:pointer;font-family:${FONT_STACK};`;
        b.addEventListener("click", () => {
            for (const x of tabs.children) x.style.background = "#252525";
            b.style.background = "#3a3a3a";
            loadDir(d);
        });
        if (d === "output") b.style.background = "#3a3a3a";
        tabs.appendChild(b);
    }

    const ok = document.createElement("button");
    ok.textContent = t(node, "pickOk");
    const cancel = document.createElement("button");
    cancel.textContent = t(node, "pickCancel");
    for (const b of [ok, cancel]) {
        b.style.cssText =
            "padding:3px 14px;border:1px solid #333333;border-radius:4px;background:#252525;"
            + `color:#e8e8e8;font-size:12px;cursor:pointer;font-family:${FONT_STACK};`;
    }
    ok.addEventListener("click", () => {
        // 上限 4，去掉之前的 selections 换新的
        writeSettings(node, { selections: chosen.slice(0, MAX_CELLS) });
        closePicker(node);
        // 让后端重跑：标记输出过期
        try { node.setOutputData?.(0, null); } catch (e) {}
        try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
    });
    cancel.addEventListener("click", () => closePicker(node));
    btns.appendChild(cancel);
    btns.appendChild(ok);

    // 挂到节点 body（playerEl 的父容器）
    const host = (st.playerEl && st.playerEl.parentElement) || node._xhCmpHost;
    if (host) {
        host.style.position = "relative";
        host.appendChild(wrap);
    }
    loadDir("output");
}

function closePicker(node) {
    const st = node._xhCMP;
    if (!st || !st.picker) return;
    try { st.picker.remove(); } catch (e) {}
    st.picker = null;
}

// ---------------------------------------------------------------------------
// 工具条
// ---------------------------------------------------------------------------
function paintModeBtns(node) {
    const st = node._xhCMP;
    if (!st || !st.modeBtns) return;
    const map = {
        compare: "modeCompare", "side-by-side": "modeSide", source: "modeSource", output: "modeOutput",
    };
    st.modeBtns.forEach(({ btn, mode }) => {
        const active = st.mode === mode;
        //  配色一律走 kit 四档（active / neutral）， 不自己写 #3a3a3a / #252525
        paintBarBtn(btn, active ? "active" : "neutral");
        btn.textContent = t(node, map[mode]);
        btn._baseText = btn.textContent;
    });
}

// ---------------------------------------------------------------------------
// 家族按钮反馈（references/按钮反馈规范.md —— 「所有按键都必须强烈可感知」）
//   一次点击叠 3 层：① 文字变结果 ② 底色闪 3 下 ③ 整颗 scale(1.35) 弹跳。
//    只改文字不算反馈（用户实测「我感受不到」）。
//   闪色取 kit 的 BAR_COLORS， 不在节点里硬写旧语义色。
// ---------------------------------------------------------------------------
function pulseButton(btn, opts = {}) {
    if (!btn) return;
    const ok = opts.ok !== false;
    const color = opts.color || (ok ? BAR_COLORS.PRIMARY : BAR_COLORS.DANGER_BG);
    const oldText = btn._baseText != null ? btn._baseText : btn.textContent;
    const oldBg = btn.style.background;
    const oldBorder = btn.style.borderColor;
    try { if (btn._xhPulseTimer) clearInterval(btn._xhPulseTimer); } catch (e) {}
    btn.style.transition = "transform .12s ease-out, background .12s, border-color .12s";
    if (opts.text) btn.textContent = opts.text;
    btn.style.transform = "scale(1.35)";
    setTimeout(() => { btn.style.transform = "scale(1)"; }, 150);
    let i = 0;
    const timer = setInterval(() => {
        i++;
        const show = i % 2 === 1;
        btn.style.background = show ? color : oldBg;
        btn.style.borderColor = show ? color : oldBorder;
        if (i >= 6) {
            try { clearInterval(timer); } catch (e) {}
            btn._xhPulseTimer = null;
            btn.style.background = oldBg;
            btn.style.borderColor = oldBorder;
            btn.textContent = oldText;
        }
    }, 130);
    btn._xhPulseTimer = timer;
}

// ---------------------------------------------------------------------------
//  齿轮：收起 / 展开「对比设置」（保存输出前缀 / 最大格数）
//    家族铁律（§4 / §11S）：widget 本体**一个都不删**（删了 widgets_values 会串位），
//      只做「视觉隐藏」：computeSize→[0,0] + draw→空 + DOM display:none + 高度 0。
//       绝不用 w.hidden = true（会把共存的输入端口一起藏没）。
// ---------------------------------------------------------------------------
function setSettingsVisible(node, show) {
    const w = getSettingsWidget(node);
    if (!w) return;
    if (show) {
        if (w._xhOrigComputeSize) { w.computeSize = w._xhOrigComputeSize; w._xhOrigComputeSize = null; }
        if (w._xhOrigDraw) { w.draw = w._xhOrigDraw; w._xhOrigDraw = null; }
        if (w._xhOrigMinHeight) { w.getMinHeight = w._xhOrigMinHeight; w._xhOrigMinHeight = null; }
        const el = w.element || w.el;
        if (el && el.style) { el.style.display = ""; el.style.height = ""; el.style.overflow = ""; }
    } else {
        if (!w._xhOrigComputeSize) w._xhOrigComputeSize = w.computeSize;
        if (!w._xhOrigDraw) w._xhOrigDraw = w.draw;
        if (!w._xhOrigMinHeight) w._xhOrigMinHeight = w.getMinHeight;
        w.computeSize = () => [0, 0];
        w.getMinHeight = () => 0;
        w.computeLayoutSize = undefined;   //  Vue 行高只看 hasLayoutSize，不撤掉就是 auto 行
        w.draw = () => {};
        w.mouse = () => false;
        const el = w.element || w.el;
        if (el && el.style) { el.style.display = "none"; el.style.height = "0px"; el.style.overflow = "hidden"; }
    }
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

function makeCmpGear(node) {
    const collapsed = !(readSettings(node)._gearOpen === true);
    const btn = makeGearBtn({
        collapsed,
        //  标题里不塞 emoji（Windows 会渲染成紫色块），图标由 kit 的 SVG 齿轮提供
        titleFn: (col) => (col ? t(node, "gearExpand") : t(node, "gearCollapse")),
        onToggle: (col) => {
            setSettingsVisible(node, !col);
            writeSettings(node, { _gearOpen: !col });
        },
    });
    node._xhCMPSettingsOpen = !collapsed;
    // 初始态立刻生效（不然要点两下才看到）
    setSettingsVisible(node, !collapsed);
    return btn;
}

function makeToolbarButtons(node) {
    const st = node._xhCMP;
    const out = [];

    //  一律走 kit 四档 + makeBarBtn（22px / 4px 圆角 / hover brightness），
    //     不再自己写 btn.style.background（家族统一配色唯一真源是 kit）
    const mkBtn = (key, tipKey, onClick, opts = {}) => {
        const b = makeBarBtn(t(node, key), t(node, tipKey || key), opts);
        b._baseText = b.textContent;
        b.addEventListener("pointerdown", (e) => e.stopPropagation());
        b.addEventListener("click", (e) => { e.stopPropagation(); onClick(b); });
        return b;
    };

    //  原版四模式点选：擦除 / 并排 / 只看源 / 看成片
    st.modeBtns = [
        { btn: mkBtn("modeCompare", "modeCompareTip", () => setMode(node, "compare")), mode: "compare" },
        { btn: mkBtn("modeSide", "modeSideTip", () => setMode(node, "side-by-side")), mode: "side-by-side" },
        { btn: mkBtn("modeSource", "modeSourceTip", () => setMode(node, "source")), mode: "source" },
        { btn: mkBtn("modeOutput", "modeOutputTip", () => setMode(node, "output")), mode: "output" },
    ];
    out.push(...st.modeBtns.map((x) => x.btn));

    const pickBtn = mkBtn("pick", "pick", () => openPicker(node));
    out.push(pickBtn);
    st.pickBtn = pickBtn;

    const swapBtn = mkBtn("swap", "swap", (b) => {
        const st2 = node._xhCMP;
        if (!st2 || st2.cells.length < 2) {
            pulseButton(b, { ok: false, text: t(node, "swapNeed2") });
            return;
        }
        st2.order.reverse();
        // 擦除/单看的 A/B 跟着新顺序走
        st2.sourceIdx = st2.order[0];
        st2.outputIdx = st2.order[1] ?? st2.order[0];
        renderCells(node);
        relayout(node);
        pulseButton(b, { ok: true, text: t(node, "swapDone") });
    });
    out.push(swapBtn);
    st.swapBtn = swapBtn;

    const saveBtn = mkBtn("save", "save", (b) => {
        const cur = readSettings(node).save_output === true;
        writeSettings(node, { save_output: !cur });
        const txt = t(node, !cur ? "saveOn" : "saveOff");
        b._baseText = txt;                       // 恢复值取 _baseText（动态文案会被顶掉）
        b.textContent = txt;
        pulseButton(b, { ok: !cur });
    });
    saveBtn.textContent = t(node, readSettings(node).save_output === true ? "saveOn" : "saveOff");
    saveBtn._baseText = saveBtn.textContent;
    out.push(saveBtn);
    st.saveBtn = saveBtn;

    return out;
}

// ---------------------------------------------------------------------------
// 布局高度（lockDomWidgetHeight 函数式）
// ---------------------------------------------------------------------------
function cellH(node) {
    const st = node._xhCMP;
    if (!st) return 160;
    const n = st.cells.length || 1;
    const w = 320;
    try {
        const sz = node.size;
        if (sz && typeof sz[0] === "number" && sz[0] > 0) w = sz[0];
    } catch (e) {}
    //  compare/source/output：两路重叠成一行；side-by-side：全部并排
    const cols = gridCols(n);
    const wipe = st.mode === "compare" || st.mode === "source" || st.mode === "output";
    const shown = wipe ? 1 : n;
    const rows = Math.max(1, Math.ceil(shown / cols));
    const per = Math.max(150, Math.min(320, Math.floor((w - 16) / (wipe ? 1 : cols) / 1.5)));
    return per * rows + (rows - 1) * 6;
}

function totalH(node) {
    const st = node._xhCMP;
    if (!st) return 220;
    const grid = st.cells.length ? cellH(node) : 120;
    const info = st.infoEl && st.infoEl.textContent ? 34 : 0;
    return 26 /* 工具条 */ + grid + info + 8;
}

function relayout(node) {
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ---------------------------------------------------------------------------
// payload → 界面
// ---------------------------------------------------------------------------
function applyPayload(node, data) {
    const st = node._xhCMP;
    if (!st || !data) return;
    // 真实 payload 到场 ⇒ 退出实时预览态，payload 永远优先
    st.liveMode = false;
    clearTimeout(st.liveTimer);
    st.hint = data.hint || "";
    st.saved = data.saved === true;
    const vids = Array.isArray(data.videos) ? data.videos : [];
    st.cells = vids.map((v) => {
        const c = makeCell(node, 0);
        c.meta = v;
        const url = refToUrl(v);
        if (url) c.videoEl.src = url;
        return c;
    });
    // 新 payload ⇒ 回到自然序（renderCells 不再重置 order，这里必须自己建一次，
    // 否则 st.order 永远是空数组：同步时钟 / 自动起播 / 互换 全部抓瞎）
    st.order = vids.map((_, i) => i);
    st.sourceIdx = 0;
    st.outputIdx = Math.min(1, Math.max(0, vids.length - 1));
    bindSyncEvents(node);
    renderCells(node);
    refreshInfo(node);
    paintModeBtns(node);
    relayout(node);
    // 已经播放过再换源 ⇒ 尝试续播
    maybeStart(node);
}

// ---------------------------------------------------------------------------
// 连接即预览（2026-10-26 新增，对标 easy-media / Workflow-Encrypt 的体验）：
//   接上「加载视频」这类带文件 widget 的节点，**不跑工作流**就直接显示画面。
//   做法：沿输入口向上游找视频文件名 widget（最多递归 3 层，抠像/处理类节点
//   没有文件 widget 时继续往上摸），拼 /view URL 直接播。
//    onExecuted 的 payload 永远优先（跑完工作流显示后端处理结果）。
// ---------------------------------------------------------------------------
const XH_VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|m4v|gif|avi)(\?.*)?$/i;

function parseVideoValue(v) {
    const s = String(v).replace(/\\/g, "/").trim();
    const i = s.lastIndexOf("/");
    return {
        filename: i >= 0 ? s.slice(i + 1) : s,
        subfolder: i >= 0 ? s.slice(0, i) : "",
    };
}

function upstreamFileWidget(upNode) {
    // 优先 widgets（能拿到类型），再兜底 widgets_values（有的前端只给值数组）
    for (const w of (upNode.widgets || [])) {
        const v = w && w.value;
        if (typeof v === "string" && !v.startsWith("http") && XH_VIDEO_EXT_RE.test(v.trim())) {
            return v.trim();
        }
    }
    for (const v of (upNode.widgets_values || [])) {
        if (typeof v === "string" && !v.startsWith("http") && XH_VIDEO_EXT_RE.test(v.trim())) {
            return v.trim();
        }
    }
    return null;
}

function resolveUpstreamRef(node, inputName, depth = 0) {
    try {
        const inp = (node.inputs || []).find((x) => x && x.name === inputName);
        if (!inp || inp.link == null) return null;
        const g = node.graph;
        if (!g) return null;
        //  2026-10-29：graph.links 在 1.57 是 Map ⇒ 走兼容层
        const link = g ? xhGetLinkById(g, inp.link) : null;
        if (!link) return null;
        const up = g.getNodeById
            ? g.getNodeById(link.origin_id)
            : (g._nodes_by_id || {})[link.origin_id];
        if (!up) return null;
        const val = upstreamFileWidget(up);
        if (val) {
            const { filename, subfolder } = parseVideoValue(val);
            if (filename) return { filename, subfolder, type: "input", live: true };
        }
        // 上游没有文件 widget（抠像/处理类节点）→ 沿它的视频输入口继续往上摸
        if (depth < 2) {
            for (const inp2 of (up.inputs || [])) {
                if (!inp2 || inp2.link == null) continue;
                if (inp2.type && inp2.type !== "*" && !/video|image|mask/i.test(String(inp2.type))) continue;
                const r = resolveUpstreamRef(up, inp2.name, depth + 1);
                if (r) return r;
            }
        }
    } catch (e) {}
    return null;
}

function renderEmptyState(node) {
    const st = node._xhCMP;
    if (!st || !st.gridEl) return;
    st.gridEl.innerHTML = "";
    st.gridEl.style.gridTemplateColumns = "1fr";
    if (st.emptyCell) {
        st.emptyCell.hintEl.textContent = t(node, "noInput");
        st.emptyCell.hintEl.style.display = "flex";
        st.gridEl.appendChild(st.emptyCell.el);
    }
    if (st.infoEl) st.infoEl.textContent = t(node, "noInput").replace(/\n/g, " ");
}

function applyLivePreview(node) {
    const st = node._xhCMP;
    if (!st) return;
    // 已有真实 payload（跑完工作流）⇒ 不覆盖
    if (st.cells.length && !st.liveMode) return;

    const refs = [];
    const r1 = resolveUpstreamRef(node, "source");
    if (r1) refs.push(r1);
    const r2 = resolveUpstreamRef(node, "output");
    if (r2) refs.push(r2);

    if (!refs.length) {
        if (st.liveMode) {          // 从实时态退回空态（上游全断开）
            st.liveMode = false;
            st.cells = [];
            st.order = [];
            renderEmptyState(node);
            relayout(node);
        }
        return;
    }

    st.liveMode = true;
    st.hint = "";
    st.saved = false;
    st.cells = refs.map((v) => {
        const c = makeCell(node, 0);
        c.meta = v;
        const url = refToUrl(v);
        if (url) c.videoEl.src = url;
        return c;
    });
    st.order = refs.map((_, i) => i);
    st.sourceIdx = 0;
    st.outputIdx = Math.min(1, refs.length - 1);
    bindSyncEvents(node);
    renderCells(node);
    refreshInfo(node);
    paintModeBtns(node);
    relayout(node);
    maybeStart(node);
}

function scheduleLivePreview(node, delay = 60) {
    const st = node._xhCMP;
    if (!st) return;
    clearTimeout(st.liveTimer);
    st.liveTimer = setTimeout(() => {
        try { applyLivePreview(node); } catch (e) {}
    }, delay);
}

// ---------------------------------------------------------------------------
// 语言
// ---------------------------------------------------------------------------
function applyLang(node, lang) {
    if (!node) return;
    lang = lang || currentLang();
    try {
        const want = XH_I18N[lang].nodes[NODE_TYPE];
        const zhT = XH_I18N.zh.nodes[NODE_TYPE];
        const enT = XH_I18N.en.nodes[NODE_TYPE];
        if (want && (!node.title || node.title === zhT || node.title === enT)) node.title = want;

        for (const w of (node.widgets || [])) {
            if (!w || !w.name) continue;
            const lb = XH_I18N[lang].widgets[w.name];
            if (lb) w.label = lb;
        }
        const applySlots = (arr, isOut) => {
            if (!arr) return;
            arr.forEach((s, i) => {
                const lb = XH_I18N[lang].slots[s && s.name];
                if (lb) {
                    s.label = lb;
                    try {
                        node.graph?.trigger?.("node:slot-label:changed", {
                            nodeId: String(node.id), slotType: isOut ? 2 : 1,
                            slotIndex: i, label: lb,
                        });
                    } catch (e) {}
                }
            });
        };
        applySlots(node.inputs, false);
        applySlots(node.outputs, true);

        // 工具条按钮文案
        //  切语言必须同时刷新 _baseText：pulseButton 的「恢复值」取的就是它，
        //    只改 textContent 会让点一下就弹回旧语言（2026-10-26 修）。
        if (node._xhCMP) {
            const st = node._xhCMP;
            const setTxt = (b, txt) => {
                if (!b) return;
                b.textContent = txt;
                b._baseText = txt;
            };
            if (st.modeBtns) paintModeBtns(node);
            // 空态格子文案跟着语言走
            if (!st.cells.length && st.emptyCell) {
                st.emptyCell.hintEl.textContent = t(node, "noInput");
                if (st.infoEl) st.infoEl.textContent = t(node, "noInput").replace(/\n/g, " ");
            }
            setTxt(st.swapBtn, t(node, "swap"));
            setTxt(st.pickBtn, t(node, "pick"));
            const on = readSettings(node).save_output === true;
            setTxt(st.saveBtn, t(node, on ? "saveOn" : "saveOff"));
            // 齿轮 tooltip（SVG 图标由 kit 提供，这里只管文案）
            if (st.gearBtn && typeof st.gearBtn._xhGearPaint === "function") st.gearBtn._xhGearPaint();
            refreshInfo(node);
        }
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("VideoCompare] 应用语言失败:", e);
    }
}

function nodesOfType() {
    try {
        return (app.graph?.nodes || app.graph?._nodes || []).filter((n) => n.type === NODE_TYPE);
    } catch (e) { return []; }
}

function applyLangToAll() {
    const lang = currentLang();
    for (const n of nodesOfType()) applyLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------
app.registerExtension({
    name: "XH.VideoCompare",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            try {
                const node = this;

                node._xhCMP = freshState();

                // ---- 主容器：网格 + 信息条 ----
                const host = document.createElement("div");
                host.style.cssText =
                    "width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;"
                    + `font-family:${FONT_STACK};padding:2px 0 0 0;`;
                node._xhCmpHost = host;

                const grid = document.createElement("div");
                grid.style.cssText =
                    "display:grid;grid-template-columns:repeat(2,1fr);gap:6px;width:100%;box-sizing:border-box;";
                //  擦除舞台：白线 + 手柄 + 拖拽监听（原版 stage）
                buildStage(node, grid);
                //  初始模式从存档读（老 grid/single/pair 自动归一化到四态）
                const savedMode = readSettings(node).mode;
                if (savedMode && node._xhCMP) node._xhCMP.mode = normalizeMode(savedMode);
                const info = document.createElement("div");
                info.style.cssText =
                    "white-space:pre-line;font-size:11px;line-height:1.5;color:#9aa5b1;"
                    + "min-height:14px;padding:0 2px;";
                host.appendChild(grid);
                host.appendChild(info);

                const st = node._xhCMP;
                st.gridEl = grid;
                st.infoEl = info;

                // 空态提示格
                const emptyCell = makeCell(node, 0);
                emptyCell.tagEl.textContent = "";
                emptyCell.hintEl.textContent = t(node, "noInput");
                emptyCell.hintEl.style.display = "flex";
                grid.appendChild(emptyCell.el);
                st.emptyCell = emptyCell;

                let w = null;
                try {
                    w = node.addDOMWidget("xh_cmp_player", "custom", host, {
                        serialize: false,
                        hideOnZoom: false,
                    });
                } catch (e) {
                    console.warn("VideoCompare] 播放器挂载失败:", e);
                }
                if (w) {
                    //  锁高：computeLayoutSize 抹成 undefined，Vue 行变 min-content，空带消失
                    lockDomWidgetHeight(w, () => totalH(node));
                    try {
                        w.serialize = false;
                        if (w.options) w.options.serialize = false;
                        w.serializeValue = () => undefined;
                    } catch (e) {}
                }
                st.playerEl = host;
                st.playerWidget = w;

                // ---- 工具条：齿轮（最左）→ 中/EN →  → 模式/选择/互换/保存 ----
                //  家族统一顺序（§13.8）：齿轮永远排工具条最左（prependNodes）。
                //  已核 ui_kit 源码：opts 参数名是 appendNodes（不是 extraButtons）
                const gearBtn = makeCmpGear(node);
                const extra = makeToolbarButtons(node);
                st.pickBtn = st.pickBtn || extra[3] || null;
                const { bar } = makeXHToolbar(node, {
                    widgetName: "xh_cmp_bar",
                    prependNodes: [gearBtn],
                    appendNodes: extra,
                });
                st.gearBtn = gearBtn;

                // 初始语言
                applyLang(node, currentLang());
            } catch (e) {
                console.warn("VideoCompare] onNodeCreated 失败:", e);
            }
            return r;
        };

        // 执行完：拿后端 ui payload
        const origOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            const r = origOnExecuted?.apply(this, arguments);
            try {
                const d = output && output.ui && output.ui.compare_videos;
                if (d) applyPayload(this, d);
            } catch (e) {
                console.warn("VideoCompare] onExecuted 失败:", e);
            }
            return r;
        };

        // 连接变化 ⇒ 尝试实时预览（接上「加载视频」立刻显示，不用跑工作流）
        const origOnConn = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = origOnConn?.apply(this, arguments);
            try { scheduleLivePreview(this, 60); } catch (e) {}
            return r;
        };

        // 读档：恢复设置（模式/多选/save_output）
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                const st = this._xhCMP;
                if (!st) return r;
                const s = readSettings(this);
                //  老存档 grid/single/pair 归一化到原版四态
                if (s.mode) st.mode = normalizeMode(s.mode);
                applyLang(this, currentLang());
                paintModeBtns(this);
                if (st.cells.length && st.gridEl) renderCells(this);
                //  读档必须还原齿轮折叠态：_gearOpen 存在设置里，
                //    不还原的话每次打开工作流都弹回「收起」（2026-10-26 修）。
                const open = readSettings(this)._gearOpen === true;
                if (st.gearBtn && typeof st.gearBtn._xhGearSet === "function") {
                    st.gearBtn._xhGearSet(!open);
                }
                setSettingsVisible(this, open);
                this._xhCMPSettingsOpen = open;
                //  读档时 LiteGraph 是「先 configure 节点、后恢复 links」，
                //    此刻连线还没建好 ⇒ 延迟一拍再做连接即预览（2026-10-26）。
                scheduleLivePreview(this, 250);
            } catch (e) {}
            return r;
        };

        // 删除：清理
        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            try {
                closePicker(this);
                releaseButtons(this);
                const st = this._xhCMP;
                if (st) {
                    for (const c of st.cells) {
                        try { c.videoEl.pause?.(); } catch (e) {}
                        try { c.videoEl.src = ""; } catch (e) {}
                    }
                }
            } catch (e) {}
            return origOnRemoved?.apply(this, arguments);
        };
    },
});

onLangChanged(() => applyLangToAll());
