import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_IDS } from "@/lib/agents";
import { STAGES } from "@/server/engine/schema";

// docs/architecture.md must stay true to the code. These checks fail when a
// file it names is moved or removed, or when a stage, agent or table is added
// without the document being updated.

const ROOT = path.resolve(import.meta.dirname, "..");
const doc = () => readFile(path.join(ROOT, "docs/architecture.md"), "utf8");

describe("docs/architecture.md", () => {
  it("names only files and folders that exist", async () => {
    const text = await doc();
    const paths = [
      ...new Set(
        [
          ...text.matchAll(
            /(?:^|[\s`(>])((?:src|docs|drizzle|samples|scripts)\/[\w./()[\]-]*[\w)\]])/g,
          ),
        ].map(([, found]) => found.replace(/\/\*\*.*$/, "")),
      ),
    ].filter((found) => !found.includes("**") && !found.includes("…"));
    expect(paths.length).toBeGreaterThan(40);
    const missing: string[] = [];
    for (const found of paths) {
      try {
        await access(path.join(ROOT, found));
      } catch {
        missing.push(found);
      }
    }
    expect(missing).toEqual([]);
  });

  it("covers every stage and every agent", async () => {
    const text = await doc();
    for (const stage of STAGES) expect(text).toContain(stage);
    for (const agent of AGENT_IDS) expect(text).toContain(`\`${agent}\``);
  });

  it("lists every table", async () => {
    const [text, schema] = await Promise.all([
      doc(),
      readFile(path.join(ROOT, "src/server/db/schema.ts"), "utf8"),
    ]);
    const tables = [...schema.matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map(
      ([, name]) => name,
    );
    expect(tables.length).toBeGreaterThan(5);
    for (const table of tables) expect(text).toContain(`\`${table}\``);
  });
});
