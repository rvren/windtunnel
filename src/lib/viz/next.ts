import { featureOf, plainTitle } from "@/lib/features";
import { componentOf, groupLocation } from "@/server/engine/architecture";
import {
  kindOf,
  type OutageMode,
  type RunKind,
  type RunRecord,
} from "@/server/engine/schema";

import { SAMPLE_DUELS, SAMPLE_OUTAGES } from "@/lib/samples";

import { cutLabel, worstHops } from "./outage";

/*
 * One run leads to the next. A finished run offers up to three runs that
 * follow from what it found, each a link to the start page with its input
 * already filled in from this run (`from=`). The start page still asks
 * before anything starts, and says whether the run is billed. Pure.
 */

export interface NextRun {
  kind: RunKind;
  /** The button's words, in title case. */
  label: string;
  /** One line: why this run follows. */
  why: string;
  href: string;
}

/** What the start page fills in when it opens from an earlier run. */
export interface Prefill {
  text?: string;
  subject?: "requirement" | "code";
  /** Engine Out: the part to cut, as a map id, and how it fails. */
  outage?: { part: string; mode: OutageMode; label: string };
  /** Dogfight: the issue to defend. */
  dogfight?: { runId: string; groupId: string; label: string };
}

/** A code run's worst security issue that has a checked patch. */
function topFix(run: RunRecord) {
  const order = ["critical", "high", "medium", "low"];
  return [...run.groups]
    .filter((group) => {
      const fix = run.remediations?.[group.id];
      return (
        group.type === "security_vulnerability" &&
        fix?.status === "made" &&
        fix.edits.length > 0 &&
        !fix.heldRounds &&
        // A sample run offers only what its script can play.
        (!run.sample || SAMPLE_DUELS.includes(group.id))
      );
    })
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))[0];
}

/**
 * The part a code run's outage findings gather on: the one to cut first.
 * Each weakness in how a part calls others (no time limit, an unsafe
 * retry) counts for the part it calls: the one its cited file or its words
 * name ("billing_client.py" names billing), or else a share of each part
 * it calls. On a sample run only the parts the sample scripts can win.
 */
export function weakestPart(
  run: RunRecord,
): { id: string; name: string } | null {
  const architecture = run.source?.architecture;
  if (!architecture) return null;
  const names = (id: string) => {
    const part = architecture.components.find((item) => item.id === id);
    return [id.replace(/^cmp-/, ""), ...(part?.name.split(/\s+/) ?? [])]
      .map((word) => word.toLowerCase())
      .filter(
        (word) =>
          word.length >= 4 &&
          !["service", "database", "system", "worker", "queue"].includes(word),
      );
  };
  const weight = new Map<string, number>();
  for (const group of run.groups) {
    if (group.type !== "architecture_weakness") continue;
    const location = groupLocation(group, run);
    const at = location ? componentOf(location.path, architecture) : null;
    if (!at) continue;
    const callees = architecture.connections
      .filter((call) => call.from === at)
      .map((call) => call.to);
    if (callees.length === 0) continue;
    const text =
      `${location?.path ?? ""} ${group.title} ${group.summary}`.toLowerCase();
    const named = callees.filter((id) =>
      names(id).some((word) => text.includes(word)),
    );
    const share = named.length > 0 ? named : callees;
    for (const id of share) {
      weight.set(id, (weight.get(id) ?? 0) + 1 / share.length);
    }
  }
  const allowed = (id: string) =>
    !run.sample || SAMPLE_OUTAGES.includes(`${id}:slow`);
  const [best] = [...weight.entries()]
    .filter(([id]) => allowed(id))
    .sort((a, b) => b[1] - a[1]);
  if (!best) return null;
  const part = architecture.components.find((item) => item.id === best[0]);
  return part ? { id: part.id, name: part.name } : null;
}

const MAX = 3;

function link(
  run: RunRecord,
  kind: RunKind,
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ kind, from: run.id, ...extra });
  if (run.projectId) query.set("project", run.projectId);
  return `/app/runs/new?${query}`;
}

/** Did this run read code (a project's workspaces or a repository)? */
const readCode = (run: RunRecord) => Boolean(run.source);

/** The Fly-off's winning blueprint, if the judge picked one. */
function winnerOf(run: RunRecord) {
  const verdict = run.flyoff?.verdict;
  if (!verdict) return null;
  return (
    run.flyoff?.blueprints.find((item) => item.id === verdict.winnerId)
      ?.blueprint ?? null
  );
}

/** The runs that follow from a finished run, most useful first. */
export function nextRunsOf(run: RunRecord): NextRun[] {
  if (run.status !== "completed") return [];
  const kind = kindOf(run);
  const next: NextRun[] = [];
  const add = (item: NextRun) => {
    if (next.length < MAX) next.push(item);
  };

  if (kind === "audit" && !readCode(run) && run.requirement.trim()) {
    add({
      kind: "flyoff",
      label: "Design It Three Ways",
      why: "Three designers propose a blueprint for this requirement, and a judge picks one.",
      href: link(run, "flyoff"),
    });
  }
  if (kind === "flyoff" && winnerOf(run)) {
    add({
      kind: "audit",
      label: "Test The Winning Design",
      why: "Five agents attack the blueprint the judge picked.",
      href: link(run, "audit", { subject: "requirement" }),
    });
  }
  if (kind === "audit" && readCode(run)) {
    const fix = topFix(run);
    if (fix) {
      add({
        kind: "dogfight",
        label: "Harden The Top Fix",
        why: `An attacker tries to get past the fix for "${fix.title}", round after round.`,
        href: link(run, "dogfight", { group: fix.id }),
      });
    }
  }
  if (kind === "audit" && readCode(run)) {
    const part = weakestPart(run);
    if (part) {
      add({
        kind: "engineout",
        label: `Cut The ${part.name.replace(/\b\w/g, (letter) => letter.toUpperCase())}`,
        why: "Most outage issues depend on it: see what fails when it slows down.",
        href: link(run, "engineout", { part: part.id, mode: "slow" }),
      });
    }
  }
  if (kind === "engineout" && run.outage) {
    const [worst] = worstHops(run.outage, 1);
    if (worst) {
      add({
        kind: "blackbox",
        label: "Investigate The Worst Step",
        why: "Black Box traces it in the code and writes a fix.",
        href: link(run, "blackbox", { hop: worst.id }),
      });
    }
  }
  if (kind === "blackbox" && readCode(run)) {
    add({
      kind: "audit",
      label: "Test The Whole Project",
      why: "Five agents read every workspace, to find what else is like this.",
      href: link(run, "audit", { subject: "code" }),
    });
  }
  return next;
}

/** The blueprint as plain Markdown, to test it as a requirement. */
function blueprintText(run: RunRecord): string | null {
  const blueprint = winnerOf(run);
  if (!blueprint) return null;
  const lines = [
    run.requirement.trim(),
    "",
    `## Chosen design: ${blueprint.name}`,
    "",
    blueprint.summary,
    "",
    "### Parts",
    ...blueprint.components.map(
      (part) => `- ${part.name} (${part.kind}): ${part.description}`,
    ),
    "",
    "### Decisions",
    ...blueprint.decisions.map(
      (item) =>
        `- ${item.decision}. Why: ${item.why}. Trade-off: ${item.tradeoff}.`,
    ),
  ];
  return lines.join("\n").trim();
}

/**
 * The start page's input for a run of `kind` that follows `run`. Only
 * what the earlier run really holds is filled in; anything else is left
 * to the person starting the run.
 */
export function prefillFrom(
  run: RunRecord,
  kind: RunKind,
  subject: string | undefined,
  query: { part?: string; mode?: string; hop?: string; group?: string } = {},
): Prefill {
  const from = kindOf(run);
  const prefill: Prefill = {};
  if (subject === "requirement" || subject === "code")
    prefill.subject = subject;
  if (kind === "dogfight" && query.group) {
    const group = run.groups.find((item) => item.id === query.group);
    if (group) {
      prefill.dogfight = {
        runId: run.id,
        groupId: group.id,
        label: group.title,
      };
    }
  }
  if (kind === "engineout" && query.part) {
    const part = run.source?.architecture?.components.find(
      (item) => item.id === query.part,
    );
    if (part) {
      prefill.outage = {
        part: part.id,
        mode: query.mode === "down" ? "down" : "slow",
        label: part.name,
      };
    }
  }
  if (kind === "blackbox" && from === "engineout" && run.outage && query.hop) {
    const hop = run.outage.hops.find((item) => item.id === query.hop);
    if (hop) {
      prefill.text = `Engine Out (${cutLabel(run.outage)}): ${hop.effect} At ${hop.location.path}:${hop.location.startLine}-${hop.location.endLine}.`;
    }
  }
  if (kind === "flyoff" && run.requirement.trim()) {
    prefill.text = run.requirement;
  }
  if (kind === "audit" && from === "flyoff") {
    const text = blueprintText(run);
    if (text) prefill.text = text;
  }
  return prefill;
}

/** The start page's line that says where its input came from. */
export function prefillNote(run: RunRecord): string {
  return `Filled in from the ${featureOf(kindOf(run)).name} "${plainTitle(run.title)}".`;
}
