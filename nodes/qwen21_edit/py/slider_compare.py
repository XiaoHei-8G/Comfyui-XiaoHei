# ---------------------------------------------------------------------------
# 1:1 port from ComfyUI-BlueBox (MIT License)
#   Copyright (c) 2026 zhoutingxi
#   https://github.com/zhoutingxi/ComfyUI-BlueBox
#   Algorithm preserved verbatim; only identifiers, metadata, tooltips and
#   scipy.ndimage.distance_transform_edt -> cv2.distanceTransform changed.
#   The above copyright notice is retained per the MIT license.
# ---------------------------------------------------------------------------
import io
import base64
import torchvision.transforms as T
from PIL import Image


to_pil_image = T.ToPILImage()


def _encode_image(tensor, fmt, quality):
    """ComfyUI IMAGE 张量 (H,W,C) float [0,1] -> (base64_str, mime, w, h)"""
    pil_image = to_pil_image(tensor.permute(2, 0, 1).clamp(0, 1))
    width, height = pil_image.size

    with io.BytesIO() as buffered:
        if fmt == "WEBP":
            pil_image.save(buffered, format="WEBP", quality=quality)
            mime = "image/webp"
        else:
            pil_image.save(buffered, format="PNG")
            mime = "image/png"
        data = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return data, mime, width, height


class XHImageSliderCompare:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_a": ("IMAGE", {"tooltip": "【 A 图】分割线左侧（或底层）的图。 | English: Image A (left / bottom layer)."}),
                "image_b": ("IMAGE", {"tooltip": "【 B 图】分割线右侧（或上层）的图。 | English: Image B (right / top layer)."}),
                "format": (["WEBP", "PNG"], {
                    "default": "WEBP",
                    "tooltip": "【 预览格式】WEBP 体积小，PNG 无损但慢。只影响预览，不落盘。 | English: Inline preview encoding, preview only."}),
                "quality": ("INT", {
                    "default": 85, "min": 1, "max": 100, "step": 1,
                    "tooltip": "【 WEBP 质量】仅 WEBP 生效；PNG 模式忽略。 | English: WEBP quality; ignored for PNG."}),
            },
        }

    DESCRIPTION = (
        "【XiaoHei-双图滑块对比】两张图叠在同一位置，拖动分割线查看改图前后差异，"
        "base64 内联预览、不写盘；右键可保存 / 复制单张图。"
    )
    RETURN_TYPES = ()
    FUNCTION = "compare"
    CATEGORY = "XiaoHei/Image"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Slider comparison of two images via base64 preview, no disk save. "
        "Drag the divider to reveal A (first input) / B (second input)."
    )

    def compare(self, image_a, image_b, format, quality):
        a_b64, a_mime, a_w, a_h = _encode_image(image_a[0], format, quality)
        b_b64, b_mime, b_w, b_h = _encode_image(image_b[0], format, quality)

        return {
            "ui": {
                "image_a": [a_b64],
                "image_a_mime": [a_mime],
                "image_b": [b_b64],
                "image_b_mime": [b_mime],
                "size_a": [[a_w, a_h]],
                "size_b": [[b_w, b_h]],
            },
            "result": ()
        }


NODE_CLASS_MAPPINGS = {
    "XHImageSliderCompare": XHImageSliderCompare,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHImageSliderCompare": "双图滑块对比",
}