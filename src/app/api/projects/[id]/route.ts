import { deleteProject, getProject } from "@/server/projects/store";

import { UUID, failure, withDatabase } from "../shared";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  return withDatabase(async () => {
    const project = await getProject(id);
    return project
      ? Response.json({ project })
      : failure("No such project.", 404);
  });
}

/** Removes the project and its workspaces. Its runs stay. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  return withDatabase(async () => {
    await deleteProject(id);
    return new Response(null, { status: 204 });
  });
}
