import { SEVERITY_LABEL, SEVERITY_ORDER, termsFor } from "@/lib/labels";
import type { RunRecord, Severity } from "@/server/engine/schema";

/*
 * What a finished run came to, said plainly: one headline, a line under
 * it, three numbers, the top three items and the one way into the detail.
 * The same shape for every kind, so the run page shows one result card.
 * Pure; read from the saved run, nothing estimated.
 */

export interface RunResult {
  headline: string;
  detail: string | null;
  numbers: { label: string; value: string }[];
  items: {
    id: string;
    title: string;
    note: string;
    severity: Severity | null;
  }[];
  /** The tab with the full detail, and the call to open it. */
  action: { label: string; tab: string } | null;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const rank = (severity: Severity) => SEVERITY_ORDER.indexOf(severity);

/** The most severe groups, as items. */
function topGroups(run: RunRecord): RunResult["items"] {
  return [...run.groups]
    .sort((a, b) => rank(a.severity) - rank(b.severity))
    .slice(0, 3)
    .map((group) => ({
      id: group.id,
      title: group.title,
      note: group.summary,
      severity: group.severity,
    }));
}

const countOf = (run: RunRecord, severity: Severity) =>
  run.groups.filter((group) => group.severity === severity).length;

export function resultOf(run: RunRecord): RunResult {
  if (run.status !== "completed") {
    return {
      headline:
        run.status === "running"
          ? "The run is still going."
          : run.status === "interrupted"
            ? "This run was interrupted."
            : "This run failed.",
      detail: run.error,
      numbers: [],
      items: [],
      action: null,
    };
  }

  const kind = run.kind ?? "audit";

  if (kind === "flyoff" && run.flyoff?.verdict) {
    const { blueprints, critiques, verdict } = run.flyoff;
    const winner = blueprints.find((item) => item.id === verdict.winnerId);
    const weaknesses = critiques.reduce(
      (sum, item) => sum + item.weaknesses.length,
      0,
    );
    return {
      headline: winner?.blueprint
        ? `${winner.proposer}'s design wins: ${winner.blueprint.name}.`
        : "The judge picked a design.",
      detail: verdict.summary,
      numbers: [
        {
          label: "Designs",
          value: String(blueprints.filter((item) => item.blueprint).length),
        },
        { label: "Critiques", value: String(critiques.length) },
        { label: "Weaknesses named", value: String(weaknesses) },
      ],
      items: verdict.ranking.slice(0, 3).map((item) => {
        const entry = blueprints.find((b) => b.id === item.blueprintId);
        return {
          id: item.blueprintId,
          title: `${item.rank}. ${entry?.proposer ?? item.blueprintId}${entry?.blueprint ? `: ${entry.blueprint.name}` : ""}`,
          note: item.reason,
          severity: null,
        };
      }),
      action: { label: "Open The Blueprints", tab: "report" },
    };
  }

  if (kind === "blackbox" && run.triage) {
    const triage = run.triage;
    const first = triage.suspects[0];
    const fix = Object.values(run.remediations ?? {})[0];
    const fixText =
      fix?.status === "made"
        ? fix.edits.length > 0
          ? "Ready"
          : "As steps"
        : "None";
    return {
      headline: first
        ? `Cause found in ${first.path}:${first.startLine}.`
        : "No lines in the code could be named.",
      detail: triage.title,
      numbers: [
        { label: "Severity", value: SEVERITY_LABEL[triage.severity] },
        {
          label: "Confidence",
          value:
            triage.confidence.charAt(0).toUpperCase() +
            triage.confidence.slice(1),
        },
        { label: "Fix", value: fixText },
      ],
      items: triage.suspects.slice(0, 3).map((suspect) => ({
        id: `${suspect.path}:${suspect.startLine}`,
        title: `${suspect.path}:${suspect.startLine}`,
        note: suspect.why,
        severity: null,
      })),
      action: {
        label: fix?.status === "made" ? "Review The Fix" : "See The Incident",
        tab: "report",
      },
    };
  }

  if (kind === "crosswind" && run.impact) {
    const touched = run.impact.components.length;
    const breaks = run.groups.length;
    const fixes = run.impact.fixes.length;
    return {
      headline: `This change touches ${plural(touched, "part")} and could break ${plural(breaks, "thing")}.`,
      detail:
        fixes > 0
          ? `It also fixes ${plural(fixes, "known issue")}.`
          : run.impact.summary,
      numbers: [
        { label: "Parts touched", value: String(touched) },
        { label: "Could break", value: String(breaks) },
        { label: "Fixes", value: String(fixes) },
      ],
      items: topGroups(run),
      action: { label: "See The Impact", tab: "impact" },
    };
  }

  // A Tunnel Run: on code, issues; on an idea, probable risks.
  const probable = !run.source;
  const word = probable ? "risk" : "issue";
  const n = run.groups.length;
  const critical = countOf(run, "critical");
  const terms = termsFor(probable);
  // Flutter: on code, the issues that add up to a breach come first.
  const chains = probable ? [] : (run.chains ?? []);
  const topChain = chains[0];
  return {
    headline:
      n === 0
        ? `No ${word}s found.`
        : `${plural(n, word)} found${critical > 0 ? `, ${critical} critical` : ""}.`,
    detail:
      run.workOrders.length > 0
        ? `${plural(run.workOrders.length, "work order")} written with acceptance criteria.`
        : null,
    numbers: [
      { label: terms.severity("critical"), value: String(critical) },
      run.chains && !probable
        ? { label: "Attack chains", value: String(chains.length) }
        : {
            label: terms.severity("high"),
            value: String(countOf(run, "high")),
          },
      { label: terms.workOrders, value: String(run.workOrders.length) },
    ],
    items: topChain
      ? [
          {
            id: topChain.id,
            title: `Attack chain: ${topChain.title}`,
            note: topChain.impact,
            severity: topChain.severity,
          },
          ...topGroups(run).slice(0, 2),
        ]
      : topGroups(run),
    action:
      n > 0
        ? {
            label: probable ? "See The Risks" : "See The Issues",
            tab: "findings",
          }
        : null,
  };
}
