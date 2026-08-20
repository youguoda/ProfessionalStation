import type { MemoryNote } from "@/lib/domain/types";
import { chatWithMessages, parseJsonLoose } from "@/lib/ai/planner";
import { searchMemoryNotes } from "./memory";

/**
 * 记忆笔记自动提炼（阶段 C）。
 * 每轮对话结束后，从对话中提炼值得长期记住的用户偏好/承诺，去重后入库。
 */

export function filterNewFacts(
  facts: string[],
  existing: MemoryNote[],
  limit = 3,
): string[] {
  const out: string[] = [];
  for (const f of facts) {
    const fact = f.trim().slice(0, 200);
    if (!fact) continue;
    // 去重：与已有笔记互相包含视为重复；本轮内去重
    const dupWithExisting = existing.some(
      (n) => n.content.includes(fact) || fact.includes(n.content),
    );
    const dupWithCurrent = out.some((x) => x.includes(fact) || fact.includes(x));
    if (dupWithExisting || dupWithCurrent) continue;
    // 排除明显的临时任务细节（含具体日期或任务编号）
    if (/\d{4}-\d{2}-\d{2}|\[id=/.test(fact)) continue;
    out.push(fact);
    if (out.length >= limit) break;
  }
  return out;
}

/** 从一轮对话中提炼值得长期记住的事实（LLM 调用，失败返回空数组） */
export async function extractMemoryFacts(
  userText: string,
  reply: string,
  existing: MemoryNote[],
): Promise<string[]> {
  const system =
    '你是记忆提炼器。从对话中提炼值得长期记住的用户事实（如时间偏好、工作习惯、长期目标、沟通偏好），只输出 JSON：{"facts":["..."]}，0 到 3 条。不要提取临时任务细节（如具体某天的截止日期）。';
  const prompt = `用户：${userText}\n马力：${reply}`;
  try {
    const content = await chatWithMessages([{ role: "user", content: prompt }], system, 0.2);
    const parsed = parseJsonLoose(content) as { facts?: unknown } | null;
    const raw = Array.isArray(parsed?.facts)
      ? parsed!.facts.filter((f): f is string => typeof f === "string")
      : [];
    return filterNewFacts(raw, existing);
  } catch {
    return [];
  }
}

/** 便捷函数：检索与某查询相关的既有记忆（复用 memory.searchMemoryNotes） */
export function recallMemoryNotes(notes: MemoryNote[], query: string, limit = 3): MemoryNote[] {
  return searchMemoryNotes(notes, query, limit);
}
