// 小黑·标注 — 家族规范化：显示文案中英对照表。
// 1:1 复刻自 Pixaroma Sketch 的硬编码英文（原版不接家族语言桥，切 EN 不会变）。
// 契约串一律不翻译：
//   - 工具快捷键 B/C/P/A/T、工具 id（box/ellipse/pen/arrow/text）
//   - 颜色 key（red/blue/...）与 core.mjs 的 buildPrompt / REMOVE_LINE 英文
//     （那是喂给编辑模型的指令，且与 Python 端 _sketch_helpers 镜像，改了模型就不认）
// 只换显示层：title / placeholder / hint / 帮助面板。

import { currentLang } from "../xh_ui_kit.js";

export const I18N = {
  zh: {
    // 工具（title 提示；括号里是快捷键，保留）
    toolBox: "方框：在要修改的地方拖出一个矩形（B）",
    toolEllipse: "圆形：在要修改的地方拖出一个椭圆（C）",
    toolPen: "自由画笔：圈出一个东西，或画出要添加的形状轮廓（P）",
    toolArrow: "箭头：从起点拖向你要指向的目标（A）",
    toolText: "文字：在图片上点一下，直接输入一个词（T）",
    // 操作按钮
    undo: "撤销上一步（大图里 Ctrl+Z）",
    redo: "重做（大图里 Ctrl+Y）",
    clear: "清除所有标记",
    clearConfirmTitle: "清除所有标记？",
    clearConfirmMsg: "图片上的全部标记和备注都会被删掉，且无法撤销。确定要继续吗？",
    clearConfirmOk: "确认清除",
    clearConfirmCancel: "取消",
    expand: "打开大图，仔细标注",
    settings: "设置",
    // 颜色（显示名；key 不翻译）
    colorRed: "红色", colorBlue: "蓝色", colorGreen: "绿色", colorPurple: "紫色",
    colorYellow: "黄色", colorWhite: "白色", colorBlack: "黑色",
    swatchTip: (c) => `${c}：下一个标记的颜色`,
    // 线宽
    line: "线宽",
    widthS: "细线", widthM: "中等线", widthL: "粗线", widthXL: "超粗：给草图填充上色用",
    // 标记列表
    listHint: "在图片上拖拽标出要改的地方，然后在旁边写下要怎么改。",
    noteOptional: "可选备注", noteWhat: "这里要改成什么",
    noteTip: "编辑模型在这里要做什么，会变成提示词里的一句话。",
    typeWord: "输入一个词，然后按回车",
    delTip: "删除这个标记",
    markBox: "方框", markCircle: "圆形", markArrow: "箭头", markText: "文字",
    markOutline: "轮廓", markSketch: "草图",
    // 提示词预览
    prompt: "提示词",
    promptTip: "提示词输出的内容，接到文本编码器。",
    removeMarks: "去除标记",
    removeMarksTip: "加一句让模型去掉画上去的标记。不加的话，编辑模型往往会保留这些标记。",
    promptEmpty: "在标记旁写个备注，提示词就会出现在这里。",
    selectCopy: "选中可复制",
    // 画布空状态 / 警告
    warnShape: "图片尺寸变了，检查一下标记还对不对得上。",
    emptyRun: "先运行一次，图片就会显示在这里。",
    emptyWire: "把图片接到图像输入。",
    emptyFail: "图片加载失败，运行一次试试。",
    emptyLoading: "正在加载图片…",
    // 大图
    done: "完成",
    doneTip: "返回工作流。标记已经存在节点上了。",
    bigHint: "在图上拖拽，写下改动，按回车。B C P A T 切换工具。Ctrl+Z 撤销，Ctrl+Y 重做，Esc 关闭。",
    bigColors: "颜色与线宽",
    bigMarks: "标记与改动",
    // 设置面板（registerNodeAccent）
    accentTitle: "标注",
    accentLabel: "每个新标记自动换下一个颜色",
    accentHint: "红、蓝、绿、紫依次循环，方便提示词区分各个标记。关闭后，所有标记都用你选的颜色。",
    // 帮助面板
    helpTitle: "标注",
    helpTagline: "在图片上标出要改的地方（方框、圆形、圈选、箭头或文字），在旁边写下改动。专为 Flux 2 Klein、Qwen Image Edit、Kontext 这类编辑模型设计。",
    helpHowHeading: "怎么使用",
    helpHow1: "把图片接到 `image`。来自「加载图像」的图片会立刻显示在节点上（经过开关也行）。运行后，节点显示的就是真正送进去的那张图。",
    helpHow2: "选一个工具，在图上拖拽。默认是方框，从红色开始。",
    helpHow3: "每个标记都有编号，光标会自动跳到它的备注框：写下要怎么改，比如`把帽子变成红色棒球帽`，然后按回车。",
    helpHow4: "把 `image` 接到编辑模型作为要编辑的图，`prompt` 接到文本编码器。运行。",
    helpToolsHeading: "工具",
    helpTools: [
      ["方框", "在要修改的地方拖出一个矩形。"],
      ["圆形", "在要修改的地方拖出一个椭圆。"],
      ["自由画笔", "圈出一个东西，或画出要添加的东西的大致轮廓。闭合的圈算一个区域，未闭合的笔迹算一张草图。"],
      ["箭头", "从任意位置拖向你要指向的目标。"],
      ["文字", "在图片上点一下，直接把一个词写到图上。"],
    ],
    helpPromptHeading: "它写出的提示词",
    helpPromptBody: "每个写了备注的标记生成一句话：`在红色方框里：把帽子变成红色棒球帽。` 每个新标记自动换下一个颜色（红、蓝、绿、紫），所以每个标记都有自己的名字。两个颜色形状都相同的标记，靠位置区分：左边的红框和右边的红框。\n\n提示词旁的开关会加一句让模型去掉标记的指令，因为编辑模型往往会保留这些标记。如果你想自己写整段提示词，就把所有备注留空。",
    helpOutHeading: "输出什么",
    helpOut: [
      ["image", "画上你的标记的图，原尺寸。没标记的每个像素都和输入完全一致。"],
      ["prompt", "你的备注合成的一句指令。没有标记写备注时为空。"],
      ["mask", "每个方框、圆形、闭合圈内部，以及开放草沿线为白色。给不读画线标记的模型做局部重绘工作流用。"],
    ],
    helpButtonsHeading: "节点上的按钮",
    helpButtons: [
      ["撤销与重做", "在标记历史里前后切换。画布上的 Ctrl+Z 也能撤销一个标记，和撤销任何改动一样。"],
      ["清除", "删掉所有标记。撤销能找回来。"],
      ["放大", "打开大图仔细标注。它编辑的是同一批标记，没有保存步骤：点完成、按 Esc 或点外面就能关闭。"],
      ["齿轮", "设置：按钮颜色，以及是否每个新标记自动换下一个颜色。"],
      ["行尾的 ×", "删掉那一个标记。鼠标停在行上能看到它是哪个标记。"],
    ],
    helpTipsHeading: "小技巧",
    helpTips: [
      "备注写得短而具体：说它要变成什么，而不是它现在是什么。",
      "只标你真正要改的部分。在一个小荷包上松松画一圈，可能会把整个背包一起带走。",
      "一个词可以代表一个东西：在要放的位置写上`皇冠`，再备注`把这个词换成一顶小金冠`。",
      "大图或细节图上，选粗一点的线（L 或 XL），模型才不会漏看标记。",
      "要添加一个东西？用自由画笔 XL 画出它的大致轮廓，写下它是什么，比如`把这个变成一顶真的帽子`。",
      "如果模型不理画线标记，就把 `mask` 接到局部重绘工作流（Inpaint Crop）里。",
      "「加载图像」和标注之间如果有节点裁剪或旋转了图片？先运行一次再标注，这样标的是真正送达的图。图片在你的标记下变了形状时，节点会提醒你。",
    ],
  },

  en: {
    toolBox: "Box: drag a rectangle around what to change (B)",
    toolEllipse: "Circle: drag an oval around what to change (C)",
    toolPen: "Freehand: draw a loop around something, or sketch a shape to add (P)",
    toolArrow: "Arrow: drag from where you start to what you point at (A)",
    toolText: "Text: click on the picture and type a word (T)",
    undo: "Undo the last change (Ctrl+Z in the big view)",
    redo: "Redo (Ctrl+Y in the big view)",
    clear: "Remove every mark",
    clearConfirmTitle: "Remove every mark?",
    clearConfirmMsg: "All marks and notes on the picture will be deleted. This cannot be undone. Continue?",
    clearConfirmOk: "Remove all",
    clearConfirmCancel: "Cancel",
    expand: "Open a big view for careful marking",
    settings: "Settings",
    colorRed: "Red", colorBlue: "Blue", colorGreen: "Green", colorPurple: "Purple",
    colorYellow: "Yellow", colorWhite: "White", colorBlack: "Black",
    swatchTip: (c) => `${c}: the colour for the next mark`,
    line: "Line",
    widthS: "Thin line", widthM: "Medium line", widthL: "Thick line", widthXL: "Very thick: for colouring in a rough sketch",
    listHint: "Drag on the picture to mark what to change, then write the change here.",
    noteOptional: "optional note", noteWhat: "what to change here",
    noteTip: "What the edit model should do here. It becomes one sentence of the prompt.",
    typeWord: "type a word, then Enter",
    delTip: "Delete this mark",
    markBox: "box", markCircle: "circle", markArrow: "arrow", markText: "text",
    markOutline: "outline", markSketch: "sketch",
    prompt: "Prompt",
    promptTip: "What the prompt output sends. Wire it into the text encode.",
    removeMarks: "remove the marks",
    removeMarksTip: "Adds a last sentence asking the model to remove the drawn marks. Edit models often keep them otherwise.",
    promptEmpty: "Write a note beside a mark and the prompt appears here.",
    selectCopy: "Select to copy",
    warnShape: "The picture changed shape. Check the marks still fit.",
    emptyRun: "Run once to show the picture here.",
    emptyWire: "Wire a picture into the image input.",
    emptyFail: "Could not load the picture. Run once to show it here.",
    emptyLoading: "Loading the picture…",
    done: "Done",
    doneTip: "Back to the workflow. Your marks are already saved on the node.",
    bigHint: "Drag on the picture, type the change, press Enter.  B C P A T pick a tool.  Ctrl+Z undo, Ctrl+Y redo, Esc closes.",
    bigColors: "Color and line",
    bigMarks: "Marks and what to change",
    accentTitle: "Sketch",
    accentLabel: "Each new mark takes the next color",
    accentHint: "Red, then blue, green and purple, so the prompt can tell the marks apart. Off: every mark uses the color you pick.",
    helpTitle: "Sketch",
    helpTagline: "Mark what to change on a picture (a box, a circle, a loop, an arrow or a word) and write the change beside it. Made for edit models like Flux 2 Klein, Qwen Image Edit and Kontext.",
    helpHowHeading: "How to use it",
    helpHow1: "Wire a picture into `image`. From a Load Image it shows on the node right away, also through a Switch. After a run the node shows exactly the picture that came in.",
    helpHow2: "Pick a tool and drag on the picture. The Box is the default and starts in red.",
    helpHow3: "Every mark gets a number, and the cursor jumps to its note: type what to change there, like `make the hat a red baseball cap`, and press Enter.",
    helpHow4: "Wire `image` into your edit model as the picture it edits, and `prompt` into the text encode. Run.",
    helpToolsHeading: "The tools",
    helpTools: [
      ["Box", "Drag a rectangle around what to change."],
      ["Circle", "Drag an oval around it."],
      ["Freehand", "Draw a loop around something, or sketch the rough shape of something to add. A loop you close counts as an area; an open stroke counts as a sketch."],
      ["Arrow", "Drag from anywhere to the thing you point at."],
      ["Text", "Click on the picture and type a word right onto it."],
    ],
    helpPromptHeading: "The prompt it writes",
    helpPromptBody: "One sentence for each mark that has a note: `Inside the red box: make the hat a red baseball cap.` Each new mark takes the next color (red, blue, green, purple), so every mark has its own name. Two marks of the same color and shape are told apart by where they are: the left red box and the right red box.\n\nThe switch beside the prompt adds a last sentence asking the model to remove the marks, because edit models often keep them otherwise. Leave every note empty if you would rather write the whole prompt yourself.",
    helpOutHeading: "What comes out",
    helpOut: [
      ["image", "The picture with your marks drawn in, at its full size. Every pixel you did not mark is exactly the input."],
      ["prompt", "Your notes as one instruction. Empty when no mark has a note."],
      ["mask", "White inside every box, circle and closed loop, and along an open sketch. For inpaint workflows, when a model does not read drawn marks."],
    ],
    helpButtonsHeading: "The buttons on the node",
    helpButtons: [
      ["Undo and Redo", "Step back and forward through your marks. Ctrl+Z on the canvas also undoes a mark, like any change."],
      ["Clear", "Removes every mark. Undo brings them back."],
      ["Expand", "Opens a big view of the picture for careful marking. It edits the same marks, so there is nothing to save: Done, Esc or a click outside closes it."],
      ["Gear", "Settings: the button color, and whether each new mark takes the next color."],
      ["× on a row", "Deletes that one mark. Hover a row to see which mark it is."],
    ],
    helpTipsHeading: "Tips",
    helpTips: [
      "Keep notes short and concrete: say what it should become, not what it is now.",
      "Mark only the part you mean. A loose loop around a small pouch can take the whole backpack with it.",
      "A word can stand for a thing: write `crown` where it should go and note `replace the word with a small golden crown`.",
      "On a big photo or a small detail, pick a thicker line (L or XL) so the model cannot miss the mark.",
      "Sketching something to add? Draw its rough outline with Freehand in XL and write what it is, like `turn this into a real hat`.",
      "If a model ignores drawn marks, wire `mask` into an inpaint workflow (Inpaint Crop) instead.",
      "Something between the Load Image and Sketch crops or turns the picture? Run once before marking, so you mark the picture that really arrives. The node warns you when the picture changed shape under your marks.",
    ],
  },
};

export function t(key, ...args) {
  const table = I18N[currentLang()] || I18N.zh;
  const v = table[key] ?? I18N.zh[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

const COLOR_KEY = { red: "colorRed", blue: "colorBlue", green: "colorGreen", purple: "colorPurple", yellow: "colorYellow", white: "colorWhite", black: "colorBlack" };
export const colorName = (key) => t(COLOR_KEY[key] || "colorRed");

/** 标记在列表里的显示名（纯显示，不进 prompt，与 Python 无镜像关系）。 */
export function markLabel(m) {
  if (m.type === "pen") return `${colorName(m.color)} ${t(m.closed ? "markOutline" : "markSketch")}`;
  const key = { box: "markBox", ellipse: "markCircle", arrow: "markArrow", text: "markText" }[m.type];
  return `${colorName(m.color)} ${key ? t(key) : m.type}`;
}
