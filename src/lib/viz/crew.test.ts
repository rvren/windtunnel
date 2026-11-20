import { describe, expect, it } from "vitest";

import { applyEvent, emptyFeed } from "@/lib/run-feed";
import type { RunEvent, Stage } from "@/server/engine/schema";

import { crewOf } from "./crew";

const STAGES: Stage[] = ["survey", "model", "agents", "judge"];
const play = (events: RunEvent[]) => events.reduce(applyEvent, emptyFeed());
const run = { kind: "audit" as const, stages: STAGES, subject: "Storefront" };

describe("crewOf", () => {
  it("says which stage is on before the agents start", () => {
    const crew = crewOf(play([{ type: "stage.started", stage: "model" }]), run);
    expect(crew.stage).toMatchObject({ id: "model", index: 2, count: 4 });
    expect(crew.sentence).toBe(
      "Writing the design model from the requirement.",
    );
    expect(crew.members.every((member) => member.progress === 0)).toBe(true);
  });

  it("follows each agent's file, newest finding and progress", () => {
    const crew = crewOf(
      play([
        { type: "stage.started", stage: "agents" },
        { type: "agent.started", agentId: "chaos" },
        { type: "agent.started", agentId: "scale" },
        { type: "agent.reading", agentId: "chaos", path: "api/mail.go" },
        {
          type: "agent.finding",
          agentId: "chaos",
          finding: {
            uid: "chaos/f1",
            type: "architecture_weakness",
            severity: "high",
            title: "No timeout",
            path: "api/mail.go",
            startLine: 3,
          },
        },
      ]),
      run,
    );
    const chaos = crew.members.find((member) => member.id === "chaos")!;
    expect(chaos).toMatchObject({
      name: "Outage tester",
      status: "running",
      doing: "api/mail.go",
      findings: 1,
      latest: { uid: "chaos/f1", title: "No timeout" },
    });
    expect(chaos.progress).toBeGreaterThan(0);
    expect(chaos.progress).toBeLessThan(1);
    expect(crew.sentence).toBe("2 agents are testing Storefront.");
    // The line under it: who is on what, for the ones that have a file.
    expect(crew.now).toEqual([{ name: "Outage tester", doing: "api/mail.go" }]);
    // Who and what in full colour, the words between them softer.
    expect(crew.words.map((word) => [word.text, !!word.soft])).toEqual([
      ["2 agents", false],
      [" are ", true],
      ["testing", true],
      [" Storefront", false],
      [".", false],
    ]);
  });

  it("names what the workers do in the stage that is on", () => {
    const stages: Stage[] = ["survey", "agents", "challenge", "judge"];
    const crew = crewOf(
      play([
        { type: "stage.started", stage: "challenge" },
        { type: "agent.started", agentId: "chaos" },
      ]),
      { ...run, stages },
    );
    expect(crew.sentence).toBe("1 agent is reviewing each other's findings.");
    expect(crew.words.at(-1)).toEqual({ text: ".", soft: true });
    expect(crew.words.map((word) => word.text).join("")).toBe(crew.sentence);
  });

  it("keeps the agents as the subject while none is mid-task", () => {
    const crew = crewOf(play([{ type: "stage.started", stage: "challenge" }]), {
      ...run,
      stages: ["survey", "agents", "challenge", "judge"],
    });
    expect(crew.sentence).toBe(
      "The agents are reviewing each other's findings.",
    );
  });

  it("shows no line under the sentence while nobody has a file or step", () => {
    const crew = crewOf(
      play([
        { type: "stage.started", stage: "survey" },
        { type: "agent.started", agentId: "chaos" },
      ]),
      run,
    );
    expect(crew.now).toEqual([]);
  });

  it("settles when the run ends", () => {
    const crew = crewOf(
      play([
        { type: "agent.started", agentId: "chaos" },
        {
          type: "agent.completed",
          agentId: "chaos",
          scenarios: 1,
          findings: 4,
          dropped: 0,
        },
        { type: "stage.started", stage: "judge" },
        { type: "stage.completed", stage: "judge", summary: "ok" },
        { type: "run.completed" },
      ]),
      run,
    );
    expect(crew.ended).toBe(true);
    expect(crew.stage?.id).toBe("judge");
    expect(crew.members.find((m) => m.id === "chaos")?.progress).toBe(1);
    expect(crew.sentence).toBe(
      "The agents filed 4 findings before the judge merged them.",
    );
  });

  it("shows a fly-off's designers and judge from their events", () => {
    const crew = crewOf(
      play([
        { type: "stage.started", stage: "proposals" },
        { type: "actor.started", actorId: "p1", doing: "Designing" },
        { type: "actor.started", actorId: "p2", doing: "Designing" },
        { type: "actor.completed", actorId: "p2", note: "Proposed Grants" },
      ]),
      { kind: "flyoff", stages: ["model", "proposals"], subject: "Shop" },
    );
    expect(crew.members.map((m) => m.name)).toEqual([
      "Pragmatist",
      "Scaler",
      "Guardian",
      "Judge",
    ]);
    expect(crew.members[0]).toMatchObject({
      status: "running",
      doing: "Designing",
      findings: null,
    });
    expect(crew.members[1]).toMatchObject({
      status: "done",
      note: "Proposed Grants",
      latest: { uid: "p2#1", title: "Proposed Grants" },
      progress: 1,
    });
    expect(crew.members[3].status).toBe("pending");
    expect(crew.sentence).toBe("Pragmatist is designing the feature for Shop.");
  });

  it("says where a failed run stopped", () => {
    const crew = crewOf(
      play([
        { type: "stage.started", stage: "agents" },
        { type: "agent.started", agentId: "chaos" },
        { type: "run.failed", error: "x" },
      ]),
      run,
    );
    expect(crew.outcome).toBe("failed");
    expect(crew.sentence).toBe("The run stopped at Agents.");
  });

  it("takes an interrupted run's end from its status", () => {
    const crew = crewOf(play([{ type: "stage.started", stage: "model" }]), {
      ...run,
      status: "interrupted",
    });
    expect(crew).toMatchObject({ ended: true, outcome: "failed" });
  });
});
