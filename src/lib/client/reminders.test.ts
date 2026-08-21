import { afterEach, describe, expect, it, vi } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { checkReminders, reminderMessages } from "./reminders";

const now = new Date(2025, 0, 8); // 2025-01-08

describe("reminderMessages", () => {
  it("今天到期与逾期分别生成提醒", () => {
    const tasks = [
      createTask({ title: "今天任务", phase: "action", dueDate: "2025-01-08" }),
      createTask({ title: "逾期任务", phase: "action", dueDate: "2025-01-05" }),
    ];
    const r = reminderMessages(tasks, now);
    expect(r).toEqual([
      { taskId: tasks[1].id, message: "已逾期：逾期任务", overdue: true },
      { taskId: tasks[0].id, message: "今天到期：今天任务", overdue: false },
    ]);
  });

  it("排除非 action / 已完成 / 无截止 / 未来任务", () => {
    const tasks = [
      createTask({ title: "inbox", phase: "inbox", dueDate: "2025-01-08" }),
      createTask({ title: "done", phase: "action", status: "done", dueDate: "2025-01-08" }),
      createTask({ title: "无截止", phase: "action" }),
      createTask({ title: "未来", phase: "action", dueDate: "2025-01-20" }),
    ];
    expect(reminderMessages(tasks, now)).toEqual([]);
  });
});

function fakeNotification(permission: NotificationPermission, sent: string[]) {
  const Fake = function (this: unknown, _title: string, opts?: { body?: string }) {
    sent.push(opts?.body ?? "");
  } as unknown as typeof Notification;
  Object.defineProperty(Fake, "permission", { value: permission });
  return Fake;
}

describe("checkReminders（权限与副作用）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("未授权时返回空且不弹通知", () => {
    const sent: string[] = [];
    vi.stubGlobal("Notification", fakeNotification("default", sent));
    const tasks = [createTask({ title: "x", phase: "action", dueDate: "2025-01-08" })];
    expect(checkReminders(tasks, now)).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("granted 时返回提醒且同一会话去重", () => {
    const sent: string[] = [];
    vi.stubGlobal("Notification", fakeNotification("granted", sent));
    const tasks = [createTask({ title: "x", phase: "action", dueDate: "2025-01-08" })];
    expect(checkReminders(tasks, now)).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(checkReminders(tasks, now)).toEqual([]);
  });
});
