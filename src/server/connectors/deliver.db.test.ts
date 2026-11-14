import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import {
  agentReports,
  connections,
  projects,
  runEvents,
  runs,
} from "../db/schema";
import { executeRun, newRun } from "../engine/run";
import { ScriptedLlm } from "../engine/sample";
import { sampleProjectScript, sampleServiceOf } from "../engine/sample-project";
import { PgRunStore } from "../engine/store";
import { createProject } from "../projects/store";
import { deliverRun, type OpenOutbox } from "./deliver";
import {
  SOFTWARE_FACTORY,
  toFactoryWorkOrder,
  type FactoryWorkOrder,
} from "./software-factory";
import {
  failStuckDeliveries,
  getConnection,
  listDeliveries,
  patchSecrets,
  setConnection,
  setProjectLink,
} from "./store";

// Runs against the windtunnel_test database. Software Factory is a stand-in:
// nothing here reaches the network.
const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../samples/storefront",
);
const store = new PgRunStore(db());

/** A finished scripted run of two sample services, saved. */
async function finishedRun(projectId: string, id: string, sample = true) {
  process.env.WINDTUNNEL_REPOS_DIR = SAMPLES;
  const workspaces = (["orders", "billing"] as const).map((name) => ({
    name,
    origin: { kind: "local" as const, name },
  }));
  const run = newRun(
    id,
    {
      requirement: "",
      documents: [],
      project: { id: projectId, name: "Storefront", workspaces },
    },
    { reasoning: "reasoning-model", agents: "agent-model" },
    new Date("2026-11-14T10:00:00Z"),
    sample,
  );
  return executeRun(
    {
      llm: new ScriptedLlm(
        sampleProjectScript(
          workspaces.map((item) => ({
            name: item.name,
            service: sampleServiceOf(item.origin),
          })),
        ),
      ),
      store,
      publish: () => {},
      now: () => new Date("2026-11-14T10:00:05Z"),
    },
    run,
  );
}

/** A Software Factory that records what it is asked to do. */
function standIn(failOn: string[] = []) {
  const made: FactoryWorkOrder[] = [];
  const labels: string[] = [];
  const projectIds: string[] = [];
  const open: OpenOutbox = (externalProjectId, work) => {
    projectIds.push(externalProjectId);
    return work({
      ensureLabels: async (titles) => {
        labels.push(...titles);
      },
      create: async (workOrder) => {
        if (failOn.some((part) => workOrder.title.includes(part))) {
          throw new Error("Software Factory said no.");
        }
        made.push(workOrder);
        return { externalId: `WO-${made.length}`, url: null };
      },
    });
  };
  return { open, made, labels, projectIds };
}

const RUN_A = "00000000-0000-4000-8000-000000000051";
const RUN_B = "00000000-0000-4000-8000-000000000052";

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
  await db().delete(projects);
  await db().delete(connections);
});

afterAll(async () => {
  await pool().end();
});

async function linkedProject(sendSampleRuns = true) {
  const project = await createProject({ name: "Storefront", description: "" });
  await setConnection(SOFTWARE_FACTORY, {
    status: "connected",
    settings: { sendSampleRuns },
  });
  await setProjectLink(project.id, SOFTWARE_FACTORY, "sf-project-1");
  return project;
}

describe("the Software Factory work order", () => {
  it("carries the priority, kind, findings and workspaces", async () => {
    const project = await linkedProject();
    const run = await finishedRun(project.id, RUN_A);
    const byId = (id: string) =>
      toFactoryWorkOrder(
        run,
        run.workOrders.find((item) => item.id === id)!,
      );

    const charge = byId("wo-charge-once");
    expect(charge).toMatchObject({
      entity_type: "work_order",
      title: "Make a charge safe to fail and safe to repeat",
      type: "fix",
      status: "backlog",
      priority: "urgent",
    });
    // Its findings are in both services.
    expect(charge.label_titles.sort()).toEqual([
      "billing",
      "orders",
      "windtunnel",
    ]);
    expect(charge.description).toContain("## Acceptance criteria");
    expect(charge.description).toContain(
      "- Given the same charge sent three times",
    );
    expect(charge.description).toContain("`orders/billing_client.py:7`");
    expect(charge.description).toContain(run.id);

    // A security fix carries its remediation, with the patch as a diff.
    const cardLog = byId("wo-card-log");
    expect(cardLog.description).toContain("## Remediation");
    expect(cardLog.description).toContain("CWE-532");
    expect(cardLog.description).toContain("```diff");
    expect(cardLog.description).toContain(
      '-\tlog.Printf("charging card %s for %d", card, amount)',
    );

    // The secret found by code: placed, remediated, and never written out.
    const secret = byId("wo-secret");
    expect(secret.label_titles).toContain("billing");
    expect(secret.description).toContain("CWE-798");
    expect(secret.description).not.toContain("b1ll1ng-gateway-2026");

    // A thing the design must still decide is a requirements work order.
    const decide = byId("wo-decide");
    expect(decide.type).toBe("requirements");
    expect(decide.priority).toBe("medium");
    expect(decide.label_titles.sort()).toEqual(["billing", "windtunnel"]);
  });
});

describe("sending a run's work orders", () => {
  it("sends each once, to the linked project, and records it", async () => {
    const project = await linkedProject();
    const run = await finishedRun(project.id, RUN_A);
    const factory = standIn();

    expect(await deliverRun(run, { open: factory.open })).toEqual({
      sent: run.workOrders.length,
      failed: 0,
    });
    expect(factory.projectIds).toEqual(["sf-project-1"]);
    expect(factory.made.map((item) => item.title)).toEqual(
      run.workOrders.map((item) => item.title),
    );
    expect(new Set(factory.labels)).toEqual(
      new Set(["windtunnel", "orders", "billing"]),
    );

    // A second attempt, as after a restart, sends nothing more.
    expect(await deliverRun(run, { open: factory.open })).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(factory.made).toHaveLength(run.workOrders.length);
    const saved = await listDeliveries(run.id, SOFTWARE_FACTORY);
    expect(saved.every((item) => item.status === "sent")).toBe(true);
    expect(saved.map((item) => item.externalId).sort()).toContain("WO-1");
  });

  it("records a failure, and sends only that one again", async () => {
    const project = await linkedProject();
    const run = await finishedRun(project.id, RUN_A);

    const first = standIn(["safe to repeat"]);
    expect(await deliverRun(run, { open: first.open })).toEqual({
      sent: run.workOrders.length - 1,
      failed: 1,
    });
    const failed = (await listDeliveries(run.id, SOFTWARE_FACTORY)).filter(
      (item) => item.status === "failed",
    );
    expect(failed).toEqual([
      expect.objectContaining({
        workOrderId: "wo-charge-once",
        error: "Software Factory said no.",
      }),
    ]);

    const second = standIn();
    expect(await deliverRun(run, { open: second.open })).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(second.made.map((item) => item.title)).toEqual([
      "Make a charge safe to fail and safe to repeat",
    ]);
  });

  it("fails everything when the connection itself fails, and can try again", async () => {
    const project = await linkedProject();
    const run = await finishedRun(project.id, RUN_A);
    const down: OpenOutbox = async () => {
      throw new Error("Could not reach Software Factory.");
    };
    expect(await deliverRun(run, { open: down })).toEqual({
      sent: 0,
      failed: run.workOrders.length,
    });
    const factory = standIn();
    expect(await deliverRun(run, { open: factory.open })).toMatchObject({
      sent: run.workOrders.length,
    });
  });

  it("sends nothing without a link, without a connection, or for a sample run that is switched off", async () => {
    const factory = standIn();
    const loose = await createProject({ name: "No link", description: "" });
    await setConnection(SOFTWARE_FACTORY, { status: "connected" });
    const a = await finishedRun(loose.id, RUN_A);
    expect(await deliverRun(a, { open: factory.open })).toEqual({
      skipped: "The project is not linked to 8090.",
    });

    await setProjectLink(loose.id, SOFTWARE_FACTORY, "sf-project-1");
    expect(await deliverRun(a, { open: factory.open })).toEqual({
      skipped: "Sample runs are not sent.",
    });
    // A person who asks for it gets it.
    expect(
      await deliverRun(a, { open: factory.open, manual: true }),
    ).toMatchObject({ sent: a.workOrders.length });

    await setConnection(SOFTWARE_FACTORY, { status: "expired" });
    const b = await finishedRun(loose.id, RUN_B, false);
    expect(await deliverRun(b, { open: factory.open })).toEqual({
      skipped: "8090 is not connected.",
    });
    expect(factory.made).toHaveLength(a.workOrders.length);
  });

  it("lets a send that a restart cut off be tried again", async () => {
    const project = await linkedProject();
    const run = await finishedRun(project.id, RUN_A);
    const hang: OpenOutbox = () => new Promise(() => {});
    void deliverRun(run, { open: hang });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(
      (await listDeliveries(run.id, SOFTWARE_FACTORY)).every(
        (item) => item.status === "sending",
      ),
    ).toBe(true);

    await failStuckDeliveries();
    const factory = standIn();
    expect(await deliverRun(run, { open: factory.open })).toMatchObject({
      sent: run.workOrders.length,
    });
  });
});

describe("a connection's secrets", () => {
  it("are never part of what the screens are given", async () => {
    await patchSecrets(SOFTWARE_FACTORY, {
      tokens: { access_token: "secret-token", token_type: "Bearer" },
    });
    await setConnection(SOFTWARE_FACTORY, { status: "connected" });
    const shown = JSON.stringify(await getConnection(SOFTWARE_FACTORY));
    expect(shown).not.toContain("secret-token");
    expect(shown).not.toContain("tokens");
  });
});
