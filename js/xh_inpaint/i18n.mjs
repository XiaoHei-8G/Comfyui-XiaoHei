// ============================================================
// 小黑 · 局部重绘裁剪 / 贴回 · 编辑器中/EN 双语
//
// 【为什么】上一轮把侧栏/弹窗/帮助全写成了中文硬编码 —— 切 EN 还是中文，
//   违反家族「跟随切换」规矩（2026-11-19 用户骂的就是这个）。
//
// 【怎么用】it("遮罩") —— 中文原文当 key；zh 原样返回，en 查表。
//   替换成本最低，且表里漏一条也只是回落中文，不会留空。
//
// 【帮助正文】zh 是原版全文；en 是逐节对应翻译（不是概括）。
// ============================================================
import { currentLang } from "../xh_ui_kit.js";

const EN = {
    // ── 编辑器外壳 ──
    "局部重绘裁剪": "Inpaint Crop",
    "局部重绘贴回": "Inpaint Stitch",
    "局部重绘裁剪 — 使用说明": "Inpaint Crop — how to use",

    // ── 状态 / 弹窗 ──
    "没有加载图像。接一个 IMAGE 输入跑一次工作流，或点『加载图片』，也可以直接把图片粘贴/拖进来。":
        "No image loaded. Wire an IMAGE input and run the workflow once, click “Load Image”, or just paste / drag an image in.",
    "不保存就关闭？": "Close without saving?",
    "你在编辑器里画的遮罩还没保存，关闭后会丢失。\n\n保存会把它存在这个节点上，然后关闭编辑器。":
        "The mask you painted hasn’t been saved — closing now loses it.\n\nSaving stores it on this node and then closes the editor.",
    "丢弃遮罩": "Discard mask",
    "继续编辑": "Keep editing",

    // ── 左栏：遮罩工具 ──
    "遮罩": "MASK",
    "画笔 (B)": "Brush (B)",
    "橡皮 (E)": "Erase (E)",
    "反选": "Invert",
    "清空": "Clear",
    "画笔": "BRUSH",
    "笔刷大小": "Size",
    "[ 更小  ·  ] 更大<br>滚轮 = 缩放  ·  按住空格拖 = 平移":
        "[ smaller  ·  ] bigger<br>scroll = zoom  ·  space-drag = pan",

    // ── 接缝 ──
    "接缝 — 贴回怎么融": "SEAM — HOW IT BLENDS",
    "柔和度": "Softness",
    "遮罩外扩": "Mask grow",
    "贴回方式": "Blend mode",
    "只换遮罩内": "Mask",
    "整块替换": "Whole crop",

    // ── 遮罩显示 ──
    "遮罩显示": "MASK OVERLAY",
    "显示/隐藏遮罩 (H)": "Toggle mask (H)",
    "不透明度": "Opacity",
    "颜色": "Color",

    // ── 上下文余量 ──
    "上下文余量": "CONTEXT MARGIN",
    "像素": "Pixels",

    // ── 裁剪尺寸 ──
    "裁剪尺寸": "CROP SIZE",
    "保持形状": "Keep shape",
    "强制正方": "Force square",
    "自由": "Free",
    "目标尺寸": "Target",

    // ── 节点正面 ──
    "打开遮罩编辑器": "Open mask editor",
    "接一个 IMAGE 跑一次，\n或点『打开遮罩编辑器』加载并涂遮罩":
        "Wire an IMAGE and run once,\nor click “Open mask editor” to load and paint",

    // ── 底部 ──
    "全部恢复默认": "Reset all to default",
    "加载图片": "Load Image",
    "输出裁剪": "OUTPUT CROP",
    "先涂一块遮罩开始": "Paint a mask to start",
};

/** 当前语言下的编辑器文案。 */
export function it(zh) {
    if (!zh) return zh;
    if ((currentLang() || "zh") === "zh") return zh;
    return EN[zh] || zh;
}

const HELP_ZH = `
        <b style="color:var(--xh-primary,#E8A33C);">这一步在干什么</b><br>
        把你要模型重画的那块涂出来。节点会自动找到笔迹外面的方框，加一圈余量，
        裁出一块干净的图去重绘。橙色框就是实际送给模型的范围。<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">涂遮罩</b><br>
        <b>画笔 / 橡皮：</b>点工具，或按 <kbd>B</kbd> / <kbd>E</kbd>（按住 <kbd>X</kbd> 临时互换）<br>
        <b>笔刷大小：</b><kbd>[</kbd> / <kbd>]</kbd>，或侧栏的笔刷大小滑块<br>
        <b>缩放 / 平移：</b>滚轮朝光标缩放；按住 <kbd>空格</kbd> 拖动（或中键拖动）平移；缩到最小即适合窗口<br>
        <b>显示 / 隐藏遮罩：</b><kbd>H</kbd><br>
        <b>反选 / 清空：</b>侧栏的两个按钮（反选 = 涂过的和没涂的互换）<br>
        <b>换一张图：</b>点『加载图片』，或直接把图片 <b>粘贴</b> / <b>拖</b> 进这里<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">裁剪尺寸</b>（侧栏 + 节点）<br>
        <b>保持形状：</b>按比例放大你的区域，让长边达到目标尺寸，不拉伸（质量最好）<br>
        <b>强制正方：</b>永远是目标尺寸的正方形<br>
        <b>自由：</b>自然尺寸，只按倍数取整<br>
        <b>上下文余量：</b>笔迹周围多带多少环境进去<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">接缝 —— 怎么贴回去</b><br>
        <b>柔和度：</b>边缘和原图融合的宽度（编辑器里那圈橙色实时预览）<br>
        <b>遮罩外扩：</b>裁剪前先把涂过的区域往外扩一点<br>
        <b>贴回方式 — 只换遮罩内：</b>只有你涂的区域被替换，裁剪范围其他部分保留原图（常规重绘）<br>
        <b>贴回方式 — 整块替换：</b>整个框都换成模型的结果 —— 模型同时改了光照/环境的场景，或做 img2img 时用<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">快捷键</b><br>
        <b>撤销 / 重做：</b><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> &middot;
        <b>保存：</b><kbd>Ctrl+S</kbd> &middot; <b>关闭：</b><kbd>Esc</kbd>`;

const HELP_EN = `
        <b style="color:var(--xh-primary,#E8A33C);">What this step does</b><br>
        Paint over the area the model should repaint. The node finds the box around your
        strokes, adds a margin of context and cuts a clean crop to send to the model.
        The orange frame is exactly what gets sent.<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">Painting</b><br>
        <b>Brush / Erase:</b> pick the tool, or press <kbd>B</kbd> / <kbd>E</kbd> (hold <kbd>X</kbd> to swap temporarily)<br>
        <b>Brush size:</b> <kbd>[</kbd> / <kbd>]</kbd>, or the size slider in the sidebar<br>
        <b>Zoom / pan:</b> wheel zooms toward the cursor; hold <kbd>Space</kbd> and drag (or middle-drag) to pan; zoom all the way out to fit the window<br>
        <b>Show / hide the mask:</b> <kbd>H</kbd><br>
        <b>Invert / Clear:</b> the two buttons in the sidebar (Invert swaps painted and unpainted)<br>
        <b>Change image:</b> click “Load Image”, or <b>paste</b> / <b>drag</b> an image straight in<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">Crop size</b> (sidebar + node)<br>
        <b>Keep shape:</b> scales your region up so its long side reaches the target, no stretching (best quality)<br>
        <b>Force square:</b> always a target × target square<br>
        <b>Free:</b> natural size, only rounded to the multiple<br>
        <b>Context margin:</b> how much surrounding scene to bring in<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">Seam — how it pastes back</b><br>
        <b>Softness:</b> width of the blend between the result and the original (that orange ring previews it live)<br>
        <b>Mask grow:</b> grows the painted area a little before cropping<br>
        <b>Blend mode — Mask:</b> only the painted area is replaced, the rest of the crop keeps the original (normal inpaint)<br>
        <b>Blend mode — Whole crop:</b> the whole crop is replaced by the model result — use it when the model also changes light/environment, or for img2img<br><br>

        <b style="color:var(--xh-primary,#E8A33C);">Shortcuts</b><br>
        <b>Undo / Redo:</b> <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> &middot;
        <b>Save:</b> <kbd>Ctrl+S</kbd> &middot; <b>Close:</b> <kbd>Esc</kbd>`;

export function inpaintHelpContent() {
    return (currentLang() || "zh") === "zh" ? HELP_ZH : HELP_EN;
}

export function inpaintHelpTitle() {
    return it("局部重绘裁剪 — 使用说明");
}
