import { toUnifiedDiff, type CheckedEdit } from "@/lib/patch";

import type { LlmClient } from "./llm";
import { REMEDIATION_SYSTEM, remediationPrompt } from "./prompts";
import { readTools } from "./repo/agent-tools";
import type { RepoReader } from "./repo/tools";
import {
  RemediationAnswer,
  type FindingGroup,
  type Inventory,
  type RemediationRecord,
  type RunRecord,
  type Usage,
} from "./schema";
import { addUsage, ZERO_USAGE } from "./schema";
import { resolveCwe, resolveOwasp } from "./security-refs";

/*
 * Remediation for security findings: what to change, the change itself as
 * edits to real files, and the CWE and OWASP Top 10 it belongs to. The model
 * reads the code again before it answers; every edit is then checked against
 * the file and kept only if it matches. A patch is never applied.
 */

export const REMEDIATION_LIMITS = {
  edits: 5,
  changedLines: 80,
  turns: 12,
  together: 3,
} as const;

/** Files a remediation must not edit. */
const UNEDITABLE =
  /(^|\/)(node_modules|vendor|dist|build|\.next|target|out|coverage)\/|(^|\/)[^/]*(\.lock|-lock\.json|lock\.ya?ml)$|\.min\.(js|css)$|\.(png|jpe?g|gif|ico|pdf|zip|gz|jar|woff2?|ttf|exe|dll|so)$/i;

const lines = (text: string) => text.replace(/\r\n/g, "\n").split("\n");
const same = (a: string, b: string) => a.trimEnd() === b.trimEnd();

/**
 * Checks a remediation's edits against the files. An edit is kept only when
 * the text it replaces is exactly what the file holds at those lines; the
 * rest are dropped with the reason.
 */
export async function checkEdits(
  edits: RemediationAnswer["edits"],
  reader: RepoReader | null,
): Promise<{
  edits: CheckedEdit[];
  dropped: { path: string; reason: string }[];
}> {
  const kept: CheckedEdit[] = [];
  const dropped: { path: string; reason: string }[] = [];
  let changed = 0;
  for (const edit of edits) {
    const drop = (reason: string) => dropped.push({ path: edit.path, reason });
    if (!reader) {
      drop("This run read no code, so no change can be checked.");
      continue;
    }
    if (kept.length >= REMEDIATION_LIMITS.edits) {
      drop(`At most ${REMEDIATION_LIMITS.edits} edits are kept per finding.`);
      continue;
    }
    if (UNEDITABLE.test(edit.path)) {
      drop("A generated, vendored, locked or binary file is not edited.");
      continue;
    }
    const before = lines(edit.before);
    const after = edit.after === "" ? [] : lines(edit.after);
    if (edit.endLine - edit.startLine + 1 !== before.length) {
      drop("The lines given do not match the text to replace.");
      continue;
    }
    const size = Math.max(before.length, after.length);
    if (changed + size > REMEDIATION_LIMITS.changedLines) {
      drop(
        `A remediation changes at most ${REMEDIATION_LIMITS.changedLines} lines.`,
      );
      continue;
    }
    let file: string[];
    let endsWithBreak = true;
    try {
      file = await reader.allLines(edit.path);
      // A file that ends with a line break has no empty last line.
      endsWithBreak = file.at(-1) === "";
      if (endsWithBreak) file = file.slice(0, -1);
    } catch (error) {
      drop(
        error instanceof Error ? error.message : "The file could not be read.",
      );
      continue;
    }
    const actual = file.slice(edit.startLine - 1, edit.endLine);
    if (
      edit.startLine < 1 ||
      actual.length !== before.length ||
      !actual.every((line, index) => same(line, before[index]))
    ) {
      drop(
        `The text at lines ${edit.startLine}–${edit.endLine} is not what the file holds.`,
      );
      continue;
    }
    const overlaps = kept.some(
      (other) =>
        other.path === edit.path &&
        edit.startLine <= other.startLine + other.before.length - 1 &&
        other.startLine <= edit.endLine,
    );
    if (overlaps) {
      drop("It overlaps another edit to the same lines.");
      continue;
    }
    changed += size;
    kept.push({
      path: edit.path,
      startLine: edit.startLine,
      before: actual,
      after,
      contextBefore: file.slice(
        Math.max(0, edit.startLine - 4),
        edit.startLine - 1,
      ),
      contextAfter: file.slice(edit.endLine, edit.endLine + 3),
      // The hunk reaches the last line of a file with no final line break.
      noNewlineAtEnd: !endsWithBreak && edit.endLine + 3 >= file.length,
    });
  }
  return { edits: kept, dropped };
}

/** Turns a checked answer into what the run keeps. */
export async function toRecord(
  groupId: string,
  answer: RemediationAnswer,
  reader: RepoReader | null,
  secrets: string[],
): Promise<RemediationRecord> {
  const owasp = resolveOwasp(answer.owasp);
  const cwe = resolveCwe(answer.cwe, owasp);
  const checked = await checkEdits(answer.edits, reader);
  // A secret's value never leaves the code it was found in: not in the
  // words, not in the lines a patch replaces, not in its context.
  let masked = false;
  const clean = (text: string) => {
    const out = scrubText(text, secrets);
    if (out !== text) masked = true;
    return out;
  };
  const edits = checked.edits.map((edit) => ({
    ...edit,
    before: edit.before.map(clean),
    after: edit.after.map(clean),
    contextBefore: edit.contextBefore.map(clean),
    contextAfter: edit.contextAfter.map(clean),
  }));
  const notes = answer.notes.map(clean).filter((note) => note.trim());
  if (masked) {
    notes.push(
      "A secret's value is masked in this remediation, so the patch will not apply as it is to those lines: edit them by hand.",
    );
  }
  return {
    groupId,
    status: "made",
    summary: clean(answer.summary),
    steps: answer.steps.map(clean).filter((step) => step.trim()),
    cwe,
    owasp: { id: owasp.id, name: owasp.name, url: owasp.url },
    edits,
    dropped: checked.dropped,
    notes,
    error: null,
  };
}

/** Replaces each secret's value with a mask. */
export function scrubText(text: string, secrets: string[]): string {
  return secrets.reduce(
    (out, secret) => (secret ? out.split(secret).join("••••") : out),
    text,
  );
}

/** A copy of any value with every secret's value masked in every string. */
export function scrubDeep<T>(value: T, secrets: string[]): T {
  if (secrets.length === 0) return value;
  if (typeof value === "string") return scrubText(value, secrets) as T;
  if (Array.isArray(value)) {
    return value.map((item) => scrubDeep(item, secrets)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        scrubDeep(item, secrets),
      ]),
    ) as T;
  }
  return value;
}

/** The diff of a remediation, ready to copy or send. Empty with no edits. */
export const remediationDiff = (record: RemediationRecord) =>
  toUnifiedDiff(record.edits);

/** Groups for the secrets found in code. They are certain: no judge needed. */
export function secretGroups(inventory: Inventory): FindingGroup[] {
  // One group per secret place; the same value twice in a file is one place.
  const seen = new Set<string>();
  const groups: FindingGroup[] = [];
  for (const secret of inventory.secrets) {
    const key = `${secret.path}:${secret.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({
      id: `secret-${groups.length + 1}`,
      title: `A ${secret.kind.toLowerCase()} is written into the code`,
      type: "security_vulnerability",
      severity: "critical",
      summary: `${secret.path}, line ${secret.line}, holds a ${secret.kind.toLowerCase()}. Anyone who can read the code, or its history, can use it.`,
      findingIds: [],
      reviewed: true,
      foundBy: "code",
      location: {
        path: secret.path,
        startLine: secret.line,
        endLine: secret.line,
        quote: secret.masked,
      },
    });
  }
  return groups;
}

/** Runs the stage. Never throws: a remediation that fails is recorded. */
export async function remediate(options: {
  llm: LlmClient;
  run: RunRecord;
  reader: RepoReader | null;
  /** The literal values of secrets found, so they are never echoed back. */
  secretValues: string[];
  /** Called with each remediation as it is made or fails. */
  onReady: (record: RemediationRecord) => Promise<void>;
}): Promise<{ records: Record<string, RemediationRecord>; usage: Usage }> {
  const { llm, run, reader } = options;
  const groups = run.groups.filter(
    (group) => group.type === "security_vulnerability",
  );
  const records: Record<string, RemediationRecord> = {};
  let usage = ZERO_USAGE;
  let next = 0;

  const one = async (group: FindingGroup) => {
    try {
      const request = {
        stage: "remediation" as const,
        model: run.models.reasoning,
        effort: "high" as const,
        system: REMEDIATION_SYSTEM,
        prompt: remediationPrompt(run, group, Boolean(reader)),
        schema: RemediationAnswer,
      };
      const result = reader
        ? await llm.agent({
            ...request,
            tools: readTools(reader.fork(), () => {}),
            maxTurns: REMEDIATION_LIMITS.turns,
          })
        : await llm.call(request);
      usage = addUsage(usage, result.usage);
      if (result.kind === "declined") {
        records[group.id] = failed(
          group.id,
          "The model declined to write this remediation.",
        );
      } else {
        records[group.id] = await toRecord(
          group.id,
          result.value,
          reader,
          options.secretValues,
        );
      }
    } catch (error) {
      records[group.id] = failed(
        group.id,
        error instanceof Error ? error.message : String(error),
      );
    }
    await options.onReady(records[group.id]).catch(() => undefined);
  };

  // A few at a time, so a big run neither waits too long nor floods the API.
  await Promise.all(
    Array.from(
      { length: Math.min(REMEDIATION_LIMITS.together, groups.length) },
      async () => {
        while (next < groups.length) {
          const group = groups[next];
          next += 1;
          await one(group);
        }
      },
    ),
  );
  return { records, usage };
}

function failed(groupId: string, error: string): RemediationRecord {
  return {
    groupId,
    status: "failed",
    summary: "",
    steps: [],
    cwe: null,
    owasp: null,
    edits: [],
    dropped: [],
    notes: [],
    error,
  };
}
