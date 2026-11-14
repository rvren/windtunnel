"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Paperclip, Play, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function RunForm({
  blocked,
  folders,
  githubToken,
}: {
  /** Why a run cannot start right now, or null when it can. */
  blocked: string | null;
  /** The local folders that may be run against. */
  folders: string[];
  /** Whether the server has a GitHub token, for private repositories. */
  githubToken: boolean;
}) {
  // What the agents test: a written requirement, or a repository's code.
  const [subject, setSubject] = useState<"requirement" | "repository">(
    "requirement",
  );
  const [origin, setOrigin] = useState<"github" | "local">("github");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [folder, setFolder] = useState(folders[0] ?? "");
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [requirement, setRequirement] = useState("");
  const [documents, setDocuments] = useState<Attached[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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
    const repository =
      subject !== "repository"
        ? undefined
        : origin === "github"
          ? { kind: "github", url: url.trim(), branch: branch.trim() }
          : { kind: "local", name: folder };
    if (!repository && !requirement.trim()) {
      setError("Enter a requirement.");
      return;
    }
    if (repository?.kind === "github" && !repository.url) {
      setError("Enter the repository's GitHub address.");
      return;
    }
    if (repository?.kind === "local" && !repository.name) {
      setError("Choose a folder.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement, documents, repository }),
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
      {blocked ? (
        <Alert data-testid="run-form-blocked">
          <AlertTitle>A run cannot start yet</AlertTitle>
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      ) : null}

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
          <TabsTrigger
            value="repository"
            data-testid="run-form-subject-repository"
          >
            A repository
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {subject === "repository" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The agents read the code, in any language, and report flaws with the
            file and lines that show them. Nothing in the repository is ever
            run.
          </p>
          <Tabs
            value={origin}
            onValueChange={(value) => {
              setOrigin(value as typeof origin);
              setError(null);
            }}
          >
            <TabsList>
              <TabsTrigger value="github" data-testid="run-form-origin-github">
                From GitHub
              </TabsTrigger>
              <TabsTrigger value="local" data-testid="run-form-origin-local">
                Local folder
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {origin === "github" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-2">
                <label htmlFor="repo-url" className="text-sm font-medium">
                  Repository address
                </label>
                <Input
                  id="repo-url"
                  data-testid="run-form-repo-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://github.com/owner/name"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="repo-branch" className="text-sm font-medium">
                  Branch
                </label>
                <Input
                  id="repo-branch"
                  data-testid="run-form-repo-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="Default branch"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {githubToken
                  ? "Private repositories work: the server has a GitHub token."
                  : "Public repositories only. For private ones, add GITHUB_TOKEN to .env.local and restart the server."}
              </p>
            </div>
          ) : folders.length > 0 ? (
            <div className="max-w-sm space-y-2">
              <label htmlFor="repo-folder" className="text-sm font-medium">
                Folder
              </label>
              <Select
                value={folder}
                onValueChange={(value) => setFolder(String(value ?? ""))}
              >
                <SelectTrigger
                  id="repo-folder"
                  className="w-full"
                  data-testid="run-form-repo-folder"
                >
                  <SelectValue placeholder="Choose a folder" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No folders yet. Put a repository in the server&apos;s repositories
              folder (`repos/` in the Windtunnel project) and reload this page.
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="requirement" className="text-sm font-medium">
            {subject === "repository"
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
          disabled={Boolean(blocked) || starting || over}
        >
          {starting ? <LoaderCircle className="animate-spin" /> : <Play />}
          {starting ? "Starting" : "Start run"}
        </Button>
        <p className="max-w-md text-xs text-muted-foreground">
          The requirement and files are sent to the Claude API to be analysed. A
          run takes a few minutes and goes on if you close this page.
        </p>
      </div>
    </form>
  );
}
