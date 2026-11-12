# XiaoHei-按帧裁音频（XHAudioTrimFrames）
#
# 为什么要有这个节点（官方 TrimAudioDuration 只按秒）：
#   · 官方 `TrimAudioDuration.start_index / duration` 单位是**秒**，
#     而画面那边（H3 / LTX）讲的是**帧**。两套口径换算全靠手算，
#     一次长视频拼接就能攒出几十毫秒的错位（音频比画面早/晚一点点，人耳对音频
#     时间轴的偏移比画面敏感得多）。
#   · 本节点用**帧**当唯一口径：画面第 N 帧 == 音频第 N 帧，
#     与 XiaoHei-分段表（unit=帧）天然同源，可以直接连线，零手填。
#
# 三条算法铁律（都是踩过的坑，别改）：
#   ① 帧 → 采样点一律用**全局映射** round(N / fps × sample_rate)，
#      绝不能「每帧先 round 再累加」：
#      44100 / 24 = 1837.5（半整数），每帧 round 一次丢 0.5 个采样，
#      362 帧累积 = 181 个采样 = 4.1 ms 错位。
#   ② fps 只收**整数**，不提供接浮点 fps 的口：
#      官方 GetVideoComponents.fps 给的是 24.0053（容器算出来的），
#      接上去每段音轨会多截 1~2 个采样，三段累积又错位。
#      成片帧率就填 24（H3 / LTX 都是 24）。
#   ③ 裁切区间用**绝对帧号**算：start_smp = round(start_frame/fps×sr)，
#      end_smp   = round((start_frame+length_frames)/fps×sr)，
#      两端各自独立映射 ⇒ 相邻两段拼起来严丝合缝，零累积误差。
#
# 与官方 / 家族节点的关系：
#   · 官方 TrimAudioDuration → 按秒（保留，用户要秒的时候用那个）
#   · 本节点             → 按帧（画面侧口径）
#   · XiaoHei-加载音频      → 加载 + 粗时间线播放器
#   · XiaoHei-H3音频同步    → 把音轨锁进 H3 latent
#
# 零第三方依赖：只用 torch + comfy 官方 API。

import torch


class XHAudioTrimFrames:
    """按帧裁音频。start_frame / length_frames 都是帧号，fps 是整数成片帧率。"""

    DESCRIPTION = (
        "按【帧】裁音频，跟画面对齐用这个：画面第 N 帧就是音频第 N 帧，不用换算秒。"
        "start_frame / length_frames 可以直接接 XiaoHei-分段表（把单位切到「帧」），"
        "画面第几段、音频就取第几段，零手填。"
        "音轨不够长时（末段超出素材是常事）可以补静音、循环素材，或者直接报错让你知道。"
        "成片帧率填整数 24（H3 / LTX 都是 24），别接会自动算成 24.0053 的那个 fps。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO", {
                    "tooltip": "要裁的音轨。接 XiaoHei-加载音频 或 XiaoHei-视频取音 的输出。",
                }),
                "start_frame": ("INT", {
                    "default": 0, "min": -1048576, "max": 1048576, "step": 1,
                    "tooltip": (
                        "从第几帧开始取（下标从 0 开始）。\n"
                        "· 0 = 第一帧\n"
                        "· 正数 = 第 N 帧\n"
                        "· **负数 = 从末尾倒数**：-1 = 最后一个完整帧起，-2 = 倒数第 2 帧起\n"
                        "  （末尾不足一整帧的零头不算一帧）\n"
                        " 可以直接接 XiaoHei-分段表 的「起始帧」输出（把它的单位切到「帧」）。"
                    ),
                }),
                "length_frames": ("INT", {
                    "default": 0, "min": 0, "max": 1048576, "step": 1,
                    "tooltip": (
                        "取多少帧。\n"
                        "· 0（默认）= 取到音轨结尾\n"
                        "· 正数 = 取这么多帧\n"
                        "· 可以直接接 XiaoHei-分段表 的「时长」输出（单位=帧）。\n"
                        " 取到的长度就是 length_frames / fps 秒 —— 和画面那段完全等长。"
                    ),
                }),
                "fps": ("INT", {
                    "default": 24, "min": 1, "max": 240, "step": 1,
                    "tooltip": (
                        "成片帧率（**整数**）。H3 / LTX 都是 24。\n"
                        " 只接受整数：官方 GetVideoComponents.fps 读出来是 24.0053 这种浮点，\n"
                        "接上去每段音轨会多截 1~2 个采样点，三段累积就错位了。\n"
                        " 这里的 fps 要跟**画面那边**一致，不是源视频的原生帧率。"
                    ),
                }),
                "when_short": (["silence", "loop", "error"], {
                    "default": "loop",
                    "tooltip": (
                        "音轨不够长时（要的那一段超出素材末尾）怎么办：\n"
                        "· 循环 = 从**素材开头**绕回循环补齐（像视频循环那样）\n"
                        "· 补静音 = 缺的补真 0\n"
                        "   末段只差零头几帧时，**补静音通常比循环更自然**（循环会在接缝处跳回开头，听得出来）\n"
                        "· 报错 = 直接报错并告诉你缺多少（调试时用，别让流程悄悄跑偏）"
                    ),
                }),
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING")
    RETURN_NAMES = ("audio", "info")
    FUNCTION = "trim"
    CATEGORY = "XiaoHei/音频"

    # ------------------------------------------------------------------
    # 核心：帧 → 采样点（全局映射，绝不逐帧 round 累加）
    # ------------------------------------------------------------------
    @staticmethod
    def _frame_to_sample(frame, fps, sample_rate):
        """第 frame 帧对应的绝对采样点。 全局映射，别改成逐帧累加。"""
        return int(round(float(frame) / float(fps) * float(sample_rate)))

    @staticmethod
    def _total_frames(total_samples, fps, sample_rate):
        """音轨一共能装多少整帧。"""
        if sample_rate <= 0:
            return 0
        return int(total_samples * float(fps) // float(sample_rate))

    def trim(self, audio, start_frame=0, length_frames=0, fps=24, when_short="loop"):
        if audio is None:
            raise ValueError("[XiaoHei-按帧裁音频] audio 口没接 —— 没有音轨可裁")

        waveform = audio.get("waveform")
        sample_rate = int(audio.get("sample_rate") or 0)
        if waveform is None:
            raise ValueError("[XiaoHei-按帧裁音频] 进来的 audio 里没有 waveform 数据（不是标准 AUDIO？）")
        if sample_rate <= 0:
            raise ValueError("[XiaoHei-按帧裁音频] sample_rate 取不到（不是标准 AUDIO？）")

        total_samples = int(waveform.shape[-1])
        if total_samples <= 0:
            print("[XiaoHei-按帧裁音频] 音轨是空的（0 个采样点），原样返回")
            return (audio, "音轨为空，原样返回")

        fps = max(1, int(fps))
        total_frames = self._total_frames(total_samples, fps, sample_rate)

        # ---- 起点（支持负数倒数）----
        start = int(start_frame)
        if start < 0:
            # -1 = 最后一帧起（和 XiaoHei-取帧范围 语义一致）；-2 = 倒数第 2 帧起
            start = max(0, total_frames + start)
            if total_frames <= 0:
                raise ValueError(
                    "[XiaoHei-按帧裁音频] 音轨太短（%.3f 秒，装不下 %d 帧），没法按负数倒数"
                    % (total_samples / float(sample_rate), fps)
                )

        if start >= total_frames:
            msg = ("[XiaoHei-按帧裁音频] 起点第 %d 帧超出音轨（共 %d 帧 = %.3f 秒 @ %dfps）"
                   % (start, total_frames, total_samples / float(sample_rate), fps))
            if when_short == "error":
                raise ValueError(msg + " —— 已按「报错」模式停下")
            # 循环 / 补静音：从素材开头接着来
            start = 0

        # ---- 终点（全局映射，两端独立算 ⇒ 相邻段严丝合缝）----
        length = int(length_frames)
        if length <= 0:
            end_frame = total_frames          # 0 = 取到结尾
        else:
            end_frame = start + length

        start_smp = self._frame_to_sample(start, fps, sample_rate)
        end_smp = self._frame_to_sample(end_frame, fps, sample_rate)
        if end_smp <= start_smp:
            print("[XiaoHei-按帧裁音频] 起点第 %d 帧已经在音轨末尾，没有可取的内容" % start)
            return ({"waveform": waveform[..., :0], "sample_rate": sample_rate},
                    "起点已在音轨末尾，取到 0 帧")

        want = end_smp - start_smp
        avail = total_samples - start_smp
        take = min(want, avail)
        fill = want - take

        # ---- 取材 ----
        piece = waveform[..., start_smp:start_smp + take]

        # ---- 不够长时怎么补 ----
        #  归一化时**必须保留 error**：早先写成 in ("silence","loop") else "loop"
        #    ⇒ "error" 被悄悄降级成 loop，调试模式形同虚设（实测踩到）。
        mode = str(when_short) if str(when_short) in ("silence", "loop", "error") else "loop"
        if fill > 0:
            if mode == "error":
                raise ValueError(
                    "[XiaoHei-按帧裁音频] 要第 %d~%d 帧（%.4f 秒），但音轨从第 %d 帧起只剩 %.4f 秒，"
                    "缺 %.4f 秒（%.1f 帧）—— 已按「报错」模式停下。"
                    "想补齐就把「短了怎么办」改成「循环」或「补静音」。"
                    % (start, end_frame, want / float(sample_rate), start,
                       take / float(sample_rate), fill / float(sample_rate),
                       fill * fps / float(sample_rate))
                )
            if mode == "loop" and take > 0:
                #  循环 = 从**素材开头**绕回（跟 XiaoHei-加载音频 的 loop 语义一致：
                #    像视频循环那样，从头接着放，不是把刚取的那段重复一遍）。
                #    末段超出素材末尾时，这跟画面那边「视频循环回开头」是对齐的。
                #     索引对**整条素材**取模（不是对 take 取模）⇒ 缺的比已取的多也不会越界/错相位。
                loop_src = waveform[..., :total_samples]
                idx = torch.arange(fill, device=piece.device) % total_samples
                loop_part = loop_src.index_select(-1, idx)
                out = torch.cat([piece, loop_part], dim=-1)
            else:
                pad = torch.zeros(tuple(waveform.shape[:-1]) + (fill,),
                                  dtype=waveform.dtype, device=waveform.device)
                out = torch.cat([piece, pad], dim=-1) if take > 0 else pad
        else:
            out = piece

        # ---- 信息条 ----
        got_frames = int(round(out.shape[-1] * fps / float(sample_rate)))
        info = (
            "帧[%d, %d) @%dfps = %.4f 秒 | 音轨共 %d 帧（%.3f 秒）| 实际取到 %d 帧（%.4f 秒）"
            % (start, end_frame, fps, want / float(sample_rate),
               total_frames, total_samples / float(sample_rate),
               got_frames, out.shape[-1] / float(sample_rate))
        )
        if fill > 0:
            how = "循环补齐" if mode == "loop" else "补静音"
            info += " | 缺 %.4f 秒（%.1f 帧）已%s" % (
                fill / float(sample_rate), fill * fps / float(sample_rate), how)
        print("[XiaoHei-按帧裁音频] " + info)

        return ({"waveform": out, "sample_rate": sample_rate}, info)


NODE_CLASS_MAPPINGS = {"XHAudioTrimFrames": XHAudioTrimFrames}
NODE_DISPLAY_NAME_MAPPINGS = {"XHAudioTrimFrames": "按帧裁音频"}
