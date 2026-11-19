import type { AgentId } from "@/lib/agents";
import { engineOutScripts } from "./sample-engineout";

import type { Script } from "./sample";
import type {
  Architecture,
  DesignModel,
  FindingType,
  Severity,
} from "./schema";

/*
 * A scripted project run, for demo projects and for tests. It is written for
 * the seven services in samples/storefront (each also a private repository,
 * rvren/storefront-<service>), and files its findings against the real lines
 * of those files, so every check in the engine still applies.
 *
 * It follows the workspaces it is given. A service is known by its
 * repository, not by the name of its workspace. A finding in a service that
 * is not part of the run is left out; one that spans two services needs
 * both. With one workspace the paths carry no workspace name, as in any
 * single-repository run.
 */

export const SAMPLE_SERVICES = [
  "web",
  "gateway",
  "auth",
  "catalog",
  "orders",
  "billing",
  "notifications",
] as const;
export type SampleService = (typeof SAMPLE_SERVICES)[number];

/** The GitHub address of a sample service's repository. */
export const sampleRepoUrl = (service: SampleService) =>
  `https://github.com/rvren/storefront-${service}`;

/**
 * Which sample service a repository is, if it is one: by the name of the
 * GitHub repository or of the local folder, with or without "storefront-".
 */
export function sampleServiceOf(origin: {
  kind: string;
  url?: string;
  name?: string;
}): SampleService | null {
  const last = (origin.kind === "github" ? origin.url : origin.name)
    ?.replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    ?.replace(/^storefront-/, "");
  return SAMPLE_SERVICES.find((service) => service === last) ?? null;
}

type Kind = Architecture["components"][number]["kind"];

interface Part {
  id: string;
  name: string;
  kind: Kind;
  /** Paths inside the service's repository. */
  paths: string[];
  description: string;
}

/** Each service: one component in a project, or its parts when it is alone. */
const SERVICES: Record<
  SampleService,
  { name: string; kind: Kind; description: string; parts: Part[] }
> = {
  web: {
    name: "Shop frontend",
    kind: "frontend",
    description: "The pages a buyer uses to search, fill a cart and check out.",
    parts: [
      {
        id: "cmp-web-session",
        name: "Session",
        kind: "library",
        paths: ["src/session.ts", "src/api.ts"],
        description: "Keeps the sign-in token and calls the gateway.",
      },
      {
        id: "cmp-web-search",
        name: "Search page",
        kind: "frontend",
        paths: ["src/search.ts"],
        description: "Shows products that match a query.",
      },
      {
        id: "cmp-web-checkout",
        name: "Checkout page",
        kind: "frontend",
        paths: ["src/checkout.ts"],
        description: "Places the order.",
      },
    ],
  },
  gateway: {
    name: "API gateway",
    kind: "service",
    description: "The one door into the backend: routing and rate limits.",
    parts: [
      {
        id: "cmp-gateway-routes",
        name: "Routes",
        kind: "service",
        paths: ["main.go"],
        description: "Sends each request to its service.",
      },
      {
        id: "cmp-gateway-proxy",
        name: "Proxy",
        kind: "library",
        paths: ["proxy.go"],
        description: "Forwards a request upstream.",
      },
      {
        id: "cmp-gateway-limit",
        name: "Rate limit",
        kind: "library",
        paths: ["ratelimit.go"],
        description: "Counts calls per client.",
      },
    ],
  },
  auth: {
    name: "Auth service",
    kind: "service",
    description: "Sign-in and sessions.",
    parts: [
      {
        id: "cmp-auth-login",
        name: "Sign-in",
        kind: "service",
        paths: ["src/login.ts"],
        description: "Checks an email and password.",
      },
      {
        id: "cmp-auth-passwords",
        name: "Passwords",
        kind: "library",
        paths: ["src/password.ts"],
        description: "Hashes passwords.",
      },
      {
        id: "cmp-auth-sessions",
        name: "Sessions",
        kind: "library",
        paths: ["src/session.ts"],
        description: "Opens sessions and resolves tokens.",
      },
    ],
  },
  catalog: {
    name: "Catalog service",
    kind: "service",
    description: "Products, prices and search.",
    parts: [
      {
        id: "cmp-catalog-search",
        name: "Search",
        kind: "service",
        paths: ["search.py"],
        description: "Finds products by name.",
      },
      {
        id: "cmp-catalog-products",
        name: "Products",
        kind: "service",
        paths: ["products.py", "cache.py"],
        description: "Lists products and keeps prices.",
      },
    ],
  },
  orders: {
    name: "Orders service",
    kind: "service",
    description: "Takes orders, charges for them and announces them.",
    parts: [
      {
        id: "cmp-orders-checkout",
        name: "Checkout",
        kind: "service",
        paths: ["orders.py"],
        description: "Creates and lists orders.",
      },
      {
        id: "cmp-orders-billing",
        name: "Billing client",
        kind: "library",
        paths: ["billing_client.py"],
        description: "Calls the billing service.",
      },
      {
        id: "cmp-orders-events",
        name: "Events",
        kind: "library",
        paths: ["events.py"],
        description: "Announces orders on the queue.",
      },
    ],
  },
  billing: {
    name: "Billing service",
    kind: "service",
    description: "Charges cards through the payment gateway.",
    parts: [
      {
        id: "cmp-billing-charge",
        name: "Charges",
        kind: "service",
        paths: ["charge.go"],
        description: "Sends a charge to the payment gateway.",
      },
      {
        id: "cmp-billing-server",
        name: "HTTP server",
        kind: "service",
        paths: ["server.go"],
        description: "Takes charges from the orders service.",
      },
    ],
  },
  notifications: {
    name: "Notifications worker",
    kind: "service",
    description: "Sends buyers an email for each order event.",
    parts: [
      {
        id: "cmp-notifications-worker",
        name: "Worker",
        kind: "service",
        paths: ["src/worker.ts"],
        description: "Takes events from the queue.",
      },
      {
        id: "cmp-notifications-templates",
        name: "Templates",
        kind: "library",
        paths: ["src/templates.ts"],
        description: "The words of each email.",
      },
    ],
  },
};

/** What the services call that has no code of its own. */
const OUTSIDE: { id: string; name: string; kind: Kind; description: string }[] =
  [
    {
      id: "cmp-users-db",
      name: "Users database",
      kind: "database",
      description: "Users and their sessions.",
    },
    {
      id: "cmp-catalog-db",
      name: "Catalog database",
      kind: "database",
      description: "Products and prices.",
    },
    {
      id: "cmp-price-cache",
      name: "Price cache",
      kind: "database",
      description: "Prices kept in memory, by product.",
    },
    {
      id: "cmp-orders-db",
      name: "Orders database",
      kind: "database",
      description: "Orders and their items.",
    },
    {
      id: "cmp-queue",
      name: "Order events queue",
      kind: "queue",
      description: "Carries order events to the workers.",
    },
    {
      id: "cmp-payments",
      name: "Payment gateway",
      kind: "external",
      description: "The outside system that moves the money.",
    },
    {
      id: "cmp-email",
      name: "Email provider",
      kind: "external",
      description: "The outside system that delivers email.",
    },
  ];

/** Who calls whom. An end is a service or the id of something outside. */
const CALLS: { from: SampleService; to: string; label: string }[] = [
  { from: "web", to: "gateway", label: "REST" },
  { from: "gateway", to: "auth", label: "HTTP" },
  { from: "gateway", to: "catalog", label: "HTTP" },
  { from: "gateway", to: "orders", label: "HTTP" },
  { from: "auth", to: "cmp-users-db", label: "SQL" },
  { from: "catalog", to: "cmp-catalog-db", label: "SQL" },
  { from: "catalog", to: "cmp-price-cache", label: "Redis" },
  { from: "orders", to: "billing", label: "HTTP" },
  { from: "orders", to: "cmp-orders-db", label: "SQL" },
  { from: "orders", to: "cmp-queue", label: "publishes" },
  { from: "billing", to: "cmp-payments", label: "HTTPS" },
  { from: "notifications", to: "cmp-queue", label: "consumes" },
  { from: "notifications", to: "cmp-email", label: "HTTPS" },
];

interface SampleFinding {
  key: string;
  agent: AgentId;
  service: SampleService;
  /** Other services that must be in the run for this to be seen. */
  needs?: SampleService[];
  path: string;
  line: number;
  type: FindingType;
  severity: Severity;
  title: string;
  description: string;
  suggestion: string;
}

const f = (
  key: string,
  agent: AgentId,
  service: SampleService,
  path: string,
  line: number,
  type: FindingType,
  severity: Severity,
  title: string,
  description: string,
  suggestion: string,
  needs?: SampleService[],
): SampleFinding => ({
  key,
  agent,
  service,
  path,
  line,
  type,
  severity,
  title,
  description,
  suggestion,
  needs,
});

const SECURITY = "security_vulnerability";
const WEAKNESS = "architecture_weakness";
const MISSING = "missing_requirement";
const JOURNEY = "unhandled_journey";

const FINDINGS: SampleFinding[] = [
  // web
  f(
    "web-token",
    "adversarial_user",
    "web",
    "src/session.ts",
    2,
    SECURITY,
    "high",
    "The sign-in token is kept where any script can read it",
    "The token is saved in local storage, so one injected script can take the session.",
    "Keep the session in a cookie that scripts cannot read.",
  ),
  f(
    "web-xss",
    "adversarial_user",
    "web",
    "src/search.ts",
    8,
    SECURITY,
    "high",
    "A product name is written to the page as HTML",
    "A product whose name holds a script runs it in every buyer's browser.",
    "Write the name as text, not as HTML.",
  ),
  f(
    "web-failed-order",
    "normal_user",
    "web",
    "src/checkout.ts",
    8,
    JOURNEY,
    "medium",
    "A failed order tells the buyer nothing",
    "The answer is read as if it always succeeded. When the order fails the buyer cannot tell whether they paid.",
    "Check the answer and show what happened and what to do next.",
  ),
  f(
    "web-no-confirm",
    "product_critic",
    "web",
    "src/checkout.ts",
    3,
    MISSING,
    "low",
    "The buyer never confirms the order",
    "The order is placed in one step, with no summary of what will be charged.",
    "Show the items and the total, and ask the buyer to confirm.",
  ),
  // gateway
  f(
    "gw-user-header",
    "adversarial_user",
    "gateway",
    "main.go",
    14,
    SECURITY,
    "critical",
    "The gateway believes a user id the client sends",
    "The user is taken from a request header anyone can set. A caller can act as any buyer.",
    "Resolve the user from the session token, and drop the header from incoming requests.",
  ),
  f(
    "gw-no-auth-call",
    "adversarial_user",
    "gateway",
    "main.go",
    14,
    SECURITY,
    "critical",
    "The gateway never asks the auth service who the caller is",
    "The auth service can resolve a token to a user, but no route calls it. Sessions protect nothing.",
    "Call the auth service for every order request and use its answer.",
    ["auth"],
  ),
  f(
    "gw-timeout",
    "chaos",
    "gateway",
    "proxy.go",
    12,
    WEAKNESS,
    "high",
    "A slow service holds every request open",
    "Calls upstream have no time limit. One stalled service uses up the gateway's connections.",
    "Set a time limit on upstream calls and answer 504 when it passes.",
  ),
  f(
    "gw-rate-memory",
    "scale",
    "gateway",
    "ratelimit.go",
    5,
    WEAKNESS,
    "medium",
    "The rate limit is counted per instance and never reset",
    "Each gateway instance keeps its own count in memory, and the count only grows. More instances mean a higher limit, and an old client is blocked for ever.",
    "Keep the count in a shared store, in a window of time.",
  ),
  // auth
  f(
    "auth-md5",
    "adversarial_user",
    "auth",
    "src/password.ts",
    4,
    SECURITY,
    "critical",
    "Passwords are hashed with MD5 and no salt",
    "A copy of the users table gives up most passwords in minutes.",
    "Use a slow, salted password hash such as Argon2.",
  ),
  f(
    "auth-no-expiry",
    "adversarial_user",
    "auth",
    "src/session.ts",
    7,
    SECURITY,
    "high",
    "A session never ends",
    "A session is saved with no expiry and there is no way to end it. A stolen token works for ever.",
    "Give sessions an expiry and a way to sign out.",
  ),
  f(
    "auth-no-lockout",
    "product_critic",
    "auth",
    "src/login.ts",
    5,
    MISSING,
    "medium",
    "Nothing limits sign-in attempts",
    "The design says nothing about repeated wrong passwords, so guessing is free.",
    "Decide a limit on attempts per account and per address.",
  ),
  // catalog
  f(
    "cat-sqli",
    "adversarial_user",
    "catalog",
    "search.py",
    5,
    SECURITY,
    "critical",
    "The search text is put straight into the SQL",
    "A buyer can read or change any table through the search box.",
    "Pass the text as a parameter of the query.",
  ),
  f(
    "cat-unbounded",
    "scale",
    "catalog",
    "products.py",
    5,
    WEAKNESS,
    "medium",
    "The product list returns the whole catalog",
    "Every product is read and returned in one answer. It slows down, then fails, as the catalog grows.",
    "Return products a page at a time.",
  ),
  f(
    "cat-stale-price",
    "chaos",
    "catalog",
    "products.py",
    20,
    WEAKNESS,
    "medium",
    "A changed price is not seen until the cache is emptied by hand",
    "Setting a price updates the database and leaves the cached price, which never expires.",
    "Remove the cached price when the price is set, and give cached prices an expiry.",
  ),
  // orders
  f(
    "ord-price",
    "adversarial_user",
    "orders",
    "orders.py",
    7,
    SECURITY,
    "critical",
    "The order total is taken from the request",
    "The service charges whatever total the client sends. A buyer can set their own price.",
    "Work the total out on the server from the items and their stored prices.",
  ),
  f(
    "ord-all-orders",
    "adversarial_user",
    "orders",
    "orders.py",
    15,
    SECURITY,
    "critical",
    "Every user can read every order",
    "The list of orders is not limited to the user who asks.",
    "Return only the orders that belong to the user.",
  ),
  f(
    "ord-unbounded",
    "scale",
    "orders",
    "orders.py",
    15,
    WEAKNESS,
    "medium",
    "The list of orders has no limit",
    "Every order is read and returned in one answer.",
    "Return the orders a page at a time.",
  ),
  f(
    "ord-charge-first",
    "chaos",
    "orders",
    "orders.py",
    8,
    WEAKNESS,
    "high",
    "The card is charged before the order is saved",
    "If saving the order fails after the charge, the buyer has paid and no order exists.",
    "Save the order as pending first, charge, then mark it paid.",
  ),
  f(
    "ord-lost-event",
    "chaos",
    "orders",
    "orders.py",
    10,
    WEAKNESS,
    "medium",
    "An order can be saved and never announced",
    "The event is published after the order is saved, with nothing to send it again if publishing fails. The buyer then gets no email.",
    "Write the event in the same transaction as the order and publish it from there.",
  ),
  f(
    "ord-double-charge",
    "chaos",
    "orders",
    "billing_client.py",
    7,
    WEAKNESS,
    "critical",
    "A slow charge is sent again, and billing charges twice",
    "The orders service repeats a charge that timed out, and the billing service has no way to know it is the same charge. The buyer pays two or three times.",
    "Send an idempotency key with each charge and have billing honour it.",
    ["billing"],
  ),
  // billing
  f(
    "bill-card-log",
    "adversarial_user",
    "billing",
    "charge.go",
    11,
    SECURITY,
    "high",
    "Card numbers are written to the log",
    "Every charge logs the full card number, so anyone who can read logs can read cards.",
    "Never log the card number; log a reference to the charge.",
  ),
  f(
    "bill-no-timeout",
    "chaos",
    "billing",
    "charge.go",
    12,
    WEAKNESS,
    "high",
    "A charge has no time limit and its answer is not read",
    "The call to the payment gateway can hang for ever, and a refused charge is treated as a success.",
    "Set a time limit and check the gateway's answer.",
  ),
  f(
    "bill-no-refund",
    "product_critic",
    "billing",
    "charge.go",
    10,
    MISSING,
    "medium",
    "There is no way to give money back",
    "The billing service can charge a card and nothing else. A cancelled order cannot be refunded.",
    "Decide how refunds work and add them to the billing service.",
  ),
  // notifications
  f(
    "ntf-ack-first",
    "chaos",
    "notifications",
    "src/worker.ts",
    7,
    WEAKNESS,
    "medium",
    "An email is lost when sending fails",
    "The event is acknowledged before the email is sent. If the send fails the event is gone.",
    "Acknowledge the event after the email is accepted.",
  ),
  f(
    "ntf-duplicate",
    "normal_user",
    "notifications",
    "src/worker.ts",
    9,
    JOURNEY,
    "low",
    "A buyer can get the same email twice",
    "Nothing records which events were handled, so a redelivered event sends a second email.",
    "Record handled events and skip the ones seen before.",
  ),
  f(
    "ntf-no-optout",
    "product_critic",
    "notifications",
    "src/templates.ts",
    3,
    MISSING,
    "low",
    "Emails have no way to opt out",
    "A matter of taste for an order email.",
    "None.",
  ),
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
    id: "g-web-token",
    keys: ["web-token"],
    title: "The session can be taken by an injected script",
    type: SECURITY,
    severity: "high",
    summary: "The frontend keeps the token in local storage.",
  },
  {
    id: "g-web-xss",
    keys: ["web-xss"],
    title: "A product name can run a script in the shop",
    type: SECURITY,
    severity: "high",
    summary: "Search results are written to the page as HTML.",
  },
  {
    id: "g-web-failed",
    keys: ["web-failed-order"],
    title: "A failed order tells the buyer nothing",
    type: JOURNEY,
    severity: "medium",
    summary: "The frontend reads every answer as a success.",
  },
  {
    id: "g-gw-identity",
    keys: ["gw-user-header", "gw-no-auth-call"],
    title: "Anyone can act as any buyer",
    type: SECURITY,
    severity: "critical",
    summary:
      "The gateway takes the user from a header the client sets, and never asks the auth service.",
  },
  {
    id: "g-gw-timeout",
    keys: ["gw-timeout"],
    title: "One slow service can stall the gateway",
    type: WEAKNESS,
    severity: "high",
    summary: "Upstream calls have no time limit.",
  },
  {
    id: "g-gw-rate",
    keys: ["gw-rate-memory"],
    title: "The rate limit does not hold across instances",
    type: WEAKNESS,
    severity: "medium",
    summary: "Counts are kept in each instance's memory and never reset.",
  },
  {
    id: "g-auth-md5",
    keys: ["auth-md5"],
    title: "Passwords are stored with a broken hash",
    type: SECURITY,
    severity: "critical",
    summary: "MD5 with no salt.",
  },
  {
    id: "g-auth-expiry",
    keys: ["auth-no-expiry"],
    title: "A session never ends",
    type: SECURITY,
    severity: "high",
    summary: "Sessions have no expiry and no sign-out.",
  },
  {
    id: "g-auth-lockout",
    keys: ["auth-no-lockout"],
    title: "Nothing limits sign-in attempts",
    type: MISSING,
    severity: "medium",
    summary: "Password guessing is free.",
  },
  {
    id: "g-cat-sqli",
    keys: ["cat-sqli"],
    title: "The search box can run SQL",
    type: SECURITY,
    severity: "critical",
    summary: "The search text is joined into the query.",
  },
  {
    id: "g-cat-list",
    keys: ["cat-unbounded"],
    title: "The product list returns the whole catalog",
    type: WEAKNESS,
    severity: "medium",
    summary: "No paging.",
  },
  {
    id: "g-cat-price",
    keys: ["cat-stale-price"],
    title: "A changed price is not seen by buyers",
    type: WEAKNESS,
    severity: "medium",
    summary: "The price cache is never cleared and never expires.",
  },
  {
    id: "g-ord-price",
    keys: ["ord-price"],
    title: "A buyer can set their own price",
    type: SECURITY,
    severity: "critical",
    summary: "The orders service charges the total the client sends.",
  },
  {
    id: "g-ord-list",
    keys: ["ord-all-orders", "ord-unbounded"],
    title: "The list of orders returns everything to everyone",
    type: SECURITY,
    severity: "critical",
    summary:
      "The list is neither limited to the user who asks nor split into pages.",
  },
  {
    id: "g-ord-charge",
    keys: ["ord-charge-first"],
    title: "A buyer can pay for an order that does not exist",
    type: WEAKNESS,
    severity: "high",
    summary: "The card is charged before the order is saved.",
  },
  {
    id: "g-ord-event",
    keys: ["ord-lost-event"],
    title: "An order can be saved and never announced",
    type: WEAKNESS,
    severity: "medium",
    summary: "The event is published outside the order's transaction.",
  },
  {
    id: "g-double-charge",
    keys: ["ord-double-charge"],
    title: "A retried charge takes the money again",
    type: WEAKNESS,
    severity: "critical",
    summary:
      "Orders repeats a slow charge and billing cannot tell it is the same one.",
  },
  {
    id: "g-bill-log",
    keys: ["bill-card-log"],
    title: "Card numbers are written to the log",
    type: SECURITY,
    severity: "high",
    summary: "Every charge logs the full card number.",
  },
  {
    id: "g-bill-timeout",
    keys: ["bill-no-timeout"],
    title: "A charge can hang, and a refusal passes as success",
    type: WEAKNESS,
    severity: "high",
    summary: "No time limit, and the gateway's answer is not read.",
  },
  {
    id: "g-bill-refund",
    keys: ["bill-no-refund"],
    title: "There is no way to give money back",
    type: MISSING,
    severity: "medium",
    summary: "Billing can charge and nothing else.",
  },
  {
    id: "g-ntf-lost",
    keys: ["ntf-ack-first"],
    title: "An email is lost when sending fails",
    type: WEAKNESS,
    severity: "medium",
    summary: "The event is acknowledged before the email is sent.",
  },
  {
    id: "g-ntf-twice",
    keys: ["ntf-duplicate"],
    title: "A buyer can get the same email twice",
    type: JOURNEY,
    severity: "low",
    summary: "Handled events are not recorded.",
  },
];

const REJECTED: Record<string, string> = {
  "web-no-confirm": "A choice of design, not a flaw the code shows.",
  "ntf-no-optout": "An order email is not marketing; no opt-out is owed.",
};

const WORK_ORDERS: {
  id: string;
  title: string;
  priority: "p0" | "p1" | "p2" | "p3";
  description: string;
  acceptanceCriteria: string[];
  groupIds: string[];
}[] = [
  {
    id: "wo-identity",
    title: "Take the caller's identity from the session, at the gateway",
    priority: "p0",
    description:
      "Drop the client's user header. Resolve the user from the token through the auth service on every order request.",
    acceptanceCriteria: [
      "Given a request with a made-up user header, then the header is ignored.",
      "Given no valid session, then an order request is refused with 401.",
    ],
    groupIds: ["g-gw-identity"],
  },
  {
    id: "wo-passwords",
    title: "Store passwords with a slow, salted hash",
    priority: "p0",
    description:
      "Replace MD5 with Argon2 and rehash each password at the next sign-in.",
    acceptanceCriteria: [
      "No password in the users table is an MD5 hash 90 days after release.",
    ],
    groupIds: ["g-auth-md5"],
  },
  {
    id: "wo-sqli",
    title: "Pass the search text as a query parameter",
    priority: "p0",
    description: "Never join request text into SQL in the catalog service.",
    acceptanceCriteria: [
      "Given a search for a quote character, then the query runs and returns no error.",
    ],
    groupIds: ["g-cat-sqli"],
  },
  {
    id: "wo-price",
    title: "Work out the order total on the server",
    priority: "p0",
    description:
      "Ignore the total the client sends. Price the items from the catalog.",
    acceptanceCriteria: [
      "Given a request with a total lower than the items cost, then the card is charged the real total.",
    ],
    groupIds: ["g-ord-price"],
  },
  {
    id: "wo-orders-list",
    title: "Limit the list of orders to its owner, a page at a time",
    priority: "p0",
    description:
      "Return only the asking user's orders, and no more than one page.",
    acceptanceCriteria: [
      "Given two buyers, when one lists orders, then none of the other's are returned.",
      "One answer holds at most one page.",
    ],
    groupIds: ["g-ord-list"],
  },
  {
    id: "wo-charge-once",
    title: "Make a charge safe to fail and safe to repeat",
    priority: "p0",
    description:
      "Orders saves the order as pending, then charges with an idempotency key. Billing honours the key, sets a time limit and reads the gateway's answer.",
    acceptanceCriteria: [
      "Given the same charge sent three times, then the card is charged once.",
      "Given a failure after the charge, then a pending order exists.",
      "Given a refused charge, then the order is not marked paid.",
    ],
    groupIds: ["g-double-charge", "g-ord-charge", "g-bill-timeout"],
  },
  {
    id: "wo-sessions",
    title: "Make sessions expire and keep them out of reach of scripts",
    priority: "p1",
    description:
      "Give sessions an expiry and a sign-out, and keep the token in a cookie scripts cannot read.",
    acceptanceCriteria: [
      "Given a session past its expiry, then the request is refused.",
      "The token is not readable from page scripts.",
    ],
    groupIds: ["g-auth-expiry", "g-web-token"],
  },
  {
    id: "wo-xss",
    title: "Write product names to the page as text",
    priority: "p1",
    description: "Never set HTML from catalog data in the frontend.",
    acceptanceCriteria: [
      "Given a product named with a script tag, then the tag is shown as text.",
    ],
    groupIds: ["g-web-xss"],
  },
  {
    id: "wo-card-log",
    title: "Take card numbers out of the log",
    priority: "p1",
    description:
      "Log a charge reference only, and remove card numbers from the logs kept so far.",
    acceptanceCriteria: ["No log line holds a card number."],
    groupIds: ["g-bill-log"],
  },
  {
    id: "wo-gateway-limits",
    title: "Give the gateway time limits and a shared rate limit",
    priority: "p1",
    description:
      "Limit the time of upstream calls. Count calls in a shared store, in a window of time.",
    acceptanceCriteria: [
      "Given a service that does not answer, then the gateway answers 504 within the limit.",
      "Given two gateway instances, then one client's limit is counted across both.",
    ],
    groupIds: ["g-gw-timeout", "g-gw-rate"],
  },
  {
    id: "wo-events",
    title: "Never lose an order event or its email",
    priority: "p2",
    description:
      "Publish order events from an outbox. The worker acknowledges after the email is accepted and skips events it has handled.",
    acceptanceCriteria: [
      "Given a failed publish, then the event is sent later.",
      "Given a failed send, then the email is tried again.",
      "Given a redelivered event, then one email is sent.",
    ],
    groupIds: ["g-ord-event", "g-ntf-lost", "g-ntf-twice"],
  },
  {
    id: "wo-catalog",
    title: "Page the product list and keep cached prices true",
    priority: "p2",
    description:
      "Return products a page at a time. Clear a cached price when it is set, and expire cached prices.",
    acceptanceCriteria: [
      "One answer holds at most one page of products.",
      "Given a price change, then the next read returns the new price.",
    ],
    groupIds: ["g-cat-list", "g-cat-price"],
  },
  {
    id: "wo-buyer",
    title: "Tell the buyer what happened to an order",
    priority: "p2",
    description:
      "Show a failed order as failed, and say whether the card was charged.",
    acceptanceCriteria: [
      "Given a failed order, then the buyer sees whether they were charged.",
    ],
    groupIds: ["g-web-failed"],
  },
  {
    id: "wo-secret",
    title: "Take the payment gateway password out of the code, and rotate it",
    priority: "p0",
    description:
      "Read it from the environment, and rotate it at the gateway: it is in the history.",
    acceptanceCriteria: [
      "No secret is found in the code by a secret scan.",
      "The old password no longer works at the gateway.",
    ],
    groupIds: ["secret-1"],
  },
  {
    id: "wo-decide",
    title: "Decide refunds and the limit on sign-in attempts",
    priority: "p2",
    description:
      "Two things the design does not say: how money is given back, and how many wrong passwords are allowed.",
    acceptanceCriteria: [
      "The requirement states how a refund is made.",
      "The requirement states the limit on sign-in attempts.",
    ],
    groupIds: ["g-bill-refund", "g-auth-lockout"],
  },
];

const MODEL: DesignModel = {
  summary:
    "An online shop. A buyer signs in, searches the catalog and places an order in the web frontend. Requests go through a gateway to the auth, catalog and orders services. Orders charges the card through billing and announces the order, and a worker emails the buyer.",
  roles: [
    {
      id: "role-buyer",
      name: "Buyer",
      description:
        "A signed-in customer who searches, orders and reads their orders.",
      source: "stated",
    },
    {
      id: "role-visitor",
      name: "Visitor",
      description: "Someone who has not signed in.",
      source: "assumed",
    },
  ],
  entities: [
    {
      id: "ent-product",
      name: "Product",
      description: "Something for sale, with a name and a price.",
      fields: ["id", "name", "price"],
      limit: null,
      source: "stated",
    },
    {
      id: "ent-order",
      name: "Order",
      description: "The items a buyer bought and what they paid.",
      fields: ["user_id", "items", "total"],
      limit: null,
      source: "stated",
    },
    {
      id: "ent-session",
      name: "Session",
      description: "A signed-in buyer's token.",
      fields: ["token", "userId"],
      limit: null,
      source: "stated",
    },
  ],
  operations: [
    {
      id: "op-sign-in",
      name: "Sign in",
      description: "Checks an email and password and opens a session.",
      entityIds: ["ent-session"],
      preconditions: [],
      effects: ["A session is opened."],
      failureBehaviour: "A wrong email or password is answered with 401.",
      source: "stated",
    },
    {
      id: "op-search",
      name: "Search products",
      description: "Finds products by name.",
      entityIds: ["ent-product"],
      preconditions: [],
      effects: [],
      failureBehaviour: null,
      source: "stated",
    },
    {
      id: "op-place-order",
      name: "Place an order",
      description:
        "Charges the buyer's card, saves the order and announces it.",
      entityIds: ["ent-order"],
      preconditions: ["The buyer is signed in."],
      effects: [
        "The card is charged.",
        "An order is saved.",
        "An email is sent.",
      ],
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
      operationId: "op-sign-in",
      roleId: "role-visitor",
      effect: "allow",
      condition: null,
      source: "stated",
    },
    {
      operationId: "op-search",
      roleId: "role-visitor",
      effect: "allow",
      condition: null,
      source: "stated",
    },
    {
      operationId: "op-search",
      roleId: "role-buyer",
      effect: "allow",
      condition: null,
      source: "stated",
    },
    {
      operationId: "op-place-order",
      roleId: "role-buyer",
      effect: "allow",
      condition: null,
      source: "stated",
    },
  ],
  rules: [
    {
      id: "rule-own-orders",
      kind: "security",
      statement: "A buyer sees only their own orders.",
      source: "assumed",
    },
  ],
  journeys: [
    {
      id: "jrn-checkout",
      name: "Sign in, search and check out",
      roleId: "role-buyer",
      operationIds: ["op-sign-in", "op-search", "op-place-order"],
      source: "stated",
    },
  ],
};

interface SampleRemediation {
  service: SampleService;
  summary: string;
  steps: string[];
  cwe: string;
  owasp: string;
  /** Paths inside the service's repository; lines match samples/storefront. */
  edits: {
    path: string;
    startLine: number;
    endLine: number;
    before: string;
    after: string;
  }[];
  notes: string[];
}

/** Remediations for the security findings, by group id. */
const REMEDIATIONS: Record<string, SampleRemediation> = {
  "g-web-token": {
    service: "web",
    summary:
      "The session token is kept in local storage, where any script on the page can read it. One cross-site scripting flaw anywhere in the shop is then enough to take every buyer's session.",
    steps: [
      "Have the auth service set the session as a cookie with HttpOnly, Secure and SameSite=Lax.",
      "Stop storing the token in the frontend: remove saveSession and sessionToken from web/src/session.ts.",
      'Send requests with credentials: "include" instead of an Authorization header in web/src/api.ts.',
    ],
    cwe: "CWE-922",
    owasp: "A07:2021 Identification and Authentication Failures",
    edits: [
      {
        path: "src/session.ts",
        startLine: 1,
        endLine: 7,
        before:
          'export function saveSession(token: string) {\n  localStorage.setItem("token", token);\n}\n\nexport function sessionToken(): string | null {\n  return localStorage.getItem("token");\n}',
        after:
          "// The session lives in an HttpOnly cookie set by the auth service.\n// Scripts on the page cannot read it, so nothing is stored here.\nexport function sessionToken(): null {\n  return null;\n}",
      },
    ],
    notes: [
      "The auth service must set the cookie; that change is in storefront-auth.",
    ],
  },
  "g-web-xss": {
    service: "web",
    summary:
      "Search results write each product name into the page as HTML. A product named with a script tag runs that script in every buyer's browser who searches for it.",
    steps: [
      "Write the name as text with textContent instead of innerHTML in web/src/search.ts.",
    ],
    cwe: "CWE-79",
    owasp: "A03:2021 Injection",
    edits: [
      {
        path: "src/search.ts",
        startLine: 8,
        endLine: 8,
        before: "    row.innerHTML = product.name;",
        after: "    row.textContent = product.name;",
      },
    ],
    notes: [],
  },
  "g-gw-identity": {
    service: "gateway",
    summary:
      "The gateway takes the user's id from the X-User-Id header, which any caller can set, and passes it on as the authenticated user. Anyone can act as any buyer.",
    steps: [
      "Resolve the user from the session with the auth service on every order request.",
      "Drop X-User-Id and X-Authenticated-User from incoming requests before setting your own.",
      "Answer 401 when there is no valid session.",
    ],
    cwe: "CWE-290",
    owasp: "A01:2021 Broken Access Control",
    edits: [
      {
        path: "main.go",
        startLine: 14,
        endLine: 15,
        before:
          '\t\tuserID := r.Header.Get("X-User-Id")\n\t\tr.Header.Set("X-Authenticated-User", userID)',
        after:
          '\t\tr.Header.Del("X-User-Id")\n\t\tuserID, err := userFromSession(r)\n\t\tif err != nil {\n\t\t\thttp.Error(w, "sign in first", http.StatusUnauthorized)\n\t\t\treturn\n\t\t}\n\t\tr.Header.Set("X-Authenticated-User", userID)',
      },
    ],
    notes: [
      "userFromSession calls the auth service's token lookup; add it next to proxy in proxy.go.",
    ],
  },
  "g-auth-md5": {
    service: "auth",
    summary:
      "Passwords are hashed with MD5 and no salt. Anyone with a copy of the users table can recover most passwords in minutes with ready-made tables.",
    steps: [
      "Hash new passwords with scrypt from node:crypto, with a random salt per password.",
      "At each sign-in, if the stored hash is an old MD5 one, check it, then store the scrypt hash instead.",
      "After 90 days, force a reset for accounts still on MD5.",
    ],
    cwe: "CWE-916",
    owasp: "A02:2021 Cryptographic Failures",
    edits: [
      {
        path: "src/password.ts",
        startLine: 1,
        endLine: 5,
        before:
          'import { createHash } from "node:crypto";\n\nexport function hashPassword(password: string): string {\n  return createHash("md5").update(password).digest("hex");\n}',
        after:
          'import { randomBytes, scryptSync } from "node:crypto";\n\nexport function hashPassword(password: string): string {\n  const salt = randomBytes(16).toString("hex");\n  const hash = scryptSync(password, salt, 64).toString("hex");\n  return `scrypt$${salt}$${hash}`;\n}',
      },
    ],
    notes: [
      "login.ts compares hashes directly; it must verify with the stored salt instead (timingSafeEqual).",
    ],
  },
  "g-auth-expiry": {
    service: "auth",
    summary:
      "A session is stored with no expiry and nothing ends it, so a stolen token works for ever.",
    steps: [
      "Store an expiry with each session, for example 12 hours.",
      "Refuse a token whose session has expired in userOf.",
      "Add a sign-out that deletes the session.",
    ],
    cwe: "CWE-613",
    owasp: "A07:2021 Identification and Authentication Failures",
    edits: [
      {
        path: "src/session.ts",
        startLine: 7,
        endLine: 7,
        before: "  await sessions.insert({ token, userId });",
        after:
          "  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);\n  await sessions.insert({ token, userId, expiresAt });",
      },
    ],
    notes: [
      "The sessions table needs an expires_at column, and userOf must check it.",
    ],
  },
  "g-cat-sqli": {
    service: "catalog",
    summary:
      "The search text is joined into the SQL string, so a buyer can read or change any table through the search box.",
    steps: [
      "Pass the search text as a query parameter, with the wildcards added to the value, not to the SQL.",
    ],
    cwe: "CWE-89",
    owasp: "A03:2021 Injection",
    edits: [
      {
        path: "search.py",
        startLine: 5,
        endLine: 6,
        before:
          '    sql = "SELECT id, name, price FROM products WHERE name LIKE \'%" + query + "%\'"\n    return catalog_db.execute(sql).fetchall()',
        after:
          '    sql = "SELECT id, name, price FROM products WHERE name LIKE %s"\n    return catalog_db.execute(sql, ("%" + query + "%",)).fetchall()',
      },
    ],
    notes: [],
  },
  "g-ord-price": {
    service: "orders",
    summary:
      "The order total comes from the request body, and the card is charged that amount. A buyer can set their own price.",
    steps: [
      "Work the total out on the server from the items and the catalog's stored prices.",
      "Ignore any total the client sends.",
    ],
    cwe: "CWE-602",
    owasp: "A04:2021 Insecure Design",
    edits: [
      {
        path: "orders.py",
        startLine: 7,
        endLine: 7,
        before: '    total = body["total"]',
        after:
          '    total = sum(price_of(item["product_id"]) * item["quantity"] for item in body["items"])',
      },
    ],
    notes: [
      "price_of reads the catalog's price; import it from the catalog client.",
    ],
  },
  "g-ord-list": {
    service: "orders",
    summary:
      "The list of orders returns every order to whoever asks, and all of them at once.",
    steps: [
      "Filter by the asking user's id.",
      "Return one page at a time, with a limit and a cursor.",
    ],
    cwe: "CWE-639",
    owasp: "A01:2021 Broken Access Control",
    edits: [
      {
        path: "orders.py",
        startLine: 14,
        endLine: 15,
        before: "def list_orders(user_id):\n    return orders.find_all()",
        after:
          "def list_orders(user_id, limit=50, after=None):\n    return orders.find_by_user(user_id, limit=min(limit, 100), after=after)",
      },
    ],
    notes: [],
  },
  "g-bill-log": {
    service: "billing",
    summary:
      "Every charge writes the full card number to the log, so anyone who can read logs can read cards. That also puts the logs in scope for PCI DSS.",
    steps: [
      "Log a reference to the charge, never the card number.",
      "Remove card numbers from the logs kept so far, and from any log index.",
    ],
    cwe: "CWE-532",
    owasp: "A09:2021 Security Logging and Monitoring Failures",
    edits: [
      {
        path: "charge.go",
        startLine: 11,
        endLine: 11,
        before: '\tlog.Printf("charging card %s for %d", card, amount)',
        after:
          '\tlog.Printf("charging card ending %s for %d", last4(card), amount)',
      },
    ],
    notes: ["last4 returns the last four digits; add it in charge.go."],
  },
  "secret-1": {
    service: "billing",
    summary:
      "The payment gateway's password is written into the code. Anyone who can read the repository, or its history, can charge cards as this service.",
    steps: [
      "Read the password from the environment (or a secret store) at start.",
      "Rotate the password at the payment gateway now: it is in the history.",
      "Add a secret scan to the pipeline so it does not happen again.",
    ],
    cwe: "CWE-798",
    owasp: "A07:2021 Identification and Authentication Failures",
    edits: [
      {
        path: "charge.go",
        startLine: 3,
        endLine: 6,
        before: 'import (\n\t"log"\n\t"net/http"\n)',
        after: 'import (\n\t"log"\n\t"net/http"\n\t"os"\n)',
      },
      {
        path: "charge.go",
        startLine: 17,
        endLine: 17,
        before: 'var gatewayPassword = "b1ll1ng-gateway-2026"',
        after: 'var gatewayPassword = os.Getenv("PAYMENT_GATEWAY_PASSWORD")',
      },
    ],
    notes: [
      "Rotating the password is the part that matters: removing it from the code does not remove it from the history.",
    ],
  },
};

export interface SampleWorkspace {
  /** The workspace's name in the project: the first part of its paths. */
  name: string;
  /** The sample service its repository is, or null when it is not one. */
  service: SampleService | null;
}

/**
 * Flutter's chains on Storefront: issues filed alone that an attacker uses
 * one after another. Each step between links cites real lines, which the
 * run checks like any other.
 */
const CHAINS: {
  title: string;
  impact: string;
  severity: Severity;
  links: {
    groupId: string;
    role: string;
    via: {
      how: string;
      service: SampleService;
      path: string;
      startLine: number;
      endLine: number;
    } | null;
  }[];
}[] = [
  {
    title: "Take over an account for good",
    impact:
      "Anyone who gets a shopper to run one crafted search can read their session token, and use the account for as long as they like.",
    severity: "critical",
    links: [
      {
        groupId: "g-cat-sqli",
        role: "Search text is joined into SQL, so a crafted search makes the catalog return any text as a product name.",
        via: null,
      },
      {
        groupId: "g-web-xss",
        role: "The shop writes each product name into the page as HTML, so that text runs as a script in the shopper's browser.",
        via: {
          how: "The shop shows whatever the catalog's search returns.",
          service: "web",
          path: "src/search.ts",
          startLine: 4,
          endLine: 5,
        },
      },
      {
        groupId: "g-web-token",
        role: "The session token sits in local storage, where any script on the page can read it.",
        via: {
          how: "Any code on the page can ask for the token.",
          service: "web",
          path: "src/session.ts",
          startLine: 5,
          endLine: 7,
        },
      },
      {
        groupId: "g-auth-expiry",
        role: "Sessions never expire and cannot be ended, so the stolen token works for good.",
        via: {
          how: "Auth accepts a token for as long as its row exists.",
          service: "auth",
          path: "src/session.ts",
          startLine: 11,
          endLine: 14,
        },
      },
    ],
  },
  {
    title: "Charge any customer any amount",
    impact:
      "Anyone can place an order as another customer at a price they choose, and that customer is charged for it.",
    severity: "critical",
    links: [
      {
        groupId: "g-gw-identity",
        role: "The gateway takes the user from a header the caller sets, so any caller can act as any customer.",
        via: null,
      },
      {
        groupId: "g-ord-price",
        role: "Orders charges whatever total the request carries.",
        via: {
          how: "Orders charges the user the gateway passed on, with the total from the request body.",
          service: "orders",
          path: "orders.py",
          startLine: 6,
          endLine: 8,
        },
      },
    ],
  },
];

/**
 * The Dogfight on the catalog's SQL injection: the run's own fix makes the
 * search text a parameter; the attacker shows, on the fixed code, that its
 * wildcards and length still let one search scan the whole table; the
 * second fix escapes them and caps both, and holds. Every line is real.
 */
function catalogDuel(
  path: string,
): NonNullable<NonNullable<Script["kinds"]>["duels"]>[string] {
  return [
    {
      defence: {
        summary:
          "Pass the search text as a query parameter, with the wildcards added to the value, not to the SQL.",
        steps: ["Pass the search text as a parameter."],
        cwe: "CWE-89",
        owasp: "A03:2021 Injection",
        edits: [
          {
            path,
            startLine: 5,
            endLine: 6,
            before:
              '    sql = "SELECT id, name, price FROM products WHERE name LIKE \'%" + query + "%\'"\n    return catalog_db.execute(sql).fetchall()',
            after:
              '    sql = "SELECT id, name, price FROM products WHERE name LIKE %s"\n    return catalog_db.execute(sql, ("%" + query + "%",)).fetchall()',
          },
        ],
        notes: [],
      },
      attack: {
        verdict: "through",
        title: "Wildcards still reach the query",
        how: "The search text is a parameter now, but % and _ in it are still wildcards, and nothing limits its length or the rows sent back: one search can make the database compare every product the slow way and return the whole table.",
        path,
        startLine: 5,
        endLine: 6,
      },
    },
    {
      defence: {
        summary:
          "Escape the wildcards in the search text, cut it to 100 characters, and return at most 50 rows.",
        steps: [
          "Escape backslash, % and _ in the search text, and tell the database the escape character.",
          "Cut the search text to 100 characters.",
          "Return at most 50 rows.",
        ],
        cwe: "CWE-400",
        owasp: "A04:2021 Insecure Design",
        edits: [
          {
            path,
            startLine: 4,
            endLine: 6,
            before:
              'def search(query):\n    sql = "SELECT id, name, price FROM products WHERE name LIKE %s"\n    return catalog_db.execute(sql, ("%" + query + "%",)).fetchall()',
            after:
              'def search(query):\n    text = query[:100].replace("\\\\", "\\\\\\\\").replace("%", "\\\\%").replace("_", "\\\\_")\n    sql = "SELECT id, name, price FROM products WHERE name LIKE %s ESCAPE \'\\\\\' LIMIT 50"\n    return catalog_db.execute(sql, ("%" + text + "%",)).fetchall()',
          },
        ],
        notes: [],
      },
      attack: {
        verdict: "held",
        title: "No way past the fix",
        how: "The search text is a parameter, its wildcards are escaped, it is cut to 100 characters, and at most 50 rows come back.",
        path: null,
        startLine: null,
        endLine: null,
      },
    },
  ];
}

export function sampleProjectScript(workspaces: SampleWorkspace[]): Script {
  const single = workspaces.length === 1;
  const nameOf = new Map<SampleService, string>();
  for (const workspace of workspaces) {
    if (workspace.service && !nameOf.has(workspace.service)) {
      nameOf.set(workspace.service, workspace.name);
    }
  }
  const has = (service: SampleService) => nameOf.has(service);
  const pathOf = (service: SampleService, path: string) =>
    single ? path : `${nameOf.get(service)}/${path}`;

  const findings = FINDINGS.filter(
    (item) => has(item.service) && (item.needs ?? []).every(has),
  );

  // An agent's findings are numbered in the order it files them.
  const uids = new Map<string, string>();
  const tools: NonNullable<Script["tools"]> = {};
  for (const item of findings) {
    const steps = (tools[item.agent] ??= []);
    const path = pathOf(item.service, item.path);
    const read = {
      tool: "read_file",
      input: { path, startLine: 0, endLine: 0 },
    };
    const last = steps.findLast((step) => step.tool === "read_file");
    if (JSON.stringify(last) !== JSON.stringify(read)) steps.push(read);
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
  const groupIds = new Set(groups.map((group) => group.id));
  // The secret in billing is found by code, not by the judge.
  if (has("billing")) groupIds.add("secret-1");
  const rejected = Object.entries(REJECTED).flatMap(([key, reason]) =>
    uids.has(key) ? [{ findingId: uids.get(key)!, reason }] : [],
  );

  // The architecture: in a project each service is one component; alone, a
  // service is shown as its parts, and the services it calls as outside
  // systems.
  const present = SAMPLE_SERVICES.filter(has);
  const idOf = (end: string) =>
    SAMPLE_SERVICES.includes(end as SampleService) ? `cmp-${end}` : end;
  const calls = CALLS.filter((call) => has(call.from));
  const reached = new Set(calls.map((call) => call.to));
  const components: Architecture["components"] = [];
  for (const service of present) {
    const info = SERVICES[service];
    if (single) {
      components.push(
        ...info.parts.map((part) => ({ ...part, workspace: null })),
      );
    } else {
      components.push({
        id: `cmp-${service}`,
        name: info.name,
        kind: info.kind,
        workspace: nameOf.get(service)!,
        paths: [nameOf.get(service)!],
        description: info.description,
      });
    }
  }
  for (const service of SAMPLE_SERVICES) {
    if (has(service) || !reached.has(service)) continue;
    components.push({
      id: `cmp-${service}`,
      name: SERVICES[service].name,
      kind: "external",
      workspace: null,
      paths: [],
      description: `${SERVICES[service].description} Its code is not part of this run.`,
    });
  }
  for (const outside of OUTSIDE) {
    if (reached.has(outside.id)) {
      components.push({ ...outside, workspace: null, paths: [] });
    }
  }
  const connections = calls.map((call) => ({
    // Alone, a service's calls leave from its first part.
    from: single ? SERVICES[call.from].parts[0].id : `cmp-${call.from}`,
    to: idOf(call.to),
    label: call.label,
  }));
  if (single && present[0]) {
    const [first, ...rest] = SERVICES[present[0]].parts;
    connections.unshift(
      ...rest.map((part) => ({
        from: first.id,
        to: part.id,
        label: "imports",
      })),
    );
  }

  const ok = <T>(value: T) => ({ kind: "ok" as const, value });
  const empty = ok({ scenarios: [], findings: [] });
  const remediations = Object.fromEntries(
    Object.entries(REMEDIATIONS)
      .filter(([, item]) => has(item.service))
      .map(([id, { service, edits, ...answer }]) => [
        id,
        ok({
          ...answer,
          edits: edits.map((edit) => ({
            ...edit,
            path: pathOf(service, edit.path),
          })),
        }),
      ]),
  );
  const chains = CHAINS.filter((chain) =>
    chain.links.every(
      (link) =>
        groupIds.has(link.groupId) && (!link.via || has(link.via.service)),
    ),
  ).map((chain) => ({
    ...chain,
    links: chain.links.map(({ via, ...link }) => ({
      ...link,
      via: via
        ? {
            how: via.how,
            path: pathOf(via.service, via.path),
            startLine: via.startLine,
            endLine: via.endLine,
          }
        : null,
    })),
  }));
  const engineOut = engineOutScripts(has, pathOf, single);
  const firstPath = present[0] ? pathOf(present[0], "README.md") : "README.md";
  return {
    model: ok(MODEL),
    architecture: { components, connections },
    agents: {
      normal_user: empty,
      adversarial_user: empty,
      chaos: empty,
      scale: empty,
      product_critic: empty,
    },
    tools: {
      model: [
        { tool: "list_files", input: { path: "" } },
        {
          tool: "read_file",
          input: { path: firstPath, startLine: 0, endLine: 0 },
        },
      ],
      ...tools,
      ...engineOut.tools,
      ...(has("catalog")
        ? Object.fromEntries(
            [1, 2].map((n) => [
              `duel:g-cat-sqli:${n}:attack`,
              [
                {
                  tool: "read_file",
                  input: {
                    path: pathOf("catalog", "search.py"),
                    startLine: 0,
                    endLine: 0,
                  },
                },
              ],
            ]),
          )
        : {}),
    },
    challenges: {},
    remediations,
    kinds: {
      chains: { chains },
      cascades: engineOut.cascades,
      ...(has("catalog")
        ? {
            duels: {
              "g-cat-sqli": catalogDuel(pathOf("catalog", "search.py")),
            },
          }
        : {}),
    },
    judge: ok({ groups, rejected }),
    work_orders: ok({
      workOrders: WORK_ORDERS.map((order) => ({
        ...order,
        groupIds: order.groupIds.filter((id) => groupIds.has(id)),
      })).filter((order) => order.groupIds.length > 0),
    }),
  };
}
