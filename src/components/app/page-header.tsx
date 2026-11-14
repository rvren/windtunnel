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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
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
