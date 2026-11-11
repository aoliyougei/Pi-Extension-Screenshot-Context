import { createHash } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const OMITTED_IMAGE = "[此图片已按上下文策略省略；仅保留原消息文字，不代表已保存图片识别结果。需要查看时请重新读取。]";
export const imageHash = (data: string) => createHash("sha256").update(data).digest("hex");

export function imageData(block: unknown): string | undefined {
  if (!block || typeof block !== "object") return;
  const b = block as Record<string, any>;
  if (b.type !== "image") return;
  if (typeof b.data === "string") return b.data;
  if (b.source?.type === "base64" && typeof b.source.data === "string") return b.source.data;
}

export type ImageInstance = { id: string; hash: string; messageIndex: number; blockIndex: number };

/** No identity guessing: unmapped request-only images remain visible and unconsumed. */
export function identifyImages(messages: AgentMessage[], branch: readonly any[]): ImageInstance[] {
  const images: ImageInstance[] = [];
  messages.forEach((message, messageIndex) => {
    if (!["user", "toolResult", "custom"].includes(message.role) || !Array.isArray(message.content)) return;
    const entries = branch.filter(entry => {
      const original = entry.type === "message" ? entry.message : undefined;
      return original?.role === message.role && original.timestamp === message.timestamp &&
        (message.role !== "toolResult" || original.toolCallId === message.toolCallId);
    });
    if (entries.length !== 1) return;
    message.content.forEach((block, blockIndex) => {
      const data = imageData(block);
      if (!data) return;
      const originalData = imageData(entries[0].message.content?.[blockIndex]);
      if (originalData !== data) return;
      const hash = imageHash(data);
      images.push({ id: `${entries[0].id}:${blockIndex}:${hash}`, hash, messageIndex, blockIndex });
    });
  });
  return images;
}

/** Only explicit receipts expire images, never the presence of a later assistant response. */
export function projectScreenshotContext(messages: AgentMessage[], images: ImageInstance[] = [], consumed: ReadonlySet<string> = new Set()): AgentMessage[] {
  const omit = new Set(images.filter(image => consumed.has(image.id)).map(image => `${image.messageIndex}:${image.blockIndex}`));
  return messages.map((message, i) => {
    if (!Array.isArray(message.content) || !images.some(image => image.messageIndex === i && consumed.has(image.id))) return message;
    return { ...message, content: message.content.map((block, j) => omit.has(`${i}:${j}`) ? { type: "text", text: OMITTED_IMAGE } : block) } as AgentMessage;
  });
}

/** Recognize inline images in common OpenAI/Responses/Anthropic/Gemini payloads only. */
export function payloadImageHashes(payload: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (data: string) => { const hash = imageHash(data); counts.set(hash, (counts.get(hash) ?? 0) + 1); };
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (value.type === "image" && value.source?.type === "base64" && typeof value.source.data === "string") add(value.source.data);
    if (["image_url", "input_image"].includes(value.type)) {
      const url = typeof value.image_url === "string" ? value.image_url : value.image_url?.url;
      const match = typeof url === "string" ? /^data:image\/[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(url) : null;
      if (match) add(match[1]);
    }
    const inline = value.inlineData ?? value.inline_data;
    if (inline && typeof inline.data === "string" && /^image\//.test(inline.mimeType ?? inline.mime_type ?? "")) add(inline.data);
    for (const child of Object.values(value)) if (child && typeof child === "object") {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  };
  visit(payload);
  return counts;
}
