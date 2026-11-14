import { connection } from "next/server";

import { engineStatus } from "@/server/status";

// Used by Docker Compose as the app's health check. Reports whether the
// database answers and whether an API key is present, never the key.
export async function GET() {
  await connection();
  const status = await engineStatus();
  return Response.json(status, { status: status.database.up ? 200 : 503 });
}
