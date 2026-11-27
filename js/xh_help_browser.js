// ╔═══════════════════════════════════════════════════════════════╗
// ║  XiaoHei · Help Browser v5                                   ║
// ║  2026-10-27 · 折叠修复 + 分类图标 + 分类中译 + resize + 主题  ║
// ╚═══════════════════════════════════════════════════════════════╝
const { app } = window.comfyAPI.app;
import { helpIconHTML, xhIconHTML, xhToast, makeToolbarButton, setToolbarButtonOpen, currentLang, onLangChanged } from "./xh_ui_kit.js";
import { wnDesc } from "./xh_wepenerd/xh_wn_i18n.mjs";
//  2026-11-11：徽章栏共用唯一真源（设置面板「关于」也是它画出来的）。
//    帮助窗口底部 + 「XiaoHei 指南 → 交流反馈」专题页都调用它 ⇒ 三处同一排、同一套文案。
import { renderBadgeRow, QR_URL, primeAbout, COPY } from "./xh_about_badges.mjs";
//  2026-11-25：家族白名单（归属判定的唯一真源）。帮助索引必须按它精确收录，
//    否则第三方包只要把 CATEGORY 写成 `小黑/xxx`（如 Comfyui-XH_Krea2Catalog 的
//    `小黑/Krea2`）就会混进我们的帮助首页，显示成纯英文分类「Krea2」。
//    副作用导入即可——该文件把 Set 挂到 window.__XH_FAMILY_TYPES__。
import "./xh_family_types.js";
const NS = "XH.HelpBrowser";
const HELP_DEFS = [
  {
    //  2026-11-12：画板节点（XHPaint）的 object_info.description 原是整段英文，
    //    帮助窗口点开它只会显示那段英文 ⇒ 这里补一条中文覆盖（HELP_DEFS 设计为覆盖/补充用）。
    cls: "XHPaint",
    icon: xhIconHTML("brush", { size: 22, color: "brand" }),
    tagline: "XiaoHei 画板：带图层的简易绘画编辑器，可拖图加层、全屏手绘、AI 抠图，输出合成图",
    help: `<div style="line-height:1.85">
<p><b>XiaoHei 画板</b> —— 一个带图层的简易绘画编辑器。</p>
<p><b>怎么用</b></p>
<ul>
<li><b>拖图加层</b>：把图片直接拖到（关闭状态的）节点体上，会作为新图层叠到最上方，不会替换已有的图层。</li>
<li><b>全屏绘制</b>：打开全屏编辑器，用 <b>铅笔 / 画笔 / 橡皮 / 涂抹 / 填充 / 形状 / 吸管</b> 在图层上手绘；支持多图层、拖动重排、不透明度、混合模式、合并、扁平化（类似 Photoshop）。</li>
<li><b>一键抠图</b>：图像图层上有 <b>AI 去背景</b> 按钮（rembg 驱动），一键把主体抠出来。</li>
<li><b>透明保存</b>：工具条勾选后，可直接把带透明底的图存到磁盘。</li>
</ul>
<p><b>输出</b>：合成后的 <b>IMAGE</b>，以及它的 <b>宽度</b> 和 <b>高度</b>（均为 INT）。</p>
<p><b>接入上游</b>：编辑器里可以把任意上游的 IMAGE 接到它自动生成的可选输入槽，作为初始图层。</p>
<p style="font-size:12px;opacity:.75">提示：输入端是编辑器动态生成的占位槽，具体说明在编辑器界面内。</p>
</div>`,
  },
  {
    //  2026-11-14：1:1 复刻进小黑家族的「小黑·全能角色设定表」（XiaoHeiCharacterSheet）。
    //    它的 CATEGORY 是「小黑家族」而不是 XiaoHei/*，原先 buildIndex 会把整个节点过滤掉；
    //    且后端 DESCRIPTION 是原版英文，故在这里补一条中文说明。
    cls: "XiaoHeiCharacterSheet",
    title: "小黑·全能角色设定表",
    icon: xhIconHTML("user", { size: 22, color: "brand" }),
    tagline: "小黑角色设定表：13 视图点选、Auto/Manual 排版，提示词可按 MiniMax H3 Image 或千问 2.1 的格式输出",
    help: `<div style="line-height:1.85">
<p><b>这是什么</b></p>
<p>给 <b>MiniMax H3 Image</b> 或 <b>千问 2.1（Qwen-Image 2.1）</b> 生成角色设定表（character sheet）的专用节点：点缩略图选 13 种视图，自动排版并算出画布尺寸，把角色主图与附加参考图一起编译成提示词和 5 张图片输出。节点上的<b>「下游模型格式」</b>下拉决定提示词写成哪种模型的口径。只适配图像模型，不适配 H3 视频。</p>
<p><b>怎么用</b></p>
<ul>
<li><b>点上面的缩略图选视图</b>：13 个视图（头部特写 / 全身 / 服装正反 / 手 / 脚等），选中后下方立刻显示排版预览。也可以用「预设」下拉一次套一组常用视图。</li>
<li><b>Auto / Manual</b>：Auto 由所选视图自动算出画布尺寸；Manual 自己填宽高，预览按真实宽高比变化。</li>
<li><b>参考图靠面板选作用部位</b>：在面板里给每张参考图指定角色（同一角色 / 脸 / 服装 / 手 / 鞋等），不是靠文字描述。空着的参考图接口会自动跳过、图片编号重新排。</li>
<li><b>标签页</b>：「布局」调排版、「部位指定」改各部位指令、「风格 / 设置」调渲染细节与生成尺寸，「提示词」页可逐视图改基础提示词；下方还有编译出来的完整提示词。</li>
</ul>
<p><b>接线</b></p>
<p>输入：<b>character_image</b>（角色主图，<b>可选</b>）、<b>reference_image_1~3</b>（可选）、<b>use_layout_image</b>（是否输出排版图）、<b>style</b>（风格）、<b>model_format</b>（下游模型格式）。<br>
输出：<b>prompt</b>（STRING）、<b>width / height</b>（INT）、<b>negative_prompt</b>（STRING，负向提示词），以及 <b>layout_image、character_image、reference_image_1~3</b> 五张 IMAGE。关掉排版图时那一路是空（None）。</p>
<p><b>两种模型格式</b></p>
<ul>
<li><b>H3 Image</b>：提示词写成 H3 Image 的角色指令口径。接到 <b>MiniMax H3 Image Conditioning</b> 的 prompt；五张图按这个顺序接它的 images 槽位（槽位名从 0 起）：<b>角色主图 → image_0，排版参考图 → image_1，附加参考 1/2/3 → image_2 / image_3 / image_4</b>。<b>negative_prompt</b> 是空的。</li>
<li><b>千问 2.1</b>：提示词改成自然语言，开头附一份「Reference image 1 / 2 / 3…」的参考图清单。接到千问文本编码节点的 prompt，图片<b>按清单里的顺序</b>接它的图片槽位，<b>negative_prompt</b> 接它的负向提示词框。<br>
  注意两版千问编码器槽位名不一样：<b>TextEncodeQwenImage21</b> 是 <b>image_1 ~ image_16</b>（从 1 起），<b>TextEncodeQwenImage21GH</b> 是 <b>image_01 ~ image_10</b>（带前导零）。<b>哪版都行，照你手上那个节点的槽位名接。</b></li>
<li><b>两种格式的图片编号规则相同</b>：主图 → 排版图 → 参考图 1/2/3，没接的跳过、往下排。千问模式里同一个位置叫「Reference image N」。</li>
<li><b>认准「图片编号」不是「输出口下标」</b>：本节点输出端口里<b>排版参考图排在角色主图前面</b>（第 4、第 5 个 IMAGE 输出口），但下游只看<b>你把图接到了第几号槽位</b>，接错号就会图和提示词对不上。</li>
</ul>
<p><b>不接图也能用</b></p>
<ul>
<li><b>纯文字模式</b>：<b>character_image</b> 不接线也能跑，面板顶部会显示「纯文字模式」。此时角色长相完全由「部位指定」页的文字决定，提示词里不会出现任何图片引用。</li>
<li><b>编号会自动重排</b>：没接主图时，剩下的排版图 / 参考图依次占用第 1、2、3 号。所以<b>下游要按「谁排第几」重新接</b> —— 没接主图时排版图接 <b>image_0</b>，参考图依次接 <b>image_1 / image_2 / image_3</b>；接了主图就回到主图接 image_0、排版图接 image_1 的老接法。</li>
<li><b>接了主图 = 老样子</b>：主图始终占第 1 号，H3 模式提示词与以前逐字相同，行为一点没改。</li>
</ul>
<p><b>注意</b></p>
<ul>
<li><b>state_json 不要手改</b>：由面板自动管理，存的是 schema_version 3 的合法格式。旧工作流里若残留早期版本的数据，会自动归一成默认值。</li>
<li>节点搜索框输「<b>小黑</b>」「<b>MiniMax</b>」或「<b>千问</b>」能找到它；也可在菜单「小黑家族」里直接拖。</li>
<li>改后端代码要<b>完全重启 ComfyUI</b>，只改前端时 <b>Ctrl+F5</b> 强刷即可。</li>
</ul>
</div>`,
  },
];

// ═══════════════════════════════════════════════════════
// 分类翻译表（key 必须跟 buildIndex 里 cat.replace(/^XiaoHei\//, "") 结果一致！）
// ═══════════════════════════════════════════════════════
const CATEGORY_ZH = {
  "Model": "模型", "Control": "控制", "Identity": "身份", "Image": "图像",
  "Video": "视频", "SetGet": "存储/读取",
  "工具": "工具", "循环": "循环", "数学": "数学", "链提示词": "链提示词",
  "音频": "音频", "音频分离": "音频分离", "音频工具": "音频工具", "导演台": "导演台"
};
//  2026-11-25 重捋后的 9 大功能域父级 —— 两级折叠靠它判定「父类/子类」。
//  统一常量：catZh / sideParentOf / 节点导航树共用，避免三处各写一份漏改。
const XH_PARENTS = "分镜|图像|视频|提示词|逻辑与数值|模型与身份|音频|工具";
function catZh(name) {
  const s = String(name || "");
  //  侧栏/首页只显示末段子类名；父级（图像/视频/提示词…）仍用于归组和配色。
  const m = s.match(new RegExp("^(" + XH_PARENTS + ")\\/([^/]+)$"));
  if (m) return m[2];
  return CATEGORY_ZH[s] || s;
}
//  ╔══════════════════════════════════════════════════════════════╗
//  ║  分类规范化：剥掉前导 emoji / 符号                              ║
//  ╚══════════════════════════════════════════════════════════════╝
//  2026-11-19 用户报「帮助里搜不到草图节点」。根因不是搜索，是**收录**：
//    有一批复刻件沿用了原作者分类 `👑 XiaoHei/🎨 编辑器`（emoji 打头），
//    而收录判断写的是 `cat.startsWith("XiaoHei")` ⇒ 这 10 个节点整条被跳过，
//    索引里压根没有它们，搜什么词都搜不到。
//  同日已把包内所有节点分类统一成 `XiaoHei/*`（后端 CATEGORY），emoji 前缀不再存在；
//    这个函数作为**防御**保留 —— 以后再有第三方/复刻件带 emoji 分类也不会被漏收。
//  这里统一剥掉开头的非字母/非数字/非中文符号（emoji、空格、装饰符），
//    后面所有判断都基于规范化后的分类，不再被 emoji 前缀骗过去。
function xhCatCore(cat) {
  return String(cat || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
}
//  ╔══════════════════════════════════════════════════════════════╗
//  ║  分类 → 图标名（Lucide 1.71，全部经 svg/ 校验存在）            ║
//  ║  2026-11-12：把原来全空的占位填上，组件卡片左侧从此有图标。   ║
//  ╚══════════════════════════════════════════════════════════════╝
const CATEGORY_ICONS = {
  // 英文分类键（XiaoHei/Image 等官方导出名）
  "Image": "image", "Video": "video", "Model": "box", "Control": "sliders-horizontal",
  "Identity": "fingerprint", "SetGet": "database",
  // 中文分类键（XiaoHei/图像 等）
  "图像": "image", "视频": "video", "模型": "box", "控制": "sliders-horizontal",
  "身份": "fingerprint", "存储/读取": "database",
  // 通用中文分类
  "工具": "wrench", "循环": "repeat", "数学": "calculator", "链提示词": "link",
  "提示词": "type", "键提示词": "key-round",
  "音频": "audio-lines", "音频分离": "split", "音频工具": "mic", "导演台": "clapperboard",
  "Character": "user",
  //  2026-11-25 重捋后的 9 大功能域（父类 + 子类）
  "分镜": "clapperboard", "提示词": "type", "逻辑与数值": "calculator", "模型与身份": "box",
  "滑块": "sliders-horizontal", "存取": "database", "数学": "calculator", "循环": "repeat",
  "数值逻辑": "git-branch", "提示词工具": "type", "文案标签预览": "sticky-note",
  "模型权重": "layers", "角色身份": "fingerprint",
  // 专题分组（XiaoHei 指南）
  "XiaoHei 指南": "book-open",
  //  2026-11-14：角色表节点归入「小黑家族」分类
  "小黑家族": "user",
};
function catIcon(name) {
  //  细分分类「图像/绘画手绘」在表里没有精确 key，回退到父级「图像」的图标。
  const s = String(name || "");
  return CATEGORY_ICONS[s] || CATEGORY_ICONS[s.split("/")[0]] || "";
}
//  节点图标：关键词优先（更贴切），其次按分类，最后兜底 box
const NODE_KEYWORD_ICONS = [
  [/计时|秒表|timer/i, "timer"],
  [/分辨率|resolution/i, "ruler"],
  [/遮罩|mask/i, "wand-2"],
  [/配色|颜色|调色|color/i, "palette"],
  [/随机|random/i, "shuffle"],
  [/切换|开关|switch|分支/i, "git-commit"],
  [/合并|merge/i, "merge"],
  [/拆分|split/i, "split"],
  [/组合|combine/i, "combine"],
  [/提示词|prompt/i, "type"],
  [/模型|model|checkpoint|权重|lora/i, "box"],
  [/音频|audio/i, "audio-lines"],
  [/视频|video/i, "video"],
  [/图像|image|出图|生图/i, "image"],
  [/数学|math/i, "calculator"],
  [/控制|control/i, "sliders-horizontal"],
  [/身份|identity/i, "fingerprint"],
  [/工具|tool/i, "wrench"],
  [/导演|direct/i, "clapperboard"],
  [/键|key/i, "key-round"],
  [/文字|text/i, "type"],
  [/人物|角色|character/i, "user"],
  [/裁剪|crop/i, "crop"],
  [/画|笔|paint|brush/i, "brush"],
  [/扫描|scan/i, "scan"],
  [/相机|camera/i, "camera"],
  [/存储|读取|保存|save|load|记忆/i, "database"],
  [/循环|loop/i, "repeat"],
];
function iconNameForEntry(title, cat) {
  const t = String(title || "");
  for (const [re, name] of NODE_KEYWORD_ICONS) if (re.test(t)) return name;
  return CATEGORY_ICONS[cat] || "box";
}
//  统一出图标 HTML（家族黄，纯前端，不依赖手填）。title 传入时走关键词匹配。
function catIconHTML(cat, title, opts) {
  const name = title != null ? iconNameForEntry(title, cat) : (catIcon(cat) || "box");
  try { return xhIconHTML(name, Object.assign({ size: 22, color: "brand" }, opts || {})); }
  catch (e) { return ""; }
}

function injectCSS() {
  if (document.getElementById("xh-help-browser-css")) return;
  const css = `
/*  2026-10-28 13:20：顶栏按钮样式已搬到 xh_ui_kit.js 的**统一真源**
   （ensureToolbarButtonCSS），三颗按钮（XiaoHei / 帮助 / 工作流）共用 .xh-tb。
   本文件**不再**自己写 .xhhelp-tb 样式 —— 之前三处各写各的 CSS，
   还抢同一个 style id（xh-tb-btn-css），导致工作流和 XiaoHei 显示淡紫、只有问号是黄的。
    「打开时图标要清清楚楚还在」这条也保留：统一真源的打开态是
      淡黄底 + 黄图标 + 黄描边（不是实心黄底）⇒ 图标不会被底色吃掉。 */

/*  2026-11-10：z-index 10001 > XiaoHei 设置面板的 9999 ⇒ 从设置面板点小「?」时，
   帮助浮窗能压在设置面板之上（不关设置面板，避免顶栏「XiaoHei」被藏后面板叫不回来）。 */
.xhhelp-win{position:fixed;z-index:10001;background:var(--xh-surface);border:1px solid var(--xh-border);border-radius:12px;box-shadow:0 24px 70px var(--xh-shadow);display:flex;flex-direction:column;overflow:hidden;color:var(--xh-text);font-family:inherit;font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased;width:min(860px,94vw);height:min(680px,88vh)}
.xhhelp-win *{box-sizing:border-box}
.xhhelp-win::after{content:"";position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%,var(--xh-sub) 45%,var(--xh-sub) 55%,transparent 55%,transparent 65%,var(--xh-sub) 65%,var(--xh-sub) 75%,transparent 75%);opacity:.5}

/* 标题栏 */
.xhhelp-title{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;background:var(--xh-title-bg);border-bottom:1px solid var(--xh-border);cursor:grab;user-select:none}
.xhhelp-title:active{cursor:grabbing}
.xhhelp-name{font-weight:600;color:var(--xh-text);font-size:13.5px}
.xhhelp-tool{width:24px;height:24px;border:none;background:transparent;color:var(--xh-sub);cursor:pointer;border-radius:4px;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.xhhelp-tool:hover{background:var(--xh-overlay);color:var(--xh-text)}
.xhhelp-close{margin-left:auto}
/* 2026-11-17：顶部条跟随家族主题预设，和节点标题栏同源 --xh-rest / --xh-on-rest；
   经典预设现在是暖黑 #1A1613 + 金字，只把「写死」换成「读主题」，不动 --xh-title-bg 共享变量。 */
.xhhelp-title{background:var(--xh-rest,#1A1613);border-bottom-color:var(--xh-rest-bd,rgba(255,255,255,.28));color:var(--xh-on-rest,#fff)}
.xhhelp-title .xhhelp-name{color:var(--xh-on-rest,#fff)}
.xhhelp-title .xhhelp-tool{color:var(--xh-on-rest,#fff);opacity:.78}
.xhhelp-title .xhhelp-tool:hover{background:color-mix(in srgb,var(--xh-on-rest,#fff) 16%,transparent);color:var(--xh-on-rest,#fff);opacity:1}

/* 搜索栏 */
.xhhelp-bar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--xh-border);background:var(--xh-bar-bg);flex:none}
.xhhelp-nav{width:28px;height:28px;border:1px solid var(--xh-border);background:transparent;color:var(--xh-text);border-radius:6px;cursor:pointer;font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.xhhelp-nav:hover:not(:disabled){background:var(--xh-overlay)}
.xhhelp-nav:disabled{opacity:.35;cursor:not-allowed}
.xhhelp-search{flex:1;min-width:0}
.xhhelp-search input{width:100%;height:28px;background:var(--xh-input-bg);border:1px solid var(--xh-border);border-radius:6px;color:var(--xh-text);padding:0 10px;font-size:13px;outline:none}
.xhhelp-search input:focus{border-color:var(--xh-primary)}
.xhhelp-home{height:28px;padding:0 10px;border:1px solid var(--xh-border);background:transparent;color:var(--xh-text);border-radius:6px;cursor:pointer;font-size:12px}
.xhhelp-home:hover{background:var(--xh-overlay)}

.xhhelp-body{display:flex;flex:1;min-height:0}

/* 侧边栏 */
.xhhelp-side{width:220px;border-right:1px solid var(--xh-border);overflow-y:auto;padding:6px 0;font-size:12.5px;flex:none;background:var(--xh-side)}
.xhhelp-side .xhhelp-side-home{padding:6px 14px;cursor:pointer;color:var(--xh-text);font-weight:600;display:flex;align-items:center;gap:6px}
.xhhelp-side .xhhelp-side-home:hover{background:var(--xh-hover)}
.xhhelp-side .xhhelp-side-home.xhhelp-item-active{color:var(--xh-accent);background:var(--xh-hover)}
.xhhelp-side .xhhelp-grp{user-select:none}
.xhhelp-side .xhhelp-grp-head{padding:5px 14px;cursor:pointer;color:var(--xh-sub);display:flex;align-items:center;gap:5px;font-size:11.5px}
.xhhelp-side .xhhelp-grp-head:hover{color:var(--xh-text);background:var(--xh-hover)}
.xhhelp-side .xhhelp-grp-head .xhhelp-grp-arrow{display:inline-block;width:11px;text-align:center;transition:transform .15s ease;flex:none}
.xhhelp-side .xhhelp-grp-head.xhhelp-grp-open .xhhelp-grp-arrow{transform:rotate(90deg)}
.xhhelp-side .xhhelp-grp-head .xhhelp-grp-ic{flex:none;font-size:12px}
.xhhelp-side .xhhelp-grp-head .xhhelp-grp-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xhhelp-side .xhhelp-grp-head .xhhelp-grp-count{font-size:10.5px;color:var(--xh-sub);opacity:.7}
.xhhelp-side .xhhelp-grp-items{overflow:hidden}
.xhhelp-side .xhhelp-grp-items.xhhelp-grp-collapsed{display:none}
.xhhelp-side .xhhelp-item{padding:4px 14px 4px 28px;cursor:pointer;color:var(--xh-text);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xhhelp-side .xhhelp-item:hover{background:var(--xh-hover);opacity:1}
.xhhelp-side .xhhelp-item.xhhelp-item-active{color:var(--xh-accent);opacity:1;background:var(--xh-hover)}
/*  2026-11-23 两级折叠：顶层大类 → 子类 → 节点，子类缩进一层、字略小，视觉分层清楚 */
.xhhelp-side .xhhelp-sub .xhhelp-grp-head{padding-left:26px;font-size:11px;opacity:.9}
.xhhelp-side .xhhelp-sub .xhhelp-item{padding-left:44px}

/* 主区 */
.xhhelp-main{flex:1;overflow-y:auto;padding:16px 20px}
.xhhelp-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;background:var(--xh-card);border:1px solid var(--xh-border);margin-bottom:6px;transition:background .12s}
.xhhelp-card:hover{background:var(--xh-hover);border-color:var(--xh-primary)}
.xhhelp-card .xhhelp-card-ic{font-size:22px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;background:var(--xh-chip-bg);border-radius:8px;flex:none}
.xhhelp-card .xhhelp-card-t{flex:1;min-width:0}
.xhhelp-card .xhhelp-card-n{font-weight:600;color:var(--xh-text);font-size:13px}
.xhhelp-card .xhhelp-card-d{font-size:11.5px;color:var(--xh-sub);margin-top:2px}

.xhhelp-detail h2{margin:0 0 4px;font-size:16px;color:var(--xh-text)}
.xhhelp-detail .xhhelp-detail-type{font-size:11px;color:var(--xh-sub);margin-bottom:12px;font-family:monospace}
.xhhelp-detail .xhhelp-detail-body{line-height:1.7}
.xhhelp-detail .xhhelp-detail-empty{padding:20px;border:1px dashed var(--xh-border);border-radius:8px;color:var(--xh-sub);text-align:center;font-size:12px}
.xhhelp-btn{display:inline-block;height:30px;padding:0 14px;border-radius:6px;border:1px solid var(--xh-border);background:transparent;color:var(--xh-text);cursor:pointer;font-size:12.5px;margin-top:12px;margin-right:8px}
.xhhelp-btn:hover{background:var(--xh-overlay)}
/* ⏱ 2026-11-17：常态 = 主题标题色（不再是常亮实心金），hover 才亮一下琥珀金 */
.xhhelp-btn-primary{background:var(--xh-rest,#1A1613) !important;color:var(--xh-on-rest,#fff) !important;border-color:var(--xh-rest-bd,rgba(255,255,255,.28)) !important}
.xhhelp-btn-primary:hover{background:var(--xh-primary,#E8A33C) !important;color:var(--xh-on-primary,#1c1c1c) !important;border-color:var(--xh-primary,#E8A33C) !important;filter:none}

/* ★ 2026-11-12：首页顶部「我们的初心」横幅 */
.xhhelp-about{margin:0 0 14px;padding:11px 14px;border:1px solid var(--xh-primary);border-left:3px solid var(--xh-primary);border-radius:8px;background:color-mix(in srgb,var(--xh-primary) 10%,transparent)}
.xhhelp-about h3{margin:0 0 4px;font-size:14px;color:var(--xh-primary);font-weight:700}
.xhhelp-about p{margin:0;font-size:12.5px;line-height:1.6;color:var(--xh-text)}
.xhhelp-about a{color:var(--xh-accent);cursor:pointer;font-size:12px;margin-top:6px;display:inline-block}

/* ★ 2026-11-12：节点示意卡（点击节点说明时右侧实时出现「节点样子」） */
.xhhelp-detail{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.xhhelp-detail-text{flex:1 1 320px;min-width:0}
.xhhelp-detail-prev{flex:0 0 auto;align-self:flex-start}
.xhnp{width:258px;background:var(--xhnp-body,rgba(26,22,19,.14));border:1px solid rgba(0,0,0,.5);border-radius:7px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.35);font-family:inherit;font-size:11.5px;color:#e6e6e6}
.xhnp-title{background:var(--xhnp-title,#1A1613);color:var(--xhnp-fg,#fff);font-weight:700;padding:7px 10px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xhnp-body{padding:6px 0}
.xhnp-row{position:relative;display:flex;align-items:center;gap:6px;padding:3px 12px}
.xhnp-row .xhnp-dot{position:absolute;left:4px;top:50%;transform:translateY(-50%);width:9px;height:9px;border-radius:50%;background:#cfd6dd;border:1.5px solid #1c1c1c;flex:none}
.xhnp-row-out{justify-content:flex-end;text-align:right}
.xhnp-row-out .xhnp-dot{left:auto;right:4px}
.xhnp-name{font-weight:600;color:#eaeaea}
.xhnp-type{font-size:10px;color:#9aa6b2;background:rgba(255,255,255,.07);padding:1px 5px;border-radius:3px;font-family:monospace;margin-left:auto}
.xhnp-row-out .xhnp-type{margin-left:0;margin-right:auto}
.xhnp-opt{font-size:9.5px;color:#ffb86b;border:1px solid rgba(255,184,107,.4);border-radius:3px;padding:0 3px;margin-left:2px}
.xhnp-widget{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3px 10px;padding:4px 8px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);border-radius:4px}
.xhnp-wname{font-weight:600;color:#eaeaea}
.xhnp-wbox{font-size:10px;color:#9aa6b2;font-family:monospace}
.xhnp-empty{padding:12px;text-align:center;color:#9aa6b2;font-size:11px}

/* Footer ——  2026-11-11：原来只有一个单独的 B 站按钮，换成和设置面板「关于」同一排徽章。
   flex-wrap 让窗口拖窄时自动换行，不会把徽章挤扁；底部二维码由共享模块走 xh-about-qr-up 向上弹
   （.xhhelp-win 是 overflow:hidden，向下弹会被裁掉）。 */
.xhhelp-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;padding:8px 14px;border-top:1px solid var(--xh-border);background:var(--xh-foot-bg);font-size:11.5px;color:var(--xh-sub)}
.xhhelp-foot .xhhelp-foot-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.xhhelp-foot .xhhelp-foot-fsp{flex:1}
.xhhelp-foot .xhhelp-foot-ver{font-family:monospace}
`;
  const st = document.createElement("style");
  st.id = "xh-help-browser-css";
  st.textContent = css;
  document.head.appendChild(st);
}

// ═══════════════════════════════════════════════════════
// 状态
// ═══════════════════════════════════════════════════════
const S = {
  win: null, index: [], groups: [], hist: [], hi: -1,
  themeMode: "auto", themeActual: "dark", currentEntry: null,
};
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function esc(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
/** help 允许写成函数（每次打开实时生成），也允许直接是 HTML 字符串。 */
function resolveHelp(entry) {
  const h = entry && entry.help;
  return typeof h === "function" ? h() : (h || "");
}

// ═══════════════════════════════════════════════════════
//  2026-11-10：设置面板的「小字说明」全部搬到这里（问号帮助 → 设置项说明）。
//    数据源 = window.XH_SETTING_DEFS（唯一真源，设置面板和这里共用，不复制文案）。
//    写成函数：顶栏按钮那 3 项是别的扩展在 setup() 里 push 进来的，
//    每次打开都重读 ⇒ 后进来的项也会自动出现。
// ═══════════════════════════════════════════════════════
function settingMeta(def) {
  const bits = [];
  if (def.type === "slider" && def.attrs) {
    bits.push(`范围 ${def.attrs.min} ~ ${def.attrs.max}` + (def.attrs.step ? `，步进 ${def.attrs.step}` : ""));
  }
  if (def.type === "combo" && Array.isArray(def.options)) bits.push(`可选：${def.options.join(" / ")}`);
  if (def.type === "boolean") bits.push(`默认 ${def.defaultValue ? "开" : "关"}`);
  else if (def.defaultValue !== undefined && def.defaultValue !== null && def.defaultValue !== "") {
    bits.push(`默认 ${def.defaultValue}`);
  }
  return bits.join("　·　");
}
function settingsHelpHtml() {
  const defs = ((typeof window !== "undefined" && window.XH_SETTING_DEFS) || [])
    .filter((d) => d && d.id && d.name);
  if (!defs.length) {
    return `<div class="xhhelp-detail-empty">设置项还没加载完，稍等一下再打开本页。</div>`;
  }
  const groups = {};
  defs.forEach((d) => { const g = d.group || "其他"; if (!groups[g]) groups[g] = []; groups[g].push(d); });
  let keys = Object.keys(groups);
  // 与设置面板一致：「顶栏按钮」排第一
  if (keys.includes("顶栏按钮")) keys = ["顶栏按钮"].concat(keys.filter((k) => k !== "顶栏按钮"));
  let out = `<div style="line-height:1.8">` +
    `<p>共 <b>${defs.length}</b> 项。设置面板里只显示功能名；想看某一项管什么、怎么填，都在这一页。` +
    `点设置面板里名字后面的小圆 <b>?</b>，会直接打开本页并定位到那一项。</p>`;
  for (const g of keys) {
    out += `<div style="font-weight:600;font-size:14px;margin:16px 0 8px;padding-left:8px;border-left:2px solid var(--xh-primary)">${esc(g)}</div>`;
    for (const d of groups[g]) {
      const meta = settingMeta(d);
      out += `<div id="xhhelp-set-${esc(d.id)}" style="padding:8px 10px;margin-bottom:6px;border:0.5px solid var(--xh-border);border-radius:8px;background:var(--xh-card)">` +
        `<div style="font-weight:600">${esc(d.name)}</div>` +
        (d.description ? `<div style="margin-top:3px">${esc(d.description)}</div>` : "") +
        (meta ? `<div style="font-size:11.5px;color:var(--xh-sub);margin-top:4px">${esc(meta)}</div>` : "") +
        `</div>`;
    }
  }
  out += `<p style="font-size:11.5px;color:var(--xh-sub);margin-top:16px">本页直接读取设置项定义，改说明或加设置项不用改这里。</p></div>`;
  return out;
}
/**
 *  2026-11-11 用户：「小黑指南下面也要加一下，也加一个入口，就是把这些信息放进去」。
 * 「XiaoHei 指南」新增「交流反馈」专题：软话术 + 同一排徽章 + 直接印出来的微信二维码。
 * 文案全部实时读共享模块的 COPY，**不在这里复制第二份**（改话术只改一处）。
 * 写成函数：buildIndex() 会 resolveHelp() 成字符串再缓存，函数不会被 JSON.stringify 吞掉。
 */
function contactHelpHtml() {
  const lines = COPY.contactLines.map((s) => `<li>${esc(s)}</li>`).join("");
  return `<div style="line-height:1.85">
<p>${esc(COPY.contactLead)}</p>
<ul>${lines}</ul>
<p>${esc(COPY.contactOutro)}</p>
<div id="xhhelp-contact-badges" style="margin:12px 0"></div>
<div id="xhhelp-contact-qr" style="margin-top:10px"></div>
<p style="font-size:11.5px;color:var(--xh-sub);margin-top:12px">${esc(COPY.qqColumnTip)}</p>
</div>`;
}
// 图标：emoji 走转义，HTML 图标（我们的问号圆圈 span）原样输出
function iconHtml(v) { const t = String(v || "").trim(); return t.startsWith("<") ? t : esc(t); }

// ═══════════════════════════════════════════════════════
// 节点索引
// ═══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// 专题页（不是节点的说明：功能指南 / 使用说明）
// 2026-10-28：用户要求「这个灯泡就是来说明的…包括其他的说明」⇒ 加专题分组。
// ══════════════════════════════════════════════════════════════════════
const TOPICS = [
  {
    key: "about", title: "我们的初心", cat: "XiaoHei 指南",
    icon: xhIconHTML("flag", { size: 24, color: "brand" }),
    tagline: "我们做这套插件最朴素的念头：让 ComfyUI 真正好用在中国玩家手里",
    help: function () {
      return `<div style="line-height:1.85">
<p>做 XiaoHei（小黑）这套节点和插件，我们最朴素的念头就一句话：让 ComfyUI 真正好用在中国玩家手里。</p>
<p>外面很多工具，思路都是跟着英文社区走的——术语绕、界面陌生，不少习惯并不贴合我们平时怎么用。我们不想只再多一个节点包，而是想从中国人的使用习惯出发：中文的说明、符合直觉的操作、把复杂的参数藏到背后、把常用的功能顶到手边。</p>
<p>你看到的这个帮助窗口、每个节点下方的提示、每一句介绍，都是想让你少查资料、少走弯路，把时间省下来真正去做创作。</p>
<p>要是觉得顺手，欢迎到「交流反馈」里告诉我们；哪里别扭，也直接说——它会越来越适合你。</p>
<p><b>关于现阶段</b></p>
<p>这套插件现在还处在<b>起步阶段</b>。我们精力有限，目前一部分节点的功能还不够完善、有些该做的还没做齐，界面上也难免有粗糙、不顺手的地方——这些都看在眼里。</p>
<p>我们会一直慢慢往前磨：一边补完节点功能、一边把操作做得更顺、把说明写得更清楚，后续版本会持续更新优化，一点一点把它做扎实。</p>
<p>过程中要是碰到哪个节点不好用、哪个地方别扭，欢迎随时到「交流反馈」里拍我们——你的每条意见，都会变成下一个版本里变好的那一块。谢谢大家包容，也谢谢愿意陪我们一起把它做起来的你。</p>
</div>`;
    }
  },
  {
    key: "colors", title: "节点配色", cat: "XiaoHei 指南",
    icon: xhIconHTML("帮助", { size: 24, color: "current" }),
    tagline: "右键任意节点 →  节点配色：可拖动的浮动调色面板",
    help: `
<div style="line-height:1.85">
<p><b>怎么打开</b></p>
<ul>
<li>右键<b>任意节点</b>（XiaoHei 的、官方的都行）→ <b> 节点配色</b></li>
<li>选中节点后，浮动工具条上也有调色板按钮</li>
<li>快捷键 <b>Shift + \\</b>（可在设置 → 快捷键里改）</li>
</ul>
<p><b>面板怎么用</b></p>
<ul>
<li><b>按住标题栏可以拖动面板</b>，挪到不挡画布的地方；点面板外面或按 Esc 关闭</li>
<li>大方块里拖动选颜色（饱和度 + 明度），右边竖条拖动换色相；下面色号框可直接填 #rrggbb</li>
<li><b>标题栏 / 节点体</b>：切这两个按钮，决定取色器在改哪一层颜色</li>
<li>两条色号框前面的<b>小色块</b>点一下 = 复制色号</li>
<li>两条色号框中间的<b>链条</b>点一下 = 联动（节点体色跟着标题栏色走）；手改节点体色会断开联动</li>
<li>右上<b>收藏</b>：点「+」把当前配色存起来；点色块套用，右键删除（存本地，跨会话保留）</li>
<li>底部<b>预设</b>是 45 套成套配色，点一下直接套上</li>
<li><b>恢复默认配色</b>：XiaoHei 节点回到自己的分类默认色，官方节点回到主题默认色</li>
<li>多选时一次改一批；颜色会写进工作流存档，跟着工作流走</li>
</ul>
<p><b>另外</b>：XiaoHei默认会<b>按分类自动上色</b>（工具灰蓝 / 图像天蓝 / 视频靛蓝 / 音频品红 / 数学番茄红…），
手动配色优先级更高，自动色不会覆盖你选过的。可在设置里关掉自动配色。</p>
</div>`,
  },
  {
    key: "shortcuts", title: "快捷键与面板入口", cat: "XiaoHei 指南",
    icon: xhIconHTML("帮助", { size: 24, color: "current" }),
    tagline: "XiaoHei 的面板入口都在顶栏这一排",
    help: `
<div style="line-height:1.85">
<ul>
<li><b>小狗爪</b>：XiaoHei 设置面板（连线流动、各节点开关、外观、顶栏按钮显隐）</li>
<li><b>? 圆圈问号</b>：就是你现在看的这个 —— 所有 XiaoHei 组件的说明 + 使用指南</li>
<li><b>工作流图标</b>（节点连线那个）：XiaoHei 工作流浏览器（找自己的工作流 / 拖进画布）</li>
</ul>
<p>顶栏这排按钮都可以在 <b>XiaoHei 设置 → 顶栏按钮</b> 里逐个隐藏（只是藏按钮，功能和快捷键照常）。
   每一项的完整说明见本帮助的「设置项说明」专题。万一把「小狗爪」那颗也藏了，就在同一处点 <b>打开XiaoHei 设置面板</b> 把面板叫回来。</p>
<p>四颗按钮用的是<b>同一套样式</b>：底色跟随 ComfyUI 官方主题，鼠标移上去或面板打开时都会亮家族黄。</p>
</div>`,
  },
  {
    //  2026-11-10：设置面板里每项下面的小字说明全部删掉，统一收进这一页。
    //    help 是函数 ⇒ 每次打开实时读 window.XH_SETTING_DEFS（含 setup 后追加的顶栏三项）。
    key: "settings", title: "设置项说明", cat: "XiaoHei 指南",
    icon: xhIconHTML("帮助", { size: 24, color: "current" }),
    tagline: "XiaoHei 设置里每一项的完整说明、默认值与取值范围",
    help: settingsHelpHtml,
  },
  {
    //  2026-11-11 用户：「帮助界面底部换上同样的，小黑指南下面也加一个入口，把这些信息放进去」。
    //    措辞按「委婉软一些」写， 不出现「扫码」「加群」；二维码直接印在正文，不用悬浮浮层
    //    （主区 .xhhelp-main 是滚动容器，absolute 浮层会被裁掉）。
    key: "contact", title: "交流反馈", cat: "XiaoHei 指南",
    icon: xhIconHTML("帮助", { size: 24, color: "current" }),
    tagline: "有问题、有想法，都能在这儿找到小黑",
    help: contactHelpHtml,
  },
];

//  2026-11-08：复刻的 WepeNerd 节点（type 前缀 XH_WN_/XH_WepeNerd/XH_QwenEdit）原 CATEGORY 是
//    作者原包的 "WepeNerd/..."，帮助索引旧过滤只认 "XH" ⇒ 这 24 个节点一个都没有 ⇒ 节点悬浮
//    工具条的「?」调 XHHelp.openNode 找不到条目（用户报「点了不跳」）。
//    2026-11-08 后续：已把这些节点的 CATEGORY 统一改成 XiaoHei/Video·XiaoHei/Image·XiaoHei/工具（按功能归组，
//    不再堆「复刻」分组），因此 cat.startsWith("XiaoHei") 已为真、索引自然收录；replica 仅用于标记
//    「复刻件 · 已中文化」的说明文案，不再单独成组。口径与 web/xh_wepenerd/xh_wn_i18n.mjs 的 isWNNode 一致。
function isWNReplica(type) {
  return typeof type === "string" &&
    (type.startsWith("XH_WN_") || type.startsWith("XH_WepeNerd") || type.startsWith("XH_QwenEdit"));
}
// 旧：const WN_REPLICA_CAT = "复刻件"; —— 已弃用：复刻节点不再单独成组，改按 XiaoHei/Video·XiaoHei/Image·XiaoHei/工具 归位。

// ══════════════════════════════════════════════════════════════════════
// 节点示意卡：点击节点说明时在右侧实时画出「节点样子」（数据来自 /object_info）
// ══════════════════════════════════════════════════════════════════════
//  链接型端口（如 MODEL/IMAGE/LATENT…）在节点上显示为「左侧输入点」；
//  基础类型（INT/FLOAT/STRING/COMBO/BOOLEAN）显示为「中间控件框」。
const XH_WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "COMBO", "BOOLEAN"]);

// ══════════════════════════════════════════════════════════════════════
// 示意卡中英切换：端口名 / 控件名 / 类型令牌 的中英对照（按当前 UI 语言显示）
//  数据来自 /object_info（全英文），这里在「渲染时」按 currentLang() 翻译，
//  不改动缓存里的英文原文 ⇒ 中/英切换无需重建索引。
// ══════════════════════════════════════════════════════════════════════
const XH_PREVIEW_ZH = {
  // —— 链接型数据类型令牌（右侧徽标）——
  MODEL: "模型", CLIP: "CLIP", VAE: "VAE", CONDITIONING: "条件",
  LATENT: "潜空间", IMAGE: "图像", MASK: "遮罩", AUDIO: "音频",
  IPADAPTER: "IP适配器", CONTROL_NET: "控制网", CONTROLNET: "控制网",
  STYLE_MODEL: "风格模型", CLIP_VISION: "CLIP视觉", UPSCALE_MODEL: "放大模型",
  GLIGEN: "GLIGEN", HOOKS: "钩子", MODEL_HELPER: "模型辅助",
  // —— 常见端口 / 控件名 ——
  model: "模型", clip: "CLIP", vae: "VAE", positive: "正面条件", negative: "负面条件",
  latent_image: "潜空间图像", latent: "潜空间", samples: "采样", images: "图像",
  image: "图像", mask: "遮罩", audio: "音频", conditioning: "条件",
  seed: "随机种子", noise_seed: "噪声种子", steps: "步数", cfg: "提示词引导",
  cfg_scale: "引导强度", sampler_name: "采样器", scheduler: "调度器",
  denoise: "去噪强度", width: "宽", height: "高", batch_size: "批大小",
  length: "长度", fps: "帧率(fps)", frame_rate: "帧率", prompt: "提示词",
  negative_prompt: "负面提示词", text: "文本", value: "数值",
  model_name: "模型名", ckpt_name: "检查点名", vae_name: "VAE名",
  clip_name: "CLIP名", lora_name: "LoRA名", strength: "强度",
  strength_model: "模型强度", strength_clip: "CLIP强度",
  start_percent: "起始比例", end_percent: "结束比例",
  blend_mode: "混合模式", mode: "模式", type: "类型", scale: "缩放",
  // —— 控件类型标签 ——
  INT: "整数", FLOAT: "浮点", STRING: "文本", COMBO: "选项", BOOLEAN: "开关",
};
/** 按当前语言把英文端口/控件名翻成中文；英文模式或对照表里没有 ⇒ 原样返回。 */
function xhPrevName(en) {
  if (currentLang() !== "zh") return en;
  if (!en) return en;
  return XH_PREVIEW_ZH[en] || XH_PREVIEW_ZH[String(en).toUpperCase()] || en;
}

/** 从 /object_info 的 def 提取轻量端口数据：只存名字+类型，不存整个 def，避免撑大 localStorage 缓存。 */
function buildPreview(def) {
  try {
    const req = (def && def.input && def.input.required) || {};
    const opt = (def && def.input && def.input.optional) || {};
    const inputs = [];
    const pushIn = (obj, optional) => {
      for (const k in obj) {
        const raw = obj[k];
        const t = Array.isArray(raw) ? raw[0] : raw;
        const type = (t == null) ? "?" : String(t);
        inputs.push({ name: k, type, widget: XH_WIDGET_TYPES.has(type), opt: optional });
      }
    };
    pushIn(req, false);
    pushIn(opt, true);
    const outs = (def && def.output) || [];
    const outNames = (def && def.output_name) || [];
    const outputs = outs.map((t, i) => ({ type: String(t), name: outNames[i] || ("输出 " + (i + 1)) }));
    return { inputs, outputs };
  } catch (e) { return { inputs: [], outputs: [] }; }
}

/** 取节点标题栏颜色：优先用画布真实配色（app.canvas.node_colors），否则回落到家族分类色板。 */
function nodeTitleColor(entry) {
  try {
    const nc = (window.app && window.app.canvas && window.app.canvas.node_colors)
            || (window.LiteGraph && window.LiteGraph.node_colors);
    if (nc) {
      const last = String(entry.groupLabel || "").split("/").pop();
      const c = nc[entry.groupLabel] || nc[entry.cat] || nc[last];
      if (c) return (typeof c === "string")
        ? { title: c, body: c }
        : { title: c.color || c.title || "#1A1613", body: c.bgcolor || c.body || "rgba(26,22,19,.16)" };
    }
  } catch (e) { /* 忽略 */ }
  //  2026-11-23 分类细分：「XiaoHei/图像/绘画手绘」在色板里没有精确 key，
  //  按父级前缀回落到旧色板（图像→绿 / 视频→蓝 / 工具→灰），保持整族配色不乱。
  const gl = String(entry.groupLabel || "");
  const parent = gl.startsWith("XiaoHei/图像/") ? "XiaoHei/Image"
               : gl.startsWith("XiaoHei/视频/") ? "XiaoHei/Video"
               : gl.startsWith("XiaoHei/工具/") ? "XiaoHei/工具" : null;
  return XH_NODE_COLORS[gl] || (parent && XH_NODE_COLORS[parent])
      || { title: "#1A1613", body: "rgba(26,22,19,.14)" };
}

/** 画出一张「节点样子」示意卡（HTML 字符串）。 */
function renderNodePreview(entry) {
  const p = entry.preview || { inputs: [], outputs: [] };
  const col = nodeTitleColor(entry);
  const title = col.title, body = col.body, fg = col.fg || "#fff";
  const portIns = (p.inputs || []).filter((i) => !i.widget);
  const widgetIns = (p.inputs || []).filter((i) => i.widget);
  const outputs = p.outputs || [];
  let h = `<div class="xhnp" style="--xhnp-title:${title};--xhnp-body:${body};--xhnp-fg:${fg}">`;
  h += `<div class="xhnp-title">${esc(entry.title)}</div><div class="xhnp-body">`;
  if (!portIns.length && !widgetIns.length && !outputs.length) {
    h += `<div class="xhnp-empty">（此节点无端口 / 控件）</div>`;
  } else {
    portIns.forEach((i) => {
      const nm = xhPrevName(i.name), tp = xhPrevName(i.type);
      // 名与类型翻译后相同（如 model/MODEL → 都成「模型」）⇒ 类型徽标不再重复显示
      const showType = tp && tp !== nm;
      h += `<div class="xhnp-row"><span class="xhnp-dot"></span>`
        + `<span class="xhnp-name">${esc(nm)}</span>`
        + (i.opt ? `<span class="xhnp-opt">可选</span>` : ``)
        + (showType ? `<span class="xhnp-type">${esc(tp)}</span>` : ``)
        + `</div>`;
    });
    widgetIns.forEach((i) => {
      h += `<div class="xhnp-widget"><span class="xhnp-wname">${esc(xhPrevName(i.name))}</span>`
        + `<span class="xhnp-wbox">${esc(xhPrevName(i.type))}</span></div>`;
    });
    outputs.forEach((o) => {
      const nm = xhPrevName(o.name), tp = xhPrevName(o.type);
      const showType = tp && tp !== nm;
      h += `<div class="xhnp-row xhnp-row-out">`
        + (showType ? `<span class="xhnp-type">${esc(tp)}</span>` : ``)
        + `<span class="xhnp-name">${esc(nm)}</span><span class="xhnp-dot"></span></div>`;
    });
  }
  h += `</div></div>`;
  return h;
}

//  分类 → 标题栏配色（画布取不到时的回落；与 ComfyUI 节点分类色风格一致）
const XH_NODE_COLORS = {
  "XiaoHei/Video":      { title: "#2f6fb0", body: "#11283f" },
  "XiaoHei/Image":      { title: "#3a8a4a", body: "#11281a" },
  "XiaoHei/Model":      { title: "#a06a2c", body: "#2a1c0e" },
  "XiaoHei/Control":    { title: "#8a4fb0", body: "#231433" },
  "XiaoHei/Identity":   { title: "#2f8f8f", body: "#0f2b2b" },
  "XiaoHei/SetGet":     { title: "#5a6fb0", body: "#161f33" },
  "XiaoHei/工具":        { title: "#6a6a6a", body: "#1d1d1d" },
  "XiaoHei/循环":        { title: "#b06a2c", body: "#2a1c0e" },
  "XiaoHei/数学":        { title: "#2c7ab0", body: "#0f2030" },
  "XiaoHei/链提示词":     { title: "#b04f7a", body: "#2a0f1c" },
  "XiaoHei/音频":        { title: "#2f8f6f", body: "#0f2b22" },
  "XiaoHei/音频分离":     { title: "#2f8f6f", body: "#0f2b22" },
  "XiaoHei/音频工具":     { title: "#2f8f6f", body: "#0f2b22" },
  "XiaoHei/导演台":      { title: "#b0772c", body: "#2a1c0e" },
  "XiaoHei/Character":  { title: "#9a4fb0", body: "#231433" },
  "XiaoHei/指南":        { title: "#1A1613", body: "#241E18" },
  "小黑家族":            { title: "#9a4fb0", body: "#231433" }
};

//  ╔══════════════════════════════════════════════════════════════╗
//  ║  搜索关键词（kw）：显示名 ≠ 用户嘴里的叫法                      ║
//  ╚══════════════════════════════════════════════════════════════╝
//  2026-11-19 用户报「打字打草图搜不到」。两层原因：
//    ① 收录 bug（见 xhCatCore）——已修；
//    ② 就算收录了，title 是「标注 XiaoHei」，搜索只比 title/cls/tagline/分类，
//       正文里即便写了「画框、圈选」也没人比 ⇒ 用户按自己的说法永远搜不到。
//  现在给每条索引生成一个 kw：显示名 + 分类 + 摘要 + **说明正文的纯文本** + 口语别名，
//    搜索统一比这一个字段。kw 随索引进 localStorage 缓存，旧缓存没有 kw 就回落旧字段。
const NODE_ALIAS = {
  //  只参与搜索，不改任何显示名。键 = class_type。
  XHSketch:        "草图 画图 画笔 框选 圈选 涂抹 标记 批注 sketch draw",
  XHInfo:          "便签 便条 注释 备注 说明 note memo",
  XHNumberPick:    "选数 数字 数值 取值 挑数字 number pick",
  XHLoadImage:     "读图 载入图片 打开图片 看图片 load image",
  XHLoadImageMini: "读图 载入图片 打开图片 看图片 load image",
  XHSaveImage:     "存图 保存图片 导出图片 出图 save image",
  XHInpaintCrop:   "重绘 局部重绘 涂抹重绘 裁剪 inpaint crop",
  XHInpaintStitch: "重绘 缝合 拼回 拼接 inpaint stitch",
  XH_AudioStudio:  "音频 律动 节奏 反应 蹦迪 audio react",
};
/** HTML → 纯文本（说明正文参与搜索；标签和实体一律变空格，不制造假匹配）。 */
function plainText(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** 拼一条索引的搜索关键词。正文截断，避免缓存被撑大。 */
function buildKw(parts) {
  return [parts.title, parts.catName, parts.groupLabel, parts.tagline,
          NODE_ALIAS[parts.cls] || "", plainText(parts.help).slice(0, 1500)]
    .filter(Boolean).join(" ").toLowerCase();
}

async function buildIndex() {
  try {
    const d = await fetch("/object_info", { headers: { Accept: "application/json" } })
      .then((r) => (r && r.ok ? r.json() : null));
    if (!d) throw new Error("no object_info");
    const items = [];
    for (const type in d) {
      const def = d[type] || {};
      const cat = def.category || "";
      //  ⚠️ 必须用规范化后的分类做判断：`👑 XiaoHei/🎨 编辑器` 这类带 emoji 前缀的分类
      //    若直接 startsWith("XiaoHei") 会 false ⇒ 节点被漏收（草图/便签/修复/加载图…）。
      const catCore = xhCatCore(cat);
      const replica = isWNReplica(type);
      //  2026-11-14：1:1 复刻的角色表节点 CATEGORY 是「小黑家族」而不是 XiaoHei/*，
      //    原先这里会把它整个过滤掉 ⇒ 帮助里搜「小黑」只剩一条「交流反馈」。
      //    按分类精确放行（不放宽到任意中文分类，避免把别人的节点收进来）。
      //  2026-11-25 收紧：先按家族白名单精确判定 class_type 是不是我们自己的。
      //    旧逻辑只看分类前缀 `小黑` ⇒ 第三方 `Comfyui-XH_Krea2Catalog` 的
      //    `XH_Krea2CatalogLibrary`（CATEGORY=`小黑/Krea2`）被误收，帮助首页
      //    凭空多出一个纯英文分类「Krea2」，且重启 ComfyUI 永远修不掉。
      //    白名单没加载成功时退回旧分类判据，避免整包白屏。
      const family = window.__XH_FAMILY_TYPES__;
      const isFamily = family ? family.has(type) : (catCore.startsWith("XiaoHei") || catCore.startsWith("小黑"));
      if (!isFamily && !replica) continue;
      //  白名单里还包含 XHDirectorStudio（续片 / 导演台，另一个包）的节点，归属守卫要认，
      //    但它们是别家的帮助内容 ⇒ 本帮助面板只收本包分类（XiaoHei/* + 小黑家族），
      //    否则首页会冒出 MiniMax H3/*、🔁XH/Video 这些纯英文分类。
      const inThisPack = catCore.startsWith("XiaoHei") || catCore === "小黑家族" || replica;
      if (!inThisPack) continue;
      //  内部快照节点不进帮助侧栏。**无条件过滤**：旧版写在 inThisPack 之后，
      //    XH_WN_MaskedLoraSnapshot 因 replica=true 绕过去，首页冒出英文分类「internal」。
      if (catCore === "_internal" || catCore === "internal") continue;
      const helpDef = HELP_DEFS.find((h) => h.cls === type) || {};
      // 复刻节点 CATEGORY 已是 XiaoHei/Video·XiaoHei/Image·XiaoHei/工具 ⇒ 直接按真实分类归组（不再堆「复刻」分组）
      const catName = (() => {
        if (catCore === "小黑家族") return "小黑家族";
        let n = catCore.replace(/^(XiaoHei|小黑)\/?/, "");
        //  2026-11-25 兜底归一：运行中的旧 ComfyUI 进程分类还是老值，
        //    会出现「Image 1 + 图像 43」「Video 10 + 视频 24」「分镜 7 + 分镜/高级 5」
        //    「工具 3 + 工具/xxx 13」这种同义重复。前端先把老分类名折进新分类，
        //    这样即使后端还没重启，帮助侧栏也不会出现两组同义分类。
        //    后端新代码已把这些节点的 CATEGORY 真正改掉（V3 define_schema 覆盖），
        //    重启后这些别名自然不再出现，本表退化为无害的兼容层。
        if (n === "Image") n = "图像/图像输入输出";
        else if (n === "Video") n = "视频/H3核心与加速";
        else if (n === "Control") n = "逻辑与数值/滑块";
        else if (n === "SetGet") n = "逻辑与数值/存取";
        else if (n === "Identity") n = "模型与身份/角色身份";
        else if (n === "Model") n = "模型与身份/模型权重";
        else if (n === "分镜/高级") n = "分镜";
        else if (n === "工具") n = "工具/系统与流程控制";
        return n || "其他";                          // 分类只写了个光秃秃的 XiaoHei 时归「其他」
      })();
      const groupLabel = catCore;
      const title = helpDef.title || (def.display_name && def.display_name !== type ? def.display_name : type.replace(/^XH\s*/, ""));
      //  2026-10-28 用户报「详情页没有内容」⇒ 根因是 HELP_DEFS 为空、且**没用节点的 description**。
      //    后端每个节点的 description 里已经写好了中文说明（【干什么】/【怎么配】…）⇒ 直接拿来用，
      //    比另写一套更准。HELP_DEFS 只作为**覆盖/补充**。
      //     2026-11-08 第三轮：复刻件 description 是原版英文（1:1 抄、不动源码）⇒
      //    用 xh_wn_i18n.mjs 的 WN_DESC_ZH 提供中文说明（wnDesc 按语言回落英文原文），正文即对应语言。
      const desc = (def.description || "").trim();
      const wnLang = currentLang();
      const wnIsZh = (wnLang || "zh") === "zh";
      const wnBanner = wnIsZh
        ? `<b>XiaoHei 复刻件 · 已中文化</b><br>节点本体、端口、控件、悬浮说明已全部中文化；悬浮工具条的「中 / EN」可随时切回英文。`
        : `<b>XiaoHei · replica · localized</b><br>Node body, ports, widgets and tooltips are localized; the canvas "中 / EN" switch restores English anytime.`;
      const wnBody = `<div style="line-height:1.85;white-space:pre-wrap">${esc(wnDesc(type, wnLang, desc))}</div>`;
      const help = helpDef.help || (replica
        ? `<div style="line-height:1.85">${wnBanner}<br><br>${wnBody}</div>`
        : (desc ? `<div style="line-height:1.85;white-space:pre-wrap">${esc(desc)}</div>` : null));
      const tagline = replica ? "复刻件 · 已中文化" : (helpDef.tagline || desc.split("\n")[0] || "");
      const preview = buildPreview(def);
      const kw = buildKw({ cls: type, title, catName, groupLabel, tagline, help });
      items.push({ cls: type, title: title, cat: catName, groupLabel: groupLabel,
                   icon: helpDef.icon || catIconHTML(catName, title),
                   tagline: tagline, help: help, kind: "node", key: "node:" + type,
                   kw, preview });
    }
    // 专题页（非节点的说明：功能指南 / 使用说明）也进索引，单独归到「XiaoHei 指南」组
    for (const t of TOPICS) {
      //  help 允许是函数（设置项说明实时生成）⇒ 这里必须解析成 HTML 字符串，
      //    否则 localStorage 索引缓存 JSON.stringify 会把函数丢掉。
      //  2026-11-12：专题图标原写 color:"current" 在卡片里渲染成空白，这里统一改品牌黄重生成
      const topicIcon = (typeof t.icon === "string" && t.icon.indexOf("xh-icon-mask") >= 0)
        ? t.icon : xhIconHTML("帮助", { size: 22, color: "brand" });
      const topicHelp = resolveHelp(t);
      const topicKw = buildKw({ cls: "", title: t.title, catName: t.cat,
                                groupLabel: "XiaoHei/指南", tagline: t.tagline, help: topicHelp });
      items.push({ cls: "", title: t.title, cat: t.cat, groupLabel: "XiaoHei/指南", icon: topicIcon,
                   tagline: t.tagline, help: topicHelp, kind: "topic", key: "topic:" + t.key,
                   kw: topicKw });
    }
    return items;
  } catch (e) { console.warn("[XiaoHei.Help] buildIndex fail:", e); return []; }
}
function groupByCategory(items) {
  const map = {};
  for (const it of items) { if (!map[it.cat]) map[it.cat] = []; map[it.cat].push(it); }
  const names = Object.keys(map).sort();
  //  2026-10-28 用户要求：「XiaoHei 指南…放在首页下面第一个会比较合适」
  //   ⇒ 「指南」组（TOPICS 的 cat = "XiaoHei 指南"）**排到最前**，其余仍按字母序。
  const GUIDE = "XiaoHei 指南";
  const ordered = names.includes(GUIDE)
    ? [GUIDE].concat(names.filter((n) => n !== GUIDE))
    : names;
  return ordered.map((name, idx) => ({ name, items: map[name], open: idx === 0 }));
}

// ═══════════════════════════════════════════════════════
// 浮窗 DOM（含 resize + 主题 toggle）
// ═══════════════════════════════════════════════════════
function ensureWindow() {
  if (S.win) return S.win;
  const win = el("div", "xhhelp-win");
  win.innerHTML = `
    <div class="xhhelp-title">
      <!--  2026-10-28：扳手 emoji → **灯泡图标**（用户：「扳手图标应该换成灯泡儿了」）。
           灯泡 = 家族「说明/帮助」的统一语义，跟顶栏那颗是同一盏灯。 -->
      <span class="xhhelp-name" title="XiaoHei 帮助">${helpIconHTML()} XiaoHei 帮助</span>
      <button class="xhhelp-tool xhhelp-close" title="关闭">×</button>
    </div>
    <div class="xhhelp-bar">
      <button class="xhhelp-nav" title="返回">${xhIconHTML("arrow-left", { size: 16, color: "current" })}</button>
      <button class="xhhelp-nav" title="前进">${xhIconHTML("arrow-right", { size: 16, color: "current" })}</button>
      <div class="xhhelp-search" style="display:flex;align-items:center;gap:6px;">${xhIconHTML("search", { size: 14, color: "current" })}<input type="search" placeholder="搜索组件、功能或问题..." style="flex:1;width:auto;min-width:0"></div>
      <button class="xhhelp-home">首页</button>
    </div>
    <div class="xhhelp-body"><div class="xhhelp-side"></div><div class="xhhelp-main"></div></div>
    <div class="xhhelp-foot">
      <div class="xhhelp-foot-badges" id="xhhelp-foot-badges"></div>
      <div class="xhhelp-foot-fsp"></div>
      <span class="xhhelp-foot-ver" id="xhhelp-ver">XiaoHei v—</span>
    </div>
  `;
  document.body.appendChild(win);

  //  2026-10-28：版本号**不再硬编码**（之前写死 v1.17.7，实际包已到 1.22.0 —— 每版都忘了改）。
  //    唯一真源 = 后端 __init__.py 的 VERSION（GET /xh/about），跟 xh_about.js 同一套做法。
  //    取不到就显示「—」，**绝不硬编码一个假版本号糊弄**。
  try {
    fetch("/xh/about", { headers: { Accept: "application/json" } })
      .then((r) => (r && r.ok) ? r.json() : null)
      .then((d) => {
        const el = document.getElementById("xhhelp-ver");
        if (el && d && d.version) el.textContent = "v" + d.version;
      })
      .catch(() => { /* 取不到就保持「—」 */ });
  } catch (e) { /* 忽略 */ }

  // 标题栏拖拽 + 右下角 resize
  const title = win.querySelector(".xhhelp-title");
  let dragging = false, sx, sy, ox, oy, resizing = false, rw, rh, rx, ry;
  title.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("xhhelp-close")) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = win.getBoundingClientRect(); ox = r.left; oy = r.top;
    win.style.left = ox + "px"; win.style.top = oy + "px";
    win.style.right = "auto"; win.style.bottom = "auto";
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging && !resizing) return;
    if (dragging) {
      win.style.left = (ox + e.clientX - sx) + "px";
      win.style.top = (oy + e.clientY - sy) + "px";
    } else if (resizing) {
      const nw = Math.max(400, rw + e.clientX - rx);
      const nh = Math.max(300, rh + e.clientY - ry);
      win.style.width = nw + "px"; win.style.height = nh + "px";
    }
  });
  window.addEventListener("pointerup", () => { dragging = false; resizing = false; });

  win.addEventListener("pointerdown", (e) => {
    const r = win.getBoundingClientRect();
    if (e.clientX >= r.right - 16 && e.clientY >= r.bottom - 16) {
      resizing = true; rx = e.clientX; ry = e.clientY;
      rw = r.width; rh = r.height;
      e.preventDefault();
    }
  });

  // 关闭 / 返回 / 前进 / 搜索 / 首页
  win.querySelector(".xhhelp-close").onclick = () => close();
  const btns = win.querySelectorAll(".xhhelp-nav");
  btns[0].onclick = () => { if (S.hi > 0) { S.hi--; navigate(S.hist[S.hi], false); } };
  btns[1].onclick = () => { if (S.hi < S.hist.length - 1) { S.hi++; navigate(S.hist[S.hi], false); } };
  win.querySelector(".xhhelp-search input").addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); if (q) renderSearch(q); else navigate("home"); });
  win.querySelector(".xhhelp-home").onclick = () => { win.querySelector(".xhhelp-search input").value = ""; navigate("home"); };

  //  2026-11-11：底部换成与「设置 → XiaoHei → 关于」同一排徽章。
  //    qrDir:"up" ⇒ 微信二维码向上弹，不被 .xhhelp-win 的 overflow:hidden 裁掉。
  //    primeAbout() 拿到后端版本号后会自动把三处徽章栏一起刷成真实版本。
  try {
    renderBadgeRow(win.querySelector("#xhhelp-foot-badges"), { qrDir: "up" });
    primeAbout();
  } catch (e) { console.warn("[XiaoHei.Help] 底部徽章渲染失败:", e); }

  win.style.display = "none"; S.win = win;
  bindHelpLang();   // 语言切换 ⇒ 重画示意卡（仅绑一次）
  return win;
}
function updateNavButtons() { if (!S.win) return; const btns = S.win.querySelectorAll(".xhhelp-nav"); btns[0].disabled = S.hi <= 0; btns[1].disabled = S.hi >= S.hist.length - 1; }

// ═══════════════════════════════════════════════════════
// 侧边栏 / 主区
// ═══════════════════════════════════════════════════════
//  2026-11-23 用户反馈：细分后侧栏 21 个分类头平铺成一长条，比细分前还难找。
//  ⇒ 改成两级折叠：顶层只显示大类（指南/模型/图像/视频/工具…十几个，跟细分前一样短），
//    点开大类才露子类，子类点开才是节点。
//  关键：只改**视图层**，S.groups 扁平结构/首页/搜索/缓存全部不动。
//    细分分类名形如「图像/绘画手绘」→ 父=图像、子=绘画手绘；
//    其余分类（模型/控制/音频/指南…无斜杠）保持单级，跟原来完全一样。
function sideParentOf(name) {
  const m = String(name || "").match(new RegExp("^(" + XH_PARENTS + ")\\/([^/]+)$"));
  return m ? { parent: m[1], sub: m[2] } : null;
}
/** 把扁平 S.groups 归并成大类树：[{parent:null|名, name, icon, subs:[{sub, group}]}]，侧栏/首页共用。 */
function buildGroupTree() {
  const tree = [];
  const pIdx = {};
  if (!S.parentOpen) S.parentOpen = {};   // 顶层大类展开状态跨重绘保持
  for (const g of S.groups) {
    const p = sideParentOf(g.name);
    if (!p) { tree.push({ parent: null, name: g.name, icon: g.name, subs: [{ sub: null, group: g }] }); continue; }
    let node = pIdx[p.parent];
    if (!node) {
      node = { parent: p.parent, name: p.parent, icon: p.parent, subs: [],
               open: S.parentOpen[p.parent] === undefined ? false : S.parentOpen[p.parent] };
      pIdx[p.parent] = node; tree.push(node);
    }
    node.subs.push({ sub: p.sub, group: g });
  }
  return tree;
}
function renderSidebar(activeEntry) {
  const side = S.win.querySelector(".xhhelp-side"); if (!side) return;
  side.innerHTML = "";
  const home = el("div", "xhhelp-side-home", " 首页");
  if (activeEntry === "home") home.classList.add("xhhelp-item-active");
  home.addEventListener("click", () => navigate("home"));
  side.appendChild(home);

  const tree = buildGroupTree();
  for (const node of tree) {
    // 单级分类（无子类）：沿用原来的渲染，一个头 + 一串节点
    if (!node.parent) {
      const g = node.subs[0].group;
      side.appendChild(buildSideGroup(g, g.name, catIconHTML(node.icon, null, { size: 14 }), activeEntry, false));
      continue;
    }
    // 两级分类（图像/视频/工具）：顶层大类头 → 展开后是子类头 → 展开后才是节点
    const total = node.subs.reduce((n, s) => n + s.group.items.length, 0);
    const wrap = el("div", "xhhelp-grp");
    const head = el("div", "xhhelp-grp-head" + (node.open ? " xhhelp-grp-open" : ""));
    head.innerHTML = `<span class="xhhelp-grp-arrow">${xhIconHTML("chevron-right", { size: 12, color: "current" })}</span>
      <span class="xhhelp-grp-ic">${catIconHTML(node.icon, null, { size: 14 })}</span>
      <span class="xhhelp-grp-label">${esc(catZh(node.name))}</span>
      <span class="xhhelp-grp-count">${total}</span>`;
    const body = el("div", "xhhelp-grp-items" + (node.open ? "" : " xhhelp-grp-collapsed"));
    head.addEventListener("click", () => {
      node.open = !node.open;
      S.parentOpen[node.name] = node.open;
      head.classList.toggle("xhhelp-grp-open", node.open);
      body.classList.toggle("xhhelp-grp-collapsed", !node.open);
    });
    for (const s of node.subs) body.appendChild(buildSideGroup(s.group, s.sub, "", activeEntry, true));
    wrap.appendChild(head); wrap.appendChild(body); side.appendChild(wrap);
  }
}
/** 造一个可折叠组：单级时 head 带分类图标，两级子类时只显示子类名（图标位置留空缩进）。 */
function buildSideGroup(g, label, iconHtml, activeEntry, isSub) {
  const wrap = el("div", "xhhelp-grp" + (isSub ? " xhhelp-sub" : ""));
  const head = el("div", "xhhelp-grp-head" + (g.open ? " xhhelp-grp-open" : ""));
  head.innerHTML = `<span class="xhhelp-grp-arrow">${xhIconHTML("chevron-right", { size: 12, color: "current" })}</span>`
    + (iconHtml ? `<span class="xhhelp-grp-ic">${iconHtml}</span>` : "")
    + `<span class="xhhelp-grp-label">${esc(label)}</span>`
    + `<span class="xhhelp-grp-count">${g.items.length}</span>`;
  const body = el("div", "xhhelp-grp-items" + (g.open ? "" : " xhhelp-grp-collapsed"));
  head.addEventListener("click", () => {
    g.open = !g.open;
    head.classList.toggle("xhhelp-grp-open", g.open);
    body.classList.toggle("xhhelp-grp-collapsed", !g.open);
  });
  for (const it of g.items) {
    const item = el("div", "xhhelp-item", esc(it.title));
    if (activeEntry && activeEntry.key === it.key) item.classList.add("xhhelp-item-active");
    item.title = it.cls;
    item.addEventListener("click", () => navigate(it));
    body.appendChild(item);
  }
  wrap.appendChild(head); wrap.appendChild(body); return wrap;
}

function renderHome() {
  const main = S.win.querySelector(".xhhelp-main"); main.innerHTML = "";
  // ★ 2026-11-12：首页顶部「我们的初心」横幅（点链接跳转专题）
  const aboutEntry = S.index.find((e) => e.key === "topic:about");
  if (aboutEntry) {
    const banner = el("div", "xhhelp-about");
    banner.innerHTML = `<h3>我们的初心</h3>
      <p>让 ComfyUI 真正好用在中国玩家手里。中文说明、符合直觉的操作，把常用功能顶到手边。</p>
      <a>查看完整初心 →</a>`;
    banner.querySelector("a").addEventListener("click", () => navigate(aboutEntry));
    main.appendChild(banner);
  }
  const h = el("p"); h.style.cssText = "font-weight:700;color:var(--xh-text);margin:0 0 12px;font-size:14px";
  h.textContent = ` 所有 XiaoHei 组件（共 ${S.index.length} 个）`; main.appendChild(h);
  //  2026-11-23：首页也按大类归并（跟侧栏一致），一个大标题铺完该大类所有卡片，
  //    不再把细分 21 个子类碎成 21 段小标题。
  for (const node of buildGroupTree()) {
    const total = node.subs.reduce((n, s) => n + s.group.items.length, 0);
    const gh = el("p");
    gh.style.cssText = "font-size:11px;color:var(--xh-sub);letter-spacing:.06em;margin:14px 0 6px;display:flex;align-items:center;gap:5px;";
    gh.innerHTML = `<span class="xhhelp-grp-ic">${catIconHTML(node.icon, null, { size: 14 })}</span><span>${esc(catZh(node.name))}</span><span style="opacity:.5">· ${total}</span>`;
    main.appendChild(gh);
    for (const s of node.subs) for (const it of s.group.items) main.appendChild(buildCard(it));
  }
}
function buildCard(entry) {
  const div = el("div", "xhhelp-card");
  div.innerHTML = `<span class="xhhelp-card-ic">${iconHtml(entry.icon)}</span>
    <div class="xhhelp-card-t"><div class="xhhelp-card-n">${esc(entry.title)}</div>
    <div class="xhhelp-card-d">${esc(entry.tagline || catZh(entry.cat))}</div></div>`;
  div.addEventListener("click", () => navigate(entry)); return div;
}
function renderDetail(entry) {
  const main = S.win.querySelector(".xhhelp-main"); main.innerHTML = "";
  const helpHtml = resolveHelp(entry);
  const wrap = el("div", "xhhelp-detail");
  const textCol = el("div", "xhhelp-detail-text");
  textCol.innerHTML = `
    <h2>${iconHtml(entry.icon)} ${esc(entry.title)}</h2>
    <div class="xhhelp-detail-type">${esc(entry.cls)} · ${esc(entry.groupLabel)}</div>
    <div class="xhhelp-detail-body">
      ${helpHtml || `<div class="xhhelp-detail-empty">
        这个组件还没有单独的说明文字。<br>
        <span style="font-size:12px;opacity:.75">分类：${esc(entry.cat)}　类型：${esc(entry.cls)}</span><br><br>
        <span style="font-size:11px"> 完整参数说明可以直接看画布上这个节点下方的官方提示，或用鼠标悬停在参数名上。</span>
      </div>`}
    </div>`;
  const row = el("div"); row.style.cssText = "margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;";
  // 专题页（指南类）没有"节点"可加 ⇒ 不显示「加到画布」
  if (entry.kind !== "topic") {
    const addBtn = el("button", "xhhelp-btn xhhelp-btn-primary", " 加到画布");
    addBtn.type = "button"; addBtn.addEventListener("click", () => createNodeAt(entry.cls)); row.appendChild(addBtn);
  }
  const copyBtn = el("button", "xhhelp-btn", " 复制文字");
  copyBtn.type = "button";
  //  2026-11-10：设置项说明搬家后，「复制文字」要能复制**完整正文**，不是只复制一行摘要。
  const plain = (() => {
    try {
      const t = document.createElement("div");
      t.innerHTML = helpHtml;
      return (t.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    } catch (e) { return ""; }
  })();
  copyBtn.addEventListener("click", () => {
    navigator.clipboard?.writeText(`${entry.title}\n\n${plain || entry.tagline || ""}`).catch(() => {});
  });
  row.appendChild(copyBtn);
  textCol.appendChild(row);
  wrap.appendChild(textCol);

  //  ★ 2026-11-12：点击节点说明时，右侧实时出现「节点样子」示意卡（纯前端，数据来自 /object_info 的端口定义）
  if (entry.kind === "node" && entry.preview && (entry.preview.inputs.length || entry.preview.outputs.length)) {
    const prev = el("div", "xhhelp-detail-prev");
    prev.innerHTML = renderNodePreview(entry);
    wrap.appendChild(prev);
  }

  main.appendChild(wrap);
  //  「XiaoHei 指南 → 交流反馈」：把徽章与二维码挂到正文占位上（wrap 已挂载，querySelector 才找得到）
  if (entry.key === "topic:contact") renderContactExtras(wrap);
}
/** 专题页附加块：同一排徽章（不挂悬浮二维码）+ 直接印出来的微信二维码。 */
function renderContactExtras(wrap) {
  try {
    const bh = wrap.querySelector("#xhhelp-contact-badges");
    if (bh) renderBadgeRow(bh, { showQr: false });
    const qh = wrap.querySelector("#xhhelp-contact-qr");
    if (!qh) return;
    const box = el("div");
    box.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px;border:0.5px solid var(--xh-border);border-radius:8px;background:var(--xh-card)";
    const img = document.createElement("img");
    img.src = QR_URL;                       // 运行时取，避免把带端口的绝对地址写进 localStorage 索引缓存
    img.alt = "XiaoHei 微信二维码";
    img.style.cssText = "display:block;width:160px;height:auto;border-radius:6px;flex:none";
    img.onerror = () => { img.style.display = "none"; };
    const cap = el("div");
    cap.style.cssText = "font-size:12px;color:var(--xh-sub);line-height:1.7;white-space:pre-line";
    cap.textContent = COPY.wechatQrTip + "\n二维码随包，换码只改这一处，不用联网。";
    box.appendChild(img); box.appendChild(cap); qh.appendChild(box);
  } catch (e) { console.warn("[XiaoHei.Help] 交流反馈附加块渲染失败:", e); }
}
function renderSearch(q) {
  const main = S.win.querySelector(".xhhelp-main"); main.innerHTML = "";
  //  2026-11-14：分类名也参与搜索（「小黑家族」「图像」「视频」等），
  //    否则按家族中文名搜时，节点明明在侧栏里却一个都搜不到。
  //  2026-11-19：改为统一比 kw（显示名 + 分类 + 摘要 + 说明正文纯文本 + 口语别名）。
  //    旧缓存里的条目没有 kw ⇒ 回落原来的字段比对，不会因为缓存旧就搜不出来。
  //    另：用户常整句打「草图节点」，所以去掉尾部「节点/组件/功能」再兜一次。
  const words = q.split(/\s+/).filter(Boolean);
  const alt = q.replace(/(节点|组件|功能|插件|的)$/g, "").trim();
  const hitOld = (it) =>
    (it.title || "").toLowerCase().includes(q) ||
    (it.cls || "").toLowerCase().includes(q) ||
    (it.tagline || "").toLowerCase().includes(q) ||
    (it.cat || "").toLowerCase().includes(q) ||
    (it.groupLabel || "").toLowerCase().includes(q);
  const hits = S.index.filter((it) => {
    if (!it.kw) return hitOld(it);
    if (words.length > 1) return words.every((w) => it.kw.includes(w));  // 多词 = 全部命中
    if (it.kw.includes(q)) return true;
    return !!alt && alt !== q && it.kw.includes(alt);
  });
  if (!hits.length) { main.innerHTML = `<div style="padding:20px;opacity:.6;text-align:center;">没有找到匹配 "${esc(q)}" 的组件。</div>`; return; }
  const h = el("p"); h.style.cssText = "font-weight:700;color:var(--xh-text);margin:0 0 10px;font-size:14px";
  h.textContent = `找到 ${hits.length} 个结果`; main.appendChild(h);
  for (const it of hits) main.appendChild(buildCard(it));
}

// ═══════════════════════════════════════════════════════
// 导航 / 画布操作
// ═══════════════════════════════════════════════════════
function navigate(entry, push = true) {
  if (push) { S.hist.splice(S.hi + 1); S.hist.push(entry); S.hi = S.hist.length - 1; }
  S.currentEntry = entry;
  updateNavButtons(); renderSidebar(entry);
  if (entry === "home") renderHome(); else renderDetail(entry);
}

// ══════════════════════════════════════════════════════════════════════
// 语言切换时实时刷新：当前停在某个「节点详情」⇒ 重画示意卡（中英随之切换）
// ══════════════════════════════════════════════════════════════════════
let _helpLangBound = false;
function bindHelpLang() {
  if (_helpLangBound) return; _helpLangBound = true;
  onLangChanged(() => {
    const e = S.currentEntry;
    if (e && e !== "home" && e.kind === "node") renderDetail(e);
    else if (e && e !== "home") renderDetail(e);   // 指南专题里的文案也可能需要重渲染
  });
}
let _dropIdx = 0;

/** 画布中心坐标（照官方 litegraphService.getCanvasCenter 的算法）。 */
function canvasCenter() {
  try {
    const va = app.canvas && app.canvas.ds && app.canvas.ds.visible_area;
    if (va) return [va[0] + va[2] / 2, va[1] + va[3] / 2];
  } catch (e) { /* 忽略 */ }
  return [160, 160];
}

/**
 * 把组件加到画布。
 *
 *  2026-10-28 用户报「点加到画布没反应」—— 根因**不是没建出来**，而是：
 *   ① 节点建在固定坐标 [160,160]，**正好被帮助浮窗盖住**（浮窗 860×680 占满左上）⇒ 用户看不见 ⇒ 以为无效；
 *   ② 失败分支用 `alert()`，而 **Electron 禁用了 alert** ⇒ 连报错都看不到。
 * ⇒ 修：① 放到**画布中心**（官方同款算法）；② 加完**自动关掉浮窗**（不然还是挡着）；
 *    ③ 失败改用 toast 提示（家族通用，不依赖原生弹窗）。
 */
/**
 * 屏幕坐标 → 画布（世界）坐标。
 *
 *  2026-10-28 实测校准（别再用 ds.offset，**那是错的**）：
 *   ComfyUI 的画布变换是
 *     screen = (world - visible_area[0]) * scale + canvasRect.left
 *   ⇒ 逆变换
 *     world  = (screen - canvasRect.left) / scale + visible_area[0]
 *    三个坑：
 *     ① `ds.visible_area` 是**对象** `{0:minX,1:minY,2:w,3:h}`，不是数组（但能用 [0] 取）；
 *     ② `ds.scale` 是**数字**，不是数组；
 *     ③ 要减 `canvasRect.top`（画布元素上方有顶栏，实测 top=16）。
 */
function screenToCanvas(sx, sy) {
  try {
    const ds = app.canvas && app.canvas.ds;
    const cr = app.canvas && app.canvas.canvas;
    if (!ds || !cr) return null;
    const r = cr.getBoundingClientRect();
    const sc = typeof ds.scale === "number" ? ds.scale : (ds.scale && ds.scale[0]) || 1;
    const va = ds.visible_area || {};
    const minX = va[0] != null ? va[0] : 0;
    const minY = va[1] != null ? va[1] : 0;
    return [(sx - r.left) / sc + minX, (sy - r.top) / sc + minY];
  } catch (e) { return null; }
}

/**
 * 指南浮窗旁边的**屏幕坐标**锚点（不是画布坐标 —— 画布坐标要等节点真实尺寸出来才知道）。
 * 返回 { sx, sy, side }：sx 是节点**右边缘**该待的位置，side = "left" | "right"。
 *
 *  必须用**屏幕坐标**先判断放不放得下：
 *   浮窗贴屏幕左边缘时，左侧空间为 0 ⇒ 节点会跑到屏幕外 ⇒ 等于没加上。
 *   而且节点的**真实渲染宽度 ≠ node.size[0]**（Vue 下会被内容撑大）⇒
 *   这里只判断「大概放得下」，精确贴边交给 addNode 之后的校正。
 */
function anchorBesideHelpWindow() {
  try {
    const w = S.win;
    if (!w || w.style.display === "none") return null;
    const r = w.getBoundingClientRect();
    if (!r.width) return null;
    const GAP = 26;
    const vw = window.innerWidth || 1400;
    // ① 优先左侧：浮窗左边缘得留出一点空间
    if (r.left >= 180) return { sx: r.left - GAP, sy: r.top + 90, side: "left" };
    // ② 左边不够（浮窗贴屏幕左边）⇒ 改放右侧
    if (r.right + 260 <= vw) return { sx: r.right + GAP, sy: r.top + 90, side: "right" };
    return null;
  } catch (e) { return null; }
}

/**
 * 把节点精确贴到浮窗旁边的空位上（用**真实渲染尺寸**，node.size 不准）。
 *
 * 三级策略（按优先级）：
 *   ① **左侧**：节点右边缘贴浮窗左边缘外侧 26px（用户要的「节点正好在指南界面左侧」）；
 *      要求节点左边缘还在屏幕内（>= 8px）。
 *   ② **右侧**：左侧放不下（节点太宽 / 浮窗贴屏幕左边）⇒ 改贴浮窗右侧。
 *   ③ **左下角**：两边都放不下（浮窗几乎占满屏幕）⇒ 放屏幕左下角，保证**一定看得见**。
 *
 *  出界判断必须用**算出来的**坐标：改完 node.pos 后 Vue 还没重渲染，
 *    这时读 getBoundingClientRect() 拿到的还是旧值 ⇒ 判断永远失效（2026-10-28 踩过）。
 */
function snapNodeBesideWindow(node, side) {
  try {
    const w = S.win;
    if (!w || w.style.display === "none") return;
    const ds = app.canvas && app.canvas.ds;
    const sc = (ds && typeof ds.scale === "number") ? ds.scale : 1;
    const el = document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    const vw = window.innerWidth || 1400;
    const vh = window.innerHeight || 900;
    const GAP = 26;
    const wpx = r.width || (node.size ? node.size[0] : 160);
    const hpx = r.height || (node.size ? node.size[1] : 60);

    let targetLeft = null, targetTop = null;
    if (side === "left" && wr.left - GAP - wpx >= 8) {
      targetLeft = wr.left - GAP - wpx;                    // ① 左侧
    } else if (wr.right + GAP + wpx <= vw - 8) {
      targetLeft = wr.right + GAP;                          // ② 右侧
    } else {
      // ③ 都放不下 ⇒ 找**浮窗覆盖不到**的空白区：先试浮窗下方，再试浮窗上方，最后才左下角
      targetLeft = 8;
      const below = vh - hpx - 16;
      const above = wr.top - hpx - 16;
      if (below >= wr.top + wr.height + 8) targetTop = below;   // 浮窗正下方
      else if (above >= 8) targetTop = above;                     // 浮窗正上方
      else targetTop = Math.max(8, below);                       // 兜底：左下角（允许轻微重叠）
    }
    const want = screenToCanvas(targetLeft, targetTop == null ? r.top : targetTop);
    if (!want) return;
    node.pos[0] = want[0];
    if (targetTop != null) node.pos[1] = want[1];
    app.graph.setDirtyCanvas(true, true);
    app.canvas.setDirty?.(true, true);
  } catch (e) { /* 忽略 */ }
}

function createNodeAt(cls, point) {
  const L = window.LiteGraph;
  if (!L || !app.graph) { xhToast("画布还没准备好，稍后再试。"); return null; }
  let node = null;
  try { node = L.createNode(cls); } catch (e) {
    xhToast("创建失败：" + cls + "（" + (e && e.message || e) + "）"); return null;
  }
  if (!node) { xhToast("找不到组件类型：" + cls); return null; }
  const w = node.size ? node.size[0] : 160;
  const h = node.size ? node.size[1] : 60;
  //  2026-10-28 用户要求：「加到画布时指南界面不要消失，节点正好在指南界面左侧」
  //   ⇒ ① **不关浮窗**；② 位置落在**浮窗左侧**（屏幕坐标 → 画布坐标）。
  //  2026-10-28 用户要求：「加到画布时指南界面不要消失，节点正好在指南界面左侧」
  //   ⇒ ① **不关浮窗**；② 落在浮窗**左侧**（左侧放不下才退到右侧）。
  const anchor = point ? { sx: point.x, sy: point.y, side: null }
                        : (anchorBesideHelpWindow() || { sx: null, sy: null, side: null });
  const off = (_dropIdx++ % 8) * 28;
  let pos;
  if (anchor.sx != null) {
    // 先按「锚点是节点右边缘」估算摆（宽度用 size 估算，之后再精确校正）
    const estW = node.size ? node.size[0] : 160;
    const leftEdge = anchor.side === "right" ? anchor.sx : anchor.sx - estW;
    const c = screenToCanvas(leftEdge, anchor.sy) || canvasCenter();
    pos = [c[0] + off, c[1] + off];
  } else {
    const c = canvasCenter();
    pos = [c[0] - (node.size ? node.size[0] / 2 : 80) + off, c[1] + off];
  }
  node.pos = pos;
  try { app.graph.add(node); } catch (e) {
    xhToast("加到画布失败：" + (e && e.message || e)); return null;
  }
  try { app.graph.setDirtyCanvas(true, true); app.canvas.setDirty?.(true, true); } catch (e) { /* 忽略 */ }
  //  **不要关浮窗**（用户明确要求）—— 节点已放在浮窗左侧，不会被遮住。
  // 精确贴边：等 DOM 渲染出来拿到**真实宽度**再微调（node.size 不准，Vue 下会被撑大）。
  if (!point && anchor.side) {
    requestAnimationFrame(() => requestAnimationFrame(() => snapNodeBesideWindow(node, anchor.side)));
  }
  xhToast("已加到画布（浮窗左侧）：" + (node.title || cls));
  return node;
}


// ═══════════════════════════════════════════════════════
// 开关 / 顶栏
// ═══════════════════════════════════════════════════════
function toggle() { ensureWindow(); if (S.win.style.display === "flex") close(); else open(); }
// ══════════════════════════════════════════════════════════════════════
//  索引加速：localStorage 缓存 + 页面加载后台预热 + 开窗不阻塞
// ══════════════════════════════════════════════════════════════════════
//  2026-10-28 用户报「第一次点灯泡要等几秒，之后就快了」。
// 根因（实测）：`/object_info` 是 **7.6 MB / 3542 个节点**，后端**每次现场重新生成**、
//   响应**没有任何 cache 头** ⇒ 浏览器不会缓存 ⇒ 每次 fetch 实测 **2.9 秒**。
//   而 open() 里 `await buildIndex()` **卡住了窗口显示** ⇒ 用户干等。
//
// 三级加速：
//   ① 索引（只含 XiaoHei 的 100 个节点，很小）存 localStorage ⇒ 之后刷新页面也是毫秒级；
//   ② 页面加载时就在后台预热（用户点之前通常已就绪）；
//   ③ open() **不再 await** ⇒ 窗口立刻出现，索引没就绪就显示「加载中」再自动补上。
//
//  缓存只在「XiaoHei 节点集合变了」时失效：存的是节点类型清单，比对不一致就重建。
//  2026-11-10：v1 缓存里没有「设置项说明」专题（专题 help 也换成了实时正文）⇒ 换 key 让旧缓存自然失效。
//  2026-11-12：追加节点「端口预览」数据（preview 字段）⇒ 升 v3 让旧缓存自然失效重建。
//  2026-11-14：索引收录范围新增「小黑家族」分类 + 角色表节点中文说明
//    ⇒ 升 v5 让浏览器里 v4 旧缓存自然失效重建（否则改了代码也还是搜不到）。
//  2026-11-25：收录改按家族白名单精确判定（剔除第三方 Krea2 / XHDirectorStudio），
//    无条件过滤 _internal，并归一旧分类别名（Image/Video/分镜/高级/工具 去重）
//    ⇒ 升 v9，否则老缓存里的重复分类清不掉。
//  2026-11-25（同日）：老「标签」节点（XHLabel）已被浮字标签覆盖删除
//    ⇒ 升 v10。虽然 types 签名比对会发现少一个节点而重建，但重建前会先用旧缓存
//    填一次界面，会闪出一个点不开的「标签」条目；换 key 直接不读旧缓存。
const IDX_CACHE_KEY = "XH.Help.index.v10";

function readIdxCache() {
  try {
    const raw = localStorage.getItem(IDX_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.items) || !Array.isArray(o.types)) return null;
    return o;
  } catch (e) { return null; }
}
function writeIdxCache(items) {
  try {
    localStorage.setItem(IDX_CACHE_KEY, JSON.stringify({
      types: items.map((x) => x.cls),
      //  2026-11-19：分类也进签名 —— 只比 class_type 列表的话，后端改了 CATEGORY
      //  缓存不会失效，侧栏会先闪一下旧分组再被替换。
      cats: items.map((x) => x.cat || "").join("|"),
      items,
      t: Date.now(),
    }));
  } catch (e) { /* 忽略 */ }
}

/** 后台预热：启动就跑，用户点的时候通常已经好了。 */
let _warmPromise = null;
function warmIndex() {
  if (_warmPromise) return _warmPromise;
  const cached = readIdxCache();
  if (cached && cached.items.length) {
    // 先用缓存把界面填上（立刻可用）
    S.index = cached.items;
    S.groups = groupByCategory(S.index);
    _warmPromise = Promise.resolve(cached);
  }
  _warmPromise = (async () => {
    try {
      const items = await buildIndex();
      const cached2 = readIdxCache();
      // 节点集合没变就别写缓存（省 IO）；分类变了也要重建（否则侧栏闪旧分组）
      const catsNow = items.map((x) => x.cat || "").join("|");
      const same = cached2 && cached2.types.length === items.length
        && items.every((x, i) => cached2.types[i] === x.cls)
        && cached2.cats === catsNow;   // 旧缓存没有 cats 字段 ⇒ 不相等 ⇒ 顺手重建一次
      if (!same) writeIdxCache(items);
      if (S.win && S.win.style.display === "flex") {
        S.index = items;
        S.groups = groupByCategory(S.index);
        if (S.hi < 0) navigate("home");
      } else {
        S.index = items;
        S.groups = groupByCategory(S.index);
      }
      return items;
    } catch (e) { return S.index; }
  })();
  return _warmPromise;
}

async function open() {
  ensureWindow(); injectCSS();
  //  **不再 await** —— 窗口立刻出来，索引没就绪就显示加载提示
  if (!S.index.length) {
    S.win.style.display = "flex"; syncTB();
    const main = S.win.querySelector(".xhhelp-main");
    if (main) main.innerHTML = '<div style="padding:26px;text-align:center;opacity:.7;">正在载入组件清单…</div>';
    warmIndex().then(() => {
      if (S.hi < 0) navigate("home");
      S.win.querySelector(".xhhelp-search input")?.focus();
    });
    return;
  }
  S.win.style.display = "flex"; syncTB();
  if (S.hi < 0) navigate("home");
  S.win.querySelector(".xhhelp-search input")?.focus();
}
function close() { if (S.win) S.win.style.display = "none"; syncTB(); }
function syncTB() {
  const btn = document.querySelector("[data-xh-tb-help]");
  setToolbarButtonOpen(btn, !!S.win && S.win.style.display === "flex");
}

function mountToolbarButton() {
  injectCSS();
  if (window.__xhHelpInjected) return;
  const settingsGroupEl = app.menu && app.menu.settingsGroup && app.menu.settingsGroup.element;
  if (!settingsGroupEl) {
    if (mountToolbarButton._tries == null) mountToolbarButton._tries = 0;
    if (++mountToolbarButton._tries > 20) { console.warn("[XiaoHei] Help 顶栏挂载失败"); return; }
    setTimeout(mountToolbarButton, 250); return;
  }
  window.__xhHelpInjected = true;
  //  页面加载就后台预热索引 ⇒ 用户第一次点灯泡时**已经是热的**
  setTimeout(() => { try { warmIndex(); } catch (e) { /* 忽略 */ } }, 1200);
  const group = el("div", "comfyui-button-group"); group.dataset.xhBtn = "help";
  //  2026-10-28 13:20：走**统一真源** makeToolbarButton（.xh-tb），
  //    三颗按钮（XiaoHei / 帮助 / 工作流）共用同一份样式 ⇒ 不可能再一个紫一个黄。
  //  2026-11-11：顶栏这颗改走自家图标库的「帮助」（24 网格 / 2px），
  //    不再用官方 lucide 圆圈问号（2.4px、写死黑）。帮助窗口标题仍用 helpIconHTML。
  const btn = makeToolbarButton(xhIconHTML("帮助", { color: "current" }),
                                "XiaoHei 帮助（所有组件说明 + 使用指南）", toggle);
  try { btn.setAttribute("aria-label", "XiaoHei 帮助"); } catch (e) {}
  btn.dataset.xhTbHelp = "1";
  group.appendChild(btn); settingsGroupEl.parentElement?.insertBefore(group, settingsGroupEl);
}

app.registerExtension({ name: NS, setup() { mountToolbarButton(); } });

// 对外：别的模块可以跳到这个「灯泡」帮助的指定专题页
// （例：节点配色面板上的灯泡按钮 → XHHelp.openTopic("colors")）
window.XHHelp = {
  open, close, toggle,
  openTopic: async (key) => {
    //  不等索引构建（/object_info 有几百个节点，fetch 要一两秒）⇒ 直接用 TOPICS 构造条目，
    //    立刻打开对应专题页；索引照常在后台建着。
    try {
      ensureWindow();
      const t = TOPICS.find((x) => x.key === key);
      if (t) {
        const tHelp = resolveHelp(t);
        const e = { cls: "", title: t.title, cat: t.cat, groupLabel: "XiaoHei/指南", icon: t.icon,
                    tagline: t.tagline, help: tHelp, kind: "topic", key: "topic:" + t.key,
                    kw: buildKw({ cls: "", title: t.title, catName: t.cat,
                                  groupLabel: "XiaoHei/指南", tagline: t.tagline, help: tHelp }) };
        if (!S.index.some((x) => x.key === e.key)) {
          S.index.push(e);
          // 侧栏也要看得见这一项（否则点了专题页却没有高亮，像没导航进去）
          const g = S.groups.find((x) => x.name === "XiaoHei 指南");
          if (g && !g.items.some((x) => x.key === e.key)) g.items.push(e);
          else if (!g) S.groups = groupByCategory(S.index);
        }
        if (!S.groups.length) S.groups = groupByCategory(S.index);
        S.win.style.display = "flex"; syncTB();
        navigate(e);
        // 后台把完整索引建起来（不阻塞）；走 warmIndex 才会写回 S.index / S.groups，
        // 否则冷启动直接点专题时侧栏永远只剩这一项（旧版这里 buildIndex() 结果被丢掉了）。
        if (!S.index.length || S.index.length <= TOPICS.length) { warmIndex().catch(() => {}); }
        return true;
      }
      await open();
      const e2 = S.index.find((x) => x.key === "topic:" + key);
      if (e2) navigate(e2);
      return !!e2;
    } catch (err) {
      console.warn("[XiaoHei.Help] openTopic fail:", err);
      return false;
    }
  },
  //  2026-11-10：设置面板的小圆「?」→ 打开「设置项说明」专题，并滚到/高亮那一项。
  //    不给 defId（右上角「? 全部说明」）⇒ 只打开专题首页。
  openSettings: async (defId) => {
    try {
      const ok = await window.XHHelp.openTopic("settings");
      if (!ok) return false;
      if (!defId) return true;
      await new Promise((r) => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(r));
        else setTimeout(r, 30);
      });
      const target = document.getElementById("xhhelp-set-" + defId);
      if (!target) return true;              // 该项暂未加载：至少专题页已经打开
      try { target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
      target.style.outline = "2px solid var(--xh-primary)";
      target.style.outlineOffset = "2px";
      setTimeout(() => {
        try { target.style.outline = ""; target.style.outlineOffset = ""; } catch (e) {}
      }, 2400);
      return true;
    } catch (err) {
      console.warn("[XiaoHei.Help] openSettings fail:", err);
      return false;
    }
  },
  // 节点「?」按钮：直接打开帮助浏览器并定位到该节点的说明页（索引 key = node:<type>）
  openNode: async (type) => {
    try {
      ensureWindow();
      S.win.style.display = "flex"; syncTB();
      if (!S.index.length) {
        const items = await buildIndex();
        if (items && items.length) { S.index = items; S.groups = groupByCategory(items); }
      }
      let e = S.index.find((x) => x.key === "node:" + type);
      //  2026-11-08：索引可能是「复刻节点被收录之前」建的旧缓存（帮助浮窗先开过一次就不会自动重建）
      //    ⇒ 找不到时强制重建一次再找，保证新纳入的节点也能一次点中。
      if (!e) {
        const items = await buildIndex();
        if (items && items.length) {
          S.index = items; S.groups = groupByCategory(items);
          e = S.index.find((x) => x.key === "node:" + type);
        }
      }
      if (e) { navigate(e); return true; }
      if (S.hi < 0) navigate("home");   // 该节点没有独立说明 ⇒ 停在首页（索引已就绪）
      return false;
    } catch (err) {
      console.warn("[XiaoHei.Help] openNode fail:", err);
      return false;
    }
  },
};
window.__XH_HELP_DEFS__ = HELP_DEFS;
// 调试出口（真机排查用）：看专题表与索引的真实内容
window.__XH_TOPICS__ = TOPICS;
window.__XH_INDEX__ = () => S.index;
