# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-保存图片 子模块
#   1:1 深度复刻 ComfyUI-Pixaroma 的 Save Image（MIT, Copyright (c) 2026 pixaroma）
#   后端 node_save_image.py(843) + _save_helpers.py(522) + 4 条路由；
#   前端 js/xh_save_image/ 4 模块 + shared/output_folder.mjs。
#   算法一行未改：文件名 token / 日期 / 自增 / node 引用 / 文件夹白名单 /
#   Civitai 元数据 / token 预览服务全部原样。只改节点类名、路由前缀、ui key、
#   品牌日志与中文说明。
#   _path_guard 复用 loadimage 模块的同款（原样带的 Pix 版本，签名一致）。
# ─────────────────────────────────────────────────────────────────────────────
from .py.node_save_image import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

try:
    from .py.save_routes import register_routes
    register_routes()
except Exception as _e:
    print(f"[XiaoHei-保存图片] 路由注册失败（节点保存仍可用）：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
