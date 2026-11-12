//  XiaoHei · 设置面板「关于」徽章栏（纯前端扩展，不是节点）
//
// 本文件只负责**注册一个设置项**；徽章怎么画、文案怎么写、版本怎么取，
// 全在 web/xh_about_badges.mjs 里（唯一真源）。
// 同一份渲染还被 web/xh_help_browser.js 用在帮助窗口底部 +「XiaoHei 指南 → 交流反馈」专题页，
// ⇒ 三处永远是同一排，改一句文案三处同步。
//
//  2026-11-11 用户拍板：样子 1:1 学「提示词小助手」那排 —— 那叫 **Badge / 徽章**，
//    是 shields.io 的 flat 静态徽章：左半 label 带品牌 logo，右半彩色 message，
//    20px 高、3px 小圆角。但不联网：本地 CSS + 本地品牌 SVG + 本地二维码，离线秒开。
//  2026-11-11 第二轮：措辞要软 —— 微信「交流反馈」、交流群「找小黑帮忙」，
//     不写「扫码」「加群」（像要收钱 / 像下命令）。细节见 xh_about_badges.mjs 的 COPY。
//
//  category 三级：[扩展名, 分组, 项名]（同 xh_animated_links.js）。
//    第一级与「连线」同名 ⇒ 两组在同一个折叠面板下；sortOrder 让「关于」排最前。

import { renderBadgeRow, primeAbout } from "./xh_about_badges.mjs";

const { app } = window.comfyAPI.app;

const NS = "XH.About";

/**
 *  分组顺序**只由 `sortOrder` 决定**（2026-10-29 前端源码实证，别再信"注册顺序"）：
 *   `SettingDialog.vue:174-190`
 *     getGroupSortOrder(group) = 组内所有设置项 sortOrder 的**最大值**
 *     组间排序 = 该值**降序**；相等时 → `a.label.localeCompare(b.label)`（组名拼音升序）
 *     组内排序 = 各项 sortOrder 降序（同值 ⇒ 稳定排序，保持 flattenTree 出来的顺序）
 *   `treeUtil.ts:flattenTree` 用 `stack.pop()` ⇒ 取出来是**倒的**
 *     ⇒ 组内同 sortOrder 时：**最后注册的显示在最前**（这才是"看着像倒序"的真因）
 *
 *  想要的顺序（自上而下）：关于 → 外观 → 连线
 *   ⇒ 关于 = 100，外观 = 90，连线 = 0（不写 = 0）。
 *  同组内的每一项都要写**同一个值**：组间取的是最大值，组内排序又按它降序。
 */
const XH_GROUP_ORDER = { about: 100, appearance: 90, links: 0 };
// 挂全局：xh_brand.js / xh_zz_topbar_visibility.js / xh_animated_links.js 都读它（本文件字母序最先加载）
if (typeof window !== "undefined") window.XH_GROUP_ORDER = XH_GROUP_ORDER;

/** 组的 sortOrder（读不到全局表时用本地兜底，别写散落数字）。 */
function groupOrder(key) {
    const t = (typeof window !== "undefined" && window.XH_GROUP_ORDER) || XH_GROUP_ORDER;
    return t[key] || 0;
}

/** 设置项渲染函数：ComfyUI 每次打开设置面板都会调它 ⇒ 每次读最新缓存。 */
function _renderAboutRow() {
    const row = document.createElement("tr");
    row.className = "xh-about-row";
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
    // 二维码在设置面板里向下弹（面板有足够空间），不会被裁
    renderBadgeRow(cell, { qrDir: "down" });
    row.appendChild(cell);
    return row;
}

/** 设置项定义（纯展示，不落盘、不参与任何逻辑）。 */
//  第一级必须与 xh_animated_links.js 的 _cat() **逐字相同**（"XiaoHei"），
//    否则 ComfyUI 会当成两个不同扩展 ⇒ 凭空多出一个空折叠面板。
const ABOUT_SETTING = {
    id: `${NS}.about`,
    name: "关于",
    category: ["XiaoHei", "关于", "关于"],
    //  官方面板只认 tooltip ⇒ 补上才有 ⓘ 说明。
    tooltip: "纯信息行：版本、GitHub（暂空）、B 站、交流群入口、微信交流反馈。不保存任何值，关掉或改动它不会有任何影响。",
    //  组间排序靠它（降序）⇒ 100 让「关于」稳在最顶。
    sortOrder: groupOrder("about"),
    type: _renderAboutRow,
};

function _registerAbout() {
    // 幂等守卫必须查**存储里**，不能只查模块级变量：
    //    模块级 flag 只在同一次模块求值内有效；若本文件被重复执行，
    //    新实例的 flag 是 undefined ⇒ 会再 addSetting 一次 ⇒ 控制台报 "Setting already registered"。
    const store = app.extensionManager?.setting?.settings;
    if (store && Object.prototype.hasOwnProperty.call(store, ABOUT_SETTING.id)) return;

    const S = app.ui && app.ui.settings;
    if (!S || typeof S.addSetting !== "function") {
        console.error("XH.About] app.ui.settings.addSetting 不可用");
        return;
    }
    try {
        S.addSetting({ ...ABOUT_SETTING, sortOrder: groupOrder("about") });
    } catch (e) {
        console.error("XH.About]  设置注册失败:", e);
    }
}

// 顶层就注册（与 xh_animated_links.js 同策略：脚本求值时注册，排序才稳）
try { _registerAbout(); } catch (e) { console.error("XH.About] 顶层注册异常:", e); }

// 预取版本号：拿到后 refreshBadgeRows() 会把已经画好的三处徽章栏
// （设置面板 / 帮助窗口底部 / 交流反馈专题页）一起刷成真实版本。
try { primeAbout(); } catch (e) { /* 取不到就显示「—」，不糊弄假版本号 */ }
