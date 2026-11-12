# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-画板 · 后端落盘路由
#
# 函数体 1:1 抄自 ComfyUI-Pixaroma/server_routes.py
#     MIT License, Copyright (c) 2026 pixaroma
#     _sanitize_id (:614) / _safe_path (:621) / upload_raw_layer (:715) /
#     save_paint_composite (:761)
# 只改了：路由前缀 /pixaroma/ → /xh/paint/、落盘子目录 pixaroma/ → xh_paint/、
#         日志前缀。安全检查（50MB 上限 / 安全 ID 正则 / realpath 越界拦截 /
#         16384px 解压炸弹拦截）一条没删。
#
#  依赖：只用 ComfyUI 自带的 folder_paths / aiohttp / PIL + 标准库，
#    不引入任何第三方 pip 包（家族 STEP 0 ⑤ 铁律）。
#    AI 去背景（rembg）是原版可选功能，需要额外下载模型 → 本版明确降级为
#    「未安装」，画笔 / 图层 / 合成 / 存盘全部完整可用。
# ─────────────────────────────────────────────────────────────────────────────
import os
import io
import re
import base64
import uuid
import folder_paths


def register_routes():
    """由 paint/__init__.py 在包加载时调用；整段 try 包住，绝不拖垮主包。"""
    from server import PromptServer
    from aiohttp import web
    from PIL import Image

    routes = PromptServer.instance.routes

    XH_PAINT_INPUT_ROOT = os.path.realpath(
        os.path.join(folder_paths.get_input_directory(), "xh_paint")
    )
    os.makedirs(XH_PAINT_INPUT_ROOT, exist_ok=True)

    # Max payload: 50 MB of base64 text (≈ 37 MB image)
    _MAX_B64_BYTES = 50 * 1024 * 1024
    # Only alphanumeric, hyphen, underscore allowed in caller-supplied IDs
    _SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")
    _MAX_ID_LEN = 64

    def _sanitize_id(value: str, fallback: str) -> str:
        """Return value only if it matches the safe-ID pattern, else fallback."""
        if value and len(value) <= _MAX_ID_LEN and _SAFE_ID_RE.match(value):
            return value
        return fallback

    def _safe_path(filename: str):
        """
        Build an absolute path inside XH_PAINT_INPUT_ROOT.
        Returns None if the resolved path would escape the root (path traversal guard).
        """
        full = os.path.realpath(os.path.join(XH_PAINT_INPUT_ROOT, filename))
        if (
            not full.startswith(XH_PAINT_INPUT_ROOT + os.sep)
            and full != XH_PAINT_INPUT_ROOT
        ):
            return None
        try:
            os.makedirs(os.path.dirname(full), exist_ok=True)
        except OSError as e:
            print(f"[XiaoHei-画板] could not create {os.path.dirname(full)}: {e}")
            return None
        return full

    def _decode_image(b64_data: str):
        """Decode a data-URI base64 string into a PIL Image, or return None on failure.

        原版末尾调 normalize_bit_depth(img) 处理 16 位源图；画板导出的 canvas PNG
        恒为 8 位，这里改用 PIL 的 convert("RGB")（等效、且不引入那条 helper 链）。
        """
        if not b64_data.startswith("data:image"):
            return None
        if len(b64_data) > _MAX_B64_BYTES:
            return None
        try:
            _, b64_raw = b64_data.split(",", 1)
            image_data = base64.b64decode(b64_raw)
            img = Image.open(io.BytesIO(image_data))
            # Reject absurd dimensions before convert() allocates memory
            # (decompression-bomb guard; no legitimate source exceeds this).
            if img.width > 16384 or img.height > 16384:
                return None
            return img.convert("RGBA")
        except Exception:
            return None

    @routes.post("/xh/paint/api/layer/upload")
    async def upload_raw_layer(request):
        data = await request.json()
        if not isinstance(data, dict):
            data = {}
        b64_data = data.get("image", "")
        raw_id = data.get("layer_id", "")
        layer_id = _sanitize_id(raw_id, str(uuid.uuid4()).replace("-", ""))

        img = _decode_image(b64_data)
        if img is None:
            return web.json_response({"error": "Invalid image data"}, status=400)

        filename = f"layer_{layer_id}.png"
        file_path = _safe_path(filename)
        if file_path is None:
            return web.json_response({"error": "Invalid layer id"}, status=400)

        img.save(file_path, "PNG")
        relative_path = os.path.join("xh_paint", filename).replace("\\", "/")
        return web.json_response({"path": relative_path})

    @routes.post("/xh/paint/api/paint/save")
    async def save_paint_composite(request):
        data = await request.json()
        if not isinstance(data, dict):
            data = {}
        merged_b64 = data.get("image_merged", "")
        raw_id = data.get("project_id", "")
        project_id = _sanitize_id(raw_id, str(uuid.uuid4()).replace("-", ""))

        img = _decode_image(merged_b64)
        if img is None:
            return web.json_response({"error": "Invalid image data"}, status=400)

        filename = f"paint_composite_{project_id}.png"
        file_path = _safe_path(filename)
        if file_path is None:
            return web.json_response({"error": "Invalid project id"}, status=400)

        img.save(file_path, "PNG")
        relative_path = os.path.join("xh_paint", filename).replace("\\", "/")
        return web.json_response({"status": "success", "composite_path": relative_path})

    # ── AI 去背景：原版走 rembg（需额外模型），本版按「不引依赖」铁律明确降级 ──
    @routes.get("/xh/paint/remove_bg_info")
    async def remove_bg_info(request):
        return web.json_response({"rembgInstalled": False, "models": []})

    @routes.post("/xh/paint/remove_bg")
    async def remove_bg(request):
        return web.json_response(
            {"error": "画板 未启用 AI 去背景（需额外 rembg 模型）。请用家族去背景节点处理图层。"},
            status=501,
        )

    # ── 图标/资源伺服：原版 /pixaroma/api/asset?path=... 的 1:1 平移 ──
    # 函数体抄自 ComfyUI-Pixaroma/server_routes.py:323 serve_pixaroma_asset_q，
    # 只改资源根目录（XH_PAINT_ASSETS_ROOT）与路由前缀。越界拦截一条没删。
    XH_PAINT_ASSETS_ROOT = os.path.realpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web", "xh_paint", "assets")
    )
    os.makedirs(XH_PAINT_ASSETS_ROOT, exist_ok=True)

    @routes.get("/xh/paint/api/asset")
    async def serve_xh_paint_asset(request):
        rel = request.query.get("path", "")
        if not rel or ".." in rel.split("/"):
            return web.Response(status=400)
        file_path = os.path.realpath(os.path.join(XH_PAINT_ASSETS_ROOT, rel))
        if (
            not file_path.startswith(XH_PAINT_ASSETS_ROOT + os.sep)
            and file_path != XH_PAINT_ASSETS_ROOT
        ):
            return web.Response(status=403)
        if not os.path.isfile(file_path):
            return web.Response(status=404)
        return web.FileResponse(file_path)

    return True
