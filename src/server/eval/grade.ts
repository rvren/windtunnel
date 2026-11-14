import type {
  AgentId,
  FindingType,
  RunRecord,
  Severity,
} from "../engine/schema";

/*
 * Grading one eval run against its answer key. Pure.
 *
 * Each finding an agent filed is matched to a known flaw: first in code
 * (same file, overlapping lines, same kind), then by a judge for what code
 * could not place (judge.ts). Metrics come per agent and for the run, with
 * the judge's own keep and drop calls scored too.
 */

export interface Place {
  file: string;
  lines: [number, number];
}

export interface KeyFlaw extends Place {
  id: string;
  title: string;
  kind: FindingType;
  severity: Severity;
  cwe: string | null;
  why: string;
  /** More places the flaw spans (a flaw across services). */
  files?: Place[];
}

export interface CaseKey {
  case: string;
  version: number;
  flaws: KeyFlaw[];
  /** Paths that explain the flaws; removed before the agents read the code. */
  hidden_from_agents?: string[];
}

/** One finding an agent filed, as the grader sees it. */
export interface Candidate {
  uid: string;
  agentId: AgentId;
  title: string;
  description: string;
  kind: FindingType;
  severity: Severity;
  place: Place | null;
  /** In a group the judge accepted, so in the report. */
  accepted: boolean;
}

export type Verdict =
  | { kind: "match"; flawId: string }
  | { kind: "unlisted" }
  | { kind: "not_real" };

/** How close two line ranges may be and still be the same place. */
const SLACK = 5;

const normal = (path: string) => path.replace(/^\.?\//, "").trim();

/** The findings of a finished run, with whether each reached the report. */
export function candidatesOf(run: RunRecord): Candidate[] {
  const accepted = new Set(run.groups.flatMap((group) => group.findingIds));
  return run.agents.flatMap((agent) =>
    agent.findings.map((finding) => ({
      uid: finding.uid,
      agentId: agent.agentId,
      title: finding.title,
      description: finding.description,
      kind: finding.type,
      severity: finding.severity,
      place: finding.location
        ? {
            file: normal(finding.location.path),
            lines: [finding.location.startLine, finding.location.endLine],
          }
        : null,
      accepted: accepted.has(finding.uid),
    })),
  );
}

const placesOf = (flaw: KeyFlaw): Place[] => [
  { file: flaw.file, lines: flaw.lines },
  ...(flaw.files ?? []),
];

function overlaps(a: Place, b: Place): boolean {
  if (normal(a.file) !== normal(b.file)) return false;
  return a.lines[0] <= b.lines[1] + SLACK && b.lines[0] <= a.lines[1] + SLACK;
}

/** Same file, overlapping lines and the same kind: certainly the same flaw. */
export function codeMatch(candidate: Candidate, flaw: KeyFlaw): boolean {
  if (!candidate.place || candidate.kind !== flaw.kind) return false;
  return placesOf(flaw).some((place) => overlaps(candidate.place!, place));
}

/**
 * Matches what code can be sure of: one flaw fits, or one fits clearly
 * best (its range within two lines of the finding's and nearer than any
 * other). Small files put several flaws on the same lines, so anything
 * less clear goes to the judge.
 */
export function matchInCode(
  key: CaseKey,
  candidates: Candidate[],
): { verdicts: Map<string, Verdict>; leftovers: Candidate[] } {
  const verdicts = new Map<string, Verdict>();
  const leftovers: Candidate[] = [];
  for (const candidate of candidates) {
    const fits = key.flaws.filter((flaw) => codeMatch(candidate, flaw));
    if (fits.length === 1) {
      verdicts.set(candidate.uid, { kind: "match", flawId: fits[0].id });
      continue;
    }
    const distance = (flaw: KeyFlaw) =>
      Math.min(
        ...placesOf(flaw).map(
          (place) =>
            Math.abs(place.lines[0] - candidate.place!.lines[0]) +
            Math.abs(place.lines[1] - candidate.place!.lines[1]),
        ),
      );
    const ranked = fits
      .map((flaw) => ({ flaw, distance: distance(flaw) }))
      .sort((a, b) => a.distance - b.distance);
    if (
      ranked.length > 1 &&
      ranked[0].distance <= 2 &&
      ranked[0].distance < ranked[1].distance
    ) {
      verdicts.set(candidate.uid, { kind: "match", flawId: ranked[0].flaw.id });
    } else {
      leftovers.push(candidate);
    }
  }
  return { verdicts, leftovers };
}

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

/** A share, or null when there was nothing to divide by. */
const share = (part: number, whole: number) => (whole ? part / whole : null);

export interface AgentScore {
  agentId: AgentId;
  findings: number;
  /** Known flaws this agent found, out of all in the key. */
  recall: number | null;
  /** Its findings that match a known flaw, out of those that are decided. */
  precision: number | null;
  /** Matched findings with the key's severity or one step off. */
  severity: number | null;
  /** Known flaws only this agent found. */
  unique: number;
  /** Real flaws not in the key, waiting for the owner. */
  unlisted: number;
}

export interface RunScore {
  flaws: number;
  /** Known flaws any agent found. */
  recall: number | null;
  /** Known flaws that reached the report (an accepted finding). */
  recallReported: number | null;
  /** The same, for critical and high flaws only. */
  seriousReported: number | null;
  /** Of the findings that match a known flaw, the share the judge kept. */
  judgeKept: number | null;
  /** Of the findings that are not real, the share the judge dropped. */
  judgeDropped: number | null;
  /** Findings in the report that match a known flaw, out of decided ones. */
  precisionReported: number | null;
  unlisted: number;
  agents: AgentScore[];
}

export function score(
  key: CaseKey,
  candidates: Candidate[],
  verdicts: Map<string, Verdict>,
): RunScore {
  const verdict = (candidate: Candidate) => verdicts.get(candidate.uid);
  const matchOf = (candidate: Candidate) => {
    const found = verdict(candidate);
    return found?.kind === "match" ? found.flawId : null;
  };
  const total = key.flaws.length;
  const severityOf = new Map(key.flaws.map((flaw) => [flaw.id, flaw.severity]));
  const serious = key.flaws.filter(
    (flaw) => flaw.severity === "critical" || flaw.severity === "high",
  );

  const foundBy = new Map<string, Set<AgentId>>();
  for (const candidate of candidates) {
    const id = matchOf(candidate);
    if (!id) continue;
    foundBy.set(id, (foundBy.get(id) ?? new Set()).add(candidate.agentId));
  }
  const reported = new Set(
    candidates
      .filter((candidate) => candidate.accepted)
      .map(matchOf)
      .filter((id): id is string => id !== null),
  );

  const agentIds = [...new Set(candidates.map((item) => item.agentId))];
  const agents = agentIds.map((agentId): AgentScore => {
    const own = candidates.filter((item) => item.agentId === agentId);
    const matched = own.filter((item) => matchOf(item) !== null);
    const notReal = own.filter((item) => verdict(item)?.kind === "not_real");
    const flawsFound = new Set(matched.map((item) => matchOf(item)!));
    const close = matched.filter((item) => {
      const expected = SEVERITIES.indexOf(severityOf.get(matchOf(item)!)!);
      return Math.abs(SEVERITIES.indexOf(item.severity) - expected) <= 1;
    });
    return {
      agentId,
      findings: own.length,
      recall: share(flawsFound.size, total),
      precision: share(matched.length, matched.length + notReal.length),
      severity: share(close.length, matched.length),
      unique: [...flawsFound].filter((id) => foundBy.get(id)?.size === 1)
        .length,
      unlisted: own.filter((item) => verdict(item)?.kind === "unlisted").length,
    };
  });

  const matched = candidates.filter((item) => matchOf(item) !== null);
  const notReal = candidates.filter(
    (item) => verdict(item)?.kind === "not_real",
  );
  const inReport = candidates.filter((item) => item.accepted);
  const reportMatched = inReport.filter((item) => matchOf(item) !== null);
  const reportNotReal = inReport.filter(
    (item) => verdict(item)?.kind === "not_real",
  );
  return {
    flaws: total,
    recall: share(foundBy.size, total),
    recallReported: share(reported.size, total),
    seriousReported: share(
      serious.filter((flaw) => reported.has(flaw.id)).length,
      serious.length,
    ),
    judgeKept: share(
      matched.filter((item) => item.accepted).length,
      matched.length,
    ),
    judgeDropped: share(
      notReal.filter((item) => !item.accepted).length,
      notReal.length,
    ),
    precisionReported: share(
      reportMatched.length,
      reportMatched.length + reportNotReal.length,
    ),
    unlisted: candidates.filter((item) => verdict(item)?.kind === "unlisted")
      .length,
    agents,
  };
}
