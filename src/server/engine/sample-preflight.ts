import type { AgentId } from "@/lib/agents";
import { EXAMPLE_SPEC } from "@/lib/features";

import { specLines } from "./kinds/preflight";
import type { LineStatus } from "./schema";

/*
 * Preflight on the Storefront sample: how each line of the example spec
 * stands against the code, as the scripted agents report it. Every cited
 * range is a real one in samples/storefront, checked by the run.
 */

type Service =
  | "web"
  | "gateway"
  | "auth"
  | "catalog"
  | "orders"
  | "billing"
  | "notifications";

interface ScriptedLine {
  status: Exclude<LineStatus, "unclear">;
  note: string;
  code: {
    service: Service;
    path: string;
    startLine: number;
    endLine: number;
  }[];
  searched?: string;
}

/** By the line's place in EXAMPLE_SPEC, from 1. */
const LINES: Record<number, ScriptedLine> = {
  1: {
    status: "implemented",
    note: "Search matches the product name, and the shop lists what comes back.",
    code: [
      { service: "catalog", path: "search.py", startLine: 4, endLine: 6 },
      { service: "web", path: "src/search.ts", startLine: 3, endLine: 9 },
    ],
  },
  2: {
    status: "contradicted",
    note: "The order list ignores who asks and returns every order.",
    code: [
      { service: "orders", path: "orders.py", startLine: 14, endLine: 15 },
    ],
  },
  3: {
    status: "contradicted",
    note: "The gateway takes the user from a header the caller sets; nothing checks a sign-in.",
    code: [{ service: "gateway", path: "main.go", startLine: 12, endLine: 17 }],
  },
  4: {
    status: "contradicted",
    note: "The total charged is the one the request sends, which the shop works out in the browser.",
    code: [
      { service: "orders", path: "orders.py", startLine: 6, endLine: 8 },
      { service: "web", path: "src/checkout.ts", startLine: 4, endLine: 7 },
    ],
  },
  5: {
    status: "contradicted",
    note: "Sessions are stored with no expiry, and a token is accepted for as long as its row exists.",
    code: [
      { service: "auth", path: "src/session.ts", startLine: 5, endLine: 14 },
    ],
  },
  6: {
    status: "contradicted",
    note: "A slow charge is sent again, up to three times, with no key that stops a repeat.",
    code: [
      {
        service: "orders",
        path: "billing_client.py",
        startLine: 7,
        endLine: 15,
      },
    ],
  },
  7: {
    status: "partly",
    note: "No order is saved when the charge fails, but the shop reads every answer as success, so the shopper is not told.",
    code: [
      { service: "orders", path: "orders.py", startLine: 8, endLine: 9 },
      { service: "web", path: "src/checkout.ts", startLine: 3, endLine: 8 },
    ],
  },
  8: {
    status: "partly",
    note: "An email is sent for each order, but the event is acknowledged before it goes out, so one can be lost.",
    code: [
      {
        service: "notifications",
        path: "src/worker.ts",
        startLine: 6,
        endLine: 9,
      },
    ],
  },
  9: {
    status: "contradicted",
    note: "Every charge writes the full card number to the log.",
    code: [
      { service: "billing", path: "charge.go", startLine: 10, endLine: 11 },
    ],
  },
  10: {
    status: "missing",
    note: "Billing can charge a card but has no way to give money back.",
    code: [],
    searched:
      "Billing and orders, for refund and for any call that sends money back.",
  },
};

/**
 * Each agent's scripted report_line calls for the example spec, keyed as
 * the scripted model looks them up. Only lines whose services are in the
 * run are scripted; the rest stay unclear, as they would with no code.
 */
export function preflightScripts(
  has: (service: Service) => boolean,
  pathOf: (service: Service, path: string) => string,
): Record<string, { tool: string; input: unknown }[]> {
  const tools: Record<string, { tool: string; input: unknown }[]> = {};
  specLines(EXAMPLE_SPEC).forEach((line, index) => {
    const scripted = LINES[index + 1];
    if (!scripted || !scripted.code.every((at) => has(at.service))) return;
    const steps = (tools[`preflight:${line.agentId as AgentId}`] ??= []);
    for (const at of scripted.code) {
      steps.push({
        tool: "read_file",
        input: { path: pathOf(at.service, at.path), startLine: 0, endLine: 0 },
      });
    }
    steps.push({
      tool: "report_line",
      input: {
        lineId: line.id,
        status: scripted.status,
        note: scripted.note,
        code: scripted.code.map((at) => ({
          path: pathOf(at.service, at.path),
          startLine: at.startLine,
          endLine: at.endLine,
        })),
        searched: scripted.searched ?? null,
      },
    });
  });
  return tools;
}
