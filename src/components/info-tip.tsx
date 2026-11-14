"use client";

import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EXPLAIN, type ExplainKey } from "@/lib/explain";
import { cn } from "@/lib/utils";

/**
 * A small "i" beside a card's or widget's title. Hover or focus it to read
 * what the widget shows and how its numbers are worked out. The words live
 * in src/lib/explain.ts.
 */
export function InfoTip({
  about,
  label,
  className,
}: {
  about: ExplainKey;
  /** The widget's name, for screen readers: "About Readiness". */
  label: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`About ${label}`}
            data-testid={`info-${about}`}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 align-middle outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              className,
            )}
          />
        }
      >
        <Info className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left leading-relaxed normal-case tracking-normal">
        {EXPLAIN[about]}
      </TooltipContent>
    </Tooltip>
  );
}
