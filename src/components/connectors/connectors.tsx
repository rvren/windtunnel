"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Plug, Search, Unplug } from "lucide-react";

import { Panel } from "@/components/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONNECTOR_ICONS } from "@/lib/connector-icons";
import {
  CONNECTOR_GROUPS,
  CONNECTORS,
  searchConnectors,
  type ConnectorEntry,
} from "@/lib/connectors";
import { cn } from "@/lib/utils";

/*
 * Settings → Connectors. One connector works today, 8090 Software Factory,
 * and it is set apart at the top. The rest of the catalog shows what is
 * planned: those cards cannot be opened or connected, and say so.
 */

export interface ConnectionView {
  provider: string;
  status: "disconnected" | "pending" | "connected" | "expired";
  account: string | null;
  settings: { sendSampleRuns?: boolean; mcpUrl?: string };
}

interface Tool {
  name: string;
  description: string;
}

const STATE = {
  disconnected: { label: "Not connected", dot: "bg-sev-low" },
  pending: { label: "Sign-in not finished", dot: "bg-sev-high" },
  connected: { label: "Connected", dot: "bg-ok" },
  expired: { label: "Needs sign-in again", dot: "bg-sev-high" },
} as const;

/**
 * 8090's own mark, as on its site: the name in block figures, cream on
 * near-black. It is 8090's trademark, shown only to name the product.
 */
function SoftwareFactoryMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className="size-9 shrink-0 rounded-md ring-1 ring-foreground/15"
    >
      <rect width="512" height="512" fill="#1e1d1d" />
      <path
        fill="#f2f0ed"
        d="M355.001 314h-93.177V198h93.177zm-93.175-52v26h37.27v-26zm37.423 0h26.918v-26h-26.918zm-49.072 52h-87.353V198h87.353zm-62.118-90v64H223v-64zm265.94 90h-87.353V198h87.353zm-61.542-90v64h35.734v-64zm-247.104 90H58V198h87.353zM83.81 262v26h35.734v-26zm0-12h35.734v-26H83.81z"
      />
    </svg>
  );
}

/** A provider's logo where there is one, or its initial. */
function Tile({
  id,
  name,
  live,
}: {
  id?: string;
  name: string;
  live?: boolean;
}) {
  const logo = id ? CONNECTOR_ICONS[id] : undefined;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md text-sm font-semibold uppercase",
        live
          ? "bg-foreground text-background"
          : "bg-accent text-muted-foreground",
      )}
    >
      {logo ? (
        // In the brand's own colour. A mark too dark for the dark theme, or
        // too light for the light one, takes the text colour there instead.
        <svg
          viewBox="0 0 24 24"
          style={{ "--logo": logo.hex } as React.CSSProperties}
          className={cn(
            "size-[18px] fill-(--logo)",
            logo.tone === "dark" && "dark:fill-foreground",
            logo.tone === "light" && "fill-foreground dark:fill-(--logo)",
          )}
        >
          <path d={logo.path} />
        </svg>
      ) : (
        name.replace(/[^a-z0-9]/gi, "").slice(0, 1)
      )}
    </span>
  );
}

function SoftwareFactory({
  entry,
  connection,
  outcome,
}: {
  entry: ConnectorEntry;
  connection: ConnectionView;
  /** Set when the person has just come back from the sign-in page. */
  outcome: "connected" | "failed" | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<
    "connect" | "disconnect" | "tools" | "setting" | "url" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(connection.settings.mcpUrl ?? "");
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [projects, setProjects] = useState<
    { id: string; name: string }[] | null
  >(null);
  const hasUrl = Boolean(connection.settings.mcpUrl);
  const state = STATE[connection.status];
  const connected = connection.status === "connected";
  const base = `/api/connectors/${entry.id}`;

  async function request(
    kind: NonNullable<typeof busy>,
    url: string,
    init?: RequestInit,
  ): Promise<Record<string, unknown> | null> {
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(url, init);
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(
          typeof body.error === "string"
            ? body.error
            : "The request could not be completed.",
        );
        return null;
      }
      return body;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    const body = await request("connect", `${base}/connect`, {
      method: "POST",
    });
    if (!body) return;
    // The sign-in happens on 8090's own page, then comes back here.
    if (typeof body.url === "string") window.location.assign(body.url);
    else router.refresh();
  }

  async function disconnect() {
    if (await request("disconnect", base, { method: "DELETE" })) {
      setTools(null);
      router.refresh();
    }
  }

  async function saveUrl(event: React.FormEvent) {
    event.preventDefault();
    const sent = await request("url", base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { mcpUrl: url.trim() } }),
    });
    if (sent) router.refresh();
  }

  async function check() {
    const toolList = await request("tools", `${base}/tools`);
    if (toolList) setTools(toolList.tools as Tool[]);
    const projectList = await request("tools", `${base}/projects`);
    if (projectList) {
      setProjects(projectList.projects as { id: string; name: string }[]);
    }
  }

  async function setSampleRuns(on: boolean) {
    const sent = await request("setting", base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { sendSampleRuns: on } }),
    });
    if (sent) router.refresh();
  }

  const spin = (kind: typeof busy, icon: React.ReactNode) =>
    busy === kind ? <LoaderCircle className="animate-spin" /> : icon;

  return (
    <Panel className="p-5" data-testid="connector-software-factory">
      <div className="flex flex-wrap items-start gap-4">
        <SoftwareFactoryMark />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-medium">
            {entry.name}
            <span
              className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground"
              data-testid="connector-state"
              data-status={connection.status}
            >
              <span className={cn("size-1.5 rounded-full", state.dot)} />
              {state.label}
              {connected && connection.account
                ? ` as ${connection.account}`
                : ""}
            </span>
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {entry.description}
          </p>
        </div>
        {connected ? (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={disconnect}
            data-testid="connector-disconnect"
          >
            {spin("disconnect", <Unplug />)}
            Disconnect
          </Button>
        ) : (
          <Button
            disabled={busy !== null || !hasUrl}
            onClick={connect}
            data-testid="connector-connect"
          >
            {spin("connect", <Plug />)}
            {connection.status === "expired" ? "Sign in again" : "Connect"}
          </Button>
        )}
      </div>

      <form
        onSubmit={saveUrl}
        className="mt-5 space-y-2 border-t pt-5"
        data-testid="connector-url-form"
      >
        <label htmlFor="sf-url" className="text-sm font-medium">
          Connector URL
        </label>
        <p className="text-xs text-muted-foreground">
          From 8090: Settings → MCP Server → Connector URL. One URL covers every
          project of your organization.
        </p>
        <div className="flex max-w-3xl gap-2">
          <Input
            id="sf-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://api.factory.8090.dev/v3/mcp/org/…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            data-testid="connector-url"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={
              busy !== null ||
              !url.trim() ||
              url.trim() === (connection.settings.mcpUrl ?? "")
            }
            data-testid="connector-url-save"
          >
            {spin("url", null)}
            Save
          </Button>
        </div>
        {hasUrl || connected ? null : (
          <p className="text-xs text-muted-foreground">
            Save the URL, then connect.
          </p>
        )}
      </form>

      {outcome === "connected" && connected ? (
        <p
          className="mt-4 text-sm"
          role="status"
          data-testid="connector-outcome"
        >
          Signed in. Choose an 8090 project on a project&apos;s page, and its
          runs send their work orders there.
        </p>
      ) : null}
      {outcome === "failed" && !connected ? (
        <Alert
          variant="destructive"
          className="mt-4"
          data-testid="connector-outcome"
        >
          <AlertDescription>
            The sign-in did not finish. Nothing was connected. Try again.
          </AlertDescription>
        </Alert>
      ) : null}

      {connected ? (
        <div className="mt-5 space-y-5 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Also send sample runs</p>
              <p className="text-xs text-muted-foreground">
                Off, so scripted sample data does not fill a real 8090 project.
                Turn it on to try the whole path for free.
              </p>
            </div>
            <Button
              variant={
                connection.settings.sendSampleRuns ? "secondary" : "outline"
              }
              size="sm"
              role="switch"
              aria-checked={Boolean(connection.settings.sendSampleRuns)}
              disabled={busy !== null}
              onClick={() => setSampleRuns(!connection.settings.sendSampleRuns)}
              data-testid="connector-send-sample-runs"
            >
              {connection.settings.sendSampleRuns ? <Check /> : null}
              {connection.settings.sendSampleRuns ? "On" : "Off"}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Check the connection</p>
                <p className="text-xs text-muted-foreground">
                  Lists your 8090 projects and the tools its MCP server offers.
                  Nothing is changed there.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={check}
                data-testid="connector-test"
              >
                {spin("tools", null)}
                Check
              </Button>
            </div>
            {projects ? (
              <p className="text-sm" data-testid="connector-projects">
                {projects.length === 0
                  ? "No 8090 projects were found for this account."
                  : `${projects.length} ${projects.length === 1 ? "project" : "projects"}: ${projects.map((item) => item.name).join(", ")}`}
              </p>
            ) : null}
            {tools ? (
              <details className="text-sm" data-testid="connector-tools">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {tools.length} tools
                </summary>
                <ul className="mt-2 divide-y rounded-md border">
                  {tools.map((tool) => (
                    <li key={tool.name} className="px-3 py-2">
                      <span className="font-mono text-xs">{tool.name}</span>
                      {tool.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {tool.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert
          variant="destructive"
          className="mt-4"
          data-testid="connector-error"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </Panel>
  );
}

export function Connectors({
  connection,
  outcome,
}: {
  connection: ConnectionView;
  outcome: "connected" | "failed" | null;
}) {
  const [text, setText] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const live = CONNECTORS.filter((entry) => entry.live);
  const planned = searchConnectors(text, group).filter((entry) => !entry.live);
  const groups = CONNECTOR_GROUPS.filter((item) =>
    planned.some((entry) => entry.group === item.name),
  );

  return (
    <div className="space-y-10" data-testid="connectors">
      <section className="space-y-3">
        {live.map((entry) => (
          <SoftwareFactory
            key={entry.id}
            entry={entry}
            connection={connection}
            outcome={outcome}
          />
        ))}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-medium">Coming soon</h2>
          <p className="text-xs text-muted-foreground">
            {CONNECTORS.length - live.length} planned. These cannot be connected
            yet.
          </p>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search connectors"
              aria-label="Search connectors"
              className="pl-8"
              data-testid="connectors-search"
            />
          </div>
          {CONNECTOR_GROUPS.map((item) => (
            <Button
              key={item.name}
              type="button"
              size="sm"
              variant={group === item.name ? "secondary" : "ghost"}
              aria-pressed={group === item.name}
              onClick={() => setGroup(group === item.name ? null : item.name)}
              data-testid="connectors-group"
              className="text-muted-foreground aria-pressed:text-foreground"
            >
              {item.name}
            </Button>
          ))}
        </div>

        {planned.length === 0 ? (
          <p
            className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground"
            data-testid="connectors-none"
          >
            No connector matches.
          </p>
        ) : null}
        <div className="space-y-8">
          {groups.map((item) => (
            <div key={item.name}>
              <h3 className="text-sm font-medium">{item.name}</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                {item.purpose}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {planned
                  .filter((entry) => entry.group === item.name)
                  .map((entry) => (
                    <li
                      key={entry.id}
                      data-testid="connector-planned"
                      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5"
                    >
                      <Tile id={entry.id} name={entry.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {entry.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
