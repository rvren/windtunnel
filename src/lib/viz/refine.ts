import type {
  DesignModel,
  FindingGroup,
  Gap,
  GapKind,
  RunRecord,
  RunSummary,
} from "@/server/engine/schema";
import { overlap } from "@/server/issues/match";

/*
 * Refining a requirement over versions. Pure: everything here comes from
 * runs that already finished, so nothing costs a model call.
 *
 * - questions(run): what the run found unsaid, as questions to answer.
 * - decisionsText / withDecisions: the owner's answers, in their own
 *   words, as a "## Decisions" section of the next version.
 * - threadOf: a requirement's versions, oldest first.
 * - versionChanges: what got better or worse from one version to the next.
 */

export type QuestionKind = "gap" | "assumption" | "issue";

export interface Question {
  /** Stable for the run, so a draft of answers survives a reload. */
  id: string;
  kind: QuestionKind;
  /** The section it is listed under. */
  section: string;
  text: string;
  /** More about it, when there is more. */
  hint?: string;
  /** For an assumption: what the requirement would say if it is kept. */
  statement?: string;
}

/** Keep an assumption as the model made it, or answer in words. */
export type Answer = { keep: true } | { text: string };

const GAP_SECTION: Record<GapKind, string> = {
  permission_unspecified: "Who may do what",
  condition_missing: "Who may do what",
  failure_unspecified: "When something fails",
  limit_unspecified: "Limits",
  operation_without_journey: "Journeys",
  role_without_journey: "Journeys",
};

const REQUIREMENT_KINDS = new Set(["missing_requirement", "unhandled_journey"]);

function assumptions(model: DesignModel): Question[] {
  const role = new Map(model.roles.map((item) => [item.id, item.name]));
  const operation = new Map(
    model.operations.map((item) => [item.id, item.name]),
  );
  const out: Question[] = [];
  const add = (id: string, statement: string) =>
    out.push({
      id: `assumed:${id}`,
      kind: "assumption",
      section: "What the model assumed",
      text: `The model assumed: ${statement} Is that right?`,
      statement,
    });
  for (const item of model.roles)
    if (item.source === "assumed")
      add(
        `role:${item.id}`,
        `there is a role "${item.name}": ${item.description}`,
      );
  for (const item of model.entities)
    if (item.source === "assumed")
      add(
        `entity:${item.id}`,
        `the product keeps "${item.name}": ${item.description}`,
      );
  for (const item of model.operations)
    if (item.source === "assumed")
      add(
        `operation:${item.id}`,
        `people can "${item.name}": ${item.description}`,
      );
  for (const item of model.permissions)
    if (item.source === "assumed") {
      const who = role.get(item.roleId) ?? item.roleId;
      const what = operation.get(item.operationId) ?? item.operationId;
      const verb =
        item.effect === "allow"
          ? "may"
          : item.effect === "deny"
            ? "may not"
            : "may, only when allowed,";
      add(
        `permission:${item.roleId}:${item.operationId}`,
        `${who} ${verb} ${what}${item.condition ? ` (${item.condition})` : ""}.`,
      );
    }
  for (const item of model.rules)
    if (item.source === "assumed") add(`rule:${item.id}`, item.statement);
  for (const item of model.journeys)
    if (item.source === "assumed")
      add(`journey:${item.id}`, `there is a journey "${item.name}".`);
  return out;
}

/** What a finished requirement run found unsaid, as questions. */
export function questions(run: RunRecord): Question[] {
  if (run.source) return [];
  const gaps: Question[] = (run.coverage?.gaps ?? []).map((gap) => ({
    id: `gap:${gap.id}`,
    kind: "gap",
    section: GAP_SECTION[gap.kind],
    text: gap.text,
  }));
  const issues: Question[] = run.groups
    .filter((group) => REQUIREMENT_KINDS.has(group.type))
    .map((group) => ({
      id: `issue:${group.id}`,
      kind: "issue",
      section: "Issues the agents found",
      text: group.title,
      hint: group.summary || undefined,
    }));
  return [
    ...issues,
    ...gaps,
    ...(run.designModel ? assumptions(run.designModel) : []),
  ];
}

/** One line of the Decisions section per answered question. */
export function decisionsText(
  list: Question[],
  answers: Record<string, Answer | undefined>,
): string[] {
  const lines: string[] = [];
  for (const question of list) {
    const answer = answers[question.id];
    if (!answer) continue;
    if ("keep" in answer) {
      if (question.statement) lines.push(`- Confirmed: ${question.statement}`);
      continue;
    }
    const text = answer.text.trim();
    if (!text) continue;
    lines.push(
      question.kind === "assumption"
        ? `- Not as assumed (${question.statement}): ${text}`
        : `- ${question.text} Decision: ${text}`,
    );
  }
  return lines;
}

const HEADING = "## Decisions";

/**
 * The requirement with these lines added to its Decisions section, which
 * is made at the end when there is none yet.
 */
export function withDecisions(requirement: string, lines: string[]): string {
  const text = requirement.trimEnd();
  if (lines.length === 0) return text;
  const all = text.split("\n");
  const start = all.findIndex((line) => line.trim() === HEADING);
  if (start === -1) return `${text}\n\n${HEADING}\n\n${lines.join("\n")}`;
  let end = all.findIndex(
    (line, index) => index > start && /^#{1,2}\s/.test(line),
  );
  if (end === -1) end = all.length;
  // After the section's last non-empty line.
  let at = end;
  while (at > start + 1 && all[at - 1].trim() === "") at -= 1;
  return [...all.slice(0, at), ...lines, ...all.slice(at)].join("\n");
}

export interface Version {
  run: RunSummary;
  /** 1 for the first version. */
  number: number;
}

/**
 * The versions of the requirement this run belongs to, oldest first: its
 * first version and every run that refines it, numbered in the order they
 * were started.
 */
export function threadOf(runs: RunSummary[], runId: string): Version[] {
  const byId = new Map(runs.map((run) => [run.id, run]));
  let root = byId.get(runId);
  if (!root) return [];
  const seen = new Set<string>();
  while (root.parentRunId && byId.has(root.parentRunId) && !seen.has(root.id)) {
    seen.add(root.id);
    root = byId.get(root.parentRunId)!;
  }
  const members = new Set([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const run of runs) {
      if (
        run.parentRunId &&
        members.has(run.parentRunId) &&
        !members.has(run.id)
      ) {
        members.add(run.id);
        grew = true;
      }
    }
  }
  return runs
    .filter((run) => members.has(run.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((run, index) => ({ run, number: index + 1 }));
}

export interface VersionChanges {
  gaps: { closed: Gap[]; opened: Gap[] };
  /** Items the earlier version assumed that this one states. */
  nowStated: string[];
  assumed: { before: number; after: number };
  issues: { gone: FindingGroup[]; found: FindingGroup[] };
  permissions: {
    before: { specified: number; total: number };
    after: { specified: number; total: number };
  };
  workOrders: { before: number; after: number };
}

const gapKey = (gap: Gap) =>
  `${gap.kind}|${gap.text.toLowerCase().replace(/\s+/g, " ").trim()}`;

/** Every named design item, as "kind:name" → its source. */
function sources(model: DesignModel | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!model) return out;
  const put = (kind: string, name: string, source: string) =>
    out.set(`${kind}:${name.toLowerCase().trim()}`, source);
  for (const item of model.roles) put("Role", item.name, item.source);
  for (const item of model.entities) put("Entity", item.name, item.source);
  for (const item of model.operations) put("Operation", item.name, item.source);
  for (const item of model.journeys) put("Journey", item.name, item.source);
  for (const item of model.rules) put("Rule", item.statement, item.source);
  return out;
}

/** Same issue in two versions: same kind and enough title words shared. */
const sameIssue = (a: FindingGroup, b: FindingGroup) =>
  a.type === b.type && overlap(a.title, b.title) >= 0.5;

/** What changed from one version of a requirement to the next. */
export function versionChanges(
  before: RunRecord,
  after: RunRecord,
): VersionChanges {
  const earlierGaps = before.coverage?.gaps ?? [];
  const laterGaps = after.coverage?.gaps ?? [];
  const earlierKeys = new Set(earlierGaps.map(gapKey));
  const laterKeys = new Set(laterGaps.map(gapKey));

  const was = sources(before.designModel);
  const now = sources(after.designModel);
  const nowStated = [...was]
    .filter(
      ([key, source]) => source === "assumed" && now.get(key) === "stated",
    )
    .map(([key]) => {
      const [kind, ...rest] = key.split(":");
      return `${kind}: ${rest.join(":")}`;
    });

  const stats = (run: RunRecord) => ({
    specified: run.coverage?.stats.specifiedCells ?? 0,
    total: run.coverage?.stats.permissionCells ?? 0,
  });

  return {
    gaps: {
      closed: earlierGaps.filter((gap) => !laterKeys.has(gapKey(gap))),
      opened: laterGaps.filter((gap) => !earlierKeys.has(gapKey(gap))),
    },
    nowStated,
    assumed: {
      before: before.coverage?.stats.assumedItems ?? 0,
      after: after.coverage?.stats.assumedItems ?? 0,
    },
    issues: {
      gone: before.groups.filter(
        (group) => !after.groups.some((other) => sameIssue(group, other)),
      ),
      found: after.groups.filter(
        (group) => !before.groups.some((other) => sameIssue(group, other)),
      ),
    },
    permissions: { before: stats(before), after: stats(after) },
    workOrders: {
      before: before.workOrders.length,
      after: after.workOrders.length,
    },
  };
}

/** A line-by-line comparison of two texts, for showing a new version. */
export function lineDiff(
  before: string,
  after: string,
): { kind: "same" | "added" | "removed"; text: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // Longest common subsequence; requirements are short enough for O(n·m).
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: { kind: "same" | "added" | "removed"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] });
  while (j < b.length) out.push({ kind: "added", text: b[j++] });
  return out;
}
