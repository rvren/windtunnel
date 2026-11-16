import path from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { costOf, formatCost, usageCost } from "@/lib/cost";

import { executeRun, newRun, type RunInput } from "../run";
import { SAMPLE_SCRIPT, ScriptedLlm, type Script } from "../sample";
import { sampleTriage } from "../sample-kinds";
import {
  SAMPLE_SERVICES,
  sampleProjectScript,
  sampleServiceOf,
} from "../sample-project";
import type { Architecture, RunRecord, StoredEvent } from "../schema";
import { MemoryRunStore } from "../store";
import { checkSuspects, incidentGroup } from "./blackbox";
import { changedFiles, CHANGE_LIMITS } from "./crosswind";
import { checkCritiques, checkVerdict } from "./flyoff";
import { diffArchitectures, touchedParts } from "./impact";

const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../../samples/storefront",
);
const MODELS = { reasoning: "claude-opus-5-5", agents: "claude-sonnet-5-5" };

const workspaces = SAMPLE_SERVICES.map((name) => ({
  name,
  origin: { kind: "local" as const, name },
}));

async function play(input: RunInput, script: Script) {
  const store = new MemoryRunStore();
  const run = newRun(
    "run-1",
    input,
    MODELS,
    new Date("2026-11-16T10:00:00Z"),
    true,
  );
  const done = await executeRun(
    {
      llm: new ScriptedLlm(script),
      store,
      publish: () => undefined,
      now: () => new Date("2026-11-16T10:00:05Z"),
    },
    run,
  );
  const events = await store.events("run-1");
  const stages = events
    .map((item: StoredEvent) => item.event)
    .filter((event) => event.type === "stage.started")
    .map((event) => (event as { stage: string }).stage);
  return { done, stages };
}

const projectScript = () =>
  sampleProjectScript(
    workspaces.map((item) => ({
      name: item.name,
      service: sampleServiceOf(item.origin),
    })),
  );

beforeAll(() => {
  process.env.WINDTUNNEL_REPOS_DIR = SAMPLES;
});

describe("a Crosswind run, scripted", () => {
  it("traces a change in words through the audit's stages and maps it", async () => {
    const { done, stages } = await play(
      {
        requirement: "",
        documents: [],
        kind: "crosswind",
        change: { kind: "text", text: "Move sessions from cookies to Redis." },
        project: {
          id: "project-1",
          name: "Storefront",
          workspaces,
          demo: true,
        },
      },
      projectScript(),
    );
    expect(done.status).toBe("completed");
    expect(stages).toEqual([
      "change",
      "survey",
      "model",
      "coverage",
      "agents",
      "challenge",
      "judge",
      "impact",
      "work_orders",
    ]);
    expect(done.title).toBe("Crosswind: Move sessions from cookies to Redis.");
    expect(done.impact?.summary).toBeTruthy();
    expect(done.impact?.review).toBeTruthy();
    // The agents' findings land in parts of the application: each part a
    // break cites is marked.
    expect(done.impact?.components.length).toBeGreaterThan(3);
    // A Crosswind run writes no fixes.
    expect(done.remediations).toBeUndefined();
    expect(done.costUsd).toBe(0);
  });
});

describe("a fly-off, scripted", () => {
  it("has three designers propose, critique each other, and a judge pick one", async () => {
    const { done, stages } = await play(
      {
        requirement:
          "Build a multi-tenant dashboard where organization admins can invite users and manage permissions.",
        documents: [],
        kind: "flyoff",
        projectRef: { id: "project-1", demo: true },
      },
      SAMPLE_SCRIPT,
    );
    expect(done.status).toBe("completed");
    expect(stages).toEqual(["model", "proposals", "critique", "judge"]);
    expect(done.flyoff?.blueprints.map((item) => item.status)).toEqual([
      "done",
      "done",
      "done",
    ]);
    // Each designer's critique of their own blueprint is dropped.
    expect(done.flyoff?.critiques).toHaveLength(6);
    expect(
      done.flyoff?.critiques.every((item) => item.from !== item.blueprintId),
    ).toBe(true);
    expect(done.flyoff?.verdict?.winnerId).toBe("p1");
    expect(done.title.startsWith("Fly-off: ")).toBe(true);
  });
});

describe("a black box run, scripted", () => {
  it("traces the feedback to lines that exist and makes them the one finding", async () => {
    const script = projectScript();
    const { done, stages } = await play(
      {
        requirement: "",
        documents: [],
        kind: "blackbox",
        incident: "500 on search with a quote in the term.",
        project: {
          id: "project-1",
          name: "Storefront",
          workspaces,
          demo: true,
        },
      },
      { ...script, kinds: { triage: sampleTriage("catalog/search.py") } },
    );
    expect(done.status).toBe("completed");
    expect(stages).toEqual(["survey", "triage", "remediation"]);
    expect(done.triage?.suspects[0]).toMatchObject({
      path: "catalog/search.py",
      startLine: 4,
    });
    expect(done.triage?.suspects[0].quote).toContain("SELECT");
    expect(done.groups).toHaveLength(1);
    expect(done.groups[0].location?.path).toBe("catalog/search.py");
    // A remediation was attempted for the defect, whatever its kind.
    expect(Object.keys(done.remediations ?? {})).toEqual(["incident-1"]);
  });

  it("keeps only suspects whose lines exist", async () => {
    const reader = {
      slice: async (file: string, start: number, end: number) => {
        if (file !== "a.ts") throw new Error("no such file");
        return {
          path: file,
          startLine: start,
          endLine: end,
          totalLines: 9,
          text: "x",
        };
      },
    };
    const triage = await checkSuspects(
      {
        ...sampleTriage("a.ts"),
        suspects: [
          { path: "a.ts", startLine: 2, endLine: 3, why: "real" },
          { path: "ghost.ts", startLine: 1, endLine: 1, why: "made up" },
        ],
      },
      reader,
    );
    expect(triage.suspects.map((item) => item.path)).toEqual(["a.ts"]);
    expect(incidentGroup({ ...triage, suspects: [] })).toBeNull();
  });
});

describe("Crosswind's map, worked out in code", () => {
  const before: Architecture = {
    components: [
      {
        id: "gw",
        name: "Gateway",
        kind: "service",
        workspace: "gateway",
        paths: ["gateway"],
        description: "",
      },
      {
        id: "auth",
        name: "Auth",
        kind: "service",
        workspace: "auth",
        paths: ["auth"],
        description: "",
      },
    ],
    connections: [{ from: "gw", to: "auth", label: "calls" }],
  };
  const after: Architecture = {
    components: [
      {
        id: "g",
        name: "gateway",
        kind: "service",
        workspace: "gateway",
        paths: ["gateway"],
        description: "",
      },
      {
        id: "redis",
        name: "Redis",
        kind: "database",
        workspace: null,
        paths: [],
        description: "",
      },
    ],
    connections: [{ from: "g", to: "redis", label: "sessions" }],
  };

  it("finds added and removed parts and connections by name", () => {
    const diff = diffArchitectures(before, after);
    expect(diff.added).toEqual(["redis"]);
    expect(diff.removed.map((item) => item.name)).toEqual(["Auth"]);
    expect(diff.connections).toEqual([
      { from: "gateway", to: "Redis", label: "sessions", effect: "added" },
      { from: "Gateway", to: "Auth", label: "calls", effect: "removed" },
    ]);
    expect(diffArchitectures(null, after).added).toEqual([]);
  });

  it("marks parts a changed file or a finding lands in", () => {
    const parts = touchedParts(
      [
        {
          path: "gateway/main.go",
          status: "modified",
          additions: 3,
          deletions: 1,
          patch: null,
          previousPath: null,
        },
      ],
      [],
      before,
      after,
    );
    expect(parts).toEqual([
      {
        id: "redis",
        name: "Redis",
        effect: "added",
        note: "New in this change",
      },
      { id: "g", name: "gateway", effect: "changed", note: "gateway/main.go" },
      {
        id: "auth",
        name: "Auth",
        effect: "removed",
        note: "Gone after this change",
      },
    ]);
  });

  it("cuts a huge change to its limits and says so", () => {
    const many = Array.from(
      { length: CHANGE_LIMITS.files + 5 },
      (_, index) => ({
        filename: `f${index}.ts`,
        status: "modified",
        additions: 1,
        deletions: 0,
        patch: "x".repeat(CHANGE_LIMITS.patchChars + 10),
      }),
    );
    const cut = changedFiles(many, "web/");
    expect(cut.files).toHaveLength(CHANGE_LIMITS.files);
    expect(cut.truncated).toBe(true);
    expect(cut.files[0].path).toBe("web/f0.ts");
    const kept = cut.files.filter((file) => file.patch);
    expect(
      kept.reduce((sum, file) => sum + file.patch!.length, 0),
    ).toBeLessThanOrEqual(CHANGE_LIMITS.totalChars);
  });
});

describe("the fly-off's checks", () => {
  it("drops a critique of one's own or an unknown blueprint", () => {
    const kept = checkCritiques(
      "p1",
      {
        critiques: [
          { blueprintId: "p1", strengths: [], weaknesses: [] },
          { blueprintId: "p2", strengths: ["a"], weaknesses: [] },
          { blueprintId: "p2", strengths: ["again"], weaknesses: [] },
          { blueprintId: "p9", strengths: [], weaknesses: [] },
        ],
      },
      new Set(["p1", "p2", "p3"]),
    );
    expect(kept.map((item) => item.blueprintId)).toEqual(["p2"]);
  });

  it("holds the winner and the ranking to real blueprints", () => {
    const verdict = checkVerdict(
      {
        winnerId: "p9",
        summary: "",
        ranking: [
          { blueprintId: "p3", rank: 2, reason: "" },
          { blueprintId: "p9", rank: 1, reason: "" },
          { blueprintId: "p2", rank: 1, reason: "" },
        ],
        nextSteps: [],
      },
      ["p1", "p2", "p3"],
    );
    expect(verdict.winnerId).toBe("p2");
    expect(
      verdict.ranking.map((item) => [item.blueprintId, item.rank]),
    ).toEqual([
      ["p2", 1],
      ["p3", 2],
    ]);
  });
});

describe("what a run cost", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prices each stage on its model, with cache reads and writes", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 100_000,
    };
    // Opus: 4 + 2 (output) + 0.2 (reads) + 0.5 (writes at 1.25x).
    expect(usageCost(usage, "claude-opus-5-5")).toBeCloseTo(6.7);
    expect(usageCost(usage, "claude-opus-5-5-20261101")).toBeCloseTo(6.7);
    expect(usageCost(usage, "unknown-model")).toBeNull();
    const run = {
      sample: false,
      models: MODELS,
      usage: { judge: usage, agents: usage },
    } as unknown as RunRecord;
    // Sonnet for the agents: 2 + 1 + 0.1 + 0.25.
    expect(costOf(run)).toBeCloseTo(6.7 + 3.35);
    expect(costOf({ ...run, sample: true })).toBe(0);
    expect(formatCost(1.8379)).toBe("$1.84");
    expect(formatCost(0.004)).toBe("under $0.01");
    expect(formatCost(null)).toBe("—");
  });
});

describe("reading a pull request (GitHub mocked)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  const project = (head: string) => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (value: unknown) =>
          new Response(JSON.stringify(value), { status: 200 });
        if (url.endsWith("/pulls/7"))
          return json({
            title: "Cache sessions in Redis",
            html_url: "https://github.com/me/web/pull/7",
            base: { ref: "main" },
            head: { ref: "redis", repo: { full_name: head } },
          });
        if (url.includes("/pulls/7/files"))
          return json([
            {
              filename: "src/session.ts",
              status: "modified",
              additions: 4,
              deletions: 2,
              patch: "@@ -1 +1 @@\n-a\n+b",
            },
          ]);
        return new Response("{}", { status: 404 });
      }),
    );
    return newRun(
      "run-pr",
      {
        requirement: "",
        documents: [],
        kind: "crosswind",
        change: { kind: "pr", workspace: "web", number: 7 },
        project: {
          id: "project-1",
          name: "Shop",
          workspaces: [
            {
              name: "web",
              origin: {
                kind: "github",
                url: "https://github.com/me/web",
                branch: null,
              },
            },
            {
              name: "api",
              origin: {
                kind: "github",
                url: "https://github.com/me/api",
                branch: null,
              },
            },
          ],
        },
      },
      MODELS,
      new Date(),
      false,
    );
  };

  const ctx = (run: RunRecord) => ({
    run,
    plural: (count: number, one: string) =>
      `${count} ${one}${count === 1 ? "" : "s"}`,
  });

  it("reads the files and points the survey at the head branch", async () => {
    const { readChange } = await import("./crosswind");
    const run = project("me/web");
    const summary = await readChange(ctx(run) as never);
    expect(summary).toBe("1 file changed, +4 -2");
    expect(run.change).toMatchObject({
      title: "Cache sessions in Redis",
      url: "https://github.com/me/web/pull/7",
      base: "main",
      head: "redis",
    });
    // In a project, paths carry the workspace name.
    expect(run.change?.files[0].path).toBe("web/src/session.ts");
    const web = run.source?.workspaces?.find((item) => item.name === "web");
    expect(web?.origin).toMatchObject({ branch: "redis" });
    const api = run.source?.workspaces?.find((item) => item.name === "api");
    expect(api?.origin).toMatchObject({ branch: null });
  });

  it("refuses a pull request from a fork", async () => {
    const { readChange } = await import("./crosswind");
    const run = project("someone/web");
    await expect(readChange(ctx(run) as never)).rejects.toThrow(/fork/);
  });
});

describe("starting a run of a newer kind", () => {
  it("checks each kind's input", async () => {
    const { parseKind } = await import("./input");
    const code = ["web", "api"];
    expect(parseKind({}, null)).toEqual({ ok: true, kind: "audit" });
    expect(parseKind({ kind: "nope" }, null).ok).toBe(false);
    expect(parseKind({ kind: "flyoff" }, null)).toEqual({
      ok: true,
      kind: "flyoff",
    });
    expect(parseKind({ kind: "flyoff" }, code).ok).toBe(false);
    expect(
      parseKind(
        { kind: "crosswind", change: { kind: "text", text: "x" } },
        null,
      ).ok,
    ).toBe(false);
    expect(
      parseKind(
        {
          kind: "crosswind",
          change: { kind: "pr", workspace: "web", number: 12 },
        },
        code,
      ),
    ).toEqual({
      ok: true,
      kind: "crosswind",
      change: { kind: "pr", workspace: "web", number: 12 },
    });
    expect(
      parseKind(
        {
          kind: "crosswind",
          change: { kind: "pr", workspace: "db", number: 1 },
        },
        code,
      ).ok,
    ).toBe(false);
    expect(
      parseKind(
        {
          kind: "crosswind",
          change: { kind: "pr", workspace: "web", number: 0 },
        },
        code,
      ).ok,
    ).toBe(false);
    expect(
      parseKind(
        {
          kind: "crosswind",
          change: {
            kind: "branches",
            workspace: "api",
            base: "main",
            head: "main",
          },
        },
        code,
      ).ok,
    ).toBe(false);
    expect(
      parseKind(
        {
          kind: "crosswind",
          change: { kind: "text", text: "  Move sessions to Redis  " },
        },
        code,
      ),
    ).toEqual({
      ok: true,
      kind: "crosswind",
      change: { kind: "text", text: "Move sessions to Redis" },
    });
    expect(parseKind({ kind: "blackbox", incident: "" }, code).ok).toBe(false);
    expect(
      parseKind({ kind: "blackbox", incident: "500 on search" }, code),
    ).toEqual({
      ok: true,
      kind: "blackbox",
      incident: "500 on search",
    });
  });
});
