"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { InfoTip } from "@/components/info-tip";
import { EASE } from "@/components/motion";
import { AgentIcon } from "@/components/run/badges";
import { ProgressBar } from "@/components/tuff/progress-bar";
import { RollingNumber } from "@/components/tuff/rolling-number";
import type { AgentId } from "@/lib/agents";
import type { ExplainKey } from "@/lib/explain";
import { cn } from "@/lib/utils";
import type { Change, Ratio } from "@/lib/viz/run-widgets";

/*
 * The right column of a finished run: how fully the design is stated, what
 * changed since the last run, the agents, and delivery. Each widget answers
 * one question and has its "i".
 */

function Widget({
  title,
  about,
  children,
  testId,
}: {
  title: string;
  about: ExplainKey;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="rounded-card bg-card p-5" data-testid={testId}>
      <h3 className="mb-4 flex items-center gap-1.5 text-sm font-medium">
        {title}
        <InfoTip about={about} label={title} />
      </h3>
      {children}
    </section>
  );
}

/** A half ring that fills to the score, out of 100. */
function Gauge({ score }: { score: number }) {
  const reduced = useReducedMotion();
  const r = 70;
  const length = Math.PI * r;
  return (
    <div className="relative mx-auto w-56">
      <svg
        viewBox="-80 -80 160 90"
        className="w-full overflow-visible"
        aria-hidden="true"
      >
        <path
          d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
          fill="none"
          stroke="var(--surface-raised)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <motion.path
          d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={length}
          className="glow"
          initial={reduced ? false : { strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - score / 100) }}
          transition={{ duration: 1, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[11px] text-muted-foreground">of 100</p>
        <RollingNumber
          value={String(score)}
          className="text-4xl leading-none font-light tabular-nums"
        />
      </div>
    </div>
  );
}

export function DesignWidget({
  score,
  parts,
}: {
  score: number;
  parts: Ratio[];
}) {
  return (
    <Widget
      title="Design specified"
      about="designSpecified"
      testId="widget-design"
    >
      <Gauge score={score} />
      <p className="mt-2 mb-4 text-center text-xs text-muted-foreground">
        of the permission rules the design states
      </p>
      <div className="grid grid-cols-3 gap-3">
        {parts.map((part) => (
          <div key={part.label} className="min-w-0">
            <p className="flex items-baseline justify-between gap-1 text-xs">
              <span className="truncate text-muted-foreground">
                {part.label}
              </span>
              <span className="font-mono tabular-nums">
                {part.total ? Math.round((part.value / part.total) * 100) : 0}
              </span>
            </p>
            <ProgressBar
              className="mt-1.5"
              label={part.label}
              value={part.value}
              max={Math.max(part.total, 1)}
              size="sm"
              kind="meter"
            />
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {part.note}
            </p>
          </div>
        ))}
      </div>
    </Widget>
  );
}

export function ChangesWidget({ changes }: { changes: Change[] }) {
  return (
    <Widget title="What changed" about="whatChanged" testId="widget-changes">
      <p className="-mt-2 mb-3 text-xs text-muted-foreground">
        Against the project&apos;s previous finished run
      </p>
      <ul className="divide-y">
        {changes.map((change) => {
          const difference = change.now - change.before;
          const good =
            difference === 0 ? null : difference > 0 === change.upIsGood;
          return (
            <li
              key={change.label}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <span className="flex-1 text-muted-foreground">
                {change.label}
              </span>
              <span className="font-mono tabular-nums">{change.now}</span>
              <span
                className={cn(
                  "w-12 text-right font-mono text-xs tabular-nums",
                  good === null
                    ? "text-muted-foreground"
                    : good
                      ? "text-ok"
                      : "text-sev-critical",
                )}
              >
                {difference > 0 ? `+${difference}` : difference}
              </span>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

export function AgentsWidget({
  standings,
  selected,
  onSelect,
}: {
  standings: {
    id: AgentId;
    name: string;
    points: number;
    accepted: number;
    rejected: number;
  }[];
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
}) {
  return (
    <Widget title="Agents" about="scoreboard" testId="widget-agents">
      <ul className="-mx-2 space-y-0.5">
        {standings.map((agent) => (
          <li key={agent.id}>
            <button
              type="button"
              onClick={() => onSelect(selected === agent.id ? null : agent.id)}
              aria-pressed={selected === agent.id}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted",
                selected === agent.id && "bg-muted ring-1 ring-brand/40",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <AgentIcon agentId={agent.id} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{agent.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {agent.accepted} accepted · {agent.rejected} rejected
                </span>
              </span>
              <span className="font-mono text-xs tabular-nums">
                {agent.points}
                <span className="text-muted-foreground"> pt</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

export function DeliveryWidget({
  workOrders,
  sent,
  linked,
  onOpen,
}: {
  workOrders: number;
  /** Work orders that reached 8090; null when the project is not linked. */
  sent: number | null;
  linked: boolean;
  onOpen: () => void;
}) {
  return (
    <Widget title="Delivery" about="workOrders" testId="widget-delivery">
      <div className="flex items-baseline gap-2">
        <RollingNumber
          value={String(workOrders)}
          className="text-3xl leading-none font-light tabular-nums"
        />
        <span className="text-xs text-muted-foreground">work orders</span>
      </div>
      {linked && sent !== null ? (
        <div className="mt-4">
          <p className="mb-1.5 flex justify-between text-xs">
            <span className="text-muted-foreground">
              In 8090 Software Factory
            </span>
            <span className="font-mono tabular-nums">
              {sent}/{workOrders}
            </span>
          </p>
          <ProgressBar
            label="Work orders in 8090"
            value={sent}
            max={Math.max(workOrders, 1)}
            size="sm"
            kind="meter"
            tone={sent === workOrders ? "positive" : "brand"}
          />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Not sent anywhere: the project is not linked to 8090.
        </p>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex items-center gap-1 text-xs text-link hover:underline"
      >
        Work orders
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
    </Widget>
  );
}
