import { Suspense } from "react";
import type { Metadata } from "next";

import { PageHeader, PageLoading } from "@/components/app/page-header";

import { Status } from "./sections";

export const metadata: Metadata = { title: "Engine · Settings" };

export default function EngineSettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Engine"
        description="What the engine is set up with, read from the server's environment. Change it there."
      />
      <Suspense fallback={<PageLoading label="Checking the engine" />}>
        <Status />
      </Suspense>
    </div>
  );
}
