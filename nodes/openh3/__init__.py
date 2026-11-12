# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-H3精修 子模块（Open-H3 Regenerate 2K）
#   复刻 ComfyUI-OpenH3-VideoTools（Tensor Alchemist, GPL-3.0）的 5 个节点，
#   并把 ComfyUI-OpenH3-Regenerate2K（Songssx, MIT）的 3 个节点一并自持进来。
#
#   自持的原因：原版「精修总控」内部硬查这 3 个节点的 ID，查不到直接
#   RuntimeError 拒绝启动。搬进本包后，外部两个包**完全不装也能跑**。
#
#   依赖状况：
#     · 官方 ComfyUI 核心 —— 全在（torch / av / comfy.ldm.minimax.* / NestedTensor 等）
#     · imageio-ffmpeg   —— pip 包，写在顶层 requirements.txt，Manager 会自动提示
#     · KJNodes          —— **可选**。有就多两层低显存补丁（8GB 强烈建议装），
#                          没有就跳过这两层，仍可运行，只是峰值显存更高。
# ─────────────────────────────────────────────────────────────────────────────
from .py.xh_openh3_input import XHOpenH3AutoInput
from .py.xh_openh3_prompt import XHOpenH3PromptEncodeRelease
from .py.xh_openh3_refine import XHOpenH3RefineRelease
from .py.xh_openh3_decode import XHOpenH3VAEDecodeLowMemory
from .py.xh_openh3_tiled import XHOpenH3TiledDiffusion
from .py.xh_openh3_regen import (
    XHOpenH3LockAudio,
    XHOpenH3ModelPatch,
    XHOpenH3Sigmas,
)

NODE_CLASS_MAPPINGS = {
    "XHOpenH3AutoInput": XHOpenH3AutoInput,
    "XHOpenH3PromptEncodeRelease": XHOpenH3PromptEncodeRelease,
    "XHOpenH3RefineRelease": XHOpenH3RefineRelease,
    "XHOpenH3VAEDecodeLowMemory": XHOpenH3VAEDecodeLowMemory,
    "XHOpenH3TiledDiffusion": XHOpenH3TiledDiffusion,
    "XHOpenH3ModelPatch": XHOpenH3ModelPatch,
    "XHOpenH3Sigmas": XHOpenH3Sigmas,
    "XHOpenH3LockAudio": XHOpenH3LockAudio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHOpenH3AutoInput": "H3视频预处理",
    "XHOpenH3PromptEncodeRelease": "H3提示词编码",
    "XHOpenH3RefineRelease": "H3精修",
    "XHOpenH3VAEDecodeLowMemory": "H3低内存解码",
    "XHOpenH3TiledDiffusion": "H3分块扩散",
    "XHOpenH3ModelPatch": "H3模型补丁",
    "XHOpenH3Sigmas": "H3官方步长",
    "XHOpenH3LockAudio": "H3锁定音频",
}

# ComfyUI 只读顶层声明；子模块里这句与家族其它模块一致，属死变量（保留格式统一）。
WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
