import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Only complete successful responses consume images; interrupted requests remain retryable. */
export function projectScreenshotContext(messages: AgentMessage[]): AgentMessage[] {
  const consumedThrough = messages.findLastIndex((message) =>
    message.role === "assistant" && (message.stopReason === "stop" || message.stopReason === "toolUse"));
  return messages.map((message, index) => {
    if (
      index >= consumedThrough || !["user", "toolResult", "custom"].includes(message.role) ||
      !Array.isArray(message.content) || !message.content.some((block) => block.type === "image")
    ) return message;
    return {
      ...message,
      content: message.content.map((block) => block.type === "image"
        ? { type: "text" as const, text: "[历史图片已省略；文字记录保留。]" }
        : block),
    };
  });
}
