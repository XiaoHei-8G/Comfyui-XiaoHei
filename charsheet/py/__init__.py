""" 小黑插件 · 角色设定表 —— 后端实现

视图注册表（可插拔，13 内置 + views_ext/*.json 扩展口）
模型后端能力表（H3 已实现；Qwen21 / MOSS / Krea2 / Flux3 / Kling 空槽）
纯 CPU 编译器（prompt / 通用 prompt / 角色清单 / 宽高 / 布局 guide）

零新增第三方依赖：只用标准库 + numpy + torch（ComfyUI 官方自带）。
 按家族铁律，本子模块**不放任何工作流 JSON**；工作流是用户自己的项目资产。

路由：/xh/charsheet/registry 把当前已注册的视图与适配器清单交给前端，
      使「往 views_ext 丢一个 json 就多一个可点视图」真正落地（前端免改）。
"""
from __future__ import annotations

try:
    from aiohttp import web
    from server import PromptServer
except Exception:
    web = None
    PromptServer = None

try:
    from .nodes import (
        NODE_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print("[XiaoHei/CharacterSheet]  子模块加载失败：%s" % _e)
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}


def _register_registry_route():
    """把视图 + 适配器清单暴露给前端；失败只打日志，绝不拖垮整包。"""
    if web is None or PromptServer is None:
        return
    try:
        if getattr(PromptServer.instance, "_xh_charsheet_route_done", False):
            return
        routes = PromptServer.instance.routes

        from . import adapters, views

        @routes.get("/xh/charsheet/registry")
        async def _xh_charsheet_registry(request):      # noqa: ARG001
            return web.json_response({
                "views": [{
                    "id": v["id"], "zh": v["zh"], "en": v["en"],
                    "group": v["group"], "description": v["description"],
                    "aspect": v["aspect"], "source": v["source"],
                } for v in views.all_views()],
                "view_registry_size": len(views.all_views()),
                "adapters": [{
                    "key": a["key"], "zh": a["zh"], "en": a["en"],
                    "implemented": a["implemented"],
                    "ref_channel": a["capabilities"].get("ref_channel"),
                    "ref_slots": a["capabilities"].get("ref_slots"),
                    "size_align": a["capabilities"].get("size_align"),
                    "is_video": a["capabilities"].get("is_video"),
                    "notes": a["notes"],
                } for a in adapters.all_adapters().values()],
                "implemented_adapters": list(adapters.implemented().keys()),
            })

        PromptServer.instance._xh_charsheet_route_done = True
        print("[XiaoHei/CharacterSheet]  注册路由 /xh/charsheet/registry")
    except Exception as _e:      # noqa: BLE001
        print("[XiaoHei/CharacterSheet]  路由注册失败（前端退回内置清单）：%s" % _e)


_register_registry_route()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
