"use client";

import { useState } from "react";
import { LayoutGroup } from "motion/react";
import { RotateCcw } from "lucide-react";

import { pillClass } from "@/components/pill";
import { Panel } from "@/components/panel";
import { ArchitectureDiagram } from "@/components/project/architecture-diagram";
import { Button } from "@/components/ui/button";
import { SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { chainFlight, chainLinks } from "@/lib/viz/chains";
import { SEVERITY_TONE } from "@/lib/viz/cockpit-views";
import type { RunRecord, Severity } from "@/server/engine/schema";

/*
 * Flutter's result: issues that were each reported alone, shown as the
 * chain an attacker would use them in. The chain flies across the map one
 * stop per link; under it, each link with what it does and the code that
 * leads to it from the link before.
 */

/** "1 critical and 3 high": what a chain is built from. */
function builtFrom(severities: Severity[]): string {
  const parts = SEVERITY_ORDER.flatMap((severity) => {
    const n = severities.filter((item) => item === severity).length;
    return n > 0 ? [`${n} ${SEVERITY_LABEL[severity].toLowerCase()}`] : [];
  });
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    : (parts[0] ?? "");
}

export function ChainsReport({ run }: { run: RunRecord }) {
  const chains = run.chains ?? [];
  const [index, setIndex] = useState(0);
  const [play, setPlay] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const chain = chains[Math.min(index, chains.length - 1)];
  if (!chain) {
    return (
      <Panel className="p-6 text-[0.8125rem] text-muted-foreground">
        No accepted issues add up to a breach in this run.
      </Panel>
    );
  }
  const links = chainLinks(chain, run);
  const plan = chainFlight(chain, run);
  const architecture = run.source?.architecture;
  const choose = (next: number) => {
    setIndex(next);
    setSelected(null);
    setPlay((n) => n + 1);
  };

  return (
    <Panel className="p-5 md:p-6" data-testid="chains-report">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
            Attack chain {index + 1} of {chains.length} ·{" "}
            {SEVERITY_LABEL[chain.severity]}, built from{" "}
            {builtFrom(links.map((link) => link.severity))}
          </p>
          <h2 className="text-xl font-semibold tracking-[-0.01em]">
            {chain.title}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {chain.impact}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {chains.length > 1 ? (
            <nav className="flex gap-1" aria-label="Attack chains">
              {chains.map((item, n) => (
                <button
                  key={item.id}
                  type="button"
                  className={pillClass(n === index, true)}
                  aria-current={n === index ? "true" : undefined}
                  onClick={() => choose(n)}
                  data-testid={`chains-pick-${n + 1}`}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ background: SEVERITY_TONE[item.severity] }}
                  />
                  Chain {n + 1}
                </button>
              ))}
            </nav>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPlay((n) => n + 1)}
            data-testid="chains-replay"
          >
            <RotateCcw />
            Replay
          </Button>
        </div>
      </div>

      {architecture && architecture.components.length > 0 ? (
        <div className="mt-6">
          <LayoutGroup id="chains">
            <ArchitectureDiagram
              components={architecture.components.map((item) => ({
                id: item.id,
                name: item.name,
                kind: item.kind,
                workspace: item.workspace,
                description: item.description,
                issues: 0,
                worst: null,
              }))}
              connections={architecture.connections}
              showWorkspace={false}
              flight={{
                plan,
                play,
                selected,
                onHop: (id) => setSelected((now) => (now === id ? null : id)),
              }}
            />
          </LayoutGroup>
        </div>
      ) : null}

      <ol className="mt-6 divide-y border-t" data-testid="chains-links">
        {links.map((link) => {
          const open = selected === link.id;
          return (
            <li key={link.id}>
              <button
                type="button"
                onClick={() => setSelected(open ? null : link.id)}
                aria-expanded={open}
                className={cn(
                  "grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-3 text-left sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]",
                  open && "bg-muted/30",
                )}
                data-testid="chains-link"
              >
                <span
                  className="grid size-6 place-items-center rounded-full border font-mono text-[0.6875rem]"
                  style={{
                    borderColor: SEVERITY_TONE[link.severity],
                    color: SEVERITY_TONE[link.severity],
                  }}
                >
                  {link.number}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.8125rem]">{link.role}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {link.title}
                  </span>
                  {link.via ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Reached because {lower(link.via.how)}{" "}
                      <span className="font-mono">
                        {link.via.path}:{link.via.startLine}
                        {link.via.endLine > link.via.startLine
                          ? `-${link.via.endLine}`
                          : ""}
                      </span>
                    </span>
                  ) : null}
                </span>
                {link.location ? (
                  <span className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-auto sm:text-right">
                    {link.location.path}:{link.location.startLine}
                  </span>
                ) : null}
              </button>
              {open && link.location?.quote ? (
                <pre className="mb-3 ml-9 overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                  {link.location.quote}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>
      {run.chainsDropped ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {run.chainsDropped === 1
            ? "1 more chain was left out: it did not pass the checks."
            : `${run.chainsDropped} more chains were left out: they did not pass the checks.`}
        </p>
      ) : null}
    </Panel>
  );
}

const lower = (text: string) =>
  text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
