// XiaoHei-标签提示词 · 标签库存储层
// 1:1 学 ComfyUI-Pixaroma / js/prompt/library.mjs（MIT）：
//   整库 = { version, categories, listCats, tags:[{name,cat,text,kind?}] }，
//   以「一个 JSON 字符串」存进一个未注册的 ComfyUI 设置项。
//   三个后果（原版注释里写死的）：① 不在插件目录 ⇒ 更新插件不丢；
//   ② 不写进工作流 ⇒ 分享工作流不泄露自己的提示词；③ 未注册 setting 也能持久。
// 有意的一处扩展：标签名允许中文（原版 NAME_RE 只认 ASCII，
//   因为它的 token 语法是 ASCII）。咱们的 expand.mjs 同步改成了 Unicode。
import { app } from "../../../scripts/app.js";

export const LIBRARY_SETTING = "XH.Tag.Library";
export const TEXT_BUCKET = "文字";
export const LIST_BUCKET = "清单";
const RESERVED = new Set([TEXT_BUCKET, LIST_BUCKET, "未分类"]);
const NAME_RE = /[^\p{L}\p{N}_\-]/gu;
const lc = (s) => String(s == null ? "" : s).toLowerCase();

// 只在用户第一次打开时播种一次，之后立刻写进设置，全部可改可删。
const SEED = {
  version: 1,
  categories: ["风格", "光线", "机位", "主体"],
  listCats: ["主体"],
  tags: [
    { name: "动物", cat: "主体", kind: "list", text: "一只红狐狸\n一只雪豹\n一只谷仓猫头鹰\n一尾锦鲤" },
    { name: "油画风", cat: "风格", text: "油画、厚涂笔触、伦勃朗光、画布纹理、美术馆级质感" },
    { name: "水彩", cat: "风格", text: "水彩晕染、柔和渗色边缘、纸张纹理、清淡颜料" },
    { name: "赛博朋克", cat: "风格", text: "赛博朋克城市、霓虹招牌、雨后街道、体积雾、银翼杀手氛围" },
    { name: "黄金时刻", cat: "光线", text: "黄金时刻、低角度暖阳、长而柔和的影子、电影感轮廓光" },
    { name: "人像", cat: "机位", text: "半身人像、浅景深、85mm 镜头、柔和棚拍光" },
  ],
};

let _data = null;
let _persistTimer = null;
const _subs = new Set();

function settingsApi() {
  const s = app.ui?.settings;
  return s && typeof s.getSettingValue === "function" ? s : null;
}
function asName(v) {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  return typeof v === "string" ? v.trim() : "";
}
export function cleanName(n) {
  return asName(n).replace(NAME_RE, "");
}

// 任何读进来的东西都规整成同一形状：去重、补分类、把站错队的标签踢回桶里。
function normalize(raw) {
  const out = { version: 1, categories: [], listCats: [], tags: [] };
  const src = raw && typeof raw === "object" ? raw : {};
  const seenCat = new Set();
  const addCat = (c) => {
    const name = asName(c);
    if (!name || RESERVED.has(name) || seenCat.has(lc(name))) return;
    seenCat.add(lc(name));
    out.categories.push(name);
  };
  for (const c of (Array.isArray(src.categories) ? src.categories : [])) addCat(c);
  const listKeys = new Set();
  for (const c of (Array.isArray(src.listCats) ? src.listCats : [])) {
    const name = asName(c);
    if (!name || RESERVED.has(name)) continue;
    listKeys.add(lc(name));
    addCat(name);
  }
  const seenTag = new Set();
  for (const t of (Array.isArray(src.tags) ? src.tags : [])) {
    if (!t) continue;
    const name = cleanName(t.name);
    if (!name || seenTag.has(lc(name))) continue;
    seenTag.add(lc(name));
    let cat = asName(t.cat);
    let kind = t.kind === "list" ? "list" : "text";
    if (RESERVED.has(cat)) {
      if (cat === LIST_BUCKET) kind = "list";
      cat = "";
    }
    const rec = { name, cat, text: typeof t.text === "string" ? t.text : "" };
    if (kind === "list") rec.kind = "list";
    out.tags.push(rec);
  }
  const catByKey = new Map(out.categories.map((c) => [lc(c), c]));
  for (const t of out.tags) {
    if (!t.cat) continue;
    const canon = catByKey.get(lc(t.cat));
    if (canon) t.cat = canon;
    else { out.categories.push(t.cat); catByKey.set(lc(t.cat), t.cat); seenCat.add(lc(t.cat)); }
  }
  // 一个分类只属于一侧；标签的 kind 永远赢，绝不自作主张把清单改成文字。
  const byCat = new Map();
  for (const t of out.tags) {
    if (!t.cat) continue;
    const k = lc(t.cat);
    if (byCat.has(k)) byCat.get(k).push(t); else byCat.set(k, [t]);
  }
  if (!Array.isArray(src.listCats)) {
    for (const c of out.categories) {
      if (listKeys.has(lc(c))) continue;
      const inCat = byCat.get(lc(c));
      if (inCat && inCat.length && inCat.every((t) => t.kind === "list")) listKeys.add(lc(c));
    }
  }
  for (const t of out.tags) {
    if (!t.cat) continue;
    const side = listKeys.has(lc(t.cat)) ? "list" : "text";
    if (side !== (t.kind === "list" ? "list" : "text")) t.cat = "";
  }
  out.listCats = out.categories.filter((c) => listKeys.has(lc(c)));
  return out;
}

function persist(data) {
  const s = settingsApi();
  if (!s) return;
  const json = JSON.stringify(data);
  try {
    if (typeof s.setSettingValueAsync === "function") s.setSettingValueAsync(LIBRARY_SETTING, json);
    else if (typeof s.setSettingValue === "function") s.setSettingValue(LIBRARY_SETTING, json);
  } catch { /* 写失败也先让本次会话可用 */ }
}

export function getLibrary() {
  if (_data) return _data;
  const s = settingsApi();
  if (!s) return normalize(SEED);
  const raw = s.getSettingValue(LIBRARY_SETTING);
  if (raw == null) {
    _data = normalize(SEED);
    persist(_data);
    return _data;
  }
  try { _data = normalize(typeof raw === "string" ? JSON.parse(raw) : raw); }
  catch { _data = normalize({}); }
  return _data;
}
// 多标签页共用同一份设置，打开编辑器前必须重读，否则会把另一个页面的改动盖掉。
export function reloadLibrary() { _data = null; return getLibrary(); }

export function getTags() { return getLibrary().tags; }
export function getCategories(side) {
  const d = getLibrary();
  const out = d.categories.filter((c) => !side || sideOfCat(c, d) === side);
  if (side !== "list" && d.tags.some((t) => !t.cat && !isListTag(t))) out.push(TEXT_BUCKET);
  if (side !== "text" && d.tags.some((t) => !t.cat && isListTag(t))) out.push(LIST_BUCKET);
  return out;
}
export function tagsInCat(name, data) {
  const d = data || getLibrary();
  return d.tags.filter((t) => lc(catOf(t)) === lc(name));
}
export function isListTag(t) { return !!t && t.kind === "list"; }
export function tagLines(text) {
  if (typeof text !== "string") return [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) { const s = raw.trim(); if (s) out.push(s); }
  return out;
}
export function catOf(t) { return (t && t.cat) || (isListTag(t) ? LIST_BUCKET : TEXT_BUCKET); }
export function sideOfCat(name, data) {
  if (lc(name) === lc(LIST_BUCKET)) return "list";
  if (lc(name) === lc(TEXT_BUCKET)) return "text";
  const d = data || getLibrary();
  return (d.listCats || []).some((c) => lc(c) === lc(name)) ? "list" : "text";
}
export function findTag(name) {
  const k = lc(name);
  for (const t of getTags()) if (lc(t.name) === k) return t;
  return null;
}
export function uniqueTagName(base, ignore) {
  let n = cleanName(base) || "标签";
  const taken = (x) => getTags().some((t) => t !== ignore && lc(t.name) === lc(x));
  if (!taken(n)) return n;
  let i = 2;
  while (taken(n + "-" + i)) i++;
  return n + "-" + i;
}

function fanout() { for (const fn of _subs) { try { fn(_data); } catch {} } }

// 整库替换（新建 / 删除 / 导入 / 改分类）立即写盘。
export function setLibrary(data) {
  _data = normalize(data);
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  persist(_data);
  fanout();
  return _data;
}
// 边打字边改：内存 + 通知立刻生效，写盘防抖，别把 comfy.settings.json 刷爆。
export function commitLibrary(data) {
  _data = normalize(data);
  fanout();
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => { persist(_data); _persistTimer = null; }, 350);
  return _data;
}
export function flushLibrary() {
  if (!_persistTimer) return;
  clearTimeout(_persistTimer); _persistTimer = null;
  if (_data) persist(_data);
}
export function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); }

export function exportLibraryJSON() { return JSON.stringify(getLibrary(), null, 2); }

// 导入：接受整库 / 裸 tags 数组 / {tags:[...]}；返回 { data, conflicts, error }。
export function parseImport(jsonStr) {
  let raw;
  try { raw = JSON.parse(jsonStr); } catch { return { error: "这个文件不是有效的 JSON。" }; }
  if (Array.isArray(raw)) raw = { tags: raw };
  else if (raw && !Array.isArray(raw.tags)) raw = { categories: raw.categories, listCats: raw.listCats, tags: raw.tags || raw.library };
  const data = normalize(raw);
  if (!data.tags.length && !data.categories.length) return { error: "文件里没有可用的标签。" };
  const have = new Set(getTags().map((t) => lc(t.name)));
  const conflicts = data.tags.filter((t) => have.has(lc(t.name))).map((t) => t.name);
  return { data, conflicts };
}
// mode: "both" 保留双方（重名加 -2）/ "replace" 覆盖 / "skip" 跳过。
export function applyImport(parsed, mode) {
  const cur = getLibrary();
  const tags = cur.tags.map((t) => ({ ...t }));
  const byKey = new Map(tags.map((t) => [lc(t.name), t]));
  const toAdd = [];
  for (const inc of parsed.data.tags) {
    const key = lc(inc.name);
    if (!byKey.has(key)) { const t = { ...inc }; toAdd.push(t); byKey.set(key, t); }
    else if (mode === "replace") {
      const t = byKey.get(key);
      t.text = inc.text;
      if (inc.kind === "list") t.kind = "list"; else delete t.kind;
    } else if (mode === "both") {
      let n = inc.name, i = 2;
      while (byKey.has(lc(n))) n = inc.name + "-" + i++;
      const t = { ...inc, name: n };
      toAdd.push(t); byKey.set(lc(n), t);
    }
  }
  const next = { version: 1, categories: [...cur.categories], listCats: [...cur.listCats], tags: toAdd.concat(tags) };
  const catHave = new Set(next.categories.map(lc));
  for (const c of parsed.data.categories) if (c && !catHave.has(lc(c))) { catHave.add(lc(c)); next.categories.push(c); }
  const listHave = new Set(next.listCats.map(lc));
  for (const c of parsed.data.listCats) if (c && !listHave.has(lc(c)) && !cur.categories.some((x) => lc(x) === lc(c))) { listHave.add(lc(c)); next.listCats.push(c); }
  setLibrary(next);
  return { added: toAdd.length };
}
