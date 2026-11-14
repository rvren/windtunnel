import { randomBytes } from "node:crypto";

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { patchSecrets, readSecrets, setConnection } from "./store";

/*
 * Sign-in for an MCP server, the standard way: Windtunnel registers itself
 * as a client, sends the person to the server's sign-in page, and gets
 * tokens back at its callback address. Everything it has to remember between
 * those steps, and the tokens themselves, is kept in the connection's
 * secrets in Postgres. None of it is ever sent to the browser or logged.
 */
export class StoredOAuthProvider implements OAuthClientProvider {
  /** Set when the SDK wants the person sent to the sign-in page. */
  authorizationUrl: URL | null = null;

  constructor(
    private readonly provider: string,
    /** Where the outside server sends the person back to. */
    private readonly callbackUrl: string,
  ) {}

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Windtunnel",
      redirect_uris: [this.callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  /** A value only this sign-in knows, checked when the person comes back. */
  async state(): Promise<string> {
    const state = randomBytes(24).toString("base64url");
    await patchSecrets(this.provider, { state });
    return state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const { client, clientCallback } = await readSecrets(this.provider);
    // A registration is tied to its callback address. From another address
    // (another port, another host) Windtunnel registers again.
    return clientCallback === this.callbackUrl
      ? (client as OAuthClientInformationMixed | undefined)
      : undefined;
  }

  async saveClientInformation(
    client: OAuthClientInformationMixed,
  ): Promise<void> {
    await patchSecrets(this.provider, {
      client,
      clientCallback: this.callbackUrl,
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await readSecrets(this.provider)).tokens as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await patchSecrets(this.provider, { tokens });
    await setConnection(this.provider, { status: "connected" });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await patchSecrets(this.provider, { codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const { codeVerifier } = await readSecrets(this.provider);
    if (typeof codeVerifier !== "string") {
      throw new Error("No sign-in is in progress.");
    }
    return codeVerifier;
  }
}

/** The email or name inside an identity token, for display only. */
export function accountOf(tokens: OAuthTokens | undefined): string | null {
  const idToken = (tokens as { id_token?: string } | undefined)?.id_token;
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: unknown; name?: unknown };
    const label = claims.email ?? claims.name;
    return typeof label === "string" ? label : null;
  } catch {
    return null;
  }
}
