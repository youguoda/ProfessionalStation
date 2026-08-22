import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempStore } from "@/test/tmpStore";
import { GET as getBootstrap } from "./bootstrap/route";
import { POST as postTask } from "./tasks/route";
import { PATCH as patchTask, DELETE as deleteTask } from "./tasks/[id]/route";
import { POST as postTransition } from "./tasks/[id]/transition/route";
import { POST as postProject } from "./projects/route";
import { PATCH as patchProject } from "./projects/[id]/route";
import { POST as postArea } from "./areas/route";
import { POST as postTag } from "./tags/route";
import { PATCH as patchSettings } from "./settings/route";
import { POST as postHabit } from "./habits/route";
import { DELETE as deleteHabitRoute } from "./habits/[id]/route";
import { POST as postCheck } from "./habits/[id]/check/route";
import { POST as runAutomationsRoute } from "./automations/run/route";
import { GET as getAiStatus } from "./ai/status/route";
import { POST as postAiBreakdown } from "./ai/breakdown/route";
import { GET as getAgentProfile, PATCH as patchAgentProfile } from "./agent/profile/route";
import { GET as getAgentChat, POST as postAgentChat, DELETE as clearAgentChat } from "./agent/chat/route";
import { POST as postAgentProposalStatus } from "./agent/proposals/route";
import { GET as getNudge, POST as postNudgeDismiss } from "./agent/nudge/route";
import { GET as exportRoute } from "./export/route";
import { GET as getReviews, PATCH as patchReviewDraft } from "./reviews/route";

const ts = createTempStore();
beforeEach(() => ts.reset());
afterAll(() => ts.cleanup());
afterEach(() => vi.unstubAllGlobals());

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(`http://test${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function create(body: Record<string, unknown>) {
  const res = await postTask(jsonReq("/api/tasks", body));
  return res.json() as Promise<{ id: string } & Record<string, unknown>>;
}

describe("API：任务校验", () => {
  it("空标题返回 400", async () => {
    const res = await postTask(jsonReq("/api/tasks", {}));
    expect(res.status).toBe(400);
  });

  it("合法创建返回 201 与收件箱任务", async () => {
    const res = await postTask(jsonReq("/api/tasks", { title: "买牛奶" }));
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.title).toBe("买牛奶");
    expect(task.phase).toBe("inbox");
    expect(task.status).toBe("todo");
    expect(task.id).toBeTruthy();
  });
});

describe("API：状态机流转", () => {
  it("clarify → action 返回 200", async () => {
    const t = await create({ title: "x" });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "clarify", target: "action" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).task.phase).toBe("action");
  });

  it("reference 完成返回 409", async () => {
    const t = await create({ title: "x", phase: "reference" });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "complete" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(409);
  });

  it("非法事件类型返回 400", async () => {
    const t = await create({ title: "x" });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "unknown" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("API：依赖阻断", () => {
  it("start 被阻塞返回 409 与精确错误", async () => {
    const dep = await create({ title: "前置", phase: "action" });
    const t = await create({ title: "后续", phase: "action", blockedBy: [dep.id] });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "start" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("存在未完成的依赖任务，无法开始");
  });
});

describe("API：重复任务", () => {
  it("完成 daily 后 bootstrap 出现下一次", async () => {
    const t = await create({ title: "站会", phase: "action", repeatRule: "daily", dueDate: "2025-01-15" });
    await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "complete" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    const db = await (await getBootstrap()).json();
    const spawned = db.tasks.find((x: { id: string; title: string }) => x.id !== t.id && x.title === "站会");
    expect(spawned).toBeDefined();
    expect(spawned.dueDate).toBe("2025-01-16");
    expect(spawned.phase).toBe("action");
  });
});

describe("API：PATCH / DELETE", () => {
  it("PATCH 未知 id 返回 404", async () => {
    const res = await patchTask(jsonReq("/api/tasks/missing", { title: "x" }, "PATCH"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE 软删除后 bootstrap 仍含该任务且 phase=trash", async () => {
    const t = await create({ title: "x" });
    const res = await deleteTask(new Request("http://test"), {
      params: Promise.resolve({ id: t.id as string }),
    });
    expect(res.status).toBe(200);
    const db = await (await getBootstrap()).json();
    const found = db.tasks.find((x: { id: string }) => x.id === t.id);
    expect(found.phase).toBe("trash");
  });
});

describe("API：项目/领域/标签/bootstrap", () => {
  it("空项目名返回 400", async () => {
    const res = await postProject(jsonReq("/api/projects", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("合法项目/领域/标签返回 201", async () => {
    expect((await postProject(jsonReq("/api/projects", { name: "P" }))).status).toBe(201);
    expect((await postArea(jsonReq("/api/areas", { name: "健康" }))).status).toBe(201);
    expect((await postTag(jsonReq("/api/tags", { name: "home", kind: "context" }))).status).toBe(201);
  });

  it("bootstrap 返回完整结构", async () => {
    const db = await (await getBootstrap()).json();
    expect(Array.isArray(db.tasks)).toBe(true);
    expect(Array.isArray(db.projects)).toBe(true);
    expect(Array.isArray(db.areas)).toBe(true);
    expect(Array.isArray(db.tags)).toBe(true);
    expect(Array.isArray(db.weeklyReviews)).toBe(true);
    expect(db.settings).toBeDefined();
  });
});

describe("API：依赖成环防护", () => {
  it("PATCH 自依赖返回 400 与精确错误", async () => {
    const a = await create({ title: "a", phase: "action" });
    const res = await patchTask(
      jsonReq(`/api/tasks/${a.id}`, { blockedBy: [a.id] }, "PATCH"),
      { params: Promise.resolve({ id: a.id as string }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("不能添加该依赖：会造成自依赖或循环依赖");
  });
});

describe("API：设置与项目归档", () => {
  it("PATCH settings 更新约束（今日上限 / WIP 上限 / 停滞阈值）", async () => {
    const res = await patchSettings(
      jsonReq("/api/settings", { maxToday: 5, maxDoing: 2, staleDays: 14 }, "PATCH"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.maxToday).toBe(5);
    expect(body.maxDoing).toBe(2);
    expect(body.staleDays).toBe(14);
  });

  it("PATCH settings 约束值越界时被夹紧", async () => {
    const res = await patchSettings(
      jsonReq("/api/settings", { maxToday: 999, maxDoing: 0, staleDays: -3 }, "PATCH"),
    );
    const body = await res.json();
    expect(body.maxToday).toBe(20);
    expect(body.maxDoing).toBe(1);
    expect(body.staleDays).toBe(1);
  });

  it("PATCH 项目归档与恢复", async () => {
    const p = await (await postProject(jsonReq("/api/projects", { name: "P" }))).json();
    const r1 = await patchProject(
      jsonReq(`/api/projects/${p.id}`, { archived: true }, "PATCH"),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect(r1.status).toBe(200);
    expect((await r1.json()).archived).toBe(true);
    const r2 = await patchProject(
      jsonReq(`/api/projects/${p.id}`, { archived: false }, "PATCH"),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect((await r2.json()).archived).toBe(false);
  });
});

describe("API：习惯", () => {
  it("POST /api/habits 空名 400、合法 201", async () => {
    expect((await postHabit(jsonReq("/api/habits", {}))).status).toBe(400);
    const res = await postHabit(jsonReq("/api/habits", { name: "阅读", icon: "📚" }));
    expect(res.status).toBe(201);
    const habit = await res.json();
    expect(habit.name).toBe("阅读");
    expect(habit.icon).toBe("📚");
  });

  it("toggle check 打卡/取消，未知习惯 404", async () => {
    const h = await (await postHabit(jsonReq("/api/habits", { name: "运动" }))).json();
    const r1 = await postCheck(
      jsonReq(`/api/habits/${h.id}/check`, { date: "2025-01-08" }),
      { params: Promise.resolve({ id: h.id }) },
    );
    expect(r1.status).toBe(200);
    expect((await r1.json()).checked).toBe(true);
    const r2 = await postCheck(
      jsonReq(`/api/habits/${h.id}/check`, { date: "2025-01-08" }),
      { params: Promise.resolve({ id: h.id }) },
    );
    expect((await r2.json()).checked).toBe(false);
    const r3 = await postCheck(
      jsonReq("/api/habits/missing/check", { date: "2025-01-08" }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(r3.status).toBe(404);
  });

  it("非法日期格式 400", async () => {
    const h = await (await postHabit(jsonReq("/api/habits", { name: "x" }))).json();
    const res = await postCheck(
      jsonReq(`/api/habits/${h.id}/check`, { date: "01-08" }),
      { params: Promise.resolve({ id: h.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE 习惯返回 200", async () => {
    const h = await (await postHabit(jsonReq("/api/habits", { name: "x" }))).json();
    const res = await deleteHabitRoute(new Request("http://test"), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(200);
  });
});

describe("API：自动化", () => {
  it("POST /api/automations/run 清除已结束任务的承诺日", async () => {
    const t = await create({ title: "报告", phase: "action", plannedFor: "2025-01-08" });
    await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "complete" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    // 完成时已自动清一次，这里再造一条「已完成但仍占额度」的脏数据
    await patchTask(
      jsonReq(`/api/tasks/${t.id}`, { plannedFor: "2025-01-08" }, "PATCH"),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    const res = await runAutomationsRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(1);
    const task = body.tasks.find((x: { title: string }) => x.title === "报告");
    expect(task.plannedFor).toBeNull();
  });

  it("PATCH settings 更新自动化开关", async () => {
    const res = await patchSettings(
      jsonReq(
        "/api/settings",
        { automations: { autoClearPlanOnDone: false, staleWaitingReminder: true } },
        "PATCH",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automations.autoClearPlanOnDone).toBe(false);
    expect(body.automations.staleWaitingReminder).toBe(true);
  });
});

describe("API：AI", () => {
  it("status 未配置时 enabled=false", async () => {
    delete process.env.AI_API_KEY;
    const res = await getAiStatus();
    expect(res.status).toBe(200);
    expect((await res.json()).enabled).toBe(false);
  });

  it("status 配置后 enabled=true 且返回 model", async () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_MODEL = "test-model";
    const body = await (await getAiStatus()).json();
    expect(body.enabled).toBe(true);
    expect(body.model).toBe("test-model");
  });

  it("breakdown 未配置 key → 503", async () => {
    delete process.env.AI_API_KEY;
    const res = await postAiBreakdown(jsonReq("/api/ai/breakdown", { title: "写周报", notes: "" }));
    expect(res.status).toBe(503);
  });

  it("breakdown 空标题 → 400", async () => {
    const res = await postAiBreakdown(jsonReq("/api/ai/breakdown", { title: "", notes: "" }));
    expect(res.status).toBe(400);
  });

  it("breakdown 配置 key + mock fetch → titles", async () => {
    process.env.AI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"titles":["收集数据","撰写初稿"]}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const res = await postAiBreakdown(jsonReq("/api/ai/breakdown", { title: "写周报", notes: "" }));
    expect(res.status).toBe(200);
    expect((await res.json()).titles).toEqual(["收集数据", "撰写初稿"]);
  });

});

describe("API：马力 Agent", () => {
  it("GET profile 返回默认人格", async () => {
    const res = await getAgentProfile();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("马力");
    expect(body.personaId).toBe("roaster");
    expect(Array.isArray(body.custom.role)).toBe(true);
  });

  it("PATCH profile 保存人格，非法 personaId 400", async () => {
    const ok = await patchAgentProfile(
      jsonReq("/api/agent/profile", { name: "小马", personaId: "stern", custom: { role: ["你是老马"] } }, "PATCH"),
    );
    expect(ok.status).toBe(200);
    const saved = await ok.json();
    expect(saved.name).toBe("小马");
    expect(saved.personaId).toBe("stern");
    expect(saved.custom.role).toEqual(["你是老马"]);

    const bad = await patchAgentProfile(
      jsonReq("/api/agent/profile", { personaId: "unknown" }, "PATCH"),
    );
    expect(bad.status).toBe(400);
  });

  it("chat 未配置 key → 503；空消息 → 400", async () => {
    delete process.env.AI_API_KEY;
    expect(
      (await postAgentChat(jsonReq("/api/agent/chat", { text: "你好" }))).status,
    ).toBe(503);
    expect((await postAgentChat(jsonReq("/api/agent/chat", { text: "" }))).status).toBe(400);
  });

  // 阶段 C：chat 为 SSE 流式。mock 上游：stream 调用返回 SSE 增量，其余返回 proposals JSON。
  function mockAgentFetch(deltas: string[], proposals: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? init.body : "";
        if (body.includes('"stream":true')) {
          const sse =
            deltas
              .map(
                (c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`,
              )
              .join("") + "data: [DONE]\n\n";
          return new Response(sse, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ proposals }) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  }

  async function parseSseDone(res: Response): Promise<{
    messages: Array<Record<string, unknown> & { id: string; content: string; role: string; proposals: Array<Record<string, unknown>> }>;
  }> {
    const raw = await res.text();
    const doneLine = raw
      .split("\n\n")
      .map((s) => s.trim())
      .find((s) => s.startsWith("data: ") && s.includes('"type":"done"'));
    expect(doneLine).toBeDefined();
    return JSON.parse(doneLine!.slice(5).trim());
  }

  it("chat 配置 key + mock fetch → SSE 流式追加消息与待确认建议", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockAgentFetch(["今天先做", "写周报吧。"], [
      { tool: "create_task", args: { title: "写周报" }, summary: "新建写周报任务" },
    ]);
    const res = await postAgentChat(jsonReq("/api/agent/chat", { text: "今天先做什么？" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const raw = await res.clone().text();
    expect(raw).toContain('"type":"token"');
    const done = await parseSseDone(res);
    const messages = done.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("今天先做写周报吧。");
    expect(messages[1].proposals).toHaveLength(1);
    expect(messages[1].proposals[0].status).toBe("pending");
    expect(messages[1].proposals[0].tool).toBe("create_task");
  });

  it("proposal 状态流转：approve 幂等、未知 404、参数不合法 400", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockAgentFetch(["建议完成这个任务。"], [
      { tool: "plan_today", args: { taskId: "t1", day: "2025-01-08" }, summary: "放进今天" },
    ]);
    const res = await postAgentChat(jsonReq("/api/agent/chat", { text: "x" }));
    const done = await parseSseDone(res);
    const msg = done.messages[1];
    const pid = msg.proposals[0].id;

    const r1 = await postAgentProposalStatus(
      jsonReq("/api/agent/proposals", { messageId: msg.id, proposalId: pid, status: "approved" }),
    );
    expect(r1.status).toBe(200);
    expect((await r1.json()).proposals[0].status).toBe("approved");

    // 幂等：再次 approve 不报错
    const r2 = await postAgentProposalStatus(
      jsonReq("/api/agent/proposals", { messageId: msg.id, proposalId: pid, status: "denied" }),
    );
    expect(r2.status).toBe(200);
    expect((await r2.json()).proposals[0].status).toBe("approved");

    const missing = await postAgentProposalStatus(
      jsonReq("/api/agent/proposals", { messageId: "m", proposalId: "p", status: "approved" }),
    );
    expect(missing.status).toBe(404);

    const invalid = await postAgentProposalStatus(
      jsonReq("/api/agent/proposals", { messageId: msg.id, proposalId: pid, status: "weird" }),
    );
    expect(invalid.status).toBe(400);
  });

  it("DELETE chat 清空对话", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockAgentFetch(["好"], []);
    const res = await postAgentChat(jsonReq("/api/agent/chat", { text: "x" }));
    await parseSseDone(res);
    expect((await (await getAgentChat()).json()).length).toBe(2);
    expect((await clearAgentChat()).status).toBe(200);
    expect((await (await getAgentChat()).json()).length).toBe(0);
  });
});

describe("API：教练层（罕见 / 一天一次 / 可关）", () => {
  it("系统健康时不说话（与运行时刻无关）", async () => {
    // start 会把任务放进今天并进入在制：既不是「今天空着」也不是「一件没动」
    const t = await create({ title: "正常", phase: "action" });
    await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "start" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    const body = await (await getNudge()).json();
    expect(body.nudge).toBeNull();
  });

  it("关掉教练模式后一律不说话", async () => {
    await patchSettings(jsonReq("/api/settings", { coachEnabled: false }, "PATCH"));
    for (let i = 0; i < 12; i++) await create({ title: `i${i}` }); // 收件箱堆积
    const body = await (await getNudge()).json();
    expect(body.nudge).toBeNull();
  });

  it("有模式成立时说一句，且当天重复请求复用同一条", async () => {
    delete process.env.AI_API_KEY; // 未配置 AI → 用内置兜底文案
    for (let i = 0; i < 12; i++) await create({ title: `i${i}` });

    const first = (await (await getNudge()).json()).nudge;
    expect(first).not.toBeNull();
    expect(first.kind).toBe("inboxPileup");
    expect(first.text.length).toBeGreaterThan(0);
    expect(first.dismissed).toBe(false);

    const second = (await (await getNudge()).json()).nudge;
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt); // 没有重新生成
  });

  it("忽略之后当天闭嘴", async () => {
    delete process.env.AI_API_KEY;
    for (let i = 0; i < 12; i++) await create({ title: `i${i}` });
    const nudge = (await (await getNudge()).json()).nudge;

    const dismissed = await postNudgeDismiss(jsonReq("/api/agent/nudge", { id: nudge.id }));
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).nudge.dismissed).toBe(true);

    expect((await (await getNudge()).json()).nudge).toBeNull();
  });

  it("忽略请求缺 id 返回 400", async () => {
    const res = await postNudgeDismiss(jsonReq("/api/agent/nudge", {}));
    expect(res.status).toBe(400);
  });
});

describe("API：导出 / 周回顾草稿 / 承诺日", () => {
  it("export json/csv/md 内容与未知格式 400", async () => {
    await create({ title: "导出我", phase: "action" });

    const json = await exportRoute(new Request("http://test/api/export?format=json"));
    expect(json.status).toBe(200);
    const db = await json.json();
    expect(db.tasks.some((t: { title: string }) => t.title === "导出我")).toBe(true);

    const csv = await exportRoute(new Request("http://test/api/export?format=csv"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("导出我");

    const md = await exportRoute(new Request("http://test/api/export?format=md"));
    expect(md.status).toBe(200);
    expect(await md.text()).toContain("导出我");

    const bad = await exportRoute(new Request("http://test/api/export?format=xml"));
    expect(bad.status).toBe(400);
  });

  it("reviews GET 返回草稿、PATCH 保存草稿", async () => {
    const r1 = await getReviews();
    expect(r1.status).toBe(200);
    const { reviews, draft } = await r1.json();
    expect(Array.isArray(reviews)).toBe(true);
    expect(draft).toEqual({ checklist: {}, notes: "" });

    const r2 = await patchReviewDraft(
      jsonReq("/api/reviews", { checklist: { a: true }, notes: "复盘草稿" }, "PATCH"),
    );
    expect(r2.status).toBe(200);
    expect((await r2.json()).notes).toBe("复盘草稿");
    const again = await (await getReviews()).json();
    expect(again.draft.checklist).toEqual({ a: true });
  });

  it("PATCH plannedFor 校验日期格式（非法拒绝 / 合法通过 / null 清除）", async () => {
    const t = await create({ title: "承诺任务", phase: "action" });
    const bad = await patchTask(
      jsonReq(`/api/tasks/${t.id}`, { plannedFor: "明天" }, "PATCH"),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(bad.status).toBe(400);

    const good = await patchTask(
      jsonReq(`/api/tasks/${t.id}`, { plannedFor: "2025-01-08" }, "PATCH"),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(good.status).toBe(200);
    expect((await good.json()).plannedFor).toBe("2025-01-08");

    const cleared = await patchTask(
      jsonReq(`/api/tasks/${t.id}`, { plannedFor: null }, "PATCH"),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect((await cleared.json()).plannedFor).toBeNull();
  });
});
