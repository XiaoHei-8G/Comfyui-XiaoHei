"""Named parameter sets for the simple Detect node.

Presets are grouped by how hard the material is to cut, and every duration is in seconds so a
preset means the same thing at 24, 30 or 60 fps.

`film` and `music_video` reproduce the settings the original pipeline was measured with (12 and
5 frames at ~30 fps). The others start from reasoned values and are tuned on sample material.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace


@dataclass(frozen=True)
class Preset:
    label: str
    description: str
    # detection
    overlap: int = 20                    # frames shared by neighbouring 100-frame windows
    confidence: float = 0.0              # drop boundaries whose localisation peak is below this
    # refinement
    transitions: str = "merge_previous"  # merge_previous | merge_next | split | keep
    min_shot_seconds: float = 0.40       # shots shorter than this merge into a neighbour
    snap_radius: int = 2                 # frames either side a cut may move to its sharpest frame
    ultra_short_seconds: float = 0.05    # final clean-up of fragments
    # validation (DINOv3)
    validate: bool = True
    validate_window: int = 5             # frames either side of a cut that are compared
    flash_sensitivity: float = 15.0      # luma jump that counts as a flash; smaller = more flashes

    def to_dict(self) -> dict:
        return asdict(self)


PRESETS: dict[str, Preset] = {
    "film": Preset(
        label="影视 / 电视",
        description="节奏平稳，偶尔有溶解和淡入淡出。短于 0.4 秒的镜头当作检测器噪声处理。",
    ),
    "music_video": Preset(
        label="音乐 MV / 快剪",
        description="跟着节拍剪辑，镜头极短，带频闪和闪白。镜头最短可到约 0.17 秒，更多亮度变化会当作闪光而非切点。",
        min_shot_seconds=0.17,
        flash_sensitivity=12.0,
    ),
    "anime": Preset(
        label="动画 / 动漫",
        description="定格画面、冲击闪光、拖影帧和频繁淡黑。镜头最短保留到 0.25 秒，更激进地识别闪光。",
        min_shot_seconds=0.25,
        flash_sensitivity=10.0,
        validate_window=6,
    ),
    "vlog": Preset(
        label="Vlog / 口播",
        description="同一场景内跳切多、真实场景切换少。短于 0.5 秒的镜头会合并。",
        min_shot_seconds=0.50,
    ),
    "sports": Preset(
        label="体育 / 赛事转播",
        description="快速摇镜、图形擦除转慢镜、台标闪现。转场保留为独立片段，方便找到慢镜回放。",
        transitions="keep",
        min_shot_seconds=0.30,
        flash_sensitivity=18.0,
    ),
}

DEFAULT_PRESET = "film"


def preset_names() -> list[str]:
    return list(PRESETS)


def get_preset(name: str, **overrides) -> Preset:
    if name not in PRESETS:
        raise KeyError(f"unknown preset {name!r}; choose from {', '.join(PRESETS)}")
    p = PRESETS[name]
    return replace(p, **overrides) if overrides else p
