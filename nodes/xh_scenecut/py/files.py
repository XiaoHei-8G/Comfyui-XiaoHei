from __future__ import annotations

import json
import os

import folder_paths
from comfy_api.latest import io, ui

from ..scenecut.export import (CODECS, DEFAULT_CODEC, DEFAULT_QUALITY, JSON_ONLY, QUALITY, codec_works,
                               write_export)
from ..scenecut.scenes import SceneList
from .common import CATEGORY, Progress, Scenes, expand_prefix, image_output_input, images_output, scene_images

CLIP_CHOICES = {"仅分镜列表（不切视频）": JSON_ONLY, **{c.label: c.id for c in CODECS.values()}}
CLIP_DEFAULT = CODECS[DEFAULT_CODEC].label


def _resolve_json(path: str) -> str:
    """A scene list file from a path: absolute, or under output/ then input/; a folder written by
    Save Scenes or the viewer's Export resolves to the scenes.json inside it."""
    path = os.path.expanduser(path.strip().strip('"'))
    cands = [path] if os.path.isabs(path) else [os.path.join(base, path) for base in
                                                (folder_paths.get_output_directory(), folder_paths.get_input_directory())]
    for full in cands:
        if os.path.isdir(full) and os.path.isfile(os.path.join(full, "scenes.json")):
            return os.path.join(full, "scenes.json")
        if os.path.isfile(full):
            return full
    return cands[0]


def new_export_folder(sl, prefix: str = "分镜切片/{视频名}/片段") -> tuple[str, str]:
    """在 output 目录下建一个带编号的新文件夹（片段_00001、片段_00002……）：
    返回（完整路径，相对 output 的路径）。"""
    for _ in range(100):
        out_dir, name, counter, subfolder, _ = folder_paths.get_save_image_path(
            expand_prefix(prefix, sl), folder_paths.get_output_directory())
        folder = os.path.join(out_dir, f"{name}_{counter:05}")
        try:
            os.makedirs(folder)
        except FileExistsError:                       # another export took this number first
            continue
        return folder, os.path.join(subfolder, f"{name}_{counter:05}")
    raise RuntimeError("无法创建导出文件夹（编号 00001～00100 都已占用，或没有写入权限）")


class XH_SceneCutSaveScenes(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutSaveScenes",
            display_name="分镜导出保存 XiaoHei",
            category=CATEGORY,
            is_output_node=True,
            search_aliases=["export clips", "split video", "save shots", "cut video into scenes"],
            description="把视频按镜头切成一个个文件（逐帧精确、带声音），并在旁边写入分镜列表：output/分镜切片/<视频名>/片段_00001/。如果审阅器里选了片段，就只导选中的。审阅器上的「导出」按钮不用这个节点也能做同样的事。",
            inputs=[
                Scenes.Input("scenes"),
                io.String.Input("filename_prefix", default="分镜切片/{视频名}/片段",
                                tooltip="在 output 目录下建文件夹。{视频名} 会自动换成视频文件名（不带扩展名）；也可以写 {video}。末尾自动加编号，如 片段_00001。"),
                io.Combo.Input("clips", options=list(CLIP_CHOICES), default=CLIP_DEFAULT,
                               tooltip="切片文件的编码。H.264 到处都能播；NVIDIA 系列走显卡编码；ProRes 和 FFV1 用于剪辑（文件很大）。选 'none' 只写 scenes.json。"),
                io.Combo.Input("quality", options=list(QUALITY), default=DEFAULT_QUALITY,
                               tooltip="high：视觉无损。medium：更小。small：预览用。（ProRes 和 FFV1 忽略此项。）"),
                io.Boolean.Input("audio", default=True, tooltip="每个切片都带上声音。"),
                io.Boolean.Input("include_signals", default=True, advanced=True,
                                 tooltip="把逐帧差值和亮度曲线也存进 scenes.json（每帧约 11 字节），这样重新加载后不用再解码也能吸附切点和打开审阅器。"),
            ],
            outputs=[
                io.String.Output(display_name="path", tooltip="scenes.json"),
                io.String.Output(display_name="folder", tooltip="装切片的文件夹"),
            ],
        )

    @classmethod
    def execute(cls, scenes, filename_prefix, clips=CLIP_DEFAULT, quality=DEFAULT_QUALITY, audio=True,
                include_signals=True) -> io.NodeOutput:
        codec = CLIP_CHOICES.get(clips, clips if clips in CODECS or clips == JSON_ONLY else DEFAULT_CODEC)
        if codec != JSON_ONLY and not codec_works(codec):
            raise RuntimeError(f"本机无法使用 {CODECS[codec].label}"
                               + (" (it needs an NVIDIA GPU)." if CODECS[codec].gpu else ".")
                               + " Choose H.264.")
        sl = scenes
        indices = sl.selected_indices()
        folder, rel = new_export_folder(sl, filename_prefix)
        frames = sum(sl.segments[i].length for i in indices) if codec != JSON_ONLY else 0
        progress = Progress(max(1, frames))
        result = write_export(sl, indices, folder, codec, quality, audio, include_signals,
                              progress=lambda done, total, n: progress(done, total),
                              check_abort=progress.check_abort)
        n = len(result["clips"])
        text = f"已保存 {rel}/：scenes.json" + (f"，共 {n} 个切片" if n else "")
        return io.NodeOutput(result["json"], folder, ui=ui.PreviewText(text))


class XH_SceneCutLoadScenes(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XH_SceneCutLoadScenes",
            display_name="分镜列表加载 XiaoHei",
            category=CATEGORY,
            description="加载由「分镜导出保存 XiaoHei」或审阅器导出保存的分镜列表：填文件夹或里面的 scenes.json。相对路径先在 output 目录找，再去 input 目录找。",
            inputs=[
                io.String.Input("path", default="分镜切片/video/片段_00001",
                                tooltip="填「分镜导出保存 XiaoHei」输出的文件夹或里面的 scenes.json。相对路径先在 output 目录找，再到 input 目录找；也可以填绝对路径。"),
                io.String.Input("video_path", default="", optional=True,
                                tooltip="用这个视频代替文件里记录的那个（视频被移动过、换了电脑）。必须是同一个视频。"),
                image_output_input(),
            ],
            outputs=[
                Scenes.Output(display_name="scenes"),
                io.Int.Output(display_name="shot_count"),
                images_output(),
            ],
        )

    @classmethod
    def execute(cls, path, video_path="", output_images="关闭") -> io.NodeOutput:
        with open(_resolve_json(path), encoding="utf-8") as f:
            sl = SceneList.from_dict(json.load(f))
        if video_path.strip():
            from dataclasses import replace

            sl.source = replace(sl.source, path=os.path.abspath(os.path.expanduser(video_path.strip())))
        return io.NodeOutput(sl, len(sl.shots), scene_images(sl, output_images))

    @classmethod
    def fingerprint_inputs(cls, path, video_path="", output_images="关闭"):
        full = _resolve_json(path)
        return (os.path.getmtime(full) if os.path.isfile(full) else float("nan"), video_path, output_images)

    @classmethod
    def validate_inputs(cls, path, video_path="", output_images="关闭"):
        if not os.path.isfile(_resolve_json(path)):
            return f"找不到分镜列表：{path}（相对路径会先在 output 目录找，再到 input 目录找）"
        return True
