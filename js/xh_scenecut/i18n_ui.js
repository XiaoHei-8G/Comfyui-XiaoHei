// 分镜节点：播放器 / 审阅器 / 弹窗的用户可见文案双语表。
// 中文界面一律中文；英文界面走原作者原文。语言切换由各播放器注册 onUiLang 重绘。
// ⚠ 只放"给人看的文案"；接线契约值、CSS 类名、事件名、文件名一律不进这里。
import { currentLang, onLangChanged } from "../xh_ui_kit.js";

const ZH = {
  loop: "循环", loopTip: "循环当前片段（L）",
  playAll: "连播", playAllTip: "每段播完自动进入下一段（P）",
  prevFrameTip: "上一帧（,）", nextFrameTip: "下一帧（.）",
  sceneNum: "片段", showingAll: "未选择，显示全部", selectedShort: "已选",
  rowScene: "片段", rowFrames: "帧", rowTime: "时间", rowLength: "时长", rowDetector: "检测器",
  of: "／",
  validation: "复核：", merged: "已合并", kept: "已保留",
  similarity: "相似度", threshold: "阈值", abruptness: "突变度",
  adjacentFrames: "相邻帧", motion: "运动", flash: "闪光",
  contains: "包含：", transition: "转场",
  relStart: "起点", relAfterTransition: "转场之后",
  stageValidation: "复核", stageFlashSliver: "闪光碎片", stageTooShort: "太短",
  stageFragment: "碎片", stageTransition: "转场", stageSnap: "吸附",
  reasonKeepHard: "画面明显断裂", reasonKeepAdj: "相邻帧变化强烈",
  reasonMergeSame: "两侧是同一个镜头", reasonMergeSameSscd: "同一镜头（SSCD）",
  reasonKeepCutSscd: "不同镜头（SSCD）", reasonKeepFlashStrong: "闪光，但也是真切点",
  reasonMergeFlash: "相机闪光，不是切点", reasonKeepFlashLow: "闪光较弱，保留切点",
  reasonDefaultKeep: "保留：没有反对证据", reasonShortGuardKeep: "保留：紧邻极短镜头",
  reasonShortGuardMergeFlash: "合并：极短镜头旁的闪光", reasonKeepAfterTransition: "转场前是另一个场景",
  fixed: "已修正", byYouFrom: "由你从第", fixCut: "修正切点", joinNearest: "并入最近切点",
  pctSure: "% 把握是这一帧", byRefinement: "经精修从", frame: "帧",
  transitionsInside: "这个镜头内的转场：",
  exportScenes: "导出片段", closeEsc: "关闭（Esc）", sceneWord: "个片段",
  cancel: "取消", exportClips: "导出", clipsWord: "个片段",
  copyFolderPath: "复制文件夹路径", close: "关闭",
  allFiles: "全部文件",
  includeSound: "包含声音", largeFilesEdit: "文件较大，适合剪辑。",
  keepBackground: "让它在后台继续运行",
  cardClick: "单击：查看 · 双击：播放", cardCtrl: "Ctrl+单击：选中/取消 · Shift+单击：选择范围",
  exportDone: "导出完成：", inFolder: "位于",
  folderPath: "文件夹路径", filterFiles: "筛选文件", parentFolder: "上一级文件夹（Backspace）", up: "上一级",
  gridView: "缩略图", listView: "列表", gridTip: "切换成缩略图网格", listTip: "切换成列表",
  browse: "浏览视频", browseTip: "从本机选择视频文件",
  selectFile: "选择文件",
  loading: "正在读取视频…",
  previewFail: "这个文件无法预览",
  withAudio: "含音频",
  fpsUnit: "帧/秒",
  previewEmpty: "选一个视频，这里就能预览。",
  previewEmpty2: "选好视频，这里能看画面",
  previewUnplayable: "这个视频无法在浏览器里预览。",
  previewMaking: "浏览器播不了这个文件，正在生成小尺寸预览副本……",
};

const EN = {
  loop: "loop", loopTip: "Loop the current scene (L)",
  playAll: "play all", playAllTip: "Auto-advance to the next scene (P)",
  prevFrameTip: "Previous frame (,)", nextFrameTip: "Next frame (.)",
  sceneNum: "Scene", showingAll: "none selected, showing all", selectedShort: "selected",
  rowScene: "scene", rowFrames: "frames", rowTime: "time", rowLength: "length", rowDetector: "detector",
  of: "of",
  validation: "Validation:", merged: "merged", kept: "kept",
  similarity: "similarity", threshold: "threshold", abruptness: "abruptness",
  adjacentFrames: "adjacent frames", motion: "motion", flash: "flash",
  contains: "Contains:", transition: "transition",
  relStart: "start", relAfterTransition: "after transition",
  stageValidation: "validation", stageFlashSliver: "flash sliver", stageTooShort: "too short",
  stageFragment: "fragment", stageTransition: "transition", stageSnap: "snap",
  reasonKeepHard: "clear visual break", reasonKeepAdj: "strong change between adjacent frames",
  reasonMergeSame: "same shot on both sides", reasonMergeSameSscd: "same shot (SSCD)",
  reasonKeepCutSscd: "different shots (SSCD)", reasonKeepFlashStrong: "闪光，但也是真切点",
  reasonMergeFlash: "相机闪光，不是切点", reasonKeepFlashLow: "weak flash, kept",
  reasonDefaultKeep: "保留：没有反对证据", reasonShortGuardKeep: "kept: next to a very short shot",
  reasonShortGuardMergeFlash: "flash beside a very short shot", reasonKeepAfterTransition: "转场前是另一个场景",
  fixed: "fixed", byYouFrom: "by you, from frame", fixCut: "fix cut", joinNearest: "join to nearest cut",
  pctSure: "% sure of the frame", byRefinement: "from frame", frame: "frame",
  transitionsInside: "Transitions inside this shot:",
  exportScenes: "Export scenes", closeEsc: "Close (Esc)", sceneWord: "scene",
  cancel: "Cancel", exportClips: "Export", clipsWord: "clip",
  copyFolderPath: "Copy folder path", close: "Close",
  allFiles: "All files",
  includeSound: "Include sound", largeFilesEdit: "Large files, for editing.",
  keepBackground: "Keep running in background",
  cardClick: "Click: inspect · double-click: play", cardCtrl: "Ctrl+click: select/deselect · Shift+click: select a range",
  exportDone: "Export finished:", inFolder: "in",
  folderPath: "Folder path", filterFiles: "Filter", parentFolder: "Parent folder (Backspace)", up: "Up",
  gridView: "Thumbnails", listView: "List", gridTip: "Switch to thumbnail grid", listTip: "Switch to list view",
  browse: "Browse...", browseTip: "Choose a video file on this machine",
  selectFile: "Select",
  loading: "Loading...",
  previewFail: "Cannot preview this file.",
  withAudio: "audio",
  fpsUnit: "fps",
  previewEmpty: "Pick a video to preview here.",
  previewEmpty2: "Pick a video to preview here.",
  previewUnplayable: "This video cannot be previewed in the browser.",
  previewMaking: "The browser can't play this file; making a small preview copy...",
};

export function T(key) {
  const v = currentLang() === "en" ? (EN[key] ?? ZH[key]) : ZH[key];
  return v ?? key;
}

// 首次也立刻跑一次（initialDelay:0），保证从英文切成中文后已经打开的节点同步刷新。
export function onUiLang(handler, tag) {
  return onLangChanged(handler, { tag: tag || "xh-scenecut-ui", initialDelay: 0 });
}

// ── 路径默认值（双语）─────────────────────────────────────────────────
// 只用于「值恰好等于某个默认值」时跟随语言迁移；用户自己填的路径一律不动。
// 路径不是接线契约，改它不会断线；{视频名} 与 {video} 后端都认。
export const PATH_PRESETS = {
  report_prefix: {
    zh: "分镜报告/{视频名}/审阅",
    en: "scenecut/{video}/report",
    legacy: ["scenecut/(video)/report"],
  },
  filename_prefix: {
    zh: "分镜切片/{视频名}/片段",
    en: "scenecut/{video}/scenes",
    legacy: [],
  },
  path: {
    zh: "分镜切片/video/片段_00001",
    en: "scenecut/video/scenes_00001",
    legacy: [],
  },
};
