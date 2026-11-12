// ╔═══════════════════════════════════════════════════════════════╗
// ║  画布文字断行（中文友好）                                     ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// 【为什么需要它】WepeNerd 系列的状态行 / 读数条都是自绘 widget，
//   原实现按空格切词换行：
//       String(text).split(" ")
//   英文没问题，中文完全失效 —— 中文没有空格，整句会被当成一个「词」，
//   直接画到节点宽度外面去（节点下方那行读数溢出/被裁）。
//
// 【断行规则】
//   · 中文/日文/韩文（含全角标点）：逐字可断
//   · 英文/数字：整词不拆（"530x942"、"frames" 不会被劈成两半）
//   · 空格：可断，且不会留在行首
//   · 换行符 \n：强制断行
//
// 【用法】const rows = wrapText(ctx, text, maxWidth);  →  string[]
//   ctx 需已设置好 font（measureText 依赖当前字体）。

// CJK 统一表意文字（含扩展A）、兼容表意文字、假名、谚文、全角形式、CJK 符号与标点
const CJK_RE = /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;

const isCJK = (ch) => CJK_RE.test(ch);

/**
 * 按像素宽度把一段文字切成若干行。
 * @param {CanvasRenderingContext2D} ctx 已设好 font 的 2D 上下文
 * @param {string} text 待排版的文字
 * @param {number} maxWidth 每行可用像素宽度
 * @returns {string[]} 每行文字（不含行尾空格）
 */
export function wrapText(ctx, text, maxWidth) {
    const src = String(text ?? "");
    if (!src) return [""];
    const limit = Math.max(24, maxWidth || 0);

    // ① 先切成不可再分的最小单元
    const units = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch === "\n") { units.push("\n"); i++; continue; }
        if (ch === " ") { units.push(" "); i++; continue; }
        if (isCJK(ch)) { units.push(ch); i++; continue; }
        let word = "";
        while (i < src.length && src[i] !== " " && src[i] !== "\n" && !isCJK(src[i])) { word += src[i]; i++; }
        units.push(word);
    }

    // ② 贪心装箱
    const lines = [];
    let line = "";
    const flush = () => { lines.push(line.replace(/\s+$/, "")); line = ""; };
    for (const unit of units) {
        if (unit === "\n") { flush(); continue; }
        if (unit === " ") {
            if (!line) continue;                                  // 行首空格丢弃
            if (ctx.measureText(line + " ").width > limit) { flush(); continue; }  // 空格处断行
            line += " ";
            continue;
        }
        const candidate = line + unit;
        if (line && ctx.measureText(candidate).width > limit) { flush(); line = unit; }
        else line = candidate;
    }
    flush();
    return lines.length ? lines : [""];
}
