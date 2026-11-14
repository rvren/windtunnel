import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPLAIN } from "./explain";

/** Every .tsx file under src/components. */
function screens(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return screens(full);
    return name.endsWith(".tsx") ? [full] : [];
  });
}

describe("the words behind the info tooltips", () => {
  const code = screens(path.resolve(import.meta.dirname, "../components"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  it("are each shown by some widget", () => {
    for (const key of Object.keys(EXPLAIN)) {
      expect(code, `no widget shows "${key}"`).toMatch(
        new RegExp(`["']${key}["']`),
      );
    }
  });

  it("stay short: four sentences and 330 characters at most", () => {
    for (const [key, text] of Object.entries(EXPLAIN)) {
      const sentences = text.split(/(?<=\.)\s+/).length;
      expect(sentences, key).toBeLessThanOrEqual(4);
      expect(text.length, key).toBeLessThan(330);
    }
  });
});
