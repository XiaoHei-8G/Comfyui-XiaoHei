// XiaoHei-LoRA堆栈 前端 —— Nodes 2.0 原生 DOM UI
// 视觉排版 100% 照抄 ComfyUI-Pixaroma 的 LoRA Loader（Add 大按钮 / 全开关 pill+计数+iOS 滑块 /
// gear / 每行 名称框·权重▲▼·i信息钮·iOS开关 / 缺失 ），配色保留 XiaoHei 家族中性灰（--xh-acc 点缀）。
// 触发词 chips：点 i 弹信息面板，词从 LoRA 文件头（safetensors JSON 头）离线读取，点 chip 切换选中，
// 勾选的词从 TRIGGERS 口输出（与 Pixaroma 完全一致）。XiaoHei 自有的文件夹树下拉 / 调色板 / 中英切换保留为副条。
// 设计铁律：UI 全走 addDOMWidget；行的增删只在自己 DOM 内部；数据唯一载体是后端 STRING widget（loras_json）。
const { app } = window.comfyAPI.app;

import { onLangEvent, ensureLangBridge, releaseButtons, xhGetNodeRect, xhPlaceBeside, xhFollowAnchor, xhMakeDraggable } from "./xh_ui_kit.js";

ensureLangBridge();
const { api } = window.comfyAPI.api;
const NODE_TYPE = "XHPowerLoraStack";
const NODE_TYPE_PURE = "XHPureLoraStack";
const NODE_TYPES = new Set([NODE_TYPE, NODE_TYPE_PURE]);
const isPureType = (t) => t === NODE_TYPE_PURE;
const LANG_KEY = "xh_node_lang";

// XiaoHei 家族点缀色（中性灰里的一抹高亮，不抄 Pixaroma 的橙）。hover / 开关-on / 选中 chip 都用它。
const XH_ACCENT = "#7d8590";

// 齿轮图标：照抄 ComfyUI-Pixaroma 的 icons/note/gear.svg（厚实实心齿轮，非 emoji，
// emoji 在不同系统形状/颜色不一致）。用 fill:currentColor，hover 时由 .xh-pll-gear 的 color 着色。
const GEAR_SVG = '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M38.282,55.577l-1.166,5.41c-.163.754-.914,1.619-1.778,1.622h-6.701c-1.018.003-1.708-1.053-1.882-1.921l-.695-3.468c-.113-.565-.254-1.12-.501-1.644-1.989-.56-3.72-1.295-5.506-2.327-.167-.071-.679-.135-.866-.01l-4.103,2.758c-.795.534-1.942.544-2.682-.184l-4.241-4.171c-.7-.689-1.025-1.798-.431-2.701l3.078-4.682c-1.114-2-1.904-3.874-2.573-6.05l-5.158-1.132c-.746-.164-1.676-.883-1.68-1.747v-6.296c-.005-1.179.79-1.98,1.866-2.209l4.909-1.049c.254-.519.426-1.022.596-1.569.49-1.571,1.24-2.944,2.032-4.465l-2.959-4.465c-.605-.912-.542-2.116.285-2.938l3.987-3.965c.841-.837,1.908-1.117,2.93-.427l4.516,3.048c2.074-1.093,3.978-1.913,6.167-2.653l1.097-5.196c.193-.915,1.005-1.739,1.997-1.745h5.963c1.017-.006,2.079.655,2.307,1.682l1.169,5.259c2.21.732,4.128,1.536,6.165,2.682l4.37-2.973c1.305-.887,2.503-.427,3.55.782.961,1.11,1.943,1.98,3.039,2.978.748.681,1.617,1.949,1.047,2.967-.839,1.5-1.856,2.831-2.807,4.263-.253.381-.355.838-.13,1.236.921,1.631,1.583,3.192,2.094,5.014.079.283.569.52.873.588l4.386.983c1.014.227,1.77.942,1.769,2.001l-.081,6.62c-.015.904-1.059,1.507-1.843,1.672l-4.446.94c-.197.042-.554.361-.654.534-.555,2.014-1.319,3.721-2.357,5.6l2.982,4.628c.611.948.402,2.03-.374,2.791l-4.319,4.23c-.708.693-1.877.636-2.591.144l-3.731-2.576c-.529-.365-1.052-.376-1.585-.071-1.683.965-3.267,1.65-5.334,2.204ZM45.212,31.953c0-7.29-5.91-13.2-13.2-13.2s-13.2,5.91-13.2,13.2,5.91,13.2,13.2,13.2,13.2-5.91,13.2-13.2Z"/></svg>';

// 设置项（per-node 偏好 + 全局默认）。写进 JSON 信封的 prefs，存档/复用时一起带走。
const PREFS_KEY = "xh_lorastack_prefs";
const DEFAULT_PREFS = {
    step: 0.1,          // ▲▼ 步进
    defStrength: 1.0,   // 新 LoRA 默认强度
    sep: ", ",          // 触发词输出分隔符
    hideExt: true,      // 行上隐藏 .safetensors 等扩展名
    linkStrength: true, // 单一强度同时驱动 model+clip
};
function loadPrefs() {
    let p = { ...DEFAULT_PREFS };
    try { const raw = localStorage.getItem(PREFS_KEY); if (raw) Object.assign(p, JSON.parse(raw)); } catch (e) {}
    if (typeof p.step !== "number" || !(p.step > 0)) p.step = DEFAULT_PREFS.step;
    if (typeof p.defStrength !== "number" || !Number.isFinite(p.defStrength)) p.defStrength = DEFAULT_PREFS.defStrength;
    if (typeof p.sep !== "string") p.sep = DEFAULT_PREFS.sep;
    return p;
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }

const I18N = {
    zh: {
        add: "＋ 添加 LoRA",
        allOn: "全部启用", allOff: "全部停用",
        count: (on, total) => total ? `${on} / ${total} 启用` : "暂无 LoRA",
        strength: "强度",
        empty: "还没有 LoRA，点上面「＋ 添加 LoRA」",
        titleSuffix: "",
        loadFail: "LoRA 列表加载失败",
        pickFirst: "先选一个 LoRA 再点 i",
        triggers: "触发词 Trigger words",
        triggersNote: "点标签切换是否加入提示词；下方可加自己的词。词来自 LoRA 文件头（离线读取）。",
        addWord: "加自己的词",
        noTriggers: "（这个 LoRA 文件头里没有触发词元数据）",
        info: "信息 + 选触发词",
        missing: "文件没找到（改名或删了？这条会被跳过）",
        settings: "设置",
    },
    en: {
        add: "＋ Add LoRA",
        allOn: "Enable all", allOff: "Disable all",
        count: (on, total) => total ? `${on} / ${total} on` : "no LoRAs",
        strength: "Strength",
        empty: "No LoRA yet — click \"＋ Add LoRA\" above",
        titleSuffix: "",
        loadFail: "Failed to load LoRA list",
        pickFirst: "Pick a LoRA first, then click i",
        triggers: "Trigger words",
        triggersNote: "Click a tag to toggle it into the prompt; add your own below. Words are read from the LoRA file header (offline).",
        addWord: "Add your own word",
        noTriggers: "(this LoRA has no trigger-word metadata in its file header)",
        info: "Info + pick trigger words",
        missing: "File not found (renamed or removed?). This row is skipped.",
        settings: "Settings",
    },
};

function getLang() {
    try { return (window.XH_LANG === "en" || localStorage.getItem(LANG_KEY) === "en") ? "en" : "zh"; }
    catch (e) { return "zh"; }
}
function setLang(l) { window.XH_LANG = l; }

// ── 端口名本地化（2026-10-29）──
// 根因：官方 i18n 表按**端口名**翻译（MODEL→模型、STRING→字符串），
//   但 `TRIGGERS` 是 XiaoHei 自定义端口名，官方表里没有 ⇒ 一直露英文。
//   而 XiaoHei-LoRA 节点又不在 XiaoHei 家族 I18N 的 nodes 表里（isXHNode=false），
//   ⇒ 家族 slotLabel() 机制也够不着它 ⇒ 只能在本文件里自己管。
//
// 原理（官方源码取证，两套画布通用）：
//   Nodes 2.0：OutputSlot.vue  → slotData.label || slotData.localized_name || slotData.name
//   旧版画布：LGraphNode.ts     → input.label  || input.localized_name  || input.name
//   ⇒ `label` 优先级最高，设上去就能盖掉官方给的 localized_name。
//  官方是**建节点时**给 outputs 填 localized_name 的，所以必须在 onNodeCreated
//   之后设 label；之后官方不会再覆盖（它只在建节点那一刻填一次）。
const PORT_LABELS = {
    zh: { TRIGGERS: "触发词" },
    en: { TRIGGERS: "TRIGGERS" },
};

/** 给本节点的输出/输入端口打上中文（跟随 XiaoHei 语言）。两套画布模式都吃 slot.label。 */
function applyPortLabels(node, lang) {
    if (!node) return;
    const pack = PORT_LABELS[lang] || PORT_LABELS.zh;
    const set = (arr) => {
        for (const s of arr || []) {
            if (!s) continue;
            const lb = pack[s.name];
            if (lb) s.label = lb;
        }
    };
    set(node.outputs);
    set(node.inputs);
    // Nodes 2.0 的端口标签走「快照」渲染，改完必须显式触发一次重建才看得见
    try {
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
    } catch (e) {}
    try { node.setDirtyCanvas?.(true, true); } catch (e) {}
}

// ---- LoRA 文件列表（后端路由，带缓存）----
let _loraListPromise = null;
function fetchLoraList() {
    if (_loraListPromise) return _loraListPromise;
    _loraListPromise = api.fetchApi("/xh_lorastack/loras")
        .then((r) => r.json())
        .then((d) => (d && Array.isArray(d.loras)) ? d.loras : [])
        .catch(() => []);
    return _loraListPromise;
}

// ---- LoRA 触发词 / 元数据（后端离线读文件头）----
let _loraInfoCache = {};
function fetchLoraInfo(name) {
    if (!name) return Promise.resolve({ ok: false, info: {} });
    if (_loraInfoCache[name]) return Promise.resolve({ ok: true, info: _loraInfoCache[name] });
    return api.fetchApi("/xh_lorastack/lora_info?name=" + encodeURIComponent(name))
        .then((r) => r.json())
        .then((d) => {
            if (d && d.ok && d.info) { _loraInfoCache[name] = d.info; return d; }
            return { ok: false, info: {} };
        })
        .catch(() => ({ ok: false, info: {} }));
}

function hasLora(name) {
    // 列表未知时返回 null（慢加载不能误报缺失）；列表里没有才返回 false
    return null; // 见下方 makeRowEl 里用 fetchLoraList 异步判定
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

// 行上显示名：取 basename；hideExt 时去掉已知模型扩展名（仅显示用，title 仍用全名）。
const LORA_EXT_RE = /\.(safetensors|safetensor|ckpt|pt|pth|bin|sft)$/i;
function baseName(name) {
    if (!name) return "";
    const i = name.replace(/\\/g, "/").lastIndexOf("/");
    return i < 0 ? name : name.slice(i + 1);
}
function displayName(name, hideExt) {
    const b = baseName(name || "");
    return hideExt ? b.replace(LORA_EXT_RE, "") : b;
}

// ---- 样式（一次注入）----
let _styleInjected = false;
function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    const css = `
    .xh-pll-root{width:100%;box-sizing:border-box;background:#1d1d1d;border-radius:4px;
        color:#ddd;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;position:relative;}
    .xh-pll-root *{box-sizing:border-box;}
    .xh-pll-inner{padding:6px;}
    /* 顶部 Add / 全开关 / gear 簇 */
    .xh-pll-band{display:flex;flex-direction:column;gap:5px;margin-bottom:6px;}
    .xh-pll-add{width:100%;height:28px;border:0;border-radius:6px;background:var(--xh-acc,${XH_ACCENT});
        color:#fff;font:600 12px 'Segoe UI',sans-serif;cursor:pointer;display:flex;align-items:center;
        justify-content:center;gap:6px;}
    .xh-pll-add:hover{filter:brightness(1.1);}
    .xh-pll-toprow{display:flex;align-items:stretch;gap:6px;height:26px;}
    .xh-pll-all{flex:1;min-width:0;display:flex;align-items:center;gap:8px;
        background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);border-radius:5px;
        padding:0 9px;color:#a8a8a8;cursor:pointer;user-select:none;}
    .xh-pll-all:hover{border-color:var(--xh-acc,${XH_ACCENT});color:#ddd;}
    .xh-pll-all .cnt{font-size:11px;white-space:nowrap;}
    .xh-pll-gear{flex:0 0 auto;width:30px;height:26px;display:flex;align-items:center;justify-content:center;
        background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);border-radius:5px;
        cursor:pointer;user-select:none;color:#bbb;}
    .xh-pll-gear svg{width:16px;height:16px;display:block;}
    .xh-pll-gear:hover{border-color:var(--xh-acc,${XH_ACCENT});color:var(--xh-acc,${XH_ACCENT});}
    /* XiaoHei 副条：中英切换 + 调色板（家族风） */
    .xh-pll-sub{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;}
    .xh-pll-sub.hidden{display:none;}
    /* iOS 滑块开关 */
    .xh-pll-sw{flex:0 0 auto;width:30px;height:16px;border-radius:99px;background:#3a3a3a;
        position:relative;cursor:pointer;border:1px solid #000;}
    .xh-pll-sw::after{content:"";position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;
        background:#8a8a8a;transition:left .14s,background .14s;}
    .xh-pll-sw.on{background:var(--xh-acc,${XH_ACCENT});}
    .xh-pll-sw.on::after{left:15px;background:#fff;}
    .xh-pll-rows{display:flex;flex-direction:column;gap:6px;}
    .xh-pll-row{height:32px;display:flex;align-items:center;gap:6px;
        background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:0 6px;}
    .xh-pll-row.off{opacity:.42;}
    .xh-pll-name{flex:1;min-width:0;height:24px;display:flex;align-items:center;gap:5px;
        background:#161616;border:1px solid #3a3a3a;border-radius:5px;padding:0 8px;
        font:11px monospace;color:#ddd;cursor:pointer;overflow:hidden;}
    .xh-pll-name:hover{border-color:var(--xh-acc,${XH_ACCENT});}
    .xh-pll-name .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .xh-pll-name.empty .nm{color:#777;}
    .xh-pll-name.missing .nm{color:#e05555;}
    .xh-pll-name.missing::before{content:"";flex:none;color:#e05555;font-size:11px;}
    .xh-pll-name .car{flex:none;color:#777;font-size:9px;}
    /* 权重框：数值 + ▲▼ */
    .xh-pll-w{flex:0 0 auto;display:flex;align-items:center;height:24px;width:56px;
        background:#161616;border:1px solid #3a3a3a;border-radius:5px;overflow:hidden;}
    .xh-pll-w:focus-within{border-color:var(--xh-acc,${XH_ACCENT});}
    .xh-pll-wval{flex:1;min-width:0;width:100%;background:transparent;border:0;outline:none;color:#fff;
        text-align:center;font:11px monospace;padding:0;cursor:text;}
    /* 屏蔽原生 spinner：只留我们自己的 ▲▼（照 Pixaroma） */
    .xh-pll-wval::-webkit-outer-spin-button,.xh-pll-wval::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
    .xh-pll-wspin{flex:0 0 auto;display:flex;flex-direction:column;width:16px;height:100%;
        border-left:1px solid #3a3a3a;}
    /*  2026-10-29：这两个按钮之前**没加 class** ⇒ 下面这套 CSS 全失效 ⇒ 浏览器默认
       button 样式（13.3px Arial + 默认内边距）把 ▲▼ 挤成一个巨大三角、▼ 被裁掉。
       现在 class 已补上，字号/宽度也收成 Pixaroma 的比例（16px 宽 / 8px 字号）。 */
    .xh-pll-wbtn{flex:1 1 0;min-height:0;border:0;background:transparent;color:#a8a8a8;cursor:pointer;
        font:8px/1 ui-sans-serif,system-ui,sans-serif;
        display:flex;align-items:center;justify-content:center;padding:0;margin:0;
        -webkit-appearance:none;appearance:none;}
    .xh-pll-wbtn:hover{color:var(--xh-acc,${XH_ACCENT});background:rgba(255,255,255,0.08);}
    /* i 信息钮 */
    .xh-pll-info{flex:0 0 auto;width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,255,255,0.12);
        background:rgba(255,255,255,0.05);color:#a8a8a8;cursor:pointer;display:flex;align-items:center;
        justify-content:center;font:italic 12px Georgia,serif;}
    .xh-pll-info:hover{border-color:var(--xh-acc,${XH_ACCENT});color:#fff;}
    .xh-pll-empty{height:46px;display:flex;align-items:center;justify-content:center;text-align:center;color:#777;
        font-size:11px;background:rgba(0,0,0,0.2);border:1px dashed #3a3a3a;border-radius:6px;padding:0 10px;}

    /* ── 信息面板（触发词 chips）── */
    .xh-pll-info-p{position:fixed;z-index:10025;width:340px;max-width:94vw;background:#2b2b2b;
        border:1px solid ${XH_ACCENT};border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.6);
        color:#ddd;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;}
    .xh-pll-info-top{display:flex;gap:11px;padding:12px;border-bottom:1px solid #1c1c1c;cursor:grab;}
    .xh-pll-info-th{width:64px;height:64px;border-radius:7px;flex:none;border:1px solid #000;
        background:#161616;position:relative;overflow:hidden;}
    .xh-pll-info-h{min-width:0;flex:1;}
    .xh-pll-info-h h3{margin:0 0 4px;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .xh-pll-info-meta{font:10px monospace;color:#7a7a7a;line-height:1.7;}
    .xh-pll-info-x{margin-left:auto;color:#8a8a8a;cursor:pointer;align-self:flex-start;}
    .xh-pll-info-x:hover{color:#fff;}
    .xh-pll-info-sec{padding:11px 12px;}
    .xh-pll-info-sec h4{margin:0 0 6px;font:600 9.5px 'Segoe UI';text-transform:uppercase;letter-spacing:.7px;color:#9a9a9a;
        display:flex;align-items:center;gap:6px;}
    .xh-pll-info-note{font-size:10px;color:#7a7a7a;margin:0 0 8px;}
    .xh-pll-chips{display:flex;flex-wrap:wrap;gap:5px;max-height:30vh;overflow-y:auto;padding-right:2px;}
    .xh-pll-chips::-webkit-scrollbar{width:7px;}
    .xh-pll-chips::-webkit-scrollbar-thumb{background:#555;border-radius:3px;}
    .xh-pll-chip{font:10.5px 'Segoe UI';background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);
        border-radius:99px;padding:3px 9px;color:#cfcfcf;cursor:pointer;display:flex;align-items:center;gap:4px;}
    .xh-pll-chip:hover{border-color:var(--xh-acc,${XH_ACCENT});}
    .xh-pll-chip.sel{background:color-mix(in srgb, var(--xh-acc,${XH_ACCENT}) 18%, transparent);
        border-color:var(--xh-acc,${XH_ACCENT});color:#fff;}
    .xh-pll-chip.sel::before{content:"✓";font-size:9px;flex:none;}
    .xh-pll-chip .cx{margin-left:1px;color:#e0a08c;cursor:pointer;opacity:.6;font-size:10px;flex:none;}
    .xh-pll-chip .cx:hover{opacity:1;}
    .xh-pll-chip-none{color:#777;font-size:11px;}
    .xh-pll-addtrig{display:flex;gap:5px;margin-top:8px;}
    .xh-pll-addtrig input{flex:1;min-width:0;background:#161616;border:1px solid #3a3a3a;border-radius:5px;
        color:#fff;font:11px sans-serif;padding:4px 8px;}
    .xh-pll-addtrig input:focus{outline:none;border-color:var(--xh-acc,${XH_ACCENT});}
    .xh-pll-addtrig button{flex:0 0 auto;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.05);
        color:#ddd;border-radius:5px;padding:0 10px;cursor:pointer;font-size:11px;}
    .xh-pll-addtrig button:hover{border-color:var(--xh-acc,${XH_ACCENT});color:#fff;}

    /* 文件夹树下拉（沿用 XiaoHei 自有的好用下拉） */
    .xh-pll-combo-list{position:fixed;z-index:99999;background:#1a1f26;border:1px solid #3d4652;
        border-radius:4px;max-height:280px;overflow-y:auto;box-shadow:0 6px 16px rgba(0,0,0,.55);scrollbar-width:thin;}
    .xh-pll-crumb{display:flex;align-items:center;gap:6px;padding:4px 8px;font-size:11px;color:#9fb4cc;cursor:pointer;
        border-bottom:1px solid rgba(61,70,82,.6);margin-bottom:2px;}
    .xh-pll-crumb:hover{background:#222b36;color:#fff;}
    .xh-pll-crumb .xh-path{margin-left:auto;color:#8a8a8a;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;}
    .xh-pll-combo-item{padding:4px 8px;font-size:11px;color:#dfe5ec;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .xh-pll-combo-item.act{background:#8a8a8a;color:#fff;}
    .xh-pll-combo-item:hover:not(.none){background:#8a8a8a;color:#fff;}
    .xh-pll-combo-item.none{opacity:.5;cursor:default;}
    .xh-pll-combo-item .xh-ico{flex:none;width:18px;text-align:center;}
    .xh-pll-combo-item .xh-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .xh-pll-combo-item.dir{color:#f4d35e;font-weight:600;}
    .xh-pll-combo-item.dir.act{background:#8a8a8a;color:#fff;}
    .xh-pll-combo-item.dir:hover:not(.none){background:#8a8a8a;color:#fff;}
    .xh-pll-combo-item.file .xh-ico{opacity:.8;}

    /* 第二权重框（model / clip 分开时） */
    .xh-pll-w.clip{background:#131313;}
    .xh-pll-w.clip .xh-pll-wval{color:#c7c7c7;}

    /* ── 设置面板（齿轮弹出）── */
    .xh-pll-set{position:fixed;z-index:10026;width:320px;max-width:94vw;background:#2b2b2b;
        border:1px solid ${XH_ACCENT};border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.6);
        color:#ddd;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;}
    .xh-pll-set-top{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid #1c1c1c;}
    .xh-pll-set-top svg{width:15px;height:15px;color:#bbb;flex:none;}
    .xh-pll-set-top h3{margin:0;font-size:13px;font-weight:600;flex:1;min-width:0;}
    .xh-pll-set-top .x{margin-left:auto;color:#8a8a8a;cursor:pointer;font-size:14px;line-height:1;}
    .xh-pll-set-top .x:hover{color:#fff;}
    .xh-pll-set-body{padding:6px 13px 10px;max-height:62vh;overflow-y:auto;}
    .xh-pll-set-body::-webkit-scrollbar{width:7px;}
    .xh-pll-set-body::-webkit-scrollbar-thumb{background:#555;border-radius:3px;}
    .xh-pll-set-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #212121;}
    .xh-pll-set-row:last-of-type{border-bottom:0;}
    .xh-pll-set-row .lab{flex:1;min-width:0;}
    .xh-pll-set-row .lab b{display:block;font:600 12px 'Segoe UI';color:#e2e2e2;}
    .xh-pll-set-row .lab small{display:block;color:#888;font-size:10.5px;line-height:1.4;margin-top:1px;}
    .xh-pll-set-row select,.xh-pll-set-row input[type=text],.xh-pll-set-row input[type=number]{
        background:#161616;border:1px solid #3a3a3a;border-radius:5px;color:#fff;font:11px monospace;
        padding:4px 7px;max-width:130px;}
    .xh-pll-set-row select:focus,.xh-pll-set-row input:focus{outline:none;border-color:var(--xh-acc,${XH_ACCENT});}
    .xh-pll-set-done{margin:4px 13px 13px;}
    .xh-pll-set-done button{width:100%;height:30px;border:0;border-radius:6px;
        background:var(--xh-acc,${XH_ACCENT});color:#fff;font:600 12px 'Segoe UI';cursor:pointer;}
    .xh-pll-set-done button:hover{filter:brightness(1.08);}
    `;
    const el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
}

// 权重框：数值输入 + ▲▼ 步进。which="c" 时为 clip 强度（模型/CLIP 分开时）。
function makeWeightBox(row, ctx, which) {
    const isClip = which === "c";
    const w = document.createElement("div");
    w.className = "xh-pll-w" + (isClip ? " clip" : "");
    const val = document.createElement("input");
    val.className = "xh-pll-wval";
    val.type = "text";
    val.inputMode = "decimal";
    const curVal = () => isClip
        ? (row.strength_clip != null ? row.strength_clip : (row.strength != null ? row.strength : 1))
        : (row.strength != null ? row.strength : 1);
    val.value = Number(curVal()).toFixed(2);
    val.title = isClip
        ? (ctx.lang === "zh" ? "CLIP 强度｜可输入，▲▼ 步进" : "CLIP strength | type, ▲▼ step")
        : (ctx.pure
            ? (ctx.lang === "zh" ? "强度（只作用模型）｜可输入，▲▼ 步进，Shift=1.0" : "Strength (model only) | type, ▲▼ step, Shift=1.0")
            : (ctx.lang === "zh" ? "强度（model 与 clip 共用）｜可输入，▲▼ 步进，Shift=1.0" : "Strength (model & clip) | type, ▲▼ step, Shift=1.0"));
    val.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    const step = () => (ctx.prefs && ctx.prefs.step) || 0.1;
    const commit = (raw) => {
        let v = parseFloat(raw);
        if (isNaN(v)) v = isClip ? (row.strength || 1) : 1.0;
        v = Math.max(-4, Math.min(4, v));
        v = Math.round(v * 100) / 100;
        if (isClip) row.strength_clip = v; else row.strength = v;
        val.value = v.toFixed(2);
        ctx.sync();
    };
    val.addEventListener("change", () => commit(val.value));
    val.addEventListener("blur", () => commit(val.value));
    val.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(val.value); val.blur(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); commit((parseFloat(val.value) || 1) + (e.shiftKey ? 1.0 : step())); }
        else if (e.key === "ArrowDown") { e.preventDefault(); commit((parseFloat(val.value) || 1) - (e.shiftKey ? 1.0 : step())); }
    });
    const spin = document.createElement("div");
    spin.className = "xh-pll-wspin";
    const mk = (dir) => {
        const b = document.createElement("button");
        b.type = "button";
        //  2026-10-29：必须给 class！之前这里没设 class ⇒ CSS `.xh-pll-wbtn` 全部失效
        //    ⇒ 浏览器用了默认 button 样式（13.3px Arial + 默认内边距），在 18px 宽的窄条里
        //    被挤成一个巨大的三角，底下的 ▼ 直接被裁掉 —— 用户看到的「看不见/图标太大」。
        b.className = "xh-pll-wbtn";
        b.textContent = dir > 0 ? "▲" : "▼";
        b.title = ctx.lang === "zh" ? `微调：点 ±${step().toFixed(2)}（Shift ±1.0）` : `Fine-tune: click ±${step().toFixed(2)} (Shift ±1.0)`;
        const apply = (ev) => commit((parseFloat(val.value) || 1) + dir * (ev && ev.shiftKey ? 1.0 : step()));
        let delay = null, rep = null, pressed = false;
        const stop = () => { clearTimeout(delay); clearInterval(rep); delay = rep = null; };
        b.addEventListener("pointerdown", (e) => {
            e.stopPropagation(); e.preventDefault(); pressed = true; apply(e);
            try { b.setPointerCapture(e.pointerId); } catch (_) {}
            delay = setTimeout(() => { rep = setInterval(() => { if (!pressed) { stop(); return; } apply(e); }, 90); }, 400);
        });
        const rel = () => { pressed = false; stop(); };
        b.addEventListener("pointerup", (e) => { e.stopPropagation(); rel(); });
        b.addEventListener("pointercancel", rel);
        b.addEventListener("lostpointercapture", rel);
        b.addEventListener("pointerleave", rel);
        ["mousedown", "dblclick", "click"].forEach((ev) => b.addEventListener(ev, (e) => e.stopPropagation()));
        return b;
    };
    spin.appendChild(mk(1));
    spin.appendChild(mk(-1));
    spin.addEventListener("pointerdown", (e) => e.stopPropagation());
    spin.addEventListener("dblclick", (e) => e.stopPropagation());
    w.append(val, spin);
    return w;
}

// iOS 滑块开关
function makeSwitch(on, onToggle) {
    const sw = document.createElement("div");
    sw.className = "xh-pll-sw" + (on ? " on" : "");
    sw.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    sw.addEventListener("click", (e) => {
        e.stopPropagation();
        const now = !sw.classList.contains("on");
        sw.classList.toggle("on", now);
        onToggle(now);
    });
    return sw;
}

function makeRowEl(row, ctx) {
    const rowEl = document.createElement("div");
    rowEl.className = "xh-pll-row" + (row.on ? "" : " off");

    // —— 名称框（文件夹树下拉）——
    const name = document.createElement("div");
    name.className = "xh-pll-name" + (row.lora ? "" : " empty");
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = row.lora ? displayName(row.lora, ctx.prefs.hideExt) : (ctx.lang === "zh" ? "（点这里选 LoRA）" : "(click to pick)");
    nm.title = row.lora || "";
    const car = document.createElement("span"); car.className = "car"; car.textContent = "▾";
    name.append(nm, car);
    name.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    name.addEventListener("click", (e) => {
        e.stopPropagation();
        openNamePicker(name, nm, row, ctx);
    });
    // 异步判缺失：列表里有/没有
    fetchLoraList().then((list) => {
        if (!row.lora) return;
        const missing = list.length > 0 && !list.includes(row.lora);
        name.classList.toggle("missing", !!missing);
        nm.title = missing ? (ctx.lang === "zh" ? row.lora + " - " + ctx.t.missing : row.lora + " - file not found") : (row.lora || "Pick a LoRA");
    });

    // —— 权重框 ——
    const wbox = makeWeightBox(row, ctx, "m");
    // 模型/CLIP 强度分开时，再叠一个 CLIP 权重框
    let cbox = null;
    if (!ctx.prefs.linkStrength && !ctx.pure) {
        cbox = makeWeightBox(row, ctx, "c");
    }

    // —— i 信息钮（触发词面板）——
    const info = document.createElement("div");
    info.className = "xh-pll-info";
    info.textContent = "i";
    info.title = ctx.t.info;
    info.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    info.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!row.lora) { ctx.toast(ctx.t.pickFirst); return; }
        openInfoPanel(row, ctx);
    });

    // —— 开关 ——
    const sw = makeSwitch(row.on, (now) => {
        row.on = now;
        rowEl.className = "xh-pll-row" + (now ? "" : " off");
        ctx.sync();
    });

    rowEl.append(name, wbox);
    if (cbox) rowEl.appendChild(cbox);
    rowEl.append(info, sw);
    return rowEl;
}

// ── 名称下拉：文件夹模式（照抄 ComfyUI-Pixaroma dropdown.mjs：搜索框 + 文件夹行(计数›) + 面包屑 + 返回）──
let _nameListEl = null, _nameItems = [], _nameAct = -1;
function openNamePicker(nameBox, nm, row, ctx) {
    if (_nameListEl) { _nameListEl.remove(); _nameListEl = null; _nameItems = []; _nameAct = -1; }
    const close = () => {
        if (_nameListEl) { _nameListEl.remove(); _nameListEl = null; _nameItems = []; _nameAct = -1; }
        document.removeEventListener("pointerdown", onDoc, true);
    };
    const pick = (f) => {
        row.lora = f; nm.textContent = displayName(f, ctx.prefs.hideExt); nm.title = f;
        nameBox.classList.remove("empty", "missing");
        close();
        ctx.sync();
        // 选好 LoRA 自动把它声明的触发词勾上（照 Pixaroma autoTickAfterPick）
        autoTickTriggers(row, ctx);
    };
    const onDoc = (e) => { if (_nameListEl && !_nameListEl.contains(e.target) && e.target !== nameBox) close(); };

    const listEl = document.createElement("div");
    listEl.className = "xh-pll-combo-list";
    listEl.style.overflowY = "hidden";
    _nameListEl = listEl;

    // 搜索框
    const srch = document.createElement("div");
    srch.className = "xh-pll-crumb";
    srch.style.cssText = "display:flex;align-items:center;gap:6px;cursor:default;";
    const sinput = document.createElement("input");
    sinput.type = "text";
    sinput.placeholder = ctx.lang === "zh" ? " 搜索 LoRA…" : " Search LoRAs…";
    sinput.style.cssText = "flex:1;min-width:0;background:transparent;border:0;outline:none;color:#dfe5ec;font:11px sans-serif;";
    sinput.addEventListener("keydown", (e) => e.stopPropagation());
    sinput.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    const srchIco = (typeof window !== "undefined" && typeof window.XH_iconHTML === "function")
      ? window.XH_iconHTML("search", { size: 13, color: "current" }) : "";
    if (srchIco) {
      const si = document.createElement("span");
      si.style.cssText = "display:inline-flex;align-items:center;opacity:.7;flex:none;";
      si.innerHTML = srchIco;
      srch.appendChild(si);
    }
    srch.append(sinput);
    listEl.appendChild(srch);

    // 面包屑
    const crumb = document.createElement("div");
    crumb.className = "xh-pll-crumb";
    listEl.appendChild(crumb);

    // 列表区（仅此区滚动，搜索/面包屑固定）
    const items = document.createElement("div");
    items.style.maxHeight = "240px";
    items.style.overflowY = "auto";
    items.style.overflowX = "hidden";
    listEl.appendChild(items);

    const initPath = (row.lora || "").replace(/\\/g, "/");
    let curPath = initPath ? initPath.slice(0, initPath.lastIndexOf("/")) : "";

    const levelItems = (all) => {
        const prefix = curPath ? curPath + "/" : "";
        const folders = new Map();
        const files = [];
        for (const name of all) {
            const norm = name.replace(/\\/g, "/");
            if (curPath && !norm.startsWith(prefix)) continue;
            const rest = norm.slice(prefix.length);
            const slash = rest.indexOf("/");
            if (slash < 0) files.push(name);
            else { const f = rest.slice(0, slash); folders.set(f, (folders.get(f) || 0) + 1); }
        }
        return { folders: [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0])), files };
    };
    const fileRow = (name) => {
        const el = document.createElement("div");
        el.className = "xh-pll-combo-item file" + (name === row.lora ? " act" : "");
        //  2026-10-29 用户要求：模型文件前面**不要**再放一个纸图标（文档图标）。
        //    Pixaroma 的文件行本来就没有图标（只有文件夹行有文件夹图标）⇒ 这里对齐它。
        el.innerHTML = '<span class="xh-nm">' + escapeHtml(baseName(name)) + "</span>";
        el.title = name; el.dataset.f = name;
        el.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
        el.addEventListener("click", (e) => { e.stopPropagation(); pick(name); });
        return el;
    };
    const folderRow = (f, count) => {
        const el = document.createElement("div");
        el.className = "xh-pll-combo-item dir";
        el.innerHTML = '<span class="xh-ico"></span><span class="xh-nm">' + escapeHtml(f) +
            '</span><span style="margin-left:auto;color:#8a8a8a;font-size:10px;">' + count + " ›</span>";
        el.title = f; el.dataset.dir = f;
        el.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
        el.addEventListener("click", (e) => { e.stopPropagation(); curPath = curPath ? curPath + "/" + f : f; sinput.value = ""; render(); });
        return el;
    };
    const crumbLink = (label, path, here) => {
        const c = document.createElement("span");
        c.className = "xh-path";
        c.textContent = label;
        c.style.cursor = here ? "default" : "pointer";
        if (!here) c.addEventListener("click", () => { curPath = path; sinput.value = ""; render(); });
        return c;
    };

    function render() {
        fetchLoraList().then((all) => {
            if (!_nameListEl) return;
            // 跨机容错：当前文件夹在该机器不存在则回根（照 Pixaroma）
            if (curPath) {
                const prefix = curPath + "/";
                if (!all.some((n) => n.replace(/\\/g, "/").startsWith(prefix))) curPath = "";
            }
            items.innerHTML = "";
            const q = sinput.value.trim().toLowerCase();
            if (q) {
                const matched = all.filter((n) => n.toLowerCase().includes(q));
                if (!matched.length) {
                    const e = document.createElement("div"); e.className = "xh-pll-combo-item none";
                    e.textContent = all.length ? (ctx.lang === "zh" ? "无匹配" : "No match.") : (ctx.lang === "zh" ? "models/loras 里没有 LoRA" : "No LoRAs in models/loras.");
                    items.appendChild(e);
                } else {
                    for (const name of matched) items.appendChild(fileRow(name));
                }
                crumb.style.display = "none";
                position();
                return;
            }
            crumb.style.display = "";
            crumb.innerHTML = "";
            const parts = curPath ? curPath.split("/") : [];
            crumb.appendChild(crumbLink(ctx.lang === "zh" ? "全部" : "All", "", parts.length === 0));
            let acc = "";
            parts.forEach((p, i) => {
                const s = document.createElement("span"); s.className = "xh-path"; s.style.margin = "0 4px"; s.textContent = "›"; crumb.appendChild(s);
                acc = acc ? acc + "/" + p : p;
                crumb.appendChild(crumbLink(p, acc, i === parts.length - 1));
            });
            const { folders, files } = levelItems(all);
            if (curPath) {
                const back = document.createElement("div");
                back.className = "xh-pll-combo-item dir";
                back.innerHTML = '<span class="xh-ico"></span><span class="xh-nm">' + (ctx.lang === "zh" ? "返回上级" : "Up") + "</span>";
                back.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
                back.addEventListener("click", (e) => { e.stopPropagation(); const i = curPath.lastIndexOf("/"); curPath = i < 0 ? "" : curPath.slice(0, i); render(); });
                items.appendChild(back);
            }
            for (const [f, count] of folders) items.appendChild(folderRow(f, count));
            for (const name of files) items.appendChild(fileRow(name));
            if (!folders.length && !files.length) {
                const e = document.createElement("div");
                e.className = "xh-pll-combo-item none";
                e.textContent = all.length ? (ctx.lang === "zh" ? "（此文件夹为空）" : "(empty)") : (ctx.lang === "zh" ? "models/loras 里没有 LoRA" : "No LoRAs in models/loras.");
                items.appendChild(e);
            }
            position();
        });
    }
    function position() {
        const r = nameBox.getBoundingClientRect();
        listEl.style.left = r.left + "px";
        listEl.style.top = (r.bottom + 2) + "px";
        listEl.style.minWidth = Math.max(r.width, 260) + "px";
        if (!listEl.isConnected) document.body.appendChild(listEl);
        setTimeout(() => document.addEventListener("pointerdown", onDoc, true), 0);
    }

    sinput.addEventListener("input", render);
    render();
    setTimeout(() => sinput.focus(), 0);
}

// ── 设置面板（齿轮弹出，照抄 Pixaroma settings.mjs 的"一堆东西"）──
let _setPanel = null;
let _setFollow = null;
function closeSettingsPanel() {
    if (_setFollow) { try { _setFollow.stop(); } catch (_) {} _setFollow = null; }
    if (_setPanel) {
        try { _setPanel._cleanup && _setPanel._cleanup(); } catch (_) {}
        try { _setPanel.remove(); } catch (_) {}
        _setPanel = null;
    }
}
function openSettingsPanel(ctx, node) {
    closeSettingsPanel();
    const panel = document.createElement("div");
    panel.className = "xh-pll-set";
    panel.style.setProperty("--xh-acc", XH_ACCENT);
    document.body.appendChild(panel);
    _setPanel = panel;

    // 图标助手：走自家图标库（window.XH_iconHTML），color:current 继承文字色
    const xhIco = (name, size) => (typeof window !== "undefined" && typeof window.XH_iconHTML === "function")
      ? window.XH_iconHTML(name, { size: size || 16, color: "current" }) : "";

    const top = document.createElement("div");
    top.className = "xh-pll-set-top";
    top.innerHTML = xhIco("settings", 16) || GEAR_SVG;
    const h = document.createElement("h3");
    h.textContent = ctx.lang === "zh" ? "LoRA 设置" : "LoRA Settings";
    const x = document.createElement("div"); x.className = "x"; x.textContent = "✕"; x.title = "关闭";
    x.addEventListener("click", (e) => { e.stopPropagation(); closeSettingsPanel(); });
    top.append(h, x);
    panel.appendChild(top);

    const body = document.createElement("div");
    body.className = "xh-pll-set-body";
    panel.appendChild(body);

    const row = (label, sub, control, icon) => {
        const r = document.createElement("div");
        r.className = "xh-pll-set-row";
        const lab = document.createElement("div"); lab.className = "lab";
        const ico = icon ? xhIco(icon, 14) : "";
        lab.innerHTML = (ico ? '<span style="display:inline-flex;align-items:center;margin-right:6px;vertical-align:-2px;opacity:.85;">' + ico + "</span>" : "")
          + "<b>" + escapeHtml(label) + "</b>" + (sub ? "<small>" + escapeHtml(sub) + "</small>" : "");
        r.append(lab, control);
        body.appendChild(r);
        return r;
    };

    // 强度步进（▲▼ 每次加减）
    const stepSel = document.createElement("select");
    [0.01, 0.05, 0.1, 0.25, 1.0].forEach((v) => {
        const o = document.createElement("option"); o.value = String(v); o.textContent = v.toFixed(2);
        if (Math.abs((ctx.prefs.step || 0.1) - v) < 1e-9) o.selected = true;
        stepSel.appendChild(o);
    });
    stepSel.addEventListener("change", () => { ctx.prefs.step = parseFloat(stepSel.value); savePrefs(ctx.prefs); ctx.sync(); });
    row(ctx.lang === "zh" ? "强度步进" : "Strength step", ctx.lang === "zh" ? "▲▼ 每次加减多少（Shift 固定 ±1.0）" : "How much the ▲▼ arrows add each click (Shift = ±1.0)", stepSel, "sliders-horizontal");

    // 新 LoRA 默认强度
    const defInp = document.createElement("input"); defInp.type = "number"; defInp.step = "0.05"; defInp.value = String(ctx.prefs.defStrength);
    defInp.style.maxWidth = "80px";
    defInp.addEventListener("change", () => {
        let v = parseFloat(defInp.value); if (!Number.isFinite(v)) v = 1.0;
        v = Math.max(-4, Math.min(4, v)); ctx.prefs.defStrength = v; defInp.value = String(v); savePrefs(ctx.prefs);
    });
    row(ctx.lang === "zh" ? "新 LoRA 默认强度" : "Default strength", ctx.lang === "zh" ? "加一行时初始强度" : "Initial strength for a new row", defInp, "sliders-horizontal");

    // 触发词分隔符
    const sepInp = document.createElement("input"); sepInp.type = "text"; sepInp.value = ctx.prefs.sep; sepInp.style.maxWidth = "90px";
    sepInp.addEventListener("change", () => { ctx.prefs.sep = sepInp.value; savePrefs(ctx.prefs); ctx.sync(); });
    row(ctx.lang === "zh" ? "触发词分隔符" : "Trigger separator", ctx.lang === "zh" ? "TRIGGERS 输出里词与词之间怎么连" : "How trigger words are joined in the TRIGGERS output", sepInp);

    // 隐藏扩展名
    const hideSw = makeSwitch(!!ctx.prefs.hideExt, (on) => {
        ctx.prefs.hideExt = on; savePrefs(ctx.prefs); ctx.sync(); ctx.renderAll();
    });
    row(ctx.lang === "zh" ? "隐藏扩展名" : "Hide extension", ctx.lang === "zh" ? "行上只显示文件名，不显示 .safetensors" : "Show file name without .safetensors on rows", hideSw);

    // 模型/CLIP 强度分开
    const linkSw = makeSwitch(!!ctx.prefs.linkStrength, (on) => {
        ctx.prefs.linkStrength = on; savePrefs(ctx.prefs);
        for (const r of ctx.rows) {
            if (!on) { if (r.strength_clip == null) r.strength_clip = r.strength != null ? r.strength : 1; }
            else { delete r.strength_clip; }
        }
        ctx.sync(); ctx.renderAll();
    });
    row(ctx.lang === "zh" ? "模型/CLIP 强度分开" : "Separate model & clip", ctx.lang === "zh" ? "关掉后每行多一个 CLIP 强度框" : "Off = an extra CLIP strength box per row", linkSw, "sliders-horizontal");

    // 界面语言
    const langSel = document.createElement("select");
    [["zh", "中文"], ["en", "English"]].forEach(([v, t]) => {
        const o = document.createElement("option"); o.value = v; o.textContent = t;
        if (getLang() === v) o.selected = true; langSel.appendChild(o);
    });
    langSel.addEventListener("change", () => {
        window.XH_LANG = langSel.value; try { localStorage.setItem(LANG_KEY, langSel.value); } catch (_) {}
        openSettingsPanel(ctx, node);
    });
    row(ctx.lang === "zh" ? "界面语言" : "Language", "", langSel);

    const done = document.createElement("div");
    done.className = "xh-pll-set-done";
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = ctx.lang === "zh" ? "完成" : "Done";
    doneBtn.addEventListener("click", (e) => { e.stopPropagation(); closeSettingsPanel(); });
    done.appendChild(doneBtn);
    panel.appendChild(done);

    //  2026-10-29 定位：老代码把面板**硬编码**到视口右上角
    //    （left = innerWidth-340 / top = 80px），跟节点在哪毫无关系 ⇒ 用户看到「离得老远」。
    //    改成：贴节点右侧放（放不下翻左侧），画布动了跟着走，用户还能自己拖走。
    const anchorEl = ctx.gearBtn || ctx.root;
    xhPlaceBeside(panel, anchorEl ? anchorEl.getBoundingClientRect() : null, { gap: 10 });
    const follow = xhFollowAnchor(panel, anchorEl, { gap: 10 });
    _setFollow = follow;
    xhMakeDraggable(panel, top, () => follow.markUserMoved());

    setTimeout(() => {
        const onDown = (e) => { if (_setPanel && !_setPanel.contains(e.target)) closeSettingsPanel(); };
        document.addEventListener("pointerdown", onDown, true);
        panel._cleanup = () => document.removeEventListener("pointerdown", onDown, true);
    }, 0);
}

// ── 选好 LoRA 自动勾上声明触发词 ──
function autoTickTriggers(row, ctx) {
    if (!row.lora) return;
    fetchLoraInfo(row.lora).then((d) => {
        if (!d.ok) return;
        const info = d.info || {};
        const words = (info.explicit_triggers && info.explicit_triggers.length ? info.explicit_triggers
            : (info.sidecar_triggers && info.sidecar_triggers.length ? info.sidecar_triggers : []));
        if (!words.length) return;
        const cur = row.triggers || [];
        const seen = new Set(cur.map((w) => w.toLowerCase()));
        let changed = false;
        for (const w of words) {
            if (w && !seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); cur.push(w); changed = true; }
        }
        if (changed) { row.triggers = cur; ctx.sync(); }
    });
}

// ── 信息面板：触发词 chips ──
let _infoPanel = null;
let _infoFollow = null;
function closeInfoPanel() {
    if (_infoFollow) { try { _infoFollow.stop(); } catch (_) {} _infoFollow = null; }
    if (_infoPanel) { try { _infoPanel.remove(); } catch (_) {} _infoPanel = null; }
}
function openInfoPanel(row, ctx) {
    closeInfoPanel();
    const panel = document.createElement("div");
    panel.className = "xh-pll-info-p";
    panel.style.setProperty("--xh-acc", XH_ACCENT);
    document.body.appendChild(panel);
    _infoPanel = panel;

    const top = document.createElement("div");
    top.className = "xh-pll-info-top";
    const th = document.createElement("div");
    th.className = "xh-pll-info-th";
    const h = document.createElement("div");
    h.className = "xh-pll-info-h";
    const title = document.createElement("h3");
    title.textContent = row.lora;
    title.title = row.lora;
    const meta = document.createElement("div");
    meta.className = "xh-pll-info-meta";
    const x = document.createElement("div");
    x.className = "xh-pll-info-x"; x.textContent = "✕"; x.title = "关闭";
    x.addEventListener("click", (e) => { e.stopPropagation(); closeInfoPanel(); });
    h.append(title, meta);
    top.append(th, h, x);
    panel.appendChild(top);

    // 拖动面板头部
    let dragging = false, ox = 0, oy = 0;
    top.addEventListener("pointerdown", (e) => {
        if (e.target === x) return;
        dragging = true;
        if (_infoFollow) _infoFollow.markUserMoved();   // 用户拖走了就别再抢位置
        const pr = panel.getBoundingClientRect();
        ox = e.clientX - pr.left; oy = e.clientY - pr.top;
        top.setPointerCapture(e.pointerId);
    });
    top.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - ox) + "px";
        panel.style.top = (e.clientY - oy) + "px";
    });
    top.addEventListener("pointerup", (e) => { dragging = false; try { top.releasePointerCapture(e.pointerId); } catch (_) {} });

    const sec = document.createElement("div");
    sec.className = "xh-pll-info-sec";
    const h4 = document.createElement("h4");
    h4.textContent = ctx.t.triggers;
    const note = document.createElement("p");
    note.className = "xh-pll-info-note";
    note.textContent = ctx.t.triggersNote;
    const chips = document.createElement("div");
    chips.className = "xh-pll-chips";
    sec.append(h4, note, chips);
    panel.appendChild(sec);

    const renderChips = (info) => {
        const src = (info.triggers && info.triggers.length) ? info.triggers : [];
        const sel = new Set((row.triggers || []).map((w) => w.toLowerCase()));
        const all = [];
        const seen = new Set();
        const push = (w) => { const k = w.toLowerCase(); if (w && !seen.has(k)) { seen.add(k); all.push(w); } };
        src.forEach(push);
        (row.triggers || []).forEach(push);
        chips.innerHTML = "";
        if (!all.length) {
            const none = document.createElement("div");
            none.className = "xh-pll-chip-none";
            none.textContent = ctx.t.noTriggers;
            chips.appendChild(none);
            return;
        }
        all.forEach((w) => {
            const chip = document.createElement("div");
            const selected = sel.has(w.toLowerCase());
            chip.className = "xh-pll-chip" + (selected ? " sel" : "");
            chip.append(document.createTextNode(w));
            chip.addEventListener("click", () => {
                const cur = row.triggers || [];
                const k = w.toLowerCase();
                const idx = cur.findIndex((x) => x.toLowerCase() === k);
                if (idx >= 0) cur.splice(idx, 1); else cur.push(w);
                row.triggers = cur;
                chip.classList.toggle("sel");
                ctx.sync();
            });
            chips.appendChild(chip);
        });
    };

    // 加自己的词
    const addRow = document.createElement("div");
    addRow.className = "xh-pll-addtrig";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = ctx.t.addWord;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "＋";
    addBtn.title = ctx.t.addWord;
    const doAdd = () => {
        const w = inp.value.trim();
        if (!w) return;
        const cur = row.triggers || [];
        if (!cur.some((x) => x.toLowerCase() === w.toLowerCase())) { cur.push(w); row.triggers = cur; ctx.sync(); }
        inp.value = "";
        // 重新渲染（把新词也展示成已选 chip）
        const curInfo = _infoPanel && panel.querySelector(".xh-pll-chips");
        renderChips(_lastInfo || { triggers: [] });
        if (panel) { /* keep open */ }
    };
    addBtn.addEventListener("click", doAdd);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } });
    addRow.append(inp, addBtn);
    sec.appendChild(addRow);

    //  2026-10-29 定位：老代码硬编码到视口右侧（left = innerWidth-360）⇒ 面板离节点老远。
    //    改成贴节点右侧放 + 跟随画布；用户拖动标题栏后不再跟随（拖动逻辑见上）。
    const place = () => {
        const anchorEl = ctx.root;
        const r = anchorEl ? anchorEl.getBoundingClientRect() : null;
        xhPlaceBeside(panel, r, { gap: 12 });
    };
    function nameBoxRect(c) { try { const el = c.root.getBoundingClientRect(); return el; } catch (_) { return null; } }

    let _lastInfo = null;
    fetchLoraInfo(row.lora).then((d) => {
        const info = d.ok ? d.info : {};
        _lastInfo = info;
        meta.textContent = [
            info.base_model ? "基座: " + info.base_model : "",
            info.rank ? "rank: " + info.rank : "",
            info.alpha ? "α: " + info.alpha : "",
        ].filter(Boolean).join("   ");
        renderChips(info);
    });

    // 面板打开时刷新节点位置引用
    place();
    _infoFollow = xhFollowAnchor(panel, ctx.root, { gap: 12 });
}

function buildUI(node) {
    injectStyle();

    //  2026-10-29：节点顶部那条官方工具条上的「 XiaoHei 指南」由 web/xh_node_toolbar.js
    //    用官方钩子 getSelectionToolboxCommands 统一注册（全家族 + 两套画布模式通吃），
    //    这里不再单独挂标题栏按钮。

    const ctx = {
        lang: getLang(),
        pure: isPureType(node?.type),
        rows: [],
        prefs: loadPrefs(),
        root: null,
        rowsBox: null,
        emptyHint: null,
        addBtn: null,
        allBtn: null,
        gearBtn: null,
        jsonWidget: null,
        t: I18N[getLang()],
    };

    const root = document.createElement("div");
    root.className = "xh-pll-root";

    // ── band：Add + 全开关 pill + gear ──
    const band = document.createElement("div");
    band.className = "xh-pll-band";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "xh-pll-add";
    addBtn.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.rows.push({ on: true, lora: "", strength: ctx.prefs.defStrength, triggers: [] });
        ctx.renderAll();
        ctx.sync();
    });

    const toprow = document.createElement("div");
    toprow.className = "xh-pll-toprow";
    const all = document.createElement("div");
    all.className = "xh-pll-all";
    const allSw = document.createElement("span");
    const allCnt = document.createElement("span");
    allCnt.className = "cnt";
    all.append(allSw, allCnt);
    all.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    all.addEventListener("click", (e) => {
        e.stopPropagation();
        const anyOn = ctx.rows.length > 0 && ctx.rows.some((r) => r.on);
        for (const r of ctx.rows) r.on = !anyOn;
        ctx.renderAll();
        ctx.sync();
    });
    const gear = document.createElement("div");
    gear.className = "xh-pll-gear";
    gear.innerHTML = GEAR_SVG;
    gear.title = ctx.t.settings;
    gear.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    gear.addEventListener("click", (e) => {
        e.stopPropagation();
        openSettingsPanel(ctx, node);
    });
    toprow.append(all, gear);
    band.append(addBtn, toprow);

    const rowsBox = document.createElement("div");
    rowsBox.className = "xh-pll-rows";
    const emptyHint = document.createElement("div");
    emptyHint.className = "xh-pll-empty";

    root.append(band, rowsBox, emptyHint);

    ctx.root = root;
    ctx.rowsBox = rowsBox;
    ctx.emptyHint = emptyHint;
    ctx.addBtn = addBtn;
    ctx.allBtn = all;
    ctx.gearBtn = gear;

    const paintBand = () => {
        const t = ctx.t;
        addBtn.textContent = t.add;
        const on = ctx.rows.filter((r) => r.on).length, total = ctx.rows.length;
        allCnt.textContent = t.count(on, total);
        allSw.className = "xh-pll-sw" + (total && on === total ? " on" : "");
        allSw.addEventListener("click", (e) => e.stopPropagation());
        allSw.onclick = (e) => { e.stopPropagation(); const anyOn = ctx.rows.length > 0 && ctx.rows.some((r) => r.on); for (const r of ctx.rows) r.on = !anyOn; ctx.renderAll(); ctx.sync(); };
    };

    ctx.toast = (msg) => {
        const t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#2b2b2b;color:#ddd;" +
            "padding:6px 12px;border-radius:6px;font:12px sans-serif;z-index:10030;border:1px solid " + XH_ACCENT + ";";
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
    };

    ctx.renderAll = function () {
        ctx.rowsBox.innerHTML = "";
        for (const r of ctx.rows) ctx.rowsBox.appendChild(makeRowEl(r, ctx));
        const t = ctx.t;
        emptyHint.textContent = ctx.rows.length === 0 ? t.empty : "";
        emptyHint.style.display = ctx.rows.length === 0 ? "" : "none";
        paintBand();
        try { node.onResize?.(); node.setDirtyCanvas?.(true, true); } catch (e) {}
    };

    ctx.sync = function () {
        if (!ctx.jsonWidget) return;
        // 信封格式：{ prefs, rows }；兼容旧版纯数组（无 prefs 时全用默认）。
        ctx.jsonWidget.value = JSON.stringify({ prefs: { ...ctx.prefs }, rows: ctx.rows });
    };

    ctx.loadFromJson = function (txt) {
        let data;
        try { data = JSON.parse(txt || "[]"); } catch (e) { data = []; }
        let arr, prefs = null;
        if (Array.isArray(data)) { arr = data; }
        else if (data && typeof data === "object") {
            arr = Array.isArray(data.rows) ? data.rows : [];
            if (data.prefs && typeof data.prefs === "object") prefs = data.prefs;
        } else { arr = []; }
        if (prefs) { Object.assign(ctx.prefs, prefs); }
        ctx.rows = arr
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
                on: !!x.on,
                lora: String(x.lora || ""),
                strength: Number(x.strength != null ? x.strength : ctx.prefs.defStrength),
                strength_clip: ctx.prefs.linkStrength
                    ? undefined
                    : (x.strength_clip != null ? Number(x.strength_clip) : undefined),
                triggers: Array.isArray(x.triggers) ? x.triggers.map(String) : [],
            }));
        ctx.renderAll();
    };

    ctx.applyLang = function () {
        ctx.lang = getLang();
        ctx.t = I18N[ctx.lang];
        const t = ctx.t;
        emptyHint.textContent = ctx.rows.length === 0 ? t.empty : "";
        emptyHint.style.display = ctx.rows.length === 0 ? "" : "none";
        paintBand();
    };

    onLangEvent((e) => {
        ctx.lang = (e.detail && e.detail.lang) || getLang();
        ctx.applyLang();
        ctx.renderAll();
        // 端口名也跟着切（触发词 ⇄ TRIGGERS）
        try { applyPortLabels(node, ctx.lang); } catch (err) {}
    });

    return ctx;
}

app.registerExtension({
    name: "XH.LoraStack",
    async beforeRegisterNodeDef(nodeType, nodeData, appArg) {
        if (!NODE_TYPES.has(nodeData.name)) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);
            try {
                const ctx = buildUI(this);

                const w = this.addDOMWidget("xh_lorastack_ui", "custom", ctx.root, {
                    serialize: false,
                    hideOnZoom: false,
                    minWidth: 250,   // 2026-11-06 全家族收口：不再把节点撑回 320
                    minHeight: 46,
                    getMinHeight: () => 40 + ctx.rows.length * 38 + 40,
                    getHeight: () => 40 + ctx.rows.length * 38 + 40,
                });
                this._xhPllCtx = ctx;

                // 端口名本地化（TRIGGERS → 触发词）。 必须在 onNodeCreated 之后：
                //   官方是建节点那一刻给 outputs 填 localized_name 的，早了会被官方覆盖。
                applyPortLabels(this, ctx.lang);

                const bind = () => {
                    const jw = (this.widgets || []).find((x) => x.name === "loras_json");
                    if (!jw) return false;
                    jw.hidden = true;
                    ctx.jsonWidget = jw;
                    ctx.loadFromJson(jw.value);
                    return true;
                };
                if (!bind()) {
                    for (const d of [80, 300, 1000]) setTimeout(bind, d);
                }
            } catch (e) {
                console.error("[XiaoHei-LoRA堆栈] UI 构建失败", e);
            }
            return r;
        };

        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                const ctx = this._xhPllCtx;
                const raw = (info?.widgets_values || [])[0];
                if (ctx && typeof raw === "string") {
                    ctx.loadFromJson(raw);
                    const jw = (this.widgets || []).find((x) => x.name === "loras_json");
                    if (jw) { jw.hidden = true; if (jw.value !== raw) jw.value = raw; }
                } else if (!ctx && typeof raw === "string") {
                    this._xhPllPendingJson = raw;
                }
            } catch (e) {}
            return r;
        };

        const origLoaded = nodeType.prototype.onLoadedGraphNode;
        nodeType.prototype.onLoadedGraphNode = function (event, info) {
            const r = origLoaded?.apply(this, arguments);
            try {
                const ctx = this._xhPllCtx;
                const raw = this._xhPllPendingJson ?? (info?.widgets_values || [])[0];
                if (ctx && typeof raw === "string") ctx.loadFromJson(raw);
                this._xhPllPendingJson = undefined;
            } catch (e) {}
            return r;
        };

        const origRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            releaseButtons(this);
            return origRemoved?.apply(this, arguments);
        };

        const TITLES = nodeData.name === NODE_TYPE_PURE
            ? { zh: "纯LoRA堆栈", en: "Pure LoRA Stack" }
            : { zh: "LoRA堆栈", en: "LoRA Stack" };
        const origNC = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origNC?.apply(this, arguments);
            const applyTitle = () => {
                const lang = getLang();
                if (!this.title || this.title === TITLES.zh || this.title === TITLES.en) {
                    this.title = lang === "zh" ? TITLES.zh : TITLES.en;
                }
            };
            applyTitle();
            this._xhTitleHandler = applyTitle;
            return r;
        };
        onLangEvent((e) => {
            for (const n of appArg.graph?._nodes || []) {
                if (NODE_TYPES.has(n.type) && n._xhTitleHandler) n._xhTitleHandler();
            }
        });
    },
});
