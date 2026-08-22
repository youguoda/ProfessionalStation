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
    expect(await aiBreakdown("写周报", "")).toEqual(["收集数据", "整理要点", "撰写初稿"]);
  });

  it("AI 返回无效内容时抛错", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetch("抱歉，我无法处理。");
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
      parts.push(delta);
    }
    expect(parts).toEqual(["你", "好", "！"]);
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
});
