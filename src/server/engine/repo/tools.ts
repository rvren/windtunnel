import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { ToolFailure } from "../llm";
import type { Survey } from "./survey";

/*
 * The only way an agent touches a repository: three read-only tools.
 *
 * Every path an agent gives is untrusted. It is resolved inside the
 * repository root, must be one of the surveyed text files, and its real
 * location (after any symlink) must still be inside the root. Nothing here
 * writes, and nothing from the repository is ever executed.
 */

export const READ_LIMITS = {
  /** Lines returned by one read_file call. */
  lines: 400,
  /** Bytes one agent may read in a run. After that the tools say so. */
  bytesPerAgent: 900_000,
  /** Matches returned by one search. */
  matches: 60,
} as const;

export { ToolFailure as ToolError };

export interface FileSlice {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  text: string;
}

export class RepoReader {
  private readonly byPath: Map<string, { size: number; readable: boolean }>;
  private readonly cache = new Map<string, string[]>();
  private bytesRead = 0;

  constructor(
    /** One folder, or in a project run one folder per workspace name. */
    private readonly root: string | Record<string, string>,
    private readonly survey: Survey,
  ) {
    this.byPath = new Map(survey.files.map((file) => [file.path, file]));
  }

  /** A fresh budget over the same repository, for another agent. */
  fork(): RepoReader {
    const reader = new RepoReader(this.root, this.survey);
    for (const [key, value] of this.cache) reader.cache.set(key, value);
    return reader;
  }

  private clean(input: string): string {
    const normal = path.posix
      .normalize(input.replace(/\\/g, "/"))
      .replace(/^(\.\/)+/, "")
      .replace(/\/+$/, "");
    if (normal === "." || normal === "") return "";
    if (
      normal.startsWith("../") ||
      normal === ".." ||
      path.posix.isAbsolute(normal)
    ) {
      throw new ToolFailure(`"${input}" is outside the repository.`);
    }
    return normal;
  }

  private async lines(relative: string): Promise<string[]> {
    const file = this.byPath.get(relative);
    if (!file)
      throw new ToolFailure(
        `There is no readable file "${relative}". Use list_files to see what exists.`,
      );
    if (!file.readable)
      throw new ToolFailure(`"${relative}" is too large to read.`);
    const cached = this.cache.get(relative);
    if (cached) return cached;

    // In a project run the first part of the path names the workspace, and
    // the file must stay inside that workspace's own folder.
    let root = this.root as string;
    let inner = relative;
    if (typeof this.root !== "string") {
      const slash = relative.indexOf("/");
      const workspace = relative.slice(0, slash);
      root = this.root[workspace];
      inner = relative.slice(slash + 1);
      if (slash === -1 || !root) {
        throw new ToolFailure(`"${relative}" is outside the repository.`);
      }
    }
    const full = path.join(root, inner);
    const [realRoot, realFile] = await Promise.all([
      realpath(root),
      realpath(full),
    ]);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
      throw new ToolFailure(`"${relative}" is outside the repository.`);
    }
    const lines = (await readFile(realFile, "utf8")).split(/\r?\n/);
    this.cache.set(relative, lines);
    return lines;
  }

  /** Every line of a file, for code that scans the repository. */
  async allLines(input: string): Promise<string[]> {
    return this.lines(this.clean(input));
  }

  /** Does this file exist and do these lines exist in it? Used to check findings. */
  async slice(
    input: string,
    startLine: number,
    endLine: number,
  ): Promise<FileSlice> {
    const relative = this.clean(input);
    const lines = await this.lines(relative);
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine
    ) {
      throw new ToolFailure(
        "Give a start line of 1 or more and an end line that is not before it.",
      );
    }
    if (startLine > lines.length) {
      throw new ToolFailure(
        `"${relative}" has ${lines.length} lines; line ${startLine} does not exist.`,
      );
    }
    const end = Math.min(endLine, lines.length);
    return {
      path: relative,
      startLine,
      endLine: end,
      totalLines: lines.length,
      text: lines.slice(startLine - 1, end).join("\n"),
    };
  }

  listFiles(input = ""): string {
    const folder = this.clean(input);
    const prefix = folder ? `${folder}/` : "";
    const folders = new Map<string, number>();
    const here: string[] = [];
    for (const file of this.survey.files) {
      if (!file.path.startsWith(prefix)) continue;
      const rest = file.path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1)
        here.push(
          `${rest}  (${file.size} bytes${file.readable ? "" : ", too large to read"})`,
        );
      else
        folders.set(
          rest.slice(0, slash),
          (folders.get(rest.slice(0, slash)) ?? 0) + 1,
        );
    }
    if (here.length === 0 && folders.size === 0) {
      throw new ToolFailure(`There is no folder "${input}".`);
    }
    return [
      ...[...folders.entries()].map(
        ([name, count]) => `${name}/  (${count} files)`,
      ),
      ...here,
    ].join("\n");
  }

  async readFile(
    input: string,
    startLine = 1,
    endLine?: number,
  ): Promise<string> {
    if (this.bytesRead >= READ_LIMITS.bytesPerAgent) {
      throw new ToolFailure(
        "You have used your reading budget for this run. Report what you have found and finish.",
      );
    }
    const start = Math.max(1, Math.trunc(startLine) || 1);
    const wanted = endLine
      ? Math.trunc(endLine)
      : start + READ_LIMITS.lines - 1;
    const slice = await this.slice(
      input,
      start,
      Math.min(Math.max(wanted, start), start + READ_LIMITS.lines - 1),
    );
    this.bytesRead += slice.text.length;
    const width = String(slice.endLine).length;
    const numbered = slice.text
      .split("\n")
      .map(
        (line, index) =>
          `${String(slice.startLine + index).padStart(width)}  ${line}`,
      )
      .join("\n");
    const more =
      slice.endLine < slice.totalLines
        ? `\n(lines ${slice.startLine}-${slice.endLine} of ${slice.totalLines}; read on from line ${slice.endLine + 1})`
        : `\n(lines ${slice.startLine}-${slice.endLine} of ${slice.totalLines}; end of file)`;
    return numbered + more;
  }

  /** Plain text search, case-insensitive. No patterns, so no runaway regex. */
  async search(text: string, under = ""): Promise<string> {
    const needle = text.trim().toLowerCase();
    if (needle.length < 2)
      throw new ToolFailure("Search for at least two characters.");
    const folder = this.clean(under);
    const prefix = folder ? `${folder}/` : "";
    const found: string[] = [];
    let files = 0;
    for (const file of this.survey.files) {
      if (!file.readable || !file.path.startsWith(prefix)) continue;
      const lines = await this.lines(file.path);
      let hit = false;
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].toLowerCase().includes(needle)) continue;
        hit = true;
        if (found.length < READ_LIMITS.matches) {
          found.push(
            `${file.path}:${index + 1}  ${lines[index].trim().slice(0, 200)}`,
          );
        }
      }
      if (hit) files += 1;
    }
    if (found.length === 0) return `No file contains "${text}".`;
    return `${found.join("\n")}\n(${files} files match${found.length >= READ_LIMITS.matches ? `; showing the first ${READ_LIMITS.matches} lines` : ""})`;
  }
}
