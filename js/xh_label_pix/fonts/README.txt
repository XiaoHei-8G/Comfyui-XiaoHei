随包内置字体 · 说明
==================================================

得意黑 / Smiley Sans Oblique
  文件      : SmileySans-Oblique.woff2（由官方 SmileySans-Oblique.ttf 转出的 woff2，未做任何字形修改）
  版本      : v2.0.1
  作者      : atelierAnchor <https://atelier-anchor.com>
  上游      : https://github.com/atelier-anchor/smiley-sans
  许可      : SIL Open Font License 1.1（全文见同目录 OFL.txt）
              允许随软件一起分发与嵌入，允许商用；保留字体名 Smiley / 得意黑，
              即：不得修改字形后再用这两个名字发布。本包原样分发，符合许可。

为什么放这里（不是让用户自己装字体）
  浮字标签的字体按钮前六款写的是「系统字体名」（微软雅黑 / 宋体 / 楷体 / 黑体 /
  等线 / 仿宋），对方电脑有没有那款字我们控制不了；缺了就 fallback，字形和作者
  机器上不一样。把一款开源字体放进包里、用 FontFace API 注册，粉丝只要装了
  小黑工具箱，字形就和作者完全一致 —— 这是唯一能保证「别人拿到跟我一样的」
  又不违反字体授权的做法（微软雅黑 / 华文 / 方正等商业字体一律不得随包分发）。

技术要点
  · 注册方式：js/xh_label_pix/render.mjs 里用 `new FontFace(...)` + `document.fonts.add()`
    （不用 <style>@font-face：canvas 绘制不依赖样式表，但依赖 document.fonts）。
  · 首屏必须补重绘：字体是异步加载的，加载完成前 canvas 会用 fallback 画且不会自动
    重绘。所有绘制方都要挂 `onEmbeddedFontsReady()`（编辑器预览、节点 DOM、画布节点）。
  · 声明 font-style: normal —— 字体本身是斜体设计，声明成 oblique 会让 normal 请求
    匹配不上，直接 fallback。
