# XiaoHei 分组控制器
# 来源：XH_GroupController（2026-09-22 由 XiaoHei_GroupController 改名，同日并入 Toolbox）
# 纯前端节点：py 侧只注册空壳，界面由顶层 web/xh_group.js 画。
# 注意 class 名与 class_type 必须同名（前端 js 用 nodeData.name !== NODE_TYPE 判断）。


class XHGroupController:
    """分组控制：在画布上给一组节点做整体开关/分组管理（界面在 web/xh_group.js）。"""

    DESCRIPTION = (
        "【干什么】一个「组开关」：在画布上给一组节点做整体开/关，由界面上的按钮统一控制这一组的通断。\n"
        "【怎么用】节点自己就是一块面板，列出画布（含子图）里的每一组，点一下就能单独开/关那一组。"
        "适合「几个采样器 / 几套提示词换着试」的场景。\n"
        " 它是纯控制用的便利节点，没有数据端口，删掉不影响主干逻辑。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "XiaoHei/工具"

    def noop(self):
        return ()


NODE_CLASS_MAPPINGS = {"XHGroupController": XHGroupController}
NODE_DISPLAY_NAME_MAPPINGS = {"XHGroupController": "分组控制"}
