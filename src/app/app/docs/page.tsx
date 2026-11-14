import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { Doc } from "@/components/docs/doc";

export const metadata: Metadata = { title: "Architecture" };

/** docs/architecture.md, read when the app is built. */
async function readArchitecture(): Promise<string> {
  "use cache";
  return readFile(path.join(process.cwd(), "docs", "architecture.md"), "utf8");
}

export default async function ArchitecturePage() {
  const markdown = await readArchitecture();
  return (
    <>
      <PageHeader
        title="Architecture"
        description="Read from docs/architecture.md in the repository, so it is always the current version."
      />
      <Doc markdown={markdown} />
    </>
  );
}
