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
import { onLangEvent, ensureLangBridge, makeXHToolbar, releaseButtons , paintBarBtn} from "./xh_ui_kit.js";

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
        });
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (err) {}
});

// ---- 节点自身配色（与 XH_LoraStack / XH_Slider / XH_Toolbox 分组控制 同一套：去官方重复色，12 色高辨识度 + 自定义取色器）----

const NODE_TYPE = "XHTimer";
let _timerListenersBound = false;

// 中英文文字
const LABELS = {
    zh: { title: "计时器", reset: " 重置" },
    en: { title: "Timer", reset: " Reset" },
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
            + `.xh-timer-rundot { animation: none; opacity:1; } }`;
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

app.registerExtension({
    name: "XH.Timer",
    async setup() {
        // 全局监听执行事件（注意：执行生命周期事件是 api 派发的，不是 document）
        if (_timerListenersBound) return;
        _timerListenersBound = true;

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
                if (st) { st.running = false; st.startMs = 0; st.elapsedMs = 0; }
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

            const spacer = document.createElement("div");
            spacer.style.cssText = `flex:1;`;

            // kit 的中/EN onclick 负责 toggleLang（写 localStorage + 广播），按钮换字由 kit 全局负责；
            // 本文件顶部的 xh:lang-changed 监听器再负责把 _lang / title / 「重设」文案刷掉 —— 行为等价。
            //  家族统一顺序（2026-10-26）：中/EN →  → 业务键（「重设」+ 弹性空白）。
            const { bar: titleBar } = makeXHToolbar(this, { mount: false, appendNodes: [resetBtn, spacer] });
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
                this._render(Date.now() - base);
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
            this._running = true;
            this._startTime = st.startMs;
            setBlink(this, false);              // 新的一跑就停闪（上一次跑完的提醒到此为止）
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
            try { this._resizeObserver?.disconnect(); } catch (e) {}
            try { releaseButtons(this); } catch (e) {}
            return onRemoved?.apply(this, arguments);
        };
    },
});
