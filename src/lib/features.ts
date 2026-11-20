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
  /** Who does the work, in a phrase, for the launcher's card. */
  team: string;
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

/** A spec to try Preflight with: what Storefront is meant to do. */
export const EXAMPLE_SPEC = `# Storefront: what the shop must do

- A shopper can search the catalog by product name.
- A shopper sees only their own orders.
- Only a signed-in shopper can place an order, and only as themselves.
- The price charged is the catalog price, worked out on the server.
- A session ends after 30 minutes without use.
- A card is never charged twice for one order.
- If payment fails, no order is made and the shopper is told.
- Each order sends one confirmation email.
- Card numbers are never written to logs.
- A shopper can get a refund to their card.`;

/** A part to cut to try Engine Out with, on the Storefront sample. */
export const EXAMPLE_OUTAGE = {
  part: "cmp-billing",
  mode: "slow" as const,
  label: "Billing service, slowed down",
};

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
    news: "Now finds attack chains: small issues that add up to a breach.",
    question: "What breaks when real people use this?",
    input: "A requirement in plain words, or a project's code",
    output: "Issues ranked by severity, and work orders to fix them",
    team: "Five agents, each attacking from its own angle",
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
    team: "Five agents, tracing the change through every service",
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
    team: "Three designers who critique each other, and a judge",
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
    team: "An investigator, a fixer and an attacker",
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
      {
        id: "attacker",
        name: "Attacker",
        role: "Tries to get past the fix before anyone ships it.",
      },
    ],
  },
  {
    kind: "engineout",
    name: "Engine Out",
    start: "Start Engine Out",
    promise:
      "Cut one part of your system on purpose, and see what fails with it, hop by hop, before it happens for real.",
    question: "What fails if this part goes down?",
    input: "The part to cut: a service, a database or an outside system",
    output:
      "The failure as it spreads to your customers, each step cited to the code",
    team: "A mapper, an outage tester, an everyday user and a judge",
    example: EXAMPLE_OUTAGE.label,
    fresh: true,
    actors: [
      {
        id: "mapper",
        name: "Mapper",
        role: "Draws the parts and their calls.",
      },
      {
        id: "outage",
        name: "Outage tester",
        role: "Follows every call into the part that was cut.",
      },
      {
        id: "journeys",
        name: "Everyday user",
        role: "Walks each journey that touches it.",
      },
      {
        id: "judge",
        name: "Judge",
        role: "Orders the failure and checks every line.",
      },
    ],
  },
  {
    kind: "preflight",
    name: "Preflight",
    start: "Start Preflight",
    promise:
      "Check a written spec against the code, line by line: what is built, what is missing, and what the code does instead.",
    question: "Does the code do what the spec says?",
    input: "A spec or requirement, and the project's code",
    output: "Each line of the spec marked, with the code that proves it",
    team: "Five agents, each checking the lines that fit its lens",
    example: EXAMPLE_SPEC,
    fresh: true,
    actors: FIVE_AGENTS,
  },
  {
    kind: "dogfight",
    name: "Dogfight",
    start: "Start Dogfight",
    promise:
      "An attacker tries to get past a security fix, round after round, until the fix holds.",
    question: "Will this fix hold against an attacker?",
    input: "A security issue from a run of the project's code",
    output: "A hardened fix, round by round, ready as a pull request",
    team: "A defender and an attacker, round after round",
    example: "The search box can run SQL",
    fresh: true,
    actors: [
      {
        id: "defender",
        name: "Defender",
        role: "Writes the fix, then answers each attack.",
      },
      {
        id: "attacker",
        name: "Attacker",
        role: "Reads the fixed code and looks for a way past it.",
      },
    ],
  },
];

/**
 * The launcher groups the kinds by the job you came to do, so you start
 * from your situation, not from a name. Every kind is in exactly one group.
 */
export const JOBS: {
  id: string;
  title: string;
  /** One line: when you would be here. */
  lead: string;
  kinds: RunKind[];
}[] = [
  {
    id: "find",
    title: "Find what is wrong",
    lead: "Test what you have, before your users do.",
    kinds: ["audit", "preflight", "engineout"],
  },
  {
    id: "plan",
    title: "Plan a change",
    lead: "Decide how to build it, and what it will touch.",
    kinds: ["flyoff", "crosswind"],
  },
  {
    id: "fix",
    title: "Fix a problem",
    lead: "Something broke, or a fix needs proving.",
    kinds: ["blackbox", "dogfight"],
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
  return title.replace(
    /^(crosswind|fly-off|black box|engine out|dogfight|preflight):\s*/i,
    "",
  );
}
