import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { projectScreenshotContext } from "./context.ts";

const SETTINGS = "screenshot-context-settings";
const TASK = "screenshot-context-task";
const QUEUE_NOTICE = "兼容模式：执行中的补充消息和排队的后续信息均属当前任务；下次空闲发送消息才切换截图边界。";

// Reconstruct from the active branch, not process memory or abandoned branches.
function readState(ctx: ExtensionContext) {
  const branch = ctx.sessionManager.getBranch();
  let enabled = false;
  let cutoff = -1;
  for (let i = 0; i < branch.length; i++) {
    const entry = branch[i];
    if (entry.type !== "custom") continue;
    if (entry.customType === SETTINGS) {
      const data = entry.data as { version?: unknown; enabled?: unknown } | undefined;
      if (data?.version === 1 && typeof data.enabled === "boolean") {
        enabled = data.enabled;
        cutoff = i;
      }
    } else if (entry.customType === TASK && (entry.data as { version?: unknown } | undefined)?.version === 1) {
      cutoff = i;
    }
  }
  const historicalCallIds = new Set<string>();
  for (let i = 0; i < cutoff; i++) {
    const entry = branch[i];
    if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "phone_screenshot") {
      historicalCallIds.add(entry.message.toolCallId);
    }
  }
  return { enabled, historicalCallIds };
}

export default function screenshotContext(pi: ExtensionAPI) {
  pi.registerCommand("screenshot-context", {
    description: "开启/关闭历史手机截图过滤：on | off | status（排队后续信息暂归当前任务）",
    async handler(args, ctx) {
      const action = args.trim();
      if (!["on", "off", "status"].includes(action)) {
        ctx.ui.notify("用法：/screenshot-context on | off | status", "warning");
        return;
      }
      const { enabled } = readState(ctx);
      if (action === "status") {
        ctx.ui.notify(`截图上下文过滤：${enabled ? "开启" : "关闭"}；仅处理 phone_screenshot。\n${QUEUE_NOTICE}`, "info");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("请等待会话空闲后再切换截图上下文过滤。", "warning");
        return;
      }
      const next = action === "on";
      if (next !== enabled) pi.appendEntry(SETTINGS, { version: 1, enabled: next });
      ctx.ui.notify(next
        ? `已开启：省略历史手机截图，保留当前任务截图和全部文字；历史文件不变。\n${QUEUE_NOTICE}`
        : "已关闭：后续请求恢复原有行为，可能重新发送历史截图。", "info");
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (event.messageType !== "user" || !readState(ctx).enabled) return;
    // shortcut: queued follow-ups share this task, upgrade when Pi exposes delivery metadata.
    pi.appendEntry(TASK, { version: 1 });
  });

  pi.on("context", (event, ctx) => {
    const state = readState(ctx);
    if (!state.enabled) return;
    return { messages: projectScreenshotContext(event.messages, state.historicalCallIds) };
  });
}
