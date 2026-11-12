//  XiaoHei-WepeNerd 1:1 复刻件 · 独立语言层（2026-11-08 第二轮重写）
//
// 为什么重写：v1 用「MutationObserver 一有动静就全量遍历所有 WN 节点的文本 + 属性」，
// 而原版 renderPanel() 在拖拽时每帧重建整个 DOM ⇒ 每帧几百条 mutation ⇒ 每帧全量扫描 +
// 写回 ⇒ 主线程被打满，时间轴拖不动、参数中英来回闪。
//
// v2 的三条硬规矩：
//   ① 原文 WeakMap：每个文本节点只记第一次见到的字符串，永远「原文 → 当前语言」单向翻译，
//      绝不把翻好的中文再当输入 ⇒ 双向字典不会来回震荡。
//   ② 写入前 disconnect observer、写完 takeRecords 清空再 observe ⇒ 自己的写入不再触发自己。
//   ③ observer 只把「受影响的那一个 root」丢进 raf 合并队列，拖拽时走轻量模式
//      （只翻文本，不查属性、不碰 widget）⇒ 每帧 O(变化量)，不再 O(全部节点)。
//
// 原版 21 个前端文件依旧一字不改；本层只改显示：node.title / widget.label / slot.label /
// DOM 文本 / title-placeholder-aria-label / canvas fillText。 不动 name、不动 option.value、
// 不动 COMBO values、不增删 widget ⇒ 存档零污染。
import { app } from "../../../scripts/app.js";
import { ensureLangBridge, onLangChanged, currentLang } from "../xh_ui_kit.js";
import { isWNNode, wnText, wnUIFull, wnDesc, WN_COMBO, WN_UI_ZH, WN_UI_EN } from "./xh_wn_i18n.mjs";

ensureLangBridge();

const WN_IDS = new Set();        // String(node.id) —— 认 [data-node-id] 容器
const WN_ROOTS = new Set();      // 旧画布没有 data-node-id 时，退回 node.element
const ORIG_TEXT = new WeakMap();// Text 节点 → 首次见到的原文（英/中，绝不再改）
const ORIG_ATTR = new WeakMap();// Element → { attr: 原文 }
const ORIG_WIDGET_TT = new WeakMap(); // widget → 悬浮说明原文
const ORIG_SLOT_TT = new WeakMap();   // slot   → 悬浮说明原文
const WN_DEFS = [];                   // { def, orig }，nodeData 是共享对象，切语言必须重刷
const ATTRS = ["title", "placeholder", "aria-label"];
const MO_OPTS = { childList: true, subtree: true, characterData: true,
                  attributes: true, attributeFilter: ATTRS };

// canvas 里带数字的动态串（"750 × 1332 · 1.00 MP · 124 frames at 24 fps"）也归我们管，
// 但只在这种明显特征出现时才动，免得误伤别的节点画的常规数字。
const DYNAMIC_HINT = /\b\d+(?:\.\d+)?\s*(?:frames|fps|MP|s)\b|帧数|帧率|百万像素|源片：|受源片尺寸限制/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

let mo = null;
let busy = false;
let dragging = false;
let rafId = 0;
const pendingRoots = new Set();
let pendingLight = false;

/* ── ① canvas fillText：LiteGraph 画布上的尺寸行 / 状态行 ───────────────── */
try {
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__xhWNLangHooked) {
        const origFillText = proto.fillText;
        proto.fillText = function (text, ...rest) {
            if (typeof text === "string" && text) {
                const host = this.canvas?.closest?.("[data-node-id]");
                const inWN = !!host && WN_IDS.has(host.getAttribute("data-node-id"));
                if (inWN || has(WN_UI_ZH, text) || has(WN_UI_EN, text) || DYNAMIC_HINT.test(text)) {
                    const t = wnUIFull(text, currentLang());
                    if (t !== text) text = t;
                }
            }
            return origFillText.call(this, text, ...rest);
        };
        proto.__xhWNLangHooked = true;
    }
} catch (e) { /* 没有 Canvas2D 就跳过，DOM 部分照常 */ }

/* ── ①bis 定义层：nodeData 的端口 tooltip / 节点说明 ──────────────────────
 *   2026-11-10 实测坑：端口悬浮说明并不只有 slot.tooltip 一处。
 *     wn_ripple.js 动态生成 anchor_N 输出时是从 nodeData.output_tooltips[i] 取文案的，
 *     而旧语言层只翻了 widget.tooltip ⇒ 截图里「The image for marker 1...」一直是英文。
 *     这里在 beforeRegisterNodeDef 记下英文原文，每次切语言都从原文重新生成。
 *      数组只能「原地改元素」、不能替换引用：wn_ripple.js 的 limits.tooltips
 *        缓存的就是这个数组对象，换引用它就永远读旧值。                        */
function captureDef(def) {
    const orig = { description: typeof def.description === "string" ? def.description : null,
                   arrays: {}, specs: {} };
    for (const key of ["output_tooltips", "input_tooltips"]) {
        if (Array.isArray(def[key])) orig.arrays[key] = [...def[key]];
    }
    for (const group of ["required", "optional"]) {
        const src = def.input?.[group] || {};
        orig.specs[group] = {};
        for (const [name, spec] of Object.entries(src)) {
            orig.specs[group][name] =
                (Array.isArray(spec) && spec[1] && typeof spec[1].tooltip === "string")
                    ? spec[1].tooltip : null;
        }
    }
    return orig;
}

function applyDefTooltips(entry) {
    if (!entry) return;
    const { def, orig } = entry;
    const lang = currentLang();
    if (orig.description) {
        const t = wnDesc(def.name, lang, orig.description);
        if (def.description !== t) def.description = t;
    }
    for (const group of ["required", "optional"]) {
        const spec = def.input?.[group] || {};
        for (const [name, s] of Object.entries(spec)) {
            const en = orig.specs[group]?.[name];
            if (!en || !Array.isArray(s) || !s[1]) continue;
            const t = wnUIFull(en, lang);
            if (s[1].tooltip !== t) s[1].tooltip = t;
        }
    }
    for (const [key, src] of Object.entries(orig.arrays)) {
        const dst = def[key];
        if (!Array.isArray(dst)) continue;
        for (let i = 0; i < src.length && i < dst.length; i++) {
            if (typeof src[i] !== "string" || !src[i]) continue;
            const t = wnUIFull(src[i], lang);
            if (dst[i] !== t) dst[i] = t;      // 原地改元素，保住共享引用
        }
    }
}

function applyAllDefs() {
    for (const entry of WN_DEFS) {
        try { applyDefTooltips(entry); } catch (e) { /* 单个 def 失败不影响其它 */ }
    }
}

/* ── ② 节点四处：标题 / 参数标签 / 端口名 / 悬浮说明 ─────────────────────── */
function applyNodeLang(node, redraw = false) {
    if (!node || !isWNNode(node.type)) return;
    const lang = currentLang();
    let dirty = false;
    try {
        const t = wnText("nodes", node.type, lang);
        if (t && node.title !== t) { node.title = t; dirty = true; }
        for (const w of node.widgets || []) {
            if (!w || !w.name) continue;
            const lb = wnText("widgets", w.name, lang);
            if (lb && w.label !== lb) { w.label = lb; dirty = true; }
            //  悬浮说明（widget.tooltip）中文化：画布 hover / 控件 tooltip 实时读这个字段，
            //    它不走 title 属性（那是 DOM 属性翻译路径抓不到的）。只改显示，不动存档。
            //    从「首次见到的原文」生成，避免把已翻好的中文当原文造成切 EN 还原失败。
            if (w.tooltip) {
                let base = ORIG_WIDGET_TT.get(w);
                if (base === undefined) {
                    // 定义层可能已经翻成中文 ⇒ 先还原成英文原文，之后永远从原文生成
                    base = wnUIFull(w.tooltip, "en") || w.tooltip;
                    ORIG_WIDGET_TT.set(w, base);
                }
                const tt = wnUIFull(base, lang);
                if (tt !== w.tooltip) { w.tooltip = tt; dirty = true; }
            }
            const combo = WN_COMBO[w.name] || {};
            const isCombo = !!w.options && Array.isArray(w.options.values);
            if (isCombo && !w.__xhWNComboLang) {
                // 所有下拉（含时长 "124 frames · 5.17 s" 这类动态值）都走完整词典；
                // 只改显示，w.value / options.values 一字不动。
                w.options.getOptionLabel = (v) => {
                    const s = String(v);
                    const langNow = currentLang();
                    return wnUIFull(langNow === "zh" ? (combo[s] ?? s) : s, langNow);
                };
                w.__xhWNComboLang = true;
            }
        }
        for (const arr of [node.inputs, node.outputs]) {
            for (const s of arr || []) {
                if (!s || !s.name) continue;
                const lb = wnText("slots", s.name, lang);
                if (lb && s.label !== lb) { s.label = lb; dirty = true; }
                //  端口标签中文化：ComfyUI 前端绘制优先读 localized_name（官方 i18n 字段），
                //    仅改 s.label 在部分版本会被漏读；双写 localized_name 保证输入/输出端口都显示中文。
                //    configure 保存时会删除该字段（防存档污染），故每次创建/载入后由本函数在微任务/260ms 重写。
                if (lb && s.localized_name !== lb) { s.localized_name = lb; dirty = true; }
                //  端口悬浮说明（输入 + 输出）：旧语言层漏掉的就是这里。
                //    anchor_N 输出由 wn_ripple.js 动态 addOutput 生成，tooltip 来自 nodeData.output_tooltips；
                //    定义层已在 applyDefTooltips 原地翻好，这里是实例层的第二道保险，语言切换也跟着走。
                if (s.tooltip) {
                    let base = ORIG_SLOT_TT.get(s);
                    if (base === undefined) {
                        base = wnUIFull(s.tooltip, "en") || s.tooltip;
                        ORIG_SLOT_TT.set(s, base);
                    }
                    const tt = wnUIFull(base, lang);
                    if (tt !== s.tooltip) { s.tooltip = tt; dirty = true; }
                }
            }
        }
        if (redraw && dirty) {
            try { node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 }); } catch (e) {}
            try { node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 }); } catch (e) {}
            try { node.setDirtyCanvas?.(true, true); } catch (e) {}
        }
    } catch (e) { console.warn("XH.WN.Lang] 节点语言应用失败:", e); }
}

/* ── ③ 单个 root 的显示翻译（增量；只从 WeakMap 里的原文单向生成） ──────── */
function translateRoot(root, lang, light = false) {
    if (!root || !root.isConnected) return 0;
    let changed = 0;
    let walker;
    try { walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null); }
    catch (e) { return 0; }
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const t of texts) {
        const parent = t.parentElement;
        if (parent?.closest?.("script,style,textarea")) continue;
        // 自建 <select> 的 option 有独立 value 属性 ⇒ 改文本不会改存档值；
        // 没写 value 的 option 会以文本当值，一律放过。
        if (parent?.tagName === "OPTION" && !parent.hasAttribute?.("value")) continue;
        let base = ORIG_TEXT.get(t);
        if (base === undefined) { base = t.nodeValue; ORIG_TEXT.set(t, base); }
        if (!base || !base.trim()) continue;
        const next = wnUIFull(base, lang);
        if (next !== t.nodeValue) { t.nodeValue = next; changed++; }
    }
    if (light) return changed;                 // 拖拽中：只翻文本，最省
    try {
        for (const el of root.querySelectorAll("[title],[placeholder],[aria-label]")) {
            let orig = ORIG_ATTR.get(el);
            if (!orig) { orig = {}; ORIG_ATTR.set(el, orig); }
            for (const a of ATTRS) {
                const cur = el.getAttribute(a);
                if (cur === null) continue;
                if (orig[a] === undefined) orig[a] = cur;
                const next = wnUIFull(orig[a], lang);
                if (next !== cur) { el.setAttribute(a, next); changed++; }
            }
        }
    } catch (e) {}
    return changed;
}

function wnRoots() {
    const roots = [];
    try {
        for (const el of document.querySelectorAll("[data-node-id]")) {
            if (WN_IDS.has(el.getAttribute("data-node-id"))) roots.push(el);
        }
    } catch (e) {}
    for (const el of WN_ROOTS) if (el && el.isConnected && !roots.includes(el)) roots.push(el);
    return roots;
}

function wnNodes() {
    const g = app.graph;
    return ((g && (g._nodes || g.nodes)) || []).filter((n) => n && isWNNode(n.type));
}

function remember(node) {
    if (!node) return;
    WN_IDS.add(String(node.id));
    if (node.element) WN_ROOTS.add(node.element);
}

/* ── ④ 写入期间断开 observer：自己的写入绝不触发自己 ───────────────────── */
function guarded(fn) {
    if (busy) return;
    busy = true;
    const observing = !!mo;
    if (observing) { try { mo.disconnect(); } catch (e) {} }
    try { fn(); } finally {
        if (observing) {
            try { mo.takeRecords(); } catch (e) {}
            try { mo.observe(document.body, MO_OPTS); } catch (e) {}
        }
        busy = false;
    }
}

function refreshDom(light = false) {
    guarded(() => {
        const lang = currentLang();
        for (const root of wnRoots()) translateRoot(root, lang, light);
        if (!light) for (const n of wnNodes()) applyNodeLang(n, false);
    });
}

function scheduleSweep(roots, light) {
    for (const r of roots || []) pendingRoots.add(r);
    if (light) pendingLight = true;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
        rafId = 0;
        const list = [...pendingRoots];
        const lightRun = pendingLight;
        pendingRoots.clear();
        pendingLight = false;
        if (!list.length) return;
        guarded(() => {
            const lang = currentLang();
            for (const root of list) translateRoot(root, lang, lightRun);
            if (!lightRun) for (const n of wnNodes()) applyNodeLang(n, false);
        });
    });
}

function refreshAll() {
    try {
        applyAllDefs();   // 先刷共享 nodeData，动态端口重绘时才能拿到当前语言
        for (const n of wnNodes()) { remember(n); applyNodeLang(n, true); }
        refreshDom(false);
        // Vue / 原版异步重挂载后再补一拍
        setTimeout(() => refreshDom(false), 90);
        try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) {}
    } catch (e) { console.warn("XH.WN.Lang] 全量刷新失败:", e); }
}

onLangChanged(() => refreshAll(), { initialDelay: 220 });

/* ── ⑤ 常驻观察：只收「受影响的那一个 root」，不扫全画布 ───────────────── */
try {
    mo = new MutationObserver((records) => {
        if (busy) return;
        const roots = new Set();
        for (const r of records) {
            const target = r.target;
            const el = target?.nodeType === 1 ? target : target?.parentElement;
            const host = el?.closest?.("[data-node-id]");
            if (host && WN_IDS.has(host.getAttribute("data-node-id"))) { roots.add(host); continue; }
            for (const root of WN_ROOTS) {
                if (root?.contains && (root === target || root.contains(target))) { roots.add(root); break; }
            }
            for (const added of r.addedNodes || []) {
                if (added?.nodeType !== 1) continue;
                const h = added.matches?.("[data-node-id]") ? added : added.querySelector?.("[data-node-id]");
                if (h && WN_IDS.has(h.getAttribute("data-node-id"))) roots.add(h);
                for (const root of WN_ROOTS) if (root?.contains?.(added)) { roots.add(root); break; }
            }
        }
        if (roots.size) scheduleSweep(roots, dragging);
    });
    mo.observe(document.body, MO_OPTS);
} catch (e) { console.warn("XH.WN.Lang] MutationObserver 挂载失败:", e); }

// 拖拽期间走轻量模式：原版每帧重建 DOM，这里只翻文本，省掉属性查询与 widget 扫描。
try {
    const down = (event) => {
        const host = event.target?.closest?.("[data-node-id]");
        if (host && WN_IDS.has(host.getAttribute("data-node-id"))) dragging = true;
    };
    const up = () => {
        if (!dragging) return;
        dragging = false;
        setTimeout(() => refreshDom(false), 60);   // 松手后补齐属性与 widget
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
} catch (e) {}

/* ── ⑥ 只认复刻件：登记实例，绝不碰家族其它节点 ───────────────────────── */
app.registerExtension({
    name: "XH.WN.Lang",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (!isWNNode(nodeData?.name)) return;
        // 定义层：立刻翻 nodeData，保证后加载的 wn_ripple.js 缓存到的是已翻好的数组
        if (!WN_DEFS.some((e) => e.def === nodeData)) {
            const entry = { def: nodeData, orig: captureDef(nodeData) };
            WN_DEFS.push(entry);
            applyDefTooltips(entry);
        }
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = created?.apply(this, arguments);
            remember(this);
            // 官方在这一拍之后才写 localized_name ⇒ 端口 label 延后一拍
            queueMicrotask(() => { try { applyNodeLang(this); scheduleSweep(wnRoots(), false); } catch (e) {} });
            setTimeout(() => { try { applyNodeLang(this); scheduleSweep(wnRoots(), false); } catch (e) {} }, 260);
            return r;
        };
        const configure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = configure?.apply(this, arguments);
            remember(this);
            queueMicrotask(() => { try { applyNodeLang(this); scheduleSweep(wnRoots(), false); } catch (e) {} });
            return r;
        };
    },
    nodeCreated(node) { if (isWNNode(node?.type)) remember(node); },
});
