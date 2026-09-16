import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/store";
import { observe, topObservation } from "@/lib/agent/observer";

/**
 * 观察器的对外出口：给 Hermes 上的马力做 cron 监视用。
 *
 * **为什么默认返回纯文本、且刻意不带日期**：
 * cron 的 monitor 模式按输出哈希判断要不要唤醒 agent——哈希不变就静默跳过。
 * 观察结论本身带日期的话（observer 内部的 id 是 `kind:YYYY-MM-DD`），
 * 同一个模式每天都会变出新哈希，于是每天唤醒一次——那正是「罕见」这条
 * 红线要防的事：天天出现的教练，第三天就会被无视。
 *
 * 去掉日期后：同一个模式持续成立 = 输出不变 = 一直静默；
 * 情况真的变了才唤醒。**红线从一句提示词变成一条基础设施保证。**
 */
export async function GET(req: Request) {
  const db = await getDb();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "text";
  const now = new Date();

  const input = {
    tasks: db.tasks,
    projects: db.projects,
    settings: db.settings,
    now,
  };
  const top = topObservation(input);

  if (format === "json") {
    const task = top?.taskId ? db.tasks.find((t) => t.id === top.taskId) : undefined;
    return NextResponse.json({
      observation: top
        ? { ...top, taskTitle: task?.title ?? null, taskRef: task?.id.slice(0, 8) ?? null }
        : null,
      // 全部成立的模式：给 agent 判断「这周整体怎么样」，不只是最狠那条
      all: observe(input).map((o) => ({ kind: o.kind, severity: o.severity, evidence: o.evidence })),
      coachEnabled: db.settings.coachEnabled,
    });
  }

  // 纯文本：cron monitor_url 的监视目标
  if (!db.settings.coachEnabled) {
    return new Response("coach-disabled\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const body = top ? `${top.kind}\n${top.evidence}\n` : "quiet\n";
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
