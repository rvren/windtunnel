"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Paperclip,
  Play,
  X,
} from "lucide-react";

import {
  costText,
  tokensUsed,
  type RunCost,
} from "@/components/run/confirm-run";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { RequirementDiff } from "@/components/run/refine/versions";
import { DOCUMENT_EXTENSIONS, LIMITS } from "@/lib/limits";
import { cn } from "@/lib/utils";
import {
  decisionsText,
  lineDiff,
  questions as questionsOf,
  withDecisions,
  type Answer,
  type Question,
} from "@/lib/viz/refine";
import type { RunDocument, RunRecord } from "@/server/engine/schema";

/*
 * Refining a requirement: answer what the run found unsaid, edit the text,
 * review the change, and run the next version. Answers become a plain
 * "## Decisions" section in the owner's own words; no model rewrites
 * anything, so nothing here costs money until the run is started.
 */

type Step = "answer" | "edit" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "answer", label: "Answer" },
  { id: "edit", label: "Edit" },
  { id: "review", label: "Review and run" },
];

/** How many questions a section shows before "Show all". */
const FIRST = 6;

const draftKey = (runId: string) => `windtunnel:refine:${runId}`;

function readDraft(runId: string): Record<string, Answer> {
  try {
    const text = window.localStorage.getItem(draftKey(runId));
    return text ? (JSON.parse(text) as Record<string, Answer>) : {};
  } catch {
    return {};
  }
}

function saveDraft(runId: string, answers: Record<string, Answer>) {
  try {
    window.localStorage.setItem(draftKey(runId), JSON.stringify(answers));
  } catch {
    // A draft is a convenience; without storage it lasts until the sheet closes.
  }
}

function clearDraft(runId: string) {
  try {
    window.localStorage.removeItem(draftKey(runId));
  } catch {
    // Nothing to clear.
  }
}

function QuestionRow({
  question,
  answer,
  onAnswer,
}: {
  question: Question;
  answer: Answer | undefined;
  onAnswer: (answer: Answer | undefined) => void;
}) {
  const assumption = question.kind === "assumption";
  const kept = answer && "keep" in answer;
  const [changing, setChanging] = useState(
    Boolean(answer && "text" in answer && assumption),
  );
  const text = answer && "text" in answer ? answer.text : "";
  const answered = kept || text.trim().length > 0;
  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 py-3"
      data-testid="refine-question"
      data-kind={question.kind}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 grid size-4 place-items-center rounded-full ring-1",
          answered ? "bg-ok text-background ring-ok" : "ring-foreground/20",
        )}
      >
        {answered ? <Check className="size-3" /> : null}
      </span>
      <div className="space-y-2">
        <p className="leading-snug">
          {assumption ? question.statement : question.text}
        </p>
        {question.hint ? (
          <p className="text-xs text-muted-foreground">{question.hint}</p>
        ) : null}
        {assumption && !changing ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={kept ? "default" : "outline"}
              onClick={() => onAnswer(kept ? undefined : { keep: true })}
              data-testid="refine-keep"
            >
              <Check />
              Keep
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setChanging(true);
                onAnswer({ text: "" });
              }}
              data-testid="refine-change"
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={text}
              placeholder={
                assumption ? "What should it be instead?" : "Your answer"
              }
              aria-label={`Answer: ${question.text}`}
              onChange={(event) => onAnswer({ text: event.target.value })}
              data-testid="refine-answer"
            />
            {assumption ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setChanging(false);
                  onAnswer(undefined);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}

function Section({
  title,
  items,
  answers,
  onAnswer,
}: {
  title: string;
  items: Question[];
  answers: Record<string, Answer>;
  onAnswer: (id: string, answer: Answer | undefined) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <section>
      <h3 className="flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
        <span className="font-mono normal-case">{items.length}</span>
      </h3>
      <ul className="divide-y">
        {shown.map((question) => (
          <QuestionRow
            key={question.id}
            question={question}
            answer={answers[question.id]}
            onAnswer={(answer) => onAnswer(question.id, answer)}
          />
        ))}
      </ul>
      {items.length > FIRST ? (
        <button
          type="button"
          className="text-xs text-link hover:underline"
          onClick={() => setAll(!all)}
        >
          {all ? "Show Fewer" : `Show All ${items.length}`}
        </button>
      ) : null}
    </section>
  );
}

export function RefineSheet({
  run,
  cost,
  nextNumber,
  children,
}: {
  run: RunRecord;
  cost: RunCost;
  /** The number the new version will get. */
  nextNumber: number;
  /** The button that opens it. */
  children: React.ReactElement;
}) {
  const router = useRouter();
  const list = useMemo(() => questionsOf(run), [run]);
  const sections = useMemo(() => {
    const out = new Map<string, Question[]>();
    for (const question of list)
      out.set(question.section, [
        ...(out.get(question.section) ?? []),
        question,
      ]);
    return [...out];
  }, [list]);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("answer");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [text, setText] = useState(run.requirement);
  // Once the owner edits the text by hand, answers no longer rewrite it.
  const [edited, setEdited] = useState(false);
  const [documents, setDocuments] = useState<RunDocument[]>(run.documents);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const answered = list.filter((question) => {
    const answer = answers[question.id];
    return answer && ("keep" in answer || answer.text.trim());
  }).length;
  const draft = withDecisions(run.requirement, decisionsText(list, answers));
  const next = edited ? text : draft;
  const diff = lineDiff(run.requirement, next);
  const changed = diff.some((line) => line.kind !== "same");
  const filesChanged =
    documents.length !== run.documents.length ||
    documents.some((item, index) => item.name !== run.documents[index]?.name);
  const tokens = tokensUsed(run.usage);
  const over = next.length > LIMITS.requirementChars;

  function onOpenChange(value: boolean) {
    setOpen(value);
    if (value) {
      setAnswers(readDraft(run.id));
      setStep(list.length > 0 ? "answer" : "edit");
      setError(null);
    }
  }

  function answer(id: string, value: Answer | undefined) {
    setAnswers((current) => {
      const updated = { ...current };
      if (value) updated[id] = value;
      else delete updated[id];
      saveDraft(run.id, updated);
      return updated;
    });
  }

  async function attach(files: FileList | null) {
    if (!files) return;
    const added: RunDocument[] = [];
    for (const file of Array.from(files)) {
      if (!DOCUMENT_EXTENSIONS.some((ext) => file.name.endsWith(ext))) {
        setError(`${file.name} is not a Markdown or text file.`);
        continue;
      }
      added.push({ name: file.name, content: await file.text() });
    }
    setDocuments((current) => [
      ...current.filter((item) => !added.some((a) => a.name === item.name)),
      ...added,
    ]);
    if (picker.current) picker.current.value = "";
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: run.projectId,
          requirement: next,
          documents,
          parentRunId: run.id,
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (response.ok && body.id) {
        clearDraft(run.id);
        router.push(`/app/runs/${body.id}`);
        return;
      }
      setError(body.error ?? "The run could not be started.");
    } catch {
      setError("Could not reach the server.");
    }
    setStarting(false);
  }

  const index = STEPS.findIndex((item) => item.id === step);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={children} />
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:sm:max-w-3xl"
        data-testid="refine-sheet"
        initialFocus={false}
      >
        <SheetHeader className="border-b px-6 pt-5 pb-4">
          <SheetTitle>Refine the requirement</SheetTitle>
          <SheetDescription>
            Answer what this run found unsaid, edit the text, and run version{" "}
            {nextNumber}.
          </SheetDescription>
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Steps">
            {STEPS.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={position > index}
                  onClick={() => setStep(item.id)}
                  aria-current={item.id === step ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
                    item.id === step
                      ? "bg-brand/15 text-foreground ring-1 ring-brand/30"
                      : position < index
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground",
                  )}
                  data-testid={`refine-step-${item.id}`}
                >
                  <span className="font-mono">{position + 1}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "answer" ? (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{answered}</span> of{" "}
                {list.length} answered. Skip what you do not want to decide now;
                your answers are kept on this device until you run.
              </p>
              {sections.map(([title, items]) => (
                <Section
                  key={title}
                  title={title}
                  items={items}
                  answers={answers}
                  onAnswer={answer}
                />
              ))}
            </div>
          ) : null}

          {step === "edit" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="refine-text" className="text-sm font-medium">
                    Requirement, version {nextNumber}
                  </label>
                  {edited ? (
                    <button
                      type="button"
                      className="text-xs text-link hover:underline"
                      onClick={() => {
                        setEdited(false);
                        setText(draft);
                      }}
                    >
                      Start Again From Your Answers
                    </button>
                  ) : null}
                </div>
                <Textarea
                  id="refine-text"
                  value={next}
                  onChange={(event) => {
                    setEdited(true);
                    setText(event.target.value);
                  }}
                  className="min-h-[22rem] font-mono text-xs leading-relaxed"
                  data-testid="refine-text"
                />
                <p
                  className={cn(
                    "text-xs",
                    over ? "text-sev-critical" : "text-muted-foreground",
                  )}
                >
                  {next.length.toLocaleString("en")} of{" "}
                  {LIMITS.requirementChars.toLocaleString("en")} characters.
                  Your answers are under &ldquo;## Decisions&rdquo;.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Files</p>
                {documents.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {documents.map((item) => (
                      <li
                        key={item.name}
                        className="flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs"
                      >
                        <FileText className="size-3.5" aria-hidden="true" />
                        {item.name}
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() =>
                            setDocuments((current) =>
                              current.filter(
                                (other) => other.name !== item.name,
                              ),
                            )
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <input
                  ref={picker}
                  type="file"
                  multiple
                  accept={DOCUMENT_EXTENSIONS.join(",")}
                  className="hidden"
                  onChange={(event) => attach(event.target.files)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => picker.current?.click()}
                >
                  <Paperclip />
                  Add Files
                </Button>
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-5">
              {changed ? (
                <RequirementDiff before={run.requirement} after={next} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The text is the same as version {nextNumber - 1}.
                  {filesChanged ? " The files changed." : ""}
                </p>
              )}
              <div className="rounded-tile p-4 ring-1 ring-foreground/10">
                <p className="text-sm font-medium">Run Version {nextNumber}?</p>
                <p
                  className="mt-1 text-sm text-muted-foreground"
                  data-testid="refine-cost"
                >
                  {costText(cost)}
                </p>
                {cost === "billed" && tokens > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    As a guide, version {nextNumber - 1} used about{" "}
                    {Math.round(tokens / 1000).toLocaleString("en")} thousand
                    tokens.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t px-6 py-4">
          {error ? (
            <p className="text-sm text-sev-critical" role="alert">
              {error}
            </p>
          ) : null}
          <div className="ml-auto flex gap-2">
            {index > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(STEPS[index - 1].id)}
              >
                <ArrowLeft />
                Back
              </Button>
            ) : null}
            {step !== "review" ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === "answer" && !edited) setText(draft);
                  setStep(STEPS[index + 1].id);
                }}
                disabled={step === "edit" && (over || !next.trim())}
                data-testid="refine-next"
              >
                Next
                <ArrowRight />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={start}
                disabled={starting || (!changed && !filesChanged) || over}
                data-testid="refine-run"
              >
                {starting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Play />
                )}
                Run Version {nextNumber}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
