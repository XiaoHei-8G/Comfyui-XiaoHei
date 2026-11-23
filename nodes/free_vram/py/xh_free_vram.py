"""释放显存 XiaoHei - 在流程中途把显存交还。

薄封装：所有决策都是纯函数，放在 _free_vram_helpers.py，无 GPU 也能测。

前端驱动：三档模式、开关、阈值都存在浏览器的 node.properties 上，
由 js/xh_free_vram/index.js 的 graphToPrompt 钩子在排队前注入隐藏输入 XHFreeVramState。

两种接法：
* OUTPUT_NODE = True，所以无论有没有下游，ComfyUI 都会执行它。
  挂在某节点的输出上，那个节点一出值它就触发——「VAE 解码后释放」只需接输入即可。
  这也是最省的一种接法：没有下游时，每轮必跑的 IS_CHANGED 不会让任何人的缓存失效。
* 把值从它穿过，则把它钉在两步之间，适合后面某个阶段必须先用上腾出的空间。

什么都不接的节点完全不做事（见 _free 的第一道 guard）。正是这道 guard 让
OUTPUT_NODE 在这里安全：否则光是把节点拖到画布上看一眼，下次运行就会卸掉所有模型。
"""

import gc
import time

from ._type_helpers import ANY
from ._free_vram_helpers import (
    bar_segments,
    format_bytes,
    headline_freed,
    headline_label,
    parse_state,
    plan,
    should_always_run,
    should_free,
    threshold_bytes,
    uses_driver_view,
)


def _read_memory():
    """(total, free_total, free_driver, device_name) for the main torch device.

    `free_total` is what ComfyUI itself considers available - it counts torch's
    spare reserved blocks, so it is the number that decides whether the next
    model fits. `free_driver` is what the card reports and what nvidia-smi
    shows, which is what matters to anything OUTSIDE this process.
    """
    import comfy.model_management as mm

    dev = mm.get_torch_device()
    total = int(mm.get_total_memory(dev))
    free_total, free_torch = mm.get_free_memory(dev, torch_free_too=True)
    return int(total), int(free_total), int(free_total) - int(free_torch), str(dev)


class XH_FreeVram:
    DESCRIPTION = (
        "在你放置的位置精确释放显存。往里接任何东西，它都会原样输出，所以能塞进任意连线"
        "而不改变流过的内容。\n\n"
        "最常见的用途是两个重量级阶段串在一起：第一个模型还占着显存，第二个就要加载，"
        "结果没地方放，直接爆显存。把本节点接在两段之间，第二个加载前就会先释放第一个。\n\n"
        "节点脸上三档：全部=卸掉模型并把空闲显存交还显卡；仅模型=卸掉模型但保留 ComfyUI"
        "的预留显存，稍快一些；仅缓存=保留模型、只把空闲块交还显卡，适合 ComfyUI 之外的程序要用卡。\n\n"
        "运行后显示回收了多少，配一条整卡的色条。从左到右：灰=仍占用，橙=本节点刚释放，"
        "深=本来就空闲。灰色右边全是空闲显存，橙色就是加了本节点多赚到的部分。\n\n"
        "点齿轮还有更多：是否回收残留、是否每次都执行，以及一个阈值——只在显存真紧张时才动。\n\n"
        "搜索 释放、显存、内存、卸载、清理、缓存、OOM 都能找到它。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "value": (ANY, {
                    "tooltip": (
                        "任何东西都行：图片、模型、latent、文本。它会原样输出。唯一作用是"
                        "决定「何时清理」：节点等它到达才执行，因此会在你接线的那个节点之后运行。"
                        "这里不接线，节点就什么都不做。"
                    ),
                }),
            },
            # Hidden, not required: a required STRING would show as a widget AND
            # as a convertible input dot (Vue Compat #9). The browser injects the
            # real value at graphToPrompt time.
            "hidden": {"XHFreeVramState": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    OUTPUT_TOOLTIPS = (
        "你接进来的东西，原样输出。不接也行：节点照样执行。当后面某一步必须先用上腾出的"
        "空间时，从这里往下接，而不是从上面的节点接。",
    )
    FUNCTION = "run"
    # Runs even with nothing downstream, so hanging the node off an output is a
    # valid placement rather than a silently dead one. Safe only because _free
    # does nothing when the INPUT is unwired.
    OUTPUT_NODE = True
    CATEGORY = "XiaoHei/工具"

    @classmethod
    def IS_CHANGED(cls, XHFreeVramState="{}", **kwargs):
        # A node whose whole point is a side effect has to be able to opt out of
        # caching, or it is skipped in exactly the case it was added for. The
        # cost is real and is why this is a setting rather than always NaN: a
        # node that never matches its previous key forces everything downstream
        # of it to re-run too (see should_always_run).
        state = parse_state(XHFreeVramState)
        if should_always_run(state):
            return float("nan")
        return XHFreeVramState

    def run(self, value=None, XHFreeVramState="{}"):
        state = parse_state(XHFreeVramState)
        report = self._free(state, wired=value is not None)
        # A CACHED node still replays its executed event carrying this same
        # payload, so the browser needs a way to tell a real run from a replay -
        # otherwise the face would claim it freed memory on a run where it never
        # executed at all. A monotonic clock read is enough: it can only change
        # when this method actually ran.
        report["stamp"] = time.perf_counter()
        return {"ui": {"xh_free_vram": [report]}, "result": (value,)}

    def _free(self, state, wired=True):
        # An OUTPUT_NODE runs on every prompt, so a node someone dropped on the
        # canvas to look at would otherwise unload every model each run. An
        # unconnected optional input never reaches the prompt at all, so it
        # arrives as None - that is the whole test.
        if not wired:
            return {
                "ok": True, "skipped": True, "reason": "nothing wired in",
                "message": "本节点没有接线，没有可执行的时机。",
                "unwired": True, "mode": state["mode"],
            }
        steps = plan(state)
        try:
            total, comfy_before, driver_before, device = _read_memory()
        except Exception as exc:  # no torch device, an exotic backend, anything
            return {
                "ok": False,
                "message": "无法读取显存：%s" % exc,
                "mode": state["mode"],
            }

        # ONE decision, taken once, drives the THRESHOLD GATE, the headline, the
        # bar and the readout - so they can never contradict each other.
        #
        # It was applied to the headline alone at first, and the two consumers
        # left behind both misbehaved in Cache mode: the gate measured ComfyUI's
        # free figure (which cache-emptying does not move), so it skipped exactly
        # when an outside app was starving; and the bar drew its orange from the
        # same unmoving pair, so the face could read "returned 6.0 GB" above a bar
        # with no orange in it. Both reproduced before this was changed.
        before = driver_before if uses_driver_view(state) else comfy_before

        go, reason = should_free(state, before)
        if not go:
            limit = threshold_bytes(state)
            used, just, was = bar_segments(total, before, before)
            return {
                "ok": True,
                "skipped": True,
                "reason": reason,
                "message": "已有 %s 空闲，超过 %s 的阈值" % (
                    format_bytes(before), format_bytes(limit)),
                "mode": state["mode"], "device": device,
                "total": total, "before": before, "after": before,
                "comfyBefore": comfy_before, "comfyAfter": comfy_before,
                "driverBefore": driver_before, "driverAfter": driver_before,
                # The mode's own word even here, so a skipped Cache run does not
                # call itself "freed" when a real one would say "returned".
                "freed": 0, "label": headline_label(state),
                "bar": [used, just, was],
            }

        try:
            import comfy.model_management as mm

            # ORDER MATTERS. Unload first so the tensors are dropped, collect so
            # anything holding them in a reference cycle lets go, and only THEN
            # empty the cache - emptying it can only return blocks that are
            # already free, so doing it first would return almost nothing.
            if steps["models"]:
                mm.unload_all_models()
            if steps["gc"]:
                gc.collect()
            if steps["cache"]:
                mm.soft_empty_cache(True)
        except Exception as exc:
            return {
                "ok": False,
                "message": "无法释放显存：%s" % exc,
                "mode": state["mode"], "device": device,
            }

        try:
            _t, comfy_after, driver_after, _d = _read_memory()
        except Exception:
            comfy_after, driver_after = comfy_before, driver_before

        after = driver_after if uses_driver_view(state) else comfy_after
        freed, label = headline_freed(state, comfy_before, comfy_after,
                                      driver_before, driver_after)
        used, just, was = bar_segments(total, before, after)
        return {
            "ok": True,
            "skipped": False,
            "reason": "",
            "message": "",
            "mode": state["mode"], "device": device,
            # before/after are the pair this MODE reasons in - the bar and the
            # readout follow them. The two raw pairs ride along unchanged so the
            # hover tooltip can still show both views side by side.
            "total": total, "before": before, "after": after,
            "comfyBefore": comfy_before, "comfyAfter": comfy_after,
            "driverBefore": driver_before, "driverAfter": driver_after,
            "freed": freed, "label": label,
            "bar": [used, just, was],
        }


NODE_CLASS_MAPPINGS = {"XH_FreeVram": XH_FreeVram}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_FreeVram": "释放显存"}
