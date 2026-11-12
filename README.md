#  Comfyui-XiaoHei

XiaoHei 自研 / 复刻节点的合集包。**126 个节点，24 个模块**，首轮合并于 2026-09-22，其后陆续追加。

`Comfyui-XH_GroupExecutor`（17 节点）按需求**保持独立**，未并入本包。

>  节点 ID 以 `XH` 开头、分类统一归在 `XiaoHei/...` 下；
> 在节点搜索框里打 **`XH`** 就能筛出本包节点，少数 ID 不带 `XH` 的可在 `XiaoHei` 分类下按中文显示名找（完整清单见 §1）。

>  **当前版本 v1.0.0（2026-11-12 发布）· 品牌更名：前身 Comfyui-XH_Toolbox v1.59.1 → 现名「小黑 / Comfyui-XiaoHei」**
> - ** `openh3` 模块零外部依赖** —— 8 个节点全在本包里，不需要装任何外部 OpenH3 包。
>   配套工作流（27 节点 / 8GB 降配版）由作者单独提供，不随本包分发。详见 §1.4.5。
> - ** 新增 `openh3` 模块（8 节点）—— H3 2K 精修链（Open-H3 Regenerate 2K）**。
>   复刻 ComfyUI-OpenH3-VideoTools（Tensor Alchemist · GPL-3.0）的 5 个节点，
>   并把 ComfyUI-OpenH3-Regenerate2K（Songssx · MIT）的 3 个节点**自持**进来 ——
>   原版「精修总控」内部硬查那 3 个节点的 ID，查不到直接 RuntimeError 拒绝启动；
>   自持后**外部那两个包不装也能跑**。详见 §1.4.5。
> - ** 依赖边界很清楚**：核心全在官方 ComfyUI；`imageio-ffmpeg` 是 pip 包（已写进 requirements.txt）；
>   **KJNodes 是可选的** —— 有就多两层低显存补丁（8GB 强烈建议），没有就**跳过这两层仍可运行**。
>
> ---
>
>  v1.27.0（2026-10-28 发布）历史要点
> - ** 加到画布时指南浮窗不再消失**，新节点正好落在**浮窗左侧**（左侧放不下会自动退到右侧/空白区）。
> - ** 修「全关 / 全开」黄底白字**：所有主操作按钮的字色统一按 WCAG 自动算，保证任何底色都看得清。
> - ** 帮助图标改用官方圆圈问号**：手绘灯泡**整个废弃**（官方**没有灯泡图标**：`comfy--*` 82 个里没有、
>   lucide 里也没有 lightbulb）⇒ 改用官方 **`lucide--circle-help`**，原版一字未改。
> - ** 第一次打开不再干等几秒**：`/object_info` 实测 7.6MB / 3542 节点 / 2.9 秒且无缓存
>   ⇒ 现在 **localStorage 缓存 + 页面加载后台预热 + 窗口秒开**，实测 **2900ms → 99ms**。
> - ** 黄底白字清零**：节点里的齿轮、工作流浏览器标题方块，之前都是黄底白字看不清，现在都改了。
> - ** 打开时图标不再"消失"**：改成淡黄底 + 主色描边 + 主色图标。
> - ** 「 加到画布」终于看得见了**：以前节点建在固定坐标、**正好被帮助浮窗盖住** ⇒ 以为没加上。
>   现在放到**画布中心**、加完**自动关浮窗**，并弹一行提示。
> - ** 节点详情页有内容了**：直接用节点自带的说明（【干什么】/【怎么配】…），**100 个节点全覆盖**。
> - ** 灯泡更清楚了**：灯罩改成实心 + 描边加粗，普通态和打开态都一眼认得出是盏灯。
> - ** 窗口标题换成灯泡**（原来是扳手 emoji）；**「XiaoHei 指南」分组移到首页下面第一个**。
> - ** 字号按钮「A A A」→「小 中 大」**。
> - ** 全包原生弹窗清零**：桌面版（Electron）禁用 alert/prompt/confirm ⇒ 错误提示一律走家族 toast。
> - ** 对比度自动算**：主色（Comfy 黄）上的文字不再写死白色 —— 按 WCAG **实时算**最佳黑/白字色，
>   「三列表」这类黄底按钮现在是**黄底黑字**，清清楚楚。主色被稀释时（半透明底）会另算一份。
> - ** 「重命名」终于有反应了**：以前用的是浏览器原生弹窗，**ComfyUI 桌面版（Electron）禁用了它**
>   ⇒ 点了毫无反应。现在改成**行内输入框**（原地改名，回车确认 / Esc 取消）。
> - ** 新增家族通用模态框**：新建文件夹 / 删除确认 / 另存为 / 存到哪个文件夹
>   —— 全都不再依赖原生弹窗，改用自建的深紫主题对话框。
> - ** 全家族换成 Comfy 官方深紫 + Comfy 黄**：色板直接取自 Comfy Desktop 官方设计令牌
>   （`--color-neutral-800 #211927` 深紫底 / `--color-neutral-50 #f2ff59` Comfy 黄 / `--danger #e05858`），
>   跟官方桌面版启动页同一套气质。**旧的青蓝 `#1668b3` 官方色板里根本没有，已全部换掉。**
> - ** 设置面板更顺手**：「顶栏按钮」组移到**面板最顶部**；三项名字跟顶栏实际显示对齐
>   （`XH` / `工作流图标` / `灯泡`）；面板标题去掉齿轮 emoji。
> - ** 面板主题跟着 ComfyUI 走**：以前 auto 跟的是操作系统偏好（系统浅色 + ComfyUI 深色就错位了），
>   现在跟官方主题，并会随你切换 ComfyUI 主题自动重画。
> - ** 版本号不再写死**：帮助浏览器右下角版本号改成从后端动态取，不会再显示过期版本。
> - ** 顶栏按钮重新分工**：`XH`（设置，家族门面）·  灯泡（帮助）· **官方「工作流」图标**（工作流浏览器）。
>   工作流那颗用的是 **ComfyUI 官方原版 SVG**（从官方 CSS 的 data URI 里抠出来的，一字未改）。
>   字母 W 弃用 —— Pixaroma 已占用，两包同装并排两个 W 分不清谁是谁。
> - ** 顶栏帮助按钮： 笑脸 → 灯泡**：手绘描边灯泡 SVG（不是 emoji），颜色跟着主题走。
>   灯泡里就是**全部 XiaoHei 组件说明 + 使用指南**（新增「XiaoHei 指南」分组：节点配色 / 快捷键与面板入口）。
> - ** 配色面板里的「?」也换成灯泡**：点了直接跳到灯泡帮助的「节点配色」页。
> - ** 节点配色面板 = Pixaroma 原版整份搬运**（可拖动浮窗）：
>   **按住标题栏就能把面板拖到任何地方**；大号 SV 渐变平面 + 竖直色相条；
>   **标题栏 / 节点体** 双色分段切换；**两条 HEX 色号栏**（点色块复制色号）+ 中间**联动链条**；
>   **收藏夹 15 槽**（点 + 存当前、点套用、右键删除）；**45 格双色预设**；中文帮助浮层；恢复默认配色。
> - ** 官方节点也能配**：右键**任何**节点（含 KSampler 等官方节点）都有「 节点配色」，
>   选中时浮动工具条也出调色板按钮；多选一次改一批；`Shift+\` 直接开面板（可在设置里改键）。
> - ** 节点工具条上的配色键已删除**：配色统一走 **节点右键 →  节点配色**。
> - ** 选中工具条齿轮（节点按键颜色）**：点击 XiaoHei 节点时，官方「选中节点浮动工具条」出现  齿轮（仅含按键/开关的节点显示），点开可单独设置该节点所有按钮/开关的颜色；不设置时沿用家族中性配色，不影响其他节点。颜色存于节点 `properties.xhBtnColor`，仅选色时才写，存档干净。
> - ** 恢复默认配色**：XiaoHei 节点回分类默认色，官方节点回主题默认色。
> - ** 全家族自动配色**：按分类自动上色（工具灰蓝 / 图像天蓝 / 视频靛蓝 / 音频品红 / 数学番茄红 …），
>   **新增节点自动继承**，不用逐个写；标题字自动切黑/白保证可读；你自己选过的色永远不被覆盖。
>   设置里可切「按分类 / 统一色 / 关闭」。
> - ** 改动不再丢失**：XiaoHei 的控件在 `click` 里提交，而 ComfyUI 在 `mouseup` 时才抓快照 ⇒ 晚一拍 ⇒
>   以前改完画布不标脏、Ctrl+Z 撤不掉、下次打开静默回退。现在有被动捕获网兜住。
> - ** Ctrl+Z 后控件复活**：Nodes 2.0 下撤销会重建节点对象，页面上留着绑死旧对象的控件。
>   现在撤销后自动重挂（真机实测：摘掉→重挂→原位复活）。
> - ** 顶栏按钮可藏**：设置里能藏「 设置 / XiaoHei 工作流 / ? 帮助」（藏按钮 ≠ 关功能，快捷键照常）。
> - 顺手修一处既有硬伤：`xh_video_tools.js` 的 DOM 控件没锁高（Vue 下节点上下留大白、拖高空白等比变大）。

---

## 0. 安装（拿到就两步）

1. 把整个 `Comfyui-XiaoHei` 文件夹放进 `<ComfyUI>\custom_nodes\`
2. **重启 ComfyUI** —— 完事，节点搜索框里打 `XH` 就能看到本包节点（口径见开头，完整清单见 §1）。

**依赖怎么装**：
- 装了 **ComfyUI-Manager**（或从 Comfy Registry 一键装）的：Manager 会逐包读 `requirements.txt` 自动装齐，**你什么都不用做**。
- 直接解压 zip 的：用跑 ComfyUI 的那个 python 手动补一次（命令见 §5.0），装完重启。

本包启动时**只做自检、不会自己装包**：缺哪个包会在日志里点名，并给出能照抄的命令
（Comfy Registry 安全标准禁止自定义节点在运行时安装依赖）。日志长这样：

```
[XiaoHei]  依赖自检：缺 3 个 → opencv-python, scenedetect, rotary-embedding-torch
[XiaoHei]     请手动补一次："...python.exe" -m pip install opencv-python scenedetect rotary-embedding-torch
```

装齐后启动日志末尾会有这一行：

```
[XiaoHei]  已加载 126 个节点，来自 24 个模块
```

- **缺依赖不会让整包阵亡**：缺哪个包只少对应那一块节点，其余照常可用（详见 §5.0）。

>  本包**不含模型权重** —— 工作流里用到的模型要自己下，清单见 §5.4。

---

## 1. 节点清单

### 1.1 视频 / 图像（`memsaver` · `image_tools` · `seam_*` · `h3ltx_adapter` · `ltx_identity`）

| 子模块 | 原包 | class_type | 显示名 |
|---|---|---|---|
| `memsaver/` | Comfyui-XH_H3MemorySaver | `XHImagePrecision` | XiaoHei-图像精度 |
| | | `XHImageCacheWrite` | XiaoHei-图像落盘 |
| | | `XHImageCacheRead` | XiaoHei-图像读取 |
| `image_tools/` | Comfyui-XH_ImageTools | `XHImageResizeV2` | XiaoHei-图像缩放v2 |
| | | `XHImageBatchMulti` | XiaoHei-图像批量合并 |
| | | `XHImageRangeFromBatch` | XiaoHei-取帧范围 |
| | | `XHImageList` | XiaoHei-图片列表 |
| | | `XHImageMaskScale` | XiaoHei-图像遮罩缩放 |
| | | `XHImageSize` | XiaoHei-图像尺寸 |
| | | `XHImageGetByIndex` | XiaoHei-图像按序取 |
| | | `XHRefSheetBuilder` | XiaoHei-参考图拼接板 |
| | | `XHComposeVideo` | XiaoHei-合成并保存视频 |
| | | `XHVideoCombine` | XiaoHei-视频合成（2026-10-26 新增，**复刻第三方 VHS_VideoCombine 的能力但零第三方依赖**：帧+音轨→mp4/gif/webp，PyAV 直编不调 ffmpeg 子进程；参数对齐 VHS（format/pix_fmt/crf/trim_to_audio/pingpong/loop_count/save_metadata/save_output）；输出 `video`(VIDEO，可节点内预览) + `file_path`(STRING)；**带音画对齐自检条**，跑完一次后再改帧率会立刻红字报警「画面 7.68s vs 声音 8.00s」） |
| | | `XHConcatVideo` | XiaoHei-视频拼接 |
| | | `XHLoadVideo` | XiaoHei-加载视频（v1.9.33 复刻 VHS「Load Video (Upload)」的**精简实用版**；零新增依赖；DOM 上传按钮 + 拖拽上传 + 实时信息条 + **节点内嵌 `<video>` 播放器** + ** 一键折叠 6 个高级参数** + **▶ 预览总开关**，关闭即卸流不占内存） |
| | | `XHCompareVideos` | XiaoHei-视频对比（v1.9.40 复刻 easy-media「Compare Videos」的**多路版**；≤4 路视频网格同步 / 单看 / 两两滑块；差值信息条列每路 fps/帧数/时长及相对第 1 路差值；VIDEO 元数据走官方 getter 零新增依赖；「 选择文件」三目录扫盘多选） |
| | | `XHImageScaleByAspectRatio` | XiaoHei-按比例缩放 |
| | | `XHColorCorrect` | XiaoHei-色彩校正 |
| | | `XHMaskTint` | XiaoHei-遮罩上色（2026-10-31 新增，**收拢 SAM3 上色那套 9 个官方节点**；原图 + 身体遮罩 + 脸部遮罩(可选) → 上色后的帧序列；**接脸遮罩 = 只刷身体、脸留原样（表情保住）**，不接 = 全身刷色，一节点顶两版；色源可接 SCAIL2ColoredMask 输出做多身份配色；脸部外扩用 torch 手写十字膨胀（对齐官方 GrowMask 的 tapered 模式），零新增依赖；**工具条带可视化色板**：品牌 12 色 + 上色常用 8 色（纯绿/纯红/品红/纯蓝/纯黄/纯青/白/黑）+ 自定义，色号不用手敲 hex） |
| | | `XH_Sam3Patch` | XiaoHei-SAM3 追踪稳像（v1.44.0 新增，**猴补官方 tracker 的三个判死 bug**，不改官方文件）：① `_suppress_recently_occluded` 压制时只清「重叠区」不整个置 -10；② `_deferred_memory_encode` 的 shrink 保护只清「被抢走的像素」，本体保留 ⇒ 记忆里不再写「该人已不存在」；③ `_match_and_add_detections` 的 `keep_alive` 下限抬到 1 ⇒ **检测漏一帧不会把身份判死**（官方新建身份初值只有 1，漏检一帧即 ≤0 → 1772 行强制 NO_OBJ）；默认开启，关闭：环境变量 `XH_SAM3_KEEP_OCCLUDED=0`；官方源码升级后自动失配保护（跳过补丁并打日志） |
| | | `XHIdentityColorize` | XiaoHei-身份配色（2026-10-31 新增，**官方 SCAIL2ColoredMask 的可指定颜色版**，端口/输出与官方一一对应 ⇒ 可直接顶替；官方那个颜色是**写死的 6 色板**、只能选排序方式决定「谁拿第几号色」，本节点**颜色能手填**：按排序后顺序第1个人拿第1个色、第2个人拿第2个色……；排序口径（从左到右 / 从大到小 / 不排序）与官方逐字一致，**实测三档与官方输出逐像素相同**；**v1.43.2 起加「身份归并」**：官方 tracker 遇到遮挡会把前景那个人判死（`_suppress_recently_occluded` 打成 -10），复活后槽位编号会变（如 1 号变 2 号）⇒ 颜色会跟错人；本节点自动识别「中途复活的是同一个人」，让他**继承原颜色**（颜色跟人走，不是跟槽位走）；同时官方 tracker 必须 `max_objects` 比实际人数**多留 1~2 个余量**、文本提示词写成 `person:4`（不带 `:N` 时每帧只能检出 1 个人），否则被压制的身份永远复活不了；前端在节点里挂一条「身份色板」：一排色块（带 1/2/3 序号角标，一眼知道第几个人对应哪块）+「＋加一个人」+「清空」，点色块弹家族取色器换色；零新增依赖） |
| | | `XHVideoTimeline` | XiaoHei-视频分段轴（2026-10-31 新增，**在节点自带的播放器上拖拽把视频切成若干段**；段与段之间的切点可拖，按 index（接 XiaoHei-循环 的轮次）输出该段 start_frame / seg_frames，直接接 XiaoHei-加载视频 的「起始帧/取多少帧」⇒ **每段独立重跑 SAM3，人物换位置也不串号**；segments 由前端时间轴生成，不用手填帧号；V3 节点，index 是 force_input 口可直接接循环） |
| | | `XHImageListConcat` | XiaoHei-列表拼批（2026-10-31 新增，把「开了累计」的循环结束节点 outputs 那一串 IMAGE 批次**首尾相接拼成一个大批次** ⇒ 各段拼回完整帧序列再出视频； 必须 INPUT_IS_LIST=True，否则只拿到最后一段 / 或者被 V3 拆成逐份执行） |
| `image_tools/py/video_combine` | XiaoHei-视频合成（2026-10-26 新增，**复刻第三方 VHS_VideoCombine 的能力但零第三方依赖**；PyAV 直编不调 ffmpeg 子进程；输出 `video`(VIDEO，可节点内预览) + `file_path`(STRING)；**带音画对齐自检条**） | `XHVideoCombine` | XiaoHei-视频合成 |
| `seam_feather/` | XiaoHei-SeamFeather | `XHSeamFeather` | XiaoHei-衔接淡化 |
| `seam_correct/` | MinimaxH3_AutoContext | `XHSeamCorrect` | XiaoHei-接缝修正 |
| `h3ltx_adapter/` | XiaoHei-H3LTX-Adapter | `H3LTXAdapterLoader` | XiaoHei-H3LTX-适配器加载 |
| | | `H3LTXAdapterConvert` | XiaoHei-H3LTX-转换 |
| `ltx_identity/` | Comfyui-XH_LTXIdentity | `XHLTXIdentityOverlap` | XiaoHei-LTX锁脸 |

### 1.2 模型 / 采样（`lorastack` · `slider` · `xh_utils`）

| 子模块 | 原包 | class_type | 显示名 |
|---|---|---|---|
| `lorastack/` | Comfyui-XH_LoraStack | `XHPowerLoraStack` | XiaoHei-LoRA堆栈 |
| | | `XHPureLoraStack` | XiaoHei-纯LoRA堆栈 |
| `slider/` | Comfyui-XH_Slider | `XHSlider` | XiaoHei-滑块 |
| `xh_utils/` | XiaoHei 工具扩展 | `XHMathExpression` | XiaoHei-表达式求值 |
| | | `XHNumberConvert` | XiaoHei-数值转换 |
| | | `XHSamplerSelect` | XiaoHei-采样器选择 |
| | | `XHSolidMask` | XiaoHei-实心遮罩 |
| | | `XHVAEDecodeTiled` | XiaoHei-平铺VAE解码 |
| | | `XHShapeMaskOverlay` | XiaoHei-形状遮罩覆盖（二合一 v1.7.4：10 形状 + 独立出图 + 覆盖） |
| | | `XHBBoxRegion` | XiaoHei-区域限定框（2026-10-10 新增） |
| | | `XHSmartFaceMask` | XiaoHei-万能遮罩（v1.9.0：排除区用**占比**+内置拖拽编辑器，换图不用重调；一个节点复刻三节点工作流。2026-10-25 由「XiaoHei-智能遮脸」改名：不只遮脸，SAM3 认得出的目标都能遮；**v1.9.11 起支持多目标（要哪几个 = 全部/第N个/前N个）+ ID 上色（一人一色，新增 masks / id_map 两个输出口），为多人替换打底**；2026-10-25 另加：深度图合成（§1.10.1）+ **多个排除区一次框 N 块**（§1.10.2）+ **搜索区「只在绿框里找」**（§1.10.3，排除区的反面）） |

> `XHImagePadKJ` 是 `image_tools` 的内部依赖（被「补边」模式调用），不单独注册。

### 1.3 工具 / 流程控制（`controls` · `setget` · `chain_prompt` · `msr_relay`）

| 子模块 | 原包 | class_type | 显示名 |
|---|---|---|---|
| `controls/` | XH_GroupController 等三合一 | `XHForLoopStart` | XiaoHei-循环开始 |
| | | `XHForLoopEnd` | XiaoHei-循环结束 |
| | | `XHLoopIteration` | XiaoHei-循环迭代 |
| | | `XHLoopProgress` | XiaoHei-循环进度 |
| | | `XHLoopResult` | XiaoHei-循环收尾 |
| | | `XHGroupController` | XiaoHei-分组控制 |
| | | `XHLabel` | XiaoHei-标签 |
| | | `XHTimer` | XiaoHei-计时器（v1.45.1 修「归零」三连：计时状态存节点属性里 ⇒ ① 切工作流再切回来、② 进子图再出来，都不再归零；③ 一次排多条时显示**整轮队列总耗时**，不是最后一条的耗时） |
| | | `XHNumberCounter` | XiaoHei-数字计数器 |
| | | `XHMathInt` | XiaoHei-整数运算 |
| | | `XHMathFloat` | XiaoHei-浮点运算 |
| | | `XHSegmentTable` | XiaoHei-分段表（按段号给出本段时长 + 起始/结束/总段数；单位可选**秒 / 帧**；单位=帧且「帧数规矩」选了 H3 / LTX 时，段长填进去就**自动吸到合法帧格**（H3 = 17k+5、LTX = 8k+1，向上对齐），不必再接下游换算节点） |
| | | `XHToneCompensate` | XiaoHei-色调补偿 |
| | | `XHAudioFromVideo` | XiaoHei-视频取音（从 VIDEO 里取音轨，兼容官方 dataclass + 老式 dict 两种形态；顺带核对音画时长差，差 >0.25s 主动告警） |
| | | `XHResolutionSelect` | XiaoHei-分辨率选择器 |
| `controls/seed.py` | XiaoHei-种子（复刻 rgthree Seed，2026-10-09） | `XHSeed` | XiaoHei-种子 |
| `controls/boolean.py` | XiaoHei-布尔开关 + XiaoHei-切换（2026-10-09） | `XHBooleanToggle` | XiaoHei-布尔开关 |
| | | `XHBooleanSwitch` | XiaoHei-切换 |
| | | `XHShowText` | XiaoHei-显示文本 |
| `controls/xh_h3_latent_continuation.py` | XiaoHei-H3 latent接续（2026-10-23，接缝 latent 锚定；初版 import 导演台纯函数，当天改 XiaoHei 自研净室实现，只用官方 API，零三方依赖） | `XHH3LatentContinuation` | XiaoHei-H3 latent接续 |
| `controls/xh_h3_tst.py` | XiaoHei-H3 动作校正（2026-10-23，TST 推理时注意力校正，arXiv:2609.08505·MIT，XiaoHei 自研 H3 移植，零依赖） | `XHH3TemporalCorrection` | XiaoHei-H3 动作校正 |
| `setget/` | XiaoHei Set/Get（v1.9.38 内核重写：官方虚拟节点机制 + 补齐单路 + 与 KJ 互通） | `XHSet` | 设置 |
| | | `XHGet` | 获取 |
| | | `XHMultiSet` | 多路设置 |
| | | `XHMultiGet` | 多路获取 |
| `chain_prompt/` | XiaoHei-ChainPrompt | `XH_ChainPromptSelector` | XiaoHei-提示词表（**v1.10.0**：循环体内若「起始索引」口接了线就以它为准 ⇒ 只改循环的「起始索引」即可只跑 / 重跑第 N 段，图与提示词同源） |
| | | `XH_DynamicPromptJoin` | XiaoHei-提示词联结(动态) |
| `msr_relay/` | MSR 精修编码（2026-10-14） | `XHMSRRelayEncode` | XiaoHei-MSR精修编码 |

### 1.4 音频（`soundboard` · `audiosep` · `controls/audio_load`）

| 子模块 | 原包 | class_type | 显示名 |
|---|---|---|---|
| `soundboard/` | 声音播放（2026-10-05） | `XHSoundPlayer` | XiaoHei-声音播放 |
| `audiosep/` | ComfyUI-XH_AudioSep | `XHVoiceSeparatorLoader` | XiaoHei-人声分离(模型加载) |
| | | `XHVoiceSeparatorSampler` | XiaoHei-人声分离(采样) |
| | | `XHAudioDuration` | XiaoHei-音频取时长 |
| | | `XHSimpleMath` | XiaoHei-简易数学 |
| `controls/audio_load` | 官方 Load Audio（2026-10-16 复刻） | `XHLoadAudio` | XiaoHei-加载音频 |
| `controls/audio_from_video` | VIDEO 取音轨（2026-10-26 新增，纯官方 API） | `XHAudioFromVideo` | XiaoHei-视频取音 |
| `controls/audio_h3_sync` | ComfyUI-Pixaroma「H3 Audio Sync」（2026-10-30 复刻，MIT） | `XHH3AudioSync` | XiaoHei-H3音频同步 |
| `controls/audio_trim_frames` | 按帧裁音频（2026-10-30 新增，纯官方 API） | `XHAudioTrimFrames` | XiaoHei-按帧裁音频 |

XiaoHei-加载音频（2026-10-16 新增，复刻官方 `LoadAudio`）：解码内核（`f32_pcm` + `load`）用脚本
从 `comfy_extras/nodes_audio.py` **原文切出**，输出（waveform / sample_rate）与官方**逐字一致、
可直接互换**；`av` 走函数内软 import（缺了只废本节点，不拖垮 controls 其余 20 个）。
正主是前端自绘播放器：**粗时间线**（10px 轨道 + 16px 圆形拖把手，按住拖动实时 seek、
点击跳转、拖出节点外不断）+ 播放/暂停 + 时间显示 + 音量/静音滑块 + 信息条
（时长/采样率/声道，`/xh/audioload/probe` 路由）+ 上传/拖拽导入
+ **实时频谱律动条**（v1.14.4：Web Audio `AnalyserNode` 实时 FFT，40px 高 32 根竖条
随音乐跳动、条顶带峰值帽；AudioContext 全图共用一个，播放起 rAF、暂停/删节点停）。
** 文件夹模式 + 循环轮次索引**（v1.15.0）：「音频来源」切「 文件夹」后指定一个文件夹，
里面每个音频文件 = 一「段」，按文件名自然排序（001.wav → 第 1 个、002.wav → 第 2 个…）。
塞进 XiaoHei-循环 里**零接线**逐段换音频——循环体每轮自动喂真实轮次 `xh_loop_turn`（hidden），
段号直接取轮次；`起始序号` 有接线时以它为准（接 XiaoHei-索引 可任意跳段）；`轮次循环` 开 =
段号取模绕回，关 = 越界停在最后一个。第二输出 `实际序号` 把「这轮放的是第几个」带出来。
每轮只解码选中的那一个文件（AUDIO 不是 IMAGE 张量批次，绝不广播列表）。
工具栏「 文件夹」按钮选目录 / 填路径，预览与播放走 `/xh/audiolist/list` + `/xh/audioload/file`。
单文件模式老行为（控件顺序 / 存档位 / 解码内核）一字未动。
**普通 / 循环模式折叠**（v1.15.1）：工具栏「/」切换钮——普通模式只剩
音频下拉 + 播放器 + 信息条（293px，折叠前 405px），循环模式展开四件套（365px）。
模式状态由 source 值推导（不单独存）⇒ 老存档读进来默认小节点、新档自动记住模式。
 实锤：Vue Nodes 模式下 `computeSize=[0,0]` 对原生控件完全无效（405px 纹丝不动），
隐藏原生控件行唯一有效开关 = `w.hidden`（仅对无输入端口控件安全）；/ 按钮图标化
（5 按钮总宽 282 > bar 246 会换行撑乱）。顺手修：手动粘贴文件夹路径现在也会刷预览。
** 波形 + 选区**（v1.36.0，交互借鉴 ComfyUI-Pixaroma 的 Load Audio 波形，**MIT**）：
节点上画出整条音频的波形，**直接在上面拖出一段**：左边缘改起点、右边缘改长度、选区里拖 = 整段挪、
点一下（不拖）= 只挪播放游标去试听（选区原地不动）。**输出的 AUDIO 就是选中的那一段**
⇒ 不用再外接裁剪节点。两个秒数框（`起始秒` / `取多少秒`，0 = 到结尾）都能接线
（接片段秒数 ⇒ 音频长度自动跟画面对齐），也能手填；`短了怎么办` = 补静音 / 循环。
两个都留 0 = 整条原样输出（老工作流行为一字未变，新参数全在 optional 末尾 ⇒ 存档不串位）。
波形在**浏览器**里算（`fetch` + `decodeAudioData` 取 240 个峰值桶），后端不参与画图；
峰值缓存存**进行中的 promise**（存结果会让一次开图把同一首歌下载解码 5 遍），失败也缓存但只 10 秒。
拖的过程中只重画 canvas，绝不重新解码。选区按秒对所有音频一视同仁（文件夹/循环模式同理）。

XiaoHei-H3音频同步（`XHH3AudioSync`，2026-10-30 新增，复刻 ComfyUI-Pixaroma「H3 Audio Sync」，**MIT**）：
治的是 H3 的老毛病 —— H3 画面和声音是**一起生成**的，放着不管它就自己编一段声音，
嘴型动的是一首不存在的歌；事后把原曲盖上去也没用，因为嘴从头到尾就没照你的歌动过。
本节点把你的真录音塞进 latent 的**声音那一半并冻住**（`noise_mask` = 画面 1 / 声音 0，
走官方 `comfy.nested_tensor`），模型于是只剩一件事可做：画出配得上这段固定声音的画面。

- **接法**：`model` 透传（接给采样器，让节点串在链里而不是绕线）· `latent` 必须是 H3 的
  AV latent（接普通 latent 直接报错，不静默）· `audio_vae` 用 H3 的音频 VAE ·
  `track` 接你的歌（只要一段就先用 XiaoHei-加载音频 裁好）。**输出 `audio` 是裁到和画面等长的那条**，
  接给保存节点 —— 把整条没裁的录音给保存节点是唯一会悄悄毁掉成片的事（音画不等长）。
- **三个下拉**（XiaoHei 版把原版藏在全局设置面板里的偏好搬到节点上，看得见、能存档、跟着工作流走）：
  `最长片段` 5/10/15/20 秒·**自定义**（填多少秒都行）·不限（H3 只训到约 15 秒，超了先提醒）·
  `音轨短了` 补静音 / 循环 · `超长了` 只警告 / 停止运行。
   只有选「自定义」时「自定义秒数」那个框才露出来（选别的档位它被忽略），填 0 = 关守卫。
-  **v1.39.0：秒档位改成按「帧格」精确比**（2026-10-30 新增）
  H3 的合法片段长度只有网格上的值（**17n+5**：124 / 141 / … / 362 帧），而「最长片段」这个档位
  给的是**整秒** —— 两套口径对不上，换算会错位：5s=120 帧→最近合法帧 124（差 **+166.7ms**）、
  10s→243（+125ms）、15s→362（+83.3ms）。原来靠 0.25s 容差把它盖住了，那是**掩盖**不是修好。
  现在：秒档位**向上吸附**到网格上最小的合法帧，两边都是整数帧、**精确相等不用容差** ——
  5 秒档实际管 124 帧、10 秒档管 243 帧、15 秒档管 362 帧（H3 训练上限，不会误报）。
-  **v1.39.0：新增「索引（起始帧）」**（2026-10-30 新增，追加在 optional 末尾 ⇒ 老存档零影响）
  原来音轨起点**写死 0**（节点只会从音轨开头取），第 2/3 段生成时你必须自己先裁好音轨喂进来，
  **喂错了节点不会报错也不会警告**，音画直接错位。现在可以填起始帧（24fps，与画面同口径，
  支持负数倒数），或直接接 XiaoHei-分段表 的「起始帧」输出。
   最省事：前面接一个 XiaoHei-按帧裁音频（按帧裁好再喂进来），这里留 0。
- **状态条现在显示量化误差**：音轨是按【音频 latent 帧】(40fps) 对齐的，不是按视频帧 (24fps)，
  官方正向 `audio_latent_T = round(frames/24*40)` ⇒ 往返一趟最多差**半个音频 latent 帧 = 12.5ms**
  （实测稳定 ±8.33ms）。这是官方 latent 网格固有的、改不了，但以前它是隐形的暗坑，
  现在状态条直接写明「对齐误差 ±8.3ms」，让人知道这不是 bug。
- **为什么在波形上对齐、不给音频 latent 补 0**：给音频 latent 补 0 **不是静音** —— 0 只是
  latent 空间里的另一个点，解出来是嗡嗡声；而且那一流随后被冻住，模型会整段照着噪声画。
  真实采样点补真实 0 才是真静音。
- **数字口径全部读自官方** `comfy_extras/nodes_minimax_h3.py`（不靠记忆）：24fps、
  音频 latent 40fps、帧格 17n+5、训练区间 124~362 帧（约 5.2~15.1s）。已用官方
  `EmptyMiniMaxH3LatentAV` 逐档实测 7 组（5/124/141/158/192/226/362 帧）反推帧数与音频时长全部吻合。
-  **已知限制**（原作者写在源码注释里，照实保留）：`model` 全程原样透传。DiT 是从画面 sigma
  推音频 timestep 的，所以虽然声音被按住是干净的，模型仍被告知「它是 noisy 的」。
  要纠正需要 ComfyUI 目前不存在的 core hook —— 不做假补丁去蒙（猜错的代价是隐性画质损失）。
** 手动清单 + 音频列表区**（v1.15.2）：来源三选一（单文件 /  文件夹 /  手动清单），
循环模式下共用一块**带序号徽章的音频列表**（限高 132px 内部滚动）。手动清单 =
「 加音频」从任意文件夹多选 → 逐个**上传进 input 目录**并记文件名（原文件挪走不丢），
拖着改顺序、✕ 删单个、「清空」点两次才真清；文件夹列表只读。序号徽章金/银/铜/蓝
（#e6b800/#9aa7b3/#cd7f32/#3a7bd5，与图片列表逐字一致）。模式切换钮换琥珀 #EF9F27。
 修真 bug（存档错位一格）：官方 `configure` 遇到空串会跳过一位 ⇒ 前端回填**绝不能
filter 空值**，必须连空槽一起按原下标对齐。
**频谱贴底**（v1.15.3）：拖大节点时频谱律动区吃掉全部新增高度、信息条钉底，不再
留一大块空白；缩小自然回弹 89px。实现 = widgets 网格 flex:1 + 播放器行轨道
minmax(89px,1fr)（RO/MO 双观察器兜底重贴）； canvas 是替换元素，top/bottom
拉伸无效、auto 高落 HTML 默认 150，必须绝对定位 + calc 显式尺寸。
**视频输出口**（v1.15.4）：XiaoHei-加载视频 补第 4 个输出口 `video`（官方 VIDEO 类型），
可直接接官方「获取视频元素」。与官方 LoadVideo 同机制（`VideoFromFile` 原始文件
直通），零转码零损失；该口不受抽帧/缩放参数影响。
**内存保护**（v1.15.5）：XiaoHei-加载视频 默认「帧数上限=0=全量加载」且不缩放，加载长/大视频（如 1080p/212s≈158GB）会 MemoryError。已把逐帧循环与拼批 try 住
MemoryError，转中文提示「视频太大请设帧数上限或缩小尺寸」，避免裸 traceback。
**懒加载**（v1.15.6）：XiaoHei-加载视频 下游只接 audio/video 口、没接 images 口时，节点**跳过帧解码**、只吐音频（images 给 1 帧占位图）—— 彻底解决「只想提取音频却因视频太大爆内存」。接了 images 口才解码全帧。探测失败保守照常解码，不误跳。

### 1.5 宫格故事板（`storyboard` · 2026-10-09 新增，XiaoHei 复刻社区包）

XiaoHei 版复刻社区包 `ComfyUI-Storyboard-Tools`，**核心算法逐条一致**，所以老工作流里的
原包节点可以 1:1 换成 XiaoHei 版，出图结果不变（class_type 用新名字，两包可并存）。

| 子模块 | 原节点 | class_type | 显示名 |
|---|---|---|---|
| `storyboard/` | StoryboardGridGenerator | `XHStoryboardGrid` | XiaoHei-宫格底板 |
| | ImageContrastAdjuster | `XHImageContrast` | XiaoHei-图像对比度 |
| | StoryboardPanelCrop | `XHStoryboardPanelCrop` | XiaoHei-宫格切图 |

XiaoHei 增值（都不改默认行为）：底板多 `layout_mode`(自动/手动列×行) + `cell_mask`(格内蒙版)
+ `info` 文本；对比度多 `brightness`，原版写死的 0.25 折扣开放成 `strength`；
切图多 `order`(行/列优先) + `panel_count` 面板数。

### 1.4.5 H3 2K 精修（`openh3` · 2026-11-08 新增，Open-H3 Regenerate 2K）

复刻 **ComfyUI-OpenH3-VideoTools**（Tensor Alchemist · GPL-3.0）的 5 个节点，
并把 **ComfyUI-OpenH3-Regenerate2K**（Songssx · MIT）的 3 个节点**自持**进来。

| 子模块 | 原包 | class_type | 显示名 | 干什么 |
|---|---|---|---|---|
| `openh3/` | OpenH3-VideoTools | `XHOpenH3AutoInput` | XiaoHei-H3视频预处理 | CPU 预处理：时间戳归一到 CFR24、保留源比例（只补 ≤15px VAE 对齐边）、末帧补齐到 H3 时间格、抽对齐的立体声音轨 |
| | | `XHOpenH3PromptEncodeRelease` | XiaoHei-H3提示词编码 | 原生 CLIPLoader(minimax) + CLIPTextEncode，**编完立刻卸载 32B 编码器**，只出 conditioning |
| | | `XHOpenH3RefineRelease` | XiaoHei-H3精修 | 精修总控：UNETLoader → Open-H3 补丁 → Kitchen/KJ 低显存补丁 → 分块 → BasicGuider → SamplerCustomAdvanced，**跑完把整条模型链踢出显存** |
| | | `XHOpenH3VAEDecodeLowMemory` | XiaoHei-H3低内存解码 | 原生因果 H3 解码，只把**返回的图像缓冲**降 fp16，中间/采样精度一概不动 |
| | | `XHOpenH3TiledDiffusion` | XiaoHei-H3分块扩散 | 每个去噪步把 latent 切块、逐块跑 DiT、再按高斯/均匀权重混合（MultiDiffusion 风格） |
| | OpenH3-Regenerate2K | `XHOpenH3ModelPatch` | XiaoHei-H3模型补丁 | 挂主 LoRA（312 模块）+ 50 条 Sharp 调度曲线（挂 `adaln_proj.linear`） |
| | | `XHOpenH3Sigmas` | XiaoHei-H3官方步长 | 官方 sigma：3 步 `0.909375→0.857→0.667→0` / 2 步 `0.7→0.494→0` |
| | | `XHOpenH3LockAudio` | XiaoHei-H3锁定音频 | 联合 AV latent 挂 noise_mask：画面全 1（重绘）、声音全 0（锁死原音） |

** 为什么把 Songssx 那 3 个自持进来**：原版「精修总控」内部**硬查**这 3 个节点的 ID，
查不到直接 `RuntimeError` 拒绝启动。搬进本包后，外部那两个包**完全不装也能跑**。

**依赖状况**（分发给别人时最关心的）：

| 依赖 | 性质 | 缺了会怎样 |
|---|---|---|
| ComfyUI 官方核心（torch / av / `comfy.ldm.minimax.*` / NestedTensor / LoRAAdapter） | 官方自带 | 装不了 ComfyUI 就没这东西 |
| `imageio-ffmpeg` | pip 包，已写进顶层 `requirements.txt` | 只少「XiaoHei-H3视频预处理」1 个节点（转码用；其实 VHS 的 requirements 第一行也是它） |
| **KJNodes** | **可选**（`MiniMaxLowVRAMAttention` / `MiniMaxChunkFeedForward`） | **不阻断** —— 自动跳过这两层低显存补丁，仍可运行，只是峰值显存更高（8GB 强烈建议装） |

**XiaoHei 相对原版的三处改动**：
1. 默认参数按 8GB 降配：`head_chunks` 4→**6**、`ff_chunks` 4、分块 1024×768→**512×512**、重叠 256→**128**
2. 主 LoRA / Sharp 曲线的查找**放宽到递归子目录**（原版 `get_full_path` 只查 loras 根目录，
   用户把文件丢进 `loras/H3/` 就选不到 —— 这是原版最常见的踩坑点）
3. 缺 KJ 节点时**降级跳过**而不是直接报错；主 LoRA 模块数不对时，错误信息直接点名
   「你下的是 Kijai 的 rank-16 refiner 切片（208 个），请下官方完整版（312 个）」

**必需的模型**（不是 pip 包）：

| 文件 | 放哪 | 说明 |
|---|---|---|
| `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `models/diffusion_models/H3/` | 基模。**必须这一份** —— 它的 AdaLN 曲线表 sha256 = `c02a6c11…a229a8e7`，与补丁的硬校验完全一致 |
| `open_h3_regenerate_2k_lora.safetensors`（**312 模块**，11.6 GB） | `models/loras/`（子目录也行） | 官方完整主 LoRA。 Kijai 的 `minimax_h3_open_regenerate_2k_refiner_rank_16_bf16`（208 模块）**用不了** |
| `sharp_curve_branches.safetensors`（**50 条**，1.15 GB） | `models/loras/`（子目录也行） | Sharp 调度曲线，挂在 `adaln_proj.linear` 上 |

> 实测（2026-11-08，本机）：312 个主模块 + 50 条曲线**全部对上基模 target**，
> 曲线表哈希一致，锁音频 noise_mask 画面全 1 / 声音全 0 —— 纯 CPU 验证全绿。

**配套工作流**：本包**不分发工作流文件**，请用作者提供的 27 节点 / 27 连线 / 4 分区版本（8GB 降配）。
该工作流**零外部 OpenH3 包依赖**（8 个节点全在本包里）。
下拉框默认值已对准**本机实际文件名**（带 `H3\` 子目录前缀），可以直接跑。

| 分区 | 内容 |
|---|---|
| 一、输入与提示词 | 加载视频 → XiaoHei-H3视频预处理 → XiaoHei-H3提示词编码 |
| 二、编码与放大 | 编码视频/音频 → 合并 AV 潜空间 → 放大潜空间 |
| 三、精修 | XiaoHei-H3锁定音频 → XiaoHei-H3官方步长 → XiaoHei-H3精修（总控） |
| 四、解码与保存 | 分离 AV 潜空间 → XiaoHei-H3低内存解码 → 去掉补齐帧 → 保存视频 |

**本工作流按 8GB 显卡降配**（原版是给 32GB 卡写的）：

| 参数 | 原版（32GB） | XiaoHei 版（8GB） |
|---|---|---|
| 输出尺寸 | 2560 × 1440 | **1280 × 736** |
| 分块 | 1024 × 832 | **512 × 512** |
| 分块重叠 | 224 | **128** |
| 注意力分块 | 4 | **6** |
| FFN 分块 | 4 | 4 |

冲 2K 就把「放大潜空间」改成 `2560 × 1440`、分块改 `1024 × 832`、重叠改 `224` —— 32GB 卡才稳。

**还需要的外部件**（就这两个，都是大多数人已经装了的）：
- **KJNodes** —— `GetImageRangeFromBatch`（去掉末帧补齐）+ 两个低显存补丁。**缺了不阻断**，只是峰值显存更高
- **VideoHelperSuite** —— `VHS_VideoCombine`（导出 MP4）

验证记录（2026-11-08）：把外部 `ComfyUI-OpenH3-VideoTools` 和 `ComfyUI-OpenH3-Regenerate2K`
**移出 `custom_nodes/` 后重启**，8 个节点 + 全部依赖节点仍 100% 注册；
工作流转 API 格式喂 `/prompt` → **HTTP 200，0 节点错误**。

### 1.5 按分类统计

| CATEGORY | 节点数 |
|---|---|
| `XH/工具` | 34 |
| `XH/Video` | 32 |
| `XH/Image` | 33 |
| `XH/循环` | 5 |
| `XH/音频` | 4 |
| `XH/SetGet` | 4 |
| `XH/链提示词` | 3 |
| `XH/音频分离` | 2 |
| `XH/Model` | 2 |
| `XH/Identity` `XH/Video` `XH/音频工具` `XH/数学` `XH/Control` `_internal` | 各 1 |
| `XiaoHei/Character` | 1 |
| **合计** | **126** |

> 上表数字由脚本实测（`NODE_CLASS_MAPPINGS` 里逐节点读 `CATEGORY` 计数），不是估的。

### 1.6 XiaoHei-分辨率选择器（`XHResolutionSelect`，2026-10-09 新增）

| 项 | 说明 |
|---|---|
| 算法 | **逐行照抄官方** `comfy_extras/nodes_resolution.py` 的 `ResolutionSelector`（读本地源码核对，非照截图猜）：`scale = √(MP×1024² ÷ (宽比×高比))`，再按「倍数」取整 |
| 兼容 | 参数名 / 顺序 / 下拉**存档值** / 输出名与官方逐字一致 ⇒ 老工作流里直接替换官方节点，**连线一根都不用动**（实测 320 组「比例 × MP × 倍数」组合，输出与官方 100% 相同） |
| 比官方多 | ① 中文显示名 + 控件 / 端口中英切换 ② 节点上**实时显示最终生效宽高**（`1024 × 1024 · 1.00 MP`，前后端同一套公式、同一套取整规则）③ 未知比例 / MP 填极小 / 倍数填 0 都**不崩**（官方是 KeyError，或算出 0 把下游 Empty Latent 拖崩） |
| 刻意不做 | **不预设 27 档常用分辨率表**（第三方 TT 那套档位）：用不上的居多，画布上还占一大片 —— 要精确档位直接自己填数字 |

用法：接 `Empty Latent Image` / `EmptyImage` 的 `width`、`height`。换比例时总像素不变，不会一会儿清楚一会儿糊。
 它算的是「面积对、比例对」的尺寸（如 9:16 / 1.0 MP → 768×1368），**不是** 832×1216 这类精确常用档。

### 1.7 XiaoHei-种子（`XHSeed`，2026-10-09 新增，复刻 rgthree Seed）

- **来源**：rgthree-comfy `py/seed.py` + `web/comfyui/seed.ts` 逐行核对后复刻，接口一致（INT seed → SEED）。
- **特殊值**：`-1` 每次随机（节点默认）／`-2` 上次+1／`-3` 上次-1。
- **机制**：前端包一层 `api.queuePrompt`，排队瞬间把特殊值换成真种子，同时回写
  ① API prompt `inputs.seed` ② 工作流存档 `widgets_values`（出图元数据可复现） ③ `properties.last_seed`。
- **比 rgthree 多的**：`last_seed` 存档（重启后" 用上次种子"仍可用）；子图内种子节点同样支持；
  走 API 直连时后端兜底生成随机种子并回写元数据（±1 后端做不了，同 rgthree，只在排队时生效）。
- **UI（2026-10-09 按家族规范重做）**：标准工具条（中/EN + ）+ 中英双语（标题 / 控件 / 端口）
  + 三个 **DOM 真按钮**功能键（每次随机 蓝 / 生成固定值 绿 / 用上次 金，无上次种子时灰掉禁用）
  + **常驻状态条**（一眼看到现在是「每次随机」还是「固定 123456」，排队完闪 ` 本次出图用：xxx`）。
- **点击反馈（2026-10-09 补，用户反馈"点了没反应"）**：按下 = 缩一下 + 压暗回弹；点完 =
  按钮闪 ` 值`（1s）+ 状态条闪绿底 ` …`（1.6s）；拿不到上次种子时状态条闪 ``。
   之前用 LiteGraph 的 `addWidget("button")`（canvas 画的按钮，点下去没有任何视觉反馈），已全部换成 DOM 按钮。
- 已删除原生 `control_after_generate`（避免它抢着改写 -1）。

### 1.8 XiaoHei-布尔开关（`XHBooleanToggle`）/ XiaoHei-切换（`XHBooleanSwitch`，2026-10-09 新增）

| 项 | 说明 |
|---|---|
| 来源 | 官方 `comfy_extras/nodes_primitive.py` 的 **Boolean**（`PrimitiveBoolean`）+ `comfy_extras/nodes_logic.py` 的 **SwitchNode**（`ComfySwitchNode`，就是画布上那个「切换 #xx BETA」），逐行核对源码后复刻 |
| 为什么要做 | 官方开关上写的是 i18n 直译的「**为真实 / 为假实**」，正常人读不懂 |
|  根因 | 官方 `io.Boolean.Input("value")` **没填自带的 `label_on` / `label_off` 参数**（`comfy_api/latest/_io.py:247`），前端就 fallback 到 True/False 的机翻。填上这两个参数即可，**不用改前端、不用汉化包** |
| 接口 | 与官方**逐字一致**：布尔开关 = BOOLEAN 进 BOOLEAN 出（输入口也叫 `value`）；切换 = `switch` / `on_false` / `on_true` → `output`（MatchType，接 IMAGE 出 IMAGE、接 MASK 出 MASK）。**老工作流里直接替换，连线一根不用动**（已用官方 execute 逐项实测一致） |
| UI（1.6.2 定稿） | **节点就一行**：`中/EN · ` 贴在**最左**，滑块是 **56px 固定短轨道**钉在**最右**。拨到**右=开**（整条绿 `#27ae60`，钮上写「开」）、拨到**左=关**（整条红 `#c0392b`，钮上写「关」），0.22s 缓动。**点一下会自己滑过去，也能按住左右拖**。没有第二个按钮、没有状态条 ⇒ 节点高度与官方 Boolean 基本一样 |
| 藏起来的原生 widget | 官方那个「为真实/为假实」的布尔 widget **隐藏但保留**：只做**视觉隐藏**（高度 0 + `draw` 空 + DOM `display:none`），**绝不设 `widget.hidden=true`** ⇒ 值照样进 `widgets_values`，存档/载入不受影响，同时前端「widget↔端口共存」逻辑仍能认得它、照样画端口。 不能删：删了 `widgets[0]` 就让位，`widgets_values` 会串位 |
| 输入端口（1.6.4 修复） | **天生就有，不用右键**：节点创建 / 载入时直接挂 co-exist 输入口（input 带 `widget` 引用，与官方 WidgetInputs 扩展同构）—— 左侧端口 + 右侧滑块并存，跟官方 Boolean/切换一模一样。端口**没接线**时用滑块值当默认；**接上线**滑块自动变灰（值归上游）。 踩坑记录：1.6.3 及之前曾把原生 widget 标记成 `hidden=true`，官方「共存」逻辑一看 widget 是 hidden 的，就连它那个端口一起跳过了 ⇒ **端口死活不出现**。1.6.4 改成纯视觉隐藏（不设 hidden），端口正常显示了 |
| 比官方多 | ① 开关显示「**开 / 关**」（不是「为真实 / 为假实」）② 切换节点**两路都没接时给中文报错**，而不是静默出 None（官方是静默 None） |
| 精简掉了（1.6.1） | 布尔开关的 `invert` 取反、切换的 `info` 文本输出 —— 就是它们把节点撑成三四大行。要取反用官方的 `Invert Boolean` |

### 1.7 XiaoHei-显示文本（`XHShowText`，2026-10-09 新增）

| 项 | 说明 |
|---|---|
| 仿照 | pysssss `comfyui-custom-scripts` 的 `ShowText|pysssss`（读本地源码核对）；**机制逐字一致**：执行时把文本回写工作流存档 + `ui.text` 发前端铺成只读文本框，重开工作流还能看到上次内容 |
| 用法 | `text` 口是 forceInput，接任意字符串（色调补偿的 `info` / 表达式求值 / 分段表 / 提示词表…）就显示在节点上；输出 STRING 原样透传，可串在链路中间当"窥视口"；`OUTPUT_NODE=True`，也可当链路终点 |
| 比官方多 | ① 家族工具条（中/EN + ）② 节点上 ** 一键复制**当前显示文本 ③ 端口中文（文本 / 字符串）④ 显示框家族风淡显 |
| 移植坑 | 官方 `populate()` 用 `widgets.length = n` 清旧文本 —— 会把家族工具条（也是 widget）一起删掉；XiaoHei 版**只删 `text_N`**，其余保留 |

### 1.9 XiaoHei-形状遮罩覆盖（二合一 v1.7.4）/ XiaoHei-区域限定框（`XHBBoxRegion`，2026-10-10 新增）

| 项 | XiaoHei-形状遮罩覆盖（二合一） | XiaoHei-区域限定框 |
|---|---|---|
| 干什么 | **① 覆盖模式**（接了 `image`）：在原图上用形状蒙版把指定区域**填成指定颜色**；**② 独立出图模式**（不接 `image`）：用 `background_color` + 形状**凭空生成**成品图 | 用 **4 个比例参数**（相对真实图尺寸）定义一个矩形区域，输出 `BOUNDING_BOX` 喂 `SAM3_Detect.bboxes` |
| 形状 | **10 种**：圆 / 正方 / 矩形 / 半圆 / 1-4圆 / 椭圆 / 三角 / 十字 / 星形 / 放射扇形 | — |
| 输入 | `shape` / `coord_center` / `location_x,y` / `shape_width,height` / `scale` / `rotation` / `opacity` / `blur_radius` / `background_color` / `shape_color` / `frame_width,height` / `feather` / `invert` / `mask_locate` / `mask_margin`；可选 `image` / `mask` | `center_x` / `center_y` / `box_w` / `box_h`（均 0~1 比例）；可选 `image`（读真实宽高）或手填 `width` / `height` |
| 输出 | `IMAGE` + `MASK` + `BOX2` | `BOUNDING_BOX` |
| 仿照 | ComfyUI-Apt_Preset `create_mask_solo`（形状/旋转/透明度/模糊）+ kjnodes `CreateShapeMask`（形状生成），**一体化完成「选区 + 填色」** | 轻量替代官方 `CreateBoundingBoxes`（画布交互版） |
| 比原版多 | ① 零外部依赖（torch / PIL / numpy 都是 ComfyUI 自带）② `mask_locate` 借 SAM3 自动定位 / `mask_margin` 外扩 / `invert` 反转 / hex 自由填色 ③ `frame_width/height = 0` 即跟随输入图尺寸 ④ 覆盖模式额外输出 `BOX2` 边界框 ⑤ 编辑器所见即所得（拖拽中心/边缘，含 scale/rotation 实时预览） | ① 节点上带**可视化网格拖拽框编辑器**（直接拖拽定位、比例实时回写控件）② 坐标**直接基于真实图片尺寸算**，不会因网格基准不一致而错位 ③ 比例参数**可直接进 XiaoHei 循环**批量复用 |

**形状遮罩覆盖 5 个容易用错的点**：

- `coord_center` —— **画布中心** = `location_x/y` 是相对**画布中心**的偏移（推荐，默认）；**左上角** = 相对**左上角**偏移（兼容 Apt 旧习惯）。
- `shape_width/height` —— 对称形状（圆/方/半圆/三角/十字/星形/放射）**取两者较小值当直径**；`rectangle` 用**独立宽高**。
- `scale` / `rotation` / `opacity` —— 在基准尺寸上再缩放 / 绕形状中心旋转 0~360° / 填充不透明度 0~1。
- `blur_radius` 与 `feather` —— 等效的边缘柔化半径，**实际取二者较大值**（`feather` 为兼容旧工作流保留）。
- `mask_locate` —— **关** = 接了 `mask` 就直接拿它填充（SAM3 原样遮盖，`shape` 选项失效）；**开** = 只借 `mask` **定位目标中心 / 大小**，再自动按 `shape` 重新画遮罩盖上去。`mask_margin` 只在开启时生效（形状比目标框外扩的百分比）。
-  **想「无缝融合」就填那张图的实际背景色**到 `shape_color`，别套理论标准色、也别写 `#FFFFFF`。
-  **v1.7.4 修了一个"填了颜色没用、出来只有黑块"的老 bug**：`_draw_shape` 收到的是 `_hex_to_rgb()` 出的 **0~1 float 颜色**，却直接写 `int(rgb[0])` —— `int(0.184) = 0`，三个通道全被截断成 0 ⇒ **不管填什么色都画成纯黑**。
  只有「独立出图」和「`mask_locate=关` 的 mask 直填」这两条分支因为绕开 PIL、直接用 numpy 的 `solid` 而幸免，所以现象很迷惑：**同一个节点，开 mask 是黑的、关 mask 颜色又对了**。
  修法：`f = (int(round(rgb[0)*255)), int(round(rgb[1)*255)), int(round(rgb[2)*255)), alpha)`。**踩坑教训：PIL 只吃 0~255 的 int，任何 0~1 归一化颜色传进 `ImageDraw` 之前必须先 ×255 再取整（用 `round` 而不是 `int`，避免 0.999→0 的下溢）。**

**区域限定框的典型用法**：三视图里只让 SAM3 遮**中间那个人** —— `center_x=0.5`、`center_y=0.5`、`box_w=0.34`（中间约占 1/3 宽，留点余量）、`box_h=0.9`；接上同一张 `image` 让它自己读真实宽高。越界会自动回拉，保证框完整落在图内。

---

### 1.10.1  深度图合成：让 SAM3 懂「谁在前谁在后」（2026-10-25 新增）

**为什么需要它**：SAM3 是纯语义的 —— 它知道「这是个人」，但**不知道这个人离镜头多近**，也分不出两个人叠在一起时谁挡着谁。深度图补的就是这一维。

**接法**：`Load Depth Anything 3` → `Run Depth Anything 3` → `Render Depth Anything 3`（输出灰度深度图，**白=近**）→ 接到本节点的 **`depth_map`** 口。

| 参数 | 默认 | 说明 |
|---|---|---|
| `depth_map` | — | 可选输入。深度图（IMAGE）。**不接 = 本节点行为与之前完全一致** |
| `depth_mode`（ 深度用法） | off | `off`=不用；`sort`=按远近排序（最近的拿红色）；`occlusion`=重叠像素归更近的那个；`both`=两个都要 推荐 |
| `depth_near`（ 只留最近的） | 0.0 | 0=全留；0.5=只留最近的一半。视频里踢掉远处路人甲很好用 |

**实现要点（踩坑记录）**
- 深度值取「mask 区域内的加权均值」，且**先腐蚀 5px 再取** —— 深度图在目标边缘会糊，不缩一圈会把背景算进来。
- 目标太小（腐蚀后没了）自动退回用原 mask，绝不返回空分。
- 遮挡归属逐像素比较「谁的近度分更高」，近的独占该像素 ⇒ **覆盖面积守恒**（重叠区原来被两张 mask 各算一次，解决后只算一次）。
- 深度排完序后，下游选择必须把排序规则切成 `detect`，否则会被 `left_right` 重新打乱。
- 深度图尺寸/通道数不一致（三通道、16×16）都自动转灰度 + 双线性缩放到 mask 尺寸，不会炸。

**验证**：`xh_depth_test.py` **22/22 通过**（打分排序、sort、occlusion 像素守恒、both、只留最近的一半、无深度图/空 mask/尺寸不符/目标太小/三通道、不传深度参数时旧行为不变）。

### 1.10.2  多个排除区：一次框 N 块（2026-10-25 新增）

**痛点**：老排除区一次只能框一个地方 —— 画面左右各藏着一个误检源（logo、角落路人）时，只能顾一头。

**改法**：新增参数 `exclude_zones`（STRING/JSON），**追加在参数表末尾**（第 34 项），老 4 个参数一个字不动 ⇒ **老工作流零迁移**。

| 框 | 谁描述 | 说明 |
|---|---|---|
| 第 1 个框 | `exclude_cx/cy/w/h`（老参数） | 就是那颗可拖拽的**红框**，行为与旧版完全一致 |
| 第 2..N 个框 | `exclude_zones`（新参数） | JSON 数组：`[{"cx":0.2,"cy":0.3,"w":0.3,"h":0.4},{"cx":0.6,"cy":0.5,"w":0.2,"h":0.2}]`，口径与老参数同一套 0~1 占比 |

**前端编辑器**（红框下方）：
- **「＋ 加一个排除区」**：点一下就多一个**虚线框**（默认丢右上角，离红框和中心都远）；
- 每个虚线框都能**单独拖拽**（拖边缘缩放 / 拖中心移动，与红框同一套手感），带序号标签「附加区 2 / 3 / 4…」；
- 框右上角 **×** = 删掉这一个；**「 清空附加区」** = 一次全删；
- 状态行实时显示「附加区 ×N」；工具条文字随中/EN 切换。

**两种模式下都生效**：接模型 = 每块都涂黑了再喂 SAM3（只在其外找目标）；不接模型（手动模式）= 每块各画一个形状，按顺序一张张盖上去（mask 取并集，box 报并集外框）。

**容错**：JSON 写错不报错，自动忽略（等于没填）；`w/h ≤ 0` 的项跳过；超范围值夹紧到 0~1；数组元素也吃得下 `[cx,cy,w,h]` 简写。

**验证**：`xh_exclude_multi_test.py` **33/33 通过**（三种 JSON 写法 / 坏 JSON / 夹紧 / 容错跳过；涂块面积和、重叠区不重复计、边界夹紧、未夹紧输入安全跳过；手动模式多框叠画、单框与旧版逐字节一致、SAM 模式 mock 验证两块都涂进了喂给 SAM3 的图、总开关关了一块不涂）。

### 1.10.3  搜索区：SAM3 只在绿框里找（2026-10-25 新增）

**痛点**：排除区是「不找哪」，但很多时候真正想说的是「**只找哪**」——三人合照只换左边那位、远处的路人甲老是被一起检出、主角被背景里的同类干扰。靠排除区一圈圈挖背景太累。

**改法**：新增 6 个参数，**追加在参数表末尾**（第 35–40 项），老参数一个字不动 ⇒ **老工作流零迁移**。

| 框 | 谁描述 | 说明 |
|---|---|---|
| 第 1 个绿框 | `search_cx/cy/w/h`（新参数，默认居中 0.5/0.5/0.6/0.6） | 拖拽编辑器里那颗**绿虚线框** |
| 第 2..N 个绿框 | `search_zones`（新参数，JSON） | 格式同 `exclude_zones`，可同时框住多个人、但不框背景 |

**总开关** = `search_enable`（默认**关**，不开时行为与旧版逐字节一致；开关关着时编辑器里绿框整套隐藏、绿按钮禁用并提示「先开搜索区开关」，不会出现「加了框看不见」的灵异事件）。

> 2026-10-25（晚）：`exclude_enable` 默认值也改成**关**——从此**红绿两组默认都不显示**，新节点拖出来画布干干净净，想用哪组开哪个开关（老工作流存的是实际值，打开行为原样不变）；红框接上同一套开关门控（关 ⇒ 隐藏 + 按钮禁用「 先开排除区开关」）。
> **两组同时开时**：处理顺序 = 先裁搜索区（区外涂黑）→ 再挖排除区（区内涂黑），即 **SAM3 能看到的区域 = 搜索区内 − 排除区**；画布底部状态行实时显示「有效区=…」，不用猜。

**原理**：喂给 SAM3 的图 = 原图先把**搜索区外全部涂黑**（SAM3 物理上只可能在绿框里找到东西），再照旧把排除区涂黑。两步顺序不冲突（都是涂黑，取并集）；多框/重叠用布尔掩膜**精确并集**，不做矩形反相近似。

**两种模式**：
- 接模型 = 区外涂黑再喂 SAM3 —— 治「远处的路人甲」「三人合照只换左边」；
- 不接模型（手动模式）= 绿框 = **手遮框的活动范围**，形状只在绿框里画，区外一律不遮。

**前端编辑器**：绿框与红框**同一张画布、同一套拖拽手感**（边缘缩放/中心移动/×删除），工具条多一对按钮「＋ 加一个搜索区 /  清空搜索区」，状态行实时显示「搜索区 ×N」。红框 = 不找哪，绿框 = 只找哪，**两个可以同时用**（典型：绿框框住大厅、红框再挖掉背景里的广告牌）。绿框序号标签跟着模式走：SAM 模式「搜索区 1/2/3…」，手动模式「搜索范围 1/2/3…」。

**典型场景**：
- 三人合照只换左边那个 → 绿框框住左边 1/3，SAM3 再也看不见另外俩人；
- 视频里主角前后景分开 → 绿框只框主角区，深处路人甲物理上不存在；
- 「在这找、但别找那」→ 绿框框大厅，红框挖广告牌。

**验证**：`xh_search_area_test.py` **24/24 通过**（`_search_keep` 几何/并集/超范围夹紧/w=0 最小框；`_limit_search_area` 区外涂黑/区内原样/无 zones 原样返回；run() SAM 模式 mock 验证区外涂黑喂模型、+排除区同开两层都生效、多框两处可找中间涂黑、开关关喂原图；手动模式形状只在区内画、开关关全区画）。

## 1.10 XiaoHei-万能遮罩（`XHSmartFaceMask`，2026-10-12 新增，2026-10-25 由「XiaoHei-智能遮脸」改名；**2026-10-25 面板大扫除：参数按逻辑重排 + 形状跟着模式变 + 手动模式瘦身 + 老存档自动迁移**；v1.8.2 起「排除区」原理与三节点工作流等价；**v1.9.0 起排除区改「占比」+ 内置拖拽编辑器；v1.9.1 起 `shape=sam_mask` 直接出 SAM 原始遮罩；v1.9.2 配色三改；v1.9.3 起 `auto` 升级为「背景探测」；v1.9.5 起 `shape=head` = 目标框四向外扩（目标框以上）；v1.9.6 起 `auto` 取色改成「以目标为中心左/右/上外扩一圈」；v1.9.7 起 `auto` 取色基准可选 `color_pick_ref`，多目标不再拿并集大框去取色；v1.9.8 起新增「内置提示词」`prompt` + 可选 `clip` 输入，可省掉独立的 CLIPTextEncode 节点（3 个方块变 2 个）；**v1.9.9 起 `model` 变可选 —— 不接模型也不爆红，红框直接变「手动遮挡框」；v1.9.10 紧急修复 v1.9.9 遗留的 `run()` 签名 bug（拔模型线必崩）**）

**2026-10-25 面板大扫除 —— 参数太多看花眼**

| 改动 | 内容 |
|---|---|
| ① 参数重排 | 按「① 模式/形状 → ② SAM 找目标 → ③ 多目标 → ④ ID 上色 → ⑤ 排除区 → ⑥ 定位外扩 → ⑦ 外观 → ⑧ 冷门」重排。后端把「定义」与「顺序」拆开：`_PARAM_DEFS`（历史顺序，永不重排）+ `_PARAM_ORDER`（面板顺序，单一真源），以后调顺序只改一个列表，绝不会搬漏参数 |
| ② 形状跟模式变 | **SAM 模式**：`SAM3遮罩` / `目标框以上(四向外扩)` / 10 种套形状。**手动模式**：只给 10 种真正画得出来的形状（`SAM3遮罩`、`目标框以上`、`手动框` 三个档位不再出现）。只动下拉的**可选项**，原值一个不删 |
| ③ 手动模式瘦身 | 手动模式下自动藏掉：提示词 / 检测阈值 / 细化次数 / 找不到兜底 / 要哪几个目标 / 第几个 / 前几个 / 排序规则 / 取色基准（齿轮展开也不出现） |
| ④ 老存档自动迁移 |  参数顺序一改，`widgets_values` 就会串位。前端 `xhSMF_migrate()` 按**名字**把旧顺序（23 项 / 31 项两种）重排成新顺序；旧的 `manual_box` 档位自动映射成「手动模式 + rectangle」。**老工作流一行都不用改** |
| ⑤ 改名收尾 | 下拉里「SAM原始遮罩(只遮脸)」→「**SAM3遮罩(AI找什么遮什么)**」—— 旧名只遮脸，现在什么都能遮 |

**验证**：前端迁移/联动冒烟测试 **46/46 通过**（老存档 23 项、1.17.6 存档 31 项、新布局、named 存档、工具条残留空位、长度不符、两种模式的形状档位与隐藏项；另覆盖「新布局 31/33/34 项 → 补齐到 40」三条追加参数路径）；后端 40 个参数零丢失、旧行为回归全绿（多排除区单框时与旧版逐字节一致、搜索区开关关时与旧版逐字节一致）。

**v1.9.10（2026-10-12）紧急修复 —— `TypeError: run() missing 1 required positional argument: 'model'`**

**症状**：v1.9.9 装好后，**只要不接模型**（或拔掉 MODEL 线）就报 `TypeError: XHSmartFaceMask.run() missing 1 required positional argument: 'model'` —— 也就是「越修越坏」：本来是想让不接模型能用，结果不接模型直接崩。

**根因**（两处叠加）：
1. v1.9.9 把 `model` / `image` 从 `INPUT_TYPES.required` 挪进 `optional`，但**忘了给 `run()` 的形参加默认值**（还是 `def run(self, model, image, ...)`）。
2. ComfyUI 执行器对「**未连接的 optional 输入**」的处理是 —— **直接从传给 `f(**inputs)` 的 kwargs 里删掉这个键**（不是传 `None`）。于是 `model` 变成了「必需位置参数却没给」⇒ TypeError。

**修法**：`run()` **全部 25 个形参一律给默认值**（Python 语法要求：一旦某个形参带默认值，其后所有位置形参都必须带默认值，所以是一改全改）。副作用是好的 —— 现在**任何输入缺失都不会再抛 TypeError**（例如不接 image 会得到清晰的中文 `ValueError` 提示，而不是晦涩的 TypeError）。

**验证**（三层）：
| 层 | 内容 | 结果 |
|---|---|---|
| 桩测 | 9 条，**专门模拟「ComfyUI 省略未连接 optional 键」的真实调用** | 9/9 PASS |
| 端到端 API | 提交一个 `inputs` 里**完全没有 `model` 键**的 prompt（复刻报错路径） | **success**  |
| 回归 | 接模型 + `face:2` 的自动模式 | success，遮罩效果与 v1.9.9 一致  |

**教训（已固化进测试脚本）**：桩测**必须模拟 ComfyUI 的真实调用行为** —— 未连接的 optional 键要「从 kwargs 里删掉」，而不是在脚本里手写 `model=None`。v1.9.9 的桩测就是因为在脚本里手动补了 `model=None`，才把这个 bug 漏过去了。

---

**v1.9.9（2026-10-12）新增【手动模式】—— 不接模型也能跑，红框即遮挡框**

`model` 从 `required` 挪进 `optional`：**拔掉 MODEL 线不再爆红**。不接模型（或把 `shape` 选成新增的 `manual_box` 档）时，节点自动进「手动模式」：

| | 接了模型 | 不接模型（手动模式） |
|---|---|---|
| 那个可拖拽的框 | 排除区（这块不找目标，只喂 SAM3） | **最终遮挡框**（拖到哪遮到哪） |
| 遮成什么形状 | 由 SAM3 找到的目标决定 | 由 `shape` 决定（矩形 / 圆 / 椭圆…） |
| 遮挡色 `auto` | 以取色基准往外扩一圈取色 | **以红框往外扩一圈取色**，照样融合背景 |
| 显存 | 吃 SAM3 模型 | **零模型、零显存** |

- **两个概念正交**：红框管「遮哪儿」，`shape` 管「遮成什么形状」，遮挡色管「融什么色」。
- `head` / `sam_mask` 这些「要模型才有意义」的档位，在手动模式下一律退化成**实心矩形**，不会报错。
- `exclude_enable` 开关对手动模式无影响（本来就没 SAM3 可喂）。
- **输入槽位零迁移**：四个输入口顺序严格保持 `model → image → conditioning → clip`，与 v1.9.8 逐位相同；实测老工作流载入后连线完全正确落位。
- 实测：`元婴1.png` 上「老版接模型 face:2」与「新版同输入」遮罩像素数**完全相同（7048）**，回归零影响。

**v1.9.8（2026-10-12）新增【内置提示词】—— 可选省掉 CLIPTextEncode 节点**

用户诉求：「把写提示词那个盒子并进遮罩节点里，整张图少一个方块」，并明确要求：
**「不填提示词也必须正常跑，不能爆红」**。

**为什么不把「模型加载」也一起融合**：模型加载是 ComfyUI 全局缓存 + LRU 卸载在管的活。
塞进检测节点会让模型变成「节点私有」，破坏全局缓存复用、换模型要进检测节点改下拉，
且同一模型无法给别的节点共用 —— 8GB 显存下多占一份直接 OOM。**所以只融合「读提示词」这半边**：
CLIP 与 MODEL 本来就是同一个 `CheckpointLoaderSimple` 一次装载出来的，
把 CLIP 接到本节点只是「把已经装好的机器借来用一下」，**不额外加载任何模型、显存零增长**。

**实现**（新增 1 widget + 1 可选输入）：

| 新增 | 类型 | 说明 |
|---|---|---|
| `prompt` | STRING widget，默认 `person` | 加在 required **最末尾**（老工作流 positional 对齐）|
| `clip` | CLIP 可选输入 |  **必须排在 `conditioning` 之后**，否则老工作流的 conditioning 槽位会被挤位 |

**四条分支全部兜住，任何组合都不报错**：

| 情况 | 结果 |
|---|---|
| ① 接 CLIP + 框里有字 | 节点内部 `clip.tokenize` + `encode_from_tokens_scheduled` → 自己的 conditioning |
| ② 接 CLIP + 框是空的 | **自动用 `person`** ← 「不填也能跑」的保证 |
| ③ 没接 CLIP | 完全老行为：用外部 `conditioning` 输入 |
| ④ 编码抛异常 | 捕获后退回外部 `conditioning` |

**GPU 真机实测**（`元婴1.png` 1536×1024，SAM3 int8）：

| 用例 | 遮罩像素 | 结果 |
|---|---|---|
| A. clip + `face:2` | **59677** | success |
| B. clip + 空框（→face） | 55732 | success |
| C. 不接 clip + 外部 `face:2` conditioning | **59677** | success |
| D. 不接 clip + 什么都不给 | 0 | **success（不崩，原图安全输出）** |

> A 与 C 的遮罩像素**完全一致（59677）** ⇒ 内置编码与走 CLIPTextEncode 的结果逐像素相同。

**工作流形态**：3 节点 → **2 节点**
```
CheckpointLoaderSimple ──MODEL──┐
                        └─CLIP───┴─→ XiaoHei-万能遮罩（内置提示词 "person"）
```
演示工作流：`XiaoHei 智能遮脸_演示工作流_v198.json`（已删掉 CLIPTextEncode，CLIP 改接到本节点）。

---

**v1.9.7（2026-10-12）`auto` 取色的【取色基准】可指定 + 外圈彻底降级**

用户问：「取色是取左侧大目标的外围还是中间小目标的外围？」→ 实测答案是**两个都不是**。

**问题 1：多目标时取色基准是「所有目标的并集外接框」**

`SAM3_Detect` 内部写死 `individual_masks=False` ⇒ 输出 union mask；`_pick_box` 取**并集外接框**。
`元婴1.png`（1536×1024 三视图）实测：

| | 框 | 尺寸 |
|---|---|---|
| 目标 1（左大特写） | `(171,314,405,617)` | 235×304 |
| 目标 2（中间小） | `(631,105,696,186)` | 66×82 |
| **union（节点实际用的）** | **`(171,105,696,617)`** | **526×513** |

再按「左0.5 / 右0.5 / 上0.9」外扩 ⇒ 左右各扩 263px、上扩 462px，全部顶出画面被 clamp ⇒
**取色区 = `(0,0,958,617)` = 整图 62%×60%**，根本不是「哪个目标周围」，而是「左上大半张图」。

**修法**：新增参数 **`color_pick_ref`**（追加在 required 末尾，老工作流 positional 不受影响）：

| 值 | 含义 |
|---|---|
| `center`（默认） | **最靠画面中央的那个目标**（三视图 = 中间那个人）|
| `largest` | 面积最大的那个目标（特写占主导的构图）|
| `union` | 所有目标的并集外接框（v1.9.6 及以前的旧行为，留作回退）|

实现：`_runs` / `_split_boxes`（**x 或 y 投影切分**，纯 torch、**零依赖**；投影切不开时退化成并集框）/
`_pick_color_box` / `_other_target_boxes`。**其他目标框一并从取色圈里挖掉**，免得圈里混进别人。

同一张图三种基准的取色圈实测：

| `color_pick_ref` | 基准框 | 取色圈 | 占整图 |
|---|---|---|---|
| `center` | `(631,105,696,186)` | `(598,32,728,186)` | **8% × 15%**（紧贴小目标）|
| `largest` | `(171,314,405,617)` | `(54,41,522,617)` | 30% × 56% |
| `union` | `(171,105,696,617)` | `(0,0,958,617)` | 62% × 60% |

**问题 2（顺带修掉的 bug）：外圈偷偷变成主路径**

v1.9.6 的择优条件写成了 `r_ring >= 0.15 and r_ring >= r_edge`，等于「目标圈还必须比外圈更纯」。
纯色背景图的外圈几乎 100% 同色，目标圈只要掺一点头发就比不过 ⇒ **外圈永远是赢家**，
正是用户抱怨的「你为什么老想着整个图片的边缘」。现在改成：**目标圈占比 ≥15% 就认目标圈**，
外圈只在目标圈花到没有统一色时才轮到。

>  只改「取哪儿」，**不影响「遮住哪些目标」**——遮罩仍按并集走，一个不少。
>  形状档（圆/方…）的**取色**也走取色基准，但**形状本身仍套并集框**，行为不变。

**验证**：桩测 14/14 全绿（含 x/y 双方向切分、连通退化成并集、`center` 命中画面中央目标、
`largest` 命中最大目标、`union` = 并集框、碎点过滤、`extra_void_boxes` 生效）；
GPU 真机 `run()` × 3 组全 success（1.7~2.3s）；
前端 Playwright：`color_pick_ref` 标签「取色基准」+ 选项中文「最靠中间的目标」✓，
**载入 v1.9.6 老工作流后 `shape=head`/`shape_color=auto`/`expand_*` 全部正确对齐、`badCombos=false`** ✓，
老节点 `XHShapeMaskOverlay` 下拉仍不含 `head`/`color_pick_ref`（红线守住）✓。

**v1.9.6（2026-10-12）`auto` 取色改成【目标左/右/上外扩一圈】，图像最外圈降为后路**

**用户诉求**（原话）：「它不能够直接，就它在自动选择颜色的时候，直接选择左右、左边右边上边扩展大概多少，取一个值合适的平衡点，做不到吗？」「取色是以左右上的外圈取色，而不是以下取色，你别带了下。」「你为什么老是想两外圈儿啊，就是整个图片的边缘。」

**v1.9.3 那版为什么被改**：v1.9.3 把 `auto` 做成了「**先看整张图最外圈**（四边各 5% 宽）的颜色众数，边缘不够纯才退回目标周围环带」。缺陷：它本质是**猜「照片边缘 = 背景」**——人一旦占满画面，肩膀/头发压在最外圈，就会取到衣服色。而且取色位置是个**黑盒**，用户完全无法干预。

**v1.9.6 三级策略**（同样零额外模型、零新增参数）：

| 优先级 | 取色区域 | 算法 |
|---|---|---|
| ① 主取 | 目标框向左扩 `expand_left` 个目标宽、向右扩 `expand_right` 个目标宽、向上扩 `expand_top` 个目标高，**下边一步不往下（到目标框底边就停）**，再挖掉目标框本身 ⇒ 剩「上 + 左 + 右」那一圈 | 圈内像素每通道量化 16 级取**众数桶**，占比 ≥15% 且 ≥ 最外圈时才采纳 |
| ② 后路 | 图像最外圈（上下左右各 5% 宽） | 同上；**只在①算不出统一点的颜色时才轮到它** |
| ③ 兜底 | ①那圈的均值 → 默认灰白 `#C7C7C7` | — |

**关键收益 —— 取色位置从此可控**：圈子大小直接由 `expand_left/right/top` 决定，**调大就把取色位置往背景上推**。大婚婉儿（人占满画面）实测：上扩 `0.0` → `#554C42`，上扩 `0.9` → `#463D34` —— 参数确实在控制取色位置。

** 为什么「下方不扩」**：目标框的下面就框底，再往下常是脖子 / 衣服 / 附属物，取下去必然取到人身上（该设计源自人脸场景，用户原话「脖子以下脖子是有颜色的呀」）。所以 `expand_bottom` **不参与取色**，取色圈的下边界永远 = 目标框下边。

**实测**（GPU + 真模型，4 张图 x `auto`）：

| 图 | SAM3 目标框 | v1.9.5（改前） | v1.9.6（改后） | 四角参考 |
|---|---|---|---|---|
| 元婴1（白底三视图） | (171,314,405,617) 234×303 | `#F4F3F2` d2 | `#F4F3F2` d2 | `#F1F1F0` |
| 雷万鹤1（4K 白底） | (343,428,1022,1144) 679×716 | `#FEFEFE` d57 | `#FEFEFE` d57 | `#CCC5BF` |
| 温夫人三视图（黑底） | (171,211,451,469) 280×258 | `#090A0A` d2 | `#090A0A` d2 | `#070708` |
| 大婚婉儿（暗调） | (720,95,795,177) 75×82 | `#453D35` d35 | `#463D34` d34 | `#745B50` |

⇒ 在背景够纯的图上两者结果**基本一致**（差 0~1）——因为两处取到的都是背景色；**真正的变化是取色位置从「黑盒」变成了「可调」**，并且下方绝不再碰到脖子。

**参数可调性验证**（桩测，纯几何）：同一张图 `box` 固定，`expand_r` 0.5 → 取到蓝、3.0 → 取到红；`expand_l` 0.5 → 蓝、3.0 → 绿 ⇒ 左右扩确实在驱动取色位置。

**验证**：
- 桩测：纯色背景取背景色 ✓；**目标框正下方是纯红、上/左/右是纯蓝 → 结果纯蓝（红一点没被取）** ✓；`expand_t=3.0` 仍不取下方 ✓；噪声/极小图/box 越界均不崩 ✓
- 真机：5 组（`sam_mask` / `head` / `circle` × 4 张图）全 `success`，新代码在实例里正常加载运行
- 前端：`auto` 按钮提示同步改成「取目标左/右/上外扩那一圈里最多的颜色，用「左扩/右扩/上扩」调远近」

**对老工作流的影响**：**零**。参数一个没加（复用 `head` 档已有的 `expand_left/right/top`），`run()` 签名、参数顺序完全不变。

---

**v1.9.5（2026-10-12）`shape=head` 重做：从「脖子以上整块（全宽）」改成【目标框四向外扩】**

**v1.9.4 为什么被推翻**：v1.9.4 的 `head` 是「**横向铺满整幅图** + 从**图像顶边**一直切到脖子线」—— 实测**遮得太多**，等于把上半张图整块抹掉，用户原话「你遮住的地方太多了，单纯只想遮住那个小脸儿，小脸儿以上」。

**用户要的语义**：**以 SAM3 的定位框（目标框）为中心，手动决定四个方向各往外扩多少**——向左扩多少、向右扩多少、向上扩多少、向下不扩。

**v1.9.5 实现**（锚点 = SAM3 找到的目标框，**中心不动**）：

| 新参数 | 单位 | 默认 | 含义 |
|---|---|---|---|
| `expand_left` | **目标宽** 的倍数 | `0.50` | 左边界从目标框左边再往左扩 0.5 个目标宽；`0`=不扩；**负值=往内收** |
| `expand_right` | **目标宽** 的倍数 | `0.50` | 右边界同理 |
| `expand_top` | **目标高** 的倍数 | `0.90` | 上边界往上扩 0.9 个目标高（≈ 盖到框顶以上）；想只盖到框内就调小 |
| `expand_bottom` | **目标高** 的倍数 | `0.00` | **默认 0 = 刚好停在目标框底边**，不啃脖子和衣服 |

- 四条边算完 **clamp 在图像内**；这个模式**不套任何形状**，出来的是一块矩形。
- 颜色**不再强制背景色**：走 `shape_color` —— 填 `auto`（或点色板旁「自动」）就跟背景融合；填色值就是实心色块。
- `mask_margin` / `shape_scale` / `rotation` 在 `head` 模式下**不生效**；`opacity` / `blur_radius` / `invert` 照常生效（`blur_radius` 调 10~20 可让边缘柔和过渡）。

> **为什么不再用「全宽 + 顶边」**：那个做法唯一的优势是「不用调参」，代价是把整个上半张图都变成背景色 —— 人物身体、手臂、旁边的道具全被吃掉。四向外扩把控制权交回给你：**只想遮头就只扩上**，想连脖子一起遮就把 `expand_bottom` 加到 0.4~0.6。

> **真机实测**（GPU + 真模型 `sam3.1_multiplex_int8…`，8 连跑全 `success`；`大婚婉儿.png` 1672×941，SAM 原始目标框 = 76×82 @ (720,95)）：
>
> | 设置 | 遮罩框 (x0,y0,x1,y1) | 宽×高 | 视觉效果 |
> |---|---|---|---|
> | 左0.5 右0.5 上0.90 下0 | (682, 22, 832, 176) | 150×154 | 罩住**整个头**（发冠顶到下巴），只占画面 **9.0%×16.4%** |
> | 上扩 **0.30** | (682, 71, 832, 176) | 150×105 | 只到额头，**少遮 49px** |
> | 上扩 **1.60** | (682, 0, 832, 176) | 150×176 | 顶到图顶（clamp） |
> | 下扩 **0.50** | (682, 22, 832, 216) | 150×194 | 往下多探 40px（到脖子） |
> | 左右 **0.05** | (716, 22, 799, 176) | **83**×154 | 只框住目标，明显收窄 |
>
> 换算核对：上扩 0.9 → 遮罩顶在**框顶之上 73px = 0.89 个目标高** ✓；下扩 0 = 遮罩底 `176` vs 框底 `177`，**差 1px** ✓；左右 0.5 → 宽 150 ≈ 目标宽 76×(1+1.0)=152 ✓
> ⇒ **四个方向各自独立、且数值精确按「目标宽 / 目标高倍数」换算**，不是估的。
>
>  对比 v1.9.4 的同参数效果：v1.9.4 是**全宽 × 从图顶切到脖子**（1672×208 ≈ 整条上部），v1.9.5 只有 **150×154** —— 差了一个数量级。

参数个数从 19 → **23**（四个新参数**追加在末尾**），前端实测：载入 v1.9.4 的老演示工作流（只有 17 个 widget 值）后，**`shape=head` 正确恢复、新参数取默认值、零个红色下拉** ⇒ 老工作流照常载入。

**v1.9.4（历史）**：`shape=head` 初版 = 脖子以上整块（全宽 + 顶边到脖子线，固定涂背景色）。**v1.9.5 已按用户反馈改成四向外扩**，v1.9.4 的行为不再提供。

**v1.9.3（2026-10-12）auto 取色升级为「背景探测」**：用户实测反馈 —— v1.9.2 的 `auto` 只取「**目标框外扩 30% 环带**」的均值，而三视图里目标周围**全是头发和衣服** ⇒ 取到的色偏成「衣服色」，跟真背景差得远。
现在改成**两级策略**：
1. **先取「图像四周 5% 宽边缘带」的颜色众数**（每通道量化到 16 级、找最大桶）：三视图 / 白底写真这类纯色背景，边缘带绝大多数像素就是背景本身 ⇒ **众数色 ≈ 真背景色**；众数占比 ≥ 15% 就认定它是背景，直接用它。
2. 边缘不够纯（背景复杂 / 大面积渐变）时，才**退回**原来的「目标框环带均值」。
> 实测（`遮罩区实际色` vs `外圈中位参考`）：元婴1 **0.7** / 雷万鹤1 **0.3** / 温夫人三视图 **2.7** / 大婚婉儿 **18.0**（同一张图用固定灰 `#C8C8C8` 则是 **115.3**）。
> **不需要任何抠图模型（RMBG / BiRefNet / rembg）** —— 见下方「为什么不上背景移除模型」。

**v1.9.2（2026-10-12）三件事**：① `exclude_color`（排除块色）默认 `#D64541` → **`#000000` 纯黑** —— 经真机实测**黑/白/红三色对 SAM3 检测结果无影响**（mask IoU 0.9925~0.9966），按「**黑=排除**」惯例定黑；只有原图本身大面积暗色时才建议换白。**它不是 mask 的 0/1，而是涂在图上的颜料**（靠和周围反差起作用）。② `shape_color`（遮挡色）默认 → **`#C8C8C8` 灰白**（与老节点 `XHShapeMaskOverlay` 的形状色默认一致）。③ `shape_color` 支持 **`auto`** —— 前端色板旁多一个「**自动**」按钮：点一下遮挡色改成 `auto`，运行时**自动取「目标框外扩 30% 环带」像素的平均色** ⇒ 跟着人物周围背景/头发走，盖上去最不突兀。**纯 torch 均值统计，不需要任何额外模型**。
> 实测（元婴1.png，真模型）：目标框外环带平均色 `#878482`，`auto` 实际盖出 `#878481`（**差 0.5**，几乎完全一致）；固定 `#C8C8C8` 与背景差 **67.5**。4K 雷万鹤1.png 同理：环带 `#CFC6BE` / auto `#CEC5BD`（差 0.7）。

**v1.9.1（2026-10-12）三件事**：① `shape` 新增 **`sam_mask`（SAM 原始遮罩，已设为默认）** —— 不再套任何形状，直接把 SAM3 吐出的 mask 盖回原图（加 `face` 提示词就**只遮脸、头发不碰**）；② 遮挡色 / 排除块色从「手敲 hex 文本框」换成 **可视化色板**（点一下弹家族取色器：12 色 + 自定义），并解释了 `exclude_color` 为什么值得留着；③ 老节点 `XHShapeMaskOverlay` **依旧零改动**。

**为什么要它**：老方案遮目标要 **3 个节点**（`XHShapeMaskOverlay` 盖图 → `SAM3_Detect` 找目标 → `XHShapeMaskOverlay` 套形状）。本节点把这 3 步收进 **1 个节点**。**老节点 `XHShapeMaskOverlay` 零改动**，老工作流原样可用。

**内部流程（= 老工作流逐行复刻）**：

```
原图 ──┬─→ ① 按 exclude_* 参数盖一块（exclude_color）→「盖过的图」
       │       ② SAM3 吃「盖过的图」→ 它在被盖区域不找目标，只在剩余区域找
       │       ③ 覆盖（三条支路）：
       │          · shape=sam_mask  → 直接用 SAM3 原始 mask 盖回原图
       │          · shape=head      → 以目标框为锚点，四向各自外扩（expand_left/right/top/bottom）→ 一块矩形
       │          · shape=圆/方/…   → 拿 mask 的 bbox → ×(1+mask_margin%) → 按 shape 重画
       └─→ ④ 形状色覆盖到【原图】→ 输出
```

**`sam_mask` vs 套形状（同一个目标，真机实测）**：

| shape | mask 填充率(面积/外接框) | 说明 |
|---|---|---|
| `sam_mask` | **0.64**（不规则） |  目标本身的轮廓，**不是**方框；面积只有方框的 **53.6%** |
| `square` | 1.00 | 贴边方框（外扩 15% 后） |
| `circle` | 0.78 | 正圆 |

⇒ 想要「**只遮 SAM3 认出来的那个东西**」（脸、头部、任意目标轮廓）就选 `sam_mask`；想要「**统一形状的遮挡审美**」才选圆/方/星形等。

** 核心机制（用户实测验证过的原理）**：SAM3 **会看输入图**。先盖住「不要找目标」的区域（例如左侧那张大特写），SAM3 就不会在那里找目标 → 只在剩余区域找到你真正想遮的那个目标。这就是老工作流节点 28 的作用。

**为什么不用 `bboxes`**：v1.8.0/1.8.1 曾改用 `SAM3_Detect.bboxes` 限定搜索范围，但**与用户验证过的老工作流不等价**（`bboxes` 框住区域时 SAM3 行为 ≠ 涂色遮盖）。v1.8.2 改为**完全照搬老工作流的涂色遮盖链路**。

** v1.9.0 修「换图就废」**：v1.8.2 的 `exclude_x/y/w/h` 是**像素**——在 3840×2161 上调好的 `-44/-1/1500/1496`，换到 1536×1024 就变成盖住 **94.8%×100%（整张图）** → SAM3 找不到目标 → 什么都不遮。v1.9.0 把排除区四个参数全部改成 **0~1 占比**（`exclude_cx/cy` 中心 + `exclude_w/h` 宽高），并按当前图尺寸换算像素：

- 同一组 `0.19 / 0.346 / 0.379 / 0.692` 在 3840×2161、1672×941、1536×1024 上都盖住 **37.9% × 69.2%**（左边距 0.1%）→ **换尺寸不用重调**。
- 默认值就是老像素参数在 4K 图上的等价换算（与老工作流实际盖的块 **IoU = 99.52%**）。
- 同时给节点挂上了 **可视化拖拽编辑器**（复用 `XiaoHei-区域限定框` 那套 `xhBox_setup`，225 行 DOM canvas）：节点 body 里直接显示**真实输入图 + 网格 + 红色排除框**，拖边缘缩放、拖中心移动、点空白定位 —— 想要精调随时拖，不用算数字。

**输入（20 必填 + 1 可选）**：

| 参数 | 默认 | 说明 |
|---|---|---|
| `model` | — | SAM3 模型（CheckpointLoaderSimple） |
| `image` | — | 干净原图 |
| `shape` | **sam_mask** | **跟着「模式」变**（2026-10-25 改）：**SAM 模式**给 `sam_mask` = 直接用 SAM3 找到的遮罩（写什么提示词找什么：`face`=脸、`person`=人、`hand`=手，头发衣服一概不碰）默认；`head` = 目标框以上(四向外扩)（以目标框为中心，`expand_left/right` 按目标宽、`expand_top/bottom` 按目标高，四边独立外扩，下扩默认 0 只到框底）；`circle`/`square`/`rectangle`/… = 只借 mask 定位，再用该形状覆盖。**手动模式**只给真正画得出来的 10 种形状（矩形/圆/椭圆/三角/十字/星形…），红框拖到哪遮到哪 |
| `expand_left` / `expand_right` | 0.50 / 0.50 | **只有 `shape=head` 用**：左/右边界各往外扩多少个「**目标宽**」（0=不扩，负值=往内收） |
| `expand_top` / `expand_bottom` | 0.90 / 0.00 | **只有 `shape=head` 用**：上/下边界各往外扩多少个「**目标高**」。上 0.9 ≈ 盖到框顶以上；下 0（默认）≈ 刚好停在框底 |
| `exclude_enable` | **False**（2026-10-25 前是 True） | 开=先盖排除区再找目标；关=全图找。2026-10-25 起默认改**关**——新节点拖出来画布干干净净（没有默认大红框），要排除哪块再手动开；**老工作流存的是实际值，打开行为原样不变**。开关关着时编辑器红框整套隐藏、红按钮禁用（黄字「 先开排除区开关」），跟绿组（搜索区）完全对称 |
| `exclude_cx` / `exclude_cy` | 0.19 / 0.346 | 排除块**中心**占整图比例（0=最左/最上，1=最右/最下） |
| `exclude_w` / `exclude_h` | 0.379 / 0.692 | 排除块**宽高**占整图比例 |
| `exclude_color` | **#000000** | 盖排除区的颜色（**默认纯黑**）。作用 = 把那块「抹平」，让 SAM3 认不出东西；**只喂 SAM3，绝不出现在最终输出**（节点工具条上是**色板**）。实测黑/白/红效果一致，按惯例用黑；原图大面积暗色时再换白 |
| `exclude_zones` | **""**（空） | 2026-10-25：**第 2..N 个排除区**（JSON 数组 `[{"cx","cy","w","h"}, ...]`，0~1 占比，口径同老参数）。空 = 只有第 1 个框（= 旧版行为）。平时用编辑器里的「＋ 加一个排除区」维护，不用手写；要手写/粘贴 JSON 时展开齿轮就能看到这个框。写错不报错，自动忽略。详见 §1.10.2 |
| `search_enable` | **false**（关） | 2026-10-25：**搜索区总开关**。开 = SAM3 只在搜索区里找目标，区外涂黑（治「远处路人甲被一起检出」「三人合照只换左边」）；关 = 不限制（默认，行为与旧版一致）。与排除区可同时开：先裁搜索区、再挖排除区。手动模式 = 手遮框的活动范围。详见 §1.10.3 |
| `search_cx` / `search_cy` | **0.5** / **0.5** | 2026-10-25：**第 1 个搜索区**中心 X/Y（0~1 占比，默认居中） |
| `search_w` / `search_h` | **0.6** / **0.6** | 2026-10-25：**第 1 个搜索区**宽/高（0~1 占比，默认中间六成） |
| `search_zones` | **""**（空） | 2026-10-25：**第 2..N 个搜索区**（JSON，格式同 `exclude_zones`）。编辑器里的「＋ 加一个搜索区」维护，绿框组；开关关着时绿框整体隐藏。详见 §1.10.3 |
| `threshold` | 0.5 | SAM3 检测阈值 |
| `shape_scale` | 1.0 | 形状再缩放 |
| `mask_margin` | 15 | 形状比目标框外扩 %，同老节点 `mask_margin` |
| `shape_color` | **#C8C8C8** | 最终遮挡色（**默认灰白**）。节点工具条上是**色板**：点开弹家族取色器（12 色 + 自定义）；色板右侧有「**自动**」按钮 —— 设成 `auto` 后走**背景探测**（先取图像四周边缘带的颜色众数，不纯才退回目标框环带均值），**零额外模型** |
| `opacity` | 1.0 | 不透明度 |
| `blur_radius` | 0 | 边缘高斯模糊 px |
| `rotation` | 0 | 旋转角度 |
| `invert` | False | 反转（形状外填充） |
| `fallback_draw` | False | 找不到目标时兜底在排除区外画形状 |
| `refine_iterations` | 2 | SAM 解码器细化轮数 |
| `conditioning`（可选） | — | 文字提示，如 `person` |

**输出**：`image`（遮好目标的图）＋ `mask`（**实际用到的 mask**）＋ `face_box`（目标框）。

> 注：`mask` 输出 = 实际覆盖用的那张 mask。`shape=sam_mask` 时它**就是 SAM3 的原始轮廓**（不规则、贴目标）；`shape=圆/方/…` 时才是套完形状的 mask（如 217×217 的方）。

**等价性验证（2026-10-12，真模型 + GPU 实测）**：
- **v1.8.2（像素版）**：测图 `雷万鹤1.png`（3840×2161），参数 `left_top, -44, -1, 1500, 1496` → 最终图像与老工作流 **max diff = 0 / 8,298,240 像素** 
- **v1.9.0（占比版）**：同样 4K 图、换成占比默认值 → 与老工作流金标准**差异 > 20 的像素仅 396 / 8,298,240（0.005%）**，mask IoU vs v1.8.2 = **99.08%** 
- **v1.9.0 跨尺寸**（同一组占比 `0.19/0.346/0.379/0.692`，GPU 真模型三连跑，全部 `status: success`）：
  | 图 | 尺寸 | 结果 |
  |---|---|---|
  | `雷万鹤1.png` | 3840×2161 |  遮住中间人物的头（217×217） |
  | `温夫人三视图.png` | 1672×941 |  遮住中间人物的头（101×101） |
  | `元婴1.png` | 1536×1024 |  遮住中间人物的头（85×85）——**换图不再"什么都不遮"** |
- **v1.9.1 `sam_mask` 真机验证**（GPU + 真模型 `sam3.1_multiplex_int8…`，5 连跑全 `success`；4K 首张 17.8s，后续 3s/张）：
  | 图 | 尺寸 | shape | mask 面积 | 外接框 | 填充率(面积/框) |
  |---|---|---|---|---|---|
  | `雷万鹤1.png` | 3840×2161 | `sam_mask` | 27,700 | 190×198 | 0.736 |
  | `温夫人三视图.png` | 1672×941 | `sam_mask` | 5,021 | 90×89 | 0.627 |
  | `元婴1.png` | 1536×1024 | `sam_mask` | 3,871 | 75×81 | **0.637** |
  | `元婴1.png` | 1536×1024 | `square` | 7,225 | 85×85 | 1.000 |
  | `元婴1.png` | 1536×1024 | `circle` | 5,653 | 85×85 | 0.782 |

  ⇒ 同一个目标：`sam_mask` 面积只有 `square` 的 **53.6%**、填充率 0.64 ≠ 1.0 ⇒ **遮的确实是目标的轮廓，不是方框** 
- **v1.9.2 真机验证**（GPU + 真模型 `sam3.1_multiplex_int8…`，两批共 10 连跑全 `success`）：
  | 验证项 | 结果 |
  |---|---|
  | **排除色 黑 vs 白 vs 红**（4K 雷万鹤1，同参数只换色） | mask 面积 27817 / 27697 / 27696，**IoU 0.9925 / 0.9934 / 0.9966** ⇒ **颜色不影响检测结果**，黑/白/红等效  |
  | **auto 取色**（1536 元婴1） | 环带均值 `#878482` → auto 盖出 `#878481`（**差 0.5**）；固定 `#C8C8C8` 差 **67.5**  |
  | **auto 取色**（4K 雷万鹤1） | 环带均值 `#CFC6BE` → auto 盖出 `#CEC5BD`（**差 0.7**） |
  | **square + auto** | 方框 + 自动色同样生效（`#9F9F9E`） |
  | 新默认值生效 | `object_info` 返回 `exclude_color=#000000` / `shape_color=#C8C8C8`  |
- **v1.9.3 真机验证**（GPU + 真模型，5 连跑全 `success`；`遮罩区实际色` 对比 `外圈中位参考` = 独立基准）：
  | 图 | 尺寸 | 模式 | 遮罩区实际色 | 背景参考 | 色差 |
  |---|---|---|---|---|---|
  | `元婴1.png` | 1536×1024 | auto | `#F3F3F1` | `#F4F3F2` | **0.7** |
  | `雷万鹤1.png` | 3840×2161 | auto | `#FEFDFE` | `#FEFEFE` | **0.3** |
  | `温夫人三视图.png` | 1672×941 | auto | `#09090A` | `#0B0C0D` | **2.7** |
  | `大婚婉儿.png` | 1672×941 | auto | `#4B433A` | `#665147` | **18.0** |
  | `大婚婉儿.png` | 1672×941 | 固定 `#C8C8C8` | `#C8C8C8` | `#665147` | 115.3 |

  ⇒ 同一张 `大婚婉儿.png`：固定灰差 **115.3**，auto 差 **18.0** ⇒ **auto 把「白框」变成了「跟画面同调的环境色」** 

** 为什么不上「背景移除模型」（RMBG / BiRefNet / rembg）**
用户提出能不能接抠图模型来取背景色。结论：**这个场景不需要，也帮不上忙**。
- 抠图的产出是「前景 mask」；拿到之后能做的只是**在背景区像素上取色**。而「边缘带众数」本来就是在背景区取色 —— 两者拿到的**是同一堆像素**。
- 尤其像 `大婚婉儿.png` 这种**人物几乎占满画面**的图，抠完背景只剩画面四周那一圈暗色，取色结果与边缘众数法**完全一致**。
- 代价却是实打实的：要额外下模型（RMBG-2.0 ≈ 880MB / BiRefNet ≈ 970MB）、装依赖、吃显存和时间。
- **唯一**抠图更优的场景：背景复杂且人物占比很小时，抠图能排除「误入边缘带的人物像素」。但那种图背景占比大，边缘众数本来就必然命中。
⇒ 所以 v1.9.3 只用纯像素统计，**零模型零依赖**。若以后真遇到边缘众数失效的图，再考虑做成可选分支。

** 教训：判断图片颜色只能靠数值采样，不能靠肉眼看预览。**
有些看图工具会做自动增亮 / 自动对比度，**暗调图会被显示成浅色调**。实测 `大婚婉儿.png` 预览看着是「浅灰背景」，实际像素主色是 `#4B433A` / `#453D34` 一类**深棕黑**（全图主色 TOP6 全是深棕黑，浅灰一个都没有）。
⇒ 调色 / 取色一律以「采样出来的 hex」为准。

**踩坑提示**：
-  `exclude_*` 现在是**占比**（0~1），换尺寸不用重调。但它绑的是「**相对位置**」——如果新图里人物的位置/构图变了（比如大特写从左边挪到了右边），还是要重拖一次（在节点内编辑器里拖一下即可，不用算数字）。
- 兜底仍受图尺寸影响：`fallback_draw=True` 且找不到目标时，按 `W×0.34 / H×0.34` 画（本来就按比例，无问题）。
- SAM3 找不到目标 + `fallback_draw=关` ⇒ 原图原样输出、`mask` 全零，**不报错**。
- 遮得太大/太小 → 调 `mask_margin`（**只对套形状模式有效**）；位置不对 → 在编辑器里拖红框。
- `shape=sam_mask` 时 `mask_margin` / `shape_scale` / `rotation` **都不起作用**（不套形状，没东西可缩可转）；能用的是 `opacity` / `blur_radius` / `invert`。
- `shape=head` 时：范围**只看 `expand_left/right/top/bottom`**（`mask_margin` / `shape_scale` / `rotation` 不生效）；`shape_color` **生效**（填 `auto` 就跟背景融合，填色值就是实心色块）；`opacity` / `blur_radius`（边缘柔和过渡）/ `invert` 照常生效。
- `head` 模式下 SAM3 找不到目标 + `fallback_draw=关` ⇒ 原图原样输出（不遮），和 `sam_mask` 一致。
- 老节点 `XHShapeMaskOverlay` 是 `shape=square` 时取「宽高较小值」当直径，本节点的 `exclude_w/h` 是**纯矩形**（不取较小值），换算成占比后几乎一致（差几 px）。
---

### 1.13 XiaoHei-Qwen21 编辑四件套（`qwen21_edit` · 2026-11-09 新增）

1:1 复刻 `ComfyUI-BlueBox`（MIT，Copyright (c) 2026 zhoutingxi）的 4 个零偏移编辑节点。
算法逐字一致，只改 class_type / 显示名 / tooltip / CATEGORY 这些接线标识；**原包照旧可装，两套并存**。

| class_type | 显示名 | 干什么 |
|---|---|---|
| `XHQwen21Cut` | XiaoHei-Qwen21约束裁切 | 把任意尺寸图约束到 Qwen-Image 2.1 的「不动点」标准尺寸（32 倍数），并输出 width / height / resolution 给文本编码器 |
| `XHColorCalibrator` | XiaoHei-局部色彩校准 | 只把「编辑过」的区域按原图回压颜色，区域外原样保留；输出 image / mask / changed_ratio + 结果预览 |
| `XHImageSliderCompare` | XiaoHei-双图滑块对比 | 两图叠放拖分割线看改图前后，base64 内联预览不落盘，右键可保存 / 复制单张 |
| `XHLoadImageWithMask` | XiaoHei-加载图像(带遮罩) | 加载本地图并给遮罩：mask_file → 同名 _mask → alpha → 全零；EXIF 自动转正 + 叠色预览 |

- **零新增 pip 依赖**：`scipy.ndimage.distance_transform_edt` 换成 `cv2.distanceTransform`（家族存量依赖），15 组用例逐像素实测 0 差异；其余全是官方自带。
- 前端走家族共享双语表（中/EN + 工具条 + 参数标签 + 端口名），滑块 UI 在 `web/xh_qwen21_edit/`。
- 未搬运 `BlueBoxBridge` 的 4 条路由与 273KB 遮罩编辑器 —— 那是给 Bridge 用的，本链路不需要。

### 1.12 XiaoHei-画板（`XHPaint`，2026-11-06 新增，1:1 复刻 Paint Pixaroma · MIT）

节点上只有一颗「Open Paint」按钮，点开是一个全屏画室：多图层（拖拽排序 / 不透明度 /
混合模式 / 合并 / 压平）、铅笔 / 笔刷 / 橡皮 / 涂抹 / 填充 / 形状 / 吸管、撤销栈；
往关闭的节点上拖图片会自动新增顶层图层。输出 `image / width / height`，合成图落在
`input/xh_paint/`，文件一改就靠 mtime 触发重跑。

- 后端 1 个节点 + 4 个 `/xh/paint/...` 路由；前端 78 个代码模块（含 shared/framework 依赖）+ 212 个图标资源（照抄原版 `assets/icons`，经 `/xh/paint/api/asset` 伺服）
- **零新增 pip 依赖**；原版可选的 AI 去背景（需 rembg 模型）明确降级，其余功能完整
- 实现 1:1 照抄，只改了类名 / 扩展名 / 路由前缀 / 落盘子目录这几个接线标识
- 来源 `ComfyUI-Pixaroma` v1.4.250，MIT License, Copyright (c) 2026 pixaroma
- 同包另有几处同样来自该项目、同样遵循 MIT / Copyright (c) 2026 pixaroma 的 1:1 复刻：`XHLabelPix`（XiaoHei-浮字标签）、`XH_TagPrompt`（XiaoHei-标签提示词：标签库 + 全屏编辑器 + @/*/# 补全 + 齿轮浮动设置窗口）、`XH_PromptStack`（XiaoHei-提示词堆叠：多行开关 / 拖拽排序 / 纯点击分隔符 + 齿轮浮动设置窗口）

### 1.11 XiaoHei-MSR精修编码（`XHMSRRelayEncode`，2026-10-14 新增；v1.9.35 面板精简 / v1.9.36 面板空白修复）

| 项 | 说明 |
|---|---|
| 干什么 | **按「每段自带的时长」把多段提示词贴到视频的不同时间段上** —— 第 0~2 秒只认「女孩特写」，第 2~5 秒只认「长胡子的男人」。给 LTX 2.5 二采精修用，让切镜点上的提示词不串味（专治「切镜晚了 → 女孩长出胡子」） |
| 面板 | **只有 2 个文本框**（其余 7 个全收进 ，默认收起）：① `全局提示词`（整段不变：人物长相/风格，可留空）② `分段提示词`（每段画面 + **段尾写时长**） |
| 怎么写 | 一段一行；想一段写多行就用一行 `---` 夹开：<br>`女孩特写，她低头看着掌心 [3]`<br>`---`<br>`镜头转向男人，他脸上长出胡子 [4]` |
| 时长标记 | `[3]` / `[3s]` / `[3秒]` = 本段 3 秒；`[0-3]` / `[3-7]` = 跨度 3 秒 / 4 秒（起点不用管，节点按顺序自己衔接）。 标记必须写在**该段末尾** |
| 输出 | `model`（已挂时段遮罩）· `positive` · `info`（每段的起止帧/秒，**外加「时长总和和视频长度对不对得上」的红/绿判决**） |
|  里的 7 个 | `fps`（秒→帧基准）+ 硬度六件套：`epsilon`（越小边界越硬 —— **防串味主开关**）· `video_window_scale` · `video_strength`（0 = 关掉分段）· `audio_epsilon` / `audio_strength` / `audio_window_scale`（**「声音该说话时没说话」就调它俩**） |
| 支持模型 | **LTX（含 2.5）**、Wan；其余架构明确报错（不猜） |
| 与上游 `ComfyUI-PromptRelay` 的关系 | 算法**同源**（同一篇 Prompt Relay 论文），实现**完全自持** —— `msr_relay/engine.py` **不 import 上游任何东西**，只用 comfy 官方模块 + torch + 标准库 ⇒ 零第三方依赖，可独立分发，也可与上游节点并存 |
| 比上游多做的 4 件 | ① **秒→帧自动换算**（上游三个编码器都只吃「像素帧数」，分镜稿上写的却是秒）② **「硬度」六件套内置**（上游 **Smart 版没有 `relay_options` 口**，接不了高级选项节点）③ **段长结果用 `info` 输出**（上游 Smart 版也没有解析结果输出口，段数配错只能靠报错猜）④ **文字与时间绑在同一条里** ⇒ 上游那套「段数必须和 `segment_lengths` 数相等，否则 `ValueError`」的手工活没了 |
|  和上游的本质差别（**秒数是真是假**） | 上游 Smart 的 `[0-3]` 只被当成**相对比例**：`weight = 3` × 100000 后必然被 `min(latent_frames, …)` 钉满，末步 `p * target_total / total_pixel` 是**纯比例分配** ⇒ `[0-3]\|[3-7]` 与 `[0-30]\|[30-70]` **完全等价**，视频多长都按比例铺满、**静默漂移**。本节点给的是**绝对秒数**（`round(秒 × fps)`）：对得上就精确对齐；偏短则尾段裸露、偏长则整体压缩 —— **两种情况 `info` 都会算给你看**。 |

> 前端还带一条**常驻状态行**：实时显示「共 N 段 ｜ 已标时长 M/N」并给 / —— 没写时长的段后端会直接报错，画布上先看得见。

>  **v1.9.36 家族前端修复（所有节点通用）**：以前「工具条 / 状态条上下各留一大块空白、节点拖得越大空白越大」。
> 根因是 Vue Nodes（Nodes 2.0）把控件渲染成 CSS Grid，行高按 `shouldExpand(type) || hasLayoutSize` 判 `auto`，
> 而 `hasLayoutSize = typeof widget.computeLayoutSize === "function"` —— DOM widget 的**基类自带**它
> ⇒ 每个 DOM 控件行都是 `auto`，节点多余的竖向空间被平摊灌进去（**只写 `computeSize` 对 Vue 无效**）。
> 现统一走 kit 的 `lockDomWidgetHeight(widget, px)`（定死 `computeSize` + 抹掉 `computeLayoutSize`）
> ⇒ 行变 `min-content` 不再吃空间，多余空间只给文本框这类真正的可生长控件 —— 与官方节点行为一致。
> 会生长的（图片画廊 / 3D 预览 / LoRA 行栈 / 滑块）**不要调**它。

---

## 2. XiaoHei-声音播放（`soundboard/`）

仿社区 `pysssss` 的 PlaySound，但**音效文件下拉改成实时扫描本地音效库**：往目录丢文件 + F5 就能选到，不用重启。
比社区版多了 **循环播放** 开关（配 `⏹` 停止按钮）。

| 参数 | 类型 / 范围 | 默认 | 说明 |
|---|---|---|---|
| 任意信号 | 任意（通配口） | — | 触发用。接上游任意输出即可，本节点只透传、不改数据 |
| 音效文件 | 下拉（读盘生成） | 第一个文件 | 音效库全部文件，按「分类 · 名字」显示 |
| 音量 | FLOAT 0 ~ 1 | `0.6` | 0 = 静音，1 = 拉满 |
| 播放时机 | `always` / `on empty queue` | `always` | 立即响 / 队列清空才响 |
| 先掐掉上一声 | BOOLEAN | `True` | 连跑时避免几声叠在一起（只掐本节点自己上一声） |
| **循环播放** | BOOLEAN | `False` | **关 = 只播一遍；开 = 一遍放完从头再来，一直响**。适合 `music` 类；短音效循环会变噪音 |

**节点上的小按钮**：`中/EN` `` ｜ `▶` 试听（不跑工作流）｜ `⏹` 停止（**循环播放靠它停**，播放中变红）｜ `` 重扫音效库（= 刷新页面）。

**循环怎么停**：点 `⏹`；或**再跑一次工作流**（新一轮开始会自动掐掉上一轮的循环）；或刷新页面。

**音效库目录**：`web/sounds/<分类>/`

| 分类 | 中文名 | 内置数量 | 内容 |
|---|---|---|---|
| `ui` | 提示音 | 8 | 叮 / 咚 / 咔嗒 / 完成 / 失败 / 警告 / 消息 / 升级 |
| `sfx` | 音效 | 13 | 嗖 / 啪 / 哐 / 金币 / 快门 / 弹簧 / 上升 / 叮咚 / 心跳 / 气泡 / 魔法 / 转场 / 鼓点 |
| `music` | 音乐 | 6 | 辉煌 / 悬疑 / 轻松 / 紧张 / 胜利 / 温柔 |
| `voice` | 人声 | 0 | 预留给自己的配音片段 |

> 内置 27 个音效全部是**本地纯合成**（正弦 + 泛音 + 指数衰减包络 + 噪声 + 频率扫掠 + 琶音 / 和弦），
> 16bit 单声道 WAV，合计约 2.6 MB，**无版权问题、不需要联网、不依赖任何素材库**。

**加自己的音效**：把 `wav / mp3 / ogg / flac / m4a / aac / opus / webm` 丢进对应分类目录 → **按 F5**（刷新网页）即可，不用重启 ComfyUI。

>  只扫描 `ui / sfx / music / voice` 四个子目录，且只认音频后缀；
> 放说明用的 `.txt` / `.md` 不会被当成音效列出来。

---

## 3. 目录结构

```
Comfyui-XiaoHei/
├── __init__.py          汇总 24 个模块的映射 + 全包唯一 WEB_DIRECTORY
├── pyproject.toml
├── README.md
├── memsaver/            原 Comfyui-XH_H3MemorySaver（3 节点，代码全在 __init__.py）
├── image_tools/         原 Comfyui-XH_ImageTools（20 节点，py/ 下 19 个文件）
├── h3ltx_adapter/       原 XiaoHei-H3LTX-Adapter（2 节点，nodes.py + h3ltx/ 5 文件）
├── ltx_identity/        原 Comfyui-XH_LTXIdentity（1 节点，py/ 2 文件，908 行复刻）
├── seam_feather/        原 XiaoHei-SeamFeather（1 节点，py/core.py）
├── seam_correct/        从 MinimaxH3_AutoContext 复刻（1 节点，py/core.py）
├── chain_prompt/        原 XiaoHei-ChainPrompt（2 节点，nodes.py）
├── controls/            循环 / 分组控制 / 标签 / 计时器 / 计数 / 数学 / 分段表 / 色调补偿 / 分辨率选择器 / 种子 / 布尔开关 / 显示文本 / H3 latent接续 / H3 动作校正 / H3 音频同步 / 按帧裁音频（26 节点）
├── audiosep/            原 ComfyUI-XH_AudioSep（4 节点）
├── lorastack/           原 Comfyui-XH_LoraStack（2 节点，py/core.py）
├── slider/              原 Comfyui-XH_Slider（1 节点，py/core.py）
├── setget/              XiaoHei Set/Get（4 节点：单路 + 多路，虚拟节点，前后端各一半）
├── xh_utils/            XiaoHei 工具扩展（7 节点，2026-10-04 新增）
├── soundboard/          XiaoHei-声音播放（1 节点，nodes.py）
├── storyboard/          XiaoHei-宫格故事板三件套（3 节点，2026-10-09 新增，py/storyboard_tools.py）
├── openh3/              H3 2K 精修（8 节点，2026-11-08 新增；复刻 OpenH3-VideoTools·GPL-3.0 + 自持 OpenH3-Regenerate2K·MIT）
├── qwen21_edit/         XiaoHei-Qwen21 编辑四件套（4 节点，2026-11-09 新增，py/ 4 文件）
└── web/                 63 个顶层 js + xh_qwen21_edit/ 子目录 + sounds/ 音效库
    ├── xh_ui_kit.js      家族唯一前端实现：中英切换 / 工具条 / 下拉汉化 / 按钮回收
    ├── xh_sound.js      XiaoHei-声音播放的前端（onExecuted 收 ui 字段并播放）
    ├── xh_brand.js       全家族自动配色（按 CATEGORY 分色系 + 标题字自动黑白）
    ├── xh_color_picker.js  配色画板组件（原版搬运：SV 平面 + 色相条 + HEX）
    ├── xh_graph_changed.js  变更捕获网（DOM 控件改动被 ComfyUI 记进工作流）
    ├── xh_undo_remount.js   Ctrl+Z 后 DOM 控件重挂 + isGraphLoading() 门禁
    ├── xh_node_style.js     右键「节点配色」面板（原版搬运：可拖动浮窗 + 收藏夹 + 45 格预设）
    ├── xh_zz_topbar_visibility.js  顶栏按钮可藏（CSS 藏，不 un-mount）
    │       文件名 zz_ 前缀是刻意的，但它**只影响组内先后**（组内：最后注册的显示在最前）。
    │         组间（关于/外观/连线）顺序由 `sortOrder` 决定（降序，相等才按组名拼音），
    │         表在 `xh_about.js` 的 `window.XH_GROUP_ORDER`：关于 100 > 外观 90 > 连线 0。
    │         ⇒ 想把某组挪位置，**改 sortOrder，别改文件名**（2026-10-29 源码实证）。
    └── sounds/
        ├── ui/          (8)  提示音
        ├── sfx/         (13) 音效
        ├── music/       (6)  音乐
        └── voice/       (0)  人声（自备）
```

- 全包共 **146 个 py 文件**（不含 `__pycache__`）、**63 个顶层前端 js（另含 78 个画板模块文件）**、**121 个节点 / 22 个模块**。
- 子模块里也各有一句 `WEB_DIRECTORY = "web"`，但那是**死变量**：
  ComfyUI 只认顶层自定义节点目录的声明，子目录里的不会被读取。

---

## 4. 合并 / 追加做了什么（以及**没**做什么）

**做了**
- 每个原包整体搬进一个语义命名的子目录
- 前端 js 从各包的 `web/` 汇到顶层 `web/`
- 顶层 `__init__.py` 汇总映射，并做 **class_type 重名自检**（重名会打 `` 日志，不 raise）
- 显示名统一成 `XiaoHei-功能名` 家族格式；`CATEGORY` 统一成 `XH/<分类>`

**没做**（这是刻意的）
-  **class_type 一个都没改** → 已存工作流全部照常识别，零迁移成本
-  **子模块代码的相对导入没改**。原包的相对导入是「包根 → 子目录」（如 `from .py.image_tools import`），
  现在是「子包根 → 子目录」，**层级完全没变**，所以原封不动就能跑
-  前端 js 的 `import { app } from "../../scripts/app.js"` 也没改 ——
  它依赖「js 位于 `/extensions/<包名>/` 下一层」，包名换了但**层数没变**

**关于 `controls/`（第二批）**
- 外观统一后， **py 的 class_type 与 js 的 `NODE_TYPE` 必须逐字一致**
  （js 靠 `nodeData.name` 判类型），改一边务必同步另一边，否则节点渲染成空白壳。

---

## 5. 依赖的外部包

> 2026-10-05 在 `ComfyUI-Installs\ComfyUI\ComfyUI\.venv`（Python 3.13.12 / torch 2.12.1+cu130）**逐项实测**。
> **本机结论：不用额外装任何东西。** 实机启动日志：`[XiaoHei-Toolbox]  已加载 126 个节点，来自 24 个模块`（0.1 秒，零 ImportError）。
> **要分发给别人 → 看 §5.0（需补 3 个包）；缺依赖会少哪块 → 看 §5.0.1 对照表。**

### 5.0  分发给别人时：需要额外装 4 个（硬依赖）

别人干净的 ComfyUI（**不在**官方 `requirements.txt` 里）需要补的有 4 个：

| pip 包名 | 用在哪 | 缺了会怎样 |
|---|---|---|
| `opencv-python` | `seam_correct`（抽帧）、`ltx_identity`（锁脸，运行时） | 只少「XiaoHei-接缝修正」1 个节点 |
| `scenedetect` | `seam_correct`（场景切分） | 同上（和 cv2 同一个模块） |
| `rotary-embedding-torch` | `audiosep`（人声分离模型） | 只少「人声分离」那 4 个节点 |
| `imageio-ffmpeg` | `openh3`（XiaoHei-H3视频预处理的 CFR24 转码 / 抽音轨） | 只少「XiaoHei-H3视频预处理」1 个节点（自带一个 `ffmpeg.exe`；官方 requirements 里只有 `av`，那个不带 exe） |

> **KJNodes 不是硬依赖** —— `openh3` 缺 `MiniMaxLowVRAMAttention` / `MiniMaxChunkFeedForward`
> 时**自动跳过**这两层低显存补丁，仍可运行，只是峰值显存更高（启动日志会点名说明跳过了什么）。
> 8GB 显卡强烈建议装 KJNodes。
>
> `torchaudio`（人声分离也要用）**没有**写进 `requirements.txt` —— 它在 ComfyUI 的
> `requirements-nvidia.txt` 里，CPU / AMD 用户可能没有；但 `pip install torchaudio`
> 有可能连带重装 torch、把别人的 CUDA 环境搞坏。所以要装请按 PyTorch 官网指引
> 装与 torch 匹配的版本。

 **缺依赖不会让整包阵亡**（2026-10-05 改造，重要）：
`__init__.py` 里 18 个子模块现在是**逐个 `try` 导入**，缺谁只少谁，其余节点照常可用；
启动日志会点名叫出「缺哪个包 + 照抄就能用的 pip 命令」。
（改造前是裸 import：少装任意一个包 → **整包所有节点全部消失**，日志只有一行 `Cannot import`。）

 **已随包提供 `requirements.txt`**：ComfyUI Manager 会逐包扫描它并提示安装
（源码依据：`comfyui_manager/common/unified_dep_resolver.py:294`）。
没装 Manager 的用户，用**跑 ComfyUI 的那个 python** 手动跑一次即可：

```
# 官方便携版：
<ComfyUI>\python_embeded\python.exe -m pip install -r "custom_nodes\Comfyui-XiaoHei\requirements.txt"
# venv / 手动安装：
<ComfyUI>\.venv\Scripts\python.exe -m pip install -r "custom_nodes\Comfyui-XiaoHei\requirements.txt"
```

>  别搞错解释器：要装进**真正在跑 ComfyUI 的那个环境**，装到别的 python 上等于没装。
> 装完**重启** ComfyUI 才生效。

### 5.0.1 模块 ↔ 依赖 实测对照表（哪个包缺了 → 少哪块，2026-10-16 复核计数）

「顶层硬依赖」= 该模块 `import` 时就执行，缺了 → **这个模块的节点全部不出现**（不影响别的模块）。
「运行时可选」= 函数内部才 `import`，缺了 → 模块照常加载，只有用到那个功能时才报错。

| 子模块 | 节点 | 顶层硬依赖（缺 → 该模块挂） | 运行时可选 |
|---|---|---|---|
| `memsaver` | 3 | — | — |
| `image_tools` | 20 | `PIL`（官方自带） | `nvvfx`（「nvidia_rtx_vsr」放大选项）、`cv2`+`av`（加载视频 / 视频合成时才用；cv2 是存量依赖、av 官方自带） |
| `h3ltx_adapter` | 2 | — | — |
| `ltx_identity` | 1 | — | `PIL` / `cv2` / `insightface`（锁脸时才用） |
| `seam_feather` | 1 | — | — |
| `seam_correct` | 1 |  `cv2`、`scenedetect` | — |
| `chain_prompt` | 2 | — | — |
| `controls` | 21 | — | `av`（XiaoHei-加载音频解码时用；官方自带） |
| `audiosep` | 4 |  `rotary_embedding_torch`、`torchaudio`、`einops` | — |
| `lorastack` | 2 | — | — |
| `slider` | 1 | — | — |
| `setget` | 4 | — | — |
| `xh_utils` | 8 | — | — |
| `soundboard` | 1 | — | — |
| `storyboard` | 3 | — | — |
| `camangle` | 1 | — | — |
| `caminfo` | 1 | — | — |
| `msr_relay` | 1 | —（只用 `torch`，官方自带） | — |
| `qwen21_edit` | 4 | `numpy` / `torch` / `torchvision` / `cv2`（全是官方自带或家族存量） | — |
| `openh3` | 8 |  `imageio_ffmpeg` | **KJNodes** 的 `MiniMaxLowVRAMAttention` / `MiniMaxChunkFeedForward`（**缺了不阻断** —— 自动跳过这两层低显存补丁，仍可运行） |
| `charsheet` | 1 | —（只用 stdlib + `torch`/`numpy`，官方自带） | — |

> 实测方法：`main.py --quick-test-for-ci` 全量加载 + 用 `sys.meta_path` 屏蔽指定包做反向自测。
> 正常环境日志：`已加载 71 个节点，来自 19 个模块`；
> 屏蔽 `scenedetect` + `rotary_embedding_torch` 后：`已加载 66 个节点，来自 16 个模块`（71−1−4），
> 进程 exit 0、不崩，日志给出精确的补装命令。—— 这正是「别人拿到就能用」的保证。

---


### 5.1 ComfyUI 自带（不要 pip 装，也装不上）

- 根目录模块：`folder_paths` / `nodes` / `server` / `comfy` / `comfy_api` / `comfy_execution`
  （`image_tools` 的 `from nodes import MAX_RESOLUTION` 指的就是 **ComfyUI 自己的 `nodes` 模块**，绝对导入）
- 环境必备：`torch` / `torchaudio` / `safetensors` / `numpy` / `Pillow` / `aiohttp` / `wave`（标准库）

### 5.2 第三方包明细（顶层 import；缺了只影响对应模块，不会拖垮整包 —— 见 §5.0.1）

| 包 | 用在哪 | 实机状态 |
|---|---|---|
| `cv2`（opencv-python） | `seam_correct`（抽帧找接缝）、`ltx_identity` | 已装 5.0.0 |
| `einops` + `rotary_embedding_torch` | `audiosep/model/mel_band_roformer.py` | 已装 |
| `scenedetect`（PySceneDetect） | `seam_correct` 场景切分 | 已装 0.7.1 |
| `nvvfx`（NVIDIA VFX SDK） | `image_tools` 的「nvidia_rtx_vsr」放大选项 | 已装 0.1.0.1 |
| `imageio_ffmpeg`（imageio-ffmpeg） | `openh3` 的视频预处理（自带 `ffmpeg.exe`） | 已装 0.6.0 |

> `nvvfx` 只在选「nvidia_rtx_vsr」时才 `import`，且带 `ImportError` 兜底提示 —— 没装也不影响其它放大方式。

### 5.3 可选依赖（**函数内延迟 import，不吃这个节点就永远不需要**）

-  **`insightface`** —— 只有「XiaoHei-LTX锁脸」节点用。
  实机现状：`.venv` 里**未装**，`models\insightface\` 目录也**不存在** → 该节点一跑就会缺件。
  要补：`pip install insightface`（PyPI 有现成 wheel，**不需要编译器**）+ 首次运行自动下载 ArcFace `buffalo_l` 模型。

### 5.4 模型权重（不是 pip 包）

- `h3ltx_adapter` 需 H3→LTX-Latent-Adapter 权重（MATLOWAI / Efficient-Large-Model）
- `audiosep` 需 MelBandRoformer 权重（实机放在 `models\diffusion_models\`）
- `openh3` 需三份（详见 §1.4.5）：
  `minimax_h3_ref2va_pruned_int8_convrot.safetensors`（基模，**必须这一份**）、
  `open_h3_regenerate_2k_lora.safetensors`（官方完整主 LoRA，**312 模块**）、
  `sharp_curve_branches.safetensors`（Sharp 曲线，**50 条**）
  —— 后两份放 `models\loras\` 根目录或**任意子目录**都行（XiaoHei 版放宽了查找范围）

---

## 6. 改了 py 之后要干什么

| 改了什么 | 需要做什么 |
|---|---|
| `.py`（节点逻辑 / 参数 / 显示名） | **重启 ComfyUI** |
| `web/*.js`（前端 / 汉化 / 标签） | 浏览器 **F5** 即可 |
| `web/sounds/**`（音效文件） | 浏览器 **F5** 即可 |

### 6.1  写前端 DOM 控件：固定高度必须 `lockDomWidgetHeight`（2026-10-14 立规）

**症状**：节点上下留一大块空白，把节点拖高空白跟着变大。官方节点只有文本框跟着长大。

**根因**（源码实锤）：Vue Nodes 把控件渲染成 CSS Grid，行高 =
`showsControl && (shouldExpand(type) || hasLayoutSize) ? "auto" : "min-content"`，其中
`hasLayoutSize = typeof widget.computeLayoutSize === "function"`；
`addDOMWidget` 造出的 `DOMWidgetImpl` **原型上自带 `computeLayoutSize`** ⇒ 每个 DOM 控件行都是 `auto`
⇒ 整个 grid `flex:1` 撑满 ⇒ 多余的竖向空间被**平摊**给每一行 ⇒ 上下空白，节点越大分到越多。
 **只写 `computeSize` 在 Vue 模式完全无效**（Vue 不看它）—— 这是前两轮的错误修法。

**做法**：

```js
import { lockDomWidgetHeight } from "./xh_ui_kit.js";
const w = node.addDOMWidget("xh_xxx_bar", "custom", el, { serialize: false });
lockDomWidgetHeight(w, 28);                       // 固定 28px
lockDomWidgetHeight(w, () => playerHeight(node)); // 高度会变 → 传函数
```

- 内部：定死 `computeSize` + `getMinHeight`，**并把 `computeLayoutSize` 抹成 `undefined`**（治本那一下）。
-  **绝不能用 `node.size.y` 反推高度** ⇒ 会和节点尺寸互相喂成无限增长。
-  **会生长的控件别锁**：图片画廊 / 3D 预览 / LoRA 行栈 / 滑块组 / 组列表面板 / 画布编辑器 /
  标签显示容器 / 计时器显示容器 —— 它们本来就该吃多余空间。

**交付前必跑**（红了不许说"做好了"）：

```bash
python ~/.workbuddy/skills/ComfyUI自定义节点开发/scripts/xh_dom_height_check.py
```

逐条源码出处 → `~/.workbuddy/skills/ComfyUI自定义节点开发/references/frontend_n2.md` §13.7。

---

## 7. 回滚

合并前的原包整份留底在：

```
桌面\AI创作产出\备份_20260922\合并前_6原包\              ← 第一批 6 个包（副本）
桌面\AI创作产出\备份_20260922\已移出_原6包\              ← 第一批 6 个包（原件）
桌面\AI创作产出\备份_20260922\并入Toolbox前_XiaoHei 三件套\    ← 第二批 3 个包（副本）
桌面\AI创作产出\备份_20260922\已移出_XiaoHei 三件套\           ← 第二批 3 个包（原件）
```

另有就近留底：`__init__.py.加声音播放前备份_20261005_121544.bak`（加 `soundboard/` 之前）。

要拆回去：把对应目录下的包复制回 `custom_nodes\`，再把 `Comfyui-XiaoHei` 移走，重启 ComfyUI 即可。
