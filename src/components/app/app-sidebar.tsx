"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  FolderKanban,
  History,
  PanelLeft,
  Plus,
  Settings,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { EASE } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

// Only what exists is listed. Crosswind, Fly-off and Black box join this list
// when they are built.
const items = [
  {
    href: "/app/projects",
    label: "Projects",
    icon: FolderKanban,
    testId: "app-nav-projects",
    isActive: (path: string | null) =>
      Boolean(path?.startsWith("/app/projects")),
  },
  {
    href: "/app",
    label: "Runs",
    icon: History,
    testId: "app-nav-runs",
    // Runs owns /app and every /app/runs/... page.
    isActive: (path: string | null) =>
      path === "/app" || Boolean(path?.startsWith("/app/runs")),
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: Settings,
    testId: "app-nav-settings",
    isActive: (path: string | null) =>
      Boolean(path?.startsWith("/app/settings")),
  },
];

/** A row of the sidebar: quiet until it is the page you are on. */
const item =
  "relative h-10 gap-3 rounded-md px-3 text-[15px] text-muted-foreground transition-[color,background-color,transform] duration-200 hover:bg-sidebar-accent hover:text-foreground active:scale-[0.98] data-active:bg-transparent data-active:font-medium data-active:text-foreground [&_svg]:size-[18px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center";

/** The collapse control, in the sidebar's own header. */
function Collapse() {
  const { toggleSidebar, state } = useSidebar();
  const label = state === "collapsed" ? "Expand sidebar" : "Collapse sidebar";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      aria-label={label}
      title={label}
      aria-pressed={state === "collapsed"}
      data-testid="app-sidebar-toggle"
      className="shrink-0 text-muted-foreground hover:text-foreground active:scale-95"
    >
      <PanelLeft />
    </Button>
  );
}

/** The sidebar for the page being shown. Needs a Suspense boundary above it. */
export function AppSidebar({ switcher }: { switcher: React.ReactNode }) {
  return <AppSidebarFor pathname={usePathname()} switcher={switcher} />;
}

/**
 * The sidebar itself: the mark and the collapse control, the project every
 * page is about, the pages, and the one action at the bottom. With no
 * pathname nothing is marked as current: that is what is shown for the
 * instant before the path is known.
 */
export function AppSidebarFor({
  pathname,
  switcher,
}: {
  pathname: string | null;
  /** The project switcher, which the layout reads on the server. */
  switcher: React.ReactNode;
}) {
  // From a project's page, a new run starts in that project.
  const projectId =
    /^\/app\/projects\/([0-9a-f-]{36})/.exec(pathname ?? "")?.[1] ?? null;
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="gap-0 px-3.5 pt-5 group-data-[collapsible=icon]:px-1">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <Link
            href="/app/projects"
            aria-label="Windtunnel, projects"
            data-testid="app-sidebar-logo"
            className="flex h-9 min-w-0 flex-1 items-center rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0"
          >
            <Logo wordClassName="group-data-[collapsible=icon]:hidden" />
          </Link>
          <Collapse />
        </div>
        {/* One scope card: the project the page is about. */}
        <div className="mt-4 border-t pt-4 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          {switcher}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3.5 pt-2 group-data-[collapsible=icon]:px-1">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
              {items.map((entry) => {
                const active = entry.isActive(pathname);
                return (
                  <SidebarMenuItem key={entry.href}>
                    <SidebarMenuButton
                      render={<Link href={entry.href} />}
                      tooltip={entry.label}
                      isActive={active}
                      data-testid={entry.testId}
                      className={item}
                    >
                      {/* The current page's chip. It glides to the next one. */}
                      {active ? (
                        <motion.span
                          layoutId="app-nav-active"
                          aria-hidden="true"
                          transition={{ duration: 0.35, ease: EASE }}
                          className="absolute inset-0 rounded-md bg-foreground/[0.09]"
                        />
                      ) : null}
                      <entry.icon className="relative" />
                      <span className="relative">{entry.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0 px-3.5 pb-4 group-data-[collapsible=icon]:px-1">
        {/* The one call to action of the sidebar. */}
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link
                  href={
                    projectId
                      ? `/app/runs/new?project=${projectId}`
                      : "/app/runs/new"
                  }
                />
              }
              tooltip="New run"
              data-testid="app-nav-new-run"
              className="h-11 justify-center gap-2.5 rounded-md bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-[opacity,transform] duration-200 hover:bg-primary hover:text-primary-foreground hover:opacity-90 active:scale-[0.98] active:bg-primary active:text-primary-foreground group-data-[collapsible=icon]:size-10!"
            >
              <Plus />
              <span className="flex-none">New run</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-4 flex items-center gap-1 border-t pt-3 group-data-[collapsible=icon]:flex-col">
          <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/" />}
                tooltip="Back to site"
                data-testid="app-nav-back-to-site"
                className={item}
              >
                <ArrowLeft />
                <span>Back to site</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
