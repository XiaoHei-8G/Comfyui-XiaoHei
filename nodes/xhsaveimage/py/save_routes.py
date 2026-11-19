# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-保存图片 · 后端路由（file / next_counter / open_folder / save_now）
# 函数体 1:1 抄自 ComfyUI-Pixaroma/server_routes.py:2527-2548 + 2580-2741
#     MIT License, Copyright (c) 2026 pixaroma
# 只改：路由前缀 /pixaroma/api/save_image → /xh/api/save_image、节点导入相对路径、
#      品牌日志。安全检查一条没删：token 白名单 / 预筛先于 isdir / 白名单目录 /
#      name 段 ".." 与 ":" 拦截（目录读 oracle）/ 只认本机 peer / JSON-only。
# ─────────────────────────────────────────────────────────────────────────────
import os
from aiohttp import web

from ...loadimage.py._path_guard import (
    prescreen_folder_field as _pix_prescreen_field,
    folder_allowed as _pix_folder_allowed,
    denied_message as _pix_denied_message,
    is_path_under as _is_path_under,
    comfy_roots as _pix_comfy_roots,
)
from ._save_helpers import _resolve_save_folder, _next_counter


def _pix_peer_is_local(request):
    """True only for a loopback client (mirrors Pix server_routes verbatim)."""
    import ipaddress
    peer = request.remote or ""
    try:
        host = peer.rsplit(":", 1)[0].strip("[]")
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host in ("localhost", "::1", "")


def _pix_desktop_only_refusal():
    """Refuse a desktop-only route to a remote caller (Pix parity)."""
    return web.json_response(
        {"ok": False, "message": "This action is only available from the ComfyUI host."}
    )


def register_routes():
    """由 xhsaveimage/__init__.py 在包加载时调用；整段 try 包住。"""
    from server import PromptServer
    routes = PromptServer.instance.routes

    @routes.get("/xh/api/save_image/file")
    async def api_save_image_file(request):
        """Serve a file this server session just saved, looked up by an opaque
        token (exact-path registry in node_save_image, filled ONLY by the save
        node itself). No path arrives from the client, so there is no traversal
        surface. Powers the node's preview for files saved outside ComfyUI's
        folders, which /view cannot reach. Read-only; tokens die with the
        server process."""
        from ..node_save_image import resolve_serve_token
        path = resolve_serve_token(request.query.get("t", ""))
        if not path or not os.path.isfile(path):
            return web.Response(status=404, text="unknown or expired preview token")
        # State the image type ourselves instead of leaving it to the platform's
        # mimetype table. MEASURED 2026-08-10 on this box: the same route answered
        # image/png for a .png and application/octet-stream for a .webp, even
        # though this Python's own mimetypes module knows .webp perfectly well. The
        # <img> preview survives either way because browsers sniff images, but the
        # node's "Open" button does window.open on this URL, and octet-stream makes
        # the browser DOWNLOAD the file instead of showing it.
        _CT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
        ct = _CT.get(os.path.splitext(path)[1].lower())
        return web.FileResponse(path, headers={"Content-Type": ct} if ct else None)

    @routes.get("/xh/api/save_image/next_counter")
    async def api_save_image_next_counter(request):
        """Next %counter% value for the node's live 'Will save as' preview.

        `name` is the resolved filename template (extension included, %counter%
        still in it, may contain '/' subfolder segments - the JS resolves dates /
        input / node-reference tokens before calling). `folder` is the raw folder
        field, resolved exactly like the node resolves it at save time. A folder
        that doesn't exist yet just means counter 1. Directory scan runs in an
        executor so a huge folder can't stall other requests.
        """
        folder_raw = request.query.get("folder", "")
        name = request.query.get("name", "")
        try:
            digits = max(1, min(8, int(request.query.get("digits", "3"))))
        except Exception:
            digits = 3

        def _scan():
            # Screen the string that will ACTUALLY be resolved: _resolve_save_folder
            # expands %VARS% and ~ BEFORE realpath, so a raw-only screen judges a
            # different value than the one that reaches the filesystem (round-3 #4).
            # Still entirely pre-resolve - expandvars/expanduser touch nothing.
            if not _pix_prescreen_field(folder_raw):
                return 1, "", True
            base, _inside = _resolve_save_folder(folder_raw)
            # Containment (2026-08-03). Without this the preview was a directory
            # read-oracle on ANY path: _resolve_save_folder deliberately accepts an
            # absolute folder, and _next_counter lists it. It returns no bytes, but
            # the max-match it reports leaks whether files exist anywhere on disk.
            # The refusal returns a CONSTANT (1, "") so nothing about the folder -
            # not even whether it exists - can be inferred from the answer, and a
            # `denied` flag so the node's preview can say so instead of quietly
            # showing a number that a Run would never produce.
            if not _pix_folder_allowed(base):
                return 1, "", True
            parts = [p for p in name.replace("\\", "/").split("/") if p]
            if not parts:
                return 1, "", False
            # `name` is joined on segment by segment below: a ".." walks out of the
            # approved folder and a "D:" switches drive (join drops the base), and
            # _next_counter then LISTS that folder - the read-oracle the folder check
            # above exists to stop (measured 2026-11-13: counter 43 for a file one
            # level above output). Same constant answer. Every node builds `name`
            # with the JS mirror of _safe_prefix, which drops ".." and turns ":" into
            # "_", so a real preview never carries either. Do NOT send name through
            # _safe_prefix itself: it truncates and re-cleans, and the preview would
            # stop matching the Run. path-containment.md #14.
            if any(p == ".." or ":" in p for p in parts):
                return 1, "", False
            # Mirror the save-time order (node_save_image.py): %counter% in a
            # FOLDER segment resolves against existing sibling dirs FIRST, then
            # the FILE counter scans inside that resolved directory - so the
            # preview shows the exact path a Run would create.
            resolved_dirs = []
            parent = base
            for seg in parts[:-1]:
                if "%counter%" in seg:
                    n = _next_counter(parent, seg)
                    seg = seg.replace("%counter%", f"{n:0{digits}}")
                resolved_dirs.append(seg)
                parent = os.path.join(parent, seg)
            counter = _next_counter(parent, parts[-1])
            fname = parts[-1].replace("%counter%", f"{counter:0{digits}}")
            return counter, "/".join(resolved_dirs + [fname]), False

        try:
            import asyncio
            loop = asyncio.get_running_loop()
            counter, resolved, denied = await loop.run_in_executor(None, _scan)
            out = {"ok": True, "counter": counter, "resolved": resolved}
            if denied:
                out["denied"] = True
                out["message"] = _pix_denied_message(str(folder_raw))
            return web.json_response(out)
        except Exception as e:
            return web.json_response(
                {"ok": False, "message": str(e), "counter": 1, "resolved": ""}
            )


    @routes.post("/xh/api/save_image/open_folder")
    async def api_save_image_open_folder(request):
        """Open the OS file explorer at the node's save folder, IF that folder is
        approved. Local-install QoL; the path is resolved the same way the save
        does and must already exist as a directory.

        Opens the folder only when the request comes from this computer
        (_pix_peer_is_local), the folder is on the user's approved list, and it is
        a folder, never a file. The text screen runs BEFORE the isdir, because on
        Windows the isdir of a network path alone contacts that host
        (path-containment.md #5). Same shape as the sibling /workflows/reveal."""
        if not _pix_peer_is_local(request):
            return _pix_desktop_only_refusal()
        try:
            data = await request.json()
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        folder_raw = str(data.get("folder", "") or "")
        if not _pix_prescreen_field(folder_raw):    # expansion-aware, see round-3 #4
            return web.json_response(
                {"ok": False, "message": _pix_denied_message(folder_raw), "denied": True}
            )
        path, _inside = _resolve_save_folder(folder_raw)
        if not _pix_folder_allowed(path):
            return web.json_response({"ok": False, "message": _pix_denied_message(path), "denied": True})
        if not os.path.isdir(path):
            return web.json_response({
                "ok": False,
                "message": "Folder does not exist yet - it is created on the first save.",
            })
        try:
            import subprocess
            import sys
            if sys.platform == "win32":
                # Plain open ONLY. The window may land behind the browser (the JS
                # status line says to check the taskbar). Do NOT re-add the
                # PowerShell bring-to-front script: antivirus software blocked its
                # Add-Type + user32.dll command line (real user report,
                # 2026-07-03). os.startfile is a normal API call.
                os.startfile(path)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
            return web.json_response({"ok": True})
        except Exception as e:
            return web.json_response({"ok": False, "message": str(e)})


    @routes.post("/xh/api/save_image/save_now")
    async def api_save_image_save_now(request):
        """小黑·保存图片's Save now: write the pictures the last Preview run
        showed into the node's save folder, without running the workflow again.

        Request JSON: {files: [temp filenames], state: {node state}, pattern_live}.
        Response JSON: {ok: true, entries, inside_output} or {ok: false, error}.

        JSON only: a cross-origin form cannot send it without a preflight that is
        never answered (registry-compliance.md #2c). Every value is checked. The
        request never carries a path: only file names the node itself registered
        when it wrote them are accepted, and the destination goes through the same
        containment and write code as a Save run (node_save_image.save_now). Runs in
        a worker thread because encoding a batch, or fingerprinting a model for the
        Civitai info the first time, must not freeze the server for everyone.
        """
        if request.content_type != "application/json":
            return web.json_response({"ok": False, "error": "send JSON"}, status=415)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "invalid JSON"}, status=400)
        from ..node_save_image import save_now as _si_save_now
        try:
            out = await asyncio.to_thread(_si_save_now, data)
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        except Exception as e:
            return web.json_response({"ok": False, "error": f"save failed: {e}"}, status=500)
        return web.json_response({"ok": True, **out})

    return True
