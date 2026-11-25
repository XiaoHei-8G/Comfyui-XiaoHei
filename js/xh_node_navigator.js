//  XiaoHei · 节点导航面板（顶栏「 节点」按钮 + 两栏面板）
//
// 复刻 Pixaroma 的「? 节点导航」门面：把所有 XiaoHei 节点按官方 CATEGORY 分好类，
// 列在面板里，点一下就把节点加到画布上 —— 不用去节点库双击搜索。
//
// 数据来源：ComfyUI 原生的 /object_info（每个节点的 category 字段，如 "XiaoHei/工具"）。
//    零 Python 改动：分类 100% 准（直接用节点源码里写的 CATEGORY），
//     以后往 XiaoHei 加新节点，面板自动多一行，不用维护清单。
// 配色：复用 web/xh_ui_kit.js 注入的 window.XH_BAR_COLORS，取不到用内联兜底。

const { app } = window.comfyAPI.app;
const NS = "XH.NodeNavigator";

//  2026-10-28：本文件**没有 import**（用的是 window.comfyAPI.app 全局风格）⇒ toast 只能从 window 取。
//    （原来这里用 alert()，而 ComfyUI 桌面版是 Electron、alert 被禁 ⇒ 用户什么反馈都收不到。）
const toast = (msg) => {
  if (typeof window.XHToast === "function") { window.XHToast(msg); return; }
  try { console.log("[XiaoHei] " + msg); } catch (e) { /* 忽略 */ }
};

/** 取家族配色；取不到用同值内联兜底。 */
function colors() {
  return Object.assign(
    {
      SURFACE: "#252525",
      BORDER: "rgba(255,255,255,.10)",
      TEXT: "#e8e8e8",
      PRIMARY: "#8a8a8a",
      SUB: "rgba(255,255,255,.55)",
      ACCENT: "#8a8a8a",
    },
    (typeof window !== "undefined" && window.XH_BAR_COLORS) || {}
  );
}

/** 轮询等 DOM 容器出现（ComfyUI 是 SPA，顶栏不一定在脚本执行时已存在）。 */
function waitFor(sel, cb, tries = 0) {
  const el = document.querySelector(sel);
  if (el) return cb(el);
  if (tries > 200) return;
  setTimeout(() => waitFor(sel, cb, tries + 1), 100);
}

const STATE = {
  data: null,        // { group: [ {type, title, desc} ] }
  group: "__ALL__",
  q: "",
  panel: null,
  open: false,
  dropIndex: 0,
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ----------------------------- 顶栏按钮 -----------------------------
//  2026-10-27 修复"挤在右上角"：同 xh_workflow_browser.js —— 前端 1.57
//   已删 #comfyui-topbar，改用 Pixaroma 同款官方挂点 app.menu.settingsGroup。
/** 顶栏按钮样式 —— 统一真源在 xh_ui_kit.js（ensureToolbarButtonCSS）。
 *   2026-10-28 13:20：本文件原来**自己写了一份** .xhwb-tb 样式，
 *    跟设置面板/工作流浏览器抢同一个 style id ⇒ 三颗按钮三种颜色。
 *    现在只转发，不再自己写。 */
function ensureToolbarButtonCSS() {
  try {
    if (typeof window !== "undefined" && typeof window.XH_ensureToolbarButtonCSS === "function") {
      window.XH_ensureToolbarButtonCSS();
    }
  } catch (e) { /* 忽略 */ }
}

function mountToolbarButton() { return; // 已合并到 Help Browser
  ensureToolbarButtonCSS();
  if (window.__xhNodeNavInjected) return;
  return; //  2026-10-27 合并到 Help Browser，不挂独立按钮
  const C = colors();
  const settingsGroupEl = app.menu && app.menu.settingsGroup && app.menu.settingsGroup.element;
  if (!settingsGroupEl) {
    if (mountToolbarButton._tries == null) mountToolbarButton._tries = 0;
    if (++mountToolbarButton._tries > 20) {
      console.warn("[XiaoHei] 顶栏挂载失败：app.menu.settingsGroup 一直没出现（节点导航按钮未挂上）");
      return;
    }
    setTimeout(mountToolbarButton, 250);
    return;
  }
  window.__xhNodeNavInjected = true;
  const group = document.createElement("div");
  group.className = "comfyui-button-group";
  group.dataset.xhBtn = "nav";
  const btn = document.createElement("button");
  btn.textContent = " 节点";
  btn.title = "XiaoHei 节点导航（点击把节点加到画布）";
  //  2026-10-28 13:20：统一真源的 class（.xh-tb）—— 跟另外三颗按钮同一套样式
  btn.className = "comfyui-button " + ((typeof window !== "undefined" && window.XH_TB_CLASS) || "xh-tb");
  btn.dataset.xhTbNav = "1";
  btn.onclick = () => togglePanel();
  group.appendChild(btn);
  settingsGroupEl.before(group);
  window.__xhNavTbBtn = btn;
}

// ----------------------------- 面板 -----------------------------
function buildPanel() {
  const C = colors();
  const root = document.createElement("div");
  root.id = "xh-nn-root";
  root.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;" +
    "background:rgba(0,0,0,.45);font-family:-apple-system,Segoe UI,Roboto,sans-serif;";
  root.innerHTML =
    '<div id="xh-nn-box" style="width:min(840px,92vw);height:min(660px,86vh);background:' + C.SURFACE +
    ";border:1px solid " + C.BORDER + ";border-radius:12px;display:flex;flex-direction:column;overflow:hidden;color:" + C.TEXT + ';">' +
    '  <div id="xh-nn-head" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid ' + C.BORDER + ';">' +
    '    <span style="font-weight:700;font-size:14px;">XiaoHei 节点导航</span>' +
    '    <input id="xh-nn-search" placeholder="搜索节点名…" style="flex:1;height:28px;background:rgba(0,0,0,.25);border:1px solid ' + C.BORDER + ';border-radius:6px;color:' + C.TEXT + ';padding:0 10px;font-size:13px;">' +
    '    <button id="xh-nn-close" style="height:28px;padding:0 12px;border-radius:6px;border:1px solid ' + C.BORDER + ';background:transparent;color:' + C.TEXT + ';cursor:pointer;">关闭</button>' +
    "  </div>" +
    '  <div style="display:flex;flex:1;min-height:0;">' +
    '    <div id="xh-nn-tree" style="width:190px;border-right:1px solid ' + C.BORDER + ';overflow:auto;padding:8px;font-size:13px;"></div>' +
    '    <div id="xh-nn-list" style="flex:1;overflow:auto;padding:8px;"></div>' +
    "  </div>" +
    "</div>";
  document.body.appendChild(root);

  root.addEventListener("click", (e) => {
    if (e.target === root) togglePanel(false);
  });
  root.querySelector("#xh-nn-close").onclick = () => togglePanel(false);
  root.querySelector("#xh-nn-search").addEventListener("input", (e) => {
    STATE.q = e.target.value.toLowerCase();
    renderList();
  });
  STATE.panel = root;
}

function togglePanel(force) {
  if (!STATE.panel) buildPanel();
  STATE.open = typeof force === "boolean" ? force : !STATE.open;
  STATE.panel.style.display = STATE.open ? "flex" : "none";
  // 顶栏按钮同步：开着 = 亮家族黄，关着 = 回常态（统一真源）
  try {
    const tb = window.__xhNavTbBtn || document.querySelector("[data-xh-tb-nav]");
    const cls = (typeof window !== "undefined" && window.XH_TB_OPEN_CLASS) || "xh-tb-open";
    if (tb) tb.classList.toggle(cls, !!STATE.open);
  } catch (e) { /* 忽略 */ }
  if (STATE.open) {
    refresh();
    const s = document.querySelector("#xh-nn-search");
    if (s) s.focus();
  }
}

async function refresh() {
  if (!STATE.data) {
    try {
      const d = await fetch("/object_info", { headers: { Accept: "application/json" } })
        .then((r) => (r && r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .catch(() => {
          const a = (window.app && window.app.api) || (window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api);
          if (!a || typeof a.fetchApi !== "function") throw new Error("no api");
          return a.fetchApi("/object_info").then((r) => (r && typeof r.json === "function" ? r.json() : r));
        });
      STATE.data = groupNodes(d);
    } catch (e) {
      STATE.data = { groups: [], items: [] };
      const list = document.querySelector("#xh-nn-list");
      if (list)
        list.innerHTML =
          '<div style="padding:20px;color:#8a8a8a;">节点清单加载失败：' + esc(e.message || e) +
          "<br>请确认 ComfyUI 已重启，且 /object_info 可访问。</div>";
      renderTree();
      return;
    }
  }
  renderTree();
  renderList();
}

/** 把 object_info 按 CATEGORY（XH/xxx）分组，筛掉非 XiaoHei 节点。 */
function groupNodes(info) {
  const groups = {};
  const items = [];
  for (const type in info) {
    const def = info[type] || {};
    const cat = def.category || "";
    if (cat.indexOf("XiaoHei") !== 0) continue; // 只收 XiaoHei 自家节点
    const group = cat.replace(/^XiaoHei\//, "") || "其他";
    const title = (def.display_name && def.display_name !== type) ? def.display_name : type.replace(/^XH\s*/, "");
    const item = {
      type: type,
      title: title,
      desc: typeof def.description === "string" ? def.description : "",
    };
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
    items.push(Object.assign({ group: group }, item));
  }
  // 各组内按标题排序
  for (const g in groups) groups[g].sort((a, b) => a.title.localeCompare(b.title, "zh"));
  return { groups: groups, items: items };
}

function renderTree() {
  const tree = document.querySelector("#xh-nn-tree");
  if (!tree || !STATE.data) return;
  const C = colors();
  const names = Object.keys(STATE.data.groups);
  const all =
    '<div class="xh-nn-ti" data-g="__ALL__"> 全部节点</div>';
  const folders = names
    .map((g) => {
      const n = STATE.data.groups[g].length;
      // 2026-11-25 重捋：树里只显示末段子类名；data-g 仍用完整路径保证筛选命中。
      const label = /^(分镜|图像|视频|提示词|逻辑与数值|模型与身份|音频|工具)\//.test(g) ? g.split("/").pop() : g;
      return '<div class="xh-nn-ti" data-g="' + esc(g) + '"> ' + esc(label) + " · " + n + "</div>";
    })
    .join("");
  tree.innerHTML = all + '<div style="height:1px;background:' + C.BORDER + ';margin:6px 0;"></div>' + folders;
  tree.querySelectorAll(".xh-nn-ti").forEach((el) => {
    el.style.cssText =
      "padding:6px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    if (el.dataset.g === STATE.group) {
      el.style.background = "rgba(242,255,89,.18)";
      el.style.color = C.PRIMARY;
    }
    el.onclick = () => {
      STATE.group = el.dataset.g;
      renderTree();
      renderList();
    };
  });
}

function filteredItems() {
  const d = STATE.data || { items: [] };
  let its = d.items.slice();
  if (STATE.group !== "__ALL__") its = its.filter((i) => i.group === STATE.group);
  if (STATE.q) its = its.filter((i) => i.title.toLowerCase().includes(STATE.q) || i.type.toLowerCase().includes(STATE.q));
  return its;
}

function renderList() {
  const list = document.querySelector("#xh-nn-list");
  if (!list) return;
  const C = colors();
  const its = filteredItems();
  if (!its.length) {
    list.innerHTML = '<div style="padding:20px;opacity:.6;">没有匹配的节点。</div>';
    return;
  }
  list.innerHTML = its
    .map((i) => {
      const desc = i.desc ? '<div style="font-size:11px;opacity:.55;margin-top:2px;">' + esc(i.desc) + "</div>" : "";
      return (
        '<div class="xh-nn-fi" data-type="' + esc(i.type) + '" style="padding:9px 10px;border-radius:8px;cursor:pointer;margin-bottom:5px;background:rgba(255,255,255,.03);border:1px solid ' + C.BORDER + ';">' +
        '  <div style="font-weight:600;">' + esc(i.title) + "</div>" +
        '  <div style="font-size:10px;opacity:.45;">' + esc(i.group) + " · " + esc(i.type) + "</div>" +
        desc +
        "</div>"
      );
    })
    .join("");
  list.querySelectorAll(".xh-nn-fi").forEach((el) => {
    el.onmouseenter = () => (el.style.background = "rgba(242,255,89,.10)");
    el.onmouseleave = () => (el.style.background = "rgba(255,255,255,.03)");
    el.onclick = () => addNode(el.dataset.type);
  });
}

/** 把节点加到画布中央（带递增偏移，避免叠在一起），然后关面板。 */
function addNode(type) {
  const L = window.LiteGraph;
  if (!L || !app.graph) {
    toast("画布未就绪，无法添加节点。");
    return;
  }
  let node;
  try {
    node = L.createNode(type);
  } catch (e) {
    toast("创建节点失败：" + type + "（" + (e.message || e) + "）");
    return;
  }
  if (!node) {
    toast("找不到节点类型：" + type);
    return;
  }
  // 简单稳健：放到画布可见区、每次点击向右下错开一点
  const base = 160;
  const off = (STATE.dropIndex % 8) * 28;
  node.pos = [base + off, base + off];
  STATE.dropIndex++;
  try {
    app.graph.add(node);
    app.graph.setDirtyCanvas(true, true);
  } catch (e) {
    toast("添加到画布失败：" + (e.message || e));
    return;
  }
  if (STATE.panel) STATE.panel.style.display = "none";
}

app.registerExtension({
  name: NS,
  setup() {
    mountToolbarButton();
  },
});
