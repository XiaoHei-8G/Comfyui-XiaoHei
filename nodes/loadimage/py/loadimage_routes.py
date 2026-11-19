# ─────────────────────────────────────────────────────────────────────────────
# XiaoHei-轻量加载图片 · 自有图片文件夹后端路由
#
# 函数体 1:1 抄自 ComfyUI-Pixaroma/server_routes.py（MIT, Copyright (c) 2026 pixaroma）
#   原文段：2001-2080 / 2083-2156 / 2228-2306 / 2316-2479 / 2482-2518
# 只改了：路由前缀 /pixaroma/api → /xh/api、落盘目录 pixaroma_folders → xh_folders、
#        日志前缀。安全检查一条没删：
#   prescreen（先于 isdir）/ folder_allowed（白名单，先于 isdir）/ rel_is_rooted /
#   realpath 越界拦截 / 仅图片扩展名 / 只认本机 peer / 原生对话框单次锁 + 超时。
#
# 依赖：_pix_* 别名全部指向本模块自带的 _path_guard（与 Pix 原版同一份代码）；
#   _folder_source.import_file 也已随本模块落地。零新增第三方依赖。
# ─────────────────────────────────────────────────────────────────────────────
import os
import io
import re
import folder_paths
from aiohttp import web
from PIL import Image

from ._path_guard import (
    is_path_under as _is_path_under,
    folder_allowed as _pix_folder_allowed,
    remember_folder as _pix_remember_folder,
    denied_message as _pix_denied_message,
    comfy_roots as _pix_comfy_roots,
    remembered_folders as _pix_remembered_folders,
    prescreen as _pix_prescreen,
    rel_is_rooted as _pix_rel_is_rooted,
)
from ._resize_helpers import _I16_MODES


def _pix_peer_is_local(request):
    """True only for a loopback client: the native folder dialog must never be
    opened for a remote caller. Mirrors server_routes._pix_peer_is_local verbatim
    (MIT, Copyright (c) 2026 pixaroma)."""
    import ipaddress
    peer = request.remote or ""
    try:
        host = peer.rsplit(":", 1)[0].strip("[]")
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host in ("localhost", "::1", "")


def register_routes():
    """由 loadimage/__init__.py 在包加载时调用；整段 try 包住，绝不拖垮主包。"""
    from server import PromptServer
    routes = PromptServer.instance.routes

    # ── Load Images from Folder XiaoHei ─────────────────────────────────────────
    # These routes back the node's gallery + thumbnails. They read the user's OWN
    # chosen folder on the local machine (the whole point of the node), so they are
    # NOT constrained to input/. They are read-only, validate the path is a real
    # directory, only touch image files, and guard the per-file thumbnail against
    # path-traversal out of the chosen folder via _is_path_under.
    _LIF_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif")


    def _lif_is_image(name: str) -> bool:
        return name.lower().endswith(_LIF_IMAGE_EXTS)


    def _lif_list_files(real, recursive):
        """Walk a folder and return its image files. Blocking (os.walk + os.stat on
        a big tree can take seconds) - run off the event loop."""
        files = []
        if recursive:
            for root, _dirs, names in os.walk(real):
                for n in names:
                    if not _lif_is_image(n):
                        continue
                    full = os.path.join(root, n)
                    try:
                        st = os.stat(full)
                    except OSError:
                        continue
                    rel = os.path.relpath(full, real).replace("\\", "/")
                    files.append({"file": rel, "name": n, "size": st.st_size, "mtime": st.st_mtime})
        else:
            for n in os.listdir(real):
                full = os.path.join(real, n)
                if os.path.isfile(full) and _lif_is_image(n):
                    try:
                        st = os.stat(full)
                    except OSError:
                        continue
                    files.append({"file": n, "name": n, "size": st.st_size, "mtime": st.st_mtime})
        return files


    @routes.get("/xh/api/load_images_folder/list")
    async def api_lif_list(request):
        """List image files in a folder. ?path=<folder>&recursive=0|1
        Returns {ok, folder, files:[{file, name, size, mtime}]} (file = path
        relative to the folder, forward-slashed)."""
        # no-store on every branch: the gallery re-lists on each open, and a browser
        # heuristically caching this JSON would serve a stale folder (same hardening
        # as the LoRA list route).
        hdrs = {"Cache-Control": "no-store"}
        folder = request.query.get("path", "")
        recursive = request.query.get("recursive", "0") == "1"
        # prescreen BEFORE isdir: on Windows, isdir on \\host\share alone makes the
        # machine contact that host, so a network path is judged by its text before
        # any filesystem call touches it (path-containment.md #5).
        if not _pix_prescreen(folder):
            return web.json_response(
                {"ok": False, "message": _pix_denied_message(folder), "denied": True, "files": []},
                headers=hdrs,
            )
        # Lists a folder only when it is on the approved list (path-containment.md #4).
        # BEFORE isdir, not after: answering "Folder not found" for an absent path
        # and "not approved" for a present one is a directory-existence oracle for
        # the whole disk. next_counter already returns a constant for exactly this
        # reason; these three routes contradicted it until the round-3 review.
        if not _pix_folder_allowed(folder):
            return web.json_response(
                {"ok": False, "message": _pix_denied_message(folder), "denied": True, "files": []},
                headers=hdrs,
            )
        if not folder or not os.path.isdir(folder):
            return web.json_response({"ok": False, "message": "Folder not found.", "files": []}, headers=hdrs)
        real = os.path.realpath(folder)
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            files = await loop.run_in_executor(None, _lif_list_files, real, recursive)
        except Exception as e:
            return web.json_response({"ok": False, "message": f"Could not read folder: {e}", "files": []}, headers=hdrs)
        return web.json_response({"ok": True, "folder": real, "files": files}, headers=hdrs)

    def _lif_make_thumb(full):
        """Decode + downscale one image to a small JPEG. Blocking - run off the loop.

        The bit-depth branches MUST match nodes/node_load_images_folder.py::_load_one
        exactly. This is the gallery the user hand-picks images in, so a thumbnail
        that disagrees with what the node will actually load is worse than a wrong
        thumbnail on its own: they are choosing from pictures that do not describe
        the output. A 16-bit greyscale file measured 253.98 (4 unique values) here
        against the loader's correct 127.66 - i.e. a white square. See
        .claude/patterns/load-image.md #21 for why convert CLAMPS and why the
        .convert("I") is required before .point().
        """
        from PIL import ImageOps
        im = Image.open(full)
        im = ImageOps.exif_transpose(im)
        if im.mode == "I":
            im = im.point(lambda px: px * (1 / 255))
        elif im.mode in _I16_MODES:
            im = im.convert("I").point(lambda px: px * (1 / 257))
        im = im.convert("RGB")
        im.thumbnail((192, 192))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=80)
        return buf.getvalue()


    @routes.get("/xh/api/load_images_folder/thumb")
    async def api_lif_thumb(request):
        """Serve a small JPEG thumbnail for one image. ?path=<folder>&file=<rel>"""
        folder = request.query.get("path", "")
        rel = request.query.get("file", "")
        if not _pix_prescreen(folder):      # before isdir - see the list route
            return web.Response(status=403)
        # The _is_path_under below only proves the file sits inside the folder the
        # CALLER named, which is no containment at all while `folder` is arbitrary
        # (2026-08-03, ComfyUI-Manager PR #3118: this served any image-extension
        # file on the host back as a JPEG). Root the folder first, then keep the
        # existing per-file check so `rel` still cannot climb out of it.
        # Ordered BEFORE isdir so 403-vs-404 is not an existence oracle (round-3).
        if not _pix_folder_allowed(folder):
            return web.Response(status=403)
        # `rel` comes from the request too, and os.path.join DISCARDS `folder` when
        # rel is absolute / a network path, so a rooted `rel` is refused up front.
        if _pix_rel_is_rooted(rel):
            return web.Response(status=403)
        if not folder or not rel or not os.path.isdir(folder):
            return web.Response(status=404)
        # Checked as the folder shows it, before resolving: a junction or symlink
        # the user placed INSIDE the folder is followed (2026-10-26, face folders
        # kept as junctions showed no thumbnails). The checked string and the
        # resolved one must be the SAME abspath on the REAL folder, or on Linux /
        # macOS "faces/../Documents" is judged inside and read outside (review).
        real_folder = os.path.realpath(folder)
        joined = os.path.abspath(os.path.join(real_folder, rel))
        full = os.path.realpath(joined)
        if (
            not _is_path_under(joined, real_folder, follow_links=True)
            or not os.path.isfile(full)
            or not _lif_is_image(os.path.basename(full))
        ):
            return web.Response(status=403)
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            # PIL decode/resize/encode can be slow for big images - keep it off the
            # aiohttp event loop so other ComfyUI requests don't stall.
            body = await loop.run_in_executor(None, _lif_make_thumb, full)
            return web.Response(
                body=body,
                content_type="image/jpeg",
                headers={"Cache-Control": "no-cache"},
            )
        except Exception:
            return web.Response(status=404)

    @routes.get("/xh/api/load_images_folder/browse")
    async def api_lif_browse(request):
        """Navigate the server filesystem for the in-app folder picker, WITHIN the
        approved folders only. ?path=<dir> (empty = list the approved roots).
        Returns {ok, path, parent, dirs:[{name, path, images}]}; images = -1 means
        'not counted' (skipped for folders with many sub-folders, to stay fast).

        Lists only folders inside the approved list (path-containment.md #4), and a
        network path is screened by its text before any filesystem call (#5).

        The empty-path branch used to enumerate drive letters; it now lists the
        approved roots instead. That is both the containment AND a better landing
        screen - the user sees "output", "D:\\MyArt" rather than every drive. To add
        somewhere new they use the Browse button, which opens the real OS dialog and
        approves whatever they pick (see nodes/_path_guard)."""
        path = request.query.get("path", "")
        try:
            if not path:
                dirs = []
                seen = set()
                for d in list(_pix_comfy_roots()) + list(_pix_remembered_folders()):
                    try:
                        if not d or not os.path.isdir(d):
                            continue
                        key = os.path.normcase(os.path.realpath(d))
                        if key in seen:
                            continue
                        seen.add(key)
                    except OSError:
                        continue
                    dirs.append({"name": os.path.basename(d.rstrip("\\/")) or d,
                                 "path": d, "images": -1})
                return web.json_response({"ok": True, "path": "", "parent": None, "dirs": dirs})

            if not _pix_prescreen(path):    # before isdir - see the list route
                return web.json_response(
                    {"ok": False, "message": _pix_denied_message(path), "denied": True, "dirs": []}
                )
            # allowed-check BEFORE isdir, so the reply cannot distinguish "absent"
            # from "present but not yours" for any path on the disk (round-3).
            if not _pix_folder_allowed(path):
                return web.json_response(
                    {"ok": False, "message": _pix_denied_message(path), "denied": True, "dirs": []}
                )
            if not os.path.isdir(path):
                return web.json_response({"ok": False, "message": "Folder not found.", "dirs": []})
            real = os.path.realpath(path)
            parent = os.path.dirname(real)
            if parent == real:  # already at a drive / filesystem root
                parent = ""
            # Do not offer an "up" that would just be refused: once we are at the
            # top of an approved root, Up returns to the roots list ("") instead.
            if parent and not _pix_folder_allowed(parent):
                parent = ""

            subdirs = []
            try:
                for n in sorted(os.listdir(real), key=str.lower):
                    full = os.path.join(real, n)
                    if os.path.isdir(full):
                        subdirs.append((n, full))
            except OSError as e:
                return web.json_response({"ok": False, "message": f"Could not read folder: {e}", "dirs": []})

            # Only tally per-folder image counts when cheap (few sub-folders), so
            # browsing into e.g. C:\Windows doesn't stat hundreds of directories.
            do_count = len(subdirs) <= 60
            dirs = []
            for n, full in subdirs:
                cnt = -1
                if do_count:
                    try:
                        cnt = sum(1 for fn in os.listdir(full) if _lif_is_image(fn))
                    except OSError:
                        cnt = -1
                dirs.append({"name": n, "path": full, "images": cnt})
            return web.json_response({"ok": True, "path": real, "parent": parent, "dirs": dirs})
        except Exception as e:
            return web.json_response({"ok": False, "message": str(e), "dirs": []})

    import threading as _threading

    _LIF_DIALOG_LOCK = _threading.Lock()


    def _lif_dialog_available():
        """True if SOME native folder dialog tool exists for this platform."""
        import sys
        import shutil
        if sys.platform == "win32":
            return shutil.which("powershell") is not None
        if sys.platform == "darwin":
            return shutil.which("osascript") is not None
        return shutil.which("zenity") is not None or shutil.which("kdialog") is not None


    def _lif_dialog_windows(start_path):
        import subprocess
        # Show an invisible TopMost owner form, then open the folder dialog inside its
        # Shown event so it inherits the foreground (fixes "opens behind the browser").
        # Start path goes through an env var to avoid quoting issues.
        ps = (
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$r='';"
            "$o=New-Object System.Windows.Forms.Form;"
            "$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.FormBorderStyle='None';"
            "$o.Width=1;$o.Height=1;$o.Opacity=0;$o.StartPosition='CenterScreen';"
            "$o.Add_Shown({"
            "$o.Activate();"
            "$d=New-Object System.Windows.Forms.FolderBrowserDialog;"
            "$d.Description='Choose a folder of images';$d.ShowNewFolderButton=$false;"
            "if($env:LIF_START){try{$d.SelectedPath=$env:LIF_START}catch{}};"
            "if($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK){$script:r=$d.SelectedPath};"
            "$o.Close()"
            "});"
            "[void]$o.ShowDialog();"
            "[Console]::Out.Write($r)"
        )
        env = dict(os.environ)
        env["LIF_START"] = start_path or ""
        out = subprocess.run(
            ["powershell", "-NoProfile", "-STA", "-Command", ps],
            capture_output=True, text=True, timeout=300, env=env,
            creationflags=0x08000000,  # CREATE_NO_WINDOW (no console flash)
        )
        return (out.stdout or "").strip()


    def _lif_dialog_macos(start_path):
        import subprocess
        import re
        script = 'POSIX path of (choose folder with prompt "Choose a folder of images")'
        # Only seed the start location when it's a real dir whose path has no chars
        # that could end the AppleScript string literal (?path= comes from the
        # request, so it is checked here).
        if start_path and os.path.isdir(start_path) and re.match(r'^[^"\\\x00-\x1f]+$', start_path):
            script = (
                'POSIX path of (choose folder with prompt "Choose a folder of images" '
                f'default location POSIX file "{start_path}")'
            )
        try:
            out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=300)
            return (out.stdout or "").strip().rstrip("/") if out.returncode == 0 else ""
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return ""


    def _lif_dialog_linux(start_path):
        import shutil
        import subprocess
        start = start_path if (start_path and os.path.isdir(start_path)) else os.path.expanduser("~")
        if shutil.which("zenity"):
            try:
                out = subprocess.run(
                    ["zenity", "--file-selection", "--directory",
                     "--title=Choose a folder of images", f"--filename={start}/"],
                    capture_output=True, text=True, timeout=300,
                )
                return (out.stdout or "").strip() if out.returncode == 0 else ""
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass
        if shutil.which("kdialog"):
            try:
                out = subprocess.run(
                    ["kdialog", "--getexistingdirectory", start, "--title", "Choose a folder of images"],
                    capture_output=True, text=True, timeout=300,
                )
                return (out.stdout or "").strip() if out.returncode == 0 else ""
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass
        return ""


    def _lif_native_folder_dialog(start_path=""):
        """Open the native OS folder picker; return the chosen path, "" (cancelled),
        or None (busy - a dialog is already open). Runs in a thread (caller uses
        run_in_executor); only one at a time via the module lock."""
        if not _LIF_DIALOG_LOCK.acquire(blocking=False):
            return None  # a dialog is already open elsewhere -> caller falls back
        try:
            import sys
            if sys.platform == "win32":
                return _lif_dialog_windows(start_path)
            if sys.platform == "darwin":
                return _lif_dialog_macos(start_path)
            return _lif_dialog_linux(start_path)
        except Exception as e:
            print(f"[XHLoadImagesFolder] native folder dialog failed: {e}")
            return ""
        finally:
            try:
                _LIF_DIALOG_LOCK.release()
            except Exception:
                pass


    @routes.get("/xh/api/load_images_folder/pick_native")
    async def api_lif_pick_native(request):
        """Pop the native OS folder dialog on the ComfyUI host; return the chosen path.
        {ok:true, path} on pick; {ok:false, cancelled} on cancel; {ok:false,
        unavailable} when no native dialog tool exists (so the UI falls back)."""
        # A remote caller gets the SAME answer as a host with no dialog tool, on
        # purpose: `unavailable` is the signal the frontend already handles by
        # falling back to the in-app folder browser, which is the control a remote
        # user actually wants. An error would just be a dead end for them.
        if not _pix_peer_is_local(request):
            return web.json_response({"ok": False, "unavailable": True})
        if not _lif_dialog_available():
            return web.json_response({"ok": False, "unavailable": True})
        start = request.query.get("path", "")
        # ⚠ THE START PATH MUST ALREADY BE APPROVED. Not merely screened.
        #
        # The dialog approves the folder the person picks in it. `start` becomes
        # $d.SelectedPath, and FolderBrowserDialog RETURNS SelectedPath when OK is
        # clicked without navigating, so the dialog only ever opens on a folder
        # that is already approved (or at its default). Both real callers pass
        # either "" or an approved folder, so this costs nothing: the person
        # navigates to a new folder themselves, which is the flow anyway.
        if not (_pix_prescreen(start) and _pix_folder_allowed(start)):
            start = ""
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            path = await loop.run_in_executor(None, _lif_native_folder_dialog, start)
            if path is None:
                return web.json_response({"ok": False, "busy": True})
            if path and os.path.isdir(path):
                # THE approval point for the whole allowlist (see nodes/_path_guard).
                # A folder that came back from the native OS dialog was chosen by a
                # person at the keyboard: the selection and the OK click happen in
                # the operating system, outside anything a request can influence.
                # So this is the ONLY place allowed to call remember_folder. Never
                # call it from a route that takes the folder from the request body:
                # the approved list must only grow by a person's own pick.
                # Surface whether it actually persisted. If the write fails (read-only
                # user dir, AV lock, or a damaged config we refuse to clobber) and we
                # still answer plain ok, the node stores the folder, every Run then
                # says "click Browse and pick this folder once" - which they just did
                # - and there is no way out. Round-3 review finding 5.
                remembered = _pix_remember_folder(path)
                return web.json_response({"ok": True, "path": path, "remembered": bool(remembered)})
            return web.json_response({"ok": False, "cancelled": True})
        except Exception as e:
            return web.json_response({"ok": False, "message": str(e)})

    @routes.post("/xh/api/load_image/import")
    async def api_load_image_import(request):
        """Load Image XiaoHei + Mini: take one picture from an approved folder.

        Request JSON: {folder, file} - the folder the picker listed and the file's
        path inside it (the same pair the thumbnail route takes).
        Response JSON: {ok: true, name} where name is the input-folder name the node
        should hold, or {ok: false, message, denied?}.

        The picture is COPIED into input/xh_folders and the node holds that
        ordinary input name, so everything Load Image already does keeps working.
        JSON only: a cross-origin form cannot send it without a preflight that is
        never answered (registry-compliance.md #2c). Every value is checked; all
        of the containment lives in nodes/_folder_source.import_file, which the
        harness tests directly (path-containment.md): the folder must already be
        approved, and the copy can only land inside input/xh_folders.
        """
        hdrs = {"Cache-Control": "no-store"}
        if request.content_type != "application/json":
            return web.json_response({"ok": False, "message": "send JSON"}, status=415, headers=hdrs)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"ok": False, "message": "invalid JSON"}, status=400, headers=hdrs)
        if not isinstance(data, dict):        # request.json() can be ANY JSON value
            return web.json_response({"ok": False, "message": "invalid request"}, status=400, headers=hdrs)
        from .nodes._folder_source import import_file as _li_import_file
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            # A big picture on a slow disk takes a moment to copy: off the event loop.
            name, err = await loop.run_in_executor(None, _li_import_file, data.get("folder"), data.get("file"))
        except Exception as e:
            return web.json_response({"ok": False, "message": f"Could not take the picture: {e}"}, headers=hdrs)
        if err:
            return web.json_response({"ok": False, "message": err, "denied": "not approved" in err}, headers=hdrs)
        return web.json_response({"ok": True, "name": name}, headers=hdrs)

    return True
