import { parseConnectorUrl } from "@/server/connectors/software-factory";
import {
  disconnect,
  getConnection,
  setConnection,
} from "@/server/connectors/store";

import { LIVE, failure, readJson, withDatabase } from "../shared";

/** Changes a connector's settings, for example "also send sample runs". */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/connectors/[provider]">,
) {
  const { provider } = await context.params;
  if (!LIVE.has(provider)) return failure("No such connector.", 404);
  const body = ((await readJson(request)) ?? {}) as { settings?: unknown };
  if (typeof body.settings !== "object" || body.settings === null) {
    return failure("Send the settings to change.", 400);
  }
  const change = body.settings as Record<string, unknown>;
  return withDatabase(async () => {
    const current = await getConnection(provider);
    let mcpUrl: string | null | undefined;
    if ("mcpUrl" in change) {
      mcpUrl = parseConnectorUrl(change.mcpUrl);
      if (!mcpUrl) {
        return failure(
          "That is not a Software Factory connector URL. Copy it from 8090: Settings → MCP Server.",
          400,
        );
      }
      // Another organization is another sign-in.
      if (current.settings.mcpUrl && mcpUrl !== current.settings.mcpUrl) {
        await disconnect(provider);
      }
    }
    await setConnection(provider, {
      settings: {
        ...current.settings,
        ...(mcpUrl ? { mcpUrl } : {}),
        ...("sendSampleRuns" in change
          ? { sendSampleRuns: change.sendSampleRuns === true }
          : {}),
      },
    });
    return Response.json({ connection: await getConnection(provider) });
  });
}

/** Forgets the sign-in. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/connectors/[provider]">,
) {
  const { provider } = await context.params;
  if (!LIVE.has(provider)) return failure("No such connector.", 404);
  return withDatabase(async () => {
    await disconnect(provider);
    return Response.json({ connection: await getConnection(provider) });
  });
}
