"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  LoaderCircle,
  Paperclip,
  Play,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_EXTENSIONS, EXAMPLE_REQUIREMENT, LIMITS } from "@/lib/limits";

interface Attached {
  name: string;
  content: string;
}

const count = (n: number) => n.toLocaleString("en");

export interface FormProject {
  id: string;
  name: string;
  /** A sample project: its runs replay a script and never call the model. */
  demo: boolean;
  workspaces: { name: string; label: string }[];
}

export function RunForm({
  blocked,
  projects,
  initialProjectId,
}: {
  /** Why a run on the model cannot start right now, or null when it can. */
  blocked: string | null;
  /** Every run belongs to one of these. */
  projects: FormProject[];
  /** The project to start with, when the page was opened from one. */
  initialProjectId: string | null;
}) {
  const [projectId, setProjectId] = useState(
    projects.find((item) => item.id === initialProjectId)?.id ??
      projects[0]?.id ??
      "",
  );
  const project = projects.find((item) => item.id === projectId) ?? null;
  // What the agents test: a written requirement, or the project's code.
  const [subject, setSubject] = useState<"requirement" | "code">("requirement");
  // The workspaces left out of a code run. All are read unless unticked.
  const [skipped, setSkipped] = useState<string[]>([]);
  const chosen = (project?.workspaces ?? [])
    .map((item) => item.name)
    .filter((name) => !skipped.includes(name));
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [requirement, setRequirement] = useState("");
  const [documents, setDocuments] = useState<Attached[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // A sample project's runs never reach the model, so nothing blocks them.
  const stopped = project?.demo ? null : blocked;

  async function attach(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...documents];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (!DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        setError(
          `"${file.name}" is not a ${DOCUMENT_EXTENSIONS.join(", ")} file.`,
        );
        continue;
      }
      if (next.some((item) => item.name === file.name)) {
        setError(`"${file.name}" is already attached.`);
        continue;
      }
      if (next.length >= LIMITS.documents) {
        setError(`Attach at most ${LIMITS.documents} files.`);
        break;
      }
      const content = await file.text();
      // Never cut a file short to make it fit: refuse it and say why.
      if (content.length > LIMITS.documentChars) {
        setError(
          `"${file.name}" is ${count(content.length)} characters. The limit for one file is ${count(LIMITS.documentChars)}.`,
        );
        continue;
      }
      next.push({ name: file.name, content });
    }
    setDocuments(next);
    if (picker.current) picker.current.value = "";
  }

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!project) {
      setError("Choose a project.");
      return;
    }
    const code = subject === "code";
    if (code && chosen.length === 0) {
      setError("Choose at least one workspace.");
      return;
    }
    if (!code && !requirement.trim()) {
      setError("Enter a requirement.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          requirement,
          documents,
          ...(code ? { workspaces: chosen } : {}),
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "The run could not be started.");
        setStarting(false);
        return;
      }
      router.push(`/app/runs/${body.id}`);
    } catch {
      setError("Could not reach the server.");
      setStarting(false);
    }
  }

  const over = requirement.length > LIMITS.requirementChars;

  return (
    <form onSubmit={start} className="space-y-6" data-testid="run-form">
      {stopped ? (
        <Alert data-testid="run-form-blocked">
          <AlertTitle>A run cannot start yet</AlertTitle>
          <AlertDescription>{stopped}</AlertDescription>
        </Alert>
      ) : null}

      <div className="max-w-sm space-y-2">
        <label htmlFor="run-project" className="text-sm font-medium">
          Project
        </label>
        <Select
          value={projectId}
          onValueChange={(value) => {
            setProjectId(String(value ?? ""));
            setSkipped([]);
            setError(null);
          }}
        >
          <SelectTrigger
            id="run-project"
            className="w-full"
            data-testid="run-form-project"
          >
            <SelectValue placeholder="Choose a project">
              {project?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {projects.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {project?.demo
            ? "A sample project. Its runs replay a script and do not call the model."
            : "Every run belongs to a project."}
        </p>
      </div>

      <Tabs
        value={subject}
        onValueChange={(value) => {
          setSubject(value as typeof subject);
          setError(null);
        }}
      >
        <TabsList>
          <TabsTrigger
            value="requirement"
            data-testid="run-form-subject-requirement"
          >
            A requirement
          </TabsTrigger>
          <TabsTrigger value="code" data-testid="run-form-subject-code">
            The code
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {subject === "code" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The agents read the workspaces you choose, together, and report
            flaws with the file and lines that show them. Nothing in a
            repository is ever run.
          </p>
          {project && project.workspaces.length > 0 ? (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Workspaces to read"
            >
              {project.workspaces.map((workspace) => {
                const on = !skipped.includes(workspace.name);
                return (
                  <Button
                    key={workspace.name}
                    type="button"
                    size="sm"
                    variant={on ? "secondary" : "outline"}
                    aria-pressed={on}
                    data-testid="run-form-workspace"
                    onClick={() => {
                      setSkipped(
                        on
                          ? [...skipped, workspace.name]
                          : skipped.filter((name) => name !== workspace.name),
                      );
                      setError(null);
                    }}
                  >
                    {on ? <Check /> : null}
                    {workspace.name}
                    <span className="font-mono text-xs text-muted-foreground">
                      {workspace.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-card border border-dashed px-4 py-6 text-sm text-muted-foreground">
              This project has no workspaces yet. Add a repository on the
              project&apos;s page first.
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="requirement" className="text-sm font-medium">
            {subject === "code"
              ? "What it is meant to do (optional)"
              : "Requirement"}
          </label>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            data-testid="run-form-use-example"
            onClick={() => {
              setRequirement(EXAMPLE_REQUIREMENT);
              setError(null);
            }}
          >
            Use the example
          </Button>
        </div>
        <Textarea
          id="requirement"
          data-testid="run-form-requirement"
          value={requirement}
          onChange={(event) => {
            setRequirement(event.target.value);
            setError(null);
          }}
          placeholder={EXAMPLE_REQUIREMENT}
          rows={8}
          aria-invalid={over}
          className="min-h-44 text-base leading-relaxed"
        />
        <p
          className={
            over ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {count(requirement.length)} of {count(LIMITS.requirementChars)}{" "}
          characters. Put longer material in a file.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Files</p>
        <p className="text-sm text-muted-foreground">
          Optional. A PRD or a design doc as Markdown or plain text, up to{" "}
          {LIMITS.documents} files.
        </p>
        {documents.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {documents.map((document) => (
              <li
                key={document.name}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {document.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {count(document.content.length)} characters
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${document.name}`}
                  data-testid="run-form-remove-file"
                  onClick={() =>
                    setDocuments(
                      documents.filter((item) => item.name !== document.name),
                    )
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={picker}
          type="file"
          multiple
          accept={DOCUMENT_EXTENSIONS.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="run-form-file-input"
          onChange={(event) => void attach(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          data-testid="run-form-add-files"
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
          Add files
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" data-testid="run-form-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 border-t pt-6">
        <Button
          type="submit"
          size="lg"
          className="h-10 px-4"
          data-testid="run-form-start"
          disabled={Boolean(stopped) || starting || over || !project}
        >
          {starting ? <LoaderCircle className="animate-spin" /> : <Play />}
          {starting ? "Starting" : "Start run"}
        </Button>
        <p className="max-w-md text-xs text-muted-foreground">
          {project?.demo
            ? "A sample project: the run replays a script, and nothing is sent to the Claude API. It goes on if you close this page."
            : "The requirement and files are sent to the Claude API to be analysed. A run takes a few minutes and goes on if you close this page."}
        </p>
      </div>
    </form>
  );
}
