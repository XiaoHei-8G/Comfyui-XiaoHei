# 1:1 学 ComfyUI-Pixaroma / nodes/node_prompt.py（MIT）。
# 分工照抄：@标签的展开发生在前端 app.graphToPrompt 钩子里，
# 展开后的整段文字 + 拼接顺序 + 分隔符被塞进隐藏输入 TagPromptState；
# 本文件只解析这段 JSON，并与真正接进来的 text_in 拼接后输出。
# 因此纯 API / 无浏览器运行时送的是 "{}"，此时只输出上游文字 —— 与原版一致。
import json


def _as_text(v):
    return v if isinstance(v, str) else ""


class XH_TagPrompt:
    DESCRIPTION = (
        "【干什么】一个能调用「标签库」的提示词文本框。框里只写短记号，"
        "@名字 展开成整段文字、*分类 每次随机挑该类里一个标签、#清单 每次随机抽一行。\n"
        "【怎么配】节点上点「标签库」新建 / 改标签；点齿轮开右侧设置窗口改拼接顺序、"
        "分隔符、展开预览。敲 @ / * / # 会弹出可搜索的补全列表。\n"
        "【怎么用】text 输入口可接上游文字（可选），text 输出口接提示词编码节点。"
        "「展开预览」只给你看，不会改写框里的字；真正替换在点「运行」那一刻。\n"
        "【存在哪】标签库只存在本机 ComfyUI 设置里，不写进工作流、不随工作流分享；"
        "想搬家用库面板里的「导出 / 导入」。\n"
        "【输出】STRING：展开后的提示词（有上游时按设置拼接）。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "text_in": (
                    "STRING",
                    {
                        "forceInput": True,
                        "tooltip": "可选：接上游文字，与本框内容按设置里的顺序拼接。不接就只输出本框内容。",
                    },
                ),
            },
            # 前端注入：{"text": <展开后的提示词>, "order": "mine"|"wired", "sep": <分隔符>}
            "hidden": {"TagPromptState": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("本框提示词（@标签已展开），按设置与上游文字拼接后的结果。",)
    FUNCTION = "run"
    CATEGORY = "XiaoHei/提示词"

    @staticmethod
    def _parse_state(raw):
        try:
            state = json.loads(raw) if isinstance(raw, str) else {}
        except (ValueError, TypeError, RecursionError):
            state = {}
        if not isinstance(state, dict):
            state = {}
        mine = _as_text(state.get("text"))
        order = state.get("order")
        order = order if order in ("mine", "wired") else "mine"
        sep = state.get("sep")
        sep = sep if isinstance(sep, str) and len(sep) <= 16 else ", "
        return mine, order, sep

    def run(self, text_in=None, TagPromptState="{}"):
        mine, order, sep = self._parse_state(TagPromptState)
        if isinstance(text_in, (list, tuple)):
            text_in = text_in[0] if text_in else ""
        other = _as_text(text_in)
        if not other.strip():
            return (mine,)
        if not mine.strip():
            return (other,)
        if order == "wired":
            return (other + sep + mine,)
        return (mine + sep + other,)


NODE_CLASS_MAPPINGS = {"XH_TagPrompt": XH_TagPrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"XH_TagPrompt": "标签提示词 小黑"}
