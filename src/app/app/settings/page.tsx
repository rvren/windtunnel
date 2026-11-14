import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { Connectors } from "@/components/connectors/connectors";
import { SettingsTabs } from "@/components/connectors/settings-tabs";
import { SampleData } from "@/components/project/sample-data";
import { cn } from "@/lib/utils";
import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";
import { getConnection } from "@/server/connectors/store";
import { ensureDatabase } from "@/server/db/ready";
import { hasDemoData } from "@/server/projects/demo";
import { engineStatus } from "@/server/status";

export const metadata: Metadata = { title: "Settings" };

function Row({
  label,
  value,
  state,
  note,
}: {
  label: string;
  value: string;
  state?: "ok" | "bad";
  note?: string;
}) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">
        <span className="flex items-center gap-2">
          {state ? (
            <span
              className={cn(
                "size-1.5 rounded-full",
                state === "ok" ? "bg-ok" : "bg-sev-critical",
              )}
            />
          ) : null}
          <span className="font-medium">{value}</span>
        </span>
        {note ? (
          <span className="mt-1 block text-muted-foreground">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}

async function Status() {
  await connection();
  const status = await engineStatus();
  return (
    <dl
      className="divide-y rounded-md border bg-card px-5"
      data-testid="settings-status"
    >
      <Row
        label="Claude API key"
        value={status.apiKey ? "Present" : "Not set"}
        state={status.apiKey ? "ok" : "bad"}
        note={
          status.apiKey
            ? "Read from ANTHROPIC_API_KEY on the server. It is never shown or sent to the browser."
            : "Add ANTHROPIC_API_KEY to .env.local and restart the server."
        }
      />
      <Row
        label="Database"
        value={status.database.up ? "Connected" : "Not reachable"}
        state={status.database.up ? "ok" : "bad"}
        note={`Postgres at ${status.database.address}. Runs are saved here.`}
      />
      <Row
        label="Model, judge and work orders"
        value={status.models.reasoning}
        note="Set with WINDTUNNEL_MODEL_REASONING."
      />
      <Row
        label="Agents"
        value={status.models.agents}
        note="Set with WINDTUNNEL_MODEL_AGENTS."
      />
      {status.sampleMode ? (
        <Row
          label="Sample mode"
          value="On"
          note="Runs replay sample data and do not call the model. Turn it off by removing WINDTUNNEL_SAMPLE_RUN."
        />
      ) : null}
    </dl>
  );
}

async function Sample() {
  await connection();
  let present = false;
  try {
    await ensureDatabase();
    present = await hasDemoData();
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        The database is not reachable.
      </p>
    );
  }
  return (
    <SampleData
      present={present}
      githubToken={Boolean(process.env.GITHUB_TOKEN?.trim())}
    />
  );
}

async function ConnectorsTab({
  outcome,
}: {
  outcome: "connected" | "failed" | null;
}) {
  await connection();
  let current: Awaited<ReturnType<typeof getConnection>> | null = null;
  try {
    await ensureDatabase();
    current = await getConnection(SOFTWARE_FACTORY);
  } catch {
    current = null;
  }
  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        The database is not reachable.
      </p>
    );
  }
  return (
    <Connectors
      connection={{
        provider: current.provider,
        status: current.status,
        account: current.account,
        settings: current.settings,
      }}
      outcome={outcome}
    />
  );
}

async function Tabbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const outcome =
    query.connected === SOFTWARE_FACTORY
      ? "connected"
      : query.failed === SOFTWARE_FACTORY
        ? "failed"
        : null;
  return (
    <SettingsTabs
      initial={typeof query.tab === "string" ? query.tab : null}
      engine={
        <Suspense fallback={<PageLoading label="Checking the engine" />}>
          <Status />
        </Suspense>
      }
      connectors={
        <Suspense fallback={<PageLoading label="Reading the connectors" />}>
          <ConnectorsTab outcome={outcome} />
        </Suspense>
      }
      sample={
        <Suspense fallback={<PageLoading label="Looking for sample data" />}>
          <Sample />
        </Suspense>
      }
    />
  );
}

export default function SettingsPage({
  searchParams,
}: PageProps<"/app/settings">) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="What the engine is set up with, the connectors, and the sample data."
      />
      <Suspense fallback={<PageLoading label="Reading the settings" />}>
        <Tabbed searchParams={searchParams} />
      </Suspense>
    </>
  );
}
