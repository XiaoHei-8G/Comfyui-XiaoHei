# nodes/audio_studio/py/audio_studio_routes.py
"""XiaoHei-图片蹦迪 的内联图/音频上传路由（1:1 摘抄 ComfyUI-Pixaroma server_routes.py, MIT）。

两条路由：
  GET  /xh/audio_studio/sysinfo  — 系统可用内存，供编辑器估算本次渲染所需 RAM
  POST /xh/audio_studio/upload   — 内联 image/audio 上传到 input/xiaohei/audio_studio/<node_id>/

🔴 安全代码一字未改（2026-08-03 ComfyUI-Manager PR #3118 路径穿越漏洞后加固）：
  · node_id 白名单正则先于任何路径拼接（^[a-zA-Z0-9_-]+$，≤64）
  · _safe_path 的 realpath containment 是真正的边界检查
  · 扩展名白名单 + 单文件 50MB / 单节点合计 100MB 上限
只改三类接线标识：路由前缀 / 输入根 / import 路径。
"""
from __future__ import annotations

import os
import re

ALLOWED_AUDIO_STUDIO_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp"}
ALLOWED_AUDIO_STUDIO_AUDIO_EXTS = {"wav"}  # 仅 WAV — 浏览器上传前已转换
_AUDIO_STUDIO_NODE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")
_AUDIO_STUDIO_MAX_FILE_BYTES = 50 * 1024 * 1024   # 单文件 50 MB
_AUDIO_STUDIO_MAX_DIR_BYTES = 100 * 1024 * 1024  # 单节点合计 100 MB


def register_routes():
    """由子模块 __init__ 调用；整段幂等 + try 包住，路由挂不上不让整包阵亡。"""
    import folder_paths
    from aiohttp import web
    from server import PromptServer

    if getattr(PromptServer.instance, "_xh_audio_studio_route_done", False):
        return
    routes = PromptServer.instance.routes

    # 家族独立输入根：与节点壳 XH_INPUT_ROOT 完全一致（input/xiaohei/audio_studio/）。
    XH_INPUT_ROOT = os.path.realpath(
        os.path.join(folder_paths.get_input_directory(), "xiaohei")
    )
    os.makedirs(XH_INPUT_ROOT, exist_ok=True)

    def _safe_path(filename: str):
        """在 XH_INPUT_ROOT 内构造绝对路径；越界返回 None(containment 检查)。"""
        full = os.path.realpath(os.path.join(XH_INPUT_ROOT, filename))
        if (
            not full.startswith(XH_INPUT_ROOT + os.sep)
            and full != XH_INPUT_ROOT
        ):
            return None
        try:
            os.makedirs(os.path.dirname(full), exist_ok=True)
        except OSError as e:
            print(f"[XiaoHei] 图片蹦迪：创建目录 {os.path.dirname(full)} 失败：{e}")
            return None
        return full

    @routes.get("/xh/audio_studio/sysinfo")
    async def audio_studio_sysinfo(request):  # noqa: ARG001
        """上报系统总内存 + 当前可用内存，编辑器据此显示本次渲染所需 RAM 估算。"""
        info = {"total_gb": None, "available_gb": None, "cap_gb": None}
        try:
            import psutil
            vm = psutil.virtual_memory()
            info["total_gb"] = vm.total / (1024 ** 3)
            info["available_gb"] = vm.available / (1024 ** 3)
            info["cap_gb"] = info["available_gb"] * 0.90
        except Exception:
            pass
        return web.json_response(info)

    @routes.post("/xh/audio_studio/upload")
    async def audio_studio_upload(request):
        reader = await request.multipart()

        node_id = None
        kind = None
        file_bytes = None
        file_filename = None

        while True:
            field = await reader.next()
            if field is None:
                break
            if field.name == "node_id":
                node_id = (await field.text()).strip()
            elif field.name == "kind":
                kind = (await field.text()).strip()
            elif field.name == "file":
                file_filename = field.filename or ""
                file_bytes = await field.read(decode=False)

        # node_id 白名单 —— 必须先于任何路径拼接。
        if not node_id or not _AUDIO_STUDIO_NODE_ID_RE.match(node_id) or len(node_id) > 64:
            return web.json_response(
                {"error": "node_id 不合法（只允许字母、数字、下划线和短横线，最多 64 位）。"},
                status=400,
            )
        if kind not in ("image", "audio"):
            return web.json_response(
                {"error": "kind 只能是 image 或 audio。"}, status=400,
            )
        if not file_bytes or not file_filename:
            return web.json_response({"error": "没有收到文件内容。"}, status=400)
        if len(file_bytes) > _AUDIO_STUDIO_MAX_FILE_BYTES:
            return web.json_response(
                {"error": f"文件太大（超过 {_AUDIO_STUDIO_MAX_FILE_BYTES} 字节）。"},
                status=400,
            )

        ext = file_filename.rsplit(".", 1)[-1].lower() if "." in file_filename else ""
        if kind == "image" and ext not in ALLOWED_AUDIO_STUDIO_IMAGE_EXTS:
            return web.json_response(
                {"error": (
                    f"图片扩展名 {ext!r} 不允许；可用的是 "
                    f"{sorted(ALLOWED_AUDIO_STUDIO_IMAGE_EXTS)}。"
                )},
                status=400,
            )
        if kind == "audio" and ext not in ALLOWED_AUDIO_STUDIO_AUDIO_EXTS:
            return web.json_response(
                {"error": (
                    "音频扩展名 " + repr(ext) + " 不允许；只接受 WAV "
                    "（其它格式会在浏览器里先转好再上传）。"
                )},
                status=400,
            )

        rel_dir = os.path.join("audio_studio", node_id)
        target_dir = _safe_path(rel_dir)
        if target_dir is None:
            return web.json_response({"error": "路径越界，已拦截。"}, status=400)
        os.makedirs(target_dir, exist_ok=True)

        # 同类型旧文件（可能不同扩展名）先删除再写。
        import glob as _glob
        for existing in _glob.glob(os.path.join(target_dir, kind + ".*")):
            try:
                os.unlink(existing)
            except OSError:
                pass

        rel_target = os.path.join("audio_studio", node_id, f"{kind}.{ext}")
        target_path = _safe_path(rel_target)
        if target_path is None:
            return web.json_response({"error": "路径越界，已拦截。"}, status=400)

        target_basename = os.path.basename(target_path)
        try:
            other_size = sum(
                os.path.getsize(f)
                for f in _glob.glob(os.path.join(target_dir, "*"))
                if os.path.isfile(f) and os.path.basename(f) != target_basename
            )
        except OSError:
            other_size = 0
        if other_size + len(file_bytes) > _AUDIO_STUDIO_MAX_DIR_BYTES:
            return web.json_response(
                {"error": (
                    f"单个节点的总大小上限 "
                    f"（{_AUDIO_STUDIO_MAX_DIR_BYTES} 字节）已超出。"
                )},
                status=400,
            )

        with open(target_path, "wb") as fh:
            fh.write(file_bytes)

        rel = f"audio_studio/{node_id}/{kind}.{ext}"
        return web.json_response({"path": rel})

    PromptServer.instance._xh_audio_studio_route_done = True
