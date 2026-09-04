"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client/api";
import { proposalLabel } from "@/lib/agent/tools";
import { executeProposalTool } from "@/lib/agent/execute";
import type { ActionProposal, ChatMessage } from "@/lib/domain/types";
import { AgentSettings } from "./AgentSettings";
import { toast, toastError } from "@/store/useToast";
import { Markdown } from "@/lib/markdown";
import { Brain, ChevronDown, ChevronRight, Pencil, Send, Square, Trash2, X } from "lucide-react";

/** 可折叠的「思考过程」块：推理模型的 reasoning（端点不返回则整块不出现） */
function ThinkingBlock({ text, live = false }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 展开态 + 流式进行中：跟随最新内容滚动
  useEffect(() => {
    if (open && live) boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [text, open, live]);

  return (
    <div className="mb-1.5 rounded-lg border border-dashed bg-muted/20 text-[11px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-muted-foreground hover:text-foreground"
      >
        <Brain className="h-3 w-3" />
        思考过程{text ? `（${text.length} 字）` : ""}
        {live ? <span className="animate-pulse">思考中…</span> : null}
        {open ? (
          <ChevronDown className="ml-auto h-3 w-3" />
        ) : (
          <ChevronRight className="ml-auto h-3 w-3" />
        )}
      </button>
      {open ? (
        <div
          ref={boxRef}
          className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-dashed px-2 py-1.5 leading-relaxed text-muted-foreground"
        >
          {text || "（空）"}
        </div>
      ) : null}
    </div>
  );
}

function ProposalCard({
  message,
  proposal,
}: {
  message: ChatMessage;
  proposal: ActionProposal;
}) {
  const resolveProposal = useStore((s) => s.resolveProposal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(
    typeof proposal.args.title === "string" ? proposal.args.title : "",
  );

  const done = proposal.status !== "pending";
  const editable = proposal.tool === "create_task";

  async function execute() {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const override = editable && editing ? { title: title.trim() || proposal.args.title } : undefined;
      await executeProposalTool(proposal, override);
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

      {editable && proposal.status === "pending" ? (
        <div className="mt-1">
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  setEditing(false);
                }
              }}
              className="w-full rounded border bg-background px-1.5 py-1 text-xs"
            />
          ) : (
            <span className="block text-[11px] text-muted-foreground">
              操作：{proposalLabel(proposal)}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          操作：{proposalLabel(proposal)}
        </div>
      )}

      {proposal.status === "pending" ? (
        <div className="mt-2 flex items-center gap-2">
          {editable ? (
            <button
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-0.5 rounded-md border px-2 py-1 text-xs"
              title="修改后执行"
            >
              <Pencil className="h-3 w-3" />
              {editing ? "完成编辑" : "修改"}
            </button>
          ) : null}
          <button
            onClick={execute}
            disabled={busy}
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            {busy ? "执行中…" : "✓ 执行"}
          </button>
          <button
            onClick={() =>
              resolveProposal(message.id, proposal.id, "denied").catch((e) => toastError(e))
            }
            className="rounded-md border px-2 py-1 text-xs"
          >
            忽略
          </button>
          {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AgentPanel({ onClose }: { onClose: () => void }) {
  const chatMessages = useStore((s) => s.chatMessages);
  const agentProfile = useStore((s) => s.agentProfile);
  const aiStatus = useStore((s) => s.aiStatus);
  const clearChat = useStore((s) => s.clearChat);
  const setChatMessages = useStore((s) => s.setChatMessages);
  const resolveProposal = useStore((s) => s.resolveProposal);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  /** 推理模型的思考过程（实时累计，端点不返回则始终为空） */
  const [reasoning, setReasoning] = useState("");
  /** 思考阶段：context = 翻计划数据，model = 等模型首 token */
  const [phase, setPhase] = useState<"context" | "model">("context");
  /** 首 token 前的等待计时（秒），让慢端点上的等待可感知 */
  const [thinkStart, setThinkStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 思考计时器：首 token 到达（streaming 非空）即停
  useEffect(() => {
    if (!busy || streaming || thinkStart === null) return;
    setElapsed((Date.now() - thinkStart) / 1000);
    const timer = setInterval(() => setElapsed((Date.now() - thinkStart) / 1000), 200);
    return () => clearInterval(timer);
  }, [busy, streaming, thinkStart]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, showSettings, streaming, pendingUser]);

  // Esc：设置页返回聊天，聊天页关闭面板
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showSettings) setShowSettings(false);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings, onClose]);

  async function submit(rawText?: string) {
    const t = (rawText ?? text).trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setPendingUser(t);
    setStreaming("");
    setReasoning("");
    setPhase("context");
    setThinkStart(Date.now());
    setElapsed(0);
    abortRef.current = new AbortController();
    try {
      const messages = await api.sendChatStream(
        t,
        (delta) => setStreaming((s) => s + delta),
        abortRef.current.signal,
        (ev) => {
          if (ev.type === "phase") setPhase(ev.phase);
          if (ev.type === "reasoning") setReasoning((r) => r + ev.text);
          // 建议卡片晚于回复到达（生成不阻塞回复），就绪即插入
          if (ev.type === "proposals") setChatMessages(ev.messages);
        },
      );
      setChatMessages(messages);
      setPendingUser(null);
      setStreaming("");
    } catch (e) {
      setPendingUser(null);
      setStreaming("");
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("已停止生成（消息未发送）");
      } else {
        setText(t);
        setError(e instanceof Error ? e.message : "发送失败");
      }
    } finally {
      setBusy(false);
      setThinkStart(null);
      abortRef.current = null;
    }
  }

  async function approveAll(m: ChatMessage) {
    const pending = m.proposals.filter((p) => p.status === "pending");
    let ok = 0;
    for (const p of pending) {
      try {
        await executeProposalTool(p);
        await resolveProposal(m.id, p.id, "approved");
        ok += 1;
      } catch (e) {
        toastError(e);
      }
    }
    toast({ title: `已执行 ${ok} 条建议`, tone: "success" });
  }

  const name = agentProfile?.name ?? "马力";

  return (
    <div className="flex h-full w-[26rem] shrink-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-medium">{name}</span>
          {!aiStatus?.enabled ? (
            <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] text-warning">
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
            onClick={() => clearChat().catch((e) => toastError(e))}
            title="清空对话"
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
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
              <>
                {chatMessages.map((m) => {
                  const pending = m.proposals.filter((p) => p.status === "pending");
                  return (
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
                        {m.role === "assistant" && m.reasoning ? (
                          <ThinkingBlock text={m.reasoning} />
                        ) : null}
                        <Markdown text={m.content} />
                        {m.role === "user" ? (
                          <button
                            onClick={() => submit(m.content)}
                            disabled={busy}
                            className="mt-1 text-[10px] opacity-60 hover:opacity-100"
                            title="重新发送这条消息"
                          >
                            ↻ 重发
                          </button>
                        ) : null}
                        {m.proposals.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {m.proposals.map((p) => (
                              <ProposalCard key={p.id} message={m} proposal={p} />
                            ))}
                            {pending.length > 1 ? (
                              <button
                                onClick={() => approveAll(m)}
                                className="w-full rounded-md border border-primary/40 py-1 text-xs text-primary hover:bg-primary/10"
                              >
                                全部执行（{pending.length}）
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {pendingUser ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {pendingUser}
                    </div>
                  </div>
                ) : null}
                {busy ? (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                      {streaming ? (
                        <>
                          {reasoning ? <ThinkingBlock text={reasoning} /> : null}
                          <span className="whitespace-pre-wrap">
                            {streaming}
                            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
                          </span>
                        </>
                      ) : reasoning ? (
                        <ThinkingBlock text={reasoning} live />
                      ) : (
                        <span className="text-muted-foreground">
                          {phase === "context" ? `${name}正在翻你的计划…` : `${name}正在思考…`}
                          {thinkStart !== null ? (
                            <span className="ml-1 tabular-nums">{elapsed.toFixed(1)}s</span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
                {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
              </>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                }}
                disabled={!aiStatus?.enabled || busy}
                placeholder={
                  aiStatus?.enabled
                    ? "和马力聊聊你的计划…"
                    : "请先在 .env 配置 AI_API_KEY 并重启服务"
                }
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
              {busy ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
                  title="停止生成"
                >
                  <Square className="h-3.5 w-3.5" />
                  停止
                </button>
              ) : (
                <button
                  onClick={() => submit()}
                  disabled={!text.trim() || !aiStatus?.enabled}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  发送
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
