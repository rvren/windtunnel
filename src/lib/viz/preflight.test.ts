import { describe, expect, it } from "vitest";

import type { PreflightLine, RunPreflight } from "@/server/engine/schema";

import {
  statusCounts,
  traceabilityCsv,
  traceabilityMarkdown,
  worstLines,
} from "./preflight";

const line = (
  id: string,
  status: PreflightLine["status"],
  over: Partial<PreflightLine> = {},
): PreflightLine => ({
  id,
  text: `Line ${id}`,
  agentId: "normal_user",
  status,
  note: `Note ${id}`,
  locations: [],
  searched: null,
  ...over,
});

const preflight: RunPreflight = {
  lines: [
    line("1", "implemented", {
      locations: [{ path: "a.py", startLine: 2, endLine: 4, quote: "" }],
    }),
    line("2", "contradicted", {
      text: 'Says "no" | never',
      locations: [{ path: "b.py", startLine: 7, endLine: 7, quote: "" }],
    }),
    line("3", "missing", { searched: "billing and orders" }),
    line("4", "partly"),
  ],
};

describe("statusCounts and worstLines", () => {
  it("counts each status and lists what needs work, worst first", () => {
    expect(statusCounts(preflight)).toMatchObject({
      implemented: 1,
      contradicted: 1,
      missing: 1,
      partly: 1,
    });
    expect(worstLines(preflight).map((item) => item.id)).toEqual([
      "2",
      "3",
      "4",
    ]);
  });
});

describe("the traceability table", () => {
  it("as Markdown, one row per line, with the code or where it was looked for", () => {
    const text = traceabilityMarkdown("Storefront", preflight);
    expect(text).toContain("| 1 | Line 1 | Implemented | a.py:2-4 | Note 1 |");
    expect(text).toContain(
      '| 2 | Says "no" \\| never | Contradicted | b.py:7-7 |',
    );
    expect(text).toContain("| 3 | Line 3 | Missing | billing and orders |");
  });

  it("as CSV, with quotes doubled", () => {
    const rows = traceabilityCsv(preflight).trim().split("\n");
    expect(rows[0]).toBe("Number,Line of the spec,Status,Code,Note");
    expect(rows[2]).toBe(
      '2,"Says ""no"" | never","Contradicted","b.py:7-7","Note 2"',
    );
  });
});
