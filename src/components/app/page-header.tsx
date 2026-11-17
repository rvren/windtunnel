import { cn } from "@/lib/utils";

/*
 * The title block at the top of an app page: a small title with actions on
 * the right, an optional line of text, a row of metadata chips, and tabs.
 */
export function PageHeader({
  title,
  description,
  meta,
  tabs,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A row of small facts under the title: use MetaChip. */
  meta?: React.ReactNode;
  /** Tabs for the page's sections, under everything else. */
  tabs?: React.ReactNode;
  /** Actions, shown on the right. */
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-2", tabs ? "mb-5" : "mb-7")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="min-w-0 text-4xl leading-tight font-semibold tracking-[-0.03em] text-balance">
          {title}
        </h1>
        {children ? (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </div>
      {description ? (
        <p className="max-w-3xl text-[0.8125rem] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {meta ? (
        <div
          className="mt-1 flex flex-wrap items-center gap-1.5"
          data-testid="page-meta"
        >
          {meta}
        </div>
      ) : null}
      {tabs ? <div className="mt-2">{tabs}</div> : null}
    </header>
  );
}

/** One small fact about the page, as a quiet chip: an icon or a dot, then text. */
export function MetaChip({
  icon: Icon,
  dot,
  children,
  title,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  /** A small coloured dot, as a CSS colour. */
  dot?: string;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      {dot ? (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={{ background: dot }}
        />
      ) : null}
      {children}
    </span>
  );
}

/* Shown while a page's data is being read. One quiet line, no shimmer. */
export function PageLoading({ label }: { label: string }) {
  return (
    <p className="py-10 text-[0.8125rem] text-muted-foreground" role="status">
      {label}
    </p>
  );
}
