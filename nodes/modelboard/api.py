"""HTTP 接口：6 个核心 + 1 个重新扫描。

GET  /xh_mb/types     -> 类型清单与数量
GET  /xh_mb/list      -> 模型列表（按类型 / 关键词 / 收藏过滤）
GET  /xh_mb/library   -> 资源库（网盘链接与归属，标出哪些已装）
POST /xh_mb/meta      -> 保存标签、备注、收藏
GET  /xh_mb/image     -> 取预览图（用户上传的优先，其次同名自动图）
POST /xh_mb/image     -> 上传预览图（raw body 直接传字节，避免 multipart 版本兼容问题）
POST /xh_mb/rescan    -> 强制重扫
"""

import asyncio
import hashlib
import os
import re
import time

from aiohttp import web

from . import scanner, store

ROUTE_PREFIX = "/xh_mb"
CACHE_TTL = 600          # 秒，超过就自动重扫一次
MAX_UPLOAD = 10 * 1024 * 1024
OK_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MAX_URL_LEN = 2000

# 从粘贴的文本里抠出第一个 http(s) 链接（夸克分享文案常夹着说明和提取码）
_URL_RE = re.compile(r"https?://[^\s\"'<>，。、；：）)】\r\n]+", re.I)
# Windows 文件名不能带的字符：改文件夹名时先挡掉，省得给系统报错
_BAD_NAME = re.compile(r'[\\/:*?"<>|\r\n\t]')

_snapshot = {}           # key -> scan info
_snapshot_ts = 0.0
_running = False         # 正在扫盘的标记，避免并发重复扫
_registered = False
_SHELL32 = None          # ctypes 版 shell32，第一次定位时懒加载


def _clean_url(raw):
    """把用户粘贴的内容收成一个可用链接。空字符串表示清空。

    支持直接贴链接，也支持贴整段夸克分享文案（自动抠出里面的 http/https 地址）。
    不是 http(s) 的一律视为无效，返回 None 让调用方报错。
    """
    text = str(raw or "").strip()
    if not text:
        return ""
    m = _URL_RE.search(text)
    if not m:
        return None
    url = m.group(0).strip().rstrip(".,;:!?)]}")
    if len(url) > MAX_URL_LEN:
        return None
    return url


def _merge(scan_chars):
    """把扫盘结果并进台账，保留用户标注；不存在的条目只隐藏不删除。"""
    idx = store.load()
    changed = False
    for key, info in scan_chars.items():
        e = idx.get(key)
        if not isinstance(e, dict):
            e = store.blank()
            idx[key] = e
            changed = True
        for k, v in store.DEFAULT_ENTRY.items():
            if k not in e:
                e[k] = list(v) if isinstance(v, list) else v
                changed = True
        if e.get("size") != info["size"] or e.get("mtime") != info["mtime"]:
            e["size"] = info["size"]
            e["mtime"] = info["mtime"]
            changed = True
        if (e.get("auto") or "") != info["auto"]:
            e["auto"] = info["auto"]
            changed = True
    if changed:
        store.save()
    return idx


def _public(key, info, e):
    prev = (e.get("preview") or "").strip()
    auto = (e.get("auto") or "").strip()
    has_img = False
    img_v = int(info.get("mtime") or 0)
    if prev:
        p = os.path.join(store.PREVIEW_DIR, os.path.basename(prev))
        if os.path.isfile(p):
            has_img = True
            img_v = int(os.stat(p).st_mtime)
    if not has_img and auto and os.path.isfile(auto):
        has_img = True
        img_v = int(os.stat(auto).st_mtime)
    return {
        "key": key,
        "type": info["type"],
        "type_label": info["type_label"],
        "name": info["name"],
        "rel": info["rel"],
        "size": info["size"],
        "mtime": info["mtime"],
        "abs": info["path"],
        "dirrel": info["rel"].rsplit("/", 1)[0] if "/" in info["rel"] else "",
        "tags": [str(t) for t in (e.get("tags") or [])],
        "note": e.get("note") or "",
        "fav": bool(e.get("fav")),
        "url": e.get("url") or "",
        "has_img": has_img,
        "img_v": img_v,
    }


async def _ensure(force=False):
    global _snapshot, _snapshot_ts, _running
    if (not force) and _snapshot and (time.time() - _snapshot_ts) < CACHE_TTL:
        return _snapshot
    if _running:
        # 已经有人在扫，等它结束
        for _ in range(120):
            await asyncio.sleep(0.5)
            if not _running:
                break
        return _snapshot
    _running = True
    try:
        chars = await asyncio.get_running_loop().run_in_executor(None, scanner.scan)
        _merge(chars)
        _snapshot = chars
        _snapshot_ts = time.time()
    finally:
        _running = False
    return _snapshot


def _node(path, name):
    return {"name": name, "path": path, "count": 0, "dirs": {}}


def _build_tree(items, only_keys=None):
    """把 rel 路径拆成 类型 → 子目录 → 更深子目录 的树。

    only_keys 给定时只做这些类型（「未归类」那批用）。
    """
    roots = {}
    for info in items.values():
        t = info["type"]
        if only_keys is not None and t not in only_keys:
            continue
        if t not in roots:
            roots[t] = _node("", scanner.TYPE_LABELS.get(t, t))
        roots[t]["count"] += 1
        parts = info["rel"].split("/")[:-1]
        cur = roots[t]
        acc = []
        for p in parts:
            acc.append(p)
            cur = cur["dirs"].setdefault(p, _node("/".join(acc), p))
            cur["count"] += 1

    def ser(node):
        rows = []
        for name in sorted(node["dirs"].keys(), key=lambda x: x.lower()):
            child = node["dirs"][name]
            rows.append({
                "name": child["name"],
                "path": child["path"],
                "count": child["count"],
                "dirs": ser(child),
            })
        return rows

    out = []
    seen = set()
    for tkey, _label, _path in scanner.OFFICIAL_MODEL_TYPES:
        node = roots.get(tkey)
        if not node:
            continue
        seen.add(tkey)
        out.append({
            "key": tkey,
            "label": node["name"],
            "path": scanner.OFFICIAL_PATHS.get(tkey, ""),
            "count": node["count"],
            "dirs": ser(node),
        })
    # 非官方类型（「未归类」那批）排在官方之后
    for tkey in sorted(roots.keys(), key=lambda x: x.lower()):
        if tkey in seen:
            continue
        node = roots[tkey]
        meta = (scanner.EXTRA_TYPES or {}).get(tkey) or {}
        out.append({
            "key": tkey,
            "label": node["name"],
            "path": meta.get("path", ""),
            "count": node["count"],
            "dirs": ser(node),
        })
    return out


def _count_types(items):
    counts = {}
    for it in items.values():
        counts[it["type"]] = counts.get(it["type"], 0) + 1
    return counts


def _library_payload():
    """把资源库和当前扫盘结果对齐：每条资源标出哪些文件已装。

    返回 (分组, 条目, 本地key->条目) 三份数据。第三种给本地详情页显示「来源」
    用，优先取单文件条目（整包条目只是兜底）。
    """
    lib = store.library()
    groups = []
    entries = []
    map_file = {}
    map_any = {}
    for g in (lib.get("groups") or []):
        rows = []
        for e in (g.get("entries") or []):
            eid = e.get("id") or ""
            ename = e.get("name") or ""
            files = []
            inst = 0
            total_size = 0
            for k in (e.get("files") or []):
                info = _snapshot.get(k)
                ok = info is not None
                size = int((info or {}).get("size") or 0)
                if ok:
                    inst += 1
                    total_size += size
                files.append({
                    "key": k,
                    "name": k.rsplit("/", 1)[-1],
                    "installed": ok,
                    # 没装的文件拿不到扫盘信息，就用 key 前缀（官方类型 key）兜底，
                    # 这样资源库才能按官方安装目录归类
                    "type": (info or {}).get("type") or k.split("/", 1)[0],
                    "type_label": (info or {}).get("type_label") or scanner.TYPE_LABELS.get(k.split("/", 1)[0], k.split("/", 1)[0]),
                    "size": size,
                })
                map_any.setdefault(k, (eid, ename))
                if (e.get("kind") or "file") == "file":
                    map_file.setdefault(k, (eid, ename))
            rows.append({
                "id": eid,
                "name": ename,
                "group": g.get("id") or "",
                "group_name": g.get("name") or "",
                "kind": e.get("kind") or "file",
                "url": e.get("url") or "",
                "code": e.get("code") or "",
                "note": e.get("note") or "",
                "files": files,
                "total": len(files),
                "inst": inst,
                "miss": len(files) - inst,
                "size": total_size,
            })
        if not rows:
            continue
        groups.append({
            "id": g.get("id") or "",
            "name": g.get("name") or "",
            "count": len(rows),
            "files": sum(r["total"] for r in rows),
            "files_inst": sum(r["inst"] for r in rows),
        })
        entries.extend(rows)
    for k, v in map_any.items():
        map_file.setdefault(k, v)
    return groups, entries, map_file


# ---------------- 打开 / 定位 到资源管理器 ----------------
# 逻辑照 Comfyui-XiaoHei 的工作流浏览器（/xh/workflows/openfolder 与 /reveal）。
# 根因：从 ComfyUI 后端进程起 explorer，Windows 会把新窗口排在当前前台窗口
#      （= ComfyUI 浏览器）后面，os.startfile 只管打开、不管 Z 序。
# 修法：打开前抓顶层窗口快照 → 打开后轮询找新窗口（已开过就按文件夹名匹配）
#      → SW_RESTORE + AttachThreadInput（绕开前台锁）+ SetForegroundWindow。
# 全程在 executor 线程里跑，不阻塞 aiohttp 事件循环。

def _win_top_windows():
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    Proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    u.EnumWindows.argtypes = [Proc, wintypes.LPARAM]
    u.EnumWindows.restype = wintypes.BOOL
    u.IsWindowVisible.argtypes = [wintypes.HWND]
    u.IsWindowVisible.restype = wintypes.BOOL
    u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    u.GetWindowTextLengthW.restype = ctypes.c_int
    u.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    u.GetWindowTextW.restype = ctypes.c_int
    out = {}

    def cb(hwnd, _lp):
        if u.IsWindowVisible(hwnd):
            n = u.GetWindowTextLengthW(hwnd)
            if n:
                buf = ctypes.create_unicode_buffer(n + 1)
                u.GetWindowTextW(hwnd, buf, n + 1)
                out[hwnd] = buf.value
        return True

    u.EnumWindows(Proc(cb), 0)
    return out


def _win_is_explorer(hwnd):
    """只认真正的资源管理器窗口（class = CabinetWClass）。
    别用标题匹配：Edge 开着同名网页会被误判。"""
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    u.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    u.GetClassNameW.restype = ctypes.c_int
    buf = ctypes.create_unicode_buffer(256)
    u.GetClassNameW(hwnd, buf, 256)
    return buf.value == "CabinetWClass"


def _win_bring_front(hwnd):
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    u.SetForegroundWindow.argtypes = [wintypes.HWND]
    u.SetForegroundWindow.restype = wintypes.BOOL
    u.BringWindowToTop.argtypes = [wintypes.HWND]
    u.GetForegroundWindow.restype = wintypes.HWND
    u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    u.GetWindowThreadProcessId.restype = wintypes.DWORD
    k32 = ctypes.windll.kernel32       # GetCurrentThreadId 在 kernel32，不在 user32
    k32.GetCurrentThreadId.restype = wintypes.DWORD
    u.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    u.AttachThreadInput.restype = wintypes.BOOL
    u.keybd_event.argtypes = [ctypes.c_ubyte, ctypes.c_ubyte, ctypes.c_uint, ctypes.c_void_p]
    u.ShowWindow(hwnd, 9)              # SW_RESTORE，最小化也能拉起来
    fg = u.GetForegroundWindow()
    tid_fg = u.GetWindowThreadProcessId(fg, None)
    tid_me = k32.GetCurrentThreadId()
    attached = bool(tid_fg and tid_fg != tid_me and u.AttachThreadInput(tid_me, tid_fg, True))
    try:
        u.BringWindowToTop(hwnd)
        if u.SetForegroundWindow(hwnd):
            return True
        # 前台锁没解开：模拟一次 Alt 键松开，再试一次
        u.keybd_event(0x12, 0, 0, 0)   # VK_MENU down
        u.keybd_event(0x12, 0, 2, 0)   # KEYEVENTF_KEYUP
        if u.SetForegroundWindow(hwnd):
            return True
        # 还是被拒：SwitchToThisWindow 走 Alt+Tab 那条老路，后台进程也常能切成功
        try:
            u.SwitchToThisWindow.argtypes = [wintypes.HWND, ctypes.c_bool]
            u.SwitchToThisWindow.restype = None
            u.SwitchToThisWindow(hwnd, True)
        except Exception:                         # noqa: BLE001
            pass
        return bool(u.SetForegroundWindow(hwnd))
    finally:
        if attached:
            u.AttachThreadInput(tid_me, tid_fg, False)


def _fg_hwnd():
    """当前前台窗口句柄。"""
    try:
        import ctypes
        from ctypes import wintypes
        u = ctypes.windll.user32
        u.GetForegroundWindow.restype = wintypes.HWND
        return int(u.GetForegroundWindow() or 0)
    except Exception:                             # noqa: BLE001
        return 0


def _hold_front(hwnd, prev_fg, seconds=4.0, step=0.2):
    """置前后守一会儿前台。

    Windows 上后台进程抢来的前台，常常一两秒就被原来的窗口（ComfyUI）拿回去，
    用户看到的就是「闪一下又躲回去」。根因是 AttachThreadInput 一解绑，系统就把
    前台还给原来那个输入线程。这里干脆在保护期内一直挂着附着，不让它解绑，
    顺便盯着：用户自己切到第三个窗口了就立刻让位，不跟人抢鼠标。
    """
    import threading
    import time as _t
    if not hwnd:
        return

    def _run():
        try:
            import ctypes
            from ctypes import wintypes
            u = ctypes.windll.user32
            k32 = ctypes.windll.kernel32
            u.GetForegroundWindow.restype = wintypes.HWND
            u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
            u.GetWindowThreadProcessId.restype = wintypes.DWORD
            u.SetForegroundWindow.argtypes = [wintypes.HWND]
            u.SetForegroundWindow.restype = wintypes.BOOL
            u.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
            u.AttachThreadInput.restype = wintypes.BOOL
            k32.GetCurrentThreadId.restype = wintypes.DWORD

            tid_me = k32.GetCurrentThreadId()
            tid_fg = u.GetWindowThreadProcessId(prev_fg, None) if prev_fg else 0
            attached = bool(tid_fg and tid_fg != tid_me
                            and u.AttachThreadInput(tid_me, tid_fg, True))
            try:
                end = _t.time() + seconds
                while _t.time() < end:
                    _t.sleep(step)
                    cur = int(u.GetForegroundWindow() or 0)
                    if cur == hwnd:
                        continue
                    if cur != prev_fg:       # 用户切到别处了，让位
                        return
                    u.SetForegroundWindow(hwnd)
            finally:
                if attached:
                    u.AttachThreadInput(tid_me, tid_fg, False)
        except Exception:                     # noqa: BLE001
            return

    threading.Thread(target=_run, daemon=True).start()


def _resolve_dir_abs(type_key, rel):
    """type_key + 相对子路径 → 磁盘上的绝对目录。

    同一个类型可能挂了多个 models 根（本地一份、共享库一份），挨个试。
    找不到返回空串。
    """
    try:
        bases = scanner._folder_paths_of(type_key)
    except Exception:                             # noqa: BLE001
        return ""
    parts = [p for p in str(rel or "").split("/") if p]
    if not parts:
        return ""
    for base in bases:
        cand = os.path.normpath(os.path.join(base, *parts))
        if os.path.isdir(cand):
            return cand
    return ""


def rename_folder(body):
    """改磁盘上的模型子文件夹名，并把标注数据跟着搬过去。

    body: {"type": "loras", "rel": "2511/人物", "name": "人物-新"}
    只允许改「某个类型目录下面的子目录」；顶层目录（loras 这种）是 ComfyUI 的
    官方 key，改了分类就全乱，直接拒绝。

    返回 (http_status, payload)。抽成纯同步函数是为了让本地 mock 也能跑同一份
    逻辑 —— 测试才不会测到另一套实现。
    """
    global _snapshot, _snapshot_ts                      # noqa: PLW0603
    body = body or {}
    type_key = str(body.get("type") or "").strip()
    rel = str(body.get("rel") or "").strip().strip("/")
    name = str(body.get("name") or "").strip()

    known = {t[0] for t in scanner.OFFICIAL_MODEL_TYPES}
    known |= set(scanner.EXTRA_TYPES.keys())
    known |= {info.get("type") for info in _snapshot.values() if info.get("type")}
    if type_key not in known:
        return 400, {"error": "类型不对"}
    if not rel:
        return 400, {"error": "顶层目录（loras、vae 这些）是 ComfyUI 的官方分类，不能改名；只能改它下面的子文件夹"}
    if ".." in rel.split("/") or "\\" in rel:
        return 400, {"error": "路径不对"}
    if not name:
        return 400, {"error": "名字不能空着"}
    if len(name) > 64:
        return 400, {"error": "名字太长了（最多 64 个字符）"}
    if _BAD_NAME.search(name):
        return 400, {"error": "名字里不能有 \\ / : * ? \" < > | 这些字符"}
    if name.endswith(".") or name in (".", ".."):
        return 400, {"error": "名字不能以点结尾"}

    old_abs = _resolve_dir_abs(type_key, rel)
    if not old_abs:
        return 404, {"error": "磁盘上找不到这个文件夹了，点一下「重新扫描」再试"}
    new_abs = os.path.join(os.path.dirname(old_abs), name)
    if os.path.normcase(new_abs) == os.path.normcase(old_abs):
        return 400, {"error": "名字没变"}
    if os.path.exists(new_abs):
        what = "文件" if os.path.isfile(new_abs) else "文件夹"
        return 409, {"error": f"同名的{what}已经存在，换个名字"}

    try:
        os.rename(old_abs, new_abs)
    except PermissionError:
        return 400, {"error": "改不动：这个文件夹正被占用（ComfyUI 可能正在读里面的模型），关掉加载再试"}
    except OSError as e:
        return 400, {"error": f"改不动：{e}"}

    old_prefix = f"{type_key}/{rel}"
    new_rel = rel.rsplit("/", 1)[0] + "/" + name if "/" in rel else name
    new_prefix = f"{type_key}/{new_rel}"

    moved = store.migrate_keys(old_prefix, new_prefix, old_abs, new_abs)
    lib_moved = store.migrate_library_keys(old_prefix, new_prefix)

    # 上传的预览图文件名是 key 的 sha1，key 变了要跟着改名，否则下次上传会留孤儿
    for ok, nk in moved:
        e = store.entry(nk)
        prev = e.get("preview") or ""
        if not prev:
            continue
        base = os.path.basename(prev)
        ext = os.path.splitext(base)[1] or ".png"
        oh = hashlib.sha1(ok.encode("utf-8")).hexdigest()[:16]
        nh = hashlib.sha1(nk.encode("utf-8")).hexdigest()[:16]
        if oh == nh:
            continue
        src = os.path.join(store.PREVIEW_DIR, oh + ext)
        if not os.path.isfile(src):
            src = os.path.join(store.PREVIEW_DIR, base)
            if not os.path.isfile(src):
                continue
        dst = os.path.join(store.PREVIEW_DIR, nh + ext)
        try:
            os.replace(src, dst)
            e["preview"] = "previews/" + nh + ext
        except OSError:
            pass
    if moved:
        store.save()

    _snapshot.clear()
    _snapshot_ts = 0.0                                  # 下次请求重扫，分类树跟着变
    print(f"[XiaoHei-ModelBoard] 文件夹改名 {old_prefix} → {new_prefix}，迁移标注 {len(moved)} 条")
    return 200, {
        "ok": True,
        "old": old_prefix,
        "new": new_prefix,
        "old_abs": old_abs,
        "abs": new_abs,
        "moved": len(moved),
        "lib_moved": lib_moved,
    }


def _shell_reveal(path):
    """用系统 shell 接口「打开父目录并选中该项」。

    比 `explorer /select,` 温和：父目录已经开着时，它在原窗口里选中该文件，
    不会像 /select 那样在 Win11 上再开一个内容和原来一模一样的窗口。
    成功返回 True。
    """
    if os.name != "nt":
        return False
    import ctypes
    from ctypes import wintypes

    global _SHELL32
    try:
        s = _SHELL32
        if s is None:
            s = ctypes.windll.shell32
            s.SHParseDisplayName.argtypes = [
                wintypes.LPCWSTR,
                ctypes.c_void_p,
                ctypes.POINTER(ctypes.c_void_p),
                ctypes.c_ulong,
                ctypes.POINTER(ctypes.c_ulong),
            ]
            s.SHParseDisplayName.restype = ctypes.c_long
            s.SHOpenFolderAndSelectItems.argtypes = [
                ctypes.c_void_p,
                ctypes.c_uint,
                ctypes.c_void_p,
                ctypes.c_ulong,
            ]
            s.SHOpenFolderAndSelectItems.restype = ctypes.c_long
            _SHELL32 = s
        ole = ctypes.windll.ole32
        ole.CoInitialize(None)                    # executor 线程可能没进过 COM
        pidl = ctypes.c_void_p()
        sfgao = ctypes.c_ulong()
        hr = s.SHParseDisplayName(path, None, ctypes.byref(pidl), 0, ctypes.byref(sfgao))
        if hr != 0:
            return False
        try:
            # cidl=0 / apidl=NULL：pidl 指向的就是要显示并选中的那一项
            hr = s.SHOpenFolderAndSelectItems(pidl, 0, None, 0)
        finally:
            ole.CoTaskMemFree(pidl)
        return hr == 0
    except Exception as e:                        # noqa: BLE001
        print(f"[XiaoHei-ModelBoard] shell 定位失败，退回 explorer：{e}")
        return False


def _open_and_focus(folder, select=None):
    """打开文件夹（select 非空则选中该文件），并把资源管理器窗口拉到最前。"""
    import subprocess
    import sys
    if os.name != "nt":
        opener = "open" if sys.platform == "darwin" else "xdg-open"
        subprocess.Popen([opener, folder])
        return
    before = _win_top_windows()
    prev_fg = _fg_hwnd()
    if select:
        if not _shell_reveal(os.path.normpath(select)):
            subprocess.Popen(["explorer", "/select,", os.path.normpath(select)])
    else:
        os.startfile(folder)                      # noqa: S606
    target = os.path.basename(os.path.normpath(folder)).lower()
    try:
        hwnd = None
        for _ in range(16):                       # 最多等 4 秒
            time.sleep(0.25)
            after = _win_top_windows()
            fresh = [h for h in after if h not in before and after[h] and _win_is_explorer(h)]
            if fresh:
                hwnd = fresh[-1]
                break
            # 同一个目录已经开着时不会出新窗口，按标题精确匹配
            same = [h for h in after if after[h] and _win_is_explorer(h)
                    and (after[h].lower() == target or after[h].lower().startswith(target + " - "))]
            if same:
                hwnd = same[-1]
                break
        if hwnd:
            ok = _win_bring_front(hwnd)
            _hold_front(hwnd, prev_fg)
            print(f"[XiaoHei-ModelBoard] 资源管理器置前 hwnd={hwnd} 结果={ok}")
        else:
            print("[XiaoHei-ModelBoard] 没找到资源管理器窗口，只完成打开")
    except Exception as e:                        # noqa: BLE001
        print(f"[XiaoHei-ModelBoard] 资源管理器置前失败（不影响打开）: {e}")


async def _preview_file(key):
    """返回该模型当前可用的预览图绝对路径，没有就返回空串。"""
    if key not in _snapshot:
        return ""
    e = store.entry(key)
    prev = (e.get("preview") or "").strip()
    if prev:
        p = os.path.join(store.PREVIEW_DIR, os.path.basename(prev))
        if os.path.isfile(p):
            return p
    auto = (e.get("auto") or "").strip()
    if auto and os.path.isfile(auto):
        return auto
    return ""


def register():
    global _registered
    if _registered:
        return
    try:
        from server import PromptServer
    except Exception as e:
        print(f"[XiaoHei-ModelBoard] 找不到 server 模块：{e}")
        return
    inst = getattr(PromptServer, "instance", None)
    if inst is None:
        print("[XiaoHei-ModelBoard] PromptServer 还没就绪，路由未注册")
        return
    routes = inst.routes

    @routes.get(f"{ROUTE_PREFIX}/types")
    async def api_types(request):
        items = await _ensure()
        counts = _count_types(items)
        types = []
        for type_key, cn_label, off_path in scanner.OFFICIAL_MODEL_TYPES:
            types.append({
                "key": type_key,
                "label": cn_label,
                "path": off_path,
                "official": True,
                "count": counts.get(type_key, 0),
            })
        extra = []
        for meta in (scanner.EXTRA_TYPES or {}).values():
            extra.append({
                "key": meta["key"],
                "label": meta["label"],
                "path": meta["path"],
                "official": False,
                "count": meta.get("count", 0),
            })
        tree = _build_tree(items)
        extra_tree = _build_tree(items, only_keys=set(scanner.EXTRA_TYPES.keys()))
        return web.json_response({
            "types": types,
            "extra": extra,
            "tree": tree,
            "extra_tree": extra_tree,
            "total": len(items),
        })

    @routes.get(f"{ROUTE_PREFIX}/list")
    async def api_list(request):
        items = await _ensure()
        want_type = (request.query.get("type") or "").strip()
        want_dir = (request.query.get("dir") or "").strip().strip("/")
        q = (request.query.get("q") or "").strip().lower()
        fav_only = request.query.get("fav") in ("1", "true", "yes")
        idx = store.load()
        _groups, _entries, libmap = _library_payload()
        out = []
        for key, info in items.items():
            if want_type and info["type"] != want_type:
                continue
            if want_dir:
                rel = info["rel"]
                if rel != want_dir and not rel.startswith(want_dir + "/"):
                    continue
            e = idx.get(key) or store.DEFAULT_ENTRY
            if fav_only and not e.get("fav"):
                continue
            if q:
                hay = " ".join([
                    info["name"].lower(), info["rel"].lower(),
                    " ".join([str(t) for t in (e.get("tags") or [])]).lower(),
                    (e.get("note") or "").lower(),
                ])
                if q not in hay:
                    continue
            out.append(_public(key, info, e))
        for row in out:
            lid, lname = libmap.get(row["key"], ("", ""))
            row["lib"] = lid
            row["lib_name"] = lname
        out.sort(key=lambda x: (not x["fav"], x["type"], x["rel"]))
        return web.json_response({"items": out, "total": len(out)})

    @routes.get(f"{ROUTE_PREFIX}/library")
    async def api_library(request):
        await _ensure()
        groups, entries, _map = _library_payload()
        return web.json_response({
            "groups": groups,
            "items": entries,
            "total": len(entries),
            "files": sum(e["total"] for e in entries),
            "files_inst": sum(e["inst"] for e in entries),
        })

    @routes.post(f"{ROUTE_PREFIX}/meta")
    async def api_meta(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "请求体不是合法 JSON"}, status=400)
        key = str(body.get("key") or "")
        if key not in _snapshot:
            return web.json_response({"ok": False, "error": "这个模型不在当前台账里"}, status=404)
        e = store.entry(key)
        if body.get("reset"):
            e["tags"] = []
            e["note"] = ""
            e["fav"] = False
        else:
            if "tags" in body:
                raw = body.get("tags") or []
                if isinstance(raw, str):
                    raw = raw.replace("，", ",").split(",")
                tags = []
                for t in raw:
                    t = str(t).strip()
                    if t and t not in tags:
                        tags.append(t)
                e["tags"] = tags[:12]
            if "note" in body:
                e["note"] = str(body.get("note") or "")[:2000]
            if "fav" in body:
                e["fav"] = bool(body.get("fav"))
            if "url" in body:
                u = _clean_url(body.get("url"))
                if u is None:
                    return web.json_response(
                        {"ok": False, "error": "链接要以 http:// 或 https:// 开头"}, status=400
                    )
                e["url"] = u
        store.save()
        info = _snapshot[key]
        return web.json_response({"ok": True, "item": _public(key, info, e)})

    @routes.get(f"{ROUTE_PREFIX}/image")
    async def api_image(request):
        key = (request.query.get("key") or "").strip()
        path = await _preview_file(key)
        if not path:
            return web.json_response({"ok": False, "error": "没有预览图"}, status=404)
        return web.FileResponse(path, headers={
            "Cache-Control": "no-store, max-age=0",
            "Content-Type": _mime(path),
        })

    @routes.post(f"{ROUTE_PREFIX}/image")
    async def api_image_upload(request):
        key = (request.query.get("key") or "").strip()
        if key not in _snapshot:
            return web.json_response({"ok": False, "error": "这个模型不在当前台账里"}, status=404)
        cl = request.content_length or 0
        if cl > MAX_UPLOAD:
            return web.json_response({"ok": False, "error": "图片超过 10MB"}, status=413)
        body = await request.read()
        if not body:
            return web.json_response({"ok": False, "error": "没收到图片数据"}, status=400)
        ext = os.path.splitext((request.query.get("ext") or "").strip().lower())[1]
        if ext not in OK_EXTS:
            ext = _sniff_ext(body) or ".png"
        store.ensure_dirs()
        name = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16] + ext
        dst = os.path.join(store.PREVIEW_DIR, name)
        with open(dst, "wb") as f:
            f.write(body)
        e = store.entry(key)
        old = e.get("preview") or ""
        if old and os.path.basename(old) != name:
            oldp = os.path.join(store.PREVIEW_DIR, os.path.basename(old))
            if os.path.isfile(oldp):
                try:
                    os.remove(oldp)
                except OSError:
                    pass
        e["preview"] = "previews/" + name
        store.save()
        return web.json_response({"ok": True, "img_v": int(os.stat(dst).st_mtime)})

    @routes.post(f"{ROUTE_PREFIX}/rescan")
    async def api_rescan(request):
        items = await _ensure(force=True)
        counts = _count_types(items)
        print(f"[XiaoHei-ModelBoard] 重扫完成，共 {len(items)} 个模型")
        return web.json_response({"ok": True, "total": len(items), "counts": counts})

    @routes.post(f"{ROUTE_PREFIX}/renamefolder")
    async def api_renamefolder(request):
        try:
            body = await request.json()
        except Exception:                                # noqa: BLE001
            return web.json_response({"error": "bad body"}, status=400)
        if not _snapshot:
            await _ensure()
        status, payload = rename_folder(body or {})
        return web.json_response(payload, status=status)
    def _resolve_item(body):
        """把前端传来的 key 换成磁盘上的绝对路径。
        只认扫盘快照里登记过的模型 —— 不接受任意路径，避免这个路由变成
        「谁都能让机器打开任意目录」的口子。"""
        key = str((body or {}).get("key", "") or "")
        info = _snapshot.get(key)
        if not info:
            return None, None, "模型不在当前扫描结果里，点一下「重新扫描」再试"
        full = os.path.normpath(info.get("path") or "")
        if not os.path.isfile(full):
            return None, None, "磁盘上找不到这个文件了（条目是旧的，重新扫描一下）"
        return full, os.path.dirname(full), ""

    @routes.post(f"{ROUTE_PREFIX}/openfolder")
    async def api_openfolder(request):
        """打开这个模型所在的文件夹。"""
        try:
            body = await request.json()
        except Exception:                                    # noqa: BLE001
            return web.json_response({"error": "bad body"}, status=400)
        if not _snapshot:
            await _ensure()                                  # 面板没打开过列表时先扫一遍
        full, folder, err = _resolve_item(body)
        if err:
            return web.json_response({"error": err}, status=404)
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _open_and_focus, folder, None)
        except Exception as e:                               # noqa: BLE001
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"ok": True, "folder": folder})

    @routes.post(f"{ROUTE_PREFIX}/reveal")
    async def api_reveal(request):
        """在资源管理器里定位并选中这个模型文件。"""
        try:
            body = await request.json()
        except Exception:                                    # noqa: BLE001
            return web.json_response({"error": "bad body"}, status=400)
        if not _snapshot:
            await _ensure()
        full, folder, err = _resolve_item(body)
        if err:
            return web.json_response({"error": err}, status=404)
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _open_and_focus, folder, full)
        except Exception as e:                               # noqa: BLE001
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"ok": True, "path": full})

    _registered = True
    print("[XiaoHei-ModelBoard] 路由已注册：/xh_mb/types /list /library /meta /image /rescan /openfolder /reveal /renamefolder")


def _mime(path):
    ext = os.path.splitext(path)[1].lower()
    return {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp",
    }.get(ext, "application/octet-stream")


def _sniff_ext(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:2] == b"BM":
        return ".bmp"
    return ""


# 家族化迁移：注册入口统一由主包 __init__.py 显式调用 api.register()，
# 这里不再在 import 时自动注册（避免与主包调用重复触发 + 日志打两遍）。
