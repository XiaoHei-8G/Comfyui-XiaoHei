# 1:1 复刻 ComfyUI-Pixaroma/nodes/node_label.py
# 只改了：类名 / 显示名 / 分类 / 说明与 tooltip 中文化 / 默认文字。
# 逻辑一字未动 —— 尤其刻意不设 OUTPUT_NODE，这样跑队列时整个节点被跳过，
# 也不会在这块纯装饰文字上方挂一个「X.Xs」耗时徽章。


class XHLabelPix:
    """XiaoHei-浮字标签：画布上一块可自由排版的文字（纯前端，逻辑全在 web/xh_label_pix/）。"""

    DESCRIPTION = (
        "【干什么】贴在画布上的一块浮字标签，用来给工作流写说明、分区或备注。\n"
        "【怎么配】双击标签打开编辑器：文字、字体、字号（8–256 像素）、加粗、对齐、"
        "文字色 / 背景色 / 透明、内边距、圆角、不透明度、行高，改完点「保存」。\n"
        "【怎么用】没有输入、没有输出、不参与执行，剪掉它流程照样跑；"
        "画布右键「 添加 XiaoHei 浮字标签」可新建一个。\n"
        "【输出】无。\n"
        " 节点标题刻意留空（标题留给你自己写），新拖出来「没有名字」是正常设计。"
    )

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "label_json": (
                    "STRING",
                    {
                        "default": '{"text":"XiaoHei 浮字标签","fontSize":18,"fontFamily":"Arial"}',
                        "multiline": True,
                        "tooltip": (
                            "【 标签状态】内部存档（文字、字体、字号、颜色等），别直接改；"
                            "双击节点进编辑器改。 | English: Internal serialized state "
                            "(text, font, sizes, colors). Do not edit directly - "
                            "double-click the node to open the editor instead."
                        ),
                    },
                ),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    # OUTPUT_NODE intentionally NOT set (defaults to False) so ComfyUI's
    # executor skips Label entirely on Run. The label is pure decoration
    # rendered in JS; there is no Python-side work to do. Skipping
    # execution also stops ComfyUI from drawing an "X.Xs" timing badge
    # above the node every run, which looks weird on what is just a
    # styled text caption.
    CATEGORY = "XiaoHei/工具"

    def noop(self, label_json):
        return {}


NODE_CLASS_MAPPINGS = {
    "XHLabelPix": XHLabelPix,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XHLabelPix": "浮字标签",
}
