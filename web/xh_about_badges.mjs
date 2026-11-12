//  XiaoHei · 徽章栏共享渲染模块（唯一真源，不是节点、不是设置项）
//
// 用它的三个地方，画出来的必须是**同一排**：
//   ① web/xh_about.js            → 设置面板「XiaoHei → 关于」
//   ② web/xh_help_browser.js     → 帮助窗口底部（替换原来的「 B 站」单按钮）
//   ③ web/xh_help_browser.js     → 「XiaoHei 指南 → 交流反馈」专题页
//
//  2026-11-11 用户口径：措辞要软，别像收钱。
//    ×「扫码」×「加群」  →   微信「交流反馈」、交流群「找小黑帮忙」
//    参考 prompt-assistant 的原文：微信那枚 badge 写的就是「交流反馈」，
//    B 站那枚写「使用教程」。咱们只学措辞，不学它的在线 shields.io 图片
//    （国内经常超时碎图）⇒ 本地 CSS + 本地品牌 SVG + 本地二维码，离线秒开。
//
//  文案、配色、品牌图形、二维码浮层只在本文件定义一次；
//    三处宿主只负责给一个空容器，改一句话三处同步，不许再复制粘贴。
//
//  品牌图形放 web/xh_about_assets/， 不塞进 xh_icons/svg/：
//    那边是 2350 枚 Lucide（ISC）生成物，唯一真源是「重建图标库.py」，
//    混入 4 枚商标图形会污染许可声明、破坏 2350 基线。
//
//  配色 1:1 照抄参考截图逐像素实测， 禁止自造色值：
//    #5E5E5E / #F7F7F7 / #6EAC19 / #17A4D3 = shields flat 的 label / -green / -blue；
//    #1EBAFC / #00A1D6 / #07C160 / #181717 = Simple Icons SVG 自带品牌官方色。
//
//  版本号唯一真源 = 后端 __init__.py 的 VERSION（GET /xh/about），绝不硬编码。
//  QQ 群只指路置顶专栏，群号 / 群二维码 / 微信号一个字不进包。

const ASSET_BASE = new URL("./xh_about_assets/", import.meta.url);
function _asset(name) { return new URL(name, ASSET_BASE).href; }

/** shields.io flat 徽章配色（逐像素实测 + 源码参数对照）。 */
export const SH = Object.freeze({
    LABEL_DARK:  "#5E5E5E",
    LABEL_LIGHT: "#F7F7F7",
    MSG_GREEN:   "#6EAC19",
    MSG_BLUE:    "#17A4D3",
    DARK_TEXT:   "#181717",
    WHITE_TEXT:  "#FFFFFF",
});

/** 四枚标准品牌图形：Simple Icons CC0（QQ 企鹅 / B站小电视 / 微信双气泡 / GitHub 猫）。
 *  color = 该 SVG 自带的品牌官方色，用 CSS mask + background-color 上色。 */
const BRAND = Object.freeze({
    github:   { file: "github.svg",   color: "#181717" },
    bilibili: { file: "bilibili.svg", color: "#00A1D6" },
    qq:       { file: "qq.svg",       color: "#1EBAFC" },
    wechat:   { file: "wechat.svg",   color: "#07C160" },
});

export const QR_URL = _asset("wechat-qr.png");

/**  全部对外措辞的唯一真源。想改话术只改这里，三个界面一起变。 */
export const COPY = Object.freeze({
    versionLabel: "版本",
    githubLabel:  "GitHub",
    githubEmpty:  "待开放",
    githubReady:  "仓库",
    biliLabel:    "哔哩哔哩",
    biliMsg:      "XiaoHei",
    qqLabel:      "交流群",
    qqMsg:        "找小黑帮忙",
    qqTitle:      "有问题，来群里聊聊",
    qqTip: (opus) => `节点用着不顺手、想提想法，都可以在交流群里找小黑。\n群入口见主页置顶专栏（长期更新，换群不改链接）\n${opus}`,
    qqColumnTip:  "群入口见主页置顶专栏（长期更新，换群不改链接）",
    wechatLabel:  "微信",
    wechatMsg:    "交流反馈",
    wechatTitle:  "交流反馈 · 悬停或点一下看微信",
    wechatTip:    "用着有想法、遇到问题，欢迎微信聊聊\n图片随包，不联网",
    wechatQrTip:  "有问题、有想法，欢迎加微信聊聊",
    contactLead:  "用着不顺手、有想法、想聊聊工作流，都欢迎来找小黑，不用客气。",
    contactLines: [
        "B 站：教程都在主页，置顶专栏里有资源与交流群入口（长期更新，换群不改链接）",
        "交流群：遇到问题来群里问一声，看到就会回",
        "微信：想细聊或反馈，扫一下下面的码就好",
    ],
    contactOutro: "下面这排和「设置 → XiaoHei → 关于」、窗口底部是同一排，点一下就能去对应地方。",
});

/* --------------------------------------------------------------------- CSS */
/** 全局只需一条样式（悬浮二维码）；幂等注入，面板反复开关不会重复堆 style。 */
function _injectShieldCSS() {
    if (document.getElementById("xh-about-shield-css")) return;
    const st = document.createElement("style");
    st.id = "xh-about-shield-css";
    st.textContent = [
        ".xh-about-shield{position:relative;}",
        ".xh-about-shield[data-xh-link='1']:hover{filter:brightness(1.12);}",
        ".xh-about-qr{position:absolute;top:calc(100% + 6px);right:0;z-index:10000;",
        "  padding:6px;border-radius:8px;opacity:0;visibility:hidden;pointer-events:none;",
        "  background:var(--background,#171718);border:1px solid var(--border,#494a50);",
        "  transition:opacity .18s ease,visibility .18s ease;}",
        //  帮助窗口底边（.xhhelp-win overflow:hidden）向下弹会被裁掉 ⇒ 向上弹
        ".xh-about-qr.xh-about-qr-up{top:auto;bottom:calc(100% + 6px);}",
        ".xh-about-shield:hover .xh-about-qr,.xh-about-shield.xh-about-qr-open .xh-about-qr{",
        "  opacity:1;visibility:visible;pointer-events:auto;}",
        ".xh-about-qr img{display:block;width:256px;height:auto;}",
        ".xh-about-qr-tip{margin-top:6px;font-size:11px;text-align:center;",
        "  color:var(--foreground,#ffffff);opacity:.75;}",
    ].join("\n");
    (document.head || document.body).appendChild(st);
}

/* ------------------------------------------------------------- 后端 about */
let _aboutCache = null;
let _aboutFetching = null;

/**
 * 取 API 实例的坑：这版 ComfyUI（前端 1.45.x）上
 *    `window.comfyAPI.api` 不是 ComfyApi 实例（只是命名空间壳，没有 fetchApi）；
 *    真正的实例是 `window.app.api`。两处都试一遍，谁能用谁上。
 */
function _api() {
    const cands = [
        typeof window !== "undefined" ? window.app && window.app.api : null,
        window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api,
        window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app && window.comfyAPI.app.app.api,
        window.comfyAPI && window.comfyAPI.api,
    ];
    for (const c of cands) {
        if (c && typeof c.fetchApi === "function") return c;
    }
    return null;
}

/** 原生 fetch 同源优先，失败再退化到 ComfyUI 内部 api.fetchApi（实测最抗内部 API 改版）。 */
function _requestAbout() {
    if (typeof fetch === "function") {
        return fetch("/xh/about", { headers: { Accept: "application/json" } })
            .then((r) => {
                if (!r || !r.ok) throw new Error("HTTP " + (r && r.status));
                return r.json();
            })
            .catch(() => {
                const api = _api();
                if (!api) throw new Error("no api");
                return api.fetchApi("/xh/about")
                    .then((r) => (r && typeof r.json === "function" ? r.json() : r));
            });
    }
    const api = _api();
    if (!api) return Promise.reject(new Error("no api"));
    return api.fetchApi("/xh/about")
        .then((r) => (r && typeof r.json === "function" ? r.json() : r));
}

/** 只取一次，成功后缓存；失败返回 null（不抛）。 */
export function fetchAbout() {
    if (_aboutCache) return Promise.resolve(_aboutCache);
    if (_aboutFetching) return _aboutFetching;
    _aboutFetching = _requestAbout()
        .then((d) => {
            if (d && d.version) { _aboutCache = d; return d; }
            return null;
        })
        .catch(() => null)
        .finally(() => { _aboutFetching = null; });
    return _aboutFetching;
}

/** 预取 + 版本号到了就地刷新所有已渲染的徽章栏（含帮助窗口底部）。 */
export function primeAbout() {
    return fetchAbout().then((d) => {
        if (d) refreshBadgeRows();
        return d;
    });
}

export function aboutData() { return _aboutCache; }

/* ------------------------------------------------------------------ tooltip */
/* ComfyUI 设置面板自带 tooltip 只认字符串型 setting，对自定义 DOM 无效 ⇒ 自己挂全局浮层。 */
function _showTip(anchor, text) {
    let t = document.getElementById("xh_about_tip");
    if (!t) {
        t = document.createElement("div");
        t.id = "xh_about_tip";
        t.style.cssText =
            "position:fixed;z-index:99999;pointer-events:none;padding:6px 10px;" +
            "border-radius:6px;font-size:12px;line-height:1.6;max-width:300px;" +
            "background:#1c1c1c;color:#e8e8e8;border:1px solid rgba(255,255,255,.12);" +
            "box-shadow:0 6px 20px rgba(0,0,0,.55);white-space:pre-wrap;display:none;";
        document.body.appendChild(t);
    }
    const r = anchor.getBoundingClientRect();
    t.textContent = text;
    t.style.display = "block";
    const w = t.offsetWidth || 200;
    const left = Math.max(6, Math.min(r.left, window.innerWidth - w - 10));
    let top = r.bottom + 7;
    if (top + t.offsetHeight > window.innerHeight - 6) top = Math.max(6, r.top - t.offsetHeight - 7);
    t.style.left = left + "px";
    t.style.top = top + "px";
}

function _hideTip() {
    const t = document.getElementById("xh_about_tip");
    if (t) t.style.display = "none";
}

/* -------------------------------------------------------------------- badge */
/**
 * 画一颗 shields.io flat 徽章：左半 label（可带品牌 logo）+ 右半彩色 message。
 *  图标一律走 DOM 逐条 style 赋值，绝不拼 innerHTML：
 *    上一版 xhIconHTML 的 style 属性被里面的双引号提前截断、mask 全丢，
 *    顶栏三颗按钮空框就是这么来的。url() 统一用单引号。
 */
function _shield(label, msg, o = {}) {
    _injectShieldCSS();
    const root = document.createElement(o.link ? "a" : "span");
    root.className = "xh-about-shield";
    root.style.cssText =
        "display:inline-flex;align-items:stretch;height:20px;border-radius:3px;" +
        "vertical-align:middle;box-sizing:border-box;user-select:none;" +
        "font-family:Verdana,'DejaVu Sans',system-ui,sans-serif;font-size:11px;" +
        "line-height:20px;white-space:nowrap;" +
        (o.link ? "cursor:pointer;text-decoration:none;" : "cursor:default;") +
        (o.dim ? "opacity:.72;" : "");

    const L = document.createElement("span");
    L.style.cssText =
        "display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 6px;" +
        "border-radius:3px 0 0 3px;box-sizing:border-box;" +
        "background:" + (o.labelBg || SH.LABEL_LIGHT) + ";color:" + (o.labelFg || SH.DARK_TEXT) + ";";

    if (o.logo && BRAND[o.logo]) {
        const b = BRAND[o.logo];
        const ico = document.createElement("i");
        ico.style.cssText = "display:inline-block;width:14px;height:14px;flex:none;";
        const u = "url('" + _asset(b.file) + "')";
        ico.style.webkitMaskImage = u;
        ico.style.maskImage = u;
        ico.style.webkitMaskRepeat = "no-repeat";
        ico.style.maskRepeat = "no-repeat";
        ico.style.webkitMaskPosition = "center";
        ico.style.maskPosition = "center";
        ico.style.webkitMaskSize = "contain";
        ico.style.maskSize = "contain";
        ico.style.backgroundColor = b.color;
        L.appendChild(ico);
    }
    L.appendChild(document.createTextNode(label));

    const M = document.createElement("span");
    M.style.cssText =
        "display:inline-flex;align-items:center;height:20px;padding:0 6px;" +
        "border-radius:0 3px 3px 0;box-sizing:border-box;" +
        "background:" + (o.msgBg || SH.MSG_BLUE) + ";color:" + (o.msgFg || SH.WHITE_TEXT) + ";";
    M.appendChild(document.createTextNode(msg));

    root.appendChild(L);
    root.appendChild(M);

    if (o.link) {
        root.href = o.link;
        root.target = "_blank";
        root.rel = "noopener noreferrer";
        root.dataset.xhLink = "1";
    }

    if (o.qr) {
        const box = document.createElement("span");
        box.className = "xh-about-qr" + (o.qrDir === "up" ? " xh-about-qr-up" : "");
        const img = document.createElement("img");
        img.src = QR_URL;
        img.alt = "XiaoHei 微信二维码";
        img.onerror = () => {
            box.textContent = "二维码未随包（web/xh_about_assets/wechat-qr.png 缺失）";
        };
        box.appendChild(img);
        const cap = document.createElement("div");
        cap.className = "xh-about-qr-tip";
        cap.textContent = COPY.wechatQrTip;
        box.appendChild(cap);
        root.appendChild(box);
        root.addEventListener("click", (e) => {
            e.preventDefault();
            root.classList.toggle("xh-about-qr-open");
        });
    }

    root.addEventListener("mouseenter", () => { if (o.tip) _showTip(root, o.tip); });
    root.addEventListener("mouseleave", _hideTip);
    root.addEventListener("click", _hideTip);
    if (o.title) root.title = o.title;
    return root;
}

/* ---------------------------------------------------------------------- row */
/**
 * 把同一排五枚徽章画进任意宿主容器（三处共用）。
 * @param host  DOM 元素（设置面板 td / 帮助窗口底部 div / 专题页占位 div）
 * @param opts.qrDir   "down" 默认（设置面板）/ "up"（帮助窗口底边，避免被窗口裁掉）
 * @param opts.showQr  false ⇒ 不挂悬浮二维码（专题页已经直接把二维码印在正文里）
 */
export function renderBadgeRow(host, opts = {}) {
    if (!host) return;
    _injectShieldCSS();
    const qrDir = opts.qrDir === "up" ? "up" : "down";
    const showQr = opts.showQr !== false;
    host.dataset.xhBadges = "1";
    host.dataset.xhQrDir = qrDir;
    host.dataset.xhShowQr = showQr ? "1" : "0";
    // 逐条赋值，不覆盖宿主自己已有的样式（设置面板 td 有自己的 flex 设置）
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.gap = "8px";
    host.style.flexWrap = "wrap";

    const a = aboutData();
    const ver = a ? a.version : null;
    const bili = (a && a.bilibili) || "https://space.bilibili.com/96854764";
    const opus = (a && a.opus) || "https://www.bilibili.com/opus/1267916337700667400";
    const github = a ? a.github : "";   // 空串 = 空壳，不点、不跳
    const tagline = (a && a.tagline) || "8g显存小黑的折腾日记";

    host.innerHTML = "";

    // ① 版本：灰 label + 绿 message，纯信息、不可点
    host.appendChild(_shield(COPY.versionLabel, ver || "—", {
        labelBg: SH.LABEL_DARK, labelFg: SH.WHITE_TEXT,
        msgBg: SH.MSG_GREEN,
        title: ver ? `XiaoHei v${ver}` : "未读到后端版本号（后端未重启？）",
        tip: ver ? `XiaoHei v${ver}\n${tagline}` : "没读到版本号\n重开一次设置面板试试",
    }));

    // ② GitHub：用户 2026-11-11 定「暂时先空，先做一个空壳放着」；后端填了地址就自动可点
    host.appendChild(_shield(COPY.githubLabel, github ? COPY.githubReady : COPY.githubEmpty, {
        logo: "github", labelBg: SH.LABEL_LIGHT, labelFg: SH.DARK_TEXT,
        msgBg: "var(--secondary,#262729)", msgFg: "var(--foreground,#ffffff)",
        link: github || null, dim: !github,
        title: github ? "打开 GitHub 仓库" : "仓库还没建好，位置先留着",
        tip: github ? github : "GitHub 暂未开放\n位置先留着，建好会在这里更新",
    }));

    // ③ 哔哩哔哩：标准小电视 + 家族名，跳 B 站主页
    host.appendChild(_shield(COPY.biliLabel, COPY.biliMsg, {
        logo: "bilibili", labelBg: SH.LABEL_LIGHT, labelFg: SH.DARK_TEXT,
        msgBg: SH.MSG_BLUE, link: bili,
        title: "打开 B 站主页",
        tip: `XiaoHei · B 站主页\n${bili}`,
    }));

    // ④ 交流群：标准小企鹅。 只指路置顶专栏，群号 / 群二维码一个字不进包。
    //    措辞按用户 2026-11-11「委婉软一些」定，不写「加群」这种命令口吻。
    host.appendChild(_shield(COPY.qqLabel, COPY.qqMsg, {
        logo: "qq", labelBg: SH.LABEL_LIGHT, labelFg: SH.DARK_TEXT,
        msgBg: SH.MSG_BLUE, link: opus,
        title: COPY.qqTitle,
        tip: COPY.qqTip(opus),
    }));

    // ⑤ 微信：标准双气泡。参考 prompt-assistant 写「交流反馈」，不写「扫码」。
    host.appendChild(_shield(COPY.wechatLabel, COPY.wechatMsg, {
        logo: "wechat", labelBg: SH.LABEL_LIGHT, labelFg: SH.DARK_TEXT,
        msgBg: SH.MSG_BLUE, qr: showQr, qrDir: qrDir,
        title: showQr ? COPY.wechatTitle : "交流反馈 · 二维码就在下面",
        tip: COPY.wechatTip,
    }));
}

/** 版本号异步到达后，把所有已渲染过的徽章栏就地重绘一遍。 */
export function refreshBadgeRows() {
    document.querySelectorAll('[data-xh-badges="1"]').forEach((h) => {
        try {
            renderBadgeRow(h, {
                qrDir: h.dataset.xhQrDir,
                showQr: h.dataset.xhShowQr !== "0",
            });
        } catch (e) { /* 单处刷新失败不影响其它界面 */ }
    });
}
