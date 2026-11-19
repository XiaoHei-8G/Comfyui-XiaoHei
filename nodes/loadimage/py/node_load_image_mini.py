"""小黑·轻量加载图片 - a slimmed-down Load Image.

Same engine as Load Image XiaoHei (upload / drag-drop / paste / multi-frame /
alpha-to-mask, plus the full inline resize suite minus Pad), but a minimalist
face: a small toolbar, the file picker, the preview, and just TWO outputs -
`image` and a small `image_info` bundle. Wire the bundle into Image Info
XiaoHei when you need mask / width / height / filename, so the loader itself
stays compact.

The resize engine lives in nodes/_resize_helpers.py (shared with Load Image and
Image Resize), and the state parsing is imported from node_load_image so the two
loaders can never drift apart.
"""

import hashlib
import json
import os

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import folder_paths
import node_helpers

from ._folder_source import refresh_copy, source_for, source_stamp
from ._resize_helpers import _I16_MODES, _resize_frame
# Reuse Load Image's state parsing verbatim so the resize behaviour is identical
# (_parse_state merges against its DEFAULT_STATE; _parse_orig_name reads the
# non-clipspace name the frontend injects for a stable Filename after masking).
from .node_load_image import _parse_state, _parse_orig_name


class XHLoadImageMini:
    DESCRIPTION = (
        "小黑·轻量加载图片 —— 精简版的加载图片。上传、拖入、粘贴或从下拉框选文件；和「加载图片」一样的缩放套件（最大百万像素 / 最长边 / 按比例 / 装进框内 / 裁切填满 / 匹配比例）收在齿轮设置面板里，节点表面保持极简。遮罩编辑器和剪贴板复制粘贴照常可用。"

        "图片也可以来自你自己的文件夹：在齿轮面板或文件选择器的「+ 文件夹」里添加。"

        "只输出 image 和一个小小的 image_info 包。需要遮罩 / 宽 / 高 / 文件名时，把 image_info 接到「小黑·图片信息」节点 —— 这样加载器本身保持小巧。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        # Walk input/ recursively so subfolders show in the dropdown (same as
        # Load Image XiaoHei - native LoadImage lists the root only).
        input_dir = folder_paths.get_input_directory()
        files = []
        if os.path.isdir(input_dir):
            for root, _dirs, fnames in os.walk(input_dir):
                rel_root = os.path.relpath(root, input_dir)
                for fname in fnames:
                    rel = fname if rel_root == "." else os.path.join(rel_root, fname)
                    files.append(rel.replace("\\", "/"))
        files = folder_paths.filter_files_content_types(files, ["image"])
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True, "tooltip": "要加载的图。点上传按钮、点粘贴按钮、把文件拖到节点上，或者从下拉框里挑——下拉里也会列出你自己的图片文件夹（在齿轮面板里、或选图窗口的「+ 文件夹」里加）。"}),
            },
            "hidden": {
                "LoadImageMiniState": (
                    "STRING",
                    {"default": ""},
                ),
            },
        }

    CATEGORY = "XiaoHei/Image"
    RETURN_TYPES = ("IMAGE", "PIX_IMAGE_INFO")
    RETURN_NAMES = ("image", "image_info")
    OUTPUT_TOOLTIPS = (
        "The loaded image, after any resize set in the gear panel.",
        "A small bundle (mask, width, height, filename) for Image Info XiaoHei.",
    )
    FUNCTION = "load_image"

    def load_image(self, image: str, LoadImageMiniState: str = ""):
        # A picture from one of the user's own folders is a copy in input; bring
        # it up to date with the original first (nodes/_folder_source.py).
        refresh_copy(image)
        image_path = folder_paths.get_annotated_filepath(image)
        img = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        orig_w = orig_h = None
        final_w = final_h = None

        try:
            import comfy.model_management as _mm
            tensor_dtype = _mm.intermediate_dtype()
        except Exception:
            tensor_dtype = torch.float32

        state = _parse_state(LoadImageMiniState)

        # Stable Filename across masking (issue #51 parity): a clipspace copy
        # loads as "clipspace-mask-NNNN.png"; the frontend passes the original
        # name in orig_name so we report THAT instead.
        orig_name = _parse_orig_name(LoadImageMiniState)
        is_clipspace = "clipspace" in image.replace("\\", "/").lower()
        if is_clipspace and orig_name:
            basename = os.path.splitext(os.path.basename(orig_name.replace("\\", "/")))[0]
        else:
            basename = os.path.splitext(os.path.basename(image_path))[0]

        for frame in ImageSequence.Iterator(img):
            frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
            if frame.mode == "I":
                frame = frame.point(lambda px: px * (1 / 255))
            elif frame.mode in _I16_MODES:
                frame = frame.convert("I").point(lambda px: px * (1 / 257))
            rgb = frame.convert("RGB")

            if orig_w is None:
                orig_w, orig_h = rgb.size
            if rgb.size != (orig_w, orig_h):
                continue

            if "A" in frame.getbands():
                alpha = np.array(frame.getchannel("A")).astype(np.float32) / 255.0
                mask_pil = Image.fromarray(((1.0 - alpha) * 255).astype(np.uint8), mode="L")
            elif frame.mode == "P" and "transparency" in frame.info:
                alpha = np.array(frame.convert("RGBA").getchannel("A")).astype(np.float32) / 255.0
                mask_pil = Image.fromarray(((1.0 - alpha) * 255).astype(np.uint8), mode="L")
            else:
                mask_pil = Image.new("L", rgb.size, 0)

            rgb_resized, mask_resized, frame_w, frame_h = _resize_frame(
                rgb, mask_pil, state, orig_w, orig_h,
            )
            final_w, final_h = frame_w, frame_h

            arr = np.array(rgb_resized).astype(np.float32) / 255.0
            tensor = torch.from_numpy(arr)[None,].to(dtype=tensor_dtype)
            mask_arr = np.array(mask_resized).astype(np.float32) / 255.0
            mask_tensor = torch.from_numpy(mask_arr).unsqueeze(0).to(dtype=tensor_dtype)

            output_images.append(tensor)
            output_masks.append(mask_tensor)

            if img.format == "MPO":
                break

        if len(output_images) == 0:
            zeros = torch.zeros((1, 64, 64, 3), dtype=tensor_dtype)
            zeros_mask = torch.zeros((1, 64, 64), dtype=tensor_dtype)
            info = {"image": zeros, "mask": zeros_mask, "width": 64, "height": 64, "filename": basename}
            return (zeros, info)

        if len(output_images) > 1:
            out_img = torch.cat(output_images, dim=0)
            out_mask = torch.cat(output_masks, dim=0)
        else:
            out_img = output_images[0]
            out_mask = output_masks[0]

        if final_w is None:
            final_w, final_h = orig_w, orig_h

        # The bundle carries everything Image Info XiaoHei needs to unpack.
        # Tensors are references, so this is cheap (no copy).
        info = {
            "image": out_img,
            "mask": out_mask,
            "width": int(final_w),
            "height": int(final_h),
            "filename": basename,
        }
        return (out_img, info)

    @classmethod
    def IS_CHANGED(cls, image, LoadImageMiniState=""):
        image_path = folder_paths.get_annotated_filepath(image)
        m = hashlib.sha256()
        # A folder copy: the original alone decides (see Load Image's IS_CHANGED
        # for why not the copy too). "" for every other file, so their hash is
        # unchanged.
        stamp = source_stamp(image)
        if stamp:
            m.update(stamp.encode("utf-8"))
        else:
            with open(image_path, "rb") as f:
                m.update(f.read())
        # Hash only the RESIZE-relevant state (canonical) + the original-name
        # field, NOT the raw string. A purely-cosmetic frontend key (the accent
        # colour) lives inside the state object; hashing the raw string would let
        # a colour pick invalidate the cache and force a needless re-decode +
        # full downstream re-run. _parse_state keeps only backend keys (accent is
        # not among them); _parse_orig_name preserves the filename-output field.
        state = _parse_state(LoadImageMiniState)
        m.update(json.dumps(state, sort_keys=True).encode("utf-8"))
        m.update((_parse_orig_name(LoadImageMiniState) or "").encode("utf-8"))
        return m.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, image, LoadImageMiniState=""):
        if not folder_paths.exists_annotated_filepath(image) and not source_for(image):
            return f"Invalid image file: {image}"
        return True


NODE_CLASS_MAPPINGS = {"XHLoadImageMini": XHLoadImageMini}
NODE_DISPLAY_NAME_MAPPINGS = {"XHLoadImageMini": "小黑·轻量加载图片"}
