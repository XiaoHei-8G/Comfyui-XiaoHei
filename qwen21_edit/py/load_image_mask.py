# ---------------------------------------------------------------------------
# 1:1 port from ComfyUI-BlueBox (MIT License)
#   Copyright (c) 2026 zhoutingxi
#   https://github.com/zhoutingxi/ComfyUI-BlueBox
#   Algorithm preserved verbatim; only identifiers, metadata, tooltips and
#   scipy.ndimage.distance_transform_edt -> cv2.distanceTransform changed.
#   The above copyright notice is retained per the MIT license.
# ---------------------------------------------------------------------------
import os
import time
import numpy as np
import torch
from PIL import Image, ImageOps
import folder_paths


# ============================================================
# 公用工具：叠色预览（1:1 照搬原版，仅改默认前缀）
# ============================================================
def _save_mask_overlay_preview(rgb_np, mask_np, prefix="xh_qwen"):
    base = np.clip(rgb_np * 255, 0, 255).astype(np.float32)
    overlay = np.zeros_like(base)
    overlay[..., 0] = 34
    overlay[..., 1] = 197
    overlay[..., 2] = 94
    alpha = mask_np[..., None] * 0.5
    blended = base * (1 - alpha) + overlay * alpha
    blended = np.clip(blended, 0, 255).astype(np.uint8)
    out = Image.fromarray(blended)

    temp_dir = folder_paths.get_temp_directory()
    fname = "{}_{}.png".format(prefix, int(time.time() * 1000))
    fpath = os.path.join(temp_dir, fname)
    out.save(fpath)

    return [{
        "filename": fname,
        "subfolder": "",
        "type": "temp",
    }]


# ============================================================
# XiaoHei-加载图像(带遮罩)
# ============================================================
class XHLoadImageWithMask:
    """
    XiaoHei-加载图像(带遮罩)：工作流开头用。
    mask 来源优先级：mask_file → sidecar → alpha → 全零。
    """

    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = []
        if os.path.isdir(input_dir):
            for f in os.listdir(input_dir):
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                    files.append(f)
        return {
            "required": {
                "image": (sorted(files), {
                    "image_upload": True,
                    "tooltip": "【 选择图片】从 ComfyUI/input 里选，或点上传。 | English: Pick from ComfyUI/input or upload."}),
            },
            "optional": {
                "mask_file": ("STRING", {
                    "default": "",
                    "tooltip": "【 遮罩文件】优先级最高；留空则依次找同名 _mask.png / alpha 通道，都没有就全零。 | English: Optional mask filename; falls back to sidecar / alpha / zeros."}),
            },
        }

    DESCRIPTION = (
        "【XiaoHei-加载图像(带遮罩)】加载本地图并同时给出遮罩：mask_file → 同名 _mask → alpha → 全零。"
        "会按 EXIF 自动转正，并在节点上生成半透明绿色叠色预览。"
    )
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "load_image"
    CATEGORY = "XiaoHei/Image"

    def load_image(self, image, mask_file=""):
        image_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(image_path)
        img = ImageOps.exif_transpose(img)

        rgb = img.convert("RGB")
        rgb_np = np.array(rgb).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(rgb_np)[None,]

        h, w = rgb_np.shape[:2]

        mask_np = None
        if mask_file:
            mask_np = self._load_mask_by_name(mask_file)
        if mask_np is None:
            mask_np = self._try_load_sidecar_mask(image_path)
        if mask_np is None:
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                alpha = img.convert("RGBA").split()[-1]
                alpha_np = np.array(alpha).astype(np.float32) / 255.0
                mask_np = 1.0 - alpha_np

        if mask_np is not None and (mask_np.shape[0] != h or mask_np.shape[1] != w):
            print(f"[XiaoHei-Qwen21Edit] 遮罩尺寸 {mask_np.shape} 与图像 {(h, w)} 不匹配，已忽略")
            mask_np = None
        if mask_np is None:
            mask_np = np.zeros((h, w), dtype=np.float32)

        mask_tensor = torch.from_numpy(mask_np)[None,]
        preview = _save_mask_overlay_preview(rgb_np, mask_np, prefix="xh_qwen_load")

        return {
            "ui": {"images": preview},
            "result": (image_tensor, mask_tensor),
        }

    def _load_mask_by_name(self, filename):
        try:
            path = folder_paths.get_annotated_filepath(filename)
            if not os.path.exists(path):
                return None
            m = Image.open(path).convert("L")
            return np.array(m).astype(np.float32) / 255.0
        except Exception:
            return None

    def _try_load_sidecar_mask(self, image_path):
        base, ext = os.path.splitext(image_path)
        candidates = [
            base + "_mask.png",
            base + "_mask.jpg",
            base.replace("bb_", "bb_mask_") + ext,
        ]
        for p in candidates:
            if os.path.exists(p):
                try:
                    m = Image.open(p).convert("L")
                    return np.array(m).astype(np.float32) / 255.0
                except Exception:
                    continue
        return None

    @classmethod
    def IS_CHANGED(cls, image, mask_file=""):
        image_path = folder_paths.get_annotated_filepath(image)
        m = os.path.getmtime(image_path) if os.path.exists(image_path) else 0
        return "{}_{}".format(float(m), mask_file or "")

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        if not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)
        return True



NODE_CLASS_MAPPINGS = {
    "XHLoadImageWithMask": XHLoadImageWithMask,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHLoadImageWithMask": "加载图像(带遮罩)",
}
