import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { StoredOAuthProvider } from "./oauth";
import { readSecrets, setConnection } from "./store";

/*
 * Windtunnel as an MCP client. One short-lived session per piece of work:
 * connect, call, close. The stored tokens are used, and refreshed when the
 * server asks.
 */

/** A problem with a connector that the person can read and act on. */
export class ConnectorError extends Error {}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpTarget {
  /** The connection whose sign-in is used. */
  provider: string;
  url: string;
  /** Sent with every request, for example the outside project's id. */
  headers: Record<string, string>;
}

/** Runs `work` with a connected client, then closes it. */
export async function withMcp<T>(
  target: McpTarget,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const secrets = await readSecrets(target.provider);
  if (!secrets.tokens) {
    throw new ConnectorError("Not connected. Sign in on the Connectors page.");
  }
  const transport = new StreamableHTTPClientTransport(new URL(target.url), {
    authProvider: new StoredOAuthProvider(
      target.provider,
      String(secrets.clientCallback ?? ""),
    ),
    requestInit: { headers: target.headers },
  });
  const client = new Client({ name: "windtunnel", version: "0.1.0" });
  try {
    await client.connect(transport);
    return await work(client);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await setConnection(target.provider, { status: "expired" });
      throw new ConnectorError(
        "The sign-in is no longer valid. Connect again on the Connectors page.",
      );
    }
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listTools(target: McpTarget): Promise<McpTool[]> {
  return withMcp(target, async (client) => {
    const { tools } = await client.listTools();
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
    }));
  });
}

/** Calls a tool and returns its answer as text, and as data when it gave any. */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; data: unknown }> {
  const result = await client.callTool({ name, arguments: args });
  const text = (Array.isArray(result.content) ? result.content : [])
    .flatMap((part: { type?: string; text?: string }) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");
  if (result.isError) {
    throw new ConnectorError(text || `The tool "${name}" failed.`);
  }
  let data: unknown = result.structuredContent ?? null;
  if (data === null) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { text, data };
}
