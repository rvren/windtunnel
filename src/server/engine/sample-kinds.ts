import type {
  Blueprint,
  Critique,
  FlyoffVerdict,
  ImpactAnswer,
  TriageAnswer,
} from "./schema";

/*
 * Scripted answers for the newer kinds of run, so each can be shown on a
 * sample project without calling the model. Written for the Storefront
 * sample (samples/storefront) and its example requirement.
 */

export const SAMPLE_IMPACT: ImpactAnswer = {
  summary:
    "The change reaches past the service it edits: the gateway forwards to it without a user check, and orders depends on what it returns. The findings below are what the agents traced through the other services.",
  review:
    "**Request changes.** The change works on its own, but it widens what callers can reach through the gateway.\n\n- Check the findings listed in this run before merging.\n- Add a test for the paths the agents traced across services.",
  fixes: [],
};

const blueprint = (
  name: string,
  summary: string,
  extra: Partial<Blueprint>,
): Blueprint => ({
  name,
  summary,
  components: [
    { name: "Web app", kind: "frontend", description: "The admin dashboard." },
    { name: "API", kind: "service", description: "Every read and write." },
    {
      name: "Database",
      kind: "database",
      description: "Tenants, users, roles.",
    },
  ],
  connections: [
    { from: "Web app", to: "API", label: "HTTPS" },
    { from: "API", to: "Database", label: "SQL" },
  ],
  decisions: [],
  risks: [],
  ...extra,
});

export const SAMPLE_BLUEPRINTS: Record<string, Blueprint> = {
  Pragmatist: blueprint(
    "One service, row-level tenancy",
    "A single API with a tenant id on every row and one check in a shared data layer. It ships in weeks and one small team can run it.",
    {
      decisions: [
        {
          decision: "Tenant id on every row, checked in one data layer",
          why: "One place to get isolation right",
          tradeoff: "A missed query leaks across tenants",
        },
        {
          decision: "Invitations as signed, single-use links",
          why: "No extra service",
          tradeoff: "Revoking needs a lookup table",
        },
      ],
      risks: [
        "One noisy tenant slows every other",
        "Isolation rests on one layer",
      ],
    },
  ),
  Scaler: blueprint(
    "Services per domain, a queue for invites",
    "Separate identity and permissions services behind the API, with invitations sent through a queue so email outages never block sign-up.",
    {
      components: [
        {
          name: "Web app",
          kind: "frontend",
          description: "The admin dashboard.",
        },
        {
          name: "API gateway",
          kind: "service",
          description: "Routing and limits.",
        },
        {
          name: "Identity",
          kind: "service",
          description: "Users and invitations.",
        },
        {
          name: "Permissions",
          kind: "service",
          description: "Roles and checks.",
        },
        {
          name: "Invite queue",
          kind: "queue",
          description: "Emails, retried.",
        },
        {
          name: "Database",
          kind: "database",
          description: "One schema per service.",
        },
      ],
      connections: [
        { from: "Web app", to: "API gateway", label: "HTTPS" },
        { from: "API gateway", to: "Identity", label: "calls" },
        { from: "API gateway", to: "Permissions", label: "calls" },
        { from: "Identity", to: "Invite queue", label: "publishes" },
      ],
      decisions: [
        {
          decision: "A queue between invitations and email",
          why: "Email outages never block an admin",
          tradeoff: "Invites arrive with a delay",
        },
      ],
      risks: ["More moving parts to run", "Checks across services add latency"],
    },
  ),
  Guardian: blueprint(
    "Isolation by schema, deny by default",
    "A schema per tenant and a policy engine that denies anything not granted, with an audit log of every permission change.",
    {
      decisions: [
        {
          decision: "A database schema per tenant",
          why: "A missed filter cannot cross tenants",
          tradeoff: "Migrations run once per tenant",
        },
        {
          decision: "Deny by default in a policy engine",
          why: "New operations are closed until granted",
          tradeoff: "Every new feature needs a policy",
        },
      ],
      risks: ["Slower to build", "Many schemas to migrate"],
    },
  ),
};

export const SAMPLE_CRITIQUE: Critique = {
  critiques: [
    {
      blueprintId: "p1",
      strengths: ["Fast to build and simple to run"],
      weaknesses: [
        { point: "Isolation rests on one data layer", severity: "high" },
      ],
    },
    {
      blueprintId: "p2",
      strengths: ["Email outages never block invitations"],
      weaknesses: [
        { point: "Five services for a first version", severity: "medium" },
      ],
    },
    {
      blueprintId: "p3",
      strengths: ["Tenants cannot leak into each other"],
      weaknesses: [
        {
          point: "Per-tenant migrations slow every release",
          severity: "medium",
        },
      ],
    },
  ],
};

export const SAMPLE_FLYOFF_VERDICT: FlyoffVerdict = {
  winnerId: "p1",
  summary:
    "The Pragmatist's design meets the requirement soonest, and its main weakness (isolation in one layer) is cheap to guard with tests. It should borrow the Scaler's queue for invitation emails and the Guardian's audit log of permission changes.",
  ranking: [
    {
      blueprintId: "p1",
      rank: 1,
      reason: "Meets every need with the least to run",
    },
    {
      blueprintId: "p3",
      rank: 2,
      reason: "Safest, but slow to build and migrate",
    },
    {
      blueprintId: "p2",
      rank: 3,
      reason: "Built for a scale the requirement does not ask for",
    },
  ],
  nextSteps: [
    "Add a tenant id to every table and one checked data layer",
    "Write tests that try every query across two tenants",
    "Send invitation emails through a queue",
    "Log every permission change",
  ],
};

/** For the Storefront sample: a search that fails on a quote. */
export function sampleTriage(path: string): TriageAnswer {
  return {
    title: "Product search fails on a search term with a quote in it",
    hypothesis:
      "The search builds its SQL by joining the user's text into the query. A term with a single quote ends the string early, so the database rejects the query and the page shows a server error. The same join lets a crafted term run any SQL.",
    type: "security_vulnerability",
    severity: "critical",
    confidence: "high",
    affects: "Product search, for every shopper",
    suspects: [
      {
        path,
        startLine: 4,
        endLine: 6,
        why: "The query is built by joining the search text into the SQL.",
      },
    ],
    checks: [
      "Search for a term with a single quote and watch the logs",
      "Bind the search text as a parameter and search again",
    ],
  };
}

/** The example incident text for the Storefront sample. */
export const SAMPLE_INCIDENT =
  '500 Internal Server Error on GET /catalog/search?q=men\'s shoes. Logs: sqlite3.OperationalError: near "s": syntax error, in search().';
