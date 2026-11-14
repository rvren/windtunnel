import Link from "next/link";
import { ArrowRight, FileText, ListChecks, Plug } from "lucide-react";

import { FlowBand } from "@/components/brand/flow-band";
import { HeroVisual } from "@/components/brand/hero-visual";
import { FadeIn, Reveal } from "@/components/motion";
import { Panel } from "@/components/panel";
import { AgentIcon } from "@/components/run/badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents";
import { EXAMPLE_REQUIREMENT } from "@/lib/limits";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "A requirement goes in",
    body: "Plain words, or Markdown files such as a PRD or a design doc.",
  },
  {
    title: "Five agents test it",
    body: "Each has a different goal. They compete to find flaws in the design.",
  },
  {
    title: "A report comes out",
    body: "Findings you can act on, and work orders with acceptance criteria.",
  },
];

const outputs = [
  "Missing requirements",
  "Architecture weaknesses",
  "Security vulnerabilities",
  "Unhandled user journeys",
  "New work orders with acceptance criteria",
];

const timeline = [
  {
    label: "Requirements and design",
    body: "Still words and diagrams. Cheap to change.",
  },
  {
    label: "Windtunnel",
    body: "The agents find the flaws on paper.",
    active: true,
  },
  { label: "Build", body: "You write the code, with the flaws already known." },
  {
    label: "Windtunnel again",
    body: "The real code is checked against the same findings.",
    active: true,
  },
];

const standalone = [
  {
    icon: FileText,
    title: "Plain input.",
    body: "A requirement typed in, or Markdown files. No other tool or account is needed.",
  },
  {
    icon: ListChecks,
    title: "Plain output.",
    body: "The report on screen, as Markdown and as JSON.",
  },
  {
    icon: Plug,
    title: "Optional connectors.",
    body: "8090 Software Factory is the first one planned: read requirements and blueprints, write work orders back.",
    badge: "Planned",
  },
];

const roadmap = [
  {
    name: "Tunnel run",
    body: "The core simulation: one requirement, five agents, one report.",
    stage: "In the app",
  },
  {
    name: "Crosswind",
    body: "Ask what happens if you change a part of the architecture, and see the impact before and after.",
    stage: "Later",
  },
  {
    name: "Fly-off",
    body: "Several agents propose rival designs and challenge each other. A judge picks the strongest, with evidence.",
    stage: "Later",
  },
  {
    name: "Black box",
    body: "Production feedback finds the affected requirement, then the fix, the tests and the pull request.",
    stage: "Later",
  },
];

const number = (index: number) => String(index + 1).padStart(2, "0");

/* Left: label, two-line heading, text, optional numbered list. Right: a panel. */
function Feature({
  id,
  eyebrow,
  title,
  body,
  items,
  children,
}: {
  id: string;
  eyebrow: string;
  title: [string, string];
  body: string;
  items?: string[];
  children: React.ReactNode;
}) {
  return (
    <Reveal
      id={id}
      className="mx-auto grid w-full max-w-6xl scroll-mt-24 items-start gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-28"
    >
      <div>
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-5 text-3xl leading-[1.1] font-normal tracking-[-0.03em] sm:text-[2.5rem]">
          {title[0]}
          <br />
          <span className="text-muted-foreground">{title[1]}</span>
        </h2>
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
        {items ? (
          <ol className="mt-8 divide-y border-y text-sm">
            {items.map((item, index) => (
              <li key={item} className="flex items-baseline gap-4 py-3">
                <span className="font-mono text-xs text-link">
                  {number(index)}
                </span>
                {item}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <div>{children}</div>
    </Reveal>
  );
}

function Divider() {
  return <div aria-hidden="true" className="h-10 border-y bg-hatch" />;
}

export default function Home() {
  return (
    <>
      <FadeIn className="relative overflow-hidden">
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pt-12 pb-28 sm:px-6 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-0">
          <div>
            <Badge variant="outline">Early build</Badge>
            <h1 className="mt-6 text-5xl leading-[1.02] font-normal tracking-[-0.04em] sm:text-6xl lg:text-[4.5rem]">
              Break it before
              <br />
              you build it.
            </h1>
            <p className="mt-6 max-w-md leading-relaxed text-pretty text-muted-foreground">
              Windtunnel simulates an application before any of it exists. Five
              agents with competing goals use it, attack it, overload it and
              question it, so you get the flaws while they are still cheap to
              fix.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                data-testid="hero-launch-app"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 px-5 shadow-[0_0_44px_-6px] shadow-brand/70",
                )}
              >
                Launch app
                <ArrowRight />
              </Link>
              <a
                href="#how"
                data-testid="hero-how-link"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 px-5",
                )}
              >
                See how it works
              </a>
            </div>
            <p className="mt-8 flex max-w-md items-baseline gap-3 rounded-card border bg-card/50 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
              <span className="shrink-0 text-link">example</span>
              {EXAMPLE_REQUIREMENT}
            </p>
          </div>
          <HeroVisual />
        </div>
      </FadeIn>

      <Reveal
        id="how"
        className="relative mx-auto -mt-16 w-full max-w-6xl scroll-mt-24 px-4 sm:px-6"
      >
        <ol className="grid gap-px overflow-hidden rounded-card border bg-border sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-card p-6">
              <span className="font-mono text-xs text-link">
                {number(index)}
              </span>
              <h2 className="mt-3 font-medium">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal
        id="agents"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32"
      >
        <h2 className="text-center text-3xl leading-[1.1] font-normal tracking-[-0.03em] sm:text-[2.5rem]">
          One design.
          <br />
          <span className="text-muted-foreground">Five ways to break it.</span>
        </h2>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {AGENTS.map((agent) => (
            <li
              key={agent.name}
              className="last:sm:col-span-2 last:lg:col-span-1"
            >
              <Panel className="h-full p-5">
                <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <AgentIcon agentId={agent.id} className="size-5" />
                </span>
                <h3 className="mt-5 font-medium">{agent.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {agent.body}
                </p>
              </Panel>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-center text-sm text-muted-foreground">
          The agents compete to find flaws in the proposed design.
        </p>
      </Reveal>

      <Divider />

      <Feature
        id="input"
        eyebrow="01 · The input"
        title={["Start with a sentence.", "Or a whole spec."]}
        body="Type a requirement, or add Markdown files such as a PRD or a design doc. Windtunnel turns it into a simulation the agents can run."
      >
        <Panel className="overflow-hidden shadow-[0_0_120px_-40px] shadow-brand/60">
          <div className="flex items-center gap-2 border-b px-5 py-3 font-mono text-xs text-muted-foreground">
            <FileText className="size-3.5" aria-hidden="true" />
            requirement.md
            <Badge variant="secondary" className="ml-auto">
              Example
            </Badge>
          </div>
          <blockquote className="px-5 py-8 text-xl leading-snug tracking-[-0.01em] text-pretty sm:px-8 sm:py-12 sm:text-2xl">
            {EXAMPLE_REQUIREMENT}
          </blockquote>
        </Panel>
      </Feature>

      <Feature
        id="report"
        eyebrow="02 · The report"
        title={["The flaws, on paper.", "Before they are in code."]}
        body="Every run ends in a report. It lists what the design is missing and what to do about it."
        items={outputs}
      >
        <Panel className="p-6 sm:p-8">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Before the build, and after
          </p>
          <ol className="mt-6">
            {timeline.map((stage, index) => (
              <li key={stage.label} className="flex gap-4">
                <span className="flex flex-col items-center">
                  <span
                    className={cn(
                      "mt-1.5 size-2.5 rounded-full border",
                      stage.active
                        ? "border-brand bg-brand shadow-[0_0_14px] shadow-brand"
                        : "border-muted-foreground",
                    )}
                  />
                  {index < timeline.length - 1 ? (
                    <span className="w-px flex-1 bg-border" />
                  ) : null}
                </span>
                <span className="pb-7">
                  <span className="block font-medium">{stage.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {stage.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </Feature>

      <Divider />

      <Feature
        id="standalone"
        eyebrow="03 · Standalone"
        title={["Works on its own.", "Connects when you want."]}
        body="Windtunnel is a complete product by itself. Connectors to other tools are add-ons, and the core never depends on one."
      >
        <ul className="grid gap-4">
          {standalone.map((item) => (
            <li key={item.title}>
              <Panel className="flex gap-4 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    {item.title}
                    {item.badge ? (
                      <Badge variant="secondary">{item.badge}</Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </span>
                </span>
              </Panel>
            </li>
          ))}
        </ul>
      </Feature>

      <Reveal
        id="roadmap"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-8 pb-24 sm:px-6 lg:pb-32"
      >
        <h2 className="text-center text-3xl leading-[1.1] font-normal tracking-[-0.03em] sm:text-[2.5rem]">
          Before it is yours.
          <br />
          <span className="text-muted-foreground">What comes next.</span>
        </h2>
        <ol className="mt-14 grid gap-4 sm:grid-cols-2">
          {roadmap.map((item, index) => (
            <li key={item.name}>
              <Panel className="flex h-full gap-4 p-5">
                <span className="font-mono text-xs leading-6 text-link">
                  {number(index)}
                </span>
                <span className="flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{item.name}</span>
                    <Badge
                      variant={item.stage === "Later" ? "secondary" : "default"}
                    >
                      {item.stage}
                    </Badge>
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </span>
                </span>
              </Panel>
            </li>
          ))}
        </ol>
      </Reveal>

      <footer className="relative overflow-hidden border-t">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-dots opacity-60 [mask-image:radial-gradient(60%_90%_at_50%_0%,black,transparent)]"
        />
        <FlowBand className="relative pt-10" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pt-6 pb-12 sm:px-6">
          <p className="max-w-xl text-3xl leading-[1.1] font-normal tracking-[-0.03em] sm:text-[2.5rem]">
            Find the flaw while it is still a sentence.
          </p>
          <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
            Windtunnel is an early build. Its first engine, Tunnel run, is in
            the app.
          </p>
        </div>
      </footer>
    </>
  );
}
