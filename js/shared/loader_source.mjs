// 小黑家族 · 取图唯一真相（标注 / 局部重绘裁剪 共用，别再各写各的）
//
// 铁律：一个「加载器」节点显示哪张图，只认它自己 image widget 里写的文件名。
//
// 为什么：node.imgs 这个预览缓存是按 node id 存的，而不同工作流的节点 id 会
// 重复（都从 1、2、3 开始编号）。切换工作流时 ComfyUI 会把上一个工作流那张图
// 按同一个 id 塞回缓存 —— 于是「切回来图变了」，变成了另一个工作流的图。
// 这就是 2026-11-20 实测的串图根因。
//
// 所以：凡是加载器，一律绕过缓存、按文件名重新拼 /view 地址。
// 这条判定以前在 inpaint 侧写了一半、sketch 侧完全没写，现在收敛到这一处。

/** 会「从磁盘加载一张图」的节点 class 名（core + 小黑自家）。 */
const LOADER_CLASSES = [
  "LoadImage",        // ComfyUI 核心加载图片
  "XHLoadImageMini",  // 小黑·轻量加载图片
  "XHLoadImage",      // 小黑·加载图片
];

/** src 是不是一个加载器节点。 */
export function isLoaderNode(src) {
  if (!src) return false;
  return LOADER_CLASSES.includes(src.comfyClass) || LOADER_CLASSES.includes(src.type);
}

/**
 * 从加载器的 image widget 解析出 { filename, subfolder, type }。
 * 不是加载器、或没写文件名 -> null。
 * 兼容三种写法：name.png / sub/name.png / clipspace/x.png [input]（粘贴产生）。
 */
export function loaderImagePart(src) {
  if (!isLoaderNode(src)) return null;
  const w = (src.widgets || []).find((x) => x && x.name === "image");
  if (!w || typeof w.value !== "string" || !w.value.trim()) return null;
  let v = w.value;
  let type = "input";
  const m = v.match(/\s*\[(input|output|temp)\]\s*$/i);
  if (m) { type = m[1].toLowerCase(); v = v.slice(0, m.index); }
  v = v.replace(/\\/g, "/").trim();
  const i = v.lastIndexOf("/");
  return {
    filename: i >= 0 ? v.slice(i + 1) : v,
    subfolder: i >= 0 ? v.slice(0, i) : "",
    type,
  };
}
