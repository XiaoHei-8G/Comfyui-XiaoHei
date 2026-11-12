import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { repaint } from "../shared/repaint.mjs";
import {
    ClipLooper, V2_MARKER, VALUES_MARKER, WATCHED, describe, linkedValue, migrateLegacyValues, migrateV2Values,
    planClip, resolveFormatName, windowToFrames,
} from "./load_video.mjs";

const LINE = 15;
let presetsRequest = null;

function loadPresets() {
    presetsRequest ??= api.fetchApi("/xh/wn/frame_number/presets")
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({}));
    return presetsRequest;
}

const widgetOf = (node, name) => node.widgets?.find((widget) => widget.name === name);

// Current settings. A connected input uses the value of the node it is connected to when the browser
// can read it (Duration Selector, primitives, Number Convert, Get/Set), so the readout and preview
// follow that node live. Otherwise it falls back to the setting's own value, marked approximate.
function settingsOf(node, presets) {
    const settings = { approximate: [] };
    for (const name of WATCHED) {
        const linked = linkedValue(node.graph ?? app.graph, node, name, presets);
        if (linked.linked && linked.unknown) settings.approximate.push(name);
        settings[name] = linked.linked && !linked.unknown ? linked.value : widgetOf(node, name)?.value;
    }
    for (const name of WATCHED.slice(1, -1)) settings[name] = Number(settings[name]) || 0;
    settings.select_every_nth = Math.max(1, settings.select_every_nth);
    return settings;
}

// Autoplay the source preview muted, and loop it over the clip the current settings load.
function enhancePreview(node, looper, onLoaded) {
    const observers = new Map();
    const players = new Set();
    function watch(container) {
        if (!container || observers.has(container)) return;
        const update = () => {
            for (const player of players) {
                if (!player.isConnected) {
                    player.pause();
                    looper.detach(player);
                    players.delete(player);
                }
            }
            for (const player of container.querySelectorAll("video")) {
                if (players.has(player)) continue;
                players.add(player);
                player.autoplay = true;
                player.defaultMuted = true;
                player.muted = true;
                player.loop = true;
                player.playsInline = true;
                player.controls = true;
                looper.attach(player);
                player.addEventListener?.("loadeddata", () => onLoaded?.());
                player.play().catch(() => { /* Playback controls remain available if autoplay is blocked. */ });
            }
        };
        const observer = new MutationObserver(update);
        observer.observe(container, { childList: true, subtree: true });
        observers.set(container, observer);
        update();
    }
    const addDOMWidget = node.addDOMWidget;
    node.addDOMWidget = function (name, type, element, options) {
        const widget = addDOMWidget.apply(this, arguments);
        if (type === "video") {
            watch(element);
            const onRemove = widget.onRemove;
            widget.onRemove = function () {
                observers.get(element)?.disconnect();
                observers.delete(element);
                for (const player of element.querySelectorAll("video")) {
                    player.pause();
                    looper.detach(player);
                    players.delete(player);
                }
                return onRemove?.apply(this, arguments);
            };
        }
        return widget;
    };
    watch(node.videoContainer);
    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        for (const observer of observers.values()) observer.disconnect();
        for (const player of players) player.pause();
        looper.clear();
        observers.clear();
        players.clear();
        return onRemoved?.apply(this, arguments);
    };
}

function installInfo(node) {
    const looper = new ClipLooper();
    const state = { key: null, video: null, info: null, presets: {}, lines: null, request: 0, retry: null };
    loadPresets().then((presets) => {
        state.presets = presets;
        state.key = null;
        repaint(node, false);
    });

    const presetFor = (name) => {
        const preset = state.presets[name];
        return preset ? { rule: preset.rule, frames: preset.frames, min: preset.min, max: preset.max } : null;
    };

    // Retry delays (ms) while the server doesn't have the file yet. Dropping a video on the node sets
    // its name as the upload starts, so the first request can arrive before the file does.
    const RETRIES = [300, 600, 1000, 1500, 2000, 3000, 5000, 8000];

    function fetchInfo(video, attempt = 0, keep = false) {
        const request = ++state.request;
        state.video = video;
        if (attempt === 0 && !keep) state.info = null;
        clearTimeout(state.retry);
        if (!video) return;
        api.fetchApi(`/xh/wn/load_video/info?video=${encodeURIComponent(video)}`)
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (response.ok) return data;
                return { error: data.error || "Couldn't read this video.", missing: response.status === 404 };
            })
            .catch(() => ({ error: "Couldn't reach ComfyUI to read this video.", missing: true }))
            .then((info) => {
                if (state.video !== video || state.request !== request) return;
                if (info.missing && attempt < RETRIES.length) {
                    // Still "Reading video…": try again shortly instead of showing an error.
                    state.retry = setTimeout(() => fetchInfo(video, attempt + 1, keep), RETRIES[attempt]);
                    return;
                }
                state.info = info;
                state.key = null;
                repaint(node, false);
            });
    }

    // The preview finished loading a file from the server, so it exists now. Read it again (keeping
    // the current readout meanwhile) in case an earlier attempt failed or the file was replaced
    // under the same name. The server caches the answer, so this is cheap.
    function previewLoaded() {
        if (state.video) fetchInfo(state.video, 0, Boolean(state.info && !state.info.error));
    }

    // Recompute whenever a watched value changes, however it changed (typing, loading a workflow,
    // an upload, or a change on a connected node), by comparing values each time the widget is drawn.
    function refresh() {
        convertWindow();
        const settings = settingsOf(node, state.presets);
        const key = JSON.stringify(settings);
        if (key === state.key) return;
        state.key = key;
        if (settings.video !== state.video) fetchInfo(settings.video);
        const preset = presetFor(settings.format);
        state.lines = describe(state.info, settings, preset, settings.format);
        if (state.info && !state.info.error) {
            const plan = planClip(state.info, settings, preset);
            looper.setRange(plan.clip_start, plan.count ? plan.clip_end : NaN);
        } else {
            looper.setRange(NaN, NaN);
        }
    }

    const widget = {
        name: "clip_info", type: "wn_video_info", value: "", options: { serialize: false },
        serialize: false,
        computeSize: (width) => [width ?? 300, LINE * 3 + 6],
        draw(ctx, _node, width, y) {
            refresh();
            const lines = state.lines;
            ctx.save();
            ctx.font = "11px Arial, sans-serif";
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            const fit = (text) => {
                const room = width - 30;
                if (ctx.measureText(text).width <= room) return text;
                while (text.length > 1 && ctx.measureText(`${text}…`).width > room) text = text.slice(0, -1);
                return `${text}…`;
            };
            const rows = !lines ? [["", "#8a8a8a"]] : !state.info && state.video ? [["Reading video…", "#8a8a8a"]] : [
                [lines.source, "#8a8a8a"],
                [lines.output, "#cfcfcf"],
                [lines.note, lines.warn ? "#e0a050" : "#8a8a8a"],
            ];
            rows.forEach(([text, color], index) => {
                if (!text) return;
                ctx.fillStyle = color;
                ctx.fillText(fit(text), 15, y + 3 + LINE * index + LINE / 2);
            });
            ctx.restore();
        },
        mouse: () => false,
    };
    node.addCustomWidget ? node.addCustomWidget(widget) : node.widgets?.push(widget);

    //  2026-11-08 Nodes 2.0（Vue 渲染）兼容
    //   实锤（Chromium + CDP 对照实测，Classic vs Nodes 2.0）：
    //     Classic   ：clip_info.draw() 调用 0 → 32 → 340 次（画布每帧重绘 ⇒ 每帧都跑 refresh()）
    //     Nodes 2.0 ：clip_info.draw() 调用 0 → 0 → 0 次（DOM canvas 只在 triggerDraw 时重绘）
    //   ⇒ 这不是「重绘通道」问题，而是**刷新入口问题**：refresh() 只写在 draw() 里，
    //     而 Nodes 2.0 下 draw() 不再被周期性调用 ⇒ 改了 video 之后读数条永远不更新。
    //   ⇒ 修法：把「重算 + 重绘」从 draw() 里解耦出来，独立挂到被监听 widget 的 callback 上。
    //     被监听的 widget 一改值 → 立刻重算并重绘，不等画布重绘周期。
    //   ⇒ Classic 下同样有效（只是比原来更及时），且 draw() 里的 refresh() 保留作为兜底。
    const watched = ["video", "frame_load_cap", "frame_rate", "skip_first_frames", "select_every_nth", "format"];
    const onWatchedChanged = () => {
        // state.key = null 强制 refresh() 认为「值变了」，从而重算 state.lines
        state.key = null;
        refresh();
        repaint(node, false);
    };
    for (const name of watched) {
        const item = widgetOf(node, name);
        if (!item || typeof item.callback !== "function") continue;
        const callback = item.callback;
        item.callback = function (...args) {
            const result = callback?.apply(this, args);
            onWatchedChanged();
            return result;
        };
    }

    // Picking a model preset also sets its native frame rate (only when you pick it, not on load).
    const format = widgetOf(node, "format");
    if (format) {
        const callback = format.callback;
        format.callback = function (value) {
            const result = callback?.apply(this, arguments);
            const fps = state.presets[value]?.fps;
            const rate = widgetOf(node, "frame_rate");
            if (fps && rate) {
                rate.value = fps;
                rate.callback?.(fps);
            }
            repaint(node);
            return result;
        };
    }
    enhancePreview(node, looper, previewLoaded);
    // A workflow saved with start_time/duration: turn them into skip and cap once the frame rate is known
    // (the frame_rate setting, or the video's own once it has been read).
    function convertWindow() {
        const pending = state.pendingWindow;
        if (!pending) return;
        const fps = Number(pending.frame_rate) || (state.info && !state.info.error ? state.info.fps : 0);
        if (!fps) return;
        state.pendingWindow = null;
        for (const [name, value] of Object.entries(windowToFrames(pending, fps))) {
            const widget = widgetOf(node, name);
            if (widget) widget.value = value;
        }
        state.key = null;
    }

    return {
        refresh: () => { state.key = null; },
        convertWindow: (values) => {
            state.pendingWindow = values.start_time > 0 || values.duration > 0 ? values : null;
            state.key = null;
        },
    };
}

// Put the values of a workflow saved with an earlier settings layout back onto the right widgets.
function migrate(node, info) {
    if (!info || info.properties?.[VALUES_MARKER]) return;
    const v2 = Boolean(info.properties?.[V2_MARKER]);
    const values = v2 ? migrateV2Values(info.widgets_values) : migrateLegacyValues(info.widgets_values);
    if (!values) return;
    for (const [name, value] of Object.entries(values)) {
        const widget = widgetOf(node, name);
        if (widget) widget.value = value;
    }
    if (v2) node.wnLoadVideo?.convertWindow(values);
}

function fixFormat(node) {
    const format = widgetOf(node, "format");
    const names = format?.options?.values;
    if (Array.isArray(names)) format.value = resolveFormatName(format.value, names);
}

app.registerExtension({
    name: "XH.WN.LoadVideo",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "XH_WN_LoadVideo") return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            this.properties ??= {};
            this.properties[VALUES_MARKER] = true;
            this.wnLoadVideo = installInfo(this);
            return result;
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);
            const apply = () => {
                migrate(this, info);
                fixFormat(this);
                this.properties ??= {};
                this.properties[VALUES_MARKER] = true;
                this.wnLoadVideo?.refresh();
                repaint(this);
            };
            apply();
            // Widget values may be applied after onConfigure in some frontend versions.
            setTimeout(apply, 0);
            return result;
        };
    },
});
