# SPDX-License-Identifier: GPL-3.0-only
# 派生自 ComfyUI-OpenH3-VideoTools (Tensor Alchemist) 的 refine_release.py
# Copyright (C) 2026 Tensor Alchemist — 逻辑原样照搬，三处改动见下方注释。
"""H3 精修总控：一条模型链跑完立刻卸载，8GB 显卡的关键。

相对原版的改动：
  1. 主 LoRA / Sharp 曲线改为调用本包自持的 xh_openh3_patch，不再依赖外部节点包。
  2. KJ 的 MiniMaxLowVRAMAttention / MiniMaxChunkFeedForward 找不到时**降级跳过**
     （原版是直接 RuntimeError 拒绝启动）。跳过后仍能跑，只是峰值显存更高。
  3. 默认参数按 8GB 显卡降配（head_chunks=6 / ff_chunks=4 / 分块 512）。
"""

import gc
import logging
import sys

import nodes
import comfy.model_management
import comfy.model_prefetch
import folder_paths
from comfy_api.latest import io

from .xh_openh3_patch import (
    MAIN_LORA_FILE,
    SHARP_CURVE_FILE,
    _curve_candidates,
    _main_lora_candidates,
    patch_model_with_open_h3,
)
from .xh_openh3_tiled import XHOpenH3TiledDiffusion

# 核心节点（ComfyUI 自带）与 KJNodes 节点分开：前者缺了不能跑，后者缺了只是降级。
_CORE_NAMES = ("ModelAttentionBackend", "BasicGuider", "SamplerCustomAdvanced")
_KJ_NAMES = ("MiniMaxLowVRAMAttention", "MiniMaxChunkFeedForward")


def _file_choices(folder, preferred):
    try:
        options = [name for name in folder_paths.get_filename_list(folder)
                   if name.lower().endswith(".safetensors")]
    except KeyError:
        options = []
    options.sort(key=lambda name: (name.replace("\\", "/").rsplit("/", 1)[-1] != preferred,
                                   name.lower()))
    return options or ["(missing)"]


def _native_classes(enable_tiling):
    """取核心节点；KJ 的两个低显存补丁允许缺失（降级跳过，不阻断）。

    分块扩散用的是**本包自己的** XHOpenH3TiledDiffusion（上面已 import），
    不能去全局 NODE_CLASS_MAPPINGS 里查 —— V3 节点的注册时机取决于包加载顺序，
    查不到就会误报「缺少核心节点」直接拒绝启动。核心节点（ModelAttentionBackend /
    BasicGuider / SamplerCustomAdvanced）才走注册表。
    """
    names = list(_CORE_NAMES)
    missing = [name for name in names if name not in nodes.NODE_CLASS_MAPPINGS]
    if missing:
        raise RuntimeError(
            "缺少必需的 ComfyUI 核心节点：" + ", ".join(missing)
            + "。请更新 ComfyUI 后重启。"
        )
    resolved = {name: nodes.NODE_CLASS_MAPPINGS[name] for name in names}
    if enable_tiling:
        resolved["XHOpenH3TiledDiffusion"] = XHOpenH3TiledDiffusion
    missing_kj = [name for name in _KJ_NAMES if name not in nodes.NODE_CLASS_MAPPINGS]
    if missing_kj:
        logging.warning(
            "[XiaoHei-H3精修] 未找到 KJNodes 的 %s —— 已跳过这两层低显存补丁，"
            "仍可运行但峰值显存更高（8GB 显卡建议装 KJNodes）。",
            ", ".join(missing_kj),
        )
    for name in _KJ_NAMES:
        if name in nodes.NODE_CLASS_MAPPINGS:
            resolved[name] = nodes.NODE_CLASS_MAPPINGS[name]
    return resolved


def _run_native_refinement(native, owned, av_latent, conditioning, noise, sampler, sigmas,
                           unet_name, main_lora, curve_branches, strength, head_chunks,
                           ff_chunks, seq_threshold, enable_tiling, method,
                           tile_width, tile_height, tile_overlap):
    # 持有的每个 patcher 都活到「同步托管卸载」那一刻，之后让本帧消失，
    # 再由外层 GC 回收。MODEL 和 GUIDER 都不进节点输出。
    model = guider = sample_result = None
    try:
        model = nodes.UNETLoader().load_unet(unet_name, "default")[0]
        owned.append(model)
        model, report = patch_model_with_open_h3(model, main_lora, curve_branches, strength)
        owned.append(model)
        model = native["ModelAttentionBackend"].execute(
            model, "comfy kitchen attention").result[0]
        owned.append(model)
        if "MiniMaxLowVRAMAttention" in native:
            model = native["MiniMaxLowVRAMAttention"].execute(model, head_chunks).result[0]
            owned.append(model)
        if "MiniMaxChunkFeedForward" in native:
            model = native["MiniMaxChunkFeedForward"].execute(
                model, ff_chunks, seq_threshold).result[0]
            owned.append(model)
        if enable_tiling:
            model = native["XHOpenH3TiledDiffusion"].execute(
                model, method, tile_width, tile_height, tile_overlap).result[0]
            owned.append(model)
        guider = native["BasicGuider"].execute(model, conditioning).result[0]
        sample_result = native["SamplerCustomAdvanced"].execute(
            noise, guider, sampler, sigmas, av_latent).result
        return sample_result[1], report
    finally:
        model = guider = sample_result = None


class XHOpenH3RefineRelease(io.ComfyNode):
    """XiaoHei-H3精修：Open-H3 2K 重生成，跑完立刻把整条模型链踢出显存。"""

    @classmethod
    def define_schema(cls):
        main_loras = _main_lora_candidates()
        curve_options = _curve_candidates()
        return io.Schema(
            node_id="XHOpenH3RefineRelease",
            display_name="H3精修",
            category="XiaoHei/Video",
            description=(
                "把原生 H3 加载器、Open-H3 补丁、Kitchen/KJ 低显存补丁、可选分块扩散、"
                "BasicGuider、SamplerCustomAdvanced 全塞进同一个模型生命周期里跑。"
                "只返回去噪后的 AV latent 和补丁报告，然后释放所有本地持有的模型 patcher。"
                "噪声、采样器、sigma 仍由外部传入。"
                "\n 需要模型：minimax_h3_ref2va_pruned_int8_convrot.safetensors"
                "（不要用 Singularity 主模型）+ open_h3_regenerate_2k_lora.safetensors"
                "（312 模块的官方完整版）+ sharp_curve_branches.safetensors（50 条）。"
            ),
            inputs=[
                io.Latent.Input("av_latent", tooltip="待精修的 AV latent"),
                io.Conditioning.Input("conditioning", tooltip="条件（提示词编码结果）"),
                io.Noise.Input("noise", tooltip="注入的噪声"),
                io.Sampler.Input("sampler", tooltip="采样器（原样透传）"),
                io.Sigmas.Input("sigmas", tooltip="sigma 时间表"),
                io.Combo.Input(
                    "unet_name",
                    options=_file_choices(
                        "diffusion_models", "minimax_h3_ref2va_pruned_int8_convrot.safetensors"),
                    tooltip="用 minimax_h3_ref2va_pruned_int8_convrot.safetensors —— "
                           "它的 AdaLN 曲线表哈希与 Open-H3 补丁硬校验一致。",
                ),
                io.Combo.Input(
                    "main_lora", options=main_loras or ["(missing)"],
                    tooltip="官方完整主 LoRA（312 个模块）。"
                           " Kijai 的 rank-16 refiner 切片（208 个）用不了。",
                ),
                io.Combo.Input(
                    "curve_branches", options=curve_options or ["(missing)"],
                    tooltip="Sharp 曲线分支（50 条，挂在 adaln_proj.linear 上）。",
                ),
                io.Float.Input(
                    "strength", default=1.0, min=0.0, max=1.5, step=0.01,
                    tooltip="主 LoRA 与 Sharp 曲线的共同强度。1 = 原样。"),
                io.Int.Input(
                    "head_chunks", default=6, min=1, max=56, step=1,
                    tooltip="注意力分几组算。组越多峰值显存越低、结果不变（头之间互不依赖）。"
                           "8GB 显卡实测甜点区 6。"),
                io.Int.Input(
                    "ff_chunks", default=4, min=1, max=64, step=1,
                    tooltip="前馈网络按 token 分几段。段越多峰值显存越低、略增耗时。8GB 甜点区 4。"),
                io.Int.Input(
                    "seq_threshold", default=4096, min=256, max=262144, step=256,
                    tooltip="打包 token 数超过这个值才分块（短序列不分）。"),
                io.Boolean.Input(
                    "enable_tiling", default=True,
                    tooltip="开 = 空间分块扩散，2K 大图不爆显存；关 = 整帧跑，块少但更慢。"),
                io.Combo.Input(
                    "method", options=["gaussian", "uniform"], default="gaussian",
                    tooltip="重叠区混合权重：gaussian（Mixture of Diffusers，默认，块中心权重大）"
                           "或 uniform（MultiDiffusion，简单平均）。"),
                io.Int.Input(
                    "tile_width", default=512, min=64, max=8192, step=32,
                    tooltip="分块宽度（像素），会对齐到 32 的倍数。8GB 建议 512。"),
                io.Int.Input(
                    "tile_height", default=512, min=64, max=8192, step=32,
                    tooltip="分块高度（像素），会对齐到 32 的倍数。8GB 建议 512。"),
                io.Int.Input(
                    "tile_overlap", default=128, min=0, max=8192, step=32,
                    tooltip="相邻块重叠（像素），对齐 32 的倍数。"
                           " 至少要 ≥ 块尺寸的 25%，否则块之间会「脱节」各自画出不同内容。"),
            ],
            outputs=[
                io.Latent.Output(display_name="denoised_av_latent"),
                io.String.Output(display_name="adapter_report"),
            ],
        )

    @classmethod
    def execute(cls, av_latent, conditioning, noise, sampler, sigmas, unet_name,
                main_lora, curve_branches, strength, head_chunks, ff_chunks,
                seq_threshold, enable_tiling, method, tile_width, tile_height,
                tile_overlap) -> io.NodeOutput:
        native = _native_classes(enable_tiling)
        owned = []
        target = None
        completed = False
        try:
            denoised, report = _run_native_refinement(
                native, owned, av_latent, conditioning, noise, sampler, sigmas,
                unet_name, main_lora, curve_branches, strength, head_chunks, ff_chunks,
                seq_threshold, enable_tiling, method, tile_width, tile_height, tile_overlap)
            completed = True
            return io.NodeOutput(denoised, report)
        finally:
            try:
                if owned:
                    target = owned[-1]
                    # 内层调用已经把 model/guider/result 的别名清空了。
                    # 让持有的链条一直活到所有设备端工作排干为止。
                    with comfy.model_management.cuda_device_context(target.load_device):
                        comfy.model_management.synchronize()
                        comfy.model_prefetch.cleanup_prefetch_queues()
                        comfy.model_management.unload_model_and_clones(target)
            except Exception as cleanup_error:
                if completed:
                    raise RuntimeError(
                        "H3 精修已完成，但本地模型清理失败。"
                    ) from cleanup_error
                logging.exception("处理原生精修错误时，本地 H3 模型清理失败。")
            finally:
                target = None
                owned.clear()
                pending_error = sys.exc_info()[0] is not None
                try:
                    gc.collect()
                except Exception:
                    if not pending_error:
                        raise
                    logging.exception("保留先前错误时，H3 模型垃圾回收失败。")
