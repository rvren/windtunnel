import { remediate } from "../remediation";
import { readTools } from "../repo/agent-tools";
import type { RepoReader } from "../repo/tools";
import { TriageAnswer, type FindingGroup, type RunTriage } from "../schema";

import type { CodeAtHand, KindContext } from "./context";
import { TRIAGE_SYSTEM, triagePrompt } from "./prompts";

/*
 * Black box: production feedback to its cause, and a fix. The triage agent
 * reads the code and names the lines behind the feedback; only lines that
 * exist are kept. The defect becomes one finding, and the remediation
 * stage writes a fix for it, checked against the code. A pull request is
 * opened only when a person asks for it.
 */

const TRIAGE_TURNS = 24;
const QUOTE_LINES = 40;

/** Keeps the suspects whose lines exist, with the code they cite. */
export async function checkSuspects(
  answer: TriageAnswer,
  reader: Pick<RepoReader, "slice">,
): Promise<RunTriage> {
  const suspects: RunTriage["suspects"] = [];
  for (const suspect of answer.suspects) {
    try {
      const slice = await reader.slice(
        suspect.path,
        suspect.startLine,
        Math.min(suspect.endLine, suspect.startLine + QUOTE_LINES - 1),
      );
      suspects.push({
        path: slice.path,
        startLine: slice.startLine,
        endLine: slice.endLine,
        quote: slice.text,
        why: suspect.why,
      });
    } catch {
      // A file or line that does not exist is not evidence.
    }
  }
  return { ...answer, suspects };
}

/** The defect as the one finding the fix is written for. */
export function incidentGroup(triage: RunTriage): FindingGroup | null {
  const first = triage.suspects[0];
  if (!first) return null;
  return {
    id: "incident-1",
    title: triage.title,
    type: triage.type,
    severity: triage.severity,
    summary: triage.hypothesis,
    findingIds: [],
    reviewed: true,
    location: {
      path: first.path,
      startLine: first.startLine,
      endLine: first.endLine,
      quote: first.quote,
    },
  };
}

export async function runBlackbox(
  ctx: KindContext,
  code: CodeAtHand,
  secretValues: () => string[],
): Promise<void> {
  const { run, llm, stage, emit, save, plural, declined } = ctx;

  await stage("triage", async () => {
    const result = await llm.agent({
      stage: "triage",
      model: run.models.reasoning,
      effort: "high",
      system: TRIAGE_SYSTEM,
      prompt: triagePrompt(run, code.outline),
      schema: TriageAnswer,
      tools: readTools(code.reader.fork(), () => {}),
      maxTurns: TRIAGE_TURNS,
    });
    run.usage.triage = result.usage;
    if (result.kind === "declined") {
      throw declined("trace this feedback", result.category);
    }
    run.triage = await checkSuspects(result.value, code.reader);
    const group = incidentGroup(run.triage);
    run.groups = group ? [group] : [];
    return run.triage.suspects.length
      ? `${run.triage.confidence} confidence, ${plural(run.triage.suspects.length, "place")} in the code`
      : "No lines in the code could be named";
  });

  await stage("remediation", async () => {
    if (run.groups.length === 0) return "Nothing to fix: no lines were found";
    run.remediations = {};
    const done = await remediate({
      llm,
      run,
      reader: code.reader,
      secretValues: secretValues(),
      anyKind: true,
      onReady: async (record) => {
        run.remediations = { ...run.remediations, [record.groupId]: record };
        await save();
        await emit({ type: "remediation.ready", groupId: record.groupId });
      },
    });
    run.usage.remediation = done.usage;
    const record = Object.values(done.records)[0];
    return record?.status === "made"
      ? record.edits.length
        ? "A fix with a checked patch"
        : "A fix in steps, without a patch"
      : "No fix could be written";
  });
}
