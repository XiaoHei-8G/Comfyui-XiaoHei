//  XiaoHei · 接线特效 v4
//  ---------------------------------------------------------------------------
//  机制 100% 照 Pixaroma 的 js/connection_fx/index.js 来，只做两件事：
//    ① 整体尺寸乘 connFxSize（默认 2.2 ⇒ 光环/粒子/电弧都是原版的两倍多）
//    ② 接上时加一声 WebAudio 实时合成的「滋啦」（零音频文件）
//
//  ⚠ 为什么之前会「没效果」：
//    新版前端（Nodes 2.0 / Vue）里端口圆点是 DOM 元素 [data-testid="slot-dot"]，
//    外层 [data-slot-key="<节点id>-in|out-<序号>"]；拖线时 LiteGraph 的 canvas
//    不重绘、坐标也对不上。所以必须用 position:fixed 的 DOM 覆盖层 + 自己的 rAF。
//    这里再加一层保险：**只要页面上存在 [data-slot-key]，就走 DOM 定位**，
//    不依赖 LiteGraph.vueNodesMode 这个开关；只有纯经典画布才回落到 getConnectionPos。
//
//  关掉：设置 XiaoHei → 连线 → 接线特效（或直接删掉本文件）
import { app } from "../../scripts/app.js";

//  设置 id 的真前缀是 XH.Links（xh_animated_links.js 里的 NS），不是 XiaoHei。
//  之前写错前缀 ⇒ 三个设置永远读不到、全走默认值 ⇒ 滑条怎么拖都不变。
//  这里两个前缀都试，并且优先读面板 onChange 写进来的即时值。
const PREFIXES = ["XH.Links.", "XiaoHei."];

function _raw(key) {
    const live = window.__XH_CFX;
    if (live && live[key] !== undefined) return live[key];
    for (const p of PREFIXES) {
        try {
            const v = app.ui.settings.getSettingValue(p + key);
            if (v !== undefined && v !== null && v !== "") return v;
        } catch (e) { /* 这个前缀没有，试下一个 */ }
        try {
            const s = app.extensionManager && app.extensionManager.setting;
            if (s && typeof s.get === "function") {
                const v = s.get(p + key);
                if (v !== undefined && v !== null) return v;
            }
        } catch (e) { /* 同上 */ }
    }
    return undefined;
}
function gn(key, dflt) {
    const v = _raw(key);
    if (v === undefined || v === null || v === "") return dflt;
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
}
function gb(key, dflt) {
    const v = _raw(key);
    if (v === undefined || v === null || v === "") return dflt;
    if (v === "false" || v === "0" || v === 0) return false;
    if (v === "true" || v === "1" || v === 1) return true;
    return !!v;
}
function gs(key, dflt) {
    const v = _raw(key);
    if (v === undefined || v === null || v === "") return dflt;
    return String(v);
}
function SZ() { return Math.max(0.8, gn("connFxSize", 2.2)); }

// ── 音效：五种可选，全部实时合成（设置 → 连线 → 接线音效） ─────────────────
let _actx = null;
function _ac() {
    try {
        if (!_actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            _actx = new AC();
        }
        if (_actx.state !== "running") _actx.resume().catch(() => {});
        return _actx;
    } catch (e) { return null; }
}
//  浏览器只在「用户手势」里允许出声。pointerdown 时推 1 帧静音 buffer，
//  把上下文彻底解锁；之后再从 rAF 里播就不会被拦。
function _unlock() {
    const c = _ac();
    if (!c) return;
    try {
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start(0);
    } catch (e) {}
}
//  噪声片段（自带指数衰减），咔哒声用
function _noise(c, dur, curve) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve);
    const src = c.createBufferSource();
    src.buffer = b;
    return src;
}
//  总线：0.85*vol 的平台 → 尾部指数衰减
function _bus(c, vol, at, hold, tail) {
    const out = c.createGain();
    out.gain.setValueAtTime(0.85 * vol, at);
    out.gain.setValueAtTime(0.85 * vol, at + hold);
    out.gain.exponentialRampToValueAtTime(0.0001, at + tail);
    out.connect(c.destination);
    return out;
}

//  ① 卡扣（withTail = 再叠一层电流尾音）
function _vClick(c, vol, withTail) {
    const t0 = c.currentTime + 0.005;
    const out = _bus(c, vol, t0, withTail ? 0.17 : 0.12, withTail ? 0.34 : 0.24);

    const thump = c.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(150, t0);
    thump.frequency.exponentialRampToValueAtTime(52, t0 + 0.16);
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.95, t0);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    thump.connect(tg); tg.connect(out);
    thump.start(t0); thump.stop(t0 + 0.24);

    const n1 = _noise(c, 0.012, 2), n1g = c.createGain();
    n1g.gain.value = 0.85;
    n1.connect(n1g); n1g.connect(out); n1.start(t0);

    const n2 = _noise(c, 0.008, 2), n2g = c.createGain();
    n2g.gain.value = 0.45;
    n2.connect(n2g); n2g.connect(out); n2.start(t0 + 0.07);

    if (!withTail) return;
    const z = c.createOscillator();
    z.type = "triangle";
    z.frequency.setValueAtTime(1400, t0 + 0.02);
    z.frequency.exponentialRampToValueAtTime(500, t0 + 0.18);
    const zg = c.createGain();
    zg.gain.setValueAtTime(0.0001, t0 + 0.02);
    zg.gain.linearRampToValueAtTime(0.42, t0 + 0.03);
    zg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
    z.connect(zg); zg.connect(out);
    z.start(t0 + 0.02); z.stop(t0 + 0.22);
}

//  ② 通电：90→900Hz 锯齿上扫 + 55Hz 嗡鸣 + 起手爆音
function _vPowerOn(c, vol) {
    const t0 = c.currentTime + 0.005;
    const out = _bus(c, vol, t0, 0.10, 0.60);

    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(900, t0 + 0.13);
    const g = c.createGain();
    g.gain.setValueAtTime(0.42, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.32);

    const hum = c.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 55;
    const hg = c.createGain();
    hg.gain.setValueAtTime(0.22, t0);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.52);
    hum.connect(hg); hg.connect(out); hum.start(t0); hum.stop(t0 + 0.55);

    const n = _noise(c, 0.05, 2), ng = c.createGain();
    ng.gain.value = 0.5;
    n.connect(ng); ng.connect(out); n.start(t0);
}

//  ③ 滋啦（旧版默认音）
function _vZap(c, vol) {
    const t0 = c.currentTime + 0.005;
    const out = _bus(c, vol, t0, 0.02, 0.26);

    [[220, "sine", 0.35], [880, "sine", 0.45], [1560, "triangle", 0.25]].forEach(([f, type, amp]) => {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * 0.55, t0 + 0.20);
        const g = c.createGain();
        g.gain.value = amp;
        o.connect(g); g.connect(out);
        o.start(t0); o.stop(t0 + 0.30);
    });

    const n = _noise(c, 0.06, 3), ng = c.createGain();
    ng.gain.value = 0.4;
    n.connect(ng); ng.connect(out); n.start(t0);
}

//  ④ 脉冲：1500 / 1100 / 1800Hz 三连方波
function _vBlip(c, vol) {
    const t0 = c.currentTime + 0.005;
    const out = _bus(c, vol, t0, 0.02, 0.22);
    [[1500, 0, 0.045], [1100, 0.045, 0.045], [1800, 0.09, 0.075]].forEach(([f, off, d]) => {
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.linearRampToValueAtTime(0.30, t0 + off + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + d);
        o.connect(g); g.connect(out);
        o.start(t0 + off); o.stop(t0 + off + d + 0.01);
    });
}

function _schedule(c) {
    const vol = Math.max(0, Math.min(100, gn("connFxVolume", 60))) / 100;
    if (vol <= 0) return;
    const kind = gs("connFxSfx", "卡扣+电流");
    try {
        if (kind === "卡扣") return _vClick(c, vol, false);
        if (kind === "通电") return _vPowerOn(c, vol);
        if (kind === "滋啦") return _vZap(c, vol);
        if (kind === "脉冲") return _vBlip(c, vol);
        return _vClick(c, vol, true);          // 默认：卡扣+电流
    } catch (e) {}
}
function _sfx() {
    const c = _ac();
    if (!c) return;
    if (c.state === "running") { _schedule(c); return; }
    //  还没 running：等 resume 成功再排；失败就静默（多半是标签页被静音或没输出设备）
    c.resume().then(() => _schedule(c)).catch(() => {});
}

// ── CSS ───────────────────────────────────────────────────────────────────
let _css = false;
function _injectCSS() {
    if (_css) return;
    _css = true;
    const s = document.createElement("style");
    s.id = "xh-conn-fx-css";
    s.textContent = `
    .xh-cfx-wrap { position: fixed; left:0; top:0; width:0; height:0; pointer-events:none; z-index:99998; }
    .xh-cfx-magnet {
      position: fixed; pointer-events:none; border-radius:50%;
      transform: translate(-50%,-50%);
      background: radial-gradient(circle,
        rgba(255,240,200,0.98) 0%,
        rgba(255,196,110,0.92) 26%,
        rgba(255,132,48,0.55) 52%,
        rgba(255,120,40,0.18) 68%,
        rgba(255,120,40,0) 78%);
      box-shadow: 0 0 10px 2px rgba(255,150,60,0.35);
    }
    .xh-cfx-particle {
      position: fixed; pointer-events:none; border-radius:50%;
      transform: translate(-50%,-50%);
      background: rgba(255,232,170,0.98);
      box-shadow: 0 0 8px 3px rgba(255,170,60,0.75);
    }
    .xh-cfx-bolts { position: fixed; pointer-events:none; z-index:99999; overflow:visible; }
    .xh-cfx-bolts polyline {
      fill:none; stroke:#fffbe6; stroke-linecap:round; stroke-linejoin:round;
      filter: drop-shadow(0 0 3px #ffc247) drop-shadow(0 0 8px #ff6a2a);
      opacity:0; animation: xh-cfx-bolt 440ms ease-out forwards;
      stroke-width: calc(1.8px * var(--xh-bw, 1));
    }
    @keyframes xh-cfx-bolt {
      0%   { opacity:0; stroke-width: calc(5.0px * var(--xh-bw, 1)); }
      8%   { opacity:1; stroke-width: calc(3.4px * var(--xh-bw, 1)); }
      45%  { opacity:1; stroke-width: calc(2.4px * var(--xh-bw, 1)); }
      100% { opacity:0; stroke-width: calc(0.8px * var(--xh-bw, 1)); }
    }`;
    document.head.appendChild(s);
}

// ── 端口定位 ───────────────────────────────────────────────────────────────
function _useDom() {
    if (window.LiteGraph && window.LiteGraph.vueNodesMode) return true;
    try { return !!document.querySelector("[data-slot-key]"); } catch (e) { return false; }
}
function _slotKey(node, idx, isIn) {
    return node.id + (isIn ? "-in-" : "-out-") + idx;
}
function _dotMap() {
    const m = new Map();
    let els;
    try { els = document.querySelectorAll("[data-slot-key]"); } catch (e) { return m; }
    for (const el of els) {
        const k = el.getAttribute("data-slot-key");
        if (!k) continue;
        const dot = el.querySelector('[data-testid="slot-dot"]') || el;
        const r = dot.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        m.set(k, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    return m;
}
function _domSlotPos(node, idx, isIn, map) {
    const key = _slotKey(node, idx, isIn);
    if (map) {
        const p = map.get(key);
        if (p) return p;
    }
    try {
        const el = document.querySelector(`[data-slot-key="${key}"]`);
        if (el) {
            const dot = el.querySelector('[data-testid="slot-dot"]') || el;
            const r = dot.getBoundingClientRect();
            if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        const frame = document.querySelector(`[data-node-id="${node.id}"]`);
        if (!frame) return null;
        const rows = frame.querySelectorAll(isIn ? ".lg-slot--input" : ".lg-slot--output");
        const row = rows[idx];
        if (!row) return null;
        const dot = row.querySelector('[data-testid="slot-dot"]') || row;
        const r = dot.getBoundingClientRect();
        return (r.width || r.height) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    } catch (e) { return null; }
}
function _classicSlotPos(node, idx, isIn) {
    try {
        const pos = node.getConnectionPos(isIn, idx);
        const c = app.canvas, ds = c && c.ds, el = c && c.canvas;
        if (!pos || !ds || !el) return null;
        const rect = el.getBoundingClientRect();
        //  经典画布：屏幕坐标 = 画布左上 + (图坐标 + 平移) × 缩放 —— 是「加」
        return {
            x: rect.left + (pos[0] + (ds.offset ? ds.offset[0] : 0)) * (ds.scale || 1),
            y: rect.top + (pos[1] + (ds.offset ? ds.offset[1] : 0)) * (ds.scale || 1),
        };
    } catch (e) { return null; }
}
function _slotPos(node, idx, isIn) {
    if (_useDom()) return _domSlotPos(node, idx, isIn, null);
    return _classicSlotPos(node, idx, isIn);
}
//  鼠标坐标附近最近的端口。
//  ⚠ 不能用 elementFromPoint：Nodes 2.0 的端口圆点是 pointer-events:none，
//    它永远不是命中元素，所以只能按坐标算距离。
//  map 可传「拖拽过程中缓存下来的圆点坐标」——松手瞬间 Vue 会重绘、当场量可能量到 0。
function _slotPairs(map) {
    if (map) return Array.from(map.entries());
    const out = [];
    let els;
    try { els = document.querySelectorAll("[data-slot-key]"); } catch (e) { return out; }
    for (const el of els) {
        const k = el.getAttribute("data-slot-key");
        if (!k) continue;
        const dot = el.querySelector('[data-testid="slot-dot"]') || el;
        const r = dot.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        out.push([k, { x: r.left + r.width / 2, y: r.top + r.height / 2 }]);
    }
    return out;
}
function _nearestSlot(x, y, srcType, maxD, map) {
    let best = null, bestD = maxD || 28;
    const g = app.graph;
    if (!g) return null;

    if (_useDom()) {
        for (const pair of _slotPairs(map)) {
            const m = /^(\d+)-(in|out)-(\d+)$/.exec(pair[0]);
            if (!m) continue;
            const p = pair[1];
            const d = Math.hypot(p.x - x, p.y - y);
            if (d > bestD) continue;
            const node = g.getNodeById ? g.getNodeById(Number(m[1])) : null;
            if (!node) continue;
            const isIn = m[2] === "in";
            const idx = Number(m[3]);
            const slots = isIn ? node.inputs : node.outputs;
            const slot = slots && slots[idx];
            if (!slot) continue;
            if (srcType && !_compat(srcType, slot.type)) continue;
            best = { node, idx, isIn, type: slot.type };
            bestD = d;
        }
        return best;
    }

    //  经典画布：没有 DOM 端口，按图坐标换算成屏幕坐标再比距离
    if (!g._nodes) return null;
    for (const node of g._nodes) {
        for (const isIn of [true, false]) {
            const slots = isIn ? node.inputs : node.outputs;
            if (!slots) continue;
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                if (!slot) continue;
                if (srcType && !_compat(srcType, slot.type)) continue;
                const p = _classicSlotPos(node, i, isIn);
                if (!p) continue;
                const d = Math.hypot(p.x - x, p.y - y);
                if (d <= bestD) { best = { node, idx: i, isIn, type: slot.type }; bestD = d; }
            }
        }
    }
    return best;
}

// ── 拖线状态：DOM 自驱动 + LiteGraph 内部兜底 ───────────────────────────────
let _drag = null;   // { src, type, wantIn }

function _domDragPick(e) {
    const t = e.target;
    const el = t && t.closest ? t.closest("[data-slot-key]") : null;
    if (!el) return false;
    const key = el.getAttribute("data-slot-key") || "";
    const m = /^(\d+)-(in|out)-(\d+)$/.exec(key);
    if (!m) return false;
    const g = app.graph;
    const node = g && g.getNodeById ? g.getNodeById(Number(m[1])) : null;
    if (!node) return false;
    const isIn = m[2] === "in";
    const idx = Number(m[3]);
    const slots = isIn ? node.inputs : node.outputs;
    const slot = slots && slots[idx];
    if (!slot) return false;
    _drag = { src: node, type: slot.type, wantIn: !isIn };
    return true;
}
function _lgDrag() {
    const c = app.canvas;
    if (!c) return null;
    try {
        if (c.connecting_links && c.connecting_links.length) {
            const l = c.connecting_links[0];
            return {
                src: l.node,
                type: (l.output && l.output.type) || (l.input && l.input.type) || l.type,
                wantIn: !!l.output,
            };
        }
        if (c.connecting_node) {
            return {
                src: c.connecting_node,
                type: (c.connecting_output && c.connecting_output.type) || (c.connecting_input && c.connecting_input.type),
                wantIn: !!c.connecting_output,
            };
        }
    } catch (e) {}
    return null;
}
function _dragInfo() { return _drag || _lgDrag(); }

function _compat(a, b) {
    if (!a || !b || a === "*" || b === "*" || a === "" || b === "") return true;
    const A = String(a).split(","), B = String(b).split(",");
    for (const x of A) if (B.indexOf(x) !== -1) return true;
    return false;
}

// ── DOM 池 ────────────────────────────────────────────────────────────────
let _wrap = null;
const _magnets = [], _parts = [];
function _container() {
    if (_wrap && _wrap.isConnected) return _wrap;
    _wrap = document.createElement("div");
    _wrap.className = "xh-cfx-wrap";
    document.body.appendChild(_wrap);
    return _wrap;
}
function _hideAll() {
    for (const el of _magnets) el.style.display = "none";
    for (const el of _parts) el.style.display = "none";
}

let _px = 0, _py = 0;

function _render() {
    const info = _dragInfo();
    const g = app.graph;
    if (!info || !g || !g._nodes) { _hideAll(); return; }

    const sz = SZ();
    const radius = 110 * Math.max(1, sz * 0.8);   // 吸附感知半径随尺寸一起变大
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const FLOW_HZ = 1.3, PARTICLES = 6;
    const map = _useDom() ? _dotMap() : null;
    if (map && map.size) _lastDots = map;   //  给松手判定兜底用

    _container();
    let uM = 0, uP = 0;

    for (const node of g._nodes) {
        if (!node || node === info.src) continue;
        const slots = info.wantIn ? node.inputs : node.outputs;
        if (!slots) continue;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (!slot) continue;
            if (!_compat(info.type, slot.type)) continue;
            const vp = map ? _domSlotPos(node, i, info.wantIn, map) : _classicSlotPos(node, i, info.wantIn);
            if (!vp) continue;
            const dist = Math.hypot(vp.x - _px, vp.y - _py);
            if (dist >= radius) continue;

            const prox = 1 - dist / radius;
            const alpha = prox * (0.55 + pulse * 0.45);
            const size = (16 + prox * 18 + pulse * 8) * sz;

            let el = _magnets[uM];
            if (!el) {
                el = document.createElement("div");
                el.className = "xh-cfx-magnet";
                _container().appendChild(el);
                _magnets.push(el);
            }
            el.style.display = "block";
            el.style.left = vp.x + "px";
            el.style.top = vp.y + "px";
            el.style.width = size + "px";
            el.style.height = size + "px";
            el.style.opacity = alpha.toFixed(3);
            uM++;

            const pD = (1.8 + prox * 0.8) * 2 * sz;
            for (let p = 0; p < PARTICLES; p++) {
                let prog = (t * FLOW_HZ + p / PARTICLES) % 1;
                if (p % 2 === 1) prog = 1 - prog;
                const x = _px + (vp.x - _px) * prog;
                const y = _py + (vp.y - _py) * prog;
                const a = prox * Math.sin(prog * Math.PI) * 0.9;
                let pe = _parts[uP];
                if (!pe) {
                    pe = document.createElement("div");
                    pe.className = "xh-cfx-particle";
                    _container().appendChild(pe);
                    _parts.push(pe);
                }
                pe.style.display = "block";
                pe.style.left = x + "px";
                pe.style.top = y + "px";
                pe.style.width = pD + "px";
                pe.style.height = pD + "px";
                pe.style.opacity = a.toFixed(3);
                uP++;
            }
        }
    }
    for (let k = uM; k < _magnets.length; k++) _magnets[k].style.display = "none";
    for (let k = uP; k < _parts.length; k++) _parts[k].style.display = "none";
}

// ── 电弧 ──────────────────────────────────────────────────────────────────
function _boltPts(x1, y1, x2, y2, seg, jitter) {
    const pts = [[x1, y1]];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 1; i < seg; i++) {
        const t = i / seg;
        const off = (Math.random() - 0.5) * jitter * 2;
        pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]);
    }
    pts.push([x2, y2]);
    return pts;
}
function _attr(pts) {
    return pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}
function _spawnBolts(vp) {
    if (!vp) return;
    try {
        const sz = SZ();
        const pad = 70 * sz;
        const NSVG = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NSVG, "svg");
        svg.classList.add("xh-cfx-bolts");
        svg.style.left = (vp.x - pad) + "px";
        svg.style.top = (vp.y - pad) + "px";
        svg.style.width = (pad * 2) + "px";
        svg.style.height = (pad * 2) + "px";
        svg.style.setProperty("--xh-bw", String(Math.max(1, sz * 0.9)));
        svg.setAttribute("viewBox", `0 0 ${pad * 2} ${pad * 2}`);

        const n = 7 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
            const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.55;
            const len = (22 + Math.random() * 18) * sz;
            const ex = pad + Math.cos(ang) * len;
            const ey = pad + Math.sin(ang) * len;

            const poly = document.createElementNS(NSVG, "polyline");
            poly.setAttribute("points", _attr(_boltPts(pad, pad, ex, ey, 5, 5 * sz)));
            poly.style.animationDelay = (i * 16) + "ms";
            svg.appendChild(poly);

            if (Math.random() > 0.45) {
                const fa = ang + (Math.random() - 0.5) * 1.4;
                const fl = (8 + Math.random() * 9) * sz;
                const fork = document.createElementNS(NSVG, "polyline");
                fork.setAttribute("points", _attr(_boltPts(ex, ey, ex + Math.cos(fa) * fl, ey + Math.sin(fa) * fl, 2, 2 * sz)));
                fork.style.animationDelay = (i * 16 + 20) + "ms";
                svg.appendChild(fork);
            }
        }
        document.body.appendChild(svg);
        setTimeout(() => svg.remove(), 700);
    } catch (e) {}
}

// ── 新连线检测 ─────────────────────────────────────────────────────────────
function _normLink(l) {
    if (!l) return null;
    if (Array.isArray(l)) {
        return { id: l[0], origin_id: l[1], origin_slot: l[2], target_id: l[3], target_slot: l[4] };
    }
    if (typeof l === "object") {
        return {
            id: l.id,
            origin_id: l.origin_id != null ? l.origin_id : (l.node && l.node.id),
            origin_slot: l.origin_slot != null ? l.origin_slot : (l.output && l.output.slot_index),
            target_id: l.target_id,
            target_slot: l.target_slot,
        };
    }
    return null;
}
function _ids() {
    const g = app.graph;
    if (!g || !g.links) return null;
    const s = new Set();
    const L = g.links;
    if (Array.isArray(L)) { for (const l of L) { const n = _normLink(l); if (n && n.id != null) s.add(n.id); } }
    else if (typeof L.forEach === "function") { L.forEach((l) => { const n = _normLink(l); if (n && n.id != null) s.add(n.id); }); }
    else { for (const k in L) { const n = _normLink(L[k]); if (n && n.id != null) s.add(n.id); } }
    return s;
}
function _byId(id) {
    const g = app.graph, L = g && g.links;
    if (!L) return null;
    if (Array.isArray(L)) return _normLink(L.find((l) => { const n = _normLink(l); return n && n.id === id; }));
    if (typeof L.get === "function") return _normLink(L.get(id));
    return _normLink(L[id]);
}

let _lastIds = null, _frame = 0, _suppress = false, _bootAt = 0, _muteDiffUntil = 0;
let _downX = 0, _downY = 0, _downSlot = null, _downLg = null, _sawInfo = null, _lastDots = null;

function _onNewLink(link) {
    const g = app.graph;
    if (!g || !link) return;
    let hit = null;
    if (link.target_id != null && link.target_slot != null) {
        const tn = g.getNodeById(link.target_id);
        if (tn) hit = _slotPos(tn, link.target_slot, true);
    }
    if (hit) _spawnBolts(hit);
    const on = g.getNodeById(link.origin_id);
    const op = on && link.origin_slot != null ? _slotPos(on, link.origin_slot, false) : null;
    if (op) _spawnBolts(op);
    _sfx();
}

function _installLoadHook() {
    if (_installLoadHook._done) return;
    if (typeof app.loadGraphData !== "function") return;
    _installLoadHook._done = true;
    const orig = app.loadGraphData;
    app.loadGraphData = function () {
        _suppress = true;
        let ret;
        try {
            ret = orig.apply(app, arguments);
        } finally {
            Promise.resolve(ret).catch(() => {}).finally(() => {
                setTimeout(() => {
                    _suppress = false;
                    _lastIds = _ids();
                }, 260);
            });
        }
        return ret;
    };
}

// ── 主循环 ────────────────────────────────────────────────────────────────
function _loop() {
    requestAnimationFrame(_loop);
    try {
        _frame++;
        if (!gb("connFx", true)) { _hideAll(); return; }
        _injectCSS();

        const di = _dragInfo();
        if (di) { _sawInfo = di; _render(); }
        else _hideAll();

        if (_frame % 6 === 0) {
            const cur = _ids();
            const warmedUp = performance.now() - _bootAt > 1200;
            if (cur && _lastIds && warmedUp && !_suppress && performance.now() > _muteDiffUntil) {
                for (const id of cur) {
                    if (!_lastIds.has(id)) {
                        const link = _byId(id);
                        if (link) _onNewLink(link);
                    }
                }
            }
            _lastIds = cur;
        }
    } catch (e) {}
}

function _onDown(e) {
    _px = e.clientX;
    _py = e.clientY;
    _downX = e.clientX;
    _downY = e.clientY;
    //  按下那一刻记住起点：端口上？还是从已有的线上揪下来的？
    _downSlot = _nearestSlot(e.clientX, e.clientY, null, 22);
    _downLg = _lgDrag();
    _sawInfo = null;
    _unlock();                 // 借用户手势解锁音频
    if (!_drag) _domDragPick(e);
}
function _onMove(e) {
    _px = e.clientX;
    _py = e.clientY;
}
//  松手时的判定：只要「从端口/已有连线上开始拖」并且「落在可连接端口上」就炸。
//  不再只认「新增 link id」——重接一根原本就存在的线不会产生新 id，之前就漏了这种。
function _finishDrag(e) {
    if (!gb("connFx", true)) return;                                      // 开关关掉就彻底闭嘴
    if (Math.hypot(e.clientX - _downX, e.clientY - _downY) < 8) return;   // 只是点了一下
    //  松手这一刻还在拖的状态最准：window 的捕获阶段比 LiteGraph 自己的 pointerup 先跑，
    //  这时 connecting_links 还没被清掉。
    const live = _lgDrag();
    let srcType = null;
    if (live) srcType = live.type;
    else if (_drag) srcType = _drag.type;
    else if (_downSlot) srcType = _downSlot.type;
    else if (_downLg) srcType = _downLg.type;
    else if (_sawInfo) srcType = _sawInfo.type;

    //  三级兜底，保证不会再「看运气」：
    //    ① 当场量圆点坐标（Vue 重绘时可能量到 0）
    //    ② 退回上一帧缓存下来的坐标
    //    ③ 还不行就放开类型限制，认最近的端口
    let target = _nearestSlot(e.clientX, e.clientY, srcType, 30);
    if (!target && _lastDots) target = _nearestSlot(e.clientX, e.clientY, srcType, 34, _lastDots);
    if (!target && srcType) target = _nearestSlot(e.clientX, e.clientY, null, 30);
    if (!target && _lastDots) target = _nearestSlot(e.clientX, e.clientY, null, 34, _lastDots);
    if (!target) return;

    const vp = _slotPos(target.node, target.idx, target.isIn);
    if (!vp) return;
    _spawnBolts(vp);
    _sfx();
    _muteDiffUntil = performance.now() + 450;   // 防止同一根线被 diff 再炸一次
}
function _onUp(e) {
    try { _finishDrag(e); } catch (err) {}
    _drag = null;
    _downSlot = null;
    _downLg = null;
}
function _onKey(e) {
    if (e.key === "Escape") _drag = null;
}

app.registerExtension({
    name: "XiaoHei.ConnectionFX",
    setup() {
        _injectCSS();
        _installLoadHook();
        _lastIds = _ids();
        _bootAt = performance.now();
        window.addEventListener("pointerdown", _onDown, true);
        window.addEventListener("pointermove", _onMove, true);
        window.addEventListener("pointerup", _onUp, true);
        window.addEventListener("pointercancel", _onUp, true);
        window.addEventListener("keydown", _onKey, true);
        requestAnimationFrame(_loop);
        try { console.log("[XiaoHei.ConnectionFX] v4 已加载 size=" + SZ()); } catch (e) {}
    },
});
