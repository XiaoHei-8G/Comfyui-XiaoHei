// GTA6 人物列表 · 状态层
//
// 一行 = 一个人。状态放 node.properties.xhGta6PeopleState，LiteGraph 自己会把它
// 写进工作流 JSON，所以存盘 / 读档 / 分享是自动的，不占 widgets_values 的坑位。
// 点「运行」那一刻才由 index.js 把 people 打包进隐藏输入 XHGTA6PeopleState。
//
// 为什么状态里存**英文原名**（如 "High curly ponytail"）：提示词必须是英文，
// 后端按英文名反查 presets.json 里的英文描述句。中文只在前端显示，见 labels.mjs。

export const STATE_KEY = "xhGta6PeopleState";

export const KEEP = "keep from photo";       // 保留照片里的
export const OFF = "off";                    // 不用
export const GS_FROM = "(from group setup)"; // 姿态跟整体构图走

export const GENDERS = ["female", "male"];

let _id = 0;
function nextId() {
  _id += 1;
  return `p${Date.now().toString(36)}_${_id}`;
}

export function freshPerson(over = {}) {
  return {
    id: nextId(),
    gender: "female",
    hair: KEEP,
    facial_hair: KEEP,
    outfit: KEEP,
    accessory: OFF,
    pose: GS_FROM,
    details: "",
    enabled: true,
    ...over,
  };
}

export function defaultState() {
  return { version: 1, people: [freshPerson()] };
}

const clean = (v, fallback) => (typeof v === "string" ? v : fallback);

/** 读状态并兜底：手改过的工作流 JSON 缺字段 / 类型不对都能正常打开。 */
export function readState(node) {
  const s = node?.properties?.[STATE_KEY];
  if (!s || typeof s !== "object") return defaultState();
  const raw = Array.isArray(s.people) ? s.people : [];
  const people = raw.filter((r) => r && typeof r === "object").map((r) => ({
    id: typeof r.id === "string" && r.id ? r.id : nextId(),
    gender: GENDERS.includes(r.gender) ? r.gender : "female",
    hair: clean(r.hair, KEEP),
    facial_hair: clean(r.facial_hair, KEEP),
    outfit: clean(r.outfit, KEEP),
    accessory: clean(r.accessory, OFF),
    pose: clean(r.pose, GS_FROM),
    details: clean(r.details, ""),
    enabled: r.enabled !== false,
  }));
  return { version: 1, people: people.length ? people : [freshPerson()] };
}

export function writeState(node, state) {
  node.properties = node.properties || {};
  node.properties[STATE_KEY] = state;
}

export function addPerson(node, gender = "female") {
  const s = readState(node);
  s.people.push(freshPerson({ gender }));
  writeState(node, s);
  return s.people[s.people.length - 1].id;
}

export function deletePerson(node, id) {
  const s = readState(node);
  if (s.people.length <= 1) return false; // 最后一个人不给删，删了节点就没意义了
  s.people = s.people.filter((p) => p.id !== id);
  writeState(node, s);
  return true;
}

export function toggleEnabled(node, id) {
  const s = readState(node);
  const p = s.people.find((x) => x.id === id);
  if (p) p.enabled = !p.enabled;
  writeState(node, s);
}

export function setField(node, id, field, value) {
  const s = readState(node);
  const p = s.people.find((x) => x.id === id);
  if (!p) return;
  if (field === "gender") p.gender = GENDERS.includes(value) ? value : "female";
  else if (field === "details") p.details = String(value ?? "");
  else p[field] = String(value ?? "");
  writeState(node, s);
}

export function resetToDefault(node) {
  writeState(node, defaultState());
}

/** 给后端隐藏输入用的干净载荷：丢掉前端自己的 id。 */
export function toPayload(state) {
  return {
    people: (state.people || []).map((p) => ({
      gender: p.gender,
      hair: p.hair,
      facial_hair: p.facial_hair,
      outfit: p.outfit,
      accessory: p.accessory,
      pose: p.pose,
      details: p.details,
      enabled: !!p.enabled,
    })),
  };
}
