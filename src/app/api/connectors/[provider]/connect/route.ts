import { auth } from "@modelcontextprotocol/sdk/client/auth.js";

import { StoredOAuthProvider, accountOf } from "@/server/connectors/oauth";
import { getConnection, setConnection } from "@/server/connectors/store";

import {
  LIVE,
  callbackUrl,
  failure,
  publicOrigin,
  withDatabase,
} from "../../shared";

/**
 * Starts the sign-in. Answers with the address of the outside server's
 * sign-in page, which the browser then opens.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/connectors/[provider]/connect">,
) {
  const { provider } = await context.params;
  if (!LIVE.has(provider)) return failure("No such connector.", 404);
  return withDatabase(async () => {
    const mcpUrl = (await getConnection(provider)).settings.mcpUrl;
    if (typeof mcpUrl !== "string") {
      return failure("Save the connector URL first.", 400);
    }
    const oauth = new StoredOAuthProvider(
      provider,
      callbackUrl(publicOrigin(request), provider),
    );
    try {
      const result = await auth(oauth, { serverUrl: mcpUrl });
      if (result === "AUTHORIZED") {
        await setConnection(provider, {
          status: "connected",
          account: accountOf(await oauth.tokens()),
        });
        return Response.json({ connected: true });
      }
      if (!oauth.authorizationUrl) {
        return failure("The server did not offer a sign-in page.", 502);
      }
      await setConnection(provider, { status: "pending" });
      return Response.json({ url: oauth.authorizationUrl.toString() });
    } catch (error) {
      console.error("[windtunnel] Connector sign-in could not start:", error);
      return failure(
        "The sign-in could not be started. The outside server did not answer as expected.",
        502,
      );
    }
  });
}
