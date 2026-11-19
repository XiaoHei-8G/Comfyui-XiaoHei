// ╔═══════════════════════════════════════════════════════════════╗
// ║  Pixaroma Shared — Constants & Utility Functions             ║
// ╚═══════════════════════════════════════════════════════════════╝

import { pixApiUrl, pixAsset } from "./api_url.mjs";

export const allow_debug = false;

export const PIXAROMA_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="12" fill="var(--xh-primary,#E8A33C)"/>  <g transform="translate(14,14) scale(1.5)" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">    <circle cx="11" cy="4" r="2" />    <circle cx="18" cy="8" r="2" />    <circle cx="20" cy="16" r="2" />    <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />  </g></svg>
`)}`;

export const BRAND = "#E8A33C";
const LOGO_URL = "xh_logo.svg";

/**
 * A model file's size, short enough to sit beside its name in a picker.
 *
 * The user asked for this once several sizes of the SAME model family were
 * installed (qwen3.5 2b / 4b / 9b): the names differ by two characters and the
 * size is what actually tells you which one you are about to load.
 *
 * One decimal under 10 GB and none above, so the column stays narrow and the
 * numbers stay comparable at a glance. Returns "" for anything missing or
 * nonsensical rather than "0 B" or "NaN" - a picker row with no size is fine,
 * a row claiming a model is zero bytes is not.
 */
export function formatModelSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  const gb = n / 1073741824;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / 1048576;
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function createDummyWidget(titleText, subtitleText, instructionText) {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 20px;
      background-color: #121212;
      border-radius: 8px;
      width: 100%;
      height: 100%;
      color: #ffffff;
      font-family: sans-serif;
      text-align: center;
      box-sizing: border-box;
    `;

  const title = document.createElement("div");
  title.innerText = titleText;
  title.style.cssText = `
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      line-height: 1.2;
    `;
  container.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.innerText = subtitleText;
  subtitle.style.cssText = `
      font-size: 18px;
      font-weight: 700;
      color: var(--xh-primary,#E8A33C);
      margin: 0;
      line-height: 1.2;
    `;
  container.appendChild(subtitle);

  const instruction = document.createElement("div");
  instruction.innerText = instructionText;
  instruction.style.cssText = `
      font-size: 10px;
      color: #555555;
      margin-top: 12px;
      white-space: pre-line;
      line-height: 1.4;
    `;
  container.appendChild(instruction);

  return container;
}

export function installFocusTrap(overlay) {
  const trap = document.createElement("textarea");
  trap.dataset.pixaromaTrap = "1";
  trap.setAttribute("aria-hidden", "true");
  trap.style.cssText =
    "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;";
  overlay.appendChild(trap);
  trap.focus();
  const refocus = (e) => {
    const t = e.target;
    const tag = t?.tagName;
    // Exempt contenteditable regions (e.g. Note Pixaroma editor) — refocusing
    // the hidden trap on mouseup would steal focus mid-typing.
    if (t?.isContentEditable || t?.closest?.('[contenteditable="true"]')) return;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
      requestAnimationFrame(() => trap.focus());
    }
  };
  overlay.addEventListener("mouseup", refocus);
  return trap;
}

export function hideJsonWidget(widgets, widgetName) {
  const w = (widgets || []).find((x) => x.name === widgetName);
  if (w) {
    w.hidden = true;
    w.computeSize = () => [0, -4];
    // Nodes 2.0: hidden + computeSize alone do NOT suppress a STRING/multiline
    // widget in the Vue node body — it renders as a textarea showing the raw
    // JSON at the top of the node (seen on Note). canvasOnly excludes it from
    // the Vue body (shouldRenderAsVue = !canvasOnly) AND keeps it out of the
    // legacy Parameters tab. This is an internal serialization widget that must
    // stay hidden in BOTH renderers, so a static true is correct here.
    if (!w.options) w.options = {};
    w.options.canvasOnly = true;
    // Prefer the modern widget.element; fall back to the deprecated widget.inputEl
    // only on older builds that lack .element. The || short-circuits, so .inputEl
    // is never READ when .element exists -> no "inputEl is deprecated" warning.
    const hideEl = () => { const el = w.element || w.inputEl; if (el) el.style.display = "none"; };
    hideEl();
    requestAnimationFrame(hideEl);
  }
  return w;
}

export function restorePreview(node, widgetName, app) {
  const w = (node.widgets || []).find((x) => x.name === widgetName);
  if (!w?.value || w.value === "{}") return;
  try {
    const meta = JSON.parse(w.value);
    if (!meta.composite_path) return;
    const img = new Image();
    img.onload = () => {
      node.imgs = [img];
      app.graph.setDirtyCanvas(true, true);
    };
    const fn = meta.composite_path.split(/[\\/]/).pop();
    img.src = pixApiUrl(`/view?filename=${encodeURIComponent(fn)}&type=input&subfolder=pixaroma&t=${Date.now()}`);
  } catch (e) {
    console.warn("[Pixaroma] restore failed:", e);
  }
}

export function resizeNode(node, img, app) {
  const BASE_WIDTH = 380;
  node.size[0] = Math.max(node.size[0] || BASE_WIDTH, BASE_WIDTH);
  const aspect = img.naturalWidth / img.naturalHeight;
  node.size[1] = node.size[0] / aspect + 80;
  app.graph.setDirtyCanvas(true, true);
}

export function getLogo(cb) {
  let _logoCache = null;
  let _logoLoading = false;
  let _logoCbs = [];

  if (_logoCache) {
    cb(_logoCache);
    return;
  }
  _logoCbs.push(cb);
  if (_logoLoading) return;
  _logoLoading = true;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    _logoCache = img;
    _logoCbs.forEach((fn) => fn(img));
    _logoCbs = [];
  };
  img.onerror = () => {
    _logoCbs.forEach((fn) => fn(null));
    _logoCbs = [];
  };
  img.src = pixAsset(LOGO_URL);
}

export function createPlaceholder(name, buttonLabel, node, app) {
  getLogo((logo) => {
    const cvs = document.createElement("canvas");
    cvs.width = 480;
    cvs.height = 270;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "#171718";
    ctx.fillRect(0, 0, 480, 270);
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < 480; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 270);
      ctx.stroke();
    }
    for (let y = 0; y < 270; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(480, y);
      ctx.stroke();
    }
    if (logo) ctx.drawImage(logo, 220, 65, 40, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name, 240, 128);
    ctx.fillStyle = BRAND;
    ctx.fillText("XiaoHei", 240, 150);
    ctx.fillStyle = "#555";
    ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Click '" + buttonLabel + "' to start", 240, 175);
    const prev = new Image();
    prev.onload = () => {
      node.imgs = [prev];
      resizeNode(node, prev, app);
    };
    prev.src = cvs.toDataURL();
  });
}

export async function downloadDataURL(
  dataURL,
  suggestedName = "xh_paint_export.png",
) {
  if (!dataURL) return;
  const mimeMatch = dataURL.match(/^data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  const name = suggestedName.endsWith(`.${ext}`)
    ? suggestedName
    : `${suggestedName}.${ext}`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Image", accept: { [mime]: [`.${ext}`] } }],
      });
      const blob = await (await fetch(dataURL)).blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
      console.warn("[Pixaroma] showSaveFilePicker failed, falling back:", e);
    }
  }
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = name;
  a.click();
}
