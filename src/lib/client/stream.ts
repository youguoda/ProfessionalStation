import type { ChatMessage } from "@/lib/domain/types";

/**
 * 客户端 SSE 读取工具：解析服务端 text/event-stream（data: {...} 行）。
 * 心跳为 SSE 注释行（`: ping`），不进 data 解析，天然被忽略。
 */

export interface SseEvent {
  type: "token" | "done" | "error" | "phase" | "proposals" | "reasoning";
  text?: string;
  messages?: ChatMessage[];
  error?: string;
  /** phase 事件的阶段：context = 翻计划数据，model = 已发往模型等首 token */
  phase?: "context" | "model";
}

export async function readSse(
  res: Response,
  onEvent: (ev: SseEvent) => void,
): Promise<void> {
  if (!res.body) throw new Error("响应没有内容");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as SseEvent);
      } catch {
        /* 忽略无法解析的帧 */
      }
    }
  }
}
