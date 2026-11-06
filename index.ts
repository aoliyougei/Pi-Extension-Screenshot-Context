import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { projectScreenshotContext } from "./context.ts";

const SETTINGS = "screenshot-context-settings";
const POLICY = "覆盖用户上传、所有工具和扩展上下文的标准图片块；仅发送待分析图片，模型成功响应后省略旧图，失败或中断时保留。";

// Reconstruct from the active branch, not process memory or abandoned branches.
function readState(ctx: ExtensionContext) {
  const branch = ctx.sessionManager.getBranch();
  let enabled = false;
  for (let i = 0; i < branch.length; i++) {
    const entry = branch[i];
    if (entry.type !== "custom") continue;
    if (entry.customType === SETTINGS) {
      const data = entry.data as { version?: unknown; enabled?: unknown } | undefined;
      if (data?.version === 1 && typeof data.enabled === "boolean") {
        enabled = data.enabled;
      }
    }
  }
  return { enabled };
}

export default function screenshotContext(pi: ExtensionAPI) {
  pi.registerCommand("screenshot-context", {
    description: "开启/关闭通用历史图片过滤：on | off | status（用户上传及所有工具图片）",
    async handler(args, ctx) {
      const action = args.trim();
      if (!["on", "off", "status"].includes(action)) {
        ctx.ui.notify("用法：/screenshot-context on | off | status", "warning");
        return;
      }
      const { enabled } = readState(ctx);
      if (action === "status") {
        ctx.ui.notify(`图片上下文过滤：${enabled ? "开启" : "关闭"}。\n${POLICY}`, "info");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("请等待会话空闲后再切换图片上下文过滤。", "warning");
        return;
      }
      const next = action === "on";
      if (next !== enabled) pi.appendEntry(SETTINGS, { version: 1, enabled: next });
      ctx.ui.notify(next
        ? `已开启：保留全部文字和原始历史。\n${POLICY}`
        : "已关闭：后续请求恢复原有行为，可能重新发送历史图片。", "info");
    },
  });

  pi.on("context", (event, ctx) => {
    const state = readState(ctx);
    if (!state.enabled) return;
    return { messages: projectScreenshotContext(event.messages) };
  });
}
