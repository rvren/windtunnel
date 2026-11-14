"use client";

import { useEffect, useState } from "react";

import { applyEvent, emptyFeed, type Feed } from "@/lib/run-feed";
import type { StoredEvent } from "@/server/engine/schema";

/**
 * Follows a run's events: replays what already happened, then goes live.
 * `ended` turns true when the server says nothing more will come.
 */
export function useRunFeed(runId: string) {
  const [feed, setFeed] = useState<Feed>(emptyFeed);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (message) => {
      const stored = JSON.parse(message.data) as StoredEvent;
      setFeed((current) => applyEvent(current, stored.event));
    };
    source.addEventListener("end", () => {
      source.close();
      setEnded(true);
    });
    return () => source.close();
  }, [runId]);

  return { feed, ended };
}
