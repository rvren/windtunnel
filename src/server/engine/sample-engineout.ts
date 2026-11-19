import type { CascadeAnswer, HopBehaviour, OutageMode } from "./schema";

/*
 * Engine Out on the Storefront sample: what fails when a part is cut, as
 * the scripted agents file it. Every hop cites real lines in
 * samples/storefront, checked by the run like any other. A scenario is a
 * part (a component id of the project's map) and a mode.
 */

type Service =
  | "web"
  | "gateway"
  | "auth"
  | "catalog"
  | "orders"
  | "billing"
  | "notifications";

interface ScriptedHop {
  actor: "outage" | "journeys";
  /** Where the cited code is, and where the failure comes from: map ids. */
  at: string;
  from: string;
  behaviour: HopBehaviour;
  effect: string;
  service: Service;
  path: string;
  startLine: number;
  endLine: number;
}

interface Scenario {
  hops: ScriptedHop[];
  cascade: CascadeAnswer;
}

const NOT_AFFECTED = (name: string, why: string) => ({
  name,
  effect: `Goes on as before: ${why}`,
  broken: false,
});

/** The scenarios, keyed "part:mode". */
const SCENARIOS: Record<string, Scenario> = {
  "cmp-billing:slow": {
    hops: [
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-billing",
        behaviour: "retries",
        effect:
          "Waits two seconds for billing, then sends the same charge again, up to three times, with no key that stops a repeat.",
        service: "orders",
        path: "billing_client.py",
        startLine: 7,
        endLine: 15,
      },
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-orders",
        behaviour: "errors",
        effect:
          "Gives up after the third wait and fails before the order is saved, so the card may be charged with no order.",
        service: "orders",
        path: "orders.py",
        startLine: 8,
        endLine: 9,
      },
      {
        actor: "outage",
        at: "cmp-gateway",
        from: "cmp-orders",
        behaviour: "wrong_data",
        effect:
          "Waits on orders with no time limit, then copies the error back without its status, so it leaves as 200 OK.",
        service: "gateway",
        path: "proxy.go",
        startLine: 12,
        endLine: 18,
      },
      {
        actor: "journeys",
        at: "cmp-web",
        from: "cmp-gateway",
        behaviour: "silent",
        effect:
          "Checkout reads every answer as success, so the shopper is thanked for an order that does not exist.",
        service: "web",
        path: "src/checkout.ts",
        startLine: 3,
        endLine: 8,
      },
    ],
    cascade: {
      headline:
        "Charged up to three times, no order saved, and the shop says thank you.",
      hops: [
        { id: "outage-1", depth: 1, severity: "critical" },
        { id: "outage-2", depth: 1, severity: "high" },
        { id: "outage-3", depth: 2, severity: "high" },
        { id: "journeys-1", depth: 3, severity: "high" },
      ],
      journeys: [
        {
          name: "Checkout",
          effect:
            "The shopper may be charged up to three times, gets no order, and is told it went through.",
          broken: true,
        },
        NOT_AFFECTED(
          "Search the catalog",
          "the catalog does not call billing.",
        ),
        NOT_AFFECTED("Sign in", "auth does not call billing."),
      ],
    },
  },
  "cmp-billing:down": {
    hops: [
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-billing",
        behaviour: "errors",
        effect:
          "A refused connection is not a timeout, so it is not caught: the first try fails the order at once.",
        service: "orders",
        path: "billing_client.py",
        startLine: 8,
        endLine: 15,
      },
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-orders",
        behaviour: "holds",
        effect:
          "The charge comes before the order is saved, so a failed charge leaves no order behind.",
        service: "orders",
        path: "orders.py",
        startLine: 8,
        endLine: 9,
      },
      {
        actor: "outage",
        at: "cmp-gateway",
        from: "cmp-orders",
        behaviour: "wrong_data",
        effect:
          "Copies the error back without its status, so it leaves as 200 OK.",
        service: "gateway",
        path: "proxy.go",
        startLine: 17,
        endLine: 18,
      },
      {
        actor: "journeys",
        at: "cmp-web",
        from: "cmp-gateway",
        behaviour: "silent",
        effect:
          "Checkout reads every answer as success, so the shopper is told the order went through.",
        service: "web",
        path: "src/checkout.ts",
        startLine: 3,
        endLine: 8,
      },
    ],
    cascade: {
      headline: "Checkout says thank you, but no order was made.",
      hops: [
        { id: "outage-1", depth: 1, severity: "medium" },
        { id: "outage-2", depth: 1, severity: "low" },
        { id: "outage-3", depth: 2, severity: "high" },
        { id: "journeys-1", depth: 3, severity: "high" },
      ],
      journeys: [
        {
          name: "Checkout",
          effect:
            "Nothing is charged and nothing is saved, but the shopper is told the order went through.",
          broken: true,
        },
        NOT_AFFECTED(
          "Search the catalog",
          "the catalog does not call billing.",
        ),
      ],
    },
  },
  "cmp-auth:down": {
    hops: [
      {
        actor: "outage",
        at: "cmp-gateway",
        from: "cmp-auth",
        behaviour: "errors",
        effect: 'Calls to auth fail and come back as "upstream failed".',
        service: "gateway",
        path: "proxy.go",
        startLine: 12,
        endLine: 15,
      },
      {
        actor: "outage",
        at: "cmp-gateway",
        from: "cmp-gateway",
        behaviour: "silent",
        effect:
          "Orders never ask auth who the user is: the gateway trusts a header the caller sets, so ordering goes on as if nothing were wrong, for anyone.",
        service: "gateway",
        path: "main.go",
        startLine: 12,
        endLine: 17,
      },
      {
        actor: "journeys",
        at: "cmp-web",
        from: "cmp-gateway",
        behaviour: "silent",
        effect:
          "The shop sends whatever token it holds and never hears that auth is gone.",
        service: "web",
        path: "src/api.ts",
        startLine: 4,
        endLine: 9,
      },
    ],
    cascade: {
      headline:
        "Nobody can sign in, and checkout does not notice: orders never ask auth.",
      hops: [
        { id: "outage-1", depth: 1, severity: "medium" },
        { id: "outage-2", depth: 1, severity: "critical" },
        { id: "journeys-1", depth: 2, severity: "medium" },
      ],
      journeys: [
        {
          name: "Sign in",
          effect: "Fails with an error.",
          broken: true,
        },
        {
          name: "Checkout",
          effect:
            "Goes on, because the gateway takes the user from a header and never asks auth: nothing checks who is buying.",
          broken: true,
        },
      ],
    },
  },
  "cmp-payments:down": {
    hops: [
      {
        actor: "outage",
        at: "cmp-billing",
        from: "cmp-payments",
        behaviour: "errors",
        effect: 'The charge fails, and billing answers "charge failed".',
        service: "billing",
        path: "server.go",
        startLine: 8,
        endLine: 10,
      },
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-billing",
        behaviour: "wrong_data",
        effect:
          "Takes any answer from billing as a charge made: the error is never checked.",
        service: "orders",
        path: "billing_client.py",
        startLine: 9,
        endLine: 13,
      },
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-orders",
        behaviour: "wrong_data",
        effect: "Saves the order and announces it as if it were paid.",
        service: "orders",
        path: "orders.py",
        startLine: 9,
        endLine: 10,
      },
      {
        actor: "journeys",
        at: "cmp-notifications",
        from: "cmp-orders",
        behaviour: "silent",
        effect:
          "The shopper is emailed a confirmation for an order nobody paid for.",
        service: "notifications",
        path: "src/worker.ts",
        startLine: 6,
        endLine: 9,
      },
    ],
    cascade: {
      headline:
        "Orders are saved and confirmed as paid while no money is taken.",
      hops: [
        { id: "outage-1", depth: 1, severity: "low" },
        { id: "outage-2", depth: 2, severity: "critical" },
        { id: "outage-3", depth: 2, severity: "high" },
        { id: "journeys-1", depth: 3, severity: "medium" },
      ],
      journeys: [
        {
          name: "Checkout",
          effect: "The shopper gets a confirmed order, and nothing is charged.",
          broken: true,
        },
        NOT_AFFECTED("Search the catalog", "it never reaches payments."),
      ],
    },
  },
  "cmp-payments:slow": {
    hops: [
      {
        actor: "outage",
        at: "cmp-billing",
        from: "cmp-payments",
        behaviour: "hangs",
        effect: "Waits on the payment gateway with no time limit.",
        service: "billing",
        path: "charge.go",
        startLine: 12,
        endLine: 13,
      },
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-billing",
        behaviour: "retries",
        effect:
          "Waits two seconds for billing, then sends the same charge again, up to three times, with no key that stops a repeat.",
        service: "orders",
        path: "billing_client.py",
        startLine: 7,
        endLine: 15,
      },
      {
        actor: "outage",
        at: "cmp-orders",
        from: "cmp-orders",
        behaviour: "errors",
        effect:
          "Gives up after the third wait and fails before the order is saved, while the charges it sent may still go through.",
        service: "orders",
        path: "orders.py",
        startLine: 8,
        endLine: 9,
      },
      {
        actor: "outage",
        at: "cmp-gateway",
        from: "cmp-orders",
        behaviour: "wrong_data",
        effect:
          "Waits on orders with no time limit, then copies the error back without its status, so it leaves as 200 OK.",
        service: "gateway",
        path: "proxy.go",
        startLine: 12,
        endLine: 18,
      },
      {
        actor: "journeys",
        at: "cmp-web",
        from: "cmp-gateway",
        behaviour: "silent",
        effect:
          "Checkout reads every answer as success, so the shopper is thanked for an order that does not exist.",
        service: "web",
        path: "src/checkout.ts",
        startLine: 3,
        endLine: 8,
      },
    ],
    cascade: {
      headline:
        "A slow payment gateway charges shoppers up to three times for orders that are never saved.",
      hops: [
        { id: "outage-1", depth: 1, severity: "medium" },
        { id: "outage-2", depth: 2, severity: "critical" },
        { id: "outage-3", depth: 2, severity: "high" },
        { id: "outage-4", depth: 3, severity: "high" },
        { id: "journeys-1", depth: 4, severity: "high" },
      ],
      journeys: [
        {
          name: "Checkout",
          effect:
            "The shopper may be charged up to three times, gets no order, and is told it went through.",
          broken: true,
        },
      ],
    },
  },
};

/** Scenarios a sample project can play: "part:mode". */
export const ENGINE_OUT_SCENARIOS = Object.keys(SCENARIOS);

export const scenarioKey = (part: string, mode: OutageMode) =>
  `${part}:${mode}`;

/**
 * The scripted tool calls and cascades for the services in this project.
 * A scenario plays only when every service it cites is in the run; a
 * project of one workspace has a map of its own parts and plays none.
 */
export function engineOutScripts(
  has: (service: Service) => boolean,
  pathOf: (service: Service, path: string) => string,
  single: boolean,
): {
  tools: Record<string, { tool: string; input: unknown }[]>;
  cascades: Record<string, CascadeAnswer>;
} {
  const tools: Record<string, { tool: string; input: unknown }[]> = {};
  const cascades: Record<string, CascadeAnswer> = {};
  if (single) return { tools, cascades };
  for (const [key, scenario] of Object.entries(SCENARIOS)) {
    if (!scenario.hops.every((hop) => has(hop.service))) continue;
    cascades[key] = scenario.cascade;
    for (const hop of scenario.hops) {
      const path = pathOf(hop.service, hop.path);
      const steps = (tools[`engineout:${key}:${hop.actor}`] ??= []);
      steps.push(
        {
          tool: "read_file",
          input: { path, startLine: 0, endLine: 0 },
        },
        {
          tool: "report_hop",
          input: {
            at: hop.at,
            from: hop.from,
            behaviour: hop.behaviour,
            effect: hop.effect,
            path,
            startLine: hop.startLine,
            endLine: hop.endLine,
          },
        },
      );
    }
  }
  return { tools, cascades };
}
