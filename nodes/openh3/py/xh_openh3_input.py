# SPDX-License-Identifier: GPL-3.0-only
# 派生自 ComfyUI-OpenH3-VideoTools (Tensor Alchemist) 的 auto_input.py
# Copyright (C) 2026 Tensor Alchemist — 逻辑原样照搬，仅节点壳改名 + 文案中文化。
"""H3 视频预处理：CPU 上把上传的原始视频转成 CFR24 + 末帧补齐 + 对齐音频。"""

import folder_paths
import comfy.model_management
from comfy_api.latest import InputImpl, io

from .media_prepare import (
    VERSION,
    prepare_file,
    resolve_input,
    validate_frame_limit,
    validate_source_scale,
    validate_working_resolution,
)


def _uploaded_source(video):
    if type(video) is not InputImpl.VideoFromFile:
        raise ValueError("请直接连核心的「加载视频」节点。内存流、拼接或生成的 VIDEO 对象不支持。")
    path = resolve_input(video.get_stream_source(), folder_paths.get_input_directory())
    # 本节点读的是完整的上传文件，不读 VIDEO 对象的编辑结果。
    # 没有公开的裁剪取值接口；调它的尺寸或负数裁剪 getter 会同步触发解码。
    # 所以这里要求画布上就是原始 LoadVideo，并按「整段文件」处理。
    return path


class XHOpenH3AutoInput(io.ComfyNode):
    """XiaoHei-H3视频预处理：把上传的视频转成 H3 能吃的 CFR24 + 末帧补齐 + 对齐音频。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3AutoInput",
            display_name="H3视频预处理",
            category="XiaoHei/Video",
            description=(
                "请直接连核心的「加载视频」节点。在 CPU 上预处理完整的上传文件："
                "时间戳归一到 CFR24、保留源画面比例（只补最多 15 像素的 VAE 对齐边）、"
                "末帧补齐到 H3 时间格、抽出对齐的立体声音轨。"
                " VIDEO 对象的裁剪/trim 编辑不会生效。"
                "max_frames=0 表示「不设上限」，不是「无限内存」。"
                "输出宽高要在下游 latent 放大节点里手填。"
            ),
            inputs=[
                io.Video.Input("video", tooltip="输入视频（自动取帧+抽音频）"),
                io.Int.Input(
                    "max_frames", default=0, min=0, max=2**31 - 1, step=1,
                    tooltip="0 = 不设用户帧数上限。填正数时超出就直接报错，"
                           "绝不悄悄裁短。全片帧仍占内存，长片/高分辨率不是 8GB 显卡的保证。",
                ),
                io.Combo.Input(
                    "working_resolution", options=["source"], default="source", optional=True,
                    tooltip="保持源画面的显示比例，只补每维最多 15 像素的 VAE 对齐边。不套固定横屏画布。",
                ),
                io.Float.Input(
                    "source_scale", default=1.0, min=0.01, max=16.0, step=0.01, optional=True,
                    tooltip="1 = 保持原始显示像素，0.5 = 减半，2 = 加倍（都在对齐补边之前）。"
                           "8GB 显卡建议 0.5。片源大 / 缩放倍数高都可能爆内存显存。",
                ),
            ],
            outputs=[
                io.Image.Output("prepared_images"),
                io.Audio.Output("conditioning_audio"),
                io.Audio.Output("source_audio"),
                io.Int.Output("actual_frame_count"),
                io.Float.Output("fps"),
                io.Float.Output("duration"),
                io.String.Output("report"),
            ],
        )

    @classmethod
    def execute(cls, video, max_frames=0, working_resolution="source", source_scale=1.0):
        path = _uploaded_source(video)
        result = prepare_file(
            str(path), folder_paths.get_input_directory(), max_frames,
            working_resolution=working_resolution, source_scale=source_scale,
            interrupt=comfy.model_management.throw_exception_if_processing_interrupted,
        )
        return io.NodeOutput(*result)

    @classmethod
    def fingerprint_inputs(cls, video, max_frames=0, working_resolution="source", source_scale=1.0):
        validate_working_resolution(working_resolution)
        validate_frame_limit(max_frames)
        validate_source_scale(source_scale)
        if video is None:
            # 缓存指纹对已连线的运行时输入收到 None。
            # 核心缓存里还包含 LoadVideo 的文件名/修改时间签名。
            return (VERSION, max_frames, working_resolution, source_scale)
        path = _uploaded_source(video)
        stat = path.stat()
        return (VERSION, str(path), stat.st_size, stat.st_mtime_ns,
                max_frames, working_resolution, source_scale)
