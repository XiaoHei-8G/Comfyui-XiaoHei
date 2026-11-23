// 小黑·标注 - one stylesheet for the node face AND the big view.
//
// ⚠️ The CSS below is a JS template literal: NO backticks and NO double-slash
// comments inside it (a backtick ends the literal and blanks every Pixaroma
// node; a double-slash line silently eats the next rule - convention #35).
// Use /* */ comments only, and run node --check after editing.

import { pixAsset } from "../shared/api_url.mjs";
import { ACC, ACC_HOVER } from "../shared/node_settings.mjs";

const CSS_ID = "pix-sketch-css";

export function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const gear = pixAsset("icons/note/gear.svg");
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = `
/* 2026-11-20 去 Pixaroma 化：原作者这套写死炭灰（#1d1d1d/#444/#151515/#2d2d2d…）
   是「一眼认出是复刻」的根源。全部改读家族 --xh-* 官方变量（syncXhCssVars 写在
   documentElement，DOM widget 也能继承），明暗主题与配色预设自动正交。
   DOM widget 不在 .pxf-overlay 里，拿不到 theme.mjs 的 --pxf-radius ⇒ 这里自带兜底。 */
.pix-sketch-root,.pix-sketch-big{--ps-radius:8px;}
/* the DOM widget root: fills its row, never sizes itself (nodes2-preview-fill #4) */
.pix-sketch-root{position:relative;flex:1 1 0;min-height:0;box-sizing:border-box;}
/* the layout lives on an INNER layer: ComfyUI sets the root's display itself (fill #37) */
.pix-sketch-inner{position:absolute;inset:0;display:flex;flex-direction:column;gap:6px;padding:6px 8px 8px;
  box-sizing:border-box;overflow:hidden;font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  color:var(--xh-text,#e8e8e8);}
.pix-sketch-row1,.pix-sketch-row2{display:flex;align-items:center;gap:4px;flex:0 0 auto;min-width:0;}
.pix-sketch-grow{flex:1 1 auto;min-width:4px;}
.pix-sketch-btn{width:28px;height:26px;padding:0;border-radius:var(--ps-radius);background:var(--xh-input-bg,#141414);
  border:1px solid var(--xh-border,#333333);color:var(--xh-sub,#8a8a8a);
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto;box-sizing:border-box;}
.pix-sketch-btn:hover{border-color:${ACC};color:var(--xh-text,#e8e8e8);}
.pix-sketch-btn.on{background:${ACC};border-color:${ACC};color:#fff;}
.pix-sketch-btn:disabled,.pix-sketch-btn:disabled:hover{opacity:.35;cursor:default;border-color:var(--xh-border,#333333);color:var(--xh-sub,#8a8a8a);}
.pix-sketch-btn svg{width:16px;height:16px;display:block;}
.pix-sketch-gear::before{content:"";display:block;width:15px;height:15px;background:currentColor;
  -webkit-mask:url("${gear}") center/contain no-repeat;mask:url("${gear}") center/contain no-repeat;}
.pix-sketch-sep{width:1px;height:18px;background:var(--xh-border,#333333);margin:0 2px;flex:0 0 auto;}
.pix-sketch-hsep{width:22px;height:1px;background:var(--xh-border,#333333);margin:3px 0;flex:0 0 auto;}
/* 色板 2026-11-20：原版 18px 小方块 + 双层描边（border + box-shadow）是 Pixaroma
   招牌手势。改 22px 圆角实心块、去外圈，选中只留一圈强调色——大气、一眼不像复刻。 */
.pix-sketch-sw{width:22px;height:22px;padding:0;border-radius:var(--ps-radius);border:none;
  cursor:pointer;flex:0 0 auto;box-sizing:border-box;margin:0 2px;transition:box-shadow .12s,transform .12s;}
.pix-sketch-sw:hover{transform:translateY(-1px);box-shadow:0 0 0 2px var(--xh-text,#e8e8e8);}
.pix-sketch-sw.on{box-shadow:0 0 0 2px ${ACC},0 0 0 4px var(--xh-surface,#1c1c1c);}
.pix-sketch-wl{color:var(--xh-sub,#8a8a8a);font-size:11px;margin-right:2px;flex:0 0 auto;}
.pix-sketch-w{height:24px;min-width:26px;padding:0 5px;border-radius:var(--ps-radius);
  background:var(--xh-input-bg,#141414);border:1px solid var(--xh-border,#333333);color:var(--xh-sub,#8a8a8a);
  font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);cursor:pointer;box-sizing:border-box;flex:0 0 auto;}
.pix-sketch-w:hover{border-color:${ACC};color:var(--xh-text,#e8e8e8);}
.pix-sketch-w.on{background:${ACC};border-color:${ACC};color:#fff;}
.pix-sketch-stage{position:relative;flex:1 1 0;min-height:140px;border-radius:var(--ps-radius);overflow:hidden;
  background:var(--xh-side,#141414);border:1px solid var(--xh-border,#333333);cursor:crosshair;touch-action:none;user-select:none;}
.pix-sketch-stage.nopic{cursor:default;}
.pix-sketch-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;
  padding:14px;color:var(--xh-sub,#8a8a8a);font-size:12px;line-height:1.5;pointer-events:none;}
.pix-sketch-warn{position:absolute;left:6px;top:6px;right:6px;padding:4px 8px;border-radius:var(--ps-radius);
  background:var(--xh-bar-bg,rgba(0,0,0,.25));color:var(--xh-primary,#E8A33C);font-size:12px;line-height:1.35;pointer-events:none;}
.pix-sketch-txt{position:absolute;z-index:2;width:150px;box-sizing:border-box;background:var(--xh-card,#252525);color:var(--xh-text,#e8e8e8);
  border:1px solid ${ACC};border-radius:var(--ps-radius);padding:3px 6px;font:13px var(--font-sans, ui-sans-serif, system-ui, sans-serif);outline:none;}
/* the list may shrink to ONE row and scroll: Classic resizes can bypass the node's
   own floor (Align writes the size clamped only to computeSize), and a list that
   gives way beats the whole body spilling out of the node */
.pix-sketch-list{flex:0 1 auto;display:flex;flex-direction:column;gap:4px;max-height:108px;overflow-y:auto;min-height:24px;}
.pix-sketch-mrow{display:flex;align-items:center;gap:6px;flex:0 0 auto;min-height:24px;}
.pix-sketch-badge{width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;display:inline-flex;
  align-items:center;justify-content:center;flex:0 0 auto;}
.pix-sketch-name{width:92px;flex:0 0 auto;color:var(--xh-text,#e8e8e8);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pix-sketch-note{flex:1 1 auto;min-width:0;height:24px;box-sizing:border-box;background:var(--xh-input-bg,#141414);color:var(--xh-text,#e8e8e8);
  border:1px solid var(--xh-border,#333333);border-radius:var(--ps-radius);padding:3px 7px;font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);outline:none;}
.pix-sketch-note:focus{border-color:${ACC};}
.pix-sketch-del{background:none;border:none;color:var(--xh-sub,#8a8a8a);cursor:pointer;font-size:16px;line-height:1;padding:0 3px;flex:0 0 auto;}
.pix-sketch-del:hover{color:var(--xh-danger,#e05858);}
.pix-sketch-hint{color:var(--xh-sub,#8a8a8a);font-size:12px;min-height:24px;display:flex;align-items:center;flex:0 0 auto;line-height:1.3;}
/* the prompt is a READ-ONLY readout: the lighter raised surface, never the dark "type here" field (convention #3) */
.pix-sketch-prompt{flex:0 0 auto;background:var(--xh-card,#252525);border:1px solid var(--xh-border,#333333);
  border-radius:var(--ps-radius);padding:4px 8px 6px;display:flex;flex-direction:column;gap:2px;}
.pix-sketch-phead{display:flex;align-items:center;gap:8px;min-height:18px;}
.pix-sketch-plabel{color:var(--xh-sub,#8a8a8a);font-size:11.5px;letter-spacing:0;flex:1 1 auto;}
.pix-sketch-ptext{color:var(--xh-text,#e8e8e8);font-size:12px;line-height:1.4;height:34px;overflow-y:auto;white-space:pre-wrap;
  word-break:break-word;cursor:text;user-select:text;}
.pix-sketch-ptext.empty{color:var(--xh-sub,#8a8a8a);font-style:italic;}
.pix-sketch-swc{display:flex;align-items:center;gap:6px;color:var(--xh-text,#e8e8e8);font-size:11px;cursor:pointer;user-select:none;flex:0 0 auto;}
.pix-sketch-tog{width:28px;height:16px;border-radius:8px;background:var(--xh-border,#333333);position:relative;flex:0 0 auto;}
.pix-sketch-tog::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;
  background:var(--xh-text,#e8e8e8);transition:left .12s;}
.pix-sketch-tog.on{background:${ACC};}
.pix-sketch-tog.on::after{left:14px;background:#fff;}

/* ---- the floating overlays on the picture (方案 A, 2026-11-20) ----
   The picture owns the whole body; tools run down its left edge, Expand and
   Gear sit in the top right corner, colours and line width along the bottom.
   Every panel has the same smoked glass look so it reads as one system and
   never fights the picture under it. */
.pix-sketch-vtools,.pix-sketch-hact,.pix-sketch-hcolor{position:absolute;z-index:3;display:flex;
  background:var(--xh-title-bg,rgba(0,0,0,.45));border:1px solid var(--xh-border,#333333);border-radius:var(--ps-radius);
  box-shadow:0 2px 10px var(--xh-shadow,rgba(0,0,0,.5));}
.pix-sketch-vtools{left:6px;top:6px;flex-direction:column;align-items:center;gap:2px;padding:4px;}
.pix-sketch-vtools .pix-sketch-btn{width:26px;height:22px;}
.pix-sketch-vtools .pix-sketch-hsep{width:22px;height:1px;background:var(--xh-border,#333333);margin:2px 0;}
.pix-sketch-hact{right:6px;top:6px;gap:4px;padding:4px;}
.pix-sketch-hcolor{left:6px;right:6px;bottom:6px;align-items:center;gap:4px;padding:5px 6px;min-width:0;}
.pix-sketch-hcolor .pix-sketch-grow{min-width:2px;}
.pix-sketch-caret{width:20px;height:16px;padding:0;border:none;background:none;color:var(--xh-sub,#8a8a8a);cursor:pointer;
  font-size:11px;line-height:1;flex:0 0 auto;}
.pix-sketch-caret:hover{color:${ACC};}
/* 清空全部标记：破坏性操作，危险色 + 移到右上角（大厂档 2026-11-20）。
   与「完成」分开、跟画笔拉开距离，点一下先弹二次确认。 */
.pix-sketch-btn.pix-sketch-clear{color:var(--xh-danger,#e05858);}
.pix-sketch-btn.pix-sketch-clear:hover:not(:disabled){border-color:var(--xh-danger,#e05858);
  color:#fff;background:var(--xh-danger,#e05858);}
.pix-sketch-prompt.collapsed .pix-sketch-ptext{display:none;}
.pix-sketch-prompt.collapsed{padding:4px 8px;}

/* ---- the big view ---- */
.pix-sketch-big{position:fixed;inset:0;z-index:10000;background:var(--xh-bar-bg,rgba(0,0,0,.55));display:flex;align-items:stretch;
  justify-content:center;padding:18px;box-sizing:border-box;font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  color:var(--xh-text,#e8e8e8);outline:none;}
.pix-sketch-bpanel{flex:1 1 auto;max-width:1680px;display:flex;flex-direction:column;background:var(--xh-surface,#1c1c1c);
  border:1px solid var(--xh-border,#333333);border-radius:12px;overflow:hidden;box-shadow:0 12px 40px var(--xh-shadow,rgba(0,0,0,.6));min-width:0;}
.pix-sketch-bhead{height:46px;display:flex;align-items:center;gap:12px;padding:0 12px 0 16px;background:var(--xh-side,#141414);
  border-bottom:1px solid var(--xh-border,#333333);flex:0 0 auto;}
.pix-sketch-bhead-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
.pix-sketch-btitle{font-weight:500;font-size:13px;}
.pix-sketch-bhint{color:var(--xh-sub,#8a8a8a);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pix-sketch-done{height:30px;padding:0 20px;border-radius:var(--ps-radius);border:1px solid ${ACC};background:${ACC};
  color:#fff;font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif);cursor:pointer;flex:0 0 auto;}
.pix-sketch-done:hover{background:${ACC_HOVER};border-color:${ACC_HOVER};}
.pix-sketch-bmain{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:52px minmax(0,1fr) 330px;}
.pix-sketch-brail{background:var(--xh-side,#141414);border-right:1px solid var(--xh-border,#333333);display:flex;flex-direction:column;align-items:center;
  gap:6px;padding:10px 0;}
.pix-sketch-brail .pix-sketch-btn{width:34px;height:32px;}
.pix-sketch-bcenter{min-width:0;min-height:0;padding:14px;display:flex;}
.pix-sketch-bcenter .pix-sketch-stage{flex:1 1 auto;min-height:0;}
.pix-sketch-bside{background:var(--xh-side,#141414);border-left:1px solid var(--xh-border,#333333);padding:12px;display:flex;flex-direction:column;
  gap:10px;min-height:0;overflow-y:auto;}
.pix-sketch-bside h4{margin:2px 0 0;font-size:12px;color:var(--xh-sub,#8a8a8a);font-weight:500;}
.pix-sketch-bcolors{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
/* the side panel is too narrow for the swatches AND the widths on one line:
   break on purpose, so the widths get their own labelled row, never a lone XL */
.pix-sketch-bcolors .pix-sketch-grow{flex:0 0 100%;height:0;min-width:0;}
.pix-sketch-bside .pix-sketch-list{max-height:none;flex:0 0 auto;}
.pix-sketch-bside .pix-sketch-ptext{height:auto;min-height:40px;max-height:200px;}
@media (max-width:900px){ .pix-sketch-bmain{grid-template-columns:48px minmax(0,1fr) 250px;} }
`;
  document.head.appendChild(s);
}
