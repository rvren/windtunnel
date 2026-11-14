"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Play, Plus, Trash2 } from "lucide-react";

import {
  RepoSourceFields,
  emptyRepoSource,
  toOrigin,
} from "@/components/run/repo-source-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/* The forms of a project: make one, add a workspace, run it, delete it. */

async function send(
  url: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data =
      response.status === 204
        ? {}
        : ((await response.json()) as Record<string, unknown>);
    if (!response.ok) {
      return {
        ok: false,
        error:
          typeof data.error === "string"
            ? data.error
            : "The request could not be completed.",
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

function FormError({
  error,
  testId,
}: {
  error: string | null;
  testId: string;
}) {
  return error ? (
    <Alert variant="destructive" data-testid={testId}>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}

export function NewProjectDialog({
  children,
}: {
  /** The button that opens the form. */
  children: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    setSaving(true);
    const result = await send("/api/projects", "POST", { name, description });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    const { id } = result.data.project as { id: string };
    setOpen(false);
    setSaving(false);
    setName("");
    setDescription("");
    router.push(`/app/projects/${id}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={create}
          className="grid gap-4"
          data-testid="project-form"
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A project is one application. You add its repositories next, as
              workspaces.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="project-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="project-name"
              data-testid="project-form-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="Storefront"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="project-description"
              className="text-sm font-medium"
            >
              What it is meant to do (optional)
            </label>
            <Textarea
              id="project-description"
              data-testid="project-form-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="An online shop: buyers fill a cart, pay by card and track their orders."
            />
            <p className="text-xs text-muted-foreground">
              The agents read this beside the code, and report where the two
              disagree.
            </p>
          </div>
          <FormError error={error} testId="project-form-error" />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={saving}
              data-testid="project-form-create"
            >
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddWorkspaceDialog({
  projectId,
  folders,
  githubToken,
  children,
}: {
  projectId: string;
  folders: string[];
  githubToken: boolean;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState(() => emptyRepoSource(folders));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const picked = toOrigin(source);
    if (!picked.ok) {
      setError(picked.error);
      return;
    }
    setSaving(true);
    const result = await send(`/api/projects/${projectId}/workspaces`, "POST", {
      name: name.trim(),
      origin: picked.origin,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setName("");
    setSource(emptyRepoSource(folders));
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={add}
          className="grid gap-4"
          data-testid="workspace-form"
        >
          <DialogHeader>
            <DialogTitle>Add a workspace</DialogTitle>
            <DialogDescription>
              One repository of the application: its frontend, a backend
              service, a shared library. Nothing in it is ever run.
            </DialogDescription>
          </DialogHeader>
          <div className="max-w-xs space-y-2">
            <label htmlFor="workspace-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="workspace-name"
              data-testid="workspace-form-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value.toLowerCase());
                setError(null);
              }}
              placeholder="web"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits and hyphens. File paths in a run begin
              with it.
            </p>
          </div>
          <RepoSourceFields
            value={source}
            onChange={(next) => {
              setSource(next);
              setError(null);
            }}
            folders={folders}
            githubToken={githubToken}
            idPrefix="workspace-form"
          />
          <FormError error={error} testId="workspace-form-error" />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={saving}
              data-testid="workspace-form-add"
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
              Add workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveWorkspaceButton({
  projectId,
  workspaceId,
  name,
}: {
  projectId: string;
  workspaceId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={busy}
      aria-label={`Remove the workspace ${name}`}
      data-testid="workspace-remove"
      onClick={async () => {
        setBusy(true);
        await send(
          `/api/projects/${projectId}/workspaces/${workspaceId}`,
          "DELETE",
        );
        setBusy(false);
        router.refresh();
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function RunProjectDialog({
  projectId,
  workspaces,
  blocked,
  sampleMode,
  children,
}: {
  projectId: string;
  workspaces: number;
  /** Why a run cannot start right now, or null when it can. */
  blocked: string | null;
  sampleMode: boolean;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    setError(null);
    const result = await send(`/api/projects/${projectId}/runs`, "POST");
    if (!result.ok) {
      setError(result.error);
      setStarting(false);
      return;
    }
    router.push(`/app/runs/${String(result.data.id)}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md" data-testid="run-project-dialog">
        <DialogHeader>
          <DialogTitle>Run this project?</DialogTitle>
          <DialogDescription>
            {sampleMode
              ? "Sample mode is on. This run replays sample data and does not call the model."
              : `Five agents read ${workspaces === 1 ? "the workspace" : `all ${workspaces} workspaces together`}. The run uses your Claude API key and is billed to it. It takes several minutes and goes on if you close this page.`}
          </DialogDescription>
        </DialogHeader>
        {!sampleMode && workspaces > 1 ? (
          <p className="text-sm text-muted-foreground">
            A project run costs more than a run of one repository, because the
            agents read more code.
          </p>
        ) : null}
        <FormError error={blocked ?? error} testId="run-project-error" />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={starting || Boolean(blocked)}
            onClick={start}
            data-testid="run-project-confirm"
          >
            {starting ? <LoaderCircle className="animate-spin" /> : <Play />}
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectDialog({
  projectId,
  name,
  children,
}: {
  projectId: string;
  name: string;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            The project and its workspaces are removed. Its runs are kept and
            stay in the list of runs. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} testId="project-delete-error" />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            data-testid="project-delete-confirm"
            onClick={async () => {
              setBusy(true);
              const result = await send(`/api/projects/${projectId}`, "DELETE");
              if (!result.ok) {
                setError(result.error);
                setBusy(false);
                return;
              }
              router.push("/app/projects");
              router.refresh();
            }}
          >
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
