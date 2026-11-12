# XiaoHei 计时器
# 来源：XH_Timer（2026-09-22 由 XiaoHei_Timer 改名，同日并入 Toolbox）
# 纯前端节点：py 侧只注册空壳，计时逻辑与界面全在顶层 web/xh_timer.js。


class XHTimer:
    """计时器：记录本次跑图用了多久（纯前端，界面在 web/xh_timer.js）。"""

    DESCRIPTION = (
        "【干什么】给工作流加一块计时表：开始执行时走表，跑完停表，显示这一段的总耗时。\n"
        "【怎么配】节点内部自带工具条（ 字号、 颜色、 清零、⏸ 暂停/继续、中/EN 切换）。"
        "不需要接线，放哪都行。\n"
        "【怎么用】用来对比不同方案谁快谁慢 —— 比如加了加速节点 vs 没加。"
        "中断执行也会停表，不会让秒数一直跳。\n"
        "【输出】无，**不参与任何计算**。\n"
        "【v1.45.1 修】计时状态改存在节点属性里 ⇒ ① 切到别的工作流再切回来不再归零；"
        "② 进子图再出来不再归零；③ 一次排多条时显示的是**整轮队列总耗时**（不是最后一条的耗时）。\n"
        " 时间是前端自己数的；**刷新整个浏览器页面**是否保留，取决于 ComfyUI 的「工作流草稿持久化」设置"
        "（开着就能续上）；同一张图跑第二次可能命中缓存、快很多。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "XiaoHei/工具"
    OUTPUT_NODE = True

    def noop(self):
        return ()


NODE_CLASS_MAPPINGS = {"XHTimer": XHTimer}
NODE_DISPLAY_NAME_MAPPINGS = {"XHTimer": "计时器"}
