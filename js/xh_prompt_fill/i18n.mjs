// 提示词填空 XiaoHei · 编辑器双语表（所有可见文案走 T()）
import { currentLang } from "../xh_ui_kit.js";

const EN = {
  "模板": "Template",
  "词库": "Word banks",
  "预览": "Preview",
  "提示词填空 XiaoHei": "Prompt Fill XiaoHei",
  "打开编辑器": "Open editor",
  "预设": "Preset",
  "空位": "Slots",
  "种子": "Seed",
  "换一批词（改种子）": "Reroll (change seed)",
  "复制结果": "Copy result",
  "复制": "Copy",
  "自定义": "Custom",
  "模板说明：用 {{空位}} 挖空，左边改骨架，中间给每个空位配候选词。": "Template: use {{slot}} placeholders. Edit the skeleton here, set candidate words per slot in the middle.",
  "空位": "Slots",
  "每个空位可加词/删词、上锁固定、或填固定值。上锁后不参与随机。": "Per slot: add/remove words, lock it, or set a fixed value. Locked slots skip randomization.",
  "加词": "Add word",
  "加一个空位": "Add a slot",
  "固定值": "Fixed value",
  "上锁": "Lock",
  "随机": "Random",
  "自由": "Free",
  "删": "Del",
  "候选词": "Candidates",
  "这个词库为空，运行时会保留 {{空位}} 原样。": "This bank is empty; the {{slot}} stays literal at runtime.",
  "填好的提示词（随种子变化）": "Filled prompt (changes with seed)",
  "点「换一批词」或改节点上的种子，这里实时更新。真正送出去的以运行为准。": "Hit Reroll or change the node seed to update live. The runtime output is authoritative.",
  "完成": "Done",
  "恢复本预设默认": "Reset to preset default",
  "删除空位": "Remove slot",
  "空位名": "Slot name",
  "提示：H3 视频词库逐字取自 MiniMax 官方 base-en.txt。": "Note: H3 Video word banks are verbatim from MiniMax official base-en.txt.",
  "模板里引用了未配置的空位：": "Template references unconfigured slots: ",
  "（运行时会原样保留，去中间栏给它们配词库）": "(they stay literal at runtime — configure them in the Word banks column)",
};

export function T(zh) {
  return (currentLang() || "zh") === "zh" ? zh : (EN[zh] || zh);
}
