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
  /** 深度思考开关（settings.agentThinking）：false 时注入参数关闭模型思考 */
  thinking?: boolean;
}

export interface StreamReplyResult {
  reply: string;
  /** 推理模型的思考过程（端点不返回则为空串） */
  reasoning: string;
}

/**
 * 流式回复：逐 token 回调（打字机），只负责把话说完。
 * 建议二次调用（proposeAgentActions）由调用方另行编排——回复落库不等它，
 * 慢端点上一次聊天不必排两次队。
 * 思考增量（reasoning_content）经 onReasoning 单独回调，先于正文到达。
 */
export async function streamReply(
  input: AgentStreamInput,
  onToken: (delta: string) => void,
  onReasoning?: (delta: string) => void,
): Promise<StreamReplyResult> {
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
  let reasoning = "";
  for await (const delta of streamChat(messages, system, 0.7, { thinking: input.thinking })) {
    if (delta.reasoning) {
      reasoning += delta.reasoning;
      onReasoning?.(delta.reasoning);
    }
    if (delta.content) {
      reply += delta.content;
      onToken(delta.content);
    }
  }
  return {
    reply: reply.trim() || "（我好像走神了，请再说一次？）",
    reasoning: reasoning.trim(),
  };
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

/**
 * 教练层的「开口」环节：把一条客观观察，用人格说成一句话。
 * AI 未配置或调用失败时返回 null，由调用方降级到 observer 的本地兜底文案。
 */
/**
 * 替用户起草周复盘笔记。
 * 有 AI 就让马力按人格写；没有（或失败）由调用方用 fallbackReviewDraft 兜底——
 * 两条路都给**有内容的初稿**，因为空白框才是复盘写不出来的原因。
 */
export async function generateReviewDraft(input: {
  profile: AgentProfile;
  facts: string;
  context: string;
  memoryNotes: MemoryNote[];
}): Promise<string | null> {
  if (!getAiConfig().enabled) return null;
  try {
    const system = assembleSystemPrompt(
      input.profile,
      input.context,
      "",
      memoryTextOf(input.memoryNotes, input.facts),
      "review",
      "",
    );
    const content = await chatWithMessages(
      [
        {
          role: "user",
          content: `这是我这一周的数据：\n\n${input.facts}\n\n按三段给我起个草，我在你的基础上改。`,
        },
      ],
      system,
      0.7,
      "text", // 三段纯文本，不要被 JSON 包一层
    );
    const text = content.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function generateNudge(input: {
  profile: AgentProfile;
  evidence: string;
  context: string;
  memoryNotes: MemoryNote[];
}): Promise<string | null> {
  if (!getAiConfig().enabled) return null;
  try {
    const system = assembleSystemPrompt(
      input.profile,
      input.context,
      "",
      memoryTextOf(input.memoryNotes, input.evidence),
      "nudge",
      "",
    );
    const content = await chatWithMessages(
      [
        {
          role: "user",
          content: `你刚刚注意到：${input.evidence}\n\n用户没有问你任何问题。说一句话。`,
        },
      ],
      system,
      0.9, // 毒舌需要一点温度
      "text", // 一句话，不要被 JSON 包一层
    );
    return sanitizeNudge(content);
  } catch {
    return null;
  }
}

/** 一句话就是一句话：去掉换行/引号/前缀，超长截断 */
export function sanitizeNudge(raw: string, maxLen = 80): string | null {
  let s = raw.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  // 防御：个别模型仍会把一句话包进 {"reply": "..."}
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s) as Record<string, unknown>;
      const inner = obj.reply ?? obj.text ?? obj.content ?? obj.message;
      if (typeof inner === "string") s = inner.trim();
    } catch {
      /* 不是合法 JSON 就按原样处理 */
    }
  }
  s = s.replace(/^[「"'“”\s]+|[」"'“”\s]+$/g, "").trim();
  s = s.replace(/^(马力[：:]\s*|回复[：:]\s*)/, "").trim();
  if (!s) return null;
  if (s.length > maxLen) {
    const cut = s.slice(0, maxLen);
    const stop = Math.max(
      cut.lastIndexOf("。"),
      cut.lastIndexOf("？"),
      cut.lastIndexOf("！"),
    );
    s = stop > maxLen * 0.5 ? cut.slice(0, stop + 1) : cut + "…";
  }
  return s;
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
