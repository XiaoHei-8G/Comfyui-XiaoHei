// XiaoHei 家族 · 工作流存档守卫（Widget Archive Guard）
//
// 【修的是什么】
//   把工作流分享给别人，对方打开后节点参数空框 / 串位 / 下拉变红或显示成数字。
//   不是节点算错，也不是编码问题，是**存档被「纯 UI 的 DOM 控件」污染了位置数组**：
//
//   ① 家族节点用 addDOMWidget 挂了工具条 / 预览条 / 画廊 / 画布等纯界面控件，
//      传了 { serialize:false }。但当前官方前端 `serialiseWidgetValues`
//      （src/lib/litegraph/src/LGraphNode.ts:231）判的是 **widget.serialize === false**
//      （顶层属性），不是 options.serialize。家族 kit 里只有 makeXHToolbar 补过顶层，
//      其余 DOM 控件全漏 ⇒ 真实存档里能看到
//        XHResolutionSelect: widgets_values_named = {..., "xh_resolution_preview": ""}
//      即预览条真的占了 widgets_values 一格。
//   ② 官方读档 `LGraphNode.configure`（同上 :1358）在 namedValuesRestore 关时（默认）
//      走 **positional**：按 this.widgets 现序、跳过 serialize===false，逐格灌值。
//      存盘方与读档方的 widget 数量/顺序只要差一格（版本不同、UI 控件挂载时机不同、
//      参数后来加过），就会整体串位 ⇒ 空串落进 FLOAT/INT 框、COMBO 拿到隔壁的值变红。
//   ③ 老档里根本没有后来新增的参数（如 custom_w / custom_h），按名回填也补不上，
//      官方错位灌进来的空串会让后端 `validate_inputs` 直接拒绝执行。
//
// 【怎么修】两层，都不改后端 / 不改存档格式 / 不改界面长相
//   A 写档侧：把「作者已声明 serialize:false」或「不在后端参数契约里的空值 DOM 控件」
//     统一三重加固（w.serialize=false + options.serialize=false + serializeValue），
//     让 widgets_values 只剩真参数 ⇒ 存出去的档干净，老版本 XiaoHei 也能正常打开。
//   B 读档侧：按后端 `/object_info` 的参数契约（名字 / 类型 / 默认值 / COMBO 选项）
//     按**名字**回填；纯 positional 老档剥掉首尾 UI 空占位后按契约顺序对位；
//     最后对所有真参数做类型清洗，非法值（空串、类型不符、COMBO 值不在选项里）回默认。
//
// 【安全边界】
//   · ⛔ 绝不加固「后端契约里的真参数」与「有实值的前端存储控件」
//     （XHLabel.label / XHPaint.PaintWidget / Set-Get 通道名 / control_after_generate …），
//     这些值丢了会真的坏功能。归档实测：82 种恒空 UI 键全不在契约里，
//     14 种有实值的存储键一个都没被判成 UI。
//   · 加载路径只读不写：不调 graph.change() / tryMarkDirty()，只 setDirtyCanvas 重绘，
//     打开干净工作流不会被标成「已修改」。
//   · 自愈幂等：值相同就不写；只在值非法时才动，用户真正填的数一个都不丢。
//   · 纯前端：Ctrl+F5 生效，不用重启 ComfyUI，不动 VERSION。
//
// 参考：家族 skill「XH家族新增节点」§13.4 / §13.7 / §13.27 / §13.29；
//       官方源码 LGraphNode.ts:231,274,1358 与 stores/widgetValueStore.ts:145。

const _getApp = () => {
    try { return (typeof window !== "undefined" && window.comfyAPI?.app?.app) || null; }
    catch (e) { return null; }
};

/** type -> { names: string[], specs: { [name]: {type, options, default} } } */
const CONTRACT = new Map();
/**
 * 真机实证（2026-11-13）：beforeRegisterNodeDef 的 nodeData.name 是**中文显示名**
 * （"XH-H3·起点"），不是 class_type（"XH_H3Start"），拿它当 key 与 node.type 永远对不上，
 * 守卫会变成空壳。⇒ 以节点原型为身份存一份 WeakMap，运行时沿原型链查，与命名完全无关。
 */
const PROTO_CONTRACT = new WeakMap();

const isBlank = (v) => v === "" || v === null || v === undefined;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** 只认 XiaoHei 自家节点。🔴 严禁用 /^XH/ 前缀：XHGroupExecutor/XHH3Stitch/XHPet
 *  等第三方节点也以 XH 开头，前缀判据会把它们误认成家族节点、篡改其归属标记。 */
export function isFamilyNodeData(nodeData) {
    if (!nodeData) return false;
    const pm = String(nodeData.python_module || "");
    const cat = String(nodeData.category || "");
    const name = String(nodeData.name || "");
    if (pm.includes("Comfyui-XiaoHei") || pm.includes("Comfyui-XH_Toolbox")) return true;
    if (cat.startsWith("XiaoHei/") || cat.startsWith("🔁XH/")) return true;
    // 白名单兜底（覆盖 python_module/category 缺失的反序列化场景）——精确命中，不靠前缀
    try {
        const set = window.__XH_FAMILY_TYPES__;
        if (set && typeof set.has === "function" && set.has(name)) return true;
    } catch (e) {}
    return false;
}

/**
 * 从 beforeRegisterNodeDef 的 nodeData（= /object_info 的同一份）读出参数契约。
 * 只收「会生成 widget」的输入：排除 forceInput 纯输入口。
 */
export function readContract(nodeData) {
    const out = { names: [], specs: {} };
    const input = nodeData && nodeData.input;
    if (!isObj(input)) return out;
    for (const group of ["required", "optional"]) {
        const g = input[group];
        if (!isObj(g)) continue;
        for (const [name, def] of Object.entries(g)) {
            if (!Array.isArray(def) || !def.length || out.specs[name]) continue;
            const first = def[0];
            const cfg = (def.length > 1 && isObj(def[1])) ? def[1] : {};
            if (cfg.forceInput) continue;                 // 纯输入口，不生成 widget
            const isCombo = Array.isArray(first);
            if (!isCombo && typeof first !== "string") continue;
            const type = isCombo ? "COMBO" : String(first).toUpperCase();
            const options = isCombo ? first.map((x) => (Array.isArray(x) ? x[0] : x)) : null;
            let dflt = cfg.default;
            if (dflt === undefined) {
                if (isCombo) dflt = options.length ? options[0] : "";
                else if (type === "BOOLEAN") dflt = false;
                else if (type === "INT" || type === "FLOAT") dflt = 0;
                else dflt = "";
            }
            out.names.push(name);
            out.specs[name] = { type, options, default: dflt };
        }
    }
    return out;
}

function contractFor(node) {
    if (!node) return null;
    const byName = CONTRACT.get(node.type) || CONTRACT.get(node.comfyClass);
    if (byName) return byName;
    // 沿原型链找 beforeRegisterNodeDef 时登记的那份契约（与显示名 / class_type 无关）
    let p = node;
    while (p) {
        const c = PROTO_CONTRACT.get(p);
        if (c) return c;
        p = Object.getPrototypeOf(p);
    }
    return null;
}

/** 值是否合乎契约类型；返回 undefined 表示「非法，应回默认」。 */
export function coerceValue(v, spec) {
    if (!spec) return v;
    const t = spec.type || "";
    // 任意类型 / 自定义类型（* / IMAGE / LATENT / AUDIO / COMFY_AUTOGROW_V3 …）：
    // 空值本身就是合法的（循环通道没接线时就是空），⛔ 绝不回默认、绝不清洗。
    // 实测：XHForLoopEnd 有 10+ 个 "*" 参数，误清洗会把通道值全抹掉。
    // 组合类型只有含基础类型时才清洗（"INT,FLOAT,BOOLEAN" 要管；
    // "SAM3_TRACK_DATA,MASK" 这类纯自定义组合按未知类型放过）
    const comboPrimitive = t.includes(",")
        && /\b(INT|FLOAT|NUMBER|BOOLEAN|STRING|TEXT)\b/.test(t.toUpperCase());
    const known = t === "COMBO" || t === "BOOLEAN" || comboPrimitive
        || /^(INT|FLOAT|NUMBER)$/.test(t) || /STRING|TEXT/.test(t);
    if (!known) return v;
    if (isBlank(v)) {
        if (t === "BOOLEAN") return false;             // 后端 bool("")=False，不抛异常
        if (/STRING|TEXT/.test(t)) return "";
        return undefined;
    }
    if (t === "COMBO") {
        const opts = spec.options || [];
        if (!opts.length) return v;                    // 动态下拉无从校验，别动用户选的值
        return opts.some((o) => o === v || String(o) === String(v)) ? v : undefined;
    }
    // 组合类型（如 "INT,FLOAT,BOOLEAN"）不做强转，只挡空值
    if (t.includes(",")) return v;
    if (/^(INT|FLOAT|NUMBER)$/.test(t)) {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
        return undefined;
    }
    if (t === "BOOLEAN") {
        if (typeof v === "boolean") return v;
        if (typeof v === "number") return !!v;
        return undefined;
    }
    if (/STRING|TEXT/.test(t)) return typeof v === "string" ? v : String(v);
    return v;                                          // IMAGE / LATENT / 自定义类型：不碰
}

function setWidget(w, v) {
    try { w.value = v; } catch (e) {}
    try { if (w.inputEl) w.inputEl.value = v; } catch (e) {}
    // ⛔ 故意不调 w.callback：那会触发重跑 / 重建 DOM，读档路径绝不能触发副作用
}

/**
 * A 写档侧：把纯 UI 控件彻底踢出序列化。
 * 返回本次新加固的控件数；幂等，重复调用返回 0。
 */
export function hardenUiWidgets(node) {
    const c = contractFor(node);
    if (!c || !Array.isArray(node.widgets)) return 0;
    let n = 0;
    for (const w of node.widgets) {
        if (!w || !w.name) continue;
        if (c.specs[w.name]) continue;                 // 真参数：绝不动
        if (w.serialize === false) continue;          // 已加固
        const declared = w.serialize === false
            || (w.options && w.options.serialize === false);
        // 存储类控件（有 getValue 或当前有实值）绝不加固 —— 值丢了会真坏功能
        if (w.options && typeof w.options.getValue === "function") continue;
        const hasRealValue = !isBlank(w.value)
            && !(isObj(w.value) && Object.keys(w.value).length === 0);
        const domLike = !!(w.element || w.el) || w.type === "custom";
        if (!declared && !(domLike && !hasRealValue)) continue;
        w.serialize = false;                          // ← 当前官方只读这一条
        if (w.options) w.options.serialize = false;   // 兼容旧前端
        w.serializeValue = () => undefined;           // 双保险
        n++;
    }
    return n;
}

/**
 * B 读档侧：按契约把值放对格子，最后统一类型清洗。
 * 返回 { mode, written, cleaned }；幂等。
 */
export function restoreWidgetValues(node, info) {
    const c = contractFor(node);
    if (!c || !c.names.length || !Array.isArray(node.widgets)) return { mode: "skip", written: 0, cleaned: 0 };
    const widgets = node.widgets.filter((w) => w && w.name && c.specs[w.name]);
    let mode = "sanitize-only";
    let written = 0;

    const named = info && isObj(info.widgets_values_named) ? info.widgets_values_named : null;
    if (named) {
        mode = "named";
        for (const w of widgets) {
            if (!Object.prototype.hasOwnProperty.call(named, w.name)) continue;
            const sp = c.specs[w.name];
            const v = coerceValue(named[w.name], sp);
            // 后端把「默认值」本身就声明成非法（如 NUMBER 的 default=""）时不写，
            // 否则每次读档都白写一次，且永远洗不干净。
            let want = v;
            if (v === undefined) {
                if (coerceValue(sp.default, sp) === undefined) continue;
                want = sp.default;
            }
            if (w.value !== want) { setWidget(w, want); written++; }
        }
    } else {
        const vals = info && Array.isArray(info.widgets_values) ? info.widgets_values : null;
        if (vals) {
            // 纯 positional 老档：剥掉首尾的 UI 空占位，再按后端声明序对位。
            // 长度对不上就一格都不硬灌（宁可不动，也不乱写）。
            const a = vals.slice();
            while (a.length && isBlank(a[0])) a.shift();
            while (a.length && isBlank(a[a.length - 1])) a.pop();
            if (a.length === c.names.length) {
                mode = "positional";
                c.names.forEach((name, i) => {
                    const w = widgets.find((x) => x.name === name);
                    if (!w) return;
                    const v = coerceValue(a[i], c.specs[name]);
                    if (v !== undefined && w.value !== v) { setWidget(w, v); written++; }
                });
            }
        }
    }

    // 类型清洗：救「老档缺参数」「COMBO 值不在选项里」「空串灌进 INT」这三类。
    let cleaned = 0;
    for (const w of widgets) {
        const sp = c.specs[w.name];
        const v = coerceValue(w.value, sp);
        if (v === undefined) {
            if (coerceValue(sp.default, sp) === undefined) continue;   // 后端声明缺陷，放过
            setWidget(w, sp.default); cleaned++;
        } else if (v !== w.value) {
            setWidget(w, v); cleaned++;
        }
    }
    if (written || cleaned) {
        try { node.setDirtyCanvas?.(true, true); } catch (e) {}
    }
    return { mode, written, cleaned };
}

/** 给验证脚本 / 控制台用（不改任何状态）。 */
export function dryRun(nodeData, info, widgetValues) {
    const c = readContract(nodeData);
    CONTRACT.set(nodeData.name, c);
    const node = {
        type: nodeData.name,
        widgets: c.names.map((name) => ({ name, value: widgetValues[name], options: {} })),
        setDirtyCanvas() {},
    };
    const out = restoreWidgetValues(node, info);
    const values = {};
    for (const w of node.widgets) values[w.name] = w.value;
    return { ...out, values, contract: c.names };
}

const _app = _getApp();
if (_app && typeof _app.registerExtension === "function") {
    _app.registerExtension({
        name: "XH.WidgetArchiveGuard",

        async beforeRegisterNodeDef(nodeType, nodeData) {
            if (!isFamilyNodeData(nodeData) || !nodeType?.prototype) return;
            const c = readContract(nodeData);
            const proto = nodeType.prototype;
            PROTO_CONTRACT.set(proto, c);                       // ← 决定性的一份
            CONTRACT.set(nodeData.name, c);                     // 显示名（真机实测）
            const cls = nodeType.comfyClass || nodeType.type
                || nodeData.python_class || nodeData.node_type;
            if (cls) CONTRACT.set(cls, c);                       // class_type（若拿得到）

            // 建节点时：各节点自己的 onNodeCreated 会挂 DOM 控件，包一层在它之后加固；
            // 再加两拍异步，覆盖 DOM widget 异步挂载 / 扩展注册顺序不定的情况。
            const origCreated = proto.onNodeCreated;
            proto.onNodeCreated = function () {
                const r = origCreated ? origCreated.apply(this, arguments) : undefined;
                const self = this;
                try { hardenUiWidgets(self); } catch (e) {}
                try {
                    queueMicrotask(() => { try { hardenUiWidgets(self); } catch (e) {} });
                    setTimeout(() => { try { hardenUiWidgets(self); } catch (e) {} }, 0);
                } catch (e) {}
                return r;
            };

            // 读档时：onConfigure 的 info 就是本节点的原始存档，按名字自愈。
            // 挂在节点原型上 ⇒ graph 对象重建（切换工作流）也不会失效。
            const origConfigure = proto.onConfigure;
            proto.onConfigure = function (info) {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try {
                    this._xhGuardInfo = info;
                    restoreWidgetValues(this, info);
                } catch (e) {}
                return r;
            };
        },

        nodeCreated(node) {
            try { hardenUiWidgets(node); } catch (e) {}
        },

        // 打开 / 切换工作流 / undo 全路径兜底：此时所有 DOM 控件一定已挂载。
        afterConfigureGraph() {
            try {
                const g = _app.graph;
                const nodes = (g && (g.nodes || g._nodes)) || [];
                for (const n of nodes) {
                    if (!n || !contractFor(n)) continue;
                    hardenUiWidgets(n);
                    if (n._xhGuardInfo) restoreWidgetValues(n, n._xhGuardInfo);
                }
            } catch (e) {}
        },
    });
}

try {
    if (typeof window !== "undefined") {
        window.__XH_ARCHIVE_GUARD__ = {
            CONTRACT, readContract, coerceValue, hardenUiWidgets, restoreWidgetValues, dryRun,
            isFamilyNodeData, VERSION: "1",
        };
    }
} catch (e) {}
