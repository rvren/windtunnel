import {
  compare,
  pullFiles,
  pullRequest,
  repoOf,
  type GitHubFile,
} from "../../connectors/github";
import { normalizeArchitecture } from "../architecture";
import { RunError } from "../llm";
import {
  Architecture,
  ImpactAnswer,
  ZERO_USAGE,
  addUsage,
  type ChangedFile,
  type RunRecord,
} from "../schema";

import type { KindContext } from "./context";
import { diffArchitectures, touchedParts } from "./impact";
import {
  AFTER_SYSTEM,
  IMPACT_SYSTEM,
  afterPrompt,
  impactPrompt,
} from "./prompts";

/*
 * Crosswind: one change, traced through every service. The change stage
 * reads it (a pull request or two branches from GitHub, or words); the
 * agents, challenge round and judge of an audit then trace it, briefed by
 * changeContext; the impact stage maps what it does to the architecture
 * and which known issues it would fix.
 */

/** Bounds on what is read of a change, so a huge diff cannot swamp a run. */
export const CHANGE_LIMITS = {
  files: 60,
  patchChars: 6_000,
  totalChars: 60_000,
};

const STATUS: Record<string, ChangedFile["status"]> = {
  added: "added",
  removed: "removed",
  renamed: "renamed",
};

/** GitHub's file list as the agents will see it, cut to the limits. */
export function changedFiles(
  files: GitHubFile[],
  prefix: string,
): { files: ChangedFile[]; truncated: boolean } {
  let truncated = files.length > CHANGE_LIMITS.files;
  let budget = CHANGE_LIMITS.totalChars;
  const out = files.slice(0, CHANGE_LIMITS.files).map((file): ChangedFile => {
    let patch = file.patch ?? null;
    if (patch && patch.length > CHANGE_LIMITS.patchChars) {
      patch = `${patch.slice(0, CHANGE_LIMITS.patchChars)}\n…`;
      truncated = true;
    }
    if (patch) {
      if (patch.length > budget) {
        patch = null;
        truncated = true;
      } else {
        budget -= patch.length;
      }
    }
    return {
      path: `${prefix}${file.filename}`,
      status: STATUS[file.status] ?? "modified",
      additions: file.additions,
      deletions: file.deletions,
      patch,
      previousPath: file.previous_filename
        ? `${prefix}${file.previous_filename}`
        : null,
    };
  });
  return { files: out, truncated };
}

/** The change stage: read the change, and point the survey at its head. */
export async function readChange(ctx: KindContext): Promise<string> {
  const { run, plural } = ctx;
  const change = run.change;
  if (!change) throw new RunError("A Crosswind run needs a change.");
  const input = change.input;
  if (input.kind === "text") return "A change described in words";

  const source = run.source;
  if (!source) {
    throw new RunError("A pull request or branches need a project's code.");
  }
  // The workspace the change is in, and where its code comes from.
  const many = source.workspaces;
  const workspace = many
    ? many.find((item) => item.name === input.workspace)
    : { name: run.workspaces?.[0] ?? input.workspace, origin: source.origin };
  if (!workspace) {
    throw new RunError(
      `The workspace "${input.workspace}" is not in this project.`,
    );
  }
  const origin = workspace.origin;
  if (origin.kind !== "github") {
    throw new RunError(
      "Crosswind reads pull requests and branches from GitHub, and this workspace is a local folder. Describe the change in words instead.",
    );
  }
  const repo = repoOf(origin.url);
  if (!repo)
    throw new RunError("The workspace's GitHub address is not readable.");

  let files: GitHubFile[];
  if (input.kind === "pr") {
    const pull = await pullRequest(repo, input.number);
    if (pull.headRepo && pull.headRepo.toLowerCase() !== repo.toLowerCase()) {
      throw new RunError(
        "This pull request comes from a fork. Crosswind reads pull requests whose branch is in the same repository.",
      );
    }
    change.title = pull.title;
    change.url = pull.url;
    change.base = pull.base;
    change.head = pull.head;
    files = await pullFiles(repo, input.number);
  } else {
    const compared = await compare(repo, input.base, input.head);
    change.title = `${input.head} into ${input.base}`;
    change.url = compared.url;
    files = compared.files;
  }

  // The agents read the code as it is with the change made: the head.
  const head = { ...origin, branch: change.head };
  if (many) {
    const entry = many.find((item) => item.name === workspace.name)!;
    entry.origin = head;
  } else {
    source.origin = head;
  }

  const cut = changedFiles(files, many ? `${workspace.name}/` : "");
  change.files = cut.files;
  change.truncated = cut.truncated;
  const added = cut.files.reduce((sum, file) => sum + file.additions, 0);
  const removed = cut.files.reduce((sum, file) => sum + file.deletions, 0);
  return `${plural(cut.files.length, "file")} changed, +${added} -${removed}`;
}

/** The latest finished audit of the project's code: the "before" picture. */
async function lastAudit(ctx: KindContext): Promise<RunRecord | null> {
  const { run, store } = ctx;
  if (!run.projectId) return null;
  const earlier = (await store.list({ projectId: run.projectId })).find(
    (item) =>
      item.id !== run.id &&
      item.kind === "audit" &&
      item.status === "completed" &&
      item.workspaces.length > 0,
  );
  return earlier ? store.get(earlier.id) : null;
}

/** The impact stage: the map of the change, a review, and what it fixes. */
export async function impactStage(ctx: KindContext): Promise<string> {
  const { run, llm, plural } = ctx;
  const change = run.change!;
  const current = run.source?.architecture ?? null;
  let usage = ZERO_USAGE;

  // Before and after: for a change in code, the last audit and this run's
  // reading of the head; for words, today and the model's drawing of after.
  let before = current;
  let after = current;
  if (change.input.kind === "text") {
    if (current) {
      const drawn = await llm.call({
        stage: "impact",
        model: run.models.reasoning,
        effort: "medium",
        system: AFTER_SYSTEM,
        prompt: afterPrompt(run, current),
        schema: Architecture,
      });
      usage = addUsage(usage, drawn.usage);
      if (drawn.kind === "ok") {
        after = normalizeArchitecture(
          drawn.value,
          run.source?.workspaces?.map((item) => item.name) ?? [],
        ).architecture;
      }
    }
  } else {
    before = (await lastAudit(ctx))?.source?.architecture ?? null;
  }

  const components = touchedParts(change.files, run.groups, before, after);

  // Known open issues in the project's code, for "what it fixes". Best
  // effort: without them the report simply names no fixes.
  let known: { id: string; title: string; path: string | null }[] = [];
  try {
    const { listIssues } = await import("../../issues/store");
    known = run.projectId
      ? (await listIssues(run.projectId))
          .filter(
            (issue) =>
              issue.origin === "code" &&
              ["open", "reopened", "pr_open"].includes(issue.state),
          )
          .map((issue) => ({
            id: issue.id,
            title: issue.title,
            path: issue.path,
          }))
      : [];
  } catch {
    known = [];
  }

  const answer = await llm.call({
    stage: "impact",
    model: run.models.reasoning,
    effort: "medium",
    system: IMPACT_SYSTEM,
    prompt: impactPrompt(
      run,
      run.groups,
      components.map(
        (part) =>
          `${part.name}: ${part.effect}${part.note ? ` (${part.note})` : ""}`,
      ),
      known,
    ),
    schema: ImpactAnswer,
  });
  usage = addUsage(usage, answer.usage);
  run.usage.impact = usage;

  const byId = new Map(known.map((issue) => [issue.id, issue]));
  const fixes =
    answer.kind === "ok"
      ? answer.value.fixes
          .filter((fix) => byId.has(fix.issueId))
          .map((fix) => ({
            issueId: fix.issueId,
            title: byId.get(fix.issueId)!.title,
            reason: fix.reason,
          }))
      : [];

  run.impact = {
    summary:
      answer.kind === "ok"
        ? answer.value.summary
        : "The impact summary could not be written.",
    components,
    connections: diffArchitectures(before, after).connections,
    before,
    after,
    fixes,
    review: answer.kind === "ok" ? answer.value.review : "",
  };
  return `${plural(components.length, "part")} touched, ${plural(run.groups.length, "break")}, ${plural(fixes.length, "known issue")} fixed`;
}
