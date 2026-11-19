import torch
from ._inpaint_helpers import stitch_back, resolve_seam, XH_CROP_INFO


class XHInpaintStitch:
    DESCRIPTION = (
        "小黑·局部重绘贴回 —— 把重绘好的裁剪块按原位置贴回原图，接缝自动融合"
        "到看不出来。\n\n"
        "把「小黑·局部重绘裁剪」的 crop_info 接到这里，模型出图后的裁剪块接到 "
        "image。节点会自动把裁剪块缩回原来的区域；默认只替换涂过遮罩的部分，"
        "遮罩以外像素完全不变。\n\n"
        "接缝柔和度与融合方式由 crop_info 从裁剪节点带过来，也可以在这里覆盖"
        "（柔和度 -1 = 用裁剪节点的）。本节点在采样器之后，改柔和度 / 融合方式 / "
        "颜色匹配只重跑这一个节点 —— 采样器在固定种子下保持缓存 —— 所以能立刻"
        "微调融合、不用重新生成。颜色匹配用于修正模型带来的色偏。\n\n"
        "输出贴好的整图，以及未裁剪的原图 —— 两路一起接进图像对比节点就能"
        "前后对照。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        # Slot order image, mask, crop_info lines up under Inpaint Crop's
        # image / mask / crop_info outputs so the wires run straight across.
        return {
            "required": {
                "image": ("IMAGE", {
                    "tooltip": "模型跑完的裁片。尺寸对不上会自动缩回原来的裁剪区域。",
                }),
            },
            "optional": {
                "mask": ("MASK", {
                    "tooltip": "可选。把融合限制在这个范围内（会缩放到裁剪区域）。不接就用 crop_info 里带的遮罩做按遮罩融合。",
                }),
                "crop_info": (XH_CROP_INFO, {
                    "tooltip": "把「局部重绘裁剪 XiaoHei」的 crop_info 输出接到这里。不接的话图片会原样透传。",
                }),
                "softness": ("INT", {
                    "default": -1, "min": -1, "max": 150, "step": 1,
                    "tooltip": "接缝羽化，覆盖裁剪节点里设的值。-1 = 用裁剪节点的值。想在这里调就填 0～150——贴回节点在采样器之后，改它只重跑这一个节点（采样器按固定种子走缓存），基本瞬间出结果。羽化超过裁剪留出的余量时边缘会稍硬，那种情况回裁剪节点把 softness 调大。",
                }),
                "blend_mode": (["from crop", "mask", "whole crop"], {
                    "default": "from crop",
                    "tooltip": "覆盖裁剪节点的融合方式。from crop = 用裁剪节点设的；mask = 只换涂过的区域；whole crop = 整块裁剪区域都换。和 softness 一样，改这里只重跑本节点，不重新采样。",
                }),
                "color_match": (["off", "subtle", "strong"], {
                    "default": "off",
                    "tooltip": "修模型带进来的偏色 / 明暗差，拿遮罩周边没改的区域来对齐。故意换色的时候要关掉（否则会被拉回去）。没有实时预览，设完重跑看结果。",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "original")
    OUTPUT_TOOLTIPS = (
        "The original image with the inpainted crop blended back in place.",
        "The full original uncropped image (from crop_info) - wire it together "
        "with the result into XiaoHei Image Compare for a before / after.",
    )
    FUNCTION = "run"
    CATEGORY = "XiaoHei/Image"

    def run(self, image, crop_info=None, mask=None, softness=-1,
            blend_mode="from crop", color_match="off"):
        # No valid crop_info -> nothing to paste back; pass the image through as
        # both outputs so downstream wiring still works. Require the geometry keys
        # too, so a malformed dict doesn't silently paste at (0,0) full-size.
        if (not isinstance(crop_info, dict)
                or not isinstance(crop_info.get("image"), torch.Tensor)
                or crop_info["image"].dim() != 4
                or any(k not in crop_info for k in ("x", "y", "w", "h"))):
            # malformed / missing crop_info (incl. a non-[B,H,W,C] image) -> pass the
            # image through as BOTH outputs so the graph still runs. Checking the rank
            # here keeps a bad image out of stitch_back (which would otherwise throw and
            # the except below would silently make `original` a copy of the result).
            print("[XHInpaintStitch] no valid crop_info wired - passing image through")
            return (image, image)

        # Seam blend + mode ride in on crop_info from the Crop node, but THIS node's
        # softness / blend_mode widgets override them when set (so the blend can be
        # tuned here without re-running the sampler). color_match is this node's own
        # knob (post-result tweak, no live preview).
        blend, blend_mode = resolve_seam(crop_info, softness, blend_mode)
        cm = str(color_match)
        color_match = cm if cm in ("off", "subtle", "strong") else "off"

        try:
            result, original = stitch_back(crop_info, image, mask, blend, blend_mode, color_match)
        except Exception as e:
            # A genuine fault inside stitch_back (e.g. CUDA OOM). Pass the inpainted
            # image through as the result, but keep `original` as the TRUE uncropped
            # original (crop_info["image"] already passed the dim==4 guard above), so a
            # downstream before/after compare shows the real original, not a patch copy.
            print(f"[XHInpaintStitch] stitch error: {e}")
            return (image, crop_info["image"])
        return (result, original)


NODE_CLASS_MAPPINGS = {
    "XHInpaintStitch": XHInpaintStitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHInpaintStitch": "小黑·局部重绘贴回",
}
