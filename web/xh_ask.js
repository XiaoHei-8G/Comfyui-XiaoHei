// ══════════════════════════════════════════════════════════════════════
//  XiaoHei 家族 · 通用模态对话框（替代 window.prompt / window.confirm）
// ══════════════════════════════════════════════════════════════════════
//  为什么必须有这个（2026-10-28 用户报 bug）：
//   **ComfyUI 桌面版是 Electron，它禁用了 window.prompt / window.confirm**。
//   点「重命名」毫无反应、点「新建文件夹」没反应、点「删除」没反应 —— 全是这个原因。
//   （`xh_image_list.js` 早就踩过，当时是在节点里改用行内输入框绕开的；
//     但工作流浏览器是**面板**，需要一个模态框。）
//
// 用法：
//   const name = await XHAsk.text("新文件夹名字", { defaultValue: "", placeholder: "…" });
//   if (name === null) return;                       // 用户取消
//   const ok = await XHAsk.confirm("确定删除「x」吗？", { danger: true });
//   if (!ok) return;
//
// 设计：
//   • 返回 Promise，Esc / 点遮罩 / 点取消 ⇒ resolve(null 或 false)
//   • 深紫底 + Comfy 黄主按钮，跟家族主题一致
//   • 回车确认、Esc 取消；输入框自动全选
//   • 一次只弹一个（后来的排队等前面的关掉）

const { app } = window.comfyAPI.app;

let _seq = 0;

function ensureCSS() {
  if (document.getElementById("xh-ask-css")) return;
  const st = document.createElement("style");
  st.id = "xh-ask-css";
  st.textContent = `
.xh-ask-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  background:rgba(8,5,10,.62);backdrop-filter:blur(2px);}
.xh-ask-box{width:min(440px,90vw);background:var(--xh-surface,#252525);color:var(--xh-text,#e8e8e8);
  border:1px solid var(--xh-border,rgba(255,255,255,.12));border-radius:12px;padding:18px 20px 16px;
  box-shadow:0 18px 48px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:12px;}
.xh-ask-title{font-size:14px;font-weight:600;line-height:1.5;white-space:pre-wrap;}
.xh-ask-input{width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;
  background:var(--xh-input-bg,#1c1c1c);color:var(--xh-text,#e8e8e8);
  border:1px solid var(--xh-border,rgba(255,255,255,.14));border-radius:6px;outline:none;}
.xh-ask-input:focus{border-color:var(--xh-primary,#ffffff);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--xh-primary,#ffffff) 30%,transparent);}
.xh-ask-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:2px;}
.xh-ask-btn{padding:0 14px;height:30px;border-radius:6px;cursor:pointer;font-size:13px;
  border:1px solid var(--xh-border,rgba(255,255,255,.14));background:transparent;color:var(--xh-text,#e8e8e8);}
.xh-ask-btn:hover{background:rgba(255,255,255,.07);}
/* ⏱ 2026-11-08：常态 = 午夜蓝低彩，hover 才亮琥珀金（瞬时信号） */
.xh-ask-btn.primary{background:var(--xh-rest,#01386A);color:var(--xh-on-rest,#fff);
  border-color:var(--xh-rest-bd,rgba(255,255,255,.28));font-weight:600;}
.xh-ask-btn.primary:hover{background:var(--xh-primary,#E8A33C);color:var(--xh-on-primary,#1c1c1c);
  border-color:var(--xh-primary,#E8A33C);filter:none}
.xh-ask-btn.danger{background:var(--xh-danger,#e05858);color:#fff;border-color:var(--xh-danger,#e05858);font-weight:600;}
.xh-ask-btn.danger:hover{filter:brightness(1.08);}
`;
  document.head.appendChild(st);
}

/**
 * 弹一个模态框。返回 { root, close(result) }。
 * @param {object} opts { title, placeholder, defaultValue, okText, cancelText, danger, multiline }
 */
function _ask(opts) {
  ensureCSS();
  const o = opts || {};
  return new Promise((resolve) => {
    let settled = false;
    const backdrop = document.createElement("div");
    backdrop.className = "xh-ask-backdrop";

    const box = document.createElement("div");
    box.className = "xh-ask-box";

    if (o.title) {
      const t = document.createElement("div");
      t.className = "xh-ask-title";
      t.textContent = o.title;
      box.appendChild(t);
    }

    let input = null;
    if (o.input !== false) {
      input = document.createElement("input");
      input.type = "text";
      input.className = "xh-ask-input";
      input.value = o.defaultValue == null ? "" : String(o.defaultValue);
      if (o.placeholder) input.placeholder = o.placeholder;
      box.appendChild(input);
    }

    const acts = document.createElement("div");
    acts.className = "xh-ask-acts";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "xh-ask-btn";
    cancel.textContent = o.cancelText || "取消";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "xh-ask-btn " + (o.danger ? "danger" : "primary");
    ok.textContent = o.okText || "确定";
    acts.appendChild(cancel);
    acts.appendChild(ok);
    box.appendChild(acts);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    const close = (result) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(input ? null : false); }
      else if (e.key === "Enter" && input && e.target === input) {
        e.preventDefault(); e.stopPropagation(); close(input.value);
      }
    };
    document.addEventListener("keydown", onKey, true);
    cancel.onclick = () => close(input ? null : false);
    ok.onclick = () => close(input ? input.value : true);
    backdrop.onmousedown = (e) => { if (e.target === backdrop) close(input ? null : false); };
    if (input) { input.focus(); input.select(); } else { ok.focus(); }
  });
}

export const XHAsk = {
  /** 文本输入对话框。返回字符串；取消返回 null。 */
  text(title, opts) {
    return _ask(Object.assign({ title, input: true }, opts || {}));
  },
  /** 确认对话框。返回 true / false。 */
  confirm(title, opts) {
    return _ask(Object.assign({ title, input: false }, opts || {})).then((v) => v === true);
  },
};

// 挂到 window：没有 import 的文件也能用（xh_settings_panel.js 就是这种）
if (typeof window !== "undefined") window.XHAsk = XHAsk;
