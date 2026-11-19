class XHInfo:
    """小黑·说明 - a button on the canvas that opens a note to read.

    Pure frontend node (js/info/): the face is a title-less button, a click
    opens the note in a reading window, and Edit opens the same rich-text
    editor as 小黑·便签. Never runs: no outputs, not an output node.
    """

    DESCRIPTION = (
        "小黑·说明 —— 画布上的一个小按钮，点一下就打开一张说明便签。用来放工作流自带的信息："
        "它是干什么的、怎么用、要下载哪些模型、每个节点的作用、推荐参数、提示词技巧、"
        "运行时间和链接。\n\n"
        "点按钮阅读内容。在阅读窗口里或右键按钮都能编辑，编辑器就是「小黑·便签」那一套，"
        "顶部有一条专门改按钮标题、图标和颜色的工具条。添加节点时可以选一个模板"
        "（Read me / Models / Nodes / Settings / Prompt tips 等），自动填好标题、图标、"
        "颜色和各段小标题。\n\n"
        "拖按钮的角可以改大小。纯注释节点：没有接线、不参与运算、永远不会执行。"
    )

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "note_json": (
                    "STRING",
                    {
                        # Same shape as 小黑·便签's note_json (its editor is
                        # reused), plus an "info" block for the button itself.
                        # Keep in sync with DEFAULT_CFG in js/info/core.mjs.
                        "default": '{"version":1,"content":"","buttonColor":"#f66744","lineColor":"#f66744","info":{"title":"Info","icon":"info","color":"#f66744"}}',
                        "multiline": True,
                        # No input SOCKET: on a title-less button the socket sat
                        # under the top-left corner, where a press dragged a wire
                        # out of it (reproduced). The frontend creates no socket
                        # for a socketless widget; the value saves as before.
                        "socketless": True,
                        # Our own widget constructor (js/info/index.js
                        # getCustomWidgets): the frontend's STRING constructor
                        # does not carry "socketless" into the widget, ours does.
                        # A frontend without widgetType support falls back to the
                        # plain STRING widget, and the JS hides its socket.
                        "widgetType": "XH_INFO_STATE",
                        # No tooltip on purpose: Classic shows a widget's tooltip
                        # while the mouse is over it, and this hidden widget sits
                        # under the whole button.
                    },
                ),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    # OUTPUT_NODE intentionally not set: ComfyUI skips the node on Run, so it
    # does no work and draws no timing badge (same as Note and Label).
    CATEGORY = "XiaoHei/工具"

    def noop(self, note_json):
        return {}


NODE_CLASS_MAPPINGS = {
    "XHInfo": XHInfo,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XHInfo": "小黑·说明",
}
