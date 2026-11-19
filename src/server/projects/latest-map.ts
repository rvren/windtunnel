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
