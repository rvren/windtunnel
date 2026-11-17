import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { AppSidebar, AppSidebarFor } from "@/components/app/app-sidebar";
import { AppTopbar, AppTopbarFor } from "@/components/app/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { homeNumbers } from "@/lib/viz/home";
import { sidebarProjects, sidebarRuns } from "@/lib/viz/sidebar";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import { listIssues } from "@/server/issues/store";
import { listProjects } from "@/server/projects/store";

export const metadata: Metadata = {
  title: { default: "Runs", template: "%s · Windtunnel" },
};

/** The projects, read once per request for the sidebar and the top bar. */
const projectList = cache(async () => {
  await connection();
  try {
    await ensureDatabase();
    return (await listProjects()).map((project) => ({
      id: project.id,
      name: project.name,
      workspaces: project.workspaces.length,
    }));
  } catch {
    // With no database the pages say so; the top bar names no project.
    return [];
  }
});

/** The sidebar's lists: projects with their open issues, runs in progress. */
const sidebarLists = cache(async () => {
  try {
    await ensureDatabase();
    const [projects, issues, runs] = await Promise.all([
      listProjects(),
      listIssues(),
      runStore().list(),
    ]);
    const numbers = homeNumbers({
      projects: projects.map(({ id, name }) => ({ id, name })),
      issues,
      runs,
    });
    return {
      projects: sidebarProjects(numbers),
      projectCount: projects.length,
      running: sidebarRuns(runs),
    };
  } catch {
    return { projects: [], projectCount: 0, running: [] };
  }
});

/** The sidebar, told which projects have code for the cockpit to fill. */
async function Sidebar() {
  const [list, lists] = await Promise.all([projectList(), sidebarLists()]);
  const withCode = list
    .filter((project) => project.workspaces > 0)
    .map((project) => project.id);
  return (
    <AppSidebar
      foldFor={withCode}
      projects={lists.projects}
      projectCount={lists.projectCount}
      running={lists.running}
    />
  );
}

async function Topbar() {
  return <AppTopbar projects={await projectList()} />;
}

// The product shell: a floating sidebar, a top bar that says where you are,
// and the page on the canvas itself. The marketing header is not part of
// this area.
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <SidebarProvider>
      {/* The sidebar and top bar read the current path, which a page with an
          id in its address only knows at request time. Until then they are
          shown with nothing marked as current. */}
      <Suspense fallback={<AppSidebarFor pathname={null} />}>
        <Sidebar />
      </Suspense>
      {/* min-w-0: a wide chart scrolls inside itself, never the page. */}
      <SidebarInset className="min-w-0">
        <Suspense fallback={<AppTopbarFor pathname={null} />}>
          <Topbar />
        </Suspense>
        {/* The full width of the page: tables, charts and the cockpit use it.
            A form keeps its own reading measure. */}
        <div className="w-full min-w-0 flex-1 px-4 pt-4 pb-12 md:px-9 md:pt-7 md:pb-18">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
