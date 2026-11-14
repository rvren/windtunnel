import { connection } from "next/server";

import { getConnection } from "@/server/connectors/store";

import { LIVE, withDatabase } from "./shared";

/** The state of each live connector. Never includes tokens. */
export async function GET() {
  await connection();
  return withDatabase(async () =>
    Response.json({
      connections: await Promise.all([...LIVE].map(getConnection)),
    }),
  );
}
