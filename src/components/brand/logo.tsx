import { cn } from "@/lib/utils";

/*
 * The Windtunnel mark: "Parting".
 *
 * The app under test is not built yet, so it is not drawn. Two lines of air
 * run side by side, part around the space where it will be, and close up
 * again. The upper line takes the text colour; the lower line is the brand
 * violet. Geometry and rules: brand/README.md. The same paths live in
 * brand/mark.svg, so change both together.
 */
export function Mark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
      {...props}
    >
      <path
        d="M6 25H9C17 25 18 13 28 13S39 25 47 25H58"
        stroke="currentColor"
      />
      <path
        d="M6 39H9C17 39 18 51 28 51S39 39 47 39H58"
        className="stroke-brand"
      />
    </svg>
  );
}

/* Mark plus the name. The name is live text in Barlow SemiBold, lowercase. */
export function Logo({
  className,
  wordClassName,
}: {
  className?: string;
  /** Extra classes for the name, for example to hide it in a narrow rail. */
  wordClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark />
      <span
        className={cn(
          "text-xl leading-none font-semibold tracking-[-0.01em]",
          wordClassName,
        )}
      >
        windtunnel
      </span>
    </span>
  );
}
