import type { ChatMessage } from "@/lib/domain/types";
import { chatWithMessages } from "@/lib/ai/planner";

/**
 * 对话摘要滚动窗口（阶段 C）。
 * 超过阈值时把「旧消息 + 已有摘要」压缩成新的早期摘要，只把最近窗口发给模型，
 * 控制上下文预算的同时保留长期脉络。
 */

export const CHAT_WINDOW = 8;
export const SUMMARIZE_THRESHOLD = 16;

export interface SummarySplit {
  keep: ChatMessage[];
  toSummarize: ChatMessage[];
}

/** 判断是否需要摘要；不需要时返回 null */
export function splitForSummary(messages: ChatMessage[]): SummarySplit | null {
  if (messages.length <= SUMMARIZE_THRESHOLD) return null;
  return {
    keep: messages.slice(-CHAT_WINDOW),
    toSummarize: messages.slice(0, -CHAT_WINDOW),
  };
}

/** 把旧消息（结合已有摘要）压缩成新的早期摘要（LLM 调用） */
export async function summarizeChat(
  prevSummary: string,
  toSummarize: ChatMessage[],
): Promise<string> {
  const dialog = toSummarize
    .map((m) => `${m.role === "user" ? "用户" : "马力"}：${m.content}`)
    .join("\n");
  const system =
    "你是对话摘要器。把「已有摘要 + 新对话」压缩成一段 200 字以内的早期摘要：保留用户的目标、承诺、偏好与关键结论，去掉寒暄与细节。只输出摘要文本，不要 JSON。";
  const prompt = `已有摘要：${prevSummary || "（无）"}\n\n新对话：\n${dialog}`;
  return chatWithMessages([{ role: "user", content: prompt }], system, 0.2);
}
