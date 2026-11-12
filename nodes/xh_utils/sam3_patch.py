# -*- coding: utf-8 -*-
"""SAM3 追踪稳像补丁（v1.44.0）

## 要修的官方 bug（用户实测：第 3.5 秒第二个人整段消失、第 5 秒闪回几帧）
`comfy/ldm/sam3/tracker.py` 的 `SAM31Tracker` 里有**两处**把身份「整个判死」的逻辑：

### ① `_deferred_memory_encode` 的 shrink 保护（**元凶**）
    low_res_masks = torch.where(
        shrink_ok[:, None, None, None].expand_as(low_res_masks),
        low_res_masks, torch.clamp(low_res_masks, max=-10.0))
两人贴在一起时，重叠区按分数归给高分者 ⇒ 低分者被抢走 ≥70% 面积 ⇒
**整个 mask 置 -10** ⇒ `is_obj = score_obj > 0` 判据下**该身份这一帧被判死**。

### ② `_suppress_recently_occluded`（**死锁维持器**）
    low_res_masks[to_suppress] = -10.0
`last_occluded` 只在「该身份这一帧 mask 全空」时更新。所以：
- ① 让 B 空了一次 ⇒ `last_occluded[B] = k`
- 之后两人重叠 ⇒ B 的 `last_occluded` 更新 ⇒ **B 被压制** ⇒ 永远空着
⇒ **B 永久锁死**（因为 A 一直正常，`last_occ_A = -1` 不满足 `> -1`，A 永远不被压制，
于是「压制更近的那个」的规则永远指向 B）。

### ③ 顺带导致的颜色错乱
`tracker.py` 的 `new_dets = max_overlap < 0.5` —— B 的 mask 空了，下一帧检测到同一个人
时与 B 的 overlap = 0 ⇒ **被当成全新身份** ⇒ 槽位编号变了 ⇒ 颜色跟错人（用户看到的「闪红」）。

## 官方原意
①的注释在 `_suppress_recently_occluded` 里写得很清楚：
*"Prevents corrupted masks from occluded objects from contaminating other objects"*
—— 它想解决的是「**脏 mask 污染别人**」，**不是**「把人删掉」。
原版用「整个置 -10」来达成，代价是误杀身份、并造成永久死锁。

## 本补丁的做法
**只清掉「被别人抢走 / 与他人重叠的那部分像素」，保留身份本体**：
- 重叠区照样清干净 ⇒ 官方想要的「不污染别人」照样成立；
- 本体保留 ⇒ 身份不死 ⇒ `last_occluded` 不再被刷新 ⇒ **死锁不会形成**；
- 下一帧能被 `overlap >= 0.5` **匹配回原槽位** ⇒ 颜色跟人走 ⇒ 不再闪红/消失。

## 挂载方式（不碰官方文件）
`comfy/ldm/sam3/detector.py` 里是 `self.tracker.track_video_with_detection(...)`
的**实例方法调用** ⇒ 猴补**类方法**即可全局生效。
只有 `SAM31Tracker` 有这两个方法（`SAM3Tracker` 走纯传播 `track_video`，无检测追踪）。

## 开关
- 默认**开启**（这是修 bug）。
- 环境变量 `XH_SAM3_KEEP_OCCLUDED=0` ⇒ 完全关闭，恢复官方原行为。
"""
import os

_PATCHED = False

# ---------------------------------------------------------------------------
#  调试探针：环境变量 XH_SAM3_DEBUG=1 打开
#   XH_SAM3_DEBUG_LOG=<路径>（默认桌面临时目录下的 xh_sam3_debug.log）
#   记录每帧每个身份的：压制前 mask 面积 / 是否被压制 / 记忆里的对象分数
#   —— 用来定位「第二个人的 mask 到底被谁清空了」
# ---------------------------------------------------------------------------
_DEBUG = os.environ.get("XH_SAM3_DEBUG", "").strip().lower() not in ("", "0", "false", "off")
_DEBUG_LOG = os.environ.get(
    "XH_SAM3_DEBUG_LOG",
    os.path.join(os.environ.get("TEMP", "."), "xh_sam3_debug.log"))
_CURRENT_FRAME = -1


def _dbg(msg):
    if not _DEBUG:
        return
    try:
        with open(_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass


def _enabled():
    v = os.environ.get("XH_SAM3_KEEP_OCCLUDED", "1").strip().lower()
    return v not in ("0", "false", "off", "no")


# ---------------------------------------------------------------------------
# 补丁 ①：_suppress_recently_occluded —— 压制时只清重叠区
# ---------------------------------------------------------------------------
def _xh_suppress_recently_occluded(low_res_masks, last_occluded, frame_idx, threshold=0.3):
    """XiaoHei 补丁版：只清「与他人重叠的像素」，保留身份本体。

    官方原版把被压制的身份**整个**置 -10 ⇒ 身份这一帧被判死 ⇒
    `last_occluded` 被刷新 ⇒ 之后永远被压制 ⇒ 永久死锁。
    """
    import torch
    from comfy.ldm.sam3.tracker import _compute_mask_overlap

    global _CURRENT_FRAME
    _CURRENT_FRAME = int(frame_idx)

    N_obj = low_res_masks.shape[0]
    if N_obj <= 1:
        return low_res_masks

    binary = low_res_masks[:, 0] > 0                        # [N_obj, H, W]
    iou = _compute_mask_overlap(low_res_masks[:, 0], low_res_masks[:, 0])
    overlapping = torch.triu(iou >= threshold, diagonal=1)   # [N, N] 上三角
    last_occ_i = last_occluded.unsqueeze(1)
    last_occ_j = last_occluded.unsqueeze(0)
    suppress_i = overlapping & (last_occ_i > last_occ_j) & (last_occ_j > -1)
    suppress_j = overlapping & (last_occ_j > last_occ_i) & (last_occ_i > -1)
    to_suppress = suppress_i.any(dim=1) | suppress_j.any(dim=0)

    is_empty = ~binary.any(dim=(-1, -2))
    newly_occluded = is_empty | to_suppress
    last_occluded[newly_occluded] = frame_idx

    if _DEBUG:
        areas = [int(binary[i].sum().item()) for i in range(N_obj)]
        _dbg(f"f{frame_idx:04d} SUPPRESS 压制前面积={areas} "
             f"overlap={[[bool(overlapping[i, j]) for j in range(N_obj)] for i in range(N_obj)]} "
             f"to_suppress={[bool(to_suppress[i]) for i in range(N_obj)]} "
             f"is_empty={[bool(is_empty[i]) for i in range(N_obj)]} "
             f"last_occ={[int(x) for x in last_occluded.tolist()]}")

    #  与官方唯一的差别：不清整个身份，只清「与被压制对象重叠」的像素
    for i in range(N_obj):
        for j in range(i + 1, N_obj):
            if not bool(overlapping[i, j]):
                continue
            si = bool(suppress_i[i, j])
            sj = bool(suppress_j[i, j])
            if not (si or sj):
                continue
            inter = binary[i] & binary[j]
            if not bool(inter.any()):
                continue
            if si:
                low_res_masks[i][0][inter] = -10.0
            if sj:
                low_res_masks[j][0][inter] = -10.0
    if _DEBUG:
        areas2 = [int((low_res_masks[i, 0] > 0).sum().item()) for i in range(N_obj)]
        _dbg(f"f{frame_idx:04d} SUPPRESS 压制后面积={areas2}")
    return low_res_masks


# ---------------------------------------------------------------------------
# 补丁 ②：_deferred_memory_encode 的 shrink 保护 —— 元凶
# ---------------------------------------------------------------------------
def _xh_deferred_memory_encode(self, current_out, N_obj, vision_feats, feat_sizes, mux_state,
                               device, cond_obj_mask=None):
    """XiaoHei 补丁版：官方「shrink 失败 ⇒ 整个身份置 -10」改成「只清被抢走的像素」。

    官方原文（`comfy/ldm/sam3/tracker.py`）：
        low_res_masks = torch.where(
            shrink_ok[:, None, None, None].expand_as(low_res_masks),
            low_res_masks, torch.clamp(low_res_masks, max=-10.0))
    两人贴在一起时低分者被抢走 ≥70% 面积 ⇒ 整个 mask 被判死 ⇒ 身份永久丢失。
    XiaoHei 版只把「被别人抢走的那部分像素」置 -10，本体保留 ⇒ 身份不死。
    """
    import torch
    import torch.nn.functional as F
    from comfy.ldm.sam3.tracker import to_spatial

    low_res_masks = current_out["pred_masks"]  # [N_obj, 1, H_low, W_low]

    if N_obj > 1:
        lr = low_res_masks.squeeze(1)                       # [N_obj, H, W]
        max_obj = torch.argmax(lr, dim=0, keepdim=True)     # [1, H, W]
        batch_inds = torch.arange(N_obj, device=device)[:, None, None]
        pixel_nol = torch.where(max_obj == batch_inds, lr, torch.clamp(lr, max=-10.0))
        area_before = (lr > 0).sum(dim=(-1, -2)).float().clamp(min=1)
        area_after = (pixel_nol > 0).sum(dim=(-1, -2)).float()
        shrink_ok = (area_after / area_before) >= 0.3
        if _DEBUG:
            _dbg(f"f{_CURRENT_FRAME:04d} MEMORY 面积前={[int(x) for x in area_before.tolist()]} "
                 f"面积后={[int(x) for x in area_after.tolist()]} "
                 f"shrink_ok={[bool(x) for x in shrink_ok.tolist()]}")
        #  XH：只清「被抢走的像素」，本体保留
        lost = (max_obj != batch_inds)[:, None]              # [N_obj, 1, H, W]
        kill = (~shrink_ok)[:, None, None, None] & lost
        low_res_masks = torch.where(kill, torch.clamp(low_res_masks, max=-10.0), low_res_masks)

    interpol_size = self.maskmem_backbone.mask_downsampler.interpol_size
    mem_masks = F.interpolate(low_res_masks, size=interpol_size,
                              mode="bilinear", align_corners=False)

    obj_scores = torch.where((mem_masks > 0).any(dim=(-1, -2)), 10.0, -10.0)

    pix_feat = to_spatial(vision_feats[-1], feat_sizes[-1][0], feat_sizes[-1][1])
    maskmem_features, maskmem_pos_enc = self._encode_new_memory(
        pix_feat=pix_feat, pred_masks_high_res=mem_masks,
        object_score_logits=obj_scores,
        multiplex_state=mux_state, cond_obj_mask=cond_obj_mask)
    current_out["maskmem_features"] = maskmem_features
    current_out["maskmem_pos_enc"] = maskmem_pos_enc


def _official_code_matches():
    """自检：官方源码还是不是我们打过补丁的那个版本（防止官方升级后补丁失配）。"""
    try:
        import inspect
        from comfy.ldm.sam3.tracker import SAM31Tracker
        src = inspect.getsource(SAM31Tracker._deferred_memory_encode)
        if "shrink_ok[:, None, None, None].expand_as(low_res_masks)" not in src:
            return False
        src2 = inspect.getsource(SAM31Tracker._match_and_add_detections)
        return "keep_alive" in src2 and "_match_and_add_detections" in src2
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 补丁 ③：keep_alive 不因「漏检一帧」把身份判死（ 真正的元凶）
# ---------------------------------------------------------------------------
# 官方机制：
#   ① `tracker.py` 1727 行：新建身份时 `keep_alive[i] = 1`（不是 8！）
#   ② `_match_and_add_detections`（1600-1605 行）：
#        本帧的检测结果能匹配上（IoU≥0.5）→ keep_alive +1（上限 8）
#        匹配不上 → keep_alive -1
#   ③ 1770-1773 行：`if keep_alive.get(i, 0) <= 0: masks_out[i] = NO_OBJ_SCORE`
#      ⇒ 该身份的最终遮罩被整个置成 -1024（空）⇒ 那一帧这人「消失」
#
# 后果（用户实测：第 3.6 秒第二个人整段消失，第 5 秒闪一下又没了）：
#   keep_alive 从 1 起步，**检测漏一帧就掉到 0 → 当帧判死**；
#   死后该身份再也匹配不上检测结果 ⇒ keep_alive 一直 -1 ⇒ **永久死亡**；
#   只有 max_objects 有余量时被重新检出才会变成新身份（编号变了 ⇒ 颜色串了）。
#
# XiaoHei 修法：把 keep_alive 的下限抬到 1 ⇒ **永不被官方强制判死**。
#   · 只堵掉「因漏检而暴毙」这条额外死路；
#   · 模型自己判 no_obj（`object_score_logits <= 0`）仍然照旧生效
#     ⇒ 真的看不见的人遮罩照样空（这是对的）；
#   · 只要下一帧模型/检测能重新匹配上（overlap≥0.5），
#     `reconditioned` 机制会用新检测刷新它的遮罩 ⇒ **颜色跟人走，不串色**。
def _xh_match_and_add_detections(self, det_masks, det_scores, current_out, mux_state,
                                  vision_feats, feat_sizes, device, max_objects=0,
                                  keep_alive=None):
    orig = _ORIG_MATCH.get(id(type(self)))
    if orig is None:
        orig = _ORIG_MATCH.get("default")
    if orig is None:
        raise RuntimeError("SAM3: 原始 _match_and_add_detections 丢了")
    r = orig(self, det_masks, det_scores, current_out, mux_state,
             vision_feats, feat_sizes, device, max_objects, keep_alive)
    if keep_alive is not None:
        floor = _KEEP_ALIVE_FLOOR
        for k in list(keep_alive.keys()):
            if keep_alive[k] < floor:
                keep_alive[k] = floor
    if _DEBUG:
        _dbg(f"f{_CURRENT_FRAME:04d} MATCH keep_alive={dict(keep_alive) if keep_alive else None}")
    return r


_ORIG_MATCH = {}
_KEEP_ALIVE_FLOOR = int(os.environ.get("XH_SAM3_KEEP_ALIVE_FLOOR", "1") or 1)


def apply_patch(verbose=True):
    """猴补官方 tracker。幂等。返回是否真的挂上了。"""
    global _PATCHED
    if _PATCHED:
        return True
    if not _enabled():
        if verbose:
            print("[XiaoHei] SAM3 追踪稳像补丁：已按 XH_SAM3_KEEP_OCCLUDED=0 关闭（用官方原行为）")
        _PATCHED = True
        return False
    try:
        from comfy.ldm.sam3.tracker import SAM31Tracker
    except Exception as e:      # noqa: BLE001
        if verbose:
            print(f"[XiaoHei]  SAM3 稳像补丁未挂载（不影响其余功能）：{e}")
        _PATCHED = True
        return False

    if not _official_code_matches():
        if verbose:
            print("[XiaoHei]  SAM3 稳像补丁未挂载：官方 tracker 源码已变（可能升级过），"
                  "补丁失配 ⇒ 仍用官方行为")
        _PATCHED = True
        return False

    setattr(SAM31Tracker, "_suppress_recently_occluded",
            staticmethod(_xh_suppress_recently_occluded))
    setattr(SAM31Tracker, "_deferred_memory_encode", _xh_deferred_memory_encode)

    # 补丁 ③：keep_alive 下限（保住原方法引用，供包装调用）
    orig_match = SAM31Tracker.__dict__.get("_match_and_add_detections")
    if orig_match is not None:
        _ORIG_MATCH[id(SAM31Tracker)] = orig_match
        _ORIG_MATCH["default"] = orig_match
        setattr(SAM31Tracker, "_match_and_add_detections", _xh_match_and_add_detections)

    if verbose:
        print("[XiaoHei]  SAM3 追踪稳像补丁已挂载："
              "遮挡时只清重叠区 + keep_alive 不因漏检判死 "
              "⇒ 第二个人不再中途消失/换色")
    _PATCHED = True
    return True


def status():
    """当前补丁状态（排查用）。"""
    try:
        from comfy.ldm.sam3.tracker import SAM31Tracker
        s1 = SAM31Tracker.__dict__.get("_suppress_recently_occluded")
        s2 = SAM31Tracker.__dict__.get("_deferred_memory_encode")
        s3 = SAM31Tracker.__dict__.get("_match_and_add_detections")
        p1 = getattr(s1, "__func__", s1) is _xh_suppress_recently_occluded
        p2 = s2 is _xh_deferred_memory_encode
        p3 = s3 is _xh_match_and_add_detections
    except Exception:
        p1 = p2 = p3 = False
    return {"enabled": _enabled(), "suppress_patched": bool(p1),
            "memory_encode_patched": bool(p2),
            "keep_alive_patched": bool(p3),
            "keep_alive_floor": _KEEP_ALIVE_FLOOR,
            "env": os.environ.get("XH_SAM3_KEEP_OCCLUDED", "(未设置→默认开)")}
