# -*- coding: utf-8 -*-
"""
XiaoHei 长循环兼容补丁 —— 把官方缓存签名的「递归 DFS」换成等价的「显式栈 DFS」。

【解决什么】
ComfyUI 官方 comfy_execution/caching.py 的
CacheKeySetInputSignature.get_ordered_ancestry_internal 用递归遍历节点的全部祖先。
XiaoHei-循环开始（以及官方 ForLoopStart）走 expand 动态子图，展开后每轮靠
previous_carry / previous_dependencies / previous_progress 串成一条长链：
    祖先链深度 ≈ 轮数 ×（每轮串联层数 + 1）
循环 100 轮、循环体十来个节点就接近 1000 层，撞上 Python 默认递归上限，
执行前算缓存签名时直接 RecursionError（模型都还没加载）。
实测 ComfyUI 0.45.0 同样会爆官方 ForLoopStart，不是本包 fork 走偏。

【怎么修】
只在启动时替换这一个方法的实现：用显式栈逐帧模拟原来的递归，
遍历顺序、ancestors 列表、order_mapping 内容与官方逐字节一致（有回归测试）。
不动官方任何文件 → ComfyUI 升级不会被覆盖；不改工作流、不改循环语义、
不关缓存、不降画质。普通（非循环）工作流的签名结果完全不变。

【兜底】
· 官方模块/方法不存在、签名变了、别家已改过 → 静默跳过，其余节点照常用。
· 想关掉：环境变量 XH_DISABLE_CACHE_PATCH=1。

与 nodes/xh_utils/sam3_patch.py 同一套挂载惯例（__init__.py 里 try + apply_patch）。
"""

import inspect
import os

_MARK = "__xh_cache_ancestry_patch__"
_original = None
_installed = False


def _make_iterative(is_link):
    """逐帧复刻官方递归（caching.py:138-149），只是把调用栈搬到堆上。

    官方伪码：
        if not has_node(node_id): return
        for key in sorted(node["inputs"]):            # 父帧循环在子递归期间暂停
            if is_link(v) and v[0] not in order_mapping:
                ancestors.append(v[0]); order_mapping[v[0]] = len(ancestors)-1
                recurse(v[0])                         # 递归第一行才检查 has_node

    等价性要点：
      · 必须按 sorted 顺序；父帧要停在当前 key，等整个子树走完再继续下一个 key
        （不能先把所有兄弟一次性塞进 order_mapping，否则兄弟互相引用时顺序会变，
         签名里的 ANCESTOR 索引就变了）。
      · 先把 ancestor 写进 ancestors / order_mapping，再判断它是否存在；
        官方对「悬空 link」也会留下这条记录。
    """
    def _iterative(self, dynprompt, node_id, ancestors, order_mapping):
        if not dynprompt.has_node(node_id):
            return
        # 帧 = [node, sorted_keys(惰性), 下一个要处理的 key 下标]
        stack = [[dynprompt.get_node(node_id), None, 0]]
        while stack:
            frame = stack[-1]
            node, keys, index = frame
            if keys is None:
                keys = sorted(node["inputs"].keys())
                frame[1] = keys
            if index >= len(keys):
                stack.pop()
                continue
            frame[2] = index + 1
            value = node["inputs"][keys[index]]
            if not is_link(value):
                continue
            ancestor_id = value[0]
            if ancestor_id in order_mapping:
                continue
            ancestors.append(ancestor_id)
            order_mapping[ancestor_id] = len(ancestors) - 1
            if dynprompt.has_node(ancestor_id):
                stack.append([dynprompt.get_node(ancestor_id), None, 0])
    return _iterative


def apply_patch():
    """幂等挂载。返回 True = 补丁生效；任何异常都只跳过补丁，不影响整包。"""
    global _original, _installed
    if _installed:
        return True
    if os.environ.get("XH_DISABLE_CACHE_PATCH", "") == "1":
        print("[XiaoHei]  长循环兼容补丁：已被 XH_DISABLE_CACHE_PATCH=1 关闭")
        return False
    try:
        from comfy_execution import caching
        from comfy_execution.graph_utils import is_link  # 与官方同一份 link 判定
    except Exception as _e:                              # noqa: BLE001
        print(f"[XiaoHei]  长循环兼容补丁未挂载（官方模块不可用，其余功能正常）：{_e}")
        return False

    cls = getattr(caching, "CacheKeySetInputSignature", None)
    original = getattr(cls, "get_ordered_ancestry_internal", None) if cls else None
    if not callable(original):
        print("[XiaoHei]  长循环兼容补丁未挂载（官方方法不存在，其余功能正常）")
        return False
    if getattr(original, _MARK, False):
        _installed = True                                # 已经挂过（重复 import 等）
        return True

    # 官方若改了方法签名就别乱替换，留着原样最安全
    try:
        params = tuple(inspect.signature(original).parameters)
        expected = ("self", "dynprompt", "node_id", "ancestors", "order_mapping")
        if params[:5] != expected:
            print(f"[XiaoHei]  长循环兼容补丁未挂载（官方签名已变 {params}，其余功能正常）")
            return False
    except Exception as _e:                              # noqa: BLE001
        print(f"[XiaoHei]  长循环兼容补丁未挂载（签名检查失败，其余功能正常）：{_e}")
        return False

    replacement = _make_iterative(is_link)
    setattr(replacement, _MARK, True)
    replacement.__name__ = "get_ordered_ancestry_internal"
    replacement.__doc__ = (
        "XiaoHei 长循环兼容补丁：与官方递归版等价的显式栈 DFS，"
        "解除长循环展开时 Python 递归深度 1000 的限制。"
    )
    _original = original
    cls.get_ordered_ancestry_internal = replacement
    _installed = True
    print("[XiaoHei]  长循环兼容补丁已生效：缓存祖先遍历改为显式栈，长循环不再受递归深度限制")
    return True


def is_active():
    return _installed


def get_original():
    """给回归测试用：拿到被替换前的官方实现。"""
    return _original
