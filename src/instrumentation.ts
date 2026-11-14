// Runs once when the server starts, before it takes requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDatabase } = await import("./server/db/ready");
  try {
    await ensureDatabase();
  } catch (error) {
    // Do not stop the server: the pages say the database is down, and the
    // next request tries again.
    console.error(
      "[windtunnel] The database is not ready:",
      error instanceof Error ? error.message : error,
    );
  }
}
