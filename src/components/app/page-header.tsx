/* The title block at the top of an app page. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  /** Actions, shown on the right. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="text-4xl font-semibold tracking-[-0.03em]">{title}</h1>
        {children ? (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </div>
      {description ? (
        <p className="text-[15px] text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}

/* Shown while a page's data is being read. One quiet line, no shimmer. */
export function PageLoading({ label }: { label: string }) {
  return (
    <p className="py-10 text-sm text-muted-foreground" role="status">
      {label}
    </p>
  );
}
