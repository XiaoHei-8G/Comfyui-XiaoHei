// Resize panel UI moved to js/shared/resize_panel.mjs so Image Resize XiaoHei
// can reuse it. Load Image keeps importing from here unchanged — buildModePanel
// defaults its stateKey to "loadImagePixState", so existing call sites need no
// edits. See CLAUDE.md "Image Resize XiaoHei Patterns".
export { previewResize, formatMP, buildModePanel } from "../shared/resize_panel.mjs";
