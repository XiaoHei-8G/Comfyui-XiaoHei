// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Build a URL that works on a HOSTED ComfyUI, not just on localhost.  ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// NEVER write a root-relative API URL (`/view?...`, `fetch("/pixaroma/api/x")`)
// again. Route it through here.
//
// WHY (measured on a cloud platform, 2026-08-04). Save Mp4's in-node player was
// black there and its play button did nothing, while VideoHelperSuite's preview
// worked in the same graph. The console said exactly why:
//
//     GET https://<host>/view?filename=Video_00001_....mp4   401 (Unauthorized)
//
// The filename was correct, so our JS had the data and had built the player. The
// URL was the problem: `/view?...` resolves against the PAGE ORIGIN, and on that
// host the page origin is their web app, not ComfyUI's API.
//
// The trap that makes this invisible, and that cost a wrong diagnosis mid-session:
// the host serves ComfyUI's FRONTEND FILES at the root, so `/scripts/app.js` and
// our own modules load perfectly. "Our JS runs, therefore root paths reach
// ComfyUI" is FALSE. Static files and the API are served by different things.
// Locally they are the same server, which is why nothing shows up in testing.
//
// `api.apiURL(route)` is ComfyUI's own helper and prefixes whatever base the
// deployment is actually using (`api_base + "/api" + route`). VideoHelperSuite
// routes every URL through it, including its OWN custom routes (`/vhs/viewvideo`,
// `/vhs/getpath`), and it works on that host. That is the evidence this is right
// for our routes too, not just for core's.
//
// Locally this changes `/x` to `/api/x`, which is a no-op in practice: ComfyUI
// registers an `/api`-prefixed alias for every non-static route (see
// `server.py`, "Prefix every route with /api"). All 55 of our routes are
// decorator routes, so every one of them has an alias. Verified by fetching each
// route family both ways and diffing the status codes.

import { api } from "../../../scripts/api.js";
import { XH_PAINT_ICON_MAP } from "./xh_paint_icon_map.mjs";

/**
 * Absolute-safe URL for a ComfyUI or Pixaroma route.
 * @param {string} route e.g. "/view?filename=x.png&type=output" or "/pixaroma/api/version"
 * @returns {string} the same route, prefixed for this deployment
 */
export function pixApiUrl(route) {
  try {
    if (typeof api?.apiURL === "function") return api.apiURL(route);
  } catch (_e) {
    /* fall through - a broken helper must not take the feature down with it */
  }
  return route; // degrade to the old behaviour rather than produce nothing
}

/**
 * Absolute-safe URL for one of OUR bundled assets (icons, fonts, sounds, models).
 *
 * @param {string} tail path BELOW assets, e.g. "icons/ui/play.svg". No leading /.
 * @returns {string} a complete, token-bearing url
 *
 * Two things this exists to get right, BOTH of which were shipped wrong once:
 *
 * 1. THE FILENAME GOES IN THE QUERY STRING, and the PATH stays extensionless.
 *    A hosted ComfyUI's gateway routes by FILE EXTENSION, not by path: a url
 *    whose PATH ends .svg / .png / .ttf / .mp3 is answered by their own static
 *    file server and never reaches ComfyUI, wherever it sits in the path. Moving
 *    assets to a different path does NOT help - that was tried and measured.
 *    Extensions they forward: .json, .glb, .mjs, and none at all. Putting the
 *    name in the query keeps the path extensionless, which IS forwarded
 *    (verified: "/pixaroma/api/version?name=icons/ui/play.svg" answers 200).
 *    server_routes.py serves this at /pixaroma/api/asset and still serves the
 *    original /pixaroma/assets/... paths for anything that references them.
 *
 * 2. NEVER PRE-BUILD A BASE. The host appends its auth token as a QUERY STRING
 *    (?Rh-Comfy-Auth=...), so a "base" that is wrapped and then concatenated puts
 *    the token in the MIDDLE of the url and the request dies:
 *
 *        const B = pixApiUrl("/pixaroma/api/assets/icons/ui/");   // WRONG
 *        B + "play.svg"   ->  ".../icons/ui/?Rh-Comfy-Auth=xxxplay.svg"
 *
 *    That is what broke the 3D editor's three.js import. Always hand the COMPLETE
 *    tail to this function:  pixAsset("icons/ui/" + name).
 *
 * In CSS, call it inside the template literal:
 *     `-webkit-mask: url(${pixAsset("icons/ui/play.svg")}) center/contain;`
 * and note the argument must be a TEMPLATE literal too if it contains ${...} -
 * "${x}" inside double quotes is literal text, not interpolation, and fails
 * silently with no syntax error anywhere.
 */

/** 家族自有图标库目录（与 xh_icons/index.mjs 的 BASE 指向同一处）。 */
const XH_FAM_ICON_BASE = new URL("../xh_icons/svg/", import.meta.url);

/** 透明占位图：家族库里确实没有的图案按用户要求留空，不显示破图、不显示别家图案。 */
const XH_BLANK_ICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
);

export function pixAsset(tail) {
  const rel = String(tail).replace(/^\/+/, "");

  // ── 2026-11-13 家族图案统一（用户点名：画板里的小图案全是 Pixaroma 的，全换掉） ──
  // 画板的 212 枚图案全部经由本函数取 URL，所以在这里一处重定向即可覆盖所有调用点
  // （framework/、shared/、xh_paint/ 共 20+ 文件），不用逐个改 <img> 工厂。
  //   · 家族图标库有对应图案 → 走 js/xh_icons/svg 的 Lucide 图标（ISC，随包、不联网）。
  //     和 xhIconUrl() 一样用 import.meta.url 推导，部署到托管版也不会丢 base。
  //   · 家族确实没有（34 枚：3D 专属物件 / 模型格式 / 第三方品牌）→ 1x1 透明图，
  //     按用户要求「先空着」，位置留白但按钮和点击行为不变，绝不硬凑语义不符的图。
  //   · 非图标资源（fonts/、xh_logo.svg 等）不匹配本正则，原样走后端 asset 路由。
  // 这层是纯显示层替换：不改画板功能、不改工作流 json、不动任何版本号。
  const m = /^icons\/(ui|layers|note|3D)\/([^/]+)\.svg$/.exec(rel);
  if (m) {
    const fam = XH_PAINT_ICON_MAP[m[1]]?.[m[2]];
    if (typeof fam === "string" && fam) {
      return new URL(fam + ".svg", XH_FAM_ICON_BASE).href;
    }
    return XH_BLANK_ICON;
  }

  return pixApiUrl("/xh/paint/api/asset?path=" + encodeURIComponent(rel));
}
