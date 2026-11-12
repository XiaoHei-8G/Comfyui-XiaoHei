# XiaoHei 家族风格总账（2026-10-29 从代码真源扒出）

> 真源文件：
> - 控件配色：`web/xh_ui_kit.js` 的 `BAR_COLORS`（**唯一真源，节点里别另写 hex**）
> - 分类色：`web/xh_brand.js` 的 `CATEGORY_HEX`（**唯一真源**）
> - 面板深浅主题：`web/xh_settings_panel.js` 的 `THEMES`
> - 按钮规格：`web/xh_ui_kit.js` 的 `paintBarBtn` / `makeBarBtn`
>
> 风格一句话：**素**。官方中性黑白灰当骨架，彩色只出现在节点标题栏那一道，用来标示节点类别。
> 零彩度、低饱和、无渐变、无阴影、无夸张圆角。

---

## ① 节点外壳（唯一的大面积彩色）
标题栏底色 = 分类色。标题**字色自动黑/白**（按底色算 WCAG 对比度，浅底配深字）。

| 分类 key | 色值 | 叫法 |
|---|---|---|
| 工具 | `#7A8699` | 石板灰蓝 |
| image | `#0b8ce9` | 天蓝 |
| video | `#5A6FD8` | 靛蓝 |
| setget | `#A0674A` | 咖啡棕 |
| 音频分离 | `#9B59D0` | 紫 |
| 音频 | `#DE4FA3` | 品红 |
| 音频工具 | `#17A2A2` | 青绿 |
| 链提示词 | `#4BA14B` | 草绿 |
| 数学 | `#D64541` | 番茄红 |
| identity | `#7E8C3A` | 橄榄 |
| （兜底 DEFAULT_HEX） | `#7A8699` | 未登记分类落这里 |
| （统一色模式 UNIFORM_HEX） | `#ffffff` | 全家族一个色 |

## ② 节点内部控件（全部无彩度）
| 令牌 | 色值 | 用途 |
|---|---|---|
| SURFACE | `#252525` | 按钮/输入框底 |
| BORDER | `#333333` | 描边、分隔线 |
| TEXT | `#e8e8e8` | 正文 |
| PRIMARY | `#e8e8e8` | 主操作白键底 |
| PRIMARY_TX | `#1c1c1c` | 白键上的**深墨字**（必须） |
| ACTIVE_BG | `#3a3a3a` | 激活态底 |
| ACTIVE_BD | `#4a4a4a` | 激活态描边 |
| ACTIVE_TX | `#ffffff` | 激活态字 |
| SECOND_TX | `#8a8a8a` | 次要/说明文字 |
| DANGER_BG | `#e05858` | 危险实心底 |
| DANGER_BD | `rgba(255,255,255,.22)` | 危险描边 |
| DANGER_TX | `#ffffff` | 危险字 |

## ③ 按钮四档 + 统一规格
| 档 | 外观 |
|---|---|
| neutral | 底 `#252525` / 边 `#333333` / 字 `#e8e8e8` / 字重 600 |
| primary | 底 `#e8e8e8` / 边 `rgba(0,0,0,.18)` / 字 `#1c1c1c` / 字重 700 |
| active | 底 `#3a3a3a` / 边 `#4a4a4a` / 字 `#ffffff` / 字重 700 |
| danger | 底 `#e05858` / 边 `rgba(255,255,255,.22)` / 字 `#ffffff` / 字重 700 |

规格：高 22px · 最小宽 26px · 内边距 `0 9px` · 圆角 4px · 字号 12px · 字体 inherit ·
line-height 1 · 无阴影 · transition `.15s`（filter/background/border-color/color）

hover：**暗底提亮 `brightness(1.28)`；白键压暗 `brightness(0.88)`**
（白键已经最亮，提亮等于没反馈 —— 这条踩过一次）

## ④ 面板 / 弹窗（设置面板、配色板、指南浏览器）
| 变量 | 深色主题 | 浅色主题 |
|---|---|---|
| `--xh-surface` | `#1c1c1c` | `#f7f7f7` |
| `--xh-side` | `#141414` | `#eeeeee` |
| `--xh-card` | `#252525` | `#ffffff` |
| `--xh-border` | `#333333` | `rgba(0,0,0,.12)` |
| `--xh-text` | `#e8e8e8` | `#1c1c1c` |
| `--xh-sub` | `#8a8a8a` | `#6b6b6b` |
| `--xh-primary` | `#e8e8e8` | `#1c1c1c` |
| `--xh-on-primary` | `#1c1c1c` | `#ffffff` |
| `--xh-danger` | `#e05858` | `#c93a3a` |
| `--xh-hover` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.06)` |
| `--xh-overlay` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.05)` |
| `--xh-input-bg` | `#141414` | `#ffffff` |
| `--xh-chip-bg` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.04)` |
| `--xh-title-bg` | `rgba(255,255,255,.05)` | `rgba(0,0,0,.03)` |
| `--xh-bar-bg` | `rgba(0,0,0,.25)` | `rgba(0,0,0,.04)` |
| `--xh-foot-bg` | `rgba(0,0,0,.25)` | `rgba(0,0,0,.04)` |
| `--xh-shadow` | `rgba(0,0,0,.7)` | `rgba(0,0,0,.12)` |

主色两套**反向**：深色主题 = 白键 + 深墨字；浅色主题 = 深墨键 + 白字。

## ⑤ 语义色（唯一允许"有颜色"的功能色，不做装饰）
| 用途 | 色值 |
|---|---|
| 危险（停止/清空/删除） | `#e05858` |
| 排名 金 / 铜 | `#e6b800` / `#cd7f32` |
| 收藏星 | `#fbbf24` |
| 缺失标记 | `#4d2f2c` |
| ~~成功绿~~ |  **当前代码里已没有** —— 10-29 换肤时被并进灰色 active 档 |

## ⑥ 尺寸 / 字号 / 圆角惯例
- 圆角：控件 6px · 按钮 4px · 内嵌小件 3px · 面板 8px / 12px · 圆形 50%
- 字号：12px 按钮与正文 · 11px 次要 · 10px 角标 · 13px 面板正文 · 9px 极小标注
- 工具条行高 28px · 节点宽度 350px（官方定的，别改）· 标题栏自动黑/白字

## ⑦ 四条铁律（代码里写死的，别违反）
1. **浅底必须配深字** —— 白键留白字等于看不见（踩过两次）。
2. **白键 hover 压暗**，不是提亮。
3. **语义色禁止中性化** —— 危险红不能改成灰，否则用户会习惯性点下去。
4. **换肤脚本必须排除"产品内容"** —— `xh_color_picker.js` 的 36 色卡 + `BUTTON_PALETTE`、
   `xh_animated_links.js` 的像素画调色板、`.bak` 快照。

## ⑧ 待用户逐条确认（2026-10-29）
- [ ] 分类色 10 个是否都保留？有没有哪个该换/该删？
- [ ] 分类色饱和度偏高（天蓝 #0b8ce9 / 品红 #DE4FA3 / 青绿 #17A2A2），要不要整体压一档？
- [ ] "成功绿"要不要加回来？加的话用在哪些场合？
- [ ] 危险红 `#e05858` 够不够克制？
- [ ] 分类色只用在标题栏，还是节点描边/角标也要带一点？
- [ ] 深浅主题两套是否都要维护？还是只保深色？

---

#  2026-10-29 追加：家族核心品牌色（三层分工）

用户拍板：**家族要有一个统一的「记号色」**，用法照 Pixaroma 的分工（它品牌色 `#F66744`，底色 `#1D1D1D/#2A2A2A` 中性深灰）。

## 三层分工（互不打架）

| 层 | 干什么 | 用什么色 |
|---|---|---|
| **壳层** | 节点底 / 描边 / 正文 / 输入框 | **官方主题色**（实时读 `--comfy-menu-bg` 等，深浅自动跟随） |
| **记号层** | 主操作按钮 / 小字 / 图标 / 顶栏「XH」标志 | **品牌色 琥珀金 `#E8A33C`** |
| **分类层** | 标题栏，标识节点类型 | 10 个分类色（**已降饱和**，退到背景层） |

## 品牌色令牌（唯一真源：`web/xh_ui_kit.js` 的 `XH_BRAND`）

```
MAIN        #E8A33C   品牌色（深底/浅底通用）
TX          #1c1c1c   品牌色上的字（深墨）——  浅底必须配深字（家族铁律）
BORDER      rgba(0,0,0,.22)
TEXT_DARK   #E8A33C   深底上的品牌色小字
TEXT_LIGHT  #9A6412   浅底上的品牌色小字（够深才读得清）
ON_LIGHT    #B5761D   浅底上的主操作底（比 MAIN 深一档才压得住白字）
ON_LIGHT_TX #ffffff
```

 选色理由：暖色是 10 个分类色里**唯一没被占满**的方向（分类色里暖的只有暗棕/暗橄榄）⇒ 品牌色与分类色不会互相冒充；比 Pixaroma 的橘红收敛一档，更贴黑白灰。

## 官方主题跟随（ 之前是写死的）

- 之前：`BAR_COLORS` 是**写死**的（按本机深色界面像素抄的）⇒ 官方换浅色主题，XiaoHei 不跟随。
- 现在：`officialPalette()` 用 `getComputedStyle` 实时读官方变量
  （`--comfy-menu-bg` / `--comfy-input-bg` / `--comfy-menu-secondary-bg`），
  官方变量可能是 `oklch()` 形式 ⇒ 走离屏 canvas 转成 `rgb()` 再喂给 canvas。
- 同时把品牌色 + 官方色**注入成 CSS 变量**（`:root`），所有 DOM 元素共用：
  `--xh-brand` `--xh-brand-tx` `--xh-brand-text` `--xh-surface` `--xh-border`
  `--xh-text` `--xh-input` `--xh-second` `--xh-primary` `--xh-on-primary`
  （1 秒刷新一次 ⇒ 官方切主题时 XiaoHei 跟着变）。
- `BAR_COLORS` 对外接口**完全没变**（还是 `BAR_COLORS.XXX`），只是从常量改成 getter。

## 分类色（已整体降饱和）

| 分类 | 旧 | 新 |
|---|---|---|
| 工具 | #7A8699 | #6E7889 |
| image | #0b8ce9 | #3E7FA8 |
| video | #5A6FD8 | #4F63AC |
| setget | #A0674A | #8A6248 |
| 音频分离 | #9B59D0 | #8259AE |
| 音频 | #DE4FA3 | #B25A85 |
| 音频工具 | #17A2A2 | #3E8C8C |
| 链提示词 | #4BA14B | #5C8F4C |
| 数学 | #D64541 | #B05550 |
| identity | #7E8C3A | #7A8448 |

- 色相不变，只压暗降艳 ⇒ 仍是彩的、能一眼分辨类型，但不再和品牌色抢。
-  `xh_ui_kit.js` 的 `XH_PALETTE`（12 色，用户自选标题色）**保持原样** ——
  那是给用户挑鲜艳色的产品内容，里面已有「金黄 #DCA02B」正好和品牌色同族。
- 「统一色」模式：原为纯白 `#ffffff` ⇒ 改成**品牌色 `#E8A33C`**（这模式本就是"全家族一个记号"）。

## 落点清单

1. `xh_ui_kit.js`：`XH_BRAND` 令牌 + `officialPalette()` + `syncXhCssVars()` + `BAR_COLORS` 改 getter
2. `xh_ui_kit.js`：顶栏按钮 CSS 改用变量，新增 `.xh-tb-brand`（品牌档）
3. `xh_settings_panel.js`：顶栏「XH」按钮加 `xh-tb-brand` 类（**家族门面**）；面板标题的「XH」二字用品牌色
4. `xh_brand.js`：分类色降饱和 + 统一色改品牌色
5. 节点工具条按钮：走 `paintBarBtn` 的 `primary` 档 ⇒ 自动是品牌色（canvas 与 DOM 都生效）

## 铁律补充

-  品牌色是**前景层**，分类色是**背景层** —— 两者不得互换。
-  品牌色上永远是**深墨字**（`#1c1c1c`），浅色主题下换 `#ffffff`。
-  语义色（危险红）**不跟随主题**，也不许被品牌色替换。

---

#  2026-10-29 追加：「统一石墨」标题栏（用户拍板方案 B）

用户看了一堆彩色节点（紫/绿/青/灰…）说「**颜色五花八门，默认的，让他们统一一个颜色**」。

## 参考真源：Pixaroma 的做法
`custom_nodes/ComfyUI-Pixaroma/js/brand/index.js`：
```js
const TITLE_BAR_COLOR = "#1d1d1d";   // 所有节点一样
const BODY_COLOR      = "#2a2a2a";   // 所有节点一样
```
⇒ 它**根本不按分类分色**，全家族一个标题色；品牌橘红 `#F66744` 只上按钮/图标/小字。
**我们抄的是这个「分工」，用 XiaoHei 自己的品牌色。**

## 新方案（B）：石墨 + 琥珀顶线 + 分类小方块

| 层 | 内容 | 深色主题 | 浅色主题 |
|---|---|---|---|
| 标题栏底 | 全家族**同一个**石墨色 | `#232323` | `#e9e9e9`（官方 surface）|
| 顶部线 | 2px 琥珀金（品牌色，唯一记号）| `#E8A33C` | `#B5761D` |
| 分类色点 | 标题栏左端 6×6 小方块 | 分类色板（见下）| 同左 |
| 节点主体 | 统一石墨 | `#262626` | `#f2f2f2` |

设置项「节点配色」现在有 4 档，**默认 = 统一石墨**：
`统一石墨` / `按分类` / `统一色` / `关闭`

## 分类色板（只用在 6px 小方块上，不再铺满标题栏）

| 分类 | 色值 | 分类 | 色值 |
|---|---|---|---|
| 工具 | `#7C8798` | 音频 | `#CC6E9C` |
| 图像 | `#4A93C4` | 音频分离 | `#9A6CC8` |
| 视频 | `#5F77C4` | 音频工具 | `#4AA3A3` |
| SetGet | `#A47355` | 链提示词 | `#6BA35A` |
| Identity | `#8C9752` | 数学 | `#C4635D` |
| 循环 | `#6E8FA8` | 导演台 | `#B08A5E` |
| Model | `#8F7FB8` | Control | `#5F9E7E` |

##  两个隐藏 bug（都是"五花八门"的深层根因）

1. **分类色从来没分对过**：ComfyUI 前端会把 CATEGORY **本地化** ——
   Python 里的 `Image`/`Video` 在前端变成 **「图像」/「视频」**；
   之前色板键写的是英文 ⇒ 一个都匹配不上 ⇒ 全落兜底色。
2. **22 个 XiaoHei 节点从来没上过色**：它们的分类是 `MiniMax H3/*`、`模型/条件/minimax`
   等**不带 `XH` 前缀**的 ⇒ `beforeRegisterNodeDef` 的前缀判定把它们跳过了。

##  实现铁律（两模式必须一致）
- **旧版画布**：`drawTitleBarBackground` 覆写（标题栏矩形 = `roundRect(0,-title_height,size[0],title_height)`）
  ⇒ 顶线画在 `y=-title_height`，小方块画在 `x=3`（该区无官方元素：节点图标 emoji 从 x≈26 起）。
   **不要画在 `drawTitleText` 里** —— 实测旧版画布不走它画标题文字 ⇒ 永远不出现。
- **Nodes 2.0**：标题栏 div（`.bg-node-component-header-surface`）加 `background-image` 线性渐变做顶线；
  小方块是插进标题文字元素的 `<span class="xh-cat-dot">`。
   **`cssText` 赋值会重置所有内联样式** ⇒ 颜色必须**一起写进 cssText**，否则会被冲成透明。

---

#  2026-11-02 追加：节点状态要「跨实例存活」，只能存 `node.properties`

计时器归零三连（切工作流回来 / 进子图再出来 / 队列没跑完）查出来的根因，
对**全家族所有带状态的节点**都成立，记在这儿别再踩。

## 官方前端到底怎么载入工作流（源码取证）

```
app.ts:1449  this.rootGraph.configure(graphData)
  └─ LGraph.ts:3123  this.clear()            ← 销毁全部节点（触发 onRemoved）
  └─ LGraph.ts:3288  LiteGraph.createNode()  ← 造全新实例（onNodeCreated 重跑）
  └─ LGraph.ts:3351  node.configure(nodeData)
       └─ LGraphNode.ts:1177  this.properties[k] = info.properties[k]   ← 只有 properties 被恢复
       └─ LGraphNode.ts:1293  this.onConfigure?.()                      ← 续状态的钩子在这
```

⇒ **JS 实例字段（this._xxx）必丢**；`node.properties` 会跟着工作流 JSON 活下来。

## 铁律

-  节点要记的状态（计时、进度、上次结果…）**一律存 `node.properties`**，
  再在 `onConfigure` 里恢复 + 续跑 —— 这是唯一官方保证的跨实例载体。
-  `onConfigure` 是**唯一**能在实例重建后接上状态的钩子，节点有状态就必须实现它。
-  同一个状态对象**同时**挂一份到 `node.properties`（跨实例/跨刷新）和
  模块级 `Map`（key = `所属图 id : 节点 id`，跨工作流不串号），两边用同一个对象引用。
-  后端 `execution_start` / `execution_success` 是**每条 prompt 一次**，
  批量队列里不能拿它当「一轮开始/结束」用 —— 判停要看 `/queue` 的 `pending`。

---

#  2026-11-06 追加：家族按钮语义统一 ——  只留给「设置」

起因：同一个「齿轮」在家族里指三件不同的事，用户要求「不能乱七八糟的了」。
对照 Pixaroma（MIT）`js/shared/node_settings.mjs` 的语义后定规矩，**只统一长相和叫法，不合并功能**。

## 一句话规矩（写进 skill，新节点一律照办）

| 用户看到的东西 | 图标 | 它到底改什么 | 会不会影响出图结果 |
|---|---|---|---|
| **设置** |  | 交互偏好（步进、默认强度、分隔符、外观色…） |  不影响，改了不该触发重跑 |
| **更多参数** | ▸ / ▾ | 把**真参数**收起来/展开（深度合成、搜索区、段落表…） |  会，它本身就是执行数据 |
| **外观 / 颜色** |  调色板 | 节点按键颜色等纯视觉 |  不影响 |

 ** 禁止**：把「更多参数」做成设置面板、把真参数从执行数据里拆出去（老工作流 `widgets_values` 会整体串位）。
 ** 禁止**：为新节点私建第三种「齿轮」。要用  就必须是设置，且状态存 `node.properties`（见 11-02 铁律）。
 历史代码注释里残留的「齿轮 / 」多指**旧的折叠按钮**，不代表新规矩；`xh_lorastack.js` 那颗是**真设置**，保留  正确。

## 本次实际改动（2026-11-06，只动 3 个前端文件）

| 文件 | 改动 |
|---|---|
| `web/xh_ui_kit.js` | `makeGearBtn` 图标由齿轮换成两态折叠箭头：收起 ▸ / 展开 ▾（`XH_MORE_SVG_EXPAND/COLLAPSE`），`paint()` 里按状态画；旧 `XH_GEAR_SVG` 仅保留导出做兼容。**函数名/字段名不动**（8 个调用点零改动）。 |
| `web/xh_node_toolbar.js` | 官方选中工具条那颗：`SVG_GEAR`→`SVG_PALETTE`（lucide palette）、`xh-tb-gear`→`xh-tb-palette`、`GEAR_CMD`→`STYLE_CMD`、面板标题去掉 。**命令 id `XH.ShowNodeStyle` 不变**。 |
| `web/xh_image_tools_lang.js` | 万能遮罩的硬编码  提示文案 + 注释里的「齿轮」→「更多参数」。 |

- 不动版本号（仍 1.45.1）、不动后端、不动存档格式、不动 `widgets_values`、不注册新节点。
- 备份：`web/*.统一齿轮前_20261106_042100.bak`（3 份，md5 已留底）。
- 验证：3 文件 `node --check` 全过；行为桩 17/17（两态图标 / title / 底色 / 点击回调 / 重复 paint 不重建 DOM / 工具条引用一致 / 旧字样清零）。前端观感需重启 ComfyUI + Ctrl+F5 目视确认。

## 同日追加：工具条去重 —— 撤掉「节点配色」那颗调色板

上面把按键颜色改成调色板后，选中节点上方的官方浮动工具条出现**两颗几乎一样的调色板**：

| | 来源 | 改什么 | 显示条件 |
|---|---|---|---|
|  已撤 | `web/xh_node_style.js` `XH.StyleColor`「节点配色」 | 节点**标题栏 / 节点体**颜色 | 任意节点 |
|  保留 | `web/xh_node_toolbar.js` `XH.ShowNodeStyle`「按键颜色」 | 节点内**按钮 / 开关**颜色 | 仅含按键的 XiaoHei 节点 |

用户拍板：节点配色在「更多选项 / 右键菜单」里已有入口，工具条上这颗多余。
⇒ **删** `COLOR_CMD` 命令 + `getSelectionToolboxCommands` 钩子 + 工具条图标件（`PALETTE_SVG` / `ICON_CLASS` / `injectIconCSS`）；
**留** `OPEN_CMD`（Shift+\ 快捷键）、`getNodeMenuItems` 右键菜单「 节点配色 / 复制 / 粘贴 / 恢复默认」、配色面板与 `window.XHNodeColors` API —— **功能零损失**。

- 只动 `web/xh_node_style.js` 一个文件，`node --check` 过；全包 `getSelectionToolboxCommands` 实现只剩 `xh_node_toolbar.js` 一处，工具条只剩一颗调色板。
- 备份 `web/xh_node_style.js.撤工具条配色调色板前_20261106_045700.bak`（md5 `e05079e0…`）。
- 版本号仍 1.45.1，重启 + Ctrl+F5 生效。

##  遗留（没在这轮做，别当成已解决）

**同一个「更多参数」按钮，折叠状态 4 个存档、4 个不存档**，这才是比图标更实质的一致性问题：

| 状态随工作流存档  | 只存 JS 实例字段 / DOM class，重载归零  |
|---|---|
| 链式提示词 `properties.xh_cp_collapsed` | MSR 中继 `node._xhMsr.collapsed` |
| 分组 `properties.ctrlCollapsed` | 加载视频 `node._xhVL.collapsed` |
| 分段表 `properties.xh_seg_collapsed` | 万能遮罩 `node._xhSMFCollapsed` |
| 视频对比 `settings widget._gearOpen` | 滑块 `settings.classList`（连字段都没存） |

修法按 11-02 铁律：统一存 `node.properties` + `onConfigure` 恢复 + 调 `_xhGearSet()` 重涂。
**单独排一轮做**，不跟换图标混在一次改动里（要动 4 个节点的恢复钩子，混一起不好回滚）。

## 同日追加：按键颜色「切到别的工作流再切回来就失效」

**颜色数据一直都在，丢的只是「重涂」这一步。** 磁盘上 18 个含 `xhBtnColor` 的工作流 JSON 全部核过，
值就在 `nodes[].properties.xhBtnColor`（例：`H3【角色替换】V1玉芬工作流.json` 的 516/599 号节点）
⇒ 不是「没存进文件」，是载入后没人把它画回节点脸。

**根因（源码实证，非猜）**：官方前端 `app-BEFBFi8M.js` 里节点构造函数调
`invokeExtensionsAsync("nodeCreated", this)`，**之后** `loadGraphDataNow` 才 `rootGraph.configure(e)`
把 `properties` 从工作流 JSON 恢复。旧 `nodeCreated` 却在钩子体里先写了
`if (!normalizeHex(node?.properties?.xhBtnColor)) return;` —— 此刻必为 `undefined`，直接 return，
连 microtask 都没排。Pixaroma `js/shared/node_settings.mjs` 的 `settleNodeAccent` 注释把同一坑
记为 Vue Compat #8（`onNodeCreated → configure ENTER → configure EXIT → microtask`），
它实测重开工作流 48 个 DOM 节点里 42 个颜色回退成默认橙。

**修法（只动 `web/xh_node_toolbar.js`）**：
1. `scheduleBtnColorRestore()`：判断**挪进 microtask**，再加一次 `requestAnimationFrame`
   兜 Nodes 2.0 的 DOM 挂载晚于 configure；`nodeCreated` 无条件调度，不再提前读 properties。
2. 新增官方 `afterConfigureGraph` 钩子 → `repaintAllBtnColors()` 遍历**主图 + 子图**，
   凡带 `xhBtnColor` 一律重涂，下一帧再兜一次。打开工作流 / 切 tab / undo 全走这个漏斗。
3. 加载路径**只读 properties 重涂，不写、不调 `tryMarkDirty`** ⇒ 打开干净工作流不会被判「已修改」。

验证：`node --check` 过；运行时桩 13/13（复现 nodeCreated 早于 configure 的时序、microtask 重涂、
rAF 二次、主图/子图全图重涂、无颜色节点不误染、不标脏、不写 properties、重复调用幂等）。
备份 `web/xh_node_toolbar.js.修按键色重载前_20261106_050500.bak`（md5 `93aa45d1…`）；
版本号仍 1.45.1，重启 ComfyUI + Ctrl+F5 生效。

 **家族铁律**：`nodeCreated` 里**不许读 `node.properties` 做判断**（那时还没恢复）。
凡「随工作流存档的前端状态」，必须 `microtask + rAF` 或 `afterConfigureGraph` 双路恢复；
只写进 `properties` 不等于重载会显示。

## 同日追加：右键菜单四项统一挂家族图案 

用户指着右键菜单圈出的「节点配色 / 复制节点颜色 / 粘贴节点颜色 / 恢复默认配色」，
要求四个前缀小图标**统一换成「我们家族的那个图案」**。

**家族图案 = **，源码三处硬证据：`xh_brand.js` 的 `CATEGORY_PREFIX = "XH"`
（123 个家族节点的分类前缀）、`xh_animated_links.js:3329` 明文「加  家族图标
（与节点标题 XiaoHei-xxx 统一）」、设置分类「 XiaoHei」。
旧四项分别是  /  /  / ，各写各的，跟下面第三方包「 Pixaroma Node Colors」混在一起认不出谁家的。

- 只动 `web/xh_node_style.js`：模块顶层新增**唯一真源** `const FAMILY_ICON = ""`，
  四项 `content` 全部改 `${FAMILY_ICON} …`；注释里「右键菜单  节点配色」同步改 。
- **不推翻**当天定的工具条语义规矩： = 纯外观/颜色（那是**工具条按钮**的功能图标），
   = **右键菜单项的家族归属标记**，两者不是一回事。
- 验证：`node --check` 过；运行时桩 11/11（无剪贴板 3 项 + 分隔符、有剪贴板第 4 项、
  多选 suffix、全部  开头、旧 emoji 零残留、功能文字与回调不变、常量只定义一次、四项全引用）。
  备份 `web/xh_node_style.js.统一家族菜单图标前_20261106_052000.bak`（md5 `7a739262…`）；
  VERSION 仍 1.45.1，重启 ComfyUI + Ctrl+F5 生效。
- 规矩已写进 skill §13.33 ②：以后家族右键菜单项一律用 `FAMILY_ICON`，换图案只改一行。

## 同日追加：标题栏对齐官方 + 标题字加粗（2026-11-06）

用户截图对比「XiaoHei-分组控制」与官方「UNet加载器」：家族那条标题栏**比官方大一圈**
（像素实测 76px 高 / 637px 宽 vs 官方 51px 高 / 477px 宽），要求「跟官方一致，但标题字变粗」。

- 官方真源（`GraphView-*.js` 的 NodeHeader 组件）：
  `<div class="lg-node-header w-full min-w-0 p-1 text-xs …">` —— **所有节点同一个组件**、
  同样 `p-1`(4px) / `text-xs`(12px / 16px 行高)，官方没给任何节点单独设标题栏尺寸。
- 只动 `web/xh_ui_kit.js`：`installXHFamilyTitleStyle()` 注入一条 CSS，给家族 header 打
  `xh-family-header` class，把 padding / 字号 / 行高统一回官方值，**不写死 height**
  （高度交给浏览器算，画布缩放多少都跟官方一致）；唯一刻意差异是
  `[data-testid="node-title"]` 内 `font-weight: 700`。
-  **本轮原本没动节点宽度**（`size=[360,200]` + `minWidth:340`），理由是怕挤坏
  「全关/全开 + 筛选控件」那排 —— 用户随即追问「你没有全改吗」，**此判断已被推翻**：
  标题栏宽度 = `size[0]`，只覆 CSS 不收节点，横向照样比官方长 1.34 倍 ⇒ 不算对齐。
  修法见下一段「同日再追加」。
-  打标判据必须用「是不是家族节点」，**不能用「有没有分类色」**：配色设「关闭」时
  `xh_brand.js:251` 把 `__xhCatHex` 置 null，按 cat 判断会让对齐/加粗整片失效。
  已把 `_xhCatHexOfDom` 改返回 `{isXH, cat}` + 新增 `_xhIsFamilyNode`
  （类名 / 标题前缀 / 属性存在，三条任一命中）。
- 只覆盖 **Nodes 2.0（Vue）**；旧版 canvas 的标题字是 `drawTitleText` 用 `ctx.font` 画的，
  CSS 管不着，本轮未动。
- 验证：`node --check` 过；运行时桩 `Temp/xh_title_style_probe.mjs` **27/27**
  （幂等注入、不误伤官方节点、不写死高度、配色关闭仍打标、改名节点仍认得、金线/色点逻辑未破坏）。
  备份 `web/xh_ui_kit.js.标题栏对齐官方加粗前_20261106_055100.bak`（md5 `47800cbb…`）；
  VERSION 仍 1.45.1，重启 ComfyUI + Ctrl+F5 生效。

## 2026-11-06 同日再追加：横向也收成官方，标题栏才算「全改」

用户一句「你没有全改吗？」—— 上轮只做了上下厚度 + 标题加粗，明确留了「横着还是那么长」没动。
 **对齐官方 = 整条带子，上下和横向一起，别只做一半还让用户自己发现。**

- 实测比例：家族蓝条 637px / 官方紫条 477px = **1.34 倍**，正好 = `360 / 270`。
  官方普通节点默认宽 270；`xh_group.js` 写死 360（+ `addDOMWidget minWidth:340`）。
- `xh_ui_kit.js:3089` 标题栏是 `roundRect(0,-title_height,size[0],title_height)`
  ⇒ **标题栏宽度就是节点宽度**，CSS 改不出横向长短，必须收 `size[0]`。
- 改动只落 `web/xh_group.js`：新增模块级常量 `GROUP_W = 270` / `GROUP_MIN_W = 250`
  （唯一真源），**5 个宽度点全改**：`onNodeCreated` 初始 size、`addDOMWidget` 的 minWidth、
  `_render()` 的折叠分支 / 空列表分支 / 正常分支。
  -  `_render()` 每次重绘都无条件重写 `size` ⇒ 只改初始值会被 300ms 后首次 `_render()` 覆盖。
  -  `minWidth` 不同步降，Vue 下 DOM 会把节点撑回 340。
  -  老工作流里存的 `size:[360,…]` 不用迁移：`onNodeCreated` 里 `setTimeout(_render, 300)`
    会重设为 270，加载后自动收窄。
  - 筛选行不写死宽度、输入框已有 `minWidth:0`，270 下靠 flex 压缩即可，**不加 flex-wrap**
    （`headH = 92` 是写死的，换行会溢出）。
- 只动这一个节点。`xh_label.js 400` / `xh_lorastack.js 320` / `xh_chainprompt.js 330` /
  `xh_timer.js 300` 是各自表格内容需要的下限，**没一刀切**，要收单独说。
- 旧版 canvas 模式标题栏高度由 `LiteGraph.NODE_TITLE_HEIGHT=30` 决定，本来就与官方一致；
  宽度跟着 `size[0]` 一起收窄，两模式都覆盖。
- 验证：`node --check` 过；桩 `Temp/xh_group_width_probe.mjs` **15/15**
  （比例吻合、4 处 size 全引用常量、无 360/340 残留、老工作流自动收窄、筛选行可压缩、
  上一轮的 CSS 对齐与加粗未被破坏）。
  备份 `web/xh_group.js.收窄到官方宽度前_20261106_060200.bak`（md5 `13939f30…`）；
  VERSION 仍 **1.45.1**，重启 ComfyUI + Ctrl+F5 生效。

## 2026-11-06 同日三追加：「所有节点都改了吗」—— 打标链断了，只覆盖到部分节点

用户刷新后截图：`XiaoHei-循环开始`（橙）标题栏 **77px**、`XiaoHei-计时器`（红）**50px**，
底边齐平、橙条往上多鼓 **27px** —— 跟最早那张「家族蓝 76 / 官方紫 51」完全同一个数。
⇒ 上轮的 CSS **不是没写，是只落到了被认出来的那部分节点上**。

-  真因①：样式注入只写在 `paintVueUnifiedTitle()` 里，而它要
  `_xhCatHexOfDom(el).isXiaoHei === true` 才会走到；反查一旦失败，**连 `<style>` 都不进 DOM**。
-  真因②：反查靠 `el.closest("[data-node-id]")` → `window.app.canvas.graph._nodes` → 比 id，
  四段链路任一段断（子图 / 新版 id 类型 / Vue 重渲染时机 / app 挂载点差异）就漏一个节点。
  实测同一画布里计时器认出来了、循环开始没认出来 ⇒ 一个 50px 一个 77px。
-  真因③：CSS 选择器带 `.xh-family-header` 限定，漏标 = 完全没样式。

**修法（只动 `web/xh_ui_kit.js`）**
1. 对齐官方的规则**去掉 class 限定**，改成裸 `.lg-node-header { padding:4px; font-size:12px;
   line-height:16px; min-height:0; max-height:32px; align-items:center; flex-wrap:nowrap }`
   —— 值就是官方 `p-1 / text-xs` 默认值，对官方节点 no-op；
   `max-height` 只在被撑大时生效，正常节点不受影响（专门压掉那 27px）。
   `.lg-node-header *` 行高 16px 同理。**只有 `font-weight:700` 仍限定 `.xh-family-header`。**
2. `refreshVueTitles()` 开头**无条件** `installXHFamilyTitleStyle()`，`paintVueHeader` 单节点
   抛异常不再带翻整轮（各自 try/catch）。
3. 打标三层：`_xhCatHexOfDom` 反查（新增 `window.comfyAPI.app.app` / `g.nodes` /
   `data-testid="node-header-<id>"` 备用取 id）→ **文本兜底** `/\s*XH|XiaoHei-/` 读
   `el.textContent` 认家族（零依赖，家族默认标题 100% 命中）→ 才 `paintVueUnifiedTitle`。
-  改名成完全不含 `XiaoHei-` 的节点会失去加粗，但**对齐官方照样生效**（全局 CSS），降级安全。
-  只覆盖 Nodes 2.0（Vue DOM）；旧 canvas 标题栏由 `LiteGraph.NODE_TITLE_HEIGHT=30` 决定，
  本来就与官方一致，CSS 也管不着。
- 验证：`node --check` 过；`Temp/xh_title_style_probe.mjs` **37/37**（含关键回归：
  把 `_xhCatHexOfDom` mock 成全返回 false，验证文本兜底仍覆盖循环开始/计时器、
  官方节点不误伤、单节点抛异常不带翻整轮）；`Temp/xh_group_width_probe.mjs` **15/15**。
  备份 `web/xh_ui_kit.js.标题栏全覆盖修复前_20261106_061500.bak`（md5 `9c8b7de6…`）；
  VERSION 仍 **1.45.1**。重启 ComfyUI + Ctrl+F5 生效。
-  当时仍未做：其它节点的**宽度**没一刀切（`xh_label 400` / `xh_chainprompt 330` /
  `xh_lorastack 320` / `xh_timer 300` 是各自表格内容下限）。→ **已于 §13.35 全部收口**。

---

### 13.35  全家族「到底改全没有」总收口（2026-11-06 06:30，用户第三次追问后）
用户原话：「家族里的节点都都都都都改了吗？」。**结论：之前确实没全改**，这轮把整包翻了一遍。

**硬证据（不是猜）**
- `user/default/comfy.settings.json` → `"Comfy.VueNodes.Enabled": true` ⇒ 走的是 Vue DOM，
  `.lg-node-header` 这条路没错。
- `user/comfyui.log` 04:41 行 → `v1.45.1 已加载 87 个节点，来自 18 个模块`，路径就是
  `ComfyUI-Installs\...\custom_nodes\Comfyui-XH_Toolbox`（A 目录），**不是** Desktop 那份分发副本。
- 全包正式 `web/*.js` = **62 个**；标题栏样式注入点只有 `xh_ui_kit.js` 一处，
  其它 61 个 js 没有任何 `.lg-node-header` 自定义样式 ⇒ 机制上本来就是全包统一。

**三个真漏点（这才是「刷新了还是这样」的原因）**
1.  **CSS 只在 `refreshVueTitles()` 的 rAF 回调里注入**。rAF 要等 setup / onNodeCreated /
   MutationObserver 任一路径触发才跑；扩展加载顺序或首屏晚于 setup ⇒ 整包 `<style>` 一条都没进
   DOM。⇒ 改为**模块顶层立即注入**（幂等），rAF 里那次留作双保险。
2.  **加粗依赖 header 上的 `.xh-family-header` class**，而判据是「DOM 反查 + 标题文本」。
   `xh_label.js` 里 `this.title = ""`（标题空串）、用户改名、配色设成「关闭」时全漏。
   ⇒ 四重兜底：反查（认 `__xhFamily`）→ 文本 → `.xh-cat-dot` 装饰 → **根节点
   `data-xh-family="1"`**（Vue 不 patch 自定义 data-*，比 header class 抗重渲染）；
   CSS 同时认 header class 和根节点属性。
3.  `xh_brand.js` 的 `onNodeCreated` 把「写标记 + 刷 DOM」包在
   `mode !== "关闭" && applyAutoColor(...)` 里面 ⇒ **配色一关，整条链不跑**。
   ⇒ 把 `this.__xhFamily = true` 与 `refreshVueTitles()` 提到 if 外面，无条件执行。

**宽度：全包统一到官方 270（这轮才真正做完）**
| 文件 | 原值 | 现值 |
|---|---|---|
| `xh_group.js` | 上轮已收 270 | 270 / minWidth 250 |
| `xh_label.js` | 400 / minWidth 360 | **270 / 250** |
| `xh_timer.js` | 300 | **270**（minWidth 250 本就够） |
| `xh_lorastack.js` | minWidth 320 | **250** |
| `xh_chainprompt.js` | 6 处 330 | **全 270** |
| `xh_segment_table.js` | minNodeSize 330 | **270**（全包扫描才挖出来的漏网） |
| `xh_float_window.js` | 强行 setSize 390 | **下限 270**（高度仍 415；允许自己拖宽，不再被拉回 390） |
| `xh_video_timeline.js` | fallback 300 | **270** |
-  **已存在工作流里的节点宽度存在 JSON 里，不会自动变**；改的是「新建节点默认值 +
  DOM minWidth 地板」。老节点想要 270 得重新拖 / 重拖节点。
-  想更宽随时拖；所有节点都不再被代码强行拉回旧宽度。

**交付与验证**
- 改动 9 个前端 js：`xh_ui_kit.js` / `xh_brand.js` / `xh_label.js` / `xh_timer.js` /
  `xh_lorastack.js` / `xh_chainprompt.js` / `xh_segment_table.js` / `xh_float_window.js` /
  `xh_video_timeline.js`；备份后缀统一 `*.全家族收口前_20261106_0630.bak`。
- `node --check` 8/8 过；`Temp/xh_full_coverage_probe.mjs` **25/25**（含「全包零 >270 宽度残留」
  「其它 61 个 js 无自定义 header 样式」「加载路径/87 节点/Vue 开关」硬证据断言）。
- 只动前端 js + 文档 + 备份；**VERSION 仍 1.45.1**，后端 / 存档格式 / 87 个节点数全没变。
-  **必须重启 ComfyUI（不是只 Ctrl+F5）**：日志显示上次启动是 04:41，晚于它的前端改动要
  重启才会被扩展清单重新收进去。

---

### 13.36  最终版：标题栏交回官方，黄条撤掉（2026-11-06 06:35，前面几版全部作废）
用户原话：「你就不能够恢复到官方的那个宽度吗？标题那个字没有在重心位置它偏下了，被分割了。节点顶部的黄色的条条不要了。」

**根因**：13.33~13.35 往 `.lg-node-header` 上糊的 `padding:4px / font-size:12px /
line-height:16px / min-height:0 / max-height:32px / flex-wrap:nowrap` 才是罪魁 ——
官方 NodeHeader 本来自己算得好好的，我们强行覆盖后标题字被挤到偏下，再被 32px 上限裁切；
`font-weight:700` 本身不改盒模型，是无辜的。顶部 2px 金线横穿标题栏，视觉上把字「分割」了。

**修法（只动 `web/xh_ui_kit.js` + `xh_brand.js` 注释，节点宽度一个数没动）**
1. `installXHFamilyTitleStyle()` 注入的 CSS **只剩两条**：
   `.bg-node-component-header-surface { background-image:none !important }`（压掉黄条）
   + 家族标题字 `font-weight:700 !important`。**一行布局 CSS 都不留** ⇒ 宽高 / 内边距 /
   字号 / 行高 / 对齐全部由官方 NodeHeader 渲染，家族与官方节点排版零差异。
   全局 surface 那条对官方节点是 no-op（官方本来就没背景图），且 `!important` 能压掉
   旧 JS 写进 DOM 的 inline 渐变 ⇒ 不重启也能看不见黄条。
2.  函数去掉「style 存在就 return」：改成 `st.textContent !== XH_TITLE_CSS` 才覆盖。
   否则页面没重启时 head 上挂着**旧版带 padding/max-height 的 style**，改 js 也不生效。
3. `paintVueUnifiedTitle()` 不再画金线，改为清掉自己写过的 inline 渐变（只清 linear-gradient）。
4. `installUnifiedTitleBar()` 旧 canvas 分支删掉 `fillRect(0,-th,w,XH_ACCENT_PX)`，只留小方块。

-  **硬规矩**：以后不许再往 `.lg-node-header` 上写任何布局覆盖。要「跟官方一致」的正解是
  **不写 CSS**，不是「写一版更接近官方的 CSS」。
- 备份 `*.标题恢复官方前_20261106_0635.bak`（10 个文件）；`node --check` 全包 62/62 零错；
  VERSION 仍 **1.45.1**；后端 / 存档 / 87 节点数未变。

## 2026-11-06 同日五追加：XiaoHei-画板节点（1:1 复刻 Paint Pixaroma，v1.45.1 → 1.46.0）
- 用户原话：「我让你复刻到我们XiaoHei 节点里面里啊」——把 Paint 节点做成正经家族节点，不是只留学习档案。
- 来源 `ComfyUI-Pixaroma` v1.4.250（MIT, Copyright (c) 2026 pixaroma）。**抄法 = 1:1 原样 + 只改三类接线标识**：
  ① 前端 `js/paint|shared|framework` → `web/xh_paint|shared|framework`（ComfyUI 递归收 `web/**/*.js`，`.mjs` 仅作被 import 的模块，正好匹配原版分层）；
  ② 扩展名 `Pixaroma.Paint`→`XH.Paint`、类名判断 `PixaromaPaint`→`XHPaint`（否则与本机正版同名冲突）；
  ③ 路由前缀 `/pixaroma/`→`/xh/paint/`（api.mjs 4 条 + framework 1 条）。
- 后端：`paint/py/paint_node.py`（117 行照抄 `node_paint.py`，`PaintWidget` 存 `paint_json` 元数据、`required` 空、`RETURN_TYPES=IMAGE/INT/INT`）+ `paint/py/paint_routes.py`（4 条落盘路由 1:1 抄 `server_routes.py`，前缀改 `/xh/paint/`、落盘 `input/xh_paint/`）+ `_path_guard.py`（553 行安全守卫原样搬）+ `flexible_inputs.py`（只取 `node_ref.py` 前 15 行 `AnyType/any_type/FlexibleOptionalInputType`）。
- `paint/__init__.py` 在包加载时 `register_routes()`，整段 try 包住（路由挂不上不拖垮主包）。
- **补洞**：画板工具栏图标经 `shared/api_url.mjs` 的 `pixAsset()` 走 `/pixaroma/api/asset` → 会 404 秃图标。照抄原版 `serve_pixaroma_asset_q` 加 `/xh/paint/api/asset`（根 `web/xh_paint/assets` + 越界拦截），复制原版 `assets/icons`（212 文件/652K），`pixAsset` 前缀改 `/xh/paint/api/asset`。
- AI 去背景（rembg，需额外模型）按「不引第三方 pip 依赖」铁律明确降级为 `rembgInstalled:false`；画笔/图层/合成/存盘/图标全可用。
- 验证：真实运行时 `import` → `VERSION 1.46.0` / 88 节点 / `XHPaint` 已注册 / 显示名 `XiaoHei-画板` / `CATEGORY XH/Image` / 默认输出 `(1,1024,1024,3),1024,1024`；前端 136 条相对 import 全解析、0 未解析；`xh_paint` 内 0 处 `/pixaroma/api/` 真实调用。
-  运行实例 8188 是 06:48 启动的 v1.45.1 老实例（日志可证），**未加载新节点**；用户需重启 ComfyUI 才能看到 `XiaoHei-画板`。
- 备份：`__init__.py`/`pyproject.toml`/`README.md` 的 `*.加画板节点前_20261106_0705.bak` + 各前端 `*.接线前_20261106_0705.bak`。
