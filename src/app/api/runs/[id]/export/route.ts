import { ensureDatabase } from "@/server/db/ready";
import { runToJson, runToMarkdown } from "@/server/engine/export";
import { runStore } from "@/server/engine/registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The report as a file to download: ?format=md (the default) or ?format=json. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/runs/[id]/export">,
) {
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";
  if (!UUID.test(id) || (format !== "md" && format !== "json")) {
    return Response.json({ error: "No such report." }, { status: 404 });
  }
  let run;
  try {
    await ensureDatabase();
    run = await runStore().get(id);
  } catch {
    return Response.json(
      { error: "The database is not reachable." },
      { status: 503 },
    );
  }
  if (!run) return Response.json({ error: "No such run." }, { status: 404 });

  const name = `windtunnel-${id.slice(0, 8)}.${format}`;
  return new Response(format === "json" ? runToJson(run) : runToMarkdown(run), {
    headers: {
      "Content-Type":
        format === "json"
          ? "application/json; charset=utf-8"
          : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
