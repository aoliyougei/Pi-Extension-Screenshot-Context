import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { identifyImages, payloadImageHashes, projectScreenshotContext, type ImageInstance } from "./context.ts";

const SETTINGS = "screenshot-context-settings";
const RECEIPT = "screenshot-context-receipt";
const POLICY = "覆盖用户及所有工具图片；工具调用期间保留图片，仅在观察到请求图片且最终 stop 回复后记录消费，不代表已保存识别结果。";

function readState(ctx: ExtensionContext) {
  const branch = ctx.sessionManager.getBranch();
  let enabled = false;
  const consumed = new Set<string>();
  const assistantIds = new Set(branch.filter(e => e.type === "message" && e.message.role === "assistant" &&
    ["stop", "toolUse"].includes(e.message.stopReason)).map(e => e.id));
  for (const entry of branch) {
    if (entry.type !== "custom") continue;
    const data = entry.data as any;
    if (entry.customType === SETTINGS && data?.version === 1 && typeof data.enabled === "boolean") enabled = data.enabled;
    if (entry.customType === RECEIPT && data?.version === 1 && assistantIds.has(data.assistantEntryId) && Array.isArray(data.imageIds)) {
      for (const id of data.imageIds) if (typeof id === "string") consumed.add(id);
    }
  }
  return { enabled, consumed, branch };
}

export default function screenshotContext(pi: ExtensionAPI) {
  let request: { session: string; leaf: string | null; images: ImageInstance[]; observed: string[]; payloadCalls: number } | undefined;
  const clear = () => { request = undefined; };
  pi.on("session_start", clear);
  pi.on("session_tree", clear);
  pi.on("agent_settled", clear);

  pi.registerCommand("screenshot-context", {
    description: "历史图片过滤：on | off | status（请求观察与成功响应关联）",
    async handler(args, ctx) {
      const action = args.trim();
      if (!["on", "off", "status"].includes(action)) {
        ctx.ui.notify("用法：/screenshot-context on | off | status", "warning");
        return;
      }
      const state = readState(ctx);
      if (action === "status") {
        ctx.ui.notify(`图片上下文过滤：${state.enabled ? "开启" : "关闭"}；本分支记录 ${state.consumed.size} 个图片实例。\n${POLICY}\n无记录的旧图保守保留，载荷观察不等于最终网络送达。`, "info");
        return;
      }
      if (!ctx.isIdle()) { ctx.ui.notify("请等待会话空闲后再切换图片上下文过滤。", "warning"); return; }
      clear();
      const next = action === "on";
      if (next !== state.enabled) pi.appendEntry(SETTINGS, { version: 1, enabled: next });
      ctx.ui.notify(next ? `已开启。${POLICY}` : "已关闭：可能重新发送历史图片。", "info");
    },
  });

  pi.on("context", (event, ctx) => {
    clear();
    const state = readState(ctx);
    if (!state.enabled) return;
    const images = identifyImages(event.messages, state.branch);
    request = { session: ctx.sessionManager.getSessionId(), leaf: ctx.sessionManager.getLeafId(), images: images.filter(i => !state.consumed.has(i.id)), observed: [], payloadCalls: 0 };
    return { messages: projectScreenshotContext(event.messages, images, state.consumed) };
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!request || request.session !== ctx.sessionManager.getSessionId()) return;
    request.payloadCalls++;
    request.observed = [];
    // Multiple calls per context may be transport retries or unrelated nested calls: do not guess.
    if (request.payloadCalls !== 1) return;
    const hashes = payloadImageHashes(event.payload);
    const candidates = new Map<string, number>();
    for (const image of request.images) candidates.set(image.hash, (candidates.get(image.hash) ?? 0) + 1);
    // Identical bytes in several instances are ambiguous when a later hook removed one.
    request.observed = request.images.filter(i => hashes.get(i.hash) === candidates.get(i.hash)).map(i => i.id);
  });

  pi.on("turn_end", (event, ctx) => {
    const current = request;
    clear();
    if (!current || current.payloadCalls !== 1 || current.session !== ctx.sessionManager.getSessionId() ||
      event.message.role !== "assistant" || event.message.stopReason !== "stop" || !current.observed.length) return;
    const branch = ctx.sessionManager.getBranch();
    const responseIndex = branch.findIndex(e => e.id === event.messageEntryId);
    const leafIndex = current.leaf === null ? -1 : branch.findIndex(e => e.id === current.leaf);
    if (responseIndex < 0 || (current.leaf !== null && leafIndex < 0) || responseIndex <= leafIndex) return;
    if (!readState(ctx).enabled) return;
    pi.appendEntry(RECEIPT, { version: 1, assistantEntryId: event.messageEntryId, imageIds: current.observed });
  });
}
