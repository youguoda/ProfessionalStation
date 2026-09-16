import type { Db, Task } from "@/lib/domain/types";
import { selectReviewStats, selectSettlement } from "@/lib/engine/selectors";

/**
 * 周回顾复盘笔记的素材与兜底草稿（纯函数，不调 LLM）。
 *
 * 复盘笔记长期是空的，不是因为不想复盘，而是因为对着空白框从头写太贵。
 * 所以把动作从「写」降到「改」：先给一份**有内容的初稿**，删改比起草便宜得多。
 */

const DAY = 24 * 60 * 60 * 1000;

export interface WeekFacts {
  done: Task[];
  canceled: Task[];
  stale: Array<{ task: Task; reason: string }>;
  created: number;
  projectsWithoutAction: string[];
  /** 本周聊过的话题（取用户说过的话，掐头去尾） */
  topics: string[];
}

export function buildWeekFacts(db: Db, now: Date = new Date()): WeekFacts {
  const since = now.getTime() - 7 * DAY;
  const inWeek = (iso: string | null) => iso !== null && new Date(iso).getTime() >= since;
  const stats = selectReviewStats(db.tasks, db.projects, now);

  return {
    done: db.tasks.filter((t) => t.status === "done" && inWeek(t.completedAt)),
    canceled: db.tasks.filter((t) => t.status === "canceled" && inWeek(t.completedAt)),
    stale: selectSettlement(db.tasks, db.settings, now).map((s) => ({
      task: s.task,
      reason: s.reason,
    })),
    created: stats.createdThisWeek,
    projectsWithoutAction: stats.projectsWithoutAction,
    topics: db.chatMessages
      .filter((m) => m.role === "user" && inWeek(m.createdAt))
      .map((m) => m.content.trim().replace(/\s+/g, " ").slice(0, 60))
      .filter(Boolean)
      .slice(-6),
  };
}

/** 压成注入 LLM 的事实块 */
export function weekFactsText(facts: WeekFacts): string {
  const list = (items: string[]) => (items.length ? items.map((s) => `- ${s}`).join("\n") : "- （无）");
  return [
    `本周完成 ${facts.done.length} 条：`,
    list(facts.done.map((t) => t.title)),
    `本周放弃 ${facts.canceled.length} 条：`,
    list(facts.canceled.map((t) => `${t.title}${t.canceledReason ? `（${t.canceledReason}）` : ""}`)),
    `本周新建 ${facts.created} 条。`,
    `悬着没结算的 ${facts.stale.length} 条：`,
    list(facts.stale.map((s) => `${s.task.title}（${s.reason}）`)),
    `没有下一步行动的项目：`,
    list(facts.projectsWithoutAction),
    `本周跟我聊过的：`,
    list(facts.topics),
  ].join("\n");
}

/**
 * 兜底草稿：没有 AI（或 AI 失败）时用真实数据拼出来的初稿。
 * 它一样是有内容的——空白框才是复盘写不出来的真正原因。
 */
export function fallbackReviewDraft(facts: WeekFacts): string {
  const good =
    facts.done.length > 0
      ? `本周结了 ${facts.done.length} 条：${facts.done
          .slice(0, 5)
          .map((t) => t.title)
          .join("、")}${facts.done.length > 5 ? " 等" : ""}。`
      : `本周一条都没结。新建了 ${facts.created} 条——只进不出。`;

  const badLines: string[] = [];
  for (const s of facts.stale.slice(0, 5)) {
    badLines.push(`- ${s.task.title}：${s.reason}。原因：`);
  }
  for (const t of facts.canceled.slice(0, 3)) {
    badLines.push(`- ${t.title}：已放弃${t.canceledReason ? `（${t.canceledReason}）` : "，原因："}`);
  }
  const bad = badLines.length > 0 ? badLines.join("\n") : "（没有烂尾的，这周挺干净。）";

  // 下周那一件事：优先指向挂得最久的在制品，其次是没有下一步行动的项目
  const oldest = facts.stale.find((s) => s.task.status === "doing") ?? facts.stale[0];
  const next = oldest
    ? `先把「${oldest.task.title}」结掉——${oldest.reason}。`
    : facts.projectsWithoutAction.length > 0
      ? `给「${facts.projectsWithoutAction[0]}」定一个下一步行动。`
      : "";

  return [
    `本周做得好的：\n${good}`,
    `烂尾或放弃的，以及原因：\n${bad}`,
    `下周最重要的一件事：\n${next}`,
  ].join("\n\n");
}
