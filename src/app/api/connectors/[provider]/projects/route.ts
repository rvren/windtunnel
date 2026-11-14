import { ConnectorError } from "@/server/connectors/mcp";
import { listFactoryProjects } from "@/server/connectors/software-factory";

import { LIVE, failure, withDatabase } from "../../shared";

/** The outside projects the signed-in person can send work orders to. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/connectors/[provider]/projects">,
) {
  const { provider } = await context.params;
  if (!LIVE.has(provider)) return failure("No such connector.", 404);
  return withDatabase(async () => {
    try {
      return Response.json(await listFactoryProjects());
    } catch (error) {
      if (error instanceof ConnectorError) return failure(error.message, 502);
      throw error;
    }
  });
}
