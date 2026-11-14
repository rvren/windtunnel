import { execFile } from "node:child_process";
import { mkdir, readdir, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { RunError } from "../llm";

const run = promisify(execFile);

/*
 * Getting a repository onto disk, read-only in spirit: a shallow clone of a
 * GitHub URL into a scratch folder, or a folder that already sits under the
 * one allowed root. Nothing from it is installed, built or run.
 */

export type RepoOrigin =
  | { kind: "github"; url: string; branch: string | null }
  | { kind: "local"; name: string };

const GITHUB_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const BRANCH = /^[A-Za-z0-9._\/-]{1,200}$/;
const FOLDER = /^[A-Za-z0-9._-]{1,200}$/;

/** Checks what a person typed. Returns the origin, or the reason it is refused. */
export function parseOrigin(
  input: unknown,
): { ok: true; origin: RepoOrigin } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (typeof input !== "object" || input === null)
    return fail("Choose a repository.");
  const { kind, url, branch, name } = input as Record<string, unknown>;
  if (kind === "github") {
    if (typeof url !== "string" || !GITHUB_URL.test(url.trim())) {
      return fail(
        "Enter a GitHub repository address, such as https://github.com/owner/name.",
      );
    }
    const wanted =
      typeof branch === "string" && branch.trim() ? branch.trim() : null;
    if (
      wanted &&
      (!BRANCH.test(wanted) || wanted.includes("..") || wanted.startsWith("-"))
    ) {
      return fail("That branch name is not valid.");
    }
    return {
      ok: true,
      origin: { kind, url: url.trim().replace(/\/$/, ""), branch: wanted },
    };
  }
  if (kind === "local") {
    if (
      typeof name !== "string" ||
      !FOLDER.test(name) ||
      name.startsWith(".")
    ) {
      return fail("Choose a folder from the list.");
    }
    return { ok: true, origin: { kind, name } };
  }
  return fail("Choose a repository.");
}

export function originLabel(origin: RepoOrigin): string {
  if (origin.kind === "local") return origin.name;
  const [, owner, name] = GITHUB_URL.exec(origin.url) ?? [];
  return `${owner}/${name}${origin.branch ? ` (${origin.branch})` : ""}`;
}

/** The one folder whose subfolders may be run against. */
export function reposRoot(): string {
  return path.resolve(
    process.env.WINDTUNNEL_REPOS_DIR?.trim() ||
      path.join(process.cwd(), "repos"),
  );
}

/** The folders a person may pick: direct children of the allowed root. */
export async function localRepos(): Promise<string[]> {
  try {
    const entries = await readdir(reposRoot(), { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          FOLDER.test(entry.name) &&
          !entry.name.startsWith("."),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export interface PreparedRepo {
  root: string;
  /** Removes anything that was created for this run. */
  cleanup: () => Promise<void>;
}

export async function prepareRepo(
  origin: RepoOrigin,
  runId: string,
): Promise<PreparedRepo> {
  if (origin.kind === "local") {
    const root = path.join(reposRoot(), origin.name);
    try {
      const [realRoot, realBase] = await Promise.all([
        realpath(root),
        realpath(reposRoot()),
      ]);
      if (
        !realRoot.startsWith(realBase + path.sep) ||
        !(await stat(realRoot)).isDirectory()
      )
        throw new Error();
      return { root: realRoot, cleanup: async () => {} };
    } catch {
      throw new RunError(
        `The folder "${origin.name}" is not in the repositories folder.`,
      );
    }
  }

  const base = path.join(
    process.env.WINDTUNNEL_WORK_DIR?.trim() || os.tmpdir(),
    "windtunnel-repos",
  );
  const root = path.join(base, runId);
  await mkdir(base, { recursive: true });
  const cleanup = () => rm(root, { recursive: true, force: true });

  // A token, when set, is sent as a header for this one command. It is not
  // written to the clone's config and never appears in the address.
  const token = process.env.GITHUB_TOKEN?.trim();
  const auth = token
    ? [
        "-c",
        `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
      ]
    : [];
  const args = [
    ...auth,
    "clone",
    "--depth",
    "1",
    "--single-branch",
    "--no-tags",
    ...(origin.branch ? ["--branch", origin.branch] : []),
    "--",
    `${origin.url}.git`,
    root,
  ];
  try {
    await run("git", args, {
      timeout: 180_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
    });
  } catch (error) {
    await cleanup();
    const text = String((error as { stderr?: string }).stderr ?? "");
    if ((error as { code?: string }).code === "ENOENT") {
      throw new RunError(
        "git is not installed on the server, so a repository cannot be cloned.",
      );
    }
    if (
      /not found|Authentication failed|could not read Username|403/i.test(text)
    ) {
      throw new RunError(
        token
          ? "GitHub refused access to that repository. Check the address and what GITHUB_TOKEN is allowed to read."
          : "That repository was not found. If it is private, add GITHUB_TOKEN to .env.local and restart the server.",
      );
    }
    if (/Remote branch .* not found/i.test(text)) {
      throw new RunError(
        `The branch "${origin.branch}" does not exist in that repository.`,
      );
    }
    throw new RunError(
      "The repository could not be cloned. Check the address and the network.",
    );
  }
  return { root, cleanup };
}
