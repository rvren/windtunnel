import { RunError } from "@/server/engine/llm";
import { addDemoProject, removeDemoData } from "@/server/projects/demo";

import { failure, readJson, withDatabase } from "../projects/shared";

/** Adds the demo project: empty, or complete with one scripted run started. */
export async function POST(request: Request) {
  const body = ((await readJson(request)) ?? {}) as { complete?: unknown };
  return withDatabase(async () => {
    try {
      return Response.json(await addDemoProject(body.complete === true), {
        status: 201,
      });
    } catch (error) {
      if (error instanceof RunError) return failure(error.message, 409);
      throw error;
    }
  });
}

/** Removes every demo project and its runs. Nothing else is touched. */
export async function DELETE() {
  return withDatabase(async () => Response.json(await removeDemoData()));
}
