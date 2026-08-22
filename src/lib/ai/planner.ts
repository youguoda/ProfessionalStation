/**
 * AI 规划模块（仅服务端使用，勿在客户端组件中导入）。
 *
 * 通过 OpenAI 兼容接口（默认 DeepSeek）驱动「任务拆分」。
 * 未配置 AI_API_KEY 或调用失败时由调用方降级，保证功能永远可用。
 *
 * 注：自动排期已随时间块视图一并移除——scheduledAt 现在只表示
 * 「固定时刻」（hard landscape），不该由算法批量填充。
 */

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
}

export function getAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY;
  return {
    enabled: Boolean(apiKey),
    baseUrl: (process.env.AI_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/+$/, ""),
    model: process.env.AI_MODEL ?? "deepseek-chat",
  };
}

/** 调用 OpenAI 兼容 chat/completions，返回消息内容 */
export async function chatJson(prompt: string, system?: string): Promise<string> {
  return chatWithMessages([{ role: "user", content: prompt }], system, 0.2);
}

/**
 * 多轮消息调用（system + 历史消息），返回消息内容。
 *
 * format 默认 "json"（结构化路径：拆分/建议/记忆提炼）。
 * 需要**纯文本**输出时必须传 "text"——否则 OpenAI 兼容端点会强制 JSON 包一层，
 * 而且 DeepSeek 在 json_object 模式下若 prompt 未出现 "json" 会直接返回 400。
 */
export async function chatWithMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system?: string,
  temperature = 0.7,
  format: "json" | "text" = "json",
): Promise<string> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("未配置 AI_API_KEY");
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "system",
          content:
            system ??
            (format === "json"
              ? "你是一个任务管理助手。只输出合法 JSON，不要输出任何多余文字或代码块。"
              : "你是一个任务管理助手。"),
        },
        ...messages,
      ],
      temperature,
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`AI 服务返回错误（HTTP ${res.status}）`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

/**
 * 流式调用（SSE 上游解析）：逐段产出 delta 文本。
 * 用于马力的打字机回复（该调用不设置 json_object，模型输出纯文本）。
 */
export async function* streamChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system?: string,
  temperature = 0.7,
): AsyncGenerator<string> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("未配置 AI_API_KEY");
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "system",
          content: system ?? "你是一个任务管理助手，用中文简洁回复。",
        },
        ...messages,
      ],
      temperature,
      stream: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`AI 服务返回错误（HTTP ${res.status}）`);
  }
  if (!res.body) throw new Error("AI 未返回流式内容");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }
}

/** 宽松解析 JSON：支持裸 JSON、```json 代码块、文本中嵌入的 JSON */
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* continue */
    }
  }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {
      /* continue */
    }
  }
  return null;
}

/** 用 LLM 把任务拆成子任务标题（3–7 条，动词开头） */
export async function aiBreakdown(title: string, notes: string): Promise<string[]> {
  if (!getAiConfig().enabled) throw new Error("未配置 AI_API_KEY，请在 .env 中设置");
  const content = await chatJson(
    `请把下面这个任务拆成可执行的子任务清单。\n任务标题：${title}\n备注：${notes || "（无）"}\n\n输出 JSON 格式：{"titles":["子任务1","子任务2"]}，3 到 7 条，简洁、动词开头、可独立执行。`,
  );
  const parsed = parseJsonLoose(content) as { titles?: unknown } | null;
  const titles = Array.isArray(parsed?.titles)
    ? parsed!.titles
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
        .slice(0, 8)
    : [];
  if (titles.length === 0) throw new Error("AI 未返回有效的子任务清单");
  return titles;
}
