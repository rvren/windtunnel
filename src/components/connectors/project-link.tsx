"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "none";

/**
 * A project's link to 8090 Software Factory: which project there this
 * project's work orders are added to. With none chosen, nothing is sent.
 */
export function ProjectLink({
  projectId,
  externalId,
  connected,
}: {
  projectId: string;
  /** The linked 8090 project id, or null. */
  externalId: string | null;
  /** Whether 8090 is connected in Settings. */
  connected: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The choices come from 8090 itself, so only real projects can be picked.
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    fetch("/api/connectors/software-factory/projects")
      .then(async (response) => {
        const body = (await response.json()) as {
          projects?: { id: string; name: string }[];
          error?: string;
        };
        if (stopped) return;
        if (response.ok) setProjects(body.projects ?? []);
        else setError(body.error ?? "The 8090 projects could not be read.");
      })
      .catch(() => {
        if (!stopped) setError("Could not reach the server.");
      });
    return () => {
      stopped = true;
    };
  }, [connected]);

  async function save(next: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: next === NONE ? "" : next }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "The link could not be saved.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    }
    setSaving(false);
  }

  const linked = projects?.find((item) => item.id === externalId);
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="project-link"
    >
      <span className="text-sm text-muted-foreground">8090 project</span>
      {connected ? (
        <Select
          value={externalId ?? NONE}
          onValueChange={(value) => save(String(value ?? NONE))}
          disabled={saving || projects === null}
        >
          <SelectTrigger
            size="sm"
            className="w-64"
            aria-label="8090 project"
            data-testid="project-link-select"
          >
            <SelectValue>
              {projects === null
                ? "Reading 8090 projects"
                : externalId
                  ? (linked?.name ?? "A project not in the list")
                  : "Not linked"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not linked</SelectItem>
            {(projects ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {saving ? (
        <LoaderCircle
          className="size-4 animate-spin text-muted-foreground"
          aria-label="Saving"
        />
      ) : null}
      <span
        className="text-xs text-muted-foreground"
        data-testid="project-link-state"
      >
        {error ? (
          <span className="text-sev-critical">{error}</span>
        ) : !connected ? (
          <>
            8090 is not connected.{" "}
            <Link
              href="/app/settings?tab=connectors"
              className="text-link underline-offset-4 hover:underline"
            >
              Connect it
            </Link>
          </>
        ) : externalId ? (
          "Work orders from this project's runs are added there."
        ) : (
          "Not linked: nothing is sent."
        )}
      </span>
    </div>
  );
}
