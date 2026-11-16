import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import { agentReports, issues, projects, runEvents, runs } from "../db/schema";
import { newRun } from "../engine/run";
import type { FindingGroup, RunRecord } from "../engine/schema";
import { PgRunStore } from "../engine/store";
import { addWorkspace, createProject, getProject } from "../projects/store";
import {
  ensureTracked,
  issueForGroup,
  listIssues,
  reconcileRun,
  setPullRequest,
} from "./store";

// Runs against the windtunnel_test database. See vitest.db.config.mts.

beforeAll(async () => {
  await migrateDatabase();
});

beforeEach(async () => {
  await db().delete(issues);
  await db().delete(runEvents);
  await db().delete(agentReports);
  await db().delete(runs);
  await db().delete(projects);
});

afterAll(async () => {
  await pool().end();
});

const group = (id: string, title: string, path: string): FindingGroup => ({
  id,
  title,
  type: "security_vulnerability",
  severity: "high",
  summary: "",
  findingIds: [],
  reviewed: true,
  location: { path, startLine: 1, endLine: 1, quote: "" },
  foundBy: "code",
});

async function finishedRun(
  projectId: string,
  groups: FindingGroup[],
  at: string,
  kind: "code" | "requirement" = "code",
  parentRunId?: string,
): Promise<RunRecord> {
  const run = newRun(
    randomUUID(),
    {
      requirement: "",
      documents: [],
      projectRef: { id: projectId, demo: true },
      ...(parentRunId ? { parentRunId } : {}),
    },
    { reasoning: "r", agents: "a" },
    new Date(at),
    true,
  );
  const done: RunRecord = {
    ...run,
    status: "completed",
    updatedAt: at,
    groups,
    ...(kind === "code"
      ? {
          workspaces: ["web"],
          source: {
            kind: "repository" as const,
            origin: { kind: "local" as const, name: "web" },
            label: "web",
            files: 1,
            languages: [],
          },
        }
      : {}),
  };
  await new PgRunStore(db()).save(done);
  return done;
}

describe("tracking a project's issues across runs", () => {
  it("opens, keeps, fixes after a merge, and reopens", async () => {
    const created = await createProject({ name: "Shop", description: "" });
    await addWorkspace(created, {
      name: "web",
      origin: { kind: "local", name: "web" },
    });
    const project = (await getProject(created.id))!;

    const first = await finishedRun(
      project.id,
      [
        group("g1", "The search box can run SQL", "web/search.ts"),
        group("g2", "Tokens never expire", "web/auth.ts"),
      ],
      "2026-11-01T10:00:00Z",
    );
    await reconcileRun(first);
    let tracked = await listIssues(project.id);
    expect(tracked.map((item) => item.state)).toEqual(["open", "open"]);

    // A fix for g1 is merged.
    const sql = (await issueForGroup(project.id, first.id, "g1"))!;
    await setPullRequest(
      sql.id,
      {
        repo: "me/web",
        number: 7,
        url: "https://github.com/me/web/pull/7",
        branch: "windtunnel/sql",
        state: "merged",
        mergedAt: "2026-11-02T09:00:00Z",
      },
      "merged",
    );

    // The next run no longer finds g1, still finds g2, and finds a new one.
    const second = await finishedRun(
      project.id,
      [
        group("h1", "Tokens never expire at all", "web/auth.ts"),
        group("h2", "Names are written to the page as HTML", "web/page.ts"),
      ],
      "2026-11-03T10:00:00Z",
    );
    await reconcileRun(second);
    tracked = await listIssues(project.id);
    const byTitle = Object.fromEntries(
      tracked.map((item) => [item.path, item]),
    );
    expect(byTitle["web/search.ts"]).toMatchObject({
      state: "fixed",
      verifiedRunId: second.id,
    });
    expect(byTitle["web/search.ts"].fixedAt).not.toBeNull();
    expect(byTitle["web/auth.ts"]).toMatchObject({
      state: "open",
      lastRunId: second.id,
      lastGroupId: "h1",
    });
    expect(byTitle["web/page.ts"]).toMatchObject({ state: "open" });

    // The flaw comes back.
    const third = await finishedRun(
      project.id,
      [group("k1", "The search box can run SQL", "web/search.ts")],
      "2026-11-04T10:00:00Z",
    );
    await reconcileRun(third);
    const again = (await listIssues(project.id)).find(
      (item) => item.path === "web/search.ts",
    )!;
    expect(again.state).toBe("reopened");
    expect(again.fixedAt).toBeNull();
  });

  it("fills a project's issues from its past runs the first time", async () => {
    const project = await createProject({ name: "Old", description: "" });
    await finishedRun(
      project.id,
      [group("g1", "The search box can run SQL", "search.ts")],
      "2026-10-01T10:00:00Z",
    );
    await finishedRun(project.id, [], "2026-10-02T10:00:00Z");
    await ensureTracked(project.id);
    const tracked = await listIssues(project.id);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].state).toBe("gone");
    // A second call changes nothing.
    await ensureTracked(project.id);
    expect(await listIssues(project.id)).toHaveLength(1);
  });

  it("keeps code issues and requirement issues apart", async () => {
    const project = await createProject({ name: "Both", description: "" });
    const code = await finishedRun(
      project.id,
      [group("g1", "The search box can run SQL", "search.ts")],
      "2026-10-01T10:00:00Z",
    );
    await reconcileRun(code);
    // A requirement run that finds nothing leaves the code issue alone.
    const requirement = await finishedRun(
      project.id,
      [
        {
          ...group("r1", "Nobody may refund an order", "x"),
          type: "missing_requirement",
          location: undefined,
        },
      ],
      "2026-10-02T10:00:00Z",
      "requirement",
    );
    await reconcileRun(requirement);
    let tracked = await listIssues(project.id);
    expect(tracked.map((issue) => [issue.origin, issue.state]).sort()).toEqual([
      ["code", "open"],
      ["requirement", "open"],
    ]);
    // And a code run that finds nothing new leaves the requirement issue.
    await reconcileRun(
      await finishedRun(
        project.id,
        [group("g1", "The search box can run SQL", "search.ts")],
        "2026-10-03T10:00:00Z",
      ),
    );
    tracked = await listIssues(project.id);
    expect(tracked.find((issue) => issue.origin === "requirement")?.state).toBe(
      "open",
    );
  });

  it("settles a requirement's risks only in its own versions", async () => {
    const project = await createProject({ name: "Ideas", description: "" });
    const risk = {
      ...group("r1", "Nobody may refund an order", "x"),
      type: "missing_requirement" as const,
      location: undefined,
    };
    const first = await finishedRun(
      project.id,
      [risk],
      "2026-10-01T10:00:00Z",
      "requirement",
    );
    await reconcileRun(first);
    // Another requirement in the same project raises nothing: the risk stays.
    await reconcileRun(
      await finishedRun(project.id, [], "2026-10-02T10:00:00Z", "requirement"),
    );
    expect((await listIssues(project.id))[0].state).toBe("open");
    // The next version of the same requirement no longer raises it.
    await reconcileRun(
      await finishedRun(
        project.id,
        [],
        "2026-10-03T10:00:00Z",
        "requirement",
        first.id,
      ),
    );
    expect((await listIssues(project.id))[0].state).toBe("gone");
  });

  it("links an idea's risks to the code issues they became", async () => {
    const project = await createProject({ name: "Built", description: "" });
    const idea = await finishedRun(
      project.id,
      [
        {
          ...group("r1", "Invitations never expire", "x"),
          type: "missing_requirement",
          location: undefined,
        },
        {
          ...group("r2", "Refunds have no time limit", "x"),
          type: "missing_requirement",
          location: undefined,
        },
      ],
      "2026-10-01T10:00:00Z",
      "requirement",
    );
    await reconcileRun(idea);
    // The code that implements it, audited and named as such.
    const code = await finishedRun(
      project.id,
      [
        {
          ...group("g1", "Invitation links never expire", "invite.ts"),
          type: "missing_requirement",
        },
      ],
      "2026-10-05T10:00:00Z",
    );
    await reconcileRun({ ...code, requirementRunId: idea.id });
    const tracked = await listIssues(project.id);
    const built = tracked.find((issue) => issue.origin === "code")!;
    const invite = tracked.find(
      (issue) => issue.title === "Invitations never expire",
    )!;
    const refunds = tracked.find(
      (issue) => issue.title === "Refunds have no time limit",
    )!;
    expect(invite.realizedByIssueId).toBe(built.id);
    expect(refunds.realizedByIssueId).toBeNull();
  });
});
