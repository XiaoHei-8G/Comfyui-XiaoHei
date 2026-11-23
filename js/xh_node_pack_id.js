// XiaoHei 家族 · 节点包来源标记守卫（Node Pack ID Guard）
//
// 【修的是什么】
//   把工作流分享给别人，对方打开后 ComfyUI 报「缺失包 WepeNerd/ComfyUI-WepeNerd」
//   或「未知包」，明明用的是小黑家族的节点。
//
//   根因不在代码、也不在 class_type，而在工作流 JSON 里每个节点 properties 的
//   「来自哪个包」标记。新版 ComfyUI 前端判「缺失包 / 归属」时只读这两个字段：
//       getPackId = e => e.cnr_id || e.aux_id
//   不看代码、不看 class_type。家族 1:1 复刻节点最初从原作者包拖进画布，
//   ComfyUI 自动写进了原包的 aux_id（WepeNerd/ComfyUI-WepeNerd、
//   ComfyUI-Pixaroma …），复刻时只改了 class_type，这个标记没清，一直遗传到
//   所有分享出去的工作流里，粉丝就被骗去装原作者的包（装了也没用，原包注册
//   的是 WN_* / Pixaroma*，不是我们的 XH_*）。
//
// 【本守卫做什么】
//   ① 建节点时（onNodeCreated）：家族节点强制写 cnr_id = 'comfyui-xiaohei'，
//      并清掉任何继承来的 aux_id。以后新拖的节点天生自带正确标记。
//   ② 打开 / 切换工作流（afterConfigureGraph）：把已加载的家族节点里残留的
//      错标记就地改正 —— 粉丝拿旧存档打开也能自愈，保存后就是干净的。
//
// 【边界】
//   只碰「确实属于本家族」的节点（复用 xh_widget_archive_guard 的家族判定口径），
//   ⛔ 绝不碰第三方节点（KJNodes / Pixaroma 原版 / rgthree …），⛔ 不改 class_type。
//   加载路径只读不写 node 执行数据，仅改 properties.cnr_id/aux_id。

(function () {
    "use strict";

    const PACK_ID = "comfyui-xiaohei";

    function getApp() {
        try {
            const c = window.comfyAPI && window.comfyAPI.app;
            return (c && c.app) || c || null;
        } catch (e) { return null; }
    }

    // 家族判定：与 xh_widget_archive_guard::isFamilyNodeData 同一口径。
    // 优先复用已挂的全局实现，取不到则用同款内联判据，避免跨模块 import 顺序问题。
    function isFamily(nodeOrData) {
        if (!nodeOrData) return false;
        try {
            const g = window.__XH_ARCHIVE_GUARD__;
            if (g && typeof g.isFamilyNodeData === "function" && g.isFamilyNodeData(nodeOrData)) return true;
        } catch (e) {}
        const pm = String(nodeOrData.python_module || "");
        const cat = String(nodeOrData.category || "");
        const type = String(nodeOrData.type || nodeOrData.comfyClass || nodeOrData.name || "");
        return pm.includes("Comfyui-XiaoHei") || pm.includes("Comfyui-XH_Toolbox")
            || cat.startsWith("XiaoHei/") || cat.startsWith("🔁XH/")
            || /^XH/.test(type);
    }

    function allNodes(app) {
        const out = [];
        try {
            const g = app && (app.graph || (window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.graph));
            if (!g) return out;
            if (g._nodes) out.push(...g._nodes);
            else if (g.nodes) out.push(...g.nodes);
            // 子图里的节点也要覆盖（分组 / 工作流常在子图里）
            const subs = g._subgraphs || (typeof g.subgraphs === "function" ? g.subgraphs() : null);
            if (subs) {
                for (const s of (subs.values ? subs.values() : subs)) {
                    const sn = (s && (s._nodes || s.nodes)) || [];
                    out.push(...sn);
                }
            }
        } catch (e) {}
        return out;
    }

    // 给单个家族节点打正确标记。返回是否发生了改动。
    function stamp(node) {
        if (!isFamily(node)) return false;
        const pr = node.properties;
        if (!pr || typeof pr !== "object") return false;
        let changed = false;
        if (pr.cnr_id !== PACK_ID) { pr.cnr_id = PACK_ID; changed = true; }
        // 有 aux_id 就清掉（它是错标记的来源；没有则不新增，保持干净存档）
        if (pr.aux_id !== undefined) { delete pr.aux_id; changed = true; }
        return changed;
    }

    function stampAll(app) {
        let n = 0;
        try {
            for (const node of allNodes(app)) {
                if (stamp(node)) n++;
            }
        } catch (e) {}
        return n;
    }

    const app = getApp();
    if (app && typeof app.registerExtension === "function") {
        app.registerExtension({
            name: "XH.NodePackIdGuard",

            async beforeRegisterNodeDef(nodeType, nodeData) {
                if (!isFamily(nodeData) || !nodeType || !nodeType.prototype) return;
                const proto = nodeType.prototype;
                const orig = proto.onNodeCreated;
                proto.onNodeCreated = function () {
                    const r = orig ? orig.apply(this, arguments) : undefined;
                    try { stamp(this); } catch (e) {}
                    try { queueMicrotask(() => { try { stamp(this); } catch (e) {} }); } catch (e) {}
                    return r;
                };
            },

            nodeCreated(node) {
                try { stamp(node); } catch (e) {}
            },

            // 打开 / 切换工作流 / undo 全路径兜底
            afterConfigureGraph() {
                try { stampAll(app); } catch (e) {}
            },
        });
    }

    try {
        if (typeof window !== "undefined") {
            window.__XH_PACK_ID_GUARD__ = { stamp, stampAll, isFamily, PACK_ID };
        }
    } catch (e) {}
})();
