# SPDX-License-Identifier: GPL-3.0-only
# 派生自 ComfyUI-OpenH3-VideoTools (Tensor Alchemist) 的 prompt_encode_release.py
# Copyright (C) 2026 Tensor Alchemist — 逻辑原样照搬，仅节点壳改名 + 文案中文化。
"""H3 提示词编码：编完立刻卸载 32B 编码器，不在图上留 CLIP。"""

import gc
import logging

import nodes
import comfy.model_management
import comfy.model_prefetch
import folder_paths
from comfy_api.latest import io


class XHOpenH3PromptEncodeRelease(io.ComfyNode):
    """XiaoHei-H3提示词编码：只输出 conditioning，编码器当场释放。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3PromptEncodeRelease",
            display_name="H3提示词编码",
            category="XiaoHei/Video",
            description=(
                "用原生 CLIPLoader（minimax 模式）加载选中的编码器，跑原生 CLIPTextEncode，"
                "然后立刻卸载本地编码器。只输出 conditioning。"
                "好处是图上不留 CLIP 输出占显存；实际主机内存回收取决于运行时与分配器。"
            ),
            inputs=[
                io.Combo.Input(
                    "clip_name",
                    options=folder_paths.get_filename_list("text_encoders"),
                    tooltip="H3 用的是 qwen3vl_32b 系列文本编码器（nvfp4/awq 量化）。",
                ),
                io.String.Input(
                    "text", default="", multiline=True, dynamic_prompts=True,
                    tooltip="这里写的是「要生成什么」。"
                           " 它不会分析你的视频 —— 想让模型保留原内容就得自己描述清楚原片。",
                ),
            ],
            outputs=[io.Conditioning.Output(display_name="conditioning")],
        )

    @classmethod
    def execute(cls, clip_name, text) -> io.NodeOutput:
        clip = None
        encoded = False
        try:
            clip = nodes.CLIPLoader().load_clip(clip_name, "minimax", "default")[0]
            conditioning = nodes.CLIPTextEncode().encode(clip, text)[0]
            encoded = True
            return io.NodeOutput(conditioning)
        finally:
            try:
                if clip is not None:
                    # 原生执行通常在节点返回之后才排空预取队列。
                    # 本节点在返回之前就释放编码器，所以先按目标核心的可写模型清理顺序来：
                    # 在编码器所在设备上下文里同步 → 排空预取 → 托管卸载。
                    # 不关闭映射的权重句柄，也不改动 prompt/节点缓存。
                    with comfy.model_management.cuda_device_context(clip.patcher.load_device):
                        comfy.model_management.synchronize()
                        comfy.model_prefetch.cleanup_prefetch_queues()
                        comfy.model_management.unload_model_and_clones(clip.patcher)
            except Exception as cleanup_error:
                if encoded:
                    raise RuntimeError(
                        "H3 提示词编码已完成，但本地编码器清理失败。"
                    ) from cleanup_error
                # 清理也失败时，保留原始的加载/编码/取消异常。
                # 核心节点的后续收尾流程仍会照常执行。
                logging.exception("本地 H3 编码器清理失败（发生在原生编码错误期间）。")
            finally:
                clip = None
                gc.collect()
