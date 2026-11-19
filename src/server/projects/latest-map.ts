import { runStore } from "../engine/registry";
import type { Architecture } from "../engine/schema";

/*
 * A project's map as its latest finished code run drew it: the parts
 * Engine Out offers to cut. Null for a project whose code was never run.
 */
export async function latestMap(
  projectId: string,
): Promise<Architecture | null> {
  const runs = await runStore().list({ projectId });
  const done = runs.find(
    (run) =>
      run.status === "completed" &&
      run.kind === "audit" &&
      run.workspaces.length > 0,
  );
  if (!done) return null;
  const record = await runStore().get(done.id);
  const architecture = record?.source?.architecture;
  return architecture && architecture.components.length > 0
    ? architecture
    : null;
}

export interface DefendTarget {
  runId: string;
  groupId: string;
  title: string;
  severity: string;
  /** The run wrote a checked patch for it: round 1 starts from that. */
  hasFix: boolean;
}

/**
 * The security issues of a project's latest finished code run: what a
 * Dogfight can defend. Empty for a project whose code was never run.
 */
export async function latestSecurityIssues(
  projectId: string,
): Promise<DefendTarget[]> {
  const runs = await runStore().list({ projectId });
  const done = runs.find(
    (run) =>
      run.status === "completed" &&
      run.kind === "audit" &&
      run.workspaces.length > 0,
  );
  if (!done) return [];
  const record = await runStore().get(done.id);
  if (!record) return [];
  const order = ["critical", "high", "medium", "low"];
  return record.groups
    .filter((group) => group.type === "security_vulnerability")
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .map((group) => {
      const fix = record.remediations?.[group.id];
      return {
        runId: record.id,
        groupId: group.id,
        title: group.title,
        severity: group.severity,
        hasFix: fix?.status === "made" && fix.edits.length > 0,
      };
    });
}
