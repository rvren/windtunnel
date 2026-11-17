import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Mermaid } from "./mermaid";

/* A Markdown document from docs/, with its Mermaid blocks drawn. */
export function Doc({ markdown }: { markdown: string }) {
  return (
    <article
      className="max-w-5xl text-[0.9375rem] leading-relaxed text-muted-foreground [&_a]:text-link [&_a]:underline-offset-4 hover:[&_a]:underline [&_code]:rounded-sm [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.78125rem] [&_code]:text-foreground [&_h1]:hidden [&_h2]:mt-14 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-foreground [&_li]:my-1 [&_p]:my-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
      data-testid="docs-article"
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children).replace(/\n$/, "");
            if (className === "language-mermaid") {
              return (
                <div className="my-5">
                  <Mermaid chart={text} />
                </div>
              );
            }
            if (className) {
              return (
                <pre className="my-4 overflow-x-auto rounded-card border bg-card p-4 font-mono text-xs text-foreground">
                  {text}
                </pre>
              );
            }
            return <code>{children}</code>;
          },
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-card border bg-card">
              <table className="w-full text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b px-4 py-2.5 font-medium text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-4 py-2.5 align-top last:border-b-0 [tr:last-child_&]:border-b-0">
              {children}
            </td>
          ),
        }}
      >
        {markdown}
      </Markdown>
    </article>
  );
}
