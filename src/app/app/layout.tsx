import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { AppSidebar, AppSidebarFor } from "@/components/app/app-sidebar";
import { AppTopbar, AppTopbarFor } from "@/components/app/app-topbar";
import { ProjectSwitcher } from "@/components/project/project-switcher";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ensureDatabase } from "@/server/db/ready";
import { listProjects } from "@/server/projects/store";

export const metadata: Metadata = {
  title: { default: "Runs", template: "%s · Windtunnel" },
};

/** The projects, read once per request for the switcher and the top bar. */
const projectList = cache(async () => {
  await connection();
  try {
    await ensureDatabase();
    return (await listProjects()).map((project) => ({
      id: project.id,
      name: project.name,
      workspaces: project.workspaces.length,
      demo: project.demo,
    }));
  } catch {
    // With no database the pages say so; the switcher is shown empty.
    return [];
  }
});

async function Switcher() {
  return <ProjectSwitcher projects={await projectList()} />;
}

async function Topbar() {
  return <AppTopbar projects={await projectList()} />;
}

// The product shell: a floating sidebar, a top bar that says where you are,
// and the page on the canvas itself. The marketing header is not part of
// this area.
export default function AppLayout({ children }: LayoutProps<"/app">) {
  // Read on the server and handed to the sidebar, which is a client component.
  const switcher = (
    <Suspense fallback={<div className="h-[46px]" />}>
      <Switcher />
    </Suspense>
  );
  return (
    <SidebarProvider>
      {/* The sidebar and top bar read the current path, which a page with an
          id in its address only knows at request time. Until then they are
          shown with nothing marked as current. */}
      <Suspense
        fallback={<AppSidebarFor pathname={null} switcher={switcher} />}
      >
        <AppSidebar switcher={switcher} />
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
