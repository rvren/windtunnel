import { cn } from "@/lib/utils";

const TOP = "M-60 262H150C205 262 215 190 280 190S355 262 410 262H620";
const BOTTOM = "M-60 298H150C205 298 215 370 280 370S355 298 410 298H620";

/*
 * The mark at full size, for the hero. The ring is the tunnel seen end on.
 * Air crosses it and parts around a dashed outline: the app that is not built
 * yet. A bright dash runs along each main line so the air reads as moving;
 * it stops for people who ask for reduced motion. Decorative only.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[560px] [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]",
        className,
      )}
    >
      <div className="absolute inset-[4%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand)_34%,transparent),transparent)]" />
      <svg
        viewBox="0 0 560 560"
        fill="none"
        strokeLinecap="round"
        className="relative size-full overflow-visible"
      >
        <circle
          cx="280"
          cy="280"
          r="236"
          stroke="currentColor"
          strokeOpacity="0.28"
        />

        {/* Fainter air further from the app: less disturbed, so less bent. */}
        <g stroke="currentColor" strokeWidth="1.5">
          <path
            d="M-60 226H138C200 226 212 150 280 150S360 226 422 226H620"
            strokeOpacity="0.2"
          />
          <path
            d="M-60 190H126C196 190 210 116 280 116S364 190 434 190H620"
            strokeOpacity="0.1"
          />
        </g>
        <g className="stroke-brand" strokeWidth="1.5">
          <path
            d="M-60 334H138C200 334 212 410 280 410S360 334 422 334H620"
            strokeOpacity="0.35"
          />
          <path
            d="M-60 370H126C196 370 210 444 280 444S364 370 434 370H620"
            strokeOpacity="0.18"
          />
        </g>

        <path d={TOP} stroke="currentColor" strokeWidth="3" />
        <path d={BOTTOM} className="stroke-brand" strokeWidth="3" />

        <path
          d={TOP}
          pathLength="1000"
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray="46 954"
          className="animate-[flow_5.5s_linear_infinite] motion-reduce:hidden"
        />
        <path
          d={BOTTOM}
          pathLength="1000"
          stroke="#C9BEFF"
          strokeWidth="5"
          strokeDasharray="46 954"
          className="animate-[flow_7s_linear_infinite] [animation-delay:-3s] motion-reduce:hidden"
        />

        <rect
          x="238"
          y="227"
          width="84"
          height="84"
          rx="24"
          strokeWidth="1.5"
          strokeDasharray="1 8"
          className="stroke-muted-foreground"
        />
      </svg>
      <p className="absolute inset-x-0 top-[57.3%] text-center font-mono text-[11px] text-muted-foreground">
        not built yet
      </p>
    </div>
  );
}
