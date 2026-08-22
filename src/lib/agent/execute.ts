import { useStore } from "@/store/useStore";
import type { ActionProposal } from "@/lib/domain/types";

/**
 * 执行马力的建议（客户端，走现有 store → 状态机 API）。
 * argsOverride 用于「修改后执行」。
 */
export async function executeProposalTool(
  proposal: ActionProposal,
  argsOverride?: Record<string, unknown>,
): Promise<unknown> {
  const store = useStore.getState();
  const args = { ...proposal.args, ...(argsOverride ?? {}) };

  switch (proposal.tool) {
    case "create_task":
      return store.addTask(args);
    case "complete_task":
      return store.transition(String(args.taskId), { type: "complete" });
    case "reschedule_task": {
      const patch: Record<string, unknown> = {};
      if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
      if (args.scheduledAt !== undefined) {
        const v = args.scheduledAt;
        patch.scheduledAt = v ? `${String(v)}:00` : null;
      }
      return store.updateTask(String(args.taskId), patch);
    }
    case "set_priority":
      return store.updateTask(String(args.taskId), { priority: Number(args.priority) });
    case "plan_today":
      return store.updateTask(String(args.taskId), {
        plannedFor: args.day === null ? null : String(args.day),
      });
    case "add_note": {
      const task = store.tasks.find((t) => t.id === args.taskId);
      const note = String(args.note);
      return store.updateTask(String(args.taskId), {
        notes: task?.notes ? `${task.notes}\n${note}` : note,
      });
    }
    default:
      return undefined;
  }
}
