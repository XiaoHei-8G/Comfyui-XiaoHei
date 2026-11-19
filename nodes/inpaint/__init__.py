# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-局部重绘裁剪 / 局部重绘贴回 子模块
#   1:1 深度复刻 ComfyUI-Pixaroma 的 InpaintCrop + InpaintStitch
#   （MIT License, Copyright (c) 2026 pixaroma — 署名保留）
#
#   后端 2 节点 + 1 组几何/遮罩/融合 helper + 2 条落盘路由；
#   前端 5 个模块在 js/xh_inpaint/。
#   算法一行未改：compute_region / apply_inpaint_crop / stitch_back /
#   resolve_inpaint_mask / resolve_seam / _blur_alpha / _feather_alpha /
#   _color_match 全部原样保留。只改了节点类型名、私有 crop_info 类型、路由前缀、
#   落盘子目录、品牌文案与中文说明。
# ─────────────────────────────────────────────────────────────────────────────
from .py.crop_node import NODE_CLASS_MAPPINGS as _CROP_M, NODE_DISPLAY_NAME_MAPPINGS as _CROP_D
from .py.stitch_node import NODE_CLASS_MAPPINGS as _STITCH_M, NODE_DISPLAY_NAME_MAPPINGS as _STITCH_D

NODE_CLASS_MAPPINGS = {**_CROP_M, **_STITCH_M}
NODE_DISPLAY_NAME_MAPPINGS = {**_CROP_D, **_STITCH_D}

# ComfyUI 只读顶层声明；与家族其它子模块保持一致。
WEB_DIRECTORY = "js"

# 路由注册整段 try 包住 —— 后端路由挂不上不能让整个 XiaoHei 包阵亡。
try:
    from .py.inpaint_routes import register_routes
    register_routes()
except Exception as _e:
    print(f"[XiaoHei-局部重绘] 后端路由注册失败（节点仍可加载）：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
