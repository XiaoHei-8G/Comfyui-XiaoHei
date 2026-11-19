# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-局部重绘裁剪 · 后端落盘路由
#
# 函数体 1:1 抄自 ComfyUI-Pixaroma/server_routes.py:995-1043
#     MIT License, Copyright (c) 2026 pixaroma
#     upload_inpaint_source / save_inpaint_mask / _sanitize_id / _safe_path / _decode_image
# 只改了：路由前缀 /pixaroma/api/inpaint/ → /xh/inpaint/api/、落盘子目录
#         pixaroma/ → xh_inpaint/、日志前缀。安全检查一条没删：
#         50MB base64 上限 / 安全 ID 正则 / realpath 越界拦截 / 16384px 解压炸弹拦截。
#
# 依赖：只用 ComfyUI 自带 folder_paths + aiohttp + PIL + 标准库（家族零第三方依赖铁律）。
# ─────────────────────────────────────────────────────────────────────────────
import os
import io
import re
import base64
import uuid
import folder_paths


def register_routes():
    """由 inpaint/__init__.py 在包加载时调用；整段 try 包住，绝不拖垮主包。"""
    from server import PromptServer
    from aiohttp import web
    from PIL import Image

    routes = PromptServer.instance.routes

    XH_INPAINT_INPUT_ROOT = os.path.realpath(
        os.path.join(folder_paths.get_input_directory(), "xh_inpaint")
    )
    os.makedirs(XH_INPAINT_INPUT_ROOT, exist_ok=True)

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
        """Build an absolute path inside XH_INPAINT_INPUT_ROOT (path traversal guard)."""
        full = os.path.realpath(os.path.join(XH_INPAINT_INPUT_ROOT, filename))
        if (
            not full.startswith(XH_INPAINT_INPUT_ROOT + os.sep)
            and full != XH_INPAINT_INPUT_ROOT
        ):
            return None
        try:
            os.makedirs(os.path.dirname(full), exist_ok=True)
        except OSError as e:
            print(f"[XiaoHei-局部重绘] could not create {os.path.dirname(full)}: {e}")
            return None
        return full

    def _decode_image(b64_data: str):
        """Decode a data-URI base64 string into a PIL Image, or return None on failure."""
        if not b64_data.startswith("data:image"):
            return None
        if len(b64_data) > _MAX_B64_BYTES:
            return None
        try:
            _, b64_raw = b64_data.split(",", 1)
            image_data = base64.b64decode(b64_raw)
            img = Image.open(io.BytesIO(image_data))
            # Decompression-bomb guard, before convert() allocates memory.
            if img.width > 16384 or img.height > 16384:
                return None
            return img
        except Exception:
            return None

    @routes.post("/xh/inpaint/api/upload_src")
    async def upload_inpaint_source(request):
        data = await request.json()
        if not isinstance(data, dict):
            data = {}
        raw_id = data.get("project_id", "")
        project_id = _sanitize_id(raw_id, str(uuid.uuid4()).replace("-", ""))

        img = _decode_image(data.get("image", ""))
        if img is None:
            return web.json_response({"error": "Invalid image data"}, status=400)

        filename = f"inpaint_src_{project_id}.png"
        file_path = _safe_path(filename)
        if file_path is None:
            return web.json_response({"error": "Invalid project id"}, status=400)

        try:
            img.convert("RGB").save(file_path, "PNG")
        except Exception as e:
            return web.json_response({"error": f"Failed to process image: {e}"}, status=400)
        relative_path = os.path.join("xh_inpaint", filename).replace("\\", "/")
        return web.json_response({"status": "success", "path": relative_path})

    @routes.post("/xh/inpaint/api/save_mask")
    async def save_inpaint_mask(request):
        data = await request.json()
        if not isinstance(data, dict):
            data = {}
        raw_id = data.get("project_id", "")
        project_id = _sanitize_id(raw_id, str(uuid.uuid4()).replace("-", ""))

        img = _decode_image(data.get("mask", ""))
        if img is None:
            return web.json_response({"error": "Invalid mask data"}, status=400)

        filename = f"inpaint_mask_{project_id}.png"
        file_path = _safe_path(filename)
        if file_path is None:
            return web.json_response({"error": "Invalid project id"}, status=400)

        # Painted mask: white = inpaint here. Store as 8-bit grayscale.
        try:
            img.convert("L").save(file_path, "PNG")
        except Exception as e:
            return web.json_response({"error": f"Failed to process mask: {e}"}, status=400)
        relative_path = os.path.join("xh_inpaint", filename).replace("\\", "/")
        return web.json_response({"status": "success", "path": relative_path})

    return True
