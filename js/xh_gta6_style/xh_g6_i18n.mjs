// GTA6 风格三件套 · 中/EN 三表（2026-11-26）
// 家族机制唯一真源仍是 js/xh_image_tools_lang.js 的 XH_I18N；本文件只提供本组节点专属词条。
//
// 为什么单独一份、不并进家族全局 widgets/slots 表：
//   家族全局 widgets 表里 `mode` = 「切点来源」、`aspect` / `theme` 等键也被别的节点占着，
//   语义完全不同，直接并表会把别的节点翻错（也把我们翻错）。
//   所以按节点类型隔离，查询时优先命中 byNode。
//
// 🔴 铁律：只改显示层 —— node.title / widget.label / slot.label / COMBO getOptionLabel，
//   绝不改 widget.name 与 COMBO 的 options.values（那是存档值，改了老工作流就崩）。
//
// 🔴 EN 表必须写满：applyLangToNode 在专属表返回 null 时会回落家族全局表，
//   漏一项就可能被别的节点的中文标签串进来。

export const G6_NODES_ZH = {
    XH_GTA6Theme: "GTA6 主题 XiaoHei",
    XH_GTA6People: "GTA6 人物 XiaoHei",
    XH_GTA6Builder: "GTA6 提示词 XiaoHei",
};
export const G6_NODES_EN = {
    XH_GTA6Theme: "GTA6 Theme XiaoHei",
    XH_GTA6People: "GTA6 People XiaoHei",
    XH_GTA6Builder: "GTA6 Prompt XiaoHei",
};

const ZH = {
    widgets: {},
    slots: {
        theme: "主题",
        people: "人物",
        prompt: "提示词",
        width: "宽度",
        height: "高度",
        style_only: "纯风格句",
    },
    byNode: {
        XH_GTA6Theme: {
            widgets: {
                theme: "主题",
                style_variant: "画风",
                background: "背景地点",
                hue: "整体色相",
                vehicle: "车辆",
                sign_text: "招牌文字",
                aspect: "画幅",
            },
        },
        XH_GTA6People: {
            widgets: {},
        },
        XH_GTA6Builder: {
            widgets: {
                theme: "主题",
                mode: "照片模式",
                group_setup: "整体站位",
                your_prompt: "自己再补几句",
                title_space: "留标题位",
            },
        },
    },
};

const EN = {
    widgets: {},
    slots: {
        theme: "theme",
        people: "people",
        prompt: "prompt",
        width: "width",
        height: "height",
        style_only: "style_only",
    },
    byNode: {
        XH_GTA6Theme: {
            widgets: {
                theme: "theme",
                style_variant: "style_variant",
                background: "background",
                hue: "hue",
                vehicle: "vehicle",
                sign_text: "sign_text",
                aspect: "aspect",
            },
        },
        XH_GTA6People: {
            widgets: {},
        },
        XH_GTA6Builder: {
            widgets: {
                theme: "theme",
                mode: "mode",
                group_setup: "group_setup",
                your_prompt: "your_prompt",
                title_space: "title_space",
            },
        },
    },
};

export const G6_I18N = { zh: ZH, en: EN };

/** UI 内部（DOM 控件）用：拿当前语言 */
export function g6Lang() {
    return window.XH_LANG === "en" ? "en" : "zh";
}

/** 当前是否英文界面（DOM 里要决定显示英文原名还是中文名） */
export function g6IsEn() {
    return g6Lang() === "en";
}

export function isG6Node(type) {
    return typeof type === "string" && !!G6_NODES_ZH[type];
}

/** kind = "widgets" | "slots"；先查节点专属表，再回落本组公共表。 */
export function g6Text(kind, name, lang, type) {
    const p = G6_I18N[lang] || G6_I18N.zh;
    const v = p.byNode?.[type]?.[kind]?.[name] ?? p[kind]?.[name];
    return v || null;
}

/** 原生下拉的中文显示表（值一字不动，只换显示） */
export { G6_COMBO } from "./labels.mjs";
