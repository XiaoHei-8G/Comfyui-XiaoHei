// 小黑·全能角色设定表 · 家族前端
//
// 铁律（与 xh_segment_table / xh_chainprompt 一致）：
//   · 只改 label / 显隐 / 点击控件，绝不改后端 widget 的 name 与 COMBO 的 values；
//   · state_json 是**唯一数据源**（后端编译器只读它），前端只负责把它改对；
//   · DOM 工具栏 serialize:false 且只 append；面板 DOM 锁高（lockDomWidgetHeight）；
//   · 视图清单 / 适配器清单从后端路由 /xh/charsheet/registry 动态读，
//     往 views_ext 丢一个 json → 面板自动多一个可点视图（免改前端）。
//
// 用户交互只靠点击：视图格子点一下切换、参考图角色下拉选一下，
// 不出现任何要手打分隔符的大输入框（家族铁律）。
const { app } = window.comfyAPI.app;

import {
    ensureLangBridge, makeXHToolbar, onLangChanged, lockDomWidgetHeight,
    currentLang, releaseButtons,
} from "./xh_ui_kit.js";

import { createArtwork } from "./xh_charsheet_art.js";

ensureLangBridge();

const NODE_TYPE = "XiaoHeiCharacterSheet";

// 8 个参考图角色（value = 存档键，永不改；label 随语言切）
const ROLES = [
    { key: "same_character", zh: "同一人物·补充角度", en: "same character, extra angle" },
    { key: "face", zh: "仅面部", en: "face only" },
    { key: "head", zh: "头部/面部/头发", en: "head, face and hair" },
    { key: "clothing", zh: "整套服装", en: "complete outfit" },
    { key: "clothing_front", zh: "服装正面", en: "front of outfit" },
    { key: "clothing_back", zh: "服装背面", en: "back of outfit" },
    { key: "hands", zh: "手/配件", en: "hands and accessories" },
    { key: "footwear", zh: "足/鞋袜", en: "feet and footwear" },
];

// 面板微文案（节点标题 / 参数标签走共享 i18n，这里只放面板内部的小字）
function T(lang) {
    const zh = lang !== "en";
    return {
        viewsTitle: zh ? "视图（可插拔）" : "Views (pluggable)",
        extHint: zh ? "＋ 扩展视图：往 views_ext 丢 json" : "+ Ext view: drop a json in views_ext",
        rolesTitle: zh ? "参考图角色（每张图干嘛）" : "Reference roles (what each image is for)",
        refLabel: (n) => zh ? `参考图 ${n}` : `Ref ${n}`,
        picked: (n, m) => zh ? `已选 ${n} / ${m} 视图` : `Picked ${n} / ${m} views`,
        adapter: zh ? "适配器" : "Adapter",
        tip: zh
            ? "主图接人物；参考图接完必须在这里选对角色，否则会被当同一人"
            : "Character image = person; pick the right role for each ref or it's treated as the same person",
    };
}

// 内置 13 视图兜底（路由不可用时用，存档值仍以后端校验为准）
const FALLBACK_VIEWS = [
    { id: "face_front", zh: "正面头像", en: "Front portrait", group: "portrait" },
    { id: "face_left", zh: "左侧头像", en: "Left profile portrait", group: "portrait" },
    { id: "face_right", zh: "右侧头像", en: "Right profile portrait", group: "portrait" },
    { id: "face_3q_left", zh: "左侧 3/4 头像", en: "Left three-quarter portrait", group: "portrait" },
    { id: "face_3q_right", zh: "右侧 3/4 头像", en: "Right three-quarter portrait", group: "portrait" },
    { id: "face_back", zh: "后脑头像", en: "Rear portrait", group: "portrait" },
    { id: "body_front", zh: "全身正面", en: "Full-body front", group: "body" },
    { id: "body_left", zh: "全身左侧", en: "Full-body left profile", group: "body" },
    { id: "body_back", zh: "全身背面", en: "Full-body back", group: "body" },
    { id: "clothing_front", zh: "服装正面", en: "Clothing front", group: "clothing" },
    { id: "clothing_back", zh: "服装背面", en: "Clothing back", group: "clothing" },
    { id: "hands", zh: "双手", en: "Hands detail", group: "detail" },
    { id: "feet", zh: "足部/鞋", en: "Feet and footwear", group: "detail" },
];

const REF_INPUTS = ["reference_image_1", "reference_image_2", "reference_image_3"];

// ---------------------------------------------------------------------------
function findWidget(node, name) {
    return (node.widgets || []).find((w) => w && w.name === name) || null;
}

function getState(node) {
    const w = findWidget(node, "state_json");
    if (!w || typeof w.value !== "string" || !w.value.trim()) {
        return { views: [], roles: {} };
    }
    try {
        const d = JSON.parse(w.value);
        if (!d || typeof d !== "object") return { views: [], roles: {} };
        return {
            views: Array.isArray(d.views) ? d.views.filter((x) => typeof x === "string") : [],
            roles: (d.roles && typeof d.roles === "object") ? d.roles : {},
        };
    } catch (_e) {
        return { views: [], roles: {} };
    }
}

function setState(node, state) {
    const w = findWidget(node, "state_json");
    if (!w) return;
    const s = JSON.stringify({ views: state.views, roles: state.roles }, null, 0);
    w.value = s;
    if (w.inputEl) w.inputEl.value = s;
}

// ---------------------------------------------------------------------------
function fetchRegistry(node) {
    fetch("/xh/charsheet/registry")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            if (data && Array.isArray(data.views) && data.views.length) {
                node._xh_cs_views = data.views;
                renderPanel(node);
            }
        })
        .catch(() => {});
}

// 单张视图卡片：缩略图（原创矢量剪影）+ ✓ + 标签，点击切换选中
function makeCard(view, on, lang, node) {
    const card = document.createElement("button");
    card.type = "button";
    card.dataset.vid = view.id;
    card.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px;" +
        "border-radius:8px;cursor:pointer;flex:0 0 auto;background:transparent;" +
        "border:1px solid " + (on ? "#3ad" : "#444") + ";" +
        (on ? "background:#163040;" : "background:#1a1a1a;");
    const fig = document.createElement("span");
    fig.style.cssText =
        "width:54px;height:54px;display:block;overflow:hidden;border-radius:6px;" +
        "position:relative;background:#111;";
    try { fig.append(createArtwork(view.id, "cs-" + view.id, {})); } catch (_e) {}
    const check = document.createElement("span");
    check.textContent = "✓";
    check.style.cssText =
        "position:absolute;top:1px;right:3px;font-size:12px;font-weight:700;color:#9ff;" +
        "display:" + (on ? "block" : "none") + ";text-shadow:0 0 3px #000;";
    fig.appendChild(check);
    const label = document.createElement("span");
    label.style.cssText =
        "font-size:9px;color:" + (on ? "#bff" : "#bbb") + ";max-width:58px;overflow:hidden;" +
        "text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = lang === "en" ? view.en : view.zh;
    card.append(fig, label);
    card.onclick = (e) => {
        e.stopPropagation();
        const st = getState(node);
        const set = new Set(st.views);
        if (set.has(view.id)) set.delete(view.id); else set.add(view.id);
        st.views = [...set];
        setState(node, st);
        renderPanel(node);
    };
    return card;
}

function renderPanel(node) {
    const lang = currentLang() === "en" ? "en" : "zh";
    const t = T(lang);
    const root = node._xh_cs_root;
    if (!root) return;
    const views = node._xh_cs_views || FALLBACK_VIEWS;
    const state = getState(node);
    const selected = new Set(state.views);

    root.innerHTML = "";

    // —— 视图区（按分组渲染缩略图卡片）——
    const vTitle = document.createElement("div");
    vTitle.style.cssText = "font-size:11px;color:#9fe;margin:4px 0 3px;font-weight:600;";
    vTitle.textContent = t.viewsTitle;
    root.appendChild(vTitle);

    const GROUP_ORDER = ["portrait", "body", "clothing", "detail"];
    const GROUP_ZH = { portrait: "头部", body: "身体", clothing: "服装", detail: "细节" };
    const GROUP_EN = { portrait: "Head", body: "Body", clothing: "Clothing", detail: "Detail" };
    const byGroup = {};
    for (const v of views) {
        const g = v.group || "detail";
        (byGroup[g] = byGroup[g] || []).push(v);
    }
    for (const g of GROUP_ORDER) {
        const gv = byGroup[g];
        if (!gv || !gv.length) continue;
        const gTitle = document.createElement("div");
        gTitle.style.cssText = "font-size:10px;color:#9ad;margin:6px 0 3px;";
        gTitle.textContent = lang === "en" ? GROUP_EN[g] : GROUP_ZH[g];
        root.appendChild(gTitle);
        const row = document.createElement("div");
        row.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
        for (const v of gv) row.appendChild(makeCard(v, selected.has(v.id), lang, node));
        root.appendChild(row);
    }

    // 扩展提示（虚线、不可点）
    const ext = document.createElement("div");
    ext.style.cssText =
        "font-size:10px;padding:3px 6px;border-radius:6px;border:1px dashed #777;" +
        "color:#999;flex:0 0 auto;align-self:center;margin-top:6px;";
    ext.textContent = t.extHint;
    root.appendChild(ext);

    // —— 参考图角色区 ——
    const rTitle = document.createElement("div");
    rTitle.style.cssText = "font-size:11px;color:#9fe;margin:8px 0 3px;font-weight:600;";
    rTitle.textContent = t.rolesTitle;
    root.appendChild(rTitle);

    for (let i = 0; i < REF_INPUTS.length; i++) {
        const name = REF_INPUTS[i];
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;";
        const lab = document.createElement("span");
        lab.style.cssText = "font-size:11px;color:#ccc;flex:0 0 auto;width:52px;";
        lab.textContent = t.refLabel(i + 1);
        const sel = document.createElement("select");
        sel.style.cssText = "flex:1 1 auto;font-size:11px;background:#222;color:#eee;border:1px solid #555;border-radius:4px;padding:2px;";
        const cur = (state.roles && state.roles[name]) || "same_character";
        for (const r of ROLES) {
            const opt = document.createElement("option");
            opt.value = r.key;
            opt.textContent = lang === "en" ? r.en : r.zh;
            if (r.key === cur) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.onchange = (e) => {
            e.stopPropagation();
            const st = getState(node);
            st.roles = st.roles || {};
            st.roles[name] = sel.value;
            setState(node, st);
        };
        sel.onclick = (e) => e.stopPropagation();
        row.appendChild(lab);
        row.appendChild(sel);
        root.appendChild(row);
    }

    // —— 信息条 ——
    const info = document.createElement("div");
    info.style.cssText = "font-size:10px;color:#8af;margin-top:6px;";
    const advW = findWidget(node, "adapter");
    const adv = advW && advW.value ? advW.value : "h3";
    const advLabel = (node._xh_cs_adapter_labels && node._xh_cs_adapter_labels[adv]) || adv;
    info.textContent = t.picked(selected.size, views.length) + " · " + t.adapter + "：" + advLabel;
    root.appendChild(info);

    const tip = document.createElement("div");
    tip.style.cssText = "font-size:10px;color:#f96;margin-top:2px;line-height:1.3;";
    tip.textContent = t.tip;
    root.appendChild(tip);

    try { node.setDirtyCanvas?.(true, true); } catch (_e) {}
}

// 把 adapter 的 key→label 也缓存下来（路由返回里带 zh/en）
function cacheAdapterLabels(data) {
    if (!data || !Array.isArray(data.adapters)) return;
    const labels = {};
    for (const a of data.adapters) labels[a.key] = a.zh || a.en || a.key;
    return labels;
}

// ---------------------------------------------------------------------------
function applyLangToNode(node) {
    if (!node || node.type !== NODE_TYPE) return;
    renderPanel(node);
}

function buildNode(node) {
    if (node._xh_cs_built) return;
    node._xh_cs_built = true;

    // 隐藏 state_json（唯一数据源，纯后端字段）
    const sw = findWidget(node, "state_json");
    if (sw) {
        try {
            sw.hidden = true;
            if (sw.element) sw.element.style.display = "none";
            sw.computeSize = () => [0, -4];
            sw.computeLayoutSize = undefined;
        } catch (_e) {}
    }

    // 工具条（中/EN + 标题配色），家族统一，自动置顶
    try { makeXHToolbar(node); } catch (_e) {}

    // 主面板 DOM
    const root = document.createElement("div");
    root.style.cssText = "display:flex;flex-direction:column;padding:2px 4px;box-sizing:border-box;";
    node._xh_cs_root = root;

    const panelWidget = node.addDOMWidget("xh_cs_panel", "custom", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 250,
    });
    lockDomWidgetHeight(panelWidget, () => {
        const r = node._xh_cs_root;
        const h = r && r.offsetHeight ? r.offsetHeight : 250;
        return Math.max(250, h + 10);
    });
    try {
        panelWidget.serialize = false;
        panelWidget.serializeValue = () => undefined;
        if (panelWidget.options) panelWidget.options.serialize = false;
    } catch (_e) {}

    // 先画兜底，再异步拉路由补全（含扩展视图）
    renderPanel(node);
    fetchRegistry(node);
    fetch("/xh/charsheet/registry")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            if (data) {
                node._xh_cs_views = data.views && data.views.length ? data.views : node._xh_cs_views;
                node._xh_cs_adapter_labels = cacheAdapterLabels(data) || node._xh_cs_adapter_labels;
                renderPanel(node);
            }
        })
        .catch(() => {});
}

app.registerExtension({
    name: "XiaoHei.CharacterSheet",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE_TYPE) return;
        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated ? origOnCreated.apply(this, arguments) : undefined;
            try { buildNode(this); } catch (e) { console.warn("[XiaoHei/CharacterSheet] 前端构建失败:", e); }
            return r;
        };
        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            try { releaseButtons(this); } catch (_e) {}
            return origOnRemoved ? origOnRemoved.apply(this, arguments) : undefined;
        };
    },
    async setup() {
        onLangChanged(() => {
            for (const n of (app.graph?.nodes || app.graph?._nodes || [])) {
                if (n && n.type === NODE_TYPE) applyLangToNode(n);
            }
        });
    },
});
