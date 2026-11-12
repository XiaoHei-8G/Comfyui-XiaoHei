"""Qwen21 编辑四件套 · 包入口（2026-11-09 新增，4 个节点）

1:1 复刻 ComfyUI-BlueBox（MIT，Copyright (c) 2026 zhoutingxi）的四个节点：
  · XiaoHei-Qwen21约束裁切    (XHQwen21Cut)          ← CutQwenImage21
  · XiaoHei-局部色彩校准      (XHColorCalibrator)    ← ColorCalibratorBlueBox
  · XiaoHei-双图滑块对比      (XHImageSliderCompare) ← BlueBoxComparisonImage
  · XiaoHei-加载图像(带遮罩)  (XHLoadImageWithMask)  ← BlueBoxLoadImage

算法逐字一致，只改三处接线标识 + 家族元数据：
  ① class_type / 显示名 / CATEGORY（原包照旧可装，两套并存、老工作流不受影响）
  ② 全部参数补中文 tooltip + DESCRIPTION（家族硬性要求）
  ③ scipy.ndimage.distance_transform_edt → cv2.distanceTransform
     （只在「膨胀半径 > 32」的半分辨率 EDT 分支用一次；cv2 是家族存量依赖，零新增）
  ④ 预览临时文件前缀 bluebox_ → xh_qwen_，日志前缀 [BlueBox] → [XiaoHei-Qwen21Edit]
  ⑤ 未搬运 BlueBoxBridge 的 4 条 /bluebox/bridge_* 路由与 273KB mask-editor.html
     （那套编辑器只服务 Bridge，本工作流未用）

双语词条在 web/xh_qwen21_edit/xh_qe_i18n.mjs；滑块 UI 在 web/xh_qwen21_edit/xh_qe_slider.js。
"""

try:
    from .py.qwen21_cut import (
        NODE_CLASS_MAPPINGS as _M_CUT,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CUT,
    )
    from .py.color_calibrator import (
        NODE_CLASS_MAPPINGS as _M_CAL,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CAL,
    )
    from .py.slider_compare import (
        NODE_CLASS_MAPPINGS as _M_CMP,
        NODE_DISPLAY_NAME_MAPPINGS as _D_CMP,
    )
    from .py.load_image_mask import (
        NODE_CLASS_MAPPINGS as _M_LOAD,
        NODE_DISPLAY_NAME_MAPPINGS as _D_LOAD,
    )
    NODE_CLASS_MAPPINGS = {**_M_CUT, **_M_CAL, **_M_CMP, **_M_LOAD}
    NODE_DISPLAY_NAME_MAPPINGS = {**_D_CUT, **_D_CAL, **_D_CMP, **_D_LOAD}
except Exception as _e:      # noqa: BLE001
    # 单模块失败不该让整包阵亡；顶层 __init__.py 的 try 导入会点名说明
    print(f"[XiaoHei]  qwen21_edit 加载失败（其余节点正常）：{_e}")
    raise

WEB_DIRECTORY = "js"   # 死变量：ComfyUI 只认顶层那句

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
