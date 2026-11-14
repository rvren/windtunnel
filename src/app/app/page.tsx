import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Plus } from "lucide-react";

import { PageHeader, PageLoading } from "@/components/app/page-header";
import { Mark } from "@/components/brand/logo";
import { LocalTime } from "@/components/local-time";
import { StatusBadge } from "@/components/run/badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ensureDatabase } from "@/server/db/ready";
import { runStore } from "@/server/engine/registry";
import type { RunSummary } from "@/server/engine/schema";

async function RunsTable() {
  await connection();
  let runs: RunSummary[];
  try {
    await ensureDatabase();
    runs = await runStore().list();
  } catch {
    return (
      <Alert variant="destructive" data-testid="runs-database-down">
        <AlertTitle>The database is not reachable</AlertTitle>
        <AlertDescription>
          Start it with `docker compose up -d db`, then reload this page.
        </AlertDescription>
      </Alert>
    );
  }

  if (runs.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-md border border-dashed px-6 py-16 text-center"
        data-testid="runs-empty"
      >
        <Mark className="size-10" />
        <h2 className="mt-5 text-lg font-medium">Start your first run</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Give Windtunnel a requirement. Five agents test the design and report
          what fails.
        </p>
        <Link
          href="/app/runs/new"
          data-testid="runs-empty-new-run"
          className={buttonVariants({ className: "mt-6" })}
        >
          <Plus />
          New run
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <Table data-testid="runs-table">
        <TableHeader>
          <TableRow>
            <TableHead>Requirement</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Findings</TableHead>
            <TableHead className="text-right">Work orders</TableHead>
            <TableHead className="text-right">Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="max-w-md whitespace-normal">
                <Link
                  href={`/app/runs/${run.id}`}
                  data-testid="runs-row-link"
                  className="line-clamp-2 font-medium underline-offset-4 hover:underline"
                >
                  {run.title}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge status={run.status} />
              </TableCell>
              <TableCell className="text-right">{run.findingCount}</TableCell>
              <TableCell className="text-right">{run.workOrderCount}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                <LocalTime iso={run.createdAt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Runs"
        description="Every requirement you have put through the tunnel."
      >
        <Link
          href="/app/runs/new"
          data-testid="runs-new-run"
          className={buttonVariants()}
        >
          <Plus />
          New run
        </Link>
      </PageHeader>
      <Suspense fallback={<PageLoading label="Reading the runs" />}>
        <RunsTable />
      </Suspense>
    </>
  );
}
