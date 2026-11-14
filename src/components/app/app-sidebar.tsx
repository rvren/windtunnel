"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowLeft,
  ChevronRight,
  Cpu,
  Database,
  FolderKanban,
  History,
  PanelLeft,
  Plug,
  Plus,
  Settings,
  type LucideIcon,
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  testId: string;
  isActive: (path: string | null) => boolean;
  /** The section has a sidebar of its own, which this row opens. */
  into?: boolean;
}

/** The name of the section page that is open, for its row in the main menu. */
function openPage(groups: NavGroup[], path: string | null): string | null {
  for (const group of groups) {
    for (const entry of group.items) {
      if (entry.isActive(path)) return entry.label;
    }
  }
  return null;
}

interface NavGroup {
  /** No label for the first group. */
  label?: string;
  items: NavItem[];
}

// The main menu. Only what exists is listed. Crosswind, Fly-off and Black box
// join it when they are built.
const MAIN: NavGroup[] = [
  {
    items: [
      {
        href: "/app/projects",
        label: "Projects",
        icon: FolderKanban,
        testId: "app-nav-projects",
        isActive: (path) => Boolean(path?.startsWith("/app/projects")),
      },
      {
        href: "/app",
        label: "Runs",
        icon: History,
        testId: "app-nav-runs",
        // Runs owns /app and every /app/runs/... page.
        isActive: (path) =>
          path === "/app" || Boolean(path?.startsWith("/app/runs")),
      },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        href: "/app/settings",
        label: "Settings",
        icon: Settings,
        testId: "app-nav-settings",
        isActive: (path) => Boolean(path?.startsWith("/app/settings")),
        into: true,
      },
    ],
  },
];

// Settings' own sidebar: its pages, in groups. It takes the main menu's
// place while a Settings page is open.
const SETTINGS: NavGroup[] = [
  {
    items: [
      {
        href: "/app/settings",
        label: "Engine",
        icon: Cpu,
        testId: "settings-nav-engine",
        isActive: (path) => path === "/app/settings",
      },
      {
        href: "/app/settings/connectors",
        label: "Connectors",
        icon: Plug,
        testId: "settings-nav-connectors",
        isActive: (path) =>
          Boolean(path?.startsWith("/app/settings/connectors")),
      },
      {
        href: "/app/settings/sample-data",
        label: "Sample data",
        icon: Database,
        testId: "settings-nav-sample-data",
        isActive: (path) =>
          Boolean(path?.startsWith("/app/settings/sample-data")),
      },
    ],
  },
];

const inSettings = (path: string | null) =>
  Boolean(path?.startsWith("/app/settings"));

/** A row of the sidebar: quiet until it is the page you are on. */
const item =
  "relative h-10 gap-3 rounded-tile px-3 text-[15px] text-muted-foreground transition-[color,background-color,transform] duration-200 hover:bg-sidebar-accent hover:text-foreground active:scale-[0.98] data-active:bg-transparent data-active:font-medium data-active:text-foreground [&_svg]:size-[18px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center";

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

/** One menu: its groups, the current page marked with a chip that glides. */
function NavList({
  groups,
  pathname,
  onEnter,
}: {
  groups: NavGroup[];
  pathname: string | null;
  /** A row that opens a sidebar of its own, while its section is open. */
  onEnter?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 group-data-[collapsible=icon]:gap-2">
      {groups.map((group, index) => (
        <SidebarGroup
          key={group.label ?? index}
          className="p-0 group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:pt-2 group-data-[collapsible=icon]:first:border-0 group-data-[collapsible=icon]:first:pt-0"
        >
          {group.label ? (
            <SidebarGroupLabel className="mb-0.5 h-8 px-3 text-sm font-normal text-muted-foreground group-data-[collapsible=icon]:hidden">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
              {group.items.map((entry) => {
                const active = entry.isActive(pathname);
                return (
                  <SidebarMenuItem key={entry.href}>
                    <SidebarMenuButton
                      render={<Link href={entry.href} />}
                      tooltip={entry.label}
                      isActive={active}
                      data-testid={entry.testId}
                      className={item}
                      onClick={(event) => {
                        // Back into a section that is already open: only
                        // the sidebar changes, the page stays.
                        if (entry.into && active && onEnter) {
                          event.preventDefault();
                          onEnter();
                        }
                      }}
                    >
                      {active ? (
                        <motion.span
                          layoutId="app-nav-active"
                          aria-hidden="true"
                          transition={{ duration: 0.35, ease: EASE }}
                          className="absolute inset-0 rounded-tile bg-foreground/[0.09]"
                        />
                      ) : null}
                      <entry.icon className="relative" />
                      <span
                        className={
                          entry.into
                            ? "relative shrink-0 group-data-[collapsible=icon]:hidden"
                            : "relative flex-1 truncate group-data-[collapsible=icon]:hidden"
                        }
                      >
                        {entry.label}
                      </span>
                      {/* Up in the main menu with a section open: which of
                          its pages is open, then the way back in. */}
                      {entry.into && active ? (
                        <span
                          className="relative ml-auto min-w-0 truncate text-[13px] font-normal text-muted-foreground group-data-[collapsible=icon]:hidden"
                          data-testid="sidebar-open-page"
                        >
                          {openPage(SETTINGS, pathname)}
                        </span>
                      ) : null}
                      {entry.into && !active ? (
                        <span className="flex-1 group-data-[collapsible=icon]:hidden" />
                      ) : null}
                      {entry.into ? (
                        <ChevronRight
                          className="relative size-3.5! text-muted-foreground group-data-[collapsible=icon]:hidden"
                          aria-hidden="true"
                        />
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </div>
  );
}

/**
 * The top of a section's own sidebar, as in the Claude Console: an arrow and
 * the name the section has in the main menu. It leads back to that menu and
 * changes only the sidebar.
 */
function SectionHead({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <SidebarMenu className="mb-3 group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={onBack}
          tooltip={label}
          aria-label={`${label}: back to the main menu`}
          data-testid="sidebar-up"
          className="group/up h-10 gap-2 rounded-tile px-3 text-[15px] font-semibold text-foreground transition-[background-color,transform] duration-200 hover:bg-sidebar-accent active:scale-[0.98] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center"
        >
          <ArrowLeft className="size-4! text-muted-foreground transition-transform duration-200 group-hover/up:-translate-x-0.5 group-hover/up:text-foreground" />
          <span
            data-testid="sidebar-section-title"
            className="group-data-[collapsible=icon]:hidden"
          >
            {label}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const swap = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -24,
    transition: { duration: 0.12 },
  }),
};

/**
 * Slides one sidebar list over the other: in to a section's own list from
 * the right, and back up to the main menu from the left.
 */
function SidebarSwap({
  view,
  depth,
  children,
}: {
  view: string;
  depth: number;
  children: React.ReactNode;
}) {
  const [last, setLast] = useState(depth);
  const direction = depth >= last ? 1 : -1;
  if (depth !== last) setLast(depth);
  return (
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      <motion.div
        key={view}
        custom={direction}
        variants={swap}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.22, ease: EASE }}
        className="flex min-h-0 flex-col"
      >
        {/* Each list has its own chip, so it never glides across lists. */}
        <LayoutGroup id={view}>{children}</LayoutGroup>
      </motion.div>
    </AnimatePresence>
  );
}

/** A project's own page: /app/projects/<id>. */
const COCKPIT = /^\/app\/projects\/[0-9a-f-]{36}\/?$/;

/** The sidebar for the page being shown. Needs a Suspense boundary above it. */
export function AppSidebar({ switcher }: { switcher: React.ReactNode }) {
  const pathname = usePathname();
  // A project's cockpit gets the whole width: the sidebar folds to its rail
  // on the way in and opens again on the way to any other page. It is only
  // moved when the page changes, so the collapse control still works there.
  const { setOpen } = useSidebar();
  const cockpit = COCKPIT.test(pathname ?? "");
  // setOpen is a new function after every toggle. It is kept in a ref so
  // that only a change of page moves the sidebar, never the toggle itself.
  const move = useRef(setOpen);
  useEffect(() => {
    move.current = setOpen;
  });
  useEffect(() => {
    move.current(!cockpit);
  }, [cockpit]);
  return <AppSidebarFor pathname={pathname} switcher={switcher} />;
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
  // On a Settings page the sidebar is Settings' own. "‹ Settings" goes up to
  // the main menu without leaving the page; any navigation resets it.
  const [up, setUp] = useState(false);
  // Any navigation, including back to the same page later, starts in the
  // section's own sidebar again. Reset while rendering, not in an effect, so
  // the first frame after a navigation is already right.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setUp(false);
  }
  const own = inSettings(pathname) && !up;
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="gap-0 border-b px-3.5 pt-5 pb-4 group-data-[collapsible=icon]:px-1">
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
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden px-3.5 pt-4 group-data-[collapsible=icon]:px-1">
        <SidebarSwap view={own ? "settings" : "main"} depth={own ? 1 : 0}>
          {own ? (
            <>
              <SectionHead label="Settings" onBack={() => setUp(true)} />
              <NavList groups={SETTINGS} pathname={pathname} />
            </>
          ) : (
            <>
              {/* One scope card: the project the page is about. Part of the
                  main menu, so it slides away with it in Settings. */}
              <div className="mb-4 border-b pb-4 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                {switcher}
              </div>
              <NavList
                groups={MAIN}
                pathname={pathname}
                onEnter={() => setUp(false)}
              />
            </>
          )}
        </SidebarSwap>
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
              className="h-11 justify-center gap-2.5 rounded-tile bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-[opacity,transform] duration-200 hover:bg-primary hover:text-primary-foreground hover:opacity-90 active:scale-[0.98] active:bg-primary active:text-primary-foreground group-data-[collapsible=icon]:size-10!"
            >
              <Plus />
              <span className="flex-none group-data-[collapsible=icon]:hidden">
                New run
              </span>
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
                <span className="group-data-[collapsible=icon]:hidden">
                  Back to site
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
