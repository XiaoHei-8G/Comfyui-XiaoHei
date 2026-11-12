// ╔═══════════════════════════════════════════════════════════════╗
// ║  双通道重绘（Classic + Nodes 2.0 / Vue 渲染）                  ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// 【为什么需要它】前端 1.58.5 源码实锤（comfyui_frontend_package/static/assets/）：
//   · WidgetLegacy-CXty0tO8.js（Nodes 2.0 的自定义 canvas widget 桥接层）：
//       C.triggerDraw||(C.callback=h(C.callback,function(){this.triggerDraw?.()})),
//       C.triggerDraw=draw
//     ⇒ WidgetLegacy 把「重绘这个 widget」的入口 triggerDraw 挂在 **widget 对象自己身上**，
//       并且会把 widget 自己的 callback 链上 triggerDraw
//       （⇒ 自带 callback 的 widget 改值时会自动重绘，不受本模块影响）。
//   · treeUtil-DQP-z4_o.js（Classic 通道，51 万字符全文）：triggerDraw 命中 **0 次**
//     ⇒ Classic 侧没有「重绘单个 widget」的 API，只有 node.setDirtyCanvas 重画整张画布。
//
// 【结论】只调 node.setDirtyCanvas ⇒ Classic 正常、Nodes 2.0 下画面一动不动。
//         两个都要调。setDirtyCanvas 管 Classic，triggerDraw 管 Nodes 2.0。
//
// 【安全性】triggerDraw 在 Classic 下是 undefined，可选链 `?.()` 无副作用 ⇒ Classic 行为完全不变。
//         单个 widget 重绘抛错已被隔离，不会影响其它 widget。

/**
 * 重绘一个节点及其所有自绘控件（同时兼容 Classic 与 Nodes 2.0 两种渲染通道）。
 * @param {object} node LiteGraph 节点实例
 * @param {boolean} background 是否带背景重画（对应 setDirtyCanvas 的第二参）
 */
export function repaint(node, background = true) {
    if (!node) return;
    node.setDirtyCanvas?.(true, background);
    for (const widget of node.widgets ?? []) {
        try {
            widget.triggerDraw?.();
        } catch (e) {
            // 单个 widget 重绘失败不影响其它 widget
        }
    }
}

/**
 * 重绘指定名字的自绘控件（只走 Nodes 2.0 的 triggerDraw 通道）。
 * 用于「只需刷新某个读数条、不必重画整张画布」的场景。
 * @param {object} node LiteGraph 节点实例
 * @param {string|string[]} names widget 名
 */
export function repaintWidget(node, names) {
    if (!node) return;
    const list = Array.isArray(names) ? names : [names];
    for (const widget of node.widgets ?? []) {
        if (!list.includes(widget.name)) continue;
        try {
            widget.triggerDraw?.();
        } catch (e) {
            // 忽略单个控件的重绘失败
        }
    }
}
