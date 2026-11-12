// VAE DeGrid: show the measured grid strength under the node after each run.
import { app } from "../../../scripts/app.js";
import { repaint } from "../shared/repaint.mjs";
import { wrapText } from "../shared/text_wrap.mjs";
//  2026-11-09 读数条双语化：后端 vae_degrid_core.status_lines 现在吐 {"zh":..., "en":...}，
//    按当前 XiaoHei-LANG 挑一份显示 ⇒ 跟随家族语言开关。 只影响界面读数。
import { wnBiLine, wnUIFull } from "./xh_wn_i18n.mjs";
import { currentLang, onLangChanged } from "../xh_ui_kit.js";

const NODE_NAME = "XH_WN_VAEDeGrid";
const LINE_HEIGHT = 16;
const DEGRID_NODES = new Set();

// 后端给的是双语对象；旧版后端给的是纯文本（那时走词典翻译）。
const pickBi = (item) => (item && typeof item === "object")
    ? wnBiLine(item, currentLang())
    : wnUIFull(String(item ?? ""), currentLang());

function installReadout(node) {
    const state = { lines: ["Run once to measure the grid."], rows: 0 };
    const widget = {
        name: "degrid_status", type: "wn_degrid_status", value: "", serialize: false,
        options: { serialize: false },
        computeSize: (width) => [width ?? 300, LINE_HEIGHT * Math.max(1, state.rows ?? state.lines.length) + 8],
        draw(ctx, _node, width, y) {
            ctx.save();
            ctx.font = "11px Arial, sans-serif";
            ctx.textBaseline = "top";
            let row = 0;
            for (const [index, item] of state.lines.entries()) {
                ctx.fillStyle = index === 0 ? "#cfcfcf" : "#9a9a9a";
                //  2026-11-09 中文断行：原来按空格切词，中文没有空格 ⇒ 整句画到节点外面。
                for (const line of wrapText(ctx, pickBi(item), width - 28)) {
                    ctx.fillText(line, 14, y + 4 + LINE_HEIGHT * row++);
                }
            }
            ctx.restore();
            if (row !== state.rows) {
                state.rows = row;
                queueMicrotask(() => node.setSize?.([node.size[0], node.computeSize()[1]]));
            }
        },
        mouse: () => false,
    };
    node.addCustomWidget ? node.addCustomWidget(widget) : node.widgets?.push(widget);
    const onExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        if (Array.isArray(message?.text) && message.text.length) state.lines = message.text;
        repaint(node);
        return onExecuted?.apply(this, arguments);
    };
    DEGRID_NODES.add(node);
    node.wnRefreshDegrid = () => {
        state.rows = 0;
        node.setSize?.([node.size[0], node.computeSize()[1]]);
        repaint(node);
    };
}

// 语言开关一动，跟着刷读数条
onLangChanged(() => {
    for (const n of DEGRID_NODES) {
        try { n.wnRefreshDegrid?.(); } catch (e) { /* 单个节点失败不影响其它 */ }
    }
}, { initialDelay: 260 });

app.registerExtension({
    name: "XH.WN.VAEDeGrid",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            installReadout(this);
            return result;
        };
    },
});
