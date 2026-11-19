// ============================================================
// 小黑 · framework 编辑器外壳 · 中/EN 双语
//
// 【为什么】layout.mjs / components.mjs 里的按钮、面板标题、状态提示原先
//   是中文硬编码 —— 切到 EN 依然显示中文，违反家族「跟随切换」规矩。
//
// 【怎么用】fl("撤销") —— 中文原文当 key，zh 直接返回原文，en 查表。
//   查不到就回落中文原文（宁可中文，绝不留空）。
//   这样替换只需把字面量包一层 fl(...)，不用给几十个串起英文变量名。
//
// 【红线】只换显示文字；不改任何 id / class / 回调 / 布局。
// ============================================================
import { currentLang } from "../xh_ui_kit.js";

const EN = {
    // ── 布局标题栏 ──
    "缩小": "Zoom out",
    "放大": "Zoom in",
    "适应": "Fit",
    "适应视图": "Fit to view",
    "适配视图": "Fit to view",
    "撤销": "Undo",
    "撤销 (Ctrl+Z)": "Undo (Ctrl+Z)",
    "重做": "Redo",
    "重做 (Ctrl+Shift+Z)": "Redo (Ctrl+Shift+Z)",
    "帮助": "Help",
    "保存": "Save",
    "保存中……": "Saving…",
    "已保存！": "Saved!",
    "保存失败": "Save failed",
    "保存失败：": "Save failed: ",
    "保存到磁盘": "Save to disk",
    "保存图片到磁盘": "Save the image to disk",
    "关闭": "Close",
    "关闭 (Esc)": "Close (Esc)",
    "取消": "Cancel",
    "确定": "OK",

    // ── 变换属性面板 ──
    "变换属性": "Transform",
    "适配宽": "Fit width",
    "适配到画布宽度": "Fit to canvas width",
    "适配高": "Fit height",
    "适配到画布高度": "Fit to canvas height",
    "水平翻转": "Flip horizontal",
    "垂直翻转": "Flip vertical",
    "旋转 -90°": "Rotate -90°",
    "旋转 +90°": "Rotate +90°",
    "重置变换": "Reset transform",
    "将所有变换重置为默认": "Reset all transforms to default",
    "旋转": "Rotation",
    "缩放 %": "Scale %",
    "水平 %": "Horizontal %",
    "垂直 %": "Vertical %",
    "不透明度": "Opacity",
    "模糊": "Blur",
    "混合模式": "Blend mode",
    "层级": "Layer",
    "上移一层": "Move up",
    "下移一层": "Move down",
    "置顶": "Bring to front",
    "置底": "Send to back",
};

/**
 * 取当前语言下的界面文案。
 * @param {string} zh 中文原文（同时用作 en 表的 key）
 */
export function fl(zh) {
    if (!zh) return zh;
    if ((currentLang() || "zh") === "zh") return zh;
    return EN[zh] || zh;
}

/** 给外部（编辑器 self-test / 帮助）用：这条串有没有英文。 */
export function flHas(zh) {
    return Object.prototype.hasOwnProperty.call(EN, zh);
}
