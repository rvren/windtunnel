"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, FolderKanban, History, Plus, Settings } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
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
    // Runs owns /app and every /app/runs/... page except the new-run form.
    isActive: (path: string | null) =>
      path === "/app" ||
      Boolean(path?.startsWith("/app/runs/") && path !== "/app/runs/new"),
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

/** The sidebar for the page being shown. Needs a Suspense boundary above it. */
export function AppSidebar({ switcher }: { switcher: React.ReactNode }) {
  return <AppSidebarFor pathname={usePathname()} switcher={switcher} />;
}

/**
 * The sidebar itself. With no pathname nothing is marked as current: that is
 * what is shown for the instant before the path is known.
 */
export function AppSidebarFor({
  pathname,
  switcher,
}: {
  pathname: string | null;
  /** The project switcher, which the layout reads on the server. */
  switcher: React.ReactNode;
}) {
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <Link
          href="/app"
          aria-label="Windtunnel, runs"
          data-testid="app-sidebar-logo"
          className="flex h-10 items-center px-1.5"
        >
          <Logo wordClassName="group-data-[collapsible=icon]:hidden" />
        </Link>
        {switcher}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/app/runs/new" />}
              tooltip="New run"
              data-testid="app-nav-new-run"
              isActive={pathname === "/app/runs/new"}
              className="h-10 rounded-md border px-3 text-sidebar-foreground"
            >
              <Plus />
              <span>New run</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    tooltip={item.label}
                    isActive={item.isActive(pathname)}
                    data-testid={item.testId}
                    className="h-10 rounded-md px-3 text-muted-foreground data-active:bg-primary data-active:font-normal data-active:text-primary-foreground data-active:hover:bg-primary data-active:hover:text-primary-foreground"
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/" />}
              tooltip="Back to site"
              data-testid="app-nav-back-to-site"
            >
              <ArrowLeft />
              <span>Back to site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-0.5">
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
