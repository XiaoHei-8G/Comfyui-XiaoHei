"""小黑·数字选择 - a number you pick from buttons you chose yourself.

Thin wrapper. The logic is pure and lives in _number_pick_helpers.py.

Frontend-driven (Vue Compat #9): the buttons, the pick and the output type all
live on node.properties in the browser and are injected into the hidden
NumberPickState input by the graphToPrompt hook in js/number_pick/index.js.
Because that state is part of the node's inputs, changing the number changes the
cache signature, so a run picks up the new value with no IS_CHANGED.

The output is ANY on purpose: the browser narrows the slot to INT or FLOAT to
match whatever it is wired to, so the canvas refuses a wrong drag, and sends the
decision here as `out` so the value arrives as the right Python type.
"""

from .helpers import compute
from ...paint.py.flexible_inputs import any_type as ANY


class XHNumberPick:
    DESCRIPTION = (
        "一个数字，从你自己排好的按钮里挑。不用每次在步数框里删了 20 改 30、再改回 20 —— "
        "把你真正常用的数字一次性排到节点上，用的时候点一下就行。\n\n"
        "点节点上的齿轮打开设置来选按钮。按钮是每个节点独立的，所以同一个画布上，一个节点"
        "可以给批次大小备 1、2、4、8，另一个给步数备 10、20、30。双击标题改名，它就成了"
        "那个参数的专属开关。\n\n"
        "它送整数还是小数，取决于你接进去的东西：接步数送整数；接帧率、cfg 或降噪强度送"
        "小数。拔掉线又变回两边都适配，节点可以随便挪。没接线时按数字本身判断：4 送整数，"
        "4.5 送小数。\n\n"
        "搜索 number / int / integer / value / steps / batch / picker 都能找到它。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        # Hidden, not required: a required STRING would show as a widget AND as
        # a convertible input dot in the Vue frontend (Vue Compat #9). The
        # browser injects the real value at graphToPrompt time.
        return {
            "required": {},
            "hidden": {"NumberPickState": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    OUTPUT_TOOLTIPS = (
        "The number you picked. It arrives as a whole number or a decimal to match the input it "
        "is wired to, so you can send it straight to steps, a batch size, a width, a frame rate, "
        "cfg or denoise without anything in between.",
    )
    FUNCTION = "run"
    CATEGORY = "XiaoHei/数学"

    def run(self, NumberPickState="{}"):
        return (compute(NumberPickState),)


NODE_CLASS_MAPPINGS = {"XHNumberPick": XHNumberPick}
NODE_DISPLAY_NAME_MAPPINGS = {"XHNumberPick": "小黑·数字选择"}
