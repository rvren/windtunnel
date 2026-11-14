"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  GitMerge,
  GitPullRequest,
  Lightbulb,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import { HeroVisual } from "@/components/brand/hero-visual";
import { Logo } from "@/components/brand/logo";
import { EASE } from "@/components/motion";
import { AgentIcon } from "@/components/run/badges";
import { buttonVariants } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents";
import { cn } from "@/lib/utils";

/*
 * The home page as a deck: one slide per screen, moved by a click (the
 * left third goes back, the rest goes on), the arrow keys, the space bar
 * or the dots. The slide number lives in the address (#3), so a slide can
 * be linked. Every slide carries "Launch App".
 */

const launch = cn(
  buttonVariants({ size: "lg" }),
  "h-11 px-5 shadow-[0_0_44px_-6px] shadow-brand/70",
);

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs tracking-widest text-link uppercase">
      {children}
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 text-4xl leading-[1.05] font-normal tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
      {children}
    </h2>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
      {children}
    </p>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Wrench;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-card bg-card/70 p-5 ring-1 ring-foreground/10">
      <Icon className="size-5 text-link" aria-hidden="true" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function Step({
  icon: Icon,
  label,
  last = false,
}: {
  icon: typeof Wrench;
  label: string;
  last?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex items-center gap-2.5 rounded-full bg-card/80 px-4 py-2.5 text-sm ring-1 ring-foreground/10">
        <Icon className="size-4 text-link" aria-hidden="true" />
        {label}
      </span>
      {last ? null : (
        <ArrowRight
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </li>
  );
}

interface Slide {
  id: string;
  body: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    id: "title",
    body: (
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>Windtunnel</Eyebrow>
          <h1 className="mt-5 text-5xl leading-[1.02] font-normal tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
            Test your software like a wind tunnel tests a wing.
          </h1>
          <Lead>
            Before it flies. Five AI agents try to break your product across
            every service, so your users never do.
          </Lead>
        </div>
        <HeroVisual className="hidden lg:block" />
      </div>
    ),
  },
  {
    id: "problem",
    body: (
      <div>
        <Eyebrow>The problem</Eyebrow>
        <Title>
          Anyone can push now.
          <br />
          <span className="text-muted-foreground">
            And one change can break a flow three services away.
          </span>
        </Title>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Tile
            icon={GitPullRequest}
            title="More people, more agents"
            body="Engineers and AI coding agents ship more changes, faster, than anyone can review."
          />
          <Tile
            icon={Boxes}
            title="Spread across services"
            body="An enterprise web app is dozens of repositories. A flaw lives in how they talk to each other."
          />
          <Tile
            icon={ScanSearch}
            title="Reviews see a diff"
            body="A pull request shows lines changed in one repository, not what the whole system now lets happen."
          />
        </div>
      </div>
    ),
  },
  {
    id: "what",
    body: (
      <div>
        <Eyebrow>What Windtunnel does</Eyebrow>
        <Title>
          Point it at the whole application.
          <br />
          <span className="text-muted-foreground">
            Or at an idea before it is built.
          </span>
        </Title>
        <Lead>
          A project is every repository of one application, read together.
          Windtunnel models how it is put together, then tests it the way real
          people, attackers, outages and traffic would.
        </Lead>
        <ol className="mt-10 flex flex-wrap items-center gap-3">
          <Step icon={Boxes} label="All your repositories, or a requirement" />
          <Step icon={ScanSearch} label="Five agents test it at once" />
          <Step icon={BadgeCheck} label="A judge keeps what the code proves" />
          <Step icon={GitMerge} label="Fixes become pull requests" last />
        </ol>
      </div>
    ),
  },
  {
    id: "agents",
    body: (
      <div>
        <Eyebrow>Five agents, competing</Eyebrow>
        <Title>Each one tries to break it a different way.</Title>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {AGENTS.map((agent) => (
            <li
              key={agent.id}
              className="rounded-card bg-card/70 p-5 ring-1 ring-foreground/10"
            >
              <AgentIcon agentId={agent.id} />
              <p className="mt-3 font-medium">{agent.name}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {agent.body}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          They score points for real flaws, more when no one else found them,
          and they dispute each other&apos;s findings.
        </p>
      </div>
    ),
  },
  {
    id: "judge",
    body: (
      <div>
        <Eyebrow>Evidence, not opinions</Eyebrow>
        <Title>
          Every finding must point at the code.
          <br />
          <span className="text-muted-foreground">Or it is thrown out.</span>
        </Title>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Tile
            icon={ScanSearch}
            title="Cited lines are checked"
            body="A finding names a file and the lines that prove it. If they do not exist or do not show it, it is dropped."
          />
          <Tile
            icon={RefreshCw}
            title="Agents challenge each other"
            body="Before the judge rules, every agent reviews the others' findings and argues for or against them."
          />
          <Tile
            icon={BadgeCheck}
            title="A judge merges and ranks"
            body="Duplicates become one issue, each with its severity. A real flaw stands even when someone calls it deliberate."
          />
        </div>
      </div>
    ),
  },
  {
    id: "cockpit",
    body: (
      <div>
        <Eyebrow>The cockpit</Eyebrow>
        <Title>One view of the risk across every service.</Title>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Tile
            icon={Boxes}
            title="Issue flow"
            body="Each issue runs from the service it lives in, through its kind, to how bad it is."
          />
          <Tile
            icon={ScanSearch}
            title="Architecture"
            body="The parts of the application and what calls what, read from the code, with the issues on each part."
          />
          <Tile
            icon={ShieldAlert}
            title="Security"
            body="Issues by OWASP category, with a CWE for each, and which ones already have a checked patch."
          />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Plus personal data and secrets found in the code. A secret&apos;s
          value is never stored or shown.
        </p>
      </div>
    ),
  },
  {
    id: "loop",
    body: (
      <div>
        <Eyebrow>It closes the loop</Eyebrow>
        <Title>
          From finding to fixed,
          <br />
          <span className="text-muted-foreground">and proven fixed.</span>
        </Title>
        <ol className="mt-10 flex flex-wrap items-center gap-3">
          <Step icon={Wrench} label="A fix is written and checked" />
          <Step icon={GitPullRequest} label="You open a pull request" />
          <Step icon={GitMerge} label="Your team merges it" />
          <Step icon={RefreshCw} label="A rescan confirms it is gone" last />
        </ol>
        <Lead>
          Every patch is checked line by line against the code before anything
          is sent. Windtunnel never merges, and nothing from your repositories
          is ever run.
        </Lead>
      </div>
    ),
  },
  {
    id: "idea",
    body: (
      <div>
        <Eyebrow>Before any code exists</Eyebrow>
        <Title>
          Test the idea first.
          <br />
          <span className="text-muted-foreground">
            Then refine it, version by version.
          </span>
        </Title>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Tile
            icon={Lightbulb}
            title="Probable risks"
            body="A requirement is still an idea, so what the agents raise are risks to decide on, not defects."
          />
          <Tile
            icon={ScanSearch}
            title="Questions from the gaps"
            body="Who may do what, what happens on failure, what the limits are: everything the requirement leaves unsaid."
          />
          <Tile
            icon={RefreshCw}
            title="Run the next version"
            body="Your answers become decisions in the text. Each version shows what got better since the last."
          />
        </div>
      </div>
    ),
  },
  {
    id: "proof",
    body: (
      <div>
        <Eyebrow>Tried on real code</Eyebrow>
        <Title>On DVNA, a deliberately vulnerable app, one run found:</Title>
        <ul className="mt-10 grid gap-3 text-sm sm:grid-cols-2">
          {[
            "SQL injection in user search",
            "Command injection in the ping tool",
            "Code execution through an unsafe deserializer and XML entities",
            "Account takeover by editing another user's profile",
            "A password reset token anyone can predict",
            "An admin API any signed-in user can call, leaking password hashes",
          ].map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-tile bg-card/70 px-4 py-3 ring-1 ring-foreground/10"
            >
              <ShieldAlert
                className="mt-0.5 size-4 shrink-0 text-sev-critical"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Plus the reliability and product gaps around them. Every finding cites
          the lines that show it. An eval with answer keys for DVNA and a
          seven-service sample keeps the agents honest as they change.
        </p>
      </div>
    ),
  },
  {
    id: "close",
    body: (
      <div className="text-center">
        <Eyebrow>Windtunnel</Eyebrow>
        <h2 className="mx-auto mt-5 max-w-4xl text-5xl leading-[1.02] font-normal tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
          Break it before your users do.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Built for enterprise applications spread across microservices, where
          every change can reach further than its diff.
        </p>
        <div className="mt-10 flex justify-center">
          <Link href="/app" className={launch} data-testid="deck-launch-final">
            Launch App
            <ArrowRight />
          </Link>
        </div>
      </div>
    ),
  },
];

/** The slide in the address (#1 is the first), or the first one. */
function slideFromHash(): number {
  if (typeof window === "undefined") return 0;
  const number = Number(window.location.hash.slice(1));
  return Number.isInteger(number) && number >= 1 && number <= SLIDES.length
    ? number - 1
    : 0;
}

export function SlideDeck() {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ index: 0, direction: 1 });
  const { index, direction } = state;

  const go = useCallback((next: number) => {
    setState((current) => {
      const target = Math.max(0, Math.min(SLIDES.length - 1, next));
      if (target === current.index) return current;
      return { index: target, direction: target > current.index ? 1 : -1 };
    });
  }, []);

  // Open on the slide the address names, and follow back and forward.
  useEffect(() => {
    const read = () => go(slideFromHash());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [go]);

  // Keep the address on the slide shown, without adding history entries.
  useEffect(() => {
    const hash = `#${index + 1}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") {
        go(0);
      } else if (event.key === "End") {
        go(SLIDES.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  // A click on the slide: the left third goes back, the rest goes on.
  // Links and buttons keep their own click.
  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    go(event.clientX - box.left < box.width / 3 ? index - 1 : index + 1);
  };

  const slide = SLIDES[index];
  const offset = reduced ? 0 : 32 * direction;

  return (
    <div
      className="relative flex h-[100svh] flex-col overflow-hidden bg-canvas"
      data-testid="slide-deck"
    >
      {/* Top bar: the mark, where you are, and the way into the app. */}
      <header className="relative z-10 flex items-center gap-4 px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => go(0)}
          aria-label="Windtunnel, first slide"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </button>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(SLIDES.length).padStart(2, "0")}
        </span>
        <Link
          href="/app"
          className={cn(buttonVariants({ size: "sm" }), "h-9 px-4")}
          data-testid="deck-launch"
        >
          Launch App
          <ArrowRight />
        </Link>
      </header>

      {/* The slide. Clicking it moves on (or back, on the left third). */}
      <div
        className="relative flex min-h-0 flex-1 cursor-pointer items-center select-none"
        onClick={onStageClick}
        data-testid="deck-stage"
      >
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.section
            key={slide.id}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${SLIDES.length}`}
            initial={{ opacity: 0, x: offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -offset }}
            transition={{ duration: reduced ? 0.1 : 0.28, ease: EASE }}
            className="mx-auto max-h-full w-full max-w-6xl cursor-auto overflow-y-auto px-5 py-6 select-text sm:px-8"
            data-testid="deck-slide"
            data-slide={slide.id}
          >
            {slide.body}
            {index > 0 && index < SLIDES.length - 1 ? (
              <div className="mt-10">
                <Link href="/app" className={launch}>
                  Launch App
                  <ArrowRight />
                </Link>
              </div>
            ) : index === 0 ? (
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/app" className={launch}>
                  Launch App
                  <ArrowRight />
                </Link>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-11 px-5",
                  )}
                >
                  See How It Works
                </button>
              </div>
            ) : null}
          </motion.section>
        </AnimatePresence>
      </div>

      {/* Bottom bar: back, the dots, next. */}
      <footer className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          data-testid="deck-prev"
        >
          <ArrowLeft />
          Back
        </button>
        <nav aria-label="Slides" className="flex items-center gap-1.5">
          {SLIDES.map((item, position) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(position)}
              aria-label={`Slide ${position + 1}`}
              aria-current={position === index ? "step" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                position === index
                  ? "w-6 bg-brand"
                  : "w-1.5 bg-foreground/20 hover:bg-foreground/40",
              )}
              data-testid="deck-dot"
            />
          ))}
        </nav>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === SLIDES.length - 1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          data-testid="deck-next"
        >
          Next
          <ArrowRight />
        </button>
      </footer>
    </div>
  );
}
