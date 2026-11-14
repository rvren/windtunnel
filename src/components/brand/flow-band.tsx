import { cn } from "@/lib/utils";

/*
 * The mark stretched across the page: two lines of air that run edge to edge
 * and part around the place where the app will be. The dashed outline is the
 * app that is not built yet. Decorative only.
 *
 * The viewBox covers just the middle of the drawing and the lines run far
 * past it on both sides, so the opening keeps its size on a phone and the
 * lines still reach the screen edges on a wide monitor. The wrapper clips
 * them.
 */
export function FlowBand({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden", className)} aria-hidden="true">
      <svg
        viewBox="400 0 400 180"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto h-28 w-full overflow-visible sm:h-40"
      >
        <path
          d="M-3000 76H452C512 76 520 26 600 26S688 76 748 76H4200"
          stroke="currentColor"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M-3000 104H452C512 104 520 154 600 154S688 104 748 104H4200"
          className="stroke-brand"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x="562"
          y="56"
          width="76"
          height="68"
          rx="16"
          strokeWidth="1.5"
          strokeDasharray="1 7"
          className="stroke-muted-foreground"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
