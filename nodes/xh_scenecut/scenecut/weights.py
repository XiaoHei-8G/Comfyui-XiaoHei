"""分镜节点的模型文件清单与存放位置。

家族节点不会自动下载任何模型：缺少文件时只给出中文提示，由使用者手动放到对应目录。
下方 repos / url / page 仅记录来源，用于提示下载地址，不参与任何网络请求。
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ModelFile:
    filename: str
    folder: str               # ComfyUI 模型目录名
    size: int
    sha256: Optional[str]     # 仅供人工核对文件是否完整
    license: str
    purpose: str
    repos: tuple = ()         # 来源记录（仓库名, 文件名）
    url: Optional[str] = None # 来源记录，备用下载地址
    extra: tuple = ()         # 来源记录：需一并放置的附带文件
    page: str = ""


OMNISHOTCUT = ModelFile(
    filename="OmniShotCut_ckpt.pth",
    folder="scenecut",
    size=164_149_963,
    sha256="5948ea78e00626c0e6c5e742e64873ef872cf4a5071d2a0841aed51c3e686cfa",
    license="MIT",
    purpose="镜头切点检测",
    repos=(("uva-cv-lab/OmniShotCut", "OmniShotCut_ckpt.pth"),),
    page="https://huggingface.co/uva-cv-lab/OmniShotCut",
)

# Meta 官方仓库需要同意许可并登录；镜像里是字节完全一致的同一份文件。
DINOV3 = ModelFile(
    filename="dinov3_vitl16_pretrain_lvd1689m.safetensors",
    folder="clip_vision",
    size=1_212_559_808,
    sha256="dcb2e45127cccbf1601e5f42fef165eea275c8e5213197e8dcf3f48822718179",
    license="DINOv3 License (Meta)",
    purpose="切点复核（DINOv3 ViT-L/16）",
    repos=(("facebook/dinov3-vitl16-pretrain-lvd1689m", "model.safetensors"),
           ("camenduru/dinov3-vitl16-pretrain-lvd1689m", "model.safetensors")),
    extra=(("camenduru/dinov3-vitl16-pretrain-lvd1689m", "LICENSE.md",
            "dinov3_vitl16_pretrain_lvd1689m.LICENSE.md"),),
    page="https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m",
)

SSCD = ModelFile(
    filename="sscd_disc_large.torchscript.pt",
    folder="scenecut",
    size=178_141_104,
    sha256="16a196359f91e5fc4e774d5679244c8a661c182309ad4ede0c7e83f6a9861fa0",
    license="MIT",
    purpose="切点复核辅助判定（SSCD 重复检测）",
    url="https://dl.fbaipublicfiles.com/sscd-copy-detection/sscd_disc_large.torchscript.pt",
    page="https://github.com/facebookresearch/sscd-copy-detection",
)


def ensure(model: ModelFile, folder: str) -> str:
    """返回模型文件路径；缺文件只提示手动放置，绝不触发下载。"""
    path = os.path.join(folder, model.filename)
    if os.path.isfile(path):
        return path
    raise FileNotFoundError(
        f"缺少模型 {model.filename}（{model.purpose}）。\n"
        f"请手动下载后放到：{os.path.abspath(folder)}\n"
        f"下载页面：{model.page}\n"
        f"放好后直接重新运行节点即可，不需要重启 ComfyUI。")
