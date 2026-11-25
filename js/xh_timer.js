// XiaoHei 计时器 - Nodes 2.0 兼容（修复版 + 中英文切换）
//
//  2026-11-02 修「归零」三连（用户实测：切工作流再切回来 / 进子图再出来 / 队列没跑完也归零）
//   根因 A：计时状态只挂在 JS 实例字段（_startTime / _running）上。
//           官方前端载入工作流是「销毁重建」节点实例
//           （LGraph.configure → clear() → LiteGraph.createNode() → node.configure() → onNodeCreated 重跑），
//           实例字段必丢；能跨实例活着的只有 node.properties（官方 LGraphNode.configure 会把它恢复回来，
//           且 serialize 时会写回工作流 JSON）。
//   根因 B：后端 execution.py 的 execution_start / execution_success 是「每条 prompt 一次」
//           （都写在 execute_async 里）⇒ 批量队列里第 2 条一开始就把表清零、
//           第 1 条一跑完就把表停了 ⇒ 表显示的其实只是「最后一条 prompt 的耗时」。
//   修法：① 状态双载体（内存 Map + node.properties）+ onConfigure 里续表
//         ② execution_start 不重置「已经在跑」的表
//         ③ execution_success 改成「队列排空才停」，批量队列显示整轮总耗时
const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
import { onLangEvent, ensureLangBridge, makeXHToolbar, releaseButtons , paintBarBtn, xhIconHTML} from "./xh_ui_kit.js";
import { xhSpeak, xhWarmup } from "./xh_speech.js";

// ① 语言桥：window.XH_LANG 变 accessor —— 赋值即写 localStorage + 广播 xh:lang-changed
ensureLangBridge();
// ② 家族同步：别的 XiaoHei 节点切语言时，所有计时器跟着切（本节点是自绘 DOM）
onLangEvent((e) => {
    const lang = (e.detail && e.detail.lang) || window.XH_LANG || "zh";
    try {
        forEachTimer((n) => {
            n._lang = lang;
            if (LABELS[lang]) n.title = LABELS[lang].title;
            // 「中/EN」按钮的换字由 kit 的全局集合负责，这里不再自己刷
            if (n._resetBtn && LABELS[lang]) n._resetBtn.textContent = LABELS[lang].reset;
            if (n._remindBtn && LABELS[lang]) {
                n._remindBtn.innerHTML = xhIconHTML("bell", { size: 14, color: "current" }) +
                    "<span>" + LABELS[lang].remind + "</span>";
                try { RemindPanel.syncBtn(n, timerState(n)); } catch (e3) {}
            }
        });
        // 提醒浮层面板开着的话也跟着刷文案
        try { if (typeof refreshRemindPanel === "function") refreshRemindPanel(); } catch (err2) {}
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (err) {}
});

// ---- 节点自身配色（与 XH_LoraStack / XH_Slider / XH_Toolbox 分组控制 同一套：去官方重复色，12 色高辨识度 + 自定义取色器）----

const NODE_TYPE = "XHTimer";
let _timerListenersBound = false;

// 中英文文字
const LABELS = {
    zh: { title: "计时器 XiaoHei", reset: " 重置", remind: " 提醒", remindTitle: "定时提醒", remindOn: "已开启，每", remindOff: "已关闭", every: "每隔", minute: "分钟", hint: "每满设定分钟播报一次", hintStop: "跑完自动播报总用时（无需开关）", quick: "快捷", preview: "试听" },
    en: { title: "Timer XiaoHei", reset: " Reset", remind: " Remind", remindTitle: "Time reminder", remindOn: "On, every", remindOff: "Off", every: "Every", minute: "min", hint: "Announces at each interval", hintStop: "Auto-announces total time on finish (no toggle)", quick: "Quick", preview: "Test" },
};

// ---- 语音播报（计时器完成 / 定时提醒 共用）--------------------------------
//  数字每次都变，没法预生成音频文件 ⇒ 用浏览器 speechSynthesis 现场念中文。
//  只在本地 ComfyUI 跑图时触发：RunningHub 云端不经过本机浏览器。
//  浏览器要求先有用户交互才能播音；“点运行/点铃铛”本身就是交互，天然满足。
const SPEAK = {
    _last: 0,
    unlocked: false,
    unlock() {
        if (this.unlocked || !("speechSynthesis" in window)) return;
        try {
            // 预热：首次真实点击时同步唤醒浏览器语音引擎（走家族共享队列）。
            //  跑完播报是几十秒后的异步触发，不在用户手势栈里，Chrome 可能静默拦。
            xhWarmup();
            this.unlocked = true;
        } catch (e) {}
    },
    // 中文数字（播报用，≤99 够用）
    //  ⚠️“两”只用在单独的 2（两分钟）；复合数里必须念“二”（十二/三十二，不是十两/三十两）
    cnNum(n) {
        n = Math.max(0, Math.round(n));
        const d = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
        if (n === 2) return "两";
        if (n < 10) return d[n];
        if (n < 20) return "十" + (n % 10 ? d[n % 10] : "");
        const t = Math.floor(n / 10), o = n % 10;
        return d[t] + "十" + (o ? d[o] : "");
    },
    // 定时提醒：“已运行两分钟” / “已运行十分钟”
    running(nMin) {
        this.say("已运行" + this.cnNum(nMin) + "分钟");
    },
    // 完成播报：“用时三十二秒零一” / “用时一分零五秒”
    finish(ms) {
        const v = Math.max(0, ms | 0);
        const totalSec = Math.floor(v / 1000);
        const cs = Math.floor((v % 1000) / 10);
        const mm = Math.floor(totalSec / 60);
        const ss = totalSec % 60;
        let txt = "用时";
        if (mm > 0) txt += this.cnNum(mm) + "分";
        if (ss > 0 || mm > 0) txt += this.cnNum(ss) + "秒";
        else txt += "零秒";
        if (cs > 0) {
            // 百分秒逐位念：01 → 零一，12 → 一二（避免听成“十二秒”）
            const dg = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
            txt += dg[Math.floor(cs / 10)] + dg[cs % 10];
        }
        this.say(txt);
    },
    say(txt) {
        if (!txt || !("speechSynthesis" in window)) return;
        // 播报交给家族共享队列排队：不再自己 cancel，避免掐掉其他模块的播报。
        //  （原注释里的「桌宠」已于 2026-11-19 从家族分离。）
        //  防抖交给队列的 FIFO + 完成播报的 finishAnnounced 去重，这里不按时间吞消息。
        try { xhSpeak(txt, { rate: 1, pitch: 1 }); } catch (e) {}
    },
};

// ---- 状态载体（2026-11-02）----------------------------------------------------
//  为什么不能只放 JS 实例字段：官方前端载入工作流会「销毁重建」节点实例，实例字段必丢。
//  为什么不能只放 node.properties：工作流状态在切换时可能是「快照」，存档里的值不一定是最新。
//    ⇒ 双载体：内存 Map（key = 所属图 id : 节点 id，跨实例稳定、跨工作流不串号）
//               + node.properties.xh_timer（同一个对象引用 ⇒ 保存工作流时一起带走，刷新页面也还在）。
const ST_KEY = "xh_timer";
const _MEM = new Map(); // key: `${graphId}:${nodeId}` → 状态对象

// 取节点的稳定键：所属图 id + 节点 id（图 id 来自工作流 JSON 的 id 字段，切换工作流不会串）
function stateKey(node) {
    try {
        const gid = node.graph && node.graph.id;
        const nid = node.id;
        if (gid === undefined || gid === null) return null;
        if (nid === undefined || nid === null || nid === -1) return null;
        return `${gid}:${nid}`;
    } catch (e) {
        return null;
    }
}

// 取（并补齐）本节点的状态对象；内存里的优先于存档里的
function timerState(node) {
    if (!node) return null;
    if (!node.properties) node.properties = {};
    const key = stateKey(node);
    let st = key ? _MEM.get(key) : null;
    if (!st) {
        const propSt = node.properties[ST_KEY];
        st = (propSt && typeof propSt === "object" && !Array.isArray(propSt))
            ? propSt
            : { running: false, startMs: 0, elapsedMs: 0 };
        if (typeof st.running !== "boolean") st.running = false;
        if (typeof st.startMs !== "number" || !isFinite(st.startMs)) st.startMs = 0;
        if (typeof st.elapsedMs !== "number" || !isFinite(st.elapsedMs)) st.elapsedMs = 0;
        // 定时提醒配置（2026-11-19）：随 node.properties 存档，刷新/切工作流都还在
        if (typeof st.remindOn !== "boolean") st.remindOn = false;
        if (typeof st.remindMin !== "number" || !isFinite(st.remindMin) || st.remindMin < 1) st.remindMin = 1;
        st.remindMin = Math.max(1, Math.min(120, Math.round(st.remindMin)));
        // 本轮已播报到第几个整分钟（防同一分钟重复播）——不存档语义，切实例后从档恢复也行
        if (typeof st.remindedN !== "number" || !isFinite(st.remindedN)) st.remindedN = 0;
        if (typeof st.finishAnnounced !== "boolean") st.finishAnnounced = false;
    }
    node.properties[ST_KEY] = st;   // 回写 ⇒ 与内存里的是同一个对象，保存工作流时一起走
    if (key) {
        _MEM.set(key, st);
        if (_MEM.size > 500) {       // 防无限增长（老条目没用了就清一批）
            const it = _MEM.keys();
            for (let i = 0; i < 100; i++) {
                const k = it.next();
                if (k.done) break;
                _MEM.delete(k.value);
            }
        }
    }
    return st;
}

// 毫秒 → mm:ss:cc（cc = 百分秒）
function fmtElapsed(ms) {
    const v = ms > 0 ? ms : 0;
    const s = Math.floor(v / 1000);
    const cs = Math.floor((v % 1000) / 10);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    const cc = String(cs).padStart(2, "0");
    return `${mm}:${ss}:${cc}`;
}

// 收集图里（含所有子图）的全部计时器节点 —— 子图里的节点不在 app.graph.nodes 里
function collectTimerNodes(graph, out, seen) {
    if (!graph || seen.has(graph)) return out;
    seen.add(graph);
    const nodes = graph.nodes || graph._nodes || [];
    for (const n of nodes) {
        if (n && n.type === NODE_TYPE) out.push(n);
    }
    const subs = graph.subgraphs;
    try {
        if (Array.isArray(subs)) {
            for (const g of subs) collectTimerNodes(g, out, seen);
        } else if (subs && typeof subs.forEach === "function") {
            subs.forEach((g) => collectTimerNodes(g, out, seen));   // 新前端是 Map
        }
    } catch (e) {}
    return out;
}

// 对图上所有计时器节点执行 fn（graph.nodes 在旧前端上叫 _nodes，两个都兜住）
function forEachTimer(fn) {
    let list = [];
    try {
        list = collectTimerNodes(app.graph, [], new Set());
    } catch (err) {
        const nodes = (app.graph && (app.graph.nodes || app.graph._nodes)) || [];
        list = nodes.filter((n) => n && n.type === NODE_TYPE);
    }
    for (const n of list) {
        try { fn(n); } catch (e) {}
    }
}

// ---- ④ 停表后闪烁提醒（2026-10-21 用户提的）--------------------------------
//   用途：跑完/中断/报错后表停住，人又不在电脑前 —— 回来一眼看到「还在闪」就知道跑完了。
//   实现：只切一个 CSS class，动画交给浏览器，**不用 setInterval**（不产生后台空转、不泄漏）。
//   什么时候停闪：下一次执行起表 / 手动点「重设」。
const BLINK_CLASS = "xh-timer-blink";
let _blinkStyleInjected = false;
function ensureBlinkStyle() {
    if (_blinkStyleInjected) return;
    _blinkStyleInjected = true;
    try {
        const st = document.createElement("style");
        st.textContent =
            `@keyframes xhTimerBlink {`
            + `0%,100% { opacity:1; }`
            + `50% { opacity:.15; }`
            + `}`
            + `.${BLINK_CLASS} { animation: xhTimerBlink 1s steps(1,end) infinite; }`
            //  2026-11-12：计时中闪烁指示点（绿点脉冲 = 正在计时/活跃）
            + `@keyframes xhTimerRunPulse {`
            + `0%,100% { opacity:1; transform:scale(1); box-shadow:0 0 6px 1px rgba(126,231,135,.85); }`
            + `50% { opacity:.2; transform:scale(.6); box-shadow:0 0 1px 0 rgba(126,231,135,.2); }`
            + `}`
            + `.xh-timer-rundot { animation: xhTimerRunPulse 1.05s ease-in-out infinite; }`
            + `@media (prefers-reduced-motion: reduce) {`
            + `.${BLINK_CLASS} { animation: none; opacity:1; }`
            + `.xh-timer-rundot { animation: none; opacity:1; } }`
            // 定时提醒浮层面板（家族配色，跟主题走）
            + `.xh-timer-remind{position:fixed;z-index:99997;width:238px;display:none;`
            + `background:var(--background,#1b1f22);border:1px solid var(--border,#494a50);`
            + `color:var(--foreground,#e6e6e6);border-radius:10px;padding:12px;`
            + `box-shadow:0 8px 28px rgba(0,0,0,.42);font-family:var(--font-sans,sans-serif);font-size:13px;}`
            + `.xh-timer-remind .xh-tr-hd{display:flex;align-items:center;justify-content:space-between;`
            + `font-weight:500;font-size:14px;margin-bottom:10px;}`
            + `.xh-timer-remind .xh-tr-hd button{border:0;background:transparent;color:var(--foreground,#e6e6e6);`
            + `cursor:pointer;font-size:16px;line-height:1;padding:2px 5px;border-radius:4px;}`
            + `.xh-timer-remind .xh-tr-hd button:hover{background:var(--secondary,#262729);}`
            + `.xh-timer-remind .xh-tr-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}`
            + `.xh-timer-remind .xh-tr-row .lab{color:var(--color-text-secondary,var(--foreground,#e6e6e6));}`
            + `.xh-timer-remind .xh-tr-step{display:inline-flex;align-items:center;border:1px solid var(--border,#494a50);`
            + `border-radius:6px;overflow:hidden;}`
            + `.xh-timer-remind .xh-tr-step button{border:0;background:var(--secondary,#262729);color:var(--foreground,#e6e6e6);`
            + `cursor:pointer;width:28px;height:28px;font-size:15px;}`
            + `.xh-timer-remind .xh-tr-step button:hover{background:var(--xh-primary,#2E7D5B);color:var(--xh-on-primary,#fff);}`
            + `.xh-timer-remind .xh-tr-step .num{min-width:38px;text-align:center;font-variant-numeric:tabular-nums;font-weight:500;}`
            + `.xh-timer-remind .xh-tr-sw{display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:10px;}`
            + `.xh-timer-remind .xh-tr-dot{width:34px;height:19px;border-radius:10px;background:var(--secondary,#3a3b40);`
            + `position:relative;transition:background .18s;flex:none;}`
            + `.xh-timer-remind .xh-tr-dot::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;`
            + `border-radius:50%;background:#fff;transition:transform .18s;}`
            + `.xh-timer-remind .xh-tr-dot.on{background:var(--xh-primary,#2E7D5B);}`
            + `.xh-timer-remind .xh-tr-dot.on::after{transform:translateX(15px);}`
            + `.xh-timer-remind .xh-tr-quick{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:9px;}`
            + `.xh-timer-remind .xh-tr-quick button{border:1px solid var(--border,#494a50);background:transparent;`
            + `color:var(--foreground,#e6e6e6);border-radius:11px;padding:2px 9px;font-size:12px;cursor:pointer;}`
            + `.xh-timer-remind .xh-tr-quick button.sel{background:var(--xh-primary,#2E7D5B);`
            + `border-color:var(--xh-primary,#2E7D5B);color:var(--xh-on-primary,#fff);}`
            + `.xh-timer-remind .xh-tr-hint{font-size:11px;color:var(--color-text-tertiary,var(--foreground,#aaa));line-height:1.5;`
            + `border-top:1px solid var(--border,#494a50);padding-top:8px;}`
            + `.xh-timer-remind .xh-tr-test{margin-left:auto;border:1px solid var(--border,#494a50);background:transparent;`
            + `color:var(--foreground,#e6e6e6);border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;}`;
        document.head.appendChild(st);
    } catch (e) {}
}
function setBlink(node, on) {
    if (!node || !node._display) return;
    if (on) ensureBlinkStyle();
    try { node._display.classList.toggle(BLINK_CLASS, !!on); } catch (e) {}
}

// 计时中指示点（绿点脉冲 = “正在计时/活跃”）。仅在正在计时时显示，停表即隐藏。
function setRunning(node, on) {
    if (!node || !node._runDot) return;
    if (on) {
        try { ensureBlinkStyle(); node._runDot.classList.add("xh-timer-rundot"); } catch (e) {}
        node._runDot.style.display = "inline-block";
    } else {
        try { node._runDot.classList.remove("xh-timer-rundot"); } catch (e) {}
        node._runDot.style.display = "none";
    }
}

// ---- 定时提醒浮层面板（单例，全局只建一次，挂在 body 上）--------------------
//  点计时器工具条的铃铛 ⇒ 弹出，定位在铃铛下方；点铃铛/点空白/点别的计时器 ⇒ 收起或切换。
const RemindPanel = {
    el: null,
    owner: null,        // 当前挂在哪个计时器节点上
    outsideBound: false,
    build() {
        if (this.el) return this.el;
        ensureBlinkStyle();
        const el = document.createElement("div");
        el.className = "xh-timer-remind";
        el.innerHTML =
            '<div class="xh-tr-hd"><span class="title">定时提醒</span>' +
            '<button type="button" data-a="close" title="关闭">×</button></div>' +
            '<div class="xh-tr-sw"><span class="xh-tr-dot" data-a="toggle"></span><span class="sw-txt">已关闭</span></div>' +
            '<div class="xh-tr-row"><span class="lab">每隔</span>' +
            '<span class="xh-tr-step"><button type="button" data-a="dec">−</button>' +
            '<span class="num">1</span><button type="button" data-a="inc">+</button></span>' +
            '<span class="lab">分钟</span>' +
            '<button type="button" class="xh-tr-test" data-a="test">试听</button></div>' +
            '<div class="xh-tr-quick"><span class="lab" style="color:var(--color-text-tertiary,var(--foreground,#aaa));font-size:11px;">快捷</span>' +
            '<button type="button" data-a="min" data-v="1">1</button>' +
            '<button type="button" data-a="min" data-v="2">2</button>' +
            '<button type="button" data-a="min" data-v="5">5</button>' +
            '<button type="button" data-a="min" data-v="10">10</button>' +
            '<button type="button" data-a="min" data-v="30">30</button></div>' +
            '<div class="xh-tr-hint">每满设定分钟播报一次 · 跑完播报总用时（仅本地生效）</div>';
        el.addEventListener("pointerdown", (e) => e.stopPropagation());
        el.addEventListener("click", (e) => this.onClick(e));
        try { document.body.appendChild(el); } catch (e) {}
        this.el = el;
        if (!this.outsideBound) {
            document.addEventListener("pointerdown", (e) => {
                if (!this.el || this.el.style.display === "none") return;
                if (this.el.contains(e.target)) return;
                if (this.owner && this.owner._remindBtn && this.owner._remindBtn.contains(e.target)) return;
                this.hide();
            }, true);
            this.outsideBound = true;
        }
        return el;
    },
    show(node, anchor) {
        const el = this.build();
        this.owner = node;
        this.render();
        el.style.display = "block";
        // 定位在铃铛下方，靠屏幕边缘自动内收
        const r = anchor.getBoundingClientRect();
        const w = 238, h = el.offsetHeight || 190;
        let left = r.right - w;
        let top = r.bottom + 6;
        left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
        if (top + h > window.innerHeight - 6) top = Math.max(6, r.top - h - 6);
        el.style.left = Math.round(left) + "px";
        el.style.top = Math.round(top) + "px";
        try { SPEAK.unlock(); } catch (e) {}
    },
    hide() {
        if (this.el) this.el.style.display = "none";
        this.owner = null;
    },
    toggle(node, anchor) {
        if (this.el && this.el.style.display !== "none" && this.owner === node) { this.hide(); return; }
        this.show(node, anchor);
    },
    render() {
        if (!this.el || !this.owner) return;
        const st = timerState(this.owner);
        if (!st) return;
        const lang = this.owner._lang || window.XH_LANG || "zh";
        const L = LABELS[lang] || LABELS.zh;
        const zh = lang === "zh";
        this.el.querySelector(".xh-tr-hd .title").textContent = L.remindTitle;
        const dot = this.el.querySelector(".xh-tr-dot");
        dot.classList.toggle("on", st.remindOn);
        this.el.querySelector(".sw-txt").textContent = st.remindOn
            ? L.remindOn + " " + st.remindMin + " " + L.minute
            : L.remindOff;
        this.el.querySelector(".xh-tr-step .num").textContent = String(st.remindMin);
        this.el.querySelector(".xh-tr-test").textContent = L.preview;
        this.el.querySelectorAll('[data-a="min"]').forEach((b) => {
            b.classList.toggle("sel", Number(b.getAttribute("data-v")) === st.remindMin);
        });
        this.el.querySelector(".xh-tr-hint").textContent = L.hint + " · " + L.hintStop + (zh ? "（仅本地生效）" : " (local only)");
    },
    onClick(e) {
        const btn = e.target.closest("button, .xh-tr-dot");
        if (!btn || !this.owner) return;
        const a = btn.getAttribute("data-a");
        const st = timerState(this.owner);
        if (!st) return;
        switch (a) {
            case "close": this.hide(); return;
            case "toggle":
                st.remindOn = !st.remindOn;
                if (st.remindOn) { st.remindedN = 0; SPEAK.unlock(); }
                this.syncBtn(this.owner, st);
                break;
            case "inc": st.remindMin = Math.min(120, st.remindMin + 1); break;
            case "dec": st.remindMin = Math.max(1, st.remindMin - 1); break;
            case "min": st.remindMin = Math.max(1, Math.min(120, Number(btn.getAttribute("data-v")) || 1)); break;
            case "test":
                SPEAK.unlock();
                SPEAK.finish(32010); // “用时三十二秒零一”试听
                return;
            default: return;
        }
        // 间隔变了 ⇒ 本轮提醒计数从头算，避免刚改完立刻用旧刻度播
        st.remindedN = 0;
        this.syncBtn(this.owner, st);
        this.render();
    },
    // 把铃铛按钮的开态 / title 同步给指定节点
    syncBtn(node, st) {
        try {
            if (node._remindBtn) node._remindBtn.classList.toggle("on", !!st.remindOn);
            const lang = node._lang || window.XH_LANG || "zh";
            const L = LABELS[lang] || LABELS.zh;
            if (node._remindBtn) node._remindBtn.title = st.remindOn
                ? (L.remindOn + " " + st.remindMin + " " + L.minute)
                : L.remindOff;
        } catch (e) {}
    },
};
// 语言切换时刷新面板文案（供顶部监听器调用）
function refreshRemindPanel() {
    try { RemindPanel.render(); } catch (e) {}
}

app.registerExtension({
    name: "XH.Timer",
    async setup() {
        // 全局监听执行事件（注意：执行生命周期事件是 api 派发的，不是 document）
        if (_timerListenersBound) return;
        _timerListenersBound = true;

        // 浏览器语音解锁：任何一次真实点击都算用户手势，首个手势同步唤醒语音引擎。
        //  跑完播用时是异步触发（几十秒后），若从未有过手势会被 Chrome 静默拦 ⇒ 这里兜住。
        try {
            const _unlockOnce = () => {
                SPEAK.unlock();
                document.removeEventListener("pointerdown", _unlockOnce, true);
            };
            document.addEventListener("pointerdown", _unlockOnce, true);
        } catch (e) {}

        // _idleTimer：status 兜底停表的「待确认」定时器；新任务一开始就取消它，避免误停新表
        let _idleTimer = null;
        api.addEventListener("execution_start", () => {
            if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
            forEachTimer((n) => n._startTimer?.());
        });

        // 停表：只有这三个是真正的“执行终止”事件。
        // 后端 execution.py 发的是 execution_interrupted（前端 api.js 的 WS 白名单里
        // 也只认这个名字）；老代码监听的 `execution_cancelled` **根本不存在**，
        // 是个死监听 —— 所以手动中断时表一直转。已改为正确事件名。
        const stopAllTimers = () => forEachTimer((n) => n._stopTimer?.());
        api.addEventListener("execution_error", stopAllTimers);
        api.addEventListener("execution_interrupted", stopAllTimers); // ← 手动中断 / 点取消

        //  2026-11-02 改：execution_success 不再「立刻停表」。
        //   后端每条 prompt 跑完都会发一次 success（写在 execute_async 里），
        //   批量队列里第 1 条一跑完就停表 → 第 2 条一开始又从 00:00:00 起 → 表显示的只是最后一条的耗时。
        //   现在改成：查 /queue，**pending 还有就继续跑**（= 整轮队列还没跑完），pending 归零才停。
        const stopWhenQueueDrained = async () => {
            try {
                const q = await (await fetch("/queue")).json();
                const pending = (q.queue_pending || []).length;
                if (pending === 0) stopAllTimers();
            } catch (err) {
                /* 查不到就不停，宁可多转（下面的 status 兜底还会再来一次） */
            }
        };
        api.addEventListener("execution_success", () => { stopWhenQueueDrained(); });

        // 兜底：队列彻底空也停表（覆盖「中断瞬间刚好跑完 / WS 消息丢失」）。
        //  2026-10-19 修 bug：**不能只凭 queue_remaining === 0 就停表** ——
        //   这个字段在不同 ComfyUI 版本里可能只统计「排队中」、不含「正在执行」，
        //   于是**跑着跑着收到一个 status 事件就把表停了**（用户实测：到某个时长突然停）。
        //   现在的做法：延迟 2 秒，用 /queue 再确认 running 和 pending **都为空**，才真停。
        //   查不到（网络/接口变更）就**不停表** —— 宁可多转，也别误停。
        api.addEventListener("status", (e) => {
            const remaining = e?.detail?.exec_info?.queue_remaining;
            if (remaining !== 0) {
                if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
                return;
            }
            if (_idleTimer) clearTimeout(_idleTimer);
            _idleTimer = setTimeout(async () => {
                _idleTimer = null;
                try {
                    const q = await (await fetch("/queue")).json();
                    const running = (q.queue_running || []).length;
                    const pending = (q.queue_pending || []).length;
                    if (running === 0 && pending === 0) stopAllTimers();
                } catch (err) {
                    /* 查不到就不停，宁可多转 */
                }
            }, 2000);
        });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        nodeType.isVirtualNode = true;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            // 从 properties 恢复
            this._lang = window.XH_LANG || this.properties?.lang || "zh";
            this.title = LABELS[this._lang].title;
            this.serialize_widgets = false;
            this.widgets = [];
            this.size = [270, 80];    // 2026-11-06 全家族收口：默认宽对齐官方 270
            this._running = false;
            this._timerId = null;
            this._startTime = null;
            this._lastFontSize = 0;

            // 显示区
            const display = document.createElement("div");
            display.style.cssText = `
                width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                font-family:monospace;font-weight:bold;outline:none;cursor:default;
                white-space:normal;word-break:break-word;
                user-select:none;color:#ffffff;overflow:hidden;
                text-align:center;
            `;
            display.textContent = "00:00:00";
            this._display = display;

            // 标题栏 = 标准工具条（重设 + 中/EN + ）—— 家族唯一实现见 web/xh_ui_kit.js
            const resetBtn = document.createElement("button");
            resetBtn.textContent = LABELS[this._lang].reset;
            resetBtn.style.cssText = `
                background:#252525;color:#e8e8e8;border:1px solid rgba(255,255,255,.10);border-radius:4px;
                padding:4px 8px;font-size:12px;cursor:pointer;transition:all 0.2s;
                display:flex;align-items:center;justify-content:center;white-space:nowrap;
            `;
            resetBtn.onclick = (e) => {
                e.stopPropagation();
                //  2026-11-02 修：原来只置 _startTime=null 却没停 interval，
                //   下一 tick 变成 Date.now() - null ⇒ 表显示出一串天文数字。
                const st = timerState(this);
                if (st) {
                    st.running = false; st.startMs = 0; st.elapsedMs = 0;
                    st.remindedN = 0; st.finishAnnounced = false;   // 手动重设 ⇒ 播报计数从头
                }
                this._running = false;
                this._startTime = null;
                if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
                setBlink(this, false);          // 手动重设 = 人已经看过了，停闪
                setRunning(this, false);        // 手动重设 = 停止计时指示点
                this._display.textContent = "00:00:00";
                this._updateFontSize();
            };
            // 方案 B：hover 走亮度滤镜，恢复走 paintBarBtn 重刷（不写死色值）
            resetBtn.onmouseover = () => resetBtn.style.filter = "brightness(1.28)";
            resetBtn.onmouseout = () => { resetBtn.style.filter = "none"; paintBarBtn(resetBtn, "neutral"); };
            this._resetBtn = resetBtn;

            // 定时提醒按钮（家族 bell 图标）：点开浮层面板设开关 + 间隔
            const remindBtn = document.createElement("button");
            const _rst = timerState(this);
            remindBtn.innerHTML = xhIconHTML("bell", { size: 14, color: "current" }) +
                "<span>" + LABELS[this._lang].remind + "</span>";
            remindBtn.style.cssText = `
                background:#252525;color:#e8e8e8;border:1px solid rgba(255,255,255,.10);border-radius:4px;
                padding:4px 8px;font-size:12px;cursor:pointer;transition:all 0.2s;
                display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;
            `;
            remindBtn.title = _rst.remindOn ? "已开启" : "已关闭";
            remindBtn.onclick = (e) => {
                e.stopPropagation();
                try { RemindPanel.toggle(this, remindBtn); } catch (err) {}
            };
            remindBtn.onmouseover = () => remindBtn.style.filter = "brightness(1.28)";
            remindBtn.onmouseout = () => { remindBtn.style.filter = "none"; };
            this._remindBtn = remindBtn;
            RemindPanel.syncBtn(this, _rst);

            const spacer = document.createElement("div");
            spacer.style.cssText = `flex:1;`;

            // kit 的中/EN onclick 负责 toggleLang（写 localStorage + 广播），按钮换字由 kit 全局负责；
            // 本文件顶部的 xh:lang-changed 监听器再负责把 _lang / title / 「重设」文案刷掉 —— 行为等价。
            //  家族统一顺序（2026-10-26）：中/EN →  → 业务键（「重设」+ 弹性空白）。
            const { bar: titleBar } = makeXHToolbar(this, { mount: false, appendNodes: [remindBtn, resetBtn, spacer] });
            titleBar.style.cssText += "background:rgba(0,0,0,0.3);border-radius:6px 6px 0 0;";

            //  2026-11-12：计时中闪烁指示点（绿点脉冲，提示“正在计时”）。
            //    放在标题栏最左端，正在计时时亮起并脉冲，停表即隐藏。
            const runDot = document.createElement("span");
            runDot.style.cssText =
                "display:none;width:9px;height:9px;border-radius:50%;background:#7EE787;"
                + "flex:0 0 auto;margin:0 4px 0 0;align-self:center;box-sizing:border-box;";
            this._runDot = runDot;
            try { titleBar.insertBefore(runDot, titleBar.firstChild); } catch (e) {}

            // 组装
            const container = document.createElement("div");
            container.style.cssText = `
                display:flex;flex-direction:column;width:100%;height:100%;
                border-radius:6px;overflow:hidden;min-height:50px;
            `;
            container.appendChild(titleBar);
            container.appendChild(display);
            this._container = container;

            try {
                this.addDOMWidget("timer", "custom", container, {
                    serialize: false,
                    hideOnZoom: false,
                    minWidth: 250,
                    minHeight: 50,
                    // 自愈：画布每次绘制都调一次；DOM 被重新挂载 / 文本被清空时自动刷回真实值
                    onDraw: () => { try { this._syncDisplay(); } catch (err) {} },
                });
            } catch (e) {}

            // 监听节点尺寸变化
            this._resizeObserver = new ResizeObserver(() => {
                this._updateFontSize();
            });
            this._resizeObserver.observe(container);

            return r;
        };

        // 更新字号（跟随节点大小）
        nodeType.prototype._updateFontSize = function () {
            if (!this._display || !this._container) return;
            const w = this._container.offsetWidth;
            const h = this._container.offsetHeight;
            // 字号自适应：不超过宽度的22%，不超过高度的50%
            const fontSize = Math.max(12, Math.min(w * 0.22, h * 0.5));
            if (fontSize !== this._lastFontSize) {
                this._display.style.fontSize = fontSize + "px";
                this._lastFontSize = fontSize;
            }
        };

        // 保存设置
        nodeType.prototype._save = function () {
            if (!this.properties) this.properties = {};
            this.properties.lang = this._lang;
        };

        // 把当前状态刷到显示区（幂等：内容相同就不写，省 DOM 开销）
        nodeType.prototype._render = function (ms) {
            if (!this._display) return;
            const txt = fmtElapsed(ms);
            if (this._display.textContent !== txt) this._display.textContent = txt;
            this._display.style.color = "#ffffff";
            this._updateFontSize();
        };

        // 按状态自愈显示（DOM 被重建 / 文本被清时用）
        nodeType.prototype._syncDisplay = function () {
            const st = timerState(this);
            if (!st || !this._display) return;
            const ms = (st.running && st.startMs) ? (Date.now() - st.startMs) : (st.elapsedMs || 0);
            const txt = fmtElapsed(ms);
            if (this._display.textContent !== txt) this._display.textContent = txt;
        };

        // 走表（只负责起 interval，续走/新起都由调用方决定）
        nodeType.prototype._startInterval = function () {
            if (this._timerId) {
                clearInterval(this._timerId);
                this._timerId = null;
            }
            this._timerId = setInterval(() => {
                if (!this._running) return;
                const st = timerState(this);
                const base = (st && st.startMs) ? st.startMs : this._startTime;
                const ms = Date.now() - base;
                this._render(ms);
                // 定时提醒：每满 N 分钟播一次“已运行X分钟”。只在本地前端跑图时触发。
                // st.remindedN = 本轮已播到的整分钟刻度，跨刻度才播，避免 10ms tick 重复念。
                try {
                    if (st && st.remindOn && st.remindMin > 0 && ms > 0) {
                        const reached = Math.floor(ms / (st.remindMin * 60000));
                        if (reached > st.remindedN) {
                            st.remindedN = reached;
                            SPEAK.running(reached * st.remindMin);
                        }
                    }
                } catch (e) {}
            }, 10);
        };

        // 启动计时
        //  2026-11-02 改：已经在跑就**不重置**（批量队列里第 2/3 条 prompt 又发 execution_start，
        //   老逻辑每次都把 _startTime 拉回现在 ⇒ 表被清零重开）。
        nodeType.prototype._startTimer = function () {
            const st = timerState(this);
            if (!st) return;
            setRunning(this, true);             // 开始计时 ⇒ 绿点脉冲亮起
            if (st.running && st.startMs) {
                // 同一轮队列的又一条 prompt ⇒ 接着走，不清零
                this._running = true;
                this._startTime = st.startMs;
                this._startInterval();
                this._render(Date.now() - st.startMs);
                return;
            }
            // 新的一轮 ⇒ 从 0 重新起表（万一上一次因异常没停下，也能自愈）
            st.running = true;
            st.startMs = Date.now();
            st.elapsedMs = 0;
            st.remindedN = 0;                   // 新一轮 ⇒ 定时提醒计数从头
            st.finishAnnounced = false;         // 新一轮 ⇒ 允许再次播完成用时
            this._running = true;
            this._startTime = st.startMs;
            setBlink(this, false);              // 新的一跑就停闪（上一次跑完的提醒到此为止）
            SPEAK.unlock();                     // 点运行即用户交互 ⇒ 解锁语音
            try { RemindPanel.syncBtn(this, st); } catch (e) {}
            this._startInterval();
            this._render(0);
        };

        // 停止计时（跑完 / 报错 / 手动中断 都走这里 → 数字定住并开始闪烁提醒）
        nodeType.prototype._stopTimer = function () {
            const st = timerState(this);
            this._running = false;
            setRunning(this, false);            // 停表 ⇒ 绿点隐藏
            if (this._timerId) {
                clearInterval(this._timerId);
                this._timerId = null;
            }
            const hadRun = !!(st && st.running);
            if (st) {
                if (hadRun && st.startMs) {
                    st.elapsedMs = Date.now() - st.startMs;   // 冻结当前读数
                    st.startMs = 0;
                }
                st.running = false;
            }
            // 只在「真的计过一段时间」时才闪：压根没起过表就别闪，
            // 免得刚打开工作流、收到一个 status 兜底事件就开始满屏闪。
            if (hadRun) setBlink(this, true);
            // 跑完播报总用时（2026-11-19 修）：只要计过 ≥1 秒、本轮没播过就念。
            //  🔴 不再依赖「定时提醒」开关（remindOn 只管每 N 分钟提醒，跟跑完播用时是两码事）。
            //    旧版把播报绑在 remindOn 上 ⇒ 用户没开铃铛时跑完一声不吭（实测 33 秒无播报）。
            //  一次运行只播一次（finishAnnounced 去重，队列排空多次 stop 也不重复）。
            try {
                if (st && st.elapsedMs >= 1000 && !st.finishAnnounced) {
                    st.finishAnnounced = true;
                    SPEAK.finish(st.elapsedMs);
                }
            } catch (e) {}
            this._syncDisplay();
        };

        //  2026-11-02 新增：读档 / 实例重建后**续表**（原来这里是空的 ⇒ 一切归零）
        //   官方前端 LGraphNode.configure 末尾会调 onConfigure，此时 properties 已恢复、
        //   节点 id 与所属图 id 也已就位 ⇒ 正好能把上一次的计时接上。
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origOnConfigure?.apply(this, arguments);
            try {
                const st = timerState(this);
                if (!st) return r;
                if (st.running && st.startMs) {
                    // 还在跑（切工作流 / 进子图再出来）⇒ 从原来的起点接着走，不是从 0
                    this._running = true;
                    this._startTime = st.startMs;
                    this._startInterval();
                    this._render(Date.now() - st.startMs);
                    setBlink(this, false);
                    setRunning(this, true);      // 续表 ⇒ 绿点继续脉冲
                } else if (st.elapsedMs > 0) {
                    // 已经停了 ⇒ 把最后的读数显示回来
                    this._running = false;
                    this._startTime = null;
                    this._render(st.elapsedMs);
                    setRunning(this, false);     // 已停 ⇒ 绿点隐藏
                } else {
                    setRunning(this, false);     // 全新未跑 ⇒ 绿点隐藏
                }
            } catch (e) {}
            return r;
        };

        // 节点被删除时清理，避免 interval / ResizeObserver 残留（后台空转）
        //  注意：这里**不能**清掉状态（st），节点实例被销毁重建（切工作流 / 进子图）时
        //   还要靠它续表。只停 interval、断开监听、停闪。
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this._running = false;
            setRunning(this, false);                  // 节点都没了，别让绿点留着
            if (this._timerId) {
                clearInterval(this._timerId);
                this._timerId = null;
            }
            setBlink(this, false);                  // 节点都没了，别让动画留着
            try { if (RemindPanel.owner === this) RemindPanel.hide(); } catch (e) {}
            try { this._resizeObserver?.disconnect(); } catch (e) {}
            try { releaseButtons(this); } catch (e) {}
            return onRemoved?.apply(this, arguments);
        };
    },
});
