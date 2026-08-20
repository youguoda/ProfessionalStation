/**
 * AI 规划模块（仅服务端使用，勿在客户端组件中导入）。
 *
 * 通过 OpenAI 兼容接口（默认 DeepSeek）驱动「任务拆分」与「智能排期」：
 *   - 未配置 AI_API_KEY 时，排期自动降级为本地启发式；
 *   - LLM 调用失败或返回非法结果时同样降级，保证功能永远可用。
 */

import type { Task } from "@/lib/domain/types";
import { isoDay } from "@/lib/engine/selectors";
import { suggestSchedule, type SlotSuggestion } from "@/lib/engine/scheduler";

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
}

export function getAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY;
  return {
    enabled: Boolean(apiKey),
    baseUrl: (process.env.AI_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/+$/, ""),
    model: process.env.AI_MODEL ?? "deepseek-chat",
  };
}

/** 调用 OpenAI 兼容 chat/completions，返回消息内容 */
export async function chatJson(prompt: string, system?: string): Promise<string> {
  return chatWithMessages([{ role: "user", content: prompt }], system, 0.2);
}

/** 多轮消息调用（system + 历史消息），返回消息内容 */
export async function chatWithMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system?: string,
  temperature = 0.7,
): Promise<string> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("未配置 AI_API_KEY");
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "system",
          content: system ?? "你是一个任务管理助手。只输出合法 JSON，不要输出任何多余文字或代码块。",
        },
        ...messages,
      ],
      temperature,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`AI 服务返回错误（HTTP ${res.status}）`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

/**
 * 流式调用（SSE 上游解析）：逐段产出 delta 文本。
 * 用于马力的打字机回复（该调用不设置 json_object，模型输出纯文本）。
 */
export async function* streamChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system?: string,
  temperature = 0.7,
): AsyncGenerator<string> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("未配置 AI_API_KEY");
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "system",
          content: system ?? "你是一个任务管理助手，用中文简洁回复。",
        },
        ...messages,
      ],
      temperature,
      stream: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`AI 服务返回错误（HTTP ${res.status}）`);
  }
  if (!res.body) throw new Error("AI 未返回流式内容");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }
}

/** 宽松解析 JSON：支持裸 JSON、```json 代码块、文本中嵌入的 JSON */
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* continue */
    }
  }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {
      /* continue */
    }
  }
  return null;
}

/** 用 LLM 把任务拆成子任务标题（3–7 条，动词开头） */
export async function aiBreakdown(title: string, notes: string): Promise<string[]> {
  if (!getAiConfig().enabled) throw new Error("未配置 AI_API_KEY，请在 .env 中设置");
  const content = await chatJson(
    `请把下面这个任务拆成可执行的子任务清单。\n任务标题：${title}\n备注：${notes || "（无）"}\n\n输出 JSON 格式：{"titles":["子任务1","子任务2"]}，3 到 7 条，简洁、动词开头、可独立执行。`,
  );
  const parsed = parseJsonLoose(content) as { titles?: unknown } | null;
  const titles = Array.isArray(parsed?.titles)
    ? parsed!.titles
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
        .slice(0, 8)
    : [];
  if (titles.length === 0) throw new Error("AI 未返回有效的子任务清单");
  return titles;
}

export interface RawAiSuggestion {
  taskId?: unknown;
  date?: unknown;
  hour?: unknown;
}

/**
 * 校验 LLM 返回的排期建议（纯函数）：
 * 只保留合法条目——taskId 是候选任务且不重复、date 在本周、hour 在可选时段、每天不超 maxPerDay。
 */
export function validateAiSchedule(
  raw: unknown,
  candidates: Task[],
  days: string[],
  hours: number[],
  maxPerDay: number,
): SlotSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const candidateIds = new Set(candidates.map((t) => t.id));
  const daySet = new Set(days);
  const hourSet = new Set(hours);
  const perDay = new Map<string, number>();
  const seen = new Set<string>();
  const result: SlotSuggestion[] = [];

  for (const item of raw as RawAiSuggestion[]) {
    if (!item || typeof item !== "object") continue;
    const taskId = typeof item.taskId === "string" ? item.taskId : "";
    const date = typeof item.date === "string" ? item.date : "";
    const hour = typeof item.hour === "number" ? item.hour : NaN;
    if (!candidateIds.has(taskId) || seen.has(taskId)) continue;
    if (!daySet.has(date) || !hourSet.has(hour)) continue;
    if ((perDay.get(date) ?? 0) >= maxPerDay) continue;
    seen.add(taskId);
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
    result.push({
      taskId,
      scheduledAt: `${date}T${String(hour).padStart(2, "0")}:00:00`,
    });
  }
  return result;
}

export interface AiScheduleResult {
  suggestions: SlotSuggestion[];
  source: "ai" | "heuristic";
}

/** AI 排期：未配置/失败/结果非法时降级到启发式 */
export async function aiSchedule(
  tasks: Task[],
  weekStart: Date,
  opts: { hours?: number[]; maxPerDay?: number; includeWeekend?: boolean } = {},
): Promise<AiScheduleResult> {
  const heuristic = (): AiScheduleResult => ({
    suggestions: suggestSchedule(tasks, weekStart, opts),
    source: "heuristic",
  });

  if (!getAiConfig().enabled) return heuristic();

  const hours = opts.hours ?? [9, 10, 11, 14, 15, 16, 17];
  const maxPerDay = opts.maxPerDay ?? 3;
  const dayCount = opts.includeWeekend ? 7 : 5;
  const candidates = tasks.filter(
    (t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled" && !t.scheduledAt,
  );
  if (candidates.length === 0) return { suggestions: [], source: "ai" };

  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return isoDay(d);
  });

  try {
    const list = candidates
      .map((t) => `- id=${t.id} 标题=${t.title} 优先级=P${t.priority} 努力值=${t.effort ?? "未评估"}`)
      .join("\n");
    const content = await chatJson(
      `请为下面这些任务安排一周内的时间块。可选日期：${days.join("、")}；可选小时：${hours.join(" 点、")} 点；每天最多 ${maxPerDay} 个任务。\n优先把高优先级、高努力值的任务安排在早晨。\n候选任务：\n${list}\n\n输出 JSON 格式：{"suggestions":[{"taskId":"...","date":"YYYY-MM-DD","hour":9}]}`,
    );
    const parsed = parseJsonLoose(content) as { suggestions?: unknown } | null;
    const suggestions = validateAiSchedule(parsed?.suggestions, candidates, days, hours, maxPerDay);
    return suggestions.length > 0 ? { suggestions, source: "ai" } : heuristic();
  } catch {
    return heuristic();
  }
}
