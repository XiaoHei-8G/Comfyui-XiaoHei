# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-标注 子模块
#   1:1 深度复刻 ComfyUI-Pixaroma 的 Sketch（MIT, Copyright (c) 2026 pixaroma）
#   后端 node_sketch.py(151) + _sketch_helpers.py(542) + Inter-Variable 字体；
#   前端 js/xh_sketch/ 11 文件(2065 行)。
#   算法一行未改：画框/圆/自由圈/箭头/文字、提示词生成、遮罩绘制全部原样。
#   只改节点类名、设置键、ui key、品牌日志与中文说明。
#   隐藏输入 SketchState / unique_id 原样保留（前端 graphToPrompt 注入）。
# ─────────────────────────────────────────────────────────────────────────────
from .node_sketch import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
