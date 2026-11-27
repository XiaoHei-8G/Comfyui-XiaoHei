//  XiaoHei · 设置面板（顶栏「 设置」按钮 + 整齐化分组面板）
//
// 复刻 Pixaroma 设置面板的整齐感（你截图里那种）：
//   分组标题 → 每项「名称 + i 信息入口 + 右侧控件 + 分隔线」。
//    2026-11-10 用户要求「简化掉、去掉去掉」：每项下面那一大坨灰色小字说明**整行删掉**，
//      只留功能主名字；完整说明统一搬到顶栏「? 问号帮助」的「设置项说明」专题页，
//      点名字后的「i」信息图标会直接打开 XiaoHei 说明并定位到这一项。
//
// 数据来源：window.XH_SETTING_DEFS（由 xh_animated_links.js 暴露，含 group + description）。
//    零 Python 改动：SETTING_DEFS 是唯一真源，这里只读取 + 渲染 + 写回。
//    description 现在**只**在问号帮助里渲染（xh_help_browser.js 的 settingsHelpHtml），本面板不再显示。
// 读写：走 ComfyUI 官方设置存储 app.extensionManager.setting.get/set，
//   与原生设置面板完全同步（改了也持久化），并兜底手动触发 def.onChange。
// 配色：复用 web/xh_ui_kit.js 注入的 window.XH_BAR_COLORS，取不到用内联兜底。

const { app } = window.comfyAPI.app;
const NS = "XH.SettingsPanel";

// ═══════════════════════════════════════════════════════════
//  主题管理（设置面板自己管理，不依赖 Help Browser）
// ═══════════════════════════════════════════════════════════
//  2026-11-08：**这里是 XiaoHei 全部 `--xh-*` 界面变量的唯一真源**。
//    `xh_ui_kit.js: syncXhCssVars()` 已改为「只补缺、不覆盖」， 不许再往 :root
//    无条件写 --xh-surface / --xh-text / --xh-border 等 —— 那会让亮色主题变成
//    「白底 + 深色主题的浅字」，字全看不清（粉丝踩过坑）。
//  2026-10-29：整套换成 **官方中性黑白灰**（上一版官方深紫+黄跟用户本机界面不符）。
//    色值按用户本机 ComfyUI 真实像素取：面板 #1C1C1C / 卡 #252525 / 分隔 #333 / 字 #e8e8e8。
//  2026-11-08：`--xh-primary` 统一为琥珀金 #E8A33C（⏱ 瞬时信号色，不是常态按钮底；
//    常态按钮走 --xh-rest（主题标题色））。`--xh-on-primary` 由 applyTheme 按 WCAG 实时算 ⇒ 金底深墨字。
const LS_KEY_THEME = "XH.Help.theme";
const THEME_MODES = ["auto", "dark", "light"];
const THEMES = {
  dark: {
    "--xh-surface":  "#1c1c1c", "--xh-side": "#141414", "--xh-card": "#252525",
    "--xh-border":   "#333333", "--xh-text": "#e8e8e8", "--xh-sub": "#8a8a8a",
    "--xh-text-strong": "#ffffff", "--xh-input": "#141414", "--xh-second": "#8a8a8a",
    "--xh-primary":  "#E8A33C", "--xh-hover": "rgba(255,255,255,.08)",
    //  主色**上面**该用什么字色：运行时按 WCAG 算（金是亮色 ⇒ 深墨字）。
    "--xh-on-primary": "#1c1c1c", "--xh-danger": "#e05858",
    "--xh-title-bg": "rgba(255,255,255,.05)", "--xh-bar-bg": "rgba(0,0,0,.25)",
    "--xh-foot-bg":  "rgba(0,0,0,.25)", "--xh-shadow": "rgba(0,0,0,.7)",
    "--xh-input-bg": "#141414", "--xh-chip-bg": "rgba(255,255,255,.06)",
    "--xh-overlay":  "rgba(255,255,255,.08)",
  },
  // light 主题 = 完整亮色一套（白底深字）。 缺任何一个变量都会出现「半深半浅」。
  light: {
    "--xh-surface":  "#f7f7f7", "--xh-side": "#eeeeee", "--xh-card": "#ffffff",
    "--xh-border":   "rgba(0,0,0,.12)", "--xh-text": "#1c1c1c", "--xh-sub": "#6b6b6b",
    "--xh-text-strong": "#1c1c1c", "--xh-input": "#ffffff", "--xh-second": "#5f5f5f",
    "--xh-primary":  "#E8A33C", "--xh-hover": "rgba(0,0,0,.06)",
    "--xh-on-primary": "#1c1c1c", "--xh-danger": "#c93a3a",
    "--xh-title-bg": "rgba(0,0,0,.03)", "--xh-bar-bg": "rgba(0,0,0,.04)",
    "--xh-foot-bg":  "rgba(0,0,0,.04)", "--xh-shadow": "rgba(0,0,0,.12)",
    "--xh-input-bg": "#ffffff", "--xh-chip-bg": "rgba(0,0,0,.04)",
    "--xh-overlay":  "rgba(0,0,0,.05)",
  }
};
/**
 *  主题判定 = **亮度比较法**（2026-10-29 重写，抄 Pixaroma `shared/light_theme.mjs`
 * 的三档证据链；那条注释里记录的翻车史和我们 2026-10-28 踩的是同一个坑）。
 *
 * 历史（别再退回去）：
 *   ① 最早 auto 走 `prefers-color-scheme`（**操作系统**偏好）⇒ 系统浅色 + ComfyUI 深色
 *      ⇒ 面板跑成 light，深底没生效（截图里一块白底 + 淡黄分组条）。
 *   ② 改成看 `<html class="dark-theme">` ⇒ 这个 class 来自调色板的 **optional** 字段
 *      `light_theme`（colorPaletteSchema: z.boolean().optional()），只要该 watcher 没跑、
 *      调色板 id 解析失败、或这个布尔跟它自己的颜色打架，class 就**不存在** ⇒ 深色界面被判成浅色。
 *       这个信号**两个方向都会错**：深色没 class、浅色也可能带 class。
 *
 *  现在的判据只认**调色板自己写出来的颜色**，不看任何标志位：
 *   1. `<html>` 上的 `--bg-color` vs `--fg-color` 做亮度比较（colorPaletteService 从调色板
 *      写成 inline 自定义属性，**与 class 无关**）。纯比较、无阈值 ⇒ 中灰调色板也不会判错。
 *   2. 拿不到 ⇒ 只比较 `<body>` 的**背景**亮度对 0.5（文字色不能用：core 的文字样式也挂在
 *      dark-theme class 上，class 一丢 body 的 color 就变黑 ⇒ "深底更深字"会被误判成浅色）。
 *   3. 都拿不到 ⇒ **DARK**。本包全按深色画的，读不出页面就绝不许刷成浅色。
 *    最后这档**不许**退回系统偏好 —— 那是 ① 号坑的入口。
 */
function parseCssColor_(s) {
  s = String(s || "").trim();
  if (!s) return null;
  if (s[0] === "#") {
    const h = s.slice(1);
    if (h.length !== 6 && h.length !== 8) return null;
    if (!/^[0-9a-f]+$/i.test(h)) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const m = /rgba?\(([^)]+)\)/i.exec(s);
  if (!m) return null;
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.some((v) => !isFinite(v))) return null;
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
/** WCAG 相对亮度。只用来**两两比较**，永远不跟固定阈值比。 */
function lum_(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function officialTheme() {
  try {
    const hs = getComputedStyle(document.documentElement);
    const bg = parseCssColor_(hs.getPropertyValue("--bg-color"));
    const fg = parseCssColor_(hs.getPropertyValue("--fg-color"));
    if (bg && fg) return lum_(bg) > lum_(fg) ? "light" : "dark";
    if (document.body) {
      const bbg = parseCssColor_(getComputedStyle(document.body).backgroundColor);
      if (bbg && bbg[3] > 0.5) return lum_(bbg) > 0.5 ? "light" : "dark";
    }
  } catch (e) { /* 落到兜底 */ }
  return "dark";
}
/** pickOnColor 的本地兜底（kit 还没加载时用）。逻辑与 kit 里一致。 */
function pickOnColorFallback(bgHex) {
  const m = String(bgHex || "").replace("#", "").trim();
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(v)) return "#1c1c1c";
  const lin = (u) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  const c = [0, 2, 4].map((i) => lin(parseInt(v.slice(i, i + 2), 16) / 255));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const onBlack = (L + 0.05) / 0.05, onWhite = 1.05 / (L + 0.05);
  if (onBlack >= onWhite) return onBlack >= 4.5 ? "#000000" : "#1c1c1c";
  return onWhite >= 4.5 ? "#ffffff" : "#1c1c1c";
}

/** 把 fg 按比例混进 bg（模拟 color-mix(fg X%, bg)）⇒ 算出稀释后的实际底色。 */
function mixWithBg(fg, bg, ratio) {
  const px = (h) => {
    const m = String(h || "").replace("#", "").trim();
    const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
    if (!/^[0-9a-f]{6}$/i.test(v)) return null;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const a = px(fg), b = px(bg);
  if (!a || !b) return fg;
  const out = a.map((c, i) => Math.round(c * ratio + b[i] * (1 - ratio)));
  return "#" + out.map((c) => c.toString(16).padStart(2, "0")).join("");
}

function resolveTheme(mode) {
  if (mode === "auto") return officialTheme();
  return mode === "light" ? "light" : "dark";
}
function applyTheme(mode) {
  const actual = resolveTheme(mode);
  const vars = THEMES[actual];
  const root = document.documentElement;
  for (const k in vars) {
    //  2026-11-17 配色预设化：主色一组变量交给 XH_THEME 注入，
    //    THEMES 里写死的金色不再是真源（明暗只管中性壳色，配色管色相 ⇒ 正交）。
    if (k === "--xh-primary" || k === "--xh-on-primary") continue;
    root.style.setProperty(k, vars[k]);
  }
  //  先落 body class：主题预设的 isLightMode() 要读它判断深/浅版，顺序不能反。
  document.body.classList.remove("xh-light", "xh-dark");
  document.body.classList.add("xh-" + actual);
  //  主色变量由主题预设模块按当前明暗写深浅版（它监听 xh-help-theme-change）。
  //    模块未加载时兜底：仍按 THEMES 写死值 + WCAG 算字色，界面不会缺色。
  const T = (typeof window !== "undefined") ? window.XH_THEME : null;
  if (T) {
    try { T.apply(); } catch (e) {}
  } else {
    try {
      const pick = (window.XH_pickOnColor || pickOnColorFallback);
      const prim = vars["--xh-primary"];
      root.style.setProperty("--xh-primary", prim);
      root.style.setProperty("--xh-on-primary", pick(prim));
      root.style.setProperty("--xh-on-primary-dim", pick(mixWithBg(prim, vars["--xh-surface"], 0.32)));
    } catch (e) { /* 忽略 */ }
  }
  try { document.dispatchEvent(new CustomEvent("xh-help-theme-change")); } catch (e) {}
  return actual;
}

//  auto 模式下要**跟着官方主题切换**而变（用户在 ComfyUI 设置里换主题，XiaoHei 面板要同步）。
//    官方换主题时会重写 <html> 上的 ~40 个 inline 自定义属性（--bg-color / --fg-color …），
//    也可能改 class ⇒ **两个都得盯**（只盯 class 会在 class 缺失的调色板上完全失灵）。
//    core 是一次 setProperty 一个变量，会连着触发几十次 ⇒ 合并成一次重算（60ms 节流），
//    否则每次换主题都要重画面板几十遍。
function watchOfficialTheme() {
  const root = document.documentElement;
  if (!root || typeof MutationObserver === "undefined") return;
  const cur = localStorage.getItem(LS_KEY_THEME) || "auto";
  if (cur !== "auto") return;             // 用户手动指定了 ⇒ 不许自动改
  let last = officialTheme();
  let scheduled = false;
  const recompute = () => {
    const now = officialTheme();
    if (now === last) return;
    last = now;
    applyTheme("auto");
    renderBody();                        // 主题变了，控件要重画（颜色在 HTML 里）
  };
  try {
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { scheduled = false; recompute(); }, 60);
    }).observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  } catch (e) { /* 忽略 */ }
}
function cycleThemeMode() {
  const cur = localStorage.getItem(LS_KEY_THEME) || "auto";
  const idx = THEME_MODES.indexOf(cur);
  const next = THEME_MODES[(idx + 1) % THEME_MODES.length];
  localStorage.setItem(LS_KEY_THEME, next);
  applyTheme(next);
  return next;
}
// 启动时立即应用主题
(function initTheme() {
  const m = localStorage.getItem(LS_KEY_THEME) || "auto";
  applyTheme(m);
})();

/** 读 Help Browser 设置的 CSS 变量；读不到用兜底。 */
function colors() {
  const root = document.documentElement;
  const v = (n, f) => root.style.getPropertyValue(n).trim() || f;
  return {
    //  2026-10-29：兜底值同步成官方中性黑白灰（原来还留着老深紫体系的半透明白描边）。
    SURFACE:  v("--xh-surface",  "#252525"),
    BORDER:   v("--xh-border",   "#333333"),
    TEXT:     v("--xh-text",     "#e8e8e8"),
    PRIMARY:  v("--xh-primary",  "#e8e8e8"),
    SUB:      v("--xh-sub",      "#8a8a8a"),
    //  输入框 / 下拉框底色：**必须跟着主题走**（dark 深 #141414 / light 白 #ffffff）。
    //    以前这里写死 `rgba(0,0,0,.3)` ⇒ light 主题下变成「深底 + 深墨字」= 完全看不见。
    //    同理暗色下若把底色写浅、字色又是近白，也会「白底白字」。底与字必须成对取主题值。
    INPUT_BG: v("--xh-input-bg", "#141414"),
  };
}

/** 轮询等 DOM 容器出现（ComfyUI 是 SPA，顶栏不一定在脚本执行时已存在）。 */
function waitFor(sel, cb, tries = 0) {
  const el = document.querySelector(sel);
  if (el) return cb(el);
  if (tries > 200) return;
  setTimeout(() => waitFor(sel, cb, tries + 1), 100);
}

const STATE = { panel: null, open: false };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ----------------------------- 读 / 写 设置值 -----------------------------
function getVal(def) {
  try {
    const s = app.extensionManager && app.extensionManager.setting;
    if (s && typeof s.get === "function") {
      const v = s.get(def.id);
      if (v !== undefined && v !== null) return v;
    }
  } catch (e) { /* 读不到就用默认值 */ }
  return def.defaultValue;
}

function applySetting(def, val) {
  try {
    const s = app.extensionManager && app.extensionManager.setting;
    if (s && typeof s.set === "function") s.set(def.id, val);
  } catch (e) {
    console.error("[XiaoHei.Settings] 写入失败:", def.id, e);
  }
  // 兜底：手动触发 onChange，确保 CFG 立刻更新（个别版本 set 不回调）
  if (typeof def.onChange === "function") {
    try { def.onChange(val); } catch (e) { /* 单项错误不阻断 */ }
  }
}

// ----------------------------- 顶栏按钮 -----------------------------
//  2026-10-27 修复"挤在右上角"：同 xh_workflow_browser.js —— 前端 1.57
//   已删 #comfyui-topbar，改用 Pixaroma 同款官方挂点 app.menu.settingsGroup。
//
//  2026-10-28 13:20 用户暴怒定案：「三颗顶栏按钮要风格一致、同样效果 ——
//   工作流那个图标怎么不是黄的？跟那个问号一样会变化成黄色，XiaoHei 也是。」
//    根因：**本文件按字母序先注入了 <style id="xh-tb-btn-css">**，
//      把 xh_workflow_browser_v12.js 那份（打开变黄）直接挤掉
//      ⇒ 本文件这份（打开变淡紫 #8a8a8a）独占 ⇒ 工作流和 XiaoHei 都是紫的，只有问号是黄的。
//    修法：样式真源搬到 xh_ui_kit.js 的 ensureToolbarButtonCSS（整个页面只注一次），
//      三颗按钮共用 .xh-tb / .xh-tb-open。**本文件不再注入任何顶栏按钮样式。**
function ensureToolbarButtonCSS() {
  try {
    if (typeof window !== "undefined" && typeof window.XH_ensureToolbarButtonCSS === "function") {
      window.XH_ensureToolbarButtonCSS();
    }
  } catch (e) { /* 忽略 */ }
}

/** 统一真源的「造顶栏按钮」—— 本文件不 import kit（见文件头注释），改从 window 取。 */
function makeToolbarButton(html, title, onClick) {
  try {
    if (typeof window !== "undefined" && typeof window.XH_makeToolbarButton === "function") {
      return window.XH_makeToolbarButton(html, title, onClick);
    }
  } catch (e) { /* 兜底 */ }
  // 兜底：kit 还没就绪时手工造一个同 class 的按钮（样式由 kit 后续注入）
  const btn = document.createElement("button");
  btn.className = "comfyui-button " + ((typeof window !== "undefined" && window.XH_TB_CLASS) || "xh-tb");
  if (html != null) btn.innerHTML = html;
  if (title) btn.title = title;
  if (typeof onClick === "function") btn.onclick = onClick;
  return btn;
}

/** 统一真源的「打开态」开关。 */
function setToolbarButtonOpen(btn, open) {
  try {
    if (typeof window !== "undefined" && typeof window.XH_setToolbarButtonOpen === "function") {
      window.XH_setToolbarButtonOpen(btn, open);
      return;
    }
  } catch (e) { /* 兜底 */ }
  try {
    if (btn) btn.classList.toggle((typeof window !== "undefined" && window.XH_TB_OPEN_CLASS) || "xh-tb-open", !!open);
  } catch (e) { /* 忽略 */ }
}

function mountToolbarButton() {
  ensureToolbarButtonCSS();
  if (window.__xhSettingsInjected) return;
  const C = colors();
  const settingsGroupEl = app.menu && app.menu.settingsGroup && app.menu.settingsGroup.element;
  if (!settingsGroupEl) {
    if (mountToolbarButton._tries == null) mountToolbarButton._tries = 0;
    if (++mountToolbarButton._tries > 20) {
      console.warn("[XiaoHei] 顶栏挂载失败：app.menu.settingsGroup 一直没出现（设置按钮未挂上）");
      return;
    }
    setTimeout(mountToolbarButton, 250);
    return;
  }
  window.__xhSettingsInjected = true;
  const group = document.createElement("div");
  group.className = "comfyui-button-group";
  group.dataset.xhBtn = "settings";
  //  2026-10-28 13:20：走**统一真源** makeToolbarButton（.xh-tb），
  //    三颗按钮（XiaoHei / 帮助 / 工作流）共用同一份样式 ⇒ 不可能再一个紫一个黄。
  //  2026-10-28：齿轮 emoji → 「XH」文字（用户：「齿轮图标我想换成XH」）。
  //    齿轮是通用符号、而且 Pixaroma 顶栏也有齿轮 ⇒ 两包同装分不清谁是谁；
  //    「XH」是家族门面，独家。工作流浏览器那颗按钮改用官方的「工作流」节点图图标。
  //  2026-11-11：门面从「XiaoHei」文字换成自家图标库的「小黑爪印」。
  //    仍是设置面板入口、仍是全家族唯一的琥珀金底，招牌地位一行没动；
  //    只是跟另外三颗统一成同一套 24 网格 / 2px / 20px 的自家图案
  //    （尺寸真源是 kit 的 XH_TB_ICON_SIZE，这里不写死，免得四颗又分叉）。
  const iconHTML = (typeof window !== "undefined" && typeof window.XH_iconHTML === "function")
    ? window.XH_iconHTML("小黑爪印", { color: "current" })
    : '<span class="xh-icon-mask">XiaoHei</span>';
  const btn = makeToolbarButton(iconHTML, "XiaoHei 设置", () => togglePanel());
  try { btn.setAttribute("aria-label", "XiaoHei 设置"); } catch (e) {}
  btn.dataset.xhTbSettings = "1";
  //  2026-11-15 用户：「不要让它一直显现出我们的黄色，点它的时候它才显示」。
  //    ⇒ 拆掉常态品牌色：既不挂 .xh-tb-brand，也⛔ 不写 inline style 主色
  //      （panel_extension.md §2 明令：inline style 写死主色 = 一直亮 + 外观跟官方不一致）。
  //    现在跟另外三颗完全同款：常态官方灰（--secondary 底 + --foreground 的浅色爪印），
  //    hover / :active 亮一下家族黄；点开设置面板由 togglePanel() 里的
  //    setToolbarButtonOpen() 挂 .xh-tb-open 保持家族黄，关面板自动退回官方灰。
  //    图案是 CSS mask + currentColor，底色一变爪印自动翻深墨，不用另配一套图标。
  //    门面身份靠「小黑爪印」图案本身，⛔ 不靠常亮底色抢视觉焦点。
  group.appendChild(btn);
  settingsGroupEl.before(group);
  window.__xhSettingsTbBtn = btn;
}

/**
 *  2026-11-10：设置面板里每一项的小字说明全部删掉，说明的唯一入口 = 顶栏「? 问号帮助」。
 *  - 不给 defId：打开「设置项说明」专题首页（右上角「? 全部说明」）。
 *  - 给 defId：打开专题后自动滚到该项并高亮（每项名字后面的小圆「?」）。
 *   帮助浮窗 z-index 已提到 10001（在设置面板 9999 之上），所以**不关设置面板**，
 *     避免用户把顶栏「XiaoHei」按钮藏起来后面板叫不回来。
 *  兼容兜底：旧版帮助没有 openSettings 时退到 openTopic / open，绝不静默没反应。
 */
function openSettingHelp(defId) {
  try {
    const h = window.XHHelp;
    if (h && typeof h.openSettings === "function") return h.openSettings(defId);
    if (h && typeof h.openTopic === "function") return h.openTopic("settings");
    if (h && typeof h.open === "function") return h.open();
  } catch (e) { /* 帮助扩展还没加载：不阻断设置面板 */ }
  return false;
}

// 悬停浮窗：设置项「i」信息图标，鼠标放上去直接浮出该项的说明（不再跳问号帮助）。
let _xhTipEl = null;
let _xhTipDefs = null;
let _xhTipSticky = false;

function hideXHSettingTip() {
  if (_xhTipEl && _xhTipEl.parentNode) _xhTipEl.remove();
  _xhTipEl = null; _xhTipSticky = false;
}
function showXHSettingTip(def, el) {
  hideXHSettingTip();
  if (!def || !def.description) return;
  const C = colors();
  const tip = document.createElement("div");
  tip.style.cssText =
    "position:fixed;z-index:10000;max-width:300px;max-height:220px;overflow:auto;" +
    "padding:10px 12px;border-radius:8px;border:1px solid " + C.BORDER +
    ";background:" + C.SURFACE + ";color:" + C.TEXT +
    ";box-shadow:0 6px 20px rgba(0,0,0,.35);" +
    "font-size:13px;line-height:1.5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;pointer-events:none;";
  const h = document.createElement("div");
  h.style.cssText = "font-weight:700;margin-bottom:4px;color:" + C.PRIMARY + ";";
  h.textContent = def.name;
  const p = document.createElement("div");
  p.textContent = def.description;
  tip.appendChild(h); tip.appendChild(p);
  document.body.appendChild(tip);
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = r.right + 8;
  if (left + tw > window.innerWidth - 8) left = r.left - tw - 8;
  if (left < 8) left = 8;
  let top = r.top + r.height / 2 - th / 2;
  if (top < 8) top = 8;
  if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
  tip.style.left = left + "px";
  tip.style.top = top + "px";
  _xhTipEl = tip;
}
function toggleXHSettingTip(def, el) {
  if (_xhTipEl && _xhTipSticky) { hideXHSettingTip(); return; }
  showXHSettingTip(def, el);
  _xhTipSticky = true;
  // 点浮窗之外的任何地方关闭（触屏友好）
  setTimeout(() => {
    document.addEventListener("mousedown", function closeOnce(ev) {
      if (_xhTipEl && !_xhTipEl.contains(ev.target) && ev.target !== el && !el.contains(ev.target)) {
        hideXHSettingTip();
        document.removeEventListener("mousedown", closeOnce, true);
      }
    }, true);
  }, 0);
}

// ----------------------------- 面板 -----------------------------
function buildPanel() {
  const C = colors();
  const root = document.createElement("div");
  root.id = "xh-sp-root";
  root.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;" +
    "background:rgba(0,0,0,.45);font-family:-apple-system,Segoe UI,Roboto,sans-serif;";
  // 图标助手：走自家图标库（window.XH_iconHTML），color:current 继承文字色
  const xhIco = (name) => (typeof window !== "undefined" && typeof window.XH_iconHTML === "function")
    ? window.XH_iconHTML(name, { size: 14, color: "current" }) : "";

  root.innerHTML =
    '<div id="xh-sp-box" style="width:min(640px,92vw);max-height:86vh;background:' + C.SURFACE +
    ";border:1px solid " + C.BORDER + ";border-radius:12px;display:flex;flex-direction:column;overflow:hidden;color:" + C.TEXT + ';">' +
    '  <div id="xh-sp-head" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid ' + C.BORDER + ';">' +
    //  2026-10-28：去掉标题里的  齿轮 emoji —— 顶栏入口已改成「XiaoHei」文字，
    //    面板标题再挂齿轮就跟外边对不上（用户：「跟外边那个图标要一致，名字要一致」）。
    //  标题只保留「XiaoHei 设置」，前面的 XiaoHei 徽章已按用户要求移除。
    //  2026-11-17：标题跟随当前配色预设（CSS 变量实时生效，切预设无需重建面板头）。
    //    用 --xh-accent-light（各预设的亮一档主色）而非 --xh-primary：深蓝/藏青主色偏暗，
    //    直接当深底上的标题字会发闷，亮一档才清晰；fallback 经典金。
    '    <span style="font-weight:700;font-size:15px;letter-spacing:.5px;color:var(--xh-accent-light,var(--xh-primary,#E8A33C));">XiaoHei 设置</span>' +
    //  2026-11-10：标题后面那行「（与 ComfyUI 原生设置同步）」也是小字 ⇒ 一并去掉。
    //    详细说明的唯一入口改成右上角「? 全部说明」（跳问号帮助的「设置项说明」专题）。
    '    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">' +
    '      <button id="xh-sp-help" style="height:28px;padding:0 12px;border-radius:6px;border:1px solid ' + C.BORDER + ';background:transparent;color:' + C.TEXT + ';cursor:pointer;display:inline-flex;align-items:center;gap:5px;" title="看全部设置项的完整说明（打开问号帮助）">' + xhIco("circle-help") + ' 全部说明</button>' +
    '      <button id="xh-sp-theme" style="height:28px;padding:0 10px;border-radius:6px;border:1px solid ' + C.BORDER + ';background:transparent;color:' + C.TEXT + ';cursor:pointer;font-size:14px;line-height:1;" title="主题：跟随 ComfyUI（点击切换：跟随 / 深色 / 浅色）"></button>' +
    '      <button id="xh-sp-close" style="height:28px;padding:0 12px;border-radius:6px;border:1px solid ' + C.BORDER + ';background:transparent;color:' + C.TEXT + ';cursor:pointer;">关闭</button>' +
    '    </div>' +
    "  </div>" +
    '  <div id="xh-sp-body" style="overflow:auto;padding:8px 16px 16px;"></div>' +
    "</div>";
  document.body.appendChild(root);

  // 主题切换按钮逻辑（设置面板自己管理主题，不依赖 Help Browser）
  const themeBtn = root.querySelector("#xh-sp-theme");
  function updateThemeBtn() {
    const m = localStorage.getItem(LS_KEY_THEME) || "auto";
    if (m === "dark")        { themeBtn.innerHTML = xhIco("moon");    themeBtn.title = "当前：暗色主题（点击切亮色）"; }
    else if (m === "light")  { themeBtn.innerHTML = xhIco("sun");     themeBtn.title = "当前：亮色主题（点击切自动）"; }
    else                     { themeBtn.innerHTML = xhIco("monitor"); themeBtn.title = "当前：跟随系统（点击切暗色）"; }
  }
  updateThemeBtn();
  themeBtn.onclick = () => { cycleThemeMode(); updateThemeBtn(); };
  // 切主题时重建设置面板 DOM（因为 buildPanel 用 colors() 写死了 inline style）
  document.addEventListener("xh-help-theme-change", () => {
    // 删掉旧面板，下次打开或保持打开都会用新 CSS 变量重建
    const wasOpen = STATE.open;
    if (STATE.panel) { STATE.panel.remove(); STATE.panel = null; }
    if (wasOpen) { buildPanel(); togglePanel(true); }
  });

  root.addEventListener("click", (e) => {
    if (e.target === root) togglePanel(false);
  });
  root.querySelector("#xh-sp-close").onclick = () => togglePanel(false);
  root.querySelector("#xh-sp-help").onclick = () => openSettingHelp();
  STATE.panel = root;
}

function togglePanel(force) {
  if (!STATE.panel) buildPanel();
  STATE.open = typeof force === "boolean" ? force : !STATE.open;
  STATE.panel.style.display = STATE.open ? "flex" : "none";
  // 顶栏按钮同步：开着 = 亮家族黄，关着 = 回常态（统一真源，三颗按钮同一套）
  try {
    const tb = window.__xhSettingsTbBtn || document.querySelector("[data-xh-tb-settings]");
    setToolbarButtonOpen(tb, !!STATE.open);
  } catch (e) { /* 忽略 */ }
  if (STATE.open) renderBody();
}

/** 生成单个控件（按 type 分支）。 */
function genCtrl(def, cur) {
  const C = colors();
  if (def.type === "boolean") {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:13px;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!cur;
    cb.style.cssText = "width:16px;height:16px;accent-color:" + C.PRIMARY + ";cursor:pointer;";
    const span = document.createElement("span");
    span.textContent = cb.checked ? "开" : "关";
    span.style.cssText = "min-width:18px;opacity:.8;";
    cb.onchange = () => { applySetting(def, cb.checked); span.textContent = cb.checked ? "开" : "关"; };
    wrap.appendChild(cb);
    wrap.appendChild(span);
    return wrap;
  }
  if (def.type === "combo" && Array.isArray(def.options)) {
    const sel = document.createElement("select");
    //  底色改用 C.INPUT_BG（跟着主题）：写死深色会让 light 主题变成「深底 + 深墨字」。
    sel.style.cssText = "height:28px;min-width:150px;background:" + C.INPUT_BG + ";color:" + C.TEXT + ";border:1px solid " + C.BORDER + ";border-radius:6px;padding:0 6px;font-size:13px;";
    def.options.forEach((o) => {
      const op = document.createElement("option");
      op.value = o; op.textContent = o;
      //  展开后的下拉项**必须显式给底色和字色**：
      //    option 会继承 select 的字色（暗色主题下是近白 #e8e8e8），
      //    但展开的下拉面板由**浏览器/系统**绘制（通常白底），不吃 select 的 background
      //    ⇒ 白底 + 近白字 = 一点开就什么都看不见（用户 2026-10-29 报的就是这个）。
      //    Windows 上 option 的 background/color 是可控的，这里显式成对设上。
      op.style.background = C.INPUT_BG;
      op.style.color = C.TEXT;
      if (o === cur) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = () => applySetting(def, sel.value);
    return sel;
  }
  if (def.type === "slider" && def.attrs) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:8px;";
    const r = document.createElement("input");
    r.type = "range";
    r.min = def.attrs.min; r.max = def.attrs.max; r.step = def.attrs.step || 1;
    r.value = cur;
    r.style.cssText = "width:160px;accent-color:" + C.PRIMARY + ";";
    const num = document.createElement("span");
    num.style.cssText = "min-width:42px;text-align:right;font-size:12px;opacity:.85;font-variant-numeric:tabular-nums;";
    num.textContent = cur;
    r.oninput = () => { num.textContent = r.value; applySetting(def, Number(r.value)); };
    wrap.appendChild(r); wrap.appendChild(num);
    return wrap;
  }
  // text（含颜色 hex 的情况加一个原生取色器联动）。
  //  用 def.isColor 显式标记（见 SETTING_DEFS 的 图案颜色 / 执行发光颜色），
  //  不再只看 defaultValue 是不是 6 位 hex —— 否则「执行发光颜色」默认空（=跟随连线色）会被误判成纯文本、丢掉取色器。
  const isColor = !!def.isColor || (typeof def.defaultValue === "string" && /^#[0-9a-fA-F]{6}$/.test(def.defaultValue));
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:inline-flex;align-items:center;gap:8px;";
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = cur == null ? "" : cur;
  //  同 select：底色走 C.INPUT_BG，别写死深色（light 主题会变深底深字）。
  inp.style.cssText = "height:28px;min-width:170px;background:" + C.INPUT_BG + ";color:" + C.TEXT + ";border:1px solid " + C.BORDER + ";border-radius:6px;padding:0 8px;font-size:13px;";
  inp.onchange = () => applySetting(def, inp.value);
  wrap.appendChild(inp);
  if (isColor) {
    const cp = document.createElement("input");
    cp.type = "color";
    // 默认值是空（如执行发光颜色=跟随连线色）时，色块先显示一个占位色，避免原生取色器退化成纯黑；
    // 真值仍由 inp 里的 hex 决定，不影响「留空=跟随」的语义。
    const _colorFallback = /^#[0-9a-fA-F]{6}$/.test(def.defaultValue) ? def.defaultValue : "#00e5ff";
    cp.value = /^#[0-9a-fA-F]{6}$/.test(inp.value) ? inp.value : _colorFallback;
    cp.style.cssText = "width:30px;height:28px;border:1px solid " + C.BORDER + ";border-radius:6px;background:transparent;cursor:pointer;padding:2px;";
    cp.oninput = () => { inp.value = cp.value; applySetting(def, cp.value); };
    inp.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(inp.value)) cp.value = inp.value; };
    wrap.appendChild(cp);
  }
  return wrap;
}

// ════════════════════════════════════════════════════════════════════════
//  配色方案选择器（6 预设 + 自定义，与明暗正交；2026-11-19 默认松绿）
//    色值真源在 xh_theme_presets.js（window.XH_THEME）；这里只渲染 + 绑定。
//    所有色号都从 XH_THEME.PRESETS 读，不在这里写死颜色。
// ════════════════════════════════════════════════════════════════════════
const _xhPaletteIco = (name, size) =>
  (typeof window !== "undefined" && typeof window.XH_iconHTML === "function")
    ? window.XH_iconHTML(name, { size: size || 14, color: "current" }) : "";

function renderPaletteBlock(C) {
  const T = (typeof window !== "undefined") ? window.XH_THEME : null;
  if (!T) return "";
  const active = T.getActiveId();
  const order = ["pine", "navy", "qqblue", "graphite", "burgundy", "iris"];
  let cells = "";
  order.forEach((id) => {
    const p = T.PRESETS[id];
    if (!p) return;
    const on = id === active;
    const main = p.dark.main, title = p.dark.title, light = p.dark.light || p.dark.main;
    cells +=
      //  data-xh-icon-done=1：豁免 xh_icon_fill.js 全页 sweep（它见中文+前导空白就清空
      //    textContent 重排图标，会把色卡里的色条 span 一起抹掉 ⇒ 色卡只剩文字）。
      '<button type="button" class="xh-sp-pal-cell" data-pal="' + id + '" data-xh-icon-done="1" ' +
      ' title="' + esc(p.name) + '" ' +
      ' style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 3px;' +
      'cursor:pointer;border-radius:8px;border:' + (on ? '2px solid ' + C.PRIMARY : '1px solid ' + C.BORDER) + ';' +
      'background:' + (on ? 'color-mix(in srgb,' + C.PRIMARY + ' 12%,transparent)' : 'transparent') + ';">' +
      //  色卡 = 上下分层（2026-11-26 用户从 4 个候选里选 C）：
      //    上 10px 深色标题条（title）＋ 下 16px 主色块（main）＋ 主色块里一小段亮色（light）。
      //    原方案是「一块主色 + 偏下一条深色横杠」，22px 太矮、横杠像瑕疵，已废弃。
      '  <span style="width:100%;height:26px;border-radius:5px;overflow:hidden;display:block;">' +
      '    <span style="display:block;height:10px;background:' + title + ';"></span>' +
      '    <span style="display:flex;align-items:center;height:16px;padding:0 5px;box-sizing:border-box;background:' + main + ';">' +
      '      <span style="display:block;width:26%;height:4px;border-radius:2px;background:' + light + ';"></span>' +
      '    </span>' +
      '  </span>' +
      '  <span style="font-size:12px;color:' + C.TEXT + ';font-weight:' + (on ? '700' : '500') + ';">' + esc(p.name) + '</span>' +
      '</button>';
  });
  const customOn = active === "custom";
  const customMain = (function () {
    try { const j = JSON.parse(localStorage.getItem(T.LS_CUSTOM) || "null"); return (j && j.main) || "#6F00FF"; }
    catch (e) { return "#6F00FF"; }
  })();
  // 自定义也有「标题条」：公式与 xh_theme_presets.js 的 buildScheme 一致（title = main × 0.30），
  //   ⛔ 别在这里改系数，否则色卡预览和真实应用后的标题栏对不上。
  const customTitle = _xhShadeHex(customMain, 0.30);
  cells +=
    '<button type="button" class="xh-sp-pal-cell" data-pal="custom" title="自定义色板" data-xh-icon-done="1" ' +
    ' style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 3px;' +
    'cursor:pointer;border-radius:8px;border:' + (customOn ? '2px solid ' + C.PRIMARY : '1px dashed ' + C.BORDER) + ';' +
    'background:' + (customOn ? 'color-mix(in srgb,' + C.PRIMARY + ' 12%,transparent)' : 'transparent') + ';">' +
    //  2026-11-26 起与预设格统一成「上深下彩」：上 10px 用 main×0.30 的深色，下 16px 主色 + 滴管。
    //    滴管按 WCAG 取对比色（不再是灰底+彩图标）。
    '  <span style="width:100%;height:26px;border-radius:5px;overflow:hidden;display:block;">' +
    '    <span style="display:block;height:10px;background:' + customTitle + ';"></span>' +
    '    <span style="display:flex;align-items:center;justify-content:center;height:16px;background:' + customMain + ';">' +
    '      <span style="display:inline-flex;color:' + (window.XH_THEME ? window.XH_THEME.pickOn(customMain) : '#fff') + ';">' + _xhPaletteIco("pipette", 12) + '</span>' +
    '    </span>' +
    '  </span>' +
    '  <span style="font-size:12px;color:' + C.TEXT + ';font-weight:' + (customOn ? '700' : '500') + ';">自定义</span>' +
    '</button>';

  return '<div style="margin-top:6px;padding:10px 12px;border-radius:9px;border:1px solid ' + C.BORDER + ';' +
    'background:color-mix(in srgb,' + C.PRIMARY + ' 6%,transparent);">' +
    '  <div style="display:flex;align-items:center;gap:6px;margin-bottom:9px;color:' + C.TEXT + ';font-weight:700;font-size:13px;">' +
    '    <span style="display:inline-flex;color:' + C.PRIMARY + ';">' + _xhPaletteIco("palette", 15) + '</span>配色方案' +
    '    <span style="margin-left:auto;font-weight:400;font-size:11px;color:' + C.SUB + ';">选一个，全家族一起变</span>' +
    '  </div>' +
    '  <div style="display:flex;gap:7px;">' + cells + '</div>' +
    '  <div id="xh-sp-custom-row" style="' + (customOn ? '' : 'display:none;') + 'margin-top:10px;padding-top:9px;border-top:1px solid ' + C.BORDER + ';display:' + (customOn ? 'flex' : 'none') + ';align-items:center;gap:10px;flex-wrap:wrap;">' +
    '    <span style="font-size:12px;color:' + C.TEXT + ';">主色</span>' +
    '    <input type="color" id="xh-sp-custom-color" value="' + esc(customMain) + '" style="width:38px;height:28px;padding:0;border:1px solid ' + C.BORDER + ';border-radius:5px;background:transparent;cursor:pointer;">' +
    '    <span style="font-size:11px;color:' + C.SUB + ';">标题栏 / 按钮 / 高亮 / 字色自动配好，实时预览</span>' +
    '    <button type="button" id="xh-sp-custom-apply" style="height:28px;padding:0 12px;border-radius:6px;border:1px solid ' + C.PRIMARY + ';background:' + C.PRIMARY + ';color:' + (window.XH_THEME ? window.XH_THEME.pickOn(mainColorSafe(C.PRIMARY)) : '#1c1c1c') + ';cursor:pointer;font-size:12px;">应用</button>' +
    '  </div>' +
    '</div>';
}
function mainColorSafe(hex) { return /^#[0-9a-f]{6}$/i.test(String(hex)) ? hex : "#E8A33C"; }
// 与 xh_theme_presets.js 的 darken() 同一公式（逐通道 × f），只给自定义色卡算标题条色。
//  ⛔ 别换成 color-mix：系数一偏，色卡预览就和应用后的真实标题栏对不上。
function _xhShadeHex(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "#171718";
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function bindPaletteBlock() {
  const body = document.querySelector("#xh-sp-body");
  if (!body) return;
  const T = (typeof window !== "undefined") ? window.XH_THEME : null;
  if (!T) return;
  body.querySelectorAll(".xh-sp-pal-cell").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-pal");
      if (id === "custom") {
        // 展开自定义行；若还没选过自定义色，先用当前主色打底
        const row = body.querySelector("#xh-sp-custom-row");
        if (row) row.style.display = "flex";
        return;
      }
      T.setPreset(id);
      renderBody();
    };
  });
  const applyBtn = body.querySelector("#xh-sp-custom-apply");
  if (applyBtn) {
    applyBtn.onclick = () => {
      const input = body.querySelector("#xh-sp-custom-color");
      if (input && T.setCustom(input.value)) renderBody();
    };
  }
}

function renderBody() {
  const body = document.querySelector("#xh-sp-body");
  if (!body) return;
  const C = colors();
  const defs = (typeof window !== "undefined" && window.XH_SETTING_DEFS) || [];
  if (!defs.length) {
    body.innerHTML = '<div style="padding:24px;color:#8a8a8a;">未找到XiaoHei 设置项定义（xh_animated_links.js 未加载？）</div>';
    return;
  }
  // 按 group 聚合
  const groups = {};
  defs.forEach((d) => {
    const g = d.group || "其他";
    if (!groups[g]) groups[g] = [];
    groups[g].push(d);
  });

  //  2026-10-28 用户要求：「我希望把这设置放在整个这个XiaoHei 设置顶部，这三个设置开不开放放在顶部」。
  //   ⇒ 「顶栏按钮」组（开不开放三个顶栏入口）**排第一**，一打开面板第一眼就看到。
  //   实现 = 重排 Object.keys 的顺序（JS 对象按插入序遍历），不改任何定义来源。
  const TOP_FIRST = "顶栏按钮";
  let groupKeys = Object.keys(groups);
  if (groupKeys.includes(TOP_FIRST)) {
    groupKeys = [TOP_FIRST].concat(groupKeys.filter((k) => k !== TOP_FIRST));
  }

  // 分组标题前缀图标（走自家图标库；color:current 继承标题色，主题切换自动跟着变）
  const XH_GROUP_ICONS = {
    "顶栏按钮": "sliders-horizontal",
    "图案与文字": "type",
    "连线": "workflow",
  };
  const xhGroupIco = (grp) => {
    const name = XH_GROUP_ICONS[grp] || "settings";
    try {
      return (typeof window !== "undefined" && typeof window.XH_iconHTML === "function")
        ? window.XH_iconHTML(name, { size: 14, color: "current" }) : "";
    } catch (e) { return ""; }
  };

  //  配色方案选择器：6 预设 + 自定义，与明暗正交（默认松绿）。
  let html = renderPaletteBlock(C);
  groupKeys.forEach((g) => {
    // 分组标题条：深紫主题下用极淡的紫底 + 主色左边框；浅色主题下用淡紫底。
    //  别写死半透明黄 —— 浅色主题下会变成一块脏兮兮的淡黄饼。
    html += '<div style="margin-top:14px;padding:6px 10px;border-radius:6px;background:var(--xh-title-bg,rgba(255,255,255,.05));' +
      'border-left:2px solid ' + C.PRIMARY + ';' +
      'color:' + C.TEXT + ';font-weight:700;font-size:13px;letter-spacing:.3px;">' +
      '<span style="display:inline-flex;align-items:center;margin-right:6px;opacity:.92;">' + xhGroupIco(g) + '</span>' +
      esc(g) + "</div>";
    groups[g].forEach((def) => {
      //  2026-11-10 用户要求：只留功能主名字 + 右侧控件。
      //    名字后面的「i」信息图标：悬停直接浮出该项说明小浮窗（不再跳问号帮助）。
      //    description 仍是 SETTING_DEFS 里的唯一真源，悬停浮窗直接读它渲染，不重复维护。
      //  2026-11-19 用户要求：顶栏按钮那几行名称前放家族图库对应图案（行首一眼认出是哪颗按钮）。
      //    def.icon 是家族图库语义名，由 BUTTONS push 进来；没有 icon 的项保持原样（纯文字）。
      //    data-xh-icon-done=1 豁免 xh_icon_fill.js 全页 sweep（中文+图案混排会被清空重排）。
      const rowIco = def.icon
        ? '<span data-xh-icon-done="1" style="display:inline-flex;flex:none;margin-right:8px;opacity:.9;vertical-align:-2px;color:' + C.PRIMARY + ';">' +
          _xhPaletteIco(def.icon, 15) + '</span>'
        : '';
      html +=
        '<div style="display:flex;align-items:center;gap:12px;padding:8px 10px;border-bottom:1px solid ' + C.BORDER + ';">' +
        '  <div style="flex:1;min-width:0;font-weight:600;font-size:14px;" data-xh-icon-done="1">' + rowIco + esc(def.name) +
        '    <button type="button" data-xh-help="' + esc(def.id) + '" ' +
        '      style="margin-left:6px;width:18px;height:18px;padding:0;border:none;background:transparent;color:' + C.TEXT + ';cursor:pointer;opacity:.55;display:inline-flex;align-items:center;justify-content:center;">' +
        '      ' + (typeof window !== "undefined" && typeof window.XH_iconHTML === "function"
          ? window.XH_iconHTML("信息", { size: 14, color: "current" })
          : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>') + '</button>' +
        "  </div>" +
        '  <div style="flex:none;display:flex;align-items:center;min-height:28px;" data-ctrl="' + esc(def.id) + '"></div>' +
        "</div>";
    });
  });
  body.innerHTML = html;

  // 2026-11-17 配色方案选择器事件绑定
  try { bindPaletteBlock(); } catch (e) { console.error("[XiaoHei] 配色选择器绑定失败", e); }

  // 逐个注入控件（DOM 操作，避免事件被字符串化丢失）
  defs.forEach((def) => {
    const holder = body.querySelector('[data-ctrl="' + CSS.escape(def.id) + '"]');
    if (holder) holder.appendChild(genCtrl(def, getVal(def)));
  });
  // 每项名字后的「i」信息图标：悬停直接浮出该项的说明小浮窗（不再跳问号帮助）。
  //  用 data 属性直接读 id（含点号），别拿它拼 CSS 选择器。
  if (!_xhTipDefs) { _xhTipDefs = {}; defs.forEach((d) => { _xhTipDefs[d.id] = d; }); }
  body.querySelectorAll("[data-xh-help]").forEach((b) => {
    const def = _xhTipDefs[b.getAttribute("data-xh-help")];
    if (!def) return;
    b.addEventListener("mouseenter", () => showXHSettingTip(def, b));
    b.addEventListener("mouseleave", () => { if (!_xhTipSticky) hideXHSettingTip(); });
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleXHSettingTip(def, b); });
  });
}

// CSS.escape 兜底（极老版本可能没有）
if (typeof CSS === "undefined" || typeof CSS.escape !== "function") {
  window.CSS = window.CSS || {};
  window.CSS.escape = (s) => String(s).replace(/[^a-zA-Z0-9_\u00a0-\uffff-]/g, (c) => "\\" + c);
}

app.registerExtension({
  name: NS,
  setup() {
    mountToolbarButton();
    // auto 模式下跟着官方主题走（用户切 ComfyUI 主题 ⇒ XiaoHei 面板同步换色）
    try { watchOfficialTheme(); } catch (e) { /* 忽略 */ }
  },
});

//  2026-10-29：对外开一个「把 XiaoHei 设置面板叫出来」的入口。
//    起因（用户原话）：「我点那个关闭了，关闭之后我就不知道怎么把它打开了……
//    所以这里就需要一个跟外面同步的，如果外面不知道怎么办，我就在这里找啊，再把它给打开。」
//    ⇒ 顶栏「XiaoHei」按钮一旦在设置里被藏起来，就再没有别的路能打开本面板；
//      官方设置面板里的那颗「打开 XiaoHei 设置面板」按钮走的就是这个函数。
if (typeof window !== "undefined") {
  window.XH_openSettingsPanel = (open) => {
    try { togglePanel(open === false ? false : true); return true; }
    catch (e) { return false; }
  };
}
