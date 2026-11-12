const realApp = {
  registerExtension: (ext) => { globalThis.__REG = ext; },
  invokeExtensionsAsync: () => {},
};
globalThis.window = {
  comfyAPI: { app: { app: realApp, registerExtension: realApp.registerExtension, invokeExtensionsAsync: realApp.invokeExtensionsAsync } },
  XH_LANG: "zh",
  addEventListener: () => {},
  dispatchEvent: () => {},
};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style:{}, setAttribute(){}, appendChild(){}, classList:{add(){}}, querySelectorAll:()=>[], addEventListener(){} }),
  querySelectorAll: () => [],
  documentElement: { setAttribute(){} },
  head: { appendChild(){} },
  addEventListener: () => {},
};
globalThis.app = realApp;
globalThis.requestAnimationFrame = (f)=>setTimeout(f,0);
globalThis.CSS = { escape: (s)=>s };

let ext;
try {
  await import("./xh_node_toolbar.js?" + Date.now());
  ext = globalThis.__REG;
  console.log("IMPORT_OK name =", ext && ext.name);
} catch (e) {
  console.log("IMPORT_FAIL:", e && e.message);
  console.log((e && e.stack || "").split("\n").slice(0,8).join("\n"));
  process.exit(0);
}
const xh = { comfyClass: "XH_图像按序取" };
const non = { comfyClass: "KSampler" };
try { console.log("XiaoHei 节点钩子返回 =", JSON.stringify(ext.getSelectionToolboxCommands(xh))); } catch(e){ console.log("XiaoHei 抛出:", e.message); }
try { console.log("非XiaoHei 钩子返回 =", JSON.stringify(ext.getSelectionToolboxCommands(non))); } catch(e){ console.log("非XiaoHei 抛出:", e.message); }
console.log("已注册命令 =", JSON.stringify((ext.commands||[]).map(c=>c.id)));
