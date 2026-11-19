// ╔═══════════════════════════════════════════════════════════════╗
//  XiaoHei · 模型管理器门面（2026-11-19，豆包原作 XiaoHei-ModelBoard 并入家族）
// ╚═══════════════════════════════════════════════════════════════╝
//
//  原作是一个「哑节点 + 全屏面板」：画布上摆一个只弹面板、不参与出图的节点。
//  家族化后**画布上不再显示节点**，入口改成跟工作流浏览器同款的两处：
//    ① 右上角顶栏第 5 颗按钮（boxes 图案，家族图标库）
//    ② 全局快捷键 Ctrl+Shift+M
//  后端路由 /xh_mb/* 由主包 __init__.py 注册（见 nodes/modelboard/）。
//  面板本体 = ./xh_modelboard/panel.js + panel.css（家族化配色后原样保留）。

const { app } = window.comfyAPI.app;
import { xhIconHTML, makeToolbarButton, setToolbarButtonOpen } from "./xh_ui_kit.js";
import { openBoard } from "./xh_modelboard/panel.js";

const NS = "XH.ModelBoard";

// 顶栏按钮开态同步：面板打开 = 家族黄，关着 = 常态
let _tbBtn = null;
function _syncOpen(open) {
  try { setToolbarButtonOpen(_tbBtn, !!open); } catch (e) { /* 忽略 */ }
}

// 打开面板（对外也暴露一个全局入口，方便官方设置行/别处调用）
function openPanel() {
  openBoard({});
}

// ----------------------------- 顶栏按钮 -----------------------------
// 挂点跟另外四颗完全一致：app.menu.settingsGroup.element（设置齿轮左侧）。
// data-xh-btn="modelboard" ⇒ xh_zz_topbar_visibility.js 的显隐开关能藏它。
function mountToolbarButton() {
  if (window.__xhMBInjected) return;
  const settingsGroupEl = app.menu && app.menu.settingsGroup && app.menu.settingsGroup.element;
  if (!settingsGroupEl) {
    if (mountToolbarButton._tries == null) mountToolbarButton._tries = 0;
    if (++mountToolbarButton._tries > 20) {
      console.warn("[XiaoHei] 顶栏挂载失败：app.menu.settingsGroup 一直没出现（模型管理器按钮未挂上）");
      return;
    }
    setTimeout(mountToolbarButton, 250);
    return;
  }
  window.__xhMBInjected = true;
  const group = document.createElement("div");
  group.className = "comfyui-button-group";
  group.dataset.xhBtn = "modelboard";
  // boxes = 家族图标库 Lucide（一堆叠起来的盒子，一眼看出「浏览一堆本地模型」），
  //   currentColor + 24 网格 / 2px，跟另外四颗同一套，切主题自动跟随。
  const btn = makeToolbarButton(
    xhIconHTML("boxes", { size: 20, color: "current" }),
    "XiaoHei 模型管理器 (Ctrl+Shift+M)",
    () => openPanel()
  );
  try { btn.setAttribute("aria-label", "XiaoHei 模型管理器"); } catch (e) {}
  btn.dataset.xhMbBtn = "1";
  group.appendChild(btn);
  settingsGroupEl.before(group);
  _tbBtn = btn;
  window.__xhMBBtn = btn;
}

app.registerExtension({
  name: NS,
  setup() {
    mountToolbarButton();
    // 全局快捷键 Ctrl+Shift+M：不依赖画布上有没有节点。
    if (!window.__xhMBKey) {
      window.__xhMBKey = true;
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) {
          e.preventDefault();
          openPanel();
        }
      });
    }
  },
});

// 给官方设置面板的「打开模型管理器」行 / 别处调用用（顶栏按钮被藏了也能开）。
window.XH_openModelBoard = openPanel;
