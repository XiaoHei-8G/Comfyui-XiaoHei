# SPDX-License-Identifier: GPL-3.0-only
# Derived from bbaudio-2025/Comfyui-MMH3-UltimateUpscale
# commit 0a8d5ee3914e8fe8bd842885412ec397d7ca1629, nodes/tiled_diffusion.py
# Copyright (c) 2026 bbaudio-2025; see LICENSE-MIT-UPSTREAM.txt.
# Tiled diffusion technique credits shiimizu/ComfyUI-TiledDiffusion (GPLv3).
"""每个去噪步的空间分块扩散（MultiDiffusion / Mixture of Diffusers 风格）。

做法不是「每块独立跑到收敛再拼接」（MMH3 Ultimate Upscale 的 spatial split 路径），
而是用 model_function_wrapper 补丁：每个去噪步把打包好的 AV latent 切成空间块，
每块跑一次 DiT，再按均匀/高斯权重混合回整帧缓冲。
所有块共享同一套 sigma、同一份噪声场，所以不需要冻结/淡出重叠掩码。

块窗口携带**全局帧坐标**。_WindowLayout 从整帧布局推导出每块的 RoPE 位置，
并保留整帧的音频锚点。这保证了跨窗口的坐标对齐。
但它**不恢复**块外的视觉注意力上下文，所以预测结果可能与整帧推理不同，
重叠混合也不保证与整帧完全等价。

用法：Open-H3 补丁后的模型 → 注意力/MLP 内存补丁 → 本节点 →
BasicGuider → 原生 SamplerCustomAdvanced。
喂给采样器的必须是「学出来的放大后联合 AV latent」，
且经过 OpenH3LockAudioForRefine 处理，配上精确的 OpenH3RegenerateSigmas 与 Euler。
Ultimate Upscale 的原生路径会丢掉那份噪声掩码，不能与严格的音频锁适配器混用。
"""

import torch
import comfy.utils
import comfy.model_management
import comfy.ldm.common_dit
from comfy_api.latest import io
from comfy.ldm.minimax.model import PackedLayout


def _ceil2(x):
    """向上取到下一个偶数（H3 的 2×2 空间 patch 网格）。"""
    return (x + 1) // 2 * 2


def _tile_starts(total, tile, overlap):
    """覆盖 [0, total) 的起始偏移列表：块尺寸 tile、相邻重叠 overlap。
    块尺寸与重叠都是 2 个 latent 单位（H3 的 2×2 空间 patch 网格 = 32 像素）的倍数，
    保证每条边界都落在 patch 对齐位置上。"""
    if tile >= total:
        return [0]
    stride = tile - overlap
    starts = list(range(0, total - tile + 1, stride))
    if starts[-1] + tile < total:
        starts.append(total - tile)
    return starts


class _WindowLayout:
    """与 PackedLayout 兼容的布局：视频/关键帧行保留块窗口的**全局**帧坐标
    （而不是在块原点重启 RoPE 网格），音频锚点取自整帧，
    使每块对音频流的定位完全一致。"""

    def __init__(self, full, keyframes, T, Hp, Wp, h0, w0, h1, w1, audio_t, text_len):
        # 整帧 patch 网格上的补齐后窗口边界
        hp1, wp1 = h0 + _ceil2(h1 - h0), w0 + _ceil2(w1 - w0)
        rows = torch.arange(h0 // 2, hp1 // 2, dtype=torch.long)[:, None] * (Wp // 2) \
            + torch.arange(w0 // 2, wp1 // 2, dtype=torch.long)[None, :]
        idx = rows.reshape(-1)
        frame_rows = (Hp // 2) * (Wp // 2)
        # 每个打包了视频 latent 的关键帧的时间 token 数，
        # 顺序按 PackedLayout 的分段顺序（每个这样的关键帧一个 'cond' 段）
        kf_vts = [kf["latent"].shape[2] for kf in (keyframes or ()) if kf.get("latent") is not None]

        pos, img_pos, img_upd, aud_pos, aud_upd, segments = [], [], [], [], [], []
        kf_i = 0
        row = 0
        for a, b, kind in full.segments:
            p = full.position_ids[a:b]
            if kind == "video":
                p = p.reshape(T, frame_rows, 3)[:, idx, :].reshape(-1, 3)
            elif kind == "cond":
                vt = kf_vts[kf_i]
                kf_i += 1
                p = p.reshape(vt, frame_rows, 3)[:, idx, :].reshape(-1, 3)
            n = p.shape[0]
            pos.append(p)
            segments.append((row, row + n, kind))
            if kind in ("cond", "ref_img", "video"):
                img_pos.append(torch.arange(row, row + n))
                img_upd.append(torch.full((n,), kind == "video", dtype=torch.bool))
            elif kind in ("cond_audio", "ref_audio", "audio"):
                aud_pos.append(torch.arange(row, row + n))
                aud_upd.append(torch.full((n,), kind == "audio", dtype=torch.bool))
            row += n

        self.position_ids = torch.cat(pos)
        self.img_pos = torch.cat(img_pos)
        self.img_update = torch.cat(img_upd)
        self.audio_pos = torch.cat(aud_pos)
        self.audio_update = torch.cat(aud_upd)
        self.segments = segments
        self.seq_len = row
        self.signature = (text_len, T, hp1 - h0, wp1 - w0, audio_t)


class _H3TiledDiffusionImpl:
    """通过 set_model_unet_function_wrapper 安装的 model_function_wrapper。

    收到的是打包后的扁平 AV latent（[B, 1, 视频元素 + 音频元素]，见 comfy.utils.pack_latents），
    外加带 latent_shapes 与 minimax 载荷（关键帧 / 引用 / 预构建打包布局）的 cond 字典。"""

    def __init__(self, method, tile_h, tile_w, overlap):
        self.method = method
        self.tile_h = tile_h
        self.tile_w = tile_w
        self.overlap = overlap
        # 模型调用之间不保留任何张量或 conditioning 缓存。
        self.forward_calls = 0
        self.tile_forward_calls = 0

    def _build(self, payload, video, audio, c):
        _, _, T, H, W = video.shape
        rows = _tile_starts(H, self.tile_h, self.overlap)
        cols = _tile_starts(W, self.tile_w, self.overlap)
        text = c.get("c_crossattn")
        text_len = text.shape[1] if text is not None else 0
        audio_t = audio.shape[-1]
        keyframes = payload.get("keyframes")
        refs = payload.get("refs")

        # 整帧布局作为全局窗口位置的来源；
        # 载荷通常带着每块预构建的一个 model_base
        Hp, Wp = _ceil2(H), _ceil2(W)
        full = payload.get("layout")
        if full is None or full.signature != (text_len, T, Hp, Wp, audio_t):
            full = PackedLayout(text_len, T, Hp, Wp, audio_t,
                                keyframes=keyframes, refs=refs)

        tiles, weights, payloads = [], [], []
        for h0 in rows:
            for w0 in cols:
                h1, w1 = min(h0 + self.tile_h, H), min(w0 + self.tile_w, W)
                th, tw = h1 - h0, w1 - w0
                tiles.append((h0, w0, h1, w1))
                if self.method == "gaussian":
                    sigma = max(min(th, tw) / 8.0, 1e-6)
                    yy = torch.arange(th, dtype=torch.float32) - (th - 1) / 2.0
                    xx = torch.arange(tw, dtype=torch.float32) - (tw - 1) / 2.0
                    w = torch.exp(-(yy[:, None] ** 2 + xx[None, :] ** 2) / (2.0 * sigma * sigma))
                else:
                    w = torch.ones(th, tw, dtype=torch.float32)
                # 保持尾部为正，并用同一组权重归一化。
                # 把高斯尾部转成 FP16 可能抹掉被覆盖的角落。
                w.clamp_min_(torch.finfo(torch.float32).eps)
                weights.append(w.to(device=video.device))

                p = dict(payload)
                if keyframes:
                    # 关键帧 latent 与目标空间网格一致，所以像 spatial split 路径的
                    # crop_keyframes_to_tile 那样精确裁到块尺寸
                    kfs, cond_v = [], []
                    for kf in keyframes:
                        nkf = dict(kf)
                        lt = nkf.get("latent")
                        if lt is not None:
                            if lt.shape[3] != H or lt.shape[4] != W:
                                Bk, Ck, Tk, Hk, Wk = lt.shape
                                lt = torch.nn.functional.interpolate(
                                    lt.reshape(Bk * Tk, Ck, Hk, Wk).float(),
                                    size=(H, W), mode="bilinear", align_corners=False,
                                ).reshape(Bk, Ck, Tk, H, W).to(lt.dtype)
                            crop = lt[:, :, :, h0:h1, w0:w1].contiguous()
                            nkf["latent"] = comfy.ldm.common_dit.pad_to_patch_size(crop, (1, 2, 2))
                            cond_v.append(nkf["latent"])
                        kfs.append(nkf)
                    p["keyframes"] = kfs
                    # 引用保持自身分辨率与网格 —— 只裁关键帧；
                    # 展平的 cond 列表必须与之对应
                    p["cond_video_latents"] = cond_v + [
                        r["latent"] for r in (refs or ()) if "latent" in r]
                # 全局位置对齐块坐标；注意力仍限制在各块可用的视觉上下文内。
                p["layout"] = _WindowLayout(full, keyframes, T, Hp, Wp,
                                            h0, w0, h1, w1, audio_t, text_len)
                payloads.append(p)
        print(f"[XiaoHei-H3分块扩散] {len(tiles)} 块（{len(rows)}×{len(cols)}）"
              f"，latent {H}×{W}，重叠 {self.overlap * 16}px，方式={self.method}，全局窗口位置")
        return tiles, weights, payloads

    def __call__(self, model_function, args):
        x = args["input"]
        t = args["timestep"]
        c = args["c"]

        payload = c.get("minimax_payload")
        if payload is None:
            raise ValueError("H3 分块扩散只适用于 MiniMax H3 模型。")
        for k in ("control", "denoise_mask"):
            if c.get(k) is not None:
                raise ValueError(
                    f"H3 分块扩散（实验性）不支持 '{k}'。"
                    "请断开 fun controlnet / inpaint 链路，"
                    "或改用 MMH3 Ultimate Upscale 的 spatial split 路径。"
                )

        streams = comfy.utils.unpack_latents(x, c["latent_shapes"])
        video, audio = streams[0], streams[1] if len(streams) > 1 else None
        _, _, T, H, W = video.shape

        if audio is None or tuple(video.shape[:2]) != (1, 24) or audio.ndim != 4 or tuple(audio.shape[:3]) != (1, 32, 2):
            raise ValueError("H3 分块扩散需要 H3 视频 [1,24,T,H,W] 和音频 [1,32,2,A]。")
        audio_mask = c.get("audio_denoise_mask")
        if audio_mask is None:
            raise ValueError("H3 分块扩散需要带全零音频掩码的锁定音频 latent。")
        if tuple(audio_mask.shape) != (1, 1, 2, audio.shape[-1]) or torch.count_nonzero(audio_mask).item() != 0:
            raise ValueError("只支持全零的 H3 音频 denoise_mask（冻结源音频）。")
        # 每块都看到完全相同的完整音频流。下面的 c_t 原样转发这个掩码对象；
        # 空间维度的视频掩码仍然拒绝。
        tiles, weights, payloads = self._build(payload, video, audio, c)
        self.forward_calls += 1

        # 用 FP32 混合，避免低精度下溢，并让分子/分母落在同一片正权重场上。
        buf = torch.zeros_like(video, dtype=torch.float32)
        wsum = torch.zeros((1, 1, 1, H, W), device=video.device, dtype=torch.float32)
        audio_acc = None
        for (h0, w0, h1, w1), w, p in zip(tiles, weights, payloads):
            comfy.model_management.throw_exception_if_processing_interrupted()
            self.tile_forward_calls += 1
            v_t = video[:, :, :, h0:h1, w0:w1]
            c_t = dict(c)
            c_t["minimax_payload"] = p
            if audio is not None:
                x_t, shapes_t = comfy.utils.pack_latents([v_t, audio])
                c_t["latent_shapes"] = shapes_t
                v_out, a_out = comfy.utils.unpack_latents(
                    model_function(x_t, t, **c_t), shapes_t)
            else:
                v_out = model_function(v_t, t, **c_t)
                a_out = None
            buf[:, :, :, h0:h1, w0:w1] += v_out.to(dtype=torch.float32) * w[None, None, None]
            wsum[:, :, :, h0:h1, w0:w1] += w[None, None, None]
            if a_out is not None:
                audio_acc = a_out if audio_acc is None else audio_acc + a_out

        if not bool(torch.all(wsum > 0)):
            raise RuntimeError("分块扩散存在未被覆盖或权重为零的输出像素。")
        out_v = (buf / wsum).to(dtype=video.dtype)
        if audio is None:
            return out_v
        # 每块都看到了完整音频流；对它的预测取平均
        out, _ = comfy.utils.pack_latents([out_v, audio_acc / len(tiles)])
        print(f"[XiaoHei-H3分块扩散] forward_calls={self.forward_calls} "
              f"tile_forward_calls={self.tile_forward_calls} 音频已锁=True")
        return out


class XHOpenH3TiledDiffusion(io.ComfyNode):
    """XiaoHei-H3分块扩散：每个去噪步都切块跑 DiT 再混合回来。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="XHOpenH3TiledDiffusion",
            display_name="H3分块扩散",
            category="XiaoHei/Video",
            description=(
                "MiniMax H3 的每步空间分块扩散（MultiDiffusion / Mixture of Diffusers 风格，"
                "移植自 shiimizu/ComfyUI-TiledDiffusion）。"
                "给模型打补丁，让每个去噪步把 latent 切成空间块、每块跑一次 DiT、"
                "再用均匀或高斯权重混合 —— 所有块共享同一套 sigma 和噪声场，所以不需要重叠掩码。"
                "块带全局帧坐标，但受限的视觉上下文可能让结果与整帧推理有差异。"
                "接上后请喂给原生 H3 采样器，配锁音频的联合 latent。"
                "\n tile_overlap 至少要 ≥ 块尺寸的 25%，否则各块会「脱节」画成不同内容。"
                "不支持 fun controlnet / inpaint / 空间 denoise mask。"
                "需要全零的音频掩码（由锁音频节点提供），原样转发给每块。"
                "它用更多次调用换更小的 DiT 激活窗口（H3 批量为 1），本质是接缝质量的实验。"
            ),
            search_aliases=["tiled diffusion", "multidiffusion", "mixture of diffusers",
                            "h3 tiling", "分块扩散", "分块"],
            inputs=[
                io.Model.Input(
                    "model",
                    tooltip="要打补丁的 MiniMax H3 diffusion 模型。"),
                io.Combo.Input(
                    "method", options=["gaussian", "uniform"], default="gaussian",
                    tooltip="重叠区混合权重：gaussian（Mixture of Diffusers，默认，块中心权重大）"
                           "或 uniform（MultiDiffusion，简单平均）。"),
                io.Int.Input(
                    "tile_width", default=512, min=64, max=8192, step=32,
                    tooltip="块宽度（像素），会对齐到 32 的倍数（H3 的 2×2 latent patch 网格）。8GB 建议 512。"),
                io.Int.Input(
                    "tile_height", default=512, min=64, max=8192, step=32,
                    tooltip="块高度（像素），会对齐到 32 的倍数。8GB 建议 512。"),
                io.Int.Input(
                    "tile_overlap", default=128, min=0, max=8192, step=32,
                    tooltip="相邻块重叠（像素），对齐 32 的倍数。"
                           " 至少要 ≥ 块尺寸的 25%，否则块之间会脱节。0 = 硬边。"),
            ],
            outputs=[
                io.Model.Output(
                    "model",
                    tooltip="打好补丁的模型；接给原生 H3 采样器配锁音频的联合 latent。"),
            ],
        )

    @classmethod
    def execute(cls, model, method, tile_width, tile_height, tile_overlap) -> io.NodeOutput:
        if model.model_options.get("model_function_wrapper") is not None:
            raise ValueError("已经有 model_function_wrapper 在生效了；请另开一条干净的模型分支。")
        if method not in ("gaussian", "uniform"):
            raise ValueError("method 只能是 gaussian 或 uniform")
        if tile_width < 64 or tile_height < 64 or tile_width % 32 or tile_height % 32 \
                or tile_overlap < 0 or tile_overlap % 32:
            raise ValueError("块尺寸必须 ≥64 且是 32 的倍数；重叠不能为负且必须是 32 的倍数。")
        # 像素 → latent 单位，对齐到 2 token（32 像素）patch 网格
        tw = int(round(tile_width / 32.0)) * 2
        th = int(round(tile_height / 32.0)) * 2
        ov = int(round(tile_overlap / 32.0)) * 2
        if ov >= min(tw, th):
            raise ValueError(
                f"tile_overlap（{ov * 16}px）必须小于块尺寸（{th * 16}×{tw * 16}px），"
                "否则块无法向前推进。")
        impl = _H3TiledDiffusionImpl(method, th, tw, ov)
        patched = model.clone()
        patched.set_model_unet_function_wrapper(impl)
        return io.NodeOutput(patched)
