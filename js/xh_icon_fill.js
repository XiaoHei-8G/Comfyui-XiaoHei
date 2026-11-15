// XiaoHei 家族 · 按钮图案兜底（Icon Fill）
//
// 【修的是什么】2026-11-13 用户点名：「之前让你把 emoji / 不符合家族图案库的图取消掉，
//   有的你取消掉了，但没换上家族 2000 多个图案里的，就没去挑选」。
//   早前清理时只把按钮上的彩色 emoji 删掉，文案里留下一个前导空格
//   （" 刷新" / " Upload"），于是节点上到处是「没图案的按钮」，分组控制的定位按钮
//   甚至被清成一个纯黑方块。
//
// 【怎么修】三层，全部只动显示层，⛔ 不改文案表 / 不改存档值 / 不改参数 label：
//   ① xh_ui_kit.js 的 xhDecorateButton() —— 按语义关键词把空格换成自家图标库图案；
//   ② makeBarBtn / 各节点本地 mkBtn / 播放器 refreshInfo 创建时直接调它；
//   ③ 本文件：对「自己手搓 button、没走上面任何入口」的节点做全家族兜底。
//
// 【安全边界】
//   · 只处理长度 ≤ 24 的 button；「前导空格」直接处理，
//     「Unicode 图案」必须同时满足 inFamilyScope()（祖先 class/id 以 xh 开头 / data-xh-family=1）；
//     中间夹的 "+"（"Ctrl + Z"）不认，别的插件正常按钮不会被碰；
//   · data-xh-icon-done 幂等标记，DOM 重建 / 语言切换重复扫都不会叠加图标；
//   · ⛔ 不碰已含图标的元素、不碰 input / 文本域、不写 node.properties、不标脏画布；
//   · 纯前端，Ctrl+F5 生效，不动 VERSION。

import { xhDecorateButton, isFamilyChineseWord } from "./xh_ui_kit.js";

const _getApp = () => {
    try { return (typeof window !== "undefined" && window.comfyAPI?.app?.app) || null; }
    catch (e) { return null; }
};

const MAX_LABEL = 24;

//  2026-11-13 补：老节点还有一批「按钮里直接写 Unicode 图案」的（＋ ✕ ▲ ▼ ▶ ✓ 等）。
//  只认出现在文案开头 / 结尾 / 纯符号的图案；中间夹的 "Ctrl + Z" 之类一律不碰。
const SYMBOL_EDGE = /^\s*[＋+✚✕✖✗✓✔▲▼▴▾◀▶⏵⏸↶↷⟲↻↺⟳⇄⇆↔⚙☲]|[＋+✚✕✖✗✓✔▲▼▴▾◀▶⏵⏸↶↷⟲↻↺⟳⇄⇆↔⚙☲]\s*$/;

//  符号替换要限定在家族 DOM 内，免得把 ComfyUI 官方 / 别家插件按钮上的 "+" 也改了。
//  家族 DOM 特征：节点根 data-xh-family="1"（Vue 标题栏写入）、或祖先 class / id 以 xh 开头
//  （自绘 DOM widget、设置浮层、工作流浏览器都带 xh- / xhwb- 这类前缀）。
function inFamilyScope(b) {
    let p = b;
    for (let i = 0; p && i < 9; i++, p = p.parentElement) {
        const cls = typeof p.className === "string" ? p.className : "";
        const id = typeof p.id === "string" ? p.id : "";
        // 画板 / 设置面板是 Pixaroma 1:1 复刻代码，DOM 前缀是 pxf- / ppx- / pix-，
        // 不带 xh-，但同样属于家族界面；不纳入就会漏掉「✕ 关闭画板」这类按钮。
        if (/^(?:xh|pxf|ppx|pix)/i.test(id) ||
            /(^|\s)(?:xh|pxf|ppx|pix)/i.test(cls)) return true;
        if (p.dataset && (p.dataset.xhFamily === "1" || p.dataset.xhIconScope === "1")) return true;
    }
    return false;
}

function sweep(root) {
    if (!root || typeof root.querySelectorAll !== "function") return 0;
    let n = 0;
    let btns;
    try { btns = root.querySelectorAll("button"); } catch (e) { return 0; }
    for (const b of btns) {
        if (!b || b.dataset?.xhIconDone === "1") continue;
        // 已经有家族图标（xhIconHTML 生成的 mask span）⇒ 是别的入口装饰过的，跳过
        if (b.querySelector?.(".xh-icon-mask")) { b.dataset.xhIconDone = "1"; continue; }
        const t = b.textContent || "";
        if (t.length > MAX_LABEL) continue;
        const hasLeadingBlank = /^\s+\S/.test(t);
        const hasSymbol = SYMBOL_EDGE.test(t);
        // 🔴 2026-11-14 越界防线：本次扫描的根是**整个 document**，
        //    所以「前导空格」这个信号**不能**当家族专属——ComfyUI 官方自己的按钮就是
        //    `<i class="icon"></i> Save` 这种（前面有图标占位 ⇒ textContent 带前导空格）。
        //    原写法只对「Unicode 图案」要求 inFamilyScope，前导空格那条是放行的，
        //    ⇒ 官方 / 第三方按钮会被 xhDecorateButton() 清空 textContent 重写
        //      （前导空格被抹掉，英文文案若命中词表还会被塞进家族图标）。
        //    现在统一收口：必须「在家族 DOM 内」或「文案是纯中文家族词」才动手。
        //    （官方/别家没有中文按钮文案 ⇒ 中文命中必是家族自己的）
        const inScope = inFamilyScope(b) || isFamilyChineseWord(t);
        if (!inScope) continue;
        if (!hasLeadingBlank && !hasSymbol) continue;
        try { if (xhDecorateButton(b, t)) n++; } catch (e) {}
    }
    return n;
}

const _app = _getApp();
if (_app && typeof _app.registerExtension === "function") {
    let timer = null;
    const schedule = () => {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            try { sweep(document); } catch (e) {}
        }, 120);
    };

    _app.registerExtension({
        name: "XH.IconFill",

        nodeCreated() {
            // DOM widget 是异步挂载的：两拍补一次，覆盖建节点与读档后的挂载时机
            try { queueMicrotask(schedule); } catch (e) {}
            schedule();
        },

        afterConfigureGraph() {
            schedule();
        },
    });

    // Vue 节点会重建 DOM（切中/EN、切画布模式、undo）⇒ 节流监听一次新增节点。
    // 只做 childList 观察、每次合并成一次 sweep；已标记的 button 会被跳过，不会自激。
    try {
        if (typeof MutationObserver !== "undefined" && document.body) {
            const mo = new MutationObserver((records) => {
                let hit = false;
                for (const r of records) {
                    if (r.addedNodes?.length) { hit = true; break; }
                }
                if (hit) schedule();
            });
            mo.observe(document.body, { childList: true, subtree: true });
        }
    } catch (e) {}

    try { schedule(); } catch (e) {}
}

try {
    if (typeof window !== "undefined") {
        window.__XH_ICON_FILL__ = { sweep, VERSION: "1" };
    }
} catch (e) {}
