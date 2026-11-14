import { engineConfig } from "../engine/config";
import { AnthropicLlm, RunError, type LlmClient } from "../engine/llm";
import { remediate } from "../engine/remediation";
import { prepareRepo, type PreparedRepo } from "../engine/repo/fetch";
import { takeInventory } from "../engine/repo/inventory";
import { surveyRepo, surveyWorkspaces } from "../engine/repo/survey";
import { RepoReader } from "../engine/repo/tools";
import { runStore } from "../engine/registry";
import { ScriptedLlm } from "../engine/sample";
import { sampleProjectScript, sampleServiceOf } from "../engine/sample-project";
import type { RemediationRecord, RunRecord } from "../engine/schema";
import { getProject } from "../projects/store";
import type { Issue } from "./store";

/*
 * The fix agent: writes a fresh remediation for one issue against the code
 * as it is now, when the run's patch is missing or no longer fits. It is
 * the remediation stage for that one issue, with the same checks (every
 * edit must match the real file; secrets are never echoed). It reads code
 * and never runs it. A demo project replays its script; any other project
 * calls the model on the owner's key, so the app asks first.
 */

export async function writeFix(issue: Issue): Promise<RemediationRecord> {
  const store = runStore();
  const run = issue.lastRunId ? await store.get(issue.lastRunId) : null;
  const group = run?.groups.find((item) => item.id === issue.lastGroupId);
  if (!run || !group || !run.source) {
    throw new RunError("This issue has no code run to write a fix from.");
  }
  if (group.type !== "security_vulnerability") {
    throw new RunError("Fixes are written for security issues only.");
  }
  const project = await getProject(issue.projectId);
  const config = engineConfig();
  const scripted = config.sampleMode || project?.demo === true;
  if (!scripted && !config.hasApiKey) {
    throw new RunError("No API key is set, so no fix can be written.");
  }
  const source = run.source;
  const llm: LlmClient = scripted
    ? new ScriptedLlm(
        sampleProjectScript(
          (source.workspaces ?? []).map((item) => ({
            name: item.name,
            service: sampleServiceOf(item.origin),
          })),
        ),
      )
    : new AnthropicLlm();

  const prepared: PreparedRepo[] = [];
  try {
    let reader: RepoReader;
    let survey: Awaited<ReturnType<typeof surveyRepo>>;
    if (source.workspaces) {
      const roots: Record<string, string> = {};
      for (const workspace of source.workspaces) {
        const fetched = await prepareRepo(
          workspace.origin,
          `fix-${issue.id}-${workspace.name}`,
        );
        prepared.push(fetched);
        roots[workspace.name] = fetched.root;
      }
      survey = await surveyWorkspaces(
        Object.entries(roots).map(([name, root]) => ({ name, root })),
      );
      reader = new RepoReader(roots, survey);
    } else {
      const fetched = await prepareRepo(source.origin, `fix-${issue.id}`);
      prepared.push(fetched);
      survey = await surveyRepo(fetched.root);
      reader = new RepoReader(fetched.root, survey);
    }
    const { secretValues } = await takeInventory(
      survey.files.filter((file) => file.readable).map((file) => file.path),
      (path) => reader.allLines(path),
    );
    const { records } = await remediate({
      llm,
      run: { ...run, groups: [group] } as RunRecord,
      reader,
      secretValues,
      onReady: async () => undefined,
    });
    const record = records[group.id];
    if (!record) throw new RunError("The fix agent gave no answer.");
    const written: RemediationRecord = {
      ...record,
      notes: [
        ...record.notes,
        `Written on ${new Date().toISOString().slice(0, 10)} against the code as it was then, after the run.`,
      ],
    };
    // The run keeps the newest fix, so the pull request uses it.
    await store.save({
      ...run,
      remediations: { ...(run.remediations ?? {}), [group.id]: written },
    });
    return written;
  } finally {
    await Promise.all(prepared.map((item) => item.cleanup()));
  }
}
