// ╔═══════════════════════════════════════════════════════════════╗
// ║  XiaoHei 工作流浏览器 · 二期（对 早期版本 Workflows 的完整复刻）      ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// 2026-10-27：一期太简陋（用户原话"复刻得太简陋"）。本版按 早期版本 源码
// （css.mjs / grid.mjs / drag.mjs / window.mjs）逐条复刻：
//    独立浮窗：标题栏按住可拖拽、右下角把手缩放，位置/大小记忆（localStorage）
//    CSS 变量 --xhwb-k 控密度：工具栏三个衬线 A 字（小/中/大），全部尺寸走 z()
//    网格视图：canvas 画的节点缩略图（后端解析 json 节点坐标，同类节点同色）
//    列表视图：缩略图 + 名称 + 模型标签 + 相对时间 + 星标
//    侧栏：全部/收藏/最近 + 文件夹（彩色圆点 + 计数），左缘可拖宽
//    详情栏：大缩略图 + kv 表 + 模型清单 + 打开/复制路径/收藏
//    排序（最近修改/名称/节点数）+ 搜索（名字/文件夹/模型）
//    底部快捷键提示条 + Esc 关闭 / Enter 打开 / ↑↓ 选择
//    收藏、视图、排序、字号、窗口位置 全部持久化
//
// 后端：__init__.py 的 GET /xh/workflows（含 models/map）、/xh/workflows/load、
//       /xh/workflows/openfolder（资源管理器打开根目录）。

const { app } = window.comfyAPI.app;
import { xhIconHTML, makeToolbarButton, setToolbarButtonOpen, XH_TB_ICON_SIZE } from "./xh_ui_kit.js";
//  2026-10-28：自建模态框替代 window.prompt / window.confirm
//    （ComfyUI 桌面版是 Electron，禁用了原生弹窗 ⇒ 点按钮毫无反应）。
import { XHAsk } from "./xh_ask.js";
const NS = "XH.WorkflowBrowser";
const CMD_ID = "XH.OpenWorkflowBrowser";
const CSS_ID = "xh-workflows-css";
//  2026-10-27 15:55 XiaoHei 家族自己的配色（不再用 早期版本 的橘黄）。
//   ACC  = 电光青蓝 #8a8a8a —— 你节点导航面板里本来就有的 ACCENT，家族资产，延续它
//   GOLD = 琥珀金 #fbbf24 —— 专门给"收藏星"，金色=收藏，语义清晰
//   底色统一到 #252525 深蓝灰（跟设置面板 / 节点导航一致，三个面板不再割裂）
//  主题统一：全部从 Help Browser 写的 CSS 变量读（--xh-surface 等）。
//    ACC / GOLD 仍然保留做常量用，但面板背景色等现在走 CSS 变量。
function themeVars() {
  const r = document.documentElement;
  const v = (n, f) => r.style.getPropertyValue(n).trim() || f;
  return {
    surface: v("--xh-surface",  "#1c1c1c"),
    side:    v("--xh-side",     "#1c1c1c"),
    card:    v("--xh-card",     "#252525"),
    border:  v("--xh-border",   "rgba(255,255,255,.10)"),
    text:    v("--xh-text",     "#e8e8e8"),
    sub:     v("--xh-sub",      "#8a8688"),
    primary: v("--xh-primary",  "#ffffff"),
  };
}
const ACC = "#8a8a8a";    // 官方 accent-plum（李子紫）：用作强调/星标
const GOLD = "#fbbf24";   // 收藏星专用：琥珀金（保留）

// ---- 顶栏按钮样式（三个面板共用）----
//  2026-10-28 15:55：照 早期版本 css.mjs L64-71 的做法 ——
//   用官方 .comfyui-button class + !important 覆盖底色，
//   所以边框/圆角/字体跟官方按钮**完全一致**，平时是官方灰（融进官方风格），
//   只有面板打开时才亮出 XiaoHei 家族色。之前是 inline style 写死主色，一直亮着，
//   三个按钮在顶栏抢官方「运行」按钮的视觉焦点。
//
//  2026-10-28 用户暴怒定案：样式**必须唯一真源**（xh_ui_kit.js 的
//   ensureToolbarButtonCSS），不能在这里另写一份 ——
//   本文件原来也注入 <style id="xh-tb-btn-css">，而 xh_settings_panel.js
//   按字母序**先注入**了同名 id 的 style ⇒ 本文件这份直接被丢弃
//   ⇒ 工作流按钮显示淡紫 #8a8a8a，只有问号是黄的，三颗三种风格。
//   现在三颗按钮共用 xh_ui_kit 的 .xh-tb / .xh-tb-open，不可能再分叉。
const XH_TB_CSS = (typeof window !== "undefined" && window.XH_TB_CSS) || "";

/** 把按钮样式注入页面（统一真源在 xh_ui_kit，这里只做转发）。 */
function ensureToolbarButtonCSS() {
    try {
        if (typeof window !== "undefined" && typeof window.XH_ensureToolbarButtonCSS === "function") {
            window.XH_ensureToolbarButtonCSS();
        }
    } catch (e) { /* 忽略 */ }
}

// ---- 持久化小工具（localStorage 挂了也不许崩）----
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("xh.wfb." + k);
      return v === null ? d : JSON.parse(v);
    } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem("xh.wfb." + k, JSON.stringify(v)); } catch (e) { /* 忽略 */ }
  },
};

// 一次性布局迁移（版本 3 / 2026-11-20）：用户截图实测左栏只有 ~150px、右栏 ~180px，
// 而代码默认是 320 / 300 —— 浏览器 localStorage 里存着的旧栏宽把默认值盖掉了。
// 🔴 上次的版本 2 迁移只跑一次、早就结束，所以改默认值对他完全无效（他一遍遍说「没修好」）。
//    这次升到 3，无条件清掉 sideW/detW，让 _wfbApplyCols 回落到新默认。
//    ⚠️ win（窗口位置/大小）**不清** —— 用户可能自己调过窗口，别顺手重置。
// 打版本标只迁移一次；之后用户自己拖的栏宽照常记忆，不再被清。
(function _wfbMigrateWideLayout() {
  try {
    if (store.get("layoutV", 0) >= 3) return;
    // 用 removeItem 真正删键（store.set(k,null) 只会写进字符串 "null"，不算清掉）。
    localStorage.removeItem("xh.wfb.sideW");
    localStorage.removeItem("xh.wfb.detW");
    store.set("layoutV", 3);
  } catch (e) { /* localStorage 挂了也不许崩 */ }
})();

/** 一个可缩放长度（学 早期版本 的 z()），乘 --xhwb-k。 */
const z = (n) => "calc(" + n + "px * var(--xhwb-k, 1))";

// ----------------------------- API 兜底 -----------------------------
function _api() {
  const cands = [
    window.app && window.app.api,
    window.comfyAPI && window.comfyAPI.api && window.comfyAPI.api.api,
    window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app && window.comfyAPI.app.app.api,
    window.comfyAPI && window.comfyAPI.api,
  ];
  for (const x of cands) if (x && typeof x.fetchApi === "function") return x;
  return null;
}
function fetchJSON(url) {
  if (typeof fetch === "function") {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r || !r.ok) throw new Error("HTTP " + (r && r.status));
        return r.json();
      })
      .catch(() => {
        const a = _api();
        if (!a) throw new Error("no api");
        return a.fetchApi(url).then((r) => (r && typeof r.json === "function" ? r.json() : r));
      });
  }
  const a = _api();
  if (!a) return Promise.reject(new Error("no fetch"));
  return a.fetchApi(url).then((r) => (r && typeof r.json === "function" ? r.json() : r));
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
/** POST json（走 ComfyUI api 兜底，同 fetchJSON 思路）。 */
function postJSON(url, body) {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  };
  if (typeof fetch === "function") {
    return fetch(url, init).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r || !r.ok) throw new Error(d.error || "HTTP " + (r && r.status));
      return d;
    });
  }
  const a = _api();
  if (!a) return Promise.reject(new Error("no api"));
  return a.fetchApi(url, init).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r || !r.ok) throw new Error(d.error || "HTTP " + (r && r.status));
    return d;
  });
}
/** 轻提示（替代 alert，2.2s 自动消失）。 */
function toast(msg) {
  const old = document.getElementById("xh-wfb-toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.id = "xh-wfb-toast";
  t.className = "xhwb-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 2200);
}
/** 新建文件夹（UI「+」按钮 → 输入名字 → 后端 mkdir）。 */
async function createFolderUI() {
  const name = await XHAsk.text("新文件夹名字（建在 workflows 根目录下）", { placeholder: "比如：我的短剧" });
  if (!name || !name.trim()) return;
  try {
    await postJSON("/xh/workflows/mkdir", { dir: name.trim() });
    toast("文件夹已建：" + name.trim());
    await refresh();
  } catch (e) {
    toast("建文件夹失败：" + (e.message || e));
  }
}
/** 原地重命名文件夹，并迁移浏览器里所有受影响的相对路径。 */
async function renameFolderUI(oldRel) {
  const oldName = oldRel.split("/").pop();
  const input = await XHAsk.text("重命名文件夹「" + oldName + "」", {
    defaultValue: oldName,
    placeholder: "输入新的文件夹名",
    okText: "重命名",
  });
  if (input === null) return;
  const name = input.trim();
  if (!name) { toast("文件夹名不能为空"); return; }
  if (name === oldName) return;
  try {
    const d = await postJSON("/xh/workflows/rename_dir", { rel: oldRel, name });
    migrateFolderPaths(oldRel, d.rel);
    toast("文件夹已改名为：" + name);
    await refresh();
  } catch (e) {
    toast("文件夹重命名失败：" + (e.message || e));
  }
}
/** 双击文件夹名 / 菜单「改名」：直接在侧栏行里原地改名，不弹对话框。 */
function startFolderRenameInline(rel) {
  if (!H || !H.side) return;
  const row = Array.from(H.side.querySelectorAll("[data-xh-fold]"))
    .find((el) => el.dataset.xhFold === rel);
  if (!row) { renameFolderUI(rel); return; }        // 行不在（比如刚好被重渲染）就退回对话框
  const lbl = row.querySelector(".xhwb-foldlbl");
  if (!lbl || lbl.isContentEditable) return;
  const old = rel.split("/").pop();
  lbl.classList.add("xhwb-editing");
  lbl.contentEditable = "plaintext-only";
  lbl.spellcheck = false;
  lbl.textContent = old;
  lbl.focus();
  try {                                             // 全选，直接输入即替换
    const range = document.createRange();
    range.selectNodeContents(lbl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) { /* 忽略 */ }
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    lbl.contentEditable = "false";
    lbl.classList.remove("xhwb-editing");
    const name = (lbl.textContent || "").trim();
    if (!save || !name || name === old) { renderSide(); return; }
    if (/[\\/]/.test(name)) { toast("文件夹名里不能带 / 或 \\"); renderSide(); return; }
    try {
      const d = await postJSON("/xh/workflows/rename_dir", { rel, name });
      migrateFolderPaths(rel, d.rel);
      toast("文件夹已改名为：" + name);
      await refresh();
    } catch (e) {
      toast("文件夹重命名失败：" + (e.message || e));
      renderSide();
    }
  };
  lbl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  lbl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
  lbl.addEventListener("pointerdown", (e) => e.stopPropagation());
  lbl.addEventListener("dragstart", (e) => e.preventDefault());
  lbl.addEventListener("blur", () => finish(true));
}

/** 删除整个文件夹（含子目录与里面的工作流），不可撤销 → 先问一句。 */
async function deleteFolderUI(rel) {
  if (!rel) return false;
  const name = rel.split("/").pop();
  const inside = allFiles().filter((x) => x.rel === rel || x.rel.startsWith(rel + "/")).length;
  const msg = "确定删除文件夹「" + name + "」吗？\n"
    + (inside ? ("里面还有 " + inside + " 个工作流，会一起删掉。\n") : "里面的子文件夹也会一起删掉。\n")
    + "删了找不回来。";
  if (!await XHAsk.confirm(msg, { danger: true, okText: "删除文件夹" })) return false;
  try {
    await postJSON("/xh/workflows/delete_dir", { rel });
  } catch (e) {
    toast("删除文件夹失败：" + (e.message || e));
    return false;
  }
  // 清掉指向这个目录的状态，避免收藏 / 备注 / 展开 / 选中还挂在已删除的路径上
  let favChanged = false;
  for (const k of Object.keys(STATE.favs || {})) {
    if (k === rel || k.startsWith(rel + "/")) { delete STATE.favs[k]; favChanged = true; }
  }
  if (favChanged) saveFavs();
  if (STATE.notes) {
    let noteChanged = false;
    for (const k of Object.keys(STATE.notes)) {
      if (k === rel || k.startsWith(rel + "/")) { delete STATE.notes[k]; noteChanged = true; }
    }
    if (noteChanged) store.set("notes", STATE.notes);
  }
  STATE.exp = (STATE.exp || []).filter((x) => x !== rel && !x.startsWith(rel + "/"));
  store.set("exp", STATE.exp);
  const cur = String(STATE.folder || "");
  if (cur === rel || cur.startsWith(rel + "/")) {
    STATE.folder = "__ALL__";
    store.set("folder", STATE.folder);
  }
  if (STATE.sel && (STATE.sel === rel || STATE.sel.startsWith(rel + "/"))) STATE.sel = null;
  toast("文件夹已删除：" + name);
  await refresh();
  return true;
}
/** 当前正被拖拽的工作流 rel（dragstart 记录）。 */
let DRAG_REL = null;
/** 记录上一次点击的文件夹行，用来识别“双击改名”（单击会 renderSide 重建行，原生 dblclick 抓不到）。 */
let _lastFoldClick = null;
/** 把工作流移到目标文件夹（dir="" = 移回根目录）。 */
async function moveWorkflow(rel, dir, dirLabel) {
  if (!rel) return;
  const f = allFiles().find((x) => x.rel === rel);
  if (f && (f.dir || "") === dir) { toast("它已经在这个文件夹里了"); return; }
  try {
    const d = await postJSON("/xh/workflows/move", { rel, dir });
    await migrateWorkflowImages(rel, d.rel);
    // 收藏按旧 rel 记的 → 迁移到新 rel
    if (STATE.favs[rel]) { STATE.favs[d.rel] = true; delete STATE.favs[rel]; saveFavs(); }
    if (STATE.sel === rel) STATE.sel = d.rel;
    toast("已移到：" + (dirLabel || "根目录"));
    await refresh();
  } catch (e) {
    toast("移动失败：" + (e.message || e));
  }
}
/** 相对时间（中文，学 早期版本 fmtWhen）。 */
function fmtWhen(secs) {
  if (!secs) return "";
  const d = (Date.now() - secs * 1000) / 1000;
  if (d < 90) return "刚刚";
  if (d < 3600) return Math.round(d / 60) + " 分钟前";
  if (d < 86400) return Math.round(d / 3600) + " 小时前";
  if (d < 86400 * 7) return Math.round(d / 86400) + " 天前";
  try { return new Date(secs * 1000).toLocaleDateString("zh-CN"); } catch (e) { return ""; }
}
function fmtFull(secs) {
  try { return new Date(secs * 1000).toLocaleString("zh-CN", { hour12: false }); } catch (e) { return String(secs); }
}

// ════════════════════════════════════════════════════════════════════
// 工作流操作：重命名 / 复制 / 删除 / 在资源管理器中显示
// 全部走 ComfyUI 官方的 /api/userdata 端点（app/user_manager.py）：
//   GET    /api/userdata/{file}                     读
//   POST   /api/userdata/{file}?overwrite=false     写（同名不覆盖，409）
//   POST   /api/userdata/{file}/move/{dest}         移动 / 重命名
//   DELETE /api/userdata/{file}                     删除
// 照 早期版本 api.mjs 的做法：不用自己写后端路由，直接用官方端点。
// ════════════════════════════════════════════════════════════════════

/** rel（相对 workflows 根）→ 官方 userdata 路径（workflows/xxx.json）。 */
function userdataPath(rel) {
  const r = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return "workflows/" + r;
}

/** 官方 userdata 端点的 url（app/user_manager.py: @routes.get("/userdata/{file}")）。
 *   aiohttp 的 {file} 只匹配一个路径段，**不跨斜杠** —— 所以 "workflows/a/b.json"
 *  必须把斜杠一起编码成 %2F（实测：不编码 → 404；编码 → 200 正常返回 json）。
 *  文件名里的中文等特殊字符照常逐段 encodeURIComponent。 */
function userdataUrl(rel) {
  const p = userdataPath(rel);
  return "/api/userdata/" + p.split("/").map(encodeURIComponent).join("%2F");
}

// ════════════════════════════════════════════════════════════════════
// 节点包归类：这个工作流用到了哪些节点包（custom node packs）
//
// 包名来自后端（__init__.py 的 _wf_node_index），取法照 ComfyUI server.py L857：
//   python_module = getattr(obj_class, "RELATIVE_PYTHON_MODULE", "nodes")
// 实测你机器上 3542 个节点类型分布在 257 个模块里，包名一目了然：
//   custom_nodes.Comfyui-XiaoHei / custom_nodes.comfyui-kjnodes / ...
//
//  为什么不在前端拉 /object_info 归类：全量 7.6MB（实测），每开一次面板拉一遍会卡。
//   后端直接读属性，零网络开销。
// ════════════════════════════════════════════════════════════════════

/** 把 python_module 变成人看得懂的包名。
 *  "custom_nodes.Comfyui-XiaoHei" → "Comfyui-XiaoHei"
 *  "comfy_extras.nodes_lt"           → "ComfyUI 内置"（核心节点） */
function packLabel(mod) {
  const s = String(mod || "");
  if (!s) return "未知来源";
  if (s === "nodes") return "ComfyUI 内置";
  if (s.startsWith("comfy_extras.")) return "ComfyUI 内置";
  // 前端 JS 注册的节点（后端表里没有，单独归一组）
  if (s === "custom_nodes.__frontend__") return "前端 JS 节点";
  let name = s;
  if (name.startsWith("custom_nodes.")) name = name.slice("custom_nodes.".length);
  // 有些包是多层（custom_nodes.a.b），取最后一段
  if (name.indexOf(".") > 0) name = name.split(".").pop();
  return name || s;
}

/** 核心节点（ComfyUI 自带）不算「节点包」，单独拎出来。 */
function isCorePack(mod) {
  const s = String(mod || "");
  return !s || s === "nodes" || s.startsWith("comfy_extras.");
}

/** 前端 JS 节点归类：这些节点由前端注册（不在后端 /object_info 里），
 *  但 ComfyUI 的 LiteGraph / nodeDef store 里有它们的完整清单，
 *  所以能准确判断「已装」还是「真缺失」。
 *   为什么需要它：ComfyUI 里有一批节点是**前端 JS 注册**的（新版 rgthree 的
 *     SetNode/GetNode、PromptAssistant 之类），它们**不在后端 /object_info 里**，
 *     所以后端判"缺失"会误报。ComfyUI 自己判断节点存不存在用的就是这套表
 *     （unpackSubgraph.ts L153: Object.hasOwn(LiteGraph.registered_node_types, node.type)），
 *     我们用同一份判据，最准。
 *  两路并用：
 *     ① pinia 的 nodeDef store（nodeDefsByName）—— 后端定义 + 前端注册，合并后的完整清单
 *     ② LiteGraph.registered_node_types —— 全局注册表，兜底 */
function frontendKnownTypes() {
  const out = new Set();
  try {
    const pinia = document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia;
    const st = pinia?._s?.get("nodeDef");
    const byName = st?.nodeDefsByName;
    if (byName && typeof byName === "object") {
      for (const k of Object.keys(byName)) out.add(k);
    }
  } catch (e) { /* 忽略 */ }
  try {
    const lg = window.LiteGraph;
    if (lg && lg.registered_node_types) {
      for (const k of Object.keys(lg.registered_node_types)) out.add(k);
    }
  } catch (e) { /* 忽略 */ }
  return out;
}

/** 重命名（只改文件名，留在原文件夹）。 */
async function renameWorkflow(rel, newName) {
  const name = String(newName || "").trim();
  if (!name) return null;
  const oldLeaf = rel.split("/").pop();
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  const newLeaf = name.toLowerCase().endsWith(".json") ? name : name + ".json";
  if (newLeaf === oldLeaf) return null;
  const newRel = dir ? dir + "/" + newLeaf : newLeaf;
  // 先探一下目标在不在（官方 overwrite=false 也会挡，但先给个清楚提示）
  try {
    const head = await fetch(userdataUrl(newRel) + "?overwrite=false", { method: "HEAD" });
    if (head.ok) throw new Error("已经有一个叫「" + newLeaf + "」的工作流了");
  } catch (e) {
    if (e && /已经有一个/.test(String(e.message))) throw e;
    // HEAD 404 / 网络错误 → 说明没有同名文件，继续
  }
  const r = await fetch(userdataUrl(rel) + "/move/" + encodeURIComponent(userdataPath(newRel)), { method: "POST" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 409) throw new Error("已经有一个叫「" + newLeaf + "」的工作流了");
    throw new Error("重命名失败：" + (t || r.status));
  }
  await migrateWorkflowImages(rel, newRel);
  return newRel;
}

/** 复制一份（放在同一文件夹，名字加 " (2)"）。官方 overwrite=false 挡重复。 */
async function duplicateWorkflow(rel) {
  const leaf = rel.split("/").pop();
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  const dot = leaf.lastIndexOf(".");
  const base = dot > 0 ? leaf.slice(0, dot) : leaf;
  const ext = dot > 0 ? leaf.slice(dot) : ".json";
  let newLeaf = base + " (2)" + ext;
  let n = 2;
  for (;;) {
    const cand = dir ? dir + "/" + newLeaf : newLeaf;
    let exists = false;
    try {
      const head = await fetch(userdataUrl(cand), { method: "HEAD" });
      exists = head.ok;
    } catch (e) { exists = false; }
    if (!exists) break;
    n++;
    newLeaf = base + " (" + n + ")" + ext;
  }
  const newRel = dir ? dir + "/" + newLeaf : newLeaf;
  // 官方端点读原文 → 原样写到新路径（overwrite=false 保证不会覆盖）
  const src = await fetch(userdataUrl(rel));
  if (!src.ok) throw new Error("读取原文件失败");
  const body = await src.text();
  const r = await fetch(userdataUrl(newRel) + "?overwrite=false", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body,
  });
  if (!r.ok) {
    if (r.status === 409) throw new Error("已经有一个叫「" + newLeaf + "」的工作流了");
    throw new Error("复制失败：" + r.status);
  }
  return newRel;
}

/** 删除（不可撤销，所以先问一句 —— 作者也是这么做的）。 */
async function deleteWorkflow(rel) {
  if (!await XHAsk.confirm("确定删除「" + rel.split("/").pop() + "」吗？\n删了找不回来。", { danger: true, okText: "删除" })) return false;
  const r = await fetch(userdataUrl(rel), { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error("删除失败：" + r.status);
  return true;
}

/** 删掉一个工作流文件，并把收藏 / 备注 / 选中状态一起清干净。 */
async function deleteFileUI(rel) {
  try {
    const ok = await deleteWorkflow(rel);
    if (!ok) return false;
    await clearWorkflowImages(rel);
    delete STATE.favs[rel];
    if (STATE.notes) delete STATE.notes[rel];
    saveFavs();
    store.set("notes", STATE.notes || {});
    if (STATE.sel === rel) STATE.sel = null;
    toast("已删除");
    await refresh();
    return true;
  } catch (e) {
    toast("删除失败：" + (e.message || e));
    return false;
  }
}

/** 把「当前画布上打开的工作流」另存到指定文件夹（照 早期版本 的 "Save open workflow here"）。
 *  用官方 store 的 saveAs + saveWorkflow：saveAs 造一个新的 ComfyWorkflow 对象，
 *  saveWorkflow 才真正落盘（workflowStore.ts L220-241 / workflowService.ts L300-309）。 */
async function saveOpenWorkflowTo(dir) {
  const store = getWorkflowStore();
  const active = store && store.activeWorkflow;
  if (!active) { toast("当前没有打开的工作流"); return false; }
  const leaf = (active.path || "").split("/").pop().replace(/\.json$/i, "") || "未命名";
  const name = await XHAsk.text("存到「" + (dir || "根目录") + "」下叫什么名字？", { defaultValue: leaf });
  if (!name || !name.trim()) return false;
  const newLeaf = name.trim().toLowerCase().endsWith(".json") ? name.trim() : name.trim() + ".json";
  const newPath = "workflows/" + (dir ? dir + "/" : "") + newLeaf;
  try {
    // 官方端点挡重复（overwrite=false → 409）
    // 斜杠必须编码成 %2F（aiohttp 的 {file} 不跨斜杠，实测）
    const enc = newPath.split("/").map(encodeURIComponent).join("%2F");
    const head = await fetch("/api/userdata/" + enc, { method: "HEAD" });
    if (head.ok) { toast("已经有一个叫「" + newLeaf + "」的了"); return false; }
    let target = active;
    if (typeof store.saveAs === "function") {
      target = store.saveAs(active, newPath);
      if (typeof store.openWorkflow === "function") { try { await store.openWorkflow(target); } catch (e) { /* 忽略 */ } }
    } else {
      // 兜底：没有 saveAs 就退回官方 HTTP 端点直接写
      const body = active.activeState ? JSON.stringify(active.activeState) : (active.content || "{}");
      const r = await fetch("/api/userdata/" + enc + "?overwrite=false", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body,
      });
      if (!r.ok) throw new Error(r.status === 409 ? "已经有一个叫「" + newLeaf + "」的了" : ("保存失败：" + r.status));
    }
    if (target && typeof store.saveWorkflow === "function") {
      target.changeTracker?.prepareForSave?.();
      await store.saveWorkflow(target);
    }
    toast("已存到：" + (dir ? dir + "/" : "") + newLeaf);
    await refresh();
    return true;
  } catch (e) {
    toast("保存失败：" + (e.message || e));
    return false;
  }
}
function hueFor(t) {
  let h = 0;
  const s = String(t);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
// 2026-11-18：文件夹色块支持手动自定义。有自定义色用自定义，否则退回 hueFor 自动色。
function dotColorOf(key, hue) {
  const custom = STATE.fcolors && STATE.fcolors[key];
  return (typeof custom === "string" && /^#[0-9a-f]{6}$/i.test(custom)) ? custom : ("hsl(" + hue + ",40%,52%)");
}
/** hsl(h,40%,52%) -> #RRGGBB，给原生取色器当初始值 */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return ("#" + f(0) + f(8) + f(4)).toUpperCase();
}
function saveFColors() { store.set("fcolors", STATE.fcolors); }

//  2026-11-18：色块点开先弹预设色板（12 常用色 + 自定义 + 恢复自动），
//    只有点「自定义…」才走系统原生取色器（原生对话框没法塞预设色）。
const DOT_PRESET_COLORS = [
  ["#F0C070", "经典金"], ["#E08A3C", "暖橙"], ["#D9534F", "砖红"],
  ["#D4537E", "玫粉"], ["#7F77DD", "紫罗兰"], ["#378ADD", "天蓝"],
  ["#1D9E75", "青绿"], ["#639922", "草绿"], ["#0F6E56", "松绿"],
  ["#888780", "石板灰"], ["#2C2C2A", "墨黑"], ["#F1EFE8", "浅灰"],
];
let _dotPalCleanup = null;
function closeDotPalette() {
  if (_dotPalCleanup) { try { _dotPalCleanup(); } catch (e) {} _dotPalCleanup = null; }
}
/** 点色块弹预设色板；选完存 fcolors[key] 并重刷。右键色块 = 恢复自动色。 */
function openDotPicker(key, hue, dotEl) {
  closeDotPalette();
  const cur = STATE.fcolors && STATE.fcolors[key];
  const curHex = /^#[0-9a-f]{6}$/i.test(cur || "") ? cur.toUpperCase() : null;

  const pal = document.createElement("div");
  pal.className = "xhwb-dotpal";
  const head = document.createElement("div");
  head.className = "xhwb-dotpal-h";
  head.textContent = "选个颜色 · 点一下就换";
  pal.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "xhwb-dotpal-g";
  const commit = (hex) => {
    if (!STATE.fcolors) STATE.fcolors = {};
    STATE.fcolors[key] = hex;
    saveFColors();
    closeDotPalette();
    renderSide();
    toast("色块已换成 " + hex);
  };
  for (const [hex, name] of DOT_PRESET_COLORS) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "xhwb-dotpal-sw" + (hex === curHex ? " on" : "");
    sw.style.background = hex;
    sw.title = name + " " + hex;
    sw.setAttribute("data-xh-icon-done", "1");   // 别被图标 sweep 清掉背景
    sw.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); commit(hex); });
    grid.appendChild(sw);
  }
  pal.appendChild(grid);

  const foot = document.createElement("div");
  foot.className = "xhwb-dotpal-f";
  const bCustom = document.createElement("button");
  bCustom.type = "button";
  bCustom.className = "xhwb-dotpal-btn";
  bCustom.textContent = "自定义…";
  bCustom.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    closeDotPalette();
    openSystemPicker(key, hue, dotEl);
  });
  const bAuto = document.createElement("button");
  bAuto.type = "button";
  bAuto.className = "xhwb-dotpal-btn";
  bAuto.textContent = "恢复自动";
  bAuto.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (STATE.fcolors && STATE.fcolors[key]) { delete STATE.fcolors[key]; saveFColors(); }
    closeDotPalette();
    renderSide();
    toast("已恢复自动色块");
  });
  foot.appendChild(bCustom); foot.appendChild(bAuto);
  pal.appendChild(foot);

  //  浮层挂 body（面板窗口 overflow:hidden 会裁掉它），z-index 高于窗口 1300。
  document.body.appendChild(pal);
  const r = dotEl.getBoundingClientRect();
  pal.style.left = Math.max(6, Math.min(r.left, window.innerWidth - pal.offsetWidth - 6)) + "px";
  let top = r.bottom + 6;
  if (top + pal.offsetHeight > window.innerHeight - 6) top = r.top - pal.offsetHeight - 6;
  pal.style.top = Math.max(6, top) + "px";

  const onDoc = (e) => { if (!pal.contains(e.target)) closeDotPalette(); };
  const onKey = (e) => { if (e.key === "Escape") closeDotPalette(); };
  setTimeout(() => {
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  _dotPalCleanup = () => {
    document.removeEventListener("pointerdown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
    try { pal.remove(); } catch (e) {}
  };
}

/** 系统原生取色器（只有点色板「自定义…」才会走这里）。 */
function openSystemPicker(key, hue, dotEl) {
  const cur = STATE.fcolors && STATE.fcolors[key];
  const input = document.createElement("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(cur || "") ? cur : hslToHex(hue, 40, 52);
  input.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;";
  document.body.appendChild(input);
  const done = () => {
    const v = input.value;
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      if (!STATE.fcolors) STATE.fcolors = {};
      STATE.fcolors[key] = v.toUpperCase();
      saveFColors();
      renderSide();
    }
    try { input.remove(); } catch (e) {}
  };
  input.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(input.value) && dotEl) dotEl.style.background = input.value;
  });
  input.addEventListener("change", done);
  try { input.click(); } catch (e) { done(); }
}
/** 模型名展示：去扩展名、截短。 */
function modelShort(m) {
  const b = String(m || "").replace(/\.(safetensors|ckpt|pt|pth|gguf|sft)$/i, "");
  return b.length > 22 ? b.slice(0, 21) + "…" : b;
}

// ----------------------------- 状态 -----------------------------
const STATE = {
  data: null,          // 后端返回 {root,folders,files}
  folder: store.get("folder", "__ALL__"),
  q: "",
  view: store.get("view", "list"),
  sort: store.get("sort", "recent"),   // recent | name | nodes
  k: store.get("k", "m"),              // s | m | l  （字号三档）
  sel: null,           // 当前选中的 rel
  favs: store.get("favs", {}),         // rel -> true
  notes: store.get("notes", {}),       // rel -> 备注（照 早期版本 meta.notes，可搜索）
  exp: store.get("exp", []),           // 照 早期版本 folderExpanded：展开的文件夹路径列表
  fcolors: store.get("fcolors", {}),   // 2026-11-18：文件夹路径 -> 自定义色块色（#RRGGBB）；没有则用 hueFor 自动色
  images: {},                          // 2026-11-18：自定义示例图 rel -> [{name, v}]，第一张作封面
  panel: null,
  open: false,
};

function saveFavs() { store.set("favs", STATE.favs); }
/** 目录改名后，只迁移该目录及其后代路径，避免误伤同前缀目录。 */
function migrateFolderPaths(oldRel, newRel) {
  const remap = (path) => {
    const p = String(path || "");
    if (p === oldRel) return newRel;
    return p.startsWith(oldRel + "/") ? newRel + p.slice(oldRel.length) : p;
  };
  const remapKeys = (obj) => {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) out[remap(key)] = value;
    return out;
  };
  STATE.folder = remap(STATE.folder);
  STATE.sel = STATE.sel ? remap(STATE.sel) : STATE.sel;
  STATE.exp = [...new Set((STATE.exp || []).map(remap))];
  STATE.favs = remapKeys(STATE.favs);
  STATE.notes = remapKeys(STATE.notes);
  STATE.fcolors = remapKeys(STATE.fcolors);
  store.set("folder", STATE.folder);
  store.set("exp", STATE.exp);
  saveFavs();
  store.set("notes", STATE.notes);
  saveFColors();
}
function setK(k) {
  STATE.k = k;
  store.set("k", k);
  document.documentElement.style.setProperty("--xhwb-k", k === "s" ? 1 : k === "l" ? 1.32 : 1.15);
}

// ----------------------------- 样式 -----------------------------
function injectCSS() {
  ensureToolbarButtonCSS();   // 顶栏按钮样式（三个面板共用）
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = `
/* 窗口尺寸完全由 JS 内联像素控制（照 早期版本 window.mjs 复刻）：CSS 不写
   width/height，因此不存在 !important 硬上限与内联值打架。默认 1240x780、最小
   620x340，可拖大，钳制在视口留边内，永远盖不住画布。 */
.xhwb-win {
  position: fixed; z-index: 1300; display: flex; flex-direction: column;
  background: var(--xh-surface); border: 1px solid var(--xh-border); border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0,0,0,.6);
  color: var(--xh-text); font-family: inherit; font-size: ${z(13)}; line-height: 1.55;
  overflow: hidden; user-select: none;
}
/* ── 顶栏按钮：平时融进官方风格，面板打开时才亮出家族色 ──
   照 早期版本 css.mjs L64-71 的做法：用官方 .comfyui-button class + !important 覆盖，
   所以边框、圆角、字体跟官方按钮完全一致，只是底色被压成灰。
   （具体样式在 XH_TB_CSS 里，由 ensureToolbarButtonCSS() 注入，三个面板共用） */
.xhwb-title {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 8px 10px; background: var(--xh-title-bg); border-bottom: 1px solid var(--xh-border); cursor: move;
}
.xhwb-title.xhwb-dragging { cursor: grabbing; }
.xhwb-logo {
  /*  2026-11-11：里面那枚「XH」字母已换成自家图标库的小狗爪（CSS mask + currentColor）。
     底色仍是主色黄，图案色继承本行的 color ⇒ 深墨，黄底白图案看不清的问题不会复发。 */
  width: ${z(17)}; height: ${z(17)}; border-radius: 4px; background: var(--xh-primary);
  color: var(--xh-on-primary, #1c1c1c); font-size: ${z(9)}; font-weight: 800; display: flex; align-items: center; justify-content: center;
  letter-spacing: -.02em; flex: none;
}
.xhwb-name { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--xh-text-strong, #1c1c1c); font-size: ${z(12.5)}; }
.xhwb-count { color: var(--xh-sub); font-size: ${z(11)}; font-weight: 400; }
.xhwb-sp { flex: 1; }
.xhwb-wbtn {
  border: none; border-radius: 5px; padding: 3px 8px; cursor: pointer;
  background: var(--xh-hover); color: var(--xh-sub); font-family: inherit; font-size: ${z(12)};
}
.xhwb-wbtn:hover { background: var(--xh-primary); color: var(--xh-on-primary); }

/* 工具栏 */
.xhwb-bar {
  display: flex; align-items: center; gap: 7px; flex: none; flex-wrap: wrap;
  padding: 8px 10px; background: var(--xh-card); border-bottom: 1px solid var(--xh-border);
}
.xhwb-search { position: relative; flex: 1; min-width: 110px; }
.xhwb-search input {
  width: 100%; background: var(--xh-surface); border: 1px solid var(--xh-border); color: var(--xh-text);
  border-radius: 6px; padding: 5px 9px; font-family: inherit; font-size: ${z(12.5)}; outline: none;
}
.xhwb-search input::placeholder { color: var(--xh-sub); }
.xhwb-search input:focus { border-color: var(--xh-primary); }
.xhwb-rename-input {
  width: 100%; box-sizing: border-box;
  padding: 6px 8px; margin: 2px 0 6px;
  background: var(--xh-input-bg); color: var(--xh-text);
  border: 1px solid var(--xh-primary); border-radius: 6px;
  font-size: 13px; font-weight: 600; outline: none;
}
.xhwb-rename-input:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--xh-primary) 30%, transparent); }
.xhwb-seg { display: flex; border: 1px solid var(--xh-border); border-radius: 6px; overflow: hidden; flex: none; }
.xhwb-seg button {
  border: none; background: var(--xh-hover); color: var(--xh-sub); cursor: pointer;
  padding: 4px 9px; font-family: inherit; font-size: ${z(11.5)};
}
.xhwb-seg button:hover { color: var(--xh-text-strong, #1c1c1c); }
.xhwb-seg button.on { background: var(--xh-primary); color: var(--xh-on-primary); }
/* 字号档位：中文「小 / 中 / 大」（原来用三个字母 A，用户嫌看不懂） */
.xhwb-sizeseg button {
  font-weight: 700; padding: 3px 9px; line-height: 1.15; align-self: stretch;
  min-width: 26px;
}
.xhwb-sizeseg button[data-k="s"] { font-size: ${z(10)}; }
.xhwb-sizeseg button[data-k="m"] { font-size: ${z(12)}; }
.xhwb-sizeseg button[data-k="l"] { font-size: ${z(14)}; }
.xhwb-tbtn {
  border: 1px solid var(--xh-border); background: var(--xh-hover); color: var(--xh-text);
  border-radius: 6px; padding: 5px 10px; cursor: pointer; white-space: nowrap;
  font-family: inherit; font-size: ${z(11.5)};
  transition: background .12s, border-color .12s, color .12s;
}
.xhwb-tbtn:hover { border-color: var(--xh-primary); color: var(--xh-text-strong, #1c1c1c); }
/* ⏱ 2026-11-17：常态 = 主题标题色（classic=暖黑），hover 才亮琥珀金（瞬时信号） */
.xhwb-tbtn.xhwb-primary { background: var(--xh-rest,#1A1613); border-color: var(--xh-rest-bd,rgba(255,255,255,.28)); color: var(--xh-on-rest,#fff); }
.xhwb-tbtn.xhwb-primary:hover { background: var(--xh-primary,#E8A33C); border-color: var(--xh-primary,#E8A33C); color: var(--xh-on-primary,#1c1c1c); filter: none; }

/* 主体三栏 */
.xhwb-body { display: flex; flex: 1; min-height: 0; }
.xhwb-side { width: ${z(320)}; min-width: ${z(130)}; flex: none; background: var(--xh-card); overflow-y: auto; padding: 8px 6px; }
.xhwb-sidegrip, .xhwb-detgrip { width: 6px; flex: none; cursor: ew-resize; background: transparent; z-index: 2; }
.xhwb-sidegrip::after, .xhwb-detgrip::after {
  content: ""; display: block; width: 1px; height: 100%; margin-left: 2px;
  background: var(--xh-border); transition: background .12s;
}
.xhwb-sidegrip:hover::after, .xhwb-sidegrip.xhwb-dragging::after,
.xhwb-detgrip:hover::after, .xhwb-detgrip.xhwb-dragging::after { background: var(--xh-primary); width: 3px; margin-left: 1px; }
.xhwb-grouphead {
  font-size: ${z(9.5)}; font-weight: 700; color: var(--xh-sub); text-transform: uppercase;
  letter-spacing: .07em; padding: 9px 7px 4px;
}
/* 详情页示例图相册（第一张 = 封面） */
.xhwb-imgbar { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.xhwb-imgbar .xhwb-grouphead { padding: 9px 0 4px; }
.xhwb-imgbar .xhwb-tbtn { padding: 2px 8px; font-size: ${z(10)}; }
.xhwb-imgnone { color: var(--xh-sub); font-size: ${z(10)}; line-height: 1.5; padding: 2px 0 4px; }
.xhwb-imggrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; padding-bottom: 4px; }
.xhwb-imgcell {
  position: relative; aspect-ratio: 1 / 1; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--xh-border, rgba(255,255,255,.12)); background: var(--xh-input-bg, #1d1d1d);
}
.xhwb-imgcell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.xhwb-imgbadge {
  position: absolute; left: 3px; top: 3px; padding: 1px 4px; border-radius: 3px;
  background: rgba(0,0,0,.62); color: #fff; font-size: ${z(8)}; pointer-events: none;
}
.xhwb-imgops {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 3px; background: rgba(0,0,0,.55); opacity: 0; transition: opacity .12s;
}
.xhwb-imgcell:hover .xhwb-imgops { opacity: 1; }
.xhwb-imgop {
  border: 0; border-radius: 3px; padding: 2px 6px; background: rgba(255,255,255,.92);
  color: #222; font-size: ${z(9)}; cursor: pointer;
}
.xhwb-imgop.danger { background: #f07167; color: #fff; }
.xhwb-fold {
  display: flex; align-items: center; gap: 7px; width: 100%; text-align: left;
  background: none; border: none; border-left: 3px solid transparent; cursor: pointer; color: var(--xh-text);
  font-family: inherit; font-size: ${z(11.5)}; padding: 4px 7px; border-radius: 5px;
  box-sizing: border-box; transition: background .12s, color .12s, border-color .12s;
}
/* 2026-11-18：hover 要「跳出来」——左侧主题色竖条 + 底色提亮 + 文字变亮 */
.xhwb-fold:hover {
  border-left-color: var(--xh-primary, #E8A33C);
  background: color-mix(in srgb, var(--xh-primary, #E8A33C) 16%, var(--xh-hover));
  color: var(--xh-text-strong, #1c1c1c);
}
.xhwb-fold:hover .xhwb-foldlbl { color: var(--xh-text-strong, #1c1c1c); }
.xhwb-fold:hover .xhwb-cnt { color: var(--xh-text-strong, #1c1c1c); }
/* 文件夹行尾的「⋯」：只占一个字符宽，hover 才显形，避免挤压文件名 */
.xhwb-foldmore {
  flex: none; padding: 0 2px; border-radius: 3px; color: var(--xh-sub);
  font-size: ${z(13)}; line-height: 1.2; opacity: 0; cursor: pointer; transition: opacity .12s;
}
.xhwb-fold:hover .xhwb-foldmore, .xhwb-foldmore:focus-visible { opacity: 1; }
.xhwb-foldmore:hover, .xhwb-foldmore:focus-visible {
  color: var(--xh-text-strong, #1c1c1c); background: var(--xh-hover); outline: none;
}
/* 双击文件夹名后的原地改名：临时放开省略号/选中限制 */
.xhwb-foldlbl.xhwb-editing {
  overflow: visible; text-overflow: clip; white-space: nowrap; cursor: text;
  user-select: text; outline: 1px solid var(--xh-primary); outline-offset: 1px;
  border-radius: 3px; background: var(--xh-input-bg); color: var(--xh-text);
}
/* 工作流卡片右键菜单 */
.xhwb-ctx {
  position: fixed; z-index: 1500; min-width: 132px; padding: 4px; border-radius: 8px;
  background: var(--xh-card); border: 1px solid var(--xh-border, rgba(255,255,255,.12));
  box-shadow: 0 10px 26px var(--xh-shadow);
}
.xhwb-ctxitem {
  display: block; width: 100%; text-align: left; padding: 6px 10px; border: 0; border-radius: 5px;
  background: transparent; color: var(--xh-text-strong, #eaeaea); font-size: ${z(11.5)}; cursor: pointer;
  white-space: nowrap;
}
.xhwb-ctxitem:hover { background: var(--xh-hover); }
.xhwb-ctxitem.danger { color: #f07167; }
.xhwb-ctxitem.danger:hover { background: #3a1f1c; color: #ff9d90; }
.xhwb-fold.on { color: var(--xh-on-primary-dim); background: color-mix(in srgb, var(--xh-primary) 15%, transparent); }
/* 选中行也要 hover 突出（.on 写在 :hover 后面会盖掉它，这里补回） */
.xhwb-fold.on:hover { border-left-color: var(--xh-primary, #E8A33C); background: color-mix(in srgb, var(--xh-primary) 26%, var(--xh-hover)); color: var(--xh-text-strong, #1c1c1c); }
.xhwb-fold.droptgt { color: var(--xh-on-primary-dim); background: color-mix(in srgb, var(--xh-primary) 32%, transparent); outline: 1px dashed var(--xh-primary); outline-offset: -2px; }
.xhwb-newfold { color: var(--xh-sub); font-size: ${z(10)}; cursor: pointer; margin-left: auto; padding: 1px 5px; border-radius: 4px; flex: none; }
.xhwb-newfold:hover { color: var(--xh-text-strong, #1c1c1c); background: var(--xh-hover); }
.xhwb-toast {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: 22px; z-index: 1400;
  background: var(--xh-card); color: var(--xh-text-strong, #1c1c1c); border: 1px solid var(--xh-primary); border-radius: 8px;
  padding: 8px 14px; font-size: ${z(12)}; box-shadow: 0 8px 24px var(--xh-shadow); pointer-events: none;
  opacity: 0; transition: opacity .18s;
}
.xhwb-toast.show { opacity: 1; }
.xhwb-fold .xhwb-cnt { margin-left: auto; font-size: ${z(9.5)}; color: var(--xh-sub); font-variant-numeric: tabular-nums; padding-left: 6px; flex: none; }
.xhwb-fold .xhwb-dot { width: ${z(9)}; height: ${z(9)}; border-radius: 2px; flex: none; transition: width .12s, height .12s, box-shadow .12s; }
/* 2026-11-18：hover 时色块放大 + 描边（既突出，也好点中换色） */
.xhwb-fold .xhwb-dot { cursor: pointer; }
.xhwb-fold:hover .xhwb-dot { width: ${z(13)}; height: ${z(13)}; box-shadow: 0 0 0 2px var(--xh-card, #1c1c1c), 0 0 0 3px var(--xh-primary, #E8A33C); }
.xhwb-fold .xhwb-foldlbl { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* ── 2026-11-18：色块预设色板浮层（挂 body，z-index 高于窗口 1300）── */
.xhwb-dotpal {
  position: fixed; z-index: 1500; user-select: none;
  background: var(--xh-surface); border: 1px solid var(--xh-border); border-radius: 9px;
  box-shadow: 0 12px 32px var(--xh-shadow); padding: 9px 10px 10px;
  font-family: inherit; font-size: ${z(11)}; color: var(--xh-text);
}
.xhwb-dotpal-h { color: var(--xh-sub); font-size: ${z(10.5)}; margin-bottom: 8px; }
.xhwb-dotpal-g { display: grid; grid-template-columns: repeat(6, ${z(17)}); gap: ${z(6)}; }
.xhwb-dotpal-sw {
  width: ${z(17)}; height: ${z(17)}; border-radius: 4px; cursor: pointer; padding: 0;
  border: 1px solid rgba(128,128,128,.35); transition: transform .1s;
}
.xhwb-dotpal-sw:hover { transform: scale(1.16); }
.xhwb-dotpal-sw.on { outline: 2px solid var(--xh-text-strong, #fff); outline-offset: 1px; }
.xhwb-dotpal-f { display: flex; gap: ${z(6)}; margin-top: 10px; }
.xhwb-dotpal-btn {
  flex: 1; background: var(--xh-hover); color: var(--xh-text); cursor: pointer;
  border: 1px solid var(--xh-border); border-radius: 6px; padding: ${z(4)} 0;
  font-family: inherit; font-size: ${z(11)};
}
.xhwb-dotpal-btn:hover { background: var(--xh-primary); color: var(--xh-on-primary); border-color: var(--xh-primary); }
/* ── 嵌套树：缩进占位 + 展开箭头（照 早期版本 .wfb-nest / .wfb-chev）── */
.xhwb-nest { flex: none; }
.xhwb-chev {
  flex: none; width: ${z(11)}; text-align: center; cursor: pointer;
  color: var(--xh-sub); font-size: ${z(8)}; line-height: 1;
  transition: transform .12s ease; user-select: none;
}
.xhwb-chev.open { transform: rotate(90deg); }
.xhwb-chev:hover { color: var(--xh-primary); }
.xhwb-chevpad { flex: none; width: ${z(11)}; }
.xhwb-favstar { color: var(--xh-primary); font-size: ${z(12)}; line-height: 1; flex: none; width: ${z(13)}; text-align: center; }

/* 网格 / 列表 */
.xhwb-main { flex: 1; min-width: 320px; overflow-y: auto; padding: 10px; }
.xhwb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${z(132)}, 1fr)); gap: ${z(10)}; align-content: start; }
.xhwb-card {
  background: var(--xh-card); border: 1px solid var(--xh-border); border-radius: 7px; overflow: hidden;
  cursor: pointer; position: relative; transition: border-color .12s;
}
.xhwb-card:hover { border-color: var(--xh-primary); }
.xhwb-card.sel { border-color: var(--xh-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--xh-primary) 45%, transparent); }
.xhwb-cov { display: block; width: 100%; height: ${z(68)}; background: var(--xh-surface); object-fit: contain; }
.xhwb-cardname {
  padding: 5px 6px 1px; font-size: ${z(10.5)}; color: var(--xh-text); line-height: 1.3;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.xhwb-cardmeta { padding: 0 6px 6px; font-size: ${z(9)}; color: var(--xh-sub); }
.xhwb-cardmeta .xhwb-modtag { color: var(--xh-sub); }
.xhwb-star {
  position: absolute; top: 3px; right: 3px;
  width: ${z(26)}; height: ${z(26)}; display: flex; align-items: center; justify-content: center;
  font-size: ${z(17)}; line-height: 1; cursor: pointer; border-radius: 6px;
  color: var(--xh-text-strong, #1c1c1c); background: var(--xh-shadow);
  transition: background .12s, color .12s, transform .08s;
}
.xhwb-card:hover .xhwb-star { background: rgba(0,0,0,.55); }
.xhwb-star:hover { background: rgba(0,0,0,.7); transform: scale(1.12); }
/* 2026-11-18：卡片压暗背景时未收藏星必须白字才看得清；行内星背景是浅色，保持深字 */
.xhwb-card:hover .xhwb-star:not(.on),
.xhwb-star:not(.xhwb-rowstar):hover:not(.on) { color: #fff; }
.xhwb-star.on { color: var(--xh-primary); background: var(--xh-shadow); }
.xhwb-rowstar {
  position: static; width: ${z(20)}; height: ${z(20)}; font-size: ${z(15)};
  background: none; border-radius: 4px; margin-left: 4px; flex: none;
}
.xhwb-rowstar:hover { background: rgba(255,255,255,.1); transform: scale(1.12); }
.xhwb-rowstar.on { background: none; }
/* 2026-11-18：实心星照 早期版本 用字符 ★ / ☆。
   ⛔ 家族 Lucide 星是描边 mask（fill:none），CSS 填不实，别再换回去。
   收藏态 = 家族主色实心；未收藏 = 亮灰空心（⛔ 别用 --xh-sub，在卡片上太灰看不清轮廓）。 */
.xhwb-star:not(.on) { color: var(--xh-text-strong, #1c1c1c); }
.xhwb-star.on { color: var(--xh-primary); }

.xhwb-list { display: flex; flex-direction: column; }
.xhwb-row {
  display: flex; align-items: center; gap: 9px; padding: 5px 7px; border-radius: 5px;
  cursor: pointer; font-size: ${z(11.5)}; color: var(--xh-text); border: 1px solid transparent;
}
.xhwb-row:hover { background: var(--xh-hover); color: var(--xh-text-strong, #1c1c1c); }
.xhwb-row.sel { border-color: var(--xh-primary); background: color-mix(in srgb, var(--xh-primary) 12%, transparent); color: var(--xh-text-strong, #1c1c1c); }
.xhwb-row .xhwb-rowcov { width: ${z(40)}; height: ${z(23)}; flex: none; border-radius: 3px; background: var(--xh-surface); object-fit: contain; }
.xhwb-row .xhwb-rowname { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xhwb-row .xhwb-rowfold {
  color: var(--xh-sub); font-size: ${z(10)}; margin-left: auto; white-space: nowrap;
  flex: 0 1 auto; min-width: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis;
}
.xhwb-row .xhwb-modtag { color: var(--xh-sub); font-size: ${z(10)}; white-space: nowrap; flex: none; }
.xhwb-empty { color: var(--xh-sub); font-size: ${z(12)}; padding: 26px 10px; text-align: center; }

/* 详情栏 */
.xhwb-detail { width: ${z(300)}; min-width: ${z(150)}; flex: none; background: var(--xh-side); overflow-y: auto; padding: 10px; }
.xhwb-detail.hidden { display: none; }
.xhwb-detcov { width: 100%; height: ${z(104)}; border-radius: 6px; background: var(--xh-surface); display: block; object-fit: contain; }
.xhwb-detname { color: var(--xh-text); font-size: ${z(12.5)}; font-weight: 600; margin: 8px 0 2px; line-height: 1.35; word-break: break-word; }
.xhwb-detpath { color: var(--xh-sub); font-size: ${z(10)}; margin-bottom: 9px; word-break: break-word; }
.xhwb-kv { display: flex; font-size: ${z(10.5)}; color: var(--xh-sub); padding: 2px 0; gap: 8px; }
.xhwb-kv b { color: var(--xh-text); font-weight: 500; margin-left: auto; text-align: right; }
.xhwb-modlist { margin: 6px 0 9px; }
/* 模型 / LoRA 的小分组标题 */
.xhwb-subhead {
  color: var(--xh-sub); font-size: ${z(9.5)}; font-weight: 600;
  letter-spacing: .04em; margin: 8px 0 3px;
}
/* LoRA 用不同颜色 */
.xhwb-mod.xhwb-modlora { border-color: var(--xh-primary); color: var(--xh-text); }
.xhwb-modname { flex: 1 1 auto; min-width: 0; word-break: break-all; }
.xhwb-modcopy {
  flex: none; width: ${z(20)}; height: ${z(20)}; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 3px; background: transparent;
  color: var(--xh-sub); cursor: pointer; opacity: .7;
}
.xhwb-modcopy:hover, .xhwb-modcopy:focus-visible {
  color: var(--xh-text); background: var(--xh-hover); opacity: 1; outline: none;
}
.xhwb-modcopy.ok { color: var(--xh-primary); opacity: 1; }
/* ── 节点包列表 ── */
.xhwb-packlist { margin: 6px 0 9px; display: flex; flex-direction: column; gap: 3px; }
.xhwb-pack {
  display: flex; align-items: center; gap: 7px;
  background: var(--xh-surface); border: 1px solid var(--xh-border); border-radius: 4px;
  padding: 4px 7px; font-size: ${z(10.5)}; line-height: 1.4;
}
.xhwb-packname {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--xh-text); font-weight: 500;
}
.xhwb-packcnt {
  flex: none; color: var(--xh-sub); font-size: ${z(9.5)};
  font-variant-numeric: tabular-nums; padding-left: 4px;
}
/* 缺少的节点 = 红色警告（装不上就跑不了） */
.xhwb-subhead.xhwb-warnhead { color: #f07167; }
.xhwb-mod.xhwb-modmissing { border-color: #4d2f2c; color: #f0a79e; }
.xhwb-warntip {
  color: #c99a94; font-size: ${z(9.5)}; line-height: 1.5; margin: 2px 0 5px;
}
.xhwb-mod {
  display: flex; align-items: center; gap: 5px;
  background: var(--xh-surface); border: 1px solid var(--xh-border);
  border-radius: 4px; padding: 3px 4px 3px 6px;
  font-size: ${z(10)}; margin-bottom: 3px; line-height: 1.4;
  color: var(--xh-text);
}
.xhwb-acts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
/* 备注框（照 早期版本 .wfb-note） */
.xhwb-note {
  width: 100%; box-sizing: border-box; min-height: ${z(46)}; resize: vertical;
  background: var(--xh-surface); border: 1px solid var(--xh-border); border-radius: 5px;
  color: var(--xh-text); font-family: inherit; font-size: ${z(10.5)}; line-height: 1.5;
  padding: 6px 7px; margin-bottom: 2px;
}
.xhwb-note:focus { outline: none; border-color: var(--xh-primary); }
/* 危险按钮（删除）——照 早期版本 .wfb-danger */
.xhwb-tbtn.xhwb-danger { color: #f07167; border-color: #4d2f2c; }
.xhwb-tbtn.xhwb-danger:hover { background: #3a1f1c; color: #ff9d90; }
.xhwb-acts .xhwb-tbtn { padding: 4px 8px; font-size: ${z(11)}; }
.xhwb-btnstar { color: var(--xh-text-strong, #1c1c1c); margin-right: 5px; font-size: ${z(12)}; }
.xhwb-btnstar.on { color: var(--xh-primary); }

/* 底部提示条 */
.xhwb-foot {
  display: flex; align-items: center; gap: 13px; flex: none; flex-wrap: wrap;
  padding: 6px 12px 6px 10px; background: var(--xh-card); border-top: 1px solid var(--xh-border);
  font-size: ${z(10)}; color: var(--xh-sub);
}
.xhwb-foot b {
  background: #2a2726; border: 1px solid var(--xh-border); border-radius: 3px; padding: 1px 5px;
  color: var(--xh-sub); font-weight: 500;
}
.xhwb-ver {
  border: 1px solid var(--xh-border); background: var(--xh-hover); color: var(--xh-sub);
  border-radius: 5px; padding: 2px 8px; font-family: inherit; font-size: ${z(10)}; white-space: nowrap;
}
.xhwb-vername { color: var(--xh-primary); font-weight: 600; }

/* 右下角缩放把手 */
.xhwb-grip {
  position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; z-index: 4;
}
.xhwb-grip::after {
  content: ""; position: absolute; right: 3px; bottom: 3px; width: 7px; height: 7px;
  border-right: 2px solid #333333; border-bottom: 2px solid #333333;
}
`;
  document.head.appendChild(style);
}

// ----------------------------- 缩略图 -----------------------------
/** 把后端给的节点方块画到 canvas 上（照 早期版本 cover.mjs::drawMap 精致化）。
 *  2026-11-18：原来只是纯色直角块被吐槽「太简陋」，照抄原作者四件事：
 *  ① 提亮（节点原色太暗，缩略图糊成一团）② 连线 ③ 圆角 ④ 留边 + 透明度。 */
function drawMap(cv, map) {
  if (!cv) return;
  const w = cv.clientWidth || 160;
  const h = cv.clientHeight || 60;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // canvas 2D 不认 CSS 变量：getComputedStyle 取真实值，读不到退回深灰
  let bg = "";
  try { bg = getComputedStyle(document.documentElement).getPropertyValue("--xh-surface").trim(); } catch (e) {}
  ctx.fillStyle = /^(#|rgb|hsl)/i.test(bg) ? bg : "#252525";
  ctx.fillRect(0, 0, w, h);
  // 空图也给条中线，不留黑洞（照作者 cover.mjs L113-121）
  if (!Array.isArray(map) || !map.length) {
    ctx.strokeStyle = "rgba(140,140,140,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.5); ctx.lineTo(w * 0.7, h * 0.5);
    ctx.stroke();
    return;
  }
  // 数据来自不可信的工作流文件：非数坐标会在 rAF 里抛错，先过滤（作者 L124-129 同款坑）
  const boxes = map.filter((b) => b && Number.isFinite(+b.x) && Number.isFinite(+b.y)
    && Number.isFinite(+b.w) && Number.isFinite(+b.h));
  if (!boxes.length) return;
  // 后端给的是绝对像素坐标 {x,y,w,h,c}，先归一化再按画布缩放。
  // 用 relit 色相算法绘制细节，不改后端契约（改后端要重启，前端能做的先做完）。
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (+b.x < minX) minX = +b.x;
    if (+b.y < minY) minY = +b.y;
    if (+b.x + +b.w > maxX) maxX = +b.x + +b.w;
    if (+b.y + +b.h > maxY) maxY = +b.y + +b.h;
  }
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const pad = Math.max(2, Math.min(6, Math.round(w * 0.06)));   // 小行图别被留边吃掉太多
  const iw = Math.max(1, w - pad * 2);
  const ih = Math.max(1, h - pad * 2);
  const s = Math.min(iw / bw, ih / bh);
  const ox = pad + (iw - bw * s) / 2 - minX * s;
  const oy = pad + (ih - bh * s) / 2 - minY * s;
  // 连线先画（方块盖上面）：真实 link 表没带，按阅读顺序连方块中心（作者 L137-148）
  ctx.strokeStyle = "rgba(120,150,180,.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    ctx.moveTo(ox + (+a.x + +a.w / 2) * s, oy + (+a.y + +a.h / 2) * s);
    ctx.lineTo(ox + (+b.x + +b.w / 2) * s, oy + (+b.y + +b.h / 2) * s);
  }
  ctx.stroke();
  // 圆角块 + 提亮：色相保留（同类节点同色），明度 50%→62%、饱和 45%，
  // 照原作者 lift() 目标——节点原色是给深色画布的标题色，缩略图里太暗。
  for (const b of boxes) {
    const x = ox + (+b.x) * s;
    const y = oy + (+b.y) * s;
    const rw = Math.max(2, (+b.w) * s);
    const rh = Math.max(2, (+b.h) * s);
    const hue = (((+b.c) % 360) + 360) % 360;
    ctx.fillStyle = "hsl(" + hue + ",45%,62%)";
    ctx.globalAlpha = 0.95;
    const r = Math.min(2, rw / 2, rh / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, rw, rh, r);
    else ctx.rect(x, y, rw, rh);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ----------------------------- 数据视图 -----------------------------
function allFiles() { return (STATE.data && STATE.data.files) || []; }

function visibleFiles() {
  let fs = allFiles().slice();
  const f = STATE.folder;
  if (f === "__FAVS__") fs = fs.filter((x) => STATE.favs[x.rel]);
  else if (f === "__RECENT__") {
    // 照作者 index.js L202：最近 = 按修改时间倒序，取前 20（同日期用文件夹名+文件名兜底）
    fs = fs.slice().sort((a, b) => (b.mtime || 0) - (a.mtime || 0) || byFolderName(a, b)).slice(0, 20);
  }
  else if (f === "__ROOT__") fs = fs.filter((x) => !(x.dir || ""));   // (散落文件)：根目录没进任何文件夹的
  else if (f !== "__ALL__") {
    // 照作者 index.js L206-208：点父文件夹 = 显示它自己和所有子文件夹里的文件
    // （作者注释：选了父却因为东西在下一层而什么都看不到，是很糟心的体验）
    fs = fs.filter((x) => { const d = x.dir || ""; return d === f || d.startsWith(f + "/"); });
  }
  if (STATE.q) {
    const q = STATE.q.toLowerCase();
    fs = fs.filter((x) =>
      x.name.toLowerCase().includes(q) ||
      (x.dir || "").toLowerCase().includes(q) ||
      (x.models || []).some((m) => m.toLowerCase().includes(q)) ||
      (x.loras || []).some((m) => m.toLowerCase().includes(q)) ||
      // 备注也要能搜（作者 detail.mjs 的备注框提示就写着 "Searchable"）
      ((STATE.notes && STATE.notes[x.rel]) || "").toLowerCase().includes(q)
    );
  }
  // 照作者 index.js L221-228：搜索结果已经按匹配度排好了，再按日期重排会把这个排版抹掉
  if (STATE.q || STATE.folder === "__RECENT__") return fs;
  const by = {
    recent: (a, b) => (b.mtime || 0) - (a.mtime || 0) || byFolderName(a, b),
    name: byFolderName,
    nodes: (a, b) => (b.nodes || 0) - (a.nodes || 0) || byFolderName(a, b),
  }[STATE.sort];
  if (by) fs = fs.slice().sort(by);
  return fs;
}

function folderCounts() {
  // 照 早期版本 folders.mjs L306-314：子文件夹里的工作流也算进所有父级，
  // 否则一个只装子文件夹的文件夹会显示成空的，计数和官方侧栏也对不上
  // （例：MinimaxH3 直下 36 + Herrgo 9 + 上下文 7 + 自研 3 = 官方 55）。
  const m = {};
  for (const f of allFiles()) {
    const d = f.dir || "";
    if (!d) continue;
    const parts = d.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const key = parts.slice(0, i).join("/");
      m[key] = (m[key] || 0) + 1;
    }
  }
  return m;
}

// ── 照 早期版本 sort.mjs + folders.mjs orderedFolders 复刻 ──
// 一个 Collator（作者注释：带 options 的 localeCompare 每次调用新建 Collator，慢 ~30 倍）：
// 忽略大小写、数字按数值比（"2." 排在 "10." 前）——中文按系统 locale 拼音排，
// 和 ComfyUI 官方侧栏顺序一致。
const FOLD_COLL = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
function foldByPath(a, b) { return FOLD_COLL.compare(a, b); }
/** 逐段比较：父文件夹永远排在它的子文件夹前面（作者 sort.mjs byFolder）。 */
function foldBySeg(a, b) {
  const x = a.split("/"), y = b.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = foldByPath(x[i], y[i]);
    if (c) return c;
  }
  return x.length - y.length;
}
/** 两条列表项：先比文件夹（逐段），再比文件名（作者 sort.mjs byFolderName）。 */
function byFolderName(a, b) {
  return foldBySeg(a.dir || "", b.dir || "") || foldByPath(a.name || "", b.name || "");
}
/** 按父分组逐层走树：父永远在子前，同级按 Collator 排（作者 folders.mjs orderedFolders）。 */
function orderedFolders(folders) {
  const kids = new Map();
  for (const f of folders) {
    const parent = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(f);
  }
  const out = [];
  const walk = (parent) => {
    const list = (kids.get(parent) || []).slice().sort(foldBySeg);
    for (const f of list) { out.push(f); walk(f); }
  };
  walk("");
  // 父不在列表里的孤儿文件夹追加在尾部，不许凭空消失（作者 L71-73）
  for (const f of folders) if (!out.includes(f)) out.push(f);
  return out;
}
/** 展开/收起一个文件夹（持久化，照作者 folderExpanded）。 */
function toggleFolder(path) {
  const s = new Set(STATE.exp || []);
  if (s.has(path)) s.delete(path); else s.add(path);
  STATE.exp = [...s];
  store.set("exp", STATE.exp);
  renderSide();
}

// ----------------------------- 渲染 -----------------------------
let H = null; // 面板 DOM 引用集合

// ── 窗口尺寸/位置：照 早期版本 的 makeRect() 思路复刻 ──
// 尺寸是 JS 内联像素（left/top/width/height），CSS 不写 width/height，
// 所以没有任何 !important 打架。默认 1240x780（2026-11-19 加宽，原 1040x720）、
// 最小 620x340，pref 只是首选不是上限（可拖大），钳制在视口留边 edge=24 内。
const WFB = { minW: 620, minH: 340, prefW: 1240, prefH: 780, edge: 24, homeX: 80, homeY: 60 };
// 三栏宽度：左栏 130~640、右栏 150~640（原来都卡在 420，拖不过去）；
// 中间列表至少留 MAIN_MIN，两条 grip 各 6px —— 上限还要按面板实际宽度动态收。
//  2026-11-20：左栏再加宽到 320（用户嫌目录太窄、分类名被截成「H3…」），右栏收到 300
//    —— 面板约 1015px 宽时中间列表仍有 ~380px，不浪费。窗口见 WFB.prefW。
const WFB_SIDE_MIN = 130, WFB_SIDE_MAX = 640, WFB_SIDE_DEF = 320;
const WFB_DET_MIN = 150, WFB_DET_MAX = 640, WFB_DET_DEF = 300;
const WFB_MAIN_MIN = 320, WFB_GRIP_W = 12;
/** 某一栏当前能拖到的最大宽度：不超过 640，也不把中间列表挤到 320 以下。 */
function _wfbColMax(which) {
  if (!H) return which === "side" ? WFB_SIDE_MAX : WFB_DET_MAX;
  // 🔴 2026-11-20 真凶：buildPanel() 时 root 还是 display:none ⇒ clientWidth/offsetWidth 全是 0
  //    ⇒ total - other - 12 - 320 是负数 ⇒ clamp 把两栏永远钉死在最小值 130/150，
  //    用户看到「左栏太窄、中间太宽」，改多少遍默认值都没用。
  //    用 _wfbApplyRect 已经写好的 H.rect.w 兜底（面板宽在隐藏时也算得出来）。
  const total = H.root.clientWidth || (H.rect && H.rect.w) || WFB.prefW;
  // 隐藏时 offsetWidth 同样是 0，退回到默认值参与运算，别让 0 混进去。
  const other = (which === "side" ? H.detail.offsetWidth : H.side.offsetWidth)
             || (which === "side" ? WFB_DET_DEF : WFB_SIDE_DEF);
  const ownMin = which === "side" ? WFB_SIDE_MIN : WFB_DET_MIN;
  const ownMax = which === "side" ? WFB_SIDE_MAX : WFB_DET_MAX;
  return Math.max(ownMin, Math.min(ownMax, total - other - WFB_GRIP_W - WFB_MAIN_MIN));
}
/** 打开面板时恢复上次拖好的左右栏宽度（之前只改 style，没存盘）。 */
function _wfbApplyCols() {
  if (!H) return;
  const sw = Number(store.get("sideW", WFB_SIDE_DEF)) || WFB_SIDE_DEF;
  const dw = Number(store.get("detW", WFB_DET_DEF)) || WFB_DET_DEF;
  H.side.style.width = Math.max(WFB_SIDE_MIN, Math.min(sw, _wfbColMax("side"))) + "px";
  H.detail.style.width = Math.max(WFB_DET_MIN, Math.min(dw, _wfbColMax("det"))) + "px";
}
/** 窗口被拖小 / 浏览器窗口变化时，把两栏收回到合法范围，保住中间列表。 */
function _wfbClampCols() {
  if (!H) return;
  // 面板隐藏时 offsetWidth 全是 0，clamp 会把栏宽压成最小值 ⇒ 隐藏时直接跳过。
  if (H.root.style.display === "none") return;
  H.side.style.width = Math.max(WFB_SIDE_MIN, Math.min(H.side.offsetWidth, _wfbColMax("side"))) + "px";
  H.detail.style.width = Math.max(WFB_DET_MIN, Math.min(H.detail.offsetWidth, _wfbColMax("det"))) + "px";
}
function _wfbDefaultRect() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const top = WFB.edge;
  const w = Math.max(WFB.minW, Math.min(WFB.prefW, vw - WFB.edge * 2));
  const h = Math.max(WFB.minH, Math.min(WFB.prefH, vh - top - WFB.edge));
  const x = Math.max(WFB.edge, Math.min(WFB.homeX, vw - w - WFB.edge));
  const y = Math.max(top, Math.min(Math.max(WFB.homeY, top), vh - h - WFB.edge));
  return { x, y, w, h };
}
function _wfbClampRect(r) {
  const d = _wfbDefaultRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  // 照 早期版本 clampRect：prefW/prefH 只是"默认尺寸"，不是上限！
  // 上限只有「视口 - 留边」（floating_window.mjs L145-146: min(r.w, vw - edge)）。
  // 之前错把 prefW=1040 当上限 → 窗口到 1040 就拖不大了。
  const w = Math.round(Math.max(WFB.minW, Math.min((r && r.w) || d.w, vw - WFB.edge)));
  const h = Math.round(Math.max(WFB.minH, Math.min((r && r.h) || d.h, vh - WFB.edge)));
  return {
    x: Math.round(Math.max(WFB.edge, Math.min((r && r.x != null) ? r.x : d.x, vw - w))),
    y: Math.round(Math.max(WFB.edge, Math.min((r && r.y != null) ? r.y : d.y, vh - h - WFB.edge))),
    w, h,
  };
}
function _wfbReadRect() {
  const s = store.get("win", null);
  if (s && typeof s === "object") return _wfbClampRect(s);
  return _wfbDefaultRect();
}
function _wfbApplyRect(rect) {
  if (!H) return;
  H.root.style.left = rect.x + "px";
  H.root.style.top = rect.y + "px";
  H.root.style.width = rect.w + "px";
  H.root.style.height = rect.h + "px";
  H.rect = rect;
}
function _wfbSaveRect() { if (H) store.set("win", H.rect); }

function buildPanel() {
  injectCSS();
  setK(STATE.k); // 恢复字号
  const root = document.createElement("div");
  root.id = "xh-wfb-root";
  root.className = "xhwb-win";   // 照 早期版本：外层 div 自己就是定位+尺寸的窗口，没有内层 wrapper
  root.style.display = "none";    // 默认隐藏，togglePanel 时才显示
  root.innerHTML =
    '  <div class="xhwb-title" id="xh-wfb-title">' +
    '    <span class="xhwb-logo" title="XiaoHei">' + xhIconHTML("小黑爪印", { size: 14, color: "current" }) + '</span>' +
    '    <span class="xhwb-name">工作流浏览器</span>' +
    '    <span class="xhwb-count" id="xh-wfb-count"></span>' +
    '    <span class="xhwb-sp"></span>' +
    '    <button class="xhwb-wbtn" id="xh-wfb-reset" title="重置窗口到默认大小/位置">' + xhIconHTML("maximize-2", { size: 13, color: "current" }) + '</button>' +
    '    <button class="xhwb-wbtn" id="xh-wfb-close">' + xhIconHTML("关闭", { size: 13, color: "current" }) + '</button>' +
    "  </div>" +
    '  <div class="xhwb-bar">' +
    '    <div class="xhwb-search" style="display:flex;align-items:center;gap:6px;">' + xhIconHTML("search", { size: 14, color: "current" }) + '<input id="xh-wfb-q" placeholder="搜索名字、模型、文件夹…" style="flex:1;width:auto;min-width:0"></div>' +
    '    <div class="xhwb-seg" id="xh-wfb-viewseg">' +
    '      <button data-v="grid">▦ 网格</button><button data-v="list"> 列表</button>' +
    "    </div>" +
    '    <div class="xhwb-seg xhwb-sizeseg" id="xh-wfb-sizeseg">' +
    //  2026-10-28 用户要求：三个「A」换中文字（用户原话「我想换中文字。大大大」）
    '      <button data-k="s" title="小">小</button><button data-k="m" title="中">中</button><button data-k="l" title="大">大</button>' +
    "    </div>" +
    '    <button class="xhwb-tbtn" id="xh-wfb-sort" title="点击切换排序方式" style="display:inline-flex;align-items:center;gap:5px;">' + xhIconHTML("sort-asc", { size: 14, color: "current" }) + '<span id="xh-wfb-sort-txt">排序: 最近修改</span></button>' +
    '    <button class="xhwb-tbtn" id="xh-wfb-openfolder" title="在资源管理器中打开 workflows 目录" style="display:inline-flex;align-items:center;gap:5px;">' + xhIconHTML("folder-open", { size: 14, color: "current" }) + ' 打开文件夹</button>' +
    '    <button class="xhwb-tbtn" id="xh-wfb-saveopen" title="把画布上当前打开的工作流另存到某个文件夹" style="display:inline-flex;align-items:center;gap:5px;">' + xhIconHTML("save", { size: 14, color: "current" }) + ' 存当前工作流</button>' +
    "  </div>" +
    '  <div class="xhwb-body">' +
    '    <div class="xhwb-side" id="xh-wfb-side"></div>' +
    '    <div class="xhwb-sidegrip" id="xh-wfb-sidegrip"></div>' +
    '    <div class="xhwb-main" id="xh-wfb-main"></div>' +
    '    <div class="xhwb-detgrip" id="xh-wfb-detgrip"></div>' +
    '    <div class="xhwb-detail" id="xh-wfb-detail"><div class="xhwb-empty"><div style="font-size:24px;opacity:.45;margin-bottom:6px;">' + xhIconHTML("folder-open", { size: 24, color: "current" }) + '</div>选一个工作流<br>看里面是什么</div></div>' +
    "  </div>" +
    '  <div class="xhwb-foot">' +
    "    <span><b>输入</b> 搜索</span><span><b>Enter</b> 打开</span><span><b>双击</b> 打开</span>" +
    "    <span><b>↑↓</b> 选择</span><span><b>Esc</b> 关闭</span>" +
    '    <span class="xhwb-sp"></span>' +
    '    <span class="xhwb-ver"><span class="xhwb-vername">XiaoHei</span></span>' +
    "  </div>" +
    '  <div class="xhwb-grip" id="xh-wfb-grip"></div>';
  document.body.appendChild(root);
  H = {
    root,
    win: root,
    title: root.querySelector("#xh-wfb-title"),
    count: root.querySelector("#xh-wfb-count"),
    q: root.querySelector("#xh-wfb-q"),
    viewseg: root.querySelector("#xh-wfb-viewseg"),
    sizeseg: root.querySelector("#xh-wfb-sizeseg"),
    sort: root.querySelector("#xh-wfb-sort"),
    side: root.querySelector("#xh-wfb-side"),
    main: root.querySelector("#xh-wfb-main"),
    detail: root.querySelector("#xh-wfb-detail"),
  };
  _wfbApplyRect(_wfbReadRect());   // 照 早期版本：尺寸/位置从持久化 rect 恢复并钳制在视口内（必须在 H 赋值之后）
  _wfbApplyCols();                 // 左右栏宽度也从 store 恢复
  window.addEventListener("resize", _wfbClampCols);

  // ---- 事件 ----
  root.querySelector("#xh-wfb-close").onclick = () => togglePanel(false);
  H.q.addEventListener("input", () => { STATE.q = H.q.value.trim().toLowerCase(); renderCount(); renderMain(); });
  H.viewseg.querySelectorAll("button").forEach((b) => {
    b.onclick = () => { STATE.view = b.dataset.v; store.set("view", STATE.view); renderSegs(); renderMain(); };
  });
  H.sizeseg.querySelectorAll("button").forEach((b) => {
    b.onclick = () => { setK(b.dataset.k); renderSegs(); };
  });
  H.sort.onclick = () => {
    const order = ["recent", "name", "nodes"];
    STATE.sort = order[(order.indexOf(STATE.sort) + 1) % order.length];
    store.set("sort", STATE.sort);
    renderSegs();
    renderMain();
  };
  root.querySelector("#xh-wfb-openfolder").onclick = () => {
    fetchJSON("/xh/workflows/openfolder").catch(() => {});
  };
  // 「存当前工作流」：把画布上打开的工作流另存到某个文件夹（照 早期版本 Save open workflow here）
  root.querySelector("#xh-wfb-saveopen").onclick = async () => {
    const folders = (STATE.data && STATE.data.folders) || [];
    // 默认目标 = 当前左侧选中的文件夹（选中的是特殊项时退回根目录）
    const cur = STATE.folder && STATE.folder.indexOf("__") !== 0 ? STATE.folder : "";
    const hint = folders.length
      ? (cur ? cur + "\n（可填子文件夹，如 " + cur + "/子目录）" : "留空 = 根目录\n可用文件夹：" + folders.slice(0, 8).join(" / "))
      : "留空 = 根目录";
    const dir = await XHAsk.text("存到哪个文件夹？\n" + hint, { defaultValue: cur });
    if (dir === null) return;
    saveOpenWorkflowTo(dir.trim());
  };
  //  2026-10-27：重置窗口尺寸/位置（清记忆 + 恢复默认），不依赖清浏览器缓存
  root.querySelector("#xh-wfb-reset").onclick = () => resetWin();

  makeDraggable();
  makeResizable();
  makeSideResizable();
  makeDetailResizable();
}

function makeDraggable() {
  const win = H.root;
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  H.title.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return; // 点按钮不拖
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    ox = win.offsetLeft; oy = win.offsetTop;
    H.title.classList.add("xhwb-dragging");
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const nx = Math.max(WFB.edge, Math.min(window.innerWidth - H.rect.w, ox + e.clientX - sx));
    const ny = Math.max(WFB.edge, Math.min(window.innerHeight - H.rect.h - WFB.edge, oy + e.clientY - sy));
    H.rect.x = nx; H.rect.y = ny;
    win.style.left = nx + "px";
    win.style.top = ny + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    H.title.classList.remove("xhwb-dragging");
    _wfbSaveRect();
  });
}

function makeResizable() {
  const grip = H.root.querySelector("#xh-wfb-grip");
  let sx = 0, sy = 0, ow = 0, oh = 0, on = false;
  grip.addEventListener("mousedown", (e) => {
    on = true;
    sx = e.clientX; sy = e.clientY;
    ow = H.root.offsetWidth; oh = H.root.offsetHeight;
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener("mousemove", (e) => {
    if (!on) return;
    //  2026-10-27 修复"拖缩放窗口瞬移到左上角"：
    // 之前只传 {w,h}，x/y 缺失 → 钳制函数填了默认出生坐标 (80,60)，每次 mousemove 都瞬移。
    // 照 早期版本：缩放时必须保留当前 x/y（clampRect 的 r.x/r.y ?? d.x 语义），只改 w/h。
    const r = _wfbClampRect({
      x: H.rect.x, y: H.rect.y,
      w: Math.max(WFB.minW, ow + e.clientX - sx),
      h: Math.max(WFB.minH, oh + e.clientY - sy),
    });
    _wfbApplyRect(r);
    _wfbClampCols();   // 窗口变窄时先把两栏收回来，别把中间列表挤没
  });
  document.addEventListener("mouseup", () => {
    if (!on) return;
    on = false;
    _wfbSaveRect();
  });
}

function makeSideResizable() {
  const grip = H.root.querySelector("#xh-wfb-sidegrip");
  const side = H.side;
  let sx = 0, ow = 0, on = false;
  grip.addEventListener("mousedown", (e) => { on = true; sx = e.clientX; ow = side.offsetWidth; grip.classList.add("xhwb-dragging"); e.preventDefault(); e.stopPropagation(); });
  document.addEventListener("mousemove", (e) => {
    if (!on) return;
    side.style.width = Math.max(WFB_SIDE_MIN, Math.min(_wfbColMax("side"), ow + e.clientX - sx)) + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!on) return;
    on = false;
    grip.classList.remove("xhwb-dragging");
    store.set("sideW", Math.round(side.offsetWidth));   // 记住这次拖到的宽度
  });
}

function makeDetailResizable() {
  const grip = H.root.querySelector("#xh-wfb-detgrip");
  const det = H.detail;
  let sx = 0, ow = 0, on = false;
  grip.addEventListener("mousedown", (e) => { on = true; sx = e.clientX; ow = det.offsetWidth; grip.classList.add("xhwb-dragging"); e.preventDefault(); e.stopPropagation(); });
  document.addEventListener("mousemove", (e) => {
    if (!on) return;
    det.style.width = Math.max(WFB_DET_MIN, Math.min(_wfbColMax("det"), ow - (e.clientX - sx))) + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!on) return;
    on = false;
    grip.classList.remove("xhwb-dragging");
    store.set("detW", Math.round(det.offsetWidth));     // 记住这次拖到的宽度
  });
}

function saveWin() { _wfbSaveRect(); }

/** 一键恢复默认窗口尺寸/位置：清掉旧记忆 + 重新套用默认（学 早期版本 applyRect(defaultRect)）。 */
function resetWin() {
  store.set("win", null);
  store.set("sideW", null);        // 左右栏宽度也一起回默认
  store.set("detW", null);
  _wfbApplyRect(_wfbDefaultRect());
  _wfbApplyCols();
  _wfbSaveRect();
  toast("窗口已重置为默认大小");
}

function renderSegs() {
  if (!H) return;
  H.viewseg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === STATE.view));
  H.sizeseg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === STATE.k));
  const names = { recent: "最近修改", name: "名称", nodes: "节点数" };
  const sortTxt = H.root.querySelector("#xh-wfb-sort-txt");
  if (sortTxt) sortTxt.textContent = "排序: " + names[STATE.sort];
  else H.sort.textContent = "排序: " + names[STATE.sort];
}

function renderCount() {
  if (!H || !H.count) return;
  // 照 早期版本 index.js L261-264：
  //   可见数 == 总数 → 只显示总数；否则显示「当前 of 总数」。
  //   作者面板上写的是 "21 of 307"（当前文件夹 21 个 / 库里一共 307 个），
  //   我们原来写死 "307 个工作流"，选进任何文件夹都不变 —— 少了这个上下文。
  const total = allFiles().length;
  const vis = visibleFiles().length;
  H.count.textContent = vis === total ? (total + " 个工作流") : (vis + " / " + total);
  H.count.title = vis === total ? ("共 " + total + " 个工作流") : ("当前显示 " + vis + " 个，共 " + total + " 个");
}

function renderSide() {
  if (!H) return;
  renderCount();   // 切文件夹后标题栏要变成「当前 of 总数」（照作者 index.js L262）
  const m = folderCounts();
  const side = H.side;
  side.textContent = "";
    const mk = (label, key, opts) => {
    const b = document.createElement("button");
    b.className = "xhwb-fold" + (STATE.folder === key ? " on" : "");
    // 分组/特殊项前缀图标（走自家图标库）
    if (opts && opts.icon) {
      const ic = document.createElement("span");
      ic.className = "xhwb-foldic";
      ic.style.cssText = "display:inline-flex;align-items:center;margin-right:5px;opacity:.85;";
      ic.innerHTML = xhIconHTML(opts.icon, { size: 14, color: "current" });
      b.appendChild(ic);
    }
    // ── 照 早期版本 folders.mjs addRow：缩进占位 → 展开箭头 → 色点 → 星 → 标签 → 计数 ──
    if (opts && opts.indent) {
      const sp = document.createElement("span");
      sp.className = "xhwb-nest";
      sp.style.width = (opts.indent * 11) + "px";
      b.appendChild(sp);
    }
    if (opts && opts.twisty) {
      // ▶ 展开/收起：点它不能同时选中文件夹，也不能触发拖放
      const c = document.createElement("span");
      c.className = "xhwb-chev" + (opts.twisty.open ? " open" : "");
      //  2026-11-13 家族图标统一：文件夹展开三角原来是 Unicode ▶，换成图标库 chevron-right。
      c.innerHTML = xhIconHTML("chevron-right", { size: 12, color: "current" });
      c.title = opts.twisty.open ? "收起" : "展开";
      c.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFolder(opts.twisty.path);
      });
      b.appendChild(c);
    } else if (opts && opts.twisty === null) {
      // 没有子文件夹的行补一个同宽占位，所有标签对齐同一列（作者 L159-176）
      const pad = document.createElement("span");
      pad.className = "xhwb-chevpad";
      b.appendChild(pad);
    }
    if (opts && opts.star) {
      const s = document.createElement("span");
      s.className = "xhwb-favstar";
      s.textContent = "";
      b.appendChild(s);
    }
    if (opts && opts.dot != null) {
      const d = document.createElement("span");
      d.className = "xhwb-dot";
      d.style.background = dotColorOf(key, opts.dot);
      const custom = STATE.fcolors && STATE.fcolors[key];
      d.title = custom ? ("色块已自定义 " + custom + "\n点一下换色 · 右键恢复自动") : "点一下给这个文件夹换个颜色 · 右键恢复自动";
      d.setAttribute("data-xh-icon-done", "1");   // 别被图标 sweep 清掉背景
      d.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();   // 不触发选中文件夹 / 拖放
        openDotPicker(key, opts.dot, d);
      });
      d.addEventListener("contextmenu", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (STATE.fcolors && STATE.fcolors[key]) {
          delete STATE.fcolors[key];
          saveFColors();
          renderSide();
          toast("已恢复自动色块");
        }
      });
      b.appendChild(d);
    }
    const lbl = document.createElement("span");
    lbl.className = "xhwb-foldlbl";
    lbl.textContent = label;
    lbl.title = label;
    b.appendChild(lbl);
    if (opts && opts.menuPath) {
      b.dataset.xhFold = opts.menuPath;
    }
    const c = document.createElement("span");
    c.className = "xhwb-cnt";
    c.textContent = opts && opts.count != null ? opts.count : "";
    b.appendChild(c);
    if (opts && opts.menuPath) {
      // 只占一个「⋯」的位置（约 16px），hover 才显形；改名/删除收进弹出菜单，
      // 行内文字宽度不再被两个文字按钮挤压。
      const mb = document.createElement("span");
      mb.className = "xhwb-foldmore";
      mb.textContent = "⋯";
      mb.title = "更多：改名 / 删除文件夹";
      mb.setAttribute("role", "button");
      mb.tabIndex = 0;
      const openMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = mb.getBoundingClientRect();
        openFolderMenu(opts.menuPath, r.left, r.bottom + 2);
      };
      mb.addEventListener("click", openMenu);
      mb.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openMenu(e);
      });
      mb.addEventListener("pointerdown", (e) => e.stopPropagation());
      mb.addEventListener("dragstart", (e) => { e.preventDefault(); e.stopPropagation(); });
      mb.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.remove("droptgt");
        DRAG_REL = null;
      });
      b.appendChild(mb);
    }
    b.onclick = () => {
      // 350ms 内再点同一行 = 双击改名（单击会重渲染，所以不能用原生 dblclick）
      const now = Date.now();
      if (opts && opts.menuPath && _lastFoldClick
          && _lastFoldClick.rel === opts.menuPath && now - _lastFoldClick.t < 350) {
        _lastFoldClick = null;
        startFolderRenameInline(opts.menuPath);
        return;
      }
      _lastFoldClick = opts && opts.menuPath ? { rel: opts.menuPath, t: now } : null;
      STATE.folder = key; STATE.sel = null; renderSide(); renderMain();
    };
    //  2026-10-27：文件夹按钮 = 拖放目标（卡片拖进来 = 移动文件）。
    //   「全部工作流」(__ALL__) 视为根目录，拖上去 = 移回根目录。
    b.addEventListener("dragover", (e) => {
      if (!DRAG_REL) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      b.classList.add("droptgt");
    });
    b.addEventListener("dragleave", () => b.classList.remove("droptgt"));
    b.addEventListener("drop", (e) => {
      e.preventDefault();
      b.classList.remove("droptgt");
      if (DRAG_REL) moveWorkflow(DRAG_REL, key === "__ALL__" ? "" : key, key === "__ALL__" ? "全部工作流" : key);
      DRAG_REL = null;
    });
    side.appendChild(b);
  };
  mk("全部工作流", "__ALL__", { icon: "list", count: allFiles().length });
  mk("收藏", "__FAVS__", { star: true, icon: "star", count: Object.keys(STATE.favs).filter((k) => STATE.favs[k]).length });
  mk("最近", "__RECENT__", { icon: "history", count: Math.min(30, allFiles().length) });
  const head = document.createElement("div");
  head.className = "xhwb-grouphead";
  head.innerHTML = xhIconHTML("folder", { size: 13, color: "current" }) + ' <span>文件夹</span>';
  // 「+ 新建」：直接在 UI 建文件夹，不用再去磁盘手动搞（学 早期版本）
  const nf = document.createElement("span");
  nf.className = "xhwb-newfold";
  nf.innerHTML = xhIconHTML("plus", { size: 12, color: "current" }) + ' 新建';
  nf.title = "在 workflows 根目录下新建文件夹";
  nf.onclick = (e) => { e.stopPropagation(); createFolderUI(); };
  head.appendChild(nf);
  side.appendChild(head);
  // ── 真实文件夹：照 早期版本 画成嵌套树（父在子前、缩进、▶ 收起/展开）──
  const folders = orderedFolders((STATE.data && STATE.data.folders) || []);
  const open = new Set(STATE.exp || []);
  // 选中的文件夹的祖先链强制显示（只影响这一次渲染，不改用户的展开偏好）
  if (STATE.folder && STATE.folder.indexOf("__") !== 0) {
    const parts = STATE.folder.split("/");
    for (let i = 1; i < parts.length; i++) open.add(parts.slice(0, i).join("/"));
  }
  for (const f of folders) {
    const segs = f.split("/");
    const depth = segs.length - 1;
    // 父级没展开 → 子文件夹这一行不画（作者 L327）
    let hidden = false;
    for (let i = 1; i < segs.length; i++) {
      if (!open.has(segs.slice(0, i).join("/"))) { hidden = true; break; }
    }
    if (hidden) continue;
    const hasKids = folders.some((x) => x.startsWith(f + "/"));
    const isOpen = open.has(f);
    mk(segs[segs.length - 1], f, {
      dot: hueFor(f),
      count: m[f] != null ? m[f] : 0,
      indent: depth,
      twisty: hasKids ? { open: isOpen, path: f } : null,
      menuPath: f,
    });
  }
  //  2026-11-18：散落文件（不在任何文件夹里的工作流）挪到**所有文件夹最下面**。
  //    原来这一行在文件夹循环之前 ⇒ 显示在列表顶部；用户要求「放在最最下面」，
  //    所以等整棵树画完，最后再补这一行。纯渲染顺序，不碰任何点击/拖放逻辑。
  mk("(散落文件)", "__ROOT__", { dot: hueFor("__root__"), count: allFiles().filter((x) => !(x.dir || "")).length, twisty: null });
}

function starEl(rel, inList) {
  const fav = !!STATE.favs[rel];
  const s = document.createElement("div");
  s.className = "xhwb-star" + (inList ? " xhwb-rowstar" : "") + (fav ? " on" : "");
  //  2026-11-18：用户要的是原作者那种**实心星**。家族 Lucide 星是描边图标
  //    （fill:none、CSS mask），填不实 ⇒ 跟原作者一样直接用字符 ★ / ☆。
  //    sweep() 只扫 <button>，这里是 <div>，字符不会被图标清理吃掉。
  s.textContent = fav ? "★" : "☆";
  s.setAttribute("data-xh-icon-done", "1");
  s.title = fav ? "从收藏移除" : "加入收藏";
  s.addEventListener("click", (e) => {
    e.stopPropagation();
    STATE.favs[rel] = !STATE.favs[rel];
    if (!STATE.favs[rel]) delete STATE.favs[rel];
    saveFavs();
    renderSide();
    renderMain();
    if (STATE.sel === rel) renderDetail();
  });
  s.addEventListener("dblclick", (e) => e.stopPropagation());
  return s;
}

// ----------------------------- 封面图 -----------------------------
/** 取卡片/详情页封面：只用本插件自己的自定义示例图，没有就返回 null（退节点地图）。 */
function coverUrlOf(entry) {
  const mine = customImagesOf(entry.rel);
  return mine.length ? customImageUrl(entry.rel, mine[0]) : null;
}

/** 某个工作流的自定义示例图列表（第一张 = 封面）。 */
function customImagesOf(rel) {
  const arr = STATE.images && STATE.images[rel];
  return Array.isArray(arr) ? arr : [];
}

function customImageUrl(rel, rec) {
  return "/xh/workflows/image?rel=" + encodeURIComponent(rel)
    + "&name=" + encodeURIComponent(rec.name) + "&v=" + (rec.v || 1);
}

/** 打开文件选择器，选完逐张上传（可多选）。 */
function pickWorkflowImages(rel) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/png,image/jpeg,image/webp,image/gif";
  inp.multiple = true;
  inp.style.display = "none";
  document.body.appendChild(inp);
  inp.addEventListener("change", async () => {
    const files = Array.from(inp.files || []);
    inp.remove();
    if (files.length) await uploadWorkflowImages(rel, files);
  });
  inp.click();
}

async function uploadWorkflowImages(rel, files) {
  let ok = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append("rel", rel);
    fd.append("file", file, file.name);
    try {
      const r = await fetch("/xh/workflows/images/upload", { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || ("HTTP " + r.status));
      }
      ok++;
    } catch (e) {
      toast("「" + file.name + "」上传失败：" + (e.message || e));
    }
  }
  if (!ok) return;
  toast("已添加 " + ok + " 张示例图");
  await loadImages();
  renderMain();
  if (STATE.sel === rel) renderDetail();
}

async function removeWorkflowImage(rel, name) {
  try {
    await postJSON("/xh/workflows/images/delete", { rel, name });
    toast("已删除这张示例图");
    await loadImages();
    renderMain();
    if (STATE.sel === rel) renderDetail();
  } catch (e) { toast("删除失败：" + (e.message || e)); }
}

async function setWorkflowCover(rel, name) {
  try {
    await postJSON("/xh/workflows/images/cover", { rel, name });
    await loadImages();
    renderMain();
    if (STATE.sel === rel) renderDetail();
  } catch (e) { toast("设为封面失败：" + (e.message || e)); }
}

/** 工作流改名 / 移动时迁移图片索引（失败不影响主操作）。 */
async function migrateWorkflowImages(fromRel, toRel) {
  try { await postJSON("/xh/workflows/images/migrate", { from: fromRel, to: toRel }); } catch (e) { /* 忽略 */ }
}

/** 工作流被删除时清掉它的示例图（失败不影响主操作）。 */
async function clearWorkflowImages(rel) {
  try { await postJSON("/xh/workflows/images/clear", { rel }); } catch (e) { /* 忽略 */ }
}

async function loadImages() {
  try {
    const r = await fetchJSON("/xh/workflows/images");
    STATE.images = (r && r.items) || {};
  } catch (e) { STATE.images = {}; }
}

/** 没有成品图时的兜底：画节点地图。 */
function mapEl(entry, cls) {
  const cv = document.createElement("canvas");
  cv.className = cls;
  requestAnimationFrame(() => drawMap(cv, entry.map));
  return cv;
}

function covEl(entry, cls) {
  const url = coverUrlOf(entry);
  if (!url) return mapEl(entry, cls);
  // 照 早期版本：有成品图（跑完自动记的 / 手动选的封面）就显示图片；
  // 图片被删了 / 404 就退回节点地图，绝不留一块空白。
  const img = document.createElement("img");
  img.className = cls;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.onerror = () => {
    if (img.parentNode) img.parentNode.replaceChild(mapEl(entry, cls), img);
  };
  img.src = url;
  return img;
}

// ----------------------------- 卡片右键菜单 -----------------------------
// 文件浏览器习惯：右键出菜单。这里只放最常用的「打开 / 删除文件」，
// 其余操作（重命名 / 复制 / 定位 / 备注）仍在右侧详情面板，不重复堆。
let _fileMenuEl = null;
function _fileMenuOutside(e) {
  if (_fileMenuEl && !_fileMenuEl.contains(e.target)) closeFileMenu();
}
function _fileMenuEsc(e) {
  if (e.key === "Escape") closeFileMenu();
}
function closeFileMenu() {
  if (_fileMenuEl) { _fileMenuEl.remove(); _fileMenuEl = null; }
  document.removeEventListener("pointerdown", _fileMenuOutside, true);
  document.removeEventListener("keydown", _fileMenuEsc, true);
}
function showFileMenu(f, x, y) {
  openCtxMenu(x, y, [
    { label: "打开", fn: () => openWorkflow(f.rel) },
    { label: "添加示例图", fn: () => pickWorkflowImages(f.rel) },
    { label: "删除文件", fn: () => deleteFileUI(f.rel), danger: true },
  ]);
}

/** 侧栏文件夹行尾「⋯」的菜单：改名 / 删除文件夹。 */
function openFolderMenu(rel, x, y) {
  openCtxMenu(x, y, [
    { label: "改名", fn: () => startFolderRenameInline(rel) },
    { label: "删除文件夹", fn: () => deleteFolderUI(rel), danger: true },
  ]);
}

/** 通用小型弹出菜单（文件卡右键、文件夹「⋯」共用）。 */
function openCtxMenu(x, y, items) {
  closeFileMenu();
  const m = document.createElement("div");
  m.className = "xhwb-ctx";
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xhwb-ctxitem" + (it.danger ? " danger" : "");
    b.textContent = it.label;
    b.onclick = async () => {
      closeFileMenu();
      try { await it.fn(); } catch (e) { toast((e.message || e)); }
    };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  // 贴边时往回收，别出视口
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
  _fileMenuEl = m;
  setTimeout(() => {
    document.addEventListener("pointerdown", _fileMenuOutside, true);
    document.addEventListener("keydown", _fileMenuEsc, true);
  }, 0);
}

function renderMain() {
  if (!H) return;
  const main = H.main;
  main.textContent = "";
  const list = visibleFiles();
  if (!list.length) {
    const d = document.createElement("div");
    d.className = "xhwb-empty";
    d.textContent = STATE.q ? "没有匹配“" + STATE.q + "”的工作流。" : "这里还没有工作流。";
    main.appendChild(d);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = STATE.view === "list" ? "xhwb-list" : "xhwb-grid";
  for (const f of list) {
    const card = document.createElement("div");
    card.className = (STATE.view === "list" ? "xhwb-row" : "xhwb-card") + (STATE.sel === f.rel ? " sel" : "");
    card.dataset.rel = f.rel;
    card.title = f.name;
    // 卡片副标题：显示第一个模型，悬停提示列出全部（模型 + LoRA）
    const allMods = (f.models || []).concat(f.loras || []);
    const mod = allMods[0] || "";
    if (STATE.view === "list") {
      card.appendChild(covEl(f, "xhwb-rowcov"));
      const nm = document.createElement("span");
      nm.className = "xhwb-rowname";
      nm.textContent = f.name;
      card.appendChild(nm);
      //  2026-11-18：列表行只留「缩略图 + 名字」，不再显示模型名 / 目录·日期小字。
      //    用户：「单纯显示名字就够了，右侧详情已经很全，后面小字把框撑得老长」。
      //    模型 / 目录 / 修改时间 / 节点数在右侧详情面板都看得到，这里不重复。
      //    （网格视图的小字是卡片自带缩略信息，是另一套布局，保持不动。）
      //  名字本身 flex:1，会自动占满整行，收藏星仍在最右，不需要额外占位。
    } else {
      card.appendChild(covEl(f, "xhwb-cov"));
      const nm = document.createElement("div");
      nm.className = "xhwb-cardname";
      nm.textContent = f.name;
      card.appendChild(nm);
      const meta = document.createElement("div");
      meta.className = "xhwb-cardmeta";
      meta.innerHTML =
        (mod ? '<span class="xhwb-modtag">' + esc(modelShort(mod)) + " · </span>" : "") +
        esc(fmtWhen(f.mtime)) + " · " + (f.nodes != null ? f.nodes : "?") + " 节点";
      card.appendChild(meta);
    }
    card.appendChild(starEl(f.rel, STATE.view === "list"));
    //  2026-10-27：卡片可拖拽 → 拖到侧栏文件夹 = 移动文件（学 早期版本）
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      DRAG_REL = f.rel;
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", f.rel); } catch (err) { /* 忽略 */ }
    });
    card.addEventListener("dragend", () => { DRAG_REL = null; });
    card.addEventListener("click", () => {
      STATE.sel = f.rel;
      renderMain();
      renderDetail();
    });
    card.addEventListener("dblclick", () => openWorkflow(f.rel));
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      STATE.sel = f.rel;
      renderMain();
      renderDetail();
      showFileMenu(f, e.clientX, e.clientY);
    });
    wrap.appendChild(card);
  }
  main.appendChild(wrap);
}

function kv(label, val) {
  const r = document.createElement("div");
  r.className = "xhwb-kv";
  r.innerHTML = "<span>" + esc(label) + "</span><b>" + esc(val) + "</b>";
  return r;
}

function renderDetail() {
  if (!H) return;
  const det = H.detail;
  det.textContent = "";
  const f = allFiles().find((x) => x.rel === STATE.sel);
  if (!f) {
    det.innerHTML = '<div class="xhwb-empty">选一个工作流<br>看里面是什么</div>';
    return;
  }
  det.appendChild(covEl(f, "xhwb-detcov"));
  const nm = document.createElement("div");
  nm.className = "xhwb-detname";
  nm.textContent = f.name;
  det.appendChild(nm);
  //  2026-10-28：重命名改成**行内输入框**（不再是 window.prompt）。
  //    根因：Electron 桌面版把 window.prompt 禁用了 ⇒ 点「重命名」毫无反应（用户报 bug）。
  //    行内编辑的好处：不弹窗、能看到原名、直接回车确认。
  let renameInput = null;
  const startRename = () => {
    if (renameInput) return;
    const oldLeaf = f.name;
    const stem = oldLeaf.replace(/\.json$/i, "");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "xhwb-rename-input";
    inp.value = stem;
    inp.title = "改成什么名字？（不用带 .json，回车确认，Esc 取消）";
    renameInput = inp;
    // 用 input 替换掉文件名那一行
    nm.style.display = "none";
    nm.parentNode.insertBefore(inp, nm);
    inp.focus();
    inp.select();
    let done = false;
    const finish = async (ok) => {
      if (done) return;
      done = true;
      const nn = inp.value.trim();
      inp.remove();
      nm.style.display = "";
      renameInput = null;
      if (!ok || !nn || nn === stem) return;
      try {
        const newRel = await renameWorkflow(f.rel, nn);
        if (!newRel) return;
        // 收藏/备注跟着改名迁移（作者 index.js L996-1006 同款处理）
        if (STATE.favs[f.rel]) { STATE.favs[newRel] = true; delete STATE.favs[f.rel]; saveFavs(); }
        if (STATE.notes && STATE.notes[f.rel]) { STATE.notes[newRel] = STATE.notes[f.rel]; delete STATE.notes[f.rel]; store.set("notes", STATE.notes); }
        STATE.sel = newRel;
        toast("已改名为：" + newRel.split("/").pop());
        await refresh();
      } catch (e) { toast("重命名失败：" + (e.message || e)); }
    };
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    inp.addEventListener("blur", () => { setTimeout(() => { if (renameInput === inp) finish(true); }, 120); });
  };
  const p = document.createElement("div");
  p.className = "xhwb-detpath";
  p.textContent = f.dir ? ("在 " + f.dir) : "不在任何文件夹里";
  det.appendChild(p);
  det.appendChild(kv("目录", f.dir || "(根目录)"));
  det.appendChild(kv("修改", fmtFull(f.mtime)));
  det.appendChild(kv("节点", f.nodes != null ? String(f.nodes) : "解析失败"));
  det.appendChild(kv("大小", (f.size / 1024).toFixed(1) + " KB"));

  // ── 你的备注（照 早期版本 detail.mjs L89-116：可写、可搜、失焦即存）──
  const noteHead = document.createElement("div");
  noteHead.className = "xhwb-grouphead";
  noteHead.textContent = "你的备注";
  det.appendChild(noteHead);
  const note = document.createElement("textarea");
  note.className = "xhwb-note";
  note.placeholder = "这个是干什么用的？可搜索。";
  note.value = (STATE.notes && STATE.notes[f.rel]) || "";
  note.addEventListener("keydown", (e) => { e.stopPropagation(); });
  let noteTimer = null;
  let noteSent = note.value;
  const flushNote = () => {
    clearTimeout(noteTimer);
    noteTimer = null;
    if (note.value !== noteSent) {
      noteSent = note.value;
      STATE.notes = STATE.notes || {};
      if (note.value) STATE.notes[f.rel] = note.value;
      else delete STATE.notes[f.rel];
      store.set("notes", STATE.notes);
    }
  };
  note.addEventListener("input", () => { clearTimeout(noteTimer); noteTimer = setTimeout(flushNote, 500); });
  // 失焦立刻存：作者注释里说的坑 —— 防抖窗口内点了别的按钮，备注就永远丢了
  note.addEventListener("blur", flushNote);
  det.appendChild(note);

  // ── 示例图（自定义；多图相册，第一张 = 封面）──
  const imgBar = document.createElement("div");
  imgBar.className = "xhwb-imgbar";
  const imgHead = document.createElement("div");
  imgHead.className = "xhwb-grouphead";
  imgHead.textContent = "示例图";
  imgBar.appendChild(imgHead);
  const addImg = document.createElement("button");
  addImg.className = "xhwb-tbtn";
  addImg.textContent = "＋ 添加图片";
  addImg.title = "可多选；第一张会作为卡片和详情页的封面";
  addImg.onclick = () => pickWorkflowImages(f.rel);
  imgBar.appendChild(addImg);
  det.appendChild(imgBar);
  const mine = customImagesOf(f.rel);
  if (!mine.length) {
    const ph = document.createElement("div");
    ph.className = "xhwb-imgnone";
    ph.textContent = "还没有自定义示例图。点「添加图片」上传，可一次选多张。";
    det.appendChild(ph);
  } else {
    const grid = document.createElement("div");
    grid.className = "xhwb-imggrid";
    mine.forEach((rec, i) => {
      const cell = document.createElement("div");
      cell.className = "xhwb-imgcell";
      const im = document.createElement("img");
      im.src = customImageUrl(f.rel, rec);
      im.loading = "lazy";
      im.alt = "";
      cell.appendChild(im);
      if (i === 0) {
        const badge = document.createElement("span");
        badge.className = "xhwb-imgbadge";
        badge.textContent = "封面";
        cell.appendChild(badge);
      }
      const ops = document.createElement("div");
      ops.className = "xhwb-imgops";
      if (i > 0) {
        const mk = document.createElement("button");
        mk.className = "xhwb-imgop";
        mk.textContent = "设为封面";
        mk.onclick = () => setWorkflowCover(f.rel, rec.name);
        ops.appendChild(mk);
      }
      const del = document.createElement("button");
      del.className = "xhwb-imgop danger";
      del.textContent = "删除";
      del.onclick = () => removeWorkflowImage(f.rel, rec.name);
      ops.appendChild(del);
      cell.appendChild(ops);
      grid.appendChild(cell);
    });
    det.appendChild(grid);
  }

  // ── 操作按钮（照 早期版本 detail.mjs L118-149 的完整清单）──
  const acts = document.createElement("div");
  acts.className = "xhwb-acts";
  const btn = (label, fn, cls, title, icon) => {
    const b = document.createElement("button");
    b.className = "xhwb-tbtn" + (cls ? " " + cls : "");
    if (icon) {
      b.style.display = "inline-flex";
      b.style.alignItems = "center";
      b.style.gap = "5px";
      b.innerHTML = xhIconHTML(icon, { size: 13, color: "current" }) + " " + label;
    } else {
      b.textContent = label;
    }
    if (title) b.title = title;
    b.onclick = fn;
    acts.appendChild(b);
    return b;
  };

  // 打开
  btn("打开", () => openWorkflow(f.rel), "xhwb-primary", "加载这个工作流到画布", "download");

  // 收藏（ 实心=已收藏， 空心=未收藏，和卡片上的星星读起来是同一个控件）
  const isFav = !!STATE.favs[f.rel];
  const favBtn = btn(isFav ? "取消收藏" : "收藏", () => {
    STATE.favs[f.rel] = !STATE.favs[f.rel];
    if (!STATE.favs[f.rel]) delete STATE.favs[f.rel];
    saveFavs();
    renderSide();
    renderMain();
    renderDetail();
  }, null, isFav ? "从收藏移除" : "加入收藏");
  const glyph = document.createElement("span");
  glyph.className = "xhwb-btnstar" + (isFav ? " on" : "");
  glyph.textContent = isFav ? "" : "";
  favBtn.insertBefore(glyph, favBtn.firstChild);

  // 重命名（行内编辑，不用 window.prompt —— Electron 桌面版禁用了它）
  btn("重命名", () => startRename(), "", "在这里直接改名字：回车确认，Esc 取消");

  // 复制
  btn("复制一份", async () => {
    try {
      const newRel = await duplicateWorkflow(f.rel);
      toast("已复制为：" + newRel.split("/").pop());
      await refresh();
      STATE.sel = newRel;
      renderMain();
      renderDetail();
    } catch (e) { toast("复制失败：" + (e.message || e)); }
  }, null, null, "copy");

  // 在资源管理器中显示（照作者 Reveal：打开它所在的文件夹）
  btn("定位文件", async () => {
    try {
      await postJSON("/xh/workflows/reveal", { rel: f.rel });
      toast("已在资源管理器中定位");
    } catch (e) { toast("定位失败：" + (e.message || e)); }
  });

  // 删除（红色，危险操作）
  btn("删除", async () => { await deleteFileUI(f.rel); }, "xhwb-danger", "删了找不回来，会先问一句");

  // 复制文件路径
  const copyBtn = btn("复制路径", () => {
    const full = ((STATE.data && STATE.data.root) || "") + "/" + f.rel;
    try { navigator.clipboard.writeText(full); copyBtn.innerHTML = xhIconHTML("勾选", { size: 12, color: "current" }) + " 已复制"; } catch (e) { copyBtn.textContent = full; }
    setTimeout(() => { copyBtn.textContent = "复制路径"; }, 1600);
  });
  det.appendChild(acts);

  // ── 用到的文件（照作者 detail.mjs L151-172：放在最后，按钮才不会被顶下去）──
  // 作者的标题是 "Needs these files (N)"，因为清单里既有模型也有 LoRA —— 都是文件。
  // 我们照抄这个语义：模型 + LoRA 合起来算总数，但分成两段显示，一眼看出哪个是 LoRA。
  const models = f.models || [];
  const loras = f.loras || [];
  const mods = models.concat(loras);
  const createCopyButton = (name, kind) => {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "xhwb-modcopy";
    copy.title = "复制完整名称：" + name;
    copy.setAttribute("aria-label", "复制 " + name);
    const copyIco = xhIconHTML("copy", { size: 12, color: "current" });
    copy.innerHTML = copyIco;
    copy.onclick = async (event) => {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(name);
        copy.innerHTML = xhIconHTML("勾选", { size: 12, color: "current" });
        copy.classList.add("ok");
        toast("已复制" + kind + "名称");
        setTimeout(() => {
          copy.innerHTML = copyIco;
          copy.classList.remove("ok");
        }, 1500);
      } catch (e) {
        toast("复制失败：" + (e.message || e));
      }
    };
    return copy;
  };
  const appendModelRow = (list, name, isLora) => {
    const row = document.createElement("div");
    row.className = "xhwb-mod" + (isLora ? " xhwb-modlora" : "");

    const label = document.createElement("span");
    label.className = "xhwb-modname";
    label.textContent = name;
    label.title = name;
    row.appendChild(label);
    row.appendChild(createCopyButton(name, isLora ? " LoRA " : "模型"));
    list.appendChild(row);
  };
  if (mods.length) {
    const head = document.createElement("div");
    head.className = "xhwb-grouphead";
    head.textContent = "用到的文件（" + mods.length + "）";
    det.appendChild(head);
    if (models.length) {
      const sub = document.createElement("div");
      sub.className = "xhwb-subhead";
      sub.textContent = "模型 " + models.length;
      det.appendChild(sub);
      const list = document.createElement("div");
      list.className = "xhwb-modlist";
      for (const m of models) appendModelRow(list, m, false);
      det.appendChild(list);
    }
    if (loras.length) {
      const sub = document.createElement("div");
      sub.className = "xhwb-subhead";
      sub.textContent = "LoRA " + loras.length;
      det.appendChild(sub);
      const list = document.createElement("div");
      list.className = "xhwb-modlist";
      for (const m of loras) appendModelRow(list, m, true);
      det.appendChild(list);
    }
    // 一键复制全部文件名（照作者 copyList）
    const copyAll = document.createElement("button");
    copyAll.className = "xhwb-tbtn";
    copyAll.style.display = "inline-flex";
    copyAll.style.alignItems = "center";
    copyAll.style.gap = "5px";
    const copyAllIco = xhIconHTML("copy", { size: 13, color: "current" });
    copyAll.innerHTML = copyAllIco + " 复制全部文件名";
    copyAll.onclick = () => {
      const text = f.name + "\n" + mods.join("\n");
      try {
        navigator.clipboard.writeText(text);
        copyAll.innerHTML = xhIconHTML("勾选", { size: 13, color: "current" }) + " 已复制";
      } catch (e) { copyAll.innerHTML = copyAllIco + " 复制失败"; }
      setTimeout(() => { copyAll.innerHTML = copyAllIco + " 复制全部文件名"; }, 1500);
    };
    det.appendChild(copyAll);
  }

  // ── 用到的节点包（后端已按 RELATIVE_PYTHON_MODULE 归类好）──
  const allPacks = f.packs || [];
  //  后端只认 Python 节点，前端 JS 注册的节点（新版 rgthree 的 SetNode/GetNode 等）
  //    不在 /object_info 里，会被后端报成"缺失"。这里用 LiteGraph 的全局注册表
  //    + pinia 的 nodeDef store 过滤掉 —— ComfyUI 自己判断节点存不存在用的就是这套表。
  const known = frontendKnownTypes();
  const rawMissing = f.missing || [];
  const missing = rawMissing.filter((t) => !known.has(t));
  const frontendTypes = rawMissing.filter((t) => known.has(t));
  // 包列表 = 后端归类好的（去掉核心内置）+ 前端 JS 节点单独一组
  const custom = allPacks
    .filter((p) => !isCorePack(p.mod))
    .map((p) => ({ mod: p.mod, cat: p.cat, count: p.count, types: (p.types || []).slice() }));
  if (frontendTypes.length) {
    custom.push({
      mod: "custom_nodes.__frontend__",
      cat: "前端 JS 注册",
      count: frontendTypes.length,
      types: frontendTypes.slice(0, 16),
    });
  }
  if (custom.length || missing.length) {
    const head = document.createElement("div");
    head.className = "xhwb-grouphead";
    head.textContent = "用到的节点包" + (custom.length ? "（" + custom.length + "）" : "");
    det.appendChild(head);
    if (custom.length) {
      const list = document.createElement("div");
      list.className = "xhwb-packlist";
      for (const p of custom) {
        const d = document.createElement("div");
        d.className = "xhwb-pack";
        const nm = document.createElement("span");
        nm.className = "xhwb-packname";
        const packName = packLabel(p.mod);
        nm.textContent = packName;
        d.appendChild(nm);
        const ct = document.createElement("span");
        ct.className = "xhwb-packcnt";
        ct.textContent = p.count;
        d.appendChild(ct);
        d.appendChild(createCopyButton(packName, "节点包"));
        d.title = p.mod + (p.cat ? "\n分类：" + p.cat : "") + "\n节点：" + (p.types || []).join(", ");
        list.appendChild(d);
      }
      det.appendChild(list);
    }
    // 缺失的节点（照作者 "Missing nodes"：红字警告，因为这些节点装不上就跑不了）
    if (missing.length) {
      const mh = document.createElement("div");
      mh.className = "xhwb-subhead xhwb-warnhead";
      mh.textContent = "缺少的节点（" + missing.length + "）";
      det.appendChild(mh);
      // 说清楚后果：这个工作流在本地跑不起来
      const tip = document.createElement("div");
      tip.className = "xhwb-warntip";
      tip.textContent = "本地没装对应节点包，这个工作流现在跑不起来";
      det.appendChild(tip);
      const list = document.createElement("div");
      list.className = "xhwb-modlist";
      for (const t of missing) {
        const d = document.createElement("div");
        d.className = "xhwb-mod xhwb-modmissing";
        const nm = document.createElement("span");
        nm.className = "xhwb-modname";
        nm.textContent = t;
        d.appendChild(nm);
        d.appendChild(createCopyButton(t, "缺失节点"));
        d.title = "当前 ComfyUI 里没有这个节点类型 —— 对应的节点包可能没装";
        list.appendChild(d);
      }
      det.appendChild(list);
    }
    // 子图节点（type 是 UUID）：不是缺失，只是这个工作流用了组合节点
    if (f.subgraphs) {
      const sh = document.createElement("div");
      sh.className = "xhwb-subhead";
      sh.textContent = "子图节点 " + f.subgraphs;
      sh.title = "这些是工作流里的组合节点（type 是 UUID），不是缺失的节点包";
      det.appendChild(sh);
    }
  }
}

async function refresh() {
  try {
    STATE.data = await fetchJSON("/xh/workflows");
  } catch (e) {
    STATE.data = { root: "", folders: [], files: [] };
    if (H) {
      H.main.textContent = "";
      const d = document.createElement("div");
      d.className = "xhwb-empty";
      d.textContent = "加载失败：" + (e.message || e) + "（确认 ComfyUI 已重启且后端路由已加载）";
      H.main.appendChild(d);
    }
  }
  await loadImages();
  renderCount();
  renderSide();
  renderMain();
  renderDetail();
}

// ----------------------------- 打开 -----------------------------
// ────────────────────────────────────────────────────────────────────────────
// 打开工作流：照 ComfyUI 官方 workflowService.openWorkflow() + 早期版本 api.mjs
//
//  2026-10-27 修复「点开工作流却变成 Unsaved Workflow」：
//   之前只调 app.loadGraphData(graph, true, true) —— 第 4 参 workflow 没传，
//   ComfyUI 走到 workflowService.ts L798 的 createNewTemporary() 分支，
//   于是新建一个临时工作流，标签页标题就是 "Unsaved Workflow"。
//   官方 L427 openWorkflow(workflow) 的正确姿势是：
//     1) store 里按路径拿 ComfyWorkflow 对象（getWorkflowByPath）
//     2) await wf.load()  从磁盘加载（不传 force，保留未保存的修改）
//     3) app.loadGraphData(wf.activeState, true, true, wf)  ← 第 4 参传对象
//        传了对象，afterLoadNewGraph 才会激活那个已有的、名字正确的工作流。
// ────────────────────────────────────────────────────────────────────────────

/** 从 pinia 拿 ComfyUI 的 workflow store（1.57 新架构：useWorkspaceStore().workflow）。
 *  store id 实测为 'workflow'（workflowStore.ts: defineStore('workflow', ...)）。 */
function getWorkflowStore() {
  // 路线 1：旧架构 app.extensionManager.workflow（1.57 已移除，留着不碍事）
  try {
    const ws = app.extensionManager?.workflow;
    if (ws && typeof ws.getWorkflowByPath === "function") return ws;
  } catch (e) { /* 忽略 */ }
  // 路线 2：pinia —— Vue 挂载时 pinia 被塞进 app.config.globalProperties.$pinia，
  //   而 app 实例挂在容器元素的 __vue_app__ 上（vendor-vue-core: i.__vue_app__=l）。
  //   ComfyUI 的 Vue 根容器是 #vue-app（index.html 有 id="vue-app"）。
  const cands = [];
  try { cands.push(document.querySelector("#vue-app")); } catch (e) { /* 忽略 */ }
  try {
    // 多扫几个可能挂 Vue 的容器，根容器换了也不至于直接放弃
    for (const sel of ["#comfy-app", "body > div", "#app"]) {
      const el = document.querySelector(sel);
      if (el) cands.push(el);
    }
  } catch (e) { /* 忽略 */ }
  for (const el of cands) {
    try {
      const va = el && el.__vue_app__;
      const pinia = va?.config?.globalProperties?.$pinia;
      if (!pinia) continue;
      const st = pinia._s?.get("workflow");
      if (st && typeof st.getWorkflowByPath === "function") return st;
    } catch (e) { /* 忽略 */ }
  }
  return null;
}

/** store 的路径键 = "workflows/" + 相对路径（ComfyWorkflow.basePath = 'workflows/'）。 */
function storePathOf(rel) {
  const r = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return r.startsWith("workflows/") ? r : "workflows/" + r;
}

async function openWorkflow(rel) {
  try {
    const store = getWorkflowStore();
    let wf = null;
    if (store) {
      // ① 让 store 先把磁盘上的工作流全部登记进来
      //    （workflowStore.ts L392-400: syncWorkflows → syncEntities('workflows', ...),
      //     而 syncUtil.ts L22 的 api.listUserDataFullInfo 是递归的，
      //     所以一次 sync 就能登记全部子文件夹里的工作流）
      try { await store.syncWorkflows?.(); } catch (e) { /* 忽略 */ }
      wf = store.getWorkflowByPath?.(storePathOf(rel)) || null;
      // ② sync 是异步的、还有 isSyncReady 缓存，偶尔第一次还查不到 → 再来一次
      if (!wf) {
        try { await store.syncWorkflows?.(); } catch (e) { /* 忽略 */ }
        wf = store.getWorkflowByPath?.(storePathOf(rel)) || null;
      }
    }
    if (wf) {
      // ③ 官方姿势（workflowService.ts L427-495 openWorkflow）：
      //    先 load() 从磁盘加载（**不传 force**，用户没保存的修改要保住），
      //    再把 activeState 连同 workflow 对象一起交给 loadGraphData。
      //    第 4 参传了对象，afterLoadNewGraph 才会激活那个名字正确的标签页。
      try {
        if (typeof wf.load === "function" && !wf.isLoaded) await wf.load();
      } catch (e) { /* 忽略：读不到就退回自己取内容 */ }
      const state = wf.activeState;
      if (state) {
        await app.loadGraphData(state, true, true, wf);
        togglePanel(false);
        return;
      }
    }
    // ④ 兜底：拿不到 store 对象时，走我们自己取内容 + 传「路径字符串」。
    //    传字符串时 ComfyUI 会用 ComfyWorkflow.basePath + 名字去 store 里查已有工作流，
    //    查到就复用那个标签页（workflowService.ts L745-771），查不到才退化成临时工作流。
    const d = await fetchJSON("/xh/workflows/load?rel=" + encodeURIComponent(rel));
    if (!d || !d.graph) {
      toast("打开失败：未取到工作流内容");
      return;
    }
    const name = String(rel || "").split("/").pop().replace(/\.json$/i, "");
    await app.loadGraphData(d.graph, true, true, name);
    togglePanel(false);
  } catch (e) {
    toast("打开失败：" + (e.message || e));
  }
}

// ----------------------------- 键盘 -----------------------------
function onKey(e) {
  if (!STATE.open || !H) return;
  // 正在原地改名（contenteditable）时，按键归编辑器：否则 Enter 会打开工作流、Esc 会关面板
  const ae = document.activeElement;
  if (ae && ae.isContentEditable) return;
  if (e.key === "Escape") {
    e.preventDefault();
    togglePanel(false);
    return;
  }
  const list = visibleFiles();
  if (!list.length) return;
  const idx = list.findIndex((x) => x.rel === STATE.sel);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const ni = e.key === "ArrowDown"
      ? Math.min(list.length - 1, idx + 1)
      : Math.max(0, idx <= 0 ? 0 : idx - 1);
    STATE.sel = list[ni].rel;
    renderMain();
    renderDetail();
    const el = H.main.querySelector('[data-rel="' + CSS.escape(STATE.sel) + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    return;
  }
  if (e.key === "Enter") {
    // 搜索框里按 Enter = 打开第一个结果；其他地方 = 打开选中项
    const target = document.activeElement === H.q ? list[0] : list[idx >= 0 ? idx : 0];
    if (target) {
      e.preventDefault();
      openWorkflow(target.rel);
    }
  }
}

// ----------------------------- 开关 -----------------------------
function togglePanel(force) {
  if (!H) buildPanel();
  STATE.open = typeof force === "boolean" ? force : !STATE.open;
  H.root.style.display = STATE.open ? "flex" : "none";
  // 🔴 2026-11-20：buildPanel 时 root 还是 none、clientWidth=0，列宽会被 clamp 到最小值。
  //    面板这次真的显示了，重新按真实宽度应用一次（读的是 store/默认值，不会覆盖用户拖过的）。
  if (STATE.open) _wfbApplyCols();
  // 顶栏按钮同步状态：面板开着 = 亮出家族黄，关着 = 回到常态
  // （照 早期版本 index.js L1565: S.btn.classList.toggle("wfb-btn-open", isOpen)）
  try {
    const tb = window.__xhWfbBtn || document.querySelector("[data-xh-wfb-btn]");
    setToolbarButtonOpen(tb, !!STATE.open);
  } catch (e) { /* 忽略 */ }
  if (STATE.open) {
    renderSegs();
    refresh();
    H.q.focus();
    document.addEventListener("keydown", onKey, true);
  } else {
    document.removeEventListener("keydown", onKey, true);
  }
}

// ----------------------------- 顶栏按钮 -----------------------------
//  前端 1.57+ 唯一可靠挂点：app.menu.settingsGroup.element（原"设置齿轮"左侧）。
//   #comfyui-topbar / .comfyui-menu 已被删除，别再回去用（2026-10-27 踩过坑）。

// ══════════════════════════════════════════════════════════════════════
//  2026-11-11：顶栏「工作流」图案改走自家图标库（xhIconHTML）。
// 原来这里内联了一份 ComfyUI 官方 comfy--workflow：16 网格 / 1.6px / 描边写死黑色，
// 跟家族另外三颗的 24 网格 / 2px / currentColor 不是一套。
// 那份内联常量已删除 —— 图案唯一真源 = js/xh_icons/，调用处零路径零文件名。
//  2026-11-18 上午：换成家族库 folder-tree（文件夹树）。
//  2026-11-18 傍晚：用户发官方图标截图点名「换成这个图案」⇒ 家族例外③「明确跟官方一模一样」，
//    恢复 ComfyUI 官方 comfy--workflow。图形**原样**提取自 ComfyUI 前端 main CSS 的
//    .icon-[comfy--workflow] --svg data URI（16 网格 / 1.3px，零手绘零改动）；
//    ⛔ 不入 xh_icons/svg/（保 2350 Lucide 基线 + ISC 许可），走专用常量（XH_GEAR_SVG 同例）。
const XH_COMFY_WF_DATAURI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' width='16' height='16'%3E%3Cpath fill='none' stroke='black' stroke-linecap='round' stroke-width='1.3' d='M9.186 3.1H6.814m2.372 9.8H7.553C4.466 12.9 2.2 9.904 2.95 6.812l.305-1.262M14.75 2.172l-.594 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.771 0-1.338-.749-1.15-1.522l.593-2.45a1.194 1.194 0 011.15-.928h2.3c.771 0 1.338.749 1.15 1.522Zm-8.304 0-.593 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.772 0-1.338-.749-1.15-1.522l.592-2.45A1.194 1.194 0 012.995.65h2.3c.771 0 1.337.749 1.15 1.522Zm8.304 9.8-.594 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.771 0-1.338-.749-1.15-1.522l.593-2.45a1.194 1.194 0 011.15-.928h2.3c.771 0 1.338.749 1.15 1.522Z'/%3E%3C/svg%3E";
/** 官方 comfy--workflow 图案（mask 渲染，写法与 xhIconHTML 完全同款）。 */
function comfyWorkflowIconHTML(size) {
  const s = size || XH_TB_ICON_SIZE;
  const u = "url('" + XH_COMFY_WF_DATAURI.replace(/'/g, "%27") + "')";
  const style = "display:inline-block;width:" + s + "px;height:" + s + "px;"
      + "vertical-align:middle;flex-shrink:0;background-color:currentColor;"
      + "-webkit-mask-image:" + u + ";mask-image:" + u + ";"
      + "-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;"
      + "-webkit-mask-position:center;mask-position:center;"
      + "-webkit-mask-size:contain;mask-size:contain;";
  return '<span class="xh-icon-mask" style="' + style + '"></span>';
}

function mountToolbarButton() {
  if (window.__xhWFInjected) return;
  const settingsGroupEl = app.menu && app.menu.settingsGroup && app.menu.settingsGroup.element;
  if (!settingsGroupEl) {
    if (mountToolbarButton._tries == null) mountToolbarButton._tries = 0;
    if (++mountToolbarButton._tries > 20) {
      console.warn("[XiaoHei] 顶栏挂载失败：app.menu.settingsGroup 一直没出现（工作流浏览器按钮未挂上）");
      return;
    }
    setTimeout(mountToolbarButton, 250);
    return;
  }
  window.__xhWFInjected = true;
  const group = document.createElement("div");
  group.className = "comfyui-button-group";
  group.dataset.xhBtn = "wf";
  //  2026-10-28：「XH」文字让位给设置按钮（家族门面），这里改用**官方「工作流」图标**
  //    （用户：「这是官方的图案…我们直接抄官方的图案」）
  //  2026-10-28 13:20：走**统一真源** makeToolbarButton（.xh-tb），
  //    三颗按钮（XiaoHei / 帮助 / 工作流）从此共用同一份样式 ⇒ 不可能再一个紫一个黄。
  //  2026-11-18 傍晚：用户发官方图标截图点名「换成这个图案」⇒ 恢复 ComfyUI 官方
  //    comfy--workflow 图案（原样 data URI，见上方 XH_COMFY_WF_DATAURI 注释）。
  const btn = makeToolbarButton(comfyWorkflowIconHTML(),
                                "XiaoHei 工作流浏览器 (Alt+W)", () => togglePanel());
  try { btn.setAttribute("aria-label", "XiaoHei 工作流浏览器"); } catch (e) {}
  btn.dataset.xhWfbBtn = "1";
  group.appendChild(btn);
  settingsGroupEl.before(group);
  // 记住按钮，togglePanel 时切状态类
  window.__xhWfbBtn = btn;
  // 如果面板此刻已经开着（热重载/重复加载），同步一次状态
  if (STATE.open) setToolbarButtonOpen(btn, true);
}

app.registerExtension({
  name: NS,
  commands: [{ id: CMD_ID, label: "XiaoHei 工作流浏览器", function: () => togglePanel() }],
  //  2026-10-27：不再用 extension 的 keybindings 字段注册 Alt+W。
  //   桌面端扩展文件偶发被加载两次 → 第二次注册时前端报
  //   "Keybinding on Alt + w already exists on XH.OpenWorkflowBrowser" 弹窗。
  //   改成 setup 里 window 原生监听 + 全局守卫，重复加载也不会弹错。
  setup() {
    injectCSS(); // 按钮挂载前就注入，避免按钮样式闪烁（学 早期版本）
    mountToolbarButton();
    // 加载标记：启动后弹一次 toast，用户可直观确认跑的是新代码（结构已照 早期版本 复刻，窗口不再盖屏）
    setTimeout(() => toast("XiaoHei 工作流浏览器已加载"), 2500);
    if (!window.__xhWFBKey) {
      window.__xhWFBKey = true;
      window.addEventListener("keydown", (e) => {
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "w" || e.key === "W")) {
          e.preventDefault();
          e.stopPropagation();
          togglePanel();
        }
      }, true);
    }
  },
});

