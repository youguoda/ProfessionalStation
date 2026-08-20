/**
 * 极简安全 Markdown 渲染器（无依赖、无 HTML 注入面）：
 * 支持 **粗体**、`行内代码`、[链接](http...)（仅 http/https）、- 列表、换行。
 * 所有文本经 React 文本节点渲染，天然转义。
 */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(<strong key={`${keyBase}-${k++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyBase}-${k++}`}
          className="rounded bg-muted px-1 font-mono text-[0.9em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      const mm = tok.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
      if (mm) {
        nodes.push(
          <a
            key={`${keyBase}-${k++}`}
            href={mm[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline"
          >
            {mm[1]}
          </a>,
        );
      } else {
        nodes.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground">•</span>
              <span className="min-w-0 flex-1">{renderInline(trimmed.slice(2), `l${i}`)}</span>
            </div>
          );
        }
        if (trimmed === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line, `l${i}`)}</p>;
      })}
    </div>
  );
}
