// XiaoHei-声音播放 · 家族前端
// ① 中/EN 四处覆盖：节点标题 + 参数标签 + 输入/输出端口名 + 下拉选项文字
//    ⚠ 节点本体**不挂**中/EN 开关 —— 语言切换在节点上方的官方浮出工具条（全局 UI）。
// ② 节点本体只留一个大闹钟（默认静态、响铃时晃动 + 彩虹边框），所有参数收进齿轮设置面板
// ③ 玩法：后端把「放什么 / 多大声 / 何时放 / 是否掐上一声 / 是否循环」经 ui 字段回传，
//    这里 new Audio() 播放
//
//  循环播放（loop）的三条命门 —— 改这个文件前必读：
//   · audio.loop = true 之后**没有终点**，必须有地方能停，否则用户只能刷新页面；
//   · 所以工具条上必须有 ⏹；且「再跑一次工作流」也要能把上一轮的循环掐掉（监听 execution_start）；
//   · 播放中的 Audio 按**节点 id** 分开存（PLAYING Map）——
//     单例变量会让「A 节点放循环音乐、B 节点响一声」时把 A 掐死，
//     而「先掐掉上一声」的 tooltip 说的是「只掐本节点自己上一次放的那一声」，单例与说明不符。
//
// 铁律：只改 label / title，绝不改 name；绝不改 COMBO 的 values；工具条只 append 不 unshift。
const { app } = window.comfyAPI.app;

import { ensureLangBridge, makeXHToolbar, applyComboLabels, onLangChanged, releaseButtons , paintBarBtn, xhIconHTML, xhPlaceBeside, xhFollowAnchor, xhMakeDraggable} from "./xh_ui_kit.js";

ensureLangBridge();

const NODE_TYPE = "XHSoundPlayer";
// 用 import.meta.url 推导扩展根，别硬编码包名（包改名也不用动这里）
const SOUND_BASE = new URL("./", import.meta.url).href; // -> /extensions/<包名>/

const XH_I18N = {
    zh: {
        nodes: { XHSoundPlayer: "声音播放 XiaoHei" },
        widgets: {
            file: "音效文件",
            volume: "音量",
            mode: "播放时机",
            stop_previous: "先掐掉上一声",
            loop: "循环播放",
        },
        slots: { any: "任意信号", info: "信息" },
    },
    en: {
        nodes: { XHSoundPlayer: "Sound Player XiaoHei" },
        widgets: {
            file: "sound file",
            volume: "volume",
            mode: "when",
            stop_previous: "stop previous",
            loop: "loop",
        },
        slots: { any: "any", info: "info" },
    },
};

const COMBO_LABELS = {
    mode: { always: "立即播放", "on empty queue": "队列跑完再播" },
};

// 分类目录 -> 中文名（下拉里显示成「提示音 · 叮」）
const CAT_ZH = { ui: "提示音", sfx: "音效", music: "音乐", voice: "人声" };

function t(lang, kind, key) {
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack[kind] && pack[kind][key]) || null;
}

// "sfx/嗖.wav" -> "音效 · 嗖"
function fileLabel(v) {
    if (v == null) return "";
    const s = String(v);
    const i = s.indexOf("/");
    if (i < 0) return s; // "(音效库为空 · 见 tooltip)" 这类原样
    const cat = s.slice(0, i);
    const name = s.slice(i + 1).replace(/\.[^.]+$/, "");
    return (CAT_ZH[cat] || cat) + " · " + name;
}

function applyFileLabels(node, zh) {
    const w = (node.widgets || []).find((x) => x && x.name === "file");
    if (!w || !w.options) return;
    if (zh) {
        w.options.getOptionLabel = (v) => fileLabel(v);
    } else {
        try { delete w.options.getOptionLabel; } catch (e) {}
    }
}

function applyLang(node, lang) {
    if (!node) return;
    lang = lang || window.XH_LANG || "zh";
    const zh = lang === "zh";
    try {
        const want = t(lang, "nodes", NODE_TYPE);
        const zhT = XH_I18N.zh.nodes[NODE_TYPE];
        const enT = XH_I18N.en.nodes[NODE_TYPE];
        if (want && (!node.title || node.title === zhT || node.title === enT)) node.title = want;

        for (const w of node.widgets || []) {
            if (!w || !w.name) continue;
            const lb = t(lang, "widgets", w.name);
            if (lb) w.label = lb;
        }
        try { if (node._xhPlayingTag) node._xhPlayingTag.textContent = zh ? "提醒中" : "ALARM"; } catch (e) {}
        applyComboLabels(node, lang, COMBO_LABELS);
        applyFileLabels(node, zh);

        const applySlots = (arr) => {
            for (const s of arr || []) {
                if (!s) continue;
                const lb = t(lang, "slots", s.name);
                if (lb) s.label = lb;
            }
        };
        applySlots(node.inputs);
        applySlots(node.outputs);

        // 工具条上 ▶ / ⏹ /  的 hover 提示也跟着语言走
        try {
            const b = node._xhSoundBtns;
            if (b) {
                const tips = {
                    0: zh ? "试听当前选中的音效（不跑工作流）" : "Preview the selected sound (no workflow run)",
                    1: zh ? "停止正在播放的声音（循环播放时用它停）" : "Stop the sound that is playing",
                    2: zh ? "重扫音效库：加了新音频后点它（会刷新页面）" : "Rescan the sound library (reloads the page)",
                };
                b.forEach((el, i) => { if (el && tips[i]) el.title = tips[i]; });
            }
        } catch (e) {}

        try {
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        } catch (e) {}
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) {
        console.warn("Sound] 应用语言失败:", e);
    }
}

function nodesOfType() {
    try {
        return (app.graph?.nodes || app.graph?._nodes || []).filter((n) => n && n.type === NODE_TYPE);
    } catch (e) { return []; }
}

function applyLangToAll() {
    const lang = window.XH_LANG || "zh";
    for (const n of nodesOfType()) applyLang(n, lang);
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ---------------- 播放 ----------------
// 按节点分开存正在播的 Audio（见文件头「命门 ③」）
const PLAYING = new Map(); // nodeId -> Audio

function stopSound(node) {
    if (!node) return;
    const a = PLAYING.get(node.id);
    if (a) {
        try { a.pause(); } catch (e) {}
        PLAYING.delete(node.id);
    }
    setPlayingVisual(node, false);
}

function stopAll() {
    for (const n of nodesOfType()) {
        const a = PLAYING.get(n.id);
        if (a) { try { a.pause(); } catch (e) {} }
        PLAYING.delete(n.id);
        setPlayingVisual(n, false);
    }
    // 兜底：节点已被删掉的残留
    for (const [, a] of PLAYING) { try { a.pause(); } catch (e) {} }
    PLAYING.clear();
}

function playSound(node, rel, vol, stop, loop) {
    try {
        if (!rel) return;
        if (stop && node) {
            const prev = PLAYING.get(node.id);
            if (prev) {
                try { prev.pause(); } catch (e) {}
                PLAYING.delete(node.id);
            }
        }
        const url = SOUND_BASE + "sounds/" + String(rel).split("/").map(encodeURIComponent).join("/");
        const audio = new Audio(url);
        audio.volume = Math.min(1, Math.max(0, Number(vol) || 0));
        audio.loop = !!loop; //  循环开关就落在这一行
        if (node) PLAYING.set(node.id, audio);
        audio.addEventListener("ended", () => {
            if (node && PLAYING.get(node.id) === audio) {
                PLAYING.delete(node.id);
                setPlayingVisual(node, false);
            }
        });
        const p = audio.play();
        if (node) setPlayingVisual(node, true);
        if (p && typeof p.catch === "function") {
            p.catch((e) => {
                // 浏览器拦自动播放：把 ⏹ 恢复成「没在响」，否则按钮一直红着骗人
                if (node && PLAYING.get(node.id) === audio) {
                    PLAYING.delete(node.id);
                    setPlayingVisual(node, false);
                }
                console.warn("Sound] 浏览器拦下了自动播放，点一下页面任意处再试：", e);
            });
        }
    } catch (e) {
        console.warn("Sound] 播放失败:", e);
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playFromNode(node, rel, vol, mode, stop, loop) {
    // 「队列跑完再播」：等一会儿再确认一次队列确实空了
    if (mode === "on empty queue") {
        if (app.ui?.lastQueueSize !== 0) await sleep(500);
        if (app.ui?.lastQueueSize !== 0) return;
    }
    playSound(node, rel, vol, stop, loop);
}

function widgetValue(node, name) {
    const w = (node.widgets || []).find((x) => x && x.name === name);
    return w ? w.value : undefined;
}

// ---------------- 小按钮（家族规格：h22 / 深蓝底 / 亮蓝 hover）----------------
function miniBtn(text, tip) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.title = tip;

    b.style.cssText =
        "background:#252525;color:#e8e8e8;border:1px solid rgba(255,255,255,.10);border-radius:4px;" +
        "height:22px;min-width:26px;padding:0 9px;font-size:12px;font-weight:600;line-height:1;" +
        "cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto;";
    b.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    b.addEventListener("mouseenter", () => { b.style.filter = "brightness(1.28)"; });
    b.addEventListener("mouseleave", () => { b.style.filter = "none"; });
    return b;
}

// 家族矢量图标按钮（替换原来的 ▶ / ⏹ / 空字符串）
// 样式沿用 miniBtn 的家族规格，内部用 xhIconHTML 渲染，悬停走 brightness 提亮
function iconBtn(iconName, tip) {
    const b = miniBtn("", tip);
    try {
        b.innerHTML = xhIconHTML(iconName, { size: 16, color: "current" });
        // 图标是 mask span，强制撑满按钮中心
        b.style.padding = "0";
        b.querySelectorAll("span").forEach((s) => { s.style.display = "inline-flex"; });
    } catch (e) {}
    return b;
}

// 面板里的动作按钮（比节点上的更大）：图标 + 文字
function panelActBtn(label, iconName, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xh-sound-act-btn";
    try {
        b.innerHTML = xhIconHTML(iconName, { size: 16, color: "current" }) + "<span>" + label + "</span>";
    } catch (e) { b.textContent = label; }
    b.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
}

// 节点"脸"：一个大闹钟（可点击试听；响铃时左右晃动）
function bigClock() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xh-sound-clock";
    b.title = "试听当前选中的音效（不跑工作流）";
    b.style.cssText =
        "background:transparent;border:none;cursor:pointer;display:inline-flex;" +
        "align-items:center;justify-content:center;width:92px;height:92px;" +
        "color:#FFD23F;padding:0;";
    try { b.innerHTML = xhIconHTML("alarm-clock", { size: 78, color: "current" }); } catch (e) {}
    b.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    return b;
}

// 播放态小标（闹钟提醒态用「提醒中」闪烁）
function playingTag() {
    const tag = document.createElement("span");
    tag.className = "xh-sound-playing-tag";
    tag.textContent = "提醒中";
    tag.style.cssText =
        "display:none;position:absolute;top:6px;left:8px;font-size:10px;font-weight:800;" +
        "letter-spacing:.5px;color:#fff;background:#E5484D;border-radius:4px;padding:1px 6px;z-index:2;";
    return tag;
}

let _xhSoundStyleDone = false;
function ensureSoundStyle() {
    if (_xhSoundStyleDone) return;
    _xhSoundStyleDone = true;
    const css = `
/* 闹钟提醒态：整节点彩虹边框循环闪 + 大闹钟左右晃动 + 角标闪 */
.xh-sound-alarm{border:2px solid #FF4D4D !important;animation:xhSoundAlarm 1.1s linear infinite !important;}
@keyframes xhSoundAlarm{
  0%{border-color:#FF4D4D;}
  16%{border-color:#FFB454;}
  33%{border-color:#FFE14D;}
  50%{border-color:#5DE87A;}
  66%{border-color:#4DD0E1;}
  83%{border-color:#B07CFF;}
  100%{border-color:#FF4D4D;}
}
.xh-sound-alarm .xh-sound-clock{animation:xhSoundClock .5s ease-in-out infinite;transform-origin:50% 0;}
@keyframes xhSoundClock{0%,100%{transform:rotate(0);}20%{transform:rotate(-14deg);}40%{transform:rotate(14deg);}60%{transform:rotate(-9deg);}80%{transform:rotate(9deg);}}
.xh-sound-alarm .xh-sound-playing-tag{animation:xhSoundTagBlink .55s ease-in-out infinite;}
@keyframes xhSoundTagBlink{0%,100%{opacity:1;}50%{opacity:.25;}}
/* 齿轮设置面板：收起次要参数，点击齿轮从右侧滑出 */
.xh-sound-set{position:fixed;z-index:10026;width:300px;max-width:94vw;background:#2b2b2b;
  border:1px solid #3a3a3a;border-radius:10px;color:#e3e3e3;font:12px 'Segoe UI',-apple-system,sans-serif;
  box-shadow:0 16px 44px rgba(0,0,0,.55);overflow:hidden;display:flex;flex-direction:column;}
.xh-sound-set-t{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;
  background:#232323;border-bottom:1px solid #333;cursor:grab;user-select:none;}
.xh-sound-set-t .g{color:var(--xh-acc,#E8A33C);display:inline-flex;}
.xh-sound-set-t .n{font-size:13px;font-weight:600;color:#ededed;}
.xh-sound-set-t .x{margin-left:auto;color:#9a9a9a;cursor:pointer;padding:0 4px;}
.xh-sound-set-t .x:hover{color:#fff;}
.xh-sound-set-b{padding:14px 12px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;}
.xh-sound-set-row{display:flex;flex-direction:column;gap:6px;}
.xh-sound-set-row .lab{font-size:12px;color:#cfcfcf;display:flex;justify-content:space-between;gap:8px;}
.xh-sound-set-row .lab .v{color:var(--xh-acc,#E8A33C);}
.xh-sound-seg{display:flex;border:1px solid #4a4a4a;border-radius:6px;overflow:hidden;}
.xh-sound-seg div{flex:1;text-align:center;padding:6px 4px;font-size:12px;color:#bbb;cursor:pointer;user-select:none;}
.xh-sound-seg div.on{background:var(--xh-acc,#E8A33C);color:#1e1e22;font-weight:600;}
.xh-sound-tog{width:36px;height:19px;border-radius:10px;cursor:pointer;flex:0 0 auto;
  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);position:relative;transition:background .1s,border-color .1s;}
.xh-sound-tog .knob{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#bbb;transition:left .1s,background .1s;}
.xh-sound-tog.on{background:var(--xh-acc,#E8A33C);border-color:var(--xh-acc,#E8A33C);}
.xh-sound-tog.on .knob{left:19px;background:#fff;}
.xh-sound-range{width:100%;accent-color:var(--xh-acc,#E8A33C);cursor:pointer;}
.xh-sound-f{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px;border-top:1px solid #333;background:#1f1f1f;}
.xh-sound-act-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:1;padding:9px 6px;border-radius:6px;border:1px solid #4a4a4a;background:#2c2c33;color:#eee;font:12px 'Segoe UI',sans-serif;cursor:pointer;}
.xh-sound-act-btn:hover{border-color:var(--xh-acc,#E8A33C);color:#fff;}
.xh-sound-act-btn span{font-weight:600;}
.xh-sound-sel{width:100%;padding:7px;border-radius:6px;background:#1f1f1f;color:#eee;border:1px solid #4a4a4a;font:12px 'Segoe UI',sans-serif;}
@media (prefers-reduced-motion: reduce){
  .xh-sound-alarm{animation:none;}
  .xh-sound-alarm .xh-sound-clock{animation:none;}
  .xh-sound-alarm .xh-sound-playing-tag{animation:none;}
}`;
    const st = document.createElement("style");
    st.id = "xh-sound-style";
    st.textContent = css;
    document.head.appendChild(st);
}

// 播放态视觉：整节点彩虹闹钟闪 + 大闹钟左右晃动 + 「提醒中」角标闪
function setPlayingVisual(node, on) {
    if (!node) return;
    const tag = node._xhPlayingTag;
    const alarmEl = node._xhNodeEl || node._xhSoundBar;
    if (tag) tag.style.display = on ? "inline-block" : "none";
    if (alarmEl) alarmEl.classList.toggle("xh-sound-alarm", !!on);
}

// ---------------- 齿轮设置面板：收起次要参数，点击齿轮从右侧滑出 ----------------
// 面板里的控件直接读写 node.widgets 里对应 widget 的 .value（与节点本体同一个值对象），
// 所以改动即时生效、且随工作流存档；节点本体上这几个 widget 默认 hidden，只留「音效文件」可见。
let _xhSetPanel = null;
let _xhSetFollow = null;
function _xhGetW(node, name) { return (node.widgets || []).find((w) => w && w.name === name); }

function closeSoundPanel() {
    if (_xhSetFollow) { try { _xhSetFollow.destroy && _xhSetFollow.destroy(); } catch (e) {} _xhSetFollow = null; }
    if (_xhSetPanel) {
        try { _xhSetPanel._cleanup && _xhSetPanel._cleanup(); } catch (e) {}
        try { _xhSetPanel.remove(); } catch (e) {}
        _xhSetPanel = null;
    }
    document.removeEventListener("pointerdown", _xhSetOutside, true);
}
function _xhSetOutside(e) {
    if (_xhSetPanel && !_xhSetPanel.contains(e.target) && !e.target.closest?.("[data-xh-sound-gear]")) closeSoundPanel();
}

function openSoundPanel(node) {
    closeSoundPanel();
    const zh = (window.XH_LANG || "zh") === "zh";
    const panel = document.createElement("div");
    panel.className = "xh-sound-set";
    panel.style.setProperty("--xh-acc", "var(--xh-primary,#E8A33C)");

    const head = document.createElement("div");
    head.className = "xh-sound-set-t";
    const g = document.createElement("span");
    g.className = "g";
    try { g.innerHTML = xhIconHTML("settings", { size: 14, color: "current" }); } catch (e) {}
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = zh ? "声音播放 设置" : "Sound Player settings";
    const x = document.createElement("span");
    x.className = "x";
    //  2026-11-13 家族图标统一：Unicode ✕ → 图标库「关闭」→ x。
    x.innerHTML = xhIconHTML("关闭", { size: 12, color: "current" });
    x.addEventListener("click", (e) => { e.stopPropagation(); closeSoundPanel(); });
    head.append(g, n, x);

    const body = document.createElement("div");
    body.className = "xh-sound-set-b";

    // 音效文件（下拉，从节点本体收进面板）
    (function () {
        const w = _xhGetW(node, "file");
        if (!w) return;
        const row = document.createElement("div"); row.className = "xh-sound-set-row";
        const lab = document.createElement("div"); lab.className = "lab";
        const lname = document.createElement("span"); lname.textContent = zh ? "音效文件" : "sound file";
        lab.appendChild(lname);
        const sel = document.createElement("select"); sel.className = "xh-sound-sel";
        const vals = (w.options && w.options.values) || [];
        for (const v of vals) {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = (zh && w.options && w.options.getOptionLabel) ? w.options.getOptionLabel(v) : v;
            sel.appendChild(o);
        }
        sel.value = w.value;
        sel.addEventListener("change", () => {
            w.value = sel.value;
            try { w.callback && w.callback(w.value); } catch (e) {}
        });
        row.append(lab, sel); body.appendChild(row);
    })();

    // 音量（滑块）
    (function () {
        const w = _xhGetW(node, "volume");
        if (!w) return;
        const row = document.createElement("div"); row.className = "xh-sound-set-row";
        const lab = document.createElement("div"); lab.className = "lab";
        const lname = document.createElement("span"); lname.textContent = zh ? "音量" : "volume";
        const lval = document.createElement("span"); lval.className = "v";
        const rng = document.createElement("input");
        rng.type = "range"; rng.min = "0"; rng.max = "1"; rng.step = "0.01";
        rng.className = "xh-sound-range";
        rng.value = String(Number(w.value ?? 0.6));
        const paint = () => { lval.textContent = Number(rng.value).toFixed(2); };
        paint();
        rng.addEventListener("input", () => {
            w.value = Number(rng.value); paint();
            try { w.callback && w.callback(w.value); } catch (e) {}
        });
        lab.append(lname, lval); row.append(lab, rng); body.appendChild(row);
    })();

    // 播放时机（分段按钮）
    (function () {
        const w = _xhGetW(node, "mode");
        if (!w) return;
        const row = document.createElement("div"); row.className = "xh-sound-set-row";
        const lab = document.createElement("div"); lab.className = "lab";
        const lname = document.createElement("span"); lname.textContent = zh ? "播放时机" : "when";
        lab.appendChild(lname);
        const seg = document.createElement("div"); seg.className = "xh-sound-seg";
        const opts = [["always", zh ? "立即播放" : "play now"], ["on empty queue", zh ? "队列跑完再播" : "after queue"]];
        const cells = opts.map(([val, txt]) => {
            const d = document.createElement("div");
            d.textContent = txt;
            if (w.value === val) d.classList.add("on");
            d.addEventListener("click", () => {
                w.value = val;
                cells.forEach((c) => c.classList.remove("on"));
                d.classList.add("on");
                try { w.callback && w.callback(w.value); } catch (e) {}
            });
            seg.appendChild(d); return d;
        });
        row.append(lab, seg); body.appendChild(row);
    })();

    // 开关行工厂：先掐掉上一声 / 循环播放
    const toggleRow = (name, label) => {
        const w = _xhGetW(node, name);
        if (!w) return;
        const row = document.createElement("div"); row.className = "xh-sound-set-row";
        const lab = document.createElement("div"); lab.className = "lab";
        const lname = document.createElement("span"); lname.textContent = label;
        const tog = document.createElement("div");
        tog.className = "xh-sound-tog" + (w.value ? " on" : "");
        const knob = document.createElement("span"); knob.className = "knob";
        tog.appendChild(knob);
        tog.addEventListener("click", () => {
            w.value = !w.value;
            tog.classList.toggle("on", !!w.value);
            try { w.callback && w.callback(w.value); } catch (e) {}
        });
        lab.appendChild(lname); row.append(lab, tog); body.appendChild(row);
    };
    toggleRow("stop_previous", zh ? "先掐掉上一声" : "stop previous");
    toggleRow("loop", zh ? "循环播放" : "loop");

    const foot = document.createElement("div"); foot.className = "xh-sound-f";
    foot.appendChild(panelActBtn(zh ? "试听" : "Preview", "play", () =>
        playSound(node, widgetValue(node, "file"), widgetValue(node, "volume"), true, !!widgetValue(node, "loop"))));
    foot.appendChild(panelActBtn(zh ? "停止" : "Stop", "circle-stop", () => stopSound(node)));
    foot.appendChild(panelActBtn(zh ? "重扫" : "Rescan", "refresh-cw", () => location.reload()));
    foot.appendChild(panelActBtn(zh ? "完成" : "Done", "x", () => closeSoundPanel()));

    panel.append(head, body, foot);
    document.body.appendChild(panel);
    _xhSetPanel = panel;

    const anchor = node._xhSoundBar || node.element;
    xhPlaceBeside(panel, anchor ? anchor.getBoundingClientRect() : null, { gap: 10 });
    _xhSetFollow = xhFollowAnchor(panel, anchor, { gap: 10 });
    xhMakeDraggable(panel, head, () => { try { _xhSetFollow && _xhSetFollow.markUserMoved && _xhSetFollow.markUserMoved(); } catch (e) {} });

    setTimeout(() => document.addEventListener("pointerdown", _xhSetOutside, true), 0);
}

// ---------------- 再跑一次时，把上一轮的循环掐掉 ----------------
// 不这么做：上一轮的音乐还在响，新的要等整条链跑完才盖上去，中间这段会很乱。
function hookQueueStart() {
    const api = (() => {
        try { if (window.comfyAPI?.api?.api) return window.comfyAPI.api.api; } catch (e) {}
        try { if (app?.api?.addEventListener) return app.api; } catch (e) {}
        try { if (window.api?.addEventListener) return window.api; } catch (e) {}
        return null;
    })();
    if (!api || api.__xhSoundHooked) return;
    try {
        api.addEventListener("execution_start", () => stopAll());
        api.__xhSoundHooked = true;
    } catch (e) {
        console.warn("Sound] 监听 execution_start 失败（循环音乐将不会自动停）:", e);
    }
}

app.registerExtension({
    name: "XH.SoundPlayer",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        // ③ 后端执行完 -> 播
        const origExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            origExecuted?.apply(this, arguments);
            try {
                const d = message?.xh_sound;
                if (!d || !d.length) return;
                const [rel, vol, mode, stop, loop] = d;
                playFromNode(this, rel, vol, mode, stop, loop);
            } catch (e) {
                console.warn("Sound] 处理执行结果失败:", e);
            }
        };

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            const node = this;
            try {
                ensureSoundStyle();

                // 节点本体：只留一个大闹钟（默认静态，响铃时左右晃动） + 右上角小齿轮
                const tag = playingTag();
                const clock = bigClock();
                clock.addEventListener("click", (e) => {
                    e.stopPropagation();
                    playSound(node, widgetValue(node, "file"), widgetValue(node, "volume"),
                              true, !!widgetValue(node, "loop"));
                });

                // 齿轮：点它把所有参数（音效文件 / 音量 / 播放时机 / 先掐上一声 / 循环）从右侧设置面板收起/展开
                const gearBtn = iconBtn("settings", (window.XH_LANG || "zh") === "zh"
                    ? "设置（音效文件 / 音量 / 播放时机 / 先掐上一声 / 循环）"
                    : "settings (sound file / volume / when / stop previous / loop)");
                gearBtn.dataset.xhSoundGear = "1";
                gearBtn.style.cssText += "position:absolute;top:6px;right:6px;width:24px;height:24px;";
                gearBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openSoundPanel(node);
                });

                const wrap = document.createElement("div");
                wrap.style.cssText =
                    "position:relative;display:flex;align-items:center;justify-content:center;" +
                    "width:100%;min-height:104px;";
                wrap.append(tag, clock, gearBtn);

                node._xhPlayingTag = tag;
                node._xhClock = clock;
                node._xhNodeEl = this.element; // 整节点 DOM，用于闹钟彩虹闪 + 晃动

                const { bar } = makeXHToolbar(this, {
                    widgetName: "xh_sound_bar",
                    appendNodes: [wrap],
                    // 工具条行高放开到能装下 92px 大闹钟（含晃动余量），否则会被默认 28px 条框裁掉
                    barHeight: 116,
                    // 铁律：节点本体不挂中/EN 开关 —— 从根上不让工具条生成语言键，
                    // 语言切换交给节点上方的官方浮出工具条（全局 UI，不算"节点上面"）。
                    noLang: true,
                });
                node._xhSoundBar = bar;

                // 全部参数收进齿轮设置面板，节点本体只留大闹钟
                for (const name of ["file", "volume", "mode", "stop_previous", "loop"]) {
                    const w = (this.widgets || []).find((x) => x && x.name === name);
                    if (w) {
                        w.hidden = true;
                        if (w.element) w.element.style.display = "none";
                    }
                }

                hookQueueStart();
                applyLang(this);
            } catch (e) {
                console.warn("SoundPlayer] 工具栏创建失败:", e);
            }
            return r;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            try { stopSound(this); } catch (e) {}
            try { if (_xhSetPanel) closeSoundPanel(); } catch (e) {}
            releaseButtons(this);
            return origOnRemoved?.apply(this, arguments);
        };
    },

    async setup() {
        hookQueueStart();
        onLangChanged(() => applyLangToAll());
    },
});
