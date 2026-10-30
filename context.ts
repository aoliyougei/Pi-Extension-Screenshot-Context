import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Only complete successful responses consume images; interrupted requests remain retryable. */
export function projectScreenshotContext(messages: AgentMessage[]): AgentMessage[] {
  const consumedThrough = messages.findLastIndex((message) =>
    message.role === "assistant" && (message.stopReason === "stop" || message.stopReason === "toolUse"));
  return messages.map((message, index) => {
    if (
      index >= consumedThrough || message.role !== "toolResult" || message.toolName !== "phone_screenshot" ||
      !message.content.some((block) => block.type === "image")
    ) return message;
    return {
      ...message,
      content: message.content.map((block) => block.type === "image"
        ? { type: "text" as const, text: "[历史手机截图已省略；文字记录保留。]" }
        : block),
    };
  });
}
