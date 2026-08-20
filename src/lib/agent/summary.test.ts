import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/domain/types";
import { CHAT_WINDOW, splitForSummary, SUMMARIZE_THRESHOLD, summarizeChat } from "./summary";

function msg(id: string, role: "user" | "assistant" = "user"): ChatMessage {
  return { id, role, content: `msg-${id}`, proposals: [], createdAt: "" };
}

describe("splitForSummary 滚动窗口", () => {
  it("未超阈值返回 null", () => {
    const msgs = Array.from({ length: SUMMARIZE_THRESHOLD }, (_, i) => msg(String(i)));
    expect(splitForSummary(msgs)).toBeNull();
  });

  it("超阈值：保留最近窗口，其余进入待摘要", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => msg(String(i)));
    const split = splitForSummary(msgs);
    expect(split).not.toBeNull();
    expect(split!.keep).toHaveLength(CHAT_WINDOW);
    expect(split!.toSummarize).toHaveLength(20 - CHAT_WINDOW);
    expect(split!.keep[0].id).toBe("12");
    expect(split!.toSummarize[split!.toSummarize.length - 1].id).toBe("11");
  });
});

describe("summarizeChat", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "sk-test";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_API_KEY;
  });

  it("返回摘要文本", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "用户正在推进周报" } }] }),
          { status: 200 },
        ),
      ),
    );
    const s = await summarizeChat("旧摘要", [msg("1"), msg("2", "assistant")]);
    expect(s).toBe("用户正在推进周报");
  });
});
