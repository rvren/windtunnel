import { describe, expect, it } from "vitest";

import { executeRun, newRun } from "../engine/run";
import { SAMPLE_SCRIPT, ScriptedLlm } from "../engine/sample";
import { MemoryRunStore } from "../engine/store";
import {
  labelListed,
  parseConnectorUrl,
  projectsInText,
  PROPOSAL_LABEL,
  toFactoryWorkOrder,
} from "./software-factory";

describe("the Software Factory connector URL", () => {
  it("takes 8090's own MCP address, with or without a trailing slash", () => {
    const url =
      "https://api.factory.8090.dev/v3/mcp/org/4d1ee88b-3c67-44ff-99af-bebdbeb6ae66";
    expect(parseConnectorUrl(` ${url}/ `)).toBe(url);
    expect(parseConnectorUrl("https://api.factory.8090.dev/v2/mcp")).toBe(
      "https://api.factory.8090.dev/v2/mcp",
    );
  });

  // The sign-in's tokens go to this address, so nothing else may pass.
  it.each([
    "http://api.factory.8090.dev/v3/mcp/org/x",
    "https://evil.example/v3/mcp/org/x",
    "https://api.factory.8090.dev.evil.example/v3/mcp",
    "https://api.factory.8090.dev@evil.example/v3/mcp",
    "https://api.factory.8090.dev/other",
    "not a url",
    "",
    null,
  ])("refuses %j", (value) => {
    expect(parseConnectorUrl(value)).toBeNull();
  });
});

describe("the list of projects, as Software Factory writes it", () => {
  it("reads a name and an id from each line", () => {
    const text = [
      "Session project: none selected",
      "",
      "2 project(s), page 1 of 1",
      "",
      "test-project (7f301498-4422-4836-8fc4-73271746ac53); repositories: none",
      "Shop (beta) (11111111-2222-4333-8444-555555555555); repositories: https://github.com/acme/shop",
    ].join("\n");
    expect(projectsInText(text)).toEqual([
      { id: "7f301498-4422-4836-8fc4-73271746ac53", name: "test-project" },
      { id: "11111111-2222-4333-8444-555555555555", name: "Shop (beta)" },
    ]);
    expect(projectsInText("No projects.")).toEqual([]);
  });
});

describe("the labels, as Software Factory lists them", () => {
  const text = [
    "Project: test-project (7f301498-4422-4836-8fc4-73271746ac53)",
    "",
    "8 label(s) (page 1 of 1)",
    "",
    "billing  [gray]",
    "windtunnel  [purple]",
  ].join("\n");
  it("finds a label by its title, ignoring case", () => {
    expect(labelListed("windtunnel", null, text)).toBe(true);
    expect(labelListed("Billing", null, text)).toBe(true);
    expect(labelListed("dvna", null, text)).toBe(false);
    expect(labelListed("wind", null, text)).toBe(false);
  });
});

describe("work orders from a requirement run", () => {
  it("are proposals: requirements work, labelled, and saying so first", async () => {
    const run = await executeRun(
      {
        llm: new ScriptedLlm(SAMPLE_SCRIPT),
        store: new MemoryRunStore(),
        publish: () => {},
        now: () => new Date("2026-11-14T10:00:05Z"),
      },
      newRun(
        "req-1",
        { requirement: "A shop.", documents: [] },
        { reasoning: "r", agents: "a" },
        new Date("2026-11-14T10:00:00Z"),
        true,
      ),
    );
    expect(run.workOrders.length).toBeGreaterThan(0);
    for (const workOrder of run.workOrders) {
      const sent = toFactoryWorkOrder(run, workOrder);
      expect(sent.type).toBe("requirements");
      expect(sent.label_titles).toContain(PROPOSAL_LABEL);
      expect(
        sent.description.startsWith("> Proposed from a requirement run"),
      ).toBe(true);
      expect(sent.description).not.toContain("## Findings this settles");
    }
  });
});
