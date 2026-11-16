/*
 * The few GitHub calls a fix pull request needs, with GITHUB_TOKEN from the
 * environment. The token is sent as a header and never stored, logged or
 * returned. Nothing here runs code from a repository: it reads files and
 * writes a branch, a commit and a pull request through the REST API.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function githubToken(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

/** "owner/name" from a GitHub address, or null. */
export function repoOf(url: string): string | null {
  const match = /github\.com[/:]([^/]+)\/([^/.\s]+?)(?:\.git)?\/?$/.exec(
    url.trim(),
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  step?: string,
): Promise<T> {
  const token = githubToken();
  if (!token) {
    throw new GitHubError(
      "No GITHUB_TOKEN is set. Add one that can write to the repository.",
      401,
    );
  }
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    const where = step ? ` while ${step}` : "";
    throw new GitHubError(
      response.status === 403 || response.status === 404
        ? `GitHub refused (${response.status})${where}. ${step?.includes("pull request") ? "The token needs Pull requests: write" : "The token needs Contents: write"} on this repository.`
        : `GitHub answered ${response.status}${where}: ${detail?.message ?? "no detail"}.`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/** Whether the token may push to the repository, and its default branch. */
export async function access(
  repo: string,
): Promise<{ canPush: boolean; defaultBranch: string }> {
  const answer = await call<{
    default_branch: string;
    permissions?: { push?: boolean };
  }>("GET", `/repos/${repo}`);
  return {
    canPush: Boolean(answer.permissions?.push),
    defaultBranch: answer.default_branch,
  };
}

/** A file's text at a branch, or null when it is not there. */
export async function fileAt(
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  try {
    const answer = await call<{ content: string; encoding: string }>(
      "GET",
      `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    );
    return Buffer.from(answer.content, "base64").toString("utf8");
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

/**
 * One branch with one commit changing these files, and a pull request from
 * it into the base branch.
 */
export async function openPullRequest(input: {
  repo: string;
  base: string;
  branch: string;
  title: string;
  body: string;
  message: string;
  files: { path: string; text: string }[];
}): Promise<{ number: number; url: string }> {
  const { repo } = input;
  const head = await call<{ object: { sha: string } }>(
    "GET",
    `/repos/${repo}/git/ref/heads/${encodeURIComponent(input.base)}`,
  );
  const parent = await call<{ tree: { sha: string } }>(
    "GET",
    `/repos/${repo}/git/commits/${head.object.sha}`,
  );
  const tree = await call<{ sha: string }>(
    "POST",
    `/repos/${repo}/git/trees`,
    {
      base_tree: parent.tree.sha,
      tree: await Promise.all(
        input.files.map(async (file) => {
          const blob = await call<{ sha: string }>(
            "POST",
            `/repos/${repo}/git/blobs`,
            { content: file.text, encoding: "utf-8" },
            "writing the changed file",
          );
          return {
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          };
        }),
      ),
    },
    "building the commit",
  );
  const commit = await call<{ sha: string }>(
    "POST",
    `/repos/${repo}/git/commits`,
    { message: input.message, tree: tree.sha, parents: [head.object.sha] },
    "building the commit",
  );
  await call(
    "POST",
    `/repos/${repo}/git/refs`,
    { ref: `refs/heads/${input.branch}`, sha: commit.sha },
    "creating the branch",
  );
  const pull = await call<{ number: number; html_url: string }>(
    "POST",
    `/repos/${repo}/pulls`,
    {
      title: input.title,
      head: input.branch,
      base: input.base,
      body: input.body,
    },
    "opening the pull request",
  );
  return { number: pull.number, url: pull.html_url };
}

/** Where a pull request is: open, merged or closed without merging. */
export async function pullState(
  repo: string,
  number: number,
): Promise<{ state: "open" | "merged" | "closed"; mergedAt: string | null }> {
  const answer = await call<{
    state: string;
    merged: boolean;
    merged_at: string | null;
  }>("GET", `/repos/${repo}/pulls/${number}`);
  return {
    state: answer.merged
      ? "merged"
      : answer.state === "open"
        ? "open"
        : "closed",
    mergedAt: answer.merged_at,
  };
}

// ── Reading a change (Crosswind). Read-only: nothing is written. ───────────

/** A file a change touches, as GitHub lists it. */
export interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

/** A pull request's title, link and branches. */
export async function pullRequest(
  repo: string,
  number: number,
): Promise<{
  title: string;
  url: string;
  base: string;
  head: string;
  /** "owner/name" of the head branch's repository (a fork differs). */
  headRepo: string | null;
}> {
  const answer = await call<{
    title: string;
    html_url: string;
    base: { ref: string };
    head: { ref: string; repo: { full_name: string } | null };
  }>("GET", `/repos/${repo}/pulls/${number}`);
  return {
    title: answer.title,
    url: answer.html_url,
    base: answer.base.ref,
    head: answer.head.ref,
    headRepo: answer.head.repo?.full_name ?? null,
  };
}

/** The files a pull request changes, up to `limit` (GitHub pages by 100). */
export async function pullFiles(
  repo: string,
  number: number,
  limit = 300,
): Promise<GitHubFile[]> {
  const files: GitHubFile[] = [];
  for (let page = 1; files.length < limit; page += 1) {
    const batch = await call<GitHubFile[]>(
      "GET",
      `/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
    );
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files.slice(0, limit);
}

/** What changes from one branch to another. */
export async function compare(
  repo: string,
  base: string,
  head: string,
): Promise<{ url: string; files: GitHubFile[] }> {
  const answer = await call<{ html_url: string; files?: GitHubFile[] }>(
    "GET",
    `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
  return { url: answer.html_url, files: answer.files ?? [] };
}
