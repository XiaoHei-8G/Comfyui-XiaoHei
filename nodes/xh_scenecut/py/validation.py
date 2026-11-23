"""DINOv3 (+ SSCD) cut validation in ComfyUI: loading, the advanced nodes, shared helpers."""
from __future__ import annotations

import json
import logging
import os

import torch

import comfy.image_encoders.dino3 as dino3
import comfy.model_management as mm
import comfy.model_patcher
import comfy.ops
import comfy.utils
import folder_paths
from comfy_api.latest import io, ui

from ..scenecut import validate as V
from ..scenecut import weights
from ..scenecut.refine import merge_ultra_short
from .common import (CATEGORY_ADVANCED, MODEL_FOLDER, Progress, Scenes, device_choices, device_tooltip,
                     image_output_input, images_output, scene_images)

log = logging.getLogger("SceneCut")

Validator = io.Custom("XH_SCENECUT_VALIDATOR")

PRECISIONS = {"fp32": torch.float32, "bf16": torch.bfloat16}
SSCD_OFF = "none"


def _dino_config() -> dict:
    path = os.path.join(os.path.dirname(dino3.__file__), "dino3_large.json")
    with open(path) as f:
        return json.load(f)


def dino_choices() -> list[str]:
    files = [f for f in folder_paths.get_filename_list("clip_vision")
             if "dinov3" in f.lower().replace("_", "").replace("-", "")]
    if weights.DINOV3.filename not in files:
        files.insert(0, weights.DINOV3.filename)
    return files


def sscd_choices() -> list[str]:
    files = [f for f in folder_paths.get_filename_list(MODEL_FOLDER) if "sscd" in f.lower()]
    if weights.SSCD.filename not in files:
        files.insert(0, weights.SSCD.filename)
    return [SSCD_OFF] + files


def _resolve(folder: str, name: str, model: weights.ModelFile) -> str:
    path = folder_paths.get_full_path(folder, name)
    if path is not None:
        return path
    if name != model.filename:
        raise FileNotFoundError(f"找不到模型 {name}，请放到 models/{folder} 目录后刷新。")
    return weights.ensure(model, folder_paths.get_folder_paths(folder)[0])


class ValidatorHandle:
    """DINOv3 ViT-L/16 behind a ComfyUI ModelPatcher, plus an optional SSCD TorchScript model.

    DINOv3 runs in fp32 (or bf16 on request): its activations overflow fp16, which is what ComfyUI
    would otherwise pick for an image encoder on many GPUs, and the result is NaN."""

    def __init__(self, dino_name: str, sscd_name: str = SSCD_OFF, precision: str = "fp32",
                 device: str = "default"):
        self.load_device = mm.get_torch_device() if device == "default" else torch.device(device)
        self.dtype = PRECISIONS[precision]
        if self.load_device.type == "cpu" and self.dtype == torch.bfloat16:
            self.dtype = torch.float32
        path = _resolve("clip_vision", dino_name, weights.DINOV3)
        sd = comfy.utils.load_torch_file(path, safe_load=True)
        if "layer.23.attention.o_proj.bias" not in sd or "layer.24.norm1.weight" in sd \
                or "layer.0.mlp.gate_proj.weight" in sd:
            raise ValueError(f"{os.path.basename(path)} 不是 DINOv3 ViT-L/16 模型，"
                             "分镜复核的阈值是按这个模型校准的，请换成正确的模型文件。")
        offload = mm.unet_offload_device()
        model = dino3.DINOv3ViTModel(_dino_config(), self.dtype, offload, comfy.ops.manual_cast)
        missing, _ = model.load_state_dict(sd, strict=False)
        missing = [k for k in missing if "mask_token" not in k]
        if missing:
            raise ValueError(f"DINOv3 模型权重不完整，缺少：{missing[:4]}，请重新下载完整文件。")
        self.model = model.eval().requires_grad_(False)
        self.patcher = comfy.model_patcher.CoreModelPatcher(self.model, load_device=self.load_device,
                                                            offload_device=offload)
        self.name = f"{os.path.basename(path)}:{precision}"
        self.sscd_path = None if sscd_name == SSCD_OFF else _resolve(MODEL_FOLDER, sscd_name, weights.SSCD)
        self._sscd = None

    def dino(self) -> V.DinoEmbedder:
        # batch of 48 frames at 224px through ViT-L: activations and attention maps
        mm.load_models_gpu([self.patcher], memory_required=2 * 1024 ** 3)
        model = self.patcher.model
        return V.DinoEmbedder(lambda x: model(x)[0], model.num_prefix_tokens, self.load_device,
                              self.dtype, name=self.name)

    def sscd(self):
        if self.sscd_path is None:
            return None
        if self._sscd is None:
            self._sscd = V.load_sscd(self.sscd_path, self.load_device)
            self._sscd.name = os.path.basename(self.sscd_path)
        return self._sscd


_HANDLES: dict[tuple, ValidatorHandle] = {}
_FEATURE_CACHE: dict = {}       # validate.run() cache: threshold changes reuse extracted features
_FEATURE_CACHE_VIDEOS = 4


def get_validator(dino_name: str = weights.DINOV3.filename, sscd_name: str = weights.SSCD.filename,
                  precision: str = "fp32", device: str = "default") -> ValidatorHandle:
    key = (dino_name, sscd_name, precision, device)
    if key not in _HANDLES:
        _HANDLES[key] = ValidatorHandle(dino_name, sscd_name, precision, device)
    return _HANDLES[key]


def run_validation(scenes, handle: ValidatorHandle, cfg: V.ValidatorConfig):
    while len(_FEATURE_CACHE) > _FEATURE_CACHE_VIDEOS:
        _FEATURE_CACHE.pop(next(iter(_FEATURE_CACHE)))
    progress = Progress(scenes.frame_count)
    sscd = handle.sscd() if cfg.use_sscd else None
    return V.run(scenes, handle.dino(), cfg, sscd, cache=_FEATURE_CACHE,
                 progress=lambda done, total: progress(done, total), check_abort=progress.check_abort)


class XH_SceneCutValidatorLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutValidatorLoader",
            display_name="分镜校验器加载 XiaoHei",
            category=CATEGORY_ADVANCED,
            description="用 DINOv3 ViT-L/16（放到 models/clip_vision）复核切点，可选配 SSCD（放到 models/scenecut）。模型需手动下载放置，节点不会自动下载。",
            inputs=[
                io.Combo.Input("dinov3", options=dino_choices()),
                io.Combo.Input("sscd", options=sscd_choices(), default=weights.SSCD.filename,
                               tooltip="复制检测描述子，用来判定难分的切点和闪光。选 'none' 就只用 DINOv3 复核。"),
                io.Combo.Input("precision", options=list(PRECISIONS), default="fp32",
                               tooltip="fp32 与标定一致。bf16 更快，分数只有极小差异。（不提供 fp16：DINOv3 在里面会溢出。）"),
                io.Combo.Input("device", options=device_choices(), default="default",
                               tooltip=device_tooltip()),
            ],
            outputs=[Validator.Output(display_name="validator")],
        )

    @classmethod
    def execute(cls, dinov3, sscd, precision, device) -> io.NodeOutput:
        return io.NodeOutput(get_validator(dinov3, sscd, precision, device))


class XH_SceneCutValidate(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutValidate",
            display_name="分镜校验高级 XiaoHei",
            category=CATEGORY_ADVANCED,
            search_aliases=["dino validation", "false cut filter", "flash filter"],
            description="用 DINOv3 复核每个切点并合并误判（闪光、快速运动、一个连续镜头被切成两段）。改阈值和护栏参数会立刻重算；改窗口和闪光灵敏度会重新读视频。",
            inputs=[
                Scenes.Input("scenes"),
                Validator.Input("validator", optional=True,
                                tooltip="接「分镜校验器加载 XiaoHei」。默认：DINOv3 fp32 + SSCD。"),
                io.Int.Input("window", default=5, min=2, max=12,
                             tooltip="切点两侧各取几帧做比对（另外还会取 3 倍宽的大窗口）。"),
                io.Float.Input("flash_sensitivity", default=15.0, min=5.0, max=80.0, step=0.5,
                               tooltip="亮度跳变多少（0-255）算作闪光。数值越小，越多光线变化会被当成闪光而不是切点。"),
                io.Boolean.Input("adaptive_threshold", default=True,
                                 tooltip="从这个视频自己的分数里自动挑同镜头阈值。关闭则使用 `threshold`。"),
                io.Float.Input("threshold", default=0.80, min=0.5, max=0.99, step=0.01,
                               tooltip="同镜头相似度高于这个值就合并切点（adaptive_threshold 关闭时生效）。数值越大保留的切点越多。"),
                io.Float.Input("dense_weight", default=0.45, min=0.0, max=1.0, step=0.05, advanced=True,
                               tooltip="空间（图块）相似度相对全局相似度的权重。"),
                io.Float.Input("short_guard_seconds", default=0.30, min=0.0, max=2.0, step=0.05,
                               advanced=True,
                               tooltip="紧挨着这么短镜头的切点，只有拿到闪光证据才会合并。"),
                io.Boolean.Input("flash_cleanup", default=True, advanced=True,
                                 tooltip="合并闪光边界之间只有几帧的碎片。"),
                io.Float.Input("ultra_short_seconds", default=0.05, min=0.0, max=1.0, step=0.01,
                               advanced=True, tooltip="最后清理碎片。0 = 关闭。"),
                image_output_input(),
            ],
            outputs=[
                Scenes.Output(display_name="scenes"),
                io.Int.Output(display_name="shot_count"),
                io.String.Output(display_name="summary"),
                images_output(),
            ],
        )

    @classmethod
    def execute(cls, scenes, window, flash_sensitivity, adaptive_threshold, threshold, dense_weight=0.45,
                short_guard_seconds=0.30, flash_cleanup=True, ultra_short_seconds=0.05,
                output_images="关闭", validator=None) -> io.NodeOutput:
        handle = validator or get_validator()
        cfg = V.ValidatorConfig(window=window, flash_sensitivity=flash_sensitivity,
                                use_sscd=handle.sscd_path is not None,
                                threshold=None if adaptive_threshold else threshold,
                                dense_weight=dense_weight, short_guard_seconds=short_guard_seconds,
                                tiny_flash_pass=flash_cleanup)
        sl = run_validation(scenes, handle, cfg)
        if ultra_short_seconds:
            sl = merge_ultra_short(sl, ultra_short_seconds)
        summary = sl.summary()
        return io.NodeOutput(sl, len(sl.shots), summary, scene_images(sl, output_images),
                             ui=ui.PreviewText(summary))
