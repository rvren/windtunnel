/*
 * A remediation's code change: edits, each replacing lines of one file. The
 * engine checks each against the real file; this file turns checked edits
 * into a unified diff, for the screen, the exports and 8090.
 */

export interface CheckedEdit {
  path: string;
  /** The first replaced line, counting from 1. */
  startLine: number;
  /** The lines replaced, exactly as they are in the file. */
  before: string[];
  /** The lines that take their place. */
  after: string[];
  /** Up to three unchanged lines above and below, from the file. */
  contextBefore: string[];
  contextAfter: string[];
  /**
   * True when the hunk reaches the file's last line and the file does not
   * end with a line break. The diff must then say so, or git will not apply
   * it.
   */
  noNewlineAtEnd?: boolean;
}

const NO_NEWLINE = "\\ No newline at end of file";

/**
 * A unified diff with three lines of context, one hunk per edit, ordered by
 * file and line. Line numbers on the new side account for earlier edits in
 * the same file. `git apply --check` accepts it.
 */
export function toUnifiedDiff(edits: CheckedEdit[]): string {
  const byFile = new Map<string, CheckedEdit[]>();
  for (const edit of edits) {
    byFile.set(edit.path, [...(byFile.get(edit.path) ?? []), edit]);
  }
  const out: string[] = [];
  for (const [file, list] of byFile) {
    out.push(`--- a/${file}`, `+++ b/${file}`);
    let shift = 0;
    for (const edit of [...list].sort((a, b) => a.startLine - b.startLine)) {
      const oldStart = edit.startLine - edit.contextBefore.length;
      const oldCount =
        edit.contextBefore.length +
        edit.before.length +
        edit.contextAfter.length;
      const newCount =
        edit.contextBefore.length +
        edit.after.length +
        edit.contextAfter.length;
      const newStart = oldStart + shift;
      out.push(
        `@@ -${oldCount === 0 ? oldStart - 1 : oldStart},${oldCount} +${newCount === 0 ? newStart - 1 : newStart},${newCount} @@`,
      );
      const end = edit.noNewlineAtEnd === true;
      out.push(...edit.contextBefore.map((line) => ` ${line}`));
      out.push(...edit.before.map((line) => `-${line}`));
      if (end && edit.contextAfter.length === 0 && edit.before.length > 0) {
        out.push(NO_NEWLINE);
      }
      out.push(...edit.after.map((line) => `+${line}`));
      if (end && edit.contextAfter.length === 0 && edit.after.length > 0) {
        out.push(NO_NEWLINE);
      }
      out.push(...edit.contextAfter.map((line) => ` ${line}`));
      if (end && edit.contextAfter.length > 0) out.push(NO_NEWLINE);
      shift += edit.after.length - edit.before.length;
    }
  }
  return out.length > 0 ? `${out.join("\n")}\n` : "";
}
