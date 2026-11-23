from __future__ import annotations

import os

from comfy_api.latest import io

from ..scenecut.media import probe
from .common import CATEGORY, video_from_path


def _resolve(path: str) -> str:
    path = (path or "").strip().strip('"').strip("'")
    return os.path.abspath(os.path.expanduser(path)) if path else ""


class XH_SceneCutLoadVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutLoadVideo",
            display_name="加载视频·分镜 XiaoHei",
            category=CATEGORY,
            search_aliases=["scene video", "load film", "open video path", "video from path"],
            description="从磁盘上任意路径加载视频，长片不用再复制到 ComfyUI 的 input 目录。输出标准 VIDEO；文件本来就在 input/ 里的话，官方的「加载视频」节点也一样用。",
            inputs=[
                io.String.Input("path", default="", placeholder="粘贴视频完整路径，例如 D:/视频/片段.mp4",
                                tooltip="视频文件的绝对路径。"),
            ],
            outputs=[
                io.Video.Output(display_name="video"),
                io.Int.Output(display_name="frame_count"),
                io.Float.Output(display_name="fps"),
                io.Float.Output(display_name="duration"),
            ],
        )

    @classmethod
    def execute(cls, path) -> io.NodeOutput:
        full = _resolve(path)
        info = probe(full)
        return io.NodeOutput(video_from_path(full), info.frame_count, info.fps_float, info.duration)

    @classmethod
    def fingerprint_inputs(cls, path):
        full = _resolve(path)
        return os.path.getmtime(full) if os.path.isfile(full) else float("nan")

    @classmethod
    def validate_inputs(cls, path):
        full = _resolve(path)
        if not full:
            return "请填写视频文件的路径。"
        if not os.path.isfile(full):
            return f"找不到视频文件：{full}（请填完整路径，文件放任意盘都能读）"
        return True
