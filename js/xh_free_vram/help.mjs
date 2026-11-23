// 释放显存（XiaoHei）- 帮助面板内容。
// 1:1 复刻 ComfyUI-Pixaroma / js/free_vram/help.mjs（MIT）的章节结构：
//   给做图的人看，不写给读代码的人看。文案全部走家族语言表 i18n.mjs，
//   家族其它节点也是「注册时取当前语言」的快照式帮助（切语言后重开帮助生效）。

import { t } from "./i18n.mjs";

/** 组装当前语言的帮助定义，供 index.js 调 registerNodeHelp 注册。 */
export function buildHelp() {
  const T = t();
  return {
    title: T.helpTitle,
    tagline: T.helpTagline,
    sections: T.helpSections.map((s) => {
      const out = { heading: s.heading };
      if (s.body) out.body = s.body;
      if (s.defs) out.defs = s.defs;
      if (s.bullets) out.bullets = s.bullets;
      if (s.table) out.table = s.table;
      if (s.bar) {
        // 示例色条的三段色用主题强调色，不用原作者的橙红硬编码。
        out.bar = {
          caption: s.bar.captions,
          segments: s.bar.segments.map((seg) => ({
            pct: seg.pct,
            color: seg.tone === "just" ? "var(--xh-primary,#E8A33C)" :
                   seg.tone === "used" ? "#7a7a7a" : "#3a3a3a",
            value: seg.value,
            label: seg.label,
          })),
          note: s.bar.note,
        };
      }
      return out;
    }),
  };
}

// 兼容旧引用：默认导出一个按当前语言构建的快照对象。
export const FREE_VRAM_HELP = buildHelp();
