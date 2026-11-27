import { app } from "../../../scripts/app.js";
import { xhIconHTML } from "../xh_ui_kit.js";
import { createPixaromaColorPicker, PIXAROMA_PALETTE } from "../shared/color_picker.mjs";
import { openHelpPopup, openHelpFor, closeHelpPopup } from "../shared/help.mjs";
import { makeXhLogo } from "../shared/brand_logo.mjs";
import { installGraphUndoGuard } from "../shared/graph_undo_guard.mjs";
import {
  DEFAULTS,
  FONT_CHOICES,
  FONT_STACKS,
  FONT_SAMPLE_TEXT,
  FONT_LABELS,
  FONT_HINTS,
  COLOR_PRESETS,
  contrastRatio,
  richHtmlOf,
  sanitizeRich,
  measureLabel,
  renderLabelToCanvas,
  injectCSS,
  onEmbeddedFontsReady,
} from "./render.mjs";
import { attachRichEditing, richToText } from "./rich.mjs";

// Shared-style help (same themed popup as the Group help). Registered for the
// selection-toolbar ? button (index.js) AND opened by the in-editor ? button.
export const LABEL_HELP = {
  title: "浮字标签 小黑",
  tagline: "贴在画布上的一块文字说明，用来给工作流写标注。双击画布上的标签即可打开这个编辑器。",
  sections: [
    // 原版这里曾有两个互相覆盖的帮助条目，后加载的会静默盖掉前一个，
    // 导致一半说明根本显示不出来。现合并成这一份，就放在它描述的编辑器旁边。
    { heading: "它能干什么", body: "直接把一段带样式的文字画在画布上，用来给工作流的某一部分做标注。它没有输入、没有输出，也永远不会执行，不占用任何算力——它只是给你看的。标签会自动缩放到刚好包住文字。" },
    { heading: "文字", body: "可以输入任意内容，支持多行和表情符号。想给其中某几个字单独换颜色、放大或加粗：**先按住左键选中那一段 → 右键 → 在弹出的菜单里点颜色 / 字号 / 加粗**，只有选中的字会变，其它字不动。点「清除格式」恢复跟随整块设置。从网页复制的内容只取纯文字，不会带一堆乱七八糟的样式。" },
    { heading: "排版", defs: [
      ["字体", "每个按钮上写的都是「小黑」，字形不同就代表不同字体，鼠标停上去会提示字体名：黑体（无衬线）、宋体（衬线）、楷体（手写）、粗黑、等线（细现代）、仿宋（公文感）、得意黑（标题冲击体，斜着的那款）。前六款读你电脑自带的字体，最后一款「得意黑」是**随包自带**的开源字体——别人的电脑就算没装这款字，装了我们这个包也能看到一模一样的字形。选哪个，预览和画布上的字就跟着变。"],
      ["B", "开启或关闭加粗。"],
      ["对齐", "多行文字可选左对齐、居中或右对齐。"],
      ["字号", "拖动滑块、直接输入数值，或点上下箭头微调（范围 8 到 256 像素）。"],
    ] },
    { heading: "颜色", defs: [
      ["对比预设", "一排小方块，每个卡片的底色就是背景色、中间的「字」就是文字色，不用点开就能看出清不清楚。点一下，背景和文字会一起换成这一组，常用于字幕、标注的高对比搭配（白底黑字、黑底白字、黄底黑字、黑底黄字、蓝底白字、红底白字、透明底白字）。鼠标停上去会显示这组的真实对比度。想微调就接着用下面的色板。"],
      ["背景 / 文字", "先点 `背景` 或 `文字` 按钮，选中要改的那一块，按钮上会显示当前的色值。接着在右侧色板里挑颜色、在左边的取色方块里拖动，或直接在下方色值条里输入十六进制色号。"],
      ["透明", "让背景变透明，只留文字压在画面上（仅背景可用）。"],
    ] },
    { heading: "间距与样式", defs: [
      ["内边距", "文字与标签边缘之间的留白。"],
      ["圆角", "背景色块的圆角大小。"],
      ["不透明度", "整个标签的透明度。"],
      ["行高", "多行文字的行与行之间的距离。"],
    ] },
    { heading: "加到画布", body: "在画布上右键，选 ` 添加 XiaoHei 浮字标签` 放下一个新标签，然后双击它进入编辑。" },
  ],
  footer: "这个节点在工作流运行时不执行，留多少个都不会拖慢速度。",
};

// ─── Config helpers ──────────────────────────────────────────
export function parseCfg(node) {
  const w = (node.widgets || []).find((x) => x.name === "label_json");
  if (!w?.value || w.value === "{}") return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(w.value) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveCfg(node, cfg) {
  node._labelCfg = cfg;
  const w = (node.widgets || []).find((x) => x.name === "label_json");
  if (w) {
    const json = JSON.stringify(cfg);
    w.value = json;
    if (node.widgets_values) {
      const i = node.widgets.findIndex((x) => x.name === "label_json");
      if (i > -1) node.widgets_values[i] = json;
    }
    if (w.callback) w.callback(w.value);
  }
  // Resize the node to fit the edited content. This is an explicit user edit,
  // so a size change is legitimate (the node no longer re-measures on load -
  // see setupLabel in index.js - so this is the place that keeps the box
  // fitted to the text).
  const m = measureLabel(cfg);
  // Guard against a corrupted label_json (non-numeric fontSize/padding/etc.)
  // producing NaN dims, which would corrupt node.setSize.
  const nw = Number.isFinite(m.w) ? Math.max(m.w, 60) : 60;
  const nh = Number.isFinite(m.h) ? Math.max(m.h, 30) : 30;
  // setSize goes through the official resize path so the new size sticks in
  // Nodes 2.0 too (a bare node.size[] write can be reverted there); falls back
  // to a direct write on older builds without setSize.
  if (typeof node.setSize === "function") node.setSize([nw, nh]);
  else if (node.size) { node.size[0] = nw; node.size[1] = nh; }
  node._xhLblRender?.(); // Nodes 2.0: refresh the crisp-HTML label (no-op in legacy)
  node._xhLblFit?.();    // Nodes 2.0: snap node width to the real text (no-op in legacy)
  if (app.graph) {
    app.graph.setDirtyCanvas(true, true);
    if (typeof app.graph.change === "function") app.graph.change();
  }
}

// ─── Editor Popup ────────────────────────────────────────────
export class LabelEditor {
  constructor(node) {
    this.node = node;
    this.cfg = { ...parseCfg(node) };
    this._el = null;
  }

  open() {
    injectCSS();
    this._build();
    document.body.appendChild(this._el);
    this._updatePreview();
    // 内置字体（得意黑）是异步下载的：没加载完时预览会用 fallback 画，
    // 而且 canvas 不会自己重绘 ⇒ 加载完成后补一次，否则用户切到「得意黑」
    // 看不出变化（跟 §13.75 一模一样的坑）。
    onEmbeddedFontsReady(() => { if (this._el) this._updatePreview(); });
    // After layout settles, match the color picker's height to the swatch grid
    // so their bottoms (and the hex bar / Transparent button below them) line up.
    requestAnimationFrame(() => requestAnimationFrame(() => this._alignColorColumns()));
    // Block ComfyUI's canvas shortcuts while the editor is open, but LET keys
    // through when a form control is focused so typing + Enter / Arrow in the
    // editor's inputs (slider number fields, hex, textarea) work normally. Esc
    // closes the help overlay if open, otherwise the editor.
    // NB: we deliberately do NOT call installFocusTrap - its mouseup-refocus steals
    // focus on every button / swatch / canvas click, which breaks typing in this
    // form-heavy editor (Vue Frontend Compatibility #7). The capture handlers below
    // are enough to isolate ComfyUI's canvas shortcuts.
    this._keyBlock = (e) => {
      // Self-heal: if the overlay was torn down without close() running (a host
      // path that bypasses our teardown), close out so these capture listeners
      // can't linger and swallow every keypress globally.
      if (!this._el || !this._el.isConnected) { this.close(); return; }
      if (e.type === "keydown" && e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (document.querySelector(".xh-help-backdrop")) closeHelpPopup();
        else this.close();
        return;
      }
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", this._keyBlock, true);
    window.addEventListener("keyup", this._keyBlock, true);
    window.addEventListener("keypress", this._keyBlock, true);
    // The key block above cannot stop ComfyUI's Ctrl+Z: 3 presses with the editor open removed every node, this
    // Label included (2026-10-15). See js/shared/graph_undo_guard.mjs.
    this._undoGuardOff = installGraphUndoGuard(() => !!this._el?.isConnected);
  }

  close() {
    this._undoGuardOff?.();
    this._undoGuardOff = null;
    this._richOff?.();
    this._richOff = null;
    window.removeEventListener("keydown", this._keyBlock, true);
    window.removeEventListener("keyup", this._keyBlock, true);
    window.removeEventListener("keypress", this._keyBlock, true);
    closeHelpPopup();
    this._picker?.destroy?.();
    this._picker = null;
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  }

  save() {
    saveCfg(this.node, this.cfg);
    this.close();
  }

  // Reset styling to defaults (keeps the typed text). Rebuilds the editor UI in
  // place so every control reflects the defaults; the change only reaches the
  // node when the user clicks Save (Cancel still discards everything).
  _resetAll() {
    closeHelpPopup();              // don't leave the Help card floating over the rebuilt editor
    this._rafPending = false;      // drop any queued preview render aimed at the old canvas
    const keepText = this.cfg.text;
    this.cfg = { ...DEFAULTS, text: keepText };
    const old = this._el;
    this._picker?.destroy?.();
    this._picker = null;
    this._build();
    if (old && old.parentNode) old.replaceWith(this._el);
    else document.body.appendChild(this._el);
    this._updatePreview();
    requestAnimationFrame(() => requestAnimationFrame(() => this._alignColorColumns()));
  }

  _build() {
    const c = this.cfg;
    const el = (tag, cls) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };
    const lbl = (text) => {
      const l = el("div", "xh-lbl-lbl");
      l.textContent = text;
      return l;
    };
    const vsep = () => el("span", "xh-lbl-vsep");

    const overlay = el("div", "xh-lbl-overlay");
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) this.close();
    });
    const panel = el("div", "xh-lbl-panel");
    overlay.appendChild(panel);

    // ── Header
    const header = el("div", "xh-lbl-header");
    const titleSpan = el("span", "xh-lbl-title");
    // 2026-11-19：原为 <img src="xh_logo.svg">（底色写死旧品牌橙）⇒ 换主题后
    // 左上角仍是一块橙。改走家族内联 logo，底色跟 --xh-primary。
    titleSpan.appendChild(makeXhLogo("xh-lbl-title-logo", 18));
    titleSpan.append(" 标签编辑器 ");
    const brandSpan = el("span", "xh-lbl-title-brand");
    brandSpan.textContent = "XiaoHei";
    titleSpan.appendChild(brandSpan);
    header.appendChild(titleSpan);
    const closeBtn = el("button", "xh-lbl-close");
    closeBtn.dataset.xhIconDone = "1";
    closeBtn.innerHTML = xhIconHTML("x", { size: 14, color: "current" });
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // ── Body
    const body = el("div", "xh-lbl-body");
    panel.appendChild(body);

    // ── Text
    // 2026-11-25：textarea 改成 contenteditable，为了支持「选中一段文字单独
    // 改字号 / 颜色 / 加粗」（从老「标签」节点移植的富文本能力）。存档同时写两份：
    //   cfg.text ← 纯文本（老契约，缺了就自动退化，渲染不受影响）
    //   cfg.rich ← 受限 HTML（只有 span/br，白名单清洗过）
    const textField = el("div", "xh-lbl-field");
    textField.appendChild(lbl("文字"));
    const ta = document.createElement("div");
    ta.className = "xh-lbl-text";
    ta.contentEditable = "true";
    ta.spellcheck = false;
    ta.setAttribute("role", "textbox");
    ta.setAttribute("aria-multiline", "true");
    ta.setAttribute("aria-label", "标签文字（选中一段后右键可单独改字号、颜色、加粗）");
    ta.innerHTML = richHtmlOf(c);
    const readText = () => {
      c.rich = sanitizeRich(ta.innerHTML);
      c.text = richToText(ta.innerHTML);
      this._updatePreview();
    };
    ta.addEventListener("input", readText);
    // 只接纯文本：从网页粘一段带样式的进来会污染存档，也会把整块排版打乱
    ta.addEventListener("paste", (e) => {
      const txt = (e.clipboardData || window.clipboardData)?.getData("text/plain");
      if (txt == null) return;
      e.preventDefault();
      document.execCommand("insertText", false, txt);
    });
    this._richOff = attachRichEditing(ta);
    textField.appendChild(ta);
    // 一行常驻提示。富文本是「隐式」能力，不写出来没人会发现；同时也是
    // 「前端是不是新版」的自检标记 —— 看不到这行就是旧 JS，得 Ctrl+F5。
    const richHint = el("div", "xh-lbl-hint");
    richHint.textContent = "左键选中一段文字 → 右键 → 改字号 / 颜色 / 加粗（只改选中的字）";
    textField.appendChild(richHint);
    body.appendChild(textField);

    // ── Preview (fit-to-area, DPR-sharp, never clipped — see _renderPreview)
    const prevSection = el("div");
    prevSection.appendChild(lbl("预览"));
    const prevWrap = el("div", "xh-lbl-preview");
    this._previewCanvas = document.createElement("canvas");
    prevWrap.appendChild(this._previewCanvas);
    prevSection.appendChild(prevWrap);
    body.appendChild(prevSection);

    // ── Typography: 字体 4 格单独占一行（格子够宽才看得出字形差异），
    //    加粗 + 对齐放下一行 —— 8 个按钮挤一行会把「小黑」压成小方块。
    const typoSection = el("div");
    typoSection.appendChild(lbl("排版"));
    const fontBtns = el("div", "xh-lbl-btns xh-lbl-fontrow");

    const fontBtnEls = [];
    for (let i = 0; i < FONT_CHOICES.length; i++) {
      const btn = el("button", "xh-lbl-btn xh-lbl-fontbtn");
      // 样例文字用汉字「小黑」，字体靠各自的中文优先字体栈区分
      btn.textContent = FONT_SAMPLE_TEXT;
      btn.style.fontFamily = FONT_STACKS[i];
      btn.title = `小黑 · ${FONT_HINTS[i]}`;
      btn.setAttribute("aria-label", `字体：${FONT_LABELS[i]}`);
      if (c.fontFamily === FONT_CHOICES[i]) btn.classList.add("active");
      btn.onclick = () => {
        c.fontFamily = FONT_CHOICES[i];
        fontBtnEls.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._updatePreview();
      };
      fontBtnEls.push(btn);
      fontBtns.appendChild(btn);
    }
    typoSection.appendChild(fontBtns);

    const styleBtns = el("div", "xh-lbl-btns xh-lbl-stylerow");

    // Bold
    const boldBtn = el("button", "xh-lbl-btn xh-lbl-bold");
    boldBtn.textContent = "B";
    if (c.fontWeight === "bold") boldBtn.classList.add("active");
    boldBtn.onclick = () => {
      c.fontWeight = c.fontWeight === "bold" ? "normal" : "bold";
      boldBtn.classList.toggle("active");
      this._updatePreview();
    };
    styleBtns.appendChild(boldBtn);
    styleBtns.appendChild(vsep());

    // Align
    const aligns = ["left", "center", "right"];
    const alignBtnEls = [];
    for (const a of aligns) {
      const btn = el("button", `xh-lbl-btn xh-lbl-align-${a}`);
      btn.title = ({ left: "左对齐", center: "居中", right: "右对齐" })[a] || a;
      const icon = el("div", "xh-lbl-align-icon");
      icon.innerHTML = "<span></span><span></span><span></span>";
      btn.appendChild(icon);
      if (c.textAlign === a) btn.classList.add("active");
      btn.onclick = () => {
        c.textAlign = a;
        alignBtnEls.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._updatePreview();
      };
      alignBtnEls.push(btn);
      styleBtns.appendChild(btn);
    }

    typoSection.appendChild(styleBtns);

    // Font size — full-width slider + number + spinner
    const fsField = this._sliderRow("字号", 8, 256, 1,
      () => c.fontSize, (n) => { c.fontSize = n; },
      (n) => String(Math.round(n)), (x) => x);
    fsField.style.marginTop = "8px";
    typoSection.appendChild(fsField);
    body.appendChild(typoSection);

    // ── Colors: two Group-style bars (chip + label + editable hex) that double
    //    as the target selector, plus the shared SV/hue/hex picker (left) and our
    //    own swatch grid (right). The bars match the Group "Title #hex / Body #hex"
    //    look so it's obvious WHICH colour you're changing. Transparent is a
    //    Background-only option shown as a labelled button below the grid, so the
    //    swatch grid always fills complete rows for BOTH targets (no empty cells).
    const colorSection = el("div");
    colorSection.appendChild(lbl("颜色"));

    let target = "bg";
    const curColorFor = (k) => (k === "bg" ? c.backgroundColor : c.fontColor);
    const isTransp = () => c.backgroundColor === "transparent";

    // Two color buttons (Background / Text) — Prompt-Multi-style segmented pills
    // (solid orange = active, gray = inactive). They select which target the
    // picker + swatches edit; the selected colour's label + editable hex code
    // shows in the bar UNDER the picker (Group "Body #hex" style).
    const bars = el("div", "xh-lbl-cbars");
    const mkBar = (key, text) => {
      const bar = el("button", "xh-lbl-cbar");
      bar.type = "button";
      bar.textContent = text;
      bar._key = key;
      bars.appendChild(bar);
      return bar;
    };
    const bgBar = mkBar("bg", "背景");
    const txBar = mkBar("text", "文字");
    const allBars = [bgBar, txBar];
    colorSection.appendChild(bars);

    // ── 对比预设（2026-11-25 用户要求）────────────────────────
    // 一键同时定「背景 + 文字」，省掉逐个调两个色的麻烦。卡片自己就是预览：
    // 卡底画背景色、中间的「字」画文字色，一眼就能判断清不清楚。
    // 只用 WCAG 高对比组合；鼠标停上去显示真实对比度比值。
    const preLabel = el("div", "xh-lbl-prelabel");
    preLabel.textContent = "对比预设";
    colorSection.appendChild(preLabel);

    const presetRow = el("div", "xh-lbl-presets");
    const presetEls = [];
    for (const p of COLOR_PRESETS) {
      const btn = el("button", "xh-lbl-preset");
      btn.type = "button";
      const isTrans = p.bg === "transparent";
      if (isTrans) btn.classList.add("is-transp");
      else btn.style.background = p.bg;
      const cap = el("span", "xh-lbl-preset-tx");
      cap.textContent = "字";
      cap.style.color = p.fg;
      btn.appendChild(cap);
      const ratio = isTrans ? null : contrastRatio(p.bg, p.fg);
      btn.title = ratio
        ? `${p.name} · 对比度 ${ratio.toFixed(1)}:1`
        : `${p.name} · 背景透明，字压在画面上`;
      btn.setAttribute("aria-label", btn.title);
      presetEls.push({ el: btn, p });
      presetRow.appendChild(btn);
    }
    colorSection.appendChild(presetRow);

    // 当前「背景 + 文字」正好等于某组预设时，那组高亮（手动微调后自动取消）。
    const syncPresets = () => {
      const bg = String(c.backgroundColor || "").toLowerCase();
      const fg = String(c.fontColor || "").toLowerCase();
      for (const { el: b, p } of presetEls) {
        b.classList.toggle(
          "active",
          bg === String(p.bg).toLowerCase() && fg === String(p.fg).toLowerCase()
        );
      }
    };

    // Swatch grid (right column): the 36 shared palette colours in a perfect
    // 9x4 grid (no transparent tile — it lives below as a labelled button so the
    // grid never has empty cells, for either target).
    const swGrid = el("div", "xh-lbl-swgrid");
    const swTiles = [];
    for (const hex of PIXAROMA_PALETTE) {
      const t = el("button", "xh-lbl-swtile");
      t.style.background = hex;
      t.title = hex;
      swGrid.appendChild(t);
      swTiles.push({ el: t, hex });
    }

    // Transparent — Background only, below the grid (a labelled control, never an
    // empty grid cell).
    const transBtn = el("button", "xh-lbl-transbtn");
    const transSw = el("span", "xh-lbl-transbtn-sw");
    transBtn.appendChild(transSw);
    transBtn.append("透明");
    transBtn.title = "背景透明";

    const syncBars = () => {
      for (const bar of allBars) bar.classList.toggle("active", target === bar._key);
    };
    const syncSwSel = () => {
      const cur = curColorFor(target);
      for (const { el: t, hex } of swTiles) {
        t.classList.toggle("active", !!(cur && hex.toLowerCase() === String(cur).toLowerCase()));
      }
      transBtn.classList.toggle("active", target === "bg" && isTransp());
    };
    const syncTransVis = () => { transBtn.style.display = target === "bg" ? "" : "none"; };

    const picker = createPixaromaColorPicker({
      initialColor: isTransp() ? "#333333" : c.backgroundColor,
      swatches: [],
      showClear: false,
      hideReset: true,   // our swatch grid already provides defaults; avoids a
                         // Reset that would set Text to the background gray
      resetColor: "#333333",
      onChange: (color) => {
        if (!color) return;
        if (target === "bg") c.backgroundColor = color;
        else c.fontColor = color;
        syncBars(); syncSwSel(); syncHexBar(); syncPresets(); this._updatePreview();
      },
    });
    this._picker = picker;

    // Hex bar UNDER the picker (Group "Body #hex" style): chip + the selected
    // target's label ("Background" / "Text") + its editable hex code in orange.
    // It follows the selected button; the picker's own hex field is hidden (CSS).
    const hexBar = el("div", "xh-lbl-hexbar");
    const hexChip = el("span", "xh-lbl-hexbar-chip");
    const hexK = el("span", "xh-lbl-hexbar-k");
    const hexV = document.createElement("input");
    hexV.type = "text";
    hexV.className = "xh-lbl-hexbar-v";
    hexV.spellcheck = false;
    hexV.setAttribute("aria-label", "当前颜色的十六进制色值");
    hexBar.appendChild(hexChip);
    hexBar.appendChild(hexK);
    hexBar.appendChild(hexV);

    const syncHexBar = () => {
      hexK.textContent = target === "bg" ? "背景" : "文字";
      const cur = curColorFor(target);
      const tr = target === "bg" && cur === "transparent";
      hexChip.classList.toggle("is-transp", tr);
      hexChip.style.background = tr ? "" : cur;
      if (document.activeElement !== hexV) hexV.value = tr ? "" : cur;
      hexV.placeholder = tr ? "透明" : "";
    };
    hexV.addEventListener("mousedown", (e) => e.stopPropagation());
    hexV.addEventListener("focus", () => hexV.select());
    hexV.addEventListener("input", () => {
      let v = hexV.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) {
        if (target === "bg") c.backgroundColor = v;
        else c.fontColor = v;
        picker.setColor(v);
        syncBars(); syncSwSel(); syncHexBar(); syncPresets(); this._updatePreview();
      }
    });
    hexV.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") hexV.blur();
    });
    hexV.addEventListener("blur", () => syncHexBar());

    // Layout: SV picker + hex bar (left) | swatch grid + Transparent (right).
    const colorRow = el("div", "xh-lbl-colorrow");
    const pickerCol = el("div", "xh-lbl-pickercol");
    pickerCol.appendChild(picker.element);
    pickerCol.appendChild(hexBar);
    const swatchCol = el("div", "xh-lbl-swatchcol");
    swatchCol.appendChild(swGrid);
    swatchCol.appendChild(transBtn);
    colorRow.appendChild(pickerCol);
    colorRow.appendChild(swatchCol);
    colorSection.appendChild(colorRow);

    const selectTarget = (k) => {
      target = k;
      const cur = curColorFor(k);
      picker.setColor(k === "bg" && cur === "transparent" ? "#333333" : cur);
      syncBars(); syncSwSel(); syncTransVis(); syncHexBar(); syncPresets();
    };

    // Bar interactions: click a button to choose which target the picker +
    // swatches edit (the live hex shows + edits under the picker).
    for (const bar of allBars) {
      bar.addEventListener("click", () => selectTarget(bar._key));
    }

    for (const { el: t, hex } of swTiles) {
      t.onclick = () => {
        if (target === "bg") c.backgroundColor = hex;
        else c.fontColor = hex;
        picker.setColor(hex);          // move the SV marker to the picked swatch
        syncBars(); syncSwSel(); syncHexBar(); syncPresets(); this._updatePreview();
      };
    }
    transBtn.onclick = () => {
      if (target !== "bg") return;     // transparent is Background-only
      c.backgroundColor = "transparent";
      syncBars(); syncSwSel(); syncHexBar(); syncPresets(); this._updatePreview();
    };

    // 点预设 = 背景和文字一起换，然后把左边的取色器 / 色值条 / 色板选中态
    // 同步到「当前目标」那个新色上，避免界面显示的还是上一组的颜色。
    for (const { el: b, p } of presetEls) {
      b.onclick = () => {
        c.backgroundColor = p.bg;
        c.fontColor = p.fg;
        const cur = curColorFor(target);
        picker.setColor(target === "bg" && cur === "transparent" ? "#333333" : cur);
        syncBars(); syncSwSel(); syncHexBar(); syncPresets(); this._updatePreview();
      };
    }

    syncBars(); syncSwSel(); syncTransVis(); syncHexBar(); syncPresets();
    body.appendChild(colorSection);

    // ── Spacing & Style — 2x2 grid of slider + number + spinner
    const spacingSection = el("div");
    spacingSection.appendChild(lbl("间距与样式"));
    const spacingGrid = el("div", "xh-lbl-spacing-grid");
    spacingGrid.appendChild(this._sliderRow("内边距", 0, 60, 1,
      () => c.padding, (n) => { c.padding = n; }, (n) => String(Math.round(n)), (x) => x));
    spacingGrid.appendChild(this._sliderRow("圆角", 0, 40, 1,
      () => c.borderRadius, (n) => { c.borderRadius = n; }, (n) => String(Math.round(n)), (x) => x));
    spacingGrid.appendChild(this._sliderRow("不透明度", 0, 1, 0.05,
      () => c.opacity, (n) => { c.opacity = n; }, (n) => Number(n).toFixed(2), (x) => x));
    spacingGrid.appendChild(this._sliderRow("行高", 1, 3, 0.1,
      () => c.lineHeight, (n) => { c.lineHeight = n; }, (n) => Number(n).toFixed(1), (x) => x));
    spacingSection.appendChild(spacingGrid);
    body.appendChild(spacingSection);

    // ── Footer
    const footer = el("div", "xh-lbl-footer");
    const helpBtn = el("button", "xh-lbl-help-btn");
    helpBtn.dataset.xhIconDone = "1";
    helpBtn.innerHTML = xhIconHTML("circle-help", { size: 14, color: "current" });
    helpBtn.title = "帮助";
    helpBtn.onclick = () => this._showHelp();
    const resetBtn = el("button", "xh-lbl-btn-reset");
    resetBtn.textContent = "重置";
    resetBtn.title = "恢复默认样式（保留已输入的文字）";
    resetBtn.onclick = () => this._resetAll();
    const spacer = el("div", "xh-lbl-footer-spacer");
    const cancelBtn = el("button", "xh-lbl-btn-cancel");
    cancelBtn.textContent = "取消";
    cancelBtn.onclick = () => this.close();
    const saveBtn = el("button", "xh-lbl-btn-save");
    saveBtn.textContent = "保存";
    saveBtn.onclick = () => this.save();
    footer.appendChild(helpBtn);
    footer.appendChild(resetBtn);
    footer.appendChild(spacer);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    panel.appendChild(footer);

    this._el = overlay;
  }

  // ── Slider + editable number + ▲▼ spinner (matches the Group Colors style) ──
  _sliderRow(labelText, min, max, step, get, set, fmt, parse) {
    const row = document.createElement("div");
    row.className = "xh-lbl-sliderrow";

    const l = document.createElement("span");
    l.className = "xh-lbl-slbl";       // inline label (left of the slider)
    l.textContent = labelText;
    row.appendChild(l);

    const s = document.createElement("input");
    s.type = "range";
    s.min = String(min); s.max = String(max); s.step = String(step);
    s.value = String(get());
    s.className = "xh-lbl-slider";
    const setFill = () => {
      const pct = max === min ? 0 : ((Number(s.value) - min) / (max - min)) * 100;
      s.style.setProperty("--fill", Math.max(0, Math.min(100, pct)) + "%");
    };
    setFill();

    const vWrap = document.createElement("div");
    vWrap.className = "xh-lbl-spin";
    const v = document.createElement("input");
    v.type = "text";
    v.value = fmt(get());
    v.className = "xh-lbl-spinval";
    const spin = document.createElement("div");
    spin.className = "xh-lbl-spinbtns";
    const up = document.createElement("button"); up.type = "button"; up.dataset.xhIconDone = "1"; up.innerHTML = xhIconHTML("chevron-up", { size: 11, color: "current" }); up.title = "增大";
    const dn = document.createElement("button"); dn.type = "button"; dn.dataset.xhIconDone = "1"; dn.innerHTML = xhIconHTML("chevron-down", { size: 11, color: "current" }); dn.title = "减小";
    spin.appendChild(up); spin.appendChild(dn);
    vWrap.appendChild(v); vWrap.appendChild(spin);

    s.addEventListener("input", () => {
      const n = Number(s.value);
      set(n); v.value = fmt(n); setFill(); this._updatePreview();
    });
    const apply = (n) => {
      n = Math.max(min, Math.min(max, Math.round(n / step) * step));
      // floating-point tidy so 0.65000000001 doesn't leak into the field
      n = Number(n.toFixed(4));
      set(n); s.value = String(n); v.value = fmt(n); setFill(); this._updatePreview();
    };
    const stepBy = (dir) => apply(get() + dir * step);
    const commitV = () => {
      const raw = parseFloat(v.value);
      if (Number.isFinite(raw)) apply(parse ? parse(raw) : raw);
      else v.value = fmt(get());
    };
    for (const b of [up, dn]) {
      b.addEventListener("mousedown", (e) => e.stopPropagation());
    }
    up.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); stepBy(1); });
    dn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); stepBy(-1); });
    v.addEventListener("mousedown", (e) => e.stopPropagation());
    v.addEventListener("focus", () => v.select());
    v.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); commitV(); v.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); v.value = fmt(get()); v.blur(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); stepBy(1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); stepBy(-1); }
    });
    v.addEventListener("blur", commitV);

    row.appendChild(s);
    row.appendChild(vWrap);
    return row;
  }

  // Match the color picker's height to the swatch grid so the picker's bottom
  // lines up with the grid's last row, and the hex bar / Transparent button
  // below them sit on the same line. Measures the whole picker (incl. any
  // internal gaps) vs the grid and nudges the SV plane height by the diff, so
  // it's exact regardless of browser scrollbar width or palette count.
  _alignColorColumns() {
    if (!this._el) return;
    const grid = this._el.querySelector(".xh-lbl-swgrid");
    const sv = this._el.querySelector(".xh-cp-sv");
    const picker = this._el.querySelector(".pix-cp");
    if (!grid || !sv || !picker) return;
    // Measure border-box bottoms; nudge the SV plane height by the gap so the
    // whole picker's bottom meets the grid's bottom. SV is box-sizing:border-box
    // (CSS), so the height we set equals the measured height — exact.
    const gridBottom = grid.getBoundingClientRect().bottom;
    const pickerBottom = picker.getBoundingClientRect().bottom;
    const svH = sv.getBoundingClientRect().height;
    const newSvH = svH + (gridBottom - pickerBottom);
    if (newSvH > 40 && newSvH < 400) {
      sv.style.height = Math.round(newSvH) + "px";
      // Re-render so the SV plane AND the hue strip (which stretches to the row
      // height) redraw their bitmaps crisp at the new height. setColor does not
      // fire onChange, so this can't loop or re-apply the colour.
      const cc = this._picker?.getColor?.();
      if (cc) this._picker.setColor(cc);
    }
  }

  // ── Help (shared themed popup, same style as the Group help) ──
  _showHelp() {
    // Pass the class so "Open the full help" lands on the Label page rather
    // than the browser's Home screen, matching node_colors and pixgroup.
    openHelpFor("XHLabelPix", LABEL_HELP, { comfyClass: "XHLabelPix" });
    // The editor overlay is z-index 99999; lift the help card above it.
    const bd = document.querySelector(".xh-help-backdrop");
    if (bd) bd.style.zIndex = "100000";
  }

  // ── Live preview ─────────────────────────────────────────
  _updatePreview() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._renderPreview();
    });
  }

  // Render the label into the preview area FITTED to the available space and at
  // device-pixel resolution, so it is always sharp and never clipped regardless
  // of font size / padding / radius. The label is re-rendered at the displayed
  // size (ctx scaled), not CSS-stretched, so upscaling a small label stays crisp.
  _renderPreview() {
    const c = this.cfg;
    const m = measureLabel(c);
    const cvs = this._previewCanvas;
    const wrap = cvs.parentElement;
    if (!wrap) return;
    const availW = Math.max(20, (wrap.clientWidth || 460) - 24);
    const availH = Math.max(20, (wrap.clientHeight || 180) - 24);
    // Render close to the node's actual size, a touch larger for legibility, and
    // downscale big labels to fit. Capped at 1.5x so the preview reads a bit bigger
    // than the canvas without the blown-up look.
    let scale = Math.min(availW / m.w, availH / m.h, 1.5);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    const dpr = window.devicePixelRatio || 1;
    const dispW = Math.max(1, Math.round(m.w * scale));
    const dispH = Math.max(1, Math.round(m.h * scale));
    cvs.width = Math.round(dispW * dpr);
    cvs.height = Math.round(dispH * dpr);
    cvs.style.width = dispW + "px";
    cvs.style.height = dispH + "px";
    const ctx = cvs.getContext("2d");
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    renderLabelToCanvas(ctx, c, m, m.w, m.h);
  }
}
