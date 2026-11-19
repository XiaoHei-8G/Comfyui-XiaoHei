// ============================================================
// 家族 logo —— 内联 SVG，底色跟着主题预设走
//
// 【为什么不用 <img src="xh_logo.svg">】
//   xh_paint/assets/xh_logo.svg 里底色写死了旧品牌橙 #E8A33C。
//   <img> 引用外部 svg 时无法继承 CSS 变量 ⇒ 切成松绿/藏青/QQ蓝预设后，
//   编辑器左上角永远挂着一块橙色方块 —— 2026-11-19 用户原话「左上角还是
//   残留的那个颜色，图案的颜色」，说的就是这个。
//
// 【做法】把同一份图形内联成字符串，底色用
//   var(--pxf-accent, var(--xh-primary, #E8A33C))
//   编辑器外壳里有 --pxf-accent（theme.mjs 里 = var(--xh-primary)），
//   独立弹窗没有就用 --xh-primary，两层都缺才退到家族兜底金。
//   爪印保持深色 stroke：浅底深图，任何预设下都看得清。
//
// 图形与 js/xh_paint/assets/xh_logo.svg 逐点一致（64 网格 / rx12 / scale1.5）。
// ============================================================

const LOGO_PATH = "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z";

/** 返回一段内联 SVG 字符串（塞进 innerHTML 用；SVG 内部 0 个双引号冲突）。 */
export function xhLogoHTML(size = 20) {
    const s = Math.max(8, Math.round(Number(size) || 20));
    return `<svg viewBox="0 0 64 64" width="${s}" height="${s}" style="display:block" aria-hidden="true">`
        + `<rect x="6" y="6" width="52" height="52" rx="12" style="fill:var(--pxf-accent,var(--xh-primary,#E8A33C))"/>`
        + `<g transform="translate(14,14) scale(1.5)" fill="none" stroke="#151515"`
        + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
        + `<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/>`
        + `<path d="${LOGO_PATH}"/>`
        + `</g></svg>`;
}

/** 直接给一个可 append 的 <span>，className 沿用调用处原来的（宽度/尺寸靠 CSS）。 */
export function makeXhLogo(className, size = 20) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.setAttribute("aria-hidden", "true");
    // 原来是 <img>（替换元素，CSS 的 width/height 直接生效）；
    // 换成 span 后必须自己 display 成内联盒子，否则外部 CSS 的
    // `.xxx-logo{width:18px;height:18px}` 对行内元素无效、logo 会塌成 0 高。
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "center";
    span.innerHTML = xhLogoHTML(size);
    return span;
}
