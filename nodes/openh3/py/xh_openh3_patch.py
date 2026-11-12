# SPDX-License-Identifier: MIT
# 派生自 ComfyUI-OpenH3-Regenerate2K (Songssx) 的 nodes.py
# Copyright (c) 2026 Songssx — 照搬其主 LoRA / Sharp 曲线 / sigma / 锁音频 逻辑，
# 唯一改动：去掉节点基类依赖，拆成纯函数 + XiaoHei 命名的 V3 节点壳。
"""Open-H3 Regenerate 2K 的核心算法层：主 LoRA 补丁、Sharp 曲线、sigma、锁音频。

本模块【不依赖任何第三方节点包】：只用 ComfyUI 官方核心里已有的
comfy.nested_tensor.NestedTensor 与 comfy.weight_adapter.lora.LoRAAdapter。
"""

import hashlib
import os

import torch
from safetensors import safe_open

import folder_paths
from comfy.nested_tensor import NestedTensor
from comfy.weight_adapter.lora import LoRAAdapter

# 「open_h3_regenerate」这个文件夹类别：官方约定把 sharp_curve_branches 放这儿。
# 但 VideoTools 那边也允许它待在 models/loras 根目录 —— 两条路都在下面兜住。
OPEN_H3_FOLDER = "open_h3_regenerate"
OPEN_H3_DIR = os.path.join(folder_paths.models_dir, OPEN_H3_FOLDER)
folder_paths.add_model_folder_path(OPEN_H3_FOLDER, OPEN_H3_DIR)

EXPECTED_CURVE_TABLE_SHA256 = "c02a6c11888297688c1e6278185ea1f947023acfc69f9003bbcdcec9a229a8e7"
EXPECTED_MAIN_MODULES = 312
EXPECTED_CURVE_MODULES = 50

SHARP_CURVE_FILE = "sharp_curve_branches.safetensors"
MAIN_LORA_FILE = "open_h3_regenerate_2k_lora.safetensors"

# 官方 Open-H3 的三段 sigma（0.909375 → 0.857 → 0.667 → 0）
SIGMAS = {
    3: (0.909375, 0.8571428571428571, 0.6666666666666666, 0.0),
    2: (0.7, 0.49411764705882355, 0.0),
}


# ── 文件定位 ────────────────────────────────────────────────────────────────
def _basename(name):
    return name.replace("\\", "/").rsplit("/", 1)[-1]


def _find_lora_file(filename):
    """在 models/loras 的**所有子目录**里找裸文件名（不只根目录）。

    原版只查根目录（get_full_path 只认根），用户把文件丢进 loras/H3/ 就选不到。
    这里放宽到递归 —— 返回 (显示名, 绝对路径)，显示名保留子目录前缀以便区分。
    """
    hits = []
    for root in folder_paths.get_folder_paths("loras"):
        try:
            # recursive_search 返回 (相对路径列表, 目录 mtime 字典)
            entries, _dirs = folder_paths.recursive_search(
                root, excluded_dir_names=[".git"])
        except Exception:
            continue
        for rel in entries:
            if _basename(rel) != filename:
                continue
            # 统一成反斜杠的相对名（与 get_filename_list 的格式一致）
            name = str(rel).replace("\\", "/")
            abs_path = os.path.join(root, rel)
            if os.path.isfile(abs_path):
                hits.append((name, abs_path))
    return hits


def _curve_candidates():
    """sharp_curve_branches 的候选：先 loras 目录（含子目录），再 open_h3_regenerate 目录。"""
    options = []
    for name, _path in _find_lora_file(SHARP_CURVE_FILE):
        options.append(name)
    try:
        for name in folder_paths.get_filename_list(OPEN_H3_FOLDER):
            if _basename(name) == SHARP_CURVE_FILE and name not in options:
                options.append(name)
    except KeyError:
        pass
    return options


def _main_lora_candidates():
    """主 LoRA 的候选：loras 目录（含子目录）+ open_h3_regenerate 目录。"""
    options = []
    for name, _path in _find_lora_file(MAIN_LORA_FILE):
        options.append(name)
    try:
        for name in folder_paths.get_filename_list(OPEN_H3_FOLDER):
            if _basename(name) == MAIN_LORA_FILE and name not in options:
                options.append(name)
    except KeyError:
        pass
    return options


def _resolve_lora_path(name):
    """把候选显示名解析成绝对路径（支持 loras 子目录 + open_h3_regenerate 目录）。"""
    if not name or name == "(missing)":
        raise FileNotFoundError(
            f"缺少模型文件。请把 {MAIN_LORA_FILE} 和 {SHARP_CURVE_FILE} "
            f"放到 models/loras/ 目录下（子目录也行）。"
        )
    path = folder_paths.get_full_path("loras", name)
    if path:
        return path
    try:
        path = folder_paths.get_full_path(OPEN_H3_FOLDER, name)
    except Exception:
        path = None
    if path:
        return path
    raise FileNotFoundError(f"找不到模型文件：{name}")


def _register_curve_folder_for_loras():
    """选了 loras 里的 sharp_curve 时，把 loras 目录注册成 open_h3_regenerate 类别，
    这样「放在 models/loras 根目录」和「放在 models/open_h3_regenerate」两种放法都通。"""
    for root in folder_paths.get_folder_paths("loras"):
        try:
            entries, _dirs = folder_paths.recursive_search(
                root, excluded_dir_names=[".git"])
        except Exception:
            continue
        for rel in entries:
            if _basename(rel) == SHARP_CURVE_FILE:
                folder_paths.add_model_folder_path(OPEN_H3_FOLDER, root, is_default=True)
                return


# ── 曲线表校验 ──────────────────────────────────────────────────────────────
def _curve_table_sha256(diffusion_model):
    table = getattr(diffusion_model, "adaln_t_table", None)
    if not torch.is_tensor(table) or tuple(table.shape) != (1025, 8):
        raise ValueError(
            "Open-H3 Regenerate 需要 MiniMax H3 的 1025×8 曲线基模型。"
            "请用 minimax_h3_ref2va_pruned_int8_convrot.safetensors。"
        )
    raw = table.detach().to(device="cpu", dtype=torch.float32).contiguous().numpy().tobytes()
    return hashlib.sha256(raw).hexdigest()


# ── LoRA 补丁装载 ──────────────────────────────────────────────────────────
def _adapter(a, b, loaded_keys):
    return LoRAAdapter(set(loaded_keys), (b, a, None, None, None, None))


def _core_module_name(source):
    if source.startswith("transformer_blocks."):
        return "blocks." + source[len("transformer_blocks."):]
    if source.startswith("token_refiner.refiner_blocks."):
        return "token_refiner.blocks." + source[len("token_refiner.refiner_blocks."):]
    raise ValueError(f"不支持的 Open-H3 模块：{source}")


def _main_target(source, b_rows, state_dict):
    for projection, index in (("to_q", 0), ("to_k", 1), ("to_v", 2)):
        suffix = f".attn.{projection}"
        if source.endswith(suffix):
            core = _core_module_name(source[:-len(suffix)] + ".attn.qkv_proj")
            key = f"diffusion_model.{core}.weight"
            if key not in state_dict or state_dict[key].shape[0] != b_rows * 3:
                raise ValueError(f"Open-H3 QKV 目标与当前 H3 模型不匹配：{key}")
            return (key, (0, index * b_rows, b_rows))

    replacements = {
        ".attn.to_out.0": ".attn.out_proj",
        ".ff.net.0.proj": ".mlp.fc1",
        ".ff.net.2": ".mlp.fc2",
    }
    for suffix, target_suffix in replacements.items():
        if source.endswith(suffix):
            core = _core_module_name(source[:-len(suffix)] + target_suffix)
            key = f"diffusion_model.{core}.weight"
            if key not in state_dict or state_dict[key].shape[0] != b_rows:
                raise ValueError(f"Open-H3 目标与当前 H3 模型不匹配：{key}")
            return key
    raise ValueError(f"不支持的 Open-H3 LoRA 目标：{source}")


def _load_main_patches(path, state_dict):
    patches = {}
    with safe_open(path, framework="pt", device="cpu") as handle:
        keys = set(handle.keys())
        roots = sorted(key[:-len(".lora_A.weight")] for key in keys if key.endswith(".lora_A.weight"))
        if len(roots) != EXPECTED_MAIN_MODULES:
            raise ValueError(
                f"Open-H3 主 LoRA 应当有 {EXPECTED_MAIN_MODULES} 个模块，实际找到 {len(roots)} 个。"
                f"\n你多半下的是 Kijai 切出来的 rank-16 refiner 片段（208 个），"
                f"那不是这个插件要的那份 —— 请下官方完整主 LoRA：{MAIN_LORA_FILE}"
            )
        for root in roots:
            b_key = root + ".lora_B.weight"
            if b_key not in keys or not root.startswith("transformer."):
                raise ValueError(f"Open-H3 LoRA 配对不完整：{root}")
            a_key = root + ".lora_A.weight"
            a = handle.get_tensor(a_key)
            b = handle.get_tensor(b_key)
            if a.ndim != 2 or b.ndim != 2 or a.shape[0] != b.shape[1]:
                raise ValueError(f"Open-H3 LoRA 形状不合法：{root}")
            source = root[len("transformer."):]
            target = _main_target(source, b.shape[0], state_dict)
            patches[target] = _adapter(a, b, (a_key, b_key))
    return patches


def _load_curve_patches(path, state_dict):
    patches = {}
    with safe_open(path, framework="pt", device="cpu") as handle:
        keys = set(handle.keys())
        roots = sorted(key[:-len(".curve_A.weight")] for key in keys if key.endswith(".curve_A.weight"))
        if len(roots) != EXPECTED_CURVE_MODULES:
            raise ValueError(
                f"Sharp 曲线应当有 {EXPECTED_CURVE_MODULES} 个分支，实际找到 {len(roots)} 个。"
            )
        for root in roots:
            a_key = root + ".curve_A.weight"
            b_key = root + ".curve_B.weight"
            if b_key not in keys or not root.startswith("transformer.transformer_blocks."):
                raise ValueError(f"Sharp 曲线配对不完整：{root}")
            a = handle.get_tensor(a_key)
            b = handle.get_tensor(b_key)
            block_path = root[len("transformer.transformer_blocks."):]
            block_index, suffix = block_path.split(".", 1)
            if suffix != "adaln_proj.linear" or a.shape[1] != 8:
                raise ValueError(f"不支持的 Sharp 曲线目标：{root}")
            target = f"diffusion_model.blocks.{block_index}.adaln_proj.linear.weight"
            if target not in state_dict or state_dict[target].shape[0] != b.shape[0]:
                raise ValueError(f"Sharp 曲线目标与当前 H3 模型不匹配：{target}")
            patches[target] = _adapter(a, b, (a_key, b_key))
    return patches


def patch_model_with_open_h3(model, main_lora, curve_branches, strength):
    """给 H3 模型挂上主 LoRA + 50 条 Sharp 曲线。返回 (patched_model, report)。"""
    diffusion_model = model.get_model_object("diffusion_model")
    curve_sha = _curve_table_sha256(diffusion_model)
    if curve_sha != EXPECTED_CURVE_TABLE_SHA256:
        raise ValueError(
            "当前 H3 模型的 AdaLN 曲线表与 Open-H3 Regenerate 不匹配："
            f"{curve_sha}。请用 minimax_h3_ref2va_pruned_int8_convrot.safetensors。"
        )

    _register_curve_folder_for_loras()
    patched = model.clone()
    state_dict = patched.model_state_dict()
    main_path = _resolve_lora_path(main_lora)
    curve_path = _resolve_lora_path(curve_branches)
    main_patches = _load_main_patches(main_path, state_dict)
    curve_patches = _load_curve_patches(curve_path, state_dict)
    main_loaded = patched.add_patches(main_patches, strength_patch=strength)
    curve_loaded = patched.add_patches(curve_patches, strength_patch=strength)
    if len(main_loaded) != EXPECTED_MAIN_MODULES or len(curve_loaded) != EXPECTED_CURVE_MODULES:
        raise ValueError(
            f"Open-H3 补丁挂载不完整：主={len(main_loaded)}/{EXPECTED_MAIN_MODULES}，"
            f"曲线={len(curve_loaded)}/{EXPECTED_CURVE_MODULES}"
        )
    report = (
        f"Open-H3 Regenerate 已挂载：{len(main_loaded)} 个主模块 + "
        f"{len(curve_loaded)} 条 Sharp 曲线；曲线表 {curve_sha[:12]}…；强度 {strength:g}"
    )
    return patched, report


def make_sigmas(steps):
    """官方 Open-H3 的 sigma 序列。"""
    return torch.tensor(SIGMAS[int(steps)], dtype=torch.float32)


def lock_audio_for_refine(av_latent):
    """给联合 AV latent 挂 noise_mask：画面全 1（要重绘）、声音全 0（锁死）。"""
    samples = av_latent.get("samples")
    if not getattr(samples, "is_nested", False):
        raise ValueError("Open-H3 精修需要 MiniMax H3 的视频+音频联合 latent")
    streams = samples.unbind()
    if len(streams) != 2 or streams[0].ndim != 5 or streams[0].shape[1] != 24:
        raise ValueError("Open-H3 精修需要「先视频、后音频」的 latent 流顺序")
    output = av_latent.copy()
    output["noise_mask"] = NestedTensor((torch.ones_like(streams[0]), torch.zeros_like(streams[1])))
    return output
