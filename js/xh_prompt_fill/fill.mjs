// 提示词填空 XiaoHei · 确定性随机填充（JS 版，仅用于编辑器实时预览）
// 🔴 必须与后端 nodes/prompt_fill/py/xh_prompt_fill.py 的 fill() 完全同口径：
//   sha256(seed|key) 前 8 位十六进制 → 整数 → % 词库长度。同一 seed 同一结果。
//   真正送出去的词以后端为准（云端不经过本地前端）；这里的预览只是给粉丝即时看到。
const SLOT_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

async function sha256hex(str) {
  const enc = new TextEncoder().encode(str);
  if (globalThis.crypto && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Node 桩环境没有 subtle：用 node:crypto（仅测试用，浏览器走上面）
  return null;
}

function fallbackHash(str) {
  // 与 sha256 不同但仅用于无 subtle 的测试桩；预览一致性以浏览器 subtle 为准。
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"));
}

export async function pickAsync(seed, key, options) {
  if (!options || !options.length) return null;
  // 🔴 无符号 32 位，与后端 fill() 的 (int(seed) & 0xFFFFFFFF) 完全同口径；
  //   用 | 0 会在 seed>2^31 时变负数 → 预览与运行结果不一致。
  const sd = Number(seed) >>> 0;
  let hex = null;
  try { hex = await sha256hex(`${sd}|${key}`); } catch { hex = null; }
  if (!hex) hex = fallbackHash(`${sd}|${key}`);
  const idx = parseInt(hex.slice(0, 8), 16) % options.length;
  return options[idx];
}

export function normalizeConfig(raw) {
  // 节点前端 configOf() 交过来的是 fill_config 里的 JSON 字符串（首次为空时用 DEFAULT_CONFIG
  // 也是字符串）。不 parse 就会被下面的 typeof object 判断直接丢弃 → 编辑器三栏全空。
  if (typeof raw === "string" && raw.trim()) {
    try { raw = JSON.parse(raw); } catch { raw = {}; }
  }
  const cfg = raw && typeof raw === "object" ? raw : {};
  const slots = {};
  if (cfg.slots && typeof cfg.slots === "object") {
    for (const [key, s] of Object.entries(cfg.slots)) {
      if (!s || typeof s !== "object") continue;
      const opts = Array.isArray(s.options) ? s.options.filter((x) => typeof x === "string" && x !== "") : [];
      slots[key] = {
        options: opts,
        locked: !!s.locked,
        fixed: (typeof s.fixed === "string" || typeof s.fixed === "number") ? String(s.fixed) : "",
      };
    }
  }
  return {
    preset: typeof cfg.preset === "string" ? cfg.preset : "custom",
    prefix: typeof cfg.prefix === "string" ? cfg.prefix : "",
    template: (typeof cfg.template === "string" && cfg.template.trim()) ? cfg.template : "",
    slots,
  };
}

export async function fillPreview(config, seed) {
  const cfg = normalizeConfig(config);
  const picks = {};
  const body = await (async () => {
    let out = "";
    let last = 0;
    const re = new RegExp(SLOT_RE.source, "g");
    let m;
    while ((m = re.exec(cfg.template)) !== null) {
      out += cfg.template.slice(last, m.index);
      const key = m[1].trim();
      const slot = cfg.slots[key];
      let val;
      if (!slot) {
        val = m[0];
      } else if (slot.locked) {
        val = slot.fixed;
      } else {
        val = await pickAsync(seed, key, slot.options);
        if (val == null) val = slot.fixed.trim() ? slot.fixed : m[0];
      }
      picks[key] = val;
      out += val;
      last = m.index + m[0].length;
    }
    out += cfg.template.slice(last);
    return out;
  })();
  const prefix = (cfg.prefix || "").trim();
  return { text: prefix ? prefix + "\n\n" + body : body, picks };
}

// 从模板里抽出所有 {{空位}} 名（去重，保序），编辑器用它决定显示哪些词库行。
export function slotKeys(template) {
  const out = [];
  const re = new RegExp(SLOT_RE.source, "g");
  let m;
  while ((m = re.exec(template || "")) !== null) {
    const k = m[1].trim();
    if (k && out.indexOf(k) < 0) out.push(k);
  }
  return out;
}
