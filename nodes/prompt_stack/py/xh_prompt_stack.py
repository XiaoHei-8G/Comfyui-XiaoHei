# 1:1 学 ComfyUI-Pixaroma / nodes/node_prompt_stack.py（MIT, Copyright (c) 2026 pixaroma）。
# 分工照抄：每一行「开着 / 关着」、行里的字、行的顺序、分隔符，全在前端
# app.graphToPrompt 钩子里打包进隐藏输入 XHStackState；本文件只解析这段 JSON
# 并按顺序拼接成一个 STRING。行名（label）只是给用户自己看的，不进提示词。
# 因此纯 API / 无浏览器运行时送的是 "{}"，此时输出空串 —— 与原版一致。
import json


class XH_PromptStack:
    DESCRIPTION = (
        "【干什么】把提示词拆成一行一行分别写，每行能单独开 / 关、能拖着换顺序，"
        "开着的行按顺序拼成一段完整的提示词。\n"
        "【怎么配】点「＋ 加一行」加一段；拖行左侧的把手换顺序；点行上的「开 / 关」"
        "决定这段要不要；点齿轮开右侧设置窗口，改每行之间用什么隔开。\n"
        "【怎么用】text 输出口接提示词编码节点。行名只是给自己看的备注，不会进提示词；"
        "行尾多打一个逗号会自动去掉，空行会跳过。\n"
        "【存在哪】所有行存在工作流里（节点属性），会随工作流一起保存和分享。\n"
        "【输出】STRING：开着的行按当前顺序拼接后的提示词。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            # 前端注入：{"rows":[{"enabled":true,"text":"..."}],"separator":", "}
            "hidden": {"XHStackState": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("开着的行按顺序拼接后的一整段提示词。",)
    FUNCTION = "build"
    CATEGORY = "XiaoHei/提示词"

    @staticmethod
    def _parse_state(raw):
        try:
            state = json.loads(raw) if isinstance(raw, str) else {}
        except (ValueError, TypeError, RecursionError):
            state = {}
        if not isinstance(state, dict):
            state = {}
        rows = state.get("rows")
        rows = rows if isinstance(rows, list) else []
        sep = state.get("separator")
        sep = sep if isinstance(sep, str) and len(sep) <= 16 else ", "
        return rows, sep

    def build(self, XHStackState="{}"):
        rows, sep = self._parse_state(XHStackState)
        out_parts = []
        for row in rows:
            if not isinstance(row, dict) or not row.get("enabled"):
                continue
            txt = row.get("text", "")
            if not isinstance(txt, str):
                continue
            txt = txt.strip()
            if txt.endswith(","):
                txt = txt[:-1].rstrip()
            if not txt:
                continue
            out_parts.append(txt)
        return (sep.join(out_parts),)


NODE_CLASS_MAPPINGS = {"XH_PromptStack": XH_PromptStack}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_PromptStack": "提示词堆叠 小黑"}
