import { describe, expect, it } from "vitest";

import { ToolFailure } from "../llm";
import type { ChainAnswer, FindingGroup } from "../schema";

import { checkChains } from "./chains";

const group = (id: string, severity: FindingGroup["severity"]) =>
  ({
    id,
    title: id,
    type: "security_vulnerability",
    severity,
    summary: "",
    findingIds: [],
    reviewed: true,
    location: { path: `${id}.py`, startLine: 1, endLine: 1, quote: "" },
  }) as FindingGroup;

const groups = [
  group("sqli", "critical"),
  group("xss", "high"),
  group("token", "high"),
  group("expiry", "medium"),
];

/** A repository where only web/search.ts exists, with ten lines. */
const reader = {
  async slice(path: string, startLine: number, endLine: number) {
    if (path !== "web/search.ts" || startLine > 10) {
      throw new ToolFailure("no such lines");
    }
    const end = Math.min(endLine, 10);
    return {
      path,
      startLine,
      endLine: end,
      totalLines: 10,
      text: `line ${startLine}`,
    };
  },
};

const via = (path: string, startLine = 4) => ({
  how: "passes it on",
  path,
  startLine,
  endLine: startLine + 1,
});

const chain = (
  links: ChainAnswer["chains"][number]["links"],
  severity: FindingGroup["severity"] = "low",
): ChainAnswer["chains"][number] => ({
  title: "T",
  impact: "I",
  severity,
  links,
});

describe("checkChains", () => {
  it("keeps a sound chain, with the code of each step it cites", async () => {
    const { chains, dropped } = await checkChains(
      {
        chains: [
          chain([
            { groupId: "sqli", role: "a", via: null },
            { groupId: "xss", role: "b", via: via("web/search.ts") },
          ]),
        ],
      },
      groups,
      reader,
    );
    expect(dropped).toBe(0);
    expect(chains).toHaveLength(1);
    expect(chains[0].id).toBe("chain-1");
    expect(chains[0].links[1].via).toMatchObject({
      path: "web/search.ts",
      startLine: 4,
      quote: "line 4",
      how: "passes it on",
    });
  });

  it("never rates a chain below its worst link", async () => {
    const { chains } = await checkChains(
      {
        chains: [
          chain(
            [
              { groupId: "expiry", role: "", via: null },
              { groupId: "sqli", role: "", via: null },
            ],
            "low",
          ),
        ],
      },
      groups,
      reader,
    );
    expect(chains[0].severity).toBe("critical");
  });

  it("drops a chain whose step cites lines that do not exist", async () => {
    const { chains, dropped } = await checkChains(
      {
        chains: [
          chain([
            { groupId: "sqli", role: "", via: null },
            { groupId: "xss", role: "", via: via("web/nowhere.ts") },
          ]),
        ],
      },
      groups,
      reader,
    );
    expect(chains).toEqual([]);
    expect(dropped).toBe(1);
  });

  it("drops unknown and repeated links, then chains too short to be one", async () => {
    const { chains, dropped } = await checkChains(
      {
        chains: [
          chain([
            { groupId: "sqli", role: "", via: null },
            { groupId: "made-up", role: "", via: null },
            { groupId: "sqli", role: "", via: null },
          ]),
          chain([
            { groupId: "token", role: "", via: null },
            { groupId: "made-up", role: "", via: null },
            { groupId: "expiry", role: "", via: null },
          ]),
        ],
      },
      groups,
      reader,
    );
    expect(dropped).toBe(1);
    expect(
      chains.map((item) => item.links.map((link) => link.groupId)),
    ).toEqual([["token", "expiry"]]);
  });

  it("keeps one of two chains with the same links, the worst first", async () => {
    const same = [
      { groupId: "xss", role: "", via: null },
      { groupId: "token", role: "", via: null },
    ];
    const { chains, dropped } = await checkChains(
      {
        chains: [
          chain([
            { groupId: "token", role: "", via: null },
            { groupId: "expiry", role: "", via: null },
          ]),
          chain(same),
          chain(same),
        ],
      },
      groups,
      reader,
    );
    expect(dropped).toBe(1);
    expect(chains.map((item) => [item.id, item.severity])).toEqual([
      ["chain-1", "high"],
      ["chain-2", "high"],
    ]);
    expect(chains[0].links[0].groupId).toBe("token");
  });
});
