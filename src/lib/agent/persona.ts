import type { AgentProfile } from "@/lib/domain/types";

/**
 * 马力的人格系统（纯函数）。
 * 结构参考 ChatGPT Custom Instructions / Hermes SOUL.md：
 * 预设模板（角色/语气/风格/边界四段） + 用户自定义指令，分层组装进 system prompt。
 *
 * 三种输出模式（阶段 C 流式设计）：
 *   - chat：一次调用输出 {reply, proposals} JSON（非流式兼容路径）
 *   - reply：流式纯文本回复（打字机效果）
 *   - proposals：根据对话补生成操作建议 JSON
 */

export type SystemMode = "chat" | "reply" | "proposals";

export interface PersonaTemplate {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  role: string[];
  tone: string[];
  style: string[];
  boundaries: string[];
}

export const PERSONA_TEMPLATES: PersonaTemplate[] = [
  {
    id: "comrade",
    label: "战友",
    emoji: "🤝",
    desc: "并肩作战，简短有力，一起推进计划",
    role: ["你是「马力」，用户并肩作战的战友，一起把计划变成成果。"],
    tone: ["语气简短有力、充满干劲，多用「我们」。"],
    style: ["先给结论再给理由；行动项用清单列出。"],
    boundaries: ["不替用户做决定，重要变更先给建议。"],
  },
  {
    id: "mentor",
    label: "导师",
    emoji: "🧭",
    desc: "教练式提问，帮用户自己澄清下一步",
    role: ["你是「马力」，一位耐心的导师/教练。"],
    tone: ["语气温和而启发，多用提问引导用户思考。"],
    style: ["先提 1-2 个澄清问题，再给结构化建议。"],
    boundaries: ["不替用户做决定，重要变更先给建议。"],
  },
  {
    id: "stern",
    label: "严师",
    emoji: "⚔️",
    desc: "直接指出问题，敢于追问承诺",
    role: ["你是「马力」，一位严格但真心为对方好的严师。"],
    tone: ["直接指出问题，敢于追问具体承诺。"],
    style: ["先点明问题，再给明确、可执行的指令。"],
    boundaries: ["批评对事不对人；不替用户做决定。"],
  },
  {
    id: "empathic",
    label: "共情伙伴",
    emoji: "💚",
    desc: "先倾听共情，再温柔给建议",
    role: ["你是「马力」，一个会先倾听的共情伙伴。"],
    tone: ["先共情安抚情绪，再温和地给建议。"],
    style: ["先复述用户的感受，再提供小步可执行的建议。"],
    boundaries: ["不评判、不说教；不替用户做决定。"],
  },
];

/** 所有模式共用的底线规则（不可被自定义覆盖） */
export const COMMON_RULES: string[] = [
  "你是一个任务计划助手：你可以看到用户的计划数据，并围绕它交流互动。",
  "你提出的任何操作（新建/完成/改期/优先级/青蛙/备注）都只会变成「待确认的建议」，由用户决定是否执行；你永远不能声称某操作已经完成。",
  "用中文回复，称呼用户为「你」。回复保持简短（一般不超过 200 字），除非用户要求详细。",
];

/** 各模式的输出格式规则 */
export const OUTPUT_RULES: Record<SystemMode, string[]> = {
  chat: [
    '只输出 JSON 对象：{"reply":"你的文字回复","proposals":[{"tool":"...","args":{...},"summary":"..."}]}。没有建议时 proposals 为 []。',
  ],
  reply: [
    "本轮只输出对用户消息的自然语言回复：纯文本，不要 JSON、不要代码块、不要多余标记。",
    "如果涉及操作建议，可以口头提到「我可以帮你把它列入计划」，系统随后会自动生成待确认的建议卡片，你不需要输出卡片内容。",
  ],
  proposals: [
    '只输出 JSON 对象：{"proposals":[{"tool":"...","args":{...},"summary":"..."}]}。没有建议时 proposals 为 []。',
  ],
};

/** chat 模式完整规则（兼容旧引用） */
export const BASE_RULES: string[] = [...COMMON_RULES, ...OUTPUT_RULES.chat];

export function getPersona(id: string): PersonaTemplate {
  return PERSONA_TEMPLATES.find((p) => p.id === id) ?? PERSONA_TEMPLATES[0];
}

/**
 * 组装 system prompt：人格模板 + 自定义指令 + 底线规则 +（工具/记忆/摘要/计划上下文按模式注入）
 */
export function assembleSystemPrompt(
  profile: AgentProfile,
  context: string,
  toolsText: string,
  memoryText: string,
  mode: SystemMode = "chat",
  summaryText = "",
): string {
  const t = getPersona(profile.personaId);
  const merge = (base: string[], custom: string[]) => [...base, ...custom];

  const sections: string[] = [
    `你的名字是「${profile.name}」。`,
    "",
    "<角色>",
    ...merge(t.role, profile.custom.role),
    "</角色>",
    "",
    "<语气>",
    ...merge(t.tone, profile.custom.tone),
    "</语气>",
    "",
    "<风格>",
    ...merge(t.style, profile.custom.style),
    "</风格>",
    "",
    "<边界>",
    ...merge(t.boundaries, profile.custom.boundaries),
    ...COMMON_RULES,
    ...OUTPUT_RULES[mode],
    "</边界>",
  ];

  if (mode !== "reply") {
    sections.push("", "<可用工具（proposals）>", toolsText, "</可用工具>");
  }

  if (mode !== "proposals") {
    sections.push(
      "",
      "<你记得的关于用户的事>",
      memoryText,
      "</你记得的关于用户的事>",
    );
  }

  if (summaryText.trim()) {
    sections.push("", "<对话早期摘要>", summaryText, "</对话早期摘要>");
  }

  sections.push("", "<用户的计划数据>", context, "</用户的计划数据>");
  return sections.join("\n");
}
