import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";
import { getProjectLink, setProjectLink } from "@/server/connectors/store";
import { getProject } from "@/server/projects/store";

import { UUID, failure, readJson, withDatabase } from "../../shared";

/**
 * Links the project to a project in 8090 Software Factory, by that
 * project's id. An empty id removes the link.
 */
export async function PUT(
  request: Request,
  context: RouteContext<"/api/projects/[id]/link">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) return failure("No such project.", 404);
  const body = ((await readJson(request)) ?? {}) as { externalId?: unknown };
  const externalId =
    typeof body.externalId === "string" ? body.externalId.trim() : null;
  if (externalId === null || externalId.length > 200) {
    return failure("Give the 8090 project id.", 400);
  }
  return withDatabase(async () => {
    if (!(await getProject(id))) return failure("No such project.", 404);
    await setProjectLink(id, SOFTWARE_FACTORY, externalId);
    return Response.json({
      externalId: await getProjectLink(id, SOFTWARE_FACTORY),
    });
  });
}
