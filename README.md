# Comfyui-XiaoHei · 小黑工具箱

[🇬🇧 English](README_EN.md) · [🇨🇳 中文]

> ComfyUI 实用节点集合：**141 个节点 · 36 个音效**，主打低显存友好 + 工作流提效。

![版本](https://img.shields.io/badge/version-1.0.3-blue) ![节点数](https://img.shields.io/badge/nodes-141-green) ![协议](https://img.shields.io/badge/license-MIT-yellow)

## 安装

**方式一 · Manager 一键装（推荐）**
在 ComfyUI Manager 搜索以下任一关键词即可安装：
`小黑` · `Comfyui-XiaoHei` · `工具箱` · `低显存` · `141`

**方式二 · 手动**
```bash
git clone https://github.com/XiaoHei-8G/Comfyui-XiaoHei.git
# 放进 <ComfyUI>/custom_nodes/ 后重启 ComfyUI
```
**依赖怎么装，看你是哪种安装：**
- **Manager 一键装**：会自动读 `requirements.txt` 把 4 个依赖装好，不用管。
- **手动装（git clone / 网盘 zip 解压）**：**不会自动装依赖**，必须自己执行一次，否则部分节点加载不出来、界面会报「缺失节点包 / 未知包」—— 那不是包坏了，是缺库：
```bash
# 官方便携版
<ComfyUI>\python_embeded\python.exe -m pip install -r "custom_nodes\Comfyui-XiaoHei\requirements.txt"
# venv 版
<ComfyUI>\.venv\Scripts\python.exe -m pip install -r "custom_nodes\Comfyui-XiaoHei\requirements.txt"
```
装完**完全退出 ComfyUI 再重开**（刷新网页没用）。四个依赖是 `opencv-python` / `scenedetect` / `rotary-embedding-torch` / `imageio-ffmpeg`，详见 [docs/安装与依赖详解.md](docs/安装与依赖详解.md)。

## 节点总览

按功能分 8 类，完整清单见 [docs/节点清单.md](docs/节点清单.md)。

| 分类 | 干啥用 | 代表节点 |
|---|---|---|
| 视频 / 图像 | 合成 · 对比 · 加载 · 缩放 · 上色 | 视频合成、视频对比、SAM3 稳像、图像缩放 |
| 模型 / 采样 | LoRA 堆栈 · 滑块 · 表达式 | LoRA 堆栈、滑块、表达式求值 |
| 工具 / 流程 | 循环 · 键值存储 · 提示词链 | 循环开始/结束、键值存取、提示词栈 |
| 相机 / 姿态 | 机位 · 角度 · 多人锁定 | 相机角度、LTX 锁脸 |
| 音频 | 音效播放 · 语音合成 | 声音播放（soundboard） |
| 提示词 | 角色卡 · 分段计划 · 翻译 | 角色卡、提示词栈、标签提示词 |
| H3 / 适配 | MiniMax-H3 / LTX 适配 | H3LTX 适配器 |
| 工具扩展 | 遮罩 · 数值 · 采样器 | 万能遮罩、数值转换、实心遮罩 |

## 目录结构

```
Comfyui-XiaoHei/
├── nodes/      # 34 个功能模块（141 节点）
├── js/         # 前端（含 36 个音效 sounds/）
├── docs/       # 详细文档（节点清单 / 万能遮罩详解 / 安装依赖）
├── __init__.py
└── pyproject.toml
```

## 详细文档

- [节点完整清单](docs/节点清单.md)
- [万能遮罩节点详解](docs/小黑万能遮罩详解.md)
- [安装与依赖详解](docs/安装与依赖详解.md)

## 交流反馈

- **GitHub**：[XiaoHei-8G/Comfyui-XiaoHei](https://github.com/XiaoHei-8G/Comfyui-XiaoHei)
- **B 站**：小黑（教程 / 更新）
- **交流群**：见 B 站主页置顶专栏（长期更新，换群不改视频）：https://www.bilibili.com/opus/1267916337700667400

## 许可证

MIT
