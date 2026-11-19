import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { pillClass } from "@/components/pill";
import { pageNumbers, type Page } from "@/lib/paging";
import { cn } from "@/lib/utils";

/*
 * The pager under every long list: which rows are shown, and the pages.
 * On a server-rendered page each page is a link (`href`), so the page is in
 * the address and can be shared; in a client list it is a button
 * (`onPage`). It has no state of its own, so it renders in either. Nothing
 * shows when everything fits on one page.
 */

export function Pager({
  page,
  noun,
  href,
  onPage,
  className,
  testId = "pager",
}: {
  page: Pick<Page<unknown>, "page" | "pages" | "total" | "from" | "to">;
  /** What the rows are, for "26–50 of 152 runs": [one, many]. */
  noun: [string, string];
  /** The address of a page, on a server-rendered page. */
  href?: (page: number) => string;
  /** Called with the page chosen, in a client list. */
  onPage?: (page: number) => void;
  className?: string;
  testId?: string;
}) {
  if (page.pages <= 1) return null;
  const item = (
    target: number,
    label: React.ReactNode,
    options: { current?: boolean; aria?: string; disabled?: boolean } = {},
  ) => {
    const classes = cn(
      pillClass(Boolean(options.current), true),
      "min-w-7 justify-center px-2 font-mono text-[0.75rem] tabular-nums",
      options.disabled && "pointer-events-none opacity-35",
    );
    const common = {
      "aria-label": options.aria,
      "aria-current": options.current ? ("page" as const) : undefined,
      "data-page": target,
    };
    if (options.disabled) {
      return (
        <span className={classes} aria-hidden="true">
          {label}
        </span>
      );
    }
    return href ? (
      <Link href={href(target)} scroll={false} className={classes} {...common}>
        {label}
      </Link>
    ) : (
      <button
        type="button"
        className={classes}
        onClick={() => onPage?.(target)}
        {...common}
      >
        {label}
      </button>
    );
  };

  return (
    <nav
      aria-label={`Pages of ${noun[1]}`}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2.5",
        className,
      )}
      data-testid={testId}
    >
      <p className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
        {page.from}–{page.to} of {page.total}{" "}
        {page.total === 1 ? noun[0] : noun[1]}
      </p>
      <div className="flex items-center gap-1">
        {item(page.page - 1, <ChevronLeft />, {
          aria: "Previous page",
          disabled: page.page <= 1,
        })}
        {pageNumbers(page.page, page.pages).map((n, index) =>
          n === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-xs text-muted-foreground"
            >
              …
            </span>
          ) : (
            <span key={n}>
              {item(n, n, { current: n === page.page, aria: `Page ${n}` })}
            </span>
          ),
        )}
        {item(page.page + 1, <ChevronRight />, {
          aria: "Next page",
          disabled: page.page >= page.pages,
        })}
      </div>
    </nav>
  );
}
