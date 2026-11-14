"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/*
 * Adds and removes the sample application, Storefront. Its runs replay a
 * script and never call the model; its repositories are fetched from GitHub
 * like any other.
 */
export function SampleData({
  present,
  githubToken,
}: {
  /** Whether sample data exists now. */
  present: boolean;
  /** Whether the server can fetch the private sample repositories. */
  githubToken: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"empty" | "complete" | "remove" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function send(kind: NonNullable<typeof busy>) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/demo", {
        method: kind === "remove" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body:
          kind === "remove"
            ? undefined
            : JSON.stringify({ complete: kind === "complete" }),
      });
      const body = (await response.json()) as {
        error?: string;
        projectId?: string;
        runId?: string | null;
        projects?: number;
        runs?: number;
      };
      if (!response.ok) {
        setError(body.error ?? "The request could not be completed.");
      } else if (kind === "remove") {
        setNote(
          `Removed ${body.projects} sample ${body.projects === 1 ? "project" : "projects"} and ${body.runs} ${body.runs === 1 ? "run" : "runs"}.`,
        );
        router.refresh();
      } else {
        router.push(
          body.runId
            ? `/app/runs/${body.runId}`
            : `/app/projects/${body.projectId}`,
        );
        router.refresh();
        return;
      }
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(null);
  }

  const spin = (kind: typeof busy, icon: React.ReactNode) =>
    busy === kind ? <LoaderCircle className="animate-spin" /> : icon;

  return (
    <div className="space-y-4" data-testid="sample-data">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Storefront is a sample shop of seven small services, each in its own
        private repository. A sample project&apos;s runs replay a script: they
        fetch and read the real repositories, and never call the model.
      </p>
      {githubToken ? null : (
        <Alert data-testid="sample-data-no-token">
          <AlertDescription>
            The sample repositories are private. Add GITHUB_TOKEN to .env.local
            and restart the server, or a run cannot fetch them.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => send("empty")}
          data-testid="sample-data-add-empty"
        >
          {spin("empty", <Plus />)}
          Add sample project
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => send("complete")}
          data-testid="sample-data-add-complete"
        >
          {spin("complete", <Plus />)}
          Add complete sample and run it
        </Button>
        <Button
          variant="destructive"
          disabled={busy !== null || !present}
          onClick={() => send("remove")}
          data-testid="sample-data-remove"
        >
          {spin("remove", <Trash2 />)}
          Remove sample data
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The first adds an empty project, for you to add its repositories one by
        one. Removing deletes every sample project with its runs, and nothing
        else.
      </p>
      {note ? (
        <p className="text-sm" role="status" data-testid="sample-data-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive" data-testid="sample-data-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
