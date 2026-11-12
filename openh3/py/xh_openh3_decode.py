# SPDX-License-Identifier: GPL-3.0-only
# 派生自 ComfyUI-OpenH3-VideoTools (Tensor Alchemist) 的 vae_decode_low_memory.py
# Copyright (C) 2026 Tensor Alchemist — 逻辑原样照搬，仅节点壳改名 + 文案中文化。
"""H3 低内存解码：只在返回的图像缓冲上降到 fp16，中间精度一概不动。"""

import copy
import gc
import logging
import types

import torch
import nodes
import comfy.model_management
import comfy.model_prefetch
from comfy.ldm.minimax.vae import MiniMaxH3VideoVAE
from comfy_api.latest import io


def _fp16_output_dtype(self):
    return torch.float16


def _validate_native_vae(vae):
    model = getattr(vae, "first_stage_model", None)
    if type(model) is not MiniMaxH3VideoVAE or model.noncausal:
        raise ValueError("本解码器需要原生的因果式 MiniMax H3 视频 VAE。")
    if not model.comfy_has_chunked_io:
        raise ValueError("本解码器需要原生 H3 的直出缓冲支持。")
    if getattr(getattr(vae, "output_device", None), "type", None) != "cpu":
        raise ValueError("本解码器需要原生的 CPU 中间输出设备。")
    if not callable(getattr(vae, "vae_output_dtype", None)):
        raise ValueError("本解码器需要原生的逐 VAE 输出 dtype 方法。")


class XHOpenH3VAEDecodeLowMemory(io.ComfyNode):
    """XiaoHei-H3低内存解码：返回缓冲降到 fp16，中间计算精度不变。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3VAEDecodeLowMemory",
            display_name="H3低内存解码",
            category="XiaoHei/Video",
            description=(
                "用本地 fp16 CPU 输出缓冲跑原生因果 H3 解码。"
                "保留原生的解码分块、批次、时间逻辑与计算方式，"
                "只把「返回的图像存储」改成 float16 —— 全局中间精度和采样精度都不改。"
                "\n 必须用原生视频 VAE（minimax_h3_video_vae_int8_convrot.safetensors），"
                "Kijai 的轻量 VAE / Lynnreal VAE 过不了这个校验。"
            ),
            inputs=[
                io.Vae.Input(
                    "vae",
                    tooltip="原生 MiniMax H3 视频 VAE（因果式，支持直出缓冲）。"),
                io.Latent.Input("samples", tooltip="H3 的 AV latent（画面+音频合一潜变量）"),
            ],
            outputs=[io.Image.Output(display_name="images")],
        )

    @classmethod
    def execute(cls, vae, samples) -> io.NodeOutput:
        _validate_native_vae(vae)
        local_vae = None
        decoded = False
        cleanup_failed = False
        try:
            local_vae = copy.copy(vae)
            local_vae.vae_output_dtype = types.MethodType(_fp16_output_dtype, local_vae)
            images = nodes.VAEDecode().decode(local_vae, samples)[0]
            decoded = True
            return io.NodeOutput(images)
        finally:
            try:
                if local_vae is not None:
                    with comfy.model_management.cuda_device_context(local_vae.patcher.load_device):
                        comfy.model_management.synchronize()
                        comfy.model_prefetch.cleanup_prefetch_queues()
                        comfy.model_management.unload_model_and_clones(local_vae.patcher)
            except Exception as cleanup_error:
                cleanup_failed = True
                if decoded:
                    raise RuntimeError("H3 解码已完成，但解码器清理失败。") from cleanup_error
                logging.exception("处理原生解码错误时，H3 解码器清理失败。")
            finally:
                # 这个 MethodType 指回临时包装器，显式移除它 ——
                # 原 VAE 及其输出 dtype 方法从未被改动。模型 patcher/权重由核心托管。
                if local_vae is not None:
                    del local_vae.vae_output_dtype
                local_vae = None
                try:
                    gc.collect()
                except Exception as gc_error:
                    if decoded and not cleanup_failed:
                        raise RuntimeError("H3 解码已完成，但解码器 GC 失败。") from gc_error
                    logging.exception("处理先前的原生/清理错误时，解码器 GC 失败。")
