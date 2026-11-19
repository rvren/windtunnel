import { describe, expect, it } from "vitest";

import { EXAMPLE_SPEC } from "@/lib/features";

import { runTool, ToolFailure } from "../llm";
import {
  lensOf,
  preflightGroups,
  reportLineTool,
  specLines,
  splitSpec,
} from "./preflight";

describe("splitSpec", () => {
  it("takes list items and sentences, and leaves out headings and fragments", () => {
    expect(
      splitSpec(`# Refunds

Intro line:
- A customer can ask for a refund within 30 days.
2. Refunds go back to the **original** card.
Partial refunds are not allowed. Admins see every refund.
- Too short.`),
    ).toEqual([
      "A customer can ask for a refund within 30 days.",
      "Refunds go back to the original card.",
      "Partial refunds are not allowed.",
      "Admins see every refund.",
    ]);
  });
});

describe("lensOf", () => {
  it("gives each line to the agent whose lens fits it", () => {
    expect(lensOf("If payment fails, no order is made.")).toBe("chaos");
    expect(lensOf("A shopper sees only their own orders.")).toBe(
      "adversarial_user",
    );
    expect(lensOf("A page shows at most 50 products.")).toBe("scale");
    expect(lensOf("A shopper can search the catalog.")).toBe("normal_user");
    expect(lensOf("The price is the catalog price.")).toBe("product_critic");
  });

  it("splits the example spec into its ten lines", () => {
    expect(specLines(EXAMPLE_SPEC)).toHaveLength(10);
  });
});

describe("report_line", () => {
  const reader = {
    async slice(path: string, startLine: number, endLine: number) {
      if (path !== "orders.py") throw new ToolFailure("no such file");
      return { path, startLine, endLine, totalLines: 20, text: "code" };
    },
  };
  const make = () => {
    const lines = specLines(
      "- A shopper sees only their own orders.\n- A shopper can search the catalog.",
    );
    const tool = reportLineTool({
      agentId: "adversarial_user",
      reader,
      lines,
      onLine: () => {},
    });
    return { lines, tool };
  };

  it("records a line with the code it cites", async () => {
    const { lines, tool } = make();
    const result = await runTool(tool, {
      lineId: "line-1",
      status: "contradicted",
      note: "Every order is returned.",
      code: [
        { path: "orders.py", startLine: 14, endLine: 15 },
        { path: "nowhere.py", startLine: 1, endLine: 1 },
      ],
      searched: null,
    });
    expect(result.failed).toBe(false);
    expect(lines[0]).toMatchObject({
      status: "contradicted",
      locations: [{ path: "orders.py", startLine: 14, quote: "code" }],
    });
  });

  it("refuses another agent's line, a claim with no real code, and a bare missing", async () => {
    const { tool } = make();
    const other = await runTool(tool, {
      lineId: "line-2",
      status: "implemented",
      note: "x",
      code: [{ path: "orders.py", startLine: 1, endLine: 1 }],
      searched: null,
    });
    expect(other.text).toMatch(/given to you/);
    const unreal = await runTool(tool, {
      lineId: "line-1",
      status: "implemented",
      note: "x",
      code: [{ path: "nowhere.py", startLine: 1, endLine: 1 }],
      searched: null,
    });
    expect(unreal.text).toMatch(/None of the cited lines/);
    const bare = await runTool(tool, {
      lineId: "line-1",
      status: "missing",
      note: "x",
      code: [],
      searched: " ",
    });
    expect(bare.text).toMatch(/where you searched/);
  });
});

describe("preflightGroups", () => {
  it("makes the lines the code does not meet into findings, worst highest", () => {
    const lines = specLines(
      "- A shopper sees only their own orders.\n- A shopper can get a refund to their card.\n- A shopper can search the catalog.",
    );
    lines[0].status = "contradicted";
    lines[1].status = "missing";
    lines[2].status = "implemented";
    expect(
      preflightGroups(lines).map((group) => [group.id, group.severity]),
    ).toEqual([
      ["line-1", "high"],
      ["line-2", "medium"],
    ]);
  });
});
