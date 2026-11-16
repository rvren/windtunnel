"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

/*
 * One Mermaid diagram, drawn in the browser. Mermaid is loaded only on the
 * docs page, the first time a diagram is shown. Colours follow the theme.
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        const dark = resolvedTheme !== "light";
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "var(--font-geist-sans), ui-sans-serif, sans-serif",
          themeVariables: dark
            ? {
                background: "#0b0b0d",
                primaryColor: "#17171a",
                primaryTextColor: "#f7f7f8",
                primaryBorderColor: "#3a3a42",
                lineColor: "#6b6b75",
                secondaryColor: "#1c1c20",
                tertiaryColor: "#121214",
                clusterBkg: "#111114",
                clusterBorder: "#2a2a30",
                noteBkgColor: "#1c1c20",
                noteTextColor: "#f7f7f8",
                actorBkg: "#17171a",
                actorBorder: "#3a3a42",
                actorTextColor: "#f7f7f8",
                signalColor: "#a594ff",
                signalTextColor: "#f7f7f8",
              }
            : {
                background: "#ffffff",
                primaryColor: "#f6f6f8",
                primaryTextColor: "#0b0b0d",
                primaryBorderColor: "#d4d4dc",
                lineColor: "#8b8b96",
                secondaryColor: "#ededf1",
                tertiaryColor: "#fafafb",
                clusterBkg: "#fafafb",
                clusterBorder: "#e4e4ea",
                signalColor: "#6a48f2",
              },
        });
        const { svg: drawn } = await mermaid.render(`mermaid-${id}`, chart);
        if (!stopped) {
          setSvg(drawn);
          setError(null);
        }
      } catch (cause) {
        if (!stopped) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [chart, id, resolvedTheme]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-card border bg-card p-4 font-mono text-xs text-sev-critical">
        {error}
      </pre>
    );
  }
  return (
    <div
      className="overflow-x-auto rounded-card border bg-card p-5 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      data-testid="docs-diagram"
      // Mermaid's own output, drawn with securityLevel "strict" from a file in
      // this repository.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Drawing the diagram
        </p>
      )}
    </div>
  );
}
