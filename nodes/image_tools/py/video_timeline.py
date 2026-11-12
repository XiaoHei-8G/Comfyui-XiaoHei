# -*- coding: utf-8 -*-
"""
 XiaoHei-视频分段轴（XHVideoTimeline）—— 2026-10-31 新增

【为什么做这个节点】
SAM3 追踪在「人物换位置 / 交叉 / 出入画」时最容易串号（ID 漂移）。
用户的解法很对：**把视频切成若干段，每段独立重跑识别，段内人物不动 ⇒ ID 天然稳定**。
但「切在哪一帧」必须**看着画面定**，手算帧号不现实。

本节点 = 一个「分段决策器」：
  · 前端：内嵌 <video> 播放器 + 帧轨道，拖拽切 N 段（每段一条色带、两端可拖）
  · 后端：按传入的 index（XiaoHei-循环 的轮次）取出对应那一段 → 输出 start_frame / seg_frames
  ⇒ 直接接到 XiaoHei-加载视频 的 start_frame / frame_count 两个口，
    一个 XiaoHei-加载视频 + 一条 SAM3 链路，在 XiaoHei-循环 里跑 N 段。

【为什么不碰 XiaoHei-加载视频】
它已经有 start_frame / frame_count 两个口（接分段表）+ seek 相位修正 + 内嵌播放器，
功能够用；往里加 DOM 控件要过家族那套「锁高 / 存档自愈」的雷区，风险远大于收益。
本节点是**独立新件**，一个现有节点都不改。

【段数据格式（前端写、后端读）】
JSON 数组，每个元素两种写法都认：
    [[0, 120], [120, 96]]
    [{"start": 0, "len": 120, "label": "第1段"}, ...]
空 / 解析失败 = 不切段，整段视频（start=0, frames=总帧数）。

【零新增依赖】
复用同包 video_load.py 的 _list_input_videos / _probe_video / _video_from_file（都在 image_tools 里）。
"""

import json
import os

import folder_paths

from comfy_api.latest import io

from .video_load import _list_input_videos, _probe_video, _video_from_file

# 探测缓存：path + mtime → 探测结果（循环里每轮都会问，别每次都开一遍视频）
_PROBE_CACHE = {}


def _probe_cached(path):
    try:
        st = os.stat(path)
        key = (path, int(st.st_mtime), int(st.st_size))
    except OSError:
        key = path
    hit = _PROBE_CACHE.get(key)
    if hit is None:
        hit = _probe_video(path)
        _PROBE_CACHE[key] = hit
    return hit


def _parse_segments(raw):
    """把 segments 字符串解析成 [(start, len, label), ...]。
    解析不出来就返回空列表（= 不切段）。"""
    if raw is None:
        return []
    txt = str(raw).strip()
    if not txt or txt in ("[]", "null", "None"):
        return []
    try:
        data = json.loads(txt)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out = []
    for it in data:
        start = length = None
        label = ""
        if isinstance(it, (list, tuple)) and len(it) >= 2:
            start, length = it[0], it[1]
            if len(it) >= 3 and isinstance(it[2], str):
                label = it[2]
        elif isinstance(it, dict):
            start = it.get("start", it.get("s"))
            length = it.get("len", it.get("length", it.get("n")))
            label = str(it.get("label", "") or "")
        if start is None or length is None:
            continue
        try:
            start = int(round(float(start)))
            length = int(round(float(length)))
        except Exception:
            continue
        if length <= 0:
            continue
        out.append((max(0, start), length, label))
    return out


class XHVideoTimeline(io.ComfyNode):
    """视频分段轴：在播放器上拖拽切段，按轮次取出该段的起始帧与帧数。

     用 V3（io.ComfyNode）而不是 V1：index 必须是**可连线的口**（接 XiaoHei-循环 的轮次）。
      V1 的 INPUT_TYPES 只能把它做成 widget（用户还得右键手动 Convert to Input），
      拖进工作流就接不上循环。forceInput=True 才是正解。
    """

    @classmethod
    def define_schema(cls):
        vids = _list_input_videos()
        return io.Schema(
            node_id="XHVideoTimeline",
            display_name="视频分段轴",
            description=("【XiaoHei-视频分段轴】在节点自带的播放器上拖拽把视频切成若干段；"
                         "按 index（接 XiaoHei-循环 的轮次）输出那一段的 start_frame / seg_frames —— "
                         "直接接 XiaoHei-加载视频 的「起始帧 / 取多少帧」两个口，"
                         "就能做到「每段独立重跑 SAM3 识别，人物换位置也不串号」。"),
            category="XiaoHei/Video",
            inputs=[
                io.Combo.Input(
                    "video", options=vids,
                    default=(vids[0] if vids else None),
                    tooltip=("【 视频文件】ComfyUI input 目录里的视频。"
                             "没有你想要的？点节点上的「 上传视频」按钮选文件。"
                             " | English: a video from the ComfyUI input folder."),
                ),
                io.String.Input(
                    "segments", default="[]", multiline=True,
                    tooltip=("【 分段数据】由节点上的时间轴拖拽生成（不用手填）。\n"
                             "格式：[{\"start\": 起始帧, \"len\": 帧数, \"label\": \"段名\"}, ...]\n"
                             "留空 = 不切段，整段视频。\n"
                             " | English: segment list produced by the on-node timeline."),
                ),
                io.Int.Input(
                    "index", default=0, min=0, max=100000, step=1, force_input=True,
                    tooltip=("【 第几段】0 = 第 1 段。接 XiaoHei-循环 的 index 口，"
                             "就能在循环里逐段处理。\n"
                             " | English: which segment to output (0-based)."),
                ),
            ],
            outputs=[
                io.Int.Output(display_name="start_frame", tooltip="这一段的起始帧号"),
                io.Int.Output(display_name="seg_frames", tooltip="这一段有多少帧"),
                io.String.Output(display_name="segments_info", tooltip="分段情况的可读报告"),
                io.Video.Output(display_name="video", tooltip="原视频（直通，供预览）"),
            ],
        )

    @classmethod
    def execute(cls, video, segments, index, **kwargs):
        if not video:
            raise ValueError("[XiaoHei-视频分段轴] 没选视频。先在下拉里选一个，或点「 上传视频」。")
        path = folder_paths.get_annotated_filepath(video)
        if not path or not os.path.exists(path):
            raise ValueError(f"[XiaoHei-视频分段轴] 视频文件找不到：{video}")

        info = _probe_cached(path)
        total = int(info.get("frames_total") or 0)
        fps = float(info.get("fps") or 0.0)

        segs = _parse_segments(segments)
        if not segs:
            start, length, label = 0, total, ""
            cur = "整段"
        else:
            idx = int(index)
            if idx < 0:
                idx = 0
            if idx >= len(segs):
                idx = len(segs) - 1
            start, length, label = segs[idx]
            cur = label or f"第{idx + 1}段"

        clipped = ""
        if total > 0 and start + length > total:
            new_len = max(1, total - start)
            clipped = f"（原 {length} 帧，尾部超出视频已裁到 {new_len} 帧）"
            length = new_len
        if total > 0 and start >= total:
            start = max(0, total - 1)
            clipped = "（起始帧超出视频，已钳到最后一帧）"

        lines = [f"视频：{video}",
                 f"总帧数 {total} · fps {fps:g} · 时长 {info.get('duration', 0):g}s",
                 f"分段 {len(segs)} 段，当前取：{cur}"]
        for i, (s, l, lb) in enumerate(segs):
            mark = "▶" if i == (int(index) if segs else -1) else "  "
            t0 = (s / fps) if fps else 0.0
            t1 = ((s + l) / fps) if fps else 0.0
            lines.append(f"{mark} 段{i + 1} {lb or ''} 帧{s}~{s + l - 1}"
                         f"（{t0:.2f}s~{t1:.2f}s，{l} 帧）")
        if clipped:
            lines.append(" " + clipped)
        report = "\n".join(lines)

        return (int(start), int(length), report, _video_from_file(path))


NODE_CLASS_MAPPINGS = {
    "XHVideoTimeline": XHVideoTimeline,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHVideoTimeline": "视频分段轴",
}
