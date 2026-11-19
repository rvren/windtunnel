import { AGENTS, type AgentDefinition } from "@/lib/agents";
import { costOf } from "@/lib/cost";

import { normalizeArchitecture } from "./architecture";
import { remediate, scrubDeep, secretGroups } from "./remediation";
import { takeInventory } from "./repo/inventory";
import { findCoverage, modelIds, normalizeModel } from "./coverage";
import { loadExpertise } from "./expertise";
import { RunError, type LlmClient } from "./llm";
import { readProgress } from "./progress";
import { readTools, reportFindingTool } from "./repo/agent-tools";
import {
  originLabel,
  prepareRepo,
  type PreparedRepo,
  type RepoOrigin,
} from "./repo/fetch";
import {
  outline,
  surveyRepo,
  surveyWorkspaces,
  type Survey,
} from "./repo/survey";
import { RepoReader } from "./repo/tools";
import {
  AGENT_SYSTEM,
  CHALLENGE_SYSTEM,
  JUDGE_SYSTEM,
  MODEL_SYSTEM,
  REPO_AGENT_SYSTEM,
  ARCHITECTURE_SYSTEM,
  REPO_MODEL_SYSTEM,
  architecturePrompt,
  WORK_ORDER_SYSTEM,
  agentPrompt,
  agentSharedContext,
  challengePrompt,
  challengeSharedContext,
  judgePrompt,
  modelPrompt,
  repoAgentPrompt,
  repoModelPrompt,
  repoSharedContext,
  workOrderPrompt,
} from "./prompts";
import {
  AgentReport,
  Challenges,
  DesignModel,
  RepoAgentSummary,
  Architecture,
  Verdict,
  WorkOrders,
  ZERO_USAGE,
  addUsage,
  kindOf,
  stagesOf,
  type AgentRun,
  type ChangeInput,
  type RunDocument,
  type RunKind,
  type RunEvent,
  type RunRecord,
  type Scenario,
  type Stage,
  type StoredEvent,
  type OutageMode,
} from "./schema";
import { runBlackbox } from "./kinds/blackbox";
import type { KindContext } from "./kinds/context";
import { chainsStage } from "./kinds/chains";
import { runDogfight } from "./kinds/dogfight";
import { runPreflight } from "./kinds/preflight";
import { runEngineOut } from "./kinds/engineout";
import { impactStage, readChange } from "./kinds/crosswind";
import { runFlyoff } from "./kinds/flyoff";
import { changeContext } from "./kinds/prompts";
import { scoreAgents } from "./score";
import type { RunStore } from "./store";
import {
  checkAgentReport,
  checkChallenges,
  checkWorkOrders,
  reconcileVerdict,
} from "./validate";

/*
 * The orchestrator: one run, five stages.
 *
 *   model → coverage → agents (five, in parallel) → challenge → judge →
 *   work orders
 *
 * Every step is announced as an event, saved and published, so a page can
 * follow the run live and replay it after a reload.
 */

export interface EngineDeps {
  llm: LlmClient;
  store: RunStore;
  /** Hands a saved event to anyone following the run live. */
  publish: (runId: string, event: StoredEvent) => void;
  now: () => Date;
  /**
   * Stages left out of this run. Only an eval run sets it: the eval of the
   * agents does not need fixes or work orders, which cost most of a run.
   */
  skip?: ("chains" | "remediation" | "work_orders")[];
}

export interface RunInput {
  /** May be empty when a repository is given. */
  requirement: string;
  documents: RunDocument[];
  /** Set to run against code instead of a written requirement alone. */
  repository?: RepoOrigin;
  /** Set on a requirement run: the project it belongs to. */
  projectRef?: { id: string; demo: boolean };
  /** Set on a requirement run that refines an earlier one. */
  parentRunId?: string;
  /** Set to run a project's code: the chosen workspaces, read together. */
  project?: {
    id: string;
    name: string;
    workspaces: { name: string; origin: RepoOrigin }[];
    /** A demo project's runs replay a script and never call the model. */
    demo?: boolean;
  };
  /** What the run is for; an audit when left out. */
  kind?: RunKind;
  /** Crosswind: the change to trace. */
  change?: ChangeInput;
  /** Black box: the production feedback, as text. */
  incident?: string;
  /**
   * Engine Out: the part to cut, by id or name, how it fails, and the
   * part's name for the run's title when the part is given by id.
   */
  outage?: { part: string; mode: OutageMode; label?: string };
  /** Dogfight: the issue to defend, from an earlier run of the project. */
  dogfight?: { runId: string; groupId: string; label?: string };
  /** A code run's requirement run: the idea this code implements. */
  requirementRunId?: string;
}

/** A Dogfight is fought for at most this many rounds. */
const DOGFIGHT_ROUNDS = 3;

/** How many times a model may come back with tool calls in one stage. */
const MODEL_TURNS = 30;
const AGENT_TURNS = 28;

/** How often, at most, an agent's live progress is read from its stream. */
const PROGRESS_EVERY_MS = 400;

function titleOf(requirement: string): string {
  const line = requirement.trim().split("\n")[0].trim();
  return line.length > 120 ? `${line.slice(0, 117).trimEnd()}…` : line;
}

export function newRun(
  id: string,
  input: RunInput,
  models: RunRecord["models"],
  now: Date,
  sample: boolean,
): RunRecord {
  const at = now.toISOString();
  // A project with one workspace is read as a plain repository: its paths
  // need no workspace name in front.
  const project = input.project;
  const single =
    project?.workspaces.length === 1 ? project.workspaces[0].origin : undefined;
  const repository = input.repository ?? single;
  const label = project
    ? project.name
    : repository
      ? originLabel(repository)
      : null;
  const kind = input.kind ?? "audit";
  const base = project
    ? project.name
    : input.requirement.trim()
      ? titleOf(input.requirement)
      : (label ?? "");
  const change = input.change;
  const title =
    kind === "crosswind" && change
      ? titleOf(
          `Crosswind: ${
            change.kind === "text"
              ? change.text
              : change.kind === "pr"
                ? `pull request #${change.number} in ${change.workspace}`
                : `${change.head} into ${change.base} in ${change.workspace}`
          }`,
        )
      : kind === "blackbox" && input.incident
        ? titleOf(`Black box: ${input.incident}`)
        : kind === "preflight"
          ? titleOf(`Preflight: ${base}`)
          : kind === "dogfight" && input.dogfight
            ? titleOf(
                `Dogfight: ${input.dogfight.label ?? input.dogfight.groupId}`,
              )
            : kind === "engineout" && input.outage
              ? titleOf(
                  `Engine out: ${input.outage.label ?? input.outage.part} ${input.outage.mode === "slow" ? "slowed down" : "down"}`,
                )
              : kind === "flyoff"
                ? titleOf(`Fly-off: ${base}`)
                : base;
  return {
    id,
    createdAt: at,
    updatedAt: at,
    status: "running",
    stage: null,
    error: null,
    title,
    kind,
    ...(kind === "crosswind" && change
      ? {
          change: {
            input: change,
            title: change.kind === "text" ? titleOf(change.text) : "",
            url: null,
            base: change.kind === "branches" ? change.base : null,
            head: change.kind === "branches" ? change.head : null,
            files: [],
            truncated: false,
          },
        }
      : {}),
    ...(kind === "blackbox" && input.incident
      ? { incident: input.incident.trim() }
      : {}),
    ...(kind === "dogfight" && input.dogfight
      ? {
          dogfight: {
            target: {
              runId: input.dogfight.runId,
              groupId: input.dogfight.groupId,
              title: input.dogfight.label ?? "",
              summary: "",
              severity: "high" as const,
              location: null,
            },
            maxRounds: DOGFIGHT_ROUNDS,
            rounds: [],
            held: null,
          },
        }
      : {}),
    ...(kind === "engineout" && input.outage
      ? {
          outage: {
            part: {
              id: input.outage.part,
              name: input.outage.label ?? input.outage.part,
            },
            mode: input.outage.mode,
            mapFrom: null,
            headline: "",
            hops: [],
            journeys: [],
          },
        }
      : {}),
    ...(project && input.requirementRunId
      ? { requirementRunId: input.requirementRunId }
      : {}),
    ...(project
      ? { projectId: project.id }
      : input.projectRef
        ? { projectId: input.projectRef.id }
        : {}),
    ...(!project && input.parentRunId
      ? { parentRunId: input.parentRunId }
      : {}),
    ...(project
      ? { workspaces: project.workspaces.map((workspace) => workspace.name) }
      : repository
        ? { workspaces: [originLabel(repository)] }
        : {}),
    ...(label && (repository || project?.workspaces.length)
      ? {
          source: {
            kind: "repository" as const,
            origin: repository ?? project!.workspaces[0].origin,
            label,
            files: null,
            languages: [],
            ...(project && project.workspaces.length > 1
              ? {
                  workspaces: project.workspaces.map((workspace) => ({
                    ...workspace,
                    label: originLabel(workspace.origin),
                  })),
                }
              : {}),
          },
        }
      : {}),
    requirement: input.requirement.trim(),
    documents: input.documents,
    models,
    sample,
    designModel: null,
    modelWarnings: [],
    coverage: null,
    agents: AGENTS.map((agent): AgentRun => ({
      agentId: agent.id,
      status: "pending",
      scenarios: [],
      findings: [],
      dropped: [],
      usage: null,
      declinedCategory: null,
      error: null,
    })),
    challenges: [],
    groups: [],
    rejected: [],
    workOrders: [],
    unaddressedGroupIds: [],
    scoreboard: [],
    usage: {},
  };
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const declined = (what: string, category: string | null) =>
  new RunError(
    `The model declined to ${what}${category ? ` (policy category: ${category})` : ""}.`,
  );

/** Runs the whole pipeline. Never throws: a failure ends up on the run. */
export async function executeRun(
  deps: EngineDeps,
  run: RunRecord,
): Promise<RunRecord> {
  const { llm, store, publish, now } = deps;
  const skipped = new Set(deps.skip ?? []);

  // Events are saved one after another so their order on disk and on the wire
  // is the order they happened in, even with five agents talking at once.
  let seq = 0;
  let queue: Promise<void> = Promise.resolve();
  const emit = (event: RunEvent): Promise<void> => {
    const stored: StoredEvent = {
      seq: (seq += 1),
      at: now().toISOString(),
      event,
    };
    // One failed write must not stop the events behind it from being tried.
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        await store.appendEvent(run.id, stored);
        publish(run.id, stored);
      });
    return queue;
  };

  // Secrets found in the code: kept in memory to scrub what the run writes,
  // never saved.
  let secretValues: string[] = [];
  // What is saved never holds a secret found in the code, wherever it
  // turned up (a quote an agent cited, a line a patch replaces).
  const save = async () => {
    run.updatedAt = now().toISOString();
    await store.save(scrubDeep(run, secretValues));
  };

  const stage = async (name: Stage, work: () => Promise<string>) => {
    run.stage = name;
    await save();
    await emit({ type: "stage.started", stage: name });
    const summary = await work();
    await save();
    await emit({ type: "stage.completed", stage: name, summary });
  };

  // Set in a repository run, once the code is on disk and surveyed.
  const prepared: PreparedRepo[] = [];
  let repo: { reader: RepoReader; survey: Survey; outline: string } | null =
    null;

  try {
    await save();
    await emit({ type: "run.started" });
    const expertise = await loadExpertise();
    const kind = kindOf(run);
    const has = (name: Stage) => stagesOf(run).includes(name);
    const ctx: KindContext = {
      run,
      llm,
      store,
      stage,
      emit,
      save,
      plural,
      declined,
    };

    // Crosswind: read the change first; a change in code moves the survey
    // to its head.
    if (has("change")) await stage("change", () => readChange(ctx));

    // 0. Survey (repository runs only): fetch the code and list its files.
    const source = run.source;
    if (source && has("survey")) {
      await stage("survey", async () => {
        let survey: Survey;
        let reader: RepoReader;
        if (source.workspaces) {
          // A project: fetch every workspace, then read them as one.
          const roots: Record<string, string> = {};
          for (const workspace of source.workspaces) {
            const fetched = await prepareRepo(
              workspace.origin,
              `${run.id}-${workspace.name}`,
            );
            prepared.push(fetched);
            roots[workspace.name] = fetched.root;
            await emit({
              type: "workspace.ready",
              name: workspace.name,
              label: workspace.label,
            });
          }
          survey = await surveyWorkspaces(
            Object.entries(roots).map(([name, root]) => ({ name, root })),
          );
          reader = new RepoReader(roots, survey);
        } else {
          const fetched = await prepareRepo(source.origin, run.id);
          prepared.push(fetched);
          if (run.projectId && run.workspaces?.[0]) {
            await emit({
              type: "workspace.ready",
              name: run.workspaces[0],
              label: originLabel(source.origin),
            });
          }
          survey = await surveyRepo(fetched.root);
          reader = new RepoReader(fetched.root, survey);
        }
        repo = { survey, reader, outline: outline(survey) };
        // Personal data and secrets, found by name in code. No model call.
        const taken = await takeInventory(
          survey.files.filter((file) => file.readable).map((file) => file.path),
          (path) => reader.allLines(path),
        );
        run.inventory = taken.inventory;
        secretValues = taken.secretValues;
        source.files = survey.files.length;
        source.languages = survey.languages
          .slice(0, 4)
          .map((item) => item.extension);
        if (source.workspaces) {
          return `${plural(survey.files.length, "file")} in ${plural(source.workspaces.length, "workspace")}`;
        }
        return `${plural(survey.files.length, "file")}, mostly ${source.languages.slice(0, 2).join(" and ")}`;
      });
    }
    const code = repo as {
      reader: RepoReader;
      survey: Survey;
      outline: string;
    } | null;

    if (kind === "preflight") {
      if (!code) throw new RunError("A Preflight reads a project's code.");
      await runPreflight(ctx, code, expertise);
    } else if (kind === "dogfight") {
      if (!code) throw new RunError("A Dogfight reads a project's code.");
      await runDogfight(
        ctx,
        code,
        expertise.adversarial_user,
        () => secretValues,
      );
    } else if (kind === "engineout") {
      if (!code)
        throw new RunError("An Engine Out run reads a project's code.");
      await runEngineOut(ctx, code, expertise);
    } else if (kind === "blackbox") {
      if (!code) throw new RunError("A black box run reads a project's code.");
      await runBlackbox(ctx, code, () => secretValues);
    } else {
      // 1. Model: the requirement, or the code, becomes an explicit design model.
      await stage("model", async () => {
        const result = code
          ? await llm.agent({
              stage: "model",
              model: run.models.reasoning,
              effort: "high",
              system: REPO_MODEL_SYSTEM,
              prompt: repoModelPrompt(run, code.outline),
              schema: DesignModel,
              tools: readTools(code.reader.fork(), () => {}),
              maxTurns: MODEL_TURNS,
            })
          : await llm.call({
              stage: "model",
              model: run.models.reasoning,
              effort: "high",
              system: MODEL_SYSTEM,
              prompt: modelPrompt(run),
              schema: DesignModel,
            });
        run.usage.model = result.usage;
        if (result.kind === "declined") {
          throw declined(
            code ? "analyse this repository" : "analyse this requirement",
            result.category,
          );
        }
        const { model, warnings } = normalizeModel(result.value);
        // How the application is put together: a second, small call, so the
        // model stage's answer format stays within what the API accepts.
        if (source && code) {
          try {
            const drawn = await llm.call({
              stage: "model",
              model: run.models.reasoning,
              effort: "medium",
              system: ARCHITECTURE_SYSTEM,
              prompt: architecturePrompt(run, code.outline, model),
              schema: Architecture,
            });
            run.usage.model = addUsage(
              run.usage.model ?? ZERO_USAGE,
              drawn.usage,
            );
            if (drawn.kind === "ok") {
              const checked = normalizeArchitecture(
                drawn.value,
                source.workspaces?.map((workspace) => workspace.name) ?? [],
              );
              source.architecture = checked.architecture;
              warnings.push(...checked.warnings);
              await emit({
                type: "architecture.ready",
                architecture: checked.architecture,
              });
            }
          } catch (error) {
            // The diagram is not worth failing a run over.
            warnings.push(
              `The architecture could not be drawn: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        if (model.roles.length === 0 || model.operations.length === 0) {
          throw new RunError(
            code
              ? "The design model came back with no roles or no operations. The repository may not hold an application."
              : "The design model came back with no roles or no operations. Give the requirement more detail and start again.",
          );
        }
        run.designModel = model;
        run.modelWarnings = warnings;
        return `${plural(model.roles.length, "role")}, ${plural(model.operations.length, "operation")}, ${plural(model.rules.length, "rule")}`;
      });
      const model = run.designModel!;

      if (kind === "flyoff") {
        await runFlyoff(ctx);
      } else {
        // 2. Coverage: the gaps code can see. No model call.
        await stage("coverage", async () => {
          run.coverage = findCoverage(model);
          return plural(run.coverage.gaps.length, "gap");
        });
        const coverage = run.coverage!;

        // 3. Agents: five in parallel over one shared, cached context.
        await stage("agents", async () => {
          const shared = [
            code
              ? repoSharedContext(run, model, coverage, code.outline)
              : agentSharedContext(run, model, coverage),
            changeContext(run),
          ]
            .filter(Boolean)
            .join("\n\n");
          const knownIds = new Set([
            ...modelIds(model),
            ...coverage.gaps.map((gap) => gap.id),
          ]);

          // A cache entry can be read only once the request that writes it has
          // begun to answer. So the first agent starts alone, and the other four
          // start when its first bytes arrive and read what it wrote.
          let release!: () => void;
          const firstAnswering = new Promise<void>((resolve) => {
            release = resolve;
          });

          const runAgent = async (
            definition: AgentDefinition,
            first: boolean,
          ) => {
            const agent = run.agents.find(
              (item) => item.agentId === definition.id,
            )!;
            if (!first) await firstAnswering;
            agent.status = "running";
            await emit({ type: "agent.started", agentId: agent.agentId });

            let lastRead = 0;
            let lastSeen = "";
            try {
              let lastPath = "";
              const result = code
                ? await llm.agent({
                    stage: "agents",
                    model: run.models.agents,
                    effort: "medium",
                    system: REPO_AGENT_SYSTEM,
                    shared,
                    prompt: repoAgentPrompt(
                      definition,
                      expertise[definition.id],
                    ),
                    schema: RepoAgentSummary,
                    onStart: first ? release : undefined,
                    maxTurns: AGENT_TURNS,
                    tools: (() => {
                      const reader = code.reader.fork();
                      return [
                        ...readTools(reader, (path) => {
                          if (path === lastPath) return;
                          lastPath = path;
                          emit({
                            type: "agent.reading",
                            agentId: agent.agentId,
                            path,
                          }).catch(() => undefined);
                        }),
                        // A finding is saved on the agent and announced the
                        // moment it is filed, so the page shows it at once.
                        reportFindingTool(
                          agent.agentId,
                          reader,
                          agent.findings,
                          (finding) => {
                            emit({
                              type: "agent.finding",
                              agentId: agent.agentId,
                              finding: {
                                uid: finding.uid,
                                type: finding.type,
                                severity: finding.severity,
                                title: finding.title,
                                path: finding.location?.path ?? null,
                                startLine: finding.location?.startLine ?? null,
                              },
                            }).catch(() => undefined);
                          },
                        ),
                      ];
                    })(),
                  })
                : await llm.call({
                    stage: "agents",
                    model: run.models.agents,
                    effort: "medium",
                    system: AGENT_SYSTEM,
                    shared,
                    prompt: agentPrompt(definition, expertise[definition.id]),
                    schema: AgentReport,
                    onStart: first ? release : undefined,
                    onText: (soFar) => {
                      const at = Date.now();
                      if (at - lastRead < PROGRESS_EVERY_MS) return;
                      lastRead = at;
                      const progress = readProgress(soFar);
                      const seen = `${progress.scenarios.length}/${progress.findings}`;
                      if (seen === lastSeen) return;
                      lastSeen = seen;
                      // Progress is best effort: losing one update is harmless.
                      emit({
                        type: "agent.progress",
                        agentId: agent.agentId,
                        ...progress,
                      }).catch(() => undefined);
                    },
                  });
              agent.usage = result.usage;

              if (result.kind === "declined") {
                agent.status = "declined";
                agent.declinedCategory = result.category;
                await emit({
                  type: "agent.declined",
                  agentId: agent.agentId,
                  category: result.category,
                });
                return;
              }

              // In a repository run the findings were filed, and checked, one by
              // one through a tool. In a requirement run they arrive together
              // and are checked now.
              if ("scenarios" in result.value) {
                const checked = checkAgentReport(
                  agent.agentId,
                  result.value,
                  knownIds,
                );
                agent.scenarios = result.value.scenarios;
                agent.findings = checked.findings;
                agent.dropped = checked.dropped;
              }
              agent.status = "done";
              await emit({
                type: "agent.completed",
                agentId: agent.agentId,
                scenarios: agent.scenarios.length,
                findings: agent.findings.length,
                dropped: agent.dropped.length,
              });
            } catch (error) {
              agent.status = "failed";
              agent.error =
                error instanceof Error ? error.message : String(error);
              await emit({
                type: "agent.failed",
                agentId: agent.agentId,
                error: agent.error,
              });
            } finally {
              // Whatever happened to the first agent, the others must not wait
              // for ever.
              if (first) release();
              await save();
            }
          };

          await Promise.all(
            AGENTS.map((definition, index) =>
              runAgent(definition, index === 0),
            ),
          );

          run.usage.agents = run.agents.reduce(
            (sum, agent) => addUsage(sum, agent.usage ?? ZERO_USAGE),
            ZERO_USAGE,
          );

          const done = run.agents.filter((agent) => agent.status === "done");
          if (done.length === 0) {
            const reason = run.agents.find((agent) => agent.error)?.error;
            throw new RunError(
              `No agent finished its work.${reason ? ` ${reason}` : ""}`,
            );
          }
          const findings = done.reduce(
            (sum, agent) => sum + agent.findings.length,
            0,
          );
          return `${plural(findings, "finding")} from ${plural(done.length, "agent")}`;
        });

        const findings = run.agents.flatMap((agent) => agent.findings);

        // 4. Challenge: each agent reviews what the others found. Best effort:
        // an agent that fails or is declined here simply has nothing to say.
        run.challenges = [];
        await stage("challenge", async () => {
          const reviewers = run.agents.filter(
            (agent) => agent.status === "done",
          );
          if (findings.length === 0 || reviewers.length < 2) {
            return "Nothing to challenge";
          }
          const shared = challengeSharedContext(run, model, findings);
          let usage = ZERO_USAGE;

          // Same cache-aware start as the agents stage: one first, then the rest.
          let release!: () => void;
          const firstAnswering = new Promise<void>((resolve) => {
            release = resolve;
          });
          const review = async (agent: AgentRun, first: boolean) => {
            const definition = AGENTS.find(
              (item) => item.id === agent.agentId,
            )!;
            if (!first) await firstAnswering;
            try {
              const result = await llm.call({
                stage: "challenge",
                model: run.models.agents,
                effort: "medium",
                system: CHALLENGE_SYSTEM,
                shared,
                prompt: challengePrompt(definition),
                schema: Challenges,
                onStart: first ? release : undefined,
              });
              usage = addUsage(usage, result.usage);
              if (result.kind === "ok") {
                run.challenges!.push(
                  ...checkChallenges(agent.agentId, result.value, findings),
                );
              }
            } catch {
              // Leave this agent out of the round.
            } finally {
              if (first) release();
            }
          };
          await Promise.all(
            reviewers.map((agent, index) => review(agent, index === 0)),
          );
          run.usage.challenge = usage;

          const disputes = run.challenges!.filter(
            (item) => item.stance === "dispute",
          ).length;
          return `${plural(disputes, "dispute")}, ${run.challenges!.length - disputes} in support`;
        });
        const challenges = run.challenges;

        // 5. Judge: merge duplicates, reject what the design does not support.
        await stage("judge", async () => {
          if (findings.length === 0) {
            run.scoreboard = scoreAgents(run.agents, [], []);
            return "No findings to judge";
          }
          const scenarios = new Map<string, Scenario>(
            run.agents.flatMap((agent) =>
              agent.scenarios.map(
                (scenario) =>
                  [`${agent.agentId}/${scenario.id}`, scenario] as const,
              ),
            ),
          );
          const result = await llm.call({
            stage: "judge",
            model: run.models.reasoning,
            effort: "high",
            system: JUDGE_SYSTEM,
            prompt: [
              judgePrompt(run, model, findings, scenarios, challenges),
              changeContext(run),
            ]
              .filter(Boolean)
              .join("\n\n"),
            schema: Verdict,
          });
          run.usage.judge = result.usage;
          if (result.kind === "declined") {
            throw declined("judge the findings", result.category);
          }
          const verdict = reconcileVerdict(result.value, findings);
          run.groups = verdict.groups;
          run.rejected = verdict.rejected;
          run.scoreboard = scoreAgents(
            run.agents,
            run.groups,
            run.rejected,
            challenges,
          );
          return `${plural(run.groups.length, "finding")} accepted, ${run.rejected.length} rejected`;
        });

        // Secrets in the code are certain: they join the accepted findings.
        if (run.inventory && run.inventory.secrets.length > 0) {
          run.groups = [...run.groups, ...secretGroups(run.inventory)];
          await save();
        }

        // Flutter: the accepted issues that add up to a breach. Code only.
        if (has("chains") && code)
          await stage("chains", async () => {
            if (skipped.has("chains")) return "Left out of this eval run";
            return chainsStage(ctx, code);
          });

        // 6. Remediation: how to fix each security finding, checked against the
        // code. Best effort: a remediation that fails never fails the run.
        if (has("remediation"))
          await stage("remediation", async () => {
            if (skipped.has("remediation")) return "Left out of this eval run";
            const security = run.groups.filter(
              (group) => group.type === "security_vulnerability",
            );
            if (security.length === 0) return "No security findings";
            run.remediations = {};
            const done = await remediate({
              llm,
              run,
              reader: code?.reader ?? null,
              secretValues,
              onReady: async (record) => {
                run.remediations = {
                  ...run.remediations,
                  [record.groupId]: record,
                };
                await save();
                await emit({
                  type: "remediation.ready",
                  groupId: record.groupId,
                });
              },
            });
            run.usage.remediation = done.usage;
            const made = Object.values(done.records).filter(
              (record) => record.status === "made",
            );
            const patches = made.filter(
              (record) => record.edits.length > 0,
            ).length;
            return `${plural(made.length, "remediation")}, ${plural(patches, "with a patch", "with a patch")}`;
          });

        // Crosswind: what the change does to every service, and what it fixes.
        if (has("impact")) await stage("impact", () => impactStage(ctx));

        // 7. Work orders: what to do about each accepted finding.
        if (has("work_orders"))
          await stage("work_orders", async () => {
            if (skipped.has("work_orders")) return "Left out of this eval run";
            if (run.groups.length === 0) return "No work orders needed";
            const result = await llm.call({
              stage: "work_orders",
              model: run.models.reasoning,
              effort: "medium",
              system: WORK_ORDER_SYSTEM,
              prompt: workOrderPrompt(run, model, run.groups),
              schema: WorkOrders,
            });
            run.usage.work_orders = result.usage;
            if (result.kind === "declined") {
              throw declined("write the work orders", result.category);
            }
            const checked = checkWorkOrders(
              result.value.workOrders,
              run.groups,
            );
            run.workOrders = checked.workOrders;
            run.unaddressedGroupIds = checked.unaddressedGroupIds;
            return plural(run.workOrders.length, "work order");
          });
      }
    }

    run.status = "completed";
    run.stage = null;
    run.costUsd = costOf(run) ?? undefined;
    await save();
    await emit({ type: "run.completed" });
  } catch (error) {
    run.status = "failed";
    run.costUsd = costOf(run) ?? undefined;
    run.error =
      error instanceof RunError
        ? error.message
        : `The run stopped on an unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    for (const agent of run.agents) {
      if (agent.status === "pending" || agent.status === "running") {
        agent.status = "failed";
        agent.error ??= "The run stopped before this agent finished.";
      }
    }
    try {
      await save();
      await emit({ type: "run.failed", error: run.error });
    } catch {
      // The store itself is down; there is nowhere left to report to.
    }
  }

  // A cloned repository is removed; the findings keep the lines they cite.
  await Promise.all(
    prepared.map((item) => item.cleanup().catch(() => undefined)),
  );
  await queue.catch(() => undefined);
  return scrubDeep(run, secretValues);
}
