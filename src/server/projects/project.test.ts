import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  componentOf,
  normalizeArchitecture,
  workspaceOf,
} from "../engine/architecture";
import { ToolFailure } from "../engine/llm";
import { surveyWorkspaces } from "../engine/repo/survey";
import { RepoReader } from "../engine/repo/tools";
import { executeRun, newRun } from "../engine/run";
import { ScriptedLlm } from "../engine/sample";
import {
  SAMPLE_SERVICES,
  sampleProjectScript,
  sampleRepoUrl,
  sampleServiceOf,
  type SampleService,
} from "../engine/sample-project";
import type { StoredEvent } from "../engine/schema";
import { MemoryRunStore } from "../engine/store";
import { runToMarkdown } from "../engine/export";
import { buildCockpit } from "./cockpit";

const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../samples/storefront",
);
const ALL = [...SAMPLE_SERVICES];

/** Runs a scripted project over these sample folders, named as given. */
async function projectRun(
  services: SampleService[],
  nameOf: (service: SampleService) => string = (service) => service,
) {
  process.env.WINDTUNNEL_REPOS_DIR = SAMPLES;
  const workspaces = services.map((service) => ({
    name: nameOf(service),
    origin: { kind: "local" as const, name: service },
  }));
  const run = newRun(
    "run-project",
    {
      requirement: "",
      documents: [],
      project: { id: "project-1", name: "Storefront", workspaces, demo: true },
    },
    { reasoning: "reasoning-model", agents: "agent-model" },
    new Date("2026-11-13T10:00:00Z"),
    true,
  );
  const llm = new ScriptedLlm(
    sampleProjectScript(
      workspaces.map((item) => ({
        name: item.name,
        service: sampleServiceOf(item.origin),
      })),
    ),
  );
  const events: StoredEvent[] = [];
  const done = await executeRun(
    {
      llm,
      store: new MemoryRunStore(),
      publish: (_id, event) => events.push(event),
      now: () => new Date("2026-11-13T10:00:05Z"),
    },
    run,
  );
  return { run: done, llm, events };
}

describe("several workspaces in one run", () => {
  const roots = Object.fromEntries(
    ALL.map((name) => [name, path.join(SAMPLES, name)]),
  );
  const survey = () =>
    surveyWorkspaces(ALL.map((name) => ({ name, root: roots[name] })));

  it("puts the workspace name in front of every path", async () => {
    const paths = (await survey()).files.map((file) => file.path);
    expect(paths).toContain("orders/orders.py");
    expect(paths).toContain("web/src/checkout.ts");
    expect(
      paths.every((file) => ALL.some((name) => file.startsWith(`${name}/`))),
    ).toBe(true);
  });

  it("reads a file through its workspace and nothing through another", async () => {
    const reader = new RepoReader(roots, await survey());
    expect(await reader.readFile("orders/orders.py", 1)).toContain("find_all");
    for (const bad of [
      "web/../../orders/orders.py",
      "orders.py",
      "nowhere/orders.py",
    ]) {
      await expect(reader.readFile(bad, 1)).rejects.toThrow(ToolFailure);
    }
  });
});

describe("the architecture", () => {
  const component = (
    id: string,
    paths: string[],
    workspace: string | null,
  ) => ({
    id,
    name: id,
    kind: "service" as const,
    workspace,
    paths,
    description: "",
  });

  it("drops connections that join nothing, repeats and unknown workspaces", () => {
    const { architecture, warnings } = normalizeArchitecture(
      {
        components: [
          component("cmp-a", ["./api/"], "api"),
          component("cmp-b", [], "ghost"),
          component("cmp-a", [], null),
        ],
        connections: [
          { from: "cmp-a", to: "cmp-b", label: "REST" },
          { from: "cmp-a", to: "cmp-b", label: "REST" },
          { from: "cmp-a", to: "cmp-missing", label: "SQL" },
          { from: "cmp-a", to: "cmp-a", label: "self" },
        ],
      },
      ["api"],
    );
    expect(architecture.components.map((item) => item.id)).toEqual([
      "cmp-a",
      "cmp-b",
    ]);
    expect(architecture.components[0].paths).toEqual(["api"]);
    expect(architecture.components[1].workspace).toBeNull();
    expect(architecture.connections).toEqual([
      { from: "cmp-a", to: "cmp-b", label: "REST" },
    ]);
    expect(warnings).toHaveLength(3);
  });

  it("finds the closest component and the workspace of a file", () => {
    const architecture = {
      components: [
        component("cmp-api", ["api"], "api"),
        component("cmp-auth", ["api/auth.py"], "api"),
      ],
      connections: [],
    };
    expect(componentOf("api/auth.py", architecture)).toBe("cmp-auth");
    expect(componentOf("api/orders.py", architecture)).toBe("cmp-api");
    expect(componentOf("apiary/x.py", architecture)).toBeNull();
    expect(workspaceOf("api/orders.py", ["api", "web"])).toBe("api");
    expect(workspaceOf("orders.py", ["api", "web"])).toBeNull();
  });
});

describe("the sample services", () => {
  it("knows a service by its repository, however the workspace is named", () => {
    expect(
      sampleServiceOf({ kind: "github", url: sampleRepoUrl("orders") }),
    ).toBe("orders");
    expect(
      sampleServiceOf({
        kind: "github",
        url: "https://github.com/rvren/storefront-web.git",
      }),
    ).toBe("web");
    expect(sampleServiceOf({ kind: "local", name: "billing" })).toBe("billing");
    expect(
      sampleServiceOf({ kind: "github", url: "https://github.com/acme/shop" }),
    ).toBeNull();
  });

  // Every scripted finding must pass the engine's own file-and-line check,
  // whichever workspaces the run holds.
  it.each([
    [["orders"]],
    [["web", "gateway"]],
    [["gateway", "auth"]],
    [["orders", "billing"]],
    [ALL],
  ] as [SampleService[]][])(
    "files every finding against real lines: %j",
    async (services) => {
      const { run, llm } = await projectRun(services);
      expect(run.error).toBeNull();
      expect(run.status).toBe("completed");
      expect(run.modelWarnings, JSON.stringify(run.modelWarnings)).toEqual([]);
      const refused = llm.toolResults.filter((result) => result.failed);
      expect(refused).toEqual([]);
      expect(run.groups.every((group) => group.reviewed)).toBe(true);
      expect(run.unaddressedGroupIds).toEqual([]);
      // Every security finding has a remediation, and every scripted edit
      // matched the real file it changes.
      const security = run.groups.filter(
        (group) => group.type === "security_vulnerability",
      );
      expect(security.length).toBeGreaterThan(0);
      for (const group of security) {
        const record = run.remediations?.[group.id];
        expect(record?.status, group.id).toBe("made");
        expect(record?.dropped, group.id).toEqual([]);
        expect(record?.cwe?.fallback, group.id).toBe(false);
      }
    },
  );
});

describe("the cockpit", () => {
  it("counts the whole application by workspace", async () => {
    const { run, events } = await projectRun(ALL);
    expect(run.title).toBe("Storefront");
    expect(run.projectId).toBe("project-1");
    expect(run.sample).toBe(true);
    expect(run.workspaces).toEqual(ALL);

    // The export carries the remediations; the secret's value never.
    const markdown = runToMarkdown(run);
    expect(markdown).toContain("**Remediation**");
    expect(markdown).toContain("```diff");
    expect(JSON.stringify(run)).not.toContain("b1ll1ng-gateway-2026");
    expect(markdown).not.toContain("b1ll1ng-gateway-2026");

    const cockpit = buildCockpit(run);
    expect(cockpit.groupedBy).toBe("workspace");
    expect(cockpit.privacy?.secrets).toEqual([
      expect.objectContaining({
        path: "billing/charge.go",
        line: 17,
        workspace: "billing",
      }),
    ]);
    expect(
      cockpit.privacy?.categories.find((item) => item.category === "financial")
        ?.sinks.log,
    ).toBeGreaterThan(0);
    expect(
      cockpit.issues.find((issue) => issue.id === "secret-1"),
    ).toMatchObject({ workspace: "billing", foundByCode: true });
    // 22 found by the agents, and the secret in billing found by code.
    expect(cockpit.totals.issues).toBe(23);
    expect(cockpit.totals.workOrders).toBe(15);
    expect(cockpit.totals.bySeverity).toEqual({
      critical: 7,
      high: 7,
      medium: 8,
      low: 1,
    });

    // Each column of the chart, and the bands into and out of the middle
    // one, add up to the number of issues.
    for (const column of [0, 1, 2]) {
      const nodes = cockpit.sankey.nodes.filter(
        (node) => node.column === column,
      );
      expect(nodes.reduce((sum, node) => sum + node.value, 0)).toBe(23);
    }
    const sum = (links: { value: number }[]) =>
      links.reduce((total, link) => total + link.value, 0);
    expect(
      sum(
        cockpit.sankey.links.filter((link) => link.target.startsWith("type:")),
      ),
    ).toBe(23);
    expect(
      sum(
        cockpit.sankey.links.filter((link) => link.source.startsWith("type:")),
      ),
    ).toBe(23);
    expect(
      cockpit.sankey.nodes
        .filter((node) => node.column === 0)
        .map((node) => node.label),
    ).toEqual(ALL);

    // A group of two agents' findings on the same line.
    expect(
      cockpit.issues.find((issue) => issue.id === "g-ord-list"),
    ).toMatchObject({
      workspace: "orders",
      component: "cmp-orders",
      path: "orders/orders.py",
      startLine: 15,
      agents: ["adversarial_user", "scale"],
    });
    // Seven services and the seven things they call that have no code.
    expect(cockpit.components).toHaveLength(14);
    expect(
      cockpit.components.find((item) => item.id === "cmp-orders"),
    ).toMatchObject({
      workspace: "orders",
      issues: 5,
      worst: "critical",
    });
    expect(
      cockpit.components.find((item) => item.id === "cmp-queue"),
    ).toMatchObject({
      issues: 0,
      worst: null,
    });
    expect(cockpit.connections).toHaveLength(13);

    // The live view is told about each workspace and the architecture.
    const types = events.map((item) => item.event.type);
    expect(types.filter((type) => type === "workspace.ready")).toHaveLength(7);
    expect(types.filter((type) => type === "architecture.ready")).toHaveLength(
      1,
    );
    expect(types.indexOf("architecture.ready")).toBeGreaterThan(
      types.lastIndexOf("workspace.ready"),
    );
  });

  it("needs both services to see a flaw between them", async () => {
    const alone = buildCockpit((await projectRun(["orders"])).run);
    expect(alone.issues.some((issue) => issue.id === "g-double-charge")).toBe(
      false,
    );
    const both = buildCockpit((await projectRun(["orders", "billing"])).run);
    expect(both.issues.some((issue) => issue.id === "g-double-charge")).toBe(
      true,
    );
    // A service outside the run is an outside system.
    expect(
      alone.components.find((item) => item.id === "cmp-billing")?.kind,
    ).toBe("external");
    expect(
      both.components.find((item) => item.id === "cmp-billing")?.kind,
    ).toBe("service");
  });

  it("follows the names given to the workspaces", async () => {
    const { run } = await projectRun(
      ["web", "orders"],
      (service) => `${service}-app`,
    );
    expect(run.workspaces).toEqual(["web-app", "orders-app"]);
    const cockpit = buildCockpit(run);
    expect(
      cockpit.issues.find((issue) => issue.id === "g-ord-price"),
    ).toMatchObject({
      workspace: "orders-app",
      path: "orders-app/orders.py",
    });
  });

  it("counts a project of one workspace by component", async () => {
    const { run, events } = await projectRun(["orders"]);
    expect(run.source?.workspaces).toBeUndefined();
    expect(run.workspaces).toEqual(["orders"]);

    const cockpit = buildCockpit(run);
    expect(cockpit.groupedBy).toBe("component");
    expect(cockpit.workspaces).toEqual([]);
    expect(cockpit.totals.issues).toBe(4);
    expect(
      cockpit.sankey.nodes
        .filter((node) => node.column === 0)
        .map((node) => [node.label, node.value]),
    ).toEqual([["Checkout", 4]]);
    expect(cockpit.issues[0].path).toBe("orders.py");
    expect(
      events.filter((item) => item.event.type === "workspace.ready"),
    ).toHaveLength(1);
  });
});
