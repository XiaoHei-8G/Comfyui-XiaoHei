# 来源：ComfyUI-Pixaroma/nodes/node_ref.py 前 15 行，原样抄录（MIT, Copyright (c) 2026 pixaroma）
# 只取 AnyType / any_type / FlexibleOptionalInputType —— 原文件后半段是两个示例节点，不能带进来。
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


any_type = AnyType("*")


class FlexibleOptionalInputType(dict):
    def __init__(self, type):
        self.type = type

    def __getitem__(self, key):
        return (self.type,)

    def __contains__(self, key):
        return True


