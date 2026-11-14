import { describe, expect, it } from "vitest";

import {
  matchIssues,
  overlap,
  type SeenIssue,
  type TrackedIssue,
} from "./match";
import { inScope, reconcile } from "./reconcile";

const seen = (over: Partial<SeenIssue> & { groupId: string }): SeenIssue => ({
  title: "The search box can run SQL",
  kind: "security_vulnerability",
  severity: "critical",
  path: "catalog/search.py",
  cwe: "CWE-89",
  ...over,
});

const tracked = (
  over: Partial<TrackedIssue> & { id: string },
): TrackedIssue => ({
  title: "The search box can run SQL",
  kind: "security_vulnerability",
  path: "catalog/search.py",
  cwe: "CWE-89",
  state: "open",
  ...over,
});

describe("matching an issue to one the project tracks", () => {
  it("matches the same file and kind even when the wording changes", () => {
    const { matched, fresh, missing } = matchIssues(
      [tracked({ id: "t1" })],
      [seen({ groupId: "g1", title: "SQL injection through the search box" })],
    );
    expect(matched.get("t1")?.groupId).toBe("g1");
    expect(fresh).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("never matches across kinds or files", () => {
    const { matched, fresh } = matchIssues(
      [tracked({ id: "t1" })],
      [
        seen({ groupId: "kind", kind: "architecture_weakness" }),
        seen({ groupId: "file", path: "orders/orders.py" }),
      ],
    );
    expect(matched.size).toBe(0);
    expect(fresh.map((item) => item.groupId)).toEqual(["kind", "file"]);
  });

  it("needs close titles when no file is cited", () => {
    const base = tracked({
      id: "t1",
      path: null,
      cwe: null,
      kind: "missing_requirement",
      title: "Nobody can undo an invitation",
    });
    expect(
      matchIssues(
        [base],
        [
          seen({
            groupId: "g1",
            path: null,
            cwe: null,
            kind: "missing_requirement",
            title: "Nobody can undo a sent invitation",
          }),
        ],
      ).matched.size,
    ).toBe(1);
    expect(
      matchIssues(
        [base],
        [
          seen({
            groupId: "g2",
            path: null,
            cwe: null,
            kind: "missing_requirement",
            title: "Billing has no refunds",
          }),
        ],
      ).matched.size,
    ).toBe(0);
  });

  it("pairs each issue once, the closest first", () => {
    const { matched } = matchIssues(
      [
        tracked({ id: "t1" }),
        tracked({ id: "t2", title: "Search results leak other tenants" }),
      ],
      [
        seen({ groupId: "g1" }),
        seen({
          groupId: "g2",
          title: "Search results leak other tenants",
          cwe: null,
        }),
      ],
    );
    expect(matched.get("t1")?.groupId).toBe("g1");
    expect(matched.get("t2")?.groupId).toBe("g2");
  });

  it("measures shared title words", () => {
    expect(
      overlap("The search box can run SQL", "search box runs SQL"),
    ).toBeGreaterThan(0.4);
    expect(overlap("abc", "")).toBe(0);
  });
});

describe("what a finished run changes", () => {
  const scope = { read: ["catalog"], all: ["catalog"] };

  it("confirms a merged fix the run no longer finds", () => {
    const { updates } = reconcile(
      [tracked({ id: "t1", state: "merged" })],
      [],
      scope,
    );
    expect(updates).toEqual([{ id: "t1", state: "fixed", seen: null }]);
  });

  it("reopens a merged or gone issue found again", () => {
    for (const state of ["merged", "fixed", "gone"] as const) {
      const { updates } = reconcile(
        [tracked({ id: "t1", state })],
        [seen({ groupId: "g1" })],
        scope,
      );
      expect(updates[0]).toMatchObject({ id: "t1", state: "reopened" });
    }
  });

  it("keeps an open PR open while the issue is still found", () => {
    const { updates } = reconcile(
      [tracked({ id: "t1", state: "pr_open" })],
      [seen({ groupId: "g1" })],
      scope,
    );
    expect(updates[0].state).toBe("pr_open");
  });

  it("opens what is new and marks open issues not found again as gone", () => {
    const { updates, created } = reconcile(
      [tracked({ id: "t1" })],
      [
        seen({
          groupId: "g9",
          path: "web/app.ts",
          title: "XSS in product names",
          cwe: "CWE-79",
        }),
      ],
      scope,
    );
    expect(created.map((item) => item.groupId)).toEqual(["g9"]);
    expect(updates).toEqual([{ id: "t1", state: "gone", seen: null }]);
  });

  it("leaves alone an issue in a workspace the run did not read", () => {
    const { updates } = reconcile(
      [tracked({ id: "t1", path: "billing/charge.go" })],
      [],
      { read: ["catalog"], all: ["catalog", "billing"] },
    );
    expect(updates).toEqual([]);
    expect(inScope(null, ["catalog"], ["catalog", "billing"])).toBe(false);
    expect(inScope(null, ["catalog", "billing"], ["catalog", "billing"])).toBe(
      true,
    );
  });

  it("does not touch issues already fixed or gone that stay unseen", () => {
    const { updates } = reconcile(
      [
        tracked({ id: "t1", state: "fixed" }),
        tracked({ id: "t2", state: "gone", path: "x/y" }),
      ],
      [],
      scope,
    );
    expect(updates).toEqual([]);
  });
});
