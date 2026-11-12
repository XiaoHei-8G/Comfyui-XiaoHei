// ═══════════════════════════════════════════════════════════════════════
// XiaoHei-视频分段轴 · 前端
//
//  2026-10-31 大改（用户原话：「垃圾中的垃圾…滑动也不好滑动…你都不知道去抄」）
//
// 【我上一版的错】
//   ① 自己手搓了一条「段块 + 竖线把手」的轨道 ⇒ 手感差、不好拖。
//      而家族 kit 里**早就有** makeXHTimelineBar / makeXHTimelineOverview
//      （时间轴色块，注释写着「业界唯一正解」，调研过剪映/Premiere/DaVinci/
//      ComfyTV/NKD/LNL：滑块和数字框都被证伪，只有时间轴位置即意义）。
//      ⇒ 本版**直接用家族组件**，不自己造。
//   ② 没有「从文件夹选视频」的入口（用户投诉项）。
//      ⇒ 本版加： 传视频（照抄 xh_video_load.js 的 /upload/image）
//               选文件（浏览器文件选择器，选完上传进 input 目录）
//   ③ 中英文切换没做好（用户投诉项）。
//      ⇒ 本版所有文案走 xh_image_tools_lang.js 的 XH_TL_I18N 表，切语言时整表替换。
//
// 【本版的交互（全部来自家族组件）】
//   · 时间轴总览：所有段同屏、每段一个颜色
//       · 拖色块      = 改该段起始帧
//       · 拖色块两端  = 改该段长度
//       · 点轨道      = 播放头跳过去
//       · ←/→         = 微调 1 帧（Shift = ±10）
//       · 滚轮        = 缩放视窗（以光标为锚）
//       · 自动吸附邻段头尾（≤5px）
//   · 帧步进按钮：◀帧 / 帧▶（精确到帧）
//   · ＋分割：在播放头处切一刀；↶撤：撤销；⟲重置：回到整段
//
// 铁律：
//   · 只改 label / title，绝不改 name；DOM 控件 serialize:false
//   ·  不调 makeXHToolbar / applyLangToNode（工具条/中文由 xh_image_tools_lang.js 统一管）
//   · DOM 控件必须吞掉画布事件，否则拖一下就变成拖节点（家族铁律）
// ═══════════════════════════════════════════════════════════════════════
import {
    onLangChanged, currentLang, fixWidgetValuesFromSaved, lockDomWidgetHeight,
    makeXHTimelineOverview, paintBarBtn, xhTLText,
} from "./xh_ui_kit.js";

export const TL_WIDGET = "xh_timeline";
window.__tlVersion = "v4-family-timeline-20261031";

const FONT = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';

function tr(zh, en) { return currentLang() === "zh" ? zh : en; }
function T(key) { return xhTLText(key); }

function widget(node, name) { return (node.widgets || []).find((w) => w && w.name === name); }
function str(node, name, dflt) {
    const w = widget(node, name);
    const v = w ? String(w.value ?? "") : "";
    return v.trim() ? v : dflt;
}

function apiURL(p) {
    try {
        const u = window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.apiURL;
        if (typeof u === "function") return u(p);
    } catch (e) { }
    return p;
}
function fetchApi(p, opt) {
    try {
        const a = window.comfyAPI && window.comfyAPI.api;
        if (a && typeof a.fetchApi === "function") return a.fetchApi(p, opt);
    } catch (e) { }
    return fetch(apiURL(p), opt);
}

function playerUrl(name) {
    let file = String(name || "");
    let sub = "";
    const i = file.lastIndexOf("/");
    if (i >= 0) { sub = file.slice(0, i); file = file.slice(i + 1); }
    const p = new URLSearchParams();
    p.set("filename", file);
    p.set("type", "input");
    if (sub) p.set("subfolder", sub);
    p.set("t", String(Date.now()));
    return apiURL("/view?" + p.toString());
}

/** 解析 segments 控件里的 JSON（后端同款规则，坏数据当空） */
function parseSegs(raw) {
    let data = null;
    try { data = JSON.parse(String(raw || "").trim() || "[]"); } catch (e) { return []; }
    if (!Array.isArray(data)) return [];
    const out = [];
    for (const it of data) {
        let s = null, l = null, label = "";
        if (Array.isArray(it) && it.length >= 2) { s = it[0]; l = it[1]; if (typeof it[2] === "string") label = it[2]; }
        else if (it && typeof it === "object") {
            s = it.start ?? it.s; l = it.len ?? it.length ?? it.n; label = String(it.label || "");
        }
        s = Math.round(Number(s)); l = Math.round(Number(l));
        if (!Number.isFinite(s) || !Number.isFinite(l) || l <= 0) continue;
        out.push({ start: Math.max(0, s), len: l, label });
    }
    return out;
}

/** 保证段连续覆盖 [0, total-1] */
function normalize(segs, total) {
    if (!segs.length) return [];
    const out = segs.map((s) => ({ ...s }));
    out[0].start = 0;
    for (let i = 1; i < out.length; i++) out[i].start = out[i - 1].start + out[i - 1].len;
    if (total > 0) {
        const sum = out.reduce((a, s) => a + s.len, 0);
        if (sum !== total) {
            const last = out[out.length - 1];
            last.len = Math.max(1, last.len + (total - sum));
            out[0].start = 0;
            for (let i = 1; i < out.length; i++) out[i].start = out[i - 1].start + out[i - 1].len;
        }
    }
    return out;
}

/** 主入口：给节点装上分段轴 UI。 */
export function setupXHVideoTimeline(node) {
    if (!node || node._xhTL) return;
    const st = node._xhTL = {
        segs: [], fps: 0, total: 0, dur: 0, ar: 16 / 9, file: "",
        probeFail: "", sel: 0,
    };

    // ── DOM ──────────────────────────────────────────────
    const root = document.createElement("div");
    root.style.cssText = "width:100%;display:flex;flex-direction:column;gap:5px;font-family:" + FONT + ";";

    const top = document.createElement("div");
    top.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap;";
    root.appendChild(top);

    const btnUpload = mkBtn("", () => fileInput.click(), "primary");
    const btnFile = mkBtn("", () => fileInput.click());
    const btnPlay = mkBtn("", () => togglePlay());
    const btnPrev = mkBtn("", () => stepFrame(-1));
    const btnNext = mkBtn("", () => stepFrame(1));
    const btnSplit = mkBtn("", () => splitAtPlayhead());
    const btnUndo = mkBtn("", () => undoSplit());
    const btnReset = mkBtn("", () => resetSegs());
    const info = document.createElement("span");
    info.style.cssText = "font-size:11px;color:#e8e8e8;margin-left:auto;white-space:nowrap;";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "video/*,.mp4,.mkv,.webm,.mov,.gif";
    fileInput.style.display = "none";
    root.appendChild(fileInput);

    top.appendChild(btnUpload); top.appendChild(btnFile);
    top.appendChild(btnPlay); top.appendChild(btnPrev); top.appendChild(btnNext);
    top.appendChild(btnSplit); top.appendChild(btnUndo); top.appendChild(btnReset);
    top.appendChild(info);

    const video = document.createElement("video");
    video.muted = true;
    video.style.cssText = "width:100%;max-height:200px;border-radius:6px;background:#141414;display:block;cursor:pointer;";
    root.appendChild(video);

    const ovHost = document.createElement("div");
    root.appendChild(ovHost);

    const list = document.createElement("div");
    list.style.cssText = "max-height:88px;overflow:auto;font-size:11px;color:#c8c8c8;display:flex;flex-direction:column;gap:2px;";
    root.appendChild(list);

    function mkBtn(text, fn, kind) {
        const b = document.createElement("button");
        b.type = "button";
        if (kind === "primary") {
            paintBarBtn(b, "primary");
            b.style.display = "inline-flex";
            b.style.alignItems = "center";
            b.style.boxSizing = "border-box";
            b.style.borderRadius = "4px";
            b.style.height = "22px";
            b.style.padding = "0 8px";
            b.style.font = "11px " + FONT;
        } else {
            b.style.cssText = "height:22px;min-width:24px;padding:0 6px;font:11px " + FONT
                + ";background:#262d38;color:#d5dde5;border:1px solid #3a4450;border-radius:4px;cursor:pointer;";
        }
        b.textContent = text;
        b.onclick = (e) => { e.stopPropagation(); try { fn(); } catch (err) { console.warn("[XiaoHei-分段轴]", err); } };
        b.onmouseenter = () => { b.style.filter = "brightness(1.28)"; };
        b.onmouseleave = () => { b.style.filter = ""; };
        ["pointerdown", "mousedown", "dblclick", "keydown", "click", "wheel"].forEach((ev) =>
            b.addEventListener(ev, (e) => e.stopPropagation(), true));
        return b;
    }

    // 画布手势全拦（否则拖时间轴 = 拖节点）
    ["pointerdown", "mousedown", "dblclick", "keydown", "click", "wheel", "contextmenu"].forEach((ev) =>
        root.addEventListener(ev, (e) => e.stopPropagation()));

    // ── 挂 DOM widget ────────────────────────────────────
    let w = null;
    try {
        w = node.addDOMWidget(TL_WIDGET, "custom", root, {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => tlHeight(),
        });
    } catch (e) {
        console.warn("[XiaoHei-分段轴] addDOMWidget 失败：", e);
        return;
    }
    if (w) {
        w.serialize = false;
        w.options = w.options || {};
        w.options.serialize = false;
        try { w.serializeValue = () => undefined; } catch (e) { }
    }

    function tlHeight() {
        const nw = (node.size && Number(node.size[0])) || 270;
        const inner = Math.max(120, nw - 20);
        const vh = st.ar ? Math.max(90, Math.min(200, Math.round(inner / st.ar))) : 140;
        const rows = st.segs.length;
        const listH = rows ? Math.min(88, 4 + rows * 15) : 0;
        return Math.round(22 + vh + 46 + listH + 16);
    }
    try { lockDomWidgetHeight(w, () => tlHeight()); } catch (e) { console.warn("[XiaoHei-分段轴] 锁高失败：", e); }

    // ── 时间轴总览（家族组件）────────────────────────────
    const overview = makeXHTimelineOverview({
        total: 600,
        fps: 24,
        frames: true,
        //  连续模式：各段首尾相接、长度会变 ⇒ 组件不能用「长度固定」的钳位
        continuous: true,
        segs: [],
        onSegChange: (i, s, l) => {
            //  2026-10-31 真机实测修（用户投诉「滑动也不好滑动」的真凶）：
            //   家族组件给的是「第 i 段的**起点 + 长度**」（各段独立的语义），
            //   而分段轴的语义是「**各段首尾相接、连续覆盖全片**」。
            //   ⇒ 直接把 (s,l) 写进段 i 再 normalize 会被**立刻顶回去**
            //     （normalize 强制 段i.起点 = 段i-1.终点 ⇒ 拖左边没反应、拖右边长度也不对）。
            //    正确映射：**以段 i 的新区间 [s, s+l] 为准**，
            //      前面的段在 [0, s] 里按原比例重分，后面的段在 [s+l, total] 里按原比例重分。
            //      ⇒ 拖动任何一段都合法（段与段永不断开、也永不重叠）。
            applySegmentMove(i, s, l);
            pushSegs();
            drawList();
            refreshInfo();
        },
        onSelect: (i) => { st.sel = i; drawList(); },
    });
    ovHost.appendChild(overview.root);

    // ── 渲染 ─────────────────────────────────────────────
    function currentFrame() {
        if (!st.fps) return 0;
        return Math.max(0, Math.min(st.total - 1, Math.round((video.currentTime || 0) * st.fps)));
    }
    function seekFrame(f) {
        if (!st.fps || !st.total) return;
        const ff = Math.max(0, Math.min(st.total - 1, Math.round(f)));
        try { video.currentTime = ff / st.fps; } catch (e) { }
        refreshInfo();
    }
    function stepFrame(d) {
        if (!st.total) return;
        try { video.pause(); } catch (e) { }
        seekFrame(currentFrame() + d);
    }

    /** 以第 i 段的新区间 [s, s+l] 为准重排全部分段（保持连续覆盖 + 前后段按比例伸缩） */
    function applySegmentMove(i, s, l) {
        const total = st.total;
        if (!total || !st.segs.length) return;
        const old = st.segs.map((x) => ({ ...x }));
        const idx = Math.max(0, Math.min(old.length - 1, i));
        const before = old.slice(0, idx);
        const after = old.slice(idx + 1);
        const out = [];

        // 前面的段：在 [0, s] 里按原比例分配
        const bTotal = before.reduce((a, x) => a + x.len, 0);
        let acc = 0;
        before.forEach((x, k) => {
            let nl = (k === before.length - 1)
                ? (s - acc)
                : Math.round((x.len * (s / Math.max(1, bTotal))));
            nl = Math.max(1, nl);
            out.push({ start: acc, len: nl, label: x.label || "" });
            acc += nl;
        });

        // 第 i 段本身
        const myLen = Math.max(1, Math.min(total - s, Math.round(l)));
        out.push({ start: s, len: myLen, label: old[idx].label || "" });

        // 后面的段：在 [s+myLen, total] 里按原比例分配
        const aTotal = after.reduce((a, x) => a + x.len, 0);
        const room = total - (s + myLen);
        let acc2 = s + myLen;
        after.forEach((x, k) => {
            let nl = (k === after.length - 1)
                ? (total - acc2)
                : Math.round((x.len * (room / Math.max(1, aTotal))));
            nl = Math.max(1, nl);
            out.push({ start: acc2, len: nl, label: x.label || "" });
            acc2 += nl;
        });

        // 收尾：确保首段从 0 起、末段到片尾、总长不超
        out[0].start = 0;
        for (let k = 1; k < out.length; k++) out[k].start = out[k - 1].start + out[k - 1].len;
        st.segs = out;
    }

    function syncOverview() {
        try {
            overview.set({
                total: Math.max(1, st.total),
                fps: st.fps || 24,
                frames: true,
                continuous: true,
                segs: st.segs.map((s) => ({ s: s.start, l: s.len })),
            });
        } catch (e) { }
    }

    function drawList() {
        list.innerHTML = "";
        if (!st.total) return;
        st.segs.forEach((s, i) => {
            const row = document.createElement("div");
            const t0 = st.fps ? (s.start / st.fps) : 0;
            const t1 = st.fps ? ((s.start + s.len) / st.fps) : 0;
            row.style.cssText = "display:flex;gap:6px;align-items:center;padding:1px 4px;border-radius:3px;cursor:pointer;"
                + (i === st.sel ? "background:#333;" : "");
            const dot = document.createElement("span");
            dot.style.cssText = `width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:hsl(${Math.round((i * 360) / Math.max(1, st.segs.length))},58%,58%);`;
            const tx = document.createElement("span");
            tx.style.cssText = "flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
            tx.textContent = T("segTitle")
                .replace("%d", String(i + 1))
                .replace("%d", String(s.start))
                .replace("%d", String(s.start + s.len - 1))
                .replace("%d", String(s.len))
                + `  (${t0.toFixed(2)}s~${t1.toFixed(2)}s)`;
            row.appendChild(dot); row.appendChild(tx);
            row.onclick = (e) => { e.stopPropagation(); st.sel = i; drawList(); seekFrame(s.start); };
            list.appendChild(row);
        });
    }

    function refreshInfo() {
        const f = currentFrame();
        info.textContent = st.total
            ? T("frameInfo").replace("%d", String(f)).replace("%d", String(st.total - 1)).replace("%.2f", (st.fps ? (f / st.fps) : 0).toFixed(2))
            + " · " + T("segCount").replace("%d", String(st.segs.length))
            : (st.probeFail || T("pickVideo"));
        btnPlay.textContent = video.paused ? T("play") : T("pause");
        btnPrev.textContent = T("prevFrame");
        btnNext.textContent = T("nextFrame");
        btnSplit.textContent = T("split");
        btnUndo.textContent = T("undo");
        btnReset.textContent = T("reset");
        btnUpload.textContent = T("upload");
        btnFile.textContent = T("pickFile");
        const has = !!st.total;
        btnSplit.disabled = !has;
        btnUndo.disabled = st.segs.length <= 1;
        btnReset.disabled = !has;
        btnPrev.disabled = !has;
        btnNext.disabled = !has;
        [btnSplit, btnUndo, btnReset, btnPrev, btnNext].forEach((b) => { b.style.opacity = b.disabled ? ".45" : "1"; });
    }

    // ── 操作 ─────────────────────────────────────────────
    function pushSegs() {
        const ww = widget(node, "segments");
        if (!ww) return;
        const val = JSON.stringify(st.segs.map((s) => ({ start: s.start, len: s.len, label: s.label || "" })));
        ww.value = val;
        try { ww.callback && ww.callback(val, node, undefined, undefined); } catch (e) { console.warn("[XiaoHei-分段轴]", e); }
        try { node.setDirtyCanvas && node.setDirtyCanvas(true, true); } catch (e) { }
    }

    function splitAtPlayhead() {
        if (!st.total) return;
        const f = currentFrame();
        let idx = st.segs.findIndex((s) => f >= s.start && f < s.start + s.len);
        if (idx < 0) idx = st.segs.length - 1;
        const s = st.segs[idx];
        if (f <= s.start || f >= s.start + s.len - 1) {
            s.len = Math.max(2, s.len);
            const mid = s.start + Math.floor(s.len / 2);
            st.segs.splice(idx + 1, 0, { start: mid, len: s.len - (mid - s.start), label: "" });
            s.len = mid - s.start;
        } else {
            const rightLen = s.start + s.len - (f + 1);
            st.segs.splice(idx + 1, 0, { start: f + 1, len: rightLen, label: "" });
            s.len = f + 1 - s.start;
        }
        st.segs = normalize(st.segs, st.total);
        st.sel = idx + 1;
        pushSegs(); syncOverview(); drawList(); refreshInfo();
    }

    function undoSplit() {
        if (st.segs.length <= 1) return;
        const last = st.segs[st.segs.length - 1];
        st.segs[st.segs.length - 2].len += last.len;
        st.segs.pop();
        st.segs = normalize(st.segs, st.total);
        st.sel = st.segs.length - 1;
        pushSegs(); syncOverview(); drawList(); refreshInfo();
    }

    function resetSegs() {
        if (!st.total) return;
        st.segs = [{ start: 0, len: st.total, label: "" }];
        st.sel = 0;
        pushSegs(); syncOverview(); drawList(); refreshInfo();
    }

    function togglePlay() {
        if (video.paused) { video.play().catch(() => { }); } else { video.pause(); }
        refreshInfo();
    }

    // ── 选视频：上传 / 本地文件选择 ──────────────────────
    async function uploadToInput(file) {
        const fd = new FormData();
        fd.append("image", file, file.name);
        fd.append("type", "input");
        const resp = await fetchApi("/upload/image", { method: "POST", body: fd });
        if (!resp || !resp.ok) throw new Error("HTTP " + (resp ? resp.status : "?"));
        return await resp.json();
    }

    function selectVideo(name) {
        const w = widget(node, "video");
        if (!w) return;
        try {
            const vals = w.options && w.options.values;
            if (Array.isArray(vals) && !vals.includes(name)) vals.push(name);
        } catch (e) { }
        w.value = name;
        try { w.callback && w.callback(name, node, w); } catch (e) { }
        try { node.setDirtyCanvas && node.setDirtyCanvas(true, true); } catch (e) { }
        loadInfo();
    }

    fileInput.addEventListener("change", async () => {
        const f = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!f) return;
        const looksVideo = /video\//.test(f.type || "") || /\.(mp4|mkv|webm|mov|gif)$/i.test(f.name || "");
        if (!looksVideo) { btnUpload.textContent = T("uploadFail"); setTimeout(() => { btnUpload.textContent = T("upload"); }, 1500); return; }
        btnUpload.textContent = T("uploading");
        btnUpload.disabled = true;
        try {
            const info = await uploadToInput(f);
            const name = info && info.name ? info.name : f.name;
            selectVideo(name);
            btnUpload.textContent = T("uploadOk");
            setTimeout(() => { btnUpload.textContent = T("upload"); }, 1600);
        } catch (e) {
            console.warn("[XiaoHei-分段轴] 上传失败:", e);
            btnUpload.textContent = T("uploadFail");
            setTimeout(() => { btnUpload.textContent = T("upload"); }, 1600);
        } finally {
            btnUpload.disabled = false;
        }
    });

    // ── 播放器事件 ───────────────────────────────────────
    video.addEventListener("loadedmetadata", () => {
        if (video.videoWidth && video.videoHeight) st.ar = video.videoWidth / video.videoHeight;
        refreshInfo();
    });
    video.addEventListener("timeupdate", () => { refreshInfo(); });
    video.addEventListener("play", refreshInfo);
    video.addEventListener("pause", refreshInfo);
    video.addEventListener("error", () => {
        st.probeFail = T("cannotPlay");
        refreshInfo();
    });

    // ── 加载视频信息 ─────────────────────────────────────
    async function loadInfo() {
        const name = str(node, "video", "");
        if (!name) {
            st.total = 0; st.probeFail = T("pickVideo");
            syncOverview(); drawList(); refreshInfo();
            return;
        }
        st.file = name;
        st.probeFail = "";
        try {
            const r = await fetch(apiURL("/xh/videoload/probe?filename=" + encodeURIComponent(name)));
            const j = await r.json();
            if (!j || !j.ok) { st.probeFail = (j && j.error) ? String(j.error) : T("probeFail"); }
            else {
                st.fps = Number(j.fps) || 0;
                st.total = Number(j.frames_total) || 0;
                st.dur = Number(j.duration) || 0;
                if (j.width && j.height) st.ar = j.width / j.height;
            }
        } catch (e) {
            console.warn("[XiaoHei-分段轴] 探测失败：", e);
            st.probeFail = T("probeFail");
        }
        const url = playerUrl(name);
        if (video.dataset.src !== url) { video.dataset.src = url; video.src = url; video.load(); }
        let segs = parseSegs(str(node, "segments", "[]"));
        if (!segs.length && st.total) segs = [{ start: 0, len: st.total, label: "" }];
        st.segs = normalize(segs, st.total);
        hideSegmentsWidget();
        syncOverview(); drawList(); refreshInfo();
    }

    // ── 语言 / 存档 ──────────────────────────────────────
    const refreshText = () => { refreshInfo(); drawList(); syncOverview(); };
    onLangChanged(refreshText);
    try {
        const orig = node.onConfigure;
        node.onConfigure = function () {
            const r = orig ? orig.apply(this, arguments) : undefined;
            try { fixWidgetValuesFromSaved(this, this.__xhSavedValues); } catch (e) { }
            try { hideSegmentsWidget(); } catch (e) { }
            try { loadInfo(); } catch (e) { }
            return r;
        };
    } catch (e) { console.warn("[XiaoHei-分段轴] onConfigure 挂不上：", e); }

    try {
        const ow = widget(node, "video");
        if (ow && ow.callback) {
            const oc = ow.callback;
            ow.callback = function (v) {
                const r = oc.apply(this, arguments);
                try { loadInfo(); } catch (e) { }
                return r;
            };
        }
    } catch (e) { console.warn("[XiaoHei-分段轴] 视频回调挂不上：", e); }

    // ── 把 segments 文本框藏起来（用户不该看 JSON）────────────────────
    //     只做**视觉隐藏**，绝不删 widget、绝不碰 serialize。
    //     Vue Nodes 模式：**唯一有效的开关是 w.hidden = true**
    //       （实测：只设 computeSize=[0,0] 完全无效，JSON 框照样露着；
    //         家族 xh_chainprompt.js 第 1011-1013 行的官方注释也这么说）。
    //        w.hidden 藏的是 widget 本体（输入框），**不是连线端口** ——
    //          提交参数里 segments 仍在、端口照常可连（真机实测过）。
    //     叠加 inputEl display:none 兜底（老画布模式靠它）。
    function hideSegmentsWidget() {
        const sw = widget(node, "segments");
        if (!sw) return;
        try { sw.hidden = true; } catch (e) { }
        try { sw.computeSize = () => [0, 0]; } catch (e) { }
        try { sw.getMinHeight = () => 0; } catch (e) { }
        try { sw.draw = () => { }; } catch (e) { }
        try { sw.mouse = () => false; } catch (e) { }
        const el = sw.inputEl || sw.element || sw.el;
        if (el && el.style) {
            el.style.display = "none";
            el.style.height = "0px";
            el.style.minHeight = "0px";
            el.style.overflow = "hidden";
        }
    }

    // ── 首次加载 ─────────────────────────────────────────
    hideSegmentsWidget();
    loadInfo();
    const loop = () => {
        if (!node || !node._xhTL) return;
        refreshInfo();
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const origRemove = node.onRemoved;
    node.onRemoved = function () {
        try { video.pause(); video.removeAttribute("src"); video.load(); } catch (e) { }
        if (origRemove) { try { origRemove.apply(this, arguments); } catch (e) { } }
    };
}
