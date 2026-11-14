import { ensureDatabase } from "@/server/db/ready";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const failure = (error: string, status: number) =>
  Response.json({ error }, { status });

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Runs the handler with the database ready, or answers 503. */
export async function withDatabase(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    await ensureDatabase();
  } catch {
    return failure("The database is not reachable.", 503);
  }
  try {
    return await handler();
  } catch (error) {
    console.error("[windtunnel] A project request failed:", error);
    return failure("The request could not be completed.", 500);
  }
}
