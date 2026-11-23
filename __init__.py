""" Comfyui-XiaoHei —— XiaoHei 节点合集（多包 → 1 个包，125 个节点）

合并历史：
  · 2026-09-22：首轮 9 原包 → 1 包
  · 2026-09-30：追加并入 AudioSep / LoraStack / Slider 三个 XiaoHei 小包
  · 2026-10-02：LoraStack 追加「XiaoHei-纯LoRA堆栈」（只有 MODEL 口，不碰 CLIP），+1 节点
  · 2026-10-04：新增 `xh_utils` 模块（6 节点），替换 ComfyMath / easy-use / Apt_Preset 的
    工具节点（XHMathExpression / XHNumberConvert / XHSamplerSelect / XHSolidMask / XHVAEDecodeTiled）
    `Comfyui-XH_GroupExecutor`（17 节点）按用户要求保持独立，仍未并入。
  · 2026-10-05：新增 `soundboard` 模块（1 节点）：XiaoHei-声音播放 —— 仿社区 pysssss 的 PlaySound，
    但「音效文件」下拉**实时扫描本地音效库** `web/sounds/<分类>/`（提示音 / 音效 / 音乐 / 人声），
    往目录丢音频 + F5 刷新即可选到，**不用重启**。音效库自带 27 个合成音效。
  · 2026-10-14：新增 `msr_relay` 模块（1 节点）：XiaoHei-MSR精修编码 ——
    按「每段自带的时长」把多段提示词贴到视频的不同时间段上（LTX 2.5 二采精修防串味）。
    **算法自持**（不 import 上游 ComfyUI-PromptRelay，零第三方依赖），
    比上游多出：秒→帧自动换算 / 「硬度」六件套内置 / 段长结果用 info 输出可查。
    v1.9.35 面板精简：砍掉「每段秒数」独立框（时长并进分段稿段尾，写 `[3]` / `[3s]` / `[0-3]`）
    与 `h3_frame_snap` 开关（本节点只服务 LTX，H3 帧格与之无关），
    硬度六件套收进前端 （默认收起）⇒ 面板只剩 2 个文本框 + 1 条状态行。
  · 2026-10-16（v1.14.4）：XiaoHei-加载音频 **加实时频谱律动条**（用户原话：「能不能添加一个，
    就是那个节奏动感的那种东西……能随着音频上下动的那个」= 音频频谱可视化）。
    播放器底部 40px 一排 32 根竖条，Web Audio API 的 AnalyserNode 对本节点自己的
    <audio> 实时 FFT，对数分组取峰值画条 + 条顶缓慢下落的峰值帽。
    AudioContext **全图共用一个**（浏览器限量约 6 个）、createMediaElementSource
    每元素只绑一次（二次绑定抛 InvalidStateError）、播放按钮里先 ctx.resume()
    （Chromium 自动播放策略：无手势不出声）、rAF 播放起 / 暂停·结束·错误·删节点停。
    零新增依赖（浏览器内置 API）。**纯前端改动，刷新即生效。**
     实测教训：canvas 写 height:100% 会被 flex 自动高度链解析到 HTML 默认属性高
    150px，把播放器撑到 163px、widget 锁高名存实亡 ⇒ canvas 高度必须定死 px。
  · 2026-10-28（v1.27.1）：** 顶栏三颗按钮统一成同一套样式（用户实机截图报错）**——
    用户原话：「那个工作流的那个图标，它怎么不是黄色呀，能不能统一起来呀？跟那个问号一样，
    会变化成黄色。哎，XiaoHei 也是。要跟那个问号要达成同样的效果，风格要一致，同样效果」。
     **根因 = 三处各写各的 CSS，还抢同一个 style id**：
      · xh_settings_panel.js   → `<style id="xh-tb-btn-css">` 打开态 = 淡紫 `#afa3db`
      · xh_workflow_browser_v12.js → `<style id="xh-tb-btn-css">` 打开态 = 主色黄（**被挤掉了**）
      · xh_help_browser.js     → `<style id="xh-help-browser-css">` 打开态 = 淡黄底 + 黄图标
      web/ 下按字母序加载 ⇒ 设置面板那份**先注入**，工作流那份 `getElementById` 命中直接 return
      ⇒ 工作流按钮和 XiaoHei 按钮显示**淡紫**，只有问号是黄的 —— 三颗三种颜色三种风格。
     **修法**：样式真源搬到 `xh_ui_kit.js` 的 `ensureToolbarButtonCSS()`（**整个页面只注一次**），
      三颗按钮共用同一个 class `.xh-tb` + 同一个打开态 class `.xh-tb-open`
      （新增 `makeToolbarButton()` / `setToolbarButtonOpen()` 两个共享件）⇒ 结构上不可能再分叉。
     颜色规范（**三颗完全一致**）：
      常态 = 深紫底 `#211927` + 浅色字 `#ddd`；
      **悬停 = 实心家族黄底 `#f2ff59` + 深墨字 `#100c13`**（WCAG 自动算，亮黄⇒深墨）；
      打开 = 同一套黄。
       为什么不是「淡黄底 + 黄字」：黄 14% 混透明叠深紫底出来是**暗绿褐 `#3f4124`**，
      根本不像黄（实测）⇒ 改实心黄底才是真黄。
     选择器必须带 `.comfyui-button` 前缀 + `:not(:disabled)`：官方 hover 规则
      `.comfyui-button:not(:disabled):hover`（权重 0,3,0）带 !important，会压过 `.xh-tb:hover`（0,2,0）
      ⇒ 悬停根本不生效；改用 `.comfyui-button.xh-tb:hover:not(:disabled)`（0,4,0）才稳赢。
     连带修正文案：设置面板顶栏开关名「顶栏『灯泡』」→**「顶栏『问号』」**（图标早换成官方圆圈问号了），
      帮助页「快捷键与面板入口」条目同步改成实际的三颗按钮。
     实测（三颗逐一点开 + 悬停）：常态 bg 一致 `rgb(33,25,39)`、高 31px、
      悬停/打开 bg 一致 `rgb(242,255,89)` + 字 `rgb(0,0,0)`、图标同步变深墨；三面板功能均正常。
  · 2026-10-28（v1.27.0）：** 修两处用户实机报的问题**——
    ① **「 加到画布」后指南浮窗不再消失，节点落在浮窗左侧**（用户：「这个指南界面直接也消失了，
       不要让它消失…这个节点正好在这个指南界面的左侧」）。
       ⇒ 删掉 `close()`；新增 **屏幕坐标 ⇄ 画布坐标**换算 + **三级贴边策略**：
       **左侧**（首选）→ **右侧**（左边放不下）→ **浮窗外的空白区**（都不行）。
        坐标公式**实测校准**（之前用 `ds.offset` 是错的）：
       `screen = (world - visible_area[0]) * scale + canvasRect.left`
       ⇒ 逆变换 `world = (screen - canvasRect.left)/scale + visible_area[0]`；
       且 `visible_area` 是**对象**、`scale` 是**数字**、要减 `canvasRect.top`（顶栏 16px）。
        节点的**真实渲染宽度 ≠ `node.size[0]`**（Vue 下被内容撑大）⇒ 加完拿到真实宽度再校正。
    ② ** 「全关 / 全开」黄底白字看不清**（用户报「分组控制节点你看一下，看不清」）：
       根因 = **`BAR_COLORS.PRIMARY_TX` 被我改回白色了** —— 上一轮从备份恢复 kit 时，
       重放的换色脚本只含「六位色值映射表」，而 `PRIMARY_TX: "#ffffff"` → `"#100c13"`
       是**手工改**的、不在表里 ⇒ 漏了 ⇒ 全包所有 primary 按钮都变成黄底白字。
       ⇒ 已修回 `#100c13`，并**把这条规则写进 `apply_comfy_purple.py`**（重放不会再漏）。
  · 2026-10-28（v1.26.0）：** 灯泡 → 官方圆圈问号 + 首次开窗提速 + 黄底白字清零**——
    ① **手绘灯泡彻底废弃，改用官方 `lucide--circle-help`**（用户：「官方有没有灯泡的图标？
       我们那个图标太垃圾了…官方如果没有干脆就不要了，换成官方圆圈里一个问号的图标」）。
        查证结论：**官方 comfy-- 自建图标集 82 个里没有灯泡；官方 lucide 集里也没有 lightbulb**
       （只有 sun/zap），但**有 `lucide--circle-help`**（官方 credits 信息按钮就在用）⇒ 原版照抄。
       ⇒ kit 里 `lampIconHTML` → **`helpIconHTML`**，旧灯泡 SVG 整个删掉。
    ② **打开态别把图标"撤掉"**：之前是「实心黄底 + 变色图标」⇒ 小尺寸下像消失了。
       ⇒ 改成 **淡黄底 + 主色描边 + 图标本身是主色** ⇒ 打开时图标清清楚楚还在。
    ③  **第一次点灯很慢**（用户：「得等个几秒钟，之后再点就快了」）：
       实测根因 = `/object_info` 是 **7.6 MB / 3542 个节点**，后端每次现场生成、**无 cache 头**
       ⇒ 每次 fetch **2.9 秒**；而 `open()` 里 `await buildIndex()` **卡住了窗口显示**。
       ⇒ 三级加速：**localStorage 缓存**（只存 XiaoHei 的 100 个）+ **页面加载后台预热** +
       **open() 不再 await**（窗口秒出，内容后到）。实测开窗 **2900ms → 99~270ms**。
    ④  **黄底白字清零**（用户：「有些他还没改过来」）：上一轮只扫了「同行匹配」，
       漏掉 **JS 里动态设置**的 —— 节点齿轮（`color:#fff` + 黄底）和工作流浏览器 logo 方块。
       ⇒ 齿轮字色改深墨 `#100c13`；logo 用 `var(--xh-on-primary)`。
  · 2026-10-28（v1.25.0）：** 修 6 处用户实机报的问题**（帮助浏览器 / 工作流浏览器细节）——
    ① **「 加到画布」点了看不见**（用户报「无效」）：根因**不是没建出来** ——
       节点建在固定坐标 [160,160]，**正好被帮助浮窗（860×680）盖住** ⇒ 用户看不见 ⇒ 以为无效；
       且失败分支用 `alert()`，**Electron 禁了 alert** ⇒ 连报错都收不到。
       ⇒ 修：① 放到**画布中心**（照官方 `getCanvasCenter()` 算法）；② 加完**自动关浮窗**；
         ③ 失败改用家族 toast。
    ② **帮助浏览器窗口标题「 XiaoHei」→ 灯泡图标**（用户：「扳手图标应该换成灯泡儿了」）。
    ③ **节点详情页全是空的**（用户报「没有内容」）：根因 = `HELP_DEFS` 为空 **且没用节点的 description**
       ⇒ 后端每个节点的 description 里本来就写好了中文说明（【干什么】/【怎么配】…）⇒ 直接拿来用，
       100 个节点**全部有内容**；HELP_DEFS 只作覆盖/补充。
    ④ **「XiaoHei 指南」分组移到首页下面第一个**（用户：「放在首页下面第一个会比较合适」）。
    ⑤ ** 灯泡在黄底上看不清**（用户：「整个灯泡有亮度都看不出来」）：根因 = 原 SVG 是**纯描边**
       （fill:none, stroke-width 2）⇒ 16px 下细线 + 同色系底 ⇒ 融掉。
       ⇒ 改：**灯罩实心填充** + 描边加粗到 2.2~2.6 ⇒ 普通态浅灰灯、打开态黄底黑灯，都一眼认得出。
    ⑥ **工作流浏览器字号按钮「A A A」→「小 中 大」**（用户：「我想换中文字。大大大」）。
    ⑦  顺手清掉**全包 6 处 `alert()`**（节点导航器 4 处 + 工作流浏览器 2 处）——
       Electron 禁用原生 alert ⇒ 这些错误提示用户**永远收不到**。
       ⇒ 新增 kit 共享件 **`xhToast(msg)`**（底部浮字，2.6 秒自动消失），三处统一使用。
  · 2026-10-28（v1.24.0）：** 修两个真 bug：对比度 + 重命名没反应**（用户实机报）——
    ① **对比度**：换色后「主色实心底 + 白字」还剩 10 处漏网（工作流浏览器分段控件「三列表」
       就是黄底白字，看不清）。⇒ 新增 `xh_ui_kit.js` 的 **`pickOnColor(bgHex)`**（WCAG 自动选黑/白，
       两个都不合格时用官方墨色 `#100c13`），并在主题应用时算出两个 CSS 变量：
       `--xh-on-primary`（实心底上的字色）/ `--xh-on-primary-dim`（主色**稀释 15~32%** 当底时的字色）。
       10 处硬编码 `#fff` 全部改成引用变量 ⇒ **一处算、全家自动跟随**。
        稀释底必须另算：黄稀释 32% 后底色变深，白字反而更好看 ⇒ 不能一刀切。
    ② **「重命名」点了没反应**：根因 = **ComfyUI 桌面版是 Electron，禁用了 `window.prompt`**。
       ⇒ 重命名改成**行内输入框**（详情面板里文件名原地变输入框，回车确认 / Esc 取消 / 失焦也确认）。
    ③  **同类坑全清了**：工作流浏览器里还有 4 处原生弹窗（新建文件夹 / 删除确认 / 另存为 /
       存到哪个文件夹）同样是坏的 ⇒ 新增 **`web/xh_ask.js`**（家族通用模态框 `XHAsk.text` / `XHAsk.confirm`，
       深紫底 + Comfy 黄主按钮，Esc/遮罩点击 = 取消），全部替换。
       ⇒ **全包 `window.prompt` / `window.confirm` / `window.alert` 归零**。
  · 2026-10-28（v1.23.0）：** 全家族换 Comfy 官方深紫 + Comfy 黄**（用户拍板「深紫底 + Comfy 黄」）——
    ① **色板真源 = Comfy 官方设计令牌**（从 Comfy Desktop `app.asar` 里挖出来的）：
       `--color-neutral-950 #100c13` / `-900 #19131d` / `-800 #211927` / `-700 #2c2533` /
       `-600 #37303f` / `-500 #534d57` / `-300 #8a8688` / `-200 #a6a2a1` / `-100 #c2bfb9` /
       `--color-neutral-50 #f2ff59`（Comfy 黄 = 徽标同款）/ `--brand-accent #f5c518` /
       `--accent-plum #afa3db` / `--accent-primary #0b8ce9` / `--danger #e05858`。
       旧主色 `#1668b3`（青蓝）**官方色板里根本没有**，是我们自己发明的 ⇒ 全部换掉。
    ② 换色范围：`web/` 下 **28 个 js**（含 `BAR_COLORS` 真源、各面板 THEMES、散落的硬编码色值）。
    ③  **黄底必须配深字**：旧配色是「青蓝底 + 白字」，直接换底色会变成「黄底白字」几乎看不见
       ⇒ `PRIMARY_TX` 改官方墨色 `#100c13`，并全包扫「黄底 + 白字」清零。
    ④  **auto 主题判定改跟官方主题，不跟操作系统**：官方用 `<html class="dark-theme">`，
       旧代码 auto 走 `prefers-color-scheme`（系统偏好）⇒ 用户系统浅色 + ComfyUI 深色 ⇒ 面板跑成
       浅色、深紫底根本没生效。现在判定优先级 = 官方 html class > 官方 body class > `--bg-color` 亮度 > 系统兜底，
       并用 MutationObserver 监听官方主题变化自动重画。
    ⑤ 设置面板：**「顶栏按钮」组移到面板最顶部**；三项名字与顶栏实际显示对齐
       （`顶栏「XH」` / `顶栏「工作流」图标` / `顶栏「灯泡」`，旧的「 设置」「XiaoHei 工作流」「? 帮助」全对不上号）；
       面板标题去掉齿轮 emoji。
    ⑥ 帮助浏览器版本号**不再硬编码**（之前写死 v1.17.7，实际包已到 1.22.0，每版都忘改）
       ⇒ 改从后端 `/xh/about` 动态取，取不到显示「—」。
    ⑦ 顺手删掉 `web/_xh_node_style_generated.js`（生成脚本的中间产物，残留在 web/ 下会被
       ComfyUI 自动加载 ⇒ 跟正式文件**重复注册同一个扩展**）。
  · 2026-10-28（v1.22.0）：**顶栏三个按钮重新分工**（用户：「齿轮图标我想换成XH，原本XiaoHei 那个其实是工作流浏览器的，
      你帮我推荐几个我选，原作者直接是W可做参考」→ 又补一刀：「w跟原作者重复了，再想想」
      → 最后定：「这是官方的图案，官方已经有图案了，我们直接抄官方的图案」）——
    ① **设置按钮： 齿轮 → 「XH」文字**（家族门面，独占；齿轮是通用符号、而且 Pixaroma 顶栏也有齿轮，
       两包同装分不清谁是谁）。
    ② **工作流浏览器按钮：「XH」文字 → 官方「工作流」图标**（斜排三节点连线）。
       **原版照抄**：从 ComfyUI 前端 `static/assets/main-*.css` 里 `.icon-[comfy--workflow]` 的
       `--svg` data URI 解码出来的官方 SVG（viewBox 0 0 16 16，描边 1.3），一字未改。
    ③ 帮助按钮维持**灯泡**（v1.21.0）。
    ④ W 这个字母**弃用**（Pixaroma 已占，两包同装顶栏并排两个 W 认不出谁是谁）。
    ⑤ `xh_ui_kit.js` 图标机制**泛化**：`ensureIconCSS(svg, cls)` + `iconFromSVG(svg, cls)`，
       灯泡只是其中之一；以后任何图标都能用同一套写法（mask + currentColor，形状来自 SVG）。
  · 2026-10-28（v1.21.0）：** 问号/笑脸 → 灯泡**（用户原话：「我们不叫问号，不用这个问号的图像，
      我们用灯泡…我不想用那个 EMOJI」「而之前我们的是这个笑脸儿，把这个笑脸儿换成灯泡儿」
      「这个灯泡就是来说明的，这个灯泡有里面有各种节点的说明啊，也包括其他的说明」）——
    ① `xh_ui_kit.js` 新增**家族共享灯泡图标**：`XH_LAMP_SVG` + `ensureLampCSS()` + `lampIconHTML()`。
       图形 = 手绘**描边**灯泡（圆肚 + 灯丝底座两横 + 顶部三道光线），CSS mask + currentColor
       ⇒ 颜色跟随按钮、跟顶栏其它线性图标风格一致；**不是 emoji**（emoji 跨平台渲染不可控）。
    ② 顶栏帮助按钮：** 笑脸 → 灯泡**（`xh_help_browser.js`）。
    ③ 节点配色面板 footer 的 **「?」→ 灯泡**，点击**跳到帮助浏览器的「节点配色」专题页**
       （`window.XHHelp.openTopic("colors")`）—— 和 Pixaroma 的 ? 按钮（openHelpFor 跳帮助）一个路子。
    ④ 帮助浏览器新增 **专题页（TOPICS）**：非节点的说明单独归到「XiaoHei 指南」分组，
       已加「节点配色」「快捷键与面板入口」两页；专题页不显示「 加到画布」。
    ⑤  两个真踩的坑（已沉淀 skill frontend_n2.md §21）：
        **CSS mask 的 data URI 必须整体 encodeURIComponent**：SVG 里有空格，
          `url()` 会在第一个空格处截断 ⇒ mask 失效、图标变成**一个白方块**。
        **SVG 源码里必须用双引号**：encodeURIComponent **不转义单引号**，
          而 CSS 的 `url('…')` 用单引号包裹 ⇒ SVG 里的裸单引号提前闭合 CSS 字符串 ⇒ mask 整条作废。
        插if块时别把上一行（`const row = …`）覆盖掉 ⇒ 运行期 ReferenceError（.mjs 检查也发现不了这种）。
  · 2026-10-28（v1.20.0）：** 节点配色面板整份照搬 Pixaroma 原版**（用户怒批「你抄了个毛啊」）——
      用户原话：「人家原作者右键点击下拉框调这个调色板的时候，出来的那调色板能够随便的拖拽，
        随便的移动，我们怎么这个整个画面都固定住了」「我们的调色板这么简陋呢」
        「你直接把原作者的给一个复制粘贴过来，学都学不会吗？只要改改中文不就行了吗」
    ① 本轮 v1.19.0 那个**简化弹窗作废**（自己写的 48 色格 + 固定居中 + 不能拖），
       改成**原版整份搬运**：用脚本 `WorkBuddy/2026-10-07-14-28-14/build_xh_node_colors.py`
       从 Pixaroma 源码里按行提取 `js/node_colors/index.js` + `js/shared/color_picker.mjs`，
       只改三处：英文文案→中文、class 前缀 `pix-`→`xh-`（两包同装不打架）、品牌橙→XiaoHei 主蓝。
    ② 原版面板要素**全部保留**：可拖动浮窗（按标题栏拖，pointer capture）
       + 大号 SV 平面（300px）+ 竖直色相条 + **标题栏/节点体 双色分段**
       + **双 HEX 色号条**（点色块复制色号）+ **联动链条按钮**
       + **收藏夹 15 槽**（点 + 存 / 点套用 / 右键删除）
       + **45 格双色预设网格** + 中文帮助浮层 + 恢复默认配色。
    ③ 面板对**任何节点**开放（官方节点同样能配）；多选一次改一批。
    ④ 快捷键：原版的**单个反斜杠**已被 Pixaroma 占用（两包同装会报 Keybinding already exists）
       ⇒ XiaoHei 改用 **Shift+反斜杠**，走官方 keybinding 系统，可在设置里改键。
    ⑤ 踩坑记录（已沉淀 skill frontend_n2.md）：
        搬运时**漏改 CSS 段与外壳代码的 class 前缀** ⇒ JS 建 `xh-nc-*`、样式却是 `.pix-nc-*`
          ⇒ 样式全丢（面板像没样式）。搬完必须全局 grep `pix-` 归零。
        `node --check` 对 **.js 文件里的 ESM 语法不报错**（假绿）；
          要 `cp x.mjs /tmp/x.mjs && node --check /tmp/x.mjs` 才能拿到真实行号。
        python 按 `"];"` 切数组会**丢掉结束符** ⇒ 后面整段解析崩。
  · 2026-10-28（v1.19.0）：**节点配色大改版 —— 删掉节点上的  键，改用 Pixaroma 式完整画板**——
      用户原话：「节点每一个节点上面的一个配色功能键现在多余了，没必要存在了，删掉吧」
      「Pix 的这个点击节点右键下拉框节点配色，不仅仅可以对自家的节点进行配色，
        官方的节点它也可以进行配色，其他的节点都可以进行配色」
    ①  **删掉节点工具条上的  配色键**（`makeXHToolbar` 只剩「中/EN」）。
       `makeColorBtn` 一并删除；返回值保留 `colorBtn: null` 字段（老调用方解构不崩）。
        `showXHPicker` **保留**（XHLabel 的文字色/背景色、形状遮罩填充色还在用它）。
    ②  新增 `web/xh_color_picker.js`：完整画板（移植 Pixaroma `js/shared/color_picker.mjs` 1075 行，
       砍掉紧凑弹窗/More-colors 模态/按钮安全色板/群组色）：
       **48 色板**（Pixaroma 36 色 + XiaoHei 家族 12 色，正好 4 行 × 12 列）+ **SV 平面** + **色相条**
       + **HEX 输入**。自绘 canvas，不用原生 <input type=color>（原生会弹系统窗盖住别的 UI）。
    ③  右键菜单的「 节点配色」改成**模态画板**：Title / Body 双色分段切换
       +「联动」开关（节点体色 = 标题栏色的暗色变体）+ 多选一次改一批。
       **对任何节点开放** —— 官方节点（KSampler 等）右键同样能配、选中时工具条同样出按钮。
    ④ 「恢复默认配色」：XiaoHei 节点回**分类默认色**（自动配色重新铺一遍），
       官方节点回主题默认色。 Nodes 2.0 的 color/bgcolor 是响应式 accessor，
       **必须赋 undefined**（`delete` 会把 accessor 本身删掉 ⇒ 颜色此后静默失效）。
    ⑤ XHLabel 暴露 `setNodeColor(hex)`：它自带颜色管理（`_refresh` 会重写 color/bgcolor），
       外部改色必须走这个入口，否则会被下一次刷新覆盖回 transparent。
  · 2026-10-28（v1.18.0）：**学 Pixaroma 包，前端补 5 件套**（纯前端，零 Python 改动、零新依赖）——
    ①  `web/xh_brand.js` —— **全家族自动配色**：官方 `beforeRegisterNodeDef` 钩子按
       `CATEGORY` 前缀「XH」自动给节点上色（10 个分类各一个色系：工具石板灰 / 图像天蓝 /
       视频靛蓝 / SetGet 咖啡棕 / 音频品红 / 音频工具青绿 / 链提示词草绿 / 数学番茄红 /
       身份橄榄 / 音频分离紫），**新增节点自动继承**，不用再逐个写。
       守卫 `if (!this.color)`：工作流存档色、用户自己选的色**永远优先**；
       标题字按底色自动切纯黑/纯白（真机实测对比度 4.79 / 5.70，WCAG AA 达标）。
       设置项：XiaoHei → 外观 →「节点配色」= 按分类 / 统一色 / 关闭。
    ②  `web/xh_graph_changed.js` —— **变更捕获网**：DOM 控件在 `click` 里提交，
       而 ComfyUI 的 ChangeTracker 是 **mouseup** 时抓快照 ⇒ 晚一拍 ⇒ 这次改动谁都没记
       （工作流不标脏、Ctrl+Z 撤不掉、下次打开静默回退）。
       捕获阶段被动监听 + 120ms 防抖 + 加载路径门禁，只认 XiaoHei 自己的界面。
       真机实测：点一次控件 → `captureCanvasState` 被调用 1 次、`isModified` 变 true。
    ③  `web/xh_undo_remount.js` —— **Ctrl+Z 后 DOM 控件重挂**：Nodes 2.0 下
       撤销 = `loadGraphData` 重建节点对象，Vue 的 WidgetDOM 只在 onMounted 挂 element
       ⇒ 页面留着旧 element 绑死对象（Pixaroma 实测 81 个控件里 70 个变死）。
       真机实测：把控件摘出页面 → 重挂 → 原位复活。
       同时提供 `isGraphLoading()` 门禁（工作流加载期间绝不标脏）。
    ④  `web/xh_node_style.js` —— **右键菜单 + 选区工具条**：XiaoHei 节点右键多 4 项
       （节点配色 / 复制颜色 / 粘贴颜色 / 恢复默认配色），选中节点时浮动工具条多一个调色板按钮
       （官方 `getSelectionToolboxCommands` 钩子 + `getNodeMenuItems` 新 API，老前端自动不显示不报错）。
    ⑤  `web/xh_zz_topbar_visibility.js` —— **顶栏按钮开关**：设置里可藏「 设置 / XiaoHei 工作流 /
       ? 帮助」三个顶栏按钮。**藏用 CSS（body class）而不是 un-mount** ——
       每个按钮都是各自轮询等 `app.menu.settingsGroup` 出现才挂上去的，
       un-mount 要跟重试定时器赛跑；CSS 反转是即时的。**藏按钮 ≠ 关功能**（快捷键照常）。
        2026-10-29 勘误（用户发现「外观」掉最底后翻前端源码实证）：顺序是**两套规则**，
       以前写的「官方面板倒着显示、谁最后注册谁在顶」只在**组内**成立，组间完全不是这么回事。
         · **组间**（关于/外观/连线）：按组内 `sortOrder` 的**最大值降序**，相等才按组名拼音升序。
           ⇒ 跟注册先后、跟文件名**无关**。拼音这条很坑：外观(wai) > 连线(lian)，
           不写 sortOrder 的话外观永远压在连线后面 —— 改文件名一点用都没有。
            现在在 `xh_about.js` 里定 `window.XH_GROUP_ORDER = {about:100, appearance:90, links:0}`，
           同组每项写同一个值（组间取最大值、组内又按它降序，混着写会把组劈成两截）。
         · **组内**：同 sortOrder 时是稳定排序，而 `flattenTree` 用 `stack.pop()` 取出来是倒的
           ⇒ **最后注册的显示在最前**。文件名 `xh_zz_` 前缀（最后加载）影响的就是这个，仍需保留。
        `xh_animated_links.js` 的 SETTING_DEFS 数组仍是**倒序**写法（组内规则）：
       想让某项显示在最顶，就把它写在数组**最后**。
        三个开关的 category 第三级**必须各自唯一**（= 该项名字）：三个共用一个
       叶子节点时，官方面板 buildTree 会互相覆盖 ⇒ 只剩最后一个显示。
    ⑥ 顺手修一处既有硬伤：`xh_video_tools.js` 的 DOM 控件没锁高（Vue 下节点上下留大白、
       拖高空白等比变大）⇒ 补 `lockDomWidgetHeight(w, 26)`，`xh_dom_height_check.py` 归零。
  · 2026-10-20（v1.16.0）：**UI 家族统一 + 加载视频拖动轴 + 悬浮窗 + 关于徽章**——
      ① 家族 UI 单一真源 `web/xh_ui_kit.js`：按钮四档配色（中性/主色/危险红/幽灵）、
         齿轮折叠（方案 B 空心细线 Material 图标）、可读性反色计算，**全家族节点统一**。
      ② XiaoHei-加载视频 **加拖动轴（剪映双手柄）**：轴上选哪段，预览播放器就只循环播哪段；
         按下手柄自动暂停、松手恢复；拖动参数端口被上游接管时整轴自动禁用（防白拖+假显示）。
      ③ 新增 `float_window` 模块：悬浮窗（任意窗口 / 多窗口并存 / 每窗独立控制 / 尺寸与不透明度可调）。
      ④ 设置面板新增「关于」徽章（官方 B 站链接 + 版本号走后端 `/xh/about`，版本单一真源 = 本文件 VERSION）。
      ⑤ 修 bug：提示词列表切回文本框后「调用顺序」残留、分组节点「全部颜色」下拉无色块（改自绘弹层）、
         提示词「清空」会误恢复旧内容。
  · 2026-10-24（v1.17.3）：`image_tools` 新增 **XiaoHei-视频对比**（XHCompareVideos）——
       复刻 comfyui-easy-media 的 Compare Videos 并多路化：≤4 路视频网格同步播 / 单看 / 两两滑块；
       三路来源（source 口 + output 口 + 「 选择文件」三目录扫盘多选）汇成有序池去重保序；
       差值信息条列每路 fps/帧数/时长及相对第 1 路差值；⇄ 互换按钮纯前端换序。
       零新增依赖：VIDEO 元数据走官方 VideoInput getter（get_stream_source/get_duration/
       get_frame_rate/get_frame_count），不用 ffprobe；扫盘路由 /xh/videocompare/files。
  · 2026-10-24（v1.17.2）：**XiaoHei-H3 latent接续 默认改“硬锁”接缝**（修段头动作节奏翻车）——
       对照导演台 TimelineDirector 源码（minimax_h3_finite_segments.py:613 gradient=False）：
       ① 新增 `hard_lock` 控件（BOOLEAN，默认开=硬锁，追加在 INPUT_TYPES required 最末尾，老存档按 positional 自动取新默认）；
       ② execute 的 `gradient=True` 改为 `gradient=not bool(hard_lock)`：硬锁时 overlap 区 noise_mask 全 0（整段 22 帧完全复现上段尾），节奏严格连续；
       ③ 修错误注释：原“gradient=True = 官方默认行为最流畅”是把函数签名默认值错当成 finite 分段行为（导演台 finite 实测用硬锁，演变是实验路径）——漂移根因：穿透区动作逐步重新演绎；
       ④ 对外行为变化：旧工作流加载后自动变硬锁（新默认），连接不用动；想要漂变手动切。
  · 2026-10-23（v1.17.1）：**XiaoHei-H3 latent接续 去掉 GPL 依赖**（XHH3LatentContinuation 行为不变）——
      初版为图省事在运行期 `import` 了 ComfyUI-MiniMaxH3-TimelineDirector 的两个纯函数，
      而该插件及其上游 ethanfel/ComfyUI-MiniMaxH3-Contex-Loop 均为 **GPL-3.0**：
      ① 运行时 import 会把许可传染带进 XiaoHei 包的分发物；② 没装导演台的机器直接不可用。
      现按同一接口契约与数值语义**净室重写**（网格对齐 / 重叠搬运 / noise_mask /
      Drift-Control 调度全自研），只用 ComfyUI 官方公开 API：
      NestedTensor、FRAME_PER_TOKEN、set_model_denoise_mask_function、
      add_wrapper_with_key(WrappersMP.APPLY_MODEL)。
      节点类名/显示名/参数/默认值/返回值**一字未改** ⇒ 已存工作流零影响；
      与原版逐值等价验收 98 项全过（网格 27 / 搬运 3 形态 / 帧数边界 5 /
      调度函数 24 / 运行时 mask 15 / wrapper 2 / 错误路径 4 / 其他）。
      官方符号改延迟导入，没装 H3 支持的 ComfyUI 也不会拖垮整包加载。
  · 2026-10-23（v1.17.0）：`controls` 新增 **XiaoHei-H3 动作校正**（XHH3TemporalCorrection）——
      TST（Temporal State Transport，arXiv:2609.08505，**MIT**）推理时注意力校正的
      H3 移植：按帧谱张力 T=H_row-H_vN 诊断「碎裂/过混」，用 gamma=exp(tau_eff·T)
      只缩放视频行 query，双向往中拉。治帧间闪烁、细节跳变、身份漂移、不符合物理的运动。
      MODEL→MODEL 补丁，可配任意采样器（不限于 SelfLift），运行时开销 1-2%。
      **算法按 MIT 论文自研重写**（comfyui-SelfLift 包内的 H3 移植没有 LICENSE，
      不复制其代码）；注入点全走官方 API（add_wrapper_with_key +
      optimized_attention_override，官方先例 nodes_sparse_attention.py:221-226），
      零第三方依赖。诊断日志前缀 [XiaoHei TST]；精确校准探针环境变量 XH_TST_EXACT=1。
  · 2026-10-16（v1.15.0）：XiaoHei-加载音频 **加「 文件夹模式 + 循环轮次索引」**——
      用户原话：「之后我还会加入到我们 XiaoHei 家族的那个循环节点的循环当中……
      需不需要加个索引/序号，或者一个可以从文件夹里调整个文件夹的功能」。
    ① 循环体里死磕单文件 = 每轮读同一个文件，循环无意义 ⇒ 文件夹模式是刚需；
    ② 轮次**零接线**：XiaoHei-循环展开给所有 XiaoHei 节点注入隐藏输入 xh_loop_turn
       （for_loop.py 的 copy.set_input），节点在 hidden 里声明即可收到
       （不声明 = execution.py 静默丢弃，这是本次改动的根因认知）；
    ③ 索引三段论与 XiaoHei-提示词表逐字同构：start_index 有接线以它为准 /
       否则循环体内段号=轮次 / 否则循环体外取第 1 个；loop 开关只管绕回；
    ④ 画布只存路径、execute 才读盘；口径 = filter_files_content_types(["audio","video"])
       （与下拉一致）、自然排序、上限 2000；**每轮只解码选中的那一个文件**；
    ⑤ 单文件模式一字未动，新控件全追加在老控件后（老存档零影响）；
    ⑥ 新增路由 /xh/audiolist/list（只读预览）+ /xh/audioload/file（FileResponse
       流式，带 Range，<audio> seek 可用）；probe 路由扩 path= 参数；
    ⑦  修了一个真 bug：os.path.abspath("") = 服务器 cwd 而非空串 ⇒
       空路径会绕过校验去扫整个 ComfyUI 根目录，判空必须先判原串。
  · 2026-10-16（v1.15.1）：XiaoHei-加载音频 **加「普通 / 循环模式折叠」**——
      用户原话：「这一个加载音频的节点变得特别太大了……搞一个选项按钮，
      一个普通模式一个循环模式，普通模式下节点比较小」。
    ① 工具栏加 / 模式切换钮：普通模式只剩 音频下拉+播放器+信息条
       （293px，折叠前 405px）；循环模式展开四件套（365px）；
    ② 模式状态不单独存：由 source 值推导（单文件=普通、文件夹=循环）⇒
       老存档读进来默认小节点，新档自动记住模式，零新增控件、零存档结构变动；
    ③ source 下拉两种模式都隐藏（模式钮取代它，值仍正常存档）；
    ④  实锤：Vue Nodes 模式下 computeSize=[0,0] 对原生控件**完全无效**
       （Vue 用自己的 DOM 布局，节点实测 405px 纹丝不动），隐藏原生控件行
       唯一有效开关 = **w.hidden**（仅对无输入端口的控件安全）——与 DOM widget
       的「视觉隐藏四件套」是两套机制，别混用；
    ⑤ / 按钮图标化：工具条 5 按钮总宽 282 > bar 246 会换行撑乱 ⇒
       图标 + tooltip 后一行放下；flash 反馈仍显示文字、2.5s 后复原图标；
    ⑥ 顺手修一个真 bug：只认 source 拉列表时「手动粘贴文件夹路径」不刷预览
       ⇒ audio_folder 一改也拉列表（与  按钮同一条链路）。
  · 2026-10-16（v1.15.2）：XiaoHei-加载音频 **加「 手动清单」+ 音频列表区**——
      用户原话：「循环模式不是分两种吗？一种是自己自主的添加音频……第二种就是
      选择的是同一个文件夹里的那些音频」（照 XiaoHei-图片列表抄交互）。
    ① source 三选一：单文件 /  文件夹 /  手动清单；循环模式下俩列表共用
       一块**音频列表区**（序号徽章 + 文件名 + ✕，限高 132px 内部滚动）；
    ② 手动清单：「 加音频」多选任意文件夹的文件 → 逐个**上传进 input 目录**
       并记文件名（原文件挪走也不丢）；拖着改顺序（HTML5 dnd + splice，与
       图片列表同款）、✕ 删单个、「清空」点两次才真清；
    ③ 序号徽章金/银/铜/蓝 = #e6b800/#9aa7b3/#cd7f32/#3a7bd5（图片列表逐字一致）；
    ④  修一个真 bug（存档错位一格）：官方 LGraphNode.configure 遇到空串
       **会跳过一位** ⇒ ["a","","清单JSON",2,true] 被它填成 audio_folder=清单JSON、
       audio_list=2。前端 fixSavedValues 绝不能 filter 空值，必须连空槽一起按
       原下标对齐才能纠正官方填歪的那一轮；
    ⑤ 模式切换钮换琥珀 #EF9F27（旧紫 #7c5cbf 太闷，用户点名要对比更强）；
    ⑥ 工具条按模式只显示 5 颗（手动 = 加音频+清空 换下 上传+），bar 246px 不换行。
  · 2026-10-16（v1.15.6）：XiaoHei-加载视频 **懒加载（只取音频不再爆内存）**——
    根因：ComfyUI 跑节点时会把整个 load_video 都执行、所有输出都算出来，即便下游
    只接 audio 口，IMAGE 批也会在音频之前堆出来 → 大视频必 OOM。修法：给节点注入
    `dynprompt`/`unique_id`（INPUT_TYPES 顶层 hidden={'dynprompt':'DYNPROMPT',
    'unique_id':'UNIQUE_ID'}，execution.py 经典路径 221-228 行会填），扫全图判断
    images 口（slot 0）有没有被下游接走；没人接就**跳过逐帧解码**，只吐音频（images
    返 1 帧零占位图，frame_count 走元数据估算）。探测失败一律保守照常解码，绝不误跳。
  · 2026-10-16（v1.15.5）：XiaoHei-加载视频 **内存保护**——用户加载 1080p/212s 长视频
    （586082402-1-208.mp4，全量 fp32 ≈158GB）直接 MemoryError 崩在 `_iter_frames`
    第 145 行的 np.array 分配。现把「逐帧循环」与「np.stack 拼批」都 try 住
    MemoryError，转成中文 ValueError 提示「视频太大，请把『帧数上限』设有限值（100~300）
    或在『自定义宽/高』缩小尺寸」，不再甩看不懂的 traceback。功能逻辑/输出不变。
  · 2026-10-16（v1.15.4）：XiaoHei-加载视频 补第 4 个输出口 **video（VIDEO）**——
    用户实测连不上官方「获取视频元素」（GetVideoComponents 输入是 VIDEO 类型，
    本节点原先只有 IMAGE/INT/AUDIO 三口）。机制与官方 LoadVideo 同源：
    `InputImpl.VideoFromFile(路径)` 原始文件直通，零转码零损失，位深/色彩空间真值；
     该口不受抽帧/缩放/帧数上限影响（那些参数只管 images/audio）；函数内 import
    comfy_api，失败只打日志返回空，不拖垮图像/音频两口；追加在末位不串老档连线。
  · 2026-10-16（v1.15.3）：XiaoHei-加载音频 **频谱贴底**——用户原话：「拖拽让节点变大的
    时候，只有下面的空白在变大……我希望那个波浪节奏跟着一起变化，贴合底部」。
    真机实锤（8199 无头三实验）：Vue 行高只在首帧读 computeSize（运行期换函数不理）；
    直接改 DOM 不被踩回；正解 = widgets 网格 flex:1 + 播放器行轨道 minmax(89px,1fr)。
    ① 频谱区改弹性主区（trackHit 0 0 auto / specWrap flex:1），节点拖高 ⇒ 波形区
       吃掉全部新增高度、信息条钉底，零空白；自然高度仍 89/40px 一字不变；
    ②  canvas 是替换元素：top/bottom 拉伸无效、auto 高落 HTML 默认 150 ⇒ 必须
       绝对定位 + calc(100%-18px)/(100%-6px) 显式尺寸，斩断「150px 撑胖播放器」循环；
    ③ applyStretch 底版模板按行数分档捕获（播放器行强制记 89，绝不照抄 computed 里
       自己拉伸过的残影），RO（拖大缩小）+ MO（Vue 重渲染踩掉内联）+ 250ms 限时重试
       三重兜底；onRemoved 全部 disconnect。
  · 2026-10-16：`controls` 新增 **XiaoHei-加载音频**（XHLoadAudio），+1 节点（71）——
      用户原话：「官方的加载音频节点用着特别不方便，尤其是下面那条线（进度条）
      太细了，拖拽都不方便」。复刻官方 Load Audio：解码内核（f32_pcm + load）用脚本
      从 comfy_extras/nodes_audio.py 原文切出，**输出逐字一致可直接互换**；
      正主是前端自绘播放器：**粗时间线（10px 轨道 + 16px 圆形拖把手，按住拖动
      实时 seek、点击跳转）** + 播放/暂停 + 时间显示 + 音量静音切换与滑块 +
      信息条（时长/采样率/声道，走 /xh/audioload/probe 路由）+ 上传/拖拽。
      零新增依赖（av 为 ComfyUI 官方自带，函数内 import，缺了只废本节点）。
  · 2026-10-14（v1.9.36，**纯前端**）：修掉家族多个节点「工具条 / 状态条上下各留一大块空白、
    节点拖得越大空白越大」的老毛病（用户三轮反馈）。根因（comfyui_frontend 1.55.14 源码实证）：
    Vue Nodes（Nodes 2.0）把控件渲染成 CSS Grid，行高按 `shouldExpand(type) || hasLayoutSize`
    判 `auto`，而 `hasLayoutSize = typeof widget.computeLayoutSize === "function"`，
    DOM widget 的**基类自带** computeLayoutSize ⇒ 每个 DOM 控件行都是 `auto`，
    节点多余的竖向空间被平摊灌进去；**只写 computeSize 对 Vue 无效**（Vue 不看它）。
    新增 kit 的 `lockDomWidgetHeight(widget, px)`：定死 computeSize + 抹掉 computeLayoutSize
    ⇒ 行变 `min-content` 不再吃空间，多余空间只给文本框等真正的可生长控件（与官方节点一致）。
    已应用：工具条（全家族，kit 内）· MSR 状态行 · 提示词联结 工具条/状态行 · SetGet 通道行/工具条 ·
    分辨率预览条 · 种子按钮条/状态条 · 布尔开关轨 · 视频加载 播放器/信息条。
  · 2026-10-15（v1.9.39）：`setget` **标题 & 命名精简**（照 KJ 的 Set/Get 对齐）——
      · 单路标题改成 **`设置_<名字>`**（KJ 同款 `Set_66` 格式）：**去掉 XiaoHei- 前缀、去掉 (类型) 后缀**；
        名称空 ⇒ 只显示「设置」；类型改由端口颜色 + 端口标签表达。
      · 节点显示名精简：XiaoHei-设置→`设置`、XiaoHei-获取→`获取`、XiaoHei-多路设置→`多路设置`、XiaoHei-多路获取→`多路获取`。
        旧节点标题用 LEGACY_TITLES 兜底自动迁移，重启即刷新。
      · 附带修复（用户截图报的）：
        ① 在名称框打字标题不跟着变 → 现在实时联动；
        ② 单路端口点是灰的 → 新前端(Vue Nodes)只按槽位 `type` 上色（不看 `slot.color`），
           改为把端口 `type/name` 设成真实类型（断开复位通配 `*`），端口点即跟随连线颜色。
  · 2026-10-15（v1.9.38）：`setget` **内核重写 + 补齐单路**（2 节点 → 4 节点）——
      · 旧内核是**结构性失效**的：XHMultiSet/XHMultiGet 是 isVirtualNode 虚拟节点，
        数据通路却写在 `onExecute()` 里写 `window.XH_SETGET` 全局表。而虚拟节点**永不执行**
        （官方 `graphToPrompt` 里 `if(isVirtualNode) continue`）⇒ onExecute 永不触发，表永远空。
      · 新内核改用**官方前端的虚拟节点解析钩子**（与 KJNodes 的 SetNode/GetNode 同源）：
        出图时官方对每个虚拟节点输出口依次问 `resolveVirtualOutput(slot)`（跨子图）
        → 否则 `getInputLink(slot)`（同图），把链路**直接接到真正的源节点**上。
        实证：`comfyui_frontend 1.55.14` 的 `ExecutableNodeDTO.resolveOutput` 原文即此顺序。
      · **补齐单路**：`XHSet`（显示名「设置」，1 进 + 1 透传出）/ `XHGet`（显示名「获取」，1 出）。
      · **与 KJ 互通**：XiaoHei 的获取端查找配对时同时认 KJNodes 的 `SetNode`（只在查找里比对
        type，**一行 KJ 源码都不改**）⇒「KJ 那边 Set，XiaoHei 这边 Get 也能取到」。
        反向（KJ 的 GetNode 取 XiaoHei 的 Set）必须改 KJ，按用户要求不做。
      · 保留原有 UI：动态通道行 + 点/框/线三同色 + 中英切换 +  工具条；
        新增连线自动命名（通道名还是默认名时借用上游口名，并自动去重 _2/_3）。
  · 2026-10-15（v1.9.37）：`image_tools` 新增 **2 节点（XiaoHei 原创）**，用于替代第三方包 ComfyUI-RMBG
    （该包在本机 import 失败：缺 hydra 等依赖 + 包自身 __init__ 报错 bug）——
      · XiaoHei-去背景 (XHBackgroundRemove)：走 **ComfyUI 官方 BiRefNet 内核**
        （comfy.bg_removal_model），输出①透明背景 RGBA②前景遮罩；可选掩码羽化/偏移/反转。
        等价于官方「Remove Background → Invert Mask → Join Image with Alpha」串联链路。
        **端口对齐第三方 `RMBG`（image 进、IMAGE 出），工作流可零改线顶替。**
        权重放 models/background_removal/（birefnet.safetensors，官方 Comfy-Org/BiRefNet）。
      · XiaoHei-图像对比拼图 (XHImageCompare)：最多 3 图横向并排 + 标题栏，**端口对齐
        第三方 `AILab_ImageCompare`**。纯 PIL，零新增依赖。

各子模块（数字 = 实际注册进 NODE_CLASS_MAPPINGS 的节点数，2026-10-14 实跑统计过，
不是估的）：

    memsaver/         ← Comfyui-XH_H3MemorySaver      3 节点  图像精度 / 落盘 / 读取
    image_tools/      ← Comfyui-XH_ImageTools        15 节点  按比例缩放 / 图像缩放v2 / 图像批量合并 / 取帧范围 /
                                                              图片列表 / 图像按序取 / 参考图拼接板 /
                                                              图像遮罩缩放 / 图像尺寸 / 合成并保存视频 / 视频拼接 /
                                                              加载视频（v1.9.33：复刻 VHS Load Video，
                                                              零新增依赖，带上传按钮+拖拽+信息条+内嵌播放器
                                                              +一键折叠高级参数+▶预览总开关）
                                                              去背景（v1.9.37：官方 BiRefNet 内核，
                                                              输出透明 RGBA + 遮罩，端口对齐第三方 RMBG）
                                                              图像对比拼图（v1.9.37：最多 3 图并排+标题栏，
                                                              端口对齐第三方 AILab_ImageCompare）
    h3ltx_adapter/    ← XiaoHei-H3LTX-Adapter              2 节点  H3LTX-适配器加载 / 转换
    ltx_identity/     ← Comfyui-XH_LTXIdentity        1 节点  XiaoHei-LTX锁脸
    seam_feather/     ← XiaoHei-SeamFeather                1 节点  XiaoHei-衔接淡化
    seam_correct/     ← XiaoHei-接缝修正                 1 节点  算法照搬
                                                              ComfyUI_MinimaxH3_AutoContext（Apache-2.0）
    chain_prompt/     ← XiaoHei-ChainPrompt                2 节点  XiaoHei-提示词表 / XiaoHei-提示词联结(动态)
    controls/         ← XH_GroupController 等         24 节点  循环开始/结束 / 分组控制 / 标签 / 计时器 /
                                                              LoopIteration·Progress·Result / 整数运算 /
                                                              浮点运算 / 数字计数器 / 分段表 / 色调补偿 /
                                                              分辨率选择器 / 种子 / 显示文本 / 音乐卡点表 /
                                                              加载音频（复刻官方 Load Audio，输出可互换，
                                                              前端粗时间线播放器：10px 轨道 + 16px 拖把手）/
                                                              H3 latent接续 / H3 动作校正（TST）
    audiosep/         ← ComfyUI-XH_AudioSep           4 节点  人声分离(加载/采样) / 音频取时长 / 简易数学
    lorastack/        ← Comfyui-XH_LoraStack          2 节点  XiaoHei-LoRA堆栈 / XiaoHei-纯LoRA堆栈
    slider/           ← Comfyui-XH_Slider             1 节点  XiaoHei-滑块
    setget/           ← XiaoHei Set/Get（v1.9.38 重写）       4 节点  设置 / 获取 /
                                                              多路设置 / 多路获取
                                                              （前端 registerCustomNodes 虚拟节点接管 +
                                                               Python noop 占位进 NODE_CLASS_MAPPINGS 供 object_info 搜索；
                                                               走官方 resolveVirtualOutput / getInputLink 钩子，
                                                               与 KJNodes Set/Get 同一套机制 ⇒ 互通，零改 KJ）
    xh_utils/         ← XiaoHei 工具扩展（2026-10-04）      8 节点  XiaoHei-表达式求值 / XiaoHei-数值转换 /
                                                              XiaoHei-采样器选择 / XiaoHei-实心遮罩 / XiaoHei-平铺VAE解码 / XiaoHei-形状遮罩覆盖 /
                                                              XiaoHei-万能遮罩 / XiaoHei-区域限定框
                                                              （替换 ComfyMath / easy-use / Apt_Preset 的对应工具节点）
    soundboard/       ← 声音播放（2026-10-05）         1 节点  XiaoHei-声音播放（跑完响一声；音效库 = web/sounds/）
    storyboard/       ← 宫格故事板（2026-10-09）       3 节点  XiaoHei-宫格底板 / XiaoHei-图像对比度 / XiaoHei-宫格切图
                                                                    （XiaoHei 复刻社区包 ComfyUI-Storyboard-Tools，
                                                                      核心算法一致，多出 cell_mask / info /
                                                                      brightness / strength / order / panel_count）
    camangle/          ← 机位描述（2026-10-11）          1 节点  XiaoHei-机位描述
                                                                    （角度→中英文镜头词，照 ComfyUI 官方 CameraAngle 逻辑，
                                                                       给 H3 / 文生图提示词当镜头语言；零依赖）
                                                                       v1.7.2：+官方同款可拖拽 3D 预览球（widgetType=
                                                                       CAMERA_ANGLE_VIEW 白嫖官方控件）+可选 image 贴图
                                                                       +下拉框中英双语（getOptionLabel，存值不动）
    caminfo/           ← 相机参数（2026-10-11）          1 节点  XiaoHei-相机参数
                                                                    （造 camera_info 接官方 3D 节点；orbit/look_at 双模式、
                                                                       全中文、砍四元数、统一 zoom 语义；纯 Python 零依赖）
                                                                       v1.7.2：+官方同款可拖拽 3D 预览球（yaw/pitch 隐藏别名
                                                                       桥接同步）+下拉框中英双语
    controls/          ← XiaoHei-布尔开关 / XiaoHei-切换（2026-10-09）
                                                              2 节点  官方 Boolean + 「切换 BETA」的家族版：
                                                                      用官方 Boolean.Input 的 label_on/label_off
                                                                      把机翻的「为真实/为假实」改成「开/关」；
                                                                      界面＝**一行**：左右滑动的滑块，
                                                                      右=开（绿）/ 左=关（红）
    msr_relay/         ← MSR 精修编码（2026-10-14）      1 节点  XiaoHei-MSR精修编码
                                                                    （分段稿每段末尾写时长，
                                                                      给 LTX 2.5 二采精修防串味。
                                                                      算法自持、零第三方依赖：
                                                                      不 import 上游 ComfyUI-PromptRelay；
                                                                      多出秒→帧换算、硬度六件套内置、
                                                                      段长 info 可查。面板只剩 2 个
                                                                      文本框 + 1 条状态行，其余 7 个
                                                                      参数收进 ）
                                                                    ── 共 71 个

合并原则（重要，改这个包之前先读）：
  · **class_type 一个都没改** → 已存工作流全部照常识别，零迁移成本
  · 各子模块内部**保持原样**：它们原有的相对导入（如 `from .py.xxx import`、
    `from .nodes import`、`from .h3ltx import`）因为原来是「包根 → 子目录」、
    现在是「子包根 → 子目录」，层级完全没变，所以**一行都不用改**
  · 前端 js 全部汇到顶层 `js/`（全包唯一 `WEB_DIRECTORY`；原为 `web/`，1.0.2 起改名）。
    它们内部的 `import { app } from "../../scripts/app.js"` 依赖「js 位于
    /extensions/<包名>/ 下一层」这个基准 —— 包名换了但层数没变，同样不用改
  · 旧包整份留底在 桌面\\AI创作产出\\备份_20260922\\合并前_6原包\\，可随时回滚

 容错加载（2026-10-05 改造，为「分发给别人、别人拿到就能用」）：
  · 23 个子模块**逐个 try 导入** → 缺依赖只少对应模块，不再整包阵亡；
    缺哪个包、装完要重启，启动日志末尾会直接写清楚（含可照抄的 pip 命令）。
  · 分发用依赖清单 = 包内 `requirements.txt`（硬依赖 3 个：
    opencv-python / scenedetect / rotary-embedding-torch），
    ComfyUI-Manager 启动时会自动读取并提示安装。
  · 「哪个子模块依赖哪个包」的实测对照表见 README §5。
  · 2026-10-30（v1.35.0）：新增 XiaoHei-H3音频同步（`controls/audio_h3_sync.py`，1 节点）——
    把真音轨锁进 MiniMax H3 latent 的声音那一半，让嘴型对上你的歌（H3 画面和声音是
    一起生成的，事后盖音轨没用）。机制 = 官方 NestedTensor + noise_mask（画面 1、声音 0），
    在**波形**上对齐再编码（给音频 latent 补 0 不是静音，会解出嗡嗡声）。
    算法照搬 ComfyUI-Pixaroma（MIT，Copyright (c) 2026 pixaroma），数字口径一字未改
    （帧格 17n+5 / 24fps / 音频 latent 40fps，全部读自官方 nodes_minimax_h3.py）；
    XiaoHei 改动：三个偏好从「全局设置面板」改成**节点上的下拉**（看得见、能存档、跟着工作流走），
    状态条读数与提示改中文，前端加家族工具条 + 中/EN。
  · 2026-11-08（v1.51.0）：新增 `openh3` 模块（**8 节点**）—— H3 2K 精修链（Open-H3 Regenerate 2K）。
    复刻 ComfyUI-OpenH3-VideoTools（Tensor Alchemist, GPL-3.0）的 5 个节点：
    视频预处理（CFR24/几何对齐/抽音轨）、提示词编码（编完卸载 32B 编码器）、
    精修总控（内部串 UNETLoader→模型补丁→Kitchen/KJ 补丁→分块→BasicGuider→SamplerCustomAdvanced，
    跑完把整条模型链踢出显存）、低内存解码（返回缓冲降 fp16，中间精度不动）、
    分块扩散（每个去噪步切块跑 DiT 再按高斯/均匀权重混合）。
    同时把 ComfyUI-OpenH3-Regenerate2K（Songssx, MIT）的 3 个节点**自持**进来：
    模型补丁（主 LoRA 312 模块 + 50 条 Sharp 调度曲线）、官方步长、锁定音频。
     **为什么要自持**：原版精修总控内部硬查这 3 个节点的 ID，查不到直接 RuntimeError
    拒绝启动。搬进来后，外部那两个包**完全不装也能跑**。
     **依赖状况**：核心全在官方 ComfyUI；`imageio-ffmpeg` 是 pip 包（顶层 requirements 已声明，
    Manager 自动提示）；**KJNodes 是可选的** —— 有就多两层低显存补丁（8GB 强烈建议装），
    没有就**跳过这两层仍可运行**，只是峰值显存更高（启动日志会点名说明）。
    改动：① 默认参数按 8GB 降配（head_chunks 4→6、ff_chunks 4、分块 1024×768→512×512、
    重叠 256→128）；② 主 LoRA / Sharp 曲线的查找放宽到**递归子目录**（原版只查 loras 根目录，
    用户把文件丢进 loras/H3/ 就选不到）；③ 缺 KJ 节点时降级跳过而非直接报错。

 改这个文件时注意：新增子模块必须同样用 try 包住，否则等于把整包重新绑上炸药。
"""

# ---------------------------------------------------------------------------
#  包版本号（统一来源：与 pyproject.toml 的 version 保持一致）
#    分发 / 压缩命名规范：Comfyui-XiaoHei_v{主}.{次}.{修}_{YYYYMMDD}.zip
#    改完节点包后升级对应位，再重新压缩，文件名版本号才对得上。
# ---------------------------------------------------------------------------
VERSION = "1.0.7"  # 移除分镜/画板/去背景节点里指向第三方的下载链接，模型获取地址改由发布者自行告知

# ---------------------------------------------------------------------------
#  子模块加载：逐个 try，缺谁只少谁（2026-10-05 改造，为「分发给别人」而做）
# ---------------------------------------------------------------------------
# 为什么不能继续裸 import：125 个节点分在 23 个子模块里，子模块各自要 import
# 第三方包（cv2 / scenedetect / rotary_embedding_torch / torchaudio …）。
# 裸 import 时，别人**少装任意一个包** → 整包 import 失败 → 界面上一个节点都没有，
# 日志里只有一行 "Cannot import ..."，用户完全不知道缺什么、怎么修。
# 逐个 try 之后：缺 cv2 就只少「XiaoHei-接缝修正」那 1 个节点，其余 56 个照常可用；
# 日志里直接给出「缺哪个包 + 照抄就能用的 pip 命令」。
# 依赖清单同步写在包内 requirements.txt，ComfyUI-Manager 会自动读取并安装。
#
# 设计约束（改这里之前先读）：
#   · 只打日志、绝不 re-raise —— 单个子模块的问题不允许拖垮整包
#   · _PARTS 的顺序 = 节点注册顺序，加载失败的（空映射）自动跳过，不占位
#   · deps 写法 (import 名, pip 名)；pip 名写 None 表示 PyPI 上没有正式包，只给说明

import os as _os
import sys as _sys

_PY = _sys.executable or "python"          # 当前在跑的 python（ComfyUI 的 venv）
_HERE = _os.path.dirname(_os.path.abspath(__file__))
_LOAD_FAILED = []                          # [(子模块名, 用途, [pip 包], 异常摘要)]


# ComfyUI 官方 requirements.txt 里本来就有的包 —— 别人机器上必然存在。
# 它们要是也缺，那是 ComfyUI 本身坏了，不是本包的事；所以**不写进安装提示**，
# 免得提示里出现 torch 把用户吓到（以为要重装 torch）。
_CORE = {"torch", "numpy", "safetensors", "Pillow", "einops", "aiohttp"}


# ---------------------------------------------------------------------------
#  依赖自检（只检查、只提示，绝不运行时装包）
# ---------------------------------------------------------------------------
# Comfy Registry 安全标准（docs.comfy.org/registry/standards）明确禁止
# 自定义节点在运行时通过 subprocess 安装依赖。依赖必须统一声明在
# requirements.txt / pyproject.toml，由 ComfyUI-Manager 集中安装。
# 这里只做「缺哪些 + 给一条能照抄的 pip 命令」，不执行任何安装。
# 缺包时对应子模块会被 _fail 跳过，其余节点照常可用，整包不会阵亡。
_AUTO_DEPS = (
    ("cv2", "opencv-python", "接缝校正 / 锁脸"),
    ("scenedetect", "scenedetect", "接缝校正·场景切分"),
    ("rotary_embedding_torch", "rotary-embedding-torch", "人声分离"),
    ("imageio_ffmpeg", "imageio-ffmpeg", "H3视频预处理"),
)


def _check_deps():
    """启动自检：缺包只打日志，不自动安装（Comfy Registry 合规要求）。"""
    import importlib.util
    missing = []
    for imp, pip_name, usage in _AUTO_DEPS:
        try:
            if importlib.util.find_spec(imp) is None:
                missing.append((pip_name, usage))
        except Exception:
            missing.append((pip_name, usage))
    if not missing:
        return
    pkgs = [p for p, _ in missing]
    print(f"[XiaoHei]  依赖自检：缺 {len(pkgs)} 个 → {', '.join(pkgs)}")
    for _p, _u in missing:
        print(f"[XiaoHei]      · {_p}（{_u}）")
    print("[XiaoHei]     缺这些包只影响对应节点，其余节点照常可用。")
    print(f"[XiaoHei]     请手动补一次：\"{_PY}\" -m pip install {' '.join(pkgs)}")
    print(f"[XiaoHei]     或整包装：\"{_PY}\" -m pip install -r "
          f"\"{_os.path.join(_HERE, 'requirements.txt')}\"")
    print("[XiaoHei]     装完重启 ComfyUI 即生效；装了 ComfyUI-Manager 的话它会自动装好。")


_check_deps()



def _fail(mod, usage, deps, err):
    """记录一个子模块的加载失败：只打日志，绝不外抛。"""
    top = (getattr(err, "name", "") or "").split(".")[0]
    if top:
        # 报错点名的那一个排最前（最可能的原因）；同模块的其余「非核心」依赖跟在后面 ——
        # 一次装全，别让用户装一个试一次（缺 cv2 和 scenedetect 都只影响同一模块）
        hit = ([(i, p) for i, p in deps if i == top]
               + [(i, p) for i, p in deps if i != top and i not in _CORE])
    else:
        hit = list(deps)
    pips = [p for _, p in hit if p]
    soft = [i for i, p in hit if not p]
    _LOAD_FAILED.append((mod, usage, pips, f"{type(err).__name__}: {err}"))
    print(f"[XiaoHei]  子模块 {mod} 加载失败（{usage}）→ 只缺这部分节点，其余照常")
    print(f"[XiaoHei]     原因：{type(err).__name__}: {err}")
    if pips:
        print(f"[XiaoHei]     修复：\"{_PY}\" -m pip install {' '.join(pips)}")
        if "torchaudio" in pips:
            print("[XiaoHei]     注意：torchaudio 建议按 PyTorch 官网指引装与 torch 匹配的版本，"
                  "直接 pip install 可能连带重装 torch。")
    if soft:
        print(f"[XiaoHei]     可选：{', '.join(soft)} 在 PyPI 上没有正式包，需从官方渠道获取"
              "（不装则该模块的对应功能不可用）。")


try:
    from .nodes.memsaver import (
        NODE_CLASS_MAPPINGS as _M_MEM,
        NODE_DISPLAY_NAME_MAPPINGS as _D_MEM,
    )
except Exception as _e:
    _fail("memsaver", "图像精度 / 落盘 / 读取",
          [("torch", "torch"), ("safetensors", "safetensors")], _e)
    _M_MEM = _D_MEM = {}

try:
    from .nodes.image_tools import (
        NODE_CLASS_MAPPINGS as _M_IMG,
        NODE_DISPLAY_NAME_MAPPINGS as _D_IMG,
    )
except Exception as _e:
    _fail("image_tools", "图像缩放 / 批量合并 / 取帧 / 拼接板 / 遮罩缩放 / 图像尺寸",
          [("PIL", "Pillow"), ("nvvfx", None)], _e)
    _M_IMG = _D_IMG = {}

try:
    from .nodes.h3ltx_adapter import (
        NODE_CLASS_MAPPINGS as _M_ADP,
        NODE_DISPLAY_NAME_MAPPINGS as _D_ADP,
    )
except Exception as _e:
    _fail("h3ltx_adapter", "H3→LTX 适配器",
          [("torch", "torch"), ("safetensors", "safetensors")], _e)
    _M_ADP = _D_ADP = {}

try:
    from .nodes.ltx_identity import (
        NODE_CLASS_MAPPINGS as _M_ID,
        NODE_DISPLAY_NAME_MAPPINGS as _D_ID,
    )
except Exception as _e:
    _fail("ltx_identity", "LTX 锁脸",
          [("PIL", "Pillow"), ("cv2", "opencv-python"), ("insightface", "insightface")], _e)
    _M_ID = _D_ID = {}

try:
    from .nodes.seam_feather import (
        NODE_CLASS_MAPPINGS as _M_SEAM,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SEAM,
    )
except Exception as _e:
    _fail("seam_feather", "衔接淡化", [("torch", "torch")], _e)
    _M_SEAM = _D_SEAM = {}

try:
    from .nodes.chain_prompt import (
        NODE_CLASS_MAPPINGS as _M_CHAIN,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CHAIN,
    )
except Exception as _e:
    _fail("chain_prompt", "提示词表", [], _e)
    _M_CHAIN = _D_CHAIN = {}

try:
    from .nodes.controls import (
        NODE_CLASS_MAPPINGS as _M_CTRL,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CTRL,
    )
except Exception as _e:
    _fail("controls", "循环 / 分组控制 / 标签 / 计时器 / 分段表 / 分辨率选择器 / 显示文本",
          [("aiohttp", "aiohttp"), ("torch", "torch")], _e)
    _M_CTRL = _D_CTRL = {}

try:
    from .nodes.audiosep import (
        NODE_CLASS_MAPPINGS as _M_AUD,
        NODE_DISPLAY_NAME_MAPPINGS as _D_AUD,
    )
except Exception as _e:
    _fail("audiosep", "人声分离",
          [("torch", "torch"), ("torchaudio", "torchaudio"), ("einops", "einops"),
           ("rotary_embedding_torch", "rotary-embedding-torch")], _e)
    _M_AUD = _D_AUD = {}

try:
    from .nodes.lorastack import (
        NODE_CLASS_MAPPINGS as _M_LRS,
        NODE_DISPLAY_NAME_MAPPINGS as _D_LRS,
    )
except Exception as _e:
    _fail("lorastack", "LoRA 堆栈", [("aiohttp", "aiohttp")], _e)
    _M_LRS = _D_LRS = {}

try:
    from .nodes.slider import (
        NODE_CLASS_MAPPINGS as _M_SLD,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SLD,
    )
except Exception as _e:
    _fail("slider", "滑块", [], _e)
    _M_SLD = _D_SLD = {}

try:
    from .nodes.setget import (
        NODE_CLASS_MAPPINGS as _M_SG,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SG,
    )
except Exception as _e:
    _fail("setget", "多路 Set/Get", [], _e)
    _M_SG = _D_SG = {}

try:
    from .nodes.xh_utils import (
        NODE_CLASS_MAPPINGS as _M_UTIL,
        NODE_DISPLAY_NAME_MAPPINGS as _D_UTIL,
    )
except Exception as _e:
    _fail("xh_utils", "表达式求值 / 数值转换 / 采样器选择 / 实心遮罩 / 平铺VAE解码",
          [("torch", "torch")], _e)
    _M_UTIL = _D_UTIL = {}

try:
    from .nodes.seam_correct import (
        NODE_CLASS_MAPPINGS as _M_SCOR,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SCOR,
    )
except Exception as _e:
    _fail("seam_correct", "接缝修正",
          [("cv2", "opencv-python"), ("scenedetect", "scenedetect")], _e)
    _M_SCOR = _D_SCOR = {}

try:
    from .nodes.soundboard import (
        NODE_CLASS_MAPPINGS as _M_SND,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SND,
    )
except Exception as _e:
    _fail("soundboard", "声音播放", [], _e)
    _M_SND = _D_SND = {}

try:
    from .nodes.storyboard import (
        NODE_CLASS_MAPPINGS as _M_SB,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SB,
    )
except Exception as _e:
    _fail("storyboard", "宫格底板 / 图像对比度 / 宫格切图", [("torch", "torch")], _e)
    _M_SB = _D_SB = {}

try:
    from .nodes.camangle import (
        NODE_CLASS_MAPPINGS as _M_CAM,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CAM,
    )
except Exception as _e:
    _fail("camangle", "机位描述 / 相机角度提示词", [], _e)
    _M_CAM = _D_CAM = {}

try:
    from .nodes.caminfo import (
        NODE_CLASS_MAPPINGS as _M_CAMINFO,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CAMINFO,
    )
except Exception as _e:
    _fail("caminfo", "相机参数 / camera_info 生成", [], _e)
    _M_CAMINFO = _D_CAMINFO = {}

try:
    from .nodes.msr_relay import (
        NODE_CLASS_MAPPINGS as _M_MSR,
        NODE_DISPLAY_NAME_MAPPINGS as _D_MSR,
    )
except Exception as _e:
    _fail("msr_relay", "MSR 精修编码（按秒贴分段提示词）", [("torch", "torch")], _e)
    _M_MSR = _D_MSR = {}

try:
    from .nodes.paint import (
        NODE_CLASS_MAPPINGS as _M_PAINT,
        NODE_DISPLAY_NAME_MAPPINGS as _D_PAINT,
    )
except Exception as _e:
    _fail("paint", "画板（1:1 复刻 Paint Pixaroma）", [("torch", "torch")], _e)
    _M_PAINT = _D_PAINT = {}

# 2026-11-18：1:1 深度复刻 ComfyUI-Pixaroma 的 InpaintCrop + InpaintStitch（MIT 署名保留）。
#   两节点共享私有类型 XH_CROP_INFO，前端遮罩编辑器 5 模块在 js/xh_inpaint/，
#   后端落盘路由 /xh/inpaint/api/{upload_src,save_mask} → input/xh_inpaint/。
#   算法（裁剪几何 / 遮罩预处理 / 接缝融合 / 颜色匹配）原样照搬，只改家族命名与中文说明。
try:
    from .nodes.inpaint import (
        NODE_CLASS_MAPPINGS as _M_INPAINT,
        NODE_DISPLAY_NAME_MAPPINGS as _D_INPAINT,
    )
except Exception as _e:
    _fail("inpaint", "局部重绘裁剪 + 贴回（1:1 深度复刻 Pixaroma）", [("torch", "torch")], _e)
    _M_INPAINT = _D_INPAINT = {}

# 2026-11-18：1:1 深度复刻 Number Pick Pixaroma（MIT 署名保留）。
#   XHNumberPick 输出 ANY，前端 js/xh_numberpick/ 按接线收窄 INT/FLOAT。
try:
    from .nodes.numberpick import (
        NODE_CLASS_MAPPINGS as _M_NPICK,
        NODE_DISPLAY_NAME_MAPPINGS as _D_NPICK,
    )
except Exception as _e:
    _fail("numberpick", "数字选择（1:1 深度复刻 Pixaroma）", [], _e)
    _M_NPICK = _D_NPICK = {}

# 2026-11-18：1:1 深度复刻 Load Image Mini + Load Image（MIT 署名保留）。
#   XHLoadImageMini 是工作流 3/4/5/6/7 用的轻量加载器；它依赖整条共享链，
#   已连同 XHLoadImage 一起搬进 nodes/loadimage/，前端在 js/xh_load_image*/。
try:
    from .nodes.loadimage import (
        NODE_CLASS_MAPPINGS as _M_LIMG,
        NODE_DISPLAY_NAME_MAPPINGS as _D_LIMG,
    )
except Exception as _e:
    _fail("loadimage", "轻量加载图片 + 加载图片（1:1 深度复刻 Pixaroma）", [("torch", "torch")], _e)
    _M_LIMG = _D_LIMG = {}

# 2026-11-18：1:1 深度复刻 Info Pixaroma（MIT 署名保留）。
#   XHInfo 是纯前端说明按钮（note 富文本套件在 js/xh_note/），不参与出图。
try:
    from .nodes.xhinfo.node_info import (
        NODE_CLASS_MAPPINGS as _M_INFO,
        NODE_DISPLAY_NAME_MAPPINGS as _D_INFO,
    )
except Exception as _e:
    _fail("xhinfo", "说明按钮（1:1 深度复刻 Pixaroma）", [], _e)
    _M_INFO = _D_INFO = {}

# 2026-11-18：1:1 深度复刻 Save Image Pixaroma（MIT 署名保留）。
#   XHSaveImage 保存到任意文件夹 + 文件名 token + 「另存现在」，7 个工作流都用。
try:
    from .nodes.xhsaveimage import (
        NODE_CLASS_MAPPINGS as _M_SAVE,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SAVE,
    )
except Exception as _e:
    _fail("xhsaveimage", "保存图片（1:1 深度复刻 Pixaroma）", [("torch", "torch")], _e)
    _M_SAVE = _D_SAVE = {}

# 2026-11-18：1:1 深度复刻 Sketch Pixaroma（MIT 署名保留）。
#   XHSketch 在图上画框/写字出 image+prompt+mask，工作流 6 用；输出与小黑画板不同，必须独立节点。
try:
    from .nodes.xhsketch import (
        NODE_CLASS_MAPPINGS as _M_SKETCH,
        NODE_DISPLAY_NAME_MAPPINGS as _D_SKETCH,
    )
except Exception as _e:
    _fail("xhsketch", "标注（1:1 深度复刻 Pixaroma）", [("torch", "torch")], _e)
    _M_SKETCH = _D_SKETCH = {}

# 2026-11-08：1:1 复刻来源项目（MIT）。整包物理拷贝进 wepenerd/，
#   逻辑/界面/英文原版文案一字未改，只换了 class_type 前缀 XH_、路由前缀 /xh/wn/、
#   前端子目录 web/xh_wepenerd/。class_type 全部带 XH_ 前缀 ⇒ 与原版同装不抢注册。
#   原包两个 Qwen 对齐模块顶层 import scipy（本机 .venv 已装 1.18.0）；
#   wepenerd/__init__.py 内已逐个 try 隔离，缺 scipy 只少那几个节点，H3 Ripple 主链路照常。
try:
    from .nodes.wepenerd import (
        NODE_CLASS_MAPPINGS as _M_WN,
        NODE_DISPLAY_NAME_MAPPINGS as _D_WN,
    )
except Exception as _e:
    _fail("wepenerd", "H3 改帧传播 / 加载视频 / 保存视频 / VAE 去网格",
          [("av", "av"), ("scipy", "scipy")], _e)
    _M_WN = _D_WN = {}

# 2026-11-08：1:1 复刻 ComfyUI-Pixaroma / Label Pixaroma（MIT）。
#   前端三件套原样搬进 web/xh_label_pix/，逻辑与 CSS 数值一字未改，
#   只换接线（XHLabelPix / xh-lbl- / XH.LabelPix）+ 界面文案全量中文。
#   与自家 XiaoHei-标签（XHLabel）并存，老工作流存档零影响。
try:
    from .nodes.label_pix import (
        NODE_CLASS_MAPPINGS as _M_LP,
        NODE_DISPLAY_NAME_MAPPINGS as _D_LP,
    )
except Exception as _e:
    _fail("label_pix", "XiaoHei-浮字标签（1:1 复刻 Label Pixaroma）", [], _e)
    _M_LP = _D_LP = {}

# 2026-11-12：1:1 学 ComfyUI-Pixaroma 的「Prompt + Tag Library」（MIT）。
#   标签库 = 一个 JSON 存进未注册的 ComfyUI 设置项（不在插件目录、不进工作流）；
#   节点脸上的齿轮 → 右侧浮动设置窗口，骨架复用本包 web/shared/node_panel.mjs。
#   界面全中文、配色只取官方 CSS 变量、图案走自有图标库；class_type = XH_TagPrompt。
try:
    from .nodes.tag_prompt import (
        NODE_CLASS_MAPPINGS as _M_TAG,
        NODE_DISPLAY_NAME_MAPPINGS as _D_TAG,
    )
except Exception as _e:
    _fail("tag_prompt", "XiaoHei-标签提示词（复刻 Prompt / Tag Library）", [], _e)
    _M_TAG = _D_TAG = {}

# 2026-11-12：1:1 复刻 ComfyUI-Pixaroma 的 Prompt Stack（MIT, Copyright (c) 2026 pixaroma）。
#   一行一行写提示词、每行能开关、拖左侧把手换顺序，齿轮窗口里用四个小方片选分隔符；
#   状态存 node.properties.xhStackState，点「运行」时由前端注入隐藏输入 XHStackState，
#   后端只按顺序拼接。界面全中文、配色只取官方 CSS 变量、图案走自有图标库；
#   class_type = XH_PromptStack，显示名 XiaoHei-提示词堆叠。
try:
    from .nodes.prompt_stack import (
        NODE_CLASS_MAPPINGS as _M_PS,
        NODE_DISPLAY_NAME_MAPPINGS as _D_PS,
    )
except Exception as _e:
    _fail("prompt_stack", "XiaoHei-提示词堆叠（复刻 Prompt Stack）", [], _e)
    _M_PS = _D_PS = {}

# 2026-11-15：1:1 复刻 ComfyUI-Pixaroma 的 Prompt Pack（MIT, Copyright (c) 2026 pixaroma）。
#   一整块提示词粘进来，三颗小方片选分隔方式，点「运行」一条提示词排队跑一次工作流；
#   状态存 node.properties.xhPackState，前端注入隐藏输入 XHPromptPackState，
#   后端只把当前这一轮那条原样输出。界面全中文、配色只取官方 CSS 变量、
#   图案走自有图标库；resize 下限一律常量，DOM 不反向决定 node.size。
#   class_type = XH_PromptPack，显示名 XiaoHei-提示词批量。
try:
    from .nodes.prompt_pack import (
        NODE_CLASS_MAPPINGS as _M_PP,
        NODE_DISPLAY_NAME_MAPPINGS as _D_PP,
    )
except Exception as _e:
    _fail("prompt_pack", "XiaoHei-提示词批量（复刻 Prompt Pack）", [], _e)
    _M_PP = _D_PP = {}

# 2026-11-16：1:1 复刻 ComfyUI-Pixaroma 的 AudioReact Pixaroma（MIT）——
#   单张图片跟随音频律动生成视频。纯 torch FFT 引擎（15 动态模式 / 8 叠加），
#   零新增依赖；WebGL2 全屏编辑器。状态存 node.properties.audioStudioState，
#   前端在 graphToPrompt 注入隐藏输入 XHAudioStudioJson。
#   class_type = XH_AudioStudio，显示名 XiaoHei-图片蹦迪。
#   输入根独立到 input/xiaohei/audio_studio/，与原包 input/pixaroma 不冲突。
try:
    from .nodes.audio_studio import (
        NODE_CLASS_MAPPINGS as _M_AS,
        NODE_DISPLAY_NAME_MAPPINGS as _D_AS,
    )
except Exception as _e:
    _fail("audio_studio", "XiaoHei-图片蹦迪（复刻 AudioReact）", [], _e)
    _M_AS = _D_AS = {}

# 2026-11-08：复刻 ComfyUI-OpenH3-VideoTools（Tensor Alchemist, GPL-3.0）的 5 个节点，
#   并把 ComfyUI-OpenH3-Regenerate2K（Songssx, MIT）的 3 个节点一并**自持**进来。
#   为什么自持：原版「精修总控」内部硬查这 3 个节点的 ID，查不到直接 RuntimeError
#   拒绝启动。搬进本包后，外部那两个包**完全不装也能跑**。
#   依赖状况：核心全在官方 ComfyUI；imageio-ffmpeg 是 pip 包（顶层 requirements 已声明）；
#   KJNodes 是**可选**的 —— 有就多两层低显存补丁（8GB 强烈建议），没有就跳过这两层，
#   仍可运行，只是峰值显存更高（启动日志会点名说明跳过了什么）。
try:
    from .nodes.openh3 import (
        NODE_CLASS_MAPPINGS as _M_OH3,
        NODE_DISPLAY_NAME_MAPPINGS as _D_OH3,
    )
except Exception as _e:
    #  只列**非官方自带**的依赖：torch / av 都是 ComfyUI 官方 requirements 里的，
    #    列进补装提示会让用户以为要重装 torch（可能毁掉别人的 CUDA 环境）。
    _fail("openh3", "XiaoHei-H3精修（Open-H3 Regenerate 2K，8 节点）",
          [("imageio_ffmpeg", "imageio-ffmpeg")], _e)
    _M_OH3 = _D_OH3 = {}

# 2026-11-09：1:1 复刻 ComfyUI-BlueBox（MIT, Copyright (c) 2026 zhoutingxi）
#   的 4 个 Qwen-Image 2.1 零偏移编辑节点，融入 XiaoHei 家族。
#    零新增 pip 依赖：torch / numpy / PIL / torchvision 都是 ComfyUI 官方自带；
#     scipy.ndimage 的 EDT 已换成 cv2.distanceTransform（cv2 是家族存量依赖），
#     15 组用例逐像素实测 0 差异。原包照旧可装，class_type 全改 XiaoHei 前缀，互不干扰。
try:
    from .nodes.qwen21_edit import (
        NODE_CLASS_MAPPINGS as _M_QE,
        NODE_DISPLAY_NAME_MAPPINGS as _D_QE,
    )
except Exception as _e:
    _fail("qwen21_edit", "Qwen21 编辑四件套（4 节点）", [], _e)
    _M_QE = _D_QE = {}

# 小黑·全能角色设定表（复刻 + 优化 H3-Character-Sheet-Designer v1.3，MIT 署名保留）
try:
    from .nodes.charsheet import (
        NODE_CLASS_MAPPINGS as _M_CS,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CS,
    )
except Exception as _e:
    _fail("charsheet", "小黑·全能角色设定表（1 节点）", [], _e)
    _M_CS = _D_CS = {}

# 2026-11-21：1:1 复刻 ComfyUI-Pixaroma 的 Free VRAM Pixaroma（MIT）——
#   在流程的任意位置把显存/模型交还：三档（全部/仅模型/仅缓存）+ 内存条读数 +
#   阈值门 + 每次执行开关。纯决策逻辑在 _free_vram_helpers.py（无 torch 可离线测）；
#   状态存 node.properties.xhFreeVramState，前端排队前注入隐藏输入 XHFreeVramState。
#   界面全中文、接家族语言中枢、配色走官方 CSS 变量 + 主题预设、图案走家族图标库；
#   class_type = XH_FreeVram，显示名「释放显存 XiaoHei」。
try:
    from .nodes.free_vram import (
        NODE_CLASS_MAPPINGS as _M_FV,
        NODE_DISPLAY_NAME_MAPPINGS as _D_FV,
    )
except Exception as _e:
    _fail("free_vram", "释放显存 XiaoHei（1:1 复刻 Free VRAM Pixaroma）", [], _e)
    _M_FV = _D_FV = {}

# 2026-11-22：完整 1:1 复刻 ComfyUI-SceneCut（MIT）——视频自动识别分镜并裁剪导出。
#   12 个 V3 节点整包移植：核心算法 nodes/xh_scenecut/scenecut/ 原样；
#   接线标识 XH_*、路由 /xh_scenecut/*、分类 XiaoHei/分镜、显示名「功能名 XiaoHei」。
#   模型目录 models/scenecut + models/clip_vision 是数据契约（三模型已预下载），沿用不改名。
#   V3 类直接进 NODE_CLASS_MAPPINGS 即可：execution.py / server.py 都按 _ComfyNodeInternal 判定，
#   家族主包无需启用 comfy_entrypoint。
try:
    from .nodes.xh_scenecut import (
        NODE_CLASS_MAPPINGS as _M_XHSC,
        NODE_DISPLAY_NAME_MAPPINGS as _D_XHSC,
    )
except Exception as _e:
    _fail("xh_scenecut", "分镜切分 XiaoHei（12 节点，1:1 复刻 SceneCut）", [], _e)
    _M_XHSC = _D_XHSC = {}

# (子模块名, class 映射, 显示名映射) —— 顺序即注册顺序
# 加载失败的子模块在 except 里被填成 {}，这里直接过滤掉（不占位、不报重名）
_PARTS = tuple(
    _p for _p in (
        ("memsaver", _M_MEM, _D_MEM),
        ("image_tools", _M_IMG, _D_IMG),
        ("h3ltx_adapter", _M_ADP, _D_ADP),
        ("ltx_identity", _M_ID, _D_ID),
        ("seam_feather", _M_SEAM, _D_SEAM),
        ("seam_correct", _M_SCOR, _D_SCOR),
        ("chain_prompt", _M_CHAIN, _D_CHAIN),
        ("controls", _M_CTRL, _D_CTRL),
        ("audiosep", _M_AUD, _D_AUD),
        ("lorastack", _M_LRS, _D_LRS),
        ("slider", _M_SLD, _D_SLD),
        ("setget", _M_SG, _D_SG),
        ("xh_utils", _M_UTIL, _D_UTIL),
        ("soundboard", _M_SND, _D_SND),
        ("storyboard", _M_SB, _D_SB),
        ("camangle", _M_CAM, _D_CAM),
        ("caminfo", _M_CAMINFO, _D_CAMINFO),
        ("msr_relay", _M_MSR, _D_MSR),
        ("paint", _M_PAINT, _D_PAINT),
        ("inpaint", _M_INPAINT, _D_INPAINT),
        ("numberpick", _M_NPICK, _D_NPICK),
        ("loadimage", _M_LIMG, _D_LIMG),
        ("xhinfo", _M_INFO, _D_INFO),
        ("xhsaveimage", _M_SAVE, _D_SAVE),
        ("xhsketch", _M_SKETCH, _D_SKETCH),
        ("wepenerd", _M_WN, _D_WN),
        ("label_pix", _M_LP, _D_LP),
        ("tag_prompt", _M_TAG, _D_TAG),
        ("prompt_stack", _M_PS, _D_PS),
        ("prompt_pack", _M_PP, _D_PP),
        ("audio_studio", _M_AS, _D_AS),
        ("openh3", _M_OH3, _D_OH3),
        ("qwen21_edit", _M_QE, _D_QE),
        ("charsheet", _M_CS, _D_CS),
        ("free_vram", _M_FV, _D_FV),
        ("xh_scenecut", _M_XHSC, _D_XHSC),
    ) if _p[1]
)

# ---------------------------------------------------------------------------
#  SAM3 追踪稳像补丁（v1.44.0）
# 官方 tracker 的 _suppress_recently_occluded 在两人重叠时把「被遮挡者」的
# 整个 mask 置 -10 ⇒ 该身份这一帧被判死 ⇒ 下一帧被当成全新身份 ⇒ 颜色跟错人。
# 这里猴补成「只清重叠区、保留身份本体」（不碰官方文件，只改类方法）。
# 关掉：环境变量 XH_SAM3_KEEP_OCCLUDED=0
# ---------------------------------------------------------------------------
try:
    from .nodes.xh_utils.sam3_patch import apply_patch as _xh_sam3_patch
    _xh_sam3_patch()
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  SAM3 稳像补丁未挂载（其余功能正常）：{_e}")

# ---------------------------------------------------------------------------
#  长循环兼容补丁（v1.0.3）
# 官方缓存签名用递归遍历祖先；XiaoHei-循环开始展开 100 轮后祖先链上千层，
# 撞 Python 递归上限 1000 ⇒ 执行前就 RecursionError（官方 ForLoopStart 同样会爆）。
# 这里只在启动时把那一个方法换成等价的显式栈 DFS，不改官方文件 / 不改工作流 /
# 不关缓存，普通工作流签名结果完全不变。关掉：XH_DISABLE_CACHE_PATCH=1。
# ---------------------------------------------------------------------------
try:
    from . import xh_cache_patch as _xh_cache_patch
    _xh_cache_patch.apply_patch()
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  长循环兼容补丁未挂载（其余功能正常）：{_e}")

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
_owner = {}          # class_type -> 来源子模块（重名时用来报清楚是谁撞了谁）


def _normalize_display_name(name):
    """统一为「功能名 XiaoHei」：功能名在前，尾巴用完整拼音 XiaoHei。

    2026-11-19 定稿：学 Pixaroma「功能名 Pixaroma」结构。尾巴固定写
    XiaoHei（不缩写 XH、不跟随中英翻译切换），功能名仍走各自语言。
    幂等：先剥历史前缀/尾巴，再统一补一个 XiaoHei，避免叠加。
    """
    for _prefix in ("XiaoHei-", "小黑·"):
        if name.startswith(_prefix):
            name = name[len(_prefix):].strip()
            break
    for _suffix in (" 小黑", " XiaoHei", " Xiaohei"):
        if name.endswith(_suffix):
            name = name[:-len(_suffix)]
            break
    return f"{name} XiaoHei"


for _mod, _cm, _dm in _PARTS:
    for _key, _cls in _cm.items():
        if _key in NODE_CLASS_MAPPINGS:
            # 不 raise：单个重名不该让整包加载失败。但一定要吼出来，
            # 因为静默覆盖正是合并这类操作最阴的坑。
            print(
                f"[XiaoHei]  class_type 重名：{_key} "
                f"来自 {_owner[_key]} 与 {_mod}，后者已覆盖前者！"
            )
        NODE_CLASS_MAPPINGS[_key] = _cls
        _owner[_key] = _mod
    for _key, _name in _dm.items():
        NODE_DISPLAY_NAME_MAPPINGS[_key] = _normalize_display_name(_name)

#  全包唯一的 WEB_DIRECTORY —— 28 个前端 js（中/EN 切换 + 参数标签本地化 +
#    controls 三件套的界面 + 声音播放的前端）全部放在这里。
#    子模块里也各有一句 WEB_DIRECTORY = "js"，但那是死变量：
#    ComfyUI 只认顶层自定义节点目录的声明，子目录里的不会被读取。
WEB_DIRECTORY = "js"

# ---------------------------------------------------------------------------
#  设置面板「关于」徽章的数据源（2026-10-20 新增）
#    前端 web/xh_about.js 用它在设置面板顶部画「版本 / GitHub / B站 / QQ群 / 微信」五颗徽章。
#    为什么要走后端而不是前端硬写：VERSION 的唯一真源就是本文件这一行，
#    前端再抄一份必然漂移（改了版本号忘了改前端 ⇒ 徽章显示旧版本）。
# ---------------------------------------------------------------------------
def _register_about_route():
    """把 {version, name, bilibili, tagline} 暴露给前端。失败只打日志，不影响加载。"""
    try:
        from aiohttp import web
        from server import PromptServer

        if getattr(PromptServer.instance, "_xh_about_route_done", False):
            return
        routes = PromptServer.instance.routes

        @routes.get("/xh/about")
        async def _xh_about(request):        # noqa: ARG001
            from . import VERSION as _V
            return web.json_response({
                "name": "Comfyui-XiaoHei",
                "version": _V,
                "bilibili": "https://space.bilibili.com/96854764",
                "opus": "https://www.bilibili.com/opus/1267916337700667400",
                "github": "https://github.com/XiaoHei-8G/Comfyui-XiaoHei",   # 2026-11-13 填上真实仓库（用户名 XiaoHei-8G，仓库名小写 ui）
                "tagline": "8g显存小黑的折腾日记",
            })

        PromptServer.instance._xh_about_route_done = True
    except Exception as _e:                   # noqa: BLE001
        print(f"[XiaoHei]  /xh/about 路由注册失败（设置面板徽章降级）：{_e}")


_register_about_route()

# ---------------------------------------------------------------------------
#  前端静态文件「关强缓存」（2026-11-19）
#    病根：ComfyUI 给每个自定义节点挂的是 web.static('/extensions/<包名>', dir)，
#         浏览器会按 24 小时强缓存这些 js/mjs（xh_asset_version.js 顶部记过实测）。
#         ⇒ 改了前端、重启了后端，浏览器仍然拿旧文件跑；用户看到的还是上一版界面。
#    做法：在 aiohttp app 上加一个中间件，只对本包 /extensions/Comfyui-XiaoHei/
#         下的响应补 no-store。不改 ComfyUI 任何文件，不动别人的扩展。
#    注意：已经进浏览器缓存的那一份不会自己失效 —— 生效后仍需一次 Ctrl+Shift+R。
# ---------------------------------------------------------------------------
def _register_no_cache_middleware():
    """本包前端文件一律不缓存；失败只打日志，不影响节点加载。

    ⚠️ 这个函数改过三次，每次都是「改前端不生效」的真凶，改前必读：

    ① 第一版 `app.middlewares = tuple(app.middlewares) + (mw,)`
       ⇒ aiohttp 3.14 起 `Application.middlewares` 是**只读 property**，
         赋值抛 `no setter`，被 except 吃掉，缓存头一个没加上。

    ② 第二版用 `app.on_response_prepare.append(...)`
       ⇒ 这个 Signal 在 `Application.pre_freeze()` 里就被 `freeze()` 了
         （ComfyUI 建 PromptServer 时 add_routes 就会 pre_freeze），
         追加抛 `Cannot modify frozen list.`，又被 except 吃掉。

    ③ 现在这版：直接替换 `app._middlewares_handlers`（普通实例属性，
       在 pre_freeze 里构造成 tuple）。三个前提都成立且都已核实：
         · 节点加载发生在服务器起监听之前（main.py: init_extra_nodes → 再 start_server），
           所以在加载期改，`_cached_build_middleware`（lru_cache）还没被填充；
         · `_handle` 里逐层 `partial(m, handler=handler)` 包裹，**后遍历的在外层**，
           所以把我们的中间件 append 到末尾 = 最外层，能罩住所有响应；
         · 我们只加 `(mw, True)`（new_style），不碰 `_has_legacy_middlewares`。

    验收（重启后必须做的唯一硬标准）：
        curl -s -D - -o /dev/null http://127.0.0.1:8188/extensions/Comfyui-XiaoHei/xh_inpaint/core.mjs
        响应里必须有 Cache-Control: no-store。没有 = 又没挂上，去日志搜 [XiaoHei] 那行。
    """
    try:
        from aiohttp import web
        from server import PromptServer

        inst = PromptServer.instance
        if inst is None or getattr(inst, "_xh_nocache_done", False):
            return
        app = getattr(inst, "app", None)
        if app is None:
            return

        PREFIX = "/extensions/Comfyui-XiaoHei/"

        @web.middleware
        async def _xh_no_cache(request, handler):
            resp = await handler(request)
            try:
                if request.path.startswith(PREFIX):
                    h = resp.headers
                    h["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
                    h["Pragma"] = "no-cache"
                    h["Expires"] = "0"
                    # 去掉校验器，免得浏览器拿 etag/last-modified 换 304 继续吃缓存。
                    for k in ("ETag", "Last-Modified"):
                        if k in h:
                            del h[k]
            except Exception:
                pass
            return resp

        _xh_no_cache.__xh_no_cache__ = True

        handlers = getattr(app, "_middlewares_handlers", None)
        if bool(getattr(app, "pre_frozen", None)) and handlers is not None:
            # 已 pre_freeze：直接接在末尾（= 最外层）。
            app._middlewares_handlers = tuple(handlers) + ((_xh_no_cache, True),)
            # 万一整个 app 本来一个中间件都没有，_handle 会跳过中间件链。
            if not getattr(app, "_run_middlewares", False):
                app._run_middlewares = True
            how = "middlewares_handlers"
        else:
            # 还没 pre_freeze：塞进原始列表，pre_freeze 时会一起构建。
            app._middlewares.append(_xh_no_cache)
            how = "middlewares"

        inst._xh_nocache_done = True
        print(f"[XiaoHei]  前端静态文件已关闭浏览器缓存（via {how}；改完刷新即生效）")
    except Exception as _e:                   # noqa: BLE001
        print(f"[XiaoHei]  !! 关闭前端缓存失败，改前端后仍需 Ctrl+F5：{_e}")


_register_no_cache_middleware()


# ---------------------------------------------------------------------------
#  工作流浏览器数据源（2026-10-27 新增）
#    前端 web/xh_workflow_browser.js 用它，在顶栏「XH」按钮弹出三栏工作流管理器：
#    左=文件夹树 / 中=列表(搜索) / 右=详情+打开。
#    复刻 Pixaroma 的 Workflows 门面（你自己指定"一定要有"的那块）。
#    路径安全：load 路由拦截 ".." / 绝对路径 / 越界，只能读 workflows 目录内。
# ---------------------------------------------------------------------------
def _register_workflows_route():
    try:
        import os
        import json
        import time
        import asyncio
        from aiohttp import web
        from server import PromptServer

        if getattr(PromptServer.instance, "_xh_workflows_route_done", False):
            return
        routes = PromptServer.instance.routes

        # ComfyUI 根 = 本文件上溯 3 层（custom_nodes/Comfyui-XiaoHei/__init__.py）
        _COMFY_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        _WF_ROOT = os.path.join(_COMFY_ROOT, "user", "default", "workflows")

        # --- 2026-11-18：资源管理器窗口跳到 ComfyUI 前面 ---
        # 用户实机截图：「点击打开文件夹时候，弹出的文件夹在 comfyui 后面，能不能让他出现在前面」。
        # 根因：从 ComfyUI 后端进程启动 explorer，Windows 把新窗口排在当前前台窗口
        #       （= ComfyUI 浏览器）后面；os.startfile 只管打开、不管 Z 序。
        # 修法：打开前抓顶层窗口快照 → 打开后轮询找新窗口（已打开过则按文件夹名匹配）→
        #       SW_RESTORE + AttachThreadInput（绕开 Windows 前台锁）+ SetForegroundWindow。
        # 铁律：全程在 executor 线程里跑，绝不阻塞 aiohttp 事件循环。
        def _xf_top_windows():
            import ctypes
            from ctypes import wintypes
            u = ctypes.windll.user32
            Proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            u.EnumWindows.argtypes = [Proc, wintypes.LPARAM]
            u.EnumWindows.restype = wintypes.BOOL
            u.IsWindowVisible.argtypes = [wintypes.HWND]
            u.IsWindowVisible.restype = wintypes.BOOL
            u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
            u.GetWindowTextLengthW.restype = ctypes.c_int
            u.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
            u.GetWindowTextW.restype = ctypes.c_int
            out = {}
            def cb(hwnd, _lparam):
                if u.IsWindowVisible(hwnd):
                    n = u.GetWindowTextLengthW(hwnd)
                    if n:
                        buf = ctypes.create_unicode_buffer(n + 1)
                        u.GetWindowTextW(hwnd, buf, n + 1)
                        out[hwnd] = buf.value
                return True
            u.EnumWindows(Proc(cb), 0)
            return out

        def _xf_is_explorer(hwnd):
            """只认真正的资源管理器窗口（class = CabinetWClass）。
            ⛔ 别用标题 contains：Edge 开着「Workflows」网页会被误匹配（2026-11-18 实测踩到）。"""
            import ctypes
            from ctypes import wintypes
            u = ctypes.windll.user32
            u.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
            u.GetClassNameW.restype = ctypes.c_int
            buf = ctypes.create_unicode_buffer(256)
            u.GetClassNameW(hwnd, buf, 256)
            return buf.value == "CabinetWClass"

        def _xf_bring_front(hwnd):
            import ctypes
            from ctypes import wintypes
            u = ctypes.windll.user32
            u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
            u.SetForegroundWindow.argtypes = [wintypes.HWND]
            u.SetForegroundWindow.restype = wintypes.BOOL
            u.BringWindowToTop.argtypes = [wintypes.HWND]
            u.GetForegroundWindow.restype = wintypes.HWND
            u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
            u.GetWindowThreadProcessId.restype = wintypes.DWORD
            k32 = ctypes.windll.kernel32          # GetCurrentThreadId 在 kernel32，不在 user32！
            k32.GetCurrentThreadId.restype = wintypes.DWORD
            u.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
            u.AttachThreadInput.restype = wintypes.BOOL
            u.keybd_event.argtypes = [ctypes.c_ubyte, ctypes.c_ubyte, ctypes.c_uint, ctypes.c_void_p]
            u.ShowWindow(hwnd, 9)  # SW_RESTORE（最小化状态也能拉起来）
            fg = u.GetForegroundWindow()
            tid_fg = u.GetWindowThreadProcessId(fg, None)
            tid_me = k32.GetCurrentThreadId()
            attached = bool(tid_fg and tid_fg != tid_me and u.AttachThreadInput(tid_me, tid_fg, True))
            try:
                u.BringWindowToTop(hwnd)
                if u.SetForegroundWindow(hwnd):
                    return
                # 前台锁没解开：模拟一次 Alt 键松开，再试一次。
                u.keybd_event(0x12, 0, 0, 0)       # VK_MENU down
                u.keybd_event(0x12, 0, 2, 0)       # KEYEVENTF_KEYUP
                u.SetForegroundWindow(hwnd)
            finally:
                if attached:
                    u.AttachThreadInput(tid_me, tid_fg, False)

        def _xf_open_and_focus(folder, select=None):
            """打开文件夹（select 非空则选中文件），并把资源管理器窗口拉到最前。"""
            import subprocess
            if os.name != "nt":
                opener = "open" if _sys.platform == "darwin" else "xdg-open"
                subprocess.Popen([opener, folder])
                return
            before = _xf_top_windows()
            if select:
                subprocess.Popen(["explorer", "/select,", os.path.normpath(select)])
            else:
                os.startfile(folder)                # noqa: S606
            target = os.path.basename(os.path.normpath(folder)).lower()
            try:
                hwnd = None
                for _ in range(16):                 # 最多等 4 秒
                    time.sleep(0.25)
                    after = _xf_top_windows()
                    fresh = [h for h in after if h not in before and after[h] and _xf_is_explorer(h)]
                    if fresh:
                        hwnd = fresh[-1]
                        break
                    # 已打开过同一目录时不会有新窗口；标题精确匹配（"workflows" / "workflows - 文件资源管理器"）
                    same = [h for h in after if after[h] and _xf_is_explorer(h)
                            and (after[h].lower() == target or after[h].lower().startswith(target + " - "))]
                    if same:
                        hwnd = same[-1]
                        break
                if hwnd:
                    _xf_bring_front(hwnd)
            except Exception as _e:                  # noqa: BLE001
                print(f"[XiaoHei] 资源管理器置前失败（不影响打开）: {_e}")

        # --- 2026-10-27 二期：模型标签 + 节点缩略图（仿 Pixaroma 卡片封面图）---
        #  2026-10-27 三期：照 Pixaroma nodes/_workflow_index_helpers.py L40 复刻。
        #   扩展名多了 .bin（老式权重），少了它就漏掉一批模型。
        _MODEL_EXTS = (".safetensors", ".ckpt", ".gguf", ".pt", ".pth", ".sft", ".bin")
        _META_CACHE = {}  # full_path -> (mtime, meta)；按 mtime 失效
        _MAP_CAP = 60     # 照作者：缩略图最多 60 个方块
        # 前端自己注册的节点类型（不在 Python 节点表里，不算"缺失"）
        # 照 Pixaroma _workflow_index_helpers.py L476-479 的 _FRONTEND_ONLY
        _WF_FRONTEND_ONLY = frozenset({
            "Note", "MarkdownNote", "PrimitiveNode", "Reroute", "GroupNode", "Primitive",
        })

        def _wf_is_subgraph_type(t):
            """子图节点的 type 是一个 UUID（对应工作流顶层 definitions 里的子图定义），
            它不是缺失的节点包 —— 只是这个子图没被展开成普通节点。
             2026-10-27：Pixaroma 作者也没排除这个（他的 detect_issues 会把 UUID
               报成缺失节点），实测你的 人物角色资产.json 里 15 个 UUID 型节点
               全被误报。我们这里排掉。"""
            s = str(t or "")
            if len(s) != 36 or s.count("-") != 4:
                return False
            return all(c in "0123456789abcdefABCDEF-" for c in s)

        def _wf_walk_strings(widgets):
            """递归产出 widgets_values 里的每一个字符串。
             照作者 L206-239：widget 值可以嵌套（dict / list / tuple），
               只看一层的话，藏在嵌套结构里的模型文件名就整个漏掉。
               作者的实现用 FIFO 队列 + 访问次数上限（防大列表把内存吃光），
               这里照抄同一套（MAX_VISIT / MAX_QUEUE 各 2000）。"""
            from collections import deque
            max_visit = 2000
            max_queue = 2000
            queue = deque([widgets])
            visited = 0
            while queue and visited < max_visit:
                cur = queue.popleft()
                visited += 1
                if isinstance(cur, str):
                    yield cur
                    continue
                if isinstance(cur, dict):
                    items = cur.values()
                elif isinstance(cur, (list, tuple)):
                    items = cur
                else:
                    continue
                for v in items:
                    if len(queue) >= max_queue:
                        break
                    queue.append(v)

        def _wf_hue(t):
            """节点类型 → 色相（0-359），缩略图里同类节点同色。"""
            h = 0
            for ch in str(t):
                h = (h * 31 + ord(ch)) & 0xFFFFFFFF
            return h % 360

        def _wf_node_index():
            """节点类型 → (包名, 分类) 的表。
             2026-10-27 五期：照 ComfyUI server.py L857 的做法 ——
               info['python_module'] = getattr(obj_class, "RELATIVE_PYTHON_MODULE", "nodes")
            为什么不放在前端做：前端的 /object_info 全量有 7.6MB（实测 3542 个节点类型），
            每开一次面板拉一遍会明显卡；后端直接读属性，零网络开销。
            缓存起来，只在第一次用时算一次。"""
            if _wf_node_index._cache is not None:
                return _wf_node_index._cache
            idx = {}
            try:
                import nodes as _comfy_nodes
                for _name, _cls in _comfy_nodes.NODE_CLASS_MAPPINGS.items():
                    try:
                        mod = getattr(_cls, "RELATIVE_PYTHON_MODULE", "nodes")
                        cat = getattr(_cls, "CATEGORY", "") or ""
                    except Exception:                           # noqa: BLE001
                        mod, cat = "nodes", ""
                    idx[_name] = (mod, cat)
            except Exception:                                   # noqa: BLE001
                pass
            _wf_node_index._cache = idx
            return idx

        _wf_node_index._cache = None

        def _wf_meta(full, mtime):
            """解析一个 workflow json：节点数 / 用到的模型文件 / 缩略图方块坐标。"""
            cached = _META_CACHE.get(full)
            if cached and cached[0] == mtime:
                return cached[1]
            meta = {"nodes": None, "models": [], "loras": [], "map": [], "types": [],
                    "packs": [], "missing": [], "subgraphs": 0}
            try:
                with open(full, "r", encoding="utf-8") as f:
                    d = json.load(f)
                nodes = d.get("nodes", []) if isinstance(d, dict) else []
                meta["nodes"] = len(nodes)
                #  2026-10-27 四期：节点类型清单 + 节点包归类 + 缺失节点。
                #   照 Pixaroma _workflow_index_helpers.py L300-311 的 class_types
                #   和 L576-600 的 detect_issues（missing_nodes）。
                types = []
                for n in nodes:
                    if not isinstance(n, dict):
                        continue
                    t = n.get("type")
                    if isinstance(t, str) and t and t not in types:
                        types.append(t)
                meta["types"] = types
                # ── 归类成「节点包」：用 RELATIVE_PYTHON_MODULE（=server.py L857 的取法）──
                nidx = _wf_node_index()
                packs = {}
                missing = []
                subgraphs = 0
                for t in types:
                    hit = nidx.get(t)
                    if hit is None:
                        # 子图节点：type 是 UUID，指向工作流里的子图定义，不是缺失
                        if _wf_is_subgraph_type(t):
                            subgraphs += 1
                        # 前端自己注册的节点不在 Python 节点表里，不算缺失
                        elif t not in _WF_FRONTEND_ONLY:
                            missing.append(t)
                        continue
                    mod, cat = hit
                    key = mod or "nodes"
                    p = packs.get(key)
                    if p is None:
                        p = {"mod": mod, "cat": cat, "count": 0, "types": []}
                        packs[key] = p
                    p["count"] += 1
                    if len(p["types"]) < 16:
                        p["types"].append(t)
                # 第三方包在前、核心内置在后，各自按节点数倒序
                pack_list = sorted(
                    packs.values(),
                    key=lambda x: (1 if (not x["mod"] or x["mod"] == "nodes"
                                         or x["mod"].startswith("comfy_extras.")) else 0,
                                   -x["count"]),
                )
                meta["packs"] = pack_list
                meta["missing"] = missing
                meta["subgraphs"] = subgraphs
                models = []
                loras = []
                #  2026-10-27 修复「模型检测不全」：
                #   旧代码有两个漏：① `if len(models) >= 4: break` —— 拿到 4 个就停，
                #   后面节点里的模型全丢（用户截图里正好只显示 4 个，就是这个断点）；
                #   ② 只遍历 widgets_values 的第一层，嵌套在 dict/list 里的模型名找不到。
                #   现在照作者 L300-323：全部节点都过，递归取字符串，LoRA 单独分流。
                for n in nodes:
                    if not isinstance(n, dict):
                        continue
                    t = n.get("type")
                    t = t if isinstance(t, str) else ""     # 作者 L308：type 可能是 bool/number
                    tl = t.lower()
                    is_lora = "lora" in tl
                    widgets = n.get("widgets_values")
                    if widgets is None:
                        continue
                    for s in _wf_walk_strings(widgets):
                        if not s:
                            continue
                        low = s.lower()
                        if low.endswith(_MODEL_EXTS):
                            base = s.replace("\\", "/").rsplit("/", 1)[-1]
                            if not base:
                                continue
                            bucket = loras if is_lora else models
                            if base not in bucket:
                                bucket.append(base)
                meta["models"] = models
                meta["loras"] = loras
                boxes = []
                for n in nodes[:_MAP_CAP]:
                    if not isinstance(n, dict):
                        continue
                    pos = n.get("pos") or [0, 0]
                    size = n.get("size") or [180, 60]
                    try:
                        boxes.append({
                            "x": int(pos[0]), "y": int(pos[1]),
                            "w": max(8, int(size[0])), "h": max(8, int(size[1])),
                            "c": _wf_hue(n.get("type", "")),
                        })
                    except Exception:                            # noqa: BLE001
                        continue
                meta["map"] = boxes
            except Exception:                                    # noqa: BLE001
                pass
            _META_CACHE[full] = (mtime, meta)
            if len(_META_CACHE) > 800:
                _META_CACHE.clear()
            return meta

        @routes.get("/xh/workflows")
        async def _xh_workflows_list(request):                    # noqa: ARG001
            folders = []
            files = []
            if os.path.isdir(_WF_ROOT):
                for dirpath, dirnames, filenames in os.walk(_WF_ROOT):
                    rel_dir = os.path.relpath(dirpath, _WF_ROOT)
                    if rel_dir != ".":
                        folders.append(rel_dir.replace(os.sep, "/"))
                    for fn in filenames:
                        if not fn.lower().endswith(".json"):
                            continue
                        full = os.path.join(dirpath, fn)
                        rel = os.path.relpath(full, _WF_ROOT).replace(os.sep, "/")
                        mtime = int(os.path.getmtime(full))
                        info = {
                            "name": fn,
                            "rel": rel,
                            "dir": "" if rel_dir == "." else rel_dir.replace(os.sep, "/"),
                            "mtime": mtime,
                            "size": os.path.getsize(full),
                            "nodes": None,
                            "models": [],
                            "loras": [],
                            "map": [],
                            "types": [],
                            "packs": [],
                            "missing": [],
                            "subgraphs": 0,
                        }
                        info.update(_wf_meta(full, mtime))
                        files.append(info)
            files.sort(key=lambda x: x["mtime"], reverse=True)
            #  2026-10-27：folders 不在后端排序！
            #   Python 的 sorted() 是字节序（UTF-16/码点序），会把「乱糟糟/优化版/功能」这类
            #   中文名全甩到英文后面，还把 "LTX2.5" 排在 "Ltx2.3" 前面 —— 跟 ComfyUI 官方侧栏
            #   和 Pixaroma 面板的顺序完全对不上（实测：官方顺序 = 中文 pinyin 在前 + 英文在后）。
            #   作者的做法（Pixaroma sort.mjs）：后端只管列出文件夹，顺序由前端
            #   Intl.Collator(sensitivity:"base", numeric:true) 逐段比较决定。
            return web.json_response({"root": _WF_ROOT, "folders": folders, "files": files})

        @routes.get("/xh/workflows/load")
        async def _xh_workflows_load(request):                    # noqa: ARG001
            rel = request.query.get("rel", "")
            if (not rel) or (".." in rel) or rel.startswith("/") or ("\\" in rel):
                return web.json_response({"error": "bad path"}, status=400)
            full = os.path.normpath(os.path.join(_WF_ROOT, rel))
            if (not full.startswith(os.path.normpath(_WF_ROOT))) or (not os.path.isfile(full)):
                return web.json_response({"error": "not found"}, status=404)
            try:
                with open(full, "r", encoding="utf-8") as _f:
                    _d = json.load(_f)
            except Exception as _e:                              # noqa: BLE001
                return web.json_response({"error": str(_e)}, status=500)
            return web.json_response({"rel": rel, "graph": _d})

        @routes.get("/xh/workflows/openfolder")
        async def _xh_workflows_openfolder(request):              # noqa: ARG001
            """在系统文件管理器里打开 workflows 根目录（仿 Pixaroma Open folder）。

            2026-11-18：改成「打开 + 置前」——原来 os.startfile 弹的窗口落在 ComfyUI 后面。
            """
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _xf_open_and_focus, _WF_ROOT, None)
                return web.json_response({"ok": True})
            except Exception as _e:                               # noqa: BLE001
                return web.json_response({"error": str(_e)}, status=500)

        @routes.post("/xh/workflows/reveal")
        async def _xh_workflows_reveal(request):
            """在系统文件管理器里定位并选中某个工作流文件（仿 Pixaroma Reveal）。

            2026-11-18：同样走「打开 + 置前」，和顶栏「打开文件夹」一致。
            """
            try:
                import subprocess  # noqa: F401  — 保留给非 Windows 分支 / 旧调用方
                body = await request.json()
                rel = str((body or {}).get("rel", "") or "")
                if (not rel) or (".." in rel) or rel.startswith("/") or ("\\" in rel):
                    return web.json_response({"error": "bad path"}, status=400)
                full = os.path.join(_WF_ROOT, rel.replace("/", os.sep))
                if not os.path.isfile(full):
                    return web.json_response({"error": "not found"}, status=404)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _xf_open_and_focus,
                                           os.path.dirname(full), os.path.normpath(full))
                return web.json_response({"ok": True})
            except Exception as _e:                               # noqa: BLE001
                return web.json_response({"error": str(_e)}, status=500)

        @routes.post("/xh/workflows/mkdir")
        async def _xh_workflows_mkdir(request):                   # noqa: ARG001
            """在 workflows 根目录下新建子文件夹（UI「+ 新建」用）。
            防护：只允许相对路径、禁止 .. 与反斜杠、禁止 Windows 非法字符。"""
            try:
                body = await request.json()
            except Exception:                                     # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            d = str(body.get("dir", "")).strip().strip("/")
            if (not d) or (".." in d) or ("\\" in d) or d.startswith("/"):
                return web.json_response({"error": "bad path"}, status=400)
            if any(c in d for c in '<>:"|?*'):
                return web.json_response({"error": "文件夹名含非法字符"}, status=400)
            target = os.path.normpath(os.path.join(_WF_ROOT, d))
            if not target.startswith(os.path.normpath(_WF_ROOT)):
                return web.json_response({"error": "bad path"}, status=400)
            try:
                if os.path.isdir(target):
                    return web.json_response({"ok": True, "existed": True})
                os.makedirs(target)
            except Exception as _e:                               # noqa: BLE001
                return web.json_response({"error": str(_e)}, status=500)
            return web.json_response({"ok": True})

        @routes.post("/xh/workflows/rename_dir")
        async def _xh_workflows_rename_dir(request):
            """原地重命名 workflows 内的目录，保留全部文件和子目录。"""
            try:
                body = await request.json()
            except Exception:                                     # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            if not isinstance(body, dict):
                return web.json_response({"error": "bad body"}, status=400)
            rel = str(body.get("rel", "") or "")
            name = str(body.get("name", "") or "")
            parts = rel.split("/")
            if (
                (not rel) or rel.startswith("/") or ("\\" in rel)
                or os.path.isabs(rel) or os.path.splitdrive(rel)[0]
                or any(p in ("", ".", "..") for p in parts)
                or any(ord(c) < 32 for c in rel)
            ):
                return web.json_response({"error": "目录路径无效"}, status=400)
            reserved = {"CON", "PRN", "AUX", "NUL", "CLOCK$"}
            reserved.update(f"COM{i}" for i in range(1, 10))
            reserved.update(f"LPT{i}" for i in range(1, 10))
            if (
                (not name) or name != name.strip() or name.endswith(".")
                or ("/" in name) or ("\\" in name)
                or any(c in name for c in '<>:"|?*')
                or any(ord(c) < 32 for c in name)
                or name.split(".")[0].upper() in reserved
            ):
                return web.json_response({"error": "文件夹名无效或含非法字符"}, status=400)

            root = os.path.realpath(_WF_ROOT)
            src = os.path.realpath(os.path.join(root, rel.replace("/", os.sep)))
            try:
                inside = os.path.normcase(os.path.commonpath([root, src])) == os.path.normcase(root)
            except ValueError:
                inside = False
            if not inside or os.path.normcase(src) == os.path.normcase(root):
                return web.json_response({"error": "不能重命名 workflows 根目录或外部目录"}, status=400)
            if not os.path.exists(src):
                return web.json_response({"error": "源文件夹不存在"}, status=404)
            if not os.path.isdir(src):
                return web.json_response({"error": "源路径不是文件夹"}, status=400)

            # 保留用户输入的末段大小写；realpath 会把 Windows 已有目录还原成旧大小写。
            dst = os.path.normpath(os.path.join(os.path.dirname(src), name))
            try:
                target_inside = os.path.normcase(os.path.commonpath([root, dst])) == os.path.normcase(root)
            except ValueError:
                target_inside = False
            if not target_inside:
                return web.json_response({"error": "目标路径超出 workflows 目录"}, status=400)
            if src == dst:
                return web.json_response({"ok": True, "rel": rel})
            same_path = os.path.normcase(src) == os.path.normcase(dst)
            if not same_path and os.path.lexists(dst):
                return web.json_response({"error": "目标已有同名文件或文件夹，未覆盖"}, status=409)
            try:
                os.rename(src, dst)                               # 同盘原地改名，子树完整保留
            except FileExistsError:
                return web.json_response({"error": "目标已有同名文件或文件夹，未覆盖"}, status=409)
            except PermissionError as _e:
                return web.json_response({"error": f"文件夹被占用或没有权限：{_e}"}, status=409)
            except OSError as _e:
                return web.json_response({"error": str(_e)}, status=500)
            new_rel = os.path.relpath(dst, root).replace(os.sep, "/")
            return web.json_response({"ok": True, "rel": new_rel})

        @routes.post("/xh/workflows/move")
        async def _xh_workflows_move(request):                    # noqa: ARG001
            """把一个工作流 json 移到指定子文件夹（UI 拖卡片用）。
            防护：路径穿越校验 + 目标同名不覆盖（409）+ 只在 workflows 目录内。"""
            try:
                body = await request.json()
            except Exception:                                     # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            rel = str(body.get("rel", ""))
            d = str(body.get("dir", "")).strip().strip("/")
            if (not rel) or (".." in rel) or ("\\" in rel) or rel.startswith("/"):
                return web.json_response({"error": "bad rel"}, status=400)
            if (".." in d) or ("\\" in d) or d.startswith("/"):
                return web.json_response({"error": "bad dir"}, status=400)
            src = os.path.normpath(os.path.join(_WF_ROOT, rel))
            if (not src.startswith(os.path.normpath(_WF_ROOT))) or (not os.path.isfile(src)):
                return web.json_response({"error": "source not found"}, status=404)
            if d:
                dst_dir = os.path.normpath(os.path.join(_WF_ROOT, d))
                if (not dst_dir.startswith(os.path.normpath(_WF_ROOT))) or (not os.path.isdir(dst_dir)):
                    return web.json_response({"error": "target folder not found"}, status=404)
            else:
                dst_dir = _WF_ROOT
            dst = os.path.join(dst_dir, os.path.basename(src))
            if os.path.exists(dst):
                return web.json_response({"error": "目标已有同名文件，未覆盖"}, status=409)
            try:
                os.rename(src, dst)                               # 同盘瞬时完成
            except Exception as _e:                               # noqa: BLE001
                return web.json_response({"error": str(_e)}, status=500)
            new_rel = os.path.relpath(dst, _WF_ROOT).replace(os.sep, "/")
            return web.json_response({"ok": True, "rel": new_rel})

        @routes.post("/xh/workflows/delete_dir")
        async def _xh_workflows_delete_dir(request):
            """删除 workflows 内的一个文件夹（连同子目录和里面的工作流）。

            防护与 rename_dir 对齐：只允许相对路径、禁止 .. / 反斜杠 / 盘符，
            realpath 后必须仍在 workflows 根目录内，且不允许删根目录本身。
            """
            try:
                body = await request.json()
            except Exception:                                     # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            if not isinstance(body, dict):
                return web.json_response({"error": "bad body"}, status=400)
            rel = str(body.get("rel", "") or "")
            parts = rel.split("/")
            if (
                (not rel) or rel.startswith("/") or ("\\" in rel)
                or os.path.isabs(rel) or os.path.splitdrive(rel)[0]
                or any(p in ("", ".", "..") for p in parts)
                or any(ord(c) < 32 for c in rel)
            ):
                return web.json_response({"error": "目录路径无效"}, status=400)

            root = os.path.realpath(_WF_ROOT)
            target = os.path.realpath(os.path.join(root, rel.replace("/", os.sep)))
            try:
                inside = os.path.normcase(os.path.commonpath([root, target])) == os.path.normcase(root)
            except ValueError:
                inside = False
            if (not inside) or os.path.normcase(target) == os.path.normcase(root):
                return web.json_response({"error": "不能删除 workflows 根目录或外部目录"}, status=400)
            if not os.path.exists(target):
                return web.json_response({"error": "文件夹不存在"}, status=404)
            if not os.path.isdir(target):
                return web.json_response({"error": "目标不是文件夹"}, status=400)

            import shutil
            import stat as _stat

            removed = 0
            for _dirpath, _dirnames, filenames in os.walk(target):
                removed += sum(1 for fn in filenames if fn.lower().endswith(".json"))

            def _force(func, path, _exc):                         # Windows 只读文件兜底
                try:
                    os.chmod(path, _stat.S_IWRITE)
                    func(path)
                except Exception:                                 # noqa: BLE001
                    pass

            try:
                shutil.rmtree(target, onerror=_force)
            except PermissionError as _e:
                return web.json_response({"error": f"文件夹被占用或没有权限：{_e}"}, status=409)
            except OSError as _e:
                return web.json_response({"error": str(_e)}, status=500)

            # 清掉被删目录下的元信息缓存，避免以后同名新建时读到旧数据
            try:
                pref = os.path.normcase(target) + os.sep
                for _k in [k for k in list(_META_CACHE.keys()) if os.path.normcase(k).startswith(pref)]:
                    _META_CACHE.pop(_k, None)
            except Exception:                                     # noqa: BLE001
                pass
            # 同步清掉这些工作流的自定义示例图（索引 + 不再被任何工作流引用的文件）
            try:
                _d = _img_load()
                _gone_names = []
                for _k in [k for k in list(_d.keys()) if k == rel or k.startswith(rel + "/")]:
                    _v = _d.pop(_k, None)
                    if isinstance(_v, list):
                        _gone_names.extend(_v)
                if _gone_names:
                    _img_save(_d)
                    _keep = {n for _v in _d.values() if isinstance(_v, list) for n in _v}
                    for _n in _gone_names:
                        if _n in _keep or not _IMG_NAME_RE.match(_n):
                            continue
                        try:
                            os.remove(os.path.join(_IMG_DIR, _n))
                        except OSError:
                            pass
            except Exception:                                     # noqa: BLE001
                pass
            return web.json_response({"ok": True, "rel": rel, "workflows": removed})

        # ── 自定义示例图（每个工作流一组，可多张）──────────────────────────
        #  存 user/default/xh_workflow_images/：图片文件 + index.json（rel → [文件名]）。
        #  第一张即卡片/详情页封面；只有没有自定义图时才退回 Pixaroma 的成品图。
        _IMG_DIR = os.path.join(_COMFY_ROOT, "user", "default", "xh_workflow_images")
        _IMG_INDEX = os.path.join(_IMG_DIR, "index.json")
        _IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        _IMG_MAX = 20 * 1024 * 1024
        import re as _re
        import uuid as _uuid
        _IMG_NAME_RE = _re.compile(r"^[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$")

        def _img_rel_ok(rel):
            if not isinstance(rel, str) or not rel:
                return False
            parts = rel.split("/")
            return not (
                rel.startswith("/") or ("\\" in rel) or os.path.isabs(rel)
                or os.path.splitdrive(rel)[0] or any(p in ("", ".", "..") for p in parts)
                or any(ord(c) < 32 for c in rel)
            )

        def _img_load():
            try:
                with open(_IMG_INDEX, "r", encoding="utf-8") as _fh:
                    _d = json.load(_fh)
                return _d if isinstance(_d, dict) else {}
            except Exception:                                    # noqa: BLE001
                return {}

        def _img_save(d):
            os.makedirs(_IMG_DIR, exist_ok=True)
            _tmp = _IMG_INDEX + ".tmp"
            with open(_tmp, "w", encoding="utf-8") as _fh:
                json.dump(d, _fh, ensure_ascii=False, indent=1)
            os.replace(_tmp, _IMG_INDEX)

        @routes.get("/xh/workflows/images")
        async def _xh_wf_images(request):
            """返回 {rel: [{name, v}]}；v 用文件 mtime 做缓存破坏。"""
            _d = _img_load()
            items = {}
            for _rel, _names in _d.items():
                if not isinstance(_names, list):
                    continue
                _out = []
                for _n in _names:
                    if not isinstance(_n, str) or not _IMG_NAME_RE.match(_n):
                        continue
                    _p = os.path.join(_IMG_DIR, _n)
                    try:
                        _out.append({"name": _n, "v": int(os.path.getmtime(_p))})
                    except OSError:
                        continue
                if _out:
                    items[_rel] = _out
            return web.json_response({"ok": True, "items": items})

        @routes.get("/xh/workflows/image")
        async def _xh_wf_image(request):
            """按 rel + name 取单张自定义示例图。"""
            _rel = request.query.get("rel", "")
            _name = request.query.get("name", "")
            if not _img_rel_ok(_rel) or not _IMG_NAME_RE.match(_name):
                raise web.HTTPBadRequest(text="bad image path")
            _p = os.path.join(_IMG_DIR, _name)
            if not os.path.isfile(_p):
                raise web.HTTPNotFound()
            return web.FileResponse(_p)

        @routes.post("/xh/workflows/images/upload")
        async def _xh_wf_images_upload(request):
            """multipart 上传一张图（前端多选时逐张调用）。"""
            try:
                _post = await request.post()
            except Exception:                                    # noqa: BLE001
                return web.json_response({"error": "不是有效的上传请求"}, status=400)
            _rel = str(_post.get("rel", "") or "")
            _field = _post.get("file")
            if not _img_rel_ok(_rel):
                return web.json_response({"error": "工作流路径无效"}, status=400)
            if _field is None or not getattr(_field, "file", None):
                return web.json_response({"error": "没有收到图片"}, status=400)
            _ext = os.path.splitext(str(getattr(_field, "filename", "") or ""))[1].lower()
            if _ext not in _IMG_EXTS:
                return web.json_response({"error": "只支持 png / jpg / webp / gif"}, status=400)
            _data = _field.file.read(_IMG_MAX + 1)
            if len(_data) > _IMG_MAX:
                return web.json_response({"error": "图片不能超过 20MB"}, status=413)
            if not _data:
                return web.json_response({"error": "图片是空的"}, status=400)
            os.makedirs(_IMG_DIR, exist_ok=True)
            _name = _uuid.uuid4().hex[:12] + _ext
            _p = os.path.join(_IMG_DIR, _name)
            with open(_p, "wb") as _fh:
                _fh.write(_data)
            _d = _img_load()
            _arr = _d.get(_rel) if isinstance(_d.get(_rel), list) else []
            _arr.append(_name)
            _d[_rel] = _arr
            _img_save(_d)
            return web.json_response({"ok": True, "name": _name, "v": int(os.path.getmtime(_p))})

        @routes.post("/xh/workflows/images/delete")
        async def _xh_wf_images_delete(request):
            try:
                _body = await request.json()
            except Exception:                                    # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            if not isinstance(_body, dict):
                return web.json_response({"error": "bad body"}, status=400)
            _rel = str((_body or {}).get("rel", "") or "")
            _name = str((_body or {}).get("name", "") or "")
            if not _img_rel_ok(_rel) or not _IMG_NAME_RE.match(_name):
                return web.json_response({"error": "参数无效"}, status=400)
            _d = _img_load()
            _arr = _d.get(_rel) if isinstance(_d.get(_rel), list) else []
            if _name in _arr:
                _arr.remove(_name)
            if _arr:
                _d[_rel] = _arr
            else:
                _d.pop(_rel, None)
            _img_save(_d)
            try:
                os.remove(os.path.join(_IMG_DIR, _name))
            except OSError:
                pass
            return web.json_response({"ok": True})

        @routes.post("/xh/workflows/images/cover")
        async def _xh_wf_images_cover(request):
            """把某张图移到第一位 → 它就是卡片封面。"""
            try:
                _body = await request.json()
            except Exception:                                    # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            if not isinstance(_body, dict):
                return web.json_response({"error": "bad body"}, status=400)
            _rel = str((_body or {}).get("rel", "") or "")
            _name = str((_body or {}).get("name", "") or "")
            if not _img_rel_ok(_rel) or not _IMG_NAME_RE.match(_name):
                return web.json_response({"error": "参数无效"}, status=400)
            _d = _img_load()
            _arr = _d.get(_rel) if isinstance(_d.get(_rel), list) else []
            if _name not in _arr:
                return web.json_response({"error": "这张图不在这条工作流里"}, status=404)
            _arr.remove(_name)
            _arr.insert(0, _name)
            _d[_rel] = _arr
            _img_save(_d)
            return web.json_response({"ok": True})

        @routes.post("/xh/workflows/images/migrate")
        async def _xh_wf_images_migrate(request):
            """工作流改名 / 移动时，把图片索引迁到新 rel。"""
            try:
                _body = await request.json()
            except Exception:                                    # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            if not isinstance(_body, dict):
                return web.json_response({"error": "bad body"}, status=400)
            _from = str((_body or {}).get("from", "") or "")
            _to = str((_body or {}).get("to", "") or "")
            if not _img_rel_ok(_from) or not _img_rel_ok(_to):
                return web.json_response({"error": "参数无效"}, status=400)
            _d = _img_load()
            _arr = _d.pop(_from, None)
            if isinstance(_arr, list) and _arr:
                _old = _d.get(_to) if isinstance(_d.get(_to), list) else []
                _d[_to] = _arr + [n for n in _old if n not in _arr]
                _img_save(_d)
            return web.json_response({"ok": True})

        @routes.post("/xh/workflows/images/clear")
        async def _xh_wf_images_clear(request):
            """工作流被删除时清掉它的示例图；只删不再被任何 rel 引用的文件。"""
            try:
                _body = await request.json()
            except Exception:                                    # noqa: BLE001
                return web.json_response({"error": "bad body"}, status=400)
            if not isinstance(_body, dict):
                return web.json_response({"error": "bad body"}, status=400)
            _rel = str((_body or {}).get("rel", "") or "")
            if not _img_rel_ok(_rel):
                return web.json_response({"error": "参数无效"}, status=400)
            _d = _img_load()
            _gone = _d.pop(_rel, None)
            if isinstance(_gone, list) and _gone:
                _img_save(_d)
                _keep = {n for _v in _d.values() if isinstance(_v, list) for n in _v}
                for _n in _gone:
                    if _n in _keep or not _IMG_NAME_RE.match(_n):
                        continue
                    try:
                        os.remove(os.path.join(_IMG_DIR, _n))
                    except OSError:
                        pass
            return web.json_response({"ok": True})

        PromptServer.instance._xh_workflows_route_done = True
    except Exception as _e:                                      # noqa: BLE001
        print(f"[XiaoHei]  /xh/workflows 路由注册失败：{_e}")


_register_workflows_route()

# ---------------------------------------------------------------------------
#  模型管理器门面（2026-11-19）：豆包原作 XiaoHei-ModelBoard 整包并进来。
#    · 只注册 HTTP 路由（/xh_mb/*），**不注册节点** ⇒ 画布上不再显示那个哑节点，
#      入口全走右上角顶栏第 5 颗按钮 + 官方设置开关（见 js/xh_modelboard.js）。
#    · 后端 api.register() 自带 _registered 幂等标记，重复调用安全。
#    · 前端 panel.js / panel.css 在 js/xh_modelboard/（css 靠 import.meta.url 同目录加载）。
# ---------------------------------------------------------------------------
try:
    from .nodes.modelboard import api as _xh_modelboard_api  # noqa: F401
    _xh_modelboard_api.register()
except Exception as _e:                                      # noqa: BLE001
    print(f"[XiaoHei]  /xh_mb 模型管理器路由注册失败：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

# 2026-10-16：「 刷新框数 / 刷新段数」按钮（ChainPrompt / SegmentTable）已删除 ——
#   框数/段数早就是节点自身参数 + 纯前端折叠，改数字实时生效，按钮 100% 冗余；
#   后端 /xh_chainprompt/set_slots、/xh_segments/set_slots 两条路由同轮清掉
#   （chain_prompt 子模块的 register_routes 已成空函数，分段表的 register_routes 已删）。

# 加载自检：把注册结果打进日志，方便一眼看出包有没有被加载、节点数对不对
print(f"[XiaoHei]  Comfyui-XiaoHei v{VERSION} 已加载 {len(NODE_CLASS_MAPPINGS)} 个节点，来自 {len(_PARTS)} 个模块")

# 有子模块没加载起来时，给一份**可以照着做**的汇总（对分发给别人的场景最要紧：
# 对方不会看逐条日志，但一定会看最后这几行）
if _LOAD_FAILED:
    _bar = "=" * 72
    print(f"[XiaoHei] {_bar}")
    print(f"[XiaoHei]  {len(_LOAD_FAILED)} 个子模块没加载起来，"
          f"对应节点会缺失（其余 {len(NODE_CLASS_MAPPINGS)} 个节点正常可用）：")
    for _mod, _usage, _pips, _err in _LOAD_FAILED:
        print(f"[XiaoHei]     · {_mod}（{_usage}）→ {_err}")
        if _pips:
            print(f"[XiaoHei]         \"{_PY}\" -m pip install {' '.join(_pips)}")
    print(f"[XiaoHei] 一键补齐全部依赖："
          f"\"{_PY}\" -m pip install -r \"{_HERE}\\requirements.txt\"")
    print("[XiaoHei] 装了 ComfyUI-Manager 的话，它会在启动时自动提示安装缺失依赖。")
    print("[XiaoHei] 装完**重启** ComfyUI 才会生效。")
    print(f"[XiaoHei] {_bar}")
