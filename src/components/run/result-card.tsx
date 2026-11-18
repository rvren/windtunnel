"use client";

import { ArrowRight } from "lucide-react";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { RunResult } from "@/lib/viz/result";

/**
 * What a finished run came to, for every kind: the headline, three numbers,
 * the top three items and the one way into the full detail.
 */
export function ResultCard({
  result,
  onOpen,
}: {
  result: RunResult;
  onOpen: (tab: string) => void;
}) {
  return (
    <Panel className="p-6 md:p-7" data-testid="run-result">
      <p className="text-2xl leading-snug font-semibold tracking-[-0.02em] text-balance">
        {result.headline}
      </p>
      {result.detail ? (
        <p className="mt-1.5 line-clamp-3 max-w-3xl text-sm text-muted-foreground">
          {result.detail}
        </p>
      ) : null}
      {result.numbers.length > 0 ? (
        <div className="mt-6 grid max-w-xl grid-cols-3 gap-4">
          {result.numbers.map((number) => (
            <div key={number.label}>
              <p className="text-3xl font-light tabular-nums">{number.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {number.label}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {result.items.length > 0 ? (
        <ul className="mt-6 divide-y divide-border/60 border-t border-border/60">
          {result.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  !item.severity && "bg-brand",
                )}
                style={
                  item.severity
                    ? { background: SEVERITY_TONE[item.severity] }
                    : undefined
                }
              />
              <span className="min-w-0">
                <span className="block text-[0.8125rem]">{item.title}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {item.note}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {result.action ? (
        <Button
          className="mt-6"
          onClick={() => onOpen(result.action!.tab)}
          data-testid="run-result-action"
        >
          {result.action.label}
          <ArrowRight />
        </Button>
      ) : null}
    </Panel>
  );
}
