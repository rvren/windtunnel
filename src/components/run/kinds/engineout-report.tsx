"use client";

import { useState } from "react";
import { LayoutGroup } from "motion/react";
import { Check, RotateCcw, X } from "lucide-react";

import { Panel } from "@/components/panel";
import {
  ArchitectureDiagram,
  HOP_TONE,
} from "@/components/project/architecture-diagram";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  cutLabel,
  hopTone,
  outageFlight,
  outageNumbers,
} from "@/lib/viz/outage";
import type { HopBehaviour, RunRecord } from "@/server/engine/schema";

/*
 * Engine Out's result: the part that was cut, dark on the map, and the
 * failure spreading from it hop by hop to the people who use the
 * application. Under the map, each hop with the lines that decide it, and
 * what each journey comes to.
 */

const BEHAVIOUR: Record<HopBehaviour, string> = {
  hangs: "Hangs",
  errors: "Errors",
  retries: "Retries",
  wrong_data: "Wrong result",
  silent: "Silent",
  holds: "Holds",
};

export function EngineOutReport({ run }: { run: RunRecord }) {
  const [play, setPlay] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const outage = run.outage;
  if (!outage) return null;
  const architecture = run.source?.architecture;
  const names = new Map(
    architecture?.components.map((item) => [item.id, item.name]) ?? [],
  );
  const numbers = outageNumbers(outage);

  return (
    <Panel className="p-5 md:p-6" data-testid="engineout-report">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
            Engine out · {cutLabel(outage)}
          </p>
          <h2 className="max-w-3xl text-xl font-semibold tracking-[-0.01em] text-balance">
            {outage.headline}
          </h2>
          {outage.mapFrom ? (
            <p className="text-xs text-muted-foreground">
              The map is the one this project&apos;s latest code run drew.
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPlay((n) => n + 1)}
          data-testid="engineout-replay"
        >
          <RotateCcw />
          Replay
        </Button>
      </div>

      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[0.8125rem] text-muted-foreground">
        {[
          [
            numbers.broken,
            numbers.broken === 1 ? "journey broken" : "journeys broken",
          ],
          [
            numbers.reached,
            numbers.reached === 1 ? "part on the path" : "parts on the path",
          ],
          [
            numbers.holds,
            numbers.holds === 1 ? "fallback holds" : "fallbacks hold",
          ],
        ].map(([value, label]) => (
          <div key={String(label)} className="flex items-baseline gap-1.5">
            <dt className="sr-only">{label}</dt>
            <dd className="text-lg font-medium text-foreground tabular-nums">
              {value}
            </dd>
            <span>{label}</span>
          </div>
        ))}
      </dl>

      {architecture && architecture.components.length > 0 ? (
        <div className="mt-6">
          <LayoutGroup id="engineout">
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
                plan: outageFlight(outage),
                play,
                selected,
                onHop: (id) => setSelected((now) => (now === id ? null : id)),
              }}
            />
          </LayoutGroup>
        </div>
      ) : null}

      <ol className="mt-6 divide-y border-t" data-testid="engineout-hops">
        {outage.hops.map((hop, index) => {
          const open = selected === hop.id;
          const tone = HOP_TONE[hopTone(hop)];
          return (
            <li key={hop.id}>
              <button
                type="button"
                onClick={() => setSelected(open ? null : hop.id)}
                aria-expanded={open}
                className={cn(
                  "grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-3 text-left sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]",
                  open && "bg-muted/30",
                )}
                data-testid="engineout-hop"
              >
                <span
                  className="grid size-6 place-items-center rounded-full border font-mono text-[0.6875rem]"
                  style={{ borderColor: tone, color: tone }}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.8125rem]">
                    <span className="font-medium">
                      {names.get(hop.to) ?? hop.to}
                    </span>
                    {hop.from !== hop.to ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · from {names.get(hop.from) ?? hop.from}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem]">
                    {hop.effect}
                  </span>
                  <span
                    className="mt-1 inline-block font-mono text-[0.6875rem] tracking-wide uppercase"
                    style={{ color: tone }}
                  >
                    {BEHAVIOUR[hop.behaviour]}
                  </span>
                </span>
                <span className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-auto sm:text-right">
                  {hop.location.path}:{hop.location.startLine}
                  {hop.location.endLine > hop.location.startLine
                    ? `-${hop.location.endLine}`
                    : ""}
                </span>
              </button>
              {open && hop.location.quote ? (
                <pre className="mb-3 ml-9 overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                  {hop.location.quote}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>

      {outage.journeys.length > 0 ? (
        <div className="mt-6" data-testid="engineout-journeys">
          <h3 className="text-[0.8125rem] font-medium">Journeys</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {outage.journeys.map((journey) => (
              <li
                key={journey.name}
                className="flex items-start gap-2.5 rounded-md border px-3 py-2.5"
              >
                {journey.broken ? (
                  <X
                    className="mt-0.5 size-4 shrink-0 text-sev-critical"
                    aria-label="Broken"
                  />
                ) : (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-ok"
                    aria-label="Goes on"
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-medium">
                    {journey.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {journey.effect}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
