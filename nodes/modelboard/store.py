"""台账读写：一个 index.json + 一个 previews 文件夹。"""

import json
import os
import threading

# 家族化迁移：data 就放在本子包目录（nodes/modelboard/data），直接取 __file__ 所在目录，
# 不再上溯两级——迁进主包后上溯会落到 nodes/，data 会找不到。
PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PLUGIN_DIR, "data")
PREVIEW_DIR = os.path.join(DATA_DIR, "previews")
INDEX_PATH = os.path.join(DATA_DIR, "index.json")
LIBRARY_PATH = os.path.join(DATA_DIR, "library.json")

_lock = threading.RLock()
_index = None
_library = None
_library_mtime = -1.0

def blank():
    """每一条都要独立的对象，别让多条共享同一个 tags 列表。"""
    return {
        "tags": [],
        "note": "",
        "fav": False,
        "url": "",       # 下载链接（夸克网盘等外链），只存文字不下载
        "preview": "",   # 用户上传的预览图文件名，存在 data/previews 下
        "auto": "",      # 扫盘时自动发现的同名预览图（绝对路径）
        "size": 0,
        "mtime": 0,
    }


DEFAULT_ENTRY = blank()


def ensure_dirs():
    os.makedirs(PREVIEW_DIR, exist_ok=True)


def load():
    global _index
    with _lock:
        if _index is not None:
            return _index
        ensure_dirs()
        _index = {}
        try:
            with open(INDEX_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                _index = data
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"[XiaoHei-ModelBoard] 台账读取失败，按空台账处理：{e}")
        return _index


def save():
    with _lock:
        ensure_dirs()
        tmp = INDEX_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(load(), f, ensure_ascii=False, indent=1)
        os.replace(tmp, INDEX_PATH)


def entry(key):
    idx = load()
    e = idx.get(key)
    if not isinstance(e, dict):
        e = blank()
        idx[key] = e
    for k, v in DEFAULT_ENTRY.items():
        if k not in e:
            e[k] = list(v) if isinstance(v, list) else v
    return e


def has(key):
    return key in load()


def library():
    """资源库：只读，按文件修改时间缓存一次。

    结构和 index.json 不同：资源库的键不是磁盘路径，而是「资源」（一个链接
    可能对应一个文件，也可能对应一个整包里的多个文件），所以单独一个文件。
    """
    global _library, _library_mtime
    with _lock:
        try:
            m = os.path.getmtime(LIBRARY_PATH)
        except OSError:
            return {"version": 1, "groups": []}
        if _library is not None and m == _library_mtime:
            return _library
        try:
            with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            _library = data if isinstance(data, dict) else {"version": 1, "groups": []}
            _library_mtime = m
        except Exception as e:
            print(f"[XiaoHei-ModelBoard] 资源库读取失败，按空资源库处理：{e}")
            _library = {"version": 1, "groups": []}
            _library_mtime = m
        return _library


def migrate_keys(old_prefix, new_prefix, old_dir="", new_dir=""):
    """把标注数据里以 old_prefix 开头的一批 key 迁到 new_prefix。

    磁盘上文件夹改名以后，key（相对路径）跟着变，标签备注收藏都绑在 key 上，
    不迁就等于全丢。返回 [(老 key, 新 key)]，调用方拿它继续处理预览图。
    """
    with _lock:
        idx = load()
        moved = []
        for k in list(idx.keys()):
            if not k.startswith(old_prefix + "/"):
                continue
            nk = new_prefix + k[len(old_prefix):]
            if nk in idx:
                continue                  # 新 key 已经有人占了，别覆盖别人标注
            e = idx.pop(k)
            auto = e.get("auto") or ""
            if old_dir and new_dir and auto and auto.lower().startswith(old_dir.lower()):
                e["auto"] = new_dir + auto[len(old_dir):]   # 同名预览图的绝对路径跟着挪
            idx[nk] = e
            moved.append((k, nk))
        if moved:
            save()
        return moved


def migrate_library_keys(old_prefix, new_prefix):
    """资源库里记的文件 key 也要跟着改，不然改名后「已装」标记全变未装。"""
    global _library, _library_mtime
    with _lock:
        lib = library()
        moved = 0
        for g in (lib.get("groups") or []):
            for e in (g.get("entries") or []):
                files = e.get("files") or []
                for i, k in enumerate(files):
                    if isinstance(k, str) and k.startswith(old_prefix + "/"):
                        files[i] = new_prefix + k[len(old_prefix):]
                        moved += 1
        if moved:
            tmp = LIBRARY_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(lib, f, ensure_ascii=False, indent=1)
            os.replace(tmp, LIBRARY_PATH)
            _library_mtime = -1.0
        return moved

