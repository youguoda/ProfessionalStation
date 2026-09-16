import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiBreakdown, chatWithMessages, getAiConfig, parseJsonLoose, streamChat } from "./planner";

function mockFetch(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

beforeEach(() => {
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  delete process.env.AI_TIMEOUT_MS;
  delete process.env.AI_THINKING_CONTROL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAiConfig", () => {
  it("未配置 key 时 disabled", () => {
    expect(getAiConfig().enabled).toBe(false);
    expect(getAiConfig().model).toBe("deepseek-chat");
  });

  it("配置 key 后 enabled，baseUrl 去尾斜杠", () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_BASE_URL = "https://example.com/v1/";
    process.env.AI_MODEL = "test-model";
    const cfg = getAiConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.baseUrl).toBe("https://example.com/v1");
    expect(cfg.model).toBe("test-model");
  });

  it("超时默认 60s，AI_TIMEOUT_MS 可调，下限 1s", () => {
    expect(getAiConfig().timeoutMs).toBe(60_000);
    process.env.AI_TIMEOUT_MS = "5000";
    expect(getAiConfig().timeoutMs).toBe(5_000);
    process.env.AI_TIMEOUT_MS = "10";
    expect(getAiConfig().timeoutMs).toBe(1_000);
  });
});

describe("思考模式控制", () => {
  function lastBody(): Record<string, unknown> {
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const init = calls[calls.length - 1]?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body ?? "{}"));
  }

  it("thinkingControl 默认开，AI_THINKING_CONTROL=0 关", () => {
    expect(getAiConfig().thinkingControl).toBe(true);
    process.env.AI_THINKING_CONTROL = "0";
    expect(getAiConfig().thinkingControl).toBe(false);
    delete process.env.AI_THINKING_CONTROL;
  });

  it("非流式调用（建议/摘要）始终注入关闭思考（Qwen + GLM 双风格）", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
          status: 200,
        }),
      ),
    );
    await chatWithMessages([{ role: "user", content: "x" }]);
    expect(lastBody().chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(lastBody().thinking).toEqual({ type: "disabled" });
  });

  it("AI_THINKING_CONTROL=0 时不注入（端点不兼容时逃生）", async () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_THINKING_CONTROL = "0";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
          status: 200,
        }),
      ),
    );
    await chatWithMessages([{ role: "user", content: "x" }]);
    expect(lastBody().chat_template_kwargs).toBeUndefined();
    delete process.env.AI_THINKING_CONTROL;
  });

  it("streamChat：thinking=false 注入关闭；true 不注入（交给服务端默认）", async () => {
    process.env.AI_API_KEY = "sk-test";
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "好" } }] })}\n\ndata: [DONE]\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sse, { status: 200 })),
    );
    for await (const _ of streamChat([{ role: "user", content: "x" }], "s", 0.7, { thinking: false })) {
      void _;
    }
    expect(lastBody().chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(lastBody().thinking).toEqual({ type: "disabled" });

    for await (const _ of streamChat([{ role: "user", content: "x" }], "s", 0.7, { thinking: true })) {
      void _;
    }
    expect(lastBody().chat_template_kwargs).toBeUndefined();
  });
});

describe("上游错误透传", () => {
  it("非 2xx 时带上上游错误详情（如余额不足）", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: "1113", message: "余额不足或无可用资源包,请充值。" } }),
            { status: 429 },
          ),
      ),
    );
    await expect(chatWithMessages([{ role: "user", content: "x" }])).rejects.toThrow(
      /HTTP 429：余额不足/,
    );
  });

  it("响应体不可解析时退回纯状态码", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(chatWithMessages([{ role: "user", content: "x" }])).rejects.toThrow(
      "AI 服务返回错误（HTTP 500）",
    );
  });
});

describe("超时中断", () => {
  it("超时后抛出可读错误而不是无限悬着", async () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_TIMEOUT_MS = "80";
    // 模拟真实 fetch 的 abort 行为：signal 触发时以 TimeoutError 拒绝
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("signal timed out", "TimeoutError")),
            );
          }),
      ),
    );
    await expect(chatWithMessages([{ role: "user", content: "hi" }])).rejects.toThrow(
      /AI 请求超时/,
    );
  });
});

describe("parseJsonLoose", () => {
  it("裸 JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("json 代码块", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("文本中嵌入 JSON", () => {
    expect(parseJsonLoose('好的，结果是 {"a": 1}，请查收。')).toEqual({ a: 1 });
  });

  it("无法解析返回 null", () => {
    expect(parseJsonLoose("这不是 JSON")).toBeNull();
    expect(parseJsonLoose("")).toBeNull();
  });
});

describe("aiBreakdown（mock fetch）", () => {
  it("未配置 key 抛错", async () => {
    await expect(aiBreakdown("写周报", "")).rejects.toThrow("未配置 AI_API_KEY");
  });

  it("解析 titles", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetch('{"titles":["收集数据","整理要点","撰写初稿"]}');
    expect(await aiBreakdown("写周报", "")).toEqual({
      question: null,
      titles: ["收集数据", "整理要点", "撰写初稿"],
    });
  });

  it("信息不足时先反问，不给清单", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetch('{"question":"这周报是给谁看的？","titles":[]}');
    expect(await aiBreakdown("写周报", "")).toEqual({
      question: "这周报是给谁看的？",
      titles: [],
    });
  });

  it("已经答过一轮就以清单为准，question 被丢弃", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetch('{"question":"还想再问一句","titles":["收集数据"]}');
    expect(
      await aiBreakdown("写周报", "", [
        { role: "assistant", content: "给谁看？" },
        { role: "user", content: "给老板" },
      ]),
    ).toEqual({ question: null, titles: ["收集数据"] });
  });

  it("AI 返回无效内容时抛错", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetch("抱歉，我无法处理。");
    await expect(aiBreakdown("写周报", "")).rejects.toThrow("AI 未返回有效的子任务清单");
  });

  it("既没问题也没清单时抛错", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetch('{"question":"","titles":[]}');
    await expect(aiBreakdown("写周报", "")).rejects.toThrow("AI 未返回有效的子任务清单");
  });
});

describe("streamChat 流式解析", () => {
  function mockStream(chunks: string[]) {
    const sse =
      chunks
        .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
        .join("") + "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      ),
    );
  }

  it("逐段产出 delta 并在 [DONE] 结束", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockStream(["你", "好", "！"]);
    const parts: string[] = [];
    for await (const delta of streamChat([{ role: "user", content: "x" }], "sys")) {
      parts.push(delta.content ?? "");
    }
    expect(parts).toEqual(["你", "好", "！"]);
  });

  it("reasoning_content 思考增量单独产出（先于正文）", async () => {
    process.env.AI_API_KEY = "sk-test";
    const sse =
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "先想想" } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "继续想" } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "答案" } }] })}\n\n` +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      ),
    );
    const parts: Array<{ reasoning?: string; content?: string }> = [];
    for await (const delta of streamChat([{ role: "user", content: "x" }])) parts.push(delta);
    expect(parts).toEqual([
      { reasoning: "先想想" },
      { reasoning: "继续想" },
      { content: "答案" },
    ]);
  });

  it("上游错误状态抛错", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const gen = streamChat([{ role: "user", content: "x" }], "sys");
    await expect(gen.next()).rejects.toThrow("HTTP 500");
  });
});

describe("chatWithMessages 的输出格式开关", () => {
  /** 捕获实际发出的请求体 */
  function captureFetch(content = "ok") {
    const spy = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  function bodyOf(spy: ReturnType<typeof captureFetch>): Record<string, unknown> {
    return JSON.parse(String(spy.mock.calls[0]?.[1]?.body ?? "{}"));
  }

  beforeEach(() => {
    process.env.AI_API_KEY = "sk-test";
    delete process.env.AI_JSON_MODE;
  });

  it("默认 json 模式带 response_format（结构化路径依赖它）", async () => {
    const spy = captureFetch('{"a":1}');
    await chatWithMessages([{ role: "user", content: "x" }], "sys");
    expect(bodyOf(spy).response_format).toEqual({ type: "json_object" });
  });

  it("text 模式不带 response_format——否则模型会把一句话包进 JSON，且部分服务会 400", async () => {
    const spy = captureFetch("一句话");
    const out = await chatWithMessages([{ role: "user", content: "x" }], "sys", 0.9, "text");
    expect(bodyOf(spy).response_format).toBeUndefined();
    expect(bodyOf(spy).temperature).toBe(0.9);
    expect(out).toBe("一句话");
  });

  it("AI_JSON_MODE=0 时 json 路径也不带 response_format（内网端点常不认这个字段）", async () => {
    process.env.AI_JSON_MODE = "0";
    const spy = captureFetch('{"a":1}');
    const out = await chatWithMessages([{ role: "user", content: "x" }], "sys");
    expect(bodyOf(spy).response_format).toBeUndefined();
    // 关掉字段不等于放弃 JSON：仍然要能拿到内容交给 parseJsonLoose 兜底
    expect(out).toBe('{"a":1}');
  });
});
