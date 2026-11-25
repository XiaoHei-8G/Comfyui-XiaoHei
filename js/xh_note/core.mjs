import { app } from "../../../scripts/app.js";
import { BRAND } from "../shared/index.mjs";

// 2026-11-19：原作者橙（#f66744）一律改成跟着家族主题预设走的名字。
//   预设正常时返回主题主色（松绿/藏青/QQ蓝…），预设没加载才退到家族兜底金。
export function themeAccentHex() {
  try {
    const m = window.XH_THEME && window.XH_THEME.main && window.XH_THEME.main();
    if (m) return m;
  } catch (_e) { /* 预设未就绪 */ }
  return "#E8A33C";
}
import { injectCSS } from "./css.mjs";
import { sanitize } from "./sanitize.mjs";
import { buildCodeViewDOM } from "./codeview.mjs";
import { renderContent } from "./render.mjs";
import { installGraphUndoGuard } from "../shared/graph_undo_guard.mjs";
import { pixAsset } from "../shared/api_url.mjs";
import { makeXhLogo } from "../shared/brand_logo.mjs";

export class NoteEditor {
  constructor(node) {
    this.node = node;
    this.cfg = { ...(node._noteCfg || {}) };
    this._el = null;
    this._dirty = false;
  }

  open() {
    // Icon picker session state (Pattern #29, design 2026-05-06).
    // Decoupled from the A text-color picker. Sticky across popup opens
    // within the same editor session; reset to defaults on _cleanup.
    this._iconPickerColor = themeAccentHex(); // 家族主题色
    this._iconPickerSize  = "m";       // 1.2em, matches existing default
    // Separator picker session state — independent of the toolbar Ln
    // colour picker so each <hr> carries its own inline colour and
    // doesn't track other tools. Sticky within an editor session.
    this._sepPickerColor = themeAccentHex();
    this._sepPickerVariant = "solid";
    // Grid picker session state — same decoupling principle. Two
    // colours, plus sticky cols/rows/header so re-opening the dialog
    // remembers what the user last picked.
    this._gridPickerBorderColor = themeAccentHex();
    this._gridPickerHeaderBg = "#1a1a1a";
    this._gridPickerCols = 3;
    this._gridPickerRows = 3;
    this._gridPickerHeader = false;
    // Button picker session state — per-instance colour, sticky icon
    // and "show size hint" toggle. Folder hint moved out of this
    // modal into its own toolbar entry / picker.
    this._btnPickerColor = themeAccentHex();
    this._btnPickerIcon = "dl";
    this._btnPickerSizeOn = false;
    // Folder hint picker session state — separate toolbar button.
    this._folderHintPickerColor = themeAccentHex();
    this._folderHintPickerFolder = "models/diffusion_models";
    // Sync cfg.backgroundColor to node.bgcolor on open when they
    // disagree. Happens when the user picks a color via ComfyUI's
    // native right-click Colors menu between saves: node.bgcolor is
    // updated directly (native menu doesn't know about our cfg
    // object), but our cfg still holds the hex from the last Bg-
    // picker save. Without this sync, canvas shows the native pick
    // while the editor body opens at the stale cfg color.
    //
    // Triggers only when cfg is a concrete hex (not undefined / null
    // / "transparent" — in those states _applyEditAreaBg already
    // falls back to node.bgcolor cleanly). Two resolution paths:
    //   - node.bgcolor is a hex   → sync cfg to that hex. Next save
    //                                persists it so reload doesn't
    //                                revert to the old cfg.
    //   - node.bgcolor is null    → native picker cleared to
    //                                default. Delete cfg key so
    //                                render's "undefined" branch
    //                                fires (no-op, preserves native)
    //                                instead of "null" branch (which
    //                                would force our #111111 dark).
    //
    // CRITICAL: the sync must mirror into BOTH `this.node._noteCfg`
    // AND the `note_json` widget value, not just the editor-local
    // `this.cfg` clone. Without the widget write, clicking Cancel
    // leaves the stale hex in the serialized workflow JSON and the
    // next workflow reload reverts the color. (Code-review finding
    // C1 on commit 23221f0.) Mark dirty too so Save-path treats it
    // as a pending change even if the user makes no other edit.
    if (
      typeof this.cfg.backgroundColor === "string" &&
      this.cfg.backgroundColor &&
      this.cfg.backgroundColor !== "transparent" &&
      this.cfg.backgroundColor !== this.node?.bgcolor
    ) {
      if (this.node?.bgcolor) {
        this.cfg.backgroundColor = this.node.bgcolor;
      } else {
        delete this.cfg.backgroundColor;
      }
      // Mirror into the persistent node-level cfg so subsequent
      // editor opens see the corrected state without re-running
      // this sync.
      this.node._noteCfg = { ...this.cfg };
      // Mirror into the serialized widget value so the correction
      // survives workflow save → reload even if the user closes
      // via Cancel without any other edit.
      const jw = this.node.widgets?.find((w) => w.name === "note_json");
      if (jw) jw.value = JSON.stringify(this.cfg);
      this._dirty = true;
    }
    // Preload inline-icon list + inject per-icon CSS rules so the toolbar
    // picker opens instantly without a round-trip fetch. Both calls are
    // idempotent (cache + one-time injection guards). Fire-and-forget —
    // we never block editor open on the fetch.
    //
    // NOTE: dynamic import() is deliberate, NOT laziness. `icons.mjs`
    // attaches prototype methods to NoteEditor at module-top (Phase 4).
    // A static `import { ... } from "./icons.mjs"` here would create a
    // circular dependency — core.mjs imports icons.mjs statically, but
    // icons.mjs imports NoteEditor from core.mjs — and when icons.mjs
    // first evaluates, NoteEditor would be undefined, crashing the
    // prototype extension. Dynamic import() defers loading until after
    // the class is fully defined. DO NOT simplify to a static import.
    import("./icons.mjs").then((m) => {
      m.ensureIcons().then(() => m.injectIconCSS());
    });
    injectCSS();
    this._build();
    document.body.appendChild(this._el);

    if (this._editArea) {
      const editArea = this._editArea;

      // Click on or near an icon: explicitly place the caret on the
      // side of the icon nearest to the click point. Without this,
      // contenteditable's default caret placement around inline-block
      // elements with pointer-events:none (which we use so icons don't
      // grab text-selection drags) was unreliable - the caret often
      // failed to appear at all, or landed in an unrelated block.
      // elementsFromPoint sees through pointer-events:none and gives
      // us the icon under the click; click X relative to its midpoint
      // decides which side gets the caret.
      this._iconClickHandler = (e) => {
        if (e.button !== 0) return; // left button only
        // Iterate visible icons to find one whose hit-zone contains
        // the click. The hit-zone is the icon's bbox EXPANDED by a
        // few px horizontally - this lets clicks in the small gap
        // beside an icon snap to the icon's nearest edge, which
        // makes forward-Delete on icons reliable (caret has to land
        // BEFORE the icon for Delete to remove it; without the
        // expanded zone, browser default could put the caret on the
        // wrong side and Delete operates on the trailing nbsp).
        const HIT_PAD_X = 4;
        const icons = editArea.querySelectorAll(".pix-note-ic");
        let hit = null;
        for (const ic of icons) {
          const r = ic.getBoundingClientRect();
          if (e.clientX >= r.left - HIT_PAD_X
              && e.clientX <= r.right + HIT_PAD_X
              && e.clientY >= r.top
              && e.clientY <= r.bottom) {
            hit = { ic, rect: r };
            break;
          }
        }
        if (!hit) return; // click outside any icon's hit-zone - browser handles
        e.preventDefault();
        const mid = hit.rect.left + hit.rect.width / 2;
        const range = document.createRange();
        if (e.clientX < mid) range.setStartBefore(hit.ic);
        else                 range.setStartAfter(hit.ic);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editArea.focus();
      };
      editArea.addEventListener("mousedown", this._iconClickHandler);
    }
    // Don't use installFocusTrap here — its mouseup refocus pulls focus
    // away from the contenteditable on any button click (breaking typing)
    // and wipes the text selection on drag-select that ends outside the
    // panel. Ctrl+Z escape is handled by the capture listeners + the shared
    // graph-undo guard below.
    // Intercept Ctrl/Cmd+Z/Y explicitly — if the event escapes to ComfyUI's
    // shortcut handlers the graph's undo runs, which removes the node that
    // owns this editor. We run the contenteditable's native undo/redo
    // ourselves so in-editor typing history still works.
    this._keyBlock = (e) => {
      const key = (e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      // Undo / Redo → our manual history (covers direct-DOM toolbar mutations
      // that the browser's contenteditable undo doesn't track).
      if (mod && (key === "z" || key === "y")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === "keydown") {
          const isRedo = key === "y" || (key === "z" && e.shiftKey);
          if (this._editArea && document.activeElement !== this._editArea) {
            this._editArea.focus();
          }
          try { if (isRedo) this.doRedo(); else this.doUndo(); } catch (err) {}
        }
        return;
      }
      // Editor-scoped shortcuts. Only on keydown — keyup/keypress still need
      // to be blocked so ComfyUI doesn't see them.
      if (e.type === "keydown") {
        // Bold / Italic / Underline — browser does this natively in a
        // contenteditable, but we handle it explicitly so (a) ComfyUI can't
        // see the key (its shortcuts are suppressed), and (b) the dirty flag
        // + manual-history debounce are updated reliably.
        if (mod && (key === "b" || key === "i" || key === "u")) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (this._editArea && document.activeElement !== this._editArea) {
            this._editArea.focus();
          }
          const cmd = key === "b" ? "bold" : key === "i" ? "italic" : "underline";
          try { document.execCommand(cmd); } catch (err) {}
          this._dirty = true;
          return;
        }
        // Ctrl/Cmd+S → save.
        if (mod && key === "s") {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.save();
          return;
        }
        // Tab inside a table cell: move caret to next/previous cell.
        // Swallow unconditionally when inside a cell so Tab doesn't
        // escape to ComfyUI's workflow-tab shortcut or to the next
        // focusable element.
        if (key === "tab") {
          const sel = window.getSelection();
          const anchor = sel?.anchorNode;
          let cell = null;
          let n = anchor;
          while (n && n !== this._editArea) {
            if (n.nodeType === 1 && (n.tagName === "TD" || n.tagName === "TH")) {
              cell = n;
              break;
            }
            n = n.parentNode;
          }
          if (cell) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const cells = Array.from(
              cell.closest("table").querySelectorAll("th, td")
            );
            const ix = cells.indexOf(cell);
            const next = e.shiftKey ? cells[ix - 1] : cells[ix + 1];
            if (next) {
              const r = document.createRange();
              r.selectNodeContents(next);
              r.collapse(true);
              sel.removeAllRanges();
              sel.addRange(r);
            }
            return;
          }
        }
        // Atomic Backspace / Delete around inline-icon spans (Pattern
        // #29). Has to live here, NOT on editArea bubble - this
        // _keyBlock fires in window CAPTURE phase and ends with an
        // unconditional stopImmediatePropagation, so editArea-bubble
        // handlers would never see the event.
        if ((key === "backspace" || key === "delete") && !mod) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            if (r.collapsed && this._editArea?.contains(r.startContainer)) {
              const findIconAdjacent = (forward) => {
                const node = r.startContainer;
                const off  = r.startOffset;
                let probe;
                if (node.nodeType === 3) {
                  if (forward) {
                    if (off !== node.nodeValue.length) return null;
                  } else {
                    const before = node.nodeValue.slice(0, off);
                    if (!/^[\s ]*$/.test(before)) return null;
                  }
                  probe = forward ? node.nextSibling : node.previousSibling;
                } else {
                  probe = forward ? node.childNodes[off] : node.childNodes[off - 1];
                }
                let safety = 4;
                while (probe && safety-- > 0 && (
                  (probe.nodeType === 3 && /^[\s ]*$/.test(probe.nodeValue || "")) ||
                  (probe.nodeType === 1 && probe.tagName === "BR")
                )) {
                  probe = forward ? probe.nextSibling : probe.previousSibling;
                }
                if (probe && probe.nodeType === 1 && probe.classList?.contains("pix-note-ic")) {
                  return probe;
                }
                if (probe && probe.nodeType === 1) {
                  const ics = probe.querySelectorAll?.(".pix-note-ic");
                  if (ics && ics.length === 1) {
                    const txt = (probe.textContent || "").replace(/[\s ]/g, "");
                    if (txt.length === 0) return ics[0];
                  }
                }
                return null;
              };
              const forward = (key === "delete");
              const icon = findIconAdjacent(forward);
              if (icon) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this._snapBefore?.();
                const wrapper = icon.parentElement;
                // renderIconHTML always appends a trailing nbsp AFTER
                // the icon. Two shapes:
                //   (a) separate text node containing exactly U+00A0
                //   (b) text node starting with U+00A0 followed by
                //       user-typed text (Chrome merged them)
                const followerNbsp = icon.nextSibling;
                if (followerNbsp && followerNbsp.nodeType === 3
                    && followerNbsp.nodeValue) {
                  if (followerNbsp.nodeValue === " ") {
                    followerNbsp.remove();
                  } else if (followerNbsp.nodeValue.charCodeAt(0) === 0x00A0) {
                    followerNbsp.nodeValue = followerNbsp.nodeValue.slice(1);
                  }
                }
                icon.remove();
                if (wrapper && wrapper !== this._editArea
                    && wrapper.children.length === 0
                    && (wrapper.textContent || "").trim().length === 0) {
                  wrapper.remove();
                }
                this._snapAfter?.();
                this._dirty = true;
                this._refreshActiveStates?.();
                return;
              }
            }
          }
        }
        // Empty folder-hint Backspace / Delete: remove the whole div in
        // one keystroke. Without this, Chrome treats the empty <div>
        // (just a ::before icon, no text) as block-level whitespace —
        // Backspace merges it with the previous block instead of
        // removing the icon-bearing block, so the user has to press
        // the key twice to actually delete the icon. Same key trap
        // shape as the icon handler above.
        if ((key === "backspace" || key === "delete") && !mod) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            if (r.collapsed && this._editArea?.contains(r.startContainer)) {
              let n = r.startContainer;
              let folderhint = null;
              while (n && n !== this._editArea) {
                if (n.nodeType === 1 && n.classList?.contains("pix-note-folderhint")) {
                  folderhint = n; break;
                }
                n = n.parentNode;
              }
              if (folderhint && (folderhint.textContent || "").trim() === "") {
                e.preventDefault();
                e.stopImmediatePropagation();
                this._snapBefore?.();
                const fwd = (key === "delete");
                const adjacent = fwd
                  ? folderhint.nextElementSibling
                  : folderhint.previousElementSibling;
                folderhint.remove();
                // Land caret at end of previous block (Backspace) or
                // start of next block (Delete) so the typing flow
                // continues naturally.
                if (adjacent) {
                  const r2 = document.createRange();
                  r2.selectNodeContents(adjacent);
                  r2.collapse(fwd); // fwd: collapse to start; !fwd: end
                  sel.removeAllRanges();
                  sel.addRange(r2);
                }
                this._snapAfter?.();
                this._dirty = true;
                this._refreshActiveStates?.();
                return;
              }
            }
          }
        }
        // Escape → close (with dirty-confirm). If a child modal is open
        // (code dialog, link dialog, block dialog, color popup, or the
        // confirm dialog itself) skip the editor-close so Esc doesn't
        // silently nuke everything. Those modals don't install their own
        // Esc handlers, so nothing happens in that case — user can click
        // Cancel/outside to dismiss.
        if (key === "escape") {
          const hasModal = !!document.querySelector(
            ".pix-note-blockdlg, .pix-note-confirm-backdrop, .xh-cp-popup, .xh-cp-modal-backdrop, .pix-note-iconpop, .pix-note-modal-backdrop, .pix-note-help-overlay"
          );
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!hasModal) this.close();
          return;
        }
      }
      e.stopImmediatePropagation();
    };
    // Register on multiple targets in capture phase — ComfyUI/LiteGraph
    // register their own handlers on window/document/canvas with capture,
    // and listener order within the same target is registration order;
    // blanketing these targets maximises the chance we fire before them.
    window.addEventListener("keydown", this._keyBlock, true);
    window.addEventListener("keyup", this._keyBlock, true);
    window.addEventListener("keypress", this._keyBlock, true);
    document.addEventListener("keydown", this._keyBlock, true);
    document.addEventListener("keyup", this._keyBlock, true);
    document.addEventListener("keypress", this._keyBlock, true);
    // Paste/drop into the editArea must NOT reach ComfyUI's global
    // paste/drop listeners. ComfyUI intercepts image paste/drop and spawns
    // a Load Image node on the graph — pasting an image into the Note
    // editor would therefore both (a) embed an <img> in the contenteditable
    // and (b) add an unrelated Load Image node. Register at window capture
    // so we preempt ComfyUI's listener, and rewrite the paste as plain text.
    this._pasteBlock = (e) => {
      if (!this._el || !this._editArea) return;
      const area = this._editArea;
      const inArea = e.target === area || area.contains(e.target);
      if (!inArea) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const text =
        (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
      if (!text) return;
      if (document.activeElement !== area) area.focus();
      document.execCommand("insertText", false, text);
    };
    this._dropBlock = (e) => {
      if (!this._el) return;
      const inOverlay = this._el.contains(e.target);
      if (!inOverlay) return;
      // Any drop that lands inside our overlay is ours — eat it so ComfyUI
      // can't add a Load Image node. If the drop carried text, insert it.
      e.preventDefault();
      e.stopImmediatePropagation();
      const area = this._editArea;
      const inArea = area && (e.target === area || area.contains(e.target));
      if (inArea) {
        const text = e.dataTransfer?.getData("text/plain") || "";
        if (text) {
          if (document.activeElement !== area) area.focus();
          document.execCommand("insertText", false, text);
        }
      }
    };
    this._dragOverBlock = (e) => {
      if (!this._el || !this._el.contains(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("paste", this._pasteBlock, true);
    document.addEventListener("paste", this._pasteBlock, true);
    window.addEventListener("drop", this._dropBlock, true);
    document.addEventListener("drop", this._dropBlock, true);
    window.addEventListener("dragover", this._dragOverBlock, true);
    document.addEventListener("dragover", this._dragOverBlock, true);
    // Block ComfyUI's Ctrl+Z from tearing down the workflow under the open
    // editor (Vue Compat #6). HOW it works lives in
    // js/shared/graph_undo_guard.mjs and nowhere else - do not restate it here,
    // that is how these comments went stale. The onRemoved net + MutationObserver
    // below stay as extra teardown safety nets.
    this._undoGuardOff = installGraphUndoGuard(() => this._overlayAlive());
    // Node-resurrection safety net: if Ctrl+Z still slips through and the
    // node is removed from the graph while the editor is open, LiteGraph's
    // onRemoved fires. Close the editor gracefully so the user isn't stuck
    // editing a dead node. Full resurrection (restoring node + state) is
    // impractical because the graph's undo replays a full snapshot.
    this._origOnRemoved = this.node.onRemoved;
    const self = this;
    this.node.onRemoved = function () {
      try { self._origOnRemoved?.call(this); } catch (e) {}
      if (self._el?.isConnected) {
        console.warn("[pix-note] node removed while editor open — closing editor");
        self._dirty = false;
        self.close(true);
      }
    };
    // Vue may remove the overlay without calling close(); observe and clean up.
    this._removalObserver = new MutationObserver(() => {
      if (this._el && !this._el.isConnected) this._cleanup();
    });
    this._removalObserver.observe(document.body, { childList: true, subtree: false });
    // Focus the contenteditable AND place the caret at the end of
    // the last block so the user sees a visibly blinking cursor at a
    // natural typing position. Without explicit placement the caret
    // lands at offset 0 (often invisible against icons or block start)
    // and savedRange capture later picks up that hidden default,
    // surprising the user when icon insert lands at the start of the
    // note instead of where they expect.
    requestAnimationFrame(() => this._placeCursorAtEnd?.());
  }

  async close(force = false) {
    if (this._dirty && !force) {
      const ok = await this._confirmDiscard();
      if (!ok) return;
    }
    this._cleanup();
  }

  _confirmDiscard() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "pix-note-confirm-backdrop";
      const box = document.createElement("div");
      box.className = "pix-note-confirm-box";
      const title = document.createElement("div");
      title.className = "pix-note-confirm-title";
      title.textContent = "有改动还没保存";
      const text = document.createElement("div");
      text.className = "pix-note-confirm-text";
      text.textContent = "现在关掉，刚才的改动就没了。你想怎么办？";
      const actions = document.createElement("div");
      actions.className = "pix-note-confirm-actions";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "pix-note-btn primary";
      cancelBtn.textContent = "继续编辑";
      const discardBtn = document.createElement("button");
      discardBtn.className = "pix-note-btn";
      discardBtn.textContent = "不保存直接关";
      actions.appendChild(cancelBtn);
      actions.appendChild(discardBtn);
      box.appendChild(title);
      box.appendChild(text);
      box.appendChild(actions);
      backdrop.appendChild(box);
      (this._el || document.body).appendChild(backdrop);
      const finish = (ok) => {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(ok);
      };
      cancelBtn.addEventListener("click", () => finish(false));
      discardBtn.addEventListener("click", () => finish(true));
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) finish(false);
      });
      requestAnimationFrame(() => cancelBtn.focus());
    });
  }

  // Is this editor's overlay element still in the document? This is the
  // isAlive the shared graph-undo guard polls to detect a teardown that
  // bypassed _cleanup (Vue Compat #2).
  _overlayAlive() {
    return !!(this._el && this._el.isConnected);
  }

  // Release the graph-undo guard taken in open(). Idempotent + safe to call
  // from BOTH _cleanup AND the guard's own self-heal path.
  _restoreGraphPatches() {
    if (this._undoGuardOff) { this._undoGuardOff(); this._undoGuardOff = null; }
  }

  _cleanup() {
    // Centred modal still open? Close it first so its window-capture
    // keydown listener gets removed — otherwise it leaks past the
    // editor lifetime. Single-active-modal invariant means this is
    // at most one call.
    if (this._activeCentredModalClose) {
      try { this._activeCentredModalClose(); } catch (_) { /* swallow */ }
      this._activeCentredModalClose = null;
    }
    if (this._removalObserver) {
      this._removalObserver.disconnect();
      this._removalObserver = null;
    }
    if (this._keyBlock) {
      window.removeEventListener("keydown", this._keyBlock, true);
      window.removeEventListener("keyup", this._keyBlock, true);
      window.removeEventListener("keypress", this._keyBlock, true);
      document.removeEventListener("keydown", this._keyBlock, true);
      document.removeEventListener("keyup", this._keyBlock, true);
      document.removeEventListener("keypress", this._keyBlock, true);
      this._keyBlock = null;
    }
    if (this._pasteBlock) {
      window.removeEventListener("paste", this._pasteBlock, true);
      document.removeEventListener("paste", this._pasteBlock, true);
      this._pasteBlock = null;
    }
    if (this._dropBlock) {
      window.removeEventListener("drop", this._dropBlock, true);
      document.removeEventListener("drop", this._dropBlock, true);
      this._dropBlock = null;
    }
    if (this._dragOverBlock) {
      window.removeEventListener("dragover", this._dragOverBlock, true);
      document.removeEventListener("dragover", this._dragOverBlock, true);
      this._dragOverBlock = null;
    }
    // The graph-undo guard is released by _restoreGraphPatches() (called
    // above), which also covers the self-heal path.
    if (this.node && this._origOnRemoved !== undefined) {
      this.node.onRemoved = this._origOnRemoved;
      this._origOnRemoved = undefined;
    }
    if (this._selectionChangeHandler) {
      document.removeEventListener("selectionchange", this._selectionChangeHandler);
      this._selectionChangeHandler = null;
    }
    if (this._beforeInputHandler && this._editArea) {
      this._editArea.removeEventListener("beforeinput", this._beforeInputHandler);
      this._beforeInputHandler = null;
    }
    this._stagedHi = null;
    this._stagedHiClear = false;
    this._pickedFg = null;
    if (this._onWindowResize) {
      window.removeEventListener("resize", this._onWindowResize);
      this._onWindowResize = null;
    }
    this._restoreGraphPatches();
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    if (this.node && this.node._noteEditor === this) {
      this.node._noteEditor = null;
    }
    // Reset icon-picker session state so the next open starts fresh.
    this._iconPickerColor = null;
    this._iconPickerSize = null;
    // Reset separator-picker session state.
    this._sepPickerColor = null;
    this._sepPickerVariant = null;
    // Reset grid-picker session state.
    this._gridPickerBorderColor = null;
    this._gridPickerHeaderBg = null;
    this._gridPickerCols = null;
    this._gridPickerRows = null;
    this._gridPickerHeader = null;
    // Reset button-picker + folder-hint session state.
    this._btnPickerColor = null;
    this._btnPickerIcon = null;
    this._btnPickerSizeOn = null;
    this._folderHintPickerColor = null;
    this._folderHintPickerFolder = null;
    // Drop the icon-deletion + click-placement handler refs. The DOM
    // node they were attached to (the contenteditable inside _el) was
    // already removed above, so the listeners are gone with it; this
    // just clears the closure refs.
    this._iconClickHandler = null;
  }

  save() {
    // If the user is in Code view, persist what they edited in the textarea,
    // not what's currently in the (hidden) WYSIWYG area. sanitize runs either
    // way so malicious markup added in Code view is stripped before storage.
    if (this._mode !== "code") this._hoistListsFromParagraphs?.();
    const raw = this._mode === "code"
      ? (this._codeArea?.value || "")
      : (this._editArea?.innerHTML || "");
    let html;
    try {
      html = sanitize(raw);
    } catch (e) {
      console.error("[pix-note] sanitize threw during save; keeping raw HTML", e, { raw });
      html = raw;
    }
    // An EMPTY <p></p> (no <br>, at most layout whitespace) is never something
    // typed: a blank line the editor makes is <p><br></p>. It is what the
    // parser leaves behind when a list sat inside a paragraph (see
    // _hoistListsFromParagraphs) and what older Code-view round trips left
    // between blocks, so drop it. Not \s: in JS that also matches a non-
    // breaking space, which IS typed content.
    html = html.replace(/<p>[ \t\r\n]*<\/p>/g, "");
    this.cfg.content = html;
    // Preserve whatever size the node currently has so reload restores it. The
    // editor overlay doesn't itself resize the node — this captures the size the
    // user set on the canvas before opening the editor.
    this.cfg.width = this.node.size?.[0] || this.cfg.width;
    this.cfg.height = this.node.size?.[1] || this.cfg.height;

    const w = (this.node.widgets || []).find((x) => x.name === "note_json");
    if (w) {
      const json = JSON.stringify(this.cfg);
      w.value = json;
      if (this.node.widgets_values) {
        const i = this.node.widgets.findIndex((x) => x.name === "note_json");
        if (i > -1) this.node.widgets_values[i] = json;
      }
      if (w.callback) w.callback(w.value);
    }
    this.node._noteCfg = this.cfg;

    // Robust body lookup — Vue can detach the DOM widget while the
    // fullscreen editor overlay is open (see CLAUDE.md Vue-compat #5).
    // Using `_noteBody` directly risks writing CSS vars / innerHTML on
    // a stale reference that's no longer in the live DOM, which makes
    // per-note picker changes (Bg, Btn, Ln) silently fail to reach
    // the visible canvas body. Prefer live elements; only use cached
    // references if they're still connected.
    let body = null;
    if (this.node._noteBody?.isConnected) {
      body = this.node._noteBody;
    } else if (this.node._noteDOMWrap?.isConnected) {
      body = this.node._noteDOMWrap.querySelector(".pix-note-body");
    } else {
      // Both stale — ask ComfyUI for the current widget element.
      const w = this.node.widgets?.find((x) => x.name === "note_dom");
      body = w?.element?.querySelector?.(".pix-note-body");
    }
    if (body) {
      // Refresh the cached reference so subsequent reads point to the
      // live element, not the stale one we just bypassed.
      this.node._noteBody = body;
      renderContent(this.node, body);
    }

    if (app.graph) {
      app.graph.setDirtyCanvas(true, true);
      if (typeof app.graph.change === "function") app.graph.change();
    }

    this._dirty = false;
    this.close(true);
  }

  _build() {
    const el = (tag, cls) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };

    const overlay = el("div", "pix-note-overlay");
    overlay.addEventListener("mousedown", (e) => {
      if (e.target !== overlay) return;
      // Block-insert dialogs (grid / button / YT / Discord), color popups,
      // icon picker popup, and confirm backdrops are all appended to
      // document.body — NOT inside this.panel. Without this guard, a
      // mousedown that falls outside the dialog but inside the editor
      // backdrop lands on the overlay and triggers close(), popping an
      // unsaved-changes prompt ON TOP of the still-open modal. Mirrors
      // the same hasModal check the Escape-key handler already uses above.
      const hasModal = !!document.querySelector(
        ".pix-note-blockdlg, .pix-note-confirm-backdrop, .xh-cp-popup, .xh-cp-modal-backdrop, .pix-note-iconpop, .pix-note-modal-backdrop, .pix-note-help-overlay"
      );
      if (hasModal) return;
      this.close();
    });

    const panel = el("div", "pix-note-panel");
    overlay.appendChild(panel);

    // Header
    const header = el("div", "pix-note-header");
    const titleSpan = el("div", "pix-note-title");
    // 2026-11-19：同上，logo 改内联，底色跟主题（原 img 引用写死橙的 xh_logo.svg）。
    titleSpan.appendChild(makeXhLogo("pix-note-title-logo", 18));
    titleSpan.append(" 便签编辑 ");
    const brandSpan = el("span", "pix-note-title-brand");
    brandSpan.textContent = "XiaoHei";
    titleSpan.appendChild(brandSpan);
    header.appendChild(titleSpan);

    const closeBtn = el("button", "pix-note-close");
    closeBtn.innerHTML = "\u00d7";
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const main = el("div", "pix-note-main");
    panel.appendChild(main);

    // Toolbar placeholder — filled in by toolbar.mjs mixin
    this._toolbarEl = el("div", "pix-note-toolbar");
    main.appendChild(this._toolbarEl);
    this._buildToolbar();

    // Edit area
    const editArea = el("div", "pix-note-editarea");
    editArea.contentEditable = "true";
    editArea.innerHTML = sanitize(this.cfg.content || "");
    // Apply the per-note background colour so the editor interior matches
    // what the on-canvas body will look like after save. Falls back to the
    // editor's dark-gray default (#151515) when the user hasn't picked one.
    this._applyEditAreaBg(editArea);
    // Normalize: wrap any raw text nodes / bare <br>s at the root in <p> so
    // every top-level block operation (code insert, headings, clear-format)
    // can reliably find its enclosing block. Chrome otherwise leaves the
    // first-typed line as a bare text-node child of editArea, which made
    // the code-block insert silently skip the first line on fresh notes.
    this._normalizeEditArea(editArea);
    // Force <p> as Enter's default paragraph separator so spacing stays
    // consistent (Chrome otherwise uses <div>, which has no default margin
    // and looks mismatched against older <p>-wrapped content).
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    // Manual undo history. We replace the browser's native contenteditable
    // undo entirely because direct-DOM mutations from toolbar buttons (code
    // block insert, etc.) aren't tracked by it. Typing / execCommand
    // operations fire `input` and are captured via the debounced snap below.
    this._history = [];
    this._future = [];
    this._lastSnap = editArea.innerHTML;
    this._snapDebounce = null;
    editArea.addEventListener("input", () => {
      this._dirty = true;
      if (this._snapDebounce) clearTimeout(this._snapDebounce);
      this._snapDebounce = setTimeout(() => {
        this._snapDebounce = null;
        if (this._editArea && this._editArea.innerHTML !== this._lastSnap) {
          this._history.push(this._lastSnap);
          if (this._history.length > 100) this._history.shift();
          this._lastSnap = this._editArea.innerHTML;
          this._future = [];
        }
      }, 400);
    });
    // Clicking the empty padding below text should collapse the selection to
    // the end of the LAST block — Chrome otherwise keeps the old selection
    // since the click didn't land on any text node, and if we collapse to
    // editArea's end the cursor lands OUTSIDE any block, so the next
    // keystroke creates a raw text-node child of editArea (breaks
    // findTopBlock / code-block insert).
    editArea.addEventListener("mousedown", (e) => {
      if (e.target === editArea && e.button === 0) {
        const last = editArea.lastElementChild;
        const range = document.createRange();
        if (last) {
          range.selectNodeContents(last);
          range.collapse(false);
        } else {
          range.selectNodeContents(editArea);
          range.collapse(false);
        }
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    // Intercept <a> clicks inside the editor — browsers follow href on
    // any click in a contenteditable, so clicking on a Download / View
    // Page / Read More / YouTube / Discord pill (or any inserted link)
    // to reposition the caret would instead open the URL in a new tab.
    // Users need to be able to click INTO a pill to place the cursor
    // and then Tx-clear-format or delete it. The pencil handles bulk
    // edits; this just lets simple click-to-position work. Use capture
    // so we preempt the anchor's default navigation.
    editArea.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        e.preventDefault();
      }
    }, true);
    main.appendChild(editArea);
    this._editArea = editArea;
    // beforeinput-driven highlight stage: mirror of how foreColor
    // staging works for text-color (Chrome handles foreColor natively;
    // we have to do this manually for highlight since execCommand
    // hiliteColor on collapsed cursor is unreliable). When the user
    // picks a highlight colour, the picker stores it on
    // `this._stagedHi` and DOES NOT mutate the DOM. Right before the
    // user types a character we insert an empty bg span at the cursor
    // and place the caret inside; the typed character lands in that
    // span. _stagedHi is consumed (cleared) on first text input, same
    // one-shot semantics as Chrome's foreColor stage.
    this._beforeInputHandler = (e) => {
      if (this._applyStagedHilite) this._applyStagedHilite(e);
    };
    editArea.addEventListener("beforeinput", this._beforeInputHandler);
    // Write the Btn/Ln CSS vars on editArea NOW that it exists. The
    // makeColorPicker factory inside _buildToolbar() ran before this
    // assignment, so its apply() no-oped on `this._editArea?.`—
    // without this explicit call, the editor preview would fall back
    // to the default orange for lines/buttons on every open even when
    // cfg has a saved color. Click-time picker updates still work via
    // their own apply() call because editArea is set by then.
    this._applyCfgColorsToEditArea();
    // Edit-in-place pencil — one reusable floating button that follows
    // the user's hover across editable blocks. See Task 6 of the Code
    // Readability plan for the full scope.
    this._installPencil(main, editArea);
    this._mode = "preview";

    // Footer
    const footer = el("div", "pix-note-footer");
    const helpBtn = el("button", "pix-note-btn ghost");
    helpBtn.textContent = "? 帮助";
    helpBtn.onclick = () => this._showHelp();
    // Code Reference — secondary help modal focused on what HTML
    // tags / styles / classes the sanitizer allows in Code view.
    // Split off from the main Help so neither dialog needs a
    // scroll bar.
    const codeRefBtn = el("button", "pix-note-btn ghost");
    codeRefBtn.textContent = "? 代码";
    codeRefBtn.onclick = () => this._showCodeRef();
    const cancelBtn = el("button", "pix-note-btn");
    cancelBtn.textContent = "取消";
    cancelBtn.onclick = () => this.close();
    const saveBtn = el("button", "pix-note-btn primary");
    saveBtn.textContent = "保存";
    saveBtn.onclick = () => this.save();
    footer.appendChild(helpBtn);
    footer.appendChild(codeRefBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    panel.appendChild(footer);

    this._el = overlay;
  }

  _showHelp() {
    // Append to the editor overlay (viewport-sized, position:fixed),
    // NOT the inner panel. If it's inside the panel, position:absolute
    // top/left 50% centers the modal on the PANEL — which for a tall
    // help (12 sections) often means the top of the modal is clipped
    // ABOVE the panel's top edge, hiding the header + close button.
    // Appending to the overlay makes top:50% + translate(-50%) center
    // on the actual viewport so the whole modal is always visible.
    const host = this._el;
    if (!host) return;
    if (host.querySelector(".pix-note-help-overlay")) return;
    const h = document.createElement("div");
    h.className = "pix-note-help-overlay";
    h.innerHTML = `
      <div class="pix-note-help-header">
        <h3>便签 XiaoHei：快捷键与功能</h3>
        <button type="button" class="pix-note-help-close" title="关闭">\u2715</button>
      </div>
      <div class="pix-note-help-content">
        <div class="pix-note-help-section">
          <h4>总览</h4>
          <div class="pix-note-help-grid">
            <b>用途</b><span>富文本说明节点，用来写模型下载地址、用了哪些节点、教程步骤。纯展示，不参与计算。</span>
            <b>保存</b><span>Ctrl+S 或点「保存」。有改动时按 Esc 会先问你要不要存。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>文字格式</h4>
          <div class="pix-note-help-grid">
            <b><b>B</b></b><span>加粗（Ctrl+B）</span>
            <b><i>I</i></b><span>斜体（Ctrl+I）</span>
            <b><u>U</u></b><span>下划线（Ctrl+U）</span>
            <b><s>S</s></b><span>删除线</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/clear-format.svg")}">扫把</b><span>清掉选中文字的所有格式；把标题降回正文；拆掉代码块和列表</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>标题</h4>
          <div class="pix-note-help-grid">
            <b>H1 / H2 / H3</b><span>作用在当前这一行。想降回正文，用扫把。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>颜色</h4>
          <div class="pix-note-help-grid">
            <b><span class="pix-note-tbtn-maskicon-multi pix-note-icon-text-color"></span>A</b><span>文字颜色。选完会粘住：接着打字一直是这个色，直到你重新选。色板 36 格，带「重置」（白色）和「更多颜色……」可调 HSV / 十六进制。</span>
            <b><span class="pix-note-tbtn-maskicon-multi pix-note-icon-highlight-color"></span>高亮</b><span>文字背后的底色。选好颜色再打字，每个字都会延伸这段高亮；换个色就开新的一段。点同一个色板里的透明格或「重置」可以停掉后续高亮（已经涂上的保留）。高亮里打的空格会变成不换行空格，连打几个也看得见。</span>
            <b><span class="pix-note-tbtn-maskicon-multi pix-note-icon-bg-color"></span>背景</b><span>整张便签的底色，编辑器和画布节点都会跟着变。「重置」回到深色默认值（#111111）。透明格是灰掉的（想恢复 ComfyUI 原生右键「颜色」菜单的效果，新建便签时别碰背景就行）。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>列表</h4>
          <div class="pix-note-help-grid">
            <b><span class="pix-note-tbtn-maskicon pix-note-icon-list-dot"></span>无序</b><span>再点一下取消</span>
            <b><span class="pix-note-tbtn-maskicon pix-note-icon-list-number"></span>有序</b><span>再点一下取消</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>插入</h4>
          <div class="pix-note-help-grid">
            <b><span class="pix-note-tbtn-maskicon pix-note-icon-link"></span>链接</b><span>只接受 http、https、mailto 三种。点开在新标签页打开。</span>
            <b><span class="pix-note-tbtn-maskicon pix-note-icon-code"></span>代码</b><span>代码块（&lt;pre&gt;&lt;code&gt;）。多行内容走弹窗输入</span>
            <b><span class="pix-note-tbtn-maskicon pix-note-icon-separator"></span>分隔线</b><span>居中弹窗：选颜色和样式（实线 / 虚线 / 点线 / 双线 / 粗线），点插入。每条分隔线各带各的颜色。</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/grid.svg")}">表格</b><span>居中弹窗：选边框色和表头色、列数（2 到 4）、行数（1 到 10）、表头开关，点插入。每张表各带各的边框和表头色。Tab 键在单元格之间跳。</span>
            <b><span class="pix-note-tbtn-maskicon pix-note-icon-icon-insert"></span>图案</b><span>居中弹窗：assets/icons/note/ 里的矢量图案，自带颜色和大小档（S / M / L / XL）。单击选中，双击直接插入。同一次编辑里会粘住上次的选择。默认：model-v1、主题色、M 档。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>便签积木</h4>
          <div class="pix-note-help-grid">
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/button-design.svg")}">按钮</b><span>居中弹窗：选颜色、按钮类型（下载 / 查看页面 / 阅读更多 / 无图案）、文字、链接、可选的大小提示。每个按钮各带各的颜色。在画布上点按钮会新标签页打开它的链接。</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/folder.svg")}">文件夹提示</b><span>单独一行「放到：ComfyUI/&lt;路径&gt;」。居中弹窗：选颜色和文件夹路径。放在按钮下面，告诉看的人文件该存哪。纯提示，点了没反应。</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/youtube.svg")}">YouTube</b><span>居中弹窗，预填 XiaoHei 的 YouTube 链接（可以随便改）。品牌红色锁定。</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/discord.svg")}">Discord</b><span>居中弹窗，预填 XiaoHei 的 Discord 链接（可以随便改）。品牌蓝紫色锁定。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>原地改积木</h4>
          <div class="pix-note-help-grid">
            <b>铅笔</b><span>把鼠标移到按钮、文件夹提示、链接或代码块上会浮出一支铅笔，点它重新打开各自的弹窗，内容已经填好（包括这一块自己的颜色）。光标在表格单元格里时标题按钮是禁用的，因为替换标题会把整张表冲掉。</span>
            <b>表格 / 分隔线</b><span>这一版没有铅笔。文字直接点进单元格改；要换分隔线的颜色或样式，删掉重新插一条。</span>
            <b>改图案颜色</b><span>行内图案的颜色和大小在插入图案的弹窗里选。已经插进去的想换色，删掉按新颜色重插。</span>
            <b>删图案</b><span>光标停在图案右边按一下退格，图案和后面的空格一次删干净。空的文件夹提示也是同样一步删掉。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>视图</h4>
          <div class="pix-note-help-grid">
            <b>预览</b><span>所见即所得（默认）</span>
            <b>代码</b><span>带语法高亮的原始 HTML。随便改，切回预览时会过一遍净化。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>键盘</h4>
          <div class="pix-note-help-grid">
            <b>Ctrl+B / I / U</b><span>加粗 / 斜体 / 下划线</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/undo.svg")}">Ctrl+Z</b><span>撤销</span>
            <b><img class="pix-note-tbtn-icon" src="${pixAsset("icons/ui/redo.svg")}">Ctrl+Y / Ctrl+Shift+Z</b><span>重做</span>
            <b>Ctrl+S</b><span>保存</span>
            <b>Tab / Shift+Tab</b><span>在表格单元格之间移动（光标在表里时）</span>
            <b>Esc</b><span>关掉编辑器（有改动会先问）</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>粘贴与链接</h4>
          <div class="pix-note-help-grid">
            <b>粘贴</b><span>剪贴板内容一律按纯文本进来，图片和富文本格式会丢掉，便签才不会乱</span>
            <b>链接地址</b><span>只接受 http、https、mailto 三种链接</span>
          </div>
        </div>
      </div>
      <div class="pix-note-help-footer">
        代码视图里允许哪些 HTML 标签 / 样式 / 类，点底部的 <b>? 代码</b> 查看。<br>
        由 <b>XiaoHei</b> 出品
      </div>
    
    `;
    const close = h.querySelector(".pix-note-help-close");
    if (close) close.addEventListener("click", () => h.remove());
    host.appendChild(h);
  }

  _showCodeRef() {
    const host = this._el;
    if (!host) return;
    if (host.querySelector(".pix-note-help-overlay")) return;
    const h = document.createElement("div");
    h.className = "pix-note-help-overlay";
    h.innerHTML = `
      <div class="pix-note-help-header">
        <h3>便签 XiaoHei：代码视图参考</h3>
        <button type="button" class="pix-note-help-close" title="关闭">\u2715</button>
      </div>
      <div class="pix-note-help-content">
        <div class="pix-note-help-section">
          <h4>代码视图是什么</h4>
          <div class="pix-note-help-grid">
            <b>用途</b><span>直接改便签的原始 HTML。工具栏给不了的结构（嵌套列表、自定义组合、批量改）都能手写。</span>
            <b>切换时</b><span>切到代码会把净化过的 HTML 排版好看再显示。切回预览会再净化一遍，不合规的东西会被剥掉。</span>
            <b>安全性</b><span>保存、粘贴、切换视图用的是同一套净化规则。在代码视图写 &lt;script&gt; 再切回预览，它会被删掉。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>块级标签</h4>
          <div class="pix-note-help-grid">
            <b>&lt;p&gt;</b><span>段落（默认块）</span>
            <b>&lt;h1&gt; / &lt;h2&gt; / &lt;h3&gt;</b><span>标题</span>
            <b>&lt;blockquote&gt;</b><span>引用段落（工具栏没有对应按钮，手写）</span>
            <b>&lt;pre&gt;</b><span>代码块外壳</span>
            <b>&lt;hr&gt;</b><span>水平分隔线</span>
            <b>&lt;div&gt;</b><span>通用块（允许但不推荐，尽量用 &lt;p&gt;）</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>行内标签</h4>
          <div class="pix-note-help-grid">
            <b>&lt;b&gt; / &lt;strong&gt;</b><span>加粗</span>
            <b>&lt;i&gt; / &lt;em&gt;</b><span>斜体</span>
            <b>&lt;u&gt;</b><span>下划线</span>
            <b>&lt;s&gt; / &lt;strike&gt;</b><span>删除线</span>
            <b>&lt;br&gt;</b><span>换行</span>
            <b>&lt;a href&gt;</b><span>链接（只认 http、https、mailto，其他剥掉）。自动加 target _blank 和 rel noopener noreferrer</span>
            <b>&lt;code&gt;</b><span>行内代码（成块就套在 &lt;pre&gt; 里）</span>
            <b>&lt;span&gt;</b><span>通用行内；承载颜色 / 高亮 / 对齐样式，行内图案还靠 data-ic</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>列表</h4>
          <div class="pix-note-help-grid">
            <b>&lt;ul&gt;</b><span>无序列表</span>
            <b>&lt;ol&gt;</b><span>有序列表</span>
            <b>&lt;li&gt;</b><span>列表项（ul / ol 的子项）</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>表格</h4>
          <div class="pix-note-help-grid">
            <b>&lt;table class="pix-note-grid"&gt;</b><span>这个类必须带上，不带样式不生效。</span>
            <b>&lt;thead&gt; / &lt;tbody&gt;</b><span>可选的表头 / 表体包裹</span>
            <b>&lt;tr&gt;</b><span>一行</span>
            <b>&lt;th&gt; / &lt;td&gt;</b><span>表头格 / 数据格。不允许 colspan / rowspan。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>允许的行内样式</h4>
          <div class="pix-note-help-grid">
            <b><code>color</code></b><span>文字前景色。分隔线和文件夹提示也用它当各自的颜色载体（currentColor 会流到边框和图案里）。接受 <code>#rgb</code> / <code>#rrggbb</code>、<code>rgb(...)</code> / <code>rgba(...)</code>、<code>transparent</code> / <code>inherit</code> / <code>currentColor</code>，以及少量颜色名（black / white / red / green / blue / yellow / orange / purple / gray / grey）。</span>
            <b><code>background-color</code></b><span>文字高亮，同时也是 &lt;a class="pix-note-dl/vp/rm/btn-plain"&gt; 药丸按钮各自的颜色。取值形式和 <code>color</code> 一样。</span>
            <b><code>text-align</code></b><span>left / right / center / justify</span>
            <b><code>--pix-note-grid-border</code></b><span>这张表各自的单元格边框色。写在 &lt;table&gt; 上。取值形式和 <code>color</code> 一样。</span>
            <b><code>--pix-note-grid-header-bg</code></b><span>这张表各自的表头行底色。写在 &lt;table&gt; 上。取值形式和 <code>color</code> 一样。</span>
          </div>
          <p style="margin:6px 0 0 0;color:#888;">其他样式（字号、外边距、display……）保存 / 粘贴 / 切视图时一律删掉。</p>
        </div>
        <div class="pix-note-help-section">
          <h4>允许的类名</h4>
          <div class="pix-note-help-grid">
            <b>pix-note-dl / vp / rm</b><span>药丸按钮（下载 / 查看页面 / 阅读更多）</span>
            <b>pix-note-btn-plain</b><span>药丸按钮，前面不带图案</span>
            <b>pix-note-btnblock</b><span>药丸按钮的外壳（老版本捆绑的文件夹提示也包在它里面）</span>
            <b>pix-note-btnsize</b><span>药丸里的体积标签</span>
            <b>pix-note-folderhint</b><span>单独一行「放到：……」。新写法是 &lt;div&gt;；老版本捆绑的提示还是 &lt;span&gt; 套在 btnblock 里。</span>
            <b>pix-note-yt / discord</b><span>YouTube / Discord 药丸（品牌色锁定）</span>
            <b>pix-note-grid</b><span>表格（&lt;table&gt; 上必须有）。配合 --pix-note-grid-border / --pix-note-grid-header-bg 设各自颜色。</span>
            <b>pix-note-hr-solid / dashed / dotted / double / thick</b><span>&lt;hr&gt; 的分隔线样式。配合行内 <code>style="color: ..."</code> 设各自的颜色。</span>
            <b>pix-note-ic</b><span>行内图案的 span。配合 data-ic="&lt;slug&gt;"（slug 就是 assets/icons/note/ 里的文件名，不带 .svg）</span>
          </div>
          <p style="margin:6px 0 0 0;color:#888;">其他类名一律静默剥掉。</p>
        </div>
        <div class="pix-note-help-section">
          <h4>一见到就删</h4>
          <div class="pix-note-help-grid">
            <b>&lt;script&gt;</b><span>永远删掉</span>
            <b>&lt;iframe&gt; / &lt;img&gt;</b><span>永远删掉</span>
            <b>on*=</b><span>所有事件处理（onclick、onerror、onmouseover……）从每个标签上剥掉</span>
            <b>javascript:</b><span>&lt;a&gt; 上的这个协议一律拦住</span>
            <b>data-*</b><span>白名单：<code>&lt;span&gt;</code> 上只留 <code>data-ic</code> + <code>data-size</code> + <code>contenteditable</code>（行内图案）；<code>&lt;a&gt;</code> 上只留 <code>data-folder</code> + <code>data-size</code> + <code>data-label</code>（按钮积木）。其余全剥。</span>
          </div>
        </div>
        <div class="pix-note-help-section">
          <h4>例子</h4>
          <pre style="background:#0e0e0e;border:1px solid #2a2a2a;border-radius:4px;padding:8px;color:#ddd;font-size:10px;line-height:1.5;overflow-x:auto;margin:0;">&lt;h2&gt;工作流说明&lt;/h2&gt;
&lt;p&gt;先装 &lt;span data-ic="CLIP" class="pix-note-ic"&gt;&lt;/span&gt;&amp;nbsp;然后&lt;/p&gt;
&lt;span class="pix-note-btnblock"&gt;
  &lt;a class="pix-note-dl" style="background-color: #E8A33C"
     href="https://example.com/model.safetensors"
     target="_blank" rel="noopener noreferrer"&gt;模型&lt;span class="pix-note-btnsize"&gt;2 GB&lt;/span&gt;&lt;/a&gt;
&lt;/span&gt;&amp;nbsp;
&lt;div class="pix-note-folderhint" style="color: #E8A33C"&gt;放到：ComfyUI/models/loras&lt;/div&gt;
&lt;hr class="pix-note-hr-dashed" style="color: #818cf8"&gt;
&lt;table class="pix-note-grid"
       style="--pix-note-grid-border: #E8A33C; --pix-note-grid-header-bg: #1a1a1a"&gt;
  &lt;thead&gt;&lt;tr&gt;&lt;th&gt;名称&lt;/th&gt;&lt;th&gt;体积&lt;/th&gt;&lt;/tr&gt;&lt;/thead&gt;
  &lt;tbody&gt;&lt;tr&gt;&lt;td&gt;Flux 2&lt;/td&gt;&lt;td&gt;9 GB&lt;/td&gt;&lt;/tr&gt;&lt;/tbody&gt;
&lt;/table&gt;</pre>
        </div>
      </div>
      <div class="pix-note-help-footer">
        由 <b>XiaoHei</b> 出品
      </div>
    
    `;
    const close = h.querySelector(".pix-note-help-close");
    if (close) close.addEventListener("click", () => h.remove());
    host.appendChild(h);
  }
}

// Flush any pending debounced snap so subsequent push/restore operations see
// the current innerHTML as the baseline.
NoteEditor.prototype._flushDebouncedSnap = function () {
  if (this._snapDebounce) {
    clearTimeout(this._snapDebounce);
    this._snapDebounce = null;
    if (this._editArea && this._editArea.innerHTML !== this._lastSnap) {
      this._history.push(this._lastSnap);
      if (this._history.length > 100) this._history.shift();
      this._lastSnap = this._editArea.innerHTML;
      this._future = [];
    }
  }
};

// Toolbar operations that mutate the DOM directly (not via execCommand) must
// call _snapBefore / _snapAfter so the manual history records them. Operations
// that use execCommand don't need these — the resulting `input` event triggers
// the debounced snap in _build.
NoteEditor.prototype._snapBefore = function () {
  if (!this._editArea) return;
  this._flushDebouncedSnap();
  this._history.push(this._lastSnap);
  if (this._history.length > 100) this._history.shift();
  this._future = [];
};
NoteEditor.prototype._snapAfter = function () {
  if (!this._editArea) return;
  this._lastSnap = this._editArea.innerHTML;
};

NoteEditor.prototype.doUndo = function () {
  if (!this._editArea) return;
  this._flushDebouncedSnap();
  if (!this._history || this._history.length === 0) return;
  this._future.push(this._lastSnap);
  const prev = this._history.pop();
  this._editArea.innerHTML = prev;
  this._lastSnap = prev;
  this._placeCursorAtEnd();
  this._dirty = true;
  this._refreshActiveStates?.();
};

NoteEditor.prototype.doRedo = function () {
  if (!this._editArea) return;
  this._flushDebouncedSnap();
  if (!this._future || this._future.length === 0) return;
  this._history.push(this._lastSnap);
  if (this._history.length > 100) this._history.shift();
  const next = this._future.pop();
  this._editArea.innerHTML = next;
  this._lastSnap = next;
  this._placeCursorAtEnd();
  this._dirty = true;
  this._refreshActiveStates?.();
};

// Wrap any loose text nodes / <br>s at the editArea root in <p> so every
// direct child is a block element. Without this, findTopBlock() called from
// toolbar handlers returns null for the first-typed line on a fresh note
// (Chrome leaves it as a raw text node), and the code-block insert silently
// skipped over it.
NoteEditor.prototype._normalizeEditArea = function (area) {
  const root = area || this._editArea;
  if (!root) return;
  const nodes = Array.from(root.childNodes);
  let currentP = null;
  const isBlockEl = (x) => !!x && x.nodeType === 1 &&
    /^(P|UL|OL|DIV|H1|H2|H3|PRE|TABLE|BLOCKQUOTE|HR)$/.test(x.tagName);
  for (const n of nodes) {
    // Whitespace-only text BETWEEN blocks is layout, not content: Code view's
    // pretty-printer puts two newlines between every block, and wrapping that in a
    // <p> left a junk paragraph between every pair of blocks after each
    // Code -> Preview switch (reproduced). Drop it when it does not sit inside
    // a run of inline content (no open <p>, and a block or nothing follows).
    if (n.nodeType === 3 && /^[ \t\r\n]*$/.test(n.nodeValue) && !currentP &&
        (!n.nextSibling || isBlockEl(n.nextSibling))) {
      n.remove();
      continue;
    }
    const isTextish =
      n.nodeType === 3 ||
      (n.nodeType === 1 && (n.tagName === "BR" || n.tagName === "SPAN" ||
        n.tagName === "B" || n.tagName === "STRONG" || n.tagName === "I" ||
        n.tagName === "EM" || n.tagName === "U" || n.tagName === "S" ||
        n.tagName === "STRIKE" || n.tagName === "A" || n.tagName === "CODE" ||
        n.tagName === "FONT" || n.tagName === "LABEL"));
    if (isTextish) {
      if (!currentP) {
        currentP = document.createElement("p");
        root.insertBefore(currentP, n);
      }
      currentP.appendChild(n);
    } else {
      currentP = null;
    }
  }
  if (root.childNodes.length === 0) {
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    root.appendChild(p);
  }
};

// Chrome's insertUnorderedList / insertOrderedList, run in a <p> (always the
// case here: the editor makes <p> its paragraph), puts the list INSIDE that
// <p> - and the paragraph typed after leaving the list too:
//   <p><ul><li>one</li></ul><p>after</p></p>   (reproduced 2026-10-01)
// A <p> cannot hold a list, so the HTML parser splits it on save into an EMPTY
// <p></p> above the list and another below: extra gaps that come back on every
// open. Move each such list out to the paragraph's level, carry what followed
// it along (blocks as they are, loose inline content into a new <p>), and drop
// the paragraph if nothing is left in it. The caret is put back where it was:
// moving a node collapses any selection inside it.
//
// Also called right after the list buttons, where it ALSO wraps loose text in
// a <p>: turning a list item back into text leaves it bare at the top level
// ("one<br>" beside the paragraphs, reproduced), and _normalizeEditArea's own
// note explains why bare text breaks every block operation that follows.
NoteEditor.prototype._hoistListsFromParagraphs = function (alsoNormalize = false) {
  const area = this._editArea;
  if (!area) return false;
  const lists = Array.from(area.querySelectorAll("p > ul, p > ol"));
  const loose = alsoNormalize && Array.from(area.childNodes).some((n) =>
    n.nodeType === 3 ? n.nodeValue.trim() !== "" : (n.nodeType === 1 && !/^(P|UL|OL|DIV|H1|H2|H3|PRE|TABLE|BLOCKQUOTE|HR)$/.test(n.tagName)));
  if (!lists.length && !loose) return false;
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount && area.contains(sel.anchorNode)
    ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
  const BLOCK = /^(P|UL|OL|DIV|H1|H2|H3|PRE|TABLE|BLOCKQUOTE|HR)$/;
  for (const list of lists) {
    const p = list.parentElement;
    if (!p || p.tagName !== "P" || !area.contains(p)) continue;
    const after = [];
    for (let n = list.nextSibling; n; n = n.nextSibling) after.push(n);
    p.after(list);
    let anchor = list;
    let loose = null;
    for (const n of after) {
      if (n.nodeType === 1 && BLOCK.test(n.tagName)) {
        anchor.after(n); anchor = n; loose = null;
      } else {
        if (!loose) { loose = document.createElement("p"); anchor.after(loose); anchor = loose; }
        loose.appendChild(n);
      }
    }
    // Remove the paragraph when only whitespace / <br> is left in it.
    const keep = p.textContent.replace(/[\s\u00a0]+/g, "") ||
      p.querySelector(".pix-note-ic, a, img, table, code");
    if (!keep) p.remove();
  }
  if (loose) this._normalizeEditArea?.(area);
  if (saved) { try { sel.setBaseAndExtent(saved[0], saved[1], saved[2], saved[3]); } catch (_e) {} }
  return true;
};

// Code / Preview view toggle. "Code" shows the sanitized HTML in a textarea
// so power users can tweak markup directly; "Preview" (default) is the
// WYSIWYG contenteditable. Switching in either direction runs sanitize so
// the user sees the exact shape that will be stored.
NoteEditor.prototype._enterCodeView = function () {
  if (this._mode === "code" || !this._editArea) return;
  const htmlNow = sanitize(this._editArea.innerHTML || "");
  this._editArea.style.display = "none";

  // Destroy any prior overlay — keeping one around would stale-scroll
  // when the user toggles Code→Preview→Code with edits in between.
  if (this._codeView) {
    this._codeView.destroy();
    this._codeView = null;
  }
  const cv = buildCodeViewDOM(htmlNow, {
    onInput: () => { this._dirty = true; },
  });
  this._editArea.parentElement.appendChild(cv.root);
  this._codeView = cv;
  this._codeArea = cv.textarea; // back-compat alias; toolbar still reads ._codeArea

  this._mode = "code";
  cv.textarea.focus();
};

NoteEditor.prototype._enterPreviewView = function () {
  if (this._mode !== "code") { this._mode = "preview"; return; }
  const raw = this._codeView?.textarea.value || "";
  const clean = sanitize(raw);
  this._editArea.innerHTML = clean;
  this._normalizeEditArea?.(this._editArea);
  if (this._codeView) {
    this._codeView.destroy();
    this._codeView = null;
    this._codeArea = null;
  }
  this._editArea.style.display = "";
  this._mode = "preview";
  this._editArea.focus();
};

NoteEditor.prototype._applyEditAreaBg = function (area) {
  const root = area || this._editArea;
  if (!root) return;
  // Priority order for the editor's interior background:
  //   1. cfg.backgroundColor as an explicit hex (user picked in our
  //      Bg picker) — authoritative.
  //   2. node.bgcolor (native right-click Colors menu or an already-
  //      applied default) — so the editor interior matches the
  //      canvas node the user is about to edit. Without this, picking
  //      green via the native picker then opening the editor would
  //      show a dark-gray editor body on top of a green canvas node,
  //      which is confusing.
  //   3. LiteGraph's NODE_DEFAULT_BGCOLOR — hit when the user picked
  //      "no color / default" in the native picker, so node.bgcolor
  //      is null and the canvas is rendering at the LiteGraph theme
  //      default. Matching that in the editor keeps the two surfaces
  //      visually consistent.
  //   4. #111111 ultimate fallback if LiteGraph isn't exposed on
  //      window (shouldn't happen in normal ComfyUI, but defensive).
  const cfgBg = this.cfg.backgroundColor;
  let bg;
  if (typeof cfgBg === "string" && cfgBg && cfgBg !== "transparent") {
    bg = cfgBg;
  } else if (this.node?.bgcolor) {
    bg = this.node.bgcolor;
  } else {
    bg = window.LiteGraph?.NODE_DEFAULT_BGCOLOR || "#111111";
  }
  root.style.background = bg;
};

// Write the Btn/Ln CSS vars onto the edit area based on the current
// cfg. Called at editor open (after _editArea is assigned) so the
// initial render reflects saved colors. makeColorPicker's per-picker
// apply() also writes these, but only when it runs AFTER _editArea is
// set — which isn't the case on editor open. Keeping this method on
// the instance so it can be re-triggered if cfg is swapped later.
NoteEditor.prototype._applyCfgColorsToEditArea = function () {
  const a = this._editArea;
  if (!a) return;
  a.style.setProperty("--pix-note-btn",  this.cfg.buttonColor || themeAccentHex());
  a.style.setProperty("--pix-note-line", this.cfg.lineColor   || themeAccentHex());
};

NoteEditor.prototype._placeCursorAtEnd = function () {
  if (!this._editArea) return;
  const range = document.createRange();
  range.selectNodeContents(this._editArea);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  this._editArea.focus();
};

// Floating pencil. Hover-delegation pattern: one reusable <button>
// positioned absolutely inside the editor's main container; we listen
// to mouseover/mouseout on editArea, find the closest editable block
// under the pointer via a single selector list, and reposition the
// pencil over the block's top-right corner. Task 6 ships the DOM and
// positioning; task 7 wires the click handler.
//
// The selector list MUST stay in sync with the dialog router in task 7
// (_dispatchBlockEdit). Any new editable block type needs to be added
// in both places.
const PENCIL_BLOCK_SELECTORS = [
  "span.pix-note-btnblock",
  // Folder hint: new design uses <div>, legacy bundled hints inside
  // btnblocks use <span>. Tag-agnostic class match covers both. The
  // pencil mouseover handler escalates the in-btnblock case to the
  // parent btnblock so the click edits the whole bundle.
  ".pix-note-folderhint",
  "a.pix-note-yt",
  "a.pix-note-discord",
  "pre",
  // Plain anchors last so a XiaoHei-classed <a> matches above first.
  "a:not([class*='pix-note-'])",
].join(",");

NoteEditor.prototype._installPencil = function (main, editArea) {
  const pencil = document.createElement("button");
  pencil.type = "button";
  pencil.className = "pix-note-pencil";
  pencil.contentEditable = "false";
  pencil.setAttribute("aria-label", "编辑块");
  const icon = document.createElement("img");
  icon.src = pixAsset("icons/layers/edit.svg");
  icon.draggable = false;
  pencil.appendChild(icon);
  main.appendChild(pencil);
  this._pencil = pencil;
  this._pencilTarget = null;

  let hideTimer = null;
  const show = (target) => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    this._pencilTarget = target;
    this._repositionPencil();
    pencil.classList.add("visible");
  };
  const hide = () => {
    pencil.classList.remove("visible");
    this._pencilTarget = null;
  };
  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 150);
  };

  editArea.addEventListener("mouseover", (e) => {
    let t = e.target.closest?.(PENCIL_BLOCK_SELECTORS);
    if (!t || !editArea.contains(t)) return;
    // A folder hint that lives INSIDE a Button Design block edits the
    // whole button block (the bundled folder line is part of the
    // button). Standalone folder hints (the new design — <div>) edit
    // themselves. closest() returns the folderhint first because
    // it's the user's actual target, so we escalate manually.
    if (t.classList?.contains("pix-note-folderhint")) {
      const bb = t.closest("span.pix-note-btnblock");
      if (bb) t = bb;
    }
    show(t);
  });
  editArea.addEventListener("mouseout", (e) => {
    // Moving to the pencil itself should NOT hide it.
    const to = e.relatedTarget;
    if (to === pencil || pencil.contains(to)) return;
    scheduleHide();
  });
  pencil.addEventListener("mouseenter", () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  pencil.addEventListener("mouseleave", () => scheduleHide());

  pencil.addEventListener("mousedown", (e) => {
    // Prevent the editor from deselecting / re-placing the caret on
    // mousedown — we want the click to dispatch cleanly and any caret
    // change to be the dialog's doing.
    e.preventDefault();
    e.stopPropagation();
  });
  pencil.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = this._pencilTarget;
    if (!target) return;
    hide();
    this._dispatchBlockEdit?.(target, pencil);
  });

  // Recompute position on editArea scroll + window resize so the pencil
  // tracks its target during layout changes.
  editArea.addEventListener("scroll", () => this._repositionPencil());
  window.addEventListener("resize", this._onWindowResize = () => this._repositionPencil());
};

NoteEditor.prototype._repositionPencil = function () {
  const pencil = this._pencil;
  const target = this._pencilTarget;
  const main = pencil?.parentElement;
  if (!pencil || !target || !main) return;
  const mainRect = main.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  // Bail if target scrolled out of view.
  if (tRect.bottom < mainRect.top || tRect.top > mainRect.bottom) {
    pencil.classList.remove("visible");
    return;
  }
  const top = tRect.top - mainRect.top + 4;
  const left = tRect.right - mainRect.left - 26;
  pencil.style.top = `${top}px`;
  pencil.style.left = `${left}px`;
};
