"""扫盘：走 folder_paths，自动认 extra_model_paths.yaml 里挂的所有目录。

类型清单严格照 ComfyUI 官方 folder_paths.py 的 folder_names_and_paths 来（去掉
configs 这种装 yaml 的、也去掉 unet / clip 这种只是别名路径的），顺序与官方一致。
官方目录之外、但确实装着模型文件的第三方目录，单独扫成「未归类」。
"""

import os

import folder_paths

# 官方模型类型：顺序 = ComfyUI/folder_paths.py 里的定义顺序
# 第二列是界面上要显示的官方标准路径（别名路径用 · 连起来）
OFFICIAL_MODEL_TYPES = [
    ("checkpoints", "大模型 Checkpoint", "models/checkpoints"),
    ("loras", "LoRA", "models/loras"),
    ("vae", "VAE", "models/vae"),
    ("text_encoders", "文本编码器", "models/text_encoders · models/clip"),
    ("diffusion_models", "扩散模型", "models/unet · models/diffusion_models"),
    ("clip_vision", "视觉编码器", "models/clip_vision"),
    ("style_models", "风格模型", "models/style_models"),
    ("embeddings", "Embedding 嵌入", "models/embeddings"),
    ("diffusers", "Diffusers", "models/diffusers"),
    ("vae_approx", "VAE 近似", "models/vae_approx"),
    ("controlnet", "ControlNet", "models/controlnet · models/t2i_adapter"),
    ("gligen", "GLIGEN", "models/gligen"),
    ("upscale_models", "放大模型", "models/upscale_models"),
    ("latent_upscale_models", "潜空间放大模型", "models/latent_upscale_models"),
    ("hypernetworks", "Hypernetwork", "models/hypernetworks"),
    ("photomaker", "PhotoMaker", "models/photomaker"),
    ("classifiers", "分类器", "models/classifiers"),
    ("model_patches", "模型补丁", "models/model_patches"),
    ("audio_encoders", "音频编码器", "models/audio_encoders"),
    ("background_removal", "抠图 / 去背", "models/background_removal"),
    ("frame_interpolation", "插帧", "models/frame_interpolation"),
    ("geometry_estimation", "几何估计", "models/geometry_estimation"),
    ("optical_flow", "光流", "models/optical_flow"),
    ("detection", "检测", "models/detection"),
]

MODEL_TYPES = OFFICIAL_MODEL_TYPES
OFFICIAL_KEYS = {t[0] for t in OFFICIAL_MODEL_TYPES}
OFFICIAL_PATHS = {t[0]: t[2] for t in OFFICIAL_MODEL_TYPES}
TYPE_LABELS = {t[0]: t[1] for t in OFFICIAL_MODEL_TYPES}

# 上一次扫描发现的「未归类」目录：key -> {"key","label","path"}
EXTRA_TYPES = {}

MODEL_EXTS = {".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".sft", ".onnx"}

# 自动识别同名预览图时按顺序尝试
SIDE_CAR_SUFFIX = [".png", ".preview.png", ".jpg", ".preview.jpg", ".jpeg", ".webp"]


def _folder_paths_of(type_key):
    try:
        return list(folder_paths.get_folder_paths(type_key))
    except Exception:
        return []


def find_sidecar(full_path):
    """同名图：xxx.png / xxx.preview.png / xxx.jpg ...，找到就返回绝对路径。"""
    base = os.path.splitext(full_path)[0]
    for suf in SIDE_CAR_SUFFIX:
        cand = base + suf
        if os.path.isfile(cand):
            return cand
    return ""


def _real(path):
    return os.path.normcase(os.path.normpath(path))


# 官方目录在磁盘上的默认文件夹名（含别名路径）
DEFAULT_DIRS = {
    "text_encoders": ["text_encoders", "clip"],
    "diffusion_models": ["unet", "diffusion_models"],
    "controlnet": ["controlnet", "t2i_adapter"],
}


def _default_dirs(type_key):
    return DEFAULT_DIRS.get(type_key, [type_key])


def _walk_into(base_dir, type_key, type_label, seen_abs, chars):
    """把一个目录下的模型文件收进 chars，返回收进的数量。"""
    if not os.path.isdir(base_dir):
        return 0
    base_real = _real(base_dir)
    got = 0
    for root, _dirs, files in os.walk(base_dir):
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in MODEL_EXTS:
                continue
            full = os.path.normpath(os.path.join(root, fn))
            real = _real(full)
            if real in seen_abs:
                continue
            seen_abs.add(real)
            try:
                st = os.stat(full)
            except OSError:
                continue
            rel = os.path.relpath(full, base_dir).replace("\\", "/")
            key = f"{type_key}/{rel}"
            chars[key] = {
                "key": key,
                "type": type_key,
                "type_label": type_label,
                "name": fn,
                "rel": rel,
                "path": full,
                "dir": _real(root) != base_real,
                "size": int(st.st_size),
                "mtime": int(st.st_mtime),
                "auto": find_sidecar(full),
            }
            got += 1
    return got


def scan():
    """全量扫一遍，返回 {key: info}，key 形如 loras/人物/xxx.safetensors。

    先扫官方 24 类（同一文件被多个类型挂载时，先扫到的类型拿到它），
    再把官方路径之外的 models 子目录当作「未归类」补进来。
    """
    seen_abs = set()
    chars = {}
    covered = set()   # 已被官方类型覆盖的目录（含 unet / clip 这类别名路径）
    roots = set()     # models 根目录
    for type_key, type_label, _path in OFFICIAL_MODEL_TYPES:
        for base_dir in _folder_paths_of(type_key):
            if not os.path.isdir(base_dir):
                continue
            covered.add(_real(base_dir))
            roots.add(_real(os.path.dirname(os.path.normpath(base_dir))))
            _walk_into(base_dir, type_key, type_label, seen_abs, chars)

    # 有的共享库只挂了一部分类型（extra_model_paths.yaml 漏项），这里按官方默认
    # 文件夹名补一遍同名目录，免得它们被误判成「未归类」。
    for root in sorted(roots):
        for type_key, type_label, _path in OFFICIAL_MODEL_TYPES:
            for dname in _default_dirs(type_key):
                p = os.path.join(root, dname)
                if not os.path.isdir(p) or _real(p) in covered:
                    continue
                covered.add(_real(p))
                _walk_into(p, type_key, type_label, seen_abs, chars)

    EXTRA_TYPES.clear()
    for root in sorted(roots):
        try:
            names = sorted(os.listdir(root))
        except OSError:
            continue
        for name in names:
            p = os.path.join(root, name)
            if not os.path.isdir(p) or _real(p) in covered:
                continue
            got = _walk_into(p, name, name, seen_abs, chars)
            if got:
                EXTRA_TYPES[name] = {
                    "key": name,
                    "label": name,
                    "path": f"models/{name}",
                    "count": got,
                }
    return chars
