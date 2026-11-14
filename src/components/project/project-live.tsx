"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FadeIn } from "@/components/motion";
import { useRunFeed } from "@/hooks/use-run-feed";

import { LiveMap } from "./live-map";

/**
 * The project page while one of its runs is going: the live map, following
 * the run. When the run ends the page is read again, and the cockpit takes
 * the map's place.
 */
export function ProjectLive({
  runId,
  expected,
}: {
  runId: string;
  expected: { name: string; label: string }[];
}) {
  const router = useRouter();
  const { feed, ended } = useRunFeed(runId);
  useEffect(() => {
    if (ended) router.refresh();
  }, [ended, router]);

  return (
    <FadeIn className="space-y-3" data-testid="project-live">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-medium">A run is in progress</h2>
        <Link
          href={`/app/runs/${runId}`}
          data-testid="project-live-open-run"
          className="text-sm text-link underline-offset-4 hover:underline"
        >
          Open The Run
        </Link>
      </div>
      <LiveMap feed={feed} expected={expected} />
    </FadeIn>
  );
}
