// ╔═══════════════════════════════════════════════════════════════╗
// ║  XiaoHei Shared - Node Help panel                             ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// A reusable "Help" affordance for Pixaroma nodes. ComfyUI's built-in Info tab
// is plain-text and cramped; this gives each node a small ? button (the bundled
// question.svg) that opens a themed, scrollable card explaining the node.
//
// Usage in a node:
//   import { createHelpButton } from "../shared/index.mjs";
//   someRow.appendChild(createHelpButton(MY_HELP));   // drop the ? button in
//
// where MY_HELP is a help-definition object:
//   {
//     title:   "My Node Pixaroma",          // shown in the header
//     tagline: "One line: what it is.",      // optional, under the title
//     sections: [
//       { heading: "What it does", body: "A paragraph. \n\n New para on blank line." },
//       { heading: "How to use",   bullets: ["do this", "then this"] },
//       { heading: "The toggles",  defs: [ ["Term", "what it means"], ... ] },
//       { heading: "Examples",     table: { headers: ["A","B"], rows: [["1","2"]] } },
//     ],
//     footer: "Optional tip line shown at the bottom.",
//   }
//
// Any string (body / bullet / def term+desc / table cell / tagline / footer)
// may contain inline `code` (backticks) which renders as a monospace chip.
// All text is HTML-escaped first, so node-authored content is safe to write
// in plain prose. Blocks render in the order listed.
//
// Public API:
//   createHelpButton(helpDef, opts?)  -> HTMLButtonElement (opens the popup)
//   openHelpPopup(helpDef)            -> opens the popup directly
//   injectHelpCSS()                   -> inject styles once (called lazily)
//
// Teardown: a consumer SHOULD call closeHelpPopup() in its node's onRemoved so
// deleting the node closes any open panel. As a universal safety net this module
// also auto-closes the panel on any workflow load/switch/undo (it wraps
// app.loadGraphData once, the first time a panel is opened).

import { app } from "../../../scripts/app.js";
import { pixAsset } from "./api_url.mjs";

const CSS_ID = "xh-help-css";
const QUESTION_ICON = "icons/note/question.svg";
const BRAND = "var(--xh-primary,#E8A33C)";

// ── Per-node help registry ───────────────────────────────────
// Maps a node's comfyClass -> its help definition. A single shared surface (the
// selection-toolbar Help button, js/help_toolbar) can then show the right help
// for whichever Pixaroma node is selected, without each node wiring its own
// in-body ? button. A node opts in with: registerNodeHelp("MyClass", MY_HELP).
const _nodeHelp = new Map();
export function registerNodeHelp(comfyClass, helpDef) {
  if (comfyClass && helpDef) _nodeHelp.set(comfyClass, helpDef);
}
export function getNodeHelp(comfyClass) {
  return comfyClass ? _nodeHelp.get(comfyClass) || null : null;
}
// Every registered entry, as [comfyClass, helpDef] pairs. The Help browser
// (js/help_browser) walks this to build its node list, which is what makes a
// NEW node appear there automatically the moment its help entry is written -
// there is no second list to keep in sync. Returns a fresh array each call, so
// a caller can sort or filter it without disturbing the registry.
export function allNodeHelp() {
  return [..._nodeHelp.entries()];
}

const CSS = `
/* ---- the ? button nodes drop into their body ---- */
.xh-help-btn {
  width: 16px; height: 16px; flex: none; padding: 0; border: none;
  background-color: rgba(255,255,255,0.5);
  -webkit-mask: url("${pixAsset(QUESTION_ICON)}") center / contain no-repeat;
  mask: url("${pixAsset(QUESTION_ICON)}") center / contain no-repeat;
  cursor: pointer; align-self: center;
  transition: background-color 0.12s;
}
.xh-help-btn:hover { background-color: ${BRAND}; }

/* ---- popup ---- */
.xh-help-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000; font-family: inherit; -webkit-font-smoothing: antialiased;
}
.xh-help-card {
  background: #1d1d1d; border: 1px solid #333; border-radius: 8px;
  width: min(840px, 94vw); max-height: 82vh; display: flex; flex-direction: column;
  box-shadow: 0 14px 52px rgba(0,0,0,0.6); overflow: hidden; color: #cfcfcf;
  animation: xh-help-in 0.14s ease;
}
@keyframes xh-help-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
.xh-help-header {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 14px 13px 16px; border-bottom: 1px solid #2c2c2c; flex: none;
}
.xh-help-h-icon {
  width: 18px; height: 18px; flex: none; background-color: ${BRAND};
  -webkit-mask: url("${pixAsset(QUESTION_ICON)}") center / contain no-repeat;
  mask: url("${pixAsset(QUESTION_ICON)}") center / contain no-repeat;
}
.xh-help-h-title { flex: 1; font-size: 15px; font-weight: 600; color: #fff; line-height: 1.2; }
.xh-help-close {
  flex: none; width: 26px; height: 26px; border-radius: 4px; border: none;
  background: rgba(255,255,255,0.05); color: #aaa; cursor: pointer;
  font-size: 15px; line-height: 1; display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.xh-help-close:hover { background: ${BRAND}; color: #fff; }

.xh-help-body { padding: 14px 16px 16px 16px; overflow-y: auto; font-size: 12.5px; line-height: 1.55; }
.xh-help-section { margin-bottom: 15px; }
.xh-help-section:last-child { margin-bottom: 0; }
.xh-help-h {
  margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: ${BRAND};
  text-transform: uppercase; letter-spacing: 0.5px;
}
.xh-help-p { margin: 0 0 6px 0; white-space: pre-wrap; color: #cfcfcf; }
.xh-help-p:last-child { margin-bottom: 0; }
.xh-help-ul { margin: 0; padding-left: 18px; }
.xh-help-ul li { margin: 0 0 4px 0; }
.xh-help-defs { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; align-items: baseline; }
.xh-help-defs dt { color: #fff; font-weight: 600; white-space: nowrap; }
.xh-help-defs dd { margin: 0; color: #bcbcbc; }
.xh-help-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.xh-help-table th {
  text-align: left; padding: 5px 8px; color: #9a9a9a; font-weight: 600;
  border-bottom: 1px solid #3a3a3a; text-transform: uppercase; font-size: 10px; letter-spacing: 0.4px;
}
.xh-help-table td { padding: 5px 8px; border-bottom: 1px solid #262626; vertical-align: top; color: #cfcfcf; }
.xh-help-table tr:last-child td { border-bottom: none; }
.pix-help code {
  background: rgba(255,255,255,0.08); border-radius: 3px; padding: 1px 5px;
  font-family: monospace; font-size: 11.5px; color: #ffd2c4;
}
.xh-help-tip {
  margin-top: 4px; padding: 8px 11px; background: rgba(232,163,60,0.1);
  border-left: 2px solid ${BRAND}; border-radius: 3px; color: #ddd; font-size: 12px;
}
.xh-help-more {
  display: block; width: 100%; margin-top: 14px; padding: 9px 12px;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 5px;
  background: rgba(255,255,255,0.04); color: #cfcfcf;
  font-size: 12.5px; font-family: inherit; cursor: pointer; text-align: center;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.xh-help-more:hover { background: ${BRAND}; border-color: ${BRAND}; color: #fff; }
.xh-help-more:focus-visible { outline: 2px solid ${BRAND}; outline-offset: 2px; }
`;

export function injectHelpCSS() {
  if (document.getElementById(CSS_ID)) return;
  const el = document.createElement("style");
  el.id = CSS_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

// Escape HTML, then turn `inline code` (backticks) into <code> chips.
function fmt(s) {
  const esc = String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
}

function buildSection(section) {
  const sec = document.createElement("div");
  sec.className = "xh-help-section";

  if (section.heading) {
    const h = document.createElement("div");
    h.className = "xh-help-h";
    h.textContent = section.heading;
    sec.appendChild(h);
  }

  if (section.body) {
    // Blank line -> new paragraph; single \n stays (white-space: pre-wrap).
    for (const para of String(section.body).split(/\n\s*\n/)) {
      const p = document.createElement("p");
      p.className = "xh-help-p";
      p.innerHTML = fmt(para);
      sec.appendChild(p);
    }
  }

  if (Array.isArray(section.bullets) && section.bullets.length) {
    const ul = document.createElement("ul");
    ul.className = "xh-help-ul";
    for (const item of section.bullets) {
      const li = document.createElement("li");
      li.innerHTML = fmt(item);
      ul.appendChild(li);
    }
    sec.appendChild(ul);
  }

  if (Array.isArray(section.defs) && section.defs.length) {
    const dl = document.createElement("dl");
    dl.className = "xh-help-defs";
    for (const entry of section.defs) {
      // Tolerate a malformed entry (a bare string instead of [term, desc]).
      const [term, desc] = Array.isArray(entry) ? entry : [entry, ""];
      const dt = document.createElement("dt");
      dt.innerHTML = fmt(term);
      const dd = document.createElement("dd");
      dd.innerHTML = fmt(desc);
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    sec.appendChild(dl);
  }

  if (section.table && Array.isArray(section.table.rows)) {
    const table = document.createElement("table");
    table.className = "xh-help-table";
    if (Array.isArray(section.table.headers)) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const h of section.table.headers) {
        const th = document.createElement("th");
        th.innerHTML = fmt(h);
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const tbody = document.createElement("tbody");
    for (const row of section.table.rows) {
      const tr = document.createElement("tr");
      const cells = Array.isArray(row) ? row : [row]; // tolerate a non-array row
      for (const cell of cells) {
        const td = document.createElement("td");
        td.innerHTML = fmt(cell);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    sec.appendChild(table);
  }

  return sec;
}

let _openCleanup = null;

export function closeHelpPopup() {
  if (_openCleanup) _openCleanup();
}

// Universal safety net: close any open help panel when the workflow changes
// (open / switch tab / undo all funnel through app.loadGraphData), so a panel
// left open while its node is torn down can't leak its document-level Esc
// listener and swallow Escape app-wide. Wrapped once, lazily, the first time a
// panel opens. Idempotent; composes with other loadGraphData wrappers.
let _graphHookInstalled = false;
function ensureGraphCloseHook() {
  if (_graphHookInstalled) return;
  if (!app || typeof app.loadGraphData !== "function") return;
  _graphHookInstalled = true;
  const _orig_fn = app.loadGraphData;
  const orig = (...a) => _orig_fn.apply(app, a);
  app.loadGraphData = function (...args) {
    closeHelpPopup();
    return orig(...args);
  };
}

// opts.comfyClass, when given, adds a line at the bottom that opens the full
// Help browser already on that node's page. Passed by the selection-toolbar
// button (js/help_toolbar), which knows which node is selected.
/**
 * Open help for a node or canvas feature.
 *
 * Goes to the FULL browser at that page rather than the small popup. There was
 * never two sets of writing - one help def, two renderers - but the popup was
 * the poorer of the two: it cannot show the generated inputs/settings/outputs
 * reference built from the node's own tooltips, it does not render `links`, and
 * it has no Add to canvas. Sending both routes to the same page also means one
 * set of dismiss rules to get right instead of two.
 *
 * `target` is a comfyClass ("PixaromaOutpaint") or a page key ("canvas:colors").
 * The browser is reached through the window global on purpose: js/shared may not
 * import js/help_browser, which imports shared, and that would be a cycle.
 *
 * The popup remains the fallback for a build where the browser did not load,
 * so a missing browser costs a nicer page rather than all help everywhere.
 */
export function openHelpFor(target, helpDef, opts = {}) {
  const key = target || opts.comfyClass || opts.pageKey;
  try {
    const browser = window.XHHelp;
    if (key && typeof browser?.openNode === "function") {
      browser.openNode(key);
      return true;
    }
  } catch { /* fall through to the popup */ }
  if (helpDef) openHelpPopup(helpDef, opts);
  return false;
}

export function openHelpPopup(helpDef, opts = {}) {
  helpDef = helpDef || {};
  injectHelpCSS();
  ensureGraphCloseHook();
  closeHelpPopup(); // only one at a time

  const backdrop = document.createElement("div");
  backdrop.className = "xh-help-backdrop";

  const card = document.createElement("div");
  card.className = "xh-help-card pix-help";
  backdrop.appendChild(card);

  // header
  const header = document.createElement("div");
  header.className = "xh-help-header";
  const icon = document.createElement("span");
  icon.className = "xh-help-h-icon";
  const title = document.createElement("div");
  title.className = "xh-help-h-title";
  title.textContent = helpDef.title || "帮助";
  const close = document.createElement("button");
  close.className = "xh-help-close";
  close.type = "button";
  close.textContent = "✕";
  close.title = "关闭（Esc）";
  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(close);
  card.appendChild(header);

  // body
  const body = document.createElement("div");
  body.className = "xh-help-body";
  if (helpDef.tagline) {
    const tag = document.createElement("p");
    tag.className = "xh-help-p";
    tag.style.color = "#e6e6e6";
    tag.innerHTML = fmt(helpDef.tagline);
    body.appendChild(tag);
  }
  // Array-guard the loop itself (a non-iterable `sections` would throw OUTSIDE
  // the per-section try/catch); then each section builds in its own try/catch so
  // one malformed section can't kill the whole panel.
  const sections = Array.isArray(helpDef.sections) ? helpDef.sections : [];
  for (const section of sections) {
    try {
      body.appendChild(buildSection(section));
    } catch (e) {
      console.warn("[XiaoHei] 帮助：跳过格式错误的段落", e);
    }
  }
  if (helpDef.footer) {
    const tip = document.createElement("div");
    tip.className = "xh-help-tip";
    tip.innerHTML = fmt(helpDef.footer);
    body.appendChild(tip);
  }

  // A way through to the full Help browser, on this node's page. Reached via
  // the window global rather than an import so this shared module never depends
  // on js/help_browser (which imports from here). Absent global -> no link, so
  // this popup still works on its own.
  if (window.XHHelp?.openNode) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "xh-help-more";
    more.textContent = "打开完整帮助";
    more.title = "全部节点、画布工具和教程，开在一个可以一直留着的窗口里";
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const cls = opts.comfyClass || opts.pageKey;
      cleanup();
      try { window.XHHelp.openNode(cls); } catch (err) { console.warn("[XiaoHei] 帮助浏览器", err); }
    });
    body.appendChild(more);
  }

  card.appendChild(body);

  // --- close wiring ---
  let mouseDownOnBackdrop = false;
  const cleanup = () => {
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
    if (_openCleanup === cleanup) _openCleanup = null;
  };
  _openCleanup = cleanup;

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      cleanup();
    }
  };
  document.addEventListener("keydown", onKey, true);

  close.addEventListener("click", (e) => { e.stopPropagation(); cleanup(); });
  // Click-outside to close, but only when the press STARTED on the backdrop
  // (so a text drag-select that releases on the backdrop doesn't dismiss it -
  // same guard Text Overlay #12 documents).
  backdrop.addEventListener("mousedown", (e) => { mouseDownOnBackdrop = e.target === backdrop; });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop && mouseDownOnBackdrop) cleanup();
    mouseDownOnBackdrop = false;
  });
  // Don't let clicks inside the card bubble to the canvas / node.
  card.addEventListener("mousedown", (e) => e.stopPropagation());

  document.body.appendChild(backdrop);
  return cleanup;
}

// Returns a small ? button wired to open the given help. Drop it into a node's
// DOM body. opts.title overrides the hover tooltip.
export function createHelpButton(helpDef, opts = {}) {
  injectHelpCSS();
  const btn = document.createElement("button");
  btn.className = "xh-help-btn";
  btn.type = "button";
  btn.title = opts.title || `帮助：看看「${helpDef.title || "这个节点"}」怎么用`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openHelpPopup(helpDef);
  });
  // Block the mousedown from starting a node drag / selection underneath.
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  return btn;
}
