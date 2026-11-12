/**
 * ════════════════════════════════════════════════════════════════════════════
 * XiaoHei 家族 · 官方前端 API 兼容层
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   为什么要有这个文件（2026-10-29 建立）：
 *    XiaoHei 家族的前端直接硬编码了大量官方前端/后端的内部接口与数据结构。
 *    ComfyUI 前端每次大版本升级都可能改其中一部分（1.57.1 就改了 5 处），
 *    结果就是「一个升级，全家桶冒烟」——今天一天连修 6 个 bug，全是同一类根因：
 *
 *      ① graph.links        老版是普通对象 → 1.57 改成 **Map**
 *      ② node.size          老版是 Array     → 前端会换成 **Float64Array**
 *      ③ 槽位坐标入口       canvas.getSlotPosition → 改成 **node.getInputPos/getOutputPos**
 *      ④ 连线渲染模式       数字编号 → 官方内部改用**字符串** 'straight'/'linear'/'spline'
 *      ⑤ Reroute 段的渲染   官方把一条 link 拆多段画 ⇒ 上下文必须**按段**存，不能按 id 存
 *
 *   规矩：**任何 XiaoHei 文件要碰官方的数据结构，一律走本文件的函数**，
 *     不要在业务代码里直接写 `graph.links[id]` / `Array.isArray(node.size)` 这类硬取法。
 *     以后官方再升级 ⇒ 只改这一个文件 ⇒ 全家族一次性跟着修。
 *
 *   本文件只做「取法适配」，不含任何业务逻辑、不画任何东西。
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * 按 id 取一条 link。
 * 1.57 的 `graph.links` 是 **Map**（老版是普通对象），
 * 所以 `links[id]` 在新版恒为 undefined ⇒ 必须先判断类型。
 * @param {object} graph  官方图对象（app.graph / canvas.graph / 子图）
 * @param {any} id        link id（数字或字符串都试）
 * @returns {object|null} 官方 LLink 实例，取不到返回 null
 */
export function getLinkById(graph, id) {
    try {
        const L = graph && graph.links;
        if (!L || id === undefined || id === null) return null;
        if (typeof L.get === "function") {
            return L.get(id) ?? L.get(Number(id)) ?? L.get(String(id)) ?? null;
        }
        return L[id] ?? null;
    } catch (e) { return null; }
}

/**
 * 遍历所有 link（Map / 普通对象 都支持）。
 * 老代码用 `for (const id in links)` 遍历 Map ⇒ **循环体一次都不执行**，
 * 这是 1.57 上「XiaoHei 连线效果整个不工作」的直接原因。
 * @param {object} graph
 * @param {(id:any, link:object)=>boolean|void} cb  返回 false 可提前中断
 */
export function eachLink(graph, cb) {
    try {
        const L = graph && graph.links;
        if (!L || typeof cb !== "function") return;
        if (typeof L.entries === "function") {
            for (const [id, l] of L.entries()) { if (cb(id, l) === false) return; }
        } else {
            for (const id of Object.keys(L)) { if (cb(id, L[id]) === false) return; }
        }
    } catch (e) {}
}

/**
 * 取节点尺寸 [宽, 高]。
 *  前端会把 node.size 换成 **Float64Array**（`Array.isArray` 恒 false），
 *    所以不能用 `Array.isArray(node.size)` 当守卫 —— 那是历史 bug 的来源之一。
 */
export function sizeOf(node) {
    try {
        const s = node && node.size;
        if (!s) return [0, 0];
        const w = Number(s[0]), h = Number(s[1]);
        return [Number.isFinite(w) ? w : 0, Number.isFinite(h) ? h : 0];
    } catch (e) { return [0, 0]; }
}

/**
 * 取端口坐标（画布绝对坐标）。
 * 官方有**两套**槽位算法，1.57 的入口是 `node.getInputPos(slot)` / `node.getOutputPos(slot)`，
 * 老的 `canvas.getSlotPosition` / `node.getSlotPosition` 已删除或语义不同 ⇒ 必须按优先级依次试。
 * @param {object} canvas
 * @param {object} node
 * @param {number} slot
 * @param {boolean} isInput
 * @returns {[number,number]|null}
 */
export function getSlotPos(canvas, node, slot, isInput) {
    try {
        // ① 1.57 新入口（最准）
        if (isInput && typeof node?.getInputPos === "function") {
            const p = node.getInputPos(slot);
            if (p && p[0] !== undefined) return [p[0], p[1]];
        }
        if (!isInput && typeof node?.getOutputPos === "function") {
            const p = node.getOutputPos(slot);
            if (p && p[0] !== undefined) return [p[0], p[1]];
        }
        // ② 老入口（老前端）
        const Ctor = canvas && canvas.constructor;
        if (typeof Ctor?.getSlotPosition === "function") {
            const p = Ctor.getSlotPosition(node, slot, !!isInput);
            if (p && (p[0] !== undefined || p.x !== undefined)) {
                return p[0] !== undefined ? [p[0], p[1]] : [p.x, p.y];
            }
        }
        if (typeof node?.getSlotPosition === "function") {
            const p = node.getSlotPosition(slot, !!isInput);
            if (p && p[0] !== undefined) return [p[0], p[1]];
        }
        if (typeof node?.getConnectionPos === "function") {
            const p = node.getConnectionPos(!!isInput, slot);
            if (p) return [p[0], p[1]];
        }
    } catch (e) {}
    return null;
}

/**
 * 取连线渲染模式：'spline' | 'linear' | 'straight'。
 *  官方内部一律用**字符串**（`h.style.mode`）；
 *   `canvas.links_render_mode` 的**数字编号在 1.57 与老版对不上** ⇒ 别拿它当主判据。
 * @param {object} seg        XiaoHei 的段对象（可能带 ctx = 官方渲染上下文）
 * @param {object} canvas
 */
export function getRenderMode(seg, canvas) {
    try {
        const oc = seg && seg.ctx;
        const m = oc && oc.h && oc.h.style && oc.h.style.mode;
        if (m === "spline" || m === "linear" || m === "straight") return m;
    } catch (e) {}
    try {
        const n = canvas && canvas.links_render_mode;
        return n === 0 ? "straight" : n === 1 ? "linear" : "spline";
    } catch (e) { return "spline"; }
}

/**
 * 取 Reroute（路由点）集合 —— 1.57 是 `graph.reroutes`（Map），老版可能是数组。
 * @returns {Array} 至少能拿到对象数组；拿不到返回空数组
 */
export function getReroutes(graph) {
    try {
        const m = graph && graph.reroutes;
        if (!m) return [];
        if (typeof m.values === "function") return [...m.values()];
        if (Array.isArray(m)) return m.slice();
        if (typeof m === "object") return Object.values(m);
    } catch (e) {}
    return [];
}

/**
 * 取 Reroute 对象（按 id）。
 */
export function getRerouteById(graph, id) {
    try {
        if (!graph) return null;
        if (typeof graph.getReroute === "function") {
            const r = graph.getReroute(id);
            if (r) return r;
        }
        const m = graph.reroutes;
        if (m && typeof m.get === "function") return m.get(id) ?? null;
    } catch (e) {}
    return null;
}
