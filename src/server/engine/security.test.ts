import path from "node:path";

import { describe, expect, it } from "vitest";

import { toUnifiedDiff } from "@/lib/patch";

import { checkEdits, secretGroups, toRecord } from "./remediation";
import { piiOf, secretOf, sinksOf, takeInventory } from "./repo/inventory";
import { surveyRepo } from "./repo/survey";
import { RepoReader } from "./repo/tools";
import { resolveCwe, resolveOwasp } from "./security-refs";

const SAMPLES = path.resolve(
  import.meta.dirname,
  "../../../samples/storefront",
);

async function readerFor(service: string) {
  const root = path.join(SAMPLES, service);
  return new RepoReader(root, await surveyRepo(root));
}

const edit = (
  startLine: number,
  endLine: number,
  before: string,
  after: string,
  file = "search.py",
) => ({ path: file, startLine, endLine, before, after });

describe("checking a remediation's edits against the code", () => {
  it("keeps an edit whose text is exactly what the file holds, with context", async () => {
    const reader = await readerFor("catalog");
    const { edits, dropped } = await checkEdits(
      [
        edit(
          5,
          5,
          '    sql = "SELECT id, name, price FROM products WHERE name LIKE \'%" + query + "%\'"   ',
          '    sql = "SELECT id, name, price FROM products WHERE name LIKE %s"',
        ),
      ],
      reader,
    );
    expect(dropped).toEqual([]);
    expect(edits).toHaveLength(1);
    expect(edits[0].contextBefore).toEqual(["", "", "def search(query):"]);
    expect(edits[0].contextAfter).toEqual([
      "    return catalog_db.execute(sql).fetchall()",
    ]);
  });

  it.each([
    [
      "text that is not in the file",
      edit(5, 5, "    sql = something_else", "x"),
    ],
    ["lines that do not match the text", edit(5, 6, "    one line", "x")],
    ["a line past the end", edit(40, 40, "nothing", "x")],
    [
      "a path outside the repository",
      edit(1, 1, "x", "y", "../orders/orders.py"),
    ],
    ["a file that does not exist", edit(1, 1, "x", "y", "ghost.py")],
    ["a lockfile", edit(1, 1, "x", "y", "poetry.lock")],
    ["a vendored file", edit(1, 1, "x", "y", "vendor/lib.py")],
    ["a minified file", edit(1, 1, "x", "y", "static/app.min.js")],
  ])("drops %s", async (_label, given) => {
    const reader = await readerFor("catalog");
    const { edits, dropped } = await checkEdits([given], reader);
    expect(edits).toEqual([]);
    expect(dropped).toHaveLength(1);
  });

  it("drops overlapping edits and edits past the limits", async () => {
    const reader = await readerFor("catalog");
    const line = "from db import catalog_db";
    const { edits, dropped } = await checkEdits(
      [
        edit(1, 1, line, "a"),
        edit(1, 1, line, "b"),
        edit(4, 4, "def search(query):", Array(90).fill("x").join("\n")),
      ],
      reader,
    );
    expect(edits.map((item) => item.after)).toEqual([["a"]]);
    expect(dropped.map((item) => item.reason)).toEqual([
      "It overlaps another edit to the same lines.",
      "A remediation changes at most 80 lines.",
    ]);
  });

  it("checks nothing when the run read no code", async () => {
    const { edits, dropped } = await checkEdits([edit(1, 1, "a", "b")], null);
    expect(edits).toEqual([]);
    expect(dropped[0].reason).toContain("no code");
  });

  it("builds a diff that git can apply, with line numbers shifted by earlier edits", () => {
    const diff = toUnifiedDiff([
      {
        path: "a.py",
        startLine: 2,
        before: ["two"],
        after: ["two", "two and a half"],
        contextBefore: ["one"],
        contextAfter: ["three"],
      },
      {
        path: "a.py",
        startLine: 5,
        before: ["five"],
        after: ["FIVE"],
        contextBefore: ["four"],
        contextAfter: [],
      },
    ]);
    expect(diff).toBe(
      [
        "--- a/a.py",
        "+++ b/a.py",
        "@@ -1,3 +1,4 @@",
        " one",
        "-two",
        "+two",
        "+two and a half",
        " three",
        "@@ -4,2 +5,2 @@",
        " four",
        "-five",
        "+FIVE",
        "",
      ].join("\n"),
    );
  });
});

describe("a file with no line break at its end", () => {
  it("is marked in the diff, so git applies it", () => {
    const base = {
      path: "a.js",
      startLine: 2,
      before: ["two"],
      after: ["TWO"],
      contextBefore: ["one"],
    };
    expect(
      toUnifiedDiff([{ ...base, contextAfter: ["end"], noNewlineAtEnd: true }]),
    ).toBe(
      [
        "--- a/a.js",
        "+++ b/a.js",
        "@@ -1,3 +1,3 @@",
        " one",
        "-two",
        "+TWO",
        " end",
        "\\ No newline at end of file",
        "",
      ].join("\n"),
    );
    expect(
      toUnifiedDiff([{ ...base, contextAfter: [], noNewlineAtEnd: true }]),
    ).toBe(
      [
        "--- a/a.js",
        "+++ b/a.js",
        "@@ -1,2 +1,2 @@",
        " one",
        "-two",
        "\\ No newline at end of file",
        "+TWO",
        "\\ No newline at end of file",
        "",
      ].join("\n"),
    );
  });
});

describe("CWE and OWASP", () => {
  it("keeps a known CWE and finds the OWASP category by code or name", () => {
    const owasp = resolveOwasp("A03:2021 Injection");
    expect(owasp.name).toBe("Injection");
    expect(resolveOwasp("a01").name).toBe("Broken Access Control");
    expect(resolveOwasp("Server-Side Request Forgery").id).toBe("A10:2021");
    expect(resolveCwe("cwe-89", owasp)).toMatchObject({
      id: "CWE-89",
      name: "SQL Injection",
      fallback: false,
    });
  });

  it("falls back to the category's CWE for an unknown id", () => {
    const owasp = resolveOwasp("A01:2021");
    expect(resolveCwe("CWE-99999", owasp)).toMatchObject({
      id: "CWE-284",
      fallback: true,
    });
    expect(resolveCwe("not a cwe", owasp).fallback).toBe(true);
  });

  it("never echoes a secret's value in what it keeps", async () => {
    const record = await toRecord(
      "secret-1",
      {
        summary: "The key s3cr3t-value-123 is in the code.",
        steps: ["Remove s3cr3t-value-123."],
        cwe: "CWE-798",
        owasp: "A07",
        edits: [],
        notes: [],
      },
      null,
      ["s3cr3t-value-123"],
    );
    expect(JSON.stringify(record)).not.toContain("s3cr3t-value-123");
  });
});

describe("the data inventory", () => {
  it("knows names that hold personal data, and leaves the rest", () => {
    expect(piiOf("user_email")).toMatchObject({ category: "contact" });
    expect(piiOf("dateOfBirth")).toMatchObject({ category: "identity" });
    expect(piiOf("card")).toMatchObject({ category: "financial" });
    expect(piiOf("clientIp")).toMatchObject({ category: "online" });
    expect(piiOf("diagnosis_code")).toMatchObject({ category: "health" });
    // About the field, not the data; or a short word inside another.
    expect(piiOf("emailTemplate")).toBeNull();
    expect(piiOf("isEmailVerified")).toBeNull();
    expect(piiOf("pinned")).toBeNull();
    expect(piiOf("scorecard")).toBeNull();
    expect(piiOf("index")).toBeNull();
  });

  it("sees where a line sends what it holds", () => {
    expect(sinksOf('log.Printf("charging card %s", card)')).toEqual(["log"]);
    expect(sinksOf("console.log(user.email)")).toEqual(["log"]);
    expect(sinksOf("await fetch(url, { body: email })")).toEqual(["outside"]);
    expect(sinksOf("db.users.insert({ email })")).toEqual(["storage"]);
    expect(sinksOf("res.json({ phone })")).toEqual(["response"]);
    expect(sinksOf("const x = email")).toEqual([]);
  });

  it("finds secrets, masks them, and ignores placeholders", () => {
    const key = `AKIA${"ABCDEFGHIJKLMNOP"}`;
    expect(secretOf(`aws = "${key}"`)).toMatchObject({
      kind: "AWS access key",
      value: key,
    });
    expect(secretOf(`aws = "${key}"`)?.masked).not.toContain(key);
    expect(secretOf('const apiKey = "9f8e7d6c5b4a"')).toMatchObject({
      kind: "Hard-coded secret",
    });
    expect(secretOf("-----BEGIN RSA PRIVATE KEY-----")?.kind).toBe(
      "Private key",
    );
    for (const safe of [
      "password = process.env.PASSWORD",
      'apiKey = "${API_KEY}"',
      'password = "changeme"',
      'secret: "<your-secret>"',
      'token = ""',
    ]) {
      expect(secretOf(safe)).toBeNull();
    }
  });

  it("takes the inventory of a sample service", async () => {
    const reader = await readerFor("billing");
    const files = ["charge.go", "server.go", "README.md"];
    const { inventory, secretValues } = await takeInventory(files, (file) =>
      reader.allLines(file),
    );
    expect(inventory.filesScanned).toBe(3);
    expect(inventory.pii).toContainEqual(
      expect.objectContaining({
        category: "financial",
        path: "charge.go",
        line: 11,
        sinks: ["log"],
      }),
    );
    expect(inventory.secrets).toEqual([
      expect.objectContaining({
        kind: "Hard-coded secret",
        path: "charge.go",
        line: 17,
      }),
    ]);
    expect(JSON.stringify(inventory)).not.toContain("b1ll1ng-gateway-2026");
    expect(secretValues).toEqual(["b1ll1ng-gateway-2026"]);

    const [group] = secretGroups(inventory);
    expect(group).toMatchObject({
      id: "secret-1",
      type: "security_vulnerability",
      severity: "critical",
      foundBy: "code",
      location: { path: "charge.go", startLine: 17 },
    });
    expect(group.location?.quote).not.toContain("b1ll1ng-gateway-2026");
  });
});
