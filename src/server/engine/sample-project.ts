import type { AgentId } from "@/lib/agents";

import type { Script } from "./sample";
import type {
  Architecture,
  DesignModel,
  FindingType,
  Severity,
} from "./schema";

/*
 * A scripted project run, for the sample mode and for tests. It is written
 * for the three folders in samples/storefront, and files its findings against
 * the real lines of those files, so every check in the engine still applies.
 *
 * It follows the workspaces it is given: a finding in a workspace that is not
 * part of the run is left out, and with one workspace the paths carry no
 * workspace name, as in any single-repository run.
 */

interface SampleFinding {
  key: string;
  agent: AgentId;
  workspace: string;
  path: string;
  line: number;
  type: FindingType;
  severity: Severity;
  title: string;
  description: string;
  suggestion: string;
}

const FINDINGS: SampleFinding[] = [
  {
    key: "price",
    agent: "adversarial_user",
    workspace: "api",
    path: "orders.py",
    line: 6,
    type: "security_vulnerability",
    severity: "critical",
    title: "The order total is taken from the request",
    description:
      "The service charges whatever total the client sends. A buyer can set their own price.",
    suggestion:
      "Work the total out on the server from the items and their stored prices.",
  },
  {
    key: "all-orders",
    agent: "adversarial_user",
    workspace: "api",
    path: "orders.py",
    line: 13,
    type: "security_vulnerability",
    severity: "critical",
    title: "Every user can read every order",
    description:
      "The list of orders is not limited to the user who asks. One customer sees all the others' orders.",
    suggestion: "Return only the orders that belong to the user.",
  },
  {
    key: "token-check",
    agent: "adversarial_user",
    workspace: "api",
    path: "auth.py",
    line: 6,
    type: "security_vulnerability",
    severity: "high",
    title: "Sign-in tokens never expire",
    description:
      "A token is looked up and trusted for ever. A stolen token keeps working until someone deletes it by hand.",
    suggestion: "Give tokens an expiry and check it on every request.",
  },
  {
    key: "token-storage",
    agent: "adversarial_user",
    workspace: "web",
    path: "src/session.ts",
    line: 2,
    type: "security_vulnerability",
    severity: "high",
    title: "The sign-in token is kept where any script can read it",
    description:
      "The token is saved in local storage, so one injected script can take the session.",
    suggestion: "Keep the session in a cookie that scripts cannot read.",
  },
  {
    key: "charge-first",
    agent: "chaos",
    workspace: "api",
    path: "orders.py",
    line: 7,
    type: "architecture_weakness",
    severity: "high",
    title: "The card is charged before the order is saved",
    description:
      "If saving the order fails after the charge, the customer has paid and no order exists.",
    suggestion: "Save the order as pending first, charge, then mark it paid.",
  },
  {
    key: "no-timeout",
    agent: "chaos",
    workspace: "billing",
    path: "charge.go",
    line: 6,
    type: "architecture_weakness",
    severity: "high",
    title: "A charge has no time limit and no key against repeats",
    description:
      "The call to the payment gateway can hang for ever, and a retry charges the card a second time.",
    suggestion:
      "Set a time limit and send an idempotency key with each charge.",
  },
  {
    key: "unbounded-list",
    agent: "scale",
    workspace: "api",
    path: "orders.py",
    line: 13,
    type: "architecture_weakness",
    severity: "medium",
    title: "The list of orders has no limit",
    description:
      "Every order is read and returned in one answer. It slows down, then fails, as orders grow.",
    suggestion: "Return the orders a page at a time.",
  },
  {
    key: "failed-order",
    agent: "normal_user",
    workspace: "web",
    path: "src/checkout.ts",
    line: 9,
    type: "unhandled_journey",
    severity: "medium",
    title: "A failed order tells the buyer nothing",
    description:
      "The answer is read as if it always succeeded. When the order fails the buyer cannot tell whether they paid.",
    suggestion: "Check the answer and show what happened and what to do next.",
  },
  {
    key: "no-refund",
    agent: "product_critic",
    workspace: "billing",
    path: "charge.go",
    line: 5,
    type: "missing_requirement",
    severity: "medium",
    title: "There is no way to give money back",
    description:
      "The billing service can charge a card and nothing else. A cancelled order cannot be refunded.",
    suggestion: "Decide how refunds work and add them to the billing service.",
  },
  {
    key: "no-confirmation",
    agent: "product_critic",
    workspace: "web",
    path: "src/checkout.ts",
    line: 3,
    type: "missing_requirement",
    severity: "low",
    title: "The buyer never confirms the order",
    description:
      "The order is placed in one step, with no summary of what will be charged.",
    suggestion: "Show the items and the total, and ask the buyer to confirm.",
  },
];

const MODEL: DesignModel = {
  summary:
    "An online shop. A buyer fills a cart in the web frontend and places an order; the orders service charges the card through the billing service and saves the order.",
  roles: [
    {
      id: "role-buyer",
      name: "Buyer",
      description: "A signed-in customer who places and reads orders.",
      source: "stated",
    },
  ],
  entities: [
    {
      id: "ent-order",
      name: "Order",
      description: "The items a buyer bought and what they paid.",
      fields: ["user_id", "items", "total"],
      limit: null,
      source: "stated",
    },
  ],
  operations: [
    {
      id: "op-place-order",
      name: "Place an order",
      description: "Charges the buyer's card and saves the order.",
      entityIds: ["ent-order"],
      preconditions: ["The buyer is signed in."],
      effects: ["The card is charged.", "An order is saved."],
      failureBehaviour: null,
      source: "stated",
    },
    {
      id: "op-list-orders",
      name: "List orders",
      description: "Returns orders.",
      entityIds: ["ent-order"],
      preconditions: [],
      effects: [],
      failureBehaviour: null,
      source: "stated",
    },
  ],
  permissions: [
    {
      operationId: "op-place-order",
      roleId: "role-buyer",
      effect: "allow",
      condition: null,
      source: "stated",
    },
  ],
  rules: [],
  journeys: [
    {
      id: "jrn-checkout",
      name: "Check out",
      roleId: "role-buyer",
      operationIds: ["op-place-order"],
      source: "stated",
    },
  ],
};

const COMPONENTS: (Architecture["components"][number] & {
  workspace: string | null;
})[] = [
  {
    id: "cmp-web",
    name: "Shop frontend",
    kind: "frontend",
    workspace: "web",
    paths: ["web/src"],
    description: "The pages a buyer uses to fill a cart and check out.",
  },
  {
    id: "cmp-orders",
    name: "Orders service",
    kind: "service",
    workspace: "api",
    paths: ["api/orders.py"],
    description: "Takes orders, charges for them and lists them.",
  },
  {
    id: "cmp-auth",
    name: "Sign-in",
    kind: "library",
    workspace: "api",
    paths: ["api/auth.py"],
    description: "Works out which user a request comes from.",
  },
  {
    id: "cmp-billing",
    name: "Billing service",
    kind: "service",
    workspace: "billing",
    paths: ["billing"],
    description: "Charges cards through the payment gateway.",
  },
  {
    id: "cmp-db",
    name: "Orders database",
    kind: "database",
    workspace: null,
    paths: [],
    description: "Holds users and orders.",
  },
  {
    id: "cmp-gateway",
    name: "Payment gateway",
    kind: "external",
    workspace: null,
    paths: [],
    description: "The outside system that moves the money.",
  },
];

const CONNECTIONS: Architecture["connections"] = [
  { from: "cmp-web", to: "cmp-orders", label: "REST" },
  { from: "cmp-orders", to: "cmp-auth", label: "imports" },
  { from: "cmp-orders", to: "cmp-billing", label: "HTTP" },
  { from: "cmp-orders", to: "cmp-db", label: "SQL" },
  { from: "cmp-auth", to: "cmp-db", label: "SQL" },
  { from: "cmp-billing", to: "cmp-gateway", label: "HTTPS" },
];

/** The judge's groups, by the keys of the findings each one merges. */
const GROUPS: {
  id: string;
  keys: string[];
  title: string;
  type: FindingType;
  severity: Severity;
  summary: string;
}[] = [
  {
    id: "g-price",
    keys: ["price"],
    title: "A buyer can set their own price",
    type: "security_vulnerability",
    severity: "critical",
    summary: "The orders service charges the total the client sends.",
  },
  {
    id: "g-orders",
    keys: ["all-orders", "unbounded-list"],
    title: "The list of orders returns everything to everyone",
    type: "security_vulnerability",
    severity: "critical",
    summary:
      "The list is neither limited to the user who asks nor split into pages.",
  },
  {
    id: "g-token",
    keys: ["token-check"],
    title: "Sign-in tokens never expire",
    type: "security_vulnerability",
    severity: "high",
    summary: "A stolen token works for ever.",
  },
  {
    id: "g-storage",
    keys: ["token-storage"],
    title: "The session can be taken by an injected script",
    type: "security_vulnerability",
    severity: "high",
    summary: "The token is kept in local storage.",
  },
  {
    id: "g-charge",
    keys: ["charge-first"],
    title: "A buyer can pay for an order that does not exist",
    type: "architecture_weakness",
    severity: "high",
    summary: "The card is charged before the order is saved.",
  },
  {
    id: "g-timeout",
    keys: ["no-timeout"],
    title: "A retried charge takes the money twice",
    type: "architecture_weakness",
    severity: "high",
    summary: "Charges have no time limit and no idempotency key.",
  },
  {
    id: "g-failed",
    keys: ["failed-order"],
    title: "A failed order tells the buyer nothing",
    type: "unhandled_journey",
    severity: "medium",
    summary: "The frontend reads every answer as a success.",
  },
  {
    id: "g-refund",
    keys: ["no-refund"],
    title: "There is no way to give money back",
    type: "missing_requirement",
    severity: "medium",
    summary: "Billing can charge and nothing else.",
  },
];

export function sampleProjectScript(workspaceNames: string[]): Script {
  const single = workspaceNames.length === 1;
  const pathOf = (workspace: string, path: string) =>
    single ? path : `${workspace}/${path}`;
  const findings = FINDINGS.filter((item) =>
    workspaceNames.includes(item.workspace),
  );

  // An agent's findings are numbered in the order it files them.
  const uids = new Map<string, string>();
  const tools: NonNullable<Script["tools"]> = {};
  for (const item of findings) {
    const steps = (tools[item.agent] ??= []);
    const path = pathOf(item.workspace, item.path);
    if (steps.length === 0) {
      steps.push({
        tool: "read_file",
        input: { path, startLine: 0, endLine: 0 },
      });
    }
    const filed = steps.filter((step) => step.tool === "report_finding");
    uids.set(item.key, `${item.agent}/f${filed.length + 1}`);
    steps.push({
      tool: "report_finding",
      input: {
        type: item.type,
        severity: item.severity,
        title: item.title,
        description: item.description,
        suggestion: item.suggestion,
        path,
        startLine: item.line,
        endLine: item.line,
      },
    });
  }

  const groups = GROUPS.map(({ keys, ...group }) => ({
    ...group,
    findingIds: keys.flatMap((key) => uids.get(key) ?? []),
  })).filter((group) => group.findingIds.length > 0);
  const rejected = uids.has("no-confirmation")
    ? [
        {
          findingId: uids.get("no-confirmation")!,
          reason: "A choice of design, not a flaw the code shows.",
        },
      ]
    : [];

  const strip = (path: string) =>
    single ? path.split("/").slice(1).join("/") : path;
  const architecture: Architecture = {
    components: COMPONENTS.map((component) => {
      const inRun =
        component.workspace !== null &&
        workspaceNames.includes(component.workspace);
      if (component.workspace !== null && !inRun) {
        // Its code is not part of this run: to this run it is an outside system.
        return { ...component, kind: "external", workspace: null, paths: [] };
      }
      return {
        ...component,
        workspace: single ? null : component.workspace,
        paths: component.paths.map(strip).filter(Boolean),
      };
    }),
    connections: CONNECTIONS,
  };

  const ok = <T>(value: T) => ({ kind: "ok" as const, value });
  const empty = ok({ scenarios: [], findings: [] });
  return {
    model: ok(MODEL),
    architecture,
    agents: {
      normal_user: empty,
      adversarial_user: empty,
      chaos: empty,
      scale: empty,
      product_critic: empty,
    },
    tools: {
      model: [
        {
          tool: "list_files",
          input: { path: "" },
        },
      ],
      ...tools,
    },
    challenges: {},
    judge: ok({ groups, rejected }),
    work_orders: ok({
      workOrders: [
        {
          id: "wo-1",
          title: "Work out the order total on the server",
          priority: "p0" as const,
          description:
            "Ignore the total the client sends. Price the items from the stored prices.",
          acceptanceCriteria: [
            "Given a request with a total lower than the items cost, then the card is charged the real total.",
          ],
          groupIds: ["g-price"],
        },
        {
          id: "wo-2",
          title: "Limit the list of orders to its owner, a page at a time",
          priority: "p0" as const,
          description:
            "Return only the asking user's orders, and no more than one page of them.",
          acceptanceCriteria: [
            "Given two buyers, when one lists orders, then none of the other's orders are returned.",
            "Given 10,000 orders, then one answer holds at most one page.",
          ],
          groupIds: ["g-orders"],
        },
        {
          id: "wo-3",
          title: "Make sessions expire and keep them out of reach of scripts",
          priority: "p1" as const,
          description:
            "Give tokens an expiry, and keep the session in a cookie scripts cannot read.",
          acceptanceCriteria: [
            "Given a token past its expiry, then the request is refused.",
            "The token is not readable from page scripts.",
          ],
          groupIds: ["g-token", "g-storage"],
        },
        {
          id: "wo-4",
          title: "Make a charge safe to fail and safe to repeat",
          priority: "p1" as const,
          description:
            "Save the order as pending before charging. Give the charge a time limit and an idempotency key.",
          acceptanceCriteria: [
            "Given a failure after the charge, then a pending order exists.",
            "Given the same charge sent twice, then the card is charged once.",
          ],
          groupIds: ["g-charge", "g-timeout"],
        },
        {
          id: "wo-5",
          title: "Tell the buyer when an order fails",
          priority: "p2" as const,
          description: "Check the answer and show what happened.",
          acceptanceCriteria: [
            "Given a failed order, then the buyer sees whether they were charged.",
          ],
          groupIds: ["g-failed"],
        },
      ],
    }),
  };
}
