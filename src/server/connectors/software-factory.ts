import { termsFor } from "@/lib/labels";
import { toUnifiedDiff } from "@/lib/patch";

import { workspaceOf } from "../engine/architecture";
import type { Finding, RunRecord, WorkOrder } from "../engine/schema";
import { ConnectorError, callTool, withMcp, type McpTarget } from "./mcp";
import { getConnection } from "./store";

/*
 * 8090 Software Factory, reached through its MCP server. A Windtunnel work
 * order becomes a work order there, made with the server's `create_item`
 * tool. The workspaces its findings are in become labels.
 */

export const SOFTWARE_FACTORY = "software-factory";
const HOST = "api.factory.8090.dev";

/**
 * Checks a connector URL. Software Factory gives one per organization
 * (8090: Settings → MCP Server → Connector URL). Only its own API host is
 * accepted, so the sign-in's tokens can never be sent anywhere else.
 */
export function parseConnectorUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.host !== HOST) return null;
    if (!/^\/v\d+\/mcp(\/|$)/.test(url.pathname)) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** The organization's MCP server. */
export function softwareFactoryTarget(mcpUrl: string): McpTarget {
  return { provider: SOFTWARE_FACTORY, url: mcpUrl, headers: {} };
}

/** The label every work order from Windtunnel carries. */
export const ORIGIN_LABEL = "windtunnel";
/** Marks a work order proposed from a requirement run. */
export const PROPOSAL_LABEL = "proposal";

const PRIORITY = { p0: "urgent", p1: "high", p2: "medium", p3: "low" } as const;

/** What `create_item` is given for one work order. */
export interface FactoryWorkOrder {
  entity_type: "work_order";
  title: string;
  description: string;
  type: "fix" | "requirements";
  status: "backlog";
  priority: (typeof PRIORITY)[keyof typeof PRIORITY];
  label_titles: string[];
}

/** Turns one of a run's work orders into a Software Factory work order. */
export function toFactoryWorkOrder(
  run: RunRecord,
  workOrder: WorkOrder,
): FactoryWorkOrder {
  const groups = run.groups.filter((group) =>
    workOrder.groupIds.includes(group.id),
  );
  const findings = new Map<string, Finding>(
    run.agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, finding] as const),
    ),
  );
  // A group's code: its findings' places, or its own for one found by code.
  const citedBy = (group: (typeof groups)[number]) => {
    const places = group.findingIds.flatMap(
      (uid) => findings.get(uid)?.location ?? [],
    );
    return places.length > 0 || !group.location ? places : [group.location];
  };

  // The workspaces of the code the settled findings cite. A project of one
  // workspace has no workspace in its paths: the run's own name is used.
  const names = run.source?.workspaces?.map((item) => item.name) ?? [];
  const workspaces = new Set<string>();
  for (const group of groups) {
    for (const location of citedBy(group)) {
      const name =
        names.length > 0
          ? workspaceOf(location.path, names)
          : (run.workspaces?.[0] ?? null);
      if (name) workspaces.add(name);
    }
  }

  // A requirement run tests an idea: its work orders are proposals.
  const proposal = !run.source;
  // Something to build or repair, or something the design must still say.
  const repair =
    !proposal &&
    groups.some(
      (group) =>
        group.type === "security_vulnerability" ||
        group.type === "architecture_weakness",
    );

  const lines = [
    ...(proposal
      ? [
          "> Proposed from a requirement run: nothing is built yet, so the risks below are probable, not defects.",
          "",
        ]
      : []),
    "## Summary",
    "",
    workOrder.description,
    "",
    "## Acceptance criteria",
    "",
    ...workOrder.acceptanceCriteria.map((criterion) => `- ${criterion}`),
  ];
  if (groups.length > 0) {
    lines.push(
      "",
      proposal ? "## Probable risks this settles" : "## Findings this settles",
      "",
    );
    for (const group of groups) {
      const [first] = citedBy(group);
      const where = first ? ` (\`${first.path}:${first.startLine}\`)` : "";
      lines.push(
        `- **${termsFor(proposal).severity(group.severity)}: ${group.title}.** ${group.summary}${where}`,
      );
    }
  }
  // How to fix the security findings it settles, checked against the code.
  const fixes = groups.flatMap((group) => {
    const record = run.remediations?.[group.id];
    return record?.status === "made" ? [{ group, record }] : [];
  });
  if (fixes.length > 0) {
    lines.push("", proposal ? "## Suggested changes" : "## Remediation");
    for (const { group, record } of fixes) {
      lines.push("", `### ${group.title}`, "");
      const refs = [
        record.cwe
          ? `[${record.cwe.id} ${record.cwe.name}](${record.cwe.url})`
          : null,
        record.owasp
          ? `[OWASP ${record.owasp.id} ${record.owasp.name}](${record.owasp.url})`
          : null,
      ].filter(Boolean);
      if (refs.length > 0) lines.push(refs.join(" · "), "");
      lines.push(record.summary);
      if (record.steps.length > 0) {
        lines.push(
          "",
          ...record.steps.map((step, index) => `${index + 1}. ${step}`),
        );
      }
      const diff = toUnifiedDiff(record.edits);
      if (diff) {
        lines.push(
          "",
          "Suggested patch (checked against the code, not applied):",
          "",
          "```diff",
          diff.trimEnd(),
          "```",
        );
      }
      if (record.notes.length > 0) {
        lines.push("", ...record.notes.map((note) => `- ${note}`));
      }
    }
  }
  lines.push(
    "",
    "---",
    `Created by Windtunnel from the run "${run.title}" (${run.id}), work order ${workOrder.id}.`,
  );

  return {
    entity_type: "work_order",
    title: workOrder.title,
    description: lines.join("\n"),
    type: repair ? "fix" : "requirements",
    status: "backlog",
    priority: PRIORITY[workOrder.priority],
    // Software Factory keeps a label to 50 characters.
    label_titles: [
      ORIGIN_LABEL,
      ...(proposal ? [PROPOSAL_LABEL] : []),
      ...workspaces,
    ].map((title) => title.slice(0, 50)),
  };
}

/** Where work orders are sent. The real one is Software Factory over MCP. */
export interface Outbox {
  /** Makes sure these labels exist in the outside project. */
  ensureLabels(titles: string[]): Promise<void>;
  create(
    workOrder: FactoryWorkOrder,
  ): Promise<{ externalId: string | null; url: string | null }>;
}

/** Finds the first value under any of these keys, however deep. */
function pick(data: unknown, keys: string[]): string | null {
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  for (const value of Object.values(record)) {
    const found = pick(value, keys);
    if (found !== null) return found;
  }
  return null;
}

/** The connector URL saved in Settings, or a reason there is none. */
async function connectorUrl(): Promise<string> {
  const { mcpUrl } = (await getConnection(SOFTWARE_FACTORY)).settings;
  if (typeof mcpUrl !== "string") {
    throw new ConnectorError(
      "No connector URL is saved. Add it on the Connectors page.",
    );
  }
  return mcpUrl;
}

export interface FactoryProject {
  id: string;
  name: string;
}

/** Reads `id` and `name` pairs out of whatever shape the server answers in. */
function projectsIn(data: unknown, found: FactoryProject[] = []) {
  if (Array.isArray(data)) {
    for (const item of data) projectsIn(item, found);
  } else if (data !== null && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const id = record.id ?? record.project_id;
    if (typeof id === "string" && typeof record.name === "string") {
      if (!found.some((item) => item.id === id)) {
        found.push({ id, name: record.name });
      }
    } else {
      for (const value of Object.values(record)) projectsIn(value, found);
    }
  }
  return found;
}

/**
 * Software Factory answers `list_projects` in plain text, one project to a
 * line: "name (id); repositories: …".
 */
export function projectsInText(text: string): FactoryProject[] {
  return [...text.matchAll(/^(.+?) \(([0-9a-f]{8}-[0-9a-f-]{27})\)/gim)].map(
    ([, name, id]) => ({ id, name: name.trim() }),
  );
}

/** The Software Factory projects the signed-in person can use. */
export async function listFactoryProjects(): Promise<{
  projects: FactoryProject[];
  /** The server's own words, for when its answer could not be read. */
  raw: string;
}> {
  return withMcp(
    softwareFactoryTarget(await connectorUrl()),
    async (client) => {
      const projects: FactoryProject[] = [];
      let raw = "";
      for (let page = 1; page <= 10; page += 1) {
        const { data, text } = await callTool(client, "list_projects", {
          page,
        });
        raw = raw || text;
        const before = projects.length;
        projectsIn(data, projects);
        for (const found of projectsInText(text)) {
          if (!projects.some((item) => item.id === found.id)) {
            projects.push(found);
          }
        }
        if (projects.length === before) break;
      }
      return { projects, raw };
    },
  );
}

/**
 * Whether a label is in `list_item_labels`' answer. Software Factory writes
 * it as text, one label to a line: "windtunnel  [purple]".
 */
export function labelListed(
  title: string,
  data: unknown,
  text: string,
): boolean {
  const wanted = title.toLowerCase();
  if (
    JSON.stringify(data ?? "")
      .toLowerCase()
      .includes(`"${wanted}"`)
  ) {
    return true;
  }
  return text.split("\n").some(
    (line) =>
      line
        .trim()
        .toLowerCase()
        .replace(/\s+\[[a-z]+\]$/, "") === wanted,
  );
}

/** Opens Software Factory for one project and hands over an outbox. */
export async function withSoftwareFactory<T>(
  projectId: string,
  work: (outbox: Outbox) => Promise<T>,
): Promise<T> {
  return withMcp(softwareFactoryTarget(await connectorUrl()), (client) =>
    work({
      async ensureLabels(titles) {
        for (const title of titles) {
          const { data, text } = await callTool(client, "list_item_labels", {
            project_id: projectId,
            title,
            page_size: 100,
          });
          if (labelListed(title, data, text)) continue;
          try {
            await callTool(client, "create_item_label", {
              project_id: projectId,
              title,
              color: title === ORIGIN_LABEL ? "purple" : "gray",
            });
          } catch (error) {
            // Made meanwhile, or listed in a way not read above: it exists.
            if (!/already exists|409/i.test(String(error))) throw error;
          }
        }
      },
      async create(workOrder) {
        const { data, text } = await callTool(client, "create_item", {
          project_id: projectId,
          ...workOrder,
        });
        if (data === null && !text.trim()) {
          throw new ConnectorError("Software Factory gave no answer.");
        }
        const number = pick(data, ["display_number", "number", "display_id"]);
        return {
          externalId:
            number ??
            pick(data, ["id", "work_order_id"]) ??
            /\bWO-\d+\b/.exec(text)?.[0] ??
            null,
          url: pick(data, ["url", "web_url", "link"]),
        };
      },
    }),
  );
}
