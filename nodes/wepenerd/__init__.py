# ---------------------------------------------------------------------------
# H3 Ripple / WepeNerd 1:1 复刻件（MIT, Copyright (c) 2026 WepeNerd）
#   原包：https://github.com/WepeNerd/ComfyUI-WepeNerd ，许可见 LICENSE-WepeNerd-MIT.txt
#   本目录所有 .py 为原包物理拷贝，逻辑一字未改；仅替换了 class_type / 路由前缀。
#   class_type 统一加 XH_ 前缀，避免与同时安装的原版节点抢注册。
#   前端在 web/xh_wepenerd/（扩展名 XH.WN.*，路由 /xh/wn/*）。
#    例外：long_ripple_core.py / long_ripple_node.py 是 **XiaoHei 自研**（长镜头分块节点），
#     不是原包拷贝；它们只是复用本目录的 WN_RippleApply 链，放在这里便于相对导入。
# ---------------------------------------------------------------------------
from .resolution_suggest import WN_ResolutionSuggest
from .drag_resolution import WN_DragResolution
from .slider_node import WN_Slider
from .resize_megapixels_node import WN_ResizeMegapixels
from .zoom_crop_node import WN_ZoomCrop
from .load_video_node import WN_LoadVideo, register_load_video_routes
from .save_video_node import WN_SaveVideo
from .speedpaint_node import WN_Speedpaint, register_speedpaint_routes
from .liquify_node import WN_LiquifyImage
from .sigma_curve_node import WN_SigmaCurve
from .web_cache import register_module_cache_headers

NODE_CLASS_MAPPINGS = {
    "XH_WN_ResolutionSuggest": WN_ResolutionSuggest,
    "XH_WN_DragResolution": WN_DragResolution,
    "XH_WN_Slider": WN_Slider,
    "XH_WN_ResizeMegapixels": WN_ResizeMegapixels,
    "XH_WN_ZoomCrop": WN_ZoomCrop,
    "XH_WN_LoadVideo": WN_LoadVideo,
    "XH_WN_SaveVideo": WN_SaveVideo,
    "XH_WN_Speedpaint": WN_Speedpaint,
    "XH_WN_LiquifyImage": WN_LiquifyImage,
    "XH_WN_SigmaCurve": WN_SigmaCurve,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "XH_WN_ResolutionSuggest": "Resolution Suggest",
    "XH_WN_DragResolution": "Drag Resolution",
    "XH_WN_Slider": "Slider",
    "XH_WN_ResizeMegapixels": "Resize Image Megapixels",
    "XH_WN_ZoomCrop": "Zoom Crop",
    "XH_WN_LoadVideo": "Load Video (Upload)",
    "XH_WN_SaveVideo": "Save Video",
    "XH_WN_Speedpaint": "Speedpaint",
    "XH_WN_LiquifyImage": "Liquify Image",
    "XH_WN_SigmaCurve": "Sigma Curve",
}

# 依赖 scipy 的 Qwen 对齐 / 遮罩组单独 try：没装 scipy 只少这几个节点，
# 绝不让整包（含 H3 Ripple 主链路）加载失败。本机 .venv 已有 scipy 1.18.0。
# 原包里这几个模块只导出类、没有 NODE_CLASS_MAPPINGS（逐个手工挂，别漏）
_EXTRA_CLASSES = {
    "masked_lora_node": (("WepeNerdLoadLoraMasked", "Load LoRA Masked"),
                         ("WN_MaskedLoraSnapshot", "Masked LoRA Image Snapshot (internal)")),
    "paint_mask_node": (("WN_PaintMask", "Paint Mask"),),
}
_QWEN_PARTS = ("masked_lora_node", "paint_mask_node",
               "qwen_edit_align", "qwen_edit_mask_node")
import importlib
for _mod in _QWEN_PARTS:
    try:
        _m = importlib.import_module("." + _mod, __name__)
        NODE_CLASS_MAPPINGS.update(getattr(_m, "NODE_CLASS_MAPPINGS", {}))
        NODE_DISPLAY_NAME_MAPPINGS.update(getattr(_m, "NODE_DISPLAY_NAME_MAPPINGS", {}))
        for _cls, _disp in _EXTRA_CLASSES.get(_mod, ()):
            if hasattr(_m, _cls):
                _key = "XH_" + _cls
                NODE_CLASS_MAPPINGS[_key] = getattr(_m, _cls)
                NODE_DISPLAY_NAME_MAPPINGS.setdefault(_key, _disp)
    except Exception as _e:
        print("[XiaoHei-WepeNerd] 可选模块 %s 未加载（不影响 H3 Ripple）：%s" % (_mod, _e))

# 无外部依赖的其余模块：同样逐个 try，单模块异常不拖垮整包
_CORE_PARTS = (
    ("frame_number_node", "register_frame_number_routes"),
    ("frame_slicer_node", None),
    ("ripple_node", "register_ripple_routes"),
    ("vae_degrid_node", None),
    ("long_ripple_node", None),  # XiaoHei 自研：H3 长镜头分块（依赖上面的 ripple_node）
)
for _mod, _route in _CORE_PARTS:
    try:
        _m = importlib.import_module("." + _mod, __name__)
        NODE_CLASS_MAPPINGS.update(getattr(_m, "NODE_CLASS_MAPPINGS", {}))
        NODE_DISPLAY_NAME_MAPPINGS.update(getattr(_m, "NODE_DISPLAY_NAME_MAPPINGS", {}))
        if _route:
            try:
                getattr(_m, _route)()
            except Exception as _e:
                print("[XiaoHei-WepeNerd] 路由 %s 注册失败：%s" % (_route, _e))
    except Exception as _e:
        print("[XiaoHei-WepeNerd] 模块 %s 加载失败：%s" % (_mod, _e))

for _reg in (register_speedpaint_routes, register_load_video_routes,
             register_module_cache_headers):
    try:
        _reg()
    except Exception as _e:
        print("[XiaoHei-WepeNerd] %s 注册失败：%s" % (_reg.__name__, _e))

# ComfyUI 只读顶层声明；子模块里这句与家族其它模块一致，属死变量（格式统一）。
WEB_DIRECTORY = "js"

#  2026-11-08 中文化：节点库里的显示名一并换成家族中文名
#   原包各 .py 的英文显示名一个字没改，只在聚合器最后统一覆盖（EN 态由前端语言表负责）。
_XH_WN_ZH_DISPLAY = {
    "XH_WN_ResolutionSuggest": "尺寸建议",
    "XH_WN_DragResolution": "拖拽定尺寸",
    "XH_WN_Slider": "数值滑杆",
    "XH_WN_ResizeMegapixels": "按百万像素缩放",
    "XH_WN_ZoomCrop": "缩放裁切",
    "XH_WN_LoadVideo": "加载视频（上传）",
    "XH_WN_SaveVideo": "保存视频",
    "XH_WN_Speedpaint": "速涂画板",
    "XH_WN_LiquifyImage": "图像液化",
    "XH_WN_SigmaCurve": "Sigma 曲线",
    "XH_WepeNerdLoadLoraMasked": "遮罩 LoRA 加载",
    "XH_WN_MaskedLoraSnapshot": "遮罩 LoRA 快照（内部）",
    "XH_WN_PaintMask": "涂遮罩",
    "XH_QwenEditMeasureShift": "改图漂移测量",
    "XH_QwenEditAlignComposite": "改图对齐合成",
    "XH_QwenEditDiffMask": "改图差异遮罩",
    "XH_WN_QwenEditMask": "Qwen 改图遮罩",
    "XH_WN_FrameNumberSelector": "时长/帧数预设",
    "XH_WN_FrameSlicer": "帧切片",
    "XH_WN_RippleClip": "改帧·选片段",
    "XH_WN_RippleFromFrames": "改帧·从帧序列",
    "XH_WN_RippleApply": "改帧传播·条件合成",
    "XH_WN_RippleOutput": "改帧结果输出",
    "XH_WN_VAEDeGrid": "VAE 去网格",
    "XH_WN_H3AutoLongRipple": "改帧传播·长镜头分块"
}

NODE_DISPLAY_NAME_MAPPINGS.update(_XH_WN_ZH_DISPLAY)

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
