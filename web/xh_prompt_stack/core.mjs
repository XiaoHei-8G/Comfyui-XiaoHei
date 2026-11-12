// XiaoHei-提示词堆叠 · 状态层
// 1:1 学 ComfyUI-Pixaroma / js/prompt_stack/core.mjs（MIT）：
//   状态放 node.properties.xhStackState，LiteGraph 会自己把它写进工作流 JSON，
//   所以存盘 / 读档是自动的；graphToPrompt 钩子在点「运行」时把 rows + 分隔符
//   打进隐藏输入 XHStackState。
//   家族差异：原版分隔符是全局设置里一个要手打 \n 的文本框，咱们改成
//   节点自己的「点小方片」，见 SEPS / resolveSep（用户铁律：不许手打语法）。

export const STATE_KEY = "xhStackState";

// 分隔符：四个小方片，选「自定义」才在设置窗口里露出下一层输入框。
export const SEPS = [
  { mode: "comma", value: ", ", label: "逗号空格" },
  { mode: "newline", value: "\n", label: "换行" },
  { mode: "space", value: " ", label: "空格" },
  { mode: "custom", value: null, label: "自定义" },
];

/** 把「选了哪个方片 + 自定义内容」换算成真正要塞进提示词的分隔符。 */
export function resolveSep(state) {
  if (state.sepMode === "newline") return "\n";
  if (state.sepMode === "space") return " ";
  if (state.sepMode === "custom") {
    const v = typeof state.sepCustom === "string" ? state.sepCustom.slice(0, 16) : "";
    return v || ", ";
  }
  return ", ";
}

let _idCounter = 0;
function nextId() {
  _idCounter += 1;
  return `r${Date.now().toString(36)}_${_idCounter}`;
}

export function freshRow(overrides = {}) {
  return { id: nextId(), enabled: true, label: "", text: "", ...overrides };
}

export function defaultState() {
  return { version: 1, rows: [freshRow()], sepMode: "comma", sepCustom: "" };
}

/** 读状态并兜底：手改过的工作流 JSON 缺字段 / 类型不对都能正常打开。 */
export function readState(node) {
  const s = node?.properties?.[STATE_KEY];
  if (!s || typeof s !== "object") return defaultState();
  const rows = Array.isArray(s.rows) && s.rows.length ? s.rows.map((r) => {
    const row = r && typeof r === "object" ? r : {};
    return {
      id: typeof row.id === "string" && row.id ? row.id : nextId(),
      enabled: row.enabled !== false,
      label: typeof row.label === "string" ? row.label : "",
      text: typeof row.text === "string" ? row.text : "",
    };
  }) : [freshRow()];
  const modes = SEPS.map((x) => x.mode);
  return {
    version: 1,
    rows,
    sepMode: modes.includes(s.sepMode) ? s.sepMode : "comma",
    sepCustom: typeof s.sepCustom === "string" ? s.sepCustom.slice(0, 16) : "",
  };
}

export function writeState(node, state) {
  node.properties = node.properties || {};
  node.properties[STATE_KEY] = state;
}

export function patchState(node, patch) {
  writeState(node, { ...readState(node), ...patch });
}

export function addRow(node) {
  const s = readState(node);
  s.rows.push(freshRow());
  writeState(node, s);
}

export function deleteRow(node, id) {
  const s = readState(node);
  if (s.rows.length <= 1) return;
  s.rows = s.rows.filter((r) => r.id !== id);
  writeState(node, s);
}

export function toggleEnabled(node, id) {
  const s = readState(node);
  const row = s.rows.find((r) => r.id === id);
  if (row) row.enabled = !row.enabled;
  writeState(node, s);
}

export function setLabel(node, id, label) {
  const s = readState(node);
  const row = s.rows.find((r) => r.id === id);
  if (row) row.label = String(label ?? "");
  writeState(node, s);
}

export function setText(node, id, text) {
  const s = readState(node);
  const row = s.rows.find((r) => r.id === id);
  if (row) row.text = String(text ?? "");
  writeState(node, s);
}

export function clearAllText(node) {
  const s = readState(node);
  for (const row of s.rows) row.text = "";
  writeState(node, s);
}

export function resetToDefault(node) {
  writeState(node, defaultState());
}

export function reorderRows(node, fromIdx, toIdx) {
  const s = readState(node);
  if (fromIdx === toIdx) return;
  if (fromIdx < 0 || fromIdx >= s.rows.length) return;
  if (toIdx < 0 || toIdx >= s.rows.length) return;
  const [moved] = s.rows.splice(fromIdx, 1);
  s.rows.splice(toIdx, 0, moved);
  writeState(node, s);
}
