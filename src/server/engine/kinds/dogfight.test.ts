import { describe, expect, it } from "vitest";

import { applyEdits } from "../../issues/apply";
import { ToolFailure } from "../llm";

import { checkAttack, combinedEdits } from "./dogfight";

describe("combinedEdits", () => {
  const original = {
    "a.py": ["one", "two", "three", "four", "five", ""],
    "b.py": ["keep", "old", ""],
  };
  const final = {
    "a.py": ["one", "TWO", "2b", "three", "four", "FIVE", ""],
    "b.py": ["keep", "old", ""],
  };

  it("rebuilds the files as the last round left them", () => {
    const edits = combinedEdits(original, final);
    expect(edits.map((edit) => edit.path)).toEqual(["a.py"]);
    const applied = applyEdits(original["a.py"].join("\n"), edits);
    expect(applied).toEqual({ ok: true, text: final["a.py"].join("\n") });
  });

  it("keeps up to three lines of context from the original", () => {
    const [edit] = combinedEdits(original, final);
    expect(edit.startLine).toBe(2);
    expect(edit.contextBefore).toEqual(["one"]);
    expect(edit.contextAfter).toEqual([]);
  });
});

describe("checkAttack", () => {
  const reader = {
    async slice(path: string, startLine: number, endLine: number) {
      if (path !== "search.py") throw new ToolFailure("no such file");
      return { path, startLine, endLine, totalLines: 9, text: "LIKE %s" };
    },
  };

  it("keeps a way through that cites the fixed code", async () => {
    const attack = await checkAttack(
      {
        verdict: "through",
        title: "Wildcards",
        how: "…",
        path: "search.py",
        startLine: 5,
        endLine: 6,
      },
      reader,
    );
    expect(attack.verdict).toBe("through");
    expect(attack.location?.quote).toBe("LIKE %s");
  });

  it("counts a way through with no real lines as holding", async () => {
    const attack = await checkAttack(
      {
        verdict: "through",
        title: "Something",
        how: "…",
        path: "nowhere.py",
        startLine: 1,
        endLine: 2,
      },
      reader,
    );
    expect(attack).toMatchObject({ verdict: "held", location: null });
    expect(attack.title).toMatch(/named no lines/);
  });
});
