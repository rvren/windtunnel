import { Suspense } from "react";
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

/** The project switcher, with the list of projects read for it. */
async function Switcher() {
  await connection();
  let projects: { id: string; name: string; workspaces: number }[] = [];
  try {
    await ensureDatabase();
    projects = (await listProjects()).map((project) => ({
      id: project.id,
      name: project.name,
      workspaces: project.workspaces.length,
    }));
  } catch {
    // With no database the pages say so; the switcher is shown empty.
  }
  return <ProjectSwitcher projects={projects} />;
}

// The product shell: a sidebar, a top bar and the page. The marketing header
// is not part of this area.
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
      <SidebarInset>
        <Suspense fallback={<AppTopbarFor pathname={null} />}>
          <AppTopbar />
        </Suspense>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
