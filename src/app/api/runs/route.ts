import { connection } from "next/server";

import { ensureDatabase } from "@/server/db/ready";
import { parseRunInput } from "@/server/engine/input";
import { RunError } from "@/server/engine/llm";
import { runStore, startRun } from "@/server/engine/registry";

const failure = (error: string, status: number) =>
  Response.json({ error }, { status });

export async function GET() {
  await connection();
  try {
    await ensureDatabase();
    return Response.json({ runs: await runStore().list() });
  } catch {
    return failure("The database is not reachable.", 503);
  }
}

/** Starts a run. It goes on in the server after this answers. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("Send the run as JSON.", 400);
  }
  const parsed = parseRunInput(body);
  if (!parsed.ok) return failure(parsed.error, 400);

  try {
    await ensureDatabase();
  } catch {
    return failure("The database is not reachable.", 503);
  }
  try {
    const run = await startRun(parsed.input);
    return Response.json({ id: run.id }, { status: 201 });
  } catch (error) {
    if (error instanceof RunError) return failure(error.message, 409);
    console.error("[windtunnel] Could not start a run:", error);
    return failure("The run could not be started.", 500);
  }
}
