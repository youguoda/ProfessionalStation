import { z } from "zod";
import type { AgentToolName } from "@/lib/domain/types";

/**
 * 马力的工具集（HITL）。
 * 工具本身不执行任何写操作：模型给出的 tool 调用只会被校验并变成「建议卡片」，
 * 真正执行走前端 → 现有状态机 API。
 */

export interface ParsedProposal {
  tool: AgentToolName;
  args: Record<string, unknown>;
  summary: string;
}

interface ToolDef {
  name: AgentToolName;
  description: string;
  params: string;
  zod: z.ZodTypeAny;
}

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "create_task",
    description: "新建一个任务",
    params: "{title: string, dueDate?: string(YYYY-MM-DD)|null, priority?: 1|2|3|4, projectId?: string|null}",
    zod: z.object({
      title: z.string().min(1).max(200),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      projectId: z.string().nullable().optional(),
    }),
  },
  {
    name: "complete_task",
    description: "完成一个任务",
    params: "{taskId: string}",
    zod: z.object({ taskId: z.string().min(1) }),
  },
  {
    name: "reschedule_task",
    description: "改期/排期一个任务",
    params: "{taskId: string, dueDate?: string(YYYY-MM-DD)|null, scheduledAt?: string(YYYY-MM-DDTHH:mm)|null}",
    zod: z.object({
      taskId: z.string().min(1),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
    }),
  },
  {
    name: "set_priority",
    description: "调整任务优先级",
    params: "{taskId: string, priority: 1|2|3|4}",
    zod: z.object({
      taskId: z.string().min(1),
      priority: z.number().int().min(1).max(4),
    }),
  },
  {
    name: "mark_frog",
    description: "把任务标记为（或取消）今日青蛙",
    params: "{taskId: string, isFrog: boolean}",
    zod: z.object({
      taskId: z.string().min(1),
      isFrog: z.boolean(),
    }),
  },
  {
    name: "add_note",
    description: "给任务追加备注",
    params: "{taskId: string, note: string}",
    zod: z.object({
      taskId: z.string().min(1),
      note: z.string().min(1).max(500),
    }),
  },
];

export function toolsPrompt(): string {
  return AGENT_TOOLS.map((t) => `- ${t.name}：${t.description}。参数 ${t.params}`).join("\n");
}

/** 校验模型输出的单条建议；非法（未知工具/参数不合法）返回 null */
export function validateProposal(raw: unknown): ParsedProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const def = AGENT_TOOLS.find((t) => t.name === obj.tool);
  if (!def) return null;
  const parsed = def.zod.safeParse(obj.args);
  if (!parsed.success) return null;
  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim().slice(0, 120)
      : def.description;
  return { tool: def.name, args: parsed.data as Record<string, unknown>, summary };
}

/** 建议摘要的中文描述（用于卡片展示与回执消息） */
export function proposalLabel(p: ParsedProposal): string {
  switch (p.tool) {
    case "create_task":
      return `新建任务「${String(p.args.title ?? "")}」`;
    case "complete_task":
      return `完成任务 #${String(p.args.taskId ?? "")}`;
    case "reschedule_task":
      return `调整任务 #${String(p.args.taskId ?? "")} 的时间`;
    case "set_priority":
      return `把任务 #${String(p.args.taskId ?? "")} 设为 P${String(p.args.priority ?? "")}`;
    case "mark_frog":
      return p.args.isFrog ? `把任务 #${String(p.args.taskId ?? "")} 标记为青蛙` : `取消任务 #${String(p.args.taskId ?? "")} 的青蛙标记`;
    case "add_note":
      return `给任务 #${String(p.args.taskId ?? "")} 追加备注`;
    default:
      return p.summary;
  }
}
