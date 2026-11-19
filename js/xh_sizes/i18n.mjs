// 尺寸清单（XiaoHei）— 家族规范化：显示文案中英对照表。
// 1:1 复刻自 Pixaroma Sizes 的硬编码英文（原版不接家族语言桥，切 EN 不会变）。
// 契约串（orientation 值 portrait/landscape、state key、snap 数值、SIZE_TAGS）一律不 Translation。
// 只换显示层：textContent / title / help 文案。

import { currentLang } from "../xh_ui_kit.js";

export const I18N = {
  zh: {
    // 节点面（index.js）
    expandAll: "展开 — 显示所有尺寸",
    collapseOne: "收起 — 只显示选中的尺寸",
    portrait: "竖屏",
    landscape: "横屏",
    tallerThanWide: "高大于宽",
    widerThanTall: "宽大于高",
    gearTip: "尺寸设置 — 添加、删除、排序、对齐",
    recommended: "推荐尺寸",
    slotWidth: "宽度",
    slotHeight: "高度",
    hintOpenSettings: "打开设置添加更多尺寸",
    menuSettings: "尺寸设置",
    menuFlip: "翻转朝向",
    menuExpand: "展开",
    menuCollapse: "收起",
    // 帮助面板（registerNodeHelp）
    helpTitle: "尺寸清单",
    helpTagline: "属于你自己的分辨率列表，一键切换竖屏 / 横屏朝向。",
    helpWhatHeading: "它能做什么",
    helpWhatBody: "把你常用的宽 x 高尺寸放进一个列表，选一个，它就输出宽度和高度。" +
      "把它们接到「空 Latent 图像」（或任何需要宽高的地方）即可。",
    helpOriHeading: "竖屏与横屏",
    helpOriBody: "两个按钮把选中的尺寸在竖 / 横之间翻转。加一次像 1024 x 1536 这样的尺寸，" +
      "两种朝向都能复用 —— 不必各存一条。正方形两种朝向看起来一样。",
    helpSettingsHeading: "设置",
    helpSettingsBody: "点齿轮（或右键节点）打开设置。在那里可以添加新尺寸、" +
      "拖动删除或排序、一键载入常用尺寸、选高亮色，以及把宽高对齐到 8 / 16 / 32 / 64 的倍数，" +
      "让数字对 VAE 更友好。对齐默认关闭。",
    helpStarHeading: "标记推荐尺寸",
    helpStarBody: "在设置里点某个尺寸旁边的星，节点上也会显示星标。当一个列表里有工作流能用的所有尺寸、" +
      "但只有部分适合你正在跑的模型时很有用：给它们打星，一眼就能看出该选哪个。\n\n" +
      "星标只是一个提示 —— 它不改变节点输出的任何东西，你仍然可以选列表里的任意尺寸。" +
      "星标跟着尺寸走，所以排序、竖横翻转、删掉再加回来都保留。",
    helpButtonsHeading: "节点上的按钮",
    helpDefs: [
      ["折叠箭头", "把列表收起成只显示选中的尺寸，或再展开。"],
      ["竖屏 / 横屏", "把选中尺寸显示为竖或横，交换哪个数字当宽度。"],
      ["齿轮", "打开设置面板，添加、删除、排序和给尺寸换色。"],
      ["列表里的尺寸", "点任意一个，让它成为本节点输出的尺寸。"],
      ["设置里的添加", "输入宽和高，然后加进你的列表。"],
      ["设置里的拖动手柄", "上下拖动给尺寸排序。"],
      ["设置里的星标", "把尺寸标记为推荐。节点上会显示星标，再点一次取消。"],
      ["设置里的对齐", "把所有尺寸凑成 8 / 16 / 32 / 64 的倍数。"],
      ["设置里的一键常用", "一键加入从 512 到 2048 的一组常用正方形尺寸。"],
    ],
    helpFooter: (n) => `新节点默认只有一个尺寸（1024 x 1024）。每个节点最多加 ${n} 个。`,

    // 设置面板（settings.mjs）
    panelTitle: "尺寸设置",
    width: "宽",
    height: "高",
    add: "添加",
    addDup: "已在列表中",
    addFull: (n) => `列表已满（最多 ${n} 个）`,
    starOnTip: "已推荐 — 点击取消",
    starOffTip: "标记为推荐（节点上显示星标）",
    removeSize: "删除这个尺寸",
    keepOne: "至少保留一个尺寸",
    snapLabel: "把宽高对齐到倍数",
    snapOff: "关",
    accentLabel: "高亮颜色",
    accentPick: "选高亮颜色",
    addCommon: "＋ 常用尺寸（512 到 2048）",
    asDefault: "设为默认颜色",
    asDefaultTip: "让所有新建的尺寸清单节点都用这个颜色",
    savedAsDefault: "已存为默认",
    everyNode: "所有 XiaoHei 节点",
    everyNodeTip: "所有 XiaoHei 节点都跟随这个颜色，除非单独设过自己的",
    saved: "已保存",
    done: "完成",

    // tag_menu.mjs（原版遗留死模块）
    noTag: "无标签",
  },
  en: {
    expandAll: "Expand — show all sizes",
    collapseOne: "Collapse — show only the selected size",
    portrait: "Portrait",
    landscape: "Landscape",
    tallerThanWide: "Taller than wide",
    widerThanTall: "Wider than tall",
    gearTip: "Sizes settings — add, remove, reorder, snap",
    recommended: "Recommended",
    slotWidth: "width",
    slotHeight: "height",
    hintOpenSettings: "open settings to add more sizes",
    menuSettings: "Sizes settings",
    menuFlip: "Flip orientation",
    menuExpand: "Expand",
    menuCollapse: "Collapse",
    helpTitle: "Sizes",
    helpTagline: "Your own list of favourite resolutions, with a one-click orientation flip.",
    helpWhatHeading: "What it does",
    helpWhatBody: "Keep the exact width x height sizes you use in one list, pick one, and it outputs width and height. " +
      "Wire those into an Empty Latent Image (or anywhere a width and height are needed).",
    helpOriHeading: "Portrait and Landscape",
    helpOriBody: "The two buttons flip the chosen size between tall and wide. Add a size like 1024 x 1536 once and " +
      "reuse it in either orientation - you do not need a separate entry for each. Square sizes look the same both ways.",
    helpSettingsHeading: "Settings",
    helpSettingsBody: "Click the gear (or right-click the node) to open the settings. There you can add a new size, remove or " +
      "reorder sizes by dragging, load a set of common sizes in one click, pick the highlight colour, and snap " +
      "width and height to a multiple of 8, 16, 32, or 64 so the numbers stay friendly for the VAE. Snapping is off by default.",
    helpStarHeading: "Marking the recommended sizes",
    helpStarBody: "Click the star beside a size in settings and it gets a star on the node too. Handy when a list holds every " +
      "size a workflow accepts but only some of them suit the model you are running: star those, and you can see " +
      "at a glance which to pick.\n\n" +
      "A star is a reminder only - it changes nothing about what the node sends out, and you can still choose any " +
      "size in the list. Stars follow the size itself, so reordering the list, flipping between portrait and " +
      "landscape, or removing a size and adding it back all keep them.",
    helpButtonsHeading: "The buttons on the node",
    helpDefs: [
      ["The fold arrow", "Collapses the list down to just the chosen size, or opens it again."],
      ["Portrait and Landscape", "Shows the chosen size tall or wide, swapping which number is the width."],
      ["The gear", "Opens the settings panel, where you add, remove, reorder and recolour your sizes."],
      ["A size in the list", "Click any one to make it the size this node sends out."],
      ["Add, in settings", "Type a width and height, then add it to your list."],
      ["The drag handles, in settings", "Drag a size up or down to reorder the list."],
      ["The star, in settings", "Marks a size as recommended. It then shows a star on the node. Click again to unmark."],
      ["Snap, in settings", "Rounds every size to a multiple of 8, 16, 32 or 64."],
      ["Add common sizes, in settings", "Adds a set of popular square sizes from 512 up to 2048 in one click."],
    ],
    helpFooter: (n) => `A fresh node starts with one size (1024 x 1024). Add up to ${n} per node.`,

    panelTitle: "Sizes settings",
    width: "Width",
    height: "Height",
    add: "add",
    addDup: "Already in the list",
    addFull: (n) => `List is full (max ${n})`,
    starOnTip: "Recommended - click to unmark",
    starOffTip: "Mark as recommended (shows a star on the node)",
    removeSize: "Remove this size",
    keepOne: "Keep at least one size",
    snapLabel: "Snap width and height to multiple of",
    snapOff: "Off",
    accentLabel: "Highlight colour",
    accentPick: "Pick the highlight colour",
    addCommon: "＋ Add common sizes (512 to 2048)",
    asDefault: "Colour as default",
    asDefaultTip: "Use this node's colour for every new Sizes node",
    savedAsDefault: "Saved as default",
    everyNode: "Every XiaoHei node",
    everyNodeTip: "Every XiaoHei node follows this colour, unless it has been given one of its own",
    saved: "Saved",
    done: "Done",

    noTag: "No tag",
  },
};

export function t(key, ...args) {
  const table = I18N[currentLang()] || I18N.zh;
  const v = table[key] ?? I18N.zh[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}
