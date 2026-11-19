import { describe, expect, it } from "vitest";

import type {
  AttackChain,
  FindingGroup,
  RunRecord,
} from "@/server/engine/schema";

import { chainFlight, chainLinks, issuesInChains } from "./chains";

const group = (id: string, path: string) =>
  ({
    id,
    title: `Title ${id}`,
    severity: "high",
    findingIds: [],
    location: { path, startLine: 2, endLine: 2, quote: "q" },
  }) as unknown as FindingGroup;

const run = {
  agents: [],
  groups: [
    group("sqli", "catalog/search.py"),
    group("xss", "web/src/search.ts"),
    group("expiry", "auth/src/session.ts"),
  ],
  source: {
    architecture: {
      components: ["catalog", "web", "auth"].map((id) => ({
        id: `cmp-${id}`,
        name: id,
        kind: "service" as const,
        workspace: id,
        paths: [id],
        description: "",
      })),
      connections: [],
    },
  },
} as unknown as RunRecord;

const chain: AttackChain = {
  id: "chain-1",
  title: "Take over",
  impact: "",
  severity: "critical",
  links: [
    { groupId: "sqli", role: "returns any text", via: null },
    { groupId: "gone", role: "not accepted any more", via: null },
    { groupId: "xss", role: "runs it", via: null },
    { groupId: "expiry", role: "keeps it", via: null },
  ],
};

describe("chainLinks", () => {
  it("shows each link with its issue, skipping one that is gone", () => {
    const links = chainLinks(chain, run);
    expect(links.map((link) => [link.number, link.title])).toEqual([
      [1, "Title sqli"],
      [3, "Title xss"],
      [4, "Title expiry"],
    ]);
  });
});

describe("chainFlight", () => {
  it("flies from part to part in the order the attacker goes", () => {
    const plan = chainFlight(chain, run);
    expect(plan.hops.map((hop) => [hop.from, hop.to])).toEqual([
      ["cmp-catalog", "cmp-catalog"],
      ["cmp-catalog", "cmp-web"],
      ["cmp-web", "cmp-auth"],
    ]);
    expect(plan.cut).toEqual([]);
  });
});

describe("issuesInChains", () => {
  it("counts each issue once across chains", () => {
    expect(issuesInChains([chain, { ...chain, id: "chain-2" }])).toBe(4);
  });
});
