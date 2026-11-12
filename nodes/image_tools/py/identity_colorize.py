# -*- coding: utf-8 -*-
"""
XiaoHei-身份配色（XHIdentityColorize）—— 2026-10-31 新增

【为什么做这个节点】
官方 SCAIL2ColoredMask（comfy_extras/nodes_scail.py）能把 SAM3 追踪到的多个目标
渲染成「每个身份一种颜色」的彩色遮罩（彩色块），供 Wan SCAIL-2 / H3 认人用。

但它的**颜色是写死的 6 色板**（DEFAULT_PALETTE：蓝红绿品红青黄），
`sort_by` 只决定「谁拿第几号色」—— 用户想指定「第一个人是红的、第二个人是绿的」
**没有任何口子**（官方节点里一个颜色参数都没有）。

用户原话（2026-10-31）：
「我不管是通过这个那个还是哪个的节点啊，我要就是得到的效果是我能够控制颜色，
  控制颜色，控制颜色，控制生出来的视频的。彩色块儿是颜色」
「这个遮罩上色的节点，它只能单独遮罩一个人的颜色吗？……就是让可以可以多人物的进行上色，
  第一个人物添加添加按钮也好，添加按键也好……从左到右第一个是什么颜色，
  第二个什么颜色，第三个什么颜色」

【本节点与官方的关系】
· **端口与输出与官方 SCAIL2ColoredMask 一一对应** ⇒ 可以直接顶替（同名同序），
  官方节点还在也别删，两个可并存。
· 唯一新增能力：**颜色可手填**。
  `id_colors` 是一个 JSON 数组，如 ["#FF0000","#00FF00","#1F78B5"]，
  排序后第 1 个人拿第 1 个色、第 2 个人拿第 2 个色……（数量不够就循环取用）。
· `sort_by` 三档与官方**完全同义**（none / left_to_right / area），
  排序口径逐字照搬官方 `_first_appearance_cx_area` + `sorted(...)` 的实现。

【机制照抄哪里（抄机制不抄外形）】
官方 comfy_extras/nodes_scail.py：
  · `_unpack`               → 位解包（我们自实现，不 import 官方内部模块，官方升级无感）
  · `_first_appearance_cx_area` → 「第一次出现的那一帧」里的质心 x / 面积（排序依据）
  · `_render_colored_masks` → 重叠区取 argmax（先出现的身份优先）
我们把 DEFAULT_PALETTE 换成用户色号表，其余逐字照搬。

【零新增依赖】
只用 torch（官方自带）。位解包自己实现，与官方
comfy/ldm/sam3/tracker.py 的 unpack_masks 逐位对齐。
"""

import json

import torch
import torch.nn.functional as F

from ...xh_utils.smart_face_mask import _hex_to_rgb01


# 官方 DEFAULT_PALETTE 的 hex 化（comfy_extras/nodes_scail.py L20-27）：
# 蓝 红 绿 品红 青 黄 —— 只在用户没填色号、或填的数量不够时兜底。
_OFFICIAL_PALETTE = (
    "#0000FF",  # Blue
    "#FF0000",  # Red
    "#00FF00",  # Green
    "#FF00FF",  # Magenta
    "#00FFFF",  # Cyan
    "#FFFF00",  # Yellow
)


def _parse_id_colors(raw):
    """把 id_colors 控件的字符串解析成一串 hex 列表。

    接受两种写法（前端写 JSON，用户手打也认）：
      · JSON 数组   ["#FF0000", "#00FF00"]
      · 逗号/顿号分隔  #FF0000, #00FF00
    坏数据一律当空 ⇒ 走官方 6 色板兜底（绝不因为用户手滑就让节点崩）。
    """
    s = str(raw or "").strip()
    if not s:
        return []
    # 先试 JSON
    if s.startswith("["):
        try:
            arr = json.loads(s)
            if isinstance(arr, list):
                out = []
                for it in arr:
                    if isinstance(it, str):
                        v = it.strip()
                        if v:
                            out.append(v)
                    elif isinstance(it, (list, tuple)) and it:
                        # 容错：[r,g,b] 形式
                        try:
                            out.append("#%02X%02X%02X" % tuple(
                                max(0, min(255, int(round(float(c) * 255)))) for c in it[:3]))
                        except Exception:
                            pass
                return out
        except Exception:
            pass
    # 退化：按逗号/顿号/空格切
    out = []
    for part in s.replace("，", ",").replace("、", ",").replace(";", ",").split(","):
        v = part.strip()
        if v:
            out.append(v)
    return out


def _unpack(packed):
    """位解包：[*, H, W//8] uint8 → [*, H, W] bool。

    与官方 comfy/ldm/sam3/tracker.py 的 unpack_masks 逐位对齐
    （bit 顺序：低位在前 ⇒ 官方 pack 用 shifts 0..7 累加，这里同序）。
    自实现而不 import 官方内部模块 ⇒ 官方升级无感。

     内存：一次解包整段视频 = T × H × W 个 bool，长视频能吃掉几个 G。
    ⇒ 这里**按帧分块**解包（调用方逐块拿），峰值内存只与块大小有关。
    """
    if packed is None:
        return None
    if packed.dim() >= 2 and packed.shape[1] == 0:
        return None
    bits = torch.tensor([1, 2, 4, 8, 16, 32, 64, 128], dtype=torch.uint8, device=packed.device)
    return (packed.unsqueeze(-1) & bits).bool().view(*packed.shape[:-1], -1)


def _unpack_chunk(packed, t0, t1):
    """只解包第 [t0, t1) 帧（位解包本身是逐帧独立的，切块安全）。"""
    return _unpack(packed[t0:t1])


def _first_appearance_cx_area(packed):
    """每个目标：第一次出现的那一帧里的质心 x（归一化）与面积占比。

    逐字照搬官方 comfy_extras/nodes_scail.py `_first_appearance_cx_area` 的口径：
      area_t[t,j] = 第 t 帧第 j 个目标的像素面积
      first_t[j]  = 面积 > 0 的最早那一帧（一直没出现 = T）
      cx[j]       = first_t[j] 那一帧里第 j 个目标的质心 x / W
      area[j]     = first_t[j] 那一帧里第 j 个目标的面积 / (H*W)
     官方是整段解包后一次算完；这里**分块**算（口径逐字相同，峰值内存小得多）。

     2026-10-31 追加返回 last_t[]（最后一个有像素的帧）与 cx_last[]（那一帧的质心 x）：
       官方 tracker 有一个**已知弱点** —— 多人重叠时 `_suppress_recently_occluded`
       会把「挡在前面那个人」的 mask 直接打成 -10（= 判死）；等那个人重新露出来，
       追踪器会**当成新身份**再检测一次（编号变了）。
       ⇒ 只知道「首次出现」不够，还得知道「它活到哪一帧、最后在哪」，
          才能判断「这个新槽位是不是刚才那个死掉的人」。
       返回 (first_t[], cx[], area[], last_t[], cx_last[])。

    packed: [T, N_obj, Hm, Wm//8] uint8
    """
    T, N_obj = packed.shape[0], packed.shape[1]
    first_t = [T] * N_obj          # 官方：没出现过的身份 first_t = T
    cx = [0.0] * N_obj
    area = [0.0] * N_obj
    last_t = [-1] * N_obj          # 新增：最后一个有像素的帧
    cx_last = [0.0] * N_obj        # 新增：那一帧里的质心 x
    if T == 0 or N_obj == 0:
        return first_t, cx, area, last_t, cx_last

    CHUNK = 32
    for t0 in range(0, T, CHUNK):
        t1 = min(T, t0 + CHUNK)
        m = _unpack_chunk(packed, t0, t1).float()      # [c, N, Hm, Wm]
        c, _, Hm, Wm = m.shape
        grid_x = torch.arange(Wm, device=m.device, dtype=m.dtype).view(1, 1, 1, Wm)
        area_t = m.sum(dim=(-1, -2))                   # [c, N]
        cx_t = (m * grid_x).sum(dim=(-1, -2)) / area_t.clamp(min=1)
        present = area_t > 0
        for j in range(N_obj):
            #  记录「最后一个有像素的帧」+ 那帧的质心 x（身份归并要用）
            hit_all = torch.nonzero(present[:, j], as_tuple=False)
            if hit_all.numel() > 0:
                li = int(hit_all[-1].item())
                last_t[j] = t0 + li
                cx_last[j] = float(cx_t[li, j].item()) / Wm
            if first_t[j] < T:
                continue                                 # 首次出现已找到
            hit = torch.nonzero(present[:, j], as_tuple=False)
            if hit.numel() == 0:
                continue
            # 本块内最早的出现帧（相对块偏移）
            lt = t0 + int(hit[0].item())
            first_t[j] = lt
            cx[j] = float(cx_t[int(hit[0].item()), j].item()) / Wm
            area[j] = float(area_t[int(hit[0].item()), j].item()) / (Hm * Wm)
        del m, area_t, cx_t, present
    return first_t, cx, area, last_t, cx_last


def _merge_revivals(first_t, last_t, cx, cx_last, gap_frames=12, pos_tol=0.12):
    """身份归并：找出「哪个新槽位其实是刚才被压制判死、现在又回来的人」。

    【要解决的官方弱点】（2026-10-31 实测，用户素材「24帧率玉芬.mp4」第2–6秒）
      官方 tracker 的 `_suppress_recently_occluded`（comfy/ldm/sam3/tracker.py L1486）
      在两人**重叠**时会把「挡在前面那个人」的 mask 直接写成 -10.0 ⇒ 判死。
      等那人重新露出来，追踪器**当成新身份**再检测一次（编号 +1）。
      ⇒ 结果：同一个人前后是两个编号 ⇒ 按编号发色 ⇒ **颜色中途变了**。

    【归并判据】（保守，宁可不合并也不误合并）
      新槽位 j 判为「旧槽位 i 的复活」，当且仅当：
        ① i 在 j 出现前就已经死了（last_t[i] < first_t[j]）
        ② 死掉到复活之间隔得不太久（gap_frames 内 ⇒ 判为「刚死又回来」而不是「另一个人」）
        ③ 死前最后的位置与回来后的位置很接近（|cx_last[i] - cx[j]| <= pos_tol）
      三条同时满足才合并。

    返回 (parent[], )：parent[j] = j 表示「新身份」；parent[j] = i 表示「j 是 i 的复活」。
    """
    n = len(first_t)
    parent = list(range(n))
    for j in range(n):
        if first_t[j] >= len(last_t) and False:
            continue
        if last_t[j] < 0:
            continue                                     # 从没出现过
        best, best_gap = -1, None
        for i in range(n):
            if i == j:
                continue
            if last_t[i] < 0 or first_t[i] > last_t[i]:
                continue                                 # i 从没活过
            if last_t[i] >= first_t[j]:
                continue                                 # i 在 j 出现时还活着 ⇒ 不是复活
            gap = first_t[j] - last_t[i]
            if gap > gap_frames:
                continue                                 # 隔太久 ⇒ 大概率是另一个人
            if abs(cx_last[i] - cx[j]) > pos_tol:
                continue                                 # 位置差太远 ⇒ 不是同一个人
            if best_gap is None or gap < best_gap:
                best, best_gap = i, gap
        if best >= 0:
            parent[j] = best
    return parent


def _subset_track_data(track_data, obj_indices):
    """按 obj_indices 重新挑目标（照搬官方 _subset_track_data）。"""
    out = dict(track_data)
    packed = track_data["packed_masks"]
    if packed is None or not obj_indices:
        out["packed_masks"] = None
        if "scores" in out:
            out["scores"] = []
        return out
    out["packed_masks"] = packed[:, obj_indices].contiguous()
    scores = track_data.get("scores")
    if scores is not None:
        out["scores"] = [scores[i] for i in obj_indices if i < len(scores)]
    return out


class XHIdentityColorize:
    """身份配色：SAM3 多身份追踪 → 每个身份一种**自己指定**颜色 的彩色块。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "driving_track_data": ("SAM3_TRACK_DATA", {
                    "tooltip": ("【 追踪数据】SAM3_VideoTrack 的输出（驱动视频的追踪结果）。"
                                " | English: SAM3_VideoTrack output for the driving video."),
                }),
                "id_colors": ("STRING", {
                    "default": '["#FF0000","#00FF00","#1F78B5","#FF800D","#9467BD","#00FFFF"]',
                    "multiline": False,
                    "tooltip": ("【 各身份颜色】本节点的核心：按排序后的顺序，"
                                "第1个人拿第1个颜色、第2个人拿第2个颜色。"
                                "格式：JSON 数组 [\"#FF0000\",\"#00FF00\"] 或 #FF0000,#00FF00。"
                                "数量不够会循环取用；留空则用官方默认 6 色板。"
                                " | English: per-identity colors, in sorted order."),
                }),
                "sort_by": (["none", "left_to_right", "area"], {
                    "default": "left_to_right",
                    "tooltip": ("【 排序方式】决定「谁排第 1」——"
                                "left_to_right=按第一次出现时的横向位置从左到右；"
                                "area=按第一次出现时面积从大到小；"
                                "none=保持 SAM3 原始顺序（颜色跟着人走，不跟位置走）。"
                                " | English: how identities are ordered before colors are assigned."),
                }),
                "object_indices": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": ("【 只取哪几个身份】逗号分隔，例 \"0,2,3\"；留空=全部。"
                                "（在 sort_by 排序**之后**再筛。）"
                                " | English: comma-separated identity indices; empty = all."),
                }),
                "replacement_mode": ("BOOLEAN", {
                    "default": False,
                    "tooltip": ("【 替换模式】False=动画模式（彩色块背景黑）；"
                                "True=替换模式（彩色块背景白）。"
                                " | English: False = animation mode (black bg); True = replacement mode (white bg)."),
                }),
            },
            "optional": {
                "ref_track_data": ("SAM3_TRACK_DATA,MASK", {
                    "tooltip": ("【 参考图追踪】参考图的追踪结果（每个身份一种颜色），"
                                "或一张普通 MASK（当作单个人）。不接=参考图整张白底/黑底。"
                                " | English: reference-image track data or a plain mask."),
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("pose_video_mask", "reference_image_mask")
    FUNCTION = "run"
    CATEGORY = "XiaoHei/Identity"
    DESCRIPTION = ("【XiaoHei-身份配色】把 SAM3 追踪到的每个身份渲染成**你自己指定颜色**的彩色块。"
                   "端口与官方 SCAIL2ColoredMask 完全一致（可直接顶替），"
                   "唯一区别是**颜色能手填**：按排序后顺序，第1个人拿第1个色、第2个人拿第2个色……"
                   "排序口径逐字照搬官方（从左到右 / 按面积 / 不排序）。零新增依赖。")

    def run(self, driving_track_data, id_colors, sort_by, object_indices, replacement_mode,
            ref_track_data=None):
        colors = _parse_id_colors(id_colors)
        if not colors:
            colors = list(_OFFICIAL_PALETTE)

        def _prep(td):
            """排序 + 归并 + 按需筛身份。

             与官方的差异（都是改进，不是抄）：
              ① 排序口径逐字照搬官方 SCAIL2ColoredMask._prep（从左到右 / 按面积 / 不排序）。
              ② 身份归并：官方 tracker 会在两人重叠时把前景那个人判死，之后又当新身份
                 检测回来（编号变了）⇒ 官方按编号发色 ⇒ 同一个人**颜色中途变了**。
                 这里把「复活的新槽位」并回它的原身份 ⇒ **颜色跟人走，不跟编号走**。
                 详见 _merge_revivals 的判据说明。
            返回 (td, colormap)：colormap[i] = 第 i 个槽位该用的颜色（RGB 0~1 三元组）。
            """
            packed = td.get("packed_masks") if td else None
            if packed is None or packed.shape[1] == 0:
                return td, None

            first_t, cx, area, last_t, cx_last = _first_appearance_cx_area(packed)
            n = len(first_t)

            # ① 归并：parent[j] = i 表示 j 是 i 的复活（同一个人）
            parent = _merge_revivals(first_t, last_t, cx, cx_last)

            # ② 根身份 = 顺着 parent 链找到最初的祖先
            def root(j):
                seen = set()
                while parent[j] != j and j not in seen:
                    seen.add(j)
                    j = parent[j]
                return j

            roots = [root(j) for j in range(n)]

            # ③ 排序：只用「根身份」参与排序（复活的那个不单独排）
            #    官方是按 (first_t, cx) 排所有目标；这里排「不同的人」，
            #    排序键取该根身份**最早**的出现帧与位置（= 第一个人出现的那个位置）。
            root_info = {}
            for j in range(n):
                r = roots[j]
                if r not in root_info:
                    root_info[r] = [first_t[j], cx[j], area[j]]
                else:
                    info = root_info[r]
                    if first_t[j] < info[0]:
                        info[0] = first_t[j]
                        info[1] = cx[j]
                        info[2] = area[j]
            if sort_by == "left_to_right":
                root_order = sorted(root_info.keys(), key=lambda r: (root_info[r][0], root_info[r][1]))
            elif sort_by == "area":
                root_order = sorted(root_info.keys(), key=lambda r: (root_info[r][0], -root_info[r][2]))
            else:  # "none"：按根身份的最早出现帧（= SAM3 原序的近似）
                root_order = sorted(root_info.keys(), key=lambda r: (root_info[r][0], r))

            # ④ 发色：第 k 个「人」拿 colors[k % len(colors)]
            root_color = {}
            for k, r in enumerate(root_order):
                root_color[r] = _hex_to_rgb01(colors[k % len(colors)])
            colormap = [root_color[roots[j]] for j in range(n)]

            # ⑤ 重排槽位，让「第一个人」排在前面（与官方排序后的观感一致）
            slot_order = sorted(range(n), key=lambda j: (root_order.index(roots[j]), first_t[j]))
            td = _subset_track_data(td, slot_order)
            colormap = [colormap[j] for j in slot_order]

            # ⑥ 再按 object_indices 筛（筛完要把 colormap 一起筛）
            if object_indices.strip():
                indices = [int(i.strip()) for i in object_indices.split(",") if i.strip().isdigit()]
                packed2 = td.get("packed_masks")
                n_obj = packed2.shape[1] if packed2 is not None else 0
                indices = [i for i in indices if 0 <= i < n_obj]
                td = _subset_track_data(td, indices)
                colormap = [colormap[i] for i in indices]
            return td, colormap

        def _render(td, bg_is_white, colormap=None):
            """把 track_data 渲染成彩色块图。机制照搬官方 _render_colored_masks，
            唯一区别：颜色由 colormap 决定（用户手填 + 身份归并后的结果）。

             分块处理（逐帧独立插值 ⇒ 与官方整段算出来的像素逐张相同），
               但峰值内存只与块大小有关，长视频不会撑爆内存。
            """
            packed = td.get("packed_masks")
            H, W = td["orig_size"]
            device = torch.device("cpu")
            dtype = torch.float32
            bg_rgb = (1.0, 1.0, 1.0) if bg_is_white else (0.0, 0.0, 0.0)
            if packed is None or packed.shape[1] == 0:
                T = td.get("n_frames", 1) if packed is None else packed.shape[0]
                out = torch.empty(T, H, W, 3, device=device, dtype=dtype)
                out[..., 0], out[..., 1], out[..., 2] = bg_rgb[0], bg_rgb[1], bg_rgb[2]
                return out
            T, N_obj = packed.shape[0], packed.shape[1]
            # 颜色：优先用归并后的 colormap；没有就给默认色板（循环）
            if colormap and len(colormap) >= N_obj:
                cols = list(colormap[:N_obj])
            else:
                cols = [_hex_to_rgb01(colors[i % len(colors)]) for i in range(N_obj)]
            color_t = torch.tensor(cols, device=device, dtype=dtype)
            bg_tensor = torch.tensor(bg_rgb, device=device, dtype=dtype).view(1, 1, 1, 3)

            frames = []
            CHUNK = 16
            for t0 in range(0, T, CHUNK):
                t1 = min(T, t0 + CHUNK)
                c = t1 - t0
                masks_full = _unpack_chunk(packed, t0, t1).float()     # [c, N, Hm, Wm]
                Hm, Wm = masks_full.shape[-2], masks_full.shape[-1]
                masks_full = F.interpolate(
                    masks_full.view(c * N_obj, 1, Hm, Wm), size=(H, W), mode="nearest"
                ).view(c, N_obj, H, W) > 0.5
                any_mask = masks_full.any(dim=1)
                # 重叠区取 argmax（先出现的身份优先）—— 与官方一致
                color_overlay = color_t[masks_full.to(torch.uint8).argmax(dim=1)]
                frames.append(torch.where(any_mask.unsqueeze(-1), color_overlay,
                                          bg_tensor.expand_as(color_overlay)))
                del masks_full, any_mask, color_overlay
            return torch.cat(frames, dim=0)

        def _render_plain_mask(mask, bg_is_white):
            """普通 MASK 当单个人：整块用第 1 个颜色（与官方 _render_mask_as_identity 同构，
            差别只在颜色取自用户色号表而不是写死的蓝）。"""
            if mask.dim() == 2:
                mask = mask.unsqueeze(0)
            mask = mask.to(dtype=torch.float32)
            B, H, W = mask.shape
            device = mask.device
            bg_rgb = (1.0, 1.0, 1.0) if bg_is_white else (0.0, 0.0, 0.0)
            color = torch.tensor(_hex_to_rgb01(colors[0]), device=device, dtype=torch.float32).view(1, 1, 1, 3)
            bg = torch.tensor(bg_rgb, device=device, dtype=torch.float32).view(1, 1, 1, 3)
            return torch.where((mask > 0.5).unsqueeze(-1), color.expand(B, H, W, 3), bg.expand(B, H, W, 3))

        drv, drv_cmap = _prep(driving_track_data)
        if not drv or drv.get("packed_masks") is None:
            raise ValueError("[XiaoHei-身份配色] driving_track_data 口必须接 SAM3_VideoTrack 的 track_data")
        # 动画模式：彩色块背景黑 / 参考图背景白；替换模式反过来（与官方一致）
        mask_video = _render(drv, replacement_mode, drv_cmap)
        ref_bg_white = not replacement_mode

        if ref_track_data is not None:
            if isinstance(ref_track_data, torch.Tensor):   # 普通 MASK → 当单个人
                reference_image_mask = _render_plain_mask(ref_track_data, ref_bg_white)
            else:
                ref_td, ref_cmap = _prep(ref_track_data)
                reference_image_mask = _render(ref_td, ref_bg_white, ref_cmap)
        else:
            H, W = drv["orig_size"]
            fill_value = 1.0 if ref_bg_white else 0.0
            reference_image_mask = torch.full((1, H, W, 3), fill_value,
                                               device=torch.device("cpu"), dtype=torch.float32)

        return (mask_video, reference_image_mask)


NODE_CLASS_MAPPINGS = {
    "XHIdentityColorize": XHIdentityColorize,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHIdentityColorize": "身份配色",
}
