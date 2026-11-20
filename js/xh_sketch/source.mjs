// 小黑·标注 - which picture the node shows, and loading it.
//
// Two sources, in this order of trust:
//  1. RUN: after a run, Python saves a small copy of the picture that ACTUALLY
//     came in (node_sketch.py _save_preview). Exact, whatever made it - but only
//     valid while the upstream is still the one that produced it, and only when
//     that upstream was known at SUBMIT time (see index.js _pixSkSubmitKey).
//  2. UPSTREAM: before any run, walk the wire back to the node that holds the
//     pixels - first any node whose own `image` widget names the file (the
//     component Load Image, 加载图片 Mini, 加载图片 XiaoHei), then any node
//     already showing a picture.
//
// The walk MIRRORS resolveImageSource in js/inpaint_crop/index.js (inpaint.md
// #18) - keep the two in step. Its one rule matters more than any other: when
// the live branch cannot be known, return NOTHING. Marking a picture that is not
// the one that will run is worse than showing none.
//
// Unlike Inpaint Crop's copy, this one returns a STABLE `key` beside the url
// (the core Load Image url is built without a timestamp), because the node
// polls it and must reload only when the picture really changed.

import { pixApiUrl } from "../shared/api_url.mjs";
import { loaderImagePart } from "../shared/loader_source.mjs";

const MAX_SOURCE_HOPS = 12;

const PASSTHROUGH_INPUT = {
  JoinImageWithAlpha: "image",
  SplitImageWithAlpha: "image",
  PixaromaImageInfo: "image_info",
};

function inputByName(node, name) {
  return (node.inputs || []).find((i) => i.name === name) || null;
}

function linkById(graph, id) {
  if (id == null || !graph) return null;
  let l = graph.links?.[id];
  if (!l && typeof graph.links?.get === "function") l = graph.links.get(id);
  return l || null;
}

function routedInput(node, fromSlot) {
  const cls = node.comfyClass || node.type || "";
  if (cls === "PixaromaSwitch") {
    const idx = node.properties?.switchState?.activeIndex;
    return idx ? inputByName(node, "input_" + idx) : null;
  }
  if (cls === "PixaromaSwitchSource") {
    const bank = node.properties?.switchSourceState?.active === "B" ? "b" : "a";
    return inputByName(node, bank + "_" + ((fromSlot | 0) + 1));
  }
  const named = PASSTHROUGH_INPUT[cls];
  if (named) {
    const hit = inputByName(node, named);
    if (hit) return hit;
  }
  const wired = (node.inputs || []).filter((i) => i.link != null);
  return wired.length === 1 ? wired[0] : null;
}

function parseAnnotatedImageValue(value) {
  let v = String(value || "");
  let type = "input";
  const m = v.match(/\s*\[(input|output|temp)\]\s*$/i);
  if (m) { type = m[1].toLowerCase(); v = v.slice(0, m.index); }
  v = v.replace(/\\/g, "/").trim();
  const i = v.lastIndexOf("/");
  return { filename: i >= 0 ? v.slice(i + 1) : v, subfolder: i >= 0 ? v.slice(0, i) : "", type };
}

function viewUrl(part) {
  return pixApiUrl(`/view?filename=${encodeURIComponent(part.filename)}` +
    `&subfolder=${encodeURIComponent(part.subfolder || "")}` +
    `&type=${encodeURIComponent(part.type || "input")}`);
}

// Cache-busting query parameters a preview URL may carry. Load Image Mini stamps
// `t=Date.now()` on every fetch (js/xh_load_image/api.mjs updateNativePreview),
// so a key built from the raw url said "new picture" each time that loader
// refreshed the SAME file - and, on nodes that reuse one fixed preview name,
// said "same picture" after the file really changed. Strip them (2026-11-19).
const VOLATILE_PARAMS = ["t", "_", "ts", "timestamp", "v", "cache", "rnd", "rand"];

/** The part of a url that names a file, without anything that changes per fetch. */
function stableUrl(url) {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.href);
    for (const k of VOLATILE_PARAMS) u.searchParams.delete(k);
    return u.pathname + "?" + u.searchParams.toString();
  } catch {
    return raw;
  }
}

/** Any node that SOURCES a file through its own `image` widget: the component
 *  Load Image, 加载图片 Mini (XHLoadImageMini), 加载图片 XiaoHei. The widget is
 *  the truth and the preview merely follows it - so read it first, never guess
 *  from the preview. Nodes that transform rather than source (anything with a
 *  wired input) are left to the walk below. */
function widgetPicture(src) {
  // A loader that NAMES its file is the only trustworthy source: bypass the
  // node.imgs preview cache entirely (keyed by node id -> crosses workflows).
  // Recognise it by class, and do NOT bail just because it has a wired input
  // (a loader may sit behind a resize/switch chain). Shared with inpaint.
  const loaderPart = loaderImagePart(src);
  if (loaderPart) {
    return { key: `file:${loaderPart.type}:${loaderPart.subfolder || ""}/${loaderPart.filename}`, url: viewUrl(loaderPart) };
  }
  // Conservative fallback for non-loader nodes that expose an image widget and
  // have no wired input at all (third-party loaders we don't name explicitly).
  if ((src.inputs || []).some((i) => i.link != null)) return null;
  const w = (src.widgets || []).find((x) => x && x.name === "image");
  if (!w || typeof w.value !== "string" || !w.value.trim()) return null;
  const part = parseAnnotatedImageValue(w.value);
  // The file - not its preview cache key - is what the run will read.
  return { key: `file:${part.type}:${part.subfolder || ""}/${part.filename}`, url: viewUrl(part) };
}

/** The picture THIS node holds, as {key, url}, or null. */
function heldPicture(src, slot) {
  if (!src) return null;
  const byWidget = widgetPicture(src);
  if (byWidget) return byWidget;
  if (src.imgs && src.imgs.length > 0) {
    const img = src.imgs[slot] || src.imgs[0];
    const url = typeof img === "string" ? img : img?.src;
    if (url) return { key: "imgs:" + stableUrl(url), url };
  }
  return null;
}

/** Walk back to the picture that will arrive on `image`, or null. */
export function upstreamPicture(node) {
  const graph = node?.graph;
  if (!graph) return null;
  let input = inputByName(node, "image");
  const seen = new Set();
  for (let hop = 0; hop < MAX_SOURCE_HOPS; hop++) {
    if (!input || input.link == null) return null;
    const link = linkById(graph, input.link);
    const src = link && graph.getNodeById(link.origin_id);
    if (!src || seen.has(src.id)) return null;
    seen.add(src.id);
    const held = heldPicture(src, link.origin_slot);
    if (held) return held;
    input = routedInput(src, link.origin_slot);
  }
  return null;
}

/** Is anything wired into `image` at all? (Tells the empty-state hints apart.) */
export function imageWired(node) {
  return inputByName(node, "image")?.link != null;
}

/** The ui entry a run sent back -> a picture source. */
export function runSource(entry, forKey) {
  if (!entry || typeof entry !== "object" || !entry.filename) return null;
  const url = pixApiUrl(`/view?filename=${encodeURIComponent(entry.filename)}` +
    `&subfolder=${encodeURIComponent(entry.subfolder || "")}&type=${encodeURIComponent(entry.type || "temp")}`);
  return {
    key: "run:" + entry.filename,
    url,
    kind: "run",
    realW: Number(entry.width) || 0,
    realH: Number(entry.height) || 0,
    forKey: forKey ?? null,
  };
}

/**
 * Load a picture into the node's slot unless it is already the one showing.
 * `onReady` runs after it loads OR fails, so the face can repaint either way.
 */
export function loadPicture(node, src, onReady) {
  if (!src) {
    if (node._pixSkPic) { node._pixSkPic = null; onReady?.(); }
    return;
  }
  if (node._pixSkPic?.key === src.key) return;
  const img = new Image();
  img.decoding = "async";
  const pic = {
    key: src.key, url: src.url, kind: src.kind || "upstream", img,
    w: 0, h: 0, realW: src.realW || 0, realH: src.realH || 0, ok: false, failed: false,
  };
  node._pixSkPic = pic;
  img.onload = () => {
    if (node._pixSkPic !== pic) return;         // a newer picture took the slot
    pic.w = img.naturalWidth;
    pic.h = img.naturalHeight;
    if (!pic.realW || !pic.realH) { pic.realW = pic.w; pic.realH = pic.h; }
    pic.ok = true;
    onReady?.();
  };
  img.onerror = () => {
    if (node._pixSkPic !== pic) return;
    pic.failed = true;
    onReady?.();
  };
  img.src = src.url;
}
