import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryNote } from "@/lib/domain/types";
import { extractMemoryFacts, filterNewFacts } from "./facts";

const existing: MemoryNote[] = [
  { id: "1", content: "用户喜欢早上 9 点以后开会", createdAt: "" },
];

describe("filterNewFacts", () => {
  it("与已有笔记互相包含则去重", () => {
    expect(filterNewFacts(["用户喜欢早上 9 点以后开会"], existing)).toEqual([]);
    expect(filterNewFacts(["9 点以后开会"], existing)).toEqual([]);
  });

  it("排除含具体日期的临时任务细节", () => {
    expect(filterNewFacts(["2025-01-20 要交报告"], [])).toEqual([]);
  });

  it("保留新事实并限制条数、空串剔除", () => {
    const r = filterNewFacts(
      ["用户偏好下午深度工作", "用户喜欢跑步", "用户周末不加班", "第四条", "   "],
      [],
      2,
    );
    expect(r).toEqual(["用户偏好下午深度工作", "用户喜欢跑步"]);
  });
});

describe("extractMemoryFacts", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "sk-test";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_API_KEY;
  });

  it("提炼并过滤（去重 + 排除临时细节）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    facts: ["用户偏好下午深度工作", "2025-01-20 交报告", "用户喜欢早上 9 点以后开会"],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const facts = await extractMemoryFacts("我下午效率高", "好的", existing);
    expect(facts).toEqual(["用户偏好下午深度工作"]);
  });

  it("调用失败返回空数组", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await extractMemoryFacts("x", "y", [])).toEqual([]);
  });
});
