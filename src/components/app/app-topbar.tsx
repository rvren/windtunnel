"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useParams, usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/*
 * The top bar: where you are. It starts with the scope (the project the page
 * is about, or the product), then the trail, parted by slashes. The last
 * step is the page itself, in the text colour; the others link back.
 */

interface Step {
  label: string;
  href?: string;
}

function trail(pathname: string | null): Step[] {
  if (pathname === null) return [];
  if (pathname.startsWith("/app/settings/connectors"))
    return [
      { label: "Settings", href: "/app/settings" },
      { label: "Connectors" },
    ];
  if (pathname.startsWith("/app/settings/sample-data"))
    return [
      { label: "Settings", href: "/app/settings" },
      { label: "Sample data" },
    ];
  if (pathname.startsWith("/app/settings"))
    return [{ label: "Settings", href: "/app/settings" }, { label: "Engine" }];
  if (pathname.startsWith("/app/docs")) return [{ label: "Architecture" }];
  if (pathname === "/app/projects") return [{ label: "Projects" }];
  if (pathname.startsWith("/app/projects/"))
    return [{ label: "Projects", href: "/app/projects" }, { label: "Cockpit" }];
  if (pathname === "/app/runs/new")
    return [{ label: "Runs", href: "/app/runs" }, { label: "New run" }];
  if (pathname.startsWith("/app/runs/"))
    return [{ label: "Runs", href: "/app/runs" }, { label: "Run" }];
  if (pathname === "/app/runs") return [{ label: "Runs" }];
  return [{ label: "Home" }];
}

/** The top bar for the page being shown. Needs a Suspense boundary above it. */
export function AppTopbar({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const { id } = useParams<{ id?: string }>();
  return (
    <AppTopbarFor
      pathname={usePathname()}
      scope={projects.find((project) => project.id === id)?.name}
    />
  );
}

/** The top bar itself. With no pathname the trail is left empty. */
/** A run's or a project's own page. */
const DETAIL = /^\/app\/(runs|projects)\/[0-9a-f-]{36}/;

export function AppTopbarFor({
  pathname,
  scope = "Windtunnel",
}: {
  pathname: string | null;
  /** What the page is about: a project's name, or the product's. */
  scope?: string;
}) {
  const steps = trail(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6",
        // A run or a project page carries its own breadcrumb in its header.
        DETAIL.test(pathname ?? "") && "md:hidden",
      )}
    >
      {/* On a phone the sidebar is a sheet, and this opens it. */}
      <SidebarTrigger
        className="-ml-1.5 md:hidden"
        data-testid="app-sidebar-open"
      />
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-2 text-[13px] whitespace-nowrap text-muted-foreground"
        data-testid="app-breadcrumb"
      >
        <span className="max-w-[18ch] shrink-0 truncate max-sm:hidden">
          {scope}
        </span>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <span
              key={step.label}
              className={
                last
                  ? "flex min-w-0 items-center gap-2"
                  : "flex min-w-0 shrink-[4] items-center gap-2 max-sm:hidden"
              }
            >
              <span
                className="shrink-0 text-muted-foreground/60 max-sm:hidden"
                aria-hidden="true"
              >
                /
              </span>
              {last || !step.href ? (
                <span
                  className="max-w-[40ch] truncate font-medium text-foreground"
                  aria-current="page"
                >
                  {step.label}
                </span>
              ) : (
                <Link
                  href={step.href}
                  data-testid="app-breadcrumb-link"
                  className="min-w-0 truncate rounded-sm transition-colors duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {step.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      {/* How Windtunnel is built: the architecture document. */}
      <Link
        href="/app/docs"
        aria-label="Architecture docs"
        title="Architecture docs"
        data-testid="app-docs"
        className={cn(
          "ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-200 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          pathname?.startsWith("/app/docs") && "bg-accent text-foreground",
        )}
      >
        <BookOpen className="size-4" aria-hidden="true" />
      </Link>
    </header>
  );
}
