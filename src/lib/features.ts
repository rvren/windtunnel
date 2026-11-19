import { AGENTS } from "@/lib/agents";
import { EXAMPLE_REQUIREMENT } from "@/lib/limits";
import type { RunKind } from "@/server/engine/schema";

/*
 * The four things Windtunnel does, in one place. The launcher, the start
 * page, the run page and the walkthrough script all read these words, so
 * a feature is described the same way everywhere. Plain data.
 */

export interface Actor {
  id: string;
  name: string;
  /** One line: what this actor does in the run. */
  role: string;
}

export interface Feature {
  kind: RunKind;
  name: string;
  /** Its call to action, in title case. */
  start: string;
  /** One line: what it does for you. */
  promise: string;
  /** The question it answers, in the reader's words. */
  question: string;
  /** What you give it. */
  input: string;
  /** What you get back. */
  output: string;
  /** A ready input to try it with. */
  example: string;
  /** Who works during the run, as shown while it is live. */
  actors: Actor[];
  /** Marked New on the launcher. */
  fresh?: boolean;
  /** One line on the launcher about what it does now that it did not. */
  news?: string;
}

/** A change to try Crosswind with, on the Storefront sample. */
export const EXAMPLE_CHANGE =
  "Move sessions from cookies to a shared Redis, and let the gateway check them.";

/** Production feedback to try Black box with, on the Storefront sample. */
export const EXAMPLE_INCIDENT =
  '500 Internal Server Error on GET /catalog/search?q=men\'s shoes. Logs: sqlite3.OperationalError: near "s": syntax error, in search().';

const FIVE_AGENTS: Actor[] = AGENTS.map(({ id, name, body }) => ({
  id,
  name,
  role: body,
}));

export const FEATURES: Feature[] = [
  {
    kind: "audit",
    name: "Tunnel Run",
    start: "Start Tunnel Run",
    promise: "Five agents attack your idea or your code and report what fails.",
    question: "What breaks when real people use this?",
    input: "A requirement in plain words, or a project's code",
    output: "Issues ranked by severity, and work orders to fix them",
    example: EXAMPLE_REQUIREMENT,
    actors: FIVE_AGENTS,
  },
  {
    kind: "crosswind",
    name: "Crosswind",
    start: "Start Crosswind",
    promise:
      "Trace one change through every service before you make it: what it breaks and what it fixes.",
    question: "What happens if we change this?",
    input: "A pull request, two branches, or a change in plain words",
    output:
      "The parts it touches, what breaks, and the architecture before and after",
    example: EXAMPLE_CHANGE,
    actors: FIVE_AGENTS,
  },
  {
    kind: "flyoff",
    name: "Fly-off",
    start: "Start Fly-Off",
    promise:
      "Three designers compete on one feature, critique each other, and a judge picks the strongest.",
    question: "What is the best way to build this?",
    input: "The feature to design, in plain words",
    output: "The winning blueprint, the reasons, and work orders",
    example: EXAMPLE_REQUIREMENT,
    actors: [
      {
        id: "p1",
        name: "Pragmatist",
        role: "Ships the simplest design that works.",
      },
      { id: "p2", name: "Scaler", role: "Designs for the largest customer." },
      {
        id: "p3",
        name: "Guardian",
        role: "Designs for safety and access control.",
      },
      { id: "judge", name: "Judge", role: "Weighs the designs and picks one." },
    ],
  },
  {
    kind: "blackbox",
    name: "Black Box",
    start: "Start Black Box",
    promise:
      "Paste an error from production. An agent finds the cause in the code and writes a fix.",
    question: "Why did this fail, and how do we fix it?",
    input: "An error message or an incident note",
    output: "The cause, cited to lines in the code, and a checked fix",
    example: EXAMPLE_INCIDENT,
    actors: [
      {
        id: "triage",
        name: "Investigator",
        role: "Traces the error to its cause in the code.",
      },
      {
        id: "fixer",
        name: "Fixer",
        role: "Writes the fix and checks it against the code.",
      },
    ],
  },
];

export function featureOf(kind: RunKind): Feature {
  return FEATURES.find((feature) => feature.kind === kind) ?? FEATURES[0];
}

/**
 * A run's title without the kind its engine put in front ("Crosswind: …"),
 * for lists that already show the kind.
 */
export function plainTitle(title: string): string {
  return title.replace(/^(crosswind|fly-off|black box):\s*/i, "");
}
