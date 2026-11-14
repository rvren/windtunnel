import { RunError } from "@/server/engine/llm";
import { startRun } from "@/server/engine/registry";
import { getProject } from "@/server/projects/store";

import { UUID, failure, withDatabase } from "../../shared";

/**
 * Starts a run of the whole project: every workspace, read together. The
 * screen asks the person to confirm first, because a run uses the API key.
 */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/projects/[id]/runs">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  return withDatabase(async () => {
    const project = await getProject(id);
    if (!project) return failure("No such project.", 404);
    if (project.workspaces.length === 0) {
      return failure("Add a workspace before you run the project.", 400);
    }
    try {
      const run = await startRun({
        requirement: project.description,
        documents: [],
        project: {
          id: project.id,
          name: project.name,
          demo: project.demo,
          workspaces: project.workspaces.map(({ name, origin }) => ({
            name,
            origin,
          })),
        },
      });
      return Response.json({ id: run.id }, { status: 201 });
    } catch (error) {
      if (error instanceof RunError) return failure(error.message, 409);
      throw error;
    }
  });
}
