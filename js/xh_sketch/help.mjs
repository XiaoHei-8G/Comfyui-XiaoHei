// 小黑·标注 — 帮助面板（工具栏 ? 与帮助浏览器共用）。
// 家族规范化：文案全部走 i18n.t()，随中英切换。契约串（image/prompt/mask、快捷键）
// 只在正文里以 code 出现，不翻译。

import { t } from "./i18n.mjs";

/** 每次调用按当前语言生成一份帮助定义（帮助系统本身不切语言，注册时取当前值，
 *  语言切换由 index.js 重新注册刷新）。 */
export function buildSketchHelp() {
  return {
    title: t("helpTitle"),
    tagline: t("helpTagline"),
    sections: [
      {
        heading: t("helpHowHeading"),
        bullets: [t("helpHow1"), t("helpHow2"), t("helpHow3"), t("helpHow4")],
      },
      {
        heading: t("helpToolsHeading"),
        defs: t("helpTools"),
      },
      {
        heading: t("helpPromptHeading"),
        body: t("helpPromptBody"),
      },
      {
        heading: t("helpOutHeading"),
        defs: t("helpOut"),
      },
      {
        heading: t("helpButtonsHeading"),
        defs: t("helpButtons"),
      },
      {
        heading: t("helpTipsHeading"),
        bullets: t("helpTips"),
      },
    ],
  };
}

// 兼容旧 import 名（若别处还引用 SKETCH_HELP）：保留为按当前语言生成的一份。
export const SKETCH_HELP = buildSketchHelp();
