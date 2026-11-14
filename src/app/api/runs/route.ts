import { connection } from "next/server";

import { ensureDatabase } from "@/server/db/ready";
import { parseRunInput } from "@/server/engine/input";
import { RunError } from "@/server/engine/llm";
import { runStore, startRun } from "@/server/engine/registry";
import { getProject } from "@/server/projects/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failure = (error: string, status: number) =>
  Response.json({ error }, { status });

/** Runs, newest first. `?project=` and `?workspace=` (repeatable) narrow them. */
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const projectId = params.get("project") ?? undefined;
  if (projectId && !UUID.test(projectId)) return Response.json({ runs: [] });
  try {
    await ensureDatabase();
    return Response.json({
      runs: await runStore().list({
        projectId,
        workspaces: params.getAll("workspace"),
      }),
    });
  } catch {
    return failure("The database is not reachable.", 503);
  }
}

/**
 * Starts a run. Every run belongs to a project. With `workspaces` (names of
 * the project's workspaces) it reads their code; without, it tests the
 * written requirement. It goes on in the server after this answers.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("Send the run as JSON.", 400);
  }
  const { projectId, workspaces, repository } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (repository !== undefined && repository !== null) {
    return failure(
      "Add the repository to a project as a workspace, then run it.",
      400,
    );
  }
  if (typeof projectId !== "string" || !UUID.test(projectId)) {
    return failure("Choose a project.", 400);
  }
  const names =
    Array.isArray(workspaces) && workspaces.length > 0
      ? workspaces.filter((name): name is string => typeof name === "string")
      : null;
  const parsed = parseRunInput(body, names !== null);
  if (!parsed.ok) return failure(parsed.error, 400);

  try {
    await ensureDatabase();
  } catch {
    return failure("The database is not reachable.", 503);
  }
  try {
    const project = await getProject(projectId);
    if (!project) return failure("No such project.", 404);
    const chosen = names
      ? project.workspaces.filter((item) => names.includes(item.name))
      : [];
    if (names && chosen.length !== new Set(names).size) {
      return failure("One of those workspaces is not in the project.", 400);
    }
    const run = await startRun({
      requirement: parsed.input.requirement,
      documents: parsed.input.documents,
      ...(names
        ? {
            project: {
              id: project.id,
              name: project.name,
              demo: project.demo,
              workspaces: chosen.map(({ name, origin }) => ({ name, origin })),
            },
          }
        : { projectRef: { id: project.id, demo: project.demo } }),
    });
    return Response.json({ id: run.id }, { status: 201 });
  } catch (error) {
    if (error instanceof RunError) return failure(error.message, 409);
    console.error("[windtunnel] Could not start a run:", error);
    return failure("The run could not be started.", 500);
  }
}
