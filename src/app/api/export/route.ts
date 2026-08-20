import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/store";

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const db = await getDb();

  if (format === "json") {
    return new Response(JSON.stringify(db, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="professional-station.json"',
      },
    });
  }

  if (format === "csv") {
    const rows: string[][] = [
      ["id", "title", "phase", "status", "priority", "dueDate", "scheduledAt", "project", "notes"],
    ];
    for (const t of db.tasks) {
      rows.push([
        t.id,
        csvCell(t.title),
        t.phase,
        t.status,
        String(t.priority),
        t.dueDate ?? "",
        t.scheduledAt ?? "",
        t.projectId ?? "",
        csvCell(t.notes),
      ]);
    }
    return new Response(rows.map((r) => r.join(",")).join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="tasks.csv"',
      },
    });
  }

  if (format === "md") {
    const lines: string[] = ["# ProfessionalStation 导出", ""];
    const byProject = new Map<string, typeof db.tasks>();
    for (const t of db.tasks) {
      const key = t.projectId
        ? (db.projects.find((p) => p.id === t.projectId)?.name ?? "未命名项目")
        : "无项目";
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(t);
    }
    for (const [name, list] of byProject) {
      lines.push(`## ${name}`, "");
      for (const t of list) {
        const done = t.status === "done" || t.status === "canceled" ? "x" : " ";
        lines.push(
          `- [${done}] ${t.title}${t.dueDate ? `（${t.dueDate}）` : ""} — P${t.priority} ${t.phase}`,
        );
      }
      lines.push("");
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="professional-station.md"',
      },
    });
  }

  return NextResponse.json({ error: "未知格式" }, { status: 400 });
}
