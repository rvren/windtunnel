import { RunError } from "../llm";
import {
  Blueprint,
  Critique,
  FlightAnswer,
  FlyoffVerdict,
  ZERO_USAGE,
  addUsage,
  type RunFlyoff,
} from "../schema";

import type { KindContext } from "./context";
import {
  CRITIC_SYSTEM,
  FLIGHT_SYSTEM,
  FLYOFF_JUDGE_SYSTEM,
  PROPOSERS,
  PROPOSER_SYSTEM,
  critiquePrompt,
  flightPrompt,
  flyoffJudgePrompt,
  proposerPrompt,
} from "./prompts";

/*
 * Fly-off: rival designs for one requirement. Three designers, each from
 * their own angle, propose a blueprint; each critiques the others; a judge
 * ranks them and picks one. The design model stage before it is an
 * audit's.
 */

/** A critique can only be of another designer's blueprint that exists. */
export function checkCritiques(
  from: string,
  critique: Critique,
  ids: Set<string>,
): RunFlyoff["critiques"] {
  const seen = new Set<string>();
  return critique.critiques
    .filter((item) => item.blueprintId !== from && ids.has(item.blueprintId))
    .filter((item) => !seen.has(item.blueprintId) && seen.add(item.blueprintId))
    .map((item) => ({
      from,
      blueprintId: item.blueprintId,
      strengths: item.strengths,
      weaknesses: item.weaknesses,
    }));
}

/** The verdict, with the winner and the ranking held to real blueprints. */
export function checkVerdict(
  verdict: FlyoffVerdict,
  ids: string[],
): FlyoffVerdict {
  const known = new Set(ids);
  const ranking = verdict.ranking
    .filter((item) => known.has(item.blueprintId))
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.blueprintId === item.blueprintId) ===
        index,
    )
    .sort((a, b) => a.rank - b.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const winnerId = known.has(verdict.winnerId)
    ? verdict.winnerId
    : (ranking[0]?.blueprintId ?? ids[0]);
  return { ...verdict, winnerId, ranking };
}

export async function runFlyoff(ctx: KindContext): Promise<void> {
  const { run, llm, stage, emit, save, plural, declined } = ctx;
  const flyoff: RunFlyoff = {
    blueprints: PROPOSERS.map((proposer) => ({
      id: proposer.id,
      proposer: proposer.name,
      angle: proposer.angle,
      status: "pending",
      blueprint: null,
      error: null,
    })),
    critiques: [],
    verdict: null,
  };
  run.flyoff = flyoff;

  // 1. Proposals: three designers at once.
  await stage("proposals", async () => {
    let usage = ZERO_USAGE;
    await Promise.all(
      PROPOSERS.map(async (proposer) => {
        const entry = flyoff.blueprints.find(
          (item) => item.id === proposer.id,
        )!;
        entry.status = "running";
        await emit({
          type: "actor.started",
          actorId: proposer.id,
          doing: "Designing a blueprint",
        });
        try {
          const result = await llm.call({
            stage: "proposals",
            model: run.models.agents,
            effort: "medium",
            system: PROPOSER_SYSTEM,
            prompt: proposerPrompt(proposer, run, run.designModel),
            schema: Blueprint,
          });
          usage = addUsage(usage, result.usage);
          if (result.kind === "declined") {
            entry.status = "failed";
            entry.error = "The model declined to propose a design.";
          } else {
            entry.status = "done";
            entry.blueprint = result.value;
          }
        } catch (error) {
          entry.status = "failed";
          entry.error = error instanceof Error ? error.message : String(error);
        } finally {
          await save();
          await emit(
            entry.blueprint
              ? {
                  type: "actor.completed",
                  actorId: proposer.id,
                  note: `Proposed ${entry.blueprint.name}`,
                }
              : {
                  type: "actor.failed",
                  actorId: proposer.id,
                  error: entry.error ?? "No blueprint",
                },
          );
        }
      }),
    );
    run.usage.proposals = usage;
    const done = flyoff.blueprints.filter((item) => item.blueprint);
    if (done.length === 0) {
      throw new RunError(
        `No designer finished a blueprint.${flyoff.blueprints.find((item) => item.error)?.error ? ` ${flyoff.blueprints.find((item) => item.error)!.error}` : ""}`,
      );
    }
    return `${plural(done.length, "blueprint")}: ${done.map((item) => item.blueprint!.name).join(", ")}`;
  });

  const ready = flyoff.blueprints.filter((item) => item.blueprint);
  const ids = new Set(ready.map((item) => item.id));

  // 2. Critique: each designer on the others' blueprints. Best effort.
  await stage("critique", async () => {
    if (ready.length < 2) return "Only one blueprint: nothing to critique";
    let usage = ZERO_USAGE;
    await Promise.all(
      ready.map(async (entry) => {
        const proposer = PROPOSERS.find((item) => item.id === entry.id)!;
        await emit({
          type: "actor.started",
          actorId: entry.id,
          doing: "Critiquing the other designs",
        });
        let named = 0;
        try {
          const result = await llm.call({
            stage: "critique",
            model: run.models.agents,
            effort: "medium",
            system: CRITIC_SYSTEM,
            prompt: critiquePrompt(
              proposer,
              run,
              ready
                .filter((other) => other.id !== entry.id)
                .map((other) => ({
                  id: other.id,
                  blueprint: other.blueprint!,
                })),
            ),
            schema: Critique,
          });
          usage = addUsage(usage, result.usage);
          if (result.kind === "ok") {
            const kept = checkCritiques(entry.id, result.value, ids);
            flyoff.critiques.push(...kept);
            named = kept.reduce((sum, item) => sum + item.weaknesses.length, 0);
          }
        } catch {
          // This designer's critique is left out.
        }
        await emit({
          type: "actor.completed",
          actorId: entry.id,
          note: `Named ${plural(named, "weakness", "weaknesses")}`,
        });
      }),
    );
    run.usage.critique = usage;
    const weaknesses = flyoff.critiques.reduce(
      (sum, item) => sum + item.weaknesses.length,
      0,
    );
    return `${plural(flyoff.critiques.length, "critique")}, ${plural(weaknesses, "weakness", "weaknesses")} named`;
  });

  // 3. Flight: each blueprint in the tunnel, the five agents against it.
  // Best effort: a flight that fails leaves the judge the critiques.
  await stage("flight", async () => {
    let usage = ZERO_USAGE;
    flyoff.flights = {};
    await Promise.all(
      ready.map(async (entry) => {
        await emit({
          type: "actor.started",
          actorId: entry.id,
          doing: "In the tunnel: five agents attack the design",
        });
        try {
          const result = await llm.call({
            stage: "flight",
            model: run.models.agents,
            effort: "medium",
            system: FLIGHT_SYSTEM,
            prompt: flightPrompt(run, {
              id: entry.id,
              proposer: entry.proposer,
              blueprint: entry.blueprint!,
            }),
            schema: FlightAnswer,
          });
          usage = addUsage(usage, result.usage);
          flyoff.flights![entry.id] =
            result.kind === "declined"
              ? { findings: [], error: "The model declined to fly it." }
              : { findings: result.value.findings, error: null };
        } catch (error) {
          flyoff.flights![entry.id] = {
            findings: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
        await save();
        const found = flyoff.flights![entry.id].findings;
        const worst = found.filter(
          (item) => item.severity === "critical" || item.severity === "high",
        ).length;
        await emit({
          type: "actor.completed",
          actorId: entry.id,
          note: `${plural(found.length, "flaw")} found in flight, ${worst} serious`,
        });
      }),
    );
    run.usage.flight = usage;
    const total = Object.values(flyoff.flights).reduce(
      (sum, item) => sum + item.findings.length,
      0,
    );
    return `${plural(ready.length, "blueprint")} flown, ${plural(total, "flaw")} found`;
  });

  // 4. Judge: rank the blueprints and pick one.
  await stage("judge", async () => {
    await emit({
      type: "actor.started",
      actorId: "judge",
      doing: "Weighing the blueprints",
    });
    const result = await llm.call({
      stage: "judge",
      model: run.models.reasoning,
      effort: "high",
      system: FLYOFF_JUDGE_SYSTEM,
      prompt: flyoffJudgePrompt(
        run,
        ready.map((item) => ({
          id: item.id,
          proposer: item.proposer,
          blueprint: item.blueprint!,
        })),
        flyoff.critiques,
        flyoff.flights,
      ),
      schema: FlyoffVerdict,
    });
    run.usage.judge = result.usage;
    if (result.kind === "declined") {
      throw declined("judge the blueprints", result.category);
    }
    flyoff.verdict = checkVerdict(result.value, [...ids]);
    const winner = ready.find((item) => item.id === flyoff.verdict!.winnerId)!;
    await emit({
      type: "actor.completed",
      actorId: "judge",
      note: `${winner.proposer} wins`,
    });
    return `${winner.proposer}'s ${winner.blueprint!.name} wins`;
  });
}
