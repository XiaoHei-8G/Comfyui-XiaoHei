# -*- coding: utf-8 -*-
"""
 XiaoHei-列表拼批（XHImageListConcat）—— 2026-10-31 新增

【为什么做这个节点】
ComfyUI 里凡是输出标了 `is_output_list` 的口（比如 XiaoHei-循环结束 开了「累计」之后
的 `outputs`），它给下游的就是**一个列表**，而绝大多数 V1 节点（image_1 / image_2 这种
不同名的口）**不认列表** ⇒ 直接接会报错。

这个节点就干一件事：把「一串 IMAGE 批次」**首尾相接拼成一个大批次**，
正好对应「循环跑 N 段，每段出一批帧 ⇒ 拼起来就是完整视频的帧序列」。

  输入 images(IMAGE)  ← 接 is_output_list 的输出（每个元素 = 一段 IMAGE 批次）
  输出 images(IMAGE)  ← 拼好的大批次（可直接喂 Create Video）
      frame_count(INT)  总帧数
      report(STRING)    每段帧数的可读报告

零新增依赖（只用 torch）。
"""

import torch


def _as_list(images):
    """把各种形态的输入统一成「段列表」。
    - list            → 每轮一个元素
    - dict（{"0":..}）→ 按 key 排序
    - 单个张量        → 一段
    """
    if images is None:
        return []
    if isinstance(images, dict):
        try:
            keys = sorted(images.keys(), key=lambda k: int(k))
        except Exception:
            keys = list(images.keys())
        return [images[k] for k in keys]
    if isinstance(images, (list, tuple)):
        out = []
        for it in images:
            if isinstance(it, (list, tuple)):
                out.extend(list(it))
            else:
                out.append(it)
        return out
    return [images]


class XHImageListConcat:
    """列表拼批：把一串 IMAGE 批次首尾相接拼成一个大批次。

     必须声明 `INPUT_IS_LIST = True`（照家族 XiaoHei-显示文本 那个节点的写法）：
      · 不声明 → 只拿到上游 list 里的**最后一份**（实测：N 段只拼出最后一段）
      · 用 V3 + AnyType 也不行 → V3 会把 list 当成「多份输入」**逐份执行**
        （实测：一次跑出 N 个文件，每份只有一段）
      · INPUT_IS_LIST = True → 整个 list 原样递进来，一个 list = 一次执行
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": ("【 段列表】接「开了累计」的循环结束节点的 outputs，"
                                "或任何输出标了 is_output_list 的 IMAGE 口。"
                                "每个元素 = 一段 IMAGE 批次，按顺序首尾相接。"
                                " | English: a list of IMAGE batches, concatenated in order."),
                }),
            },
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("IMAGE", "INT", "STRING")
    RETURN_NAMES = ("images", "frame_count", "report")
    FUNCTION = "run"
    CATEGORY = "XiaoHei/Image"
    DESCRIPTION = ("【XiaoHei-列表拼批】把「一串 IMAGE 批次」首尾相接拼成一个大批次 —— "
                   "循环跑 N 段、每段出一批帧时，用它把各段拼回完整帧序列再出视频。"
                   "零新增依赖。")

    def run(self, images):
        segs = _as_list(images)
        real = []
        for s in segs:
            if s is None:
                continue
            if isinstance(s, torch.Tensor):
                real.append(s)
        if not real:
            raise ValueError("[XiaoHei-列表拼批] 没收到任何 IMAGE 批次（列表是空的？）")

        # 每段形状统一成 [B,H,W,C]
        norm = []
        for s in real:
            if s.dim() == 3:
                s = s.unsqueeze(0)
            elif s.dim() == 2:
                s = s.unsqueeze(0).unsqueeze(-1).expand(-1, -1, -1, 3)
            norm.append(s.float())

        hw = norm[0].shape[1:3]
        for i, s in enumerate(norm):
            if s.shape[1:3] != hw:
                raise ValueError(
                    f"[XiaoHei-列表拼批] 第 {i + 1} 段尺寸 {tuple(s.shape[1:3])} 和第 1 段 "
                    f"{tuple(hw)} 不一样，拼不了（各段分辨率必须一致）。")
        ch = norm[0].shape[-1]
        for i, s in enumerate(norm):
            if s.shape[-1] != ch:
                raise ValueError(f"[XiaoHei-列表拼批] 第 {i + 1} 段通道数 {s.shape[-1]} ≠ 第 1 段 {ch}")

        out = torch.cat(norm, dim=0)
        counts = [s.shape[0] for s in norm]
        report = ("共 %d 段，各段帧数 %s，合计 %d 帧"
                  % (len(norm), "/".join(str(c) for c in counts), out.shape[0]))
        return (out, int(out.shape[0]), report)


NODE_CLASS_MAPPINGS = {
    "XHImageListConcat": XHImageListConcat,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XHImageListConcat": "列表拼批",
}
