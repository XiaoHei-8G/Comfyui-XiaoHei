# XiaoHei 节点包 · 官方前端兼容性说明

> 建立日期：2026-10-29（v1.30.0）
> 起因：官方前端一次升级（1.57.1）连爆 6 个 bug，全部同一类根因。
> 本文件说明「哪些官方接口会变」「我们怎么防」「以后代码怎么写」。

---

## 一、为什么会出现这一批 bug

XiaoHei 家族的前端扩展直接读写官方前端的**内部数据结构**（不是公开 API）。
官方每次大版本升级都可能改其中一部分，一改就是**全家桶冒烟**。

实测一次升级（ComfyUI 前端 1.53 → 1.57.1）改了 **5 处**：

| # | 官方变化 | 老代码写法 | 现在的写法 | 症状 |
|---|---|---|---|---|
| ① | `graph.links` 普通对象 → **Map** | `links[id]` / `for (const id in links)` | `xh_compat.js` 的 `getLinkById()` / `eachLink()` | 取值恒 undefined；循环体一次都不执行（**整条线效果不出现**）|
| ② | `node.size` Array → **Float64Array** | `Array.isArray(node.size)` | `xh_compat.js` 的 `sizeOf()` | 尺寸守卫恒 false（**节点高度失控 / 路由点位置错**）|
| ③ | 端口坐标入口换了 | `canvas.getSlotPosition()` | `xh_compat.js` 的 `getSlotPos()`（优先 `node.getInputPos/getOutputPos`）| 坐标恒 null（**连线段被整段丢弃**）|
| ④ | 连线渲染模式编号变了 | `canvas.links_render_mode === 1` | `xh_compat.js` 的 `getRenderMode()`（读官方字符串 `h.style.mode`）| 模式判断错（**线形状不对**）|
| ⑤ | 带路由点的线**拆多段渲染** | 上下文按 link id 存一份 | 按**调用顺序**存数组，每段一份 | 后一段覆盖前一段（**图案只出现在最后一段**）|

---

## 二、代码怎么写（新规矩）

**碰到官方的数据结构，一律走兼容层，不要自己硬取。**

```js
//  正确：走兼容层（老前端/新前端都兼容）
import { getLinkById, eachLink, sizeOf, getSlotPos, getRenderMode } from "./xh_compat.js";

const link = getLinkById(app.graph, someLinkId);
eachLink(app.graph, (id, l) => { /* ... */ });
const [w, h] = sizeOf(node);
const pos = getSlotPos(app.canvas, node, slotIndex, true);

//  错误：硬取（官方一升级就哑）
const link = app.graph.links[someLinkId];     // 1.57 是 Map ⇒ 恒 undefined
for (const id in app.graph.links) { ... }     // Map ⇒ 循环体不执行
if (Array.isArray(node.size)) { ... }         // Float64Array ⇒ 恒 false
```

兼容层文件：**`web/xh_compat.js`**（全家族唯一入口）。

---

## 三、回归测试（改完包必跑）

```bash
node tools/xh_regression.js            # 全量：6 组检查 + 123 个节点体检（3~5 分钟）
node tools/xh_regression.js --quick    # 快速：只跑关键 4 组（约 1 分钟）
```

退出码 `0` = 全过，`1` = 有 FAIL。

覆盖内容：
1. **官方渲染链路** —— 官方 `drawConnections` 是否正常跑、`renderedPaths` 是否有内容
2. **三种渲染模式的几何偏差** —— XiaoHei 算的曲线与官方 `centerPos` 的偏差（应为 0.0000px）
3. **官方连线菜单** —— 点线中点能否弹出「Add Reroute / 隐藏连线 / Convert to Set/Get」
4. **顶部工具条钩子** —— 「中/EN」与「」是否进了官方那条工具条、内容区有无重复
5. **全家族节点体检** —— 逐个建节点，量尺寸、查「自己长高」「明显虚高」「创建报错」
6. **页面 JS 错误** —— 排除第三方插件噪音后的真实错误

包内留了一个**默认关闭**的测试钩子 `window.__xhDiagEnabled`，
只有回归脚本会打开它（常态零开销）。

---

## 四、API 依赖体检（官方又升级时先跑这个）

```bash
python tools/xh_api_audit.py
```

输出 XiaoHei 全包对官方前端的依赖清单，并标出**已确认失效**的接口。
官方升级后先跑这个 → 列出受影响文件 → 逐个修 → 跑回归。

---

## 五、已知限制

- **路由点（Reroute）场景**目前无法在无头环境自动复现（官方 `graph.createReroute` 的调用签名未公开），
  回归脚本覆盖不到，需人工确认一次。
- 官方 1.57 **自己也有连线流动**（`pathRenderer.drawFlowAnimation`），
  **不要与 XiaoHei 的连线流动同时开**，否则两套动画叠加。
- 连线中点标记**一律跟随官方设置**（`Comfy.Graph.LinkMarkers`）；XiaoHei 不再提供「连线中点标记」「调试：显示热区」这两个设置项。

---

*本文件随节点包一起分发，遇到「升级后某个节点不正常」时，先对照第一节的表。*
