from __future__ import annotations

from comfy_api.latest import io, ui

from ..scenecut import pipeline
from ..scenecut.media import probe
from ..scenecut.presets import DEFAULT_PRESET, PRESETS, get_preset
from ..scenecut.refine import TRANSITION_MODES, merge_ultra_short
from ..scenecut.validate import ValidatorConfig
from .common import (CATEGORY, CATEGORY_ADVANCED, PRESET_LABELS, Detector, Progress, Scenes,
                     detector_choices, device_choices, device_tooltip, get_detector, image_output_input,
                     images_output, scene_images, video_path)
from .validation import get_validator, run_validation

TRANSITION_TOOLTIP = (
    "转场（溶解、擦除、淡入淡出等）怎么处理。merge_previous：转场并入前一个镜头；"
    "merge_next：并入后一个镜头的开头；split：切点落在转场中间；"
    "keep：转场单独保留成一个片段。被合并的转场仍会记录在吸收它的那个镜头里。"
    "")


def _preset_help() -> str:
    return "\n".join(f"{p.label}: {p.description}" for p in PRESETS.values())


def _run_detect(handle, path, overlap, confidence, batch, decoder):
    info = probe(path)
    model = handle.ready()
    progress = Progress(info.frame_count)
    return pipeline.detect(model, path, overlap=overlap, confidence=confidence,
                           batch_windows=batch, backend=decoder, info=info,
                           progress=progress, check_abort=progress.check_abort)


class XH_SceneCutDetect(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutDetect",
            display_name="分镜检测 XiaoHei",
            category=CATEGORY,
            search_aliases=["scene detection", "shot detection", "cut detection", "shot boundary"],
            description="用 OmniShotCut 找出视频里所有切点，按预设清理结果，再用 DINOv3 逐个复核。模型需手动放好：OmniShotCut 164 MB 放 models/scenecut；开启复核时另需 DINOv3 1.2 GB 放 models/clip_vision、SSCD 178 MB 放 models/scenecut。节点不会自动下载。",
            inputs=[
                io.Video.Input("video"),
                io.Combo.Input("preset", options=list(PRESET_LABELS),
                               default=PRESETS[DEFAULT_PRESET].label, tooltip=_preset_help()),
                io.Boolean.Input("validate", default=True,
                                 tooltip="用 DINOv3 复核每个切点，合并误判（闪光、快速运动、一个连续镜头被切成两段）。会更慢；关闭则直接用检测器精修后的切点。"),
                io.Combo.Input("device", options=device_choices(), default="default",
                               tooltip=device_tooltip()),
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
    def execute(cls, video, preset, validate=True, device="default", output_images="关闭") -> io.NodeOutput:
        p = get_preset(PRESET_LABELS.get(preset, DEFAULT_PRESET))
        path = video_path(video)
        sl = _run_detect(get_detector(device=device), path, p.overlap, p.confidence, 8, "auto")
        # The fragment clean-up runs last, after validation, as in the advanced chain.
        sl = pipeline.refine(sl, transitions=p.transitions, min_shot_seconds=p.min_shot_seconds,
                             snap_radius=p.snap_radius,
                             ultra_short_seconds=None if validate else p.ultra_short_seconds)
        if validate:
            handle = get_validator(device=device)
            cfg = ValidatorConfig(window=p.validate_window, flash_sensitivity=p.flash_sensitivity,
                                  use_sscd=handle.sscd_path is not None)
            sl = merge_ultra_short(run_validation(sl, handle, cfg), p.ultra_short_seconds)
        summary = sl.summary()
        return io.NodeOutput(sl, len(sl.shots), summary, scene_images(sl, output_images),
                             ui=ui.PreviewText(summary))


class XH_SceneCutDetectorLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutDetectorLoader",
            display_name="分镜检测器加载 XiaoHei",
            category=CATEGORY_ADVANCED,
            description="从 models/scenecut 加载 OmniShotCut（模型需手动放好，节点不会自动下载）。",
            inputs=[
                io.Combo.Input("model", options=detector_choices()),
                io.Combo.Input("device", options=device_choices(), default="default",
                               tooltip=device_tooltip()),
            ],
            outputs=[Detector.Output(display_name="detector")],
        )

    @classmethod
    def execute(cls, model, device) -> io.NodeOutput:
        return io.NodeOutput(get_detector(model, device))


class XH_SceneCutDetectAdvanced(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutDetectAdvanced",
            display_name="分镜检测高级 XiaoHei",
            category=CATEGORY_ADVANCED,
            description="OmniShotCut 的原始输出：所有候选镜头和转场，一个都不合并。后面接「分镜精修 XiaoHei」。它的输出有缓存，调后面的参数不会重跑检测。",
            inputs=[
                io.Video.Input("video"),
                Detector.Input("detector", optional=True,
                               tooltip="接「分镜检测器加载 XiaoHei」。默认：显卡上的 OmniShotCut。"),
                io.Int.Input("overlap", default=20, min=0, max=90, step=2,
                             tooltip="相邻的 100 帧窗口之间共享的帧数。每个窗口只信中间部分；重叠越多，靠近窗口边缘的切点越准。"),
                io.Float.Input("confidence", default=0.0, min=0.0, max=0.95, step=0.01,
                               tooltip="丢掉定位置信度低于此值的切点（0 = 保留模型给的全部）。被丢掉的镜头会并入下一个镜头。"),
                io.Int.Input("batch_windows", default=8, min=1, max=64, advanced=True,
                             tooltip="每次前向推理处理几个窗口。只影响速度，结果完全一样。"),
                io.Combo.Input("decoder", options=["auto", "ffmpeg", "pyav"], default="auto",
                               advanced=True,
                               tooltip="auto：有 ffmpeg 就用它，否则用 PyAV。两者取到的帧完全一样。"),
                image_output_input(),
            ],
            outputs=[
                Scenes.Output(display_name="scenes"),
                io.String.Output(display_name="summary"),
                images_output(),
            ],
        )

    @classmethod
    def execute(cls, video, overlap, confidence, batch_windows, decoder, output_images="关闭",
                detector=None) -> io.NodeOutput:
        handle = detector or get_detector()
        sl = _run_detect(handle, video_path(video), overlap, confidence, batch_windows, decoder)
        summary = sl.summary()
        return io.NodeOutput(sl, summary, scene_images(sl, output_images), ui=ui.PreviewText(summary))


class XH_SceneCutRefine(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutRefine",
            display_name="分镜精修 XiaoHei",
            category=CATEGORY_ADVANCED,
            description="把原始检测结果清理成干净的镜头：处理转场、合并过短镜头、把切点吸附到精确帧。",
            inputs=[
                Scenes.Input("scenes"),
                io.Combo.Input("transitions", options=list(TRANSITION_MODES), default="merge_previous",
                               tooltip=TRANSITION_TOOLTIP),
                io.Float.Input("min_shot_seconds", default=0.40, min=0.0, max=10.0, step=0.01,
                               tooltip="短于这个时长的镜头会并入更长的相邻镜头。0 = 关闭。"),
                io.Int.Input("snap_radius", default=2, min=0, max=12,
                             tooltip="把每个切点最多移动这么多帧，移到画面像素变化最大的那一帧。0 = 关闭。"),
                io.Float.Input("ultra_short_seconds", default=0.05, min=0.0, max=1.0, step=0.01,
                               tooltip="最后清理：这么短的碎片无论什么类型都并入相邻镜头。0 = 关闭。"),
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
    def execute(cls, scenes, transitions, min_shot_seconds, snap_radius, ultra_short_seconds,
                output_images="关闭") -> io.NodeOutput:
        sl = pipeline.refine(scenes, transitions=transitions, min_shot_seconds=min_shot_seconds,
                             snap_radius=snap_radius, ultra_short_seconds=ultra_short_seconds or None)
        summary = sl.summary()
        return io.NodeOutput(sl, len(sl.shots), summary, scene_images(sl, output_images),
                             ui=ui.PreviewText(summary))
