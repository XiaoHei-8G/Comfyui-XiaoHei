# -*- coding: utf-8 -*-
"""XHTrackColorize —— XiaoHei-跟踪上色（把 SAM3 官方跟踪结果按 XiaoHei 的 ID 调色板重新上色）

【为什么有这节点】
2026-10-25：万能遮罩的 ID_PALETTE 已对齐官方 SAM3_TrackPreview.COLORS（12 色，第 0 号蓝
#1F78B5）—— 本节点与官方预览颜色同源同序。保留本节点的三个理由：
① 输出 IMAGE 张量（官方只存 mp4、没有张量口）⇒ 下游能接
   ImageCompositeMasked / CreateVideo / 任何图像处理
② 编号画 1-based「1234」人话编号（官方画 0-based「0123」），tooltip 注明 TrackToMask 换算
③ 家族脸：中文参数 + 中/EN 切换 +  工具条（xh_image_tools_lang.js 登记后自动生效）

【位打包格式】
与官方 comfy/ldm/sam3/tracker.py 的 pack_masks / unpack_masks 逐位对齐
（W 必须能被 8 整除），但本文件自己实现，不 import 官方内部模块 ⇒ 官方升级无感。
"""

import torch
import torch.nn.functional as F

from .smart_face_mask import XHSmartFaceMask, _hex_to_rgb01

# ─────────────────────────────────────────────────────────────────────
# 5x3 位图字体（数字 0-9，与官方 SAM3_TrackPreview 同款字形）
# ─────────────────────────────────────────────────────────────────────
_DIGITS = (
    (1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1),  # 0
    (0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1),  # 1
    (1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1),  # 2
    (1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1),  # 3
    (1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1),  # 4
    (1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1),  # 5
    (1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1),  # 6
    (1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1),  # 7
    (1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1),  # 8
    (1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1),  # 9
)

_GLYPH_CACHE = {}  # scale -> (glyphs[10,gh,gw] bool, outlines[10,oh,ow] bool, gh, gw)


def _get_glyphs(scale, device):
    """scale 倍放大的数字字形 + 黑描边（官方同款：字形外扩 1 像素）。"""
    key = (scale, device)
    hit = _GLYPH_CACHE.get(key)
    if hit is not None:
        return hit
    glyphs, outlines = [], []
    for d in range(10):
        g = torch.tensor(_DIGITS[d], dtype=torch.float32).view(5, 3)
        g = F.interpolate(g.view(1, 1, 5, 3), scale_factor=scale, mode="nearest")[0, 0] > 0.5
        gp = F.pad(g.float().view(1, 1, *g.shape), (1, 1, 1, 1))
        o = F.max_pool2d(gp, 3, stride=1, padding=1)[0, 0] > 0
        glyphs.append(g.to(device))
        outlines.append(o.to(device))
    out = (torch.stack(glyphs), torch.stack(outlines), glyphs[0].shape[0], glyphs[0].shape[1])
    _GLYPH_CACHE[key] = out
    return out


class XHTrackColorize:
    """把 SAM3_VideoTrack 的 track_data 按 XiaoHei ID 调色板叠色 + 画编号，输出 IMAGE 帧序列。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "track_data": ("SAM3_TRACK_DATA", {
                    "tooltip": "【 跟踪数据】SAM3_VideoTrack 的输出（首帧 masks 起播那份）。",
                }),
                "opacity": ("FLOAT", {
                    "default": 0.45, "min": 0.0, "max": 1.0, "step": 0.05,
                    "tooltip": "【 ID色浓度】0=只画编号不叠色；0.45=淡彩（对齐万能遮罩 id_alpha 默认值）；1=全色块。",
                }),
                "draw_numbers": ("BOOLEAN", {
                    "default": True, "label_on": "开(画1234编号)", "label_off": "关(只叠色)",
                    "tooltip": "【 编号】开=在每个目标质心画黑描边彩色编号（1-based，从左到右数）。"
                               " TrackToMask 的 object_indices 是 0-based：要取显示编号 2 的人，填 \"1\"。",
                }),
            },
            "optional": {
                "images": ("IMAGE", {
                    "tooltip": "【 原视频帧】接 GetVideoComponents 的图像口 = 原片当底（推荐）；"
                               "不接 = 黑底叠色。",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "colorize"
    CATEGORY = "XiaoHei/Image"
    DESCRIPTION = ("【XiaoHei-跟踪上色】把 SAM3_VideoTrack 的跟踪结果按万能遮罩同款 ID 调色板叠色 + 画编号，"
                   "输出 IMAGE 帧序列（官方 SAM3_TrackPreview 只存 mp4、没有张量口，本节点能接下游合成/存视频）")

    # ── 位解包：与官方 tracker.py 的 unpack_masks 逐位对齐，自己实现不 import 官方 ──
    @staticmethod
    def _unpack(packed):
        """[N_obj, H, W//8] uint8 -> [N_obj, H, W*8] bool"""
        bits = torch.tensor([1, 2, 4, 8, 16, 32, 64, 128], dtype=torch.uint8, device=packed.device)
        return (packed.unsqueeze(-1) & bits).bool().view(*packed.shape[:-1], -1)

    # ── 画一个数字（黑描边 + 彩色填充，官方同款画法）──
    @classmethod
    def _draw_number(cls, frame, number, cx, cy, color, scale):
        H, W = frame.shape[:2]
        glyphs, outlines, gh, gw = _get_glyphs(scale, frame.device)
        color_t = torch.tensor(color, device=frame.device, dtype=frame.dtype)
        digs = [int(d) for d in str(number)]
        total_w = len(digs) * (gw + scale) - scale
        x0, y0 = cx - total_w // 2, cy - gh // 2
        for i, d in enumerate(digs):
            dx = x0 + i * (gw + scale)
            # 黑描边
            oy0, ox0 = y0 - 1, dx - 1
            sy1, sx1 = max(0, -oy0), max(0, -ox0)
            sy2, sx2 = min(outlines.shape[1], H - oy0), min(outlines.shape[2], W - ox0)
            if sy2 > sy1 and sx2 > sx1:
                fy1, fx1 = oy0 + sy1, ox0 + sx1
                frame[fy1:fy1 + (sy2 - sy1), fx1:fx1 + (sx2 - sx1)][outlines[d][sy1:sy2, sx1:sx2]] = 0
            # 彩色填充
            sy1, sx1 = max(0, -y0), max(0, -dx)
            sy2, sx2 = min(gh, H - y0), min(gw, W - dx)
            if sy2 > sy1 and sx2 > sx1:
                fy1, fx1 = y0 + sy1, dx + sx1
                frame[fy1:fy1 + (sy2 - sy1), fx1:fx1 + (sx2 - sx1)][glyphs[d][sy1:sy2, sx1:sx2]] = color_t

    @classmethod
    def colorize(cls, track_data, opacity=0.45, draw_numbers=True, images=None):
        td = track_data or {}
        packed = td.get("packed_masks")
        N = int(td.get("n_frames", 0) or 0)
        if images is not None:
            N, H, W = images.shape[0], images.shape[1], images.shape[2]
        else:
            Hs, Ws = td.get("orig_size", (None, None))
            if N <= 0 or Hs is None:
                raise ValueError("XHTrackColorize：track_data 里没有 n_frames/orig_size，请接上 images 口（原视频帧）")
            H, W = int(Hs), int(Ws)

        pal = [_hex_to_rgb01(c) for c in XHSmartFaceMask.ID_PALETTE]  # 跟万能遮罩同一份色板
        pal_t = {i: torch.tensor(pal[i % len(pal)]) for i in range(64)}  # 预建，避免每帧转

        frames = []
        for t in range(N):
            base = images[t][..., :3].clone() if images is not None else torch.zeros(H, W, 3)
            if packed is not None and t < packed.shape[0] and packed.shape[1] > 0:
                m = cls._unpack(packed[t])                                   # [N_obj, Hm, Wm]
                m = F.interpolate(m.unsqueeze(1).float(), size=(H, W), mode="nearest")[:, 0] > 0.5
                any_mask = m.any(dim=0)
                if any_mask.any():
                    # 重叠区小编号盖大编号（argmax 取最前目标）
                    idx_map = m.to(torch.uint8).argmax(dim=0)
                    colors = torch.zeros(H, W, 3, dtype=base.dtype)
                    for i in range(m.shape[0]):
                        sel = idx_map == i
                        if sel.any():
                            colors[sel] = pal_t[i].to(base.dtype)
                    base = torch.where(any_mask.unsqueeze(-1),
                                       base * (1.0 - opacity) + colors * opacity, base)
                if draw_numbers:
                    area = m.sum(dim=(-1, -2)).clamp(min=1)
                    grid_y = torch.arange(H, device=m.device).view(1, H, 1)
                    grid_x = torch.arange(W, device=m.device).view(1, 1, W)
                    cy = (m * grid_y).sum(dim=(-1, -2)) // area
                    cx = (m * grid_x).sum(dim=(-1, -2)) // area
                    has = area > 1
                    label_scale = max(3, H // 240)                      # 分辨率自适应
                    size_caps = (area.float().sqrt() / 15).clamp(min=1).long()  # 小目标别用大字
                    for i in range(m.shape[0]):
                        if bool(has[i]):
                            cls._draw_number(base, i + 1, int(cx[i]), int(cy[i]),  # 1-based 人话编号
                                             pal[i % len(pal)], min(label_scale, int(size_caps[i])))
            frames.append(base)
        return (torch.stack(frames, dim=0),)
