# SPDX-License-Identifier: MIT
# 派生自 ComfyUI-OpenH3-Regenerate2K (Songssx) 的 nodes.py
# Copyright (c) 2026 Songssx — 照搬其算法逻辑，改成 XiaoHei 命名的 V3 节点壳。
"""Open-H3 Regenerate 2K 的三个独立节点：模型补丁 / 官方 sigma / 锁定音频。

算法实现在同目录的 xh_openh3_patch.py（纯函数，不依赖任何第三方节点包）。
本文件只负责把它们包成 XiaoHei 家族风格的 V3 节点。
"""

import torch
from comfy_api.latest import io

from .xh_openh3_patch import (
    _curve_candidates,
    _main_lora_candidates,
    lock_audio_for_refine,
    make_sigmas,
    patch_model_with_open_h3,
)


class XHOpenH3ModelPatch(io.ComfyNode):
    """XiaoHei-H3模型补丁：挂主 LoRA + 50 条 Sharp 调度曲线。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3ModelPatch",
            display_name="H3模型补丁",
            category="XiaoHei/Video",
            description=(
                "给 H3 模型挂上 Open-H3 Regenerate 的主 LoRA（312 个模块）与 "
                "50 条 Sharp 调度曲线（挂在 adaln_proj.linear 上）。"
                "加载前会校验基模的 AdaLN 曲线表哈希 —— "
                "必须用 minimax_h3_ref2va_pruned_int8_convrot.safetensors。"
                "\n 主 LoRA 必须是官方完整版；Kijai 的 rank-16 refiner 切片（208 模块）会被拒绝。"
                "\n 一般不用单独摆这个节点 —— 「XiaoHei-H3精修」内部已经自动挂了。"
            ),
            inputs=[
                io.Model.Input("model", tooltip="要打补丁的 H3 模型（原样透传）"),
                io.Combo.Input(
                    "main_lora", options=_main_lora_candidates() or ["(missing)"],
                    tooltip="官方完整主 LoRA（312 个模块）。"),
                io.Combo.Input(
                    "curve_branches", options=_curve_candidates() or ["(missing)"],
                    tooltip="Sharp 曲线分支（50 条）。"),
                io.Float.Input(
                    "strength", default=1.0, min=0.0, max=1.5, step=0.01,
                    tooltip="主 LoRA 与 Sharp 曲线的共同强度。"),
            ],
            outputs=[
                io.Model.Output(display_name="model"),
                io.String.Output(display_name="report"),
            ],
        )

    @classmethod
    def execute(cls, model, main_lora, curve_branches, strength) -> io.NodeOutput:
        patched, report = patch_model_with_open_h3(model, main_lora, curve_branches, strength)
        return io.NodeOutput(patched, report)


class XHOpenH3Sigmas(io.ComfyNode):
    """XiaoHei-H3官方步长：官方 Open-H3 的 sigma 序列。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3Sigmas",
            display_name="H3官方步长",
            category="XiaoHei/Video",
            description=(
                "输出官方 Open-H3 的 sigma 序列。\n"
                "3 步：0.909375 → 0.857 → 0.667 → 0\n"
                "2 步：0.7 → 0.494 → 0\n"
                " 工作流里的 res_multistep 2 步**不等价于**官方 Euler 三步参考。"
            ),
            inputs=[
                io.Combo.Input(
                    "steps", options=["3", "2"], default="3",
                    tooltip="官方步数：3（论文参考）或 2（更快的两段式）。"),
            ],
            outputs=[io.Sigmas.Output(display_name="sigmas")],
        )

    @classmethod
    def execute(cls, steps) -> io.NodeOutput:
        return io.NodeOutput(make_sigmas(steps))


class XHOpenH3LockAudio(io.ComfyNode):
    """XiaoHei-H3锁定音频：画面重绘、声音锁死。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3LockAudio",
            display_name="H3锁定音频",
            category="XiaoHei/Video",
            description=(
                "给联合 AV latent 挂 noise_mask：画面全 1（参与重绘）、声音全 0（锁死原音）。"
                "分块扩散要求这份掩码是**全零的音频掩码**，且原样转发给每块。"
            ),
            inputs=[
                io.Latent.Input(
                    "av_latent",
                    tooltip="MiniMax H3 的视频+音频联合 latent（先视频、后音频）。"),
            ],
            outputs=[io.Latent.Output(display_name="locked_av_latent")],
        )

    @classmethod
    def execute(cls, av_latent) -> io.NodeOutput:
        return io.NodeOutput(lock_audio_for_refine(av_latent))
