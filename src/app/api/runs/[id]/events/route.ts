import { ensureDatabase } from "@/server/db/ready";
import { isActive, runStore, subscribe } from "@/server/engine/registry";
import type { StoredEvent } from "@/server/engine/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEEP_ALIVE_MS = 15_000;

/*
 * A run's events as a server-sent event stream. It first replays what is
 * already saved, then follows the run live, so a page that opens or reloads
 * mid-run misses nothing. The browser reconnects by itself and sends the last
 * event it saw; the replay starts after that one.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/runs/[id]/events">,
) {
  const { id } = await context.params;
  if (!UUID.test(id)) {
    return Response.json({ error: "No such run." }, { status: 404 });
  }
  const store = runStore();
  try {
    await ensureDatabase();
    if (!(await store.get(id))) {
      return Response.json({ error: "No such run." }, { status: 404 });
    }
  } catch {
    return Response.json(
      { error: "The database is not reachable." },
      { status: 503 },
    );
  }

  const after = Number(request.headers.get("last-event-id") ?? 0) || 0;
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastSeq = after;
      let replaying = true;
      const waiting: StoredEvent[] = [];

      const close = () => {
        if (closed) return;
        closed = true;
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the browser going away.
        }
      };
      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const send = (item: StoredEvent) => {
        if (closed || item.seq <= lastSeq) return;
        lastSeq = item.seq;
        write(`id: ${item.seq}\ndata: ${JSON.stringify(item)}\n\n`);
        const { type } = item.event;
        if (type === "run.completed" || type === "run.failed") end();
      };
      // Tells the page that nothing more will come, then hangs up.
      const end = () => {
        write("event: end\ndata: {}\n\n");
        close();
      };

      // Follow live first, so nothing falls between the replay and now.
      const unsubscribe = subscribe(id, (item) =>
        replaying ? waiting.push(item) : send(item),
      );
      const keepAlive = setInterval(
        () => write(": keep-alive\n\n"),
        KEEP_ALIVE_MS,
      );
      stop = () => {
        unsubscribe();
        clearInterval(keepAlive);
      };
      request.signal.addEventListener("abort", close);

      try {
        for (const item of await store.events(id, after)) send(item);
      } catch {
        return end();
      }
      replaying = false;
      for (const item of waiting.sort((a, b) => a.seq - b.seq)) send(item);

      // A run that is not going on in this process will say nothing more.
      if (!isActive(id)) end();
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
