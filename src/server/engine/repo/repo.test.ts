import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runTool } from "../llm";
import { executeRun, newRun } from "../run";
import { SAMPLE_SCRIPT, ScriptedLlm, type Script } from "../sample";
import type { Finding, StoredEvent } from "../schema";
import { MemoryRunStore } from "../store";
import { readTools, reportFindingTool } from "./agent-tools";
import { parseOrigin } from "./fetch";
import { outline, surveyRepo } from "./survey";
import { RepoReader } from "./tools";

// A small repository in three languages, with the things a survey must skip.
let base: string;
let root: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "windtunnel-test-"));
  root = path.join(base, "shop");
  const file = async (name: string, text: string | Buffer) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), text);
  };
  await file("README.md", "# Shop\nInvite people.\n");
  await file("package.json", "{}\n");
  await file(
    "api/invite.py",
    "def invite(email):\n    send(email)\n    save(email)\n",
  );
  await file("api/server.go", "package main\n\nfunc main() {\n\tlisten()\n}\n");
  await file("web/index.ts", "export const INVITE = 'invite';\n");
  await file("node_modules/dep/index.js", "module.exports = 1;\n");
  await file("dist/bundle.js", "var a=1;\n");
  await file("logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1]));
  await file("empty.txt", "");
  await writeFile(path.join(base, "secret.txt"), "TOP SECRET\n");
  await symlink(path.join(base, "secret.txt"), path.join(root, "api/leak.txt"));
  process.env.WINDTUNNEL_REPOS_DIR = base;
});

afterAll(async () => {
  delete process.env.WINDTUNNEL_REPOS_DIR;
  await rm(base, { recursive: true, force: true });
});

describe("surveyRepo", () => {
  it("lists text files in any language and skips the rest", async () => {
    const survey = await surveyRepo(root);
    expect(survey.files.map((item) => item.path)).toEqual([
      "api/invite.py",
      "api/server.go",
      "package.json",
      "README.md",
      "web/index.ts",
    ]);
    // node_modules, dist, the image, the empty file and the symlink.
    expect(survey.skipped).toBe(5);
    expect(survey.manifests).toEqual(["package.json"]);
    expect(outline(survey)).toContain("5 text files");
    expect(outline(survey)).toContain("api/  2 files");
  });
});

describe("RepoReader", () => {
  const reader = async () => new RepoReader(root, await surveyRepo(root));

  it("lists, reads with line numbers and searches", async () => {
    const repo = await reader();
    expect(repo.listFiles("")).toContain("api/  (2 files)");
    expect(repo.listFiles("api")).toContain("invite.py");
    const text = await repo.readFile("api/invite.py", 2, 3);
    expect(text).toContain("2      send(email)");
    expect(text).toContain("lines 2-3 of 4");
    const found = await repo.search("INVITE");
    expect(found).toContain("api/invite.py:1");
    expect(found).toContain("web/index.ts:1");
    expect(await repo.search("nothing-like-this")).toMatch(/No file contains/);
  });

  it.each([
    ["../secret.txt"],
    ["/etc/passwd"],
    ["api/../../secret.txt"],
    ["api/leak.txt"],
    ["node_modules/dep/index.js"],
    ["logo.png"],
  ])("refuses to read %s", async (target) => {
    await expect((await reader()).readFile(target)).rejects.toThrow(
      /outside the repository|no readable file/,
    );
  });

  it("refuses lines that do not exist", async () => {
    await expect((await reader()).slice("README.md", 40, 41)).rejects.toThrow(
      /does not exist/,
    );
  });

  it("reads, searches and checks the patched text through an overlay", async () => {
    const repo = await reader();
    const patched = repo.withOverlay({
      "api/invite.py": [
        "def invite(email):",
        "    check(email)",
        "    send(email)",
      ],
    });
    expect(await patched.readFile("api/invite.py")).toContain(
      "2      check(email)",
    );
    expect(await patched.search("check(")).toContain("api/invite.py:2");
    expect((await patched.slice("api/invite.py", 2, 2)).text).toBe(
      "    check(email)",
    );
    // The original is untouched, and other files read as before.
    expect((await repo.slice("api/invite.py", 2, 2)).text).toBe(
      "    send(email)",
    );
    expect(await patched.readFile("web/index.ts")).toContain("INVITE");
  });

  it("refuses to overlay a file the survey does not list", async () => {
    const repo = await reader();
    expect(() => repo.withOverlay({ "api/new.py": ["x"] })).toThrow(
      /no readable file/,
    );
    expect(() => repo.withOverlay({ "../secret.txt": ["x"] })).toThrow(
      /outside the repository/,
    );
  });
});

describe("report_finding", () => {
  const input = {
    type: "architecture_weakness",
    severity: "high",
    title: "Email is sent before the invitation is saved",
    description: "A failure between the two leaves an email with no record.",
    suggestion: "Save first, then send.",
    path: "api/invite.py",
    startLine: 2,
    endLine: 3,
  };

  it("files a sound finding at once, with the code it cites", async () => {
    const filed: Finding[] = [];
    const seen: Finding[] = [];
    const repo = new RepoReader(root, await surveyRepo(root));
    const tool = reportFindingTool("chaos", repo, filed, (item) =>
      seen.push(item),
    );

    expect(await runTool(tool, input)).toEqual({
      text: "Recorded as f1.",
      failed: false,
    });
    expect(seen).toEqual(filed);
    expect(filed[0]).toMatchObject({
      uid: "chaos/f1",
      location: {
        path: "api/invite.py",
        startLine: 2,
        endLine: 3,
        quote: "    send(email)\n    save(email)",
      },
    });
  });

  it.each([
    [{ path: "api/missing.py" }, /no readable file/],
    [{ startLine: 90, endLine: 95 }, /does not exist/],
    [{ path: "../secret.txt" }, /outside the repository/],
    [{ severity: "urgent" }, /not valid/],
    [{ title: " " }, /needs a title/],
  ])("refuses a finding that points at nothing %#", async (change, reason) => {
    const filed: Finding[] = [];
    const repo = new RepoReader(root, await surveyRepo(root));
    const tool = reportFindingTool("chaos", repo, filed, () => {});
    const result = await runTool(tool, { ...input, ...change });
    expect(result.failed).toBe(true);
    expect(result.text).toMatch(reason);
    expect(filed).toEqual([]);
  });

  it("gives the read tools to an agent", async () => {
    const opened: string[] = [];
    const repo = new RepoReader(root, await surveyRepo(root));
    const tools = readTools(repo, (file) => opened.push(file));
    const read = tools.find((tool) => tool.name === "read_file");
    const result = await runTool(read, {
      path: "README.md",
      startLine: 0,
      endLine: 0,
    });
    expect(result.text).toContain("1  # Shop");
    expect(opened).toEqual(["README.md"]);
  });
});

describe("parseOrigin", () => {
  it("accepts a GitHub address and a listed folder", () => {
    expect(
      parseOrigin({
        kind: "github",
        url: "https://github.com/acme/shop.git/",
        branch: " main ",
      }),
    ).toEqual({
      ok: true,
      origin: {
        kind: "github",
        url: "https://github.com/acme/shop.git",
        branch: "main",
      },
    });
    expect(parseOrigin({ kind: "local", name: "shop" })).toEqual({
      ok: true,
      origin: { kind: "local", name: "shop" },
    });
  });

  it.each([
    [{ kind: "github", url: "https://gitlab.com/acme/shop" }],
    [{ kind: "github", url: "https://github.com/acme/shop; rm -rf /" }],
    [
      {
        kind: "github",
        url: "https://github.com/acme/shop",
        branch: "--upload-pack=x",
      },
    ],
    [{ kind: "local", name: "../etc" }],
    [{ kind: "local", name: ".git" }],
    [{ kind: "ftp" }],
    [null],
  ])("refuses %j", (input) => {
    expect(parseOrigin(input).ok).toBe(false);
  });
});

describe("a repository run", () => {
  const finding = (path: string, startLine: number, title: string) => ({
    tool: "report_finding",
    input: {
      type: "architecture_weakness",
      severity: "high",
      title,
      description: "Shown by the cited lines.",
      suggestion: "Fix it.",
      path,
      startLine,
      endLine: startLine,
    },
  });
  const script: Script = {
    ...SAMPLE_SCRIPT,
    challenges: {},
    judge: {
      kind: "ok",
      value: {
        groups: [
          {
            id: "g1",
            title: "Email is sent before the invitation is saved",
            type: "architecture_weakness",
            severity: "high",
            summary:
              "A failure between the two leaves an email with no record.",
            findingIds: ["chaos/f1"],
          },
        ],
        rejected: [{ findingId: "scale/f1", reason: "Not shown by the code." }],
      },
    },
    work_orders: {
      kind: "ok",
      value: {
        workOrders: [
          {
            id: "wo-1",
            title: "Save the invitation before sending the email",
            priority: "p1",
            description: "Swap the two steps.",
            acceptanceCriteria: [
              "Given a failed send, then the invitation exists.",
            ],
            groupIds: ["g1"],
          },
        ],
      },
    },
    tools: {
      model: [
        {
          tool: "read_file",
          input: { path: "README.md", startLine: 0, endLine: 0 },
        },
      ],
      chaos: [
        {
          tool: "read_file",
          input: { path: "api/invite.py", startLine: 0, endLine: 0 },
        },
        finding(
          "api/invite.py",
          2,
          "Email is sent before the invitation is saved",
        ),
        finding("api/ghost.py", 1, "Points at a file that is not there"),
      ],
      scale: [finding("api/server.go", 4, "Listens without a limit")],
    },
  };

  it("surveys, sends the agents into the code and reports findings live", async () => {
    const store = new MemoryRunStore();
    const llm = new ScriptedLlm(script);
    const events: StoredEvent[] = [];
    const run = newRun(
      "run-repo",
      {
        requirement: "",
        documents: [],
        repository: { kind: "local", name: "shop" },
      },
      { reasoning: "reasoning-model", agents: "agent-model" },
      new Date("2026-11-13T10:00:00Z"),
      true,
    );
    const done = await executeRun(
      {
        llm,
        store,
        publish: (_id, event) => void events.push(event),
        now: () => new Date(),
      },
      run,
    );

    expect(done.error).toBeNull();
    expect(done.status).toBe("completed");
    expect(done.title).toBe("shop");
    expect(done.source).toMatchObject({ label: "shop", files: 5 });
    expect(done.designModel?.operations.length).toBeGreaterThan(0);

    // Two findings were sound; the one citing a missing file was refused.
    const filed = done.agents.flatMap((agent) => agent.findings);
    expect(filed.map((item) => item.uid)).toEqual(["chaos/f1", "scale/f1"]);
    expect(filed[0].location?.quote).toBe("    send(email)");
    expect(llm.toolResults.filter((item) => item.failed)).toHaveLength(1);

    // Each sound finding was announced the moment it was filed, before the
    // agents stage ended, and the file being read was announced too.
    const types = events.map((item) => item.event.type);
    const agentsDone = events.findIndex(
      (item) =>
        item.event.type === "stage.completed" && item.event.stage === "agents",
    );
    const live = events
      .map((item, index) => ({ event: item.event, index }))
      .filter((item) => item.event.type === "agent.finding");
    expect(live).toHaveLength(2);
    expect(live.every((item) => item.index < agentsDone)).toBe(true);
    expect(types).toContain("agent.reading");
    expect(types[1]).toBe("stage.started");
    expect(events[1].event).toMatchObject({ stage: "survey" });

    expect(done.groups).toHaveLength(1);
    expect(done.rejected).toHaveLength(1);
    expect(done.workOrders).toHaveLength(1);
  });

  it("fails with the reason when the folder is not there", async () => {
    const run = newRun(
      "run-missing",
      {
        requirement: "",
        documents: [],
        repository: { kind: "local", name: "nowhere" },
      },
      { reasoning: "r", agents: "a" },
      new Date(),
      true,
    );
    const done = await executeRun(
      {
        llm: new ScriptedLlm(script),
        store: new MemoryRunStore(),
        publish: () => {},
        now: () => new Date(),
      },
      run,
    );
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/"nowhere" is not in the repositories folder/);
  });
});
