# XiaoHei-分辨率选择器（XiaoHei 家族）
#
# 算法**逐行照抄**官方 `comfy_extras/nodes_resolution.py` 的 `ResolutionSelector`
# （2026-10-09 读本地源码核对，不是照截图猜）：
#     total = 百万像素 × 1024 × 1024
#     scale = √(total ÷ (宽比 × 高比))
#     width  = round(宽比 × scale ÷ 倍数) × 倍数
#     height = round(高比 × scale ÷ 倍数) × 倍数
#
# 参数名 / 参数顺序 / 下拉**存档值** / 输出名，全部与官方一致
#   ⇒ 老工作流里把官方「分辨率选择器」直接替换成本节点，连线一根都不用动。
#
# 比官方多做的事（都不改接口）：
#   · 中文显示名 + 控件 / 端口的中英切换（家族 i18n，见 web/xh_resolution.js）；
#   · 节点上**实时显示最终生效的宽高**（家族前端预览条，照官方那个 `1024 × 1024 · 1.00 MP` 的样式）；
#     前端与后端用的是同一套公式（含 Python 的「四舍六入五成双」取整），所以节点上看到的
#     就是真跑出来的值，不是估算；
#   · 宽高比字符串认不出来时**回退 1:1 并提示**（官方是 KeyError 直接红框）；
#   · 百万像素填到极小 / 倍数填错时**保底不小于一个倍数**（官方会算出 0，喂给 EmptyLatent 直接崩）。
#
#  家族规范：class_type 与 web/xh_resolution.js 里的 NODE_TYPE 必须逐字一致。
#  FLOAT / INT 必须显式写 min / max（不写就是 ComfyUI 默认的 0~2048，百万像素想填 16.0 会填不进）。
#  下拉的 values 是英文存档值（官方 8 档 + XiaoHei 补充 4 档），中文只在前端显示层换（getOptionLabel）。
#  注意：补充的 4 档官方没有，所以「XiaoHei 节点 → 官方节点」反向换回会不认这些档；正向替换不受限。

import math

# 与官方 `nodes_resolution.py` 的 ASPECT_RATIOS 逐条对齐（键 = 存档值，值 = (宽比, 高比)）
ASPECT_RATIOS = {
    "1:1 (Square)": (1, 1),
    "2:3 (Portrait Photo)": (2, 3),
    "3:2 (Photo)": (3, 2),
    "3:4 (Portrait Standard)": (3, 4),
    "4:3 (Standard)": (4, 3),
    "9:16 (Portrait Widescreen)": (9, 16),
    "16:9 (Widescreen)": (16, 9),
    "21:9 (Ultrawide)": (21, 9),
    "4:5 (Social Portrait)": (4, 5),
    "9:21 (Phone Fullscreen)": (9, 21),
    "16:10 (Laptop)": (16, 10),
    "2:1 (Panorama)": (2, 1),
    "自定义 (Custom)": (None, None),   # 哨兵：两数都为 None ⇒ 走 custom_w / custom_h
}

_DEFAULT_RATIO = "1:1 (Square)"


class XHResolutionSelect:
    """按「宽高比 × 百万像素」算出宽高，并按倍数对齐 —— 官方 ResolutionSelector 的 XiaoHei 版。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "aspect_ratio": (list(ASPECT_RATIOS.keys()), {
                    "default": _DEFAULT_RATIO,
                    "tooltip": (
                        "画面宽高比（官方 8 档 + XiaoHei 补充 4 档 + 自定义，存的是英文存档值，界面按语言显示中文）。\n"
                        "· 1:1 方形  · 2:3 / 3:4 竖版  · 3:2 / 4:3 横版\n"
                        "· 9:16 竖屏（短视频）  · 16:9 横屏  · 21:9 超宽屏\n"
                        "· 4:5 竖版社交  · 9:21 手机全屏竖  · 16:10 笔记本  · 2:1 全景\n"
                        "· 选「自定义宽高比」后，下方「自定义宽比 / 自定义高比」两个框会亮起，填任意正数即用"
                    ),
                }),
                "megapixels": ("FLOAT", {
                    "default": 1.0, "min": 0.1, "max": 100.0, "step": 0.01,
                    "tooltip": (
                        "目标总像素（百万像素，MP）。1.00 MP ≈ 方形 1024×1024。\n"
                        " 它管的是**总面积**，宽高由上面的比例分配 —— 同一个 1.0 MP，"
                        "9:16 会比 1:1 矮很多、21:9 会扁很多。\n"
                        " 算完还会按「倍数」取整，所以实际 MP 与这里可能有零点零几的出入。\n"
                        " 范围 0.1~100.0（约 8K 出头的上限）。超过 33MP（≈8K 档）显存吃紧，"
                        "节点预览条会变红警示。"
                    ),
                }),
                "multiple": ("INT", {
                    "default": 8, "min": 8, "max": 128, "step": 4,
                    "tooltip": (
                        "把结果对齐到这个数的整数倍（默认 8）。\n"
                        "VAE / 大多数模型要求宽高是 8 的倍数，动它之前先想清楚：\n"
                        "· 64 / 128 会让尺寸跳档很猛，适合对齐 latent 块；\n"
                        "· 官方默认就是 8，一般不用改。"
                    ),
                }),
                "custom_w": ("FLOAT", {
                    "default": 16.0, "min": 0.1, "max": 100.0, "step": 0.1,
                    "label": "自定义宽比",
                    "tooltip": (
                        "自定义宽高比的「宽」。仅当「宽高比」选了「自定义宽高比」时才生效。\n"
                        "例如宽比填 3、高比填 7 ⇒ 3:7 的竖长条。可填任意正数，逻辑与预设一致。"
                    ),
                }),
                "custom_h": ("FLOAT", {
                    "default": 9.0, "min": 0.1, "max": 100.0, "step": 0.1,
                    "label": "自定义高比",
                    "tooltip": (
                        "自定义宽高比的「高」。仅当「宽高比」选了「自定义宽高比」时才生效。\n"
                        "填 1 即方形基准，配合宽比得到任意比例。"
                    ),
                }),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "get_resolution"
    CATEGORY = "XiaoHei/Image"
    DESCRIPTION = (
        "【干什么】按「宽高比 × 百万像素」算出宽和高，并按倍数对齐 —— 官方「分辨率选择器」的 XiaoHei 版，"
        "参数与输出跟官方逐字一致，可直接替换。\n"
        "【怎么配】· aspect_ratio 宽高比（官方 8 档 + XiaoHei 补充 4 档：1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 9:16 / 16:9 / 21:9 "
        "＋ 4:5 竖版社交 / 9:21 手机竖 / 16:10 笔记本 / 2:1 全景 ＋ 自定义宽高比（填任意正比））\n"
        "· megapixels 目标总像素（MP，0.1~100.0；1.0 MP ≈ 方形 1024×1024；超过 33MP 即 8K 档，显存吃紧建议谨慎）\n"
        "· multiple 对齐倍数（默认 8，一般不用动）\n"
        "【怎么用】接 Empty Latent Image / EmptyImage 的 width、height，"
        "比手填数字更省心：换比例时总像素不变，不会一会儿清楚一会儿糊。\n"
        "【输出】width 宽 / height 高（都是 INT，已按倍数对齐）。\n"
        " 它算的是「面积对、比例对」的尺寸，不是精确的 832×1216 这类常用档 —— "
        "要精确档位请自己填数字（本节点不预设档位表，就是为了避免一堆用不上的花架子）。"
    )

    def get_resolution(self, aspect_ratio, megapixels, multiple, custom_w, custom_h):
        pair = ASPECT_RATIOS.get(aspect_ratio)
        # 「自定义宽高比」哨兵：(None, None) ⇒ 改用 custom_w / custom_h
        if pair is None or (pair[0] is None and pair[1] is None):
            try:
                w_ratio = float(custom_w) if custom_w is not None else 16.0
                h_ratio = float(custom_h) if custom_h is not None else 9.0
            except (TypeError, ValueError):
                w_ratio, h_ratio = 16.0, 9.0
            if w_ratio <= 0 or h_ratio <= 0:
                w_ratio, h_ratio = 16.0, 9.0
        else:
            w_ratio, h_ratio = pair

        try:
            mp = float(megapixels)
        except (TypeError, ValueError):
            mp = 1.0
        if mp < 0.01:                       # 官方不设保底，填小了会算出 0 宽 0 高
            mp = 0.01

        try:
            mult = int(multiple)
        except (TypeError, ValueError):
            mult = 8
        if mult < 1:
            mult = 1

        total_pixels = mp * 1024 * 1024
        scale = math.sqrt(total_pixels / (w_ratio * h_ratio))
        width = int(round(w_ratio * scale / mult) * mult)
        height = int(round(h_ratio * scale / mult) * mult)

        # 保底：至少留一个倍数，免得下游 Empty Latent 收到 0 直接崩
        width = max(mult, width)
        height = max(mult, height)

        return (width, height)


NODE_CLASS_MAPPINGS = {"XHResolutionSelect": XHResolutionSelect}
NODE_DISPLAY_NAME_MAPPINGS = {"XHResolutionSelect": "分辨率选择器"}
