// XiaoHei 家族共享语音队列（2026-11-19）
//  背景：计时器(xh_timer)等模块都监听 execution_success，
//    早期各自在 speak 前 window.speechSynthesis.cancel() ⇒ 谁后念谁掐掉对方。
//    （当年抢通道的另一方是桌宠，桌宠已于 2026-11-19 从家族分离，此处保留说明。）
//  约定：家族内所有 speechSynthesis 播报一律走这里，FIFO 依次念，队列内部绝不 cancel。
//    只有显式 clear()（关音效/重置）才 cancel，从根上杜绝模块间抢通道。
//  纯前端，无副作用；不 import 任何模块，避免循环依赖。

let _q = [];        // 待播 [{ text, rate, pitch }]
let _busy = false;  // 是否正在念
let _token = 0;     // 每次播报的令牌：clear / 下一条会让旧 token 失效
const GAP = 160;    // 两条之间留白，避开 Chrome cancel→speak 的竞态吞字

function _pickVoice() {
    try {
        const vs = window.speechSynthesis.getVoices() || [];
        return vs.find((v) => /^zh/i.test(v.lang)) || vs.find((v) => /zh|cmn/i.test(v.lang)) || null;
    } catch (e) { return null; }
}

function _advance(token) {
    if (token !== _token) return;           // 已被 clear 或下一条顶掉
    window.setTimeout(() => {
        if (token !== _token) return;
        _busy = false;
        _pump();
    }, GAP);
}

function _pump() {
    if (_busy) return;
    if (!("speechSynthesis" in window)) { _q.length = 0; return; }
    const item = _q.shift();
    if (!item) return;
    _busy = true;
    const token = ++_token;
    try {
        const u = new SpeechSynthesisUtterance(item.text);
        u.lang = "zh-CN";
        u.rate = item.rate ?? 1;
        u.pitch = item.pitch ?? 1;
        u.volume = 1;
        const v = _pickVoice();
        if (v) u.voice = v;
        u.onend = () => _advance(token);
        u.onerror = () => _advance(token);
        window.speechSynthesis.speak(u);
        // 兜底：个别浏览器 onend 不触发，按字数估个上限强制推进，避免队列卡死
        const est = Math.min(15000, 1500 + item.text.length * 400);
        window.setTimeout(() => { if (token === _token && _busy) _advance(token); }, est);
    } catch (e) {
        _busy = false;
        window.setTimeout(_pump, GAP);
    }
}

// 入队播报。opts: { rate, pitch }
export function xhSpeak(text, opts) {
    if (!text || !("speechSynthesis" in window)) return;
    const o = opts || {};
    _q.push({ text: String(text), rate: o.rate ?? 1, pitch: o.pitch ?? 1 });
    if (_q.length > 12) _q.shift();   // 防异常堆积
    _pump();
}

// 清空队列并掐掉当前播报（关音效 / 手动重置时调用）
export function xhSpeakClear() {
    _q.length = 0;
    _busy = false;
    _token++;
    try { window.speechSynthesis.cancel(); } catch (e) {}
}

// 首次用户手势时唤醒语音引擎（静音念一个空格）
export function xhWarmup() {
    try {
        window.speechSynthesis.getVoices();
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
    } catch (e) {}
}
