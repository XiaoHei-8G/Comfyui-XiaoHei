# 1:1 复刻 ComfyUI-Pixaroma / nodes/node_prompt_pack.py（MIT, Copyright (c) 2026 pixaroma）。
# 只改三类接线标识：class_type XH_PromptPack / 隐藏输入 XHPromptPackState / import 路径。
# 逻辑与契约逐条照抄：
#   前端把一大块提示词按选中的分隔方式拆成 N 条，点「运行」时包装 app.queuePrompt，
#   一条提示词提交一次工作流；每次提交前 graphToPrompt 钩子把当前那条写进隐藏输入。
#   本文件只从隐藏输入里读回 activePrompt 并原样输出 STRING。
#   纯 API / 无浏览器运行时送的是 "{}"，此时输出空串 —— 与原版一致。
import json


class XH_PromptPack:
    DESCRIPTION = (
        "【干什么】把一整块提示词粘进来，选好它们是怎么分开的，点「运行」就会"
        "一条一条自动排队，每条提示词各跑一次工作流。\n"
        "【怎么配】顶上三颗小方片选分隔方式：空行（长提示词）、每行（短清单）、"
        "--- 线（提示词自己带空行时用）。右下角的数字就是现在框里能拆出几条。\n"
        "【怎么用】text 输出口接提示词编码节点。空的提示词会自动跳过；框是空的时候"
        "点运行会弹提示，不会排队。\n"
        "【存在哪】框里的字和选中的分隔方式存在工作流里，会随工作流一起保存和分享。\n"
        "【输出】STRING：当前这一轮排队要用的那一条提示词。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            # 前端注入：{"version":1,"activePrompt":"..."}
            "hidden": {"XHPromptPackState": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("当前这一轮排队要用的那一条提示词，接提示词编码节点。",)
    FUNCTION = "build"
    CATEGORY = "XiaoHei/提示词"

    @classmethod
    def IS_CHANGED(cls, XHPromptPackState="{}", **kwargs):
        return XHPromptPackState

    def build(self, XHPromptPackState="{}"):
        try:
            state = json.loads(XHPromptPackState) if XHPromptPackState else {}
            if not isinstance(state, dict):
                state = {}
        except (ValueError, TypeError):
            print("[XiaoHei] 提示词批量：隐藏输入不是合法 JSON，按空处理")
            state = {}

        active = state.get("activePrompt", "")
        if not isinstance(active, str):
            active = ""

        return (active,)


NODE_CLASS_MAPPINGS = {"XH_PromptPack": XH_PromptPack}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_PromptPack": "提示词批量 小黑"}
