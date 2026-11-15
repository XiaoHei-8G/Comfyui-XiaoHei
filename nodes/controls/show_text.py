# XiaoHei-预览任意（XHShowText）· 官方 PreviewAny 的 1:1 复刻
#
# 2026-11-14 用户要求「完全复刻官方预览任意节点」。本轮真源（全部本机实读）：
#   · comfy_extras/nodes_preview_any.py     → class PreviewAny
#   · static/assets/core-*.js               → Comfy.PreviewAny 扩展，并把
#       addTextPreviewWidgets / updateTextPreviewWidgets 公开到
#       window.comfyAPI.textPreviewWidgets
#   · static/assets/WidgetTextPreview-*.js  → 官方显示组件（Textarea / Markdown
#       渲染 / hover 复制·下载）
#   · static/assets/nodeDefs-*(zh).js       → 中文名「预览任意」、端口「源」
#   · /object_info/PreviewAny               → 服务端真实 schema
#
# 复刻清单（与官方逐项对齐，⛔ 别再自作主张改）：
#   ① 输入名 source，类型 "*"（= IO.ANY），spec 空 {}（**没有 forceInput**）；
#      前端对 "*" 天然只画端口不画输入框（app-*.js 的 addInputSocket 实锤）。
#   ② RETURN_TYPES = ("STRING",)，输出的是**转好的可读字符串**，不是原始对象。
#   ③ FUNCTION = "main"、OUTPUT_NODE = True、DESCRIPTION 与官方中文一致。
#   ④ 序列化算法照搬：set_printoptions(edgeitems=6) → str / json.dumps(indent=4,
#      ensure_ascii=False) / str 兜底 → 恢复 printoptions。
#   ⑤ 返回 {"ui": {"text": (value,)}, "result": (value,)}（单元素 tuple；官方前端
#      toPreviewText 会把数组用 \n\n 拼起来）。
#   ⑥ 前端 js/xh_show_text.js 直接调官方公开 API 挂 preview_text 组件 +
#      preview_mode(Plain text / Markdown) 切换 ⇒ 与官方同一套 Vue 组件。
#
# 🔴 唯一与官方不同（刻意保留，别改回去）：
#   source 放 **optional** 而不是 required。官方自己空输入提交会被判
#   required_input_missing（本机 validate_prompt 实测 valid=False）⇒ 节点套红框，
#   正是 2026-11-14 用户报过的那个 bug。复刻不复制 bug；代价仅是端口点是空心圆。
#
# 家族归属（不影响外观）：class_type 仍是 XHShowText（老工作流认得出）、
#   CATEGORY "XiaoHei/工具"、中文显示名「预览任意」、SEARCH_ALIASES 保留旧叫法
#   「显示任何 / 显示文本」⇒ 老用户照旧搜得到。

import json

import torch


class XHShowText:
    """预览任意 —— 官方 PreviewAny 的 XiaoHei 复刻（详见文件头复刻清单）。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "source": ("*", {}),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "main"
    OUTPUT_NODE = True

    CATEGORY = "XiaoHei/工具"
    SEARCH_ALIASES = [
        "preview", "preview text", "show output", "inspect", "debug",
        "print value", "show text", "预览任意", "显示任何", "显示文本",
    ]
    DESCRIPTION = "将任意输入值以文本形式预览。"

    def main(self, source=None):
        torch.set_printoptions(edgeitems=6)
        value = "None"
        if isinstance(source, str):
            value = source
        elif isinstance(source, (int, float, bool)):
            value = str(source)
        elif source is not None:
            try:
                value = json.dumps(source, indent=4, ensure_ascii=False)
            except Exception:
                try:
                    value = str(source)
                except Exception:
                    value = "source exists, but could not be serialized."
        torch.set_printoptions()
        return {"ui": {"text": (value,)}, "result": (value,)}


NODE_CLASS_MAPPINGS = {"XHShowText": XHShowText}
NODE_DISPLAY_NAME_MAPPINGS = {"XHShowText": "预览任意"}
