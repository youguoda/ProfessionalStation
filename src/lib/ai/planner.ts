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
  jsonMode: boolean;
  /** 单次非流式调用超时（ms）；流式为它的 3 倍——打字机可能持续较久 */
  timeoutMs: number;
  /** 是否注入 chat_template_kwargs 控制 Qwen3 类模型的思考模式 */
  thinkingControl: boolean;
}

export function getAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY;
  const jsonModeRaw = process.env.AI_JSON_MODE;
  const thinkingControlRaw = process.env.AI_THINKING_CONTROL;
  return {
    enabled: Boolean(apiKey),
    baseUrl: (process.env.AI_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/+$/, ""),
    model: process.env.AI_MODEL ?? "deepseek-chat",
    // 不少自建/内网的 OpenAI 兼容端点不认 response_format，会直接 400。
    // 置 AI_JSON_MODE=0 关掉它：改由 system 提示词要求 JSON，parseJsonLoose 兜底。
    jsonMode: jsonModeRaw !== "0" && jsonModeRaw !== "false",
    timeoutMs: Math.max(1_000, Number(process.env.AI_TIMEOUT_MS) || 60_000),
    // Qwen3 类推理模型关闭思考可把首 token 从秒级降到亚秒；端点不认
    // chat_template_kwargs（400）时置 0 停止注入。
    thinkingControl: thinkingControlRaw !== "0" && thinkingControlRaw !== "false",
  };
}

/**
 * 关闭思考的请求体参数。只在明确要关时注入——开启侧交给服务端默认
 * （部分网关忽略 enable_thinking:true，注入无益）。
 */
function noThinkingBody(cfg: AiConfig): Record<string, unknown> {
  return cfg.thinkingControl
    ? { chat_template_kwargs: { enable_thinking: false } }
    : {};
}

/** 把超时中断翻译成可读的错误，其余异常原样抛出 */
function rethrowIfTimeout(e: unknown, ms: number): never {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    throw new Error(`AI 请求超时（${Math.round(ms / 1000)}s，可用 AI_TIMEOUT_MS 调整）`);
  }
  throw e;
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
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
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
        ...(format === "json" && cfg.jsonMode
          ? { response_format: { type: "json_object" } }
          : {}),
        // 建议生成/摘要/记忆提炼都是机械的结构化输出，不需要思考
        ...noThinkingBody(cfg),
      }),
      // 端点挂起时别让请求无限悬着——聊天 SSE、拆分、摘要全走这里
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    rethrowIfTimeout(e, cfg.timeoutMs);
  }
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

/** 流式增量：推理模型的思考（reasoning_content）与正文分开产出 */
export interface StreamDelta {
  reasoning?: string;
  content?: string;
}

/**
 * 流式调用（SSE 上游解析）：逐段产出 delta。
 * 用于马力的打字机回复（该调用不设置 json_object，模型输出纯文本）。
 * 端点若返回 reasoning_content（Qwen3/DeepSeek-R1 类推理模型），
 * 思考过程以 reasoning 增量单独产出，供前端展示「思考过程」。
 */
export async function* streamChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system?: string,
  temperature = 0.7,
  /** thinking=false 时注入参数关闭思考（秒回）；true/未设置走服务端默认 */
  opts: { thinking?: boolean } = {},
): AsyncGenerator<StreamDelta> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("未配置 AI_API_KEY");
  // 超时覆盖整个流式会话（连接 + 打字机全程），流式放宽到 3 倍
  const streamTimeout = cfg.timeoutMs * 3;
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
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
        ...(opts.thinking === false ? noThinkingBody(cfg) : {}),
      }),
      signal: AbortSignal.timeout(streamTimeout),
    });
  } catch (e) {
    rethrowIfTimeout(e, streamTimeout);
  }
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
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string; reasoning?: string };
          }>;
        };
        const delta = json.choices?.[0]?.delta;
        const reasoning = delta?.reasoning_content ?? delta?.reasoning;
        if (reasoning) yield { reasoning };
        if (delta?.content) yield { content: delta.content };
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
