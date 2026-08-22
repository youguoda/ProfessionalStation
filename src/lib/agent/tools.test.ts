import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, proposalLabel, toolsPrompt, validateProposal } from "./tools";

describe("tools 工具集", () => {
  it("6 个工具且名称唯一", () => {
    expect(AGENT_TOOLS).toHaveLength(6);
    expect(new Set(AGENT_TOOLS.map((t) => t.name)).size).toBe(6);
  });

  it("toolsPrompt 列出全部工具与参数", () => {
    const s = toolsPrompt();
    for (const t of AGENT_TOOLS) {
      expect(s).toContain(t.name);
      expect(s).toContain("参数");
    }
  });

  it("合法建议通过校验", () => {
    const v = validateProposal({
      tool: "create_task",
      args: { title: "写周报", priority: 1 },
      summary: "新建周报任务",
    });
    expect(v).not.toBeNull();
    expect(v!.tool).toBe("create_task");
    expect(v!.args).toEqual({ title: "写周报", priority: 1 });
    expect(v!.summary).toBe("新建周报任务");
  });

  it("未知工具/非法参数/非对象被拒绝", () => {
    expect(validateProposal({ tool: "hack", args: {} })).toBeNull();
    expect(validateProposal({ tool: "create_task", args: { title: "" } })).toBeNull();
    expect(validateProposal({ tool: "set_priority", args: { taskId: "x", priority: 9 } })).toBeNull();
    expect(validateProposal({ tool: "complete_task", args: {} })).toBeNull();
    expect(validateProposal("不是对象")).toBeNull();
  });

  it("缺省 summary 时使用工具描述", () => {
    const v = validateProposal({ tool: "plan_today", args: { taskId: "x", day: "2025-01-08" } });
    expect(v).not.toBeNull();
    expect(v!.summary.length).toBeGreaterThan(0);
  });

  it("proposalLabel 生成中文描述", () => {
    expect(proposalLabel({ tool: "create_task", args: { title: "买菜" }, summary: "" })).toContain("买菜");
    expect(
      proposalLabel({ tool: "set_priority", args: { taskId: "t1", priority: 2 }, summary: "" }),
    ).toContain("P2");
  });
});
