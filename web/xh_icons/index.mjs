// XH 自有图标库 · 统一入口（所有 XH 界面只调这里，不各写各的路径）
// 真源：Lucide 1.71.0（ISC），图标文件在 ./svg/ 下，随包分发、不联网。
// URL 由 import.meta.url 推导，主包目录改名也不用改一行代码。

import {
  XH_ICON_SEMANTIC, XH_ICON_NAMES, XH_ICON_LABELS,
  xhIconLabel, xhIconSearch,
} from "./semantic.mjs";

export const XH_ICON_VERSION = "1.71.0";
export const XH_ICON_COUNT = 2350;
export const XH_BRAND = "#E8A33C";
export { XH_ICON_SEMANTIC, XH_ICON_NAMES, XH_ICON_LABELS, xhIconLabel, xhIconSearch };

const BASE = new URL("./svg/", import.meta.url);
const cache = new Map();

/** 语义解析：中文语义名 / 英文图标名 / 拼音以外一律返回 null（不猜） */
export function resolveIcon(name) {
  if (!name) return null;
  const s = String(name).trim();
  if (XH_ICON_SEMANTIC[s]) return XH_ICON_SEMANTIC[s];
  const lower = s.toLowerCase();
  if (XH_ICON_NAMES.includes(lower)) return lower;
  const hit = xhIconSearch(s, 1);
  return hit.length ? hit[0] : null;
}

/** 取图标 URL（同步、无需等待）。可用于 CSS mask / <img> / 自己拼 DOM */
export function xhIconUrl(name) {
  const n = resolveIcon(name);
  if (!n) return "";
  return new URL(n + ".svg", BASE).href;
}

/** 是否存在该图标 */
export function xhHasIcon(name) { return !!resolveIcon(name); }

/** 全部图标名（可按中文过滤） */
export function xhIconList(q) {
  if (!q) return XH_ICON_NAMES.slice();
  const s = String(q).toLowerCase();
  return XH_ICON_NAMES.filter(n =>
    n.includes(s) || (XH_ICON_LABELS[n] || "").toLowerCase().includes(s));
}

/**
 * 创建图标元素（inline SVG，currentColor 真正继承，颜色随主题走）。
 * 同步返回 <span>；SVG 内容按需 fetch 单个文件并缓存，一个图标只请求一次。
 * opts: { size=18, color="brand"|"current"|任意CSS色, title, className }
 */
export function xhIconEl(name, opts = {}) {
  const { size = 18, color = "brand", title = "", className = "" } = opts;
  const el = document.createElement("span");
  el.className = ("xh-icon " + className).trim();
  el.dataset.xhIcon = String(name);
  el.style.display = "inline-flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.flexShrink = "0";
  el.style.lineHeight = "0";
  el.style.color = color === "brand" ? "var(--xh-primary, #E8A33C)"
                 : color === "current" ? "currentColor" : color;
  if (title) el.title = title;
  const url = xhIconUrl(name);
  if (!url) { el.textContent = "?"; return el; }
  const paint = (svg) => {
    const s = svg.replace(/<svg[^>]*>/, m => m.replace(/\s+(?:width|height)="[^"]*"/g, ""));
    el.innerHTML = s.replace("<svg", '<svg width="100%" height="100%"');
  };
  if (cache.has(url)) paint(cache.get(url));
  else fetch(url).then(r => r.ok ? r.text() : "").then(svg => {
    if (svg) { cache.set(url, svg); paint(svg); }
  }).catch(() => {});
  return el;
}

/**
 * 纯 CSS mask 版（同步出图、零 fetch）。颜色用 background-color，
 * 适合大批量列表；主题跟随用 color="current"（background: currentColor）。
 */
export function xhIconMask(name, opts = {}) {
  const { size = 18, color = "brand", title = "", className = "" } = opts;
  const el = document.createElement("span");
  el.className = ("xh-icon-mask " + className).trim();
  el.style.display = "inline-block";
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.flexShrink = "0";
  //  2026-11-11 体检修复：名字解析不到时 xhIconUrl 返回空串，
  //    旧代码会生成 url("")（CSS 里指向页面自身，出一颗空白/错图按钮）。
  //    这里跟 inline 版一样退成 "?"，绝不往外吐空 URL。
  const url = xhIconUrl(name);
  if (!url) { el.textContent = "?"; return el; }
  const u = 'url("' + url + '")';
  el.style.webkitMaskImage = u; el.style.maskImage = u;
  el.style.webkitMaskRepeat = "no-repeat"; el.style.maskRepeat = "no-repeat";
  el.style.webkitMaskPosition = "center"; el.style.maskPosition = "center";
  el.style.webkitMaskSize = "contain"; el.style.maskSize = "contain";
  el.style.backgroundColor = color === "brand" ? "var(--xh-primary, #E8A33C)"
                           : color === "current" ? "currentColor" : color;
  if (title) el.title = title;
  return el;
}

/**
 * 批量挂载：以后任何 XH 界面只写 <span data-xh-icon="标签" data-xh-size="20"></span>
 * 再调一次 xhMountIcons()，图标自动来、自动染家族黄。零路径、零文件名。
 */
export function xhMountIcons(root = document) {
  const nodes = root.querySelectorAll("[data-xh-icon]:not([data-xh-mounted])");
  for (const host of nodes) {
    const opts = {
      size: Number(host.dataset.xhSize) || 18,
      color: host.dataset.xhColor || "brand",
      title: host.dataset.xhTitle || "",
      className: host.dataset.xhClass || "",
    };
    host.setAttribute("data-xh-mounted", "1");
    host.appendChild(xhIconEl(host.dataset.xhIcon, opts));
  }
  return nodes.length;
}

/** 一行调用范例（拷进任何 XH 前端 js 即可） */
// import { xhIconEl, xhMountIcons } from "../xh_icons/index.mjs";
// toolbar.appendChild(xhIconEl("标签", { size: 20, title: "标签" }));
// xhMountIcons();  // 处理所有 <span data-xh-icon="对齐线"> 等标记
