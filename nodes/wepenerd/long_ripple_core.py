"""H3 Long Ripple - pure chunk-planning helpers.

No torch / no ComfyUI imports: this module can be unit-tested standalone.
The 17k+5 rule and the 24 fps grid come from WepeNerd's ripple_core.py.
Overlap alignment follows the H3 legal temporal grid documented by
Songssx/ComfyUI-MiniMaxH3-TimelineDirector (24 -> 22, 48 -> 39).
"""
from __future__ import annotations

import json
import math
import re

FPS = 24
MIN_FRAMES = 5
MAX_SEGMENT_FRAMES = 362   # frame_number_presets.json：H3 训练窗口上沿，超出只提示不硬拦


def line(en: str, zh: str) -> dict:
    """Bilingual status line, same shape as XiaoHei family nodes."""
    return {"zh": zh, "en": en}


def duration_frames(duration: float) -> int:
    if not math.isfinite(float(duration)) or duration <= 0:
        raise ValueError("chunk_duration must be a finite positive number of seconds.")
    return max(MIN_FRAMES, 5 + 17 * math.floor((duration * FPS - 5) / 17 + 0.5))


def legal_down(n: int) -> int:
    """Largest legal 17k+5 count <= n, or 0 when n < 5."""
    n = int(n)
    if n < MIN_FRAMES:
        return 0
    return 5 + 17 * ((n - 5) // 17)


def legal_up(n: int) -> int:
    """Smallest legal 17k+5 count >= n."""
    n = max(MIN_FRAMES, int(n))
    return 5 + 17 * math.ceil((n - 5) / 17)


def align_overlap(frames: int) -> int:
    """Round a requested overlap DOWN onto H3's legal 17k+5 grid.

    9 -> 5, 24 -> 22, 48 -> 39. A value below 5 means no usable context,
    so it collapses to 5 rather than being silently ignored (0 disables it).
    """
    frames = int(frames)
    if frames <= 0:
        return 0
    return max(MIN_FRAMES, legal_down(frames))


def plan(total: int, chunk_duration: float, overlap_frames: int,
         chunk_mode: bool = True, max_chunks: int = 256) -> dict:
    """Build the slicing plan for a whole ripple window.

    Every chunk is rendered at exactly L frames (a legal H3 length). When the
    source runs out, the last source frame is frozen to pad the chunk, then the
    concatenated output is trimmed back to `total` frames. This is the
    last-clip padding/trimming rule documented by mark9009/ComfyUI-H3-LongTake.

    Returns a dict with `chunk_frames`, `requested_overlap`, `overlap`,
    `step`, `segments`, `output_frames` and a bilingual `summary`.
    """
    total = int(total)
    if total < MIN_FRAMES:
        raise ValueError(f"Need at least {MIN_FRAMES} source frames, got {total}.")

    L = duration_frames(chunk_duration)
    requested = int(overlap_frames)
    C = align_overlap(requested) if chunk_mode else 0
    if C >= L:
        C = legal_down(L - 1)

    if not chunk_mode or total <= L:
        # Single pass: H3 still needs a legal latent length, so round up and trim.
        generated = max(L, legal_up(total)) if not chunk_mode else L
        seg = {
            "index": 0,
            "source_start": 0,
            "source_end": min(total, generated),
            "generated": generated,
            "pad": max(0, generated - total),
            "trim_head": 0,
            "new_frames": min(total, generated),
        }
        return {
            "chunk_frames": generated,
            "requested_overlap": requested,
            "overlap": 0,
            "step": generated,
            "segments": [seg],
            "output_frames": min(total, generated),
            "chunk_mode": bool(chunk_mode),
            "summary": line(
                f"Single pass: {min(total, generated)} frames ({generated} generated, no chunking).",
                f"单段模式：输出 {min(total, generated)} 帧（生成 {generated} 帧，未分块）。"),
        }

    step = L - C
    segments = []
    start = 0
    produced = 0
    while len(segments) < max_chunks:
        source_end = min(start + L, total)
        pad = L - (source_end - start)
        trim_head = C if segments else 0
        new_frames = L - trim_head
        segments.append({
            "index": len(segments),
            "source_start": start,
            "source_end": source_end,
            "generated": L,
            "pad": max(0, pad),
            "trim_head": trim_head,
            "new_frames": new_frames,
        })
        produced += new_frames
        if source_end >= total:
            break
        start += step
    else:
        raise ValueError(f"Chunk plan exceeded max_chunks={max_chunks}; shorten the video or raise the cap.")

    output_frames = min(total, produced)
    return {
        "chunk_frames": L,
        "requested_overlap": requested,
        "overlap": C,
        "step": step,
        "segments": segments,
        "output_frames": output_frames,
        "chunk_mode": True,
        "summary": line(
            f"{len(segments)} chunks x {L} frames; overlap {requested} -> {C} (17k+5 grid); "
            f"step {step}; output {output_frames} of {total} frames.",
            f"共 {len(segments)} 段，每段 {L} 帧；重叠 {requested} 帧按 17k+5 对齐为 {C} 帧；"
            f"步长 {step}；输出 {output_frames}/{total} 帧。"),
    }


# ──  2026-11-10 XiaoHei 自加：手动分段（按镜头切点，段长不等 + 每接缝单独重叠）──────
#   平均模式下所有接缝共用一个 C，硬切点上照样重叠/羽化/续接尾帧 ⇒ 会把两个不同镜头
#   插成「半 A 半 B」的鬼影帧，还会把 A 镜头末帧塞进 B 镜头当 frame-0 引导图。
#   手动模式：H = 0 重叠 + 不羽化 + 不续接；C[:N] = 该接缝真实 N 帧重叠（不再按 17k+5 压成 5）。
#   H3 只约束「每段生成长度」是 17k+5；重叠量 O 只是源窗回退/裁切量，可以是任意整数。
_CUT_RE = re.compile(r"^(\d+(?:\.\d+)?)([fF])?\s*([HhCc])?\s*(?::\s*(\d+))?$")


def parse_cuts(text, total, default_overlap=9):
    """解析切点文本框 → [{frame, kind, overlap, raw, requested, unit}]。

    每项格式：秒数 或 帧号f，可选 H/C，可选 :重叠帧数；逗号 / 分号 / 换行分隔。
    例：8.5H, 19.2C:20, 486fC:22。省类型 = C，省 :N = 全局 overlap_frames。
    """
    total = int(total)
    raw_text = str(text or "")
    parts = [s.strip() for s in re.split(r"[,;\n\r，；]+", raw_text) if s.strip()]
    merged = {}
    for raw in parts:
        item = re.sub(r"\s+", "", raw)
        m = _CUT_RE.match(item)
        if not m:
            raise ValueError(
                f"Invalid cut point {item!r}: use seconds or a frame number with f, "
                f"optional H/C and optional :N overlap (e.g. 8.5H, 19.2C:20). | "
                f"切点 {item!r} 格式不对：填秒数或带 f 的帧号，可加 H/C 与 :重叠帧数"
                f"（例：8.5H, 19.2C:20）。")
        number, is_frames, kind, ov = m.groups()
        value = float(number)
        frame = int(round(value)) if is_frames else int(round(value * FPS))
        seam = (kind or "C").upper()
        overlap = 0 if seam == "H" else (int(ov) if ov is not None else int(default_overlap))
        if frame <= 0 or frame >= total:
            continue                      # 片头/片尾外的切点不是接缝，直接忽略
        merged[frame] = {"frame": frame, "kind": seam, "overlap": max(0, overlap),
                         "raw": item, "requested": value,
                         "unit": "f" if is_frames else "s"}
    return [merged[k] for k in sorted(merged)]


def plan_from_cuts(total, cuts, chunk_duration, default_overlap=9, max_chunks=256):
    """按用户镜头切点排计划：段长不等，每个接缝独立 H/C 与重叠帧数。

    每段生成长度仍是 17k+5（legal_up(n + 前接缝重叠)）；输出精确取
    images[O_prev : O_prev + n]，因此段边界严格落在用户给的帧上，输出帧数 = total。
    镜头区间超过 chunk_duration 推导的合法段长时，内部按平均步长自动补切（全 C 接缝）。
    """
    total = int(total)
    if total < MIN_FRAMES:
        raise ValueError(f"Need at least {MIN_FRAMES} source frames, got {total}.")
    L_cap = min(duration_frames(chunk_duration), MAX_SEGMENT_FRAMES)
    O_def = max(0, int(default_overlap))
    step = max(1, L_cap - O_def)
    user = {int(c["frame"]): dict(c) for c in (cuts or [])}
    bounds = [0, *sorted(user), total]

    marks = {}
    for a, b in zip(bounds, bounds[1:]):
        pos = a
        while b - pos > L_cap:
            pos += step
            if pos >= b:
                break
            marks.setdefault(pos, {"frame": pos, "kind": "C", "overlap": O_def,
                                   "raw": "", "requested": pos / FPS, "unit": "s",
                                   "auto": True})
    for frame, c in user.items():
        marks[frame] = {**c, "auto": False}       # 用户切点优先于内部自动补切
    edges = [0, *sorted(marks), total]

    for frame, seam in marks.items():
        i = edges.index(frame)
        left, right = frame - edges[i - 1], edges[i + 1] - frame
        seam["overlap"] = 0 if seam["kind"] == "H" else max(
            0, min(int(seam["overlap"]), left, right))
        seam.setdefault("auto", False)

    segments = []
    for i, (a, b) in enumerate(zip(edges, edges[1:])):
        n = b - a
        if n <= 0:
            continue
        O_prev = int(marks[a]["overlap"]) if i > 0 else 0
        kind_prev = marks[a]["kind"] if i > 0 else "H"
        O_next = int(marks[b]["overlap"]) if i < len(edges) - 2 else 0
        generated = legal_up(n + O_prev)
        start = a - O_prev
        segments.append({
            "index": len(segments),
            "source_start": start,
            "source_end": min(total, start + generated),
            "generated": generated,
            "pad": max(0, start + generated - total),
            "trim_head": O_prev,
            "new_frames": n,
            "seam_before": kind_prev,
            "overlap_after": O_next,
            "cut_frame": a,
        })
        if len(segments) >= max_chunks:
            raise ValueError(
                f"Manual cut plan exceeded max_chunks={max_chunks}; add fewer cuts or "
                f"raise chunk_duration. | 手动分段超过 {max_chunks} 段上限：减少切点或加大每段时长。")

    output_frames = sum(s["new_frames"] for s in segments)
    hard = sum(1 for m in marks.values() if m["kind"] == "H")
    longest = max((s["generated"] for s in segments), default=0)
    outside = longest > MAX_SEGMENT_FRAMES
    summary = line(
        f"Manual cuts: {len(segments)} chunks, {hard} hard cut(s), "
        f"{len(marks) - hard} continuous seam(s); longest chunk {longest} frames"
        f"{' (outside trained window)' if outside else ''}; "
        f"output {output_frames}/{total} frames.",
        f"手动分段：共 {len(segments)} 段（硬切 {hard} 处 / 连续接缝 {len(marks) - hard} 处）；"
        f"最长一段生成 {longest} 帧{'（ 训练窗口外）' if outside else ''}；"
        f"输出 {output_frames}/{total} 帧。")
    return {
        "chunk_frames": L_cap,
        "requested_overlap": O_def,
        "overlap": 0,                # 手动模式没有全局重叠，逐接缝写在 segments 里
        "step": step,
        "segments": segments,
        "output_frames": output_frames,
        "chunk_mode": True,
        "cut_mode": "manual",
        "seams": marks,
        "summary": summary,
    }


def cut_line(p, cuts):
    """双语状态行：把用户填的每个切点回显成实际帧号 / 秒数，方便核对吸附结果。"""
    rows = []
    for c in (cuts or []):
        sec = c["frame"] / FPS
        tag = "H" if c["kind"] == "H" else "C"
        rows.append(f"{c['raw']} → f{c['frame']} ({sec:.2f}s, {tag}:{c['overlap']})")
    # 内部自动补切也一并列出，避免用户以为「我明明只填了 2 个切点，怎么 5 段」
    auto = [f"f{m['frame']} ({m['frame'] / FPS:.2f}s, C:{m['overlap']})"
            for m in sorted(p["seams"].values(), key=lambda x: x["frame"]) if m.get("auto")]
    tail = (f" | auto-split seams: {', '.join(auto)}" if auto else "")
    tail_zh = (f"；段内过长自动补切：{'、'.join(auto)}" if auto else "")
    return line(
        f"Cut points: {'; '.join(rows) if rows else '(none)'}."
        f"{tail} (H = 0 overlap, no blend, no tail carry; C:N = N overlap frames.)",
        f"切点回显：{'；'.join(rows) if rows else '（无）'}。"
        f"{tail_zh}（H＝0 重叠、不羽化、不续接尾帧；C:N＝该接缝重叠 N 帧。）")


def plan_report(p: dict) -> str:
    """Human-readable plan for the console / a STRING output."""
    head = (f"chunk_frames={p['chunk_frames']} overlap={p['overlap']} "
            f"(requested {p['requested_overlap']}) step={p['step']} "
            f"segments={len(p['segments'])} output={p['output_frames']}")
    rows = []
    for s in p["segments"]:
        extra = ""
        if "seam_before" in s:      # 老的平均模式没有这两个键，输出保持一字不变
            extra = (f" cut_at={s['cut_frame']} seam_before={s['seam_before']} "
                     f"overlap_after={s['overlap_after']}")
        rows.append(
            f"  #{s['index']:02d} source[{s['source_start']}:{s['source_end']}] "
            f"gen={s['generated']} pad={s['pad']} trim_head={s['trim_head']} "
            f"new={s['new_frames']}{extra}")
    return "\n".join([head, *rows])


# ──  2026-11-10 XiaoHei 自加：三层父子模型（L1 分段 / L2 逐段 / L3 段内分块）────────
#    老路径 plan() / plan_from_cuts() / parse_cuts() 一行未动，老工作流 / API 零回归。
#   「段」= 按画面内容切（父）：镜头切换点、硬切 H、连续 C:N。
#   「块」= 段内因 H3 17k+5 上限必须再切（子）：块边界固定连续接缝。
#   每层定完才展开下一层：段边界 → 每段要不要分块 / 分几块 → 逐块排采样。
#   段边界严格落在用户给的帧上（不吸附），因为每段按合法帧数多生成、只取属于本段的帧。
def parse_spec(text, total, default_overlap=9, default_split="auto"):
    """解析前端「分段计划面板」写出的结构化 JSON；旧的文本框语法自动升级兼容。

    返回 None = 没有新计划（空面板 / 老工作流），调用方回落老路径。
    """
    total = int(total)
    raw = str(text or "").strip()
    if not raw:
        return None
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
        except Exception as exc:
            raise ValueError(
                f"Invalid segment plan JSON: {exc}. Delete this node and add a fresh one. | "
                f"分段计划 JSON 解析失败（{exc}）：删掉这个节点重新加一个即可。")
        if not isinstance(data, dict):
            raise ValueError("Segment plan must be a JSON object. | 分段计划必须是 JSON 对象。")
        mode = str(data.get("mode") or "cuts").lower()
        if mode not in ("average", "cuts", "single"):
            mode = "cuts"
        split_default = str(data.get("default_split") or default_split).lower()
        if split_default not in ("auto", "on", "off"):
            split_default = default_split
        dedup = {}
        for item in data.get("rows") or []:
            if not isinstance(item, dict):
                continue
            try:
                frame = int(round(float(item.get("frame", 0))))
            except (TypeError, ValueError):
                continue
            if not (0 < frame < total):
                continue
            kind = "H" if str(item.get("kind", "C")).upper().startswith("H") else "C"
            try:
                overlap = 0 if kind == "H" else max(0, int(item.get("overlap", default_overlap)))
            except (TypeError, ValueError):
                overlap = int(default_overlap)
            split = str(item.get("split") or split_default).lower()
            if split not in ("auto", "on", "off"):
                split = split_default
            try:
                chunks = max(1, int(item.get("chunks", 2)))
            except (TypeError, ValueError):
                chunks = 2
            dedup[frame] = {"frame": frame, "kind": kind, "overlap": overlap,
                            "split": split, "chunks": chunks}
        try:
            count = max(0, int(data.get("count") or 0))
        except (TypeError, ValueError):
            count = 0
        return {"mode": mode, "count": count, "rows": [dedup[k] for k in sorted(dedup)],
                "default_split": split_default, "json": True}
    #  旧版文本框语法（8.5H, 19.2C:20）一律返回 None ⇒ 后端继续走老 plan_from_cuts 路径，
    #   老工作流逐位零回归。「升级成新面板」只发生在前端：加载时显示成结构化行，
    #   但直到用户真的点了一下才把 JSON 写回 widget，不点就永远保持老行为。
    return None


def _segment_bounds(total, spec, default_overlap, L_cap):
    """L1：段边界 [(frame, kind, overlap, split, chunks)]，不含 0 与 total。"""
    mode = spec["mode"]
    if mode == "single":
        return []
    if mode == "cuts":
        return [(r["frame"], r["kind"], r["overlap"], r["split"], r["chunks"])
                for r in spec["rows"]]
    count = int(spec.get("count") or 0)
    if count <= 0:
        count = max(1, math.ceil(total / L_cap))
    count = max(1, min(count, total))
    policy = spec.get("default_split") or "auto"
    return [(int(round(i * total / count)), "C", int(default_overlap), policy, 2)
            for i in range(1, count)]


def _inner_cuts(a, b, policy, chunks, L_cap, overlap):
    """L2/L3：一段内部切成几块，返回内部块边界帧号（固定 C 接缝）。

    auto / off 且段长 <= L_cap 时返回空 —— 这一段整段一次生成（面板不再提供开关）。
    on 时按 chunks 均分；任何单块仍超过 H3 上限就继续按步长补切（物理硬约束）。
     off 并不能禁用补切：超出上限时它与 auto 行为完全一致，旧界面那档是假关。
    """
    n = b - a
    if n <= 0:
        return []
    if policy == "on" and chunks > 1:
        edges = [a, *[a + int(round(i * n / chunks)) for i in range(1, chunks)], b]
    else:
        edges = [a, b]
    cuts = list(edges[1:-1])
    step = max(1, L_cap - overlap)
    for x, y in zip(edges, edges[1:]):
        pos = x + step
        while pos < y:
            cuts.append(pos)
            pos += step
    return sorted({int(c) for c in cuts if a < c < b})


def plan_hierarchical(total, spec, chunk_duration, default_overlap=9, max_chunks=256):
    """三层父子排段：L1 分段 → L2 逐段决定是否分块 → L3 段内块 → 逐块采样计划。

    输出结构与 plan_from_cuts() 完全同构（seam_before / trim_head / new_frames /
    overlap_after / cut_frame），因此渲染循环一行不用改。新增 segment_index /
    is_segment_start / auto_split 仅供状态行分层回显。
    """
    total = int(total)
    if total < MIN_FRAMES:
        raise ValueError(f"Need at least {MIN_FRAMES} source frames, got {total}.")
    L_cap = min(duration_frames(chunk_duration), MAX_SEGMENT_FRAMES)
    O_def = max(0, int(default_overlap))
    bounds = _segment_bounds(total, spec, O_def, L_cap)
    seg_edges = [0, *[b[0] for b in bounds], total]

    marks = {}
    for index, (frame, kind, ov, split, chunks) in enumerate(bounds, start=1):
        marks[frame] = {"frame": frame, "kind": kind, "overlap": ov,
                        "is_segment": True, "segment_index": index,
                        "auto": False, "split": split, "chunks": chunks}

    segments_meta = []
    for si, (a, b) in enumerate(zip(seg_edges, seg_edges[1:])):
        row = bounds[si - 1] if si > 0 else None
        policy = row[3] if row else (spec.get("default_split") or "auto")
        chunks = row[4] if row else 2
        inner = _inner_cuts(a, b, policy, chunks, L_cap, O_def)
        for frame in inner:
            marks[frame] = {"frame": frame, "kind": "C", "overlap": O_def,
                            "is_segment": False, "segment_index": si,
                            "auto": True, "split": policy, "chunks": chunks}
        segments_meta.append({"index": si, "start": a, "end": b,
                              "blocks": len(inner) + 1, "policy": policy,
                              "kind": row[1] if row else "H",
                              "overlap": row[2] if row else 0})

    edges = [0, *sorted(marks), total]
    for frame, seam in marks.items():
        i = edges.index(frame)
        left, right = frame - edges[i - 1], edges[i + 1] - frame
        seam["overlap"] = 0 if seam["kind"] == "H" else max(
            0, min(int(seam["overlap"]), left, right))

    segments = []
    for a, b in zip(edges, edges[1:]):
        n = b - a
        if n <= 0:
            continue
        before = marks.get(a) if a > 0 else None
        O_prev = int(before["overlap"]) if before else 0
        kind_prev = before["kind"] if before else "H"
        after = marks.get(b) if b < total else None
        O_next = int(after["overlap"]) if after else 0
        generated = legal_up(n + O_prev)
        start = a - O_prev
        segments.append({
            "index": len(segments),
            "source_start": start,
            "source_end": min(total, start + generated),
            "generated": generated,
            "pad": max(0, start + generated - total),
            "trim_head": O_prev,
            "new_frames": n,
            "seam_before": kind_prev,
            "overlap_after": O_next,
            "cut_frame": a,
            "segment_index": int(before["segment_index"]) if before else 0,
            "is_segment_start": bool(a == 0 or (before and before["is_segment"])),
            "auto_split": bool(before and before["auto"]),
        })
        if len(segments) >= max_chunks:
            raise ValueError(
                f"Hierarchical plan exceeded max_chunks={max_chunks}; use fewer segments or "
                f"raise chunk_duration. | 三层计划超过 {max_chunks} 块上限：减少分段或加大每段时长。")

    output_frames = sum(s["new_frames"] for s in segments)
    hard = sum(1 for m in marks.values() if m["kind"] == "H")
    longest = max((s["generated"] for s in segments), default=0)
    outside = longest > MAX_SEGMENT_FRAMES
    # 与节点面板上的三种模式按钮逐字一致：平均切 / 自己点 / 整片不切
    mode_label = {"average": "even cut", "cuts": "own cut points", "single": "no cut"}[spec["mode"]]
    mode_label_zh = {"average": "平均切", "cuts": "自己点", "single": "整片不切"}[spec["mode"]]
    summary = line(
        f"H3 plan: {len(segments_meta)} segment(s) ({mode_label}) -> "
        f"{len(segments)} block(s) in total; {hard} hard cut(s); "
        f"longest block {longest} frames{' (outside trained window)' if outside else ''}; "
        f"output {output_frames}/{total} frames.",
        f"H3 排段：{len(segments_meta)} 段（{mode_label_zh}）→ 共 {len(segments)} 块；"
        f"硬切 {hard} 处；最长一块生成 {longest} 帧"
        f"{'（训练窗口外）' if outside else ''}；输出 {output_frames}/{total} 帧。")
    return {
        "chunk_frames": L_cap,
        "requested_overlap": O_def,
        "overlap": 0,
        "step": max(1, L_cap - O_def),
        "segments": segments,
        "output_frames": output_frames,
        "chunk_mode": True,
        "cut_mode": "hierarchical",
        "seams": marks,
        "segments_meta": segments_meta,
        "mode": spec["mode"],
        "summary": summary,
    }


def hierarchy_line(p, spec):
    """双语状态行：按「段 → 块」逐层回显，让用户一眼看出「我填的切点落在哪」。

    文案里不出现 L1/L2/L3 这类内部层号——用户只需要看到「分了几段、每段几块」。
    """
    rows_zh, rows_en = [], []
    for s in p["segments_meta"]:
        sec_a, sec_b = s["start"] / FPS, s["end"] / FPS
        # off 与 auto 在 _inner_cuts() 里是同一条分支（超限照样补切），
        # 旧文案写「不分块 / no split」是假的，这里按真实行为写。
        policy_zh = {"auto": "超长才补切", "on": "强制均分", "off": "超长仍补切"}[s["policy"]]
        policy_en = {"auto": "split only when too long", "on": "forced even split",
                     "off": "still splits when too long"}[s["policy"]]
        head_zh = f"段{s['index'] + 1} [{s['start']}:{s['end']}] {sec_a:.2f}–{sec_b:.2f}s"
        head_en = f"seg {s['index'] + 1} [{s['start']}:{s['end']}] {sec_a:.2f}-{sec_b:.2f}s"
        if s["index"] == 0:
            # 片头没有接缝：不写类型，否则「段1 硬切」会被误读成这里切了一刀。
            seam_zh, seam_en = "", ""
        elif s["kind"] == "H":
            seam_zh, seam_en = "，接缝 硬切", ", seam hard"
        else:
            seam_zh = f"，接缝 连续·重叠 {s['overlap']} 帧"
            seam_en = f", seam continuous {s['overlap']}f"
        rows_zh.append(f"{head_zh}{seam_zh} → {s['blocks']} 块（{policy_zh}）")
        rows_en.append(f"{head_en}{seam_en} -> {s['blocks']} block(s) ({policy_en})")
    auto = sum(1 for s in p["segments"] if s.get("auto_split"))
    return line(
        f"Segments: {'; '.join(rows_en)}. Auto-split seams inside segments: {auto}. "
        f"(hard = 0 overlap, no blend, no tail carry; continuous = seam overlaps N frames.)",
        f"分段：{'；'.join(rows_zh)}。段内自动补切 {auto} 处。"
        f"（硬切＝0 重叠、不羽化、不续接上一段尾帧；连续＝该接缝重叠指定帧数。）")
