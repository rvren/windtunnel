import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { connections, deliveries, projectLinks } from "../db/schema";

/*
 * What Windtunnel remembers about its connectors: the connection itself
 * (with its secrets), which outside project each project sends to, and what
 * was sent. Secrets leave this file only through `readSecrets`, which the
 * server-side sign-in and MCP code use. Nothing here returns them otherwise.
 */

export type ConnectionStatus =
  "disconnected" | "pending" | "connected" | "expired";

/** A connection as the screens may see it: no secrets. */
export interface Connection {
  provider: string;
  status: ConnectionStatus;
  account: string | null;
  settings: Record<string, unknown>;
  updatedAt: string | null;
}

const NONE = (provider: string): Connection => ({
  provider,
  status: "disconnected",
  account: null,
  settings: {},
  updatedAt: null,
});

export async function getConnection(provider: string): Promise<Connection> {
  const [row] = await db()
    .select({
      provider: connections.provider,
      status: connections.status,
      account: connections.account,
      settings: connections.settings,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(eq(connections.provider, provider));
  if (!row) return NONE(provider);
  return {
    ...row,
    status: row.status as ConnectionStatus,
    settings: row.settings as Record<string, unknown>,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Changes the connection's plain fields. Creates the row if it is missing. */
export async function setConnection(
  provider: string,
  change: {
    status?: ConnectionStatus;
    account?: string | null;
    settings?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date();
  await db()
    .insert(connections)
    .values({ provider, updatedAt: now, ...change })
    .onConflictDoUpdate({
      target: connections.provider,
      set: { updatedAt: now, ...change },
    });
}

/** Server only: what signing in stored. */
export async function readSecrets(
  provider: string,
): Promise<Record<string, unknown>> {
  const [row] = await db()
    .select({ secrets: connections.secrets })
    .from(connections)
    .where(eq(connections.provider, provider));
  return (row?.secrets as Record<string, unknown>) ?? {};
}

/** Server only: merges into the stored secrets. A null value removes a key. */
export async function patchSecrets(
  provider: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const next = { ...(await readSecrets(provider)), ...patch };
  for (const key of Object.keys(next)) {
    if (next[key] === null) delete next[key];
  }
  const now = new Date();
  await db()
    .insert(connections)
    .values({ provider, secrets: next, updatedAt: now })
    .onConflictDoUpdate({
      target: connections.provider,
      set: { secrets: next, updatedAt: now },
    });
}

/** Forgets the sign-in. Settings are kept. */
export async function disconnect(provider: string): Promise<void> {
  await db()
    .update(connections)
    .set({
      status: "disconnected",
      account: null,
      secrets: {},
      updatedAt: new Date(),
    })
    .where(eq(connections.provider, provider));
}

// ── Project links ───────────────────────────────────────────────────────────

export async function getProjectLink(
  projectId: string,
  provider: string,
): Promise<string | null> {
  const [row] = await db()
    .select({ externalId: projectLinks.externalId })
    .from(projectLinks)
    .where(
      and(
        eq(projectLinks.projectId, projectId),
        eq(projectLinks.provider, provider),
      ),
    );
  return row?.externalId ?? null;
}

/** Links the project, or removes the link when the id is empty. */
export async function setProjectLink(
  projectId: string,
  provider: string,
  externalId: string,
): Promise<void> {
  const where = and(
    eq(projectLinks.projectId, projectId),
    eq(projectLinks.provider, provider),
  );
  if (!externalId) {
    await db().delete(projectLinks).where(where);
    return;
  }
  await db()
    .insert(projectLinks)
    .values({ projectId, provider, externalId, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [projectLinks.projectId, projectLinks.provider],
      set: { externalId },
    });
}

// ── Deliveries ──────────────────────────────────────────────────────────────

export interface Delivery {
  workOrderId: string;
  status: "sending" | "sent" | "failed";
  externalId: string | null;
  url: string | null;
  error: string | null;
}

export async function listDeliveries(
  runId: string,
  provider: string,
): Promise<Delivery[]> {
  const rows = await db()
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.runId, runId), eq(deliveries.provider, provider)));
  return rows.map((row) => ({
    workOrderId: row.workOrderId,
    status: row.status as Delivery["status"],
    externalId: row.externalId,
    url: row.url,
    error: row.error,
  }));
}

/**
 * Takes the right to send one work order. True for the caller that may send
 * it now: one that was never tried, or one whose last try failed. A work
 * order that was sent, or is being sent, is never taken again.
 */
export async function claimDelivery(
  runId: string,
  workOrderId: string,
  provider: string,
): Promise<boolean> {
  const now = new Date();
  const rows = await db()
    .insert(deliveries)
    .values({ runId, workOrderId, provider, status: "sending", updatedAt: now })
    .onConflictDoUpdate({
      target: [deliveries.runId, deliveries.workOrderId, deliveries.provider],
      set: { status: "sending", error: null, updatedAt: now },
      setWhere: sql`${deliveries.status} = 'failed'`,
    })
    .returning({ status: deliveries.status });
  return rows.length > 0;
}

export async function finishDelivery(
  runId: string,
  workOrderId: string,
  provider: string,
  result:
    | { ok: true; externalId: string | null; url: string | null }
    | { ok: false; error: string },
): Promise<void> {
  await db()
    .update(deliveries)
    .set(
      result.ok
        ? {
            status: "sent",
            externalId: result.externalId,
            url: result.url,
            error: null,
            updatedAt: new Date(),
          }
        : { status: "failed", error: result.error, updatedAt: new Date() },
    )
    .where(
      and(
        eq(deliveries.runId, runId),
        eq(deliveries.workOrderId, workOrderId),
        eq(deliveries.provider, provider),
      ),
    );
}

/** Marks sends that a restart cut off as failed, so they can be tried again. */
export async function failStuckDeliveries(): Promise<void> {
  await db()
    .update(deliveries)
    .set({
      status: "failed",
      error: "The server stopped while this was being sent.",
      updatedAt: new Date(),
    })
    .where(eq(deliveries.status, "sending"));
}
