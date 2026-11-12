# Comfyui-XiaoHei

[🇨🇳 中文](README.md) · [🇬🇧 English]

> A practical ComfyUI node collection: **126 nodes · 36 sound effects**, built for low-VRAM friendliness and faster workflows.

![version](https://img.shields.io/badge/version-1.0.2-blue) ![nodes](https://img.shields.io/badge/nodes-126-green) ![license](https://img.shields.io/badge/license-MIT-yellow)

## Install

**Option A · ComfyUI Manager (recommended)**
Search any of these in ComfyUI Manager to install:
`小黑` · `Comfyui-XiaoHei` · `工具箱` · `低显存` · `126`

**Option B · Manual**
```bash
git clone https://github.com/XiaoHei-8G/Comfyui-XiaoHei.git
# Place into <ComfyUI>/custom_nodes/ and restart ComfyUI
```
Dependencies (opencv-python / scenedetect / rotary-embedding-torch / imageio-ffmpeg) are handled automatically by Manager or the startup self-check. See [docs/安装与依赖详解.md](docs/安装与依赖详解.md) (Chinese).

## Node Overview

8 categories by function. Full list: [docs/节点清单.md](docs/节点清单.md) (Chinese).

| Category | What it does | Representative nodes |
|---|---|---|
| Video / Image | Compose · Compare · Load · Resize · Colorize | Video Combine, Video Compare, SAM3 Stabilizer, Image Resize |
| Model / Sampling | LoRA stack · Slider · Expression | LoRA Stack, Slider, Math Expression |
| Tools / Flow | Loop · Key-Value store · Prompt chain | Loop Start/End, Key-Value store, Prompt Stack |
| Camera / Pose | Angle · Orientation · Multi-person lock | Camera Angle, LTX Face Lock |
| Audio | Sound playback · TTS | Soundboard |
| Prompt | Character card · Segment plan · Translate | Character Card, Prompt Stack, Tag Prompt |
| H3 / Adapter | MiniMax-H3 / LTX adapter | H3LTX Adapter |
| Utils | Mask · Number · Sampler | Smart Face Mask, Number Convert, Solid Mask |

## Directory Structure

```
Comfyui-XiaoHei/
├── nodes/      # 26 feature modules (126 nodes)
├── js/         # Frontend (incl. 36 sound effects in sounds/)
├── docs/       # Detailed docs (node list / mask guide / install)
├── __init__.py
└── pyproject.toml
```

## Detailed Docs

- [Full node list](docs/节点清单.md)
- [Smart Face Mask guide](docs/小黑万能遮罩详解.md)
- [Install & dependencies](docs/安装与依赖详解.md)

## Feedback & Community

- **GitHub**: [XiaoHei-8G/Comfyui-XiaoHei](https://github.com/XiaoHei-8G/Comfyui-XiaoHei)
- **Bilibili**: 小黑 (tutorials / updates)
- **Community group**: see the pinned Bilibili column (kept up to date): https://www.bilibili.com/opus/1267916337700667400

## License

MIT
