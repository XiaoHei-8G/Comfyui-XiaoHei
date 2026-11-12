# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-画板 · 后端节点
#
# 1:1 复刻自 ComfyUI-Pixaroma/nodes/node_paint.py（117 行）
#     MIT License, Copyright (c) 2026 pixaroma
# 只改了这些必要的接线标识，算法与数据契约一字未动：
#   · 类名 PixaromaPaint → XHPaint
#   · 显示名 / CATEGORY → 家族格式
#   · import 改为本子模块自带的 flexible_inputs / _path_guard（原文件同款，原样抄录）
#   · 合成图子目录 pixaroma/ → xh_paint/（与 paint_routes.py 落盘目录一致）
# ─────────────────────────────────────────────────────────────────────────────
import torch
import numpy as np
from PIL import Image
import os
import json
import folder_paths

from .flexible_inputs import any_type, FlexibleOptionalInputType
from ._path_guard import safe_join


class XHPaint:
    DESCRIPTION = (
        "XiaoHei 画板 —— 一个带图层的简易绘画编辑器。\n\n"
        "· 拖图加层：把图片直接拖到（关闭状态的）节点体上，会作为新图层叠到最上方，不会替换已有的图层。\n"
        "· 全屏绘制：打开全屏编辑器，用 铅笔 / 画笔 / 橡皮 / 涂抹 / 填充 / 形状 / 吸管 在图层上手绘；"
        "支持多图层、拖动重排、不透明度、混合模式、合并、扁平化（类似 Photoshop）。\n"
        "· 一键抠图：图像图层上有 AI 去背景（rembg）按钮，一键把主体抠出来。\n"
        "· 透明保存：工具条勾选后，可直接把带透明底的图存到磁盘。\n\n"
        "输出合成后的 IMAGE，及其宽度、高度（均为 INT）。编辑器内还能拖入更多图片作为新图层，"
        "或把任意上游的 IMAGE 接到它自动生成的可选输入槽。\n\n"
        "（XiaoHei Paint · 1:1 复刻自 ComfyUI-Pixaroma 的 Paint 节点，MIT License, Copyright (c) 2026 pixaroma）"
    )

    @classmethod
    def INPUT_TYPES(self):
        return {
            "required": {},
            "optional": FlexibleOptionalInputType(any_type),
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("image", "width", "height")
    OUTPUT_TOOLTIPS = ("The painted image.", "Image width in pixels.", "Image height in pixels.")
    FUNCTION = "load_painting"
    CATEGORY = "XiaoHei/Image"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Force re-execution when the composite file on disk changes."""
        paint_data = kwargs.get("PaintWidget")
        if not paint_data:
            return ""
        try:
            paint_json = paint_data.get("paint_json", "{}") if isinstance(paint_data, dict) else str(paint_data)
            meta = json.loads(paint_json)
            composite_path = meta.get("composite_path", "")
            if composite_path:
                # safe_join, not os.path.join - see _path_guard.safe_join.
                full_path = safe_join(folder_paths.get_input_directory(), composite_path)
                if full_path and os.path.exists(full_path):
                    return os.path.getmtime(full_path)
        except Exception:
            pass
        return str(paint_data)

    def load_painting(self, **kwargs):
        empty_image = torch.ones((1, 1024, 1024, 3), dtype=torch.float32)

        paint_data = kwargs.get("PaintWidget")
        if not paint_data:
            return (empty_image, 1024, 1024)

        paint_json = paint_data.get("paint_json", "{}") if isinstance(paint_data, dict) else str(paint_data)
        if not paint_json or paint_json.strip() in ("", "{}"):
            return (empty_image, 1024, 1024)
        try:
            meta = json.loads(paint_json)
            if not isinstance(meta, dict):
                return (empty_image, 1024, 1024)

            doc_w = int(meta.get("doc_w", 1024))
            doc_h = int(meta.get("doc_h", 1024))

            composite_path = meta.get("composite_path", "")
            if not composite_path:
                arr = np.ones((doc_h, doc_w, 3), dtype=np.float32)
                return (torch.from_numpy(arr)[None,], doc_w, doc_h)

            input_dir = os.path.realpath(folder_paths.get_input_directory())
            full_path = os.path.realpath(os.path.join(input_dir, composite_path))

            if not full_path.startswith(input_dir + os.sep):
                print("[XiaoHei-画板] 安全拦截：composite_path 逃出 input 目录，已阻止。")
                return (empty_image, doc_w, doc_h)

            if not os.path.exists(full_path):
                return (empty_image, doc_w, doc_h)

            img = Image.open(full_path).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0
            return (torch.from_numpy(arr)[None,], doc_w, doc_h)

        except Exception as e:
            print(f"[XiaoHei-画板] Load error: {e}")
            return (empty_image, 1024, 1024)


NODE_CLASS_MAPPINGS = {
    "XHPaint": XHPaint,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHPaint": "画板",
}
