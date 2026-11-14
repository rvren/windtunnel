"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** The trail for a path: every crumb but the last links back. */
function trail(pathname: string | null): { label: string; href?: string }[] {
  if (pathname === null) return [];
  if (pathname.startsWith("/app/settings")) return [{ label: "Settings" }];
  if (pathname === "/app/runs/new")
    return [{ label: "Runs", href: "/app" }, { label: "New run" }];
  if (pathname.startsWith("/app/runs/"))
    return [{ label: "Runs", href: "/app" }, { label: "Run" }];
  return [{ label: "Runs" }];
}

/** The top bar for the page being shown. Needs a Suspense boundary above it. */
export function AppTopbar() {
  return <AppTopbarFor pathname={usePathname()} />;
}

/** The top bar itself. With no pathname the trail is left empty. */
export function AppTopbarFor({ pathname }: { pathname: string | null }) {
  const crumbs = trail(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
      <SidebarTrigger data-testid="app-sidebar-toggle" />
      <Separator orientation="vertical" className="mr-1 !h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <span key={crumb.label} className="contents">
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {crumb.href ? (
                  <BreadcrumbLink
                    render={<Link href={crumb.href} />}
                    data-testid="app-breadcrumb-link"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
