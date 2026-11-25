// 提示词填空 XiaoHei · 全屏三栏编辑器
// 左：模板（带 {{空位}}）  中：词库分组（纯点击加词/删词/上锁/固定值）  右：实时预览。
// 配色 1:1 官方 CSS 变量；图案走家族图标库；字体 var(--font-sans)；零自造色值。
import { xhIconHTML, currentLang } from "../xh_ui_kit.js";
import { T } from "./i18n.mjs";
import { PRESETS, getPreset, presetToConfig } from "./presets.mjs";
import { fillPreview, normalizeConfig, slotKeys } from "./fill.mjs";

const CSS_ID = "xh-pf-editor-css";
const CSS = `
.xhpf-ov{position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif)}
.xhpf-win{width:min(1180px,94vw);height:min(760px,92vh);display:flex;flex-direction:column;background:var(--background,#171718);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:10px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.xhpf-head{display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--secondary,#262729);border-bottom:1px solid var(--border,#494a50);flex:0 0 auto}
.xhpf-head h3{margin:0;font-size:14px;font-weight:600;flex:1}
.xhpf-head .xhpf-x{cursor:pointer;background:transparent;border:0;color:var(--foreground,#fff);width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px}
.xhpf-head .xhpf-x:hover{background:var(--xh-primary,#E8A33C);color:var(--background,#171718)}
.xhpf-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid var(--border,#494a50);flex:0 0 auto}
.xhpf-bar label{font-size:12px;opacity:.85}
.xhpf-sel,.xhpf-seed{background:var(--secondary,#262729);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:5px;padding:4px 8px;font-size:12px;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif)}
.xhpf-seed{width:110px;font-variant-numeric:tabular-nums}
.xhpf-btn{display:inline-flex;align-items:center;gap:5px;background:var(--secondary,#262729);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}
.xhpf-btn:hover{border-color:var(--xh-primary,#E8A33C)}
.xhpf-btn.primary{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);color:var(--background,#171718);font-weight:600}
.xhpf-cols{display:flex;flex:1 1 auto;min-height:0}
.xhpf-col{display:flex;flex-direction:column;min-width:0;min-height:0}
.xhpf-col.left{flex:1.05 1 0;border-right:1px solid var(--border,#494a50)}
.xhpf-col.mid{flex:1.15 1 0;border-right:1px solid var(--border,#494a50)}
.xhpf-col.right{flex:1 1 0}
.xhpf-ct{font-size:12px;font-weight:600;padding:9px 12px 5px;opacity:.9;flex:0 0 auto}
.xhpf-hint{font-size:11px;opacity:.55;padding:0 12px 7px;line-height:1.5;flex:0 0 auto}
.xhpf-ta{flex:1 1 auto;min-height:0;margin:0 12px 12px;background:var(--background,#171718);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:6px;padding:9px 10px;font:12px/1.6 var(--font-sans,ui-sans-serif,system-ui,sans-serif);resize:none;white-space:pre-wrap;overflow:auto}
.xhpf-ta:focus{outline:none;border-color:var(--xh-primary,#E8A33C)}
.xhpf-slots{flex:1 1 auto;min-height:0;overflow:auto;padding:0 12px 12px}
.xhpf-slot{border:1px solid var(--border,#494a50);border-radius:7px;padding:8px;margin-bottom:8px;background:var(--secondary,#262729)}
.xhpf-slot-h{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.xhpf-slot-h b{font-size:12px;font-weight:600}
.xhpf-chip{font-size:10px;padding:1px 6px;border-radius:9px;border:1px solid var(--border,#494a50);opacity:.75}
.xhpf-chip.lock{background:var(--xh-primary,#E8A33C);color:var(--background,#171718);border-color:var(--xh-primary,#E8A33C);opacity:1}
.xhpf-slot-h .sp{flex:1}
.xhpf-mini{background:var(--background,#171718);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:4px;font-size:11px;padding:3px 6px;cursor:pointer}
.xhpf-mini:hover{border-color:var(--xh-primary,#E8A33C)}
.xhpf-mini.on{background:var(--xh-primary,#E8A33C);color:var(--background,#171718);border-color:var(--xh-primary,#E8A33C)}
.xhpf-words{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
.xhpf-word{display:inline-flex;align-items:center;gap:3px;font-size:11px;background:var(--background,#171718);border:1px solid var(--border,#494a50);border-radius:11px;padding:2px 4px 2px 8px}
.xhpf-word .d{cursor:pointer;opacity:.6;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%}
.xhpf-word .d:hover{opacity:1;background:var(--xh-primary,#E8A33C);color:var(--background,#171718)}
.xhpf-fixed{display:flex;align-items:center;gap:5px;margin-top:5px}
.xhpf-fixed input{flex:1;min-width:0;background:var(--background,#171718);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:5px;padding:4px 7px;font-size:11px;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif)}
.xhpf-addrow{display:flex;gap:5px;margin-top:5px}
.xhpf-addrow input{flex:1;min-width:0;background:var(--background,#171718);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:5px;padding:4px 7px;font-size:11px;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif)}
.xhpf-prev{flex:1 1 auto;min-height:0;margin:0 12px 12px;background:var(--background,#171718);color:var(--foreground,#fff);border:1px solid var(--border,#494a50);border-radius:6px;padding:11px 12px;font-size:12px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto}
.xhpf-warn{margin:0 12px 8px;font-size:11px;color:var(--xh-primary,#E8A33C);line-height:1.5}
.xhpf-foot{display:flex;gap:8px;justify-content:flex-end;padding:9px 14px;border-top:1px solid var(--border,#494a50);background:var(--secondary,#262729);flex:0 0 auto}
`;

function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style"); s.id = CSS_ID; s.textContent = CSS;
  document.head.appendChild(s);
}
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const miniBtn = (text, title, cls) => {
  const b = el("button", "xhpf-mini" + (cls ? " " + cls : ""), text);
  b.type = "button"; b.title = title || ""; b.dataset.xhIconDone = "1";
  return b;
};

let openState = null; // 单例

export function isEditorOpen() { return !!openState; }
export function closeEditor() {
  if (!openState) return;
  openState.overlay.remove();
  document.removeEventListener("keydown", openState.onKey);
  openState = null;
}

export function openEditor({ config, seed, onApply }) {
  injectCSS();
  closeEditor();
  const cfg = normalizeConfig(config);
  const work = JSON.parse(JSON.stringify(cfg)); // 深拷贝，取消不改原节点

  const overlay = el("div", "xhpf-ov");
  const win = el("div", "xhpf-win");
  const head = el("div", "xhpf-head");
  const title = el("h3", null, T("提示词填空 XiaoHei"));
  const sel = el("select", "xhpf-sel");
  for (const p of PRESETS) {
    const o = el("option", null, currentLang() === "zh" ? p.nameZh : p.nameEn);
    o.value = p.id; sel.appendChild(o);
  }
  const customOpt = el("option", null, T("自定义")); customOpt.value = "custom"; sel.appendChild(customOpt);
  sel.value = PRESETS.some((p) => p.id === work.preset) ? work.preset : "custom";
  const x = el("div", "xhpf-x"); x.innerHTML = xhIconHTML("关闭", { size: 16, color: "current" });
  x.title = "关闭"; x.dataset.xhIconDone = "1";
  head.append(title, sel, x);

  const bar = el("div", "xhpf-bar");
  const seedLab = el("label", null, T("种子"));
  const seedInput = el("input", "xhpf-seed"); seedInput.type = "number"; seedInput.min = "0"; seedInput.step = "1";
  seedInput.value = String(seed >>> 0);
  const reroll = el("button", "xhpf-btn primary"); reroll.type = "button";
  reroll.innerHTML = xhIconHTML("刷新", { size: 13, color: "current" }) + "<span>" + T("换一批词（改种子）") + "</span>";
  reroll.dataset.xhIconDone = "1";
  const reset = miniBtn(T("恢复本预设默认"), T("恢复本预设默认"));
  const copyBtn = el("button", "xhpf-btn"); copyBtn.type = "button";
  copyBtn.innerHTML = xhIconHTML("复制", { size: 13, color: "current" }) + "<span>" + T("复制结果") + "</span>";
  copyBtn.dataset.xhIconDone = "1";
  bar.append(seedLab, seedInput, reroll, reset, copyBtn);

  const cols = el("div", "xhpf-cols");
  const left = el("div", "xhpf-col left");
  const mid = el("div", "xhpf-col mid");
  const right = el("div", "xhpf-col right");

  // 左：模板
  left.appendChild(el("div", "xhpf-ct", T("模板")));
  const leftHint = el("div", "xhpf-hint", T("模板说明：用 {{空位}} 挖空，左边改骨架，中间给每个空位配候选词。"));
  left.appendChild(leftHint);
  const ta = el("textarea", "xhpf-ta"); ta.spellcheck = false; ta.value = work.template;
  left.appendChild(ta);

  // 中：词库
  mid.appendChild(el("div", "xhpf-ct", T("词库")));
  mid.appendChild(el("div", "xhpf-hint", T("每个空位可加词/删词、上锁固定、或填固定值。上锁后不参与随机。")));
  const slotsWrap = el("div", "xhpf-slots");
  mid.appendChild(slotsWrap);
  const addSlotBtn = miniBtn("＋ " + T("加一个空位"), T("加一个空位"));
  addSlotBtn.dataset.xhIconDone = "1";
  slotsWrap.appendChild(addSlotBtn);

  // 右：预览
  right.appendChild(el("div", "xhpf-ct", T("预览")));
  right.appendChild(el("div", "xhpf-hint", T("点「换一批词」或改节点上的种子，这里实时更新。真正送出去的以运行为准。")));
  const warn = el("div", "xhpf-warn");
  const prev = el("div", "xhpf-prev");
  right.append(warn, prev);

  const foot = el("div", "xhpf-foot");
  const done = el("button", "xhpf-btn primary", T("完成")); done.type = "button";
  const cancel = el("button", "xhpf-btn", currentLang() === "zh" ? "取消" : "Cancel"); cancel.type = "button";
  foot.append(cancel, done);

  // 三栏必须塞进 cols —— 漏了这行，cols 永远是空 div，用户看到的就是「空空如也」。
  cols.append(left, mid, right);
  win.append(head, bar, cols, foot);
  overlay.appendChild(win);

  let currentSeed = seed >>> 0;
  let refreshTimer = null;
  const refresh = async () => {
    const keys = slotKeys(work.template);
    for (const k of keys) if (!work.slots[k]) work.slots[k] = { options: [], locked: true, fixed: "", free: true };
    const missing = keys.filter((k) => {
      const s = work.slots[k];
      // 后端对「锁定」空位一律填 fixed（哪怕空串也不残留占位符），只有「未锁定且词库空」
      // 才会原样留着 {{key}}。所以锁定的空位（如故意留空的台词）不该报「未配置」警告。
      if (s.locked) return false;
      return !(s.options && s.options.length) && !(s.fixed && s.fixed.trim());
    });
    if (missing.length) {
      warn.textContent = T("模板里引用了未配置的空位：") + missing.map((k) => "{{" + k + "}}").join(" ") + T("（运行时会原样保留，去中间栏给它们配词库）");
      warn.style.display = "";
    } else warn.style.display = "none";
    const { text } = await fillPreview(work, currentSeed);
    prev.textContent = text || (currentLang() === "zh" ? "（空）" : "(empty)");
  };
  const queueRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { refresh(); }, 60); };

  const renderSlots = () => {
    slotsWrap.innerHTML = "";
    const keys = slotKeys(work.template);
    for (const key of keys) {
      const s = work.slots[key] || { options: [], locked: true, fixed: "", free: true };
      const box = el("div", "xhpf-slot");
      const h = el("div", "xhpf-slot-h");
      const name = el("b", null, "{{" + key + "}}");
      const chip = el("span", "xhpf-chip" + (s.locked ? " lock" : ""), s.locked ? T("上锁") : T("随机"));
      const sp = el("span", "sp");
      const del = miniBtn("✕", T("删除空位"));
      del.addEventListener("click", () => { delete work.slots[key]; work.template = work.template.replace(new RegExp("\\{\\{\\s*" + key + "\\s*\\}\\}", "g"), ""); ta.value = work.template; renderSlots(); queueRefresh(); });
      h.append(name, chip, sp, del);
      box.appendChild(h);

      const words = el("div", "xhpf-words");
      (s.options || []).forEach((w, i) => {
        const wEl = el("span", "xhpf-word");
        wEl.appendChild(el("span", null, w));
        const d = el("span", "d"); d.innerHTML = xhIconHTML("关闭", { size: 10, color: "current" });
        d.title = T("删"); d.dataset.xhIconDone = "1";
        d.addEventListener("click", () => { s.options.splice(i, 1); renderSlots(); queueRefresh(); });
        wEl.appendChild(d); words.appendChild(wEl);
      });
      if (!s.options || !s.options.length) words.appendChild(el("span", "xhpf-hint", T("这个词库为空，运行时会保留 {{空位}} 原样。")));
      box.appendChild(words);

      const addRow = el("div", "xhpf-addrow");
      const addIn = el("input"); addIn.placeholder = T("加词"); addIn.title = T("加词");
      const addB = miniBtn("＋", T("加词"));
      const doAdd = () => {
        const v = addIn.value.trim(); if (!v) return;
        s.options = s.options || []; if (s.options.indexOf(v) < 0) s.options.push(v);
        renderSlots(); queueRefresh();
      };
      addB.addEventListener("click", doAdd);
      addIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } });
      addRow.append(addIn, addB); box.appendChild(addRow);

      const lockRow = el("div", "xhpf-slot-h");
      const lockBtn = miniBtn(s.locked ? T("上锁") : T("随机"), s.locked ? T("上锁") : T("随机"), s.locked ? "on" : "");
      lockBtn.addEventListener("click", () => { s.locked = !s.locked; renderSlots(); queueRefresh(); });
      lockRow.appendChild(lockBtn); box.appendChild(lockRow);

      const fixedRow = el("div", "xhpf-fixed");
      fixedRow.appendChild(el("span", "xhpf-hint", T("固定值")));
      const fixedIn = el("input"); fixedIn.value = s.fixed || ""; fixedIn.title = T("固定值");
      fixedIn.addEventListener("input", () => { s.fixed = fixedIn.value; queueRefresh(); });
      fixedRow.appendChild(fixedIn); box.appendChild(fixedRow);

      slotsWrap.appendChild(box);
    }
    slotsWrap.appendChild(addSlotBtn);
  };
  addSlotBtn.addEventListener("click", () => {
    let n = 1, k = "slot" + n;
    while (work.slots[k]) { n++; k = "slot" + n; }
    work.slots[k] = { options: [], locked: true, fixed: "", free: true };
    work.template = (work.template ? work.template + " " : "") + "{{" + k + "}}";
    ta.value = work.template; renderSlots(); queueRefresh();
  });

  ta.addEventListener("input", () => { work.template = ta.value; renderSlots(); queueRefresh(); });
  seedInput.addEventListener("input", () => { currentSeed = parseInt(seedInput.value, 10) >>> 0; queueRefresh(); });
  reroll.addEventListener("click", () => {
    currentSeed = (currentSeed + 1) >>> 0; seedInput.value = String(currentSeed); queueRefresh();
    reroll.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 180 });
  });
  reset.addEventListener("click", () => {
    const p = getPreset(sel.value === "custom" ? "h3_video_official" : sel.value);
    const fresh = presetToConfig(p);
    work.template = fresh.template; work.slots = fresh.slots; work.prefix = fresh.prefix; work.preset = fresh.preset;
    ta.value = work.template; renderSlots(); queueRefresh();
  });
  sel.addEventListener("change", () => {
    const p = getPreset(sel.value);
    work.preset = p.id; work.template = p.template; work.slots = JSON.parse(JSON.stringify(presetToConfig(p).slots));
    work.prefix = (p.prefixOptions && p.prefixOptions[0] && p.prefixOptions[0].v) || "";
    ta.value = work.template; renderSlots(); queueRefresh();
  });
  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(prev.textContent); copyBtn.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 180 }); } catch { /* 权限不给就算了 */ }
  });

  const apply = () => {
    work.template = ta.value;
    work.seed = currentSeed;
    onApply(JSON.stringify(work), currentSeed);
    closeEditor();
  };
  done.addEventListener("click", apply);
  cancel.addEventListener("click", closeEditor);
  x.addEventListener("click", closeEditor);
  overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) closeEditor(); });
  const onKey = (e) => { if (e.key === "Escape") closeEditor(); };
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  openState = { overlay, onKey };
  renderSlots();
  refresh();
}
