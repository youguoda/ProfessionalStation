"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { proposalLabel } from "@/lib/agent/tools";
import type { ActionProposal, ChatMessage } from "@/lib/domain/types";
import { AgentSettings } from "./AgentSettings";

function ProposalCard({
  message,
  proposal,
}: {
  message: ChatMessage;
  proposal: ActionProposal;
}) {
  const addTask = useStore((s) => s.addTask);
  const transition = useStore((s) => s.transition);
  const updateTask = useStore((s) => s.updateTask);
  const resolveProposal = useStore((s) => s.resolveProposal);
  const tasks = useStore((s) => s.tasks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = proposal.status !== "pending";

  async function execute() {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      switch (proposal.tool) {
        case "create_task":
          await addTask(proposal.args);
          break;
        case "complete_task":
          await transition(String(proposal.args.taskId), { type: "complete" });
          break;
        case "reschedule_task": {
          const patch: Record<string, unknown> = {};
          if (proposal.args.dueDate !== undefined) patch.dueDate = proposal.args.dueDate;
          if (proposal.args.scheduledAt !== undefined) {
            const v = proposal.args.scheduledAt;
            patch.scheduledAt = v ? `${String(v)}:00` : null;
          }
          await updateTask(String(proposal.args.taskId), patch);
          break;
        }
        case "set_priority":
          await updateTask(String(proposal.args.taskId), {
            priority: Number(proposal.args.priority),
          });
          break;
        case "mark_frog":
          await updateTask(String(proposal.args.taskId), {
            isFrog: Boolean(proposal.args.isFrog),
          });
          break;
        case "add_note": {
          const task = tasks.find((t) => t.id === proposal.args.taskId);
          const note = String(proposal.args.note);
          await updateTask(String(proposal.args.taskId), {
            notes: task?.notes ? `${task.notes}\n${note}` : note,
          });
          break;
        }
      }
      await resolveProposal(message.id, proposal.id, "approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "执行失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-background p-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium">{proposal.summary}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {proposal.status === "approved"
            ? "✅ 已执行"
            : proposal.status === "denied"
              ? "🚫 已忽略"
              : "待确认"}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        操作：{proposalLabel(proposal)}
      </div>
      {proposal.status === "pending" ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={execute}
            disabled={busy}
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            {busy ? "执行中…" : "✓ 执行"}
          </button>
          <button
            onClick={() => resolveProposal(message.id, proposal.id, "denied").catch(() => {})}
            className="rounded-md border px-2 py-1 text-xs"
          >
            忽略
          </button>
          {error ? <span className="text-[11px] text-red-500">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AgentPanel({ onClose }: { onClose: () => void }) {
  const chatMessages = useStore((s) => s.chatMessages);
  const agentProfile = useStore((s) => s.agentProfile);
  const aiStatus = useStore((s) => s.aiStatus);
  const sendChat = useStore((s) => s.sendChat);
  const clearChat = useStore((s) => s.clearChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, showSettings]);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendChat(t);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  const name = agentProfile?.name ?? "马力";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-[26rem] flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span className="font-medium">{name}</span>
            {!aiStatus?.enabled ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                未配置 Key
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              title="人格设置"
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              ⚙
            </button>
            <button
              onClick={() => clearChat().catch(() => {})}
              title="清空对话"
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              🗑
            </button>
            <button onClick={onClose} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted">
              ✕
            </button>
          </div>
        </div>

        {showSettings ? (
          <div className="flex-1 overflow-y-auto p-4">
            <AgentSettings onBack={() => setShowSettings(false)} />
          </div>
        ) : (
          <>
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {chatMessages.length === 0 ? (
                <div className="mt-10 text-center text-xs leading-relaxed text-muted-foreground">
                  <div className="mb-2 text-2xl">🤖</div>
                  我是{name}，你的计划助手。
                  <br />
                  可以问我「今天先做什么」「帮我看看超期任务」，
                  <br />
                  也可以让我提建议，我会列出来等你确认。
                </div>
              ) : (
                chatMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border bg-muted/40"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.proposals.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {m.proposals.map((p) => (
                            <ProposalCard key={p.id} message={m} proposal={p} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {busy ? (
                <div className="flex justify-start">
                  <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {name}正在思考…
                  </div>
                </div>
              ) : null}
              {error ? <p className="text-center text-xs text-red-500">{error}</p> : null}
            </div>

            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  disabled={!aiStatus?.enabled}
                  placeholder={
                    aiStatus?.enabled
                      ? "和马力聊聊你的计划…"
                      : "请先在 .env 配置 AI_API_KEY 并重启服务"
                  }
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
                />
                <button
                  onClick={submit}
                  disabled={busy || !text.trim() || !aiStatus?.enabled}
                  className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
                >
                  发送
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
