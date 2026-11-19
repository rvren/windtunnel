import { toUnifiedDiff, type CheckedEdit } from "@/lib/patch";

import { applyEdits } from "../../issues/apply";
import { RunError } from "../llm";
import { REMEDIATION_SYSTEM } from "../prompts";
import { toRecord } from "../remediation";
import { readTools } from "../repo/agent-tools";
import type { RepoReader } from "../repo/tools";
import {
  addUsage,
  AttackAnswer,
  RemediationAnswer,
  ZERO_USAGE,
  type DuelRound,
  type FindingGroup,
  type RemediationRecord,
} from "../schema";

import type { CodeAtHand, KindContext } from "./context";

/*
 * Dogfight: in aviation, close combat between two aircraft. Here a fix for
 * a security issue has to survive an attacker. The defender writes a fix
 * (or brings the one the earlier run wrote); the attacker reads the code
 * with the fix applied, in memory, and looks for a way past it. Each way
 * through must cite lines of the fixed code, checked. The defender answers
 * on top of its own fix, and so on, until the fix holds or the rounds run
 * out. Nothing is run and nothing is written to the repository: the
 * rounds come together as one checked fix, ready as a pull request.
 */

const DUEL_TURNS = 20;
const QUOTE_LINES = 20;
/** Context kept above and below a combined edit, as the checks keep it. */
const CONTEXT = 3;

const ATTACK_SYSTEM = (
  notes: string,
) => `You are the Attacker in a Windtunnel Dogfight. A security flaw was found in this code, and a defender has written a fix for it. The code you can list, read and search is the code with that fix applied (in memory; nothing is run).

Find a way past the fix, if there is one: the same flaw still reachable, a way around the new check, the same weakness in a place the fix did not touch, or a new weakness the fix brings in. Read the fixed code, its callers and how input reaches it.

Answer:
- verdict: "through" when you found a way past the fix, "held" when you did not.
- title: the way through in a few words, or why the fix holds.
- how: in one or two sentences, how the way through works, or what you tried.
- path, startLine, endLine: for a way through, the lines of the fixed code that show it. They are checked. Null when it holds.

Only a way through that the code shows counts; do not invent one to keep the fight going. Describe it; do not write exploit code or payloads.${notes ? `\n\n<notes>\n${notes}\n</notes>` : ""}`;

const REVISE_SYSTEM = `You are the Defender in a Windtunnel Dogfight. You wrote a fix for a security flaw, and an attacker found a way past it. The code you can list, read and search is the code with your fix so far applied.

Write the next fix on top of it: edits against the code as it is now, each with its "before" text exactly as the fixed code has it, that close the way through without undoing what already works. Answer as a remediation: summary (what this round changes), steps, cwe, owasp, edits, notes. Use the project's own idioms; prefer its existing safe mechanisms over a new dependency.`;

function targetTag(target: FindingGroup): string {
  const at = target.location
    ? ` at="${target.location.path}:${target.location.startLine}-${target.location.endLine}"`
    : "";
  return `<target id="${target.id}" severity="${target.severity}"${at}>
${target.title}
${target.summary}
</target>`;
}

function defendPrompt(target: FindingGroup): string {
  return `<finding id="${target.id}">
${target.title}
${target.summary}
${target.location ? `${target.location.path}:${target.location.startLine}-${target.location.endLine}\n${target.location.quote}` : ""}
</finding>

${targetTag(target)}
<round n="1" />`;
}

function attackPrompt(target: FindingGroup, n: number, diff: string): string {
  return `${targetTag(target)}
<round n="${n}" />

<fix>
${diff}
</fix>`;
}

function revisePrompt(
  target: FindingGroup,
  n: number,
  through: NonNullable<DuelRound["attack"]>,
): string {
  const at = through.location
    ? `${through.location.path}:${through.location.startLine}-${through.location.endLine}`
    : "";
  return `${targetTag(target)}
<round n="${n}" />

<way_through at="${at}">
${through.title}
${through.how}
</way_through>`;
}

/** A file's lines without the empty one a final line break leaves. */
const body = (lines: string[]) =>
  lines.at(-1) === "" ? lines.slice(0, -1) : lines;

/**
 * Every round's change as one edit per file, against the code before the
 * duel: the lines between the first and the last that differ. Applying
 * these to the original files gives the files as the last round left them.
 */
export function combinedEdits(
  original: Record<string, string[]>,
  final: Record<string, string[]>,
): CheckedEdit[] {
  const edits: CheckedEdit[] = [];
  for (const path of Object.keys(final).sort()) {
    const before = body(original[path] ?? []);
    const after = body(final[path]);
    let head = 0;
    while (
      head < before.length &&
      head < after.length &&
      before[head] === after[head]
    ) {
      head += 1;
    }
    let tail = 0;
    while (
      tail < before.length - head &&
      tail < after.length - head &&
      before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
      tail += 1;
    }
    const removed = before.slice(head, before.length - tail);
    const added = after.slice(head, after.length - tail);
    if (removed.length === 0 && added.length === 0) continue;
    edits.push({
      path,
      startLine: head + 1,
      before: removed,
      after: added,
      contextBefore: before.slice(Math.max(0, head - CONTEXT), head),
      contextAfter: before.slice(
        before.length - tail,
        before.length - tail + CONTEXT,
      ),
    });
  }
  return edits;
}

/** The files a round's edits touch, as that round leaves them. */
async function applyRound(
  overlay: Record<string, string[]>,
  original: Record<string, string[]>,
  edits: CheckedEdit[],
  reader: RepoReader,
): Promise<void> {
  const paths = [...new Set(edits.map((edit) => edit.path))];
  for (const path of paths) {
    const current = overlay[path] ?? (await reader.allLines(path));
    original[path] ??= [...current];
    const applied = applyEdits(
      current.join("\n"),
      edits.filter((edit) => edit.path === path),
    );
    if (!applied.ok)
      throw new RunError(`The fix did not apply: ${applied.reason}`);
    overlay[path] = applied.text.split("\n");
  }
}

export interface DuelOptions {
  target: FindingGroup;
  /** The earlier run's checked fix, to start from instead of writing one. */
  first: RemediationRecord | null;
  maxRounds: number;
  /** The actor ids of the two sides, as the kind's features name them. */
  defender: string;
  attacker: string;
  notes: string;
  secrets: string[];
  /** Called after each round, to save and show it. */
  onRound: (rounds: DuelRound[]) => Promise<void>;
}

/**
 * Fights the duel. Returns every round, the fix all rounds add up to (as a
 * remediation, against the original code), and whether the last one held.
 */
export async function duel(
  ctx: KindContext,
  code: CodeAtHand,
  options: DuelOptions,
): Promise<{
  rounds: DuelRound[];
  fix: RemediationRecord | null;
  held: boolean;
}> {
  const { run, llm, emit } = ctx;
  const { target } = options;
  const rounds: DuelRound[] = [];
  const overlay: Record<string, string[]> = {};
  const original: Record<string, string[]> = {};
  let reader = code.reader.fork();
  let base: RemediationRecord | null = options.first;
  let held = false;

  for (let n = 1; n <= options.maxRounds; n += 1) {
    // The defender: the earlier fix first, then one written on top of it.
    await emit({
      type: "actor.started",
      actorId: options.defender,
      doing: n === 1 ? "Writing the fix" : `Round ${n}: answering the attack`,
    });
    let defence: DuelRound["defence"];
    if (n === 1 && options.first && options.first.edits.length > 0) {
      defence = {
        // A remediation's summary says what is wrong; its first step, the fix.
        summary: options.first.steps[0] ?? options.first.summary,
        edits: options.first.edits,
        from: "run",
      };
    } else {
      const last = rounds.at(-1)?.attack;
      const result = await llm.agent({
        stage: "duel",
        model: run.models.reasoning,
        effort: "high",
        system: n === 1 ? REMEDIATION_SYSTEM : REVISE_SYSTEM,
        prompt:
          n === 1 || !last
            ? defendPrompt(target)
            : revisePrompt(target, n, last),
        schema: RemediationAnswer,
        tools: readTools(reader.fork(), () => {}),
        maxTurns: DUEL_TURNS,
      });
      run.usage.duel = addUsage(run.usage.duel ?? ZERO_USAGE, result.usage);
      if (result.kind === "declined") {
        await emit({
          type: "actor.failed",
          actorId: options.defender,
          error: "The model declined to write this fix.",
        });
        break;
      }
      const record = await toRecord(
        target.id,
        result.value,
        reader,
        options.secrets,
      );
      base ??= record;
      defence = {
        summary: n === 1 ? (record.steps[0] ?? record.summary) : record.summary,
        edits: record.edits,
        from: "written",
      };
    }
    if (defence.edits.length === 0) {
      await emit({
        type: "actor.completed",
        actorId: options.defender,
        note: "No change to the code could be checked",
      });
      rounds.push({ n, defence, attack: null });
      await options.onRound(rounds);
      break;
    }
    await applyRound(overlay, original, defence.edits, code.reader);
    reader = code.reader.withOverlay(overlay);
    await emit({
      type: "actor.completed",
      actorId: options.defender,
      note: `Round ${n}: ${defence.edits.length === 1 ? "1 edit" : `${defence.edits.length} edits`}`,
    });

    // The attacker reads the fixed code.
    await emit({
      type: "actor.started",
      actorId: options.attacker,
      doing: `Round ${n}: attacking the fix`,
    });
    let lastPath: string | null = null;
    const attacked = await llm.agent({
      stage: "duel",
      model: run.models.agents,
      effort: "high",
      system: ATTACK_SYSTEM(options.notes),
      prompt: attackPrompt(target, n, toUnifiedDiff(defence.edits)),
      schema: AttackAnswer,
      tools: readTools(reader.fork(), (path) => {
        if (path === lastPath) return;
        lastPath = path;
        emit({ type: "actor.reading", actorId: options.attacker, path }).catch(
          () => undefined,
        );
      }),
      maxTurns: DUEL_TURNS,
    });
    run.usage.duel = addUsage(run.usage.duel ?? ZERO_USAGE, attacked.usage);
    const attack =
      attacked.kind === "declined"
        ? null
        : await checkAttack(attacked.value, reader);
    rounds.push({ n, defence, attack });
    await options.onRound(rounds);
    await emit({
      type: "actor.completed",
      actorId: options.attacker,
      note:
        attack?.verdict === "through"
          ? `Round ${n}: got through`
          : `Round ${n}: no way through`,
    });
    if (!attack || attack.verdict === "held") {
      held = true;
      break;
    }
  }

  const edits = combinedEdits(original, overlay);
  const fix: RemediationRecord | null =
    edits.length > 0 && base
      ? {
          ...base,
          groupId: target.id,
          status: "made",
          summary: base.summary,
          steps: rounds.map(
            (round) => `Round ${round.n}: ${round.defence.summary}`,
          ),
          edits,
          dropped: [],
          notes: base.notes,
          error: null,
          ...(held ? { heldRounds: rounds.length } : {}),
        }
      : null;
  return { rounds, fix, held };
}

/**
 * A way through counts only with lines of the fixed code that exist. One
 * that cites none, or cites nothing real, is recorded as holding, with the
 * attacker's words kept.
 */
export async function checkAttack(
  answer: AttackAnswer,
  reader: Pick<RepoReader, "slice">,
): Promise<NonNullable<DuelRound["attack"]>> {
  if (
    answer.verdict === "through" &&
    answer.path &&
    answer.startLine !== null &&
    answer.endLine !== null
  ) {
    try {
      const slice = await reader.slice(
        answer.path,
        answer.startLine,
        Math.min(answer.endLine, answer.startLine + QUOTE_LINES - 1),
      );
      return {
        verdict: "through",
        title: answer.title,
        how: answer.how,
        location: {
          path: slice.path,
          startLine: slice.startLine,
          endLine: slice.endLine,
          quote: slice.text,
        },
      };
    } catch {
      // Falls through to holding: the way through cited nothing real.
    }
  }
  return {
    verdict: "held",
    title:
      answer.verdict === "through"
        ? "The attacker named no lines that show a way through"
        : answer.title,
    how: answer.how,
    location: null,
  };
}

/** A Dogfight run: the issue from an earlier run, fought for up to three rounds. */
export async function runDogfight(
  ctx: KindContext,
  code: CodeAtHand,
  notes: string,
  secrets: () => string[],
): Promise<void> {
  const { run, store, stage, save, plural } = ctx;
  const dogfight = run.dogfight;
  if (!dogfight) throw new RunError("A Dogfight needs an issue to defend.");

  await stage("duel", async () => {
    const earlier = dogfight.target.runId
      ? await store.get(dogfight.target.runId)
      : null;
    const group = earlier?.groups.find(
      (item) => item.id === dogfight.target.groupId,
    );
    if (!earlier || !group || earlier.projectId !== run.projectId) {
      throw new RunError(
        "The issue to defend is not in a run of this project.",
      );
    }
    if (group.type !== "security_vulnerability") {
      throw new RunError("A Dogfight defends the fix of a security issue.");
    }
    const location =
      group.location ??
      earlier.agents
        .flatMap((agent) => agent.findings)
        .find((finding) => group.findingIds.includes(finding.uid))?.location ??
      null;
    const target: FindingGroup = { ...group, location: location ?? undefined };
    dogfight.target = {
      runId: earlier.id,
      groupId: group.id,
      title: group.title,
      summary: group.summary,
      severity: group.severity,
      location,
    };
    const made = earlier.remediations?.[group.id];
    const first =
      made?.status === "made" && made.edits.length > 0 ? made : null;
    run.groups = [target];
    await save();

    const result = await duel(ctx, code, {
      target,
      first,
      maxRounds: dogfight.maxRounds,
      defender: "defender",
      attacker: "attacker",
      notes,
      secrets: secrets(),
      onRound: async (rounds) => {
        dogfight.rounds = rounds;
        await save();
      },
    });
    dogfight.rounds = result.rounds;
    dogfight.held = result.held;
    run.remediations = result.fix ? { [group.id]: result.fix } : {};
    return result.held
      ? `Held after ${plural(result.rounds.length, "round")}`
      : `Not held after ${plural(result.rounds.length, "round")}`;
  });

  await stage("verdict", async () => {
    const fix = run.remediations?.[dogfight.target.groupId];
    if (!fix) return "No fix could be checked";
    const files = new Set(fix.edits.map((edit) => edit.path)).size;
    return `${plural(files, "file")} changed, ${dogfight.held ? "ready as a pull request" : "still open to the attacker"}`;
  });
}
