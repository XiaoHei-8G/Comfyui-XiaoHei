// XiaoHei-标签提示词 · @名字 / *分类 / #清单 的展开
// 1:1 学 ComfyUI-Pixaroma / js/prompt/expand.mjs（MIT）：纯函数、不自带随机。
//   随机由调用方以 resolveWild / resolveList 回调注入：
//   预览时给稳定占位、真正点「运行」时给真随机 ⇒ 两处永远不会对不上。
// 有意的一处扩展：token 名字允许中文（\p{L}\p{N}），与 library.mjs 的 NAME_RE 一致。
import { getTags, tagLines, isListTag, catOf, getCategories } from "./library.mjs";

const TOKEN_RE = /([@*#])([\p{L}\p{N}_\-]+)/gu;
const KIND_BY_SYM = { "@": "tag", "*": "wild", "#": "list" };

// 记号只在开头、非单词字符之后，或紧接同类记号时才算数。
// 这样 user@name 的邮箱、2*2 的算式不会被误展开。
export function scanTokens(text) {
  const out = [];
  if (typeof text !== "string" || !/[@*#]/.test(text)) return out;
  TOKEN_RE.lastIndex = 0;
  let m, lastEnd = -1, lastKind = null;
  while ((m = TOKEN_RE.exec(text))) {
    const at = m.index;
    const kind = KIND_BY_SYM[m[1]];
    const prev = at > 0 ? text[at - 1] : "";
    const chains = at === lastEnd && kind === lastKind;
    if (!prev || !/[\p{L}\p{N}\p{M}_]/u.test(prev) || chains) {
      out.push({ kind, sym: m[1], name: m[2], start: at, end: at + m[0].length, raw: m[0] });
      lastEnd = at + m[0].length;
      lastKind = kind;
    }
  }
  return out;
}
export function hasTokens(text) { return scanTokens(text).length > 0; }

/** 展开。返回 { out, spans, known[], unknown[] }；未知记号原样保留（不打脸也不报错）。 */
export function expandAll(text, opts = {}) {
  const { tags, resolveWild, resolveList } = opts;
  if (typeof text !== "string" || !/[@*#]/.test(text)) {
    return { out: typeof text === "string" ? text : "", spans: [], known: [], unknown: [] };
  }
  const list = tags || getTags();
  const map = new Map(list.map((t) => [t.name.toLowerCase(), t.text]));
  const known = [], unknown = [], spans = [];
  let out = "", i = 0;
  for (const h of scanTokens(text)) {
    out += text.slice(i, h.start);
    const at = out.length;
    let hit = false;
    if (h.kind === "tag") {
      const v = map.get(h.name.toLowerCase());
      if (v != null) { out += v; known.push(h.name); hit = true; }
      else { out += h.raw; unknown.push(h.name); }
    } else {
      const rep = h.kind === "wild"
        ? (typeof resolveWild === "function" ? resolveWild(h.name) : null)
        : (typeof resolveList === "function" ? resolveList(h.name) : null);
      if (rep != null && rep !== "") { out += rep; known.push(h.name); hit = true; }
      else { out += h.raw; unknown.push(h.name); }
    }
    spans.push({ start: at, end: out.length, kind: h.kind, name: h.name, known: hit });
    i = h.end;
  }
  out += text.slice(i);
  return { out, spans, known, unknown };
}

/** 「显示展开预览」用：随机项给稳定占位，不真抽，免得每敲一个字都在变。 */
export function previewExpand(text) {
  return expandAll(text, {
    resolveWild: (n) => `[随机挑一个：${n}]`,
    resolveList: (n) => { const t = getTags().find((x) => x.name.toLowerCase() === n.toLowerCase()); return t ? `[每次抽一行：${n} · 共 ${tagLines(t.text).length} 行]` : null; },
  });
}

/** 真正排队时用：每次运行现抽，@ 仍然是确定性替换。 */
export function runExpand(text) {
  const pick = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  return expandAll(text, {
    resolveWild: (n) => {
      const pool = getTags().filter((t) => catOf(t).toLowerCase() === n.toLowerCase());
      const hit = pick(pool);
      if (!hit) return null;
      return isListTag(hit) ? pick(tagLines(hit.text)) : hit.text;
    },
    resolveList: (n) => {
      const t = getTags().find((x) => x.name.toLowerCase() === n.toLowerCase());
      return t ? pick(tagLines(t.text)) : null;
    },
  });
}

/** 补全用：某个符号下有哪些候选（@ 只给文字侧、# 只给清单侧、* 给分类）。 */
export function candidatesFor(sym) {
  if (sym === "*") return getCategories().map((c) => ({ name: c, text: "这个分类里的标签随机挑一个" }));
  const side = sym === "#" ? "list" : "text";
  return getTags().filter((t) => (isListTag(t) ? "list" : "text") === side)
    .map((t) => ({ name: t.name, text: isListTag(t) ? tagLines(t.text).join(" / ") : t.text, cat: catOf(t) }));
}
