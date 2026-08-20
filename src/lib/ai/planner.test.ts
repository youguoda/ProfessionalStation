import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask } from "@/lib/domain/factory";
import {
  aiBreakdown,
  aiSchedule,
  getAiConfig,
  parseJsonLoose,
  validateAiSchedule,
} from "./planner";

const monday = new Date(2025, 0, 6);

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

describe("validateAiSchedule 校验", () => {
  const candidates = [
    createTask({ title: "a", phase: "action" }),
    createTask({ title: "b", phase: "action" }),
  ];
  const days = ["2025-01-06", "2025-01-07"];
  const hours = [9, 10];

  it("合法建议保留", () => {
    const r = validateAiSchedule(
      [{ taskId: candidates[0].id, date: "2025-01-06", hour: 9 }],
      candidates,
      days,
      hours,
      3,
    );
    expect(r).toEqual([{ taskId: candidates[0].id, scheduledAt: "2025-01-06T09:00:00" }]);
  });

  it("非法 taskId / date / hour 被丢弃", () => {
    const r = validateAiSchedule(
      [
        { taskId: "missing", date: "2025-01-06", hour: 9 },
        { taskId: candidates[0].id, date: "2025-01-13", hour: 9 },
        { taskId: candidates[0].id, date: "2025-01-06", hour: 23 },
      ],
      candidates,
      days,
      hours,
      3,
    );
    expect(r).toEqual([]);
  });

  it("同一天超过 maxPerDay 被丢弃", () => {
    const c3 = createTask({ title: "c", phase: "action" });
    const all = [candidates[0], candidates[1], c3];
    const r = validateAiSchedule(
      [
        { taskId: all[0].id, date: "2025-01-06", hour: 9 },
        { taskId: all[1].id, date: "2025-01-06", hour: 10 },
        { taskId: all[2].id, date: "2025-01-06", hour: 9 },
      ],
      all,
      days,
      hours,
      2,
    );
    expect(r).toHaveLength(2);
  });

  it("重复 taskId 只保留第一条", () => {
    const r = validateAiSchedule(
      [
        { taskId: candidates[0].id, date: "2025-01-06", hour: 9 },
        { taskId: candidates[0].id, date: "2025-01-07", hour: 9 },
      ],
      candidates,
      days,
      hours,
      3,
    );
    expect(r).toHaveLength(1);
    expect(r[0].scheduledAt).toBe("2025-01-06T09:00:00");
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

describe("aiSchedule（mock fetch / 降级）", () => {
  it("未配置 key 降级到启发式", async () => {
    const t = createTask({ title: "x", phase: "action" });
    const r = await aiSchedule([t], monday);
    expect(r.source).toBe("heuristic");
    expect(r.suggestions).toHaveLength(1);
  });

  it("配置 key 且返回合法建议 → source=ai", async () => {
    process.env.AI_API_KEY = "sk-test";
    const t = createTask({ title: "x", phase: "action" });
    mockFetch(JSON.stringify({ suggestions: [{ taskId: t.id, date: "2025-01-06", hour: 9 }] }));
    const r = await aiSchedule([t], monday);
    expect(r.source).toBe("ai");
    expect(r.suggestions).toEqual([{ taskId: t.id, scheduledAt: "2025-01-06T09:00:00" }]);
  });

  it("AI 返回非法建议 → 降级启发式", async () => {
    process.env.AI_API_KEY = "sk-test";
    const t = createTask({ title: "x", phase: "action" });
    mockFetch(JSON.stringify({ suggestions: [{ taskId: "bad", date: "2030-01-01", hour: 99 }] }));
    const r = await aiSchedule([t], monday);
    expect(r.source).toBe("heuristic");
    expect(r.suggestions).toHaveLength(1);
  });

  it("AI 请求失败 → 降级启发式", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const t = createTask({ title: "x", phase: "action" });
    const r = await aiSchedule([t], monday);
    expect(r.source).toBe("heuristic");
    expect(r.suggestions).toHaveLength(1);
  });
});
