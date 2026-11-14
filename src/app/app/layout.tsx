import { Suspense } from "react";
import type { Metadata } from "next";

import { AppSidebar, AppSidebarFor } from "@/components/app/app-sidebar";
import { AppTopbar, AppTopbarFor } from "@/components/app/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: { default: "Runs", template: "%s · Windtunnel" },
};

// The product shell: a sidebar, a top bar and the page. The marketing header
// is not part of this area.
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <SidebarProvider>
      {/* The sidebar and top bar read the current path, which a page with an
          id in its address only knows at request time. Until then they are
          shown with nothing marked as current. */}
      <Suspense fallback={<AppSidebarFor pathname={null} />}>
        <AppSidebar />
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
