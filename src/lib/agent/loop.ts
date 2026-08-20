import type { AgentProfile, ChatMessage, MemoryNote } from "@/lib/domain/types";
import {
  chatWithMessages,
  getAiConfig,
  parseJsonLoose,
  streamChat,
} from "@/lib/ai/planner";
import { searchMemoryNotes } from "./memory";
import { assembleSystemPrompt } from "./persona";
import { toolsPrompt, validateProposal, type ParsedProposal } from "./tools";

/**
 * 马力 agent 循环（阶段 C：流式回复 + 建议二次调用）。
 * 输出的是「建议」，绝不直接执行写操作。
 */

export interface AgentTurnResult {
  reply: string;
  proposals: ParsedProposal[];
}

function memoryTextOf(notes: MemoryNote[], query: string): string {
  const memory = searchMemoryNotes(notes, query, 3);
  return memory.length ? memory.map((m) => `- ${m.content}`).join("\n") : "（无）";
}

function historyMessages(
  history: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

function dedupeProposals(raw: unknown[]): ParsedProposal[] {
  const proposals: ParsedProposal[] = [];
  for (const p of raw) {
    const v = validateProposal(p);
    if (!v) continue;
    const dup = proposals.some(
      (x) => x.tool === v.tool && JSON.stringify(x.args) === JSON.stringify(v.args),
    );
    if (!dup) proposals.push(v);
    if (proposals.length >= 5) break;
  }
  return proposals;
}

export interface AgentStreamInput {
  profile: AgentProfile;
  history: ChatMessage[];
  context: string;
  memoryNotes: MemoryNote[];
  summary: string;
  userText: string;
}

/** 流式回复：逐 token 回调（打字机），随后补一次非流式建议调用 */
export async function streamAgentReply(
  input: AgentStreamInput,
  onToken: (delta: string) => void,
): Promise<AgentTurnResult> {
  if (!getAiConfig().enabled) {
    throw new Error("未配置 AI_API_KEY，请在 .env 中设置并重启服务");
  }

  const memoryText = memoryTextOf(input.memoryNotes, input.userText);
  const system = assembleSystemPrompt(
    input.profile,
    input.context,
    toolsPrompt(),
    memoryText,
    "reply",
    input.summary,
  );
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...historyMessages(input.history),
    { role: "user", content: input.userText },
  ];

  let reply = "";
  for await (const delta of streamChat(messages, system)) {
    reply += delta;
    onToken(delta);
  }
  const finalReply = reply.trim() || "（我好像走神了，请再说一次？）";

  const proposals = await proposeAgentActions(
    input.profile,
    input.history,
    input.userText,
    finalReply,
    input.context,
    input.summary,
  );
  return { reply: finalReply, proposals };
}

/** 建议二次调用（非流式，输出 proposals JSON） */
export async function proposeAgentActions(
  profile: AgentProfile,
  history: ChatMessage[],
  userText: string,
  reply: string,
  context: string,
  summary: string,
): Promise<ParsedProposal[]> {
  try {
    const system = assembleSystemPrompt(
      profile,
      context,
      toolsPrompt(),
      "（无）",
      "proposals",
      summary,
    );
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...historyMessages(history),
      { role: "user", content: userText },
      { role: "assistant", content: reply },
      { role: "user", content: "请根据上面的对话给出待确认的操作建议 JSON。" },
    ];
    const content = await chatWithMessages(messages, system, 0.2);
    const parsed = parseJsonLoose(content) as { proposals?: unknown } | null;
    return dedupeProposals(Array.isArray(parsed?.proposals) ? parsed!.proposals : []);
  } catch {
    return [];
  }
}

/** 非流式兼容路径（chat 模式：一次调用输出 reply + proposals JSON） */
export async function runAgentTurn(input: {
  profile: AgentProfile;
  history: ChatMessage[];
  context: string;
  memoryNotes: MemoryNote[];
  userText: string;
  summary?: string;
}): Promise<AgentTurnResult> {
  if (!getAiConfig().enabled) {
    throw new Error("未配置 AI_API_KEY，请在 .env 中设置并重启服务");
  }

  const memoryText = memoryTextOf(input.memoryNotes, input.userText);
  const system = assembleSystemPrompt(
    input.profile,
    input.context,
    toolsPrompt(),
    memoryText,
    "chat",
    input.summary ?? "",
  );
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...historyMessages(input.history.slice(-20)),
    { role: "user", content: input.userText },
  ];

  const content = await chatWithMessages(messages, system);
  const parsed = parseJsonLoose(content) as { reply?: unknown; proposals?: unknown } | null;
  const reply =
    typeof parsed?.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "（我好像走神了，请再说一次？）";
  return {
    reply,
    proposals: dedupeProposals(Array.isArray(parsed?.proposals) ? parsed!.proposals : []),
  };
}
