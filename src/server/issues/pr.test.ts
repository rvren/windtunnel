import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FindingGroup,
  RemediationRecord,
  RunRecord,
} from "../engine/schema";
import { applyEdits } from "./apply";

vi.mock("./store", () => ({ setPullRequest: vi.fn(async () => undefined) }));

const { createPullRequests, previewPullRequests, pullRequestText, targetsFor } =
  await import("./pull-request");
const { setPullRequest } = await import("./store");

const edit = (
  path: string,
  startLine: number,
  before: string[],
  after: string[],
) => ({ path, startLine, before, after, contextBefore: [], contextAfter: [] });

const record = (edits: RemediationRecord["edits"]): RemediationRecord => ({
  groupId: "g1",
  status: "made",
  summary: "The query joins user text.",
  steps: ["Bind the value as a parameter."],
  cwe: {
    id: "CWE-89",
    name: "SQL Injection",
    url: "https://cwe/89",
    fallback: false,
  },
  owasp: { id: "A03:2021", name: "Injection", url: "https://owasp/a03" },
  edits,
  dropped: [],
  notes: [],
  error: null,
});

const group: FindingGroup = {
  id: "g1-abcdef",
  title: "The search box can run SQL",
  type: "security_vulnerability",
  severity: "critical",
  summary: "",
  findingIds: [],
  reviewed: true,
};

const projectRun = {
  id: "run-1",
  workOrders: [
    {
      id: "wo",
      title: "t",
      priority: "high",
      description: "",
      acceptanceCriteria: ["The search uses a bound parameter."],
      groupIds: ["g1-abcdef"],
    },
  ],
  source: {
    kind: "repository",
    origin: {
      kind: "github",
      url: "https://github.com/me/catalog",
      branch: null,
    },
    label: "catalog",
    files: 3,
    languages: [".py"],
    workspaces: [
      {
        name: "catalog",
        origin: {
          kind: "github",
          url: "https://github.com/me/catalog",
          branch: null,
        },
        label: "me/catalog",
      },
      { name: "web", origin: { kind: "local", name: "web" }, label: "web" },
    ],
  },
} as unknown as RunRecord;

describe("applying checked edits to a file", () => {
  const text = "a\nb\nc\nd\n";

  it("replaces the lines and keeps the final newline", () => {
    const applied = applyEdits(text, [
      edit("f", 2, ["b"], ["B", "B2"]),
      edit("f", 4, ["d"], ["D"]),
    ]);
    expect(applied).toEqual({ ok: true, text: "a\nB\nB2\nc\nD\n" });
  });

  it("refuses a file that changed since the run, applying nothing", () => {
    const applied = applyEdits(text, [edit("f", 2, ["x"], ["y"])]);
    expect(applied.ok).toBe(false);
  });

  it("matches a masked secret without knowing it, and drops the secret", () => {
    const file = 'pkg\nvar password = "b1ll1ng-gateway-2026"\n';
    const applied = applyEdits(file, [
      edit(
        "f",
        2,
        ['var password = "••••"'],
        ['var password = os.Getenv("PW")'],
      ),
    ]);
    expect(applied).toEqual({
      ok: true,
      text: 'pkg\nvar password = os.Getenv("PW")\n',
    });
    // Never write the mask itself into the code.
    expect(
      applyEdits(file, [
        edit("f", 2, ['var password = "••••"'], ['var password = "••••"']),
      ]).ok,
    ).toBe(false);
    // A masked line still has to match everything around the mask.
    expect(
      applyEdits(file, [edit("f", 2, ['var token = "••••"'], ["x"])]).ok,
    ).toBe(false);
  });

  it("refuses overlapping edits", () => {
    expect(
      applyEdits(text, [edit("f", 1, ["a", "b"], []), edit("f", 2, ["b"], [])])
        .ok,
    ).toBe(false);
  });
});

describe("where a fix goes and what its pull request says", () => {
  it("splits a project's edits by workspace, with repository paths", () => {
    const targets = targetsFor(
      projectRun,
      record([
        edit("catalog/search.py", 5, ["q"], ["q2"]),
        edit("web/page.ts", 1, ["x"], ["y"]),
      ]),
    );
    expect(targets).toEqual([
      expect.objectContaining({
        workspace: "catalog",
        repo: "me/catalog",
        edits: [expect.objectContaining({ path: "search.py" })],
      }),
      expect.objectContaining({ workspace: "web", repo: null }),
    ]);
  });

  it("names the branch after the issue and carries the fix into the body", () => {
    const text = pullRequestText(projectRun, group, record([]));
    expect(text.branch).toBe("windtunnel/the-search-box-can-run-sql-g1-abc");
    expect(text.title).toBe("Fix: The search box can run SQL");
    expect(text.body).toContain("CWE-89");
    expect(text.body).toContain("1. Bind the value as a parameter.");
    expect(text.body).toContain("- [ ] The search uses a bound parameter.");
    expect(text.body).toContain("run run-1");
  });
});

describe("opening the pull request on GitHub (mocked)", () => {
  const calls: { method: string; url: string; body: unknown }[] = [];
  let file = "import db\nq = 'select ' + text\n";

  beforeEach(() => {
    calls.length = 0;
    file = "import db\nq = 'select ' + text\n";
    process.env.GITHUB_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const method = init.method ?? "GET";
        calls.push({
          method,
          url,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        const json = (value: unknown) =>
          new Response(JSON.stringify(value), { status: 200 });
        if (url.endsWith("/repos/me/catalog"))
          return json({ default_branch: "main", permissions: { push: true } });
        if (url.includes("/contents/"))
          return json({
            content: Buffer.from(file).toString("base64"),
            encoding: "base64",
          });
        if (url.includes("/git/ref/heads/"))
          return json({ object: { sha: "base" } });
        if (url.includes("/git/commits/base"))
          return json({ tree: { sha: "tree0" } });
        if (url.endsWith("/git/blobs")) return json({ sha: "blob1" });
        if (url.endsWith("/git/trees")) return json({ sha: "tree1" });
        if (url.endsWith("/git/commits")) return json({ sha: "commit1" });
        if (url.endsWith("/git/refs")) return json({});
        if (url.endsWith("/pulls"))
          return json({
            number: 12,
            html_url: "https://github.com/me/catalog/pull/12",
          });
        return new Response("{}", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  const fix = record([
    edit(
      "catalog/search.py",
      2,
      ["q = 'select ' + text"],
      ["q = db.bind('select ?', text)"],
    ),
  ]);
  const single = {
    ...projectRun,
    source: {
      ...projectRun.source!,
      workspaces: [projectRun.source!.workspaces![0]],
    },
  } as RunRecord;

  it("previews without writing anything", async () => {
    const { preview } = await previewPullRequests(single, group, fix);
    expect(preview.ready).toBe(true);
    expect(preview.targets[0]).toMatchObject({
      repo: "me/catalog",
      base: "main",
    });
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("opens a branch, one commit and the pull request, and tracks it", async () => {
    const issue = { id: "issue-1" } as never;
    const { created } = await createPullRequests(issue, single, group, fix);
    expect(created).toEqual([
      expect.objectContaining({
        number: 12,
        state: "open",
        repo: "me/catalog",
      }),
    ]);
    const tree = calls.find((call) => call.url.endsWith("/git/trees"));
    expect(tree?.body).toMatchObject({ base_tree: "tree0" });
    const blob = calls.find((call) => call.url.endsWith("/git/blobs"));
    expect((blob?.body as { content: string }).content).toContain("db.bind");
    const pull = calls.find((call) => call.url.endsWith("/pulls"));
    expect(pull?.body).toMatchObject({
      base: "main",
      head: expect.stringContaining("windtunnel/"),
    });
    expect(setPullRequest).toHaveBeenCalledWith(
      "issue-1",
      expect.objectContaining({ number: 12 }),
      "pr_open",
    );
  });

  it("writes nothing when the file moved on since the run", async () => {
    file = "import db\nq = something_else\n";
    const { created, preview } = await createPullRequests(
      { id: "issue-1" } as never,
      single,
      group,
      fix,
    );
    expect(created).toEqual([]);
    expect(preview.ready).toBe(false);
    expect(preview.targets[0].problem).toContain("changed since the run");
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });
});
