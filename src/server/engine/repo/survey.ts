import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { RunError } from "../llm";

/*
 * The inventory of a repository: which files there are, in any language.
 * Nothing is parsed and nothing is run. Folders that hold other people's code
 * or build output are skipped, and so is anything that is not text.
 */

export const REPO_LIMITS = {
  /** Text files, after skipping. Over this the run is refused. */
  files: 6_000,
  /** Total size of those files. */
  bytes: 40_000_000,
  /** A single file larger than this is listed but cannot be read. */
  fileBytes: 400_000,
} as const;

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "bower_components",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".tox",
  ".gradle",
  ".idea",
  ".vscode",
  "Pods",
  "DerivedData",
  ".terraform",
]);

const MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "mix.exs",
  "Package.swift",
  "CMakeLists.txt",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "pubspec.yaml",
  "deno.json",
]);

export interface RepoFile {
  /** Relative to the repository root, with forward slashes. */
  path: string;
  size: number;
  /** False for a text file over the per-file size limit. */
  readable: boolean;
}

export interface Survey {
  files: RepoFile[];
  totalBytes: number;
  /** Files left out: binary, or inside a skipped folder. */
  skipped: number;
  /** File extensions by how many files have them, most first. */
  languages: { extension: string; files: number }[];
  manifests: string[];
}

/** Text or not, by looking for a NUL byte at the start of the file. */
async function isText(file: string): Promise<boolean> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

export async function surveyRepo(root: string): Promise<Survey> {
  const files: RepoFile[] = [];
  const extensions = new Map<string, number>();
  const manifests: string[] = [];
  let totalBytes = 0;
  let skipped = 0;

  async function walk(folder: string, relative: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      // Symlinks are never followed: they can point outside the repository.
      if (entry.isSymbolicLink()) {
        skipped += 1;
      } else if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) skipped += 1;
        else await walk(full, rel);
      } else if (entry.isFile()) {
        const { size } = await stat(full);
        if (size === 0 || !(await isText(full))) {
          skipped += 1;
          continue;
        }
        files.push({
          path: rel,
          size,
          readable: size <= REPO_LIMITS.fileBytes,
        });
        totalBytes += size;
        if (files.length > REPO_LIMITS.files) {
          throw new RunError(
            `This repository has more than ${REPO_LIMITS.files.toLocaleString("en")} text files. That is over the limit for one run.`,
          );
        }
        if (totalBytes > REPO_LIMITS.bytes) {
          throw new RunError(
            `This repository holds more than ${Math.round(REPO_LIMITS.bytes / 1_000_000)} MB of text. That is over the limit for one run.`,
          );
        }
        const extension = path.extname(entry.name).toLowerCase() || "(none)";
        extensions.set(extension, (extensions.get(extension) ?? 0) + 1);
        if (MANIFESTS.has(entry.name)) manifests.push(rel);
      }
    }
  }

  await walk(root, "");
  if (files.length === 0) {
    throw new RunError("This repository has no text files to read.");
  }

  return {
    files,
    totalBytes,
    skipped,
    manifests,
    languages: [...extensions.entries()]
      .map(([extension, count]) => ({ extension, files: count }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 12),
  };
}

/**
 * Surveys every workspace of a project as one. Each file's path gains its
 * workspace name as a first part, and the limits apply to the whole.
 */
export async function surveyWorkspaces(
  roots: { name: string; root: string }[],
): Promise<Survey> {
  const parts = await Promise.all(
    roots.map(async ({ name, root }) => ({
      name,
      survey: await surveyRepo(root),
    })),
  );
  const files = parts.flatMap(({ name, survey }) =>
    survey.files.map((file) => ({ ...file, path: `${name}/${file.path}` })),
  );
  const totalBytes = parts.reduce(
    (sum, part) => sum + part.survey.totalBytes,
    0,
  );
  if (files.length > REPO_LIMITS.files || totalBytes > REPO_LIMITS.bytes) {
    throw new RunError(
      `Together the workspaces hold ${files.length.toLocaleString("en")} text files and ${Math.round(totalBytes / 1_000_000)} MB. That is over the limit for one run (${REPO_LIMITS.files.toLocaleString("en")} files, ${Math.round(REPO_LIMITS.bytes / 1_000_000)} MB).`,
    );
  }
  const extensions = new Map<string, number>();
  for (const { survey } of parts) {
    for (const item of survey.languages) {
      extensions.set(
        item.extension,
        (extensions.get(item.extension) ?? 0) + item.files,
      );
    }
  }
  return {
    files,
    totalBytes,
    skipped: parts.reduce((sum, part) => sum + part.survey.skipped, 0),
    manifests: parts.flatMap(({ name, survey }) =>
      survey.manifests.map((manifest) => `${name}/${manifest}`),
    ),
    languages: [...extensions.entries()]
      .map(([extension, count]) => ({ extension, files: count }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 12),
  };
}

/** A short map of the repository for a prompt: top folders and file counts. */
export function outline(survey: Survey): string {
  const folders = new Map<string, number>();
  for (const file of survey.files) {
    const parts = file.path.split("/");
    const key =
      parts.length === 1
        ? "(root)"
        : parts.slice(0, Math.min(2, parts.length - 1)).join("/");
    folders.set(key, (folders.get(key) ?? 0) + 1);
  }
  const lines = [...folders.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 80)
    .map(([folder, count]) => `${folder}/  ${count} files`);
  return [
    `${survey.files.length} text files, ${Math.round(survey.totalBytes / 1000)} kB.`,
    `Most common file types: ${survey.languages.map((item) => `${item.extension} (${item.files})`).join(", ")}.`,
    survey.manifests.length
      ? `Manifests: ${survey.manifests.slice(0, 20).join(", ")}.`
      : "",
    "Folders:",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}
