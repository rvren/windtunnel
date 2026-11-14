import {
  addWorkspace,
  getProject,
  parseWorkspace,
} from "@/server/projects/store";

import { UUID, failure, readJson, withDatabase } from "../../shared";

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[id]/workspaces">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  const parsed = parseWorkspace(await readJson(request));
  if (!parsed.ok) return failure(parsed.error, 400);
  return withDatabase(async () => {
    const project = await getProject(id);
    if (!project) return failure("No such project.", 404);
    const added = await addWorkspace(project, parsed.value);
    return added.ok
      ? Response.json({ workspace: added.value }, { status: 201 })
      : failure(added.error, 409);
  });
}
