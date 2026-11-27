// GTA6 人物列表 · 节点 DOM 外观
//
// 一个人一张卡片：顶上「序号 + 性别 + 开/关 + 删」，中间一排点开的下拉
// （发型 / 胡子 / 服装 / 配饰 / 姿态），底下一行「补充」输入框。
// 配色只取 ComfyUI 官方 CSS 变量，强调色走家族 --xh-primary；
// 图案一律走自有图标库 xhIconHTML，零硬编码 SVG 路径。
//
// 🔴 尺寸铁律：本文件不提供任何「量内容高度」的函数。
//   行会越加越多，DOM 高度不能反向决定 node.size（会钉死节点拖不小），
//   多出来的内容由 .xh-g6-list 自己滚动，下限由 index.js 用常量给。
import { readState, KEEP, OFF, GS_FROM, GENDERS } from "./core.mjs";
import { G6_OPTIONS, zhOf, G6_SPECIAL_ZH } from "./labels.mjs";
import { xhIconHTML, showXHDropdown } from "../xh_ui_kit.js";
import { g6IsEn } from "./xh_g6_i18n.mjs";

const CSS_ID = "xh-gta6-people-css";
const CSS = `
.xh-g6{display:flex;flex-direction:column;gap:7px;padding:8px 10px;box-sizing:border-box;
  width:100%;height:100%;overflow:hidden;
  color:var(--foreground,#fff);font:12px var(--font-family,sans-serif)}
.xh-g6-list{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;
  display:flex;flex-direction:column;gap:7px}
.xh-g6-card{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;padding:7px 8px;
  border-radius:5px;background:var(--secondary,#262729);border:1px solid var(--border,#494a50)}
.xh-g6-card.is-off{opacity:.45}
.xh-g6-head{display:flex;align-items:center;gap:6px;min-height:22px}
.xh-g6-idx{flex:0 0 auto;min-width:17px;height:17px;padding:0 4px;border-radius:9px;
  display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;
  background:var(--xh-primary,#E8A33C);color:var(--background,#171718);
  font-variant-numeric:tabular-nums}
.xh-g6-sex{flex:0 0 auto;height:20px;padding:0 7px;border-radius:10px;
  display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;
  background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);cursor:pointer}
.xh-g6-sex:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-g6-sp{flex:1 1 auto;min-width:0}
.xh-g6-tog{flex:0 0 auto;min-width:28px;height:18px;padding:0 7px;border-radius:9px;
  display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;
  background:transparent;color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);cursor:pointer;user-select:none}
.xh-g6-tog.on{background:var(--xh-primary,#E8A33C);border-color:var(--xh-primary,#E8A33C);
  color:var(--background,#171718)}
.xh-g6-del{flex:0 0 auto;height:18px;min-width:18px;padding:0;display:inline-flex;
  align-items:center;justify-content:center;background:transparent;border:none;
  color:var(--foreground,#fff);opacity:.55;cursor:pointer;border-radius:4px}
.xh-g6-del:hover{opacity:1;color:var(--xh-primary,#E8A33C)}
.xh-g6-del.armed{opacity:1;color:var(--xh-primary,#E8A33C);padding:0 5px;
  border:1px solid var(--xh-primary,#E8A33C)}
.xh-g6-del:disabled{opacity:.22;cursor:not-allowed}
.xh-g6-grid{display:flex;flex-wrap:wrap;gap:5px}
.xh-g6-fld{display:inline-flex;align-items:center;gap:5px;max-width:100%;height:24px;
  padding:0 6px;border-radius:4px;background:var(--background,#171718);
  border:1px solid var(--border,#494a50);cursor:pointer;font-size:11px;
  color:var(--foreground,#fff)}
.xh-g6-fld:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-g6-fld .k{flex:0 0 auto;opacity:.55}
.xh-g6-fld .v{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-weight:600}
.xh-g6-fld .cv{flex:0 0 auto;opacity:.55;display:inline-flex}
.xh-g6-det{width:100%;box-sizing:border-box;height:24px;padding:0 8px;border-radius:4px;
  background:var(--background,#171718);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);font-size:11.5px;outline:none}
.xh-g6-det:focus{border-color:var(--xh-primary,#E8A33C)}
.xh-g6-det::placeholder{opacity:.45}
.xh-g6-acts{flex:0 0 auto;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.xh-g6-btn{background:var(--secondary,#262729);color:var(--foreground,#fff);
  border:1px solid var(--border,#494a50);border-radius:5px;padding:5px 9px;
  font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.xh-g6-btn:hover{border-color:var(--xh-primary,#E8A33C)}
.xh-g6-btn:disabled{opacity:.4;cursor:not-allowed}
.xh-g6-foot{flex:0 0 auto;font-size:11px;opacity:.55;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xh-g6-tip{display:flex;align-items:center;gap:6px;height:20px;min-height:20px;
  flex:0 0 auto;box-sizing:border-box;padding:0 2px;
  font-size:11px;line-height:20px;white-space:nowrap;overflow:hidden;
  font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);
  color:var(--xh-fg-dim,#8b8b8f)}
.xh-g6-tip.on{color:var(--xh-primary,#E8A33C)}
.xh-g6-tip .d{flex:0 0 auto;width:6px;height:6px;border-radius:50%;
  background:currentColor;opacity:.85}
.xh-g6-tip .t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
`;

export function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 英文态直接显示英文原名（提示词是什么就显示什么），中文态查表。 */
function show(group, value) {
  if (!value) return "";
  return g6IsEn() ? value : zhOf(group, value);
}

const SEX_ZH = { female: "女", male: "男" };
const SEX_EN = { female: "Woman", male: "Man" };

const FIELD_DEFS = {
  female: [
    { key: "hair", label: "发型", group: "female.hair", head: KEEP },
    { key: "outfit", label: "服装", group: "female.outfit", head: KEEP },
    { key: "accessory", label: "配饰", group: "female.accessory", head: OFF },
    { key: "pose", label: "姿态", group: "pose", head: GS_FROM },
  ],
  male: [
    { key: "hair", label: "发型", group: "male.hair", head: KEEP },
    { key: "facial_hair", label: "胡子", group: "male.facial_hair", head: KEEP },
    { key: "outfit", label: "服装", group: "male.outfit", head: KEEP },
    { key: "accessory", label: "配饰", group: "male.accessory", head: OFF },
    { key: "pose", label: "姿态", group: "pose", head: GS_FROM },
  ],
};

const FIELD_LABEL_EN = {
  hair: "Hair", facial_hair: "Beard", outfit: "Outfit", accessory: "Accessory", pose: "Pose",
};

/** 造一整块 DOM：人物卡片列表 + 底部按钮排 + 脚注。事件由 index.js 传进来的 handlers 挂。 */
export function buildRoot(handlers) {
  const root = el("div", "xh-g6");
  const list = el("div", "xh-g6-list");
  const acts = el("div", "xh-g6-acts");
  const buttons = {};

  const add = el("button", "xh-g6-btn");
  add.type = "button";
  add.innerHTML = xhIconHTML("user-plus", { size: 12, color: "current" }) + "<span>加一个人</span>";
  add.title = "在末尾加一个人（默认是女性，卡片里能改性别）";
  add.addEventListener("click", () => handlers.onAdd());
  buttons.add = add;

  const reset = el("button", "xh-g6-btn");
  reset.type = "button";
  reset.innerHTML = xhIconHTML("rotate-ccw", { size: 12, color: "current" }) + "<span>恢复默认</span>";
  reset.title = "清掉所有人物，回到「一个人、全保留照片里的」";
  reset.addEventListener("click", () => handlers.onReset());
  buttons.reset = reset;

  acts.append(add, reset);
  const foot = el("div", "xh-g6-foot", "");
  root.append(list, acts, foot);
  return { root, list, buttons, foot };
}

function dropdownItems(group, head) {
  const items = [];
  if (head) items.push({ value: head, label: g6IsEn() ? head : (G6_SPECIAL_ZH[head] || head) });
  for (const n of (G6_OPTIONS[group] || [])) items.push({ value: n, label: show(group, n) });
  return items;
}

function makeFieldButton(node, person, def, handlers) {
  const b = el("button", "xh-g6-fld");
  b.type = "button";
  const val = person[def.key] || def.head;
  const k = el("span", "k", g6IsEn() ? (FIELD_LABEL_EN[def.key] || def.label) : def.label);
  const v = el("span", "v", show(def.group, val));
  const cv = el("i", "cv");
  cv.innerHTML = xhIconHTML("chevron-down", { size: 11, color: "current" });
  b.append(k, v, cv);
  b.title = `${def.label}：${show(def.group, val)}`;
  b.addEventListener("click", () => {
    // 先记下锚点：下拉弹窗是 fixed 定位，重绘后按钮会消失，靠 rect 定位。
    showXHDropdown(b, {
      items: dropdownItems(def.group, def.head),
      current: val,
      onPick: (picked) => handlers.onField(person.id, def.key, picked),
    });
  });
  return b;
}

/** 按当前状态重建所有人卡片（每次交互后整体重绘，简单可靠）。 */
export function renderPeople(node, list, handlers, foot) {
  const state = readState(node);
  const en = g6IsEn();
  list.innerHTML = "";

  state.people.forEach((person, i) => {
    const card = el("div", "xh-g6-card" + (person.enabled ? "" : " is-off"));

    // ── 卡片头：序号 + 性别 + 开关 + 删
    const head = el("div", "xh-g6-head");
    head.appendChild(el("span", "xh-g6-idx", String(i + 1)));

    const sex = el("button", "xh-g6-sex");
    sex.type = "button";
    sex.dataset.xhIconDone = "1";
    const sexIcon = document.createElement("i");
    sexIcon.style.cssText = "display:inline-flex;opacity:.75";
    sexIcon.innerHTML = xhIconHTML(person.gender === "male" ? "user-round" : "user-round", { size: 11, color: "current" });
    sex.appendChild(sexIcon);
    sex.appendChild(el("span", null, en ? SEX_EN[person.gender] : SEX_ZH[person.gender]));
    const cv = document.createElement("i");
    cv.style.cssText = "display:inline-flex;opacity:.55";
    cv.innerHTML = xhIconHTML("chevron-down", { size: 10, color: "current" });
    sex.appendChild(cv);
    sex.title = "这个人物的性别（决定发型 / 服装 / 配饰的可选清单）";
    sex.addEventListener("click", () => {
      showXHDropdown(sex, {
        items: GENDERS.map((g) => ({ value: g, label: en ? SEX_EN[g] : SEX_ZH[g] })),
        current: person.gender,
        onPick: (picked) => handlers.onGender(person.id, picked),
      });
    });
    head.appendChild(sex);
    head.appendChild(el("span", "xh-g6-sp"));

    const tog = el("div", "xh-g6-tog" + (person.enabled ? " on" : ""), person.enabled ? "开" : "关");
    tog.dataset.xhIconDone = "1";
    tog.title = person.enabled ? "点一下：这个人先不算进去" : "点一下：这个人算进去";
    tog.addEventListener("click", () => handlers.onToggle(person.id));
    head.appendChild(tog);

    const del = el("button", "xh-g6-del");
    del.type = "button";
    del.dataset.armed = "0";
    del.disabled = state.people.length <= 1;
    const setArmed = (on) => {
      del.dataset.armed = on ? "1" : "0";
      del.classList.toggle("armed", on);
      del.innerHTML = on ? '<span style="font-size:11px;font-weight:700">删?</span>'
        : xhIconHTML("trash-2", { size: 13, color: "current" });
      del.title = on ? "再点一次就真的删掉（3 秒后自动取消）" : "删掉这个人";
    };
    setArmed(false);
    del.addEventListener("click", () => {
      if (state.people.length <= 1) return;
      if (del.dataset.armed === "1") { handlers.onDelete(person.id); return; }
      setArmed(true);
      setTimeout(() => { if (del.isConnected && del.dataset.armed === "1") setArmed(false); }, 3000);
    });
    head.appendChild(del);
    card.appendChild(head);

    // ── 一排下拉
    const grid = el("div", "xh-g6-grid");
    for (const def of (FIELD_DEFS[person.gender] || FIELD_DEFS.female)) {
      grid.appendChild(makeFieldButton(node, person, def, handlers));
    }
    card.appendChild(grid);

    // ── 补充（打字不重绘，否则焦点会被刷掉）
    const det = document.createElement("input");
    det.type = "text";
    det.className = "xh-g6-det";
    det.value = person.details || "";
    det.dataset.xhIconDone = "1";
    det.placeholder = en
      ? "Extra: holding a champagne flute / in her late twenties"
      : "补充：她手里拿着香槟杯 / 三十岁上下 / 左脸有疤";
    det.title = "只作用于这一个人。照片模式接在「让她……」后面；纯文字模式接在「一个女人」后面。";
    det.addEventListener("input", () => handlers.onDetails(person.id, det.value));
    card.appendChild(det);

    list.appendChild(card);
  });

  if (foot) {
    const n = state.people.length;
    const on = state.people.filter((p) => p.enabled).length;
    foot.textContent = en
      ? `${on}/${n} active · top to bottom = left to right on screen · XiaoHei`
      : `共 ${n} 人（开着 ${on} 人）· 从上到下 = 画面从左到右 · XiaoHei`;
  }
  const reset = list.parentElement?.querySelector(".xh-g6-acts button:nth-child(2)");
  if (reset) {
    const s = readState(node);
    const dirty = s.people.length !== 1 || s.people[0].gender !== "female"
      || s.people[0].hair !== KEEP || s.people[0].outfit !== KEEP
      || s.people[0].accessory !== OFF || s.people[0].pose !== GS_FROM
      || (s.people[0].details || "").trim() || s.people[0].enabled === false;
    reset.disabled = !dirty;
  }
}
