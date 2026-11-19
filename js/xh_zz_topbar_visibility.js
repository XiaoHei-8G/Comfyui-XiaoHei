//  XiaoHei 家族 · 顶栏按钮可见性开关（+ 面板入口）
// ══════════════════════════════════════════════════════════════════════
//  文件名前缀 `xh_zz_` 是刻意的（**但别再指望它能顶到最上面**，2026-10-29 勘误）
//   文件名升序只决定**脚本求值/注册的先后**，而注册先后**只影响同一个组内部的排序**
//   （组内是"最后注册 = 显示在最前"，见 xh_animated_links.js 顶部的顺序规则 ①）。
//   **组与组之间的先后跟它毫无关系** —— 那由 `sortOrder` 决定（见本文件 _ord() 处的注释）。
//   本文件保持 xh_zz_（最后加载）⇒ 顶栏这 4 项在「外观」组内部排在最前，这个效果仍然有效。
//    别为了"把外观顶上去"再去改文件名 —— 没用，改 sortOrder 才有用。
//
// ── 机制：隐藏用 CSS（body class），不是 un-mount ───────────────────
//   每个顶栏按钮都是各自「轮询等 app.menu.settingsGroup 出现」才挂上去的
//   （最多 20 次 / 5 秒）。如果靠 un-mount 来隐藏，就得去跟这几个重试定时器
//   赛跑，还必须在按钮终于挂上的那一刻再重新判断 —— 极易漏。
//   挂一个 body class 成本为零：按钮还没出现也无所谓，出现了照样被 CSS 藏掉，
//   反转也是**立刻**生效。
//
// ── 关键区别：藏按钮 ≠ 关功能 ────────────────────────────────────────────
//   这些按钮的快捷键（Alt+W / Alt+H 等）是注册成 ComfyUI COMMAND 的，
//   跟 DOM 按钮毫无关系 —— 藏了按钮，快捷键照样能用。
//   本文件只管「看不看得见」，不动任何功能开关。
//
// 零 Python 改动、零第三方依赖。

const { app } = window.comfyAPI.app;

const NS = "XH.Toolbar";

/**
 * 顶栏按钮：key = group 上的 data-xh-btn 值（共 5 个，含 2026-11-19 新增的模型管理器）。
 *  节点导航（nav）已在 2026-10-27 合并进 Help Browser，
 *    它的挂载函数第一行就 return()，**顶栏没有独立按钮** ⇒ 这里不给它开关。
 */
//  2026-10-28：名字必须跟**顶栏实际显示的东西**一致（用户：「跟外边那个图标要一致，名字要一致」）。
//   顶栏现在长这样（左→右）：
//     ① 小黑爪印   = 设置面板入口（家族门面，唯一琥珀金底）
//     ② 帮助图标   = 帮助浏览器入口（自家图标库「帮助」）
//     ③ 工作流图标 = 工作流浏览器入口（自家图标库「文件夹树」folder-tree）
//     ④ 对齐线图标 = 对齐线开关（自家图标库「对齐线」）
//     ⑤ 模型管理器 = 全屏面板入口（自家图标库「boxes」盒子，2026-11-19 并入）
//      2026-11-11：四颗全部改走自家 xh_icons 图标库，同为 24 网格 / 2px / 20px /
//        currentColor，方框 36×30（用户「窄窄的有点小，稍微大一些」）；
//        关态照抄 ComfyUI 官方顶栏按钮（近黑底 + 官方前景色图案），
//        开态与门面琥珀金底深墨图案。 不再自造「浅灰 / 雾灰」。
//  icon = 家族图标库语义名，给自家设置面板的行首画图案用（2026-11-19 用户要求）。
//    图案跟顶栏那颗同源：设置面板里一眼对上是哪颗按钮。⛔ 语义名必须在 semantic.mjs 里能解析。
const BUTTONS = [
  { key: "settings", icon: "小黑爪印", name: "顶栏「小狗爪」", desc: "XiaoHei 设置面板的入口按钮（顶栏显示自家图标库的小黑爪印图案，琥珀金门面底）。" },
  { key: "wf", icon: "工作流", name: "顶栏「工作流」图标", desc: "XiaoHei 工作流浏览器的入口按钮（顶栏用自家图标库的工作流图案，一眼看出翻目录找工作流）。快捷键 Alt+W 仍然可用。" },
  { key: "help", icon: "帮助", name: "顶栏「帮助」图标", desc: "XiaoHei 帮助浏览器的入口按钮（顶栏用自家图标库的「帮助」圆圈问号图案，里面是所有组件说明 + 使用指南）。快捷键 Alt+H 仍然可用。" },
  { key: "align", icon: "对齐线", name: "顶栏「对齐线」图标", desc: "对齐线开关（顶栏用自家图标库的图案：两个节点加一条竖辅助线）。开启后拖动节点会吸附到附近节点与分组的边缘、中心，并显示对齐辅助线；开启时整颗按钮常驻家族黄。" },
  { key: "modelboard", icon: "boxes", name: "顶栏「模型管理器」图标", desc: "XiaoHei 模型管理器的入口按钮（顶栏用自家图标库的「boxes」盒子图案）。点它弹出全屏面板：浏览本地模型 / 标注收藏 / 预览图 / 资源库。快捷键 Ctrl+Shift+M 仍然可用。" },
];
// 🔴 2026-11-19：桌宠已从家族分离（key:"pet" 那一项连同 js/xh_pet.js 一起移出）。
//    以后不再有「顶栏桌面宠物」按钮，别再把这条加回来。

const CLASS_PREFIX = "xh-hide-tb-";

function injectCSS() {
  if (document.getElementById("xh-toolbar-visibility-css")) return;
  const rules = BUTTONS.map(
    (b) => `body.${CLASS_PREFIX}${b.key} [data-xh-btn="${b.key}"]{display:none !important;}`
  ).join("\n");
  const st = document.createElement("style");
  st.id = "xh-toolbar-visibility-css";
  st.textContent = rules;
  document.head.appendChild(st);
}

/** 读设置值（官方存储，和原生设置面板同步、持久化）。 */
function readFlag(key) {
  try {
    const v = app.ui?.settings?.getSettingValue?.(`${NS}.${key}`);
    if (v === false) return false;
    if (v === true) return true;
  } catch (e) { /* 读不到就用默认 */ }
  return true;   // 默认全显示
}

/** 把某个按钮的显隐状态写进 body class。 */
function applyFlag(key, visible) {
  try {
    document.body.classList.toggle(CLASS_PREFIX + key, !visible);
  } catch (e) { /* 忽略 */ }
}

function applyAll() {
  for (const b of BUTTONS) applyFlag(b.key, readFlag(b.key));
}

/**
 *  category 第三级**必须每项唯一**（= 该项自己的名字）。
 * 之前三个开关共用 `[" XiaoHei","外观","顶栏按钮"]` ⇒ 官方面板的 buildTree
 * 把「顶栏按钮」当成同一个叶子节点，**后注册的把前面的覆盖掉** ⇒ 面板里只剩最后一个
 * 「顶栏「问号」」（用户 2026-10-29：「明明外面有三个功能键，这里怎么就放了一个」）。
 * 这是 xh_animated_links.js 里 `_cat(itemName) = [扩展, 分组, 这一项的名字]` 的同一套约定，
 * 全家族必须照抄，别再写成常量。
 */
const _cat = (itemName) => ["XiaoHei", "外观", itemName];

/** 自定义渲染行：**「打开 XiaoHei 设置面板」按钮**（纯展示、不落盘）。 */
//  必须返回 **HTMLElement**：官方面板 FormItem 对 `typeof type === "function"` 走
//    CustomFormValue（源码：`container.appendChild(props.renderFunction())`）。
//     别返回 `<tr>/<td>` —— CustomFormValue 的容器是 <div>，HTML 解析会把 tr/td 整层丢掉
//    （xh_about.js 那行就是这么写的，靠子元素侥幸还能显示）。这里直接返回 <div>。
function _renderOpenPanelRow() {
  const box = document.createElement("div");
  box.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "打开XiaoHei 设置面板";
  btn.style.cssText =
    "height:28px;padding:0 12px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;"
    + "background:#e8e8e8;color:#1c1c1c;border:1px solid #4a4a4a;";
  btn.onmouseenter = () => { btn.style.filter = "brightness(0.92)"; };
  btn.onmouseleave = () => { btn.style.filter = "none"; };
  btn.onclick = () => {
    // ① 优先走 xh_settings_panel.js 暴露的入口（顶栏 XiaoHei 按钮被藏了也能开）
    if (typeof window.XH_openSettingsPanel === "function" && window.XH_openSettingsPanel(true)) return;
    // ② 兜底：直接点顶栏那颗「XH」按钮
    const tb = window.__xhSettingsTbBtn || document.querySelector("[data-xh-tb-settings]");
    if (tb) { tb.click(); return; }
    btn.textContent = "没找到入口 —— 刷新页面再试";
  };

  const hint = document.createElement("span");
  hint.textContent = "顶栏「小狗爪」按钮被关掉后，从这里把面板叫回来";
  hint.style.cssText = "font-size:12px;opacity:.7;";

  box.appendChild(btn);
  box.appendChild(hint);
  return box;
}

//  2026-10-29 勘误（用户发现「外观」掉到最底 ⇒ 去翻前端源码）：
//    `SettingDialog.vue:174-190` 组间排序 = 组内 sortOrder **最大值降序**，相等再按**组名拼音升序**。
//    "外观"(wai) 拼音 > "连线"(lian) ⇒ 不写 sortOrder 的话，外观**永远**排在连线后面，
//    跟注册先后、跟文件名叫什么**完全无关**（这就是改名 xh_zz_ 没能把它顶上去的原因）。
//    ⇒ 想让它排在「关于」下面、「连线」上面，只能**显式给 sortOrder**（外观=90）。
//    文件名前缀 xh_zz_ 仍然有用，但它只影响**同组内**的先后（组内是注册倒序）。
function _ord(key, fallback) {
  const t = (typeof window !== "undefined" && window.XH_GROUP_ORDER) || null;
  const v = t && t[key];
  return (typeof v === "number") ? v : fallback;
}

const OPEN_PANEL_SETTING = {
  id: `${NS}.openPanel`,
  name: "打开XiaoHei 设置面板",
  category: _cat("打开XiaoHei 设置面板"),
  //  2026-10-29（§13.26 D3）：官方面板的说明只认 tooltip，补上这行才有 ⓘ 解释。
  tooltip: "一个按钮，不是开关：点它就把XiaoHei 设置面板重新叫出来。顶栏那颗「小狗爪」按钮被你关掉之后，就从这里把面板叫回来（刷新页面也会回到这里）。",
  sortOrder: _ord("appearance", 90),
  type: _renderOpenPanelRow,
};

/** 幂等判据必须查**真实存储**（模块级 flag 挡不住脚本二次求值）。 */
function _already(id) {
  try {
    const store = app.extensionManager?.setting?.settings;
    if (store && Object.prototype.hasOwnProperty.call(store, id)) return true;
  } catch (e) { /* 忽略 */ }
  return false;
}

function _registerTopbar() {
  const S = app.ui && app.ui.settings;
  if (!S || typeof S.addSetting !== "function") {
    console.error("XH.Toolbar] app.ui.settings.addSetting 不可用");
    return false;
  }
  //  **同一组内**的注册顺序 = 期望显示顺序的**倒序**（组内最后注册的显示在最前）。
  //    期望显示（自上而下）：顶栏「XiaoHei」→ 顶栏「工作流」→ 顶栏「问号」→ 打开 XiaoHei 设置面板
  //    ⇒ 这里注册：打开 XiaoHei 设置面板 → 问号 → 工作流 → XH
  //     这只是**组内**排序；组间（关于/外观/连线）的先后看 sortOrder，跟这里无关。
  if (!_already(OPEN_PANEL_SETTING.id)) {
    try { S.addSetting(OPEN_PANEL_SETTING); } catch (e) { /* 忽略 */ }
  }
  for (const b of BUTTONS.slice().reverse()) {
    const id = `${NS}.${b.key}`;
    if (_already(id)) continue;
    try {
      S.addSetting({
        id,
        name: b.name,
        type: "boolean",
        defaultValue: true,
        tooltip: b.desc + "（只藏按钮，功能和快捷键照常）",
        category: _cat(b.name),
        //  组间顺序只认这个（同组每项必须同一个值，否则组内会被拆成两截）。
        sortOrder: _ord("appearance", 90),
        onChange: (v) => applyFlag(b.key, v !== false),
      });
    } catch (e) { /* 忽略 */ }
  }
  return true;
}

//  2026-10-29 勘误：以前这里写「想让「外观」排最顶就必须最后注册」—— **错的**。
//    组间顺序 = 组内 sortOrder 最大值**降序**（关于 100 > 外观 90 > 连线 0），
//    跟注册先后 / 文件名都无关。现在靠 sortOrder，这里轮询只是为了让「本组内部」
//    的注册顺序稳定排在 brand 之后（⇒ 显示在它前面），仍有意义，保留。
const PREREQ_IDS = ["XH.Links.enabled", "XH.Brand.ColorMode"];   // 连线组 + 节点配色

function _registerTopbarAfterPeers(tries) {
  const ready = PREREQ_IDS.every((id) => _already(id));
  if (!ready && (tries || 0) < 40) {          // 最多等 2 秒，超时也照样注册（不能因为等对端就不显示）
    setTimeout(() => _registerTopbarAfterPeers((tries || 0) + 1), 50);
    return;
  }
  try { _registerTopbar(); } catch (e) { console.error("XH.Toolbar] 注册异常:", e); }
}

app.registerExtension({
  name: "XH.ToolbarVisibility",

  async setup() {
    injectCSS();
    applyAll();
    _registerTopbarAfterPeers(0);      // 等前面几组注册完，本组最后注册 ⇒ 显示在最顶

    // XiaoHei 自己的设置面板（数据源是 window.XH_SETTING_DEFS）。
    //  这里只 push 引用，不复制 SETTING_DEFS 本身 —— 它仍是唯一真源。
    try {
      const list = window.XH_SETTING_DEFS;
      if (Array.isArray(list) && !list.some((d) => String(d.id || "").startsWith(NS + "."))) {
        for (const b of BUTTONS) {
          list.push({
            id: `${NS}.${b.key}`,
            name: b.name,
            icon: b.icon,   // 行首家族图案（设置面板 renderBody 读它）
            type: "boolean",
            defaultValue: true,
            group: "顶栏按钮",
            description: b.desc + "（只藏按钮，功能和快捷键照常）",
            onChange: (v) => applyFlag(b.key, v !== false),
          });
        }
      }
    } catch (e) { /* 忽略 */ }
  },
});
