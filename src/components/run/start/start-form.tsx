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

import { ProjectSelect } from "@/components/project/project-select";
import { ConfirmRunDialog, costText } from "@/components/run/confirm-run";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EXAMPLE_OUTAGE, featureOf } from "@/lib/features";
import { DOCUMENT_EXTENSIONS, LIMITS } from "@/lib/limits";
import {
  startBody,
  startProblem,
  type ChangeMode,
  type StartInput,
} from "@/lib/start-run";
import { cn } from "@/lib/utils";
import type { RunKind } from "@/server/engine/schema";

import { PartPicker, type PickPart } from "./part-picker";
import { TargetPicker, type PickTarget } from "./target-picker";

/*
 * The one way to start a run, for every kind: three steps, each with one
 * thing to do. Pick the project, give the one input the kind needs (with
 * an example to try), and start. Nothing starts without a yes, and the
 * dialog says whether the run is billed.
 */

export interface StartFormProject {
  id: string;
  name: string;
  description: string;
  /** A sample project: its runs replay a script and cost nothing. */
  demo: boolean;
  workspaces: { name: string; label: string; github: boolean }[];
  /** Engine Out: the parts of the project's latest map, if it has one. */
  parts?: PickPart[] | null;
  /** Engine Out on a sample: the "part:mode" pairs that are scripted. */
  scripted?: string[] | null;
  /** Dogfight: the security issues of the project's latest code run. */
  targets?: PickTarget[];
  /** Dogfight on a sample: the issue ids with a scripted duel. */
  duels?: string[] | null;
}

const STEP_TITLE: Record<RunKind, string> = {
  audit: "What to test",
  crosswind: "The change",
  flyoff: "The feature to design",
  blackbox: "What went wrong",
  engineout: "What to cut",
  dogfight: "The fix to defend",
  preflight: "The spec to check",
};

const CONFIRM_TITLE: Record<RunKind, string> = {
  audit: "Test this requirement?",
  crosswind: "Trace this change?",
  flyoff: "Start the fly-off?",
  blackbox: "Investigate this incident?",
  engineout: "Cut this part?",
  dogfight: "Start the dogfight?",
  preflight: "Check this spec against the code?",
};

const count = (n: number) => n.toLocaleString("en");

function Step({
  n,
  title,
  last = false,
  children,
}: {
  n: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4">
      <div className="flex flex-col items-center">
        <span className="grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs text-muted-foreground">
          {n}
        </span>
        {last ? null : <span className="mt-2 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0 space-y-3", !last && "pb-9")}>
        <h2 className="pt-0.5 text-[0.9375rem] font-medium">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function StartForm({
  kind,
  projects,
  initialProjectId,
  sampleMode,
  blocked,
  prefill,
}: {
  kind: RunKind;
  /** Filled in from an earlier run's "Next", with a line saying so. */
  prefill?: {
    text?: string;
    subject?: "requirement" | "code";
    outage?: StartInput["outage"];
    dogfight?: StartInput["dogfight"];
    note?: string;
  };
  projects: StartFormProject[];
  initialProjectId: string | null;
  sampleMode: boolean;
  /** Why a billed run cannot start now, or null. */
  blocked: string | null;
}) {
  const feature = featureOf(kind);
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(() => {
    // The project asked for; otherwise one this kind can run on, the free
    // sample first.
    const fits = (item: StartFormProject) =>
      kind === "flyoff" || item.workspaces.length > 0;
    return (
      projects.find((item) => item.id === initialProjectId)?.id ??
      projects.find((item) => item.demo && fits(item))?.id ??
      projects.find(fits)?.id ??
      projects[0]?.id ??
      ""
    );
  });
  const project = projects.find((item) => item.id === projectId) ?? null;
  const github = (project?.workspaces ?? []).filter((item) => item.github);
  const [subject, setSubject] = useState<"requirement" | "code">(
    prefill?.subject ??
      (project && project.workspaces.length > 0 ? "code" : "requirement"),
  );
  const [skipped, setSkipped] = useState<string[]>([]);
  const [text, setText] = useState(
    prefill?.text ?? (kind === "flyoff" ? (project?.description ?? "") : ""),
  );
  const [documents, setDocuments] = useState<StartInput["documents"]>([]);
  const [change, setChange] = useState<StartInput["change"]>({
    mode: "text",
    workspace: github[0]?.name ?? "",
    number: "",
    base: "main",
    head: "",
  });
  const [outage, setOutage] = useState<StartInput["outage"]>(
    prefill?.outage ?? { part: "", mode: "down", label: "" },
  );
  const [dogfight, setDogfight] = useState<StartInput["dogfight"]>(
    prefill?.dogfight ?? { runId: "", groupId: "", label: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);

  const chosen = (project?.workspaces ?? [])
    .map((item) => item.name)
    .filter((name) => !skipped.includes(name));
  const input: StartInput = {
    kind,
    subject,
    chosen,
    text,
    documents,
    change,
    outage,
    dogfight,
  };
  const stopped = project?.demo ? null : blocked;
  const cost = project?.demo
    ? "sample-project"
    : sampleMode
      ? "sample-mode"
      : "billed";
  const over = text.length > LIMITS.requirementChars;

  function edit<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setError(null);
    };
  }

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
      if (next.some((item) => item.name === file.name)) continue;
      if (next.length >= LIMITS.documents) {
        setError(`Attach at most ${LIMITS.documents} files.`);
        break;
      }
      const content = await file.text();
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

  function review(event: React.FormEvent) {
    event.preventDefault();
    const problem = startProblem(input, project);
    if (problem) {
      setError(problem);
      return;
    }
    setConfirming(true);
  }

  async function start() {
    if (!project) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startBody(input, project)),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (response.ok && body.id) {
        router.push(`/app/runs/${body.id}`);
        return;
      }
      setError(body.error ?? "The run could not be started.");
    } catch {
      setError("Could not reach the server.");
    }
    setStarting(false);
    setConfirming(false);
  }

  const example = (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0"
      data-testid="start-use-example"
      onClick={() => {
        setText(feature.example);
        if (kind === "crosswind") setChange({ ...change, mode: "text" });
        setError(null);
      }}
    >
      Use The Example
    </Button>
  );

  const textBox = (placeholder: string, mono = false) => (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(event) => edit(setText)(event.target.value)}
        placeholder={placeholder}
        aria-invalid={over}
        aria-label={STEP_TITLE[kind]}
        className={cn(
          "min-h-36 text-base leading-relaxed",
          mono && "font-mono text-[0.8125rem]",
        )}
        data-testid="start-text"
      />
      <div className="flex items-center justify-between gap-4">
        {example}
        <p
          className={cn(
            "text-xs",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {count(text.length)} of {count(LIMITS.requirementChars)}
        </p>
      </div>
    </div>
  );

  return (
    <form onSubmit={review} className="max-w-3xl" data-testid="start-form">
      <ConfirmRunDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={
          kind === "audit" && subject === "code"
            ? "Run the project's code?"
            : CONFIRM_TITLE[kind]
        }
        cost={cost}
        starting={starting}
        error={null}
        onConfirm={start}
        confirmLabel={feature.start}
      />

      <Step n={1} title="Project">
        <div className="max-w-sm space-y-2">
          <ProjectSelect
            id="start-project"
            className="w-full"
            testId="start-project"
            projects={projects.map((item) => ({
              id: item.id,
              name: item.name,
              workspaces: item.workspaces.length,
              demo: item.demo,
            }))}
            value={projectId || null}
            onChange={(value) => {
              const next = projects.find((item) => item.id === value) ?? null;
              setProjectId(value ?? "");
              setSkipped([]);
              setChange({
                ...change,
                workspace:
                  next?.workspaces.find((item) => item.github)?.name ?? "",
              });
              setOutage({ ...outage, part: "", label: "" });
              setDogfight({ runId: "", groupId: "", label: "" });
              if (kind === "flyoff" && !text.trim()) {
                setText(next?.description ?? "");
              }
              setError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {project?.demo
              ? "A sample project: runs replay a script and cost nothing."
              : project
                ? `${project.workspaces.length} ${project.workspaces.length === 1 ? "workspace" : "workspaces"}`
                : "Every run belongs to a project."}
          </p>
        </div>
      </Step>

      <Step n={2} title={STEP_TITLE[kind]}>
        {prefill?.note ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="start-prefill"
          >
            {prefill.note}
          </p>
        ) : null}
        {kind === "audit" ? (
          <div className="space-y-4">
            <Tabs
              value={subject}
              onValueChange={(value) =>
                edit(setSubject)(value as typeof subject)
              }
            >
              <TabsList variant="pill">
                <TabsTrigger value="code" data-testid="start-subject-code">
                  Its code
                </TabsTrigger>
                <TabsTrigger
                  value="requirement"
                  data-testid="start-subject-requirement"
                >
                  An idea, in words
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {subject === "code" ? (
              project && project.workspaces.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    The agents read these workspaces together. Nothing in a
                    repository is ever run.
                  </p>
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
                          data-testid="start-workspace"
                          onClick={() =>
                            edit(setSkipped)(
                              on
                                ? [...skipped, workspace.name]
                                : skipped.filter(
                                    (name) => name !== workspace.name,
                                  ),
                            )
                          }
                        >
                          {on ? <Check /> : null}
                          {workspace.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="rounded-card border border-dashed px-4 py-5 text-sm text-muted-foreground">
                  This project has no code yet. Add a workspace on its page, or
                  test an idea in words.
                </p>
              )
            ) : (
              <>
                {textBox(feature.example)}
                <div className="space-y-2">
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${document.name}`}
                            onClick={() =>
                              setDocuments(
                                documents.filter(
                                  (item) => item.name !== document.name,
                                ),
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
                    onChange={(event) => void attach(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="start-add-files"
                    onClick={() => picker.current?.click()}
                  >
                    <Paperclip />
                    Add A PRD Or Design Doc
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : kind === "crosswind" ? (
          <div className="space-y-4">
            <Tabs
              value={change.mode}
              onValueChange={(value) =>
                edit(setChange)({ ...change, mode: value as ChangeMode })
              }
            >
              <TabsList variant="pill">
                <TabsTrigger value="text">In words</TabsTrigger>
                <TabsTrigger value="pr" disabled={github.length === 0}>
                  A pull request
                </TabsTrigger>
                <TabsTrigger value="branches" disabled={github.length === 0}>
                  Two branches
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {change.mode === "text" ? (
              textBox(feature.example)
            ) : (
              <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Workspace
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-[0.8125rem] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    value={change.workspace}
                    onChange={(event) =>
                      edit(setChange)({
                        ...change,
                        workspace: event.target.value,
                      })
                    }
                    data-testid="start-change-workspace"
                  >
                    {github.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} · {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {change.mode === "pr" ? (
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Pull request number
                    <Input
                      inputMode="numeric"
                      value={change.number}
                      onChange={(event) =>
                        edit(setChange)({
                          ...change,
                          number: event.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="42"
                      data-testid="start-change-number"
                    />
                  </label>
                ) : (
                  <>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      Into (base)
                      <Input
                        value={change.base}
                        onChange={(event) =>
                          edit(setChange)({
                            ...change,
                            base: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      From (head)
                      <Input
                        value={change.head}
                        onChange={(event) =>
                          edit(setChange)({
                            ...change,
                            head: event.target.value,
                          })
                        }
                        placeholder="feature/redis-sessions"
                      />
                    </label>
                  </>
                )}
              </div>
            )}
            {github.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No workspace of this project is on GitHub, so describe the
                change in words.
              </p>
            ) : null}
          </div>
        ) : kind === "dogfight" ? (
          <TargetPicker
            targets={[
              ...(prefill?.dogfight &&
              !(project?.targets ?? []).some(
                (item) =>
                  item.runId === prefill.dogfight!.runId &&
                  item.groupId === prefill.dogfight!.groupId,
              )
                ? [
                    {
                      runId: prefill.dogfight.runId,
                      groupId: prefill.dogfight.groupId,
                      title: prefill.dogfight.label,
                      severity: "high",
                      hasFix: true,
                    },
                  ]
                : []),
              ...(project?.targets ?? []),
            ]}
            scripted={
              project?.demo || sampleMode ? (project?.duels ?? null) : null
            }
            value={dogfight}
            onChange={edit(setDogfight)}
            example={
              (project?.targets ?? []).some(
                (item) => item.groupId === "g-cat-sqli",
              ) ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  data-testid="start-use-example"
                  onClick={() => {
                    const target = project?.targets?.find(
                      (item) => item.groupId === "g-cat-sqli",
                    );
                    if (target) {
                      setDogfight({
                        runId: target.runId,
                        groupId: target.groupId,
                        label: target.title,
                      });
                    }
                    setError(null);
                  }}
                >
                  Use The Example
                </Button>
              ) : null
            }
          />
        ) : kind === "engineout" ? (
          <PartPicker
            parts={project?.parts ?? null}
            scripted={
              project?.demo || sampleMode ? (project?.scripted ?? null) : null
            }
            value={outage}
            onChange={edit(setOutage)}
            example={
              (project?.parts ?? []).some(
                (part) => part.id === EXAMPLE_OUTAGE.part,
              ) ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  data-testid="start-use-example"
                  onClick={() => {
                    const part = project?.parts?.find(
                      (item) => item.id === EXAMPLE_OUTAGE.part,
                    );
                    setOutage({
                      part: EXAMPLE_OUTAGE.part,
                      mode: EXAMPLE_OUTAGE.mode,
                      label: part?.name ?? EXAMPLE_OUTAGE.label,
                    });
                    setError(null);
                  }}
                >
                  Use The Example
                </Button>
              ) : null
            }
          />
        ) : kind === "flyoff" || kind === "preflight" ? (
          textBox(feature.example)
        ) : (
          textBox(feature.example, true)
        )}
      </Step>

      <Step n={3} title="Start" last>
        {stopped ? (
          <Alert data-testid="start-blocked">
            <AlertTitle>A run cannot start yet</AlertTitle>
            <AlertDescription>{stopped}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" data-testid="start-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            size="lg"
            className="h-10 px-4"
            disabled={Boolean(stopped) || starting || over || !project}
            data-testid="start-submit"
          >
            {starting ? <LoaderCircle className="animate-spin" /> : <Play />}
            {feature.start}
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">
            {costText(cost)}
          </p>
        </div>
      </Step>
    </form>
  );
}
