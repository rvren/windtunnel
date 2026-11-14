import { describe, expect, it } from "vitest";

import { CONNECTORS, CONNECTOR_GROUPS, searchConnectors } from "./connectors";

describe("the connector catalog", () => {
  it("lists over a hundred providers, each once, in a known group", () => {
    expect(CONNECTORS.length).toBeGreaterThan(100);
    expect(new Set(CONNECTORS.map((entry) => entry.id)).size).toBe(
      CONNECTORS.length,
    );
    const groups = new Set(CONNECTOR_GROUPS.map((group) => group.name));
    expect(CONNECTORS.every((entry) => groups.has(entry.group))).toBe(true);
  });

  it("has exactly one live connector, and it comes first", () => {
    expect(
      CONNECTORS.filter((entry) => entry.live).map((entry) => entry.id),
    ).toEqual(["software-factory"]);
    expect(CONNECTORS[0].id).toBe("software-factory");
  });

  it("searches by name and narrows by group", () => {
    expect(searchConnectors("jira", null).map((entry) => entry.name)).toEqual([
      "Jira",
      "Jira Service Management",
    ]);
    expect(
      searchConnectors("", "Design").every((entry) => entry.group === "Design"),
    ).toBe(true);
    expect(searchConnectors("zzz", null)).toEqual([]);
  });
});
