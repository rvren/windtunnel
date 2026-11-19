import { featureOf, plainTitle } from "@/lib/features";
import { kindOf, type RunKind, type RunRecord } from "@/server/engine/schema";

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
): Prefill {
  const from = kindOf(run);
  const prefill: Prefill = {};
  if (subject === "requirement" || subject === "code")
    prefill.subject = subject;
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
