import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/store";
import {
  daysSince,
  doingCapacity,
  isoDay,
  selectAwaitingResult,
  selectDoing,
  selectInbox,
  selectNextActions,
  selectOverdue,
  selectSettlement,
  selectToday,
  selectWaiting,
  todayCapacity,
  waitingSince,
} from "@/lib/engine/selectors";
import type { Db, Task } from "@/lib/domain/types";

/**
 * 外部 agent（Hermes 上的马力）读任务系统的唯一入口。
 *
 * 为什么不让 agent 直接拉 /api/bootstrap 自己算：那等于把 selectors 的投影逻辑
 * 在仓库外再实现一遍，PS 的口径一改，外面那份就悄悄过期了。
 * 这里复用同一批纯函数——**投影只有一个真相源**。
 *
 * 输出刻意精简：agent 读的是 token，不是数据库。每条任务只给决策需要的字段。
 */

interface Brief {
  id: string;
  /** 短 id：给 agent 在对话里引用，写回时前缀匹配即可 */
  ref: string;
  title: string;
  project: string | null;
  status: Task["status"];
  /** 等结果：在跑，但跑的不是我——不占在制名额 */
  awaiting: boolean;
  plannedFor: string | null;
  dueDate: string | null;
  /** 在制品是「已进行 N 天」，等待项是「已等 N 天」 */
  days: number | null;
}

function briefer(db: Db, now: Date) {
  const projectName = (id: string | null) =>
    id ? (db.projects.find((p) => p.id === id)?.name ?? null) : null;

  return (t: Task): Brief => ({
    id: t.id,
    ref: t.id.slice(0, 8),
    title: t.title,
    project: projectName(t.projectId),
    status: t.status,
    awaiting: t.awaitingResult,
    plannedFor: t.plannedFor,
    dueDate: t.dueDate,
    days:
      t.status === "doing"
        ? daysSince(t.startedAt, now)
        : t.phase === "waiting"
          ? daysSince(waitingSince(t), now)
          : null,
  });
}

export async function GET(req: Request) {
  const db = await getDb();
  const now = new Date();
  const brief = briefer(db, now);
  const scope = new URL(req.url).searchParams.get("scope");

  const lists = {
    today: selectToday(db.tasks, now).map(brief),
    overdue: selectOverdue(db.tasks, now).map(brief),
    doing: selectDoing(db.tasks).map(brief),
    awaiting: selectAwaitingResult(db.tasks).map(brief),
    next: selectNextActions(db.tasks).map(brief),
    inbox: selectInbox(db.tasks).map(brief),
    waiting: selectWaiting(db.tasks).map(brief),
    settlement: selectSettlement(db.tasks, db.settings, now).map((s) => ({
      ...brief(s.task),
      kind: s.kind,
      reason: s.reason,
    })),
  };

  if (scope) {
    if (!(scope in lists)) {
      return NextResponse.json(
        { error: `未知范围「${scope}」。可用：${Object.keys(lists).join(" / ")}` },
        { status: 400 },
      );
    }
    return NextResponse.json({ [scope]: lists[scope as keyof typeof lists] });
  }

  return NextResponse.json({
    date: isoDay(now),
    // 两条约束是马力提建议的地基：没有额度概念的建议都是空话
    capacity: {
      today: todayCapacity(db.tasks, db.settings, now),
      doing: doingCapacity(db.tasks, db.settings),
    },
    settings: {
      maxToday: db.settings.maxToday,
      maxDoing: db.settings.maxDoing,
      staleDays: db.settings.staleDays,
    },
    ...lists,
  });
}
