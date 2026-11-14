import { Suspense } from "react";
import type { Metadata } from "next";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { SOFTWARE_FACTORY } from "@/server/connectors/software-factory";

import { ConnectorsSection } from "../sections";

export const metadata: Metadata = { title: "Connectors · Settings" };

async function Section({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const outcome =
    query.connected === SOFTWARE_FACTORY
      ? "connected"
      : query.failed === SOFTWARE_FACTORY
        ? "failed"
        : null;
  return <ConnectorsSection outcome={outcome} />;
}

export default function ConnectorsSettingsPage({
  searchParams,
}: PageProps<"/app/settings/connectors">) {
  return (
    <>
      <PageHeader
        title="Connectors"
        description="Where Windtunnel sends its work orders. One connector works today; the rest are planned."
      />
      <Suspense fallback={<PageLoading label="Reading the connectors" />}>
        <Section searchParams={searchParams} />
      </Suspense>
    </>
  );
}
