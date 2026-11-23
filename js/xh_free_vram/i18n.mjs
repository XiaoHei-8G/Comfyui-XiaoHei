// 释放显存（XiaoHei）— 家族规范化：显示文案中英对照表。
// 1:1 复刻自 ComfyUI-Pixaroma / js/free_vram（MIT）的硬编码英文（原版不接家族语言桥）。
// 契约串（class_type / 隐藏输入 XHFreeVramState / state 属性 xhFreeVramState /
// 事件键 xh_free_vram / mode 值 all·models·cache / 状态属性名）一律不翻译。
// 只换显示层：节点脸按钮、读数、齿轮设置面板、帮助面板。

import { currentLang } from "../xh_ui_kit.js";

export const I18N = {
  zh: {
    // ── 节点脸：三档模式 ──
    modeAll: "全部",
    modeModels: "仅模型",
    modeCache: "仅缓存",
    tipAll: "卸掉模型并把空闲显存交还显卡。下一阶段需要空间时用它。",
    tipModels: "卸掉模型但让 ComfyUI 保留预留显存。稍快，只给 ComfyUI 自己腾空间时够用。",
    tipCache: "保留模型、只把空闲显存交还显卡。ComfyUI 之外的程序要用卡时用它。",
    gearTip: "释放显存设置",
    barTip: "本节点跑完后整卡的样子：灰=仍占用，橙=刚释放，深=本来就空闲。",
    // ── 节点脸：读数 ──
    freeOf: (free, total) => `${free} 空闲 / 共 ${total}`,
    unwiredHint: "接入要在其后清理的东西",
    unwiredTip: "从想清理的那个节点拉线到本节点输入。输出不用接：只有后面某一步必须先用上腾出的空间时才接。",
    waiting: "等待运行",
    waitingBelow: (limit) => `等待 · 仅低于 ${limit} 时清理`,
    errNoMem: "无法读取显存",
    errFree: "无法释放显存",
    skipped: "已跳过",
    nothingWired: "没有接线",
    cachedEarlier: (amt) => `${amt} 为之前释放`,
    cachedTip: "本节点上方没有变化，ComfyUI 跳过了它，这次并没有释放显存。到设置里打开「每次运行都清理」让它始终执行。",
    nothingToFree: "没有可释放的",
    nothingToFreeTip: "运行了，但没有加载任何可以释放的东西。",
    freed: "已释放",
    returned: "已归还",
    tipReadout: (comfyBefore, comfyAfter, driverBefore, driverAfter) =>
      `ComfyUI 可见：清理前空闲 ${comfyBefore}，之后 ${comfyAfter}\n显卡报告：清理前空闲 ${driverBefore}，之后 ${driverAfter}`,
    // 色条悬浮说明
    barInUse: (v) => `占用中：${v}`,
    barJust: (v) => `刚释放：${v}`,
    barAlready: (v) => `原本空闲：${v}`,
    barCard: (v, dev) => `显卡：${v}${dev ? ` (${dev})` : ""}`,
    // ── 齿轮设置面板 ──
    panelTitle: "释放显存设置",
    secWhat: "释放什么",
    secWhatSub: "三档模式在节点上。这里是配合它们的额外步骤。",
    gc: "回收残留",
    gcSub: "再次测量前，先清掉 Python 还占着的东西。耗时零点几秒，通常能多收回一点。除非你在测时间，否则留着开启。",
    secWhen: "何时执行",
    secWhenSub: "上方没变化时节点通常会被跳过。这正是本节点存在的场景，所以默认忽略这一点。",
    everyRun: "每次运行都清理",
    everyRunSub: "开：始终执行，但接在本节点之后的所有内容也得重跑，因为 ComfyUI 无法判断本节点产出的结果没变。关：只有流程真的走到它才执行，后面的结果保留缓存。",
    onlyLow: "仅显存紧张时",
    onlyLowSub: "已经有足够空间时跳过清理。卸掉本来不必卸的模型，代价是之后再花时间加载回来。",
    underGB: (n) => `低于 ${n} GB 时`,
    tipOverSlider: (n) => `仅在空闲低于 ${n} GB 时清理。该值超出了本滑块范围，滑块停在末端——拖动它会降低数值。`,
    tipUnderSlider: (n) => `仅在空闲低于 ${n} GB 时清理`,
    secShow: "显示",
    showBar: "显示显存条",
    showBarSub: "按钮下方那条整卡色带。关掉后节点变矮，只留文字。",
    // ── 齿轮面板底部：按钮颜色区（家族共享 createAccentSection 的可选文案）──
    accentSwTitle: "点这里选本节点的按钮颜色",
    accentLabel: "按钮颜色",
    accentHint: "只影响本节点。保存为下方的默认值可应用到其它节点。",
    accentNewNodes: (title) => `新建的${title}节点`,
    accentNewNodesTip: (title) => `以后新建的每个${title}节点都用这个颜色`,
    accentAllNodes: "所有 XiaoHei 节点",
    accentAllNodesTip: "所有 XiaoHei 节点都用这个颜色，除非单独给它们设过颜色",
    accentDefaultFor: "把这个颜色设为默认，应用于",
    accentSaved: "已保存",
    // ── 帮助面板 ──
    helpTitle: "释放显存",
    helpTagline: "在你指定的位置把显存交还显卡。",
    helpSections: [
      {
        heading: "它能做什么",
        body: "两个重量级阶段串在一起时，往往在第二段失败：第一个模型还占着显存，第二个要加载时没地方放，运行就以显存不足告终。\n\n把本节点接在两段之间，第二个加载前就会先释放第一个。你接进去什么，就原样输出什么，所以它塞进任意连线都不会改变流过其中的图片、文字或数字。",
      },
      {
        heading: "放哪里",
        body: "只有输入重要。从想清理的那个节点拉线接到本节点，它就会在那个东西生成后执行。想在 VAE 解码后释放，就从 VAE Decode 的输出拖线到本节点即可，到此为止，输出不用接。\n\n当后面某一步必须先用上腾出的空间时，再把输出也接上。值会经过本节点再往下，把清理钉在两步之间。\n\n输出不接也是更省的做法：没有下游，就没有本节点会打乱的已存结果，这一点在你读完下面的「每次运行都清理」后尤其重要。\n\n什么都没接的节点完全不做事，节点脸上也会写明。",
        defs: [
          ["只接输入", "在你拉线的那个东西之后释放。最简单，且不打乱流程里任何缓存结果。"],
          ["输入和输出都接", "在两步之间释放，保证下一步用上时空间已腾好。此后它后面 all 的内容每次都会重跑。"],
        ],
      },
      {
        heading: "三颗按钮",
        defs: [
          ["全部", "卸掉模型并把空闲显存交还显卡。下一阶段需要空间时用它。"],
          ["仅模型", "卸掉模型但让 ComfyUI 保留已预留的显存。比「全部」稍快，只在 ComfyUI 自己需要空间时够用。"],
          ["仅缓存", "保留模型，只把空闲显存交还显卡。当 ComfyUI 之外的程序（游戏、剪辑软件、第二个 ComfyUI）要用卡时用它。在 ComfyUI 内部它几乎不改变什么，因为那份空闲显存本来就可被 ComfyUI 使用。"],
        ],
      },
      {
        heading: "读懂色条",
        bar: {
          captions: ["0 GB", "整张显卡", "24 GB"],
          segments: [
            { pct: 51.7, tone: "used", value: "12.4 GB", label: "仍占用" },
            { pct: 35, tone: "just", value: "8.4 GB", label: "本节点刚释放" },
            { pct: 13.3, tone: "was", value: "3.2 GB", label: "原本空闲" },
          ],
          note: "灰色右边全是空闲显存：8.4 + 3.2 = 11.6 GB 空闲。三段永远加起来等于整张卡。",
        },
        body: "整条就是整张显卡，长度从不改变，变的是划分方式。从左到右永远是：占用、本节点释放的、原本空闲的。\n\n唯一的口诀：灰色右边全是空闲显存，橙色是你加了这个节点多赚到的那部分。橙色宽说明它真出了力；只有一丝说明有别的东西占着卡，节点可能放错了位置；完全没有橙色说明没有可释放的东西。\n\n悬浮色条可看四个数字的文本。",
        defs: [
          ["灰", "清理后仍被占用。等于显卡减去当前空闲。"],
          ["橙", "本节点刚释放的：清理后的空闲减去清理前的空闲。"],
          ["深", "本节点运行前就已空闲。跟本节点无关，是你本来就有的空间。"],
        ],
      },
      {
        heading: "读懂下面那行字",
        body: "两个数字回答两个不同的问题。橙色的是本节点这次做了什么，旁边灰色的是你现在所处的状态——决定下一阶段装不装得下的正是这个数。\n\n所以「已释放 8.4 GB」旁边配「11.6 GB 空闲 / 共 24」的意思是：节点归还了 8.4 GB，结果你 24 GB 的卡有 11.6 GB 空闲。第二个数字就是色条的橙色加深色，也就是灰色右边那部分。\n\n「仅缓存」模式下写的是「已归还」而不是「已释放」，因为那份显存是还给显卡，而不是变成 ComfyUI 新可用的。",
      },
      {
        heading: "每次运行都清理",
        body: "这个值得弄懂，它藏在齿轮里。\n\n通常上方没变化时 ComfyUI 会跳过节点。而这正是本节点存在的场景：你只调了第二段，第一段被跳过，于是没人释放第一段留下的模型，你照样爆显存。\n\n所以开关默认开启，节点始终执行。代价是接在它之后的内容也得重跑，因为 ComfyUI 无法判断本节点产出的结果和上次一样。如果你宁愿保留那些缓存结果、接受清理偶尔被跳过，就把它关掉。",
      },
      {
        heading: "仅显存紧张时",
        body: "也在齿轮里。设一个阈值，空闲超过它的时段节点什么都不做，跳过时脸上写「已跳过」。\n\n流程定下来后值得开启。卸掉本来不必卸的模型，代价是之后再加载回来，所以在空间本来够的运行里，节点纯粹是拖延。\n\n要设的数跟你的显卡无关，它取决于下一个要加载的东西需要多少空闲：把阈值设成那个阶段需要的空闲量，这样它装不下时节点才动手，装得下时不打扰。下一节细讲。",
      },
      {
        heading: "阈值设成多少",
        body: "阈值是按空闲显存量的，不是按已用量。空闲低于它节点就动手，高于就不打扰。\n\n所以这个数不是你的卡有多大，而是下一阶段需要多少空闲显存。设成它，节点就会在那一阶段恰好装不下的运行里动手。\n\n设阈值时接口会提示可用量：跑一下那个阶段，读它的峰值。峰值 21 GB 就说明该阶段需要 21 GB，阈值就是 21。",
        table: {
          headers: ["下一阶段需要", "阈值设成", "24 GB 卡上何时动手"],
          rows: [
            ["4 GB，一个 VAE 或放大", "4 GB", "已用超过 20 GB 时，几乎不动"],
            ["8 GB，SD1.5 或 SDXL", "8 GB", "已用超过 16 GB 时"],
            ["12 GB，Flux 或大型 SDXL 堆叠", "12 GB", "已用超过 12 GB 时"],
            ["21 GB，视频模型", "21 GB，或留余量设 22", "已用超过 3 GB 时，几乎每次都动"],
          ],
        },
        bullets: [
          "往上取整，绝不往下。阈值低于该阶段所需，会让节点在该动手的运行里跳过，那就又成了它本要防止的显存不足错误。",
          "别按卡的大小设。24 GB 卡跑 21 GB 视频模型该设 21，不是 12：设 12 时节点会在空闲 19 GB 时跳过，而模型依然装不下。",
          "当下一阶段要用掉大半个卡时，阈值就没多大用了。它几乎每次都会动，这是对的，只是省掉了刚启动时那次无谓的清理。",
          "完全不知道该阶段需要多少时，从卡容量的一半起步，盯着节点脸。如果某次跳过之后运行失败了，说明数值太低。",
        ],
      },
      {
        heading: "好知道",
        bullets: [
          "它从不改变流过的东西。进去什么图片，出来还是同一张。",
          "释放会让下一次运行变慢，因为模型得重新加载。只在需要的地方用它，不要到处放。",
          "一张画布上放多个没问题，各自保留自己的设置。",
          "不管输出接没接它都会执行，所以除非你把输入留空，否则它不会悄悄地什么都不做。",
        ],
      },
    ],
  },

  en: {
    modeAll: "All",
    modeModels: "Models",
    modeCache: "Cache",
    tipAll: "Let go of the models AND hand the spare memory back to the card. The one to use when the next stage needs room.",
    tipModels: "Let go of the models but let ComfyUI keep its reserved memory. Slightly faster, and enough when only ComfyUI itself needs the room.",
    tipCache: "Keep the models loaded and only hand the spare memory back to the card. Use this when something OUTSIDE ComfyUI wants the card.",
    gearTip: "Free VRAM settings",
    barTip: "The card, once this node has run: grey still in use, orange what it just released, dark what was already free.",
    freeOf: (free, total) => `${free} free of ${total}`,
    unwiredHint: "wire in what to clean up after",
    unwiredTip: "Take the wire from whatever you want cleaned up after and drop it on this node's input. The output does not need connecting: connect it only when a particular later step must find the room already made.",
    waiting: "waiting for a run",
    waitingBelow: (limit) => `waiting · only below ${limit} free`,
    errNoMem: "could not read graphics memory",
    errFree: "could not free memory",
    skipped: "skipped",
    nothingWired: "nothing wired in",
    cachedEarlier: (amt) => `${amt} freed earlier`,
    cachedTip: "Nothing changed above this node, so ComfyUI skipped it and no memory was freed on this run. Turn on Free on every run in the settings to make it act regardless.",
    nothingToFree: "nothing to free",
    nothingToFreeTip: "It ran, and there was nothing loaded that it could let go of.",
    freed: "freed",
    returned: "returned",
    tipReadout: (comfyBefore, comfyAfter, driverBefore, driverAfter) =>
      `ComfyUI can see: ${comfyBefore} free before, ${comfyAfter} after\nThe card reports: ${driverBefore} free before, ${driverAfter} after`,
    barInUse: (v) => `In use: ${v}`,
    barJust: (v) => `Just released: ${v}`,
    barAlready: (v) => `Already free: ${v}`,
    barCard: (v, dev) => `Card: ${v}${dev ? ` (${dev})` : ""}`,
    panelTitle: "Free VRAM settings",
    secWhat: "What to let go of",
    secWhatSub: "The three modes are on the node itself. This is the extra step that goes with them.",
    gc: "Collect leftovers",
    gcSub: "Sweeps up anything Python is still holding on to before measuring again. Costs a fraction of a second and usually gets a little more back. Leave it on unless you are timing something.",
    secWhen: "When",
    secWhenSub: "A node is normally skipped when nothing above it changed. That is exactly the case this node exists for, so by default it ignores that.",
    everyRun: "Free on every run",
    everyRunSub: "On: always acts, but everything wired AFTER this node has to run again too, because ComfyUI can no longer tell that this node produced the same thing. Off: only acts when the workflow actually reaches it, and everything after it keeps its cached results.",
    onlyLow: "Only when memory is low",
    onlyLowSub: "Skip the cleanup when there is already plenty of room. Unloading a model you did not need to unload costs you the time to load it back.",
    underGB: (n) => `under ${n} GB`,
    tipOverSlider: (n) => `Only free when less than ${n} GB is already free. That is above this slider's range, so the handle sits at its end - moving it will lower the value.`,
    tipUnderSlider: (n) => `Only free when less than ${n} GB is already free`,
    secShow: "Show",
    showBar: "Show the memory bar",
    showBarSub: "The strip of the whole card under the buttons. Turning it off makes the node shorter and leaves the wording on its own.",
    // ── Gear panel footer: button colour block (XiaoHei shared createAccentSection) ──
    accentSwTitle: "Pick the colour this node paints with",
    accentLabel: "Button colour",
    accentHint: "This node only. Save it as a default below.",
    accentNewNodes: (title) => "New " + title + " nodes",
    accentNewNodesTip: (title) => "Every new " + title + " node starts with this colour",
    accentAllNodes: "Every XiaoHei node",
    accentAllNodesTip: "Every XiaoHei node follows this colour, unless it has been given one of its own",
    accentDefaultFor: "Use this colour as the default for",
    accentSaved: "Saved",
    helpTitle: "Free VRAM",
    helpTagline: "Hand the graphics card's memory back, at the exact point you choose.",
    helpSections: [
      {
        heading: "What it is for",
        body: "A workflow with two heavy stages tends to fail on the second one. The first model is still sitting in the card's memory when the second is asked for, there is nowhere to put it, and the run stops with an out of memory error.\n\nPut this node on the wire between the two stages and the first model is let go before the second is loaded. Whatever you wire in comes straight back out unchanged, so it drops into any wire without altering the picture, the text or the numbers passing through it.",
      },
      {
        heading: "Where to put it",
        body: "Only the INPUT matters. Take the wire from whatever you want cleaned up after and drop it on this node, and it acts once that thing has been made. To free after the VAE decode, drag from the VAE Decode output onto this node and stop there. The output does not need connecting.\n\nConnect the output as well when a particular later step has to find the room already made. The value then passes through this node on its way there, which pins the cleanup between the two.\n\nLeaving the output free is also the cheaper of the two: nothing downstream means nothing whose saved results this node can disturb, which matters once you have read Free on every run below.\n\nA node with nothing wired in does nothing at all, and says so on its face.",
        defs: [
          ["Input only", "Frees after the thing you dragged from. Simplest, and it disturbs no cached results anywhere in the workflow."],
          ["Input and output", "Frees BETWEEN two steps, so the next one is guaranteed to find the room already made. Everything after it then re-runs each time."],
        ],
      },
      {
        heading: "The three buttons",
        defs: [
          ["All", "Lets go of the models AND hands the spare memory back to the card. This is the one you want when the next stage needs the room."],
          ["Models", "Lets go of the models but lets ComfyUI keep the memory it has reserved. A little faster than All, and enough when it is only ComfyUI itself that needs room."],
          ["Cache", "Keeps the models loaded and only hands the spare memory back to the card. Use this when something OUTSIDE ComfyUI wants the card: a game, a video editor, a second ComfyUI. Inside ComfyUI it changes almost nothing, because that spare memory was already available to it."],
        ],
      },
      {
        heading: "Reading the bar",
        bar: {
          captions: ["0 GB", "the whole card", "24 GB"],
          segments: [
            { pct: 51.7, tone: "used", value: "12.4 GB", label: "still in use" },
            { pct: 35, tone: "just", value: "8.4 GB", label: "this node just freed" },
            { pct: 13.3, tone: "was", value: "3.2 GB", label: "was already free" },
          ],
          note: "Everything to the RIGHT of the grey is free memory: 8.4 + 3.2 = 11.6 GB free. The three parts always add up to the whole card.",
        },
        body: "The whole bar is your whole graphics card. It never changes length: what changes is how it is divided. Left to right it is always used, then what this node released, then what was already free.\n\nThe one rule: everything to the RIGHT of the grey is free memory, and the orange is the part of it you gained by adding this node. A wide orange band means it did real work. A sliver means it barely helped, so something else is holding the card and the node is probably in the wrong place. No orange at all means there was nothing loaded to let go of.\n\nHover the bar for the four figures as text.",
        defs: [
          ["Grey", "Still in use after the cleanup. This is the card minus whatever is free now."],
          ["Orange", "What this node just released: how much was free afterwards, minus how much was free before."],
          ["Dark", "What was already free before it ran. Nothing to do with this node, it is just the room you already had."],
        ],
      },
      {
        heading: "Reading the line underneath",
        body: "Two figures answering two different questions. The orange one is what THIS NODE did. The grey one beside it is where you STAND NOW, which is the figure that decides whether the next stage fits.\n\nSo `freed 8.4 GB` next to `11.6 GB free of 24` means the node handed back 8.4 GB, and 11.6 GB of your 24 GB card is free as a result. That second figure is the orange and the dark parts of the bar added together: everything to the right of the grey.\n\nWith Cache it says returned rather than freed, because that memory went back to the card rather than becoming newly available to ComfyUI.",
      },
      {
        heading: "Free on every run",
        body: "This one is worth understanding, and it lives behind the gear.\n\nNormally ComfyUI skips a node when nothing above it changed. That is exactly the situation this node exists for: you adjust only the second stage, so the first stage is skipped, so nothing lets go of the model the first stage left behind, and you get the out of memory error anyway.\n\nSo the switch is on by default and the node always acts. The cost is that everything wired AFTER it has to run again too, because ComfyUI can no longer tell that this node produced the same thing as last time. Turn it off if you would rather keep those cached results and accept that the cleanup sometimes gets skipped.",
      },
      {
        heading: "Only when memory is low",
        body: "Also behind the gear. Set a limit and the node does nothing while more than that much is already free. When it skips, the face says skipped.\n\nWorth turning on once a workflow is settled. Letting go of a model you did not need to let go of costs you the time to load it back, so on a run where there was plenty of room anyway the node is pure delay.\n\nThe number to set is not about your card. It is about the NEXT thing that has to load: set the limit to how much free memory that stage needs, so the node acts when it would not have fitted and stays out of the way when it would.",
      },
      {
        heading: "What to set the limit to",
        body: "The limit is measured against FREE memory, not used memory. The node acts when less than that much is free, and stays out of the way when more is.\n\nSo the number is not your card size. It is HOW MUCH FREE MEMORY THE NEXT STAGE NEEDS. Set it to that, and the node acts exactly on the runs where that stage would not have fitted.\n\nRun that stage and read its PEAK: a peak of 21 GB means the stage needs 21 GB, so the limit is 21.",
        table: {
          headers: ["The next stage needs", "Set the limit to", "On a 24 GB card it then acts when"],
          rows: [
            ["4 GB, a VAE or an upscaler", "4 GB", "over 20 GB is in use, so hardly ever"],
            ["8 GB, SD1.5 or SDXL", "8 GB", "over 16 GB is in use"],
            ["12 GB, Flux or a big SDXL stack", "12 GB", "over 12 GB is in use"],
            ["21 GB, a video model", "21 GB, or 22 for headroom", "over 3 GB is in use, so nearly every run"],
          ],
        },
        bullets: [
          "Round UP, never down. A limit below what the stage needs lets the node skip on a run where the room was genuinely needed, which is the out of memory error it was added to prevent.",
          "Do NOT set it from your card size. A 24 GB card running a 21 GB video model wants 21, not 12: at 12 the node would skip with 19 GB free and the model still would not fit.",
          "When the next stage needs most of the card, the limit stops being much use. It will act on nearly every run, which is correct, and all it saves you is the pointless cleanup right after a fresh start.",
          "If you have no idea what the stage needs, start at half your card and watch the face. Seeing skipped on a run that then failed means the number is too low.",
        ],
      },
      {
        heading: "Good to know",
        bullets: [
          "It never changes what passes through it. An image in is the same image out.",
          "Freeing costs time on the next run, because the model has to load again. Use it where you need it, not everywhere.",
          "Several of these on one canvas is fine, and each keeps its own settings.",
          "It runs whether or not the output is connected, so it is never quietly doing nothing unless you left the input empty.",
        ],
      },
    ],
  },
};

// 当前语言文案表
export function t() {
  return I18N[currentLang()] || I18N.zh;
}
