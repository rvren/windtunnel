import { ConnectorError, listTools } from "@/server/connectors/mcp";
import { softwareFactoryTarget } from "@/server/connectors/software-factory";
import { getConnection } from "@/server/connectors/store";

import { LIVE, failure, withDatabase } from "../../shared";

/** The tools the connected server offers. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/connectors/[provider]/tools">,
) {
  const { provider } = await context.params;
  if (!LIVE.has(provider)) return failure("No such connector.", 404);
  return withDatabase(async () => {
    const mcpUrl = (await getConnection(provider)).settings.mcpUrl;
    if (typeof mcpUrl !== "string") {
      return failure("Save the connector URL first.", 400);
    }
    try {
      return Response.json({
        tools: await listTools(softwareFactoryTarget(mcpUrl)),
      });
    } catch (error) {
      if (error instanceof ConnectorError) return failure(error.message, 502);
      throw error;
    }
  });
}
