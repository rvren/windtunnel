import { auth } from "@modelcontextprotocol/sdk/client/auth.js";

import { ensureDatabase } from "@/server/db/ready";
import { StoredOAuthProvider, accountOf } from "@/server/connectors/oauth";
import {
  getConnection,
  patchSecrets,
  readSecrets,
  setConnection,
} from "@/server/connectors/store";

import { LIVE, callbackUrl, publicOrigin } from "../../shared";

/**
 * Where the outside server sends the person back to. Exchanges the code for
 * tokens, then returns the person to the Connectors page with the outcome.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/connectors/[provider]/callback">,
) {
  const { provider } = await context.params;
  const origin = publicOrigin(request);
  const back = (outcome: "connected" | "failed") =>
    Response.redirect(
      `${origin}/app/settings?tab=connectors&${outcome}=${provider}`,
      303,
    );
  if (!LIVE.has(provider)) return back("failed");

  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  try {
    await ensureDatabase();
    const secrets = await readSecrets(provider);
    const mcpUrl = (await getConnection(provider)).settings.mcpUrl;
    if (typeof mcpUrl !== "string") return back("failed");
    // The state proves this answer belongs to the sign-in we started.
    if (!code || !secrets.state || params.get("state") !== secrets.state) {
      await setConnection(provider, { status: "disconnected" });
      return back("failed");
    }
    const oauth = new StoredOAuthProvider(
      provider,
      callbackUrl(origin, provider),
    );
    const result = await auth(oauth, {
      serverUrl: mcpUrl,
      authorizationCode: code,
    });
    await patchSecrets(provider, { state: null, codeVerifier: null });
    if (result !== "AUTHORIZED") {
      await setConnection(provider, { status: "disconnected" });
      return back("failed");
    }
    await setConnection(provider, {
      status: "connected",
      account: accountOf(await oauth.tokens()),
    });
    return back("connected");
  } catch (error) {
    console.error("[windtunnel] Connector sign-in could not finish:", error);
    await setConnection(provider, { status: "disconnected" }).catch(
      () => undefined,
    );
    return back("failed");
  }
}
