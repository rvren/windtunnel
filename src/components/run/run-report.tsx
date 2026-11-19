import { InfoTip } from "@/components/info-tip";
import { Pager } from "@/components/pager";
import { usePage } from "@/hooks/use-page";
import { RunTrace } from "@/components/tuff/run-trace";
import {
  DeliveryStrip,
  DeliveryTag,
  useDeliveries,
} from "@/components/connectors/deliveries";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { agentById } from "@/lib/agents";
import { GAP_KIND_LABEL, STAGE_LABEL, STAGE_ORDER } from "@/lib/labels";
import type { ExplainKey } from "@/lib/explain";
import { cn } from "@/lib/utils";
import { traceSpans } from "@/lib/viz/run";
import type { RunTimes } from "@/lib/viz/times";
import type {
  DesignModel,
  Finding,
  RunRecord,
  Scenario,
  Usage,
} from "@/server/engine/schema";

import { AgentIcon, PriorityBadge } from "./badges";

/* The four tabs of a run's report. Plain rendering of the run record. */

const agentName = (id: string) => agentById(id)?.name ?? id;
const number = (n: number) => n.toLocaleString("en");

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SectionTitle({
  children,
  count,
  about,
}: {
  children: React.ReactNode;
  count?: number;
  /** Which explanation the "i" beside the title shows. */
  about?: ExplainKey;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium">
      {children}
      {count !== undefined ? (
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      ) : null}
      {about ? (
        <InfoTip
          about={about}
          label={typeof children === "string" ? children : "this section"}
        />
      ) : null}
    </h3>
  );
}

function lookups(run: RunRecord) {
  const findings = new Map<string, Finding>(
    run.agents.flatMap((agent) =>
      agent.findings.map((finding) => [finding.uid, finding] as const),
    ),
  );
  const scenarios = new Map<string, Scenario>(
    run.agents.flatMap((agent) =>
      agent.scenarios.map(
        (scenario) => [`${agent.agentId}/${scenario.id}`, scenario] as const,
      ),
    ),
  );
  return { findings, scenarios };
}

// ── Findings ────────────────────────────────────────────────────────────────

/** Findings the judge threw out, and those the citation check dropped. */
export function NotAccepted({ run }: { run: RunRecord }) {
  const { findings } = lookups(run);
  const dropped = run.agents.flatMap((agent) => agent.dropped);
  // The judge's rejections, then the citation check's drops, one list.
  const rows = [
    ...run.rejected.map((item) => {
      const finding = findings.get(item.findingId);
      return {
        key: item.findingId,
        title: finding?.title ?? item.findingId,
        why: `${finding ? `${agentName(finding.agentId)}. ` : ""}Rejected by the judge: ${item.reason}`,
      };
    }),
    ...dropped.map((item, index) => ({
      key: `${item.agentId}-${index}`,
      title: item.title,
      why: `${agentName(item.agentId)}. Dropped by the citation check: ${item.reason}`,
    })),
  ];
  const page = usePage(rows, "", 10);
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionTitle
        count={run.rejected.length + dropped.length}
        about="rejected"
      >
        Not accepted
      </SectionTitle>
      <ul className="mt-3 divide-y rounded-card border bg-card px-4 text-sm">
        {page.items.map((row) => (
          <li key={row.key} className="py-3">
            <p className="font-medium">{row.title}</p>
            <p className="mt-0.5 text-muted-foreground">{row.why}</p>
          </li>
        ))}
      </ul>
      <Pager
        page={page}
        noun={["finding", "findings"]}
        onPage={page.setPage}
        className="mt-2 rounded-card border bg-card"
        testId="not-accepted-pager"
      />
    </section>
  );
}

// ── Work orders ─────────────────────────────────────────────────────────────

export function WorkOrdersTab({ run }: { run: RunRecord }) {
  const titles = new Map(run.groups.map((group) => [group.id, group.title]));
  // What went to 8090 Software Factory, when the run's project is linked.
  const deliveries = useDeliveries(
    run.id,
    run.status === "completed" && run.workOrders.length > 0,
  );
  const sentAs = new Map(
    deliveries.state?.deliveries.map((item) => [item.workOrderId, item]) ?? [],
  );
  // Work orders are long cards: ten to a page.
  const page = usePage(run.workOrders, "", 10);

  if (run.workOrders.length === 0) {
    return (
      <Empty>
        {run.status === "completed"
          ? run.source
            ? "No work orders: there were no accepted findings."
            : "No proposed work orders: the judge kept no risks."
          : "No work orders yet."}
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        count={run.workOrders.length}
        about={run.source ? "workOrders" : "workOrdersProbable"}
      >
        {run.source ? "Work orders" : "Proposed work orders"}
      </SectionTitle>
      <DeliveryStrip
        total={run.workOrders.length}
        sample={run.sample}
        deliveries={deliveries}
      />
      {page.items.map((workOrder) => (
        <article
          key={workOrder.id}
          className="rounded-card border bg-card p-5"
          data-testid="work-order"
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PriorityBadge priority={workOrder.priority} />
            <span className="font-mono text-xs text-muted-foreground">
              {workOrder.id}
            </span>
            <h3 className="basis-full font-medium sm:basis-auto">
              {workOrder.title}
            </h3>
            <span className="sm:ml-auto">
              <DeliveryTag delivery={sentAs.get(workOrder.id)} />
            </span>
          </header>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {workOrder.description}
          </p>
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            Acceptance criteria
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {workOrder.acceptanceCriteria.map((criterion) => (
              <li key={criterion} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span className="max-w-3xl leading-relaxed">{criterion}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted-foreground">
            Settles:{" "}
            {workOrder.groupIds.map((id) => titles.get(id) ?? id).join(" · ")}
          </p>
        </article>
      ))}
      <Pager
        page={page}
        noun={["work order", "work orders"]}
        onPage={(n) => {
          page.setPage(n);
          // Back to the top of the list, where the next page starts.
          document
            .querySelector("[data-testid=work-order]")
            ?.scrollIntoView({ block: "start", behavior: "smooth" });
        }}
        className="rounded-card border bg-card"
        testId="work-orders-pager"
      />
      {run.unaddressedGroupIds.length > 0 ? (
        <p className="text-sm text-sev-high">
          No work order covers:{" "}
          {run.unaddressedGroupIds
            .map((id) => titles.get(id) ?? id)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

// ── Design model ────────────────────────────────────────────────────────────

function SourceTag({ source }: { source: "stated" | "assumed" }) {
  return source === "assumed" ? (
    <Badge
      variant="secondary"
      title="Not in the requirement. The model added it."
    >
      Assumed
    </Badge>
  ) : null;
}

function ModelList({
  title,
  items,
}: {
  title: string;
  items: {
    id: string;
    name: string;
    detail: string;
    extra?: string;
    source: "stated" | "assumed";
  }[];
}) {
  return (
    <section>
      <SectionTitle count={items.length}>{title}</SectionTitle>
      <ul className="mt-3 divide-y rounded-card border bg-card px-4 text-sm">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {item.id}
              </span>
              <SourceTag source={item.source} />
            </p>
            <p className="mt-0.5 max-w-3xl text-muted-foreground">
              {item.detail}
            </p>
            {item.extra ? (
              <p className="mt-1 text-xs text-muted-foreground">{item.extra}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const EFFECT_STYLE = {
  allow: "text-ok",
  deny: "text-sev-critical",
  conditional: "text-sev-high",
} as const;

function PermissionMatrix({ model }: { model: DesignModel }) {
  const cell = new Map(
    model.permissions.map(
      (permission) =>
        [`${permission.operationId}|${permission.roleId}`, permission] as const,
    ),
  );
  return (
    <section>
      <SectionTitle about="permissions">Permissions</SectionTitle>
      <p className="mt-1 text-sm text-muted-foreground">
        Who may do what. A dash means the requirement does not say.
      </p>
      <div className="mt-3 overflow-hidden rounded-card border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operation</TableHead>
              {model.roles.map((role) => (
                <TableHead key={role.id}>{role.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.operations.map((operation) => (
              <TableRow key={operation.id}>
                <TableCell className="font-medium whitespace-normal">
                  {operation.name}
                </TableCell>
                {model.roles.map((role) => {
                  const permission = cell.get(`${operation.id}|${role.id}`);
                  return (
                    <TableCell key={role.id} className="whitespace-normal">
                      {permission ? (
                        <span
                          className={cn(
                            "font-mono text-xs",
                            EFFECT_STYLE[permission.effect],
                          )}
                          title={permission.condition ?? undefined}
                        >
                          {permission.effect}
                          {permission.source === "assumed" ? " (assumed)" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function ModelTab({ run }: { run: RunRecord }) {
  const model = run.designModel;
  if (!model) return <Empty>The design model has not been written yet.</Empty>;
  const coverage = run.coverage;
  const names = new Map(
    model.operations.map((operation) => [operation.id, operation.name]),
  );

  return (
    <div className="space-y-10">
      <section>
        <p className="max-w-3xl leading-relaxed">{model.summary}</p>
        {coverage ? (
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border bg-border sm:grid-cols-4">
            {[
              ["Stated", coverage.stats.statedItems],
              ["Assumed", coverage.stats.assumedItems],
              [
                "Permission rules given",
                `${coverage.stats.specifiedCells} of ${coverage.stats.permissionCells}`,
              ],
              ["Gaps found by code", coverage.gaps.length],
            ].map(([label, value]) => (
              <div key={label} className="bg-card p-4">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-lg font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {run.modelWarnings.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs text-sev-high">
            {run.modelWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <ModelList
        title="Roles"
        items={model.roles.map((role) => ({
          id: role.id,
          name: role.name,
          detail: role.description,
          source: role.source,
        }))}
      />
      <ModelList
        title="Data"
        items={model.entities.map((entity) => ({
          id: entity.id,
          name: entity.name,
          detail: entity.description,
          extra: `Limit: ${entity.limit ?? "none given"}`,
          source: entity.source,
        }))}
      />
      <ModelList
        title="Operations"
        items={model.operations.map((operation) => ({
          id: operation.id,
          name: operation.name,
          detail: operation.description,
          extra: `On failure: ${operation.failureBehaviour ?? "not given"}`,
          source: operation.source,
        }))}
      />
      <PermissionMatrix model={model} />
      <ModelList
        title="Rules"
        items={model.rules.map((rule) => ({
          id: rule.id,
          name: rule.statement,
          detail: rule.kind,
          source: rule.source,
        }))}
      />
      <ModelList
        title="Journeys"
        items={model.journeys.map((journey) => ({
          id: journey.id,
          name: journey.name,
          detail: journey.operationIds
            .map((id) => names.get(id) ?? id)
            .join(" → "),
          source: journey.source,
        }))}
      />

      {coverage && coverage.gaps.length > 0 ? (
        <section>
          <SectionTitle count={coverage.gaps.length} about="gaps">
            Gaps found by code
          </SectionTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Holes in the model that need no judgement to see. The agents used
            them as leads.
          </p>
          <ul className="mt-3 divide-y rounded-card border bg-card px-4 text-sm">
            {coverage.gaps.map((gap) => (
              <li
                key={gap.id}
                className="flex flex-wrap gap-x-3 gap-y-1 py-2.5"
              >
                <span className="w-44 shrink-0 text-xs text-muted-foreground">
                  {GAP_KIND_LABEL[gap.kind]}
                </span>
                <span className="min-w-0 flex-1 basis-64">{gap.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ── Scoreboard ──────────────────────────────────────────────────────────────

export function ScoreboardTab({
  run,
  times,
}: {
  run: RunRecord;
  times: RunTimes;
}) {
  const spans = traceSpans(run, times);
  const usage = STAGE_ORDER.flatMap((stage) => {
    const value = run.usage[stage];
    return value ? [[STAGE_LABEL[stage], value] as [string, Usage]] : [];
  });

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle about="scoreboard">Scoreboard</SectionTitle>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          An agent scores for each accepted finding it contributed to: 8 for
          critical, 5 for high, 3 for medium, 1 for low. Agents that found the
          same thing share the points. Disputing a finding that the judge then
          rejects earns 1.
        </p>
        {run.scoreboard.length === 0 ? (
          <div className="mt-3">
            <Empty>No scores yet.</Empty>
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-card border bg-card">
            <Table data-testid="scoreboard">
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Only this agent</TableHead>
                  <TableHead className="text-right">Disputes upheld</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Scenarios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.scoreboard.map((row) => (
                  <TableRow key={row.agentId}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <AgentIcon agentId={row.agentId} />
                        {agentName(row.agentId)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.points}
                    </TableCell>
                    <TableCell className="text-right">{row.accepted}</TableCell>
                    <TableCell className="text-right">{row.unique}</TableCell>
                    <TableCell className="text-right">
                      {row.upheld ?? 0}
                    </TableCell>
                    <TableCell className="text-right">{row.rejected}</TableCell>
                    <TableCell className="text-right">
                      {row.scenarios}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <SectionTitle about="timeAndTokens">Time and tokens</SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {run.sample
            ? "This is a sample run. It did not call the model, so it used no tokens."
            : `${run.models.reasoning} for the model, the judge and the work orders; ${run.models.agents} for the agents. Click a block to zoom in.`}
        </p>
        {spans.length > 0 ? (
          <div className="mt-3" data-testid="run-trace">
            <RunTrace
              className="max-w-none"
              data={{
                spans,
                elapsedMs: Math.max(0, ...spans.map((span) => span.endMs ?? 0)),
              }}
            />
          </div>
        ) : null}
        {usage.length > 0 && !run.sample ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Token counts by stage, with the cache
            </summary>
            <div className="mt-3 overflow-hidden rounded-card border bg-card">
              <Table data-testid="token-use">
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cache read</TableHead>
                    <TableHead className="text-right">Cache write</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right">
                        {number(value.inputTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {number(value.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {number(value.cacheReadTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {number(value.cacheWriteTokens)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}
