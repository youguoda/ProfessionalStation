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
    name: "plan_today",
    description: "把任务放进（或移出）某天的承诺清单",
    params: "{taskId: string, day: string(YYYY-MM-DD)|null}",
    zod: z.object({
      taskId: z.string().min(1),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
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

/** 建议卡片里可以就地改的字段类型 */
export type ProposalFieldType = "text" | "textarea" | "date" | "datetime" | "priority";

export interface ProposalField {
  key: string;
  label: string;
  type: ProposalFieldType;
  /** 允许清空（存 null） */
  nullable?: boolean;
}

/**
 * 每种建议可以改哪些字段。
 *
 * 马力给的是**建议**，不是指令——不能改的建议只有「接受」和「忽略」两条路，
 * 而真实情况几乎总是「方向对，细节不对」。能改，接受率才有意义。
 *
 * taskId 不在可改之列：它是一个不透明 id，手敲没有意义，改目标不如重开一条。
 */
export const PROPOSAL_FIELDS: Record<AgentToolName, ProposalField[]> = {
  create_task: [
    { key: "title", label: "标题", type: "text" },
    { key: "dueDate", label: "截止日", type: "date", nullable: true },
    { key: "priority", label: "优先级", type: "priority" },
  ],
  complete_task: [],
  reschedule_task: [
    { key: "dueDate", label: "截止日", type: "date", nullable: true },
    { key: "scheduledAt", label: "固定时刻", type: "datetime", nullable: true },
  ],
  set_priority: [{ key: "priority", label: "优先级", type: "priority" }],
  plan_today: [{ key: "day", label: "承诺日", type: "date", nullable: true }],
  add_note: [{ key: "note", label: "备注", type: "textarea" }],
};

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

/**
 * 建议摘要的中文描述（用于卡片展示与回执消息）。
 * titleOf 把 taskId 翻成任务标题——卡片上印一串 uuid 等于没说。
 */
export function proposalLabel(
  p: ParsedProposal,
  titleOf?: (taskId: string) => string | undefined,
): string {
  const id = String(p.args.taskId ?? "");
  const target = titleOf?.(id);
  const ref = target ? `「${target}」` : `#${id.slice(0, 8)}`;
  switch (p.tool) {
    case "create_task":
      return `新建任务「${String(p.args.title ?? "")}」`;
    case "complete_task":
      return `完成任务 ${ref}`;
    case "reschedule_task":
      return `调整任务 ${ref} 的时间`;
    case "set_priority":
      return `把任务 ${ref} 设为 P${String(p.args.priority ?? "")}`;
    case "plan_today":
      return p.args.day
        ? `把任务 ${ref} 放进 ${String(p.args.day)} 的清单`
        : `把任务 ${ref} 移出今天`;
    case "add_note":
      return `给任务 ${ref} 追加备注`;
    default:
      return p.summary;
  }
}
