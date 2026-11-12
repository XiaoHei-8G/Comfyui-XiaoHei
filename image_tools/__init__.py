"""XiaoHei-图像工具 · 包入口

本包是 comfyui-kjnodes 两个节点的 XiaoHei 复刻版：
  · XiaoHei-图像缩放v2    ←  Resize Image v2  (ImageResizeKJv2)
  · XiaoHei-图像批量合并  ←  Image Batch Multi (ImageBatchMulti)

  · 算法与原版逐字节一致（未改动任何计算逻辑）
  · 界面双语化：下拉选项「中文 (english)」、tooltip 中文优先、参数标签中/EN 一键切换
  · 分类 / 显示名改 XiaoHei 风格：XH/Image · XiaoHei-xxx

另含内部依赖 XHImagePadKJ（← ImagePadKJ），被「补边」模式调用，不单独注册。

2026-09-23 新增（原创，非复刻）：
  · XiaoHei-参考图拼接板  (XHRefSheetBuilder)
    把 1~3 张参考图拼成一张「参考表」并适配目标画幅（16:9 / 9:16 / 1:1…）。
    解决 LTX IC-LoRA 等「只接受单张 image」的参考引导节点没法同时喂多张脸的问题。
    机制：每格等比缩放（可裁切填满让脸最大化）→ 按版式排布 → 整体等比塞进目标画布 → 居中补边。
     铁律：**参考表比例必须等于目标视频比例**，否则人脸会被压扁。

原包 comfyui-kjnodes 保持原样不动，两套可同时安装、互不干扰（class_type 键不同）。

2026-09-30 新增（复刻 comfyui-kjnodes）：
  · XiaoHei-取帧范围  (XHImageRangeFromBatch ← GetImageRangeFromBatch)
    从 IMAGE / MASK 批次里取一段连续帧；长视频续接「取上一段尾帧」= 起始帧 -1 / 取几帧 1。
    比原版多：其它负数支持倒数计数、越界报错说清帧数、可开 clamp 自动钳、两个输入都没接时明确报错。

2026-10-01 新增（原创，配合「XiaoHei-图片列表」）：
  · XiaoHei-图像按序取  (XHImageGetByIndex)
    从 IMAGE 批次按序号取出【单张】。接 XiaoHei 循环 index → 逐段自动换图（第 0 轮取第 1 张…）。
    默认 0-based（直接接 XiaoHei 循环 index）；可选 1-based、clamp 越界复用末张、负数倒数。
    回显「实际序号」方便排错。纯后端，无前端画廊（缩略图/拖拽由 XiaoHei-图片列表负责）。

2026-10-08 新增（参考社区「缩放图像遮罩」/「获取图像尺寸」节点）：
  · XiaoHei-图像遮罩缩放  (XHImageMaskScale)
    按「短边/长边/宽度/高度」单一边等比赛缩放 IMAGE 和/或 MASK，可选「整除对齐」。
    image / mask 都是可选输入，至少接一个；都接则按同一规则同步缩放。
  · XiaoHei-图像尺寸  (XHImageSize)
    读取 IMAGE 张量的 width / height / batch_size，并输出可读的 info 字符串
    （如 "width: 544, height: 967 batch size: 1"），方便直接接到打印/预览节点。

2026-10-09 新增（复刻 comfyui-art-venture）：
  · XiaoHei-按比例缩放  (XHImageScaleByAspectRatio ← LayerUtility: ImageScaleByAspectRatio V2)
    LayerStyle 按比例缩放的 XiaoHei 版，算法逐字一致。
  · XiaoHei-色彩校正  (XHColorCorrect ← ColorCorrect)
    色温/色相/亮度/对比度/饱和度/伽马 一站式调色，算法逐字一致。

2026-10-14 新增（复刻 comfyui-videohelpersuite 的 LoadVideoUpload）：
  · XiaoHei-加载视频  (XHLoadVideo ← VHS_LoadVideo "Load Video (Upload)"，**精简实用版**)
    视频 → 图像批 + 帧数 + 音频。保留 force_rate / custom_width / custom_height /
    frame_load_cap / skip_first_frames / select_every_nth；砍掉 vae(LATENT) / format 预设 /
    meta_batch / video_info（VHS 私有类型）。零新增依赖：读帧用 cv2（存量）、抽音频用 av
    （官方自带）。前端另有 DOM 上传按钮 + 拖拽上传 + 实时信息条（web/xh_video_load.js）。

2026-10-24 新增（复刻 comfyui-easy-media 的 Compare Videos，多路化改造）：
  · XiaoHei-视频对比  (XHCompareVideos)
    多路视频（≤4）同步对比：网格同播 / 单看大图 / 两两滑块。三路来源汇成有序池
    （source 口 + output 口 + widget 多选，去重保序）；差值信息条列出每路 fps/帧数/
    时长及相对第 1 路的差值。零新增依赖：VIDEO 元数据走官方 VideoInput getter
    （get_stream_source/get_duration/get_frame_rate/get_frame_count），不用 ffprobe。
    扫盘路由 /xh/videocompare/files（前端「 选择文件」）。

2026-10-15 新增（XiaoHei 原创，用于替代第三方 ComfyUI-RMBG 的两个节点）：
  · XiaoHei-去背景  (XHBackgroundRemove)
    用 ComfyUI **官方 BiRefNet 内核**（comfy.bg_removal_model）抠图，输出①透明背景 RGBA
    ②前景遮罩。端口对齐第三方 `RMBG`（image 进、IMAGE 出），可零改线顶替。
    权重放 `models/background_removal/`（birefnet.safetensors，官方 Comfy-Org/BiRefNet）。
    等价于官方「Remove Background → Invert Mask → Join Image with Alpha」串联链路。
  · XiaoHei-图像对比拼图  (XHImageCompare)
    把最多 3 张图横向并排拼成一张、每张上方带标题栏，端口对齐第三方 `AILab_ImageCompare`。

2026-10-31 新增（XiaoHei 原创，收拢 SAM3 上色那套 9 个官方节点）：
  · XiaoHei-遮罩上色  (XHMaskTint)
    把「减脸 → 调浓度 → 铺色」三步收成一个：原图 + 身体遮罩（+ 脸部遮罩可选）
    → 上色后的帧序列。接了脸遮罩 = 只刷身体、脸留原样（表情保住）；不接 = 全身刷色。
    外扩用 torch 手写十字膨胀（对齐官方 GrowMask 的 tapered 模式），零新增依赖。

2026-10-31 新增（XiaoHei 原创，为了「分段重跑识别、人物换位置不串号」）：
  · XiaoHei-视频分段轴  (XHVideoTimeline)
    节点自带 <video> 播放器 + 帧轨道，拖拽把视频切成若干段；
    按 index（接 XiaoHei-循环 的轮次）输出那一段的 start_frame / frames，
    直接接 XiaoHei-加载视频 的「起始帧 / 取多少帧」两个口 ⇒ 一条链路循环跑 N 段。
    segments 由前端时间轴生成，不用手填帧号。
  · XiaoHei-列表拼批  (XHImageListConcat)
    把「一串 IMAGE 批次」（循环开了「累计」之后的 outputs）首尾相接拼成一个大批次
    —— 循环跑 N 段、每段出一批帧，用它把各段拼回完整帧序列再出视频。
"""

from .py.image_tools import (
    NODE_CLASS_MAPPINGS as _IMG_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _IMG_DISPLAY_NAME_MAPPINGS,
)
from .py.image_range import (
    NODE_CLASS_MAPPINGS as _RANGE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _RANGE_DISPLAY_NAME_MAPPINGS,
)
from .py.video_tools import (
    NODE_CLASS_MAPPINGS as _VIDEO_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _VIDEO_DISPLAY_NAME_MAPPINGS,
)
from .py.image_list import (
    NODE_CLASS_MAPPINGS as _LIST_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _LIST_DISPLAY_NAME_MAPPINGS,
)
from .py.image_get import (
    NODE_CLASS_MAPPINGS as _GET_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _GET_DISPLAY_NAME_MAPPINGS,
)
from .py.image_size import (
    NODE_CLASS_MAPPINGS as _SIZE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _SIZE_DISPLAY_NAME_MAPPINGS,
)
from .py.image_mask_scale import (
    NODE_CLASS_MAPPINGS as _MASK_SCALE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _MASK_SCALE_DISPLAY_NAME_MAPPINGS,
)
from .py.image_scale_aspect_ratio import (
    NODE_CLASS_MAPPINGS as _SCALE_ASPECT_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _SCALE_ASPECT_DISPLAY_NAME_MAPPINGS,
)
from .py.image_color_correct import (
    NODE_CLASS_MAPPINGS as _COLOR_CORRECT_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _COLOR_CORRECT_DISPLAY_NAME_MAPPINGS,
)
from .py.video_load import (
    NODE_CLASS_MAPPINGS as _LOAD_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as _LOAD_DISPLAY_NAME_MAPPINGS,
)

# 2026-10-31 新增（XiaoHei 原创，收拢 SAM3 上色那套 9 个官方节点）：
#   · XiaoHei-遮罩上色  (XHMaskTint)  身体遮罩（可减脸）→ 上色合成，一节点顶九条
#   · XiaoHei-视频分段轴  (XHVideoTimeline)  播放器上拖拽切段 → 按轮次输出该段起始帧/帧数
#   · XiaoHei-身份配色  (XHIdentityColorize)  官方 SCAIL2ColoredMask 的可指定颜色版
#   · XiaoHei-列表拼批  (XHImageListConcat)  循环「累计」出来的 IMAGE 列表拼成一批
# 用 try 包住：本模块出问题只少这 4 个节点，不影响 image_tools 其余节点。
try:
    from .py.image_mask_tint import (
        NODE_CLASS_MAPPINGS as _TINT_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _TINT_DISPLAY_NAME_MAPPINGS,
    )
    from .py.video_timeline import (
        NODE_CLASS_MAPPINGS as _TL_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _TL_DISPLAY_NAME_MAPPINGS,
    )
    from .py.identity_colorize import (
        NODE_CLASS_MAPPINGS as _IDCOL_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _IDCOL_DISPLAY_NAME_MAPPINGS,
    )
    from .py.image_list_concat import (
        NODE_CLASS_MAPPINGS as _LCONCAT_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _LCONCAT_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  遮罩上色 / 视频分段轴 / 身份配色 / 列表拼批未加载（其余 image_tools 节点正常）：{_e}")
    _TINT_CLASS_MAPPINGS = _TINT_DISPLAY_NAME_MAPPINGS = {}
    _TL_CLASS_MAPPINGS = _TL_DISPLAY_NAME_MAPPINGS = {}
    _IDCOL_CLASS_MAPPINGS = _IDCOL_DISPLAY_NAME_MAPPINGS = {}
    _LCONCAT_CLASS_MAPPINGS = _LCONCAT_DISPLAY_NAME_MAPPINGS = {}

# 2026-10-24 新增（复刻 comfyui-easy-media 的 Compare Videos，多路化 + 官方 getter）：
#   · XiaoHei-视频对比  (XHCompareVideos)  多路视频（≤4）同步对比：网格同播 / 单看 / 两两滑块
# 用 try 包住：本模块出问题只少这 1 个节点，不影响 image_tools 其余节点。
try:
    from .py.video_compare import (
        NODE_CLASS_MAPPINGS as _VCMP_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _VCMP_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  视频对比未加载（其余 image_tools 节点正常）：{_e}")
    _VCMP_CLASS_MAPPINGS = _VCMP_DISPLAY_NAME_MAPPINGS = {}

# 2026-10-26 新增（XiaoHei 原创，复刻 Video Helper Suite 的 VHS_VideoCombine 的能力，零第三方依赖）：
#   · XiaoHei-视频合成  (XHVideoCombine)  图像帧(+音轨) → mp4/gif/webp
#     用户诉求：「不想用别人的节点」——工作流里常接第三方 VHS_VideoCombine，本节点用官方
#     PyAV 通路重新实现一遍，class_type 带 XiaoHei 前缀 ⇒ 与任何第三方零冲突。
#     输出两个口：video(VIDEO，能在节点框里直接预览) + file_path(STRING，完整路径)。
# 用 try 包住：本模块出问题只少这 1 个节点，不影响 image_tools 其余节点。
try:
    from .py.video_combine import (
        NODE_CLASS_MAPPINGS as _VCOMB_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _VCOMB_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  视频合成未加载（其余 image_tools 节点正常）：{_e}")
    _VCOMB_CLASS_MAPPINGS = _VCOMB_DISPLAY_NAME_MAPPINGS = {}

# 2026-10-21 新增（XiaoHei 原创，服务「长视频分段 → 模型 → 拼接」这条链路）：
#   · XiaoHei-帧数对齐   (XHFrameAlign)    秒数 + 模型规矩 → 该模型认的帧数
#   · XiaoHei-分段拼接   (XHSegmentConcat) 多段 IMAGE 首尾相接 + 每段帧数校验
# 用 try 包住：本模块出问题只少这 2 个节点，不影响 image_tools 其余节点。
try:
    from .py.frame_align import (
        NODE_CLASS_MAPPINGS as _FRAME_ALIGN_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _FRAME_ALIGN_DISPLAY_NAME_MAPPINGS,
    )
    from .py.video_concat import (
        NODE_CLASS_MAPPINGS as _CONCAT_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _CONCAT_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  帧数对齐 / 分段拼接未加载（其余 image_tools 节点正常）：{_e}")
    _FRAME_ALIGN_CLASS_MAPPINGS = _FRAME_ALIGN_DISPLAY_NAME_MAPPINGS = {}
    _CONCAT_CLASS_MAPPINGS = _CONCAT_DISPLAY_NAME_MAPPINGS = {}

# 2026-10-15 新增（XiaoHei 原创，用于替代第三方 ComfyUI-RMBG 的两个节点）：
#   · XiaoHei-去背景       (XHBackgroundRemove) ← 官方 BiRefNet 内核，端口对齐 RMBG
#   · XiaoHei-图像对比拼图  (XHImageCompare)     ← 端口对齐 AILab_ImageCompare
# 用 try 包住：本模块出问题只少这 2 个节点，不影响 image_tools 其余节点。
try:
    from .py.image_bg_remove import (
        NODE_CLASS_MAPPINGS as _BG_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _BG_DISPLAY_NAME_MAPPINGS,
    )
    from .py.image_compare import (
        NODE_CLASS_MAPPINGS as _CMP_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS as _CMP_DISPLAY_NAME_MAPPINGS,
    )
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  去背景 / 图像对比拼图未加载（其余 image_tools 节点正常）：{_e}")
    _BG_CLASS_MAPPINGS = _BG_DISPLAY_NAME_MAPPINGS = {}
    _CMP_CLASS_MAPPINGS = _CMP_DISPLAY_NAME_MAPPINGS = {}

NODE_CLASS_MAPPINGS = {
    **_IMG_CLASS_MAPPINGS,
    **_RANGE_CLASS_MAPPINGS,
    **_VIDEO_CLASS_MAPPINGS,
    **_LIST_CLASS_MAPPINGS,
    **_GET_CLASS_MAPPINGS,
    **_SIZE_CLASS_MAPPINGS,
    **_MASK_SCALE_CLASS_MAPPINGS,
    **_SCALE_ASPECT_CLASS_MAPPINGS,
    **_COLOR_CORRECT_CLASS_MAPPINGS,
    **_LOAD_CLASS_MAPPINGS,
    **_FRAME_ALIGN_CLASS_MAPPINGS,
    **_CONCAT_CLASS_MAPPINGS,
    **_BG_CLASS_MAPPINGS,
    **_CMP_CLASS_MAPPINGS,
    **_VCMP_CLASS_MAPPINGS,
    **_VCOMB_CLASS_MAPPINGS,
    **_TINT_CLASS_MAPPINGS,
    **_TL_CLASS_MAPPINGS,
    **_IDCOL_CLASS_MAPPINGS,
    **_LCONCAT_CLASS_MAPPINGS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **_IMG_DISPLAY_NAME_MAPPINGS,
    **_RANGE_DISPLAY_NAME_MAPPINGS,
    **_VIDEO_DISPLAY_NAME_MAPPINGS,
    **_LIST_DISPLAY_NAME_MAPPINGS,
    **_GET_DISPLAY_NAME_MAPPINGS,
    **_SIZE_DISPLAY_NAME_MAPPINGS,
    **_MASK_SCALE_DISPLAY_NAME_MAPPINGS,
    **_SCALE_ASPECT_DISPLAY_NAME_MAPPINGS,
    **_COLOR_CORRECT_DISPLAY_NAME_MAPPINGS,
    **_LOAD_DISPLAY_NAME_MAPPINGS,
    **_FRAME_ALIGN_DISPLAY_NAME_MAPPINGS,
    **_CONCAT_DISPLAY_NAME_MAPPINGS,
    **_BG_DISPLAY_NAME_MAPPINGS,
    **_CMP_DISPLAY_NAME_MAPPINGS,
    **_VCMP_DISPLAY_NAME_MAPPINGS,
    **_VCOMB_DISPLAY_NAME_MAPPINGS,
    **_TINT_DISPLAY_NAME_MAPPINGS,
    **_TL_DISPLAY_NAME_MAPPINGS,
    **_IDCOL_DISPLAY_NAME_MAPPINGS,
    **_LCONCAT_DISPLAY_NAME_MAPPINGS,
}

# 让 ComfyUI 加载 web/ 下的前端扩展（中/EN 语言切换按钮 + 参数/端口标签本地化 + 动态输入口）
WEB_DIRECTORY = "web"

# ---------------------------------------------------------------------------
# 本机文件夹图片接口（2026-10-12）：给「XiaoHei-图片列表」的「 文件夹」按钮用
#   /xh/imglist/list · /xh/imglist/file
#  必须 try 住：路由注册失败只打日志，绝不允许拖垮 image_tools 这 11 个节点
# ---------------------------------------------------------------------------
try:
    from .py.local_image_api import register_routes as _img_register_routes
    _img_register_routes()
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  本机文件夹图片接口未注册（图片列表的「 文件夹」不可用，其余功能正常）：{_e}")

# 视频探测路由（2026-10-14）：给「XiaoHei-加载视频」的实时信息预览条用
#   GET /xh/videoload/probe?filename=xxx.mp4 → {ok,width,height,fps,frames_total,duration}
try:
    from .py.video_load import register_routes as _load_register_routes
    _load_register_routes()
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  视频探测接口未注册（加载视频节点的信息条不显示，其余功能正常）：{_e}")

# 视频对比扫盘路由（2026-10-24）：给「XiaoHei-视频对比」的「 选择文件」弹层用
#   GET /xh/videocompare/files?dir=input|temp|output
try:
    from .py.video_compare import register_routes as _vcmp_register_routes
    _vcmp_register_routes()
except Exception as _e:      # noqa: BLE001
    print(f"[XiaoHei]  视频对比扫盘接口未注册（「选择文件」不可用，接线对比不受影响）：{_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
