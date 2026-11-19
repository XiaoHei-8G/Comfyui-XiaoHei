import os
import json
import uuid
import numpy as np
import torch
from PIL import Image
import folder_paths
from ...paint.py.flexible_inputs import any_type, FlexibleOptionalInputType
from ._inpaint_helpers import (
    apply_inpaint_crop, merge_params, resolve_inpaint_mask, XH_CROP_INFO, DEFAULTS,
)


# Friendly combo labels -> internal size-mode keys used by the geometry helper.
_SIZE_MODE = {
    "keep shape (long side)": "keep",
    "force size (square)": "force",
    "free (multiple only)": "free",
}

# Seam paste-back mode -> internal key. Mirrored by the editor's Blend mode pill.
_BLEND_MODE = {
    "mask": "mask",
    "whole crop": "whole_crop",
}


class _InpaintOptionalInputs(FlexibleOptionalInputType):
    """Declares concrete optional IMAGE + MASK inputs (so drag-from-output search
    finds the node) while still accepting the hidden InpaintCropWidget DOM-widget
    value (and anything else) via the flexible any_type fallback - same trick as
    Image Crop's _CropOptionalInputs."""

    def __init__(self, type):
        super().__init__(type)
        self["image"] = ("IMAGE", {
            "tooltip": "把任意上游 IMAGE 接到这里就能对这张图做局部重绘（加载图片、VAE Decode 都行）。也可以把图片拖进节点、或者直接粘贴，那样会直接载入并断开这条接线。",
        })
        self["mask"] = ("MASK", {
            "tooltip": "可选。要重绘区域的遮罩（例如透明 PNG 的 alpha，或者「标注 XiaoHei」输出的 mask）。接进来的遮罩只要有白色像素就以它为准——你在草图里画的框决定模型改哪一块。节点编辑器自己的遮罩只在没接线（或接进来的遮罩是全黑）时才用。",
        })

    def __getitem__(self, key):
        if dict.__contains__(self, key):
            return dict.__getitem__(self, key)
        return (self.type,)


class XHInpaintCrop:
    DESCRIPTION = (
        "小黑·局部重绘裁剪 —— 把局部重绘一次配好。全屏编辑器里在要修的区域涂遮罩"
        "（画笔 / 橡皮 / 清空 / 反选，笔刷大小可调）。节点自动找到遮罩外的方框，加上"
        "上下文余量，裁出适合模型的尺寸（按 8 的倍数，并向目标尺寸缩放，小块区域"
        "也能拿到足够分辨率）。\n\n"
        "遮罩以接进来的为准：把「小黑·标注（草图）」的 mask 接到 mask 输入，"
        "你画的框就决定裁哪一块。节点自己的编辑器遮罩只在没接 mask（或接进来的是"
        "空遮罩）时才生效 —— 这样编辑器里上一次留下的旧遮罩不会偷偷盖掉你的框。\n\n"
        "打开「反选遮罩」可把遮罩翻过来，重绘相反的区域（例如抠图时修背景而不是"
        "主体），不用再接反选遮罩节点。\n\n"
        "把裁好的图和遮罩接到你的重绘模型（KSampler / Flux / 编辑模型），再把 "
        "crop_info 接到「小黑·局部重绘贴回」，结果就会按原位置精确贴回去。\n\n"
        "输出裁好的图、同尺寸遮罩、crop_info 线、以及裁剪宽高（方便建空 latent）。"
        "crop_info 与「图像裁剪」是同一种类型，两者可以互换。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "size_mode": (list(_SIZE_MODE.keys()), {
                    "default": "keep shape (long side)",
                    "tooltip": "keep shape：把遮罩区域放大到长边顶住 target，不拉伸（画质最好）。force size：固定输出 target × target 的正方形。free：保持自然尺寸，只按倍数取整。",
                }),
                "target": ("INT", {
                    "default": 1024, "min": 64, "max": 8192, "step": 8,
                    "tooltip": "目标边长（像素）。keep shape 时是长边，force size 时是正方形边长。",
                }),
                "multiple": ([8, 16, 32, 64], {
                    "default": 8,
                    "tooltip": "裁剪尺寸取整到这个倍数，方便模型吃。一般 8 就够。",
                }),
                "context_px": ("INT", {
                    "default": 24, "min": 0, "max": 1024, "step": 1,
                    "tooltip": "每边多带多少像素的周边环境。带少了接缝对不上，带多了白算算力。",
                }),
                "mask_grow": ("INT", {
                    "default": 4, "min": 0, "max": 256, "step": 1,
                    "tooltip": "把涂出来的遮罩往外扩几像素，防止贴边漏掉一圈。",
                }),
                "mask_blur": ("INT", {
                    "default": 4, "min": 0, "max": 256, "step": 1,
                    "tooltip": "把输出遮罩的边缘虚化几像素，重绘过渡更自然。",
                }),
                "softness": ("INT", {
                    "default": 16, "min": 0, "max": 150, "step": 1,
                    "tooltip": "「局部重绘贴回」往原图贴时接缝羽化多少像素。遮罩编辑器里能实时看到效果。",
                }),
                "blend_mode": (list(_BLEND_MODE.keys()), {
                    "default": "mask",
                    "tooltip": "「局部重绘贴回」怎么把结果贴回去。mask：只替换你涂过的区域，裁片其余部分保持原样（常规做法，安全默认）。whole crop：整块裁剪区域都换成模型的结果（想要整块重画时用）。",
                }),
                "invert_mask": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "把遮罩反过来，改成重绘当前没涂的地方（主体和背景对调）。接进来的遮罩和手涂的遮罩都适用——相当于不用再挂一个反遮罩节点。没接遮罩时无效。",
                }),
            },
            "optional": _InpaintOptionalInputs(any_type),
        }

    RETURN_TYPES = ("IMAGE", "MASK", XH_CROP_INFO, "INT", "INT")
    RETURN_NAMES = ("image", "mask", "crop_info", "width", "height")
    OUTPUT_TOOLTIPS = (
        "The cropped region, resized to the model-friendly output size.",
        "The cropped mask at the same size (grown and blurred as set). Wire it "
        "into SetLatentNoiseMask / your inpaint conditioning.",
        "Crop info for XiaoHei Inpaint Stitch - carries the original image and "
        "where the crop came from so the inpainted result can be pasted back "
        "exactly. Same type as Image Crop, so they are interchangeable.",
        "Cropped output width in pixels (for an empty latent / edit models).",
        "Cropped output height in pixels.",
    )
    FUNCTION = "run"
    CATEGORY = "XiaoHei/Image"
    OUTPUT_NODE = True

    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Re-run on any knob change, or when the painted-mask file changes."""
        parts = [str(kwargs.get(k)) for k in
                 ("size_mode", "target", "multiple", "context_px", "mask_grow", "mask_blur", "softness", "blend_mode", "invert_mask")]
        state = kwargs.get("InpaintCropWidget")
        try:
            sj = state.get("state_json", "{}") if isinstance(state, dict) else str(state)
            meta = json.loads(sj) if sj else {}
            parts.append(json.dumps(meta, sort_keys=True))  # deterministic regardless of key order
            mp = meta.get("mask_path", "")
            if mp:
                full = cls._resolve_xh_path(mp)
                if full:
                    parts.append(str(os.path.getmtime(full)))
            sp = meta.get("src_path", "")
            if sp:
                fs = cls._resolve_xh_path(sp)
                if fs:
                    parts.append(str(os.path.getmtime(fs)))
        except Exception:
            parts.append(str(state))
        return "|".join(parts)

    @staticmethod
    def _resolve_xh_path(rel_path):
        if not rel_path:
            return None
        input_dir = os.path.realpath(folder_paths.get_input_directory())
        full_path = os.path.realpath(os.path.join(input_dir, rel_path))
        if not full_path.startswith(input_dir + os.sep):
            print("[XHInpaintCrop] Security: path escapes input dir, blocked.")
            return None
        return full_path if os.path.exists(full_path) else None

    def _save_source_temp(self, tensor):
        """Stash the input tensor (frame 0) to temp/ so the JS editor can load it."""
        try:
            if not isinstance(tensor, torch.Tensor) or tensor.dim() != 4 or tensor.shape[0] == 0:
                return None
            arr = (tensor[0].clamp(0, 1).cpu().numpy() * 255.0 + 0.5).astype(np.uint8)
            temp_dir = folder_paths.get_temp_directory()
            os.makedirs(temp_dir, exist_ok=True)
            fname = f"xh_inpaint_src_{uuid.uuid4().hex}.png"
            Image.fromarray(arr).save(os.path.join(temp_dir, fname), "PNG")
            return fname
        except Exception as e:
            print(f"[XHInpaintCrop] temp source save failed: {e}")
            return None

    def _load_disk_image(self, rel_path):
        full = self._resolve_xh_path(rel_path)
        if not full:
            return None
        try:
            arr = np.array(Image.open(full).convert("RGB")).astype(np.float32) / 255.0
            return torch.from_numpy(arr)[None,]
        except Exception as e:
            print(f"[XHInpaintCrop] source load error: {e}")
            return None

    def _load_disk_mask(self, rel_path):
        full = self._resolve_xh_path(rel_path)
        if not full:
            return None
        try:
            arr = np.array(Image.open(full).convert("L")).astype(np.float32) / 255.0
            return torch.from_numpy(arr)[None,]
        except Exception as e:
            print(f"[XHInpaintCrop] mask load error: {e}")
            return None

    def _empty(self):
        img = torch.ones((1, 1024, 1024, 3), dtype=torch.float32)
        mask = torch.zeros((1, 1024, 1024), dtype=torch.float32)
        info = {"image": img, "mask": mask, "x": 0, "y": 0, "w": 1024, "h": 1024,
                "orig_w": 1024, "orig_h": 1024}
        return (img, mask, info, 1024, 1024)

    def _params(self, size_mode, target, multiple, context_px, mask_grow, mask_blur):
        mode = _SIZE_MODE.get(size_mode, "keep")
        p = dict(DEFAULTS)
        p.update({
            "size_mode": mode, "target": int(target),
            "target_w": int(target), "target_h": int(target),
            "multiple": int(multiple), "context_px": int(context_px),
            "mask_grow": int(mask_grow), "mask_blur": int(mask_blur),
        })
        return merge_params(p)

    def run(self, size_mode="keep shape (long side)", target=1024, multiple=8,
            context_px=24, mask_grow=4, mask_blur=4, softness=16, blend_mode="mask",
            invert_mask=False, **kwargs):
        upstream = kwargs.get("image")
        upstream_mask = kwargs.get("mask")
        state = kwargs.get("InpaintCropWidget")

        meta = {}
        if state is not None:
            try:
                sj = state.get("state_json", "{}") if isinstance(state, dict) else str(state)
                if sj and sj.strip() not in ("", "{}"):
                    parsed = json.loads(sj)
                    if isinstance(parsed, dict):
                        meta = parsed
            except Exception as e:
                print(f"[XHInpaintCrop] state parse error: {e}")

        # ── source image: wired upstream wins, else the editor-saved src on disk
        ui_payload = None
        image = upstream if isinstance(upstream, torch.Tensor) else None
        if image is not None:
            src_fname = self._save_source_temp(image)
            if src_fname:
                ui_payload = {"xh_inpaint_source": [
                    {"filename": src_fname, "subfolder": "", "type": "temp"}]}
        else:
            image = self._load_disk_image(meta.get("src_path", ""))

        if not isinstance(image, torch.Tensor):
            return self._empty()

        # ── mask: a PAINTED editor mask wins; a cleared/empty one (mask_path set
        # but the saved file is all-black) falls back to the wired mask, so clearing
        # the editor uses the wired mask as-is. resolve_inpaint_mask owns the rule.
        disk_mask = self._load_disk_mask(meta.get("mask_path", ""))
        mask = resolve_inpaint_mask(disk_mask, upstream_mask)

        params = self._params(size_mode, target, multiple, context_px, mask_grow, mask_blur)
        # Seam softness (the node 'softness' knob, mirrored by the editor): feed it
        # into the geometry so the crop CONTEXT grows to fit the feather (Option B -
        # compute_region uses max(context_px, blend)), then ride it on crop_info to
        # Inpaint Stitch as the seam-feather width.
        sb = max(0, min(150, int(softness)))
        params["blend"] = sb
        params["invert_mask"] = bool(invert_mask)   # flip the mask before cropping
        try:
            img_t, mask_t, crop_info, ow, oh = apply_inpaint_crop(image, mask, params)
        except Exception as e:
            print(f"[XHInpaintCrop] crop error: {e}")
            return self._empty()

        # blend mode rides crop_info. It is now a NODE widget (mirrored by the editor's
        # Blend mode pill), so the node widget is the source of truth - not state_json.
        # (color_match is the Stitch node's own knob.)
        crop_info["blend"] = sb
        crop_info["blend_mode"] = _BLEND_MODE.get(blend_mode, "mask")

        result = (img_t, mask_t, crop_info, ow, oh)
        if ui_payload:
            return {"ui": ui_payload, "result": result}
        return result


NODE_CLASS_MAPPINGS = {
    "XHInpaintCrop": XHInpaintCrop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHInpaintCrop": "小黑·局部重绘裁剪",
}
