import type { RemediationRecord } from "../engine/schema";

/*
 * Applies a remediation's checked edits to a file's text, for a pull
 * request. Pure. Every edit's "before" lines must still be exactly where
 * the edit says (ignoring trailing spaces), or nothing is applied: a file
 * that moved on since the run is refused rather than patched blindly.
 */

type Edit = RemediationRecord["edits"][number];

/** How a secret's value is written in everything Windtunnel keeps. */
export const SECRET_MASK = "••••";

/**
 * Whether a line of the file is the line an edit expects. A secret's value
 * was masked when the run kept the edit, so the mask stands for any text:
 * the line matches without Windtunnel ever knowing the secret.
 */
export function sameLine(actual: string, expected: string): boolean {
  const want = expected.trimEnd();
  const have = actual.trimEnd();
  if (!want.includes(SECRET_MASK)) return have === want;
  const pattern = want
    .split(SECRET_MASK)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".+?");
  return new RegExp(`^${pattern}$`).test(have);
}

export type Applied =
  { ok: true; text: string } | { ok: false; reason: string };

export function applyEdits(text: string, edits: Edit[]): Applied {
  const endsWithNewline = text.endsWith("\n");
  const lines = (endsWithNewline ? text.slice(0, -1) : text).split("\n");
  // Bottom first, so earlier line numbers stay true.
  const ordered = [...edits].sort((a, b) => b.startLine - a.startLine);
  for (let index = 1; index < ordered.length; index += 1) {
    const lower = ordered[index - 1];
    const upper = ordered[index];
    if (upper.startLine + upper.before.length > lower.startLine) {
      return { ok: false, reason: "Two edits overlap." };
    }
  }
  for (const edit of ordered) {
    if (edit.after.some((line) => line.includes(SECRET_MASK))) {
      return {
        ok: false,
        reason: "The fix would write a masked secret into the code.",
      };
    }
    const at = edit.startLine - 1;
    const current = lines.slice(at, at + edit.before.length);
    const same =
      current.length === edit.before.length &&
      current.every((line, i) => sameLine(line, edit.before[i]));
    if (!same) {
      return {
        ok: false,
        reason: `Line ${edit.startLine} of the file has changed since the run read it.`,
      };
    }
    lines.splice(at, edit.before.length, ...edit.after);
  }
  return { ok: true, text: lines.join("\n") + (endsWithNewline ? "\n" : "") };
}
