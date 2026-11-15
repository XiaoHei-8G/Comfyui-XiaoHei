// XiaoHei-提示词批量 · 状态与解析
// 1:1 复刻 ComfyUI-Pixaroma / js/prompt_pack/core.mjs（MIT, Copyright (c) 2026 pixaroma）。
// 只改三类接线标识：状态属性名 xhPackState / class_type XH_PromptPack / import 路径；
// 分隔正则、解析、状态归一化、参与队列的判定逻辑逐条照抄，一字未改语义。
//
// 状态存在 node.properties.xhPackState，形状：
//   { version:1, mode:"paragraph"|"line"|"rule", text:"...", activePrompt:"" }
// LiteGraph 会把 node.properties 原生写进工作流 JSON，存盘读档自动完成。
// activePrompt 是临时的：由 index.js 的 queuePrompt 包装在每次提交前改写，
// graphToPrompt 钩子再把它打包进隐藏输入 XHPromptPackState。

import { feedsOnlyInactiveSwitch } from "../shared/queue_drivers.mjs";

export const STATE_PROP = "xhPackState";
export const MODE_PARAGRAPH = "paragraph";
export const MODE_LINE = "line";
export const MODE_RULE = "rule";

// 三种分隔方式与 Save Text 的三档分隔符一一对应，paste 进来直接能跑。
// 故意没有「逗号」：一条正常提示词里全是逗号，按逗号切会把一条切碎。
//   paragraph -> "\n\n"   line -> "\n"   rule -> "\n---\n"
// SPLITTERS 用 null 原型 + instanceof RegExp 校验，防 "constructor"/"toString"
// 这类 id 从原型链上捞出一个函数（原版踩过）。
const SPLITTERS = Object.assign(Object.create(null), {
  [MODE_PARAGRAPH]: /\n\s*\n+/,
  [MODE_LINE]: /\r?\n/,
  [MODE_RULE]: /\r?\n[ \t]*-{3,}[ \t]*(?:\r?\n|$)/,
});

// 药丸按钮、计数、队列循环全从这张表驱动，加第四档只需加一行。
export const MODES = [
  {
    id: MODE_PARAGRAPH,
    label: "空行",
    title: "空行：两条提示词之间空一行。适合一段很长、自己带换行的提示词。",
  },
  {
    id: MODE_LINE,
    label: "每行",
    title: "每行：一行就是一条提示词。适合一行一条的短清单。",
  },
  {
    id: MODE_RULE,
    label: "--- 线",
    title: "--- 线：用单独一行 --- 隔开。提示词自己内部就有空行时用这个。",
  },
];

export function isMode(mode) {
  return typeof mode === "string" && SPLITTERS[mode] instanceof RegExp;
}

function splitterFor(mode) {
  const s = SPLITTERS[mode];
  return s instanceof RegExp ? s : SPLITTERS[MODE_PARAGRAPH];
}

export function defaultState() {
  return {
    version: 1,
    mode: MODE_PARAGRAPH,
    text: "",
    activePrompt: "",
  };
}

export function readState(node) {
  const s = node.properties?.[STATE_PROP];
  if (!s || typeof s !== "object") return defaultState();
  if (!isMode(s.mode)) s.mode = MODE_PARAGRAPH;
  if (typeof s.text !== "string") s.text = "";
  if (typeof s.activePrompt !== "string") s.activePrompt = "";
  s.version = 1;
  return s;
}

export function writeState(node, state) {
  node.properties = node.properties || {};
  node.properties[STATE_PROP] = state;
}

export function setMode(node, mode) {
  if (!isMode(mode)) return;
  const state = readState(node);
  state.mode = mode;
  writeState(node, state);
}

export function setText(node, text) {
  const state = readState(node);
  state.text = String(text || "");
  writeState(node, state);
}

// 全节点唯一的拆分函数：药丸计数、计数器、队列循环都走这里，
// 保证「框里显示几条」和「实际排队几次」永远一致。
export function parsePrompts(text, mode) {
  if (typeof text !== "string" || !text) return [];
  return text
    .split(splitterFor(mode))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function countPrompts(node) {
  const state = readState(node);
  return parsePrompts(state.text, state.mode).length;
}

export function restoreFromProperties(node) {
  writeState(node, readState(node));
}

// 节点必须真的参与这次运行才允许接管「运行」：
// 被静音(2)/绕过(4)、或输出口没接线的空节点，不能挡住别的工作流。
function isPackNodeActive(node) {
  return node.mode !== 2 && node.mode !== 4;
}

function isPackNodeConnected(node) {
  const outs = node.outputs || [];
  for (const o of outs) {
    if (o && Array.isArray(o.links) && o.links.length > 0) return true;
  }
  return false;
}

function isPackNodeDriving(node) {
  if (!node) return false;
  const isClass = node.comfyClass === "XH_PromptPack" || node.type === "XH_PromptPack";
  // 只接进一个当前没在导通的 Switch 时，这一轮它的提示词到不了任何输出，
  // 不能让它也来排队（否则多个 driver 互相乘次数）。
  return isClass && isPackNodeActive(node) && isPackNodeConnected(node)
    && !feedsOnlyInactiveSwitch(node);
}

// 找第一个真正参与运行的节点：先顶层，再递归子图。
export function findFirstPromptPackNode(app) {
  const graph = app.graph;
  if (!graph) return null;
  const top = graph._nodes || graph.nodes || [];
  for (const n of top) {
    if (isPackNodeDriving(n)) return n;
  }
  function walk(nodes) {
    for (const n of nodes || []) {
      if (isPackNodeDriving(n)) return n;
      const sub = n?.subgraph?._nodes || n?.subgraph?.nodes;
      if (sub) {
        const hit = walk(sub);
        if (hit) return hit;
      }
    }
    return null;
  }
  return walk(top);
}

export const CLASS = "XH_PromptPack";
export const STATE_INPUT = "XHPromptPackState";
