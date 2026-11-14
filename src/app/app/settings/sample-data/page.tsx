import { Suspense } from "react";
import type { Metadata } from "next";

import { PageHeader, PageLoading } from "@/components/app/page-header";

import { Sample } from "../sections";

export const metadata: Metadata = { title: "Sample data · Settings" };

export default function SampleDataSettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Sample data"
        description="Storefront, a sample shop of seven services, to try Windtunnel without spending."
      />
      <Suspense fallback={<PageLoading label="Looking for sample data" />}>
        <Sample />
      </Suspense>
    </div>
  );
}
