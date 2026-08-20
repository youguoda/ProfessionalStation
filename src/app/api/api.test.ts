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
import { POST as postAiSchedule } from "./ai/schedule/route";
import { GET as getAgentProfile, PATCH as patchAgentProfile } from "./agent/profile/route";
import { GET as getAgentChat, POST as postAgentChat, DELETE as clearAgentChat } from "./agent/chat/route";
import { POST as postAgentProposalStatus } from "./agent/proposals/route";

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
  it("PATCH settings 更新看板 WIP", async () => {
    const res = await patchSettings(
      jsonReq("/api/settings", { kanbanWip: { todo: 2, doing: 1, done: -1, canceled: -1 } }, "PATCH"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kanbanWip.todo).toBe(2);
    expect(body.kanbanWip.done).toBe(-1);
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
  it("POST /api/automations/run 应用规则并返回任务", async () => {
    await patchSettings(
      jsonReq(
        "/api/settings",
        { automations: { autoFlagOverdueFrog: true, autoClearFrogOnDone: true, staleWaitingReminder: false } },
        "PATCH",
      ),
    );
    await create({ title: "报告", phase: "action", dueDate: "2020-01-01" });
    const res = await runAutomationsRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(1);
    expect(body.notifications.length).toBeGreaterThanOrEqual(1);
    const task = body.tasks.find((t: { title: string }) => t.title === "报告");
    expect(task.isFrog).toBe(true);
  });

  it("PATCH settings 更新自动化开关", async () => {
    const res = await patchSettings(
      jsonReq(
        "/api/settings",
        {
          automations: {
            autoFlagOverdueFrog: false,
            autoClearFrogOnDone: true,
            staleWaitingReminder: true,
          },
        },
        "PATCH",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automations.autoFlagOverdueFrog).toBe(false);
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

  it("schedule 未配置 → 启发式降级", async () => {
    delete process.env.AI_API_KEY;
    await create({ title: "任务", phase: "action" });
    const res = await postAiSchedule();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("heuristic");
    expect(body.suggestions).toHaveLength(1);
  });

  it("schedule 配置 key + mock fetch → source=ai", async () => {
    process.env.AI_API_KEY = "sk-test";
    const t = await create({ title: "任务", phase: "action" });
    // 与服务端一致的「本周一」，保证建议落在合法日期范围
    const now = new Date();
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    // 与服务端 isoDay 一致：用本地日期分量，避免时区偏移
    const mondayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    suggestions: [{ taskId: t.id, date: mondayStr, hour: 9 }],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const res = await postAiSchedule();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("ai");
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].taskId).toBe(t.id);
  });
});

describe("API：马力 Agent", () => {
  it("GET profile 返回默认人格", async () => {
    const res = await getAgentProfile();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("马力");
    expect(body.personaId).toBe("comrade");
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
      { tool: "mark_frog", args: { taskId: "t1", isFrog: true }, summary: "标记青蛙" },
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
