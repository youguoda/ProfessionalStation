import { describe, expect, it } from "vitest";
import { defaultAgentProfile } from "@/lib/domain/factory";
import {
  assembleSystemPrompt,
  BASE_RULES,
  getPersona,
  PERSONA_TEMPLATES,
} from "./persona";

describe("persona 模板", () => {
  it("内置 4 套模板且 id 唯一", () => {
    expect(PERSONA_TEMPLATES).toHaveLength(4);
    expect(new Set(PERSONA_TEMPLATES.map((p) => p.id)).size).toBe(4);
  });

  it("未知 id 回退第一套模板", () => {
    expect(getPersona("unknown").id).toBe(PERSONA_TEMPLATES[0].id);
  });
});

describe("assembleSystemPrompt", () => {
  it("包含姓名/四段/底线规则/工具/记忆/上下文", () => {
    const profile = defaultAgentProfile();
    profile.name = "小马";
    const s = assembleSystemPrompt(profile, "上下文内容", "工具内容", "记忆内容");
    expect(s).toContain("你的名字是「小马」。");
    expect(s).toContain("<角色>");
    expect(s).toContain("<语气>");
    expect(s).toContain("<风格>");
    expect(s).toContain("<边界>");
    expect(s).toContain("<可用工具（proposals）>");
    expect(s).toContain("工具内容");
    expect(s).toContain("记忆内容");
    expect(s).toContain("上下文内容");
    for (const rule of BASE_RULES) expect(s).toContain(rule);
  });

  it("自定义指令追加在模板之后，底线规则始终位于自定义之后", () => {
    const profile = defaultAgentProfile();
    profile.custom.role = ["用户叫你老马。"];
    profile.custom.boundaries = ["不要说废话。"];
    const s = assembleSystemPrompt(profile, "", "", "");
    expect(s.indexOf("用户叫你老马。")).toBeGreaterThan(
      s.indexOf(PERSONA_TEMPLATES[0].role[0]),
    );
    expect(s.indexOf("不要说废话。")).toBeLessThan(s.indexOf(BASE_RULES[0]));
  });

  it("reply 模式：无工具段、要求纯文本", () => {
    const s = assembleSystemPrompt(defaultAgentProfile(), "ctx", "tools", "mem", "reply", "");
    expect(s).not.toContain("<可用工具");
    expect(s).toContain("纯文本");
    expect(s).not.toContain('"proposals"');
  });

  it("proposals 模式：含工具段与 proposals JSON 指令，含摘要", () => {
    const s = assembleSystemPrompt(defaultAgentProfile(), "ctx", "tools", "mem", "proposals", "早期摘要内容");
    expect(s).toContain("<可用工具");
    expect(s).toContain('"proposals"');
    expect(s).toContain("早期摘要内容");
  });

  it("chat 模式（默认）含摘要注入", () => {
    const s = assembleSystemPrompt(defaultAgentProfile(), "ctx", "tools", "mem", "chat", "早期摘要内容");
    expect(s).toContain("<对话早期摘要>");
    expect(s).toContain("早期摘要内容");
  });
});
