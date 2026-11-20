// XiaoHei 家族 · 按钮按压反馈（唯一真源，全家族共用）
//
// 用户 2026-11-20 反馈：节点底部那些按钮（复制 / 替换 / 清空 / 标签库 / 预览
// 等等）点下去没有任何反馈感，想要"按一下弹一下"的手感。
//
// 为什么做成共享真源而不是逐个节点改：
//   家族几十个节点各自写自己的按钮 CSS（.xh-tp-btn / .xh-pss-btn /
//   .xh-pp-actbtn ...），逐个补 :active 就是造轮子，而且下一个节点还会漏。
//   家族所有按钮有两条共性：① 都是 <button>；② 类名都带 "xh-" 前缀。
//   用一条全局 CSS 同时命中这两条，就能一处注入、全家族自动生效，
//   以后新增节点按钮只要沿用 xh- 命名，无需再碰这个文件。
//
// 机制：纯 CSS :active 伪类，零 JS 事件监听。
//   - 按住：transform 缩小 + 轻微压暗，立刻有"被按下"的手感；
//   - 松开：走 transition 弹回原样；
//   - 连点：伪类随每次按下重新触发，不依赖定时器，不会卡在按下态。
//   - 只动 transform / filter，不改颜色或布局，深浅主题都跟随，不误伤预览框
//     （.xh-tp-prev 是 div）、拖拽手柄（.xh-pss-handle）等非按钮元素。
//
// 用法：setupNode 里调一次 installFamilyButtonPress()（幂等，整页只注一次），
//       或任意入口直接调用——注入是全局的，一个节点调过，全家族都受益。

const STYLE_ID = "xh-family-button-press-css";

// 命中范围：所有 class 里含 xh- 的 <button>，排除 disabled 与顶栏按钮。
// 用 [class*="xh-"] 而非枚举类名，才能覆盖将来新增的按钮、且一处不漏。
// :not(:disabled) 让禁用按钮保持"死"的样子，不产生可点的错觉。
// :not(.xh-tb) 顶栏按钮有自己的家族黄按下态，叠个变暗反而打架，整个排除。
const CSS = `
button[class*="xh-"]:not(:disabled):not(.xh-tb){
  transition:transform .11s ease-out,filter .11s ease-out;
}
button[class*="xh-"]:not(:disabled):not(.xh-tb):active{
  transform:scale(.92);
  filter:brightness(.88);
}
/* 尊重系统"减少动态效果"偏好 */
@media (prefers-reduced-motion:reduce){
  button[class*="xh-"]:not(:disabled):not(.xh-tb){transition:none;}
  button[class*="xh-"]:not(:disabled):not(.xh-tb):active{transform:none;filter:none;}
}
`;

/** 幂等注入家族按钮按压反馈 CSS。整页只注一次，重复调用无副作用。 */
export function installFamilyButtonPress() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}
