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
import { sampleProjectScript } from "../engine/sample-project";
import { MemoryRunStore } from "../engine/store";
import { buildCockpit } from "./cockpit";

const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../samples/storefront",
);
const ALL = ["web", "api", "billing"];

async function projectRun(names: string[]) {
  process.env.WINDTUNNEL_REPOS_DIR = SAMPLES;
  const run = newRun(
    "run-project",
    {
      requirement: "",
      documents: [],
      project: {
        id: "project-1",
        name: "Storefront",
        workspaces: names.map((name) => ({
          name,
          origin: { kind: "local" as const, name },
        })),
      },
    },
    { reasoning: "reasoning-model", agents: "agent-model" },
    new Date("2026-11-13T10:00:00Z"),
    true,
  );
  return executeRun(
    {
      llm: new ScriptedLlm(sampleProjectScript(names)),
      store: new MemoryRunStore(),
      publish: () => {},
      now: () => new Date("2026-11-13T10:00:05Z"),
    },
    run,
  );
}

describe("several workspaces in one run", () => {
  const roots = Object.fromEntries(
    ALL.map((name) => [name, path.join(SAMPLES, name)]),
  );

  it("puts the workspace name in front of every path", async () => {
    const survey = await surveyWorkspaces(
      ALL.map((name) => ({ name, root: roots[name] })),
    );
    expect(survey.files.map((file) => file.path).sort()).toEqual([
      "api/auth.py",
      "api/orders.py",
      "billing/charge.go",
      "web/src/checkout.ts",
      "web/src/config.ts",
      "web/src/session.ts",
    ]);
  });

  it("reads a file through its workspace and nothing through another", async () => {
    const survey = await surveyWorkspaces(
      ALL.map((name) => ({ name, root: roots[name] })),
    );
    const reader = new RepoReader(roots, survey);
    expect(await reader.readFile("api/orders.py", 1)).toContain("find_all");
    await expect(reader.readFile("web/../../api/orders.py", 1)).rejects.toThrow(
      ToolFailure,
    );
    await expect(reader.readFile("orders.py", 1)).rejects.toThrow(ToolFailure);
    await expect(reader.readFile("nowhere/orders.py", 1)).rejects.toThrow(
      ToolFailure,
    );
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

describe("the cockpit", () => {
  it("counts a project of three workspaces by workspace", async () => {
    const run = await projectRun(ALL);
    expect(run.error).toBeNull();
    expect(run.status).toBe("completed");
    expect(run.title).toBe("Storefront");
    expect(run.projectId).toBe("project-1");
    expect(run.source?.workspaces?.map((item) => item.name)).toEqual(ALL);

    const cockpit = buildCockpit(run);
    expect(cockpit.groupedBy).toBe("workspace");
    expect(cockpit.totals.issues).toBe(8);
    expect(cockpit.totals.workOrders).toBe(5);
    expect(cockpit.totals.bySeverity).toEqual({
      critical: 2,
      high: 4,
      medium: 2,
      low: 0,
    });

    // Each column of the chart, and the bands into and out of the middle
    // one, add up to the number of issues.
    for (const column of [0, 1, 2]) {
      const nodes = cockpit.sankey.nodes.filter(
        (node) => node.column === column,
      );
      expect(nodes.reduce((sum, node) => sum + node.value, 0)).toBe(8);
    }
    const into = cockpit.sankey.links.filter((link) =>
      link.target.startsWith("type:"),
    );
    const out = cockpit.sankey.links.filter((link) =>
      link.source.startsWith("type:"),
    );
    expect(into.reduce((sum, link) => sum + link.value, 0)).toBe(8);
    expect(out.reduce((sum, link) => sum + link.value, 0)).toBe(8);
    expect(
      cockpit.sankey.nodes
        .filter((node) => node.column === 0)
        .map((node) => [node.label, node.value]),
    ).toEqual([
      ["web", 2],
      ["api", 4],
      ["billing", 2],
    ]);

    // A group of two agents' findings on the same line.
    const orders = cockpit.issues.find((issue) => issue.id === "g-orders");
    expect(orders).toMatchObject({
      workspace: "api",
      component: "cmp-orders",
      path: "api/orders.py",
      startLine: 13,
      agents: ["adversarial_user", "scale"],
    });
    expect(
      cockpit.components.find((item) => item.id === "cmp-orders"),
    ).toMatchObject({ issues: 3, worst: "critical" });
    expect(
      cockpit.components.find((item) => item.id === "cmp-db"),
    ).toMatchObject({
      issues: 0,
      worst: null,
    });
    expect(cockpit.connections).toHaveLength(6);
  });

  it("counts a project of one workspace by component", async () => {
    const run = await projectRun(["api"]);
    expect(run.error).toBeNull();
    expect(run.source?.workspaces).toBeUndefined();

    const cockpit = buildCockpit(run);
    expect(cockpit.groupedBy).toBe("component");
    expect(cockpit.workspaces).toEqual([]);
    expect(cockpit.totals.issues).toBe(4);
    expect(
      cockpit.sankey.nodes
        .filter((node) => node.column === 0)
        .map((node) => [node.label, node.value]),
    ).toEqual([
      ["Orders service", 3],
      ["Sign-in", 1],
    ]);
    expect(cockpit.issues[0].path).toBe("orders.py");
    // Code that is not part of the run is an outside system.
    expect(cockpit.components.find((item) => item.id === "cmp-web")?.kind).toBe(
      "external",
    );
  });
});
