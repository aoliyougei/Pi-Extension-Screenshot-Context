import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Project only request content; source history remains intact. */
export function projectScreenshotContext(
  messages: AgentMessage[],
  historicalCallIds: ReadonlySet<string>,
): AgentMessage[] {
  return messages.map((message) => {
    if (
      message.role !== "toolResult" || message.toolName !== "phone_screenshot" ||
      !historicalCallIds.has(message.toolCallId) || !message.content.some((block) => block.type === "image")
    ) return message;
    return {
      ...message,
      content: message.content.map((block) => block.type === "image"
        ? { type: "text" as const, text: "[历史手机截图已省略；文字记录保留。]" }
        : block),
    };
  });
}
