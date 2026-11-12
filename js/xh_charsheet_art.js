// 小黑·全能角色设定表 · 视图缩略图（原创矢量剪影，当前未启用）
//
// 重要版权说明：
//   原版 H3-Character-Sheet-Designer 的预览 PNG（mannequin-atlas.png 等）**不在其 MIT 授权范围内**
//   （见原包 LICENSE / NOTICE.md：图片素材 explicitly outside the MIT grant，再分发前须确认权利）。
//   因此本模块**不复用、不加载任何原版美术素材**，改为绘制原创的矢量剪影缩略图——
//   每个视图一个可辨识的灰色剪影（正面头 / 侧脸 / 全身 / 服装 / 手 / 脚），
//   既满足「每张视图看得见长啥样」的可视化诉求，又 100% 原创、可随包安全分发。
//
// 设计要点：
//   · 纯 SVG 绘制，零外部素材、零网络请求、素材缺失不可能发生；
//   · createArtwork(view, idPrefix, {mirror}) 接口与原版保持一致，前端面板无需改动；
//   · 按 view id 区分形状，head / body / clothing / hands / feet 各有专属轮廓。

const NS = "http://www.w3.org/2000/svg";
const FILL = "#9a9a9a";
const LINE = "#3a3a3a";

// 按视图 id 返回对应的剪影 SVG（60×60 视图框）
function silhouetteSVG(view) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 60 60");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = "width:100%;height:100%;display:block;";

  let body = "";
  if (view === "face_front") {
    body =
      `<ellipse cx="30" cy="23" rx="13" ry="16" fill="${FILL}"/>` +
      `<rect x="24" y="37" width="12" height="11" rx="3" fill="${FILL}"/>`;
  } else if (view === "face_back") {
    body =
      `<ellipse cx="30" cy="23" rx="13" ry="16" fill="${FILL}"/>` +
      `<line x1="30" y1="9" x2="30" y2="37" stroke="${LINE}" stroke-width="1.6"/>`;
  } else if (view === "face_left") {
    body =
      `<path d="M31 8 q-14 3 -14 17 q0 11 9 15 q-7 2 -7 7 l24 0 q1 -16 10 -22 q-6 -11 -22 -17 z" fill="${FILL}"/>`;
  } else if (view === "face_right") {
    body =
      `<path d="M29 8 q14 3 14 17 q0 11 -9 15 q7 2 7 7 l-24 0 q-1 -16 -10 -22 q6 -11 22 -17 z" fill="${FILL}"/>`;
  } else if (view === "face_3q_left" || view === "face_3q_right") {
    const flip = view === "face_3q_right";
    const cx = flip ? 26 : 34;
    body =
      `<ellipse cx="${cx}" cy="23" rx="12" ry="16" fill="${FILL}"/>` +
      `<ellipse cx="${60 - cx}" cy="24" rx="6" ry="13" fill="${FILL}" opacity="0.82"/>`;
  } else if (view === "body_front" || view === "body_back") {
    body =
      `<circle cx="30" cy="13" r="8" fill="${FILL}"/>` +
      `<rect x="22" y="21" width="16" height="22" rx="5" fill="${FILL}"/>` +
      `<rect x="23" y="43" width="6" height="15" rx="2" fill="${FILL}"/>` +
      `<rect x="31" y="43" width="6" height="15" rx="2" fill="${FILL}"/>`;
    if (view === "body_back") {
      body += `<line x1="30" y1="6" x2="30" y2="20" stroke="${LINE}" stroke-width="1.6"/>`;
    }
  } else if (view === "body_left") {
    body =
      `<circle cx="30" cy="13" r="8" fill="${FILL}"/>` +
      `<path d="M30 21 q-11 1 -11 13 l0 15 q0 9 7 9 l4 0 q-4 -7 -4 -15 l0 -12 q0 -8 4 -10 z" fill="${FILL}"/>`;
  } else if (view === "body_right") {
    body =
      `<circle cx="30" cy="13" r="8" fill="${FILL}"/>` +
      `<path d="M30 21 q11 1 11 13 l0 15 q0 9 -7 9 l-4 0 q4 -7 4 -15 l0 -12 q0 -8 -4 -10 z" fill="${FILL}"/>`;
  } else if (view === "clothing_front" || view === "clothing_back") {
    body =
      `<path d="M20 16 l8 -6 l12 0 l8 6 l-4 8 l-4 -3 l0 24 l-16 0 l0 -24 l-4 3 z" fill="${FILL}"/>`;
    if (view === "clothing_back") {
      body += `<line x1="30" y1="12" x2="30" y2="20" stroke="${LINE}" stroke-width="1.6"/>`;
    }
  } else if (view === "hands") {
    body =
      `<path d="M17 22 q-5 0 -5 7 q0 11 7 13 q4 1 5 -3 l0 -13 q0 -4 -3 -4 z" fill="${FILL}"/>` +
      `<path d="M43 22 q5 0 5 7 q0 11 -7 13 q-4 1 -5 -3 l0 -13 q0 -4 3 -4 z" fill="${FILL}"/>`;
  } else if (view === "feet") {
    body =
      `<path d="M15 33 q-7 0 -7 9 q0 7 9 7 l11 0 q2 0 2 -4 l0 -12 z" fill="${FILL}"/>` +
      `<path d="M45 33 q7 0 7 9 q0 7 -9 7 l-11 0 q-2 0 -2 -4 l0 -12 z" fill="${FILL}"/>`;
  } else {
    // 兜底：通用头肩剪影
    body =
      `<circle cx="30" cy="21" r="10" fill="${FILL}"/>` +
      `<path d="M13 54 Q13 33 30 33 Q47 33 47 54 Z" fill="${FILL}"/>`;
  }

  svg.innerHTML = `<rect x="0" y="0" width="60" height="60" rx="6" fill="#222"/>` + body;
  return svg;
}

export function createArtwork(view, idPrefix, { mirror = false } = {}) {
  const frame = document.createElement("span");
  frame.className = "xh-cs-artwork";
  if (mirror) frame.style.transform = "scaleX(-1)";
  frame.dataset.artwork = view;
  frame.style.cssText = "display:block;width:100%;height:100%;overflow:hidden;position:relative;";
  frame.setAttribute("aria-hidden", "true");
  frame.append(silhouetteSVG(view));
  return frame;
}
