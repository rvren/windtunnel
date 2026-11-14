"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["engine", "connectors", "sample"] as const;
type Tab = (typeof TABS)[number];

/** The three parts of Settings. Each part is rendered on the server. */
export function SettingsTabs({
  initial,
  engine,
  connectors,
  sample,
}: {
  /** The tab named in the address, if any. */
  initial: string | null;
  engine: React.ReactNode;
  connectors: React.ReactNode;
  sample: React.ReactNode;
}) {
  const first = TABS.includes(initial as Tab) ? (initial as Tab) : "engine";
  return (
    <Tabs defaultValue={first} className="gap-7">
      <TabsList>
        <TabsTrigger value="engine" data-testid="settings-tab-engine">
          Engine
        </TabsTrigger>
        <TabsTrigger value="connectors" data-testid="settings-tab-connectors">
          Connectors
        </TabsTrigger>
        <TabsTrigger value="sample" data-testid="settings-tab-sample">
          Sample data
        </TabsTrigger>
      </TabsList>
      <TabsContent value="engine" className="max-w-3xl">
        {engine}
      </TabsContent>
      <TabsContent value="connectors">{connectors}</TabsContent>
      <TabsContent value="sample" className="max-w-3xl">
        {sample}
      </TabsContent>
    </Tabs>
  );
}
