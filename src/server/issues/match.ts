import type { FindingType, RunRecord, Severity } from "../engine/schema";

/*
 * Tells whether an issue a run found is one the project already tracks.
 * Pure. An issue must be of the same kind; then the same cited file wins,
 * with a matching CWE and shared title words to break ties; an issue that
 * cites no file matches on title words alone. Each issue matches at most
 * one other.
 */

export type IssueState =
  "open" | "pr_open" | "merged" | "fixed" | "reopened" | "gone";

/** An issue as one run saw it. */
export interface SeenIssue {
  groupId: string;
  title: string;
  kind: FindingType;
  severity: Severity;
  path: string | null;
  cwe: string | null;
}

/** What matching needs of a tracked issue. */
export interface TrackedIssue {
  id: string;
  title: string;
  kind: FindingType;
  path: string | null;
  cwe: string | null;
  state: IssueState;
}

/** The issues a finished run found, as matching sees them. */
export function seenIn(run: RunRecord): SeenIssue[] {
  const findings = new Map(
    run.agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, finding] as const),
    ),
  );
  return run.groups.map((group) => {
    const cited =
      group.findingIds
        .map((uid) => findings.get(uid)?.location)
        .find((location) => location !== undefined) ?? group.location;
    return {
      groupId: group.id,
      title: group.title,
      kind: group.type,
      severity: group.severity,
      path: cited?.path ?? null,
      cwe: run.remediations?.[group.id]?.cwe?.id ?? null,
    };
  });
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "be",
  "can",
  "with",
  "by",
  "it",
  "its",
  "no",
  "not",
  "that",
  "this",
  "any",
]);

/** The meaningful words of a title. */
export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
}

/** Shared words over all words, 0 to 1. */
export function overlap(a: string, b: string): number {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

/** How close two issues are, or null when they cannot be the same. */
export function closeness(
  tracked: TrackedIssue,
  seen: SeenIssue,
): number | null {
  if (tracked.kind !== seen.kind) return null;
  const words = overlap(tracked.title, seen.title);
  if (tracked.path && seen.path) {
    if (tracked.path !== seen.path) return null;
    const cwe =
      tracked.cwe && seen.cwe ? (tracked.cwe === seen.cwe ? 1 : -1) : 0;
    // Same file: a different CWE needs strong title agreement to match.
    if (cwe < 0 && words < 0.5) return null;
    return 2 + cwe + words;
  }
  if (!tracked.path && !seen.path) return words >= 0.5 ? words : null;
  // One cites a file and the other does not: titles must agree closely.
  return words >= 0.6 ? words : null;
}

export interface Matching {
  /** Tracked issue id → the issue the run saw. */
  matched: Map<string, SeenIssue>;
  /** Issues the run saw that nothing tracked matches. */
  fresh: SeenIssue[];
  /** Tracked issues the run did not see. */
  missing: TrackedIssue[];
}

export function matchIssues(
  tracked: TrackedIssue[],
  seen: SeenIssue[],
): Matching {
  const pairs: { tracked: TrackedIssue; seen: SeenIssue; score: number }[] = [];
  for (const one of tracked) {
    for (const other of seen) {
      const score = closeness(one, other);
      if (score !== null) pairs.push({ tracked: one, seen: other, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const matched = new Map<string, SeenIssue>();
  const taken = new Set<string>();
  for (const pair of pairs) {
    if (matched.has(pair.tracked.id) || taken.has(pair.seen.groupId)) continue;
    matched.set(pair.tracked.id, pair.seen);
    taken.add(pair.seen.groupId);
  }
  return {
    matched,
    fresh: seen.filter((item) => !taken.has(item.groupId)),
    missing: tracked.filter((item) => !matched.has(item.id)),
  };
}

/** A word without its plural or verb ending: "invitations" → "invitation". */
function stem(word: string): string {
  for (const ending of ["ing", "ed", "es", "s"]) {
    if (word.length > ending.length + 3 && word.endsWith(ending)) {
      return word.slice(0, -ending.length);
    }
  }
  return word;
}

/** Shared stems over the shorter title's stems, and how many are shared. */
function looseOverlap(a: string, b: string): { score: number; shared: number } {
  const left = new Set([...titleWords(a)].map(stem));
  const right = new Set([...titleWords(b)].map(stem));
  if (left.size === 0 || right.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return { score: shared / Math.min(left.size, right.size), shared };
}

/**
 * Idea to code: which probable risks of a requirement became issues in the
 * code that implements it. Looser than matching within one origin, since
 * an idea and its code are worded differently: stems are compared, against
 * the shorter title, with at least two shared and more agreement needed
 * when the two are filed as different kinds. One to one, closest first.
 */
export function linkAcross(
  risks: { id: string; kind: FindingType; title: string }[],
  code: { id: string; kind: FindingType; title: string }[],
): Map<string, string> {
  const pairs: { risk: string; issue: string; score: number }[] = [];
  for (const risk of risks) {
    for (const issue of code) {
      const { score, shared } = looseOverlap(risk.title, issue.title);
      const same = risk.kind === issue.kind;
      if (shared >= 2 && score >= (same ? 0.5 : 0.6)) {
        pairs.push({
          risk: risk.id,
          issue: issue.id,
          score: score + (same ? 0.1 : 0),
        });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const links = new Map<string, string>();
  const taken = new Set<string>();
  for (const pair of pairs) {
    if (links.has(pair.risk) || taken.has(pair.issue)) continue;
    links.set(pair.risk, pair.issue);
    taken.add(pair.issue);
  }
  return links;
}
