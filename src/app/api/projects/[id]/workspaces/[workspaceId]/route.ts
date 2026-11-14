import { getProject, removeWorkspace } from "@/server/projects/store";

import { UUID, failure, withDatabase } from "../../../shared";

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/projects/[id]/workspaces/[workspaceId]">,
) {
  const { id, workspaceId } = await context.params;
  if (!UUID.test(id) || !UUID.test(workspaceId)) {
    return failure("No such workspace.", 404);
  }
  return withDatabase(async () => {
    const project = await getProject(id);
    if (!project?.workspaces.some((item) => item.id === workspaceId)) {
      return failure("No such workspace.", 404);
    }
    await removeWorkspace(workspaceId);
    return new Response(null, { status: 204 });
  });
}
