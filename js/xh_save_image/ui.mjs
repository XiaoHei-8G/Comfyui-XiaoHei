// 小黑·保存图片 — node-body DOM + CSS (both renderers).
// Layout follows the user's Photoshop mockup (2026-07-03): minimal labels,
// one wrapping button row (format seg + mode seg + Copy/Open/Open Folder),
// and a Preview-Image-style viewer that gets most of the node: single image
// fills the area, batches show as a GRID (click a cell to expand, ✕ back).
// The flex column lives on an INNER absolute layer (.pix-si-inner) because
// ComfyUI forces the addDOMWidget ROOT to inline display:block on rebuild /
// collapse (see the Nodes 2.0 clobber note in CLAUDE.md).

import { DEFAULT_STATE, FORMATS } from "./state.mjs";
import { pixAsset } from "../shared/api_url.mjs";
import { xhIconHTML } from "../xh_ui_kit.js";

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

let _cssDone = false;
export function injectCSS() {
  if (_cssDone || document.getElementById("xh-si-css")) {
    _cssDone = true;
    return;
  }
  _cssDone = true;
  const s = document.createElement("style");
  s.id = "xh-si-css";
  s.textContent = [
    // flex:1 1 0 (ABSOLUTE basis) + min-height:0, never height:100% - see the long
    // note on .pix-sv-root in js/save_video/ui.mjs. A percentage basis against a
    // not-yet-definite parent degrades to our content height, which is ~0 here
    // because .pix-si-inner is absolute, so the body stops filling and the picture
    // sticks at .pix-si-view's 120px floor. Same defect, same face family.
    ".pix-si-root{position:relative;width:100%;flex:1 1 0;min-height:0;box-sizing:border-box;}",
    ".pix-si-inner{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;padding:8px 10px 4px;box-sizing:border-box;overflow:hidden;font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);}",
    // top strip that holds the fold/unfold toggle (left-aligned + pulled up so
    // it hugs the slots and doesn't leave a big empty gap on the right)
    ".pix-si-topbar{display:flex;justify-content:flex-start;align-items:center;flex:0 0 auto;min-height:20px;margin:-6px 0 -6px;}",
    // orange square + white triangle, same idea as the group fold icon
    ".pix-si-fold{width:24px;height:22px;border:none;border-radius:4px;background:var(--pix-acc,#E8A33C);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto;}",
    ".pix-si-fold:hover{background:var(--xh-primary,#E8A33C);}",
    ".pix-si-fold i{display:block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;}",
    ".pix-si-fold:not(.folded) i{border-bottom:6px solid #fff;}", // ▲ = fold up
    ".pix-si-fold.folded i{border-top:6px solid #fff;}", // ▼ = open back up
    // gear beside the fold triangle - the SAME settings the right-click entry
    // opens, just reachable without hunting for a menu. The icon is the
    // bundled SVG as a CSS mask, never the ⚙ emoji: an emoji is drawn by the
    // OS, so it changes shape (and colour) per platform (convention #28).
    ".pix-si-gear{width:24px;height:22px;border:none;border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto;margin-left:4px;}",
    ".pix-si-gear::before{content:\"\";display:block;width:14px;height:14px;background:#bbb;" +
      "-webkit-mask:url(\"" + pixAsset("icons/note/gear.svg") + "\") center/contain no-repeat;" +
      "mask:url(\"" + pixAsset("icons/note/gear.svg") + "\") center/contain no-repeat;}",
    ".pix-si-gear:hover::before{background:var(--pix-acc,#E8A33C);}",
    ".pix-si-lab{display:block;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--pix-acc,#E8A33C);margin-bottom:4px;}",
    ".pix-si-row{display:flex;gap:6px;align-items:center;}",
    ".pix-si-field{flex:1;min-width:0;background:#1d1d1d;border:1px solid #444;border-radius:4px;color:#e0e0e0;padding:5px 8px;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit;width:100%;}",
    ".pix-si-field:focus{border-color:var(--pix-acc,#E8A33C);}",
    ".pix-si-field.mono{font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);font-variant-numeric:tabular-nums;font-size:12px;}",
    ".pix-si-btn{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);color:#ccc;border-radius:4px;padding:5px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;flex:0 0 auto;font-family:inherit;user-select:none;}",
    ".pix-si-btn:hover{background:var(--pix-acc,#E8A33C);border-color:var(--pix-acc,#E8A33C);color:#fff;}",
    ".pix-si-btn:disabled{opacity:.5;cursor:default;}",
    ".pix-si-btn:disabled:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.16);color:#ccc;}",
    // solid BRAND action buttons (Preview Image parity)
    ".pix-si-primary{background:var(--pix-acc,#E8A33C);border-color:var(--pix-acc,#E8A33C);color:#fff;}",
    ".pix-si-primary:hover{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);color:#fff;}",
    ".pix-si-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}",
    ".pix-si-chip{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);color:#ccc;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;font-family:inherit;user-select:none;}",
    ".pix-si-chip:hover{border-color:var(--pix-acc,#E8A33C);color:#eee;}",
    ".pix-si-prev{background:#1d1d1d;border:1px solid #444;border-radius:4px;padding:6px 8px;margin-top:8px;}",
    ".pix-si-prevlab{font-size:10px;color:#8f8f8f;margin-bottom:2px;}",
    ".pix-si-prevpath{font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);font-variant-numeric:tabular-nums;font-size:11px;color:#ffb59e;word-break:break-all;line-height:1.45;}",
    // a wired name that is only known once the workflow runs - marked so it
    // cannot be mistaken for part of the real filename
    ".pix-si-wired{font-style:italic;color:#bbb;border-bottom:1px dotted currentColor;cursor:help;}",
    ".pix-si-hint{font-size:10px;color:#8f8f8f;margin-top:4px;line-height:1.5;}",
    // toggles are rounded PILLS so they read as switches, not action buttons
    // (the rectangular orange buttons are the actions - user request)
    ".pix-si-seg{display:inline-flex;border:1px solid #444;border-radius:999px;overflow:hidden;flex:0 0 auto;}",
    ".pix-si-seg button{background:#1d1d1d;color:#aaa;border:none;padding:4px 11px;font-size:12px;cursor:pointer;font-family:inherit;}",
    ".pix-si-seg button.on{background:var(--pix-acc,#E8A33C);color:#fff;}",
    // the action buttons share the leftover row space EQUALLY and the row
    // ends flush with the right edge (flex-wrap only as a narrow fallback)
    ".pix-si-btnrow{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch;}",
    ".pix-si-grow{flex:1 1 0;min-width:0;justify-content:center;}",
    // ── the viewer ──
    ".pix-si-saved{flex:1 1 0;min-height:0;display:flex;flex-direction:column;gap:3px;}",
    ".pix-si-view{position:relative;flex:1 1 0;min-height:120px;background:#151515;border:1px solid #3c3c3c;border-radius:4px;overflow:hidden;}",
    ".pix-si-view.has{background:transparent;border-color:transparent;}",
    ".pix-si-big{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;cursor:pointer;display:none;}",
    ".pix-si-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#777;font-size:11px;padding:8px;text-align:center;}",
    ".pix-si-grid{position:absolute;inset:0;display:none;gap:4px;}",
    ".pix-si-view.gridmode .pix-si-grid{display:grid;}",
    ".pix-si-cell{position:relative;overflow:hidden;cursor:pointer;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;}",
    ".pix-si-cell img{width:100%;height:100%;object-fit:contain;display:block;}",
    ".pix-si-cell:hover{outline:1px solid var(--pix-acc,#E8A33C);outline-offset:-1px;border-radius:3px;}",
    ".pix-si-cellbadge{position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.55);color:#ddd;font-size:10px;padding:0 5px;border-radius:3px;pointer-events:none;}",
    ".pix-si-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18);color:#ddd;border-radius:4px;padding:4px 7px;font-size:11px;cursor:pointer;display:none;}",
    ".pix-si-view.has:hover .pix-si-nav.show{display:block;}",
    ".pix-si-nav.prev{left:6px;}",
    ".pix-si-nav.next{right:6px;}",
    ".pix-si-nav:hover{background:var(--pix-acc,#E8A33C);border-color:var(--pix-acc,#E8A33C);color:#fff;}",
    ".pix-si-count{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.55);color:#ddd;font-size:11px;padding:1px 7px;border-radius:3px;display:none;}",
    ".pix-si-x{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);color:#ddd;border-radius:4px;padding:2px 9px;font-size:11px;cursor:pointer;display:none;}",
    ".pix-si-x:hover{background:var(--pix-acc,#E8A33C);border-color:var(--pix-acc,#E8A33C);color:#fff;}",
    // one small info line under the image: dims + save summary + flashes
    ".pix-si-info{flex:0 0 auto;text-align:center;font-size:11px;color:#8f8f8f;min-height:12px;line-height:1.25;word-break:break-word;}",
    // the info line + Save now (after a Preview run) share one centred row
    ".pix-si-inforow{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;}",
    ".pix-si-inforow .pix-si-info{flex:0 1 auto;min-width:0;}",
    ".pix-si-savenow{padding:2px 10px;font-size:11px;}",
    // right-click settings panel (Run Timer palette; DROPPED by mistake in
    // the mockup-v2 rewrite - the panel rendered as an invisible unstyled
    // div at the page bottom. Keep this block when restyling the face!)
    ".pix-si-panel{position:fixed;z-index:10010;width:300px;max-width:94vw;background:#1a1a1a;border:1px solid #444;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);overflow:hidden;max-height:88vh;display:flex;flex-direction:column;}",
    ".pix-si-phead{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #333;color:#ddd;font-size:13px;font-weight:600;cursor:move;}",
    ".pix-si-px{border:0;background:transparent;color:#999;font-size:13px;cursor:pointer;padding:2px 7px;border-radius:4px;}",
    ".pix-si-px:hover{color:#fff;}",
    ".pix-si-pbody{padding:12px;display:flex;flex-direction:column;gap:12px;color:#ddd;overflow-y:auto;min-height:0;}",
    ".pix-si-prow{display:flex;align-items:center;gap:9px;}",
    ".pix-si-plab{font-size:12px;color:#ddd;}",
    ".pix-si-psub{font-size:10px;color:#8f8f8f;margin-top:2px;line-height:1.4;}",
    ".pix-si-qval{font-size:12px;color:var(--pix-acc,#E8A33C);min-width:24px;text-align:right;}",
    // "Buttons on the node" - on/off chips. Convention #13: idle is a bordered
    // dark chip, hover only brightens the border, ON is a solid accent fill.
    ".pix-si-bgrid{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;}",
    ".pix-si-bchip{flex:1 1 58px;background:#1d1d1d;border:1px solid #444;color:#aaa;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit;user-select:none;}",
    ".pix-si-bchip:hover{border-color:var(--pix-acc,#E8A33C);color:#ddd;}",
    ".pix-si-bchip.on{background:var(--pix-acc,#E8A33C);border-color:var(--pix-acc,#E8A33C);color:#fff;}",
    ".pix-si-qsl{flex:1;min-width:0;accent-color:var(--pix-acc,#E8A33C);}",
    '.pix-si-sw{width:30px;height:16px;border-radius:8px;background:#555;position:relative;display:inline-block;cursor:pointer;flex:0 0 auto;transition:background .15s;}',
    '.pix-si-sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#ccc;transition:left .15s;}',
    ".pix-si-sw.on{background:var(--pix-acc,#E8A33C);}",
    ".pix-si-sw.on::after{left:16px;background:#fff;}",
    // right-click menu on the preview image (Open / Copy / Save image)
    ".pix-si-menu{position:fixed;z-index:10011;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:4px;min-width:150px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font-family:var(--font-sans, ui-sans-serif, system-ui, sans-serif);}",
    ".pix-si-mitem{padding:6px 12px;font-size:12px;color:#ddd;border-radius:4px;cursor:pointer;white-space:nowrap;user-select:none;}",
    ".pix-si-mitem:hover{background:var(--pix-acc,#E8A33C);color:#fff;}",
    // Nodes 2.0: hide the native output-image preview panel for this node
    ".lg-node:has(.pix-si-root) .image-preview{display:none !important;}",
  ].join("\n");
  document.head.appendChild(s);
}

export function buildRoot() {
  const root = el("div", "pix-si-root");
  const inner = el("div", "pix-si-inner");
  root.appendChild(inner);

  // ── fold/unfold toggle (top strip, always visible) ──
  const topbar = el("div", "pix-si-topbar");
  const foldBtn = el("button", "pix-si-fold");
  foldBtn.type = "button";
  foldBtn.appendChild(el("i"));
  topbar.appendChild(foldBtn);
  const gearBtn = el("button", "pix-si-gear");
  gearBtn.type = "button";
  gearBtn.title = "设置：画质、编号位数、显示哪些按钮等等";
  topbar.appendChild(gearBtn);
  inner.appendChild(topbar);

  // ── folder (no label - the placeholder + hint say it all) ──
  const secFolder = el("div");
  const rowF = el("div", "pix-si-row");
  const folderInput = el("input", "pix-si-field");
  folderInput.type = "text";
  folderInput.spellcheck = false;
  folderInput.placeholder = "ComfyUI 输出目录";
  folderInput.title = "图片存哪。留空 = ComfyUI 的 output 目录。想用自己的目录：点「浏览」选一次（选过就永久放行），之后可以直接输入或粘贴。";
  const browseBtn = el("button", "pix-si-btn");
  browseBtn.type = "button";
  const browseLbl = el("span", null, "浏览");
  browseBtn.appendChild(browseLbl);
  browseBtn.title = "用系统文件夹窗口选一个目录";
  rowF.appendChild(folderInput);
  rowF.appendChild(browseBtn);
  secFolder.appendChild(rowF);
  secFolder.appendChild(
    el("div", "pix-si-hint", "Leave empty for the ComfyUI output folder. For your own folder, click Browse once.")
  );
  inner.appendChild(secFolder);

  // ── filename ──
  const secName = el("div");
  secName.appendChild(el("span", "pix-si-lab", "Filename"));
  const patternInput = el("input", "pix-si-field mono");
  patternInput.type = "text";
  patternInput.spellcheck = false;
  patternInput.placeholder = DEFAULT_STATE.pattern;
  patternInput.title = "文件名模板。点下面的小片插入占位符；下面一行是下一个文件的实际路径。文件不会互相覆盖：编号会接着目录里已有的最大号往下排。";
  secName.appendChild(patternInput);
  const chipsWrap = el("div", "pix-si-chips");
  secName.appendChild(chipsWrap);
  const prev = el("div", "pix-si-prev");
  prev.appendChild(el("div", "pix-si-prevlab", "Will save as"));
  const prevPath = el("div", "pix-si-prevpath", "");
  prev.appendChild(prevPath);
  secName.appendChild(prev);
  secName.appendChild(el("div", "pix-si-hint", "Type / in the name to create subfolders."));
  inner.appendChild(secName);

  // ── one wrapping button row: format + mode + actions (user's mockup) ──
  const secBtns = el("div");
  const btnRow = el("div", "pix-si-btnrow");
  const segFmt = el("div", "pix-si-seg");
  // One button per format, built from the FORMATS table and keyed by id so the
  // settings panel can hide any of them without this file knowing the rules.
  const fmtBtns = {};
  for (const f of FORMATS) {
    const b = el("button", null, f.label);
    b.type = "button";
    b.dataset.fmt = f.id;
    segFmt.appendChild(b);
    fmtBtns[f.id] = b;
  }
  fmtBtns.png.title = "无损 PNG。保留透明通道，并把工作流嵌进文件（拖回界面能还原）。";
  fmtBtns.webp.title = "WebP：比 PNG 小得多，保留透明通道，也能拖回 ComfyUI 还原工作流。";
  fmtBtns.jpg.title = "JPG 体积更小，画质在设置里调。没有透明通道，也没法从 JPG 还原工作流。";
  const segMode = el("div", "pix-si-seg");
  const modeSave = el("button", null, "保存");
  modeSave.type = "button";
  modeSave.title = "每次运行都把文件写出来";
  const modePreview = el("button", null, "预览");
  modePreview.type = "button";
  modePreview.title = "只在节点上显示，不往目录里写文件";
  segMode.appendChild(modeSave);
  segMode.appendChild(modePreview);
  const btnCopy = el("button", "pix-si-btn pix-si-primary pix-si-grow", "复制");
  btnCopy.type = "button";
  btnCopy.title = "把当前这张图复制到剪贴板";
  const btnOpen = el("button", "pix-si-btn pix-si-primary pix-si-grow", "打开");
  btnOpen.type = "button";
  btnOpen.title = "在浏览器新标签页里打开这张图";
  const btnFolder = el("button", "pix-si-btn pix-si-primary pix-si-grow", "文件夹");
  btnFolder.type = "button";
  btnFolder.title = "用资源管理器打开保存目录（窗口可能会出现在任务栏）";
  // order (user pick): Open, Copy, Open Folder, then the PNG/JPG + Save/Preview pills
  btnRow.appendChild(btnOpen);
  btnRow.appendChild(btnCopy);
  btnRow.appendChild(btnFolder);
  btnRow.appendChild(segFmt);
  btnRow.appendChild(segMode);
  secBtns.appendChild(btnRow);
  inner.appendChild(secBtns);

  // ── the viewer: single image fills, batches show a grid ──
  const secSaved = el("div", "pix-si-saved");
  const view = el("div", "pix-si-view");
  const bigImg = el("img", "pix-si-big");
  const grid = el("div", "pix-si-grid");
  const ph = el("div", "pix-si-ph", "跑一次工作流，出图会显示在这里");
  const navPrev = el("button", "pix-si-nav prev", "");
  navPrev.innerHTML = xhIconHTML("chevron-left", { size: 15, color: "current" });
  navPrev.type = "button";
  navPrev.title = "上一张";
  const navNext = el("button", "pix-si-nav next", "");
  navNext.innerHTML = xhIconHTML("chevron-right", { size: 15, color: "current" });
  navNext.type = "button";
  navNext.title = "下一张";
  const counter = el("div", "pix-si-count", "");
  const closeX = el("button", "pix-si-x", "");
  closeX.innerHTML = xhIconHTML("关闭", { size: 13, color: "current" });
  closeX.type = "button";
  closeX.title = "回到缩略图";
  view.appendChild(bigImg);
  view.appendChild(grid);
  view.appendChild(ph);
  view.appendChild(navPrev);
  view.appendChild(navNext);
  view.appendChild(counter);
  view.appendChild(closeX);
  secSaved.appendChild(view);
  // The info line, with Save now beside it after a Preview run: the line says
  // "not saved", and the way to save sits right there (hidden otherwise).
  const infoRow = el("div", "pix-si-inforow");
  const infoLine = el("div", "pix-si-info", "");
  const btnSaveNow = el("button", "pix-si-btn pix-si-primary pix-si-savenow", "Save now");
  btnSaveNow.type = "button";
  btnSaveNow.title =
    "Save every picture of this preview into your folder, with the settings above, without running the workflow again";
  btnSaveNow.style.display = "none";
  infoRow.appendChild(infoLine);
  infoRow.appendChild(btnSaveNow);
  secSaved.appendChild(infoRow);
  inner.appendChild(secSaved);

  return {
    root,
    inner,
    topbar,
    foldBtn,
    gearBtn,
    segFmt,
    fmtBtns,
    secFolder,
    secName,
    secBtns,
    folderInput,
    browseBtn,
    browseLbl,
    patternInput,
    chipsWrap,
    prevPath,
    modeSave,
    modePreview,
    btnCopy,
    btnOpen,
    btnFolder,
    savedSec: secSaved,
    view,
    grid,
    bigImg,
    ph,
    navPrev,
    navNext,
    counter,
    closeX,
    infoLine,
    btnSaveNow,
  };
}
