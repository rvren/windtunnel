import { agentById } from "@/lib/agents";
import {
  FINDING_TYPE_LABEL,
  FINDING_TYPE_ORDER,
  GAP_KIND_LABEL,
  OUTCOME_LABEL,
  PRIORITY_LABEL,
  RUN_STATUS_LABEL,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  STAGE_LABEL,
} from "@/lib/labels";

import {
  STAGES,
  ZERO_USAGE,
  addUsage,
  type Finding,
  type RunRecord,
} from "./schema";

/* The report as a file: Markdown for people, JSON for tools. */

const agentName = (id: string) => agentById(id)?.name ?? id;

/** "1 finding", "2 findings". */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Keeps a value on one line inside a Markdown table cell. */
const cell = (value: string) =>
  value.replace(/\|/g, "\\|").replace(/\s+/g, " ");

export function findingsByUid(run: RunRecord): Map<string, Finding> {
  return new Map(
    run.agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, finding] as const),
    ),
  );
}

export function totalUsage(run: RunRecord) {
  return STAGES.reduce(
    (sum, stage) => addUsage(sum, run.usage[stage] ?? ZERO_USAGE),
    ZERO_USAGE,
  );
}

export function runToJson(run: RunRecord): string {
  return JSON.stringify(run, null, 2);
}

export function runToMarkdown(run: RunRecord): string {
  const out: string[] = [];
  const findings = findingsByUid(run);
  const scenarios = new Map(
    run.agents.flatMap((agent) =>
      agent.scenarios.map(
        (scenario) => [`${agent.agentId}/${scenario.id}`, scenario] as const,
      ),
    ),
  );

  out.push(`# Windtunnel report: ${run.title}`, "");
  out.push(
    `Run \`${run.id}\` · ${run.createdAt} · ${RUN_STATUS_LABEL[run.status]}`,
  );
  if (run.sample) {
    out.push("", "> **Sample run.** This data did not come from the model.");
  }
  if (run.error) out.push("", `> **Error:** ${run.error}`);

  if (run.source) {
    out.push(
      "",
      `Repository: ${run.source.label} (${run.source.origin.kind === "github" ? run.source.origin.url : "local folder"})`,
    );
  }
  out.push("", "## Requirement", "");
  out.push(...run.requirement.split("\n").map((line) => `> ${line}`));
  for (const document of run.documents) {
    out.push("", `Attached: \`${document.name}\``);
  }

  out.push("", "## Summary", "");
  out.push(
    `- ${count(run.groups.length, "finding")} from ${count(findings.size, "report")} by the agents`,
  );
  for (const type of FINDING_TYPE_ORDER) {
    const count = run.groups.filter((group) => group.type === type).length;
    out.push(`  - ${FINDING_TYPE_LABEL[type]}: ${count}`);
  }
  out.push(`- ${count(run.workOrders.length, "work order")}`);
  out.push(`- ${count(run.rejected.length, "report")} rejected by the judge`);

  out.push("", "## Findings");
  for (const type of FINDING_TYPE_ORDER) {
    const groups = run.groups
      .filter((group) => group.type === type)
      .sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) -
          SEVERITY_ORDER.indexOf(b.severity),
      );
    if (groups.length === 0) continue;
    out.push("", `### ${FINDING_TYPE_LABEL[type]}`);
    for (const group of groups) {
      out.push("", `#### ${group.title}`, "");
      out.push(
        `\`${group.id}\` · ${SEVERITY_LABEL[group.severity]}${group.reviewed ? "" : " · not reviewed by the judge"}`,
        "",
        group.summary,
      );
      for (const uid of group.findingIds) {
        const finding = findings.get(uid);
        if (!finding) continue;
        out.push("", `- **${agentName(finding.agentId)}:** ${finding.title}`);
        for (const item of finding.evidence) {
          const scenario = scenarios.get(
            `${finding.agentId}/${item.scenarioId}`,
          );
          const step = scenario?.steps[item.step - 1];
          if (!scenario || !step) continue;
          out.push(
            `  - _${scenario.title}_, step ${item.step}: ${step.action} → ${OUTCOME_LABEL[step.outcome]}. ${step.detail}`,
          );
        }
        if (finding.location) {
          const { path, startLine, endLine, quote } = finding.location;
          out.push(
            `  - \`${path}:${startLine}${endLine > startLine ? `-${endLine}` : ""}\``,
            "",
            "    ```",
            ...quote.split("\n").map((line) => `    ${line}`),
            "    ```",
          );
        }
        if (finding.suggestion) {
          out.push(`  - Suggestion: ${finding.suggestion}`);
        }
        for (const challenge of run.challenges ?? []) {
          if (challenge.findingId !== uid) continue;
          out.push(
            `  - ${agentName(challenge.agentId)} ${challenge.stance === "dispute" ? "disputes" : "supports"}: ${challenge.reason}`,
          );
        }
      }
    }
  }

  out.push("", "## Work orders");
  for (const workOrder of run.workOrders) {
    out.push(
      "",
      `### ${workOrder.id}: ${workOrder.title}`,
      "",
      `Priority ${PRIORITY_LABEL[workOrder.priority]} · settles ${workOrder.groupIds.map((id) => `\`${id}\``).join(", ")}`,
      "",
      workOrder.description,
      "",
      "Acceptance criteria:",
      "",
      ...workOrder.acceptanceCriteria.map((item) => `- [ ] ${item}`),
    );
  }
  if (run.unaddressedGroupIds.length > 0) {
    out.push(
      "",
      `No work order covers: ${run.unaddressedGroupIds.map((id) => `\`${id}\``).join(", ")}.`,
    );
  }

  if (run.scoreboard.length > 0) {
    out.push(
      "",
      "## Scoreboard",
      "",
      "| Agent | Points | Accepted | Only this agent | Disputes upheld | Rejected | Scenarios |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...run.scoreboard.map(
        (row) =>
          `| ${agentName(row.agentId)} | ${row.points} | ${row.accepted} | ${row.unique} | ${row.upheld ?? 0} | ${row.rejected} | ${row.scenarios} |`,
      ),
    );
  }

  const model = run.designModel;
  if (model) {
    out.push("", "## Design model", "", model.summary);
    out.push("", "### Roles", "");
    for (const role of model.roles) {
      out.push(
        `- \`${role.id}\` **${role.name}** (${role.source}): ${role.description}`,
      );
    }
    out.push("", "### Data", "");
    for (const entity of model.entities) {
      out.push(
        `- \`${entity.id}\` **${entity.name}** (${entity.source}): ${entity.description} Limit: ${entity.limit ?? "none given"}.`,
      );
    }
    out.push("", "### Operations", "");
    for (const operation of model.operations) {
      out.push(
        `- \`${operation.id}\` **${operation.name}** (${operation.source}): ${operation.description} On failure: ${operation.failureBehaviour ?? "not given"}.`,
      );
    }
    out.push(
      "",
      "### Permissions",
      "",
      "| Operation | Role | Effect | Condition | Source |",
      "| --- | --- | --- | --- | --- |",
      ...model.permissions.map(
        (permission) =>
          `| \`${permission.operationId}\` | \`${permission.roleId}\` | ${permission.effect} | ${cell(permission.condition ?? "")} | ${permission.source} |`,
      ),
    );
    out.push("", "### Rules", "");
    for (const rule of model.rules) {
      out.push(
        `- \`${rule.id}\` (${rule.kind}, ${rule.source}): ${rule.statement}`,
      );
    }
    out.push("", "### Journeys", "");
    for (const journey of model.journeys) {
      out.push(
        `- \`${journey.id}\` **${journey.name}** as \`${journey.roleId}\` (${journey.source}): ${journey.operationIds.map((id) => `\`${id}\``).join(" → ")}`,
      );
    }
  }

  if (run.coverage) {
    out.push("", "## Coverage gaps", "");
    for (const gap of run.coverage.gaps) {
      out.push(`- \`${gap.id}\` ${GAP_KIND_LABEL[gap.kind]}: ${gap.text}`);
    }
  }

  if (run.rejected.length > 0) {
    out.push("", "## Rejected by the judge", "");
    for (const item of run.rejected) {
      const finding = findings.get(item.findingId);
      out.push(
        `- **${finding?.title ?? item.findingId}** (${agentName(finding?.agentId ?? "")}): ${item.reason}`,
      );
    }
  }

  const dropped = run.agents.flatMap((agent) => agent.dropped);
  if (dropped.length > 0) {
    out.push("", "## Dropped by the citation check", "");
    for (const item of dropped) {
      out.push(
        `- **${item.title}** (${agentName(item.agentId)}): ${item.reason}`,
      );
    }
  }

  out.push(
    "",
    "## Token use",
    "",
    "| Stage | Input | Output | Cache read | Cache write |",
    "| --- | ---: | ---: | ---: | ---: |",
  );
  for (const stage of STAGES) {
    const usage = run.usage[stage];
    if (!usage) continue;
    out.push(
      `| ${STAGE_LABEL[stage]} | ${usage.inputTokens} | ${usage.outputTokens} | ${usage.cacheReadTokens} | ${usage.cacheWriteTokens} |`,
    );
  }
  const total = totalUsage(run);
  out.push(
    `| **Total** | ${total.inputTokens} | ${total.outputTokens} | ${total.cacheReadTokens} | ${total.cacheWriteTokens} |`,
    "",
    `Models: ${run.models.reasoning} (model, judge, work orders), ${run.models.agents} (agents).`,
    "",
  );

  return out.join("\n");
}
