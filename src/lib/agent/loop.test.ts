import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAgentProfile } from "@/lib/domain/factory";
import { runAgentTurn, sanitizeNudge, streamAgentReply } from "./loop";

function mockFetch(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

beforeEach(() => {
  process.env.AI_API_KEY = "sk-test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_KEY;
});

const base = {
  profile: defaultAgentProfile(),
  history: [],
  context: "【今日】0 个任务",
  memoryNotes: [],
};

describe("runAgentTurn", () => {
  it("正常回复 + 合法建议", async () => {
    mockFetch(
      JSON.stringify({
        reply: "今天先做写周报吧。",
        proposals: [{ tool: "create_task", args: { title: "写周报" }, summary: "新建写周报" }],
      }),
    );
    const r = await runAgentTurn({ ...base, userText: "今天先做什么？" });
    expect(r.reply).toBe("今天先做写周报吧。");
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].tool).toBe("create_task");
  });

  it("非法建议被丢弃且不阻塞回复", async () => {
    mockFetch(
      JSON.stringify({
        reply: "好的。",
        proposals: [
          { tool: "hack", args: {} },
          { tool: "create_task", args: { title: "" } },
        ],
      }),
    );
    const r = await runAgentTurn({ ...base, userText: "x" });
    expect(r.proposals).toEqual([]);
    expect(r.reply).toBe("好的。");
  });

  it("输出无法解析时返回兜底文案", async () => {
    mockFetch("抱歉，我无法处理。");
    const r = await runAgentTurn({ ...base, userText: "x" });
    expect(r.reply).toContain("走神");
    expect(r.proposals).toEqual([]);
  });

  it("未配置 key 抛错", async () => {
    delete process.env.AI_API_KEY;
    await expect(runAgentTurn({ ...base, userText: "x" })).rejects.toThrow("AI_API_KEY");
  });

  it("AI 服务错误抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(runAgentTurn({ ...base, userText: "x" })).rejects.toThrow("HTTP 500");
  });
});

describe("streamAgentReply 流式回复", () => {
  function mockStreamAndProposals() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? init.body : "";
        if (body.includes('"stream":true')) {
          const sse =
            "data: " +
            JSON.stringify({ choices: [{ delta: { content: "今天先做" } }] }) +
            "\n\n" +
            "data: " +
            JSON.stringify({ choices: [{ delta: { content: "写周报。" } }] }) +
            "\n\n" +
            "data: [DONE]\n\n";
          return new Response(sse, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    proposals: [
                      { tool: "create_task", args: { title: "写周报" }, summary: "新建写周报" },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  }

  it("逐 token 回调并完成建议二次调用", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockStreamAndProposals();
    const tokens: string[] = [];
    const r = await streamAgentReply(
      { ...base, summary: "", userText: "今天先做什么？" },
      (d) => tokens.push(d),
    );
    expect(tokens.join("")).toBe("今天先做写周报。");
    expect(r.reply).toBe("今天先做写周报。");
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].tool).toBe("create_task");
  });

  it("建议二次调用失败时不阻塞回复", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? init.body : "";
        if (body.includes('"stream":true')) {
          const sse =
            "data: " +
            JSON.stringify({ choices: [{ delta: { content: "好的" } }] }) +
            "\n\ndata: [DONE]\n\n";
          return new Response(sse, { status: 200 });
        }
        return new Response("boom", { status: 500 });
      }),
    );
    const r = await streamAgentReply({ ...base, summary: "", userText: "x" }, () => {});
    expect(r.reply).toBe("好的");
    expect(r.proposals).toEqual([]);
  });
});

describe("sanitizeNudge：一句话就是一句话", () => {
  it("压掉换行与多余空白", () => {
    expect(sanitizeNudge("今天排了 9 条。\n一件没动。")).toBe("今天排了 9 条。 一件没动。");
  });

  it("剥掉包裹的引号与角色前缀", () => {
    expect(sanitizeNudge('「你在逗我吧？」')).toBe("你在逗我吧？");
    expect(sanitizeNudge("马力：你在逗我吧？")).toBe("你在逗我吧？");
  });

  it("去掉代码块", () => {
    expect(sanitizeNudge("说人话```json\n{}\n```")).toBe("说人话");
  });

  it("超长时在句号处截断", () => {
    const long = "第一句很短。" + "啰嗦".repeat(60);
    const out = sanitizeNudge(long, 40)!;
    expect(out.length).toBeLessThanOrEqual(41);
  });

  it("没有句号可断时补省略号", () => {
    const out = sanitizeNudge("啰".repeat(100), 20)!;
    expect(out).toHaveLength(21);
    expect(out.endsWith("…")).toBe(true);
  });

  it("防御：模型把一句话包进 JSON 时自动拆出来", () => {
    expect(sanitizeNudge('{"reply": "你是准备给它办个满月酒？"}')).toBe("你是准备给它办个满月酒？");
    expect(sanitizeNudge('{"text": "21 天了。"}')).toBe("21 天了。");
  });

  it("看起来像 JSON 但不是合法 JSON 时按原样处理", () => {
    expect(sanitizeNudge("{今天排了 9 条")).toBe("{今天排了 9 条");
  });

  it("空内容返回 null（交给兜底文案）", () => {
    expect(sanitizeNudge("   ")).toBeNull();
    expect(sanitizeNudge("```json\n{}\n```")).toBeNull();
  });
});
