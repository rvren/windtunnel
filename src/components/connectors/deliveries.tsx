"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, Send } from "lucide-react";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";

/* What a run's work orders did on the way to 8090 Software Factory. */

export interface Delivery {
  workOrderId: string;
  status: "sending" | "sent" | "failed";
  externalId: string | null;
  url: string | null;
  error: string | null;
}

interface State {
  linked: boolean;
  connected: boolean;
  deliveries: Delivery[];
}

/** Follows what was sent for a run. Asks again while a send is going on. */
export function useDeliveries(runId: string, enabled: boolean) {
  const [state, setState] = useState<State | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const response = await fetch(`/api/runs/${runId}/deliveries`, {
        cache: "no-store",
      });
      if (response.ok) setState((await response.json()) as State);
    } catch {
      // The next tick tries again.
    }
  }, [runId]);

  const busy =
    sending ||
    Boolean(state?.deliveries.some((item) => item.status === "sending"));
  // A run that has just finished is sent a moment later: look a few times.
  const waiting = Boolean(
    state?.linked && state.connected && state.deliveries.length === 0,
  );
  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(read, 0);
    if (!busy && !waiting) return () => clearTimeout(first);
    const timer = setInterval(read, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [enabled, busy, waiting, read]);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/deliveries`, {
        method: "POST",
      });
      const body = (await response.json()) as State & { error?: string };
      if (response.ok) setState(body);
      else setError(body.error ?? "The work orders could not be sent.");
    } catch {
      setError("Could not reach the server.");
    }
    setSending(false);
  }, [runId]);

  return { state, busy, error, send };
}

/** The strip above a run's work orders: how many are in 8090, and Send. */
export function DeliveryStrip({
  total,
  sample,
  deliveries,
}: {
  total: number;
  /** A sample run is sent only when asked, or when the setting is on. */
  sample: boolean;
  deliveries: ReturnType<typeof useDeliveries>;
}) {
  const { state, busy, error, send } = deliveries;
  if (!state?.linked) return null;
  const sent = state.deliveries.filter((item) => item.status === "sent").length;
  const failed = state.deliveries.filter((item) => item.status === "failed");
  const left = total - sent;

  return (
    <Panel
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      data-testid="delivery-strip"
      data-sent={sent}
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {busy ? (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-brand"
            aria-hidden="true"
          />
        ) : sent === total ? (
          <Check className="size-4 shrink-0 text-ok" aria-hidden="true" />
        ) : null}
        <span>
          <span className="font-medium">8090 Software Factory</span>{" "}
          <span className="text-muted-foreground">
            {busy
              ? `Sending. ${sent} of ${total} added so far.`
              : sent === total
                ? `All ${total} work orders are in the linked project.`
                : !state.connected
                  ? "Not connected. Connect it in Settings to send these."
                  : failed.length > 0
                    ? `${sent} of ${total} added. ${failed.length} could not be sent.`
                    : sample
                      ? `${sent} of ${total} added. Sample runs are sent only when you ask.`
                      : `${sent} of ${total} added.`}
          </span>
        </span>
      </p>
      {left > 0 && state.connected ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={send}
          data-testid="delivery-send"
        >
          <Send />
          {failed.length > 0 ? "Send Again" : "Send To 8090"}
        </Button>
      ) : null}
      {error ? (
        <p className="basis-full text-xs text-sev-critical" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

/** Beside one work order: where it is in 8090, or why it is not. */
export function DeliveryTag({ delivery }: { delivery: Delivery | undefined }) {
  if (!delivery) return null;
  if (delivery.status === "sent") {
    const label = `In 8090${delivery.externalId ? ` · ${delivery.externalId}` : ""}`;
    return (
      <span
        className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
        data-testid="delivery-tag"
        data-status="sent"
      >
        <span className="size-1.5 rounded-full bg-ok" />
        {delivery.url ? (
          <a
            href={delivery.url}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            {label}
          </a>
        ) : (
          label
        )}
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
      data-testid="delivery-tag"
      data-status={delivery.status}
      title={delivery.error ?? undefined}
    >
      <span
        className={
          delivery.status === "failed"
            ? "size-1.5 rounded-full bg-sev-critical"
            : "size-1.5 rounded-full bg-brand"
        }
      />
      {delivery.status === "failed"
        ? `Not sent: ${delivery.error ?? "unknown reason"}`
        : "Sending"}
    </span>
  );
}
