# -*- coding: utf-8 -*-
"""
 XiaoHei-遮罩上色（XHMaskTint）—— 2026-10-31 新增

【为什么做这个节点】
SAM3 追踪之后那套「给人刷颜色」的官方链路要拖 9 个节点：
    Grow Mask → Mask Composite(减脸) → Solid Mask → Mask Composite(乘浓度)
    → Image Composite Masked（彩色版 / 纯色版两条链各一套）
每换一次素材就要重搭一遍，而且「减脸」那一步最容易漏 ——
漏了人物整张脸被刷成纯色，表情就丢了。

本节点把这一坨收成 1 个：
    原图 + 身体遮罩（+ 脸部遮罩，可选）→ 上色后的图 + 实际用的遮罩

【核心：接不接「脸遮罩」决定两种玩法】
  · 接了脸遮罩 → 身体刷色、脸保持原样（保留表情）
  · 不接脸遮罩 → 全身刷色（经典做法）
一节点顶两版，A/B 切换只要拔一根线。

【与家族已有节点的分工】
  · XiaoHei-跟踪上色 (XHTrackColorize)：吃 track_data，自己出 ID 调色板 + 画编号，底图可选
  · XiaoHei-遮罩上色 (本节点)：吃**任意 MASK**（不限 SAM3），支持「减脸露表情」+ 外部色源
    —— 多身份要不同颜色、又不想脸被刷掉时，本节点接在 TrackToMask 后面

【零新增依赖】
只用 torch（官方自带）。外扩用 torch 手写十字膨胀，对齐官方 GrowMask
(tapered_corners=True) 的 3x3 footprint 效果，但**不碰 scipy**
（官方 GrowMask 用 scipy.ndimage，本包的依赖清单里没有 scipy）。
"""

import torch
import torch.nn.functional as F

from ...xh_utils.smart_face_mask import _hex_to_rgb01


def _as_mask_batch(m):
    """任意形状 → (B,H,W) float。ComfyUI 的 MASK 正常是 (B,H,W)，这里做容错。"""
    if m is None:
        return None
    if m.dim() == 2:
        m = m.unsqueeze(0)
    elif m.dim() == 4:
        m = m.squeeze(1)
    elif m.dim() != 3:
        raise ValueError(f"[XiaoHei-遮罩上色] mask 维度不对：{tuple(m.shape)}（期望 3 维 [B,H,W]）")
    return m.float()


def _cross_dilate(m, times):
    """十字形膨胀（官方 GrowMask tapered_corners=True 的等价实现）。

    官方用 scipy.ndimage.grey_dilation + kernel [[0,1,0],[1,1,1],[0,1,0]]，
    即「上下左右 + 中心」五点、每次扩 1 像素。这里用 torch max 等价实现，
    免掉 scipy 依赖。
    """
    if times <= 0:
        return m
    x = m.unsqueeze(1)                       # (B,1,H,W)
    B, C, H, W = x.shape
    for _ in range(int(times)):
        p = F.pad(x, (1, 1, 1, 1), mode="constant", value=0.0)
        up = p[:, :, 0:H, 1:W + 1]
        dn = p[:, :, 2:H + 2, 1:W + 1]
        lf = p[:, :, 1:H + 1, 0:W]
        rt = p[:, :, 1:H + 1, 2:W + 2]
        x = torch.maximum(torch.maximum(up, dn), torch.maximum(lf, rt))
        x = torch.maximum(x, m.unsqueeze(1))  # footprint 含中心
    return x.squeeze(1).clamp(0.0, 1.0)


def _fit_batch(m, n):
    """遮罩批次数对齐到 n：不足用最后一帧补齐，超过就截断。"""
    if m.shape[0] == n:
        return m
    if m.shape[0] > n:
        return m[:n]
    if m.shape[0] == 0:
        return torch.zeros((n,) + tuple(m.shape[1:]), dtype=m.dtype, device=m.device)
    pad = m[-1:].unsqueeze(0).repeat(n - m.shape[0], 1, 1)
    return torch.cat([m, pad], dim=0)


def _fit_size(m, h, w):
    """遮罩尺寸和图像对不上 → 双线性插值对齐（SAM3 遮罩与视频帧不同尺寸时用）。"""
    if m.shape[1] == h and m.shape[2] == w:
        return m
    return F.interpolate(m.unsqueeze(1), size=(h, w), mode="bilinear", align_corners=False).squeeze(1)


class XHMaskTint:
    """遮罩上色：身体遮罩（可减脸）→ 上色合成，一次搞定。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {
                    "tooltip": ("【 原图/原视频帧】要被上色的那一路画面（通常是 SAM3 追踪用的原帧）。"
                                " | English: the image / video frames to tint."),
                }),
                "mask": ("MASK", {
                    "tooltip": ("【 身体遮罩】要上色的区域（白=上色，黑=不动）。"
                                "SAM3_TrackToMask / 万能遮罩 / 官方遮罩都能接。"
                                " | English: the region to tint (white = tinted)."),
                }),
                "strength": ("FLOAT", {
                    "default": 0.3, "min": 0.0, "max": 1.0, "step": 0.05,
                    "tooltip": ("【 上色浓度】0=完全不上色，0.3=半透明叠色（推荐），1=纯色块盖死。"
                                " | English: tint strength, 0.3 is a good half-transparent default."),
                }),
                "color": ("STRING", {
                    "default": "#00FF00",
                    "tooltip": ("【 纯色】十六进制色号（#RRGGBB）。只有在**没接色源图**时才生效。"
                                "常填：#00FF00 绿幕 · #FF0000 红 · #1F78B5 蓝。"
                                " | English: hex color, used only when no color source image is connected."),
                }),
            },
            "optional": {
                "face_mask": ("MASK", {
                    "tooltip": ("【 脸部遮罩】接了 → **只刷身体、脸留原样**（表情保住）。"
                                "不接 → 全身都刷。"
                                "可用第二路 SAM3_VideoTrack 追 face 再接 TrackToMask。"
                                " | English: face mask; connect it to tint the body only and keep the face."),
                }),
                "color_source": ("IMAGE", {
                    "tooltip": ("【 色源图】要叠上去的颜色图（必须是**纯色块**，不是已合成的画面）。"
                                "例如 SCAIL2ColoredMask 的输出（每个身份一种颜色）。"
                                "接了它就忽略下面的色号。"
                                " | English: solid-color source image (e.g. SCAIL2ColoredMask output)."),
                }),
                "face_expand": ("INT", {
                    "default": 8, "min": 0, "max": 128, "step": 1,
                    "tooltip": ("【↔ 脸部外扩】脸遮罩往外扩几像素，避免发际线/下巴边缘残留一圈色。"
                                "脸没抠干净就调大，抠太多就调小。0=不扩。"
                                " | English: face mask expansion in pixels, 0 = off."),
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "run"
    CATEGORY = "XiaoHei/Image"
    DESCRIPTION = ("【XiaoHei-遮罩上色】把「减脸 → 调浓度 → 铺色」三步收成一个节点："
                   "原图 + 身体遮罩（+ 脸部遮罩可选）→ 上色后的帧序列。"
                   "接了脸遮罩 = 只刷身体、脸留原样（表情保住）；不接 = 全身刷色。"
                   "零新增依赖，外扩用 torch 手写十字膨胀（对齐官方 GrowMask tapered 模式）。")

    def run(self, image, mask, strength, color, face_mask=None, color_source=None, face_expand=8):
        if image is None:
            raise ValueError("[XiaoHei-遮罩上色] image 口必须接（要上色的原图 / 视频帧）")
        if image.dim() != 4:
            raise ValueError(f"[XiaoHei-遮罩上色] image 维度不对：{tuple(image.shape)}（期望 4 维 [B,H,W,C]）")
        B, H, W, C = image.shape

        m = _as_mask_batch(mask)
        if m is None:
            raise ValueError("[XiaoHei-遮罩上色] mask 口必须接（要上色的区域）")
        m = _fit_size(_fit_batch(m, B), H, W)

        # ① 减脸（接了才减）→ 得到真正要上色的「身体区」
        if face_mask is not None:
            f = _as_mask_batch(face_mask)
            f = _fit_size(_fit_batch(f, B), H, W)
            if face_expand and int(face_expand) > 0:
                f = _cross_dilate(f, int(face_expand))
            body = torch.clamp(m - f, 0.0, 1.0)
        else:
            body = m

        # ② 浓度
        alpha = (body * float(strength)).clamp(0.0, 1.0).unsqueeze(-1)      # (B,H,W,1)

        # ③ 色源
        if color_source is not None:
            src = color_source
            if src.dim() == 3:
                src = src.unsqueeze(0)
            src = _fit_batch(src, B)
            if src.shape[1] != H or src.shape[2] != W:
                src = F.interpolate(src.permute(0, 3, 1, 2), size=(H, W),
                                    mode="bilinear", align_corners=False).permute(0, 2, 3, 1)
            src = src.to(dtype=image.dtype)
            if src.shape[-1] == 1:
                src = src.expand(-1, -1, -1, 3)
        else:
            rgb = _hex_to_rgb01(color)
            src = torch.tensor(rgb, dtype=image.dtype, device=image.device).view(1, 1, 1, 3).expand(B, H, W, 3)

        out = image * (1.0 - alpha) + src * alpha
        return (out, body)


NODE_CLASS_MAPPINGS = {
    "XHMaskTint": XHMaskTint,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHMaskTint": "遮罩上色",
}
