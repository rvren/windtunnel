import { toUnifiedDiff } from "@/lib/patch";

import {
  GitHubError,
  access,
  fileAt,
  openPullRequest,
  repoOf,
} from "../connectors/github";
import type { RepoOrigin } from "../engine/repo/fetch";
import type {
  FindingGroup,
  RemediationRecord,
  RunRecord,
} from "../engine/schema";
import { applyEdits } from "./apply";
import { setPullRequest, type Issue, type PullRequest } from "./store";

/*
 * Turns an issue's checked patch into pull requests. Edits are split by
 * repository (a project run's paths are "workspace/file"); before anything
 * is written, each edit is checked again against the base branch as it is
 * now. A preview writes nothing; creating needs a person's confirmation in
 * the app, and Windtunnel never merges.
 */

type Edit = RemediationRecord["edits"][number];

export interface Target {
  workspace: string | null;
  /** "owner/name", or null for a local folder (no pull request possible). */
  repo: string | null;
  /** The edits with paths inside that repository. */
  edits: Edit[];
}

/** Where each of a remediation's edits goes. */
export function targetsFor(
  run: RunRecord,
  record: RemediationRecord,
): Target[] {
  const source = run.source;
  if (!source) return [];
  const origins = new Map<string, RepoOrigin>(
    (source.workspaces ?? []).map((item) => [item.name, item.origin]),
  );
  const repoFor = (origin: RepoOrigin) =>
    origin.kind === "github" ? repoOf(origin.url) : null;
  const targets = new Map<string, Target>();
  for (const edit of record.edits) {
    let workspace: string | null = null;
    let path = edit.path;
    let origin: RepoOrigin = source.origin;
    if (source.workspaces) {
      const [name, ...rest] = edit.path.split("/");
      workspace = name;
      path = rest.join("/");
      origin = origins.get(name) ?? source.origin;
    }
    const key = workspace ?? "";
    const target = targets.get(key) ?? {
      workspace,
      repo: repoFor(origin),
      edits: [],
    };
    target.edits.push({ ...edit, path });
    targets.set(key, target);
  }
  return [...targets.values()];
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");

/** The branch, title, commit message and body of an issue's pull request. */
export function pullRequestText(
  run: RunRecord,
  group: FindingGroup,
  record: RemediationRecord,
) {
  const order = run.workOrders.find((item) => item.groupIds.includes(group.id));
  const lines = [
    `Windtunnel found this ${group.severity} security issue and wrote the fix below. Every changed line was checked against the code before this pull request was opened.`,
    "",
    "## The issue",
    record.summary || group.summary,
    "",
    record.cwe || record.owasp
      ? [
          record.cwe
            ? `- [${record.cwe.id} ${record.cwe.name}](${record.cwe.url})`
            : "",
          record.owasp
            ? `- [OWASP ${record.owasp.id} ${record.owasp.name}](${record.owasp.url})`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    "",
    "## The fix",
    ...record.steps.map((step, index) => `${index + 1}. ${step}`),
    ...(record.notes.length
      ? [
          "",
          "## Not covered by this change",
          ...record.notes.map((n) => `- ${n}`),
        ]
      : []),
    ...(order?.acceptanceCriteria.length
      ? [
          "",
          "## Acceptance criteria",
          ...order.acceptanceCriteria.map((c) => `- [ ] ${c}`),
        ]
      : []),
    "",
    `After merging, rescan the project in Windtunnel to confirm the issue is gone (run ${run.id}).`,
  ];
  return {
    branch: `windtunnel/${slug(group.title)}-${group.id.slice(0, 6)}`,
    title: `Fix: ${group.title}`,
    message: `Fix: ${group.title}\n\nWritten by Windtunnel from run ${run.id}.`,
    body: lines
      .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
      .join("\n"),
  };
}

export interface TargetPreview {
  workspace: string | null;
  repo: string | null;
  base: string | null;
  canPush: boolean;
  /** Why no pull request can be made for this repository, if not. */
  problem: string | null;
  diff: string;
  files: { path: string; ok: boolean; reason: string | null }[];
}

export interface Preview {
  branch: string;
  title: string;
  body: string;
  targets: TargetPreview[];
  /** True when every target can get its pull request. */
  ready: boolean;
}

/** What creating the pull requests would do. Writes nothing. */
export async function previewPullRequests(
  run: RunRecord,
  group: FindingGroup,
  record: RemediationRecord,
): Promise<{ preview: Preview; texts: Map<string, Map<string, string>> }> {
  const text = pullRequestText(run, group, record);
  // The new text of each file, by repository, for creating.
  const texts = new Map<string, Map<string, string>>();
  const targets: TargetPreview[] = [];
  for (const target of targetsFor(run, record)) {
    const diff = toUnifiedDiff(target.edits);
    if (!target.repo) {
      targets.push({
        workspace: target.workspace,
        repo: null,
        base: null,
        canPush: false,
        problem:
          "This code is a local folder, not a GitHub repository. Copy the patch instead.",
        diff,
        files: [],
      });
      continue;
    }
    try {
      const { canPush, defaultBranch } = await access(target.repo);
      const byFile = new Map<string, Edit[]>();
      for (const edit of target.edits) {
        byFile.set(edit.path, [...(byFile.get(edit.path) ?? []), edit]);
      }
      const files: TargetPreview["files"] = [];
      const changed = new Map<string, string>();
      for (const [path, edits] of byFile) {
        const current = await fileAt(target.repo, defaultBranch, path);
        if (current === null) {
          files.push({
            path,
            ok: false,
            reason: "The file is not on the branch any more.",
          });
          continue;
        }
        const applied = applyEdits(current, edits);
        files.push({
          path,
          ok: applied.ok,
          reason: applied.ok ? null : applied.reason,
        });
        if (applied.ok) changed.set(path, applied.text);
      }
      texts.set(target.repo, changed);
      targets.push({
        workspace: target.workspace,
        repo: target.repo,
        base: defaultBranch,
        canPush,
        problem: !canPush
          ? "The token cannot push to this repository. Give it Contents and Pull requests write access."
          : files.some((file) => !file.ok)
            ? "The code changed since the run. Write a fresh fix against it."
            : null,
        diff,
        files,
      });
    } catch (error) {
      targets.push({
        workspace: target.workspace,
        repo: target.repo,
        base: null,
        canPush: false,
        problem:
          error instanceof GitHubError
            ? error.message
            : "GitHub could not be reached.",
        diff,
        files: [],
      });
    }
  }
  return {
    preview: {
      ...text,
      targets,
      ready:
        targets.length > 0 &&
        targets.every((target) => target.problem === null),
    },
    texts,
  };
}

/** Opens the pull requests, after a fresh preview finds nothing wrong. */
export async function createPullRequests(
  issue: Issue,
  run: RunRecord,
  group: FindingGroup,
  record: RemediationRecord,
): Promise<{ created: PullRequest[]; preview: Preview }> {
  const { preview, texts } = await previewPullRequests(run, group, record);
  if (!preview.ready) return { created: [], preview };
  const created: PullRequest[] = [];
  for (const target of preview.targets) {
    const files = [...(texts.get(target.repo!) ?? new Map()).entries()].map(
      ([path, text]) => ({ path, text }),
    );
    const opened = await openPullRequest({
      repo: target.repo!,
      base: target.base!,
      branch: preview.branch,
      title: preview.title,
      body: preview.body,
      message: pullRequestText(run, group, record).message,
      files,
    });
    created.push({
      repo: target.repo!,
      number: opened.number,
      url: opened.url,
      branch: preview.branch,
      state: "open",
      mergedAt: null,
    });
  }
  // The issue follows its first pull request; others are linked in GitHub.
  if (created[0]) await setPullRequest(issue.id, created[0], "pr_open");
  return { created, preview };
}
