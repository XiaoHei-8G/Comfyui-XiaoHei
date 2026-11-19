# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-轻量加载图片 / 加载图片 子模块
#   1:1 深度复刻 ComfyUI-Pixaroma 的 Load Image Mini + Load Image
#   （MIT License, Copyright (c) 2026 pixaroma — 署名保留）
#
#   Load Image Mini 依赖一整条共享链，全部原样搬进来，只改包相对导入/节点类名/品牌：
#     node_load_image_mini.py  ← 主节点 XHLoadImageMini（外露给工作流 3/4/5/6/7）
#     node_load_image.py       ← 基类 XHLoadImage + _parse_state/_parse_orig_name
#     _resize_helpers.py       ← 缩放引擎（497 行，1 字节未改）
#     _folder_source.py        ← 自有图片文件夹副本刷新
#     _path_guard.py           ← 路径安全（原样带，未复用 XH 旧版，避免行为漂移）
#   前端 js/xh_load_image_mini/ + js/xh_load_image/ + js/xh_load_images_folder/。
#   shared 层 13 个模块复用 XH 现成的（已逐个确认存在）。
#
#   注意：node_load_image.py 的 NODE_CLASS_MAPPINGS 一并导出（XHLoadImage），
#   因为前端 index.js 会注册它的扩展；不注册会造成前端有壳、后端无节点。
# ─────────────────────────────────────────────────────────────────────────────
from .py.node_load_image import NODE_CLASS_MAPPINGS as _FULL_M, NODE_DISPLAY_NAME_MAPPINGS as _FULL_D
from .py.node_load_image_mini import NODE_CLASS_MAPPINGS as _MINI_M, NODE_DISPLAY_NAME_MAPPINGS as _MINI_D

NODE_CLASS_MAPPINGS = {**_FULL_M, **_MINI_M}
NODE_DISPLAY_NAME_MAPPINGS = {**_FULL_D, **_MINI_D}

WEB_DIRECTORY = "js"

# 自有图片文件夹的 5 条后端路由（list/thumb/browse/pick_native/import）。
# 整段 try 包住：路由挂不上不影响节点出图。
try:
    from .py.loadimage_routes import register_routes
    register_routes()
except Exception as _e:
    print(f"[XiaoHei-轻量加载图片] 文件夹路由注册失败（input 图片加载仍可用）：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
