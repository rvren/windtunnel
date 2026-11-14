import { describe, expect, it } from "vitest";

import type { RunEvent } from "@/server/engine/schema";

import { applyEvent, emptyFeed } from "./run-feed";

const play = (events: RunEvent[]) => events.reduce(applyEvent, emptyFeed());

describe("applyEvent", () => {
  it("follows a stage and an agent from start to finish", () => {
    const feed = play([
      { type: "run.started" },
      { type: "stage.started", stage: "model" },
      { type: "stage.completed", stage: "model", summary: "3 roles" },
      { type: "stage.started", stage: "agents" },
      { type: "agent.started", agentId: "chaos" },
      {
        type: "agent.progress",
        agentId: "chaos",
        scenarios: ["One"],
        findings: 0,
      },
      {
        type: "agent.completed",
        agentId: "chaos",
        scenarios: 2,
        findings: 3,
        dropped: 1,
      },
    ]);
    expect(feed.stages.model).toEqual({ state: "done", summary: "3 roles" });
    expect(feed.stages.agents.state).toBe("running");
    expect(feed.stages.judge.state).toBe("pending");
    expect(feed.agents.chaos).toEqual({
      status: "done",
      scenarios: ["One"],
      findings: 3,
      note: "1 dropped by the citation check",
    });
    expect(feed.ended).toBe(false);
  });

  it("records a declined agent with its category", () => {
    const feed = play([
      {
        type: "agent.declined",
        agentId: "adversarial_user",
        category: "cyber",
      },
    ]);
    expect(feed.agents.adversarial_user).toMatchObject({
      status: "declined",
      note: "Declined by the model (cyber)",
    });
  });

  it("marks what was in progress as failed when the run fails", () => {
    const feed = play([
      { type: "stage.started", stage: "model" },
      { type: "stage.completed", stage: "model", summary: "ok" },
      { type: "stage.started", stage: "agents" },
      { type: "agent.started", agentId: "scale" },
      {
        type: "agent.completed",
        agentId: "chaos",
        scenarios: 1,
        findings: 1,
        dropped: 0,
      },
      { type: "run.failed", error: "It broke." },
    ]);
    expect(feed.ended).toBe(true);
    expect(feed.stages.model.state).toBe("done");
    expect(feed.stages.agents.state).toBe("failed");
    expect(feed.stages.judge.state).toBe("pending");
    expect(feed.agents.scale.status).toBe("failed");
    expect(feed.agents.chaos.status).toBe("done");
  });

  it("ends on completion", () => {
    expect(play([{ type: "run.completed" }]).ended).toBe(true);
  });
});
