// XiaoHei-预览任意（XHShowText）· 官方 PreviewAny 的 1:1 复刻 + 家族附加条
//
// 官方真源（本机 static/assets/core-*.js，扩展名 Comfy.PreviewAny）：
//   beforeRegisterNodeDef → onNodeCreated: addTextPreviewWidgets(this)
//                         → onExecuted:    updateTextPreviewWidgets(this, message)
//                         → onNodeOutputsUpdated: 按 type 找节点再 update
//   并把上述两函数公开到 window.comfyAPI.textPreviewWidgets。
//   addTextPreviewWidgets 内部创建：
//     · preview_text 组件（WidgetTextPreview-*.js：Textarea / Markdown 渲染 /
//       hover 复制·下载），serialize:false
//     · preview_mode BOOLEAN widget（label_on "Markdown" / label_off "Plain text"）
//
// ⇒ 显示组件**不自绘**，直接调官方公开 API。
//
// 2026-11-15 本轮改动（用户明确要求，覆盖总纲 §24「复刻件不加按钮」那条）：
//   ① 官方 preview_mode 的三处英文硬编码本地化成中文。
//      官方中文包只翻节点名 / 端口名（nodeDefs-*.js），**不翻 widget 标签**；
//      widget 名是 preview_mode，左标签由 WidgetLayoutField 读
//      `displayLabel ?? label ?? name`，两档文字由 WidgetToggleSwitch 读
//      `widget.options.off / .on`（官方 core-*.js 的 useBooleanWidget 里
//      `{on: label_on, off: label_off}` 写死英文）。
//      ⇒ 只改显示字段，⛔ 绝不改 widget.name（存档 / prompt 按名字取）。
//   ② 底部新增一行常驻「复制内容」按钮 + 状态反馈。官方只在 hover 时给
//      复制/下载，用户要一个看得见、点了有反馈的键（家族 §13.10 按钮反馈铁律）。
//      复制读 preview_text.value，并在 onExecuted / 历史恢复时缓存一份兜底。
//   ③ 图案走家族自有图标库 xhIconHTML("复制")，按钮配色走 kit 四档 paintBarBtn，
//      DOM 控件锁高 + 三重防存档加固（§13.48），⛔ 不污染 widgets_values。
//
// ⛔ 别把复制条做成家族工具条 / 别写 widgets_values / 别改端口 name。

import { paintBarBtn, xhIconHTML, lockDomWidgetHeight } from "./xh_ui_kit.js";

const { app } = window.comfyAPI.app;

const NODE_TYPE = "XHShowText";
const W_PREVIEW = "preview_text";
const W_MODE = "preview_mode";
const W_COPY = "xh_preview_copy_bar";
const CSS_ID = "xh-preview-copy-css";

// Markdown 是格式专有名词，保留但补中文说明，避免用户以为还没翻译
const ZH = { mode: "预览方式", plain: "纯文本", md: "Markdown 排版" };
const OLD_TEXT = new Map([
    ["preview_mode", ZH.mode],
    ["Plain text", ZH.plain],
    ["Markdown", ZH.md],
]);

const textPreview = () => window.comfyAPI?.textPreviewWidgets || null;

/** 官方 nodeDefs 中文表把 source 译成「源」、STRING 译成「字符串」；
 *  自定义节点不走那张表，得自己给 slot 打 label / localized_name。 */
function xhLocalizeSlots(node) {
    const set = (slot, zh) => {
        if (!slot) return;
        slot.label = zh;
        slot.localized_name = zh;   // Nodes 2.0 Vue 渲染器读这个字段
    };
    set(node.inputs?.[0], "源");
    set(node.outputs?.[0], "字符串");
    try {
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
        node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 2 });
        node.setDirtyCanvas?.(true, true);
    } catch (e) {}
}

/** 找节点：兼容 graph.getNodeById 与 _nodes 两种形态（官方用 rootGraph 遍历） */
function xhNodeById(id) {
    try {
        const g = app.graph;
        if (!g) return null;
        if (typeof g.getNodeById === "function") return g.getNodeById(id);
        return (g._nodes || g.nodes || []).find((n) => String(n.id) === String(id)) || null;
    } catch (e) { return null; }
}

// ── ① 官方 preview_mode widget 中文化 ──────────────────────────────────────

/** 改显示字段，不动 name / 不动 value / 不动 serialize。幂等。 */
function xhLocalizePreviewMode(node) {
    const w = (node.widgets || []).find((x) => x && x.name === W_MODE);
    if (!w) return false;
    w.label = ZH.mode;
    w.displayLabel = ZH.mode;          // WidgetLayoutField 最优先读它
    w.options = w.options || {};
    w.options.off = ZH.plain;          // 关态：纯文本
    w.options.on = ZH.md;              // 开态：Markdown 排版
    return true;
}

/** 节点 DOM 根（Nodes 2.0 用 data-node-id，旧画布回退 node.element） */
function xhNodeDom(node) {
    try {
        const id = node?.id;
        if (id != null) {
            const el = document.querySelector('[data-node-id="' + String(id) + '"]');
            if (el) return el;
        }
        return node?.element || null;
    } catch (e) { return null; }
}

/** DOM 兜底：万一 widget 已经渲染过英文，把那几个短标签文本直接换成中文。
 *  只认「文本精确等于旧英文」且父元素整段文字 ≤30 字 ⇒ 不会误伤预览正文里
 *  恰好出现 "Markdown" 这个单词的长文本。幂等。 */
function xhPatchDomLabels(node) {
    const root = xhNodeDom(node);
    if (!root || typeof document.createTreeWalker !== "function") return;
    try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const hits = [];
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
            const v = String(t.nodeValue || "").trim();
            if (!OLD_TEXT.has(v)) continue;
            const p = t.parentElement;
            if (!p || String(p.textContent || "").trim().length > 30) continue;
            hits.push([t, OLD_TEXT.get(v)]);
        }
        for (const [t, zh] of hits) t.nodeValue = zh;
    } catch (e) {}
}

function xhRelabel(node, withDom) {
    xhLocalizePreviewMode(node);
    if (withDom) xhPatchDomLabels(node);
}

/** 创建 / 读档 / 恢复时多拍兜底：DOM widget 是异步挂载的 */
function xhScheduleRelabel(node) {
    const run = () => { try { xhRelabel(node, true); } catch (e) {} };
    try {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
        setTimeout(run, 0);
        setTimeout(run, 260);
    } catch (e) { run(); }
}

// ── ② 常驻复制条 ──────────────────────────────────────────────────────────

/** 与官方 core-*.js 的 toPreviewText 同口径 */
function xhToPreviewText(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.filter((x) => x != null).join("\n\n");
    return String(v);
}

/** 优先读官方 preview_text widget 的当前值，读不到用执行时缓存的文本 */
function xhReadPreview(node) {
    const w = (node.widgets || []).find((x) => x && x.name === W_PREVIEW);
    let v = "";
    try { v = w?.value; } catch (e) {}
    if (typeof v !== "string" || !v) {
        try { const g = w?.getValue?.(); if (typeof g === "string") v = g; } catch (e) {}
    }
    if (typeof v !== "string" || !v) v = node._xhPreviewText || "";
    return typeof v === "string" ? v : "";
}

async function xhCopyText(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {}
    // Electron / 非安全上下文里 clipboard API 可能不给权限 ⇒ textarea + execCommand 兜底
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:absolute;left:-9999px;top:0;opacity:0;pointer-events:none";
        (document.body || document.documentElement).appendChild(ta);
        ta.select();
        try { ta.setSelectionRange(0, text.length); } catch (e) {}
        const ok = document.execCommand("copy");
        ta.remove();
        return !!ok;
    } catch (e) { return false; }
}

function xhInjectCopyCSS() {
    try {
        if (document.getElementById(CSS_ID)) return;
        const st = document.createElement("style");
        st.id = CSS_ID;
        st.textContent = [
            ".xh-pv-copybar{display:flex;align-items:center;gap:8px;width:100%;padding:3px 4px;box-sizing:border-box;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif)}",
            ".xh-pv-copybtn{height:22px;gap:5px}",
            ".xh-pv-copybtn-text{display:inline-block}",
            ".xh-pv-copystate{font-size:11px;line-height:1;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.9}",
            ".xh-pv-ok{animation:xh-pv-pop .32s ease,xh-pv-flash .3s ease 3}",
            ".xh-pv-bad{animation:xh-pv-pop .32s ease,xh-pv-flashred .3s ease 3}",
            "@keyframes xh-pv-pop{0%{transform:scale(1)}45%{transform:scale(.9)}100%{transform:scale(1)}}",
            "@keyframes xh-pv-flash{0%,100%{filter:brightness(1)}50%{filter:brightness(1.7)}}",
            "@keyframes xh-pv-flashred{0%,100%{filter:brightness(1)}50%{filter:brightness(1.6) sepia(.5) hue-rotate(-30deg)}}",
        ].join("\n");
        (document.head || document.body).appendChild(st);
    } catch (e) {}
}

/** 家族按钮反馈铁律 §13.10：文字变结果 + 弹跳 + 闪底色 + 状态行，1.8s 后复原 */
function xhAddCopyBar(node) {
    if (node._xhCopyBar || typeof node.addDOMWidget !== "function") return node._xhCopyBar || null;

    const bar = document.createElement("div");
    bar.className = "xh-pv-copybar";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "复制上方预览框里的全部文字";
    paintBarBtn(btn, "neutral");            // 家族四档配色，⛔ 不自己写色值
    const ico = document.createElement("span");
    ico.innerHTML = xhIconHTML("复制", { size: 12, color: "current" });
    const btnText = document.createElement("span");
    btnText.className = "xh-pv-copybtn-text";
    btnText.textContent = "复制内容";
    btn.appendChild(ico);
    btn.appendChild(btnText);

    const state = document.createElement("span");
    state.className = "xh-pv-copystate";
    bar.appendChild(btn);
    bar.appendChild(state);

    // ⛔ 父容器只在冒泡阶段拦截（捕获阶段会连按钮自己的 handler 一起掐掉）
    for (const ev of ["pointerdown", "mousedown", "dblclick", "keydown", "click"]) {
        bar.addEventListener(ev, (e) => e.stopPropagation());
    }

    const ui = { widget: null, bar, btn, btnText, state, timer: 0 };
    const flash = (ok, msg, color) => {
        ui.btnText.textContent = ok ? "已复制" : (msg || "复制失败");
        ui.state.textContent = msg || (ok ? "已复制" : "复制失败");
        ui.state.style.color = color;
        ui.btn.classList.remove("xh-pv-ok", "xh-pv-bad");
        try { void ui.btn.offsetWidth; } catch (e) {}   // 重置动画
        ui.btn.classList.add(ok ? "xh-pv-ok" : "xh-pv-bad");
        clearTimeout(ui.timer);
        ui.timer = setTimeout(() => {
            ui.btnText.textContent = "复制内容";
            ui.state.textContent = "";
            ui.state.style.color = "";
            ui.btn.classList.remove("xh-pv-ok", "xh-pv-bad");
        }, 1800);
    };

    btn.addEventListener("click", async () => {
        const text = xhReadPreview(node);
        if (!text) { flash(false, "还没有内容可复制", "#E8A33C"); return; }
        const ok = await xhCopyText(text);
        if (ok) flash(true, "已复制 " + text.length + " 字", "#5DCAA5");
        else flash(false, "复制失败，请手动选中文字", "#F09595");
    });

    try {
        ui.widget = node.addDOMWidget(W_COPY, "custom", bar, {
            serialize: false,
            hideInPanel: true,
            getMinHeight: () => 28,
        });
    } catch (e) { console.warn("[XHShowText] 复制条挂载失败:", e); }

    if (ui.widget) {
        // §13.48：三重加固，DOM 控件绝不进 widgets_values（否则分享工作流串位）
        try {
            ui.widget.serialize = false;
            if (ui.widget.options) ui.widget.options.serialize = false;
            ui.widget.serializeValue = () => undefined;
        } catch (e) {}
        lockDomWidgetHeight(ui.widget, 28);   // Vue 下行高 min-content，不撑空白
    }
    xhInjectCopyCSS();
    node._xhCopyBar = ui;
    return ui;
}

// ── ③ 扩展 hooks ──────────────────────────────────────────────────────────

app.registerExtension({
    name: "XH.ShowText.PreviewAnyClone",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const origOnCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnCreated?.apply(this, arguments);
            const api = textPreview();
            if (!api?.addTextPreviewWidgets) {
                console.error("[XHShowText] 官方 textPreviewWidgets API 缺失，预览界面无法创建");
            } else {
                try { api.addTextPreviewWidgets(this); }
                catch (e) { console.error("[XHShowText] 挂载官方预览组件失败:", e); }
            }
            try { xhLocalizeSlots(this); } catch (e) {}
            try { xhRelabel(this, false); } catch (e) {}
            try { xhAddCopyBar(this); } catch (e) { console.warn("[XHShowText] 复制条创建失败:", e); }
            xhScheduleRelabel(this);
            return r;
        };

        // 读档后 widget 可能重建 ⇒ 再贴一次中文
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origOnConfigure?.apply(this, arguments);
            xhScheduleRelabel(this);
            return r;
        };

        const origOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const r = origOnExecuted?.apply(this, arguments);
            try { this._xhPreviewText = xhToPreviewText(message?.text); } catch (e) {}
            try { textPreview()?.updateTextPreviewWidgets?.(this, message); }
            catch (e) { console.warn("[XHShowText] 刷新预览失败:", e); }
            return r;
        };
    },

    // 重开工作流 / 从历史恢复：官方 Comfy.PreviewAny 同款 hook，
    // 只是把类型判断从 "PreviewAny" 换成 "XHShowText"，并缓存文本供复制用
    onNodeOutputsUpdated(outputs) {
        const api = textPreview();
        if (!api?.updateTextPreviewWidgets) return;
        for (const [id, out] of Object.entries(outputs || {})) {
            const n = xhNodeById(id);
            if (n?.type === NODE_TYPE) {
                try {
                    n._xhPreviewText = xhToPreviewText(out?.text);
                    api.updateTextPreviewWidgets(n, out);
                } catch (e) {}
            }
        }
    },
});
