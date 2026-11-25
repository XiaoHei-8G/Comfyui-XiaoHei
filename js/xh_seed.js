// XiaoHei-种子 · 家族前端
//
// ① 复刻 rgthree-comfy Seed 的**核心机制**（2026-10-09 逐行核对源码 py/seed.py + web/comfyui/seed.ts）：
//    种子在「前端排队瞬间」就被换成真种子——
//      · 包一层 api.queuePrompt：提交前扫 prompt.output 里所有 XHSeed 节点，
//        seed ∈ {-1 每次随机, -2 上次+1, -3 上次-1} ⇒ 算出真种子，**同时改**：
//          ① API prompt 的 inputs.seed（真正执行的值）
//          ② 工作流存档 widgets_values（出图元数据里记录的是真种子，可复现）
//          ③ 工作流存档 properties.last_seed（重启后" 用上次"仍可用，比 rgthree 多的）
//      · 子图内的种子节点也支持（output key 形如 "实例id:内部id"，取末段匹配）。
//      · 存档里永远是 -1（= 每次随机），下次出图又是新种子；后端只做兜底（见 controls/seed.py）。
//
// ② 界面（2026-10-09 按 XiaoHei 家族规范重写）：
//      · 标准工具条（中/EN + ）→ 唯一实现在 web/xh_ui_kit.js
//      · 中英双语三张表（nodes / widgets / slots）+ 语言桥（切一个节点，全家跟着切）
//      · 三个功能键改成 **DOM 真按钮**（家族配色）：
//          按下 = scale(0.93) + 压暗回弹；点完 = 按钮上闪 " 值"；
//          再叠一条**状态条闪烁**（绿底 +  文案），1.6s 后自动回落。
//           不再用 LiteGraph 的 addWidget("button") —— canvas 画的按钮点下去没有任何视觉反馈。
//      · **常驻状态条**：随时能看到"现在到底是什么种子"（-1 每次随机 / 固定 123456 / 上次+1 …），
//        排队成功后还会闪 " 本次出图用：xxxxxx"（真种子，可直接抄去复现）。
//      · 载入存档后的恢复逻辑挂 onConfigure（onNodeCreated 时 widgets 还是默认值）。
//
// 铁律：只改 label / title 不改 name；DOM 控件一律 serialize:false；
//        父容器/包裹层拦截事件只用**冒泡**，绝不用捕获（2026-10-09 血案：捕获会把按钮自己的 handler 掐死）。
const { app } = window.comfyAPI.app;

import { ensureLangBridge, makeXHToolbar, onLangChanged, releaseButtons, currentLang, lockDomWidgetHeight , paintBarBtn} from "./xh_ui_kit.js";

ensureLangBridge();
const NODE_TYPE = "XHSeed";

// ---- 文案表（家族规范：nodes / widgets / slots 三张 + ui 自用文案）----
const XH_I18N = {
    zh: {
        nodes: { XHSeed: "种子 XiaoHei" },
        widgets: { seed: "种子" },
        slots: { SEED: "种子" },
        ui: {
            btnRandom: " 每次随机",
            btnFixed: " 生成固定值",
            btnLast: " 用上次",
            btnLastNone: " 暂无",
            btnCopy: " 复制",
            tipRandom: "设成 -1：每次出图都换新种子（推荐）",
            tipFixed: "立刻摇一个随机数字当成固定种子（可复现）",
            tipLast: "把上一次实际用过的种子填回来",
            tipCopy: "复制当前种子（随机模式下复制的是本次/上次真正跑过的种子）",
            tipUp: "种子 +1（-1/-2/-3 会先按语义解析成具体数字再加）",
            tipDown: "种子 -1（-1/-2/-3 会先按语义解析成具体数字再减）",
            noLast: "还没有上次种子（先跑一次图）",
            txtRandom: " 每次出图都随机",
            txtInc: " 上次种子 +1",
            txtDec: " 上次种子 -1",
            txtFixed: " 固定种子：{v}",
            used: " 本次出图用：{v}",
            copied: " 已复制到剪贴板",
            copyFail: " 复制失败",
            histTitle: "最近跑过的种子",
            histEmpty: "还没有记录，跑一次图就会记下（最多留 10 条）",
            histClear: "清空",
            histTip: "点这里看最近跑过的种子（最多 10 条）",
            histCopyTip: "复制这个种子",
            ok: "",
        },
    },
    en: {
        nodes: { XHSeed: "Seed XiaoHei" },
        widgets: { seed: "seed" },
        slots: { SEED: "SEED" },
        ui: {
            btnRandom: " Random",
            btnFixed: " Roll fixed",
            btnLast: " Reuse last",
            btnLastNone: " None yet",
            btnCopy: " Copy",
            tipRandom: "Set -1: a fresh seed every run (recommended)",
            tipFixed: "Roll a random number and lock it as a fixed seed",
            tipLast: "Put back the seed actually used last time",
            tipCopy: "Copy the current seed (in Random mode it copies the seed that really ran)",
            tipUp: "Seed +1 (-1 / -2 / -3 resolves to a concrete number first)",
            tipDown: "Seed -1 (-1 / -2 / -3 resolves to a concrete number first)",
            noLast: "No last seed yet (run once first)",
            txtRandom: " Randomize every run",
            txtInc: " Last seed + 1",
            txtDec: " Last seed - 1",
            txtFixed: " Fixed seed: {v}",
            used: " Used this run: {v}",
            copied: " Copied to clipboard",
            copyFail: " Copy failed",
            histTitle: "Recent seeds",
            histEmpty: "No records yet - run once to start (keeps the last 10)",
            histClear: "Clear",
            histTip: "Click to see the recent seeds (last 10)",
            histCopyTip: "Copy this seed",
            ok: "",
        },
    },
};

function uiText(lang) {
    const p = XH_I18N[lang] || XH_I18N.zh;
    return p.ui;
}
function t(lang, kind, key) {
    const pack = XH_I18N[lang] || XH_I18N.zh;
    return (pack[kind] && pack[kind][key]) || null;
}

// ---- 特殊种子（与后端 controls/seed.py 逐字一致）----
const SEED_RANDOM = -1;
const SEED_INCREMENT = -2;
const SEED_DECREMENT = -3;
const SPECIALS = [SEED_RANDOM, SEED_INCREMENT, SEED_DECREMENT];
const MAX_SEED = 1125899906842624; // 2^50，与 rgthree / 后端一致

// 跑过的种子记录（第 1 次、第 2 次…），存 node.properties，跟存档一起走。
const HIST_PROP = "seed_history";
const HIST_MAX = 10;

/** 清掉历史里的非法项：只认真正的数字（null/""/"abc" 这类一律丢，绝不能被 Number() 变成 0）。 */
function cleanHist(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((x) => typeof x === "number" && Number.isFinite(x) && !SPECIALS.includes(x))
        .map((x) => Math.floor(x))
        .slice(0, HIST_MAX);
}

/** 合并一条记录进历史：最新的在最前，同值去重，最多 HIST_MAX 条。 */
function mergeHistory(raw, seed) {
    const cur = cleanHist(raw);
    const s = Number(seed);
    if (typeof seed !== "number" || !Number.isFinite(s) || SPECIALS.includes(s)) return cur;
    const v = Math.floor(s);
    if (cur[0] === v) return cur;
    return [v, ...cur.filter((n) => n !== v)].slice(0, HIST_MAX);
}

function getHistory(node) {
    return mergeHistory(node && node.properties ? node.properties[HIST_PROP] : null, NaN);
}

function pushHistory(node, seed) {
    if (!node) return;
    const next = mergeHistory(getHistory(node), seed);
    if (!next.length) return;
    if (!node.properties) node.properties = {};
    node.properties[HIST_PROP] = next;
}

function randSeed() {
    let s = Math.floor(Math.random() * MAX_SEED);
    if (SPECIALS.includes(s)) s = 0; // 撞上特殊值就给 0（照抄 rgthree）
    return s;
}

// ── 活实例登记（排队后要刷新界面状态；子图内部节点也能被 onNodeCreated 登记到）──
const live = new Set();

function findWfNode(workflow, idStr) {
    if (!workflow) return null;
    for (const n of workflow.nodes || []) {
        if (String(n.id) === idStr) return n;
    }
    for (const sg of ((workflow.definitions || {}).subgraphs) || []) {
        for (const n of sg.nodes || []) {
            if (String(n.id) === idStr) return n;
        }
    }
    return null;
}

function patchPrompt(prompt) {
    const output = prompt && prompt.output;
    if (!output) return;
    for (const key of Object.keys(output)) {
        const entry = output[key];
        if (!entry || entry.class_type !== "XHSeed") continue;
        const inputs = entry.inputs;
        if (!inputs || inputs.seed === undefined) continue;
        const cur = Number(inputs.seed);

        const idStr = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
        const wfNode = findWfNode(prompt.workflow, idStr);

        // 固定种子：不改 inputs（本来就是真值），只把"这次确实用了这个值"记进历史。
        // 同值连跑只留一条，所以刷图不会把列表灌满；不打 flash，免得每跑一次就闪一下。
        if (!SPECIALS.includes(cur)) {
            if (wfNode) {
                if (!wfNode.properties) wfNode.properties = {};
                wfNode.properties.last_seed = cur;
                wfNode.properties[HIST_PROP] = mergeHistory(wfNode.properties[HIST_PROP], cur);
            }
            for (const n of live) {
                if (String(n.id) !== idStr) continue;
                if (!n.properties) n.properties = {};
                n.properties.last_seed = cur;
                pushHistory(n, cur);
                updateLastBtn(n);
                if (_histPanel && _histPanel.style.display !== "none" && _histNode === n) renderHist(n);
            }
            continue;
        }

        const last = wfNode && wfNode.properties ? wfNode.properties.last_seed : undefined;

        // 照抄 rgthree 的 getSeedToUse：±1 只有在"上次是真种子"时才生效，否则退回随机
        let s;
        if (cur === SEED_INCREMENT && typeof last === "number" && !SPECIALS.includes(last)) s = last + 1;
        else if (cur === SEED_DECREMENT && typeof last === "number" && !SPECIALS.includes(last)) s = last - 1;
        else s = randSeed();
        if (!Number.isFinite(s) || SPECIALS.includes(s)) s = randSeed();
        s = Math.max(-MAX_SEED, Math.min(MAX_SEED, Math.floor(s)));

        // ① API prompt：真正执行的种子
        inputs.seed = s;
        // ② 工作流存档：元数据可复现
        if (wfNode) {
            if (Array.isArray(wfNode.widgets_values)) {
                const i = wfNode.widgets_values.findIndex((v) => Number(v) === cur);
                if (i >= 0) wfNode.widgets_values[i] = s;
            }
            if (!wfNode.properties) wfNode.properties = {};
            wfNode.properties.last_seed = s;
            // 同一条也记进存档里的历史列表（出图元数据/工作流里都带着第 1、2、3 次）
            wfNode.properties[HIST_PROP] = mergeHistory(wfNode.properties[HIST_PROP], s);
        }
        // ③ 界面反馈：状态条闪 " 本次出图用：xxx" + 「用上次」按钮点亮
        for (const n of live) {
            if (String(n.id) === idStr && typeof n.__xhSeedGotSeed === "function") {
                try { n.__xhSeedGotSeed(s); } catch (e) {}
            }
        }
    }
}

// ── 拦截排队（只包一层，防重复包裹）──
const apiNS = window.comfyAPI && window.comfyAPI.api;
const api = apiNS && apiNS.api;
if (!api) {
    console.warn("[XiaoHei-种子] 拿不到 comfyAPI.api，随机种子回退为后端兜底模式");
} else if (!api.__xhSeedHooked) {
    api.__xhSeedHooked = true;
    const origQueuePrompt = api.queuePrompt;
    api.queuePrompt = async function (index, prompt, ...args) {
        try { patchPrompt(prompt); } catch (e) { console.warn("[XiaoHei-种子] 换种子失败:", e); }
        return origQueuePrompt.call(this, index, prompt, ...args);
    };
}

// ══════════════ 界面：按钮 / 状态条（家族 DOM 控件）══════════════

/** 按下动效：缩一下 + 压暗，110ms 回弹（给"我点到了"的即时手感）。 */
function pressBtn(b) {
    try {
        b.style.transform = "scale(0.93)";
        b.style.filter = "brightness(0.85)";
        setTimeout(() => {
            b.style.transform = "";
            if (!b._xhFlashing) b.style.filter = "none";
        }, 110);
    } catch (e) {}
}

/** 点完的确认反馈：按钮文字临时变 " xxx" 并提亮，ms 后恢复（恢复值取 _baseText，避免被旧文案顶掉）。 */
function flashBtn(b, text, ms) {
    if (!b) return;
    try {
        b._xhFlashing = true;
        b.textContent = text;
        b.style.filter = "brightness(1.5)";
        clearTimeout(b._xhFlashT);
        b._xhFlashT = setTimeout(() => {
            b._xhFlashing = false;
            b.textContent = b._baseText || text;
            b.style.filter = "none";
            b._xhFlashT = 0;
        }, ms || 900);
    } catch (e) {}
}

function seedValue(node) {
    const v = Number(node && node.seedWidget ? node.seedWidget.value : NaN);
    return Number.isFinite(v) ? v : SEED_RANDOM;
}

/** 状态条常驻文案：现在到底是什么种子。
 *  刻意不在状态条里重复那串长数字 —— 节点 240 宽时装不下 16 位，会被截成
 *  "112589…"，看着像真值其实不是。数字放在「用上次」按钮和「复制」的 tooltip 上。 */
function statusText(node) {
    const L = uiText(currentLang());
    const v = seedValue(node);
    if (v === SEED_RANDOM) return L.txtRandom;
    if (v === SEED_INCREMENT) return L.txtInc;
    if (v === SEED_DECREMENT) return L.txtDec;
    return L.txtFixed.replace("{v}", v);
}

/** 剪贴板：优先 navigator.clipboard；http://局域网IP 这类非安全上下文回退 execCommand。 */
function copyText(text, cb) {
    const legacy = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
        let ok = false;
        try {
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ok = document.execCommand("copy");
        } catch (e) {
            ok = false;
        } finally {
            ta.remove();
        }
        cb(ok);
    };
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => cb(true)).catch(legacy);
            return;
        }
    } catch (e) {}
    legacy();
}

/** 要复制的值：数字态=当前值；随机/-2/-3 态=本次（上次）真种子；两样都没有就原样给 -1。 */
function seedToCopy(node) {
    const v = seedValue(node);
    const last = node.properties ? node.properties.last_seed : undefined;
    const hasLast = typeof last === "number" && !SPECIALS.includes(last);
    if (!SPECIALS.includes(v)) return v;
    if (hasLast) return last;
    return v;
}

/** 微调 1：数字态直接 ±1；-1/-2/-3 先按语义解析成具体数字（没有上次就先摇一个），落地成固定值。
 *  -1 → 上次（无则随机）  -2 → 上次+1  -3 → 上次-1，再各自叠加本次的 ±1。 */
function stepSeed(node, dir) {
    const L = uiText(currentLang());
    const v = seedValue(node);
    const last = node.properties ? node.properties.last_seed : undefined;
    const hasLast = typeof last === "number" && !SPECIALS.includes(last);
    let base;
    if (v === SEED_INCREMENT) base = hasLast ? last + 1 : null;
    else if (v === SEED_DECREMENT) base = hasLast ? last - 1 : null;
    else if (v === SEED_RANDOM) base = hasLast ? last : null;
    else base = v;
    if (base == null) base = randSeed();
    const next = Math.max(-MAX_SEED, Math.min(MAX_SEED, Math.floor(base + dir)));
    setSeed(node, next);
    flashStatus(node, " " + L.txtFixed.replace("{v}", next), 1600);
}

/** 状态条里的小方钮（±1 / 复制）：和状态文本同一行，不额外占一行高度。 */
function makeMiniBtn(node, key, label, tip, width, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = tip || "";
    b.style.cssText = "flex:0 0 auto;width:" + width + "px;height:20px;padding:0;margin:0;"
        + "display:flex;align-items:center;justify-content:center;"
        + "border:1px solid rgba(255,255,255,0.22);border-radius:5px;"
        + "background:rgba(255,255,255,0.14);color:#ffffff;"
        + "font-family:inherit;font-size:10px;line-height:1;font-weight:700;cursor:pointer;"
        + "user-select:none;appearance:none;-webkit-appearance:none;transition:filter .15s,transform .08s;";
    b.onmouseenter = () => { b.style.filter = "brightness(1.25)"; };
    b.onmouseleave = () => { if (!b._xhFlashing) b.style.filter = "none"; };
    b.onclick = (e) => {
        e.stopPropagation();
        pressBtn(b);
        try { onClick(b); } catch (err) { console.warn("[XiaoHei-种子] 小按钮失败:", err); }
    };
    node._xhSeedMini = node._xhSeedMini || {};
    node._xhSeedMini[key] = b;
    return b;
}

function refreshStatus(node) {
    const el = node && node._xhSeedStatusEl;
    const tx = node && node._xhSeedStatusTx;
    if (!el || !tx) return;
    try {
        // 「复制」按钮的 tooltip 跟着种子走 —— 长数字在状态条里会截断，这里给全量。
        const L = uiText(currentLang());
        const cp = node._xhSeedMini && node._xhSeedMini.copy;
        if (cp) cp.title = L.tipCopy + "  ·  " + seedToCopy(node);
        const f = node._xhSeedFlash;
        if (f && Date.now() < f.until) {
            tx.textContent = f.msg;
            el.style.background = "rgba(39,174,96,0.45)";       // 家族绿
            el.style.boxShadow = "0 0 0 2px rgba(39,174,96,0.55)";
        } else {
            node._xhSeedFlash = null;
            tx.textContent = statusText(node);
            el.style.background = "rgba(255,255,255,0.10)";
            el.style.boxShadow = "none";
        }
        node.setDirtyCanvas && node.setDirtyCanvas(true, true);
    } catch (e) {}
}

/** 状态条闪一下（点按钮 / 排队后都用它当"事情办成了"的信号）。 */
function flashStatus(node, msg, ms) {
    if (!node || !node._xhSeedStatusEl) return;
    node._xhSeedFlash = { msg, until: Date.now() + (ms || 1600) };
    clearTimeout(node._xhSeedFlashT);
    refreshStatus(node);
    node._xhSeedFlashT = setTimeout(() => { node._xhSeedFlash = null; refreshStatus(node); }, (ms || 1600) + 80);
}

function setSeed(node, v) {
    if (node && node.seedWidget) node.seedWidget.value = v;
    refreshStatus(node);
    try { node.setDirtyCanvas && node.setDirtyCanvas(true, true); } catch (e) {}
}

/** 「 用上次」按钮：没有上次种子就灰掉并禁用。 */
function updateLastBtn(node) {
    const b = node && node._xhSeedBtns && node._xhSeedBtns.last;
    if (!b) return;
    const L = uiText(currentLang());
    const last = node.properties ? node.properties.last_seed : undefined;
    const ok = typeof last === "number" && !SPECIALS.includes(last);
    b._baseText = ok ? `${L.btnLast}: ${last}` : L.btnLastNone;
    if (!b._xhFlashing) b.textContent = b._baseText;
    b.disabled = !ok;
    b.title = ok ? L.tipLast : L.noLast;
    //  2026-10-29：家族金 → 官方白键（换肤统一）；禁用态改家族暗底 + 次要灰字。
    b.style.background = ok ? "#e8e8e8" : "#252525";
    b.style.color = ok ? "#1c1c1c" : "#8a8a8a";
    b.style.cursor = ok ? "pointer" : "not-allowed";
    b.style.opacity = ok ? "1" : "0.55";
}

/** 语言切换 / 载入后：把按钮文字、状态条一起刷成当前语言。 */
function refreshUI(node) {
    if (!node) return;
    const L = uiText(currentLang());
    const bs = node._xhSeedBtns;
    if (bs) {
        const tips = { random: L.tipRandom, fixed: L.tipFixed, copy: L.tipCopy };
        for (const [k, txt] of [["random", L.btnRandom], ["fixed", L.btnFixed], ["copy", L.btnCopy]]) {
            const b = bs[k];
            if (!b) continue;
            b._baseText = txt;
            if (!b._xhFlashing) b.textContent = txt;
            b.title = tips[k] || "";
        }
    }
    const mb = node._xhSeedMini;
    if (mb) {
        if (mb.up) mb.up.title = L.tipUp;
        if (mb.down) mb.down.title = L.tipDown;
        if (mb.copy) {
            mb.copy.title = L.tipCopy;
            mb.copy._baseText = L.btnCopy;
            if (!mb.copy._xhFlashing) mb.copy.textContent = L.btnCopy;
        }
    }
    if (node._xhSeedStatusTx) node._xhSeedStatusTx.title = L.histTip;
    updateLastBtn(node);
    refreshStatus(node);
}

/** 三个功能键（DOM 真按钮，家族配色；serialize:false 不进存档）。 */
function makeBtnBar(node) {
    const L = uiText(currentLang());
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:6px;padding:4px 6px;width:100%;box-sizing:border-box;flex-wrap:wrap;background:transparent;";

    const mk = (text, color, fn, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b._baseText = text;
        b.textContent = text;
        b.title = tip || "";
        // flex:1 1 auto + min-width —— 窄节点自动换行，不会把文字挤成一片省略号
        paintBarBtn(b, "primary");      // 原动态传色 → 统一 primary 蓝
        //  2026-10-29 修死代码：原第 3 行末尾多了个分号 ⇒ 后两段 CSS 从未生效。
        //   · nowrap+ellipsis 与上方「窄节点自动换行、不要省略号」本意相反 ⇒ **删除**；
        //   · transition 里的 transform .08s 是**需要的**（按下有 scale(0.93) 动画）⇒ 接回。
        b.style.cssText = b.style.cssText
            + "flex:1 1 auto;min-width:74px;box-sizing:border-box;"
            + "padding:5px 6px;font-size:11px;line-height:1.3;"
            + "transition:filter .15s,transform .08s,background .15s;";
        b.onmouseenter = () => { if (!b.disabled) b.style.filter = "brightness(1.2)"; };
        b.onmouseleave = () => { if (!b._xhFlashing) b.style.filter = "none"; };
        b.onclick = (e) => {
            e.stopPropagation();
            pressBtn(b);
            try { fn(b); } catch (err) { console.warn("[XiaoHei-种子] 按钮回调失败:", err); }
        };
        bar.appendChild(b);
        return b;
    };

    const btnRandom = mk(L.btnRandom, "#8a8a8a", (b) => {
        setSeed(node, SEED_RANDOM);
        flashBtn(b, " -1", 900);
        flashStatus(node, " " + L.txtRandom, 1600);
    }, L.tipRandom);

    const btnFixed = mk(L.btnFixed, "#4BA14B", (b) => {
        const s = randSeed();
        setSeed(node, s);
        flashBtn(b, " " + s, 1200);
        flashStatus(node, " " + L.txtFixed.replace("{v}", s), 1800);
    }, L.tipFixed);

    const btnLast = mk(L.btnLast, "#DCA02B", (b) => {
        const last = node.properties ? node.properties.last_seed : undefined;
        if (typeof last === "number" && !SPECIALS.includes(last)) {
            setSeed(node, last);
            flashBtn(b, " " + last, 1200);
            flashStatus(node, " " + L.txtFixed.replace("{v}", last), 1800);
        } else {
            flashStatus(node, " " + L.noLast, 1800);
        }
    }, L.tipLast);

    node._xhSeedBtns = { random: btnRandom, fixed: btnFixed, last: btnLast };

    //  冒泡阶段拦截（绝不用捕获 —— 捕获会掐死按钮自己的 handler）
    ["pointerdown", "mousedown", "dblclick", "click", "keydown"].forEach((ev) =>
        bar.addEventListener(ev, (e) => e.stopPropagation())
    );

    let w = null;
    try {
        w = node.addDOMWidget("xh_seed_buttons", "custom", bar, {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => 30,
        });
    } catch (e) {
        console.warn("[XiaoHei-种子] 按钮条挂载失败:", e);
    }
    //  2026-10-13 修复：按钮条只给了 getMinHeight，没 computeSize → 基类 computeLayoutSize 让它「可生长」，
    //    节点拖高后多余空间全灌进按钮条。钉死固定高度。
    //     2026-10-14 补：只写 computeSize 对 **Vue Nodes 无效**（行高只看 hasLayoutSize）⇒ 改 lockDomWidgetHeight。
    lockDomWidgetHeight(w, 30);
    return w;
}

// ── 种子记录浮层（点状态条文本弹出；只读 node.properties.seed_history）──
// 单例元素挂 document.body —— DOM widget 的容器会裁切溢出，浮层必须跳出节点。
let _histPanel = null;
let _histNode = null;

function ensureHistPanel() {
    if (_histPanel) return _histPanel;
    const p = document.createElement("div");
    p.style.cssText = "position:fixed;z-index:2147483000;display:none;box-sizing:border-box;width:270px;"
        + "background:#1b1c1e;border:1px solid #3a3d40;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.55);"
        + "padding:8px;font-family:system-ui,-apple-system,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;color:#ddd;";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
    const title = document.createElement("div");
    title.className = "xh-hist-title";
    title.style.cssText = "flex:1 1 auto;min-width:0;font-size:11px;font-weight:700;color:#9be89b;"
        + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "xh-hist-clear";
    clear.style.cssText = "flex:0 0 auto;padding:3px 7px;border:1px solid rgba(255,255,255,.18);border-radius:5px;"
        + "background:rgba(255,255,255,.06);color:#bbb;font-size:10px;cursor:pointer;"
        + "font-family:inherit;appearance:none;-webkit-appearance:none;";
    clear.onclick = (e) => {
        e.stopPropagation();
        const n = _histNode;
        if (n) {
            if (!n.properties) n.properties = {};
            n.properties[HIST_PROP] = [];
        }
        renderHist(n);
        refreshStatus(n);
        flashStatus(n, " " + uiText(currentLang()).histClear, 1200);
    };
    head.append(title, clear);

    const body = document.createElement("div");
    body.className = "xh-hist-body";
    body.style.cssText = "display:flex;flex-direction:column;gap:3px;max-height:320px;overflow:auto;";

    p.append(head, body);
    // 浮层内的任何操作都不能漏到画布（否则点一下就把节点拖走了）
    ["pointerdown", "mousedown", "click", "dblclick", "wheel"].forEach((ev) =>
        p.addEventListener(ev, (e) => e.stopPropagation())
    );
    document.body.appendChild(p);
    _histPanel = p;
    return p;
}

/** 把列表按当前节点重画（每次打开都重画，不必缓存） */
function renderHist(node) {
    const p = _histPanel;
    if (!p) return;
    const L = uiText(currentLang());
    p.querySelector(".xh-hist-title").textContent = L.histTitle;
    const cl = p.querySelector(".xh-hist-clear");
    cl.textContent = L.histClear;

    const body = p.querySelector(".xh-hist-body");
    body.innerHTML = "";
    const hist = getHistory(node);
    cl.disabled = hist.length === 0;
    cl.style.opacity = cl.disabled ? "0.45" : "1";
    cl.style.cursor = cl.disabled ? "not-allowed" : "pointer";

    if (!hist.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:11px;line-height:1.7;color:#8a8a8a;padding:2px;";
        empty.textContent = L.histEmpty;
        body.appendChild(empty);
        return;
    }

    hist.forEach((s, i) => {
        const row = document.createElement("div");
        const restBg = i === 0 ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.04)";
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;"
            + "background:" + restBg + ";cursor:pointer;";
        row.onmouseenter = () => { row.style.background = "rgba(76,155,255,.22)"; };
        row.onmouseleave = () => { row.style.background = restBg; };
        row.title = L.txtFixed.replace("{v}", s);

        const idx = document.createElement("div");
        idx.style.cssText = "flex:0 0 auto;width:15px;font-size:10px;color:#7d7d7d;text-align:right;";
        idx.textContent = String(i + 1);

        const val = document.createElement("div");
        val.style.cssText = "flex:1 1 auto;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:11px;"
            + "color:#f2f2f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        val.textContent = String(s);
        val.title = String(s);

        const cp = document.createElement("button");
        cp.type = "button";
        cp.textContent = "⧉";
        cp.title = L.histCopyTip;
        cp.style.cssText = "flex:0 0 auto;width:22px;height:18px;display:flex;align-items:center;justify-content:center;"
            + "border:1px solid rgba(255,255,255,.18);border-radius:4px;background:rgba(255,255,255,.06);"
            + "color:#bbb;font-size:10px;cursor:pointer;font-family:inherit;appearance:none;-webkit-appearance:none;";
        cp.onclick = (e) => {
            e.stopPropagation();
            copyText(String(s), (ok) => {
                cp.textContent = ok ? "✓" : "✗";
                setTimeout(() => { cp.textContent = "⧉"; }, 900);
            });
        };

        row.onclick = (e) => {
            e.stopPropagation();
            setSeed(node, s);
            hideHist();
            flashStatus(node, " " + L.txtFixed.replace("{v}", s), 1800);
        };

        row.append(idx, val, cp);
        body.appendChild(row);
    });
}

const _histDocDown = (e) => {
    if (!_histPanel || _histPanel.style.display === "none") return;
    if (_histPanel.contains(e.target)) return;
    // 点在"开它的那根状态条"上不算外部 —— 交给状态条自己的 click 去做开/关切换
    const anchor = _histNode && _histNode._xhSeedStatusEl;
    if (anchor && anchor.contains(e.target)) return;
    hideHist();
};
const _histDocKey = (e) => { if (e.key === "Escape") hideHist(); };

function showHist(node) {
    const p = ensureHistPanel();
    _histNode = node;
    renderHist(node);
    p.style.visibility = "hidden";
    p.style.display = "block";
    // getBoundingClientRect 是缩放后的屏幕坐标，配 position:fixed 在任何画布缩放下都准
    const r = node._xhSeedStatusEl ? node._xhSeedStatusEl.getBoundingClientRect()
        : { left: 200, top: 200, bottom: 226 };
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const left = Math.max(6, Math.min(r.left, (window.innerWidth || 1200) - pw - 6));
    let top = r.bottom + 6;
    if (top + ph > (window.innerHeight || 800) - 6) top = Math.max(6, r.top - ph - 6);
    p.style.left = left + "px";
    p.style.top = top + "px";
    p.style.visibility = "visible";
    document.addEventListener("pointerdown", _histDocDown, true);
    document.addEventListener("keydown", _histDocKey, true);
}

function hideHist() {
    if (_histPanel) _histPanel.style.display = "none";
    _histNode = null;
    document.removeEventListener("pointerdown", _histDocDown, true);
    document.removeEventListener("keydown", _histDocKey, true);
}

function toggleHist(node) {
    if (_histPanel && _histPanel.style.display !== "none" && _histNode === node) hideHist();
    else showHist(node);
}

/** 常驻状态条（照 web/xh_resolution.js 的预览条风格）。左 ▼ / 中 文案 / 右 ▲ 和 复制。 */
function makeStatusBar(node) {
    const L = uiText(currentLang());
    const el = document.createElement("div");
    el.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 6px;width:100%;box-sizing:border-box;"
        + "border-radius:6px;background:rgba(255,255,255,0.10);font-family:system-ui,-apple-system,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;"
        + "font-size:12px;font-weight:700;color:#ffffff;text-shadow:0 1px 2px rgba(0,0,0,0.35);"
        + "user-select:none;cursor:default;transition:background .2s,box-shadow .2s;";
    const tx = document.createElement("span");
    tx.style.cssText = "flex:1 1 auto;min-width:0;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"
        + "cursor:pointer;border-radius:4px;transition:background .15s;";
    tx.title = L.histTip;
    // 点状态条 = 打开"最近跑过的种子"列表（这块本来就是最多余的空白，不另占宽度）
    tx.onmouseenter = () => { tx.style.background = "rgba(255,255,255,.10)"; };
    tx.onmouseleave = () => { tx.style.background = "transparent"; };
    tx.onclick = (e) => { e.stopPropagation(); toggleHist(node); };
    node._xhSeedStatusEl = el;
    node._xhSeedStatusTx = tx;

    const down = makeMiniBtn(node, "down", "▼", L.tipDown, 24, () => stepSeed(node, -1));
    const up = makeMiniBtn(node, "up", "▲", L.tipUp, 24, () => stepSeed(node, +1));
    const copy = makeMiniBtn(node, "copy", L.btnCopy, L.tipCopy, 42, (b) => {
        const v = seedToCopy(node);
        copyText(String(v), (ok) => {
            flashBtn(b, ok ? "✓" : "✗", 1000);
            flashStatus(node, ok ? L.copied : L.copyFail, 1500);
        });
    });

    el.append(down, tx, up, copy);

    //  冒泡阶段拦截（绝不用捕获 —— 捕获会掐死按钮自己的 handler）
    ["pointerdown", "mousedown", "dblclick", "click", "keydown"].forEach((ev) =>
        el.addEventListener(ev, (e) => e.stopPropagation())
    );

    let w = null;
    try {
        w = node.addDOMWidget("xh_seed_status", "custom", el, {
            serialize: false,      //  绝不进工作流 JSON
            hideOnZoom: false,
            getMinHeight: () => 26,
        });
    } catch (e) {
        console.warn("[XiaoHei-种子] 状态条挂载失败:", e);
    }
    //  2026-10-13 修复：状态条只给了 getMinHeight，没 computeSize → 拖高节点时被撑成大片空条。钉死固定高度。
    //     2026-10-14 补：Vue Nodes 下行高只看 hasLayoutSize ⇒ lockDomWidgetHeight 连 computeLayoutSize 一起撤。
    lockDomWidgetHeight(w, 26);
    refreshStatus(node);
    return w;
}

// ---- 中/EN ----
function applyLang(node, lang) {
    if (!node) return;
    lang = lang || currentLang();
    try {
        const want = t(lang, "nodes", NODE_TYPE);
        const zhT = XH_I18N.zh.nodes[NODE_TYPE];
        const enT = XH_I18N.en.nodes[NODE_TYPE];
        if (want && (!node.title || node.title === zhT || node.title === enT)) node.title = want;

        if (node.widgets) {
            for (const w of node.widgets) {
                if (!w || !w.name) continue;
                const lb = t(lang, "widgets", w.name);
                if (lb) w.label = lb;
            }
        }

        const applySlots = (arr) => {
            if (!arr) return;
            for (const s of arr) {
                const lb = t(lang, "slots", s && s.name);
                if (lb) s.label = lb;
            }
        };
        applySlots(node.inputs);
        applySlots(node.outputs);

        try {
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
            node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        } catch (e) {}
        refreshUI(node);
        try { node.setDirtyCanvas && node.setDirtyCanvas(true, true); } catch (e) {}
    } catch (e) {
        console.warn("[XiaoHei-种子] 应用语言失败:", e);
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

app.registerExtension({
    name: "XH.Seed",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated ? origOnCreated.apply(this, arguments) : undefined;
            const node = this;
            try {
                node.serialize_widgets = true;

                // ① 标准工具条（中/EN + ）—— 家族唯一实现见 web/xh_ui_kit.js
                const { langBtn } = makeXHToolbar(node, { widgetName: "xh_seed_bar" });
                node._xhLangBtn = langBtn;

                // ② 处理自带 widget：删掉 control_after_generate（它会把 -1 改写成随机数，抢我们的活）
                for (let i = (node.widgets || []).length - 1; i >= 0; i--) {
                    const w = node.widgets[i];
                    if (w.name === "control_after_generate") node.widgets.splice(i, 1);
                    else if (w.name === "seed") node.seedWidget = w;
                }
                if (node.seedWidget) {
                    node.seedWidget.value = SEED_RANDOM; // 默认 -1 = 每次随机（同 rgthree）
                    // 手改数字也要刷新状态条（只包一层，不覆盖原回调）
                    if (!node.seedWidget._xhSeedHooked) {
                        node.seedWidget._xhSeedHooked = true;
                        const origCb = node.seedWidget.callback;
                        node.seedWidget.callback = function () {
                            const rr = origCb ? origCb.apply(this, arguments) : undefined;
                            refreshStatus(node);
                            return rr;
                        };
                    }
                }

                // ③ 功能键 + 状态条（DOM，serialize:false）
                makeBtnBar(node);
                makeStatusBar(node);

                // ④ 排队拿到真种子后的界面反馈
                node.__xhSeedGotSeed = (s) => {
                    if (!node.properties) node.properties = {};
                    node.properties.last_seed = s;
                    pushHistory(node, s);          // 第 1 次、第 2 次…都留档（最多 10 条）
                    updateLastBtn(node);
                    // 列表正开着就实时补上这一条，不用关掉重开
                    if (_histPanel && _histPanel.style.display !== "none" && _histNode === node) renderHist(node);
                    flashStatus(node, " " + uiText(currentLang()).used.replace("{v}", s), 2600);
                    try { node.setDirtyCanvas && node.setDirtyCanvas(true, true); } catch (e) {}
                };

                live.add(node);
                const origOnRemoved = node.onRemoved;
                node.onRemoved = function () {
                    live.delete(node);
                    return origOnRemoved ? origOnRemoved.apply(this, arguments) : undefined;
                };

                applyLang(node);
            } catch (e) {
                console.warn("[XiaoHei-种子] 界面创建失败:", e);
            }
            return r;
        };

        //  载入 / 切换工作流后恢复（onNodeCreated 时 widgets 还是默认值）
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
            try {
                if (!this.seedWidget) {
                    this.seedWidget = (this.widgets || []).find((w) => w && w.name === "seed");
                }
                refreshUI(this);
            } catch (e) {}
            return r;
        };

        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            live.delete(this);
            if (_histNode === this) hideHist();
            return origOnRemoved ? origOnRemoved.apply(this, arguments) : undefined;
        };
    },

    async setup() {
        // 语言变更 + 工作流载入重刷 —— 统一走 kit（见 web/xh_ui_kit.js）
        onLangChanged(() => applyLangToAll());
    },
});
