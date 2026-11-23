from __future__ import annotations

import numpy as np
import torch
from comfy_api.latest import io, ui

from ..scenecut.preview import contact_sheet, grab_frames, pick_frames, thumb_size
from .common import CATEGORY, Progress, Scenes, fps_input, images_input, resolve_scenes


class XH_SceneCutContactSheet(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutContactSheet",
            display_name="分镜缩略图墙 XiaoHei",
            category=CATEGORY,
            is_output_node=True,
            search_aliases=["scene thumbnails", "shot grid", "storyboard"],
            description="每个片段一格的缩略图墙：带序号、起始时间、时长和开头切点类型（蓝色硬切、紫色跳切、橙色转场）。",
            inputs=[
                Scenes.Input("scenes", optional=True),
                images_input(),
                fps_input(),
                io.Combo.Input("frames_per_scene", options=["1", "3", "5"], default="3",
                               tooltip="1：中间帧。3/5：从头到尾均匀取帧，避开切点前后几帧。"),
                io.Int.Input("thumb_width", default=192, min=64, max=640, step=16),
                io.Int.Input("columns", default=4, min=1, max=16),
                io.Int.Input("rows", default=6, min=1, max=40, tooltip="每页片段数 = 列数 × 行数。"),
                io.Int.Input("first_scene", default=1, min=1, max=100000, advanced=True,
                             tooltip="从第几个片段开始显示（从 1 数起）。"),
                io.Int.Input("max_pages", default=4, min=1, max=200, advanced=True),
            ],
            outputs=[io.Image.Output(display_name="pages")],
        )

    @classmethod
    def execute(cls, frames_per_scene, thumb_width, columns, rows, first_scene=1, max_pages=4,
                scenes=None, images=None, fps=None) -> io.NodeOutput:
        sl = resolve_scenes(scenes, images, fps)
        per = int(frames_per_scene)
        indices = list(range(len(sl.segments)))
        if sl.selection is not None:
            indices = [i for i in indices if i in set(sl.selection)]
        indices = indices[first_scene - 1:][: columns * rows * max_pages]
        tw, th = thumb_size(sl.source.width, sl.source.height, thumb_width)
        frames = [f for i in indices for f in pick_frames(sl.segments[i], per)]
        progress = Progress(max(frames) + 1 if frames else 1)
        thumbs = grab_frames(sl.source.path, frames, (tw, th), progress=progress,
                             check_abort=progress.check_abort)
        pages = contact_sheet(sl, thumbs, indices, per, tw, th, columns, rows)
        batch = torch.from_numpy(np.stack([np.asarray(p, np.float32) / 255.0 for p in pages]))
        return io.NodeOutput(batch, ui=ui.PreviewImage(batch, cls=cls))
