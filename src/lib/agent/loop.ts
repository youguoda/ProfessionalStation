import type { AgentProfile, ChatMessage, MemoryNote } from "@/lib/domain/types";
import { chatWithMessages, getAiConfig, parseJsonLoose } from "@/lib/ai/planner";
import { searchMemoryNotes } from "./memory";
import { assembleSystemPrompt } from "./persona";
import { toolsPrompt, validateProposal, type ParsedProposal } from "./tools";

/**
 * 单轮 agent 循环（阶段 A/B 设计：回复 + 建议一体，一次模型调用）。
 * 输出的是「建议」，绝不直接执行写操作。
 */

export interface AgentTurnResult {
  reply: string;
  proposals: ParsedProposal[];
}

export async function runAgentTurn(input: {
  profile: AgentProfile;
  history: ChatMessage[];
  context: string;
  memoryNotes: MemoryNote[];
  userText: string;
}): Promise<AgentTurnResult> {
  if (!getAiConfig().enabled) {
    throw new Error("未配置 AI_API_KEY，请在 .env 中设置并重启服务");
  }

  const memory = searchMemoryNotes(input.memoryNotes, input.userText, 3);
  const memoryText = memory.length
    ? memory.map((m) => `- ${m.content}`).join("\n")
    : "（无）";

  const system = assembleSystemPrompt(
    input.profile,
    input.context,
    toolsPrompt(),
    memoryText,
  );

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...input.history.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: input.userText },
  ];

  const content = await chatWithMessages(messages, system);
  const parsed = parseJsonLoose(content) as { reply?: unknown; proposals?: unknown } | null;

  const reply =
    typeof parsed?.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "（我好像走神了，请再说一次？）";

  const rawProposals = Array.isArray(parsed?.proposals) ? parsed!.proposals : [];
  const proposals: ParsedProposal[] = [];
  for (const p of rawProposals) {
    const v = validateProposal(p);
    if (!v) continue;
    const dup = proposals.some(
      (x) => x.tool === v.tool && JSON.stringify(x.args) === JSON.stringify(v.args),
    );
    if (!dup) proposals.push(v);
    if (proposals.length >= 5) break;
  }

  return { reply, proposals };
}
