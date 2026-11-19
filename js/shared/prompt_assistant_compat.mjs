// XiaoHei · 第三方「提示词小助手」(window.promptAssistant) 兼容桥
//
// 症状：官方「字符串（多行）」框右下角有小助手的历史 / 撤销 / 重做 / 收藏 /
//       优化 / 翻译按钮，家族提示词节点的框里一个都没有。
// 根因（读第三方源码实测）：
//   ① utils/UIToolkit.js::isValidInput 方法1 要求 widget.inputEl 是真 <textarea>，
//      且 widget.name 命中白名单或含 "prompt"；
//   ② modules/PromptAssistant.js::checkAndSetupNode 只扫 node.widgets；
//   ③ services/NodeMountService.js 往上找 .dom-widget 容器，把按钮绝对定位到右下角。
// 家族三个复刻提示词节点都用 addDOMWidget 包一整块 div：element 是 div、
// 没有 inputEl、名字叫 xh_tag_ui / xh_stack_ui / xh_pack_ui，三条一条都不沾。
//
// 本模块只给已有的 DOM widget 补「可被识别的外观」：
//   - 不往 node.widgets 增删任何 widget（widgets_values 下标一个都不动）；
//   - 不画图标、不改第三方一行、不改节点输出 / 存档结构 / 版本号；
//   - 按钮的挂载 / 清理 / 开关重建全部走第三方自己的生命周期。
// 值回流：第三方 setInputValue 写 textarea.value 并派发 input + change，
//   家族节点自己的 input 监听器会把内容写回 node.properties，无需二次同步。
//
// 三个已核实的坑：
//   · 第三方 setupNodeAssistant 会 Object.create(processedWidget) 后赋值 inputEl。
//     只有 getter 没有 setter，在严格模式下会抛 TypeError，整次挂载失败 → 给 noop setter。
//   · 第三方原型级 onNodeCreated 早于扩展的 nodeCreated 钩子，且打了
//     _promptAssistantInitialized 标记只扫一次 → 必须自己主动 rescan 并重试到就绪。
//   · 提示词堆叠每次交互整块重建行列表，旧 textarea 会被删掉 → inputEl 用 getter
//     动态返回「当前第一行 textarea」，再靠 MutationObserver 让第三方重扫重建实例。

const DEFAULT_INPUT_ID = "xh_prompt_text";

function assistant() {
  const a = window.promptAssistant || null;
  return a && typeof a.checkAndSetupNode === "function" ? a : null;
}

function featuresOff() {
  return !!(window.FEATURES && window.FEATURES.enabled === false);
}

function defer(fn) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 16);
}

function rescan(node) {
  const a = assistant();
  if (!a || featuresOff()) return false;
  try {
    a.checkAndSetupNode(node);
    return true;
  } catch (_e) {
    return false; // 第三方还没初始化完，交给后面的重试
  }
}

// 初始挂载：第三方可能比我们晚就绪，重试到它出现，再补两拍防 DOM 晚挂载。
// checkAndSetupNode 内部有 hasInstance 去重，重复调用是幂等的。
function scheduleRescan(node, bridge) {
  let tries = 0;
  const tick = () => {
    if (bridge.disposed || featuresOff()) return;
    const ok = rescan(node);
    tries += 1;
    if (!ok && tries < 20) {
      setTimeout(tick, 150);
      return;
    }
    if (ok && tries < 3) setTimeout(tick, 250);
  };
  defer(tick);
}

/**
 * 让一个家族 DOM widget 被提示词小助手识别。
 * @param {object} node          节点实例
 * @param {object} widget        addDOMWidget 返回的那个 widget（同一个，不新增）
 * @param {Function} getTextarea 返回当前承载提示词的 <textarea>，可为 null
 * @param {object} [options]     { inputId?: string, watch?: Element }
 *                              watch 传「子节点会被整块重建的稳定容器」，重绘节点必传
 * @returns {object|null} 桥接标记，重复调用返回同一个
 */
export function exposePromptWidget(node, widget, getTextarea, options = {}) {
  if (!node || !widget || typeof getTextarea !== "function") return null;
  if (widget._xhPaBridge) return widget._xhPaBridge;

  const inputId = options.inputId || DEFAULT_INPUT_ID;
  const current = () => {
    try {
      const ta = getTextarea();
      return ta && ta.tagName === "TEXTAREA" ? ta : null;
    } catch (_e) {
      return null;
    }
  };

  // ① 名字：命中第三方 includes("prompt") 分支。全包实测这三个内部名字只在
  //    创建处出现，家族代码没有按名字反查 widget，改名不影响接线与存档。
  const originalName = widget.name;
  try {
    widget.name = inputId;
  } catch (_e) { /* 极少数实现把 name 设成只读，跳过即可 */ }

  // ② inputEl：必须是真 textarea。getter 让重绘节点始终给当前元素；
  //    noop setter 承接第三方 Object.create(widget) 后的赋值。
  try {
    Object.defineProperty(widget, "inputEl", {
      configurable: true,
      enumerable: true,
      get: current,
      set: () => {},
    });
  } catch (_e) {
    try { widget.inputEl = current(); } catch (_e2) { /* ignore */ }
  }

  // ③ multiline：部分索引策略会看它。不改 type（改了会让官方把它当字符串控件渲染）。
  try {
    if (!widget.options || typeof widget.options !== "object") widget.options = {};
    widget.options.multiline = true;
  } catch (_e) { /* ignore */ }

  const bridge = {
    inputId,
    originalName,
    watch: null,
    observer: null,
    pending: false,
    disposed: false,
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      try { this.observer?.disconnect(); } catch (_e) { /* ignore */ }
      this.observer = null;
      this.watch = null;
    },
  };

  const watch = options.watch || null;
  if (watch && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => {
      if (bridge.pending || bridge.disposed) return;
      bridge.pending = true;
      defer(() => {
        bridge.pending = false;
        if (bridge.disposed) return;
        if (watch.isConnected === false) {
          bridge.dispose();
          return;
        }
        rescan(node);
      });
    });
    try {
      observer.observe(watch, { childList: true, subtree: true });
      bridge.watch = watch;
      bridge.observer = observer;
    } catch (_e) { /* 环境不支持就只靠第三方自己的扫描 */ }
  }

  widget._xhPaBridge = bridge;
  node._xhPaBridge = bridge;
  scheduleRescan(node, bridge);
  return bridge;
}
