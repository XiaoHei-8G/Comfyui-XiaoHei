// XiaoHei 家族 · 主题预设（配色色相 / 与明暗正交）
// ════════════════════════════════════════════════════════════════════════
// 6 套预设 + 1 自定义色板。选一个 ⇒ 写一组 --xh-* CSS 变量 ⇒ 全包联动。
// 明暗（跟随/深色/浅色，LS=XH.Help.theme）与本模块正交：
//   预设管"什么色相"，明暗管"深壳还是浅壳"；每套预设自带 dark/light 两版明度。
//
// 零 import：本模块只依赖 window/localStorage/document，避免与 xh_ui_kit.js
// 循环依赖（后者会 import 本模块的取色函数）。ComfyUI 按字母序加载 js/*.js，
// 本文件加载晚于 xh_ui_kit/xh_brand/xh_settings_panel，但那几处都是**运行时**
// 读 window.XH_THEME，故时序安全。
//
// 契约：变量名一个不改（--xh-primary / --xh-brand / --xh-rest / --pix-acc …），
// 只改注入的值。粉丝手动选色的节点（node.color 有值）不受主题切换影响。

(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var LS_PRESET = "XH.Theme.preset";   // 2026-11-19 起默认 pine（松绿），新粉丝拿到就是松绿
  var LS_CUSTOM = "XH.Theme.custom";   // JSON: { "main": "#RRGGBB" }
  var LS_MODE = "XH.Help.theme";       // 明暗开关（settings_panel.js 的既有键）
  var EVT = "xh-theme-preset-change";

  // ── 颜色工具 ──────────────────────────────────────────────────────────
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hex2rgb(hex) {
    var m = String(hex || "").replace("#", "");
    if (m.length === 3) m = m.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(m)) return null;
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }
  function rgb2hex(r, g, b) {
    return "#" + [r, g, b].map(function (x) {
      return clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
    }).join("");
  }
  function darken(hex, f) {
    var c = hex2rgb(hex); if (!c) return hex;
    return rgb2hex(c[0] * f, c[1] * f, c[2] * f);
  }
  function lighten(hex, f) {
    var c = hex2rgb(hex); if (!c) return hex;
    return rgb2hex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f);
  }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b); if (!x || !y) return a;
    return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  function relLum(hex) {
    var c = hex2rgb(hex); if (!c) return 0;
    var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function contrast(a, b) {
    var la = relLum(a), lb = relLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // WCAG：主色上该用深墨字还是白字（取对比度高的一边，底线 4.5:1）
  function pickOn(bg) {
    if (!hex2rgb(bg)) return "#1c1c1c";
    return contrast(bg, "#1c1c1c") >= contrast(bg, "#ffffff") ? "#1c1c1c" : "#ffffff";
  }

  // ── 6 套预设（每套 dark/light 两版明度）────────────────────────────────
  //  2026-11-19 用户拍板：经典黑金 / 深蓝 / 暖灰金三个删掉，换 QQ蓝 / 石墨灰 /
  //    勃艮第 / 鸢尾紫；**默认 = 松绿**（新粉丝拿到手就是松绿）。
  //  main   = --xh-primary 瞬时信号 / 按钮底 / 高亮
  //  title  = 节点标题栏 + --xh-rest 常态主操作底
  //  light  = 高亮浅版（描边、图标点亮）
  //  deep   = 浅色主题标题栏/深一档主色
  //  ⚠ 所有 main 都经 WCAG 校验：按钮字色由 pickOn() 自动取对比度 ≥4.5 的一边。
  var PRESETS = {
    pine: {
      name: "松绿",
      dark:  { main: "#2E7D5B", title: "#0D3527", light: "#52B788", deep: "#236B4A" },
      light: { main: "#236B4A", title: "#124A36", light: "#2E7D5B", deep: "#1B5338" },
    },
    navy: {
      name: "藏青",
      dark:  { main: "#2E5C8A", title: "#12263F", light: "#6B9AC4", deep: "#224A72" },
      light: { main: "#224A72", title: "#12263F", light: "#2E5C8A", deep: "#1A3B5C" },
    },
    qqblue: {
      name: "QQ蓝",
      // 腾讯官方品牌书 QQ Blue = #12B7F5 (RGB 18/183/245, PANTONE 2995 C)。
      //  亮蓝白字仅 2.3:1 ⇒ pickOn 自动切深字 7.4:1；浅色版压深到 #0879A8（白字 4.87:1）。
      dark:  { main: "#12B7F5", title: "#0A6E9C", light: "#6FD4FF", deep: "#0A86B8" },
      light: { main: "#0879A8", title: "#0A6E9C", light: "#12B7F5", deep: "#07688F" },
    },
    graphite: {
      name: "石墨灰",
      // Tailwind slate-600，冷中性灰，VS Code / Figma 深色 UI 同系，久看不累。
      dark:  { main: "#475569", title: "#1E293B", light: "#94A3B8", deep: "#334155" },
      light: { main: "#334155", title: "#1E293B", light: "#475569", deep: "#1E293B" },
    },
    burgundy: {
      name: "勃艮第",
      // Burgundy 酒红，比正红沉稳，出版 / 学术 / 设计圈的高级强调色。
      dark:  { main: "#8C2F39", title: "#4A1E24", light: "#C46874", deep: "#6E222B" },
      light: { main: "#6E222B", title: "#4A1E24", light: "#8C2F39", deep: "#52181E" },
    },
    iris: {
      name: "鸢尾紫",
      // 靛紫，JetBrains 系 IDE 常用强调紫，比纯紫专业不妖。
      dark:  { main: "#6154C7", title: "#2B2559", light: "#9B8FE8", deep: "#4A3FA0" },
      light: { main: "#4A3FA0", title: "#2B2559", light: "#6154C7", deep: "#3A316E" },
    },
  };

  function readCustom() {
    try {
      var j = JSON.parse(localStorage.getItem(LS_CUSTOM) || "null");
      if (j && hex2rgb(j.main)) return j.main;
    } catch (e) {}
    return null;
  }
  function customPreset() {
    var main = readCustom() || "#6F00FF";
    return {
      name: "自定义",
      dark:  { main: main, title: darken(main, 0.30), light: lighten(main, 0.28), deep: darken(main, 0.78) },
      light: { main: darken(main, 0.78), title: darken(main, 0.30), light: main, deep: darken(main, 0.86) },
    };
  }
  function getPreset(id) {
    if (id === "custom") return customPreset();
    return PRESETS[id] || PRESETS.pine;
  }
  function getActiveId() {
    try {
      var v = localStorage.getItem(LS_PRESET);
      if (v === "custom" || PRESETS[v]) return v;
    } catch (e) {}
    // 2026-11-19：新粉丝无存档 ⇒ 松绿（不再是已删除的经典黑金）
    return "pine";
  }

  // 明暗模式：与 settings_panel.js 的 XH.Help.theme 同一份真源
  function isLightMode() {
    try {
      var m = localStorage.getItem(LS_MODE) || "auto";
      if (m === "light") return true;
      if (m === "dark") return false;
      if (document.body && document.body.classList) {
        if (document.body.classList.contains("xh-light")) return true;
        if (document.body.classList.contains("xh-dark")) return false;
      }
      var v = (getComputedStyle(document.documentElement).getPropertyValue("--node-component-header-surface") || "").trim();
      if (!v) return false;
      var mm = /rgba?\(([^)]+)\)/.exec(v);
      if (!mm) return /^#e|^#f/i.test(v);
      var p = mm[1].split(",").map(function (x) { return parseFloat(x); });
      return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 > 0.5;
    } catch (e) { return false; }
  }

  var state = { id: "pine", light: false, colors: null };

  // 写出当前生效的一整组 CSS 变量（变量名一律不动）
  function apply() {
    var id = getActiveId();
    var light = isLightMode();
    var p = getPreset(id);
    var s = light ? p.light : p.dark;
    var onMain = pickOn(s.main);
    var set = function (k, v) { try { document.documentElement.style.setProperty(k, v); } catch (e) {} };

    set("--xh-primary", s.main);
    set("--xh-on-primary", onMain);
    set("--xh-on-primary-dim", pickOn(mix(s.main, light ? "#ffffff" : "#1c1c1c", 0.68)));
    set("--xh-brand", s.main);
    set("--xh-brand-tx", onMain);
    set("--xh-brand-text", light ? s.deep : s.light);
    set("--xh-rest", s.title);
    set("--xh-on-rest", "#ffffff");
    set("--xh-rest-bd", "rgba(255,255,255,.28)");
    set("--xh-accent-light", s.light);
    // 复刻节点共用的 accent 契约变量（名字是契约，只换值）
    set("--pix-acc", s.main);
    //  标题**字**色：预设可指定（如黑底金字）；留空 ⇒ paintVueHeader 自动黑白。
    //    2026-11-19 起默认松绿，6 套预设都不指定 ⇒ 一律走自动黑白。
    if (s.titleFg) set("--xh-title-fg", s.titleFg);
    else try { document.documentElement.style.removeProperty("--xh-title-fg"); } catch (e) {}

    state = {
      id: id,
      light: light,
      colors: {
        main: s.main, title: s.title, light: s.light, deep: s.deep,
        onMain: onMain,
        titleFg: s.titleFg || null,
        lightMain: p.light.main, darkMain: p.dark.main,
        lightTitle: p.light.title, darkTitle: p.dark.title,
      },
    };
    // 2026-11-17：xh_brand.js 监听的是 document，这里必须 dispatch 到 document
    //（window 也发一份，兼容别的监听方）。之前只发 window ⇒ 节点标题栏不刷新。
    try { document.dispatchEvent(new CustomEvent(EVT, { detail: state })); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: state })); } catch (e) {}
    return state;
  }

  function setPreset(id) {
    if (id !== "custom" && !PRESETS[id]) return false;
    try { localStorage.setItem(LS_PRESET, id); } catch (e) {}
    apply();
    return true;
  }
  function setCustom(main) {
    if (!hex2rgb(main)) return false;
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify({ main: main })); } catch (e) {}
    try { localStorage.setItem(LS_PRESET, "custom"); } catch (e) {}
    apply();
    return true;
  }

  var API = {
    PRESETS: PRESETS,
    EVT: EVT,
    LS_PRESET: LS_PRESET,
    LS_CUSTOM: LS_CUSTOM,
    apply: apply,
    setPreset: setPreset,
    setCustom: setCustom,
    getActiveId: getActiveId,
    getActiveName: function () { return getPreset(getActiveId()).name; },
    isLightMode: isLightMode,
    colors: function () { return state.colors; },
    // 给 xh_ui_kit.js 的 XH_BRAND getter 用（保持品牌对象随预设变化）
    //  2026-11-19：兜底色跟默认预设松绿对齐，避免极端时序下闪一下金色。
    main: function () { return state.colors ? state.colors.main : "#2E7D5B"; },
    lightMain: function () { return state.colors ? state.colors.lightMain : "#236B4A"; },
    title: function () { return state.colors ? state.colors.title : "#0D3527"; },
    titleFg: function () { return state.colors ? state.colors.titleFg : null; },
    accentLight: function () { return state.colors ? state.colors.light : "#52B788"; },
    textDark: function () { return state.colors ? state.colors.light : "#52B788"; },
    textLight: function () { return state.colors ? state.colors.deep : "#236B4A"; },
    pickOn: pickOn,
    darken: darken, lighten: lighten, mix: mix,
  };
  // ── 原生控件 / 折叠箭头：只在家族节点内把官方 CSS 变量接到主题 ──────────
  // 2026-11-17：用户抽查分段表发现「自循环」蓝色开关和标题栏折叠小三角不跟主题。
  // 根因：Nodes 2.0 的布尔开关是 PrimeVue ToggleSwitch，轨道写 bg-primary（官方 --primary）；
  // 折叠三角是官方 NodeHeader 的 <i>，paintVueHeader() 会按背景对比度刷成灰/白。
  // 两者都不读 --xh-*。这里只作用域到 data-xh-family="1" 的节点，官方节点零影响。
  // 手动选过「节点按键颜色」的 .xh-has-accent 继续走 xh_node_toolbar.js 的 --xh-acc，主题不抢。
  var THEME_CONTROL_CSS = `
[data-xh-family="1"]:not(.xh-has-accent) {
  --primary: var(--xh-primary, #E8A33C);
  --color-primary: var(--xh-primary, #E8A33C);
  --primary-hover: var(--xh-accent-light, var(--xh-primary, #E8A33C));
  --primary-foreground: var(--xh-on-primary, #1c1c1c);
  --primary-fg: var(--xh-on-primary, #1c1c1c);
}
[data-xh-family="1"]:not(.xh-has-accent) [role="switch"][data-state="checked"] > span,
[data-xh-family="1"]:not(.xh-has-accent) [role="switch"][aria-checked="true"] > span,
[data-xh-family="1"]:not(.xh-has-accent) [role="switch"][data-state="checked"] > *,
[data-xh-family="1"]:not(.xh-has-accent) [role="switch"][aria-checked="true"] > * {
  background-color: var(--xh-primary, #E8A33C) !important;
  border-color: var(--xh-primary, #E8A33C) !important;
}
[data-xh-family="1"]:not(.xh-has-accent) [role="switch"][data-state="checked"] > span > span,
[data-xh-family="1"]:not(.xh-has-accent) [role="switch"][aria-checked="true"] > span > span {
  background-color: #ffffff !important;
}
[data-xh-family="1"] .lg-node-header [data-testid="node-collapse-button"] i {
  color: var(--xh-acc, var(--xh-accent-light, var(--xh-primary, #E8A33C))) !important;
  background-color: var(--xh-acc, var(--xh-accent-light, var(--xh-primary, #E8A33C))) !important;
}
[data-xh-family="1"] .lg-node-header [data-testid="node-collapse-button"] svg {
  color: var(--xh-acc, var(--xh-accent-light, var(--xh-primary, #E8A33C))) !important;
}
`;
  function installThemeControlCss() {
    try {
      if (typeof document === "undefined" || !document.head) return;
      var st = document.getElementById("xh-theme-native-controls");
      if (!st) {
        st = document.createElement("style");
        st.id = "xh-theme-native-controls";
        document.head.appendChild(st);
      }
      if (st.textContent !== THEME_CONTROL_CSS) st.textContent = THEME_CONTROL_CSS;
    } catch (e) {}
  }
  installThemeControlCss();

  window.XH_THEME = API;

  // 明暗切换后 settings_panel 会重发事件；重新按新明暗写深浅版（正交）
  try {
    document.addEventListener("xh-help-theme-change", function () { apply(); });
  } catch (e) {}
  // 启动即应用一次（读取粉丝已存的预设）
  apply();
})();
