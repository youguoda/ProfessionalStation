import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/domain/types";
import { readSse, type SseEvent } from "./stream";

function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

const msg: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "hi",
  proposals: [],
  createdAt: "2025-01-01T00:00:00.000Z",
};

describe("readSse", () => {
  it("解析 phase/token/done/proposals 全部事件类型", async () => {
    const res = sseResponse([
      `data: ${JSON.stringify({ type: "phase", phase: "context" })}\n\n`,
      `data: ${JSON.stringify({ type: "phase", phase: "model" })}\n\n`,
      `data: ${JSON.stringify({ type: "token", text: "你" })}\n\n`,
      `data: ${JSON.stringify({ type: "done", messages: [msg] })}\n\n`,
      `data: ${JSON.stringify({ type: "proposals", messages: [msg] })}\n\n`,
    ]);
    const events: SseEvent[] = [];
    await readSse(res, (ev) => events.push(ev));
    expect(events.map((e) => e.type)).toEqual(["phase", "phase", "token", "done", "proposals"]);
    expect(events[0].phase).toBe("context");
    expect(events[2].text).toBe("你");
    expect(events[3].messages).toHaveLength(1);
  });

  it("忽略心跳注释行与无法解析的帧", async () => {
    const res = sseResponse([
      ": ping\n\n",
      "data: not-json\n\n",
      `data: ${JSON.stringify({ type: "done", messages: [] })}\n\n`,
    ]);
    const events: SseEvent[] = [];
    await readSse(res, (ev) => events.push(ev));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  it("跨 chunk 的事件仍能完整解析", async () => {
    // 事件被网络切成任意大小——解析器必须按 \n\n 分帧缓冲
    const payload = `data: ${JSON.stringify({ type: "token", text: "今天" })}\n\ndata: ${JSON.stringify({ type: "done", messages: [] })}\n\n`;
    const mid = Math.floor(payload.length / 3);
    const parts = [payload.slice(0, mid), payload.slice(mid, mid * 2), payload.slice(mid * 2)];
    const events: SseEvent[] = [];
    await readSse(sseResponse(parts), (ev) => events.push(ev));
    expect(events.map((e) => e.type)).toEqual(["token", "done"]);
  });
});
