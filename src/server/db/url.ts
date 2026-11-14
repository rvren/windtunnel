// The local default matches docker-compose.yml, so `pnpm dev` needs no setup
// beyond `docker compose up -d db`. Inside Docker, Compose sets DATABASE_URL.
const LOCAL_DEFAULT =
  "postgres://windtunnel:windtunnel-dev-only@localhost:5433/windtunnel";

export function databaseUrl(): string {
  return process.env.DATABASE_URL || LOCAL_DEFAULT;
}

/** The database address without its password, safe to show on screen. */
export function databaseLabel(): string {
  try {
    const url = new URL(databaseUrl());
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "unreadable DATABASE_URL";
  }
}
