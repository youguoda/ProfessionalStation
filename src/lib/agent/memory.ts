import type { MemoryNote } from "@/lib/domain/types";

/**
 * 记忆检索（纯函数）：关键词打分。
 * 中文按 2-gram 切分、英文按单词切分，与查询的重叠数作为相关度。
 * MVP 不引入向量库；后续可替换为嵌入检索，接口不变。
 */

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const latin = lower.match(/[a-z0-9]+/g) ?? [];
  tokens.push(...latin);
  const cjk = lower.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) tokens.push(run);
    else {
      for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}

export function searchMemoryNotes(notes: MemoryNote[], query: string, limit = 5): MemoryNote[] {
  const q = tokenize(query);
  if (q.length === 0) return [];
  const scored = notes
    .map((note) => {
      const content = note.content.toLowerCase();
      let score = 0;
      for (const t of q) if (content.includes(t)) score += 1;
      return { note, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => x.note);
}
