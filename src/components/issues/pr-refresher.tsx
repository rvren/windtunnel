"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
 * Asks the server to check open fix pull requests on GitHub when the page
 * opens and every three minutes while it stays open, and refreshes the page
 * when one was merged or closed. Renders nothing.
 */

const EVERY = 3 * 60 * 1000;

export function PullRequestRefresher({ projectId }: { projectId?: string }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/issues/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectId ? { projectId } : {}),
        });
        if (!response.ok || stopped) return;
        const body = (await response.json()) as {
          merged: number;
          closed: number;
        };
        if (body.merged + body.closed > 0) router.refresh();
      } catch {
        // The next check tries again.
      }
    };
    void check();
    const timer = window.setInterval(check, EVERY);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [projectId, router]);
  return null;
}
