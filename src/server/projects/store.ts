import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { projects, workspaces } from "../db/schema";
import {
  originLabel,
  parseOrigin,
  type RepoOrigin,
} from "../engine/repo/fetch";

/*
 * Projects and their workspaces. A project is one application; each
 * workspace is one repository inside it.
 */

export interface Workspace {
  id: string;
  name: string;
  origin: RepoOrigin;
  /** A short name for the source: "owner/name" or the folder. */
  label: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  workspaces: Workspace[];
}

export const PROJECT_LIMITS = {
  name: 80,
  description: 500,
  workspaces: 12,
} as const;
const WORKSPACE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

/** Checks a new project's name and description. */
export function parseProject(
  body: unknown,
): Result<{ name: string; description: string }> {
  const { name, description = "" } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim())
    return fail("Give the project a name.");
  if (name.trim().length > PROJECT_LIMITS.name) {
    return fail(`Keep the name to ${PROJECT_LIMITS.name} characters.`);
  }
  if (
    typeof description !== "string" ||
    description.length > PROJECT_LIMITS.description
  ) {
    return fail(
      `Keep the description to ${PROJECT_LIMITS.description} characters.`,
    );
  }
  return {
    ok: true,
    value: { name: name.trim(), description: description.trim() },
  };
}

/**
 * Checks a new workspace. Its name becomes the first part of every file path
 * in a run, so it is kept to lowercase letters, digits and hyphens.
 */
export function parseWorkspace(
  body: unknown,
): Result<{ name: string; origin: RepoOrigin }> {
  const { name, origin } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !WORKSPACE_NAME.test(name)) {
    return fail(
      "Name the workspace with lowercase letters, digits and hyphens, such as web or billing-api.",
    );
  }
  const parsed = parseOrigin(origin);
  if (!parsed.ok) return fail(parsed.error);
  return { ok: true, value: { name, origin: parsed.origin } };
}

const toWorkspace = (row: typeof workspaces.$inferSelect): Workspace => {
  const origin = row.origin as RepoOrigin;
  return { id: row.id, name: row.name, origin, label: originLabel(origin) };
};

export async function listProjects(): Promise<Project[]> {
  const [projectRows, workspaceRows] = await Promise.all([
    db().select().from(projects).orderBy(asc(projects.createdAt)),
    db().select().from(workspaces).orderBy(asc(workspaces.createdAt)),
  ]);
  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    workspaces: workspaceRows
      .filter((item) => item.projectId === row.id)
      .map(toWorkspace),
  }));
}

export async function getProject(id: string): Promise<Project | null> {
  const [row] = await db().select().from(projects).where(eq(projects.id, id));
  if (!row) return null;
  const rows = await db()
    .select()
    .from(workspaces)
    .where(eq(workspaces.projectId, id))
    .orderBy(asc(workspaces.createdAt));
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    workspaces: rows.map(toWorkspace),
  };
}

export async function createProject(input: {
  name: string;
  description: string;
}): Promise<Project> {
  const row = { id: randomUUID(), ...input, createdAt: new Date() };
  await db().insert(projects).values(row);
  return { ...row, createdAt: row.createdAt.toISOString(), workspaces: [] };
}

/** Removes the project and its workspaces. Its runs stay, unlinked. */
export async function deleteProject(id: string): Promise<void> {
  await db().delete(projects).where(eq(projects.id, id));
}

export async function addWorkspace(
  project: Project,
  input: { name: string; origin: RepoOrigin },
): Promise<Result<Workspace>> {
  if (project.workspaces.length >= PROJECT_LIMITS.workspaces) {
    return fail(
      `A project can have at most ${PROJECT_LIMITS.workspaces} workspaces.`,
    );
  }
  if (project.workspaces.some((item) => item.name === input.name)) {
    return fail(`This project already has a workspace called "${input.name}".`);
  }
  const row = {
    id: randomUUID(),
    projectId: project.id,
    ...input,
    createdAt: new Date(),
  };
  await db().insert(workspaces).values(row);
  return { ok: true, value: toWorkspace(row) };
}

export async function removeWorkspace(id: string): Promise<void> {
  await db().delete(workspaces).where(eq(workspaces.id, id));
}
