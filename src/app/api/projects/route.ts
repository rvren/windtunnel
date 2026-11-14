import { connection } from "next/server";

import {
  createProject,
  listProjects,
  parseProject,
} from "@/server/projects/store";

import { failure, readJson, withDatabase } from "./shared";

export async function GET() {
  await connection();
  return withDatabase(async () =>
    Response.json({ projects: await listProjects() }),
  );
}

export async function POST(request: Request) {
  const parsed = parseProject(await readJson(request));
  if (!parsed.ok) return failure(parsed.error, 400);
  return withDatabase(async () =>
    Response.json(
      { project: await createProject(parsed.value) },
      { status: 201 },
    ),
  );
}
