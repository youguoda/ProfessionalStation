import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown";

describe("Markdown 渲染", () => {
  it("渲染粗体/行内代码/链接", () => {
    const html = renderToStaticMarkup(
      <Markdown text={'**重要** 和 `code` 和 [官网](https://example.com)'} />,
    );
    expect(html).toContain("<strong>重要</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('href="https://example.com"');
  });

  it("渲染列表与换行", () => {
    const html = renderToStaticMarkup(<Markdown text={"- 第一项\n- 第二项"} />);
    expect(html).toContain("第一项");
    expect(html).toContain("第二项");
  });

  it("HTML 与危险链接被安全转义", () => {
    const html = renderToStaticMarkup(
      <Markdown text={'<script>alert(1)</script> 和 [x](javascript:alert(1))'} />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
  });
});
