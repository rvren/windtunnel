import { describe, expect, it } from "vitest";

import { applyEvent, emptyFeed, type Feed } from "@/lib/run-feed";
import type {
  Architecture,
  CodeLocation,
  RunEvent,
  RunRecord,
} from "@/server/engine/schema";

import { TUNNEL_3D } from "./tunnel";
import { PLATE_MAX, partPositions, partsOf, tunnelScene } from "./tunnel-scene";

const MAP: Architecture = {
  components: [
    {
      id: "cmp-web",
      name: "Web",
      kind: "frontend",
      workspace: "web",
      paths: ["web"],
      description: "",
    },
    {
      id: "cmp-gateway",
      name: "Gateway",
      kind: "service",
      workspace: "gateway",
      paths: ["gateway"],
      description: "",
    },
    {
      id: "cmp-catalog",
      name: "Catalog",
      kind: "service",
      workspace: "catalog",
      paths: ["catalog"],
      description: "",
    },
    {
      id: "cmp-billing",
      name: "Billing",
      kind: "service",
      workspace: "billing",
      paths: ["billing"],
      description: "",
    },
    {
      id: "cmp-db",
      name: "Database",
      kind: "database",
      workspace: null,
      paths: [],
      description: "",
    },
  ],
  connections: [
    { from: "cmp-web", to: "cmp-gateway", label: "calls" },
    { from: "cmp-gateway", to: "cmp-catalog", label: "calls" },
    { from: "cmp-gateway", to: "cmp-billing", label: "calls" },
    { from: "cmp-catalog", to: "cmp-db", label: "reads" },
  ],
};

const at = (path: string, startLine = 1): CodeLocation => ({
  path,
  startLine,
  endLine: startLine + 2,
  quote: "",
});

const run = (over: Partial<RunRecord>): RunRecord =>
  ({
    id: "r1",
    status: "running",
    kind: "audit",
    title: "Storefront",
    requirement: "",
    groups: [],
    agents: [],
    workspaces: ["web", "gateway", "catalog", "billing"],
    source: {
      kind: "repository",
      origin: { kind: "local", name: "storefront" },
      label: "storefront",
      files: 10,
      languages: [],
      architecture: MAP,
    },
    ...over,
  }) as unknown as RunRecord;

const feedOf = (...events: RunEvent[]): Feed =>
  events.reduce(applyEvent, emptyFeed());

describe("partsOf", () => {
  it("puts frontends on the interface, services in the middle, data below", () => {
    expect(partsOf(MAP, []).map((part) => [part.id, part.plate])).toEqual([
      ["cmp-web", "interface"],
      ["cmp-gateway", "services"],
      ["cmp-catalog", "services"],
      ["cmp-billing", "services"],
      ["cmp-db", "data"],
    ]);
  });

  it("falls back to the workspaces, as services, with no map", () => {
    expect(partsOf(null, ["web", "api"])).toEqual([
      { id: "web", name: "web", plate: "services" },
      { id: "api", name: "api", plate: "services" },
    ]);
  });

  it("keeps at most PLATE_MAX parts on a plate", () => {
    const many = Array.from({ length: 12 }, (_, index) => `w${index}`);
    expect(partsOf(null, many)).toHaveLength(PLATE_MAX);
  });
});

describe("partPositions", () => {
  it("sets each tile on its own plate, centred on the model", () => {
    const spots = partPositions(partsOf(MAP, []));
    expect(spots.get("cmp-web")).toEqual([
      TUNNEL_3D.model,
      TUNNEL_3D.plateY.interface + 0.1,
      0,
    ]);
    const services = ["cmp-gateway", "cmp-catalog", "cmp-billing"].map((id) =>
      spots.get(id)!,
    );
    expect(services.map(([, y]) => y)).toEqual([0.1, 0.1, 0.1]);
    expect(services[1][0]).toBeCloseTo(TUNNEL_3D.model);
    expect(services[0][0]).toBeLessThan(services[2][0]);
  });
});

describe("tunnelScene", () => {
  it("pins each finding on the part its file is in, oldest first", () => {
    const feed = feedOf(
      {
        type: "agent.finding",
        agentId: "adversarial_user",
        finding: {
          uid: "f1",
          type: "security_vulnerability",
          severity: "critical",
          title: "SQL in search",
          path: "catalog/search.py",
          startLine: 4,
        },
      },
      {
        type: "agent.finding",
        agentId: "scale",
        finding: {
          uid: "f2",
          type: "architecture_weakness",
          severity: "medium",
          title: "No paging",
          path: "nowhere/x.ts",
          startLine: 1,
        },
      },
    );
    const scene = tunnelScene(run({}), feed);
    expect(scene.pins).toEqual([
      {
        uid: "f1",
        by: "adversarial_user",
        part: "cmp-catalog",
        plate: "services",
        tone: "danger",
        title: "SQL in search",
        severity: "critical",
        at: "catalog/search.py:4",
      },
      {
        uid: "f2",
        by: "scale",
        part: null,
        plate: "services",
        tone: "warning",
        title: "No paging",
        severity: "medium",
        at: "nowhere/x.ts:1",
      },
    ]);
  });

  it("draws Flutter's chains as arcs between the parts of their links", () => {
    const scene = tunnelScene(
      run({
        status: "completed",
        groups: [
          {
            id: "g1",
            title: "Script in the page",
            type: "security_vulnerability",
            severity: "high",
            summary: "",
            findingIds: [],
            reviewed: true,
            location: at("web/page.tsx"),
          },
          {
            id: "g2",
            title: "Gateway trusts the header",
            type: "security_vulnerability",
            severity: "critical",
            summary: "",
            findingIds: [],
            reviewed: true,
            location: at("gateway/auth.ts"),
          },
        ] as unknown as RunRecord["groups"],
        chains: [
          {
            id: "c1",
            title: "Steal a session",
            impact: "",
            severity: "critical",
            links: [
              { groupId: "g1", role: "Runs a script", via: null },
              { groupId: "g2", role: "Uses the token", via: null },
            ],
          },
        ],
      }),
      emptyFeed(),
    );
    expect(scene.arcs).toEqual([
      { id: "c1:g2", from: "cmp-web", to: "cmp-gateway", tone: "danger" },
    ]);
  });

  it("cuts Engine Out's part and lights each hop's part in its tone", () => {
    const scene = tunnelScene(
      run({
        kind: "engineout",
        outage: {
          part: { id: "cmp-billing", name: "Billing" },
          mode: "down",
          mapFrom: null,
          headline: "",
          journeys: [],
          hops: [
            {
              id: "h1",
              from: "cmp-billing",
              to: "cmp-gateway",
              behaviour: "hangs",
              effect: "Waits forever",
              severity: "high",
              depth: 1,
              location: at("gateway/pay.ts"),
              by: "outage",
            },
            {
              id: "h2",
              from: "cmp-gateway",
              to: "cmp-web",
              behaviour: "holds",
              effect: "Shows a message",
              severity: "low",
              depth: 2,
              location: at("web/pay.tsx"),
              by: "journeys",
            },
          ],
        },
      }),
      emptyFeed(),
    );
    expect(scene.cut).toEqual(["cmp-billing"]);
    expect(scene.arcs.map((arc) => [arc.from, arc.to, arc.tone])).toEqual([
      ["cmp-billing", "cmp-gateway", "danger"],
      ["cmp-gateway", "cmp-web", "ok"],
    ]);
    expect(scene.lit).toEqual([
      { part: "cmp-gateway", tone: "danger", strength: 0.9 },
      { part: "cmp-web", tone: "ok", strength: 0.9 },
    ]);
  });

  it("marks Dogfight's target and follows the rounds to the verdict", () => {
    const target = {
      runId: "r0",
      groupId: "g-cat-sqli",
      title: "The search box can run SQL",
      summary: "",
      severity: "critical" as const,
      location: at("catalog/search.py"),
    };
    const round = (n: number, verdict: "through" | "held") => ({
      n,
      defence: { summary: "", edits: [], from: "written" as const },
      attack: { verdict, title: "", how: "", location: null },
    });
    const live = tunnelScene(
      run({
        kind: "dogfight",
        dogfight: {
          target,
          maxRounds: 3,
          rounds: [round(1, "through")],
          held: null,
        },
      }),
      emptyFeed(),
    );
    expect(live.beacon).toEqual({
      part: "cmp-catalog",
      tone: "danger",
      label: "The search box can run SQL",
    });
    expect(live.duel).toEqual({
      rounds: [{ n: 1, verdict: "through" }],
      max: 3,
      held: null,
    });
    const done = tunnelScene(
      run({
        kind: "dogfight",
        dogfight: {
          target,
          maxRounds: 3,
          rounds: [round(1, "through"), round(2, "held")],
          held: true,
        },
      }),
      emptyFeed(),
    );
    expect(done.beacon?.tone).toBe("ok");
    expect(done.duel?.held).toBe(true);
  });

  it("puts Black Box's beacon on the route's last part, green once fixed", () => {
    const triage = {
      title: "500 on GET /catalog",
      hypothesis: "",
      type: "bug",
      severity: "high",
      confidence: "high",
      affects: "",
      checks: [],
      suspects: [],
      route: [
        { ...at("gateway/routes.ts"), step: "Enters" },
        { ...at("catalog/search.py"), step: "Breaks" },
      ],
    } as unknown as RunRecord["triage"];
    const open = tunnelScene(run({ kind: "blackbox", triage }), emptyFeed());
    expect(open.beacon).toEqual({
      part: "cmp-catalog",
      tone: "danger",
      label: "500 on GET /catalog",
    });
    expect(open.arcs.map((arc) => [arc.from, arc.to])).toEqual([
      ["cmp-gateway", "cmp-catalog"],
    ]);
    const fixed = tunnelScene(
      run({
        kind: "blackbox",
        triage,
        remediations: {
          "incident-1": { status: "made" },
        } as unknown as RunRecord["remediations"],
      }),
      emptyFeed(),
    );
    expect(fixed.beacon?.tone).toBe("ok");
  });

  it("gives Preflight one light per line and lights the parts it contradicts", () => {
    const line = (
      id: string,
      status: "implemented" | "contradicted" | "missing",
      path?: string,
    ) => ({
      id,
      text: id,
      agentId: "normal_user" as const,
      status,
      note: "",
      locations: path ? [at(path)] : [],
      searched: null,
    });
    const scene = tunnelScene(
      run({
        kind: "preflight",
        preflight: {
          lines: [
            line("line-1", "implemented", "catalog/search.py"),
            line("line-2", "contradicted", "gateway/auth.ts"),
            line("line-3", "missing"),
          ],
        },
      }),
      emptyFeed(),
    );
    expect(scene.spec?.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "line-1", status: "implemented" },
      { id: "line-2", status: "contradicted" },
      { id: "line-3", status: "missing" },
    ]);
    expect(scene.spec?.[1]).toMatchObject({ text: "line-2", note: "" });
    expect(scene.lit).toEqual([
      { part: "cmp-gateway", tone: "danger", strength: 0.8 },
    ]);
  });

  it("gives Fly-off its three designs, the critiques and the pick", () => {
    const blueprint = (id: string, proposer: string) => ({
      id,
      proposer,
      angle: "",
      status: "done" as const,
      blueprint: null,
      error: null,
    });
    const scene = tunnelScene(
      run({
        kind: "flyoff",
        flyoff: {
          blueprints: [
            blueprint("p1", "Pragmatist"),
            blueprint("p2", "Scaler"),
            blueprint("p3", "Guardian"),
          ],
          critiques: [
            { from: "p1", blueprintId: "p2", strengths: [], weaknesses: [] },
          ],
          verdict: {
            winnerId: "p2",
            summary: "",
            ranking: [],
            nextSteps: [],
          },
          flights: { p1: { findings: [], error: null } },
        },
      }),
      emptyFeed(),
    );
    expect(scene.designs).toEqual([
      {
        id: "p1",
        name: "Pragmatist",
        state: "done",
        flown: true,
        picked: false,
      },
      { id: "p2", name: "Scaler", state: "done", flown: false, picked: true },
      {
        id: "p3",
        name: "Guardian",
        state: "done",
        flown: false,
        picked: false,
      },
    ]);
    expect(scene.critiques).toEqual([{ from: "p1", to: "p2" }]);
  });

  it("blows Crosswind's change in from the side and lights its ripple", () => {
    const scene = tunnelScene(
      run({
        kind: "crosswind",
        change: {
          input: { kind: "text", text: "Move sessions" },
          title: "Move sessions",
          url: null,
          base: null,
          head: null,
          files: [],
          truncated: false,
        },
        impact: {
          summary: "",
          components: [
            { id: "cmp-gateway", name: "Gateway", effect: "changed", note: "" },
            { id: "cmp-web", name: "Web", effect: "affected", note: "" },
          ],
          connections: [],
          before: MAP,
          after: MAP,
          fixes: [],
          review: "",
        },
      }),
      emptyFeed(),
    );
    expect(scene.crosswind).toBe(true);
    expect(scene.lit).toEqual([
      { part: "cmp-gateway", tone: "brand", strength: 1 },
      { part: "cmp-web", tone: "brand", strength: 0.45 },
    ]);
    expect(scene.arcs.map((arc) => [arc.from, arc.to])).toEqual([
      ["cmp-gateway", "cmp-web"],
    ]);
  });
});
