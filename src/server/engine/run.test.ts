import { describe, expect, it } from "vitest";

import { runToJson, runToMarkdown } from "./export";
import { executeRun, newRun } from "./run";
import { SAMPLE_SCRIPT, ScriptedLlm, type Script } from "./sample";
import type { RunEvent, StoredEvent } from "./schema";
import { MemoryRunStore } from "./store";

const MODELS = { reasoning: "reasoning-model", agents: "agent-model" };

function setup(
  script: Script = SAMPLE_SCRIPT,
  options: ConstructorParameters<typeof ScriptedLlm>[1] = {},
) {
  const store = new MemoryRunStore();
  const llm = new ScriptedLlm(script, options);
  const published: StoredEvent[] = [];
  const run = newRun(
    "run-1",
    {
      requirement:
        "Build a multi-tenant dashboard where organization admins can invite users and manage permissions.\nSecond line.",
      documents: [],
    },
    MODELS,
    new Date("2026-11-13T10:00:00Z"),
    true,
  );
  const deps = {
    llm,
    store,
    publish: (_id: string, event: StoredEvent) => void published.push(event),
    now: () => new Date("2026-11-13T10:00:01Z"),
  };
  return { store, llm, published, run, deps };
}

const types = (events: StoredEvent[]) => events.map((item) => item.event.type);
const withScript = (change: (script: Script) => void): Script => {
  const script = structuredClone(SAMPLE_SCRIPT);
  change(script);
  return script;
};

describe("executeRun", () => {
  it("runs the five stages and ends with a full report", async () => {
    const { deps, run, store } = setup();
    const done = await executeRun(deps, run);

    expect(done.status).toBe("completed");
    expect(done.title).toBe(
      "Build a multi-tenant dashboard where organization admins can invite users and manage permissions.",
    );
    expect(done.designModel?.operations).toHaveLength(4);
    expect(done.coverage?.gaps).toHaveLength(21);
    expect(done.agents.map((agent) => agent.status)).toEqual(
      Array(5).fill("done"),
    );
    // Four groups from six accepted findings; one finding rejected.
    expect(done.groups.map((group) => group.id)).toEqual([
      "g1",
      "g2",
      "g3",
      "g4",
    ]);
    expect(done.rejected).toHaveLength(1);
    expect(done.workOrders).toHaveLength(3);
    expect(done.unaddressedGroupIds).toEqual([]);
    // The adversarial agent found two critical flaws, one of them alone.
    expect(done.scoreboard[0]).toMatchObject({
      agentId: "adversarial_user",
      points: 12,
      unique: 1,
    });

    // Chaos disputed the finding the judge rejected: one point for that.
    expect(done.challenges).toHaveLength(2);
    expect(
      done.scoreboard.find((row) => row.agentId === "chaos"),
    ).toMatchObject({ points: 6, upheld: 1 });

    const saved = await store.get("run-1");
    expect(saved).toEqual(done);
  });

  it("announces every step in order, saved and published alike", async () => {
    const { deps, run, store, published } = setup();
    await executeRun(deps, run);

    const saved = await store.events("run-1");
    expect(saved).toEqual(published);
    expect(saved.map((item) => item.seq)).toEqual(
      saved.map((_, index) => index + 1),
    );

    const stageEvents = saved
      .map((item) => item.event)
      .filter(
        (event): event is Extract<RunEvent, { stage: string }> =>
          event.type === "stage.started" || event.type === "stage.completed",
      )
      .map((event) => `${event.type}:${event.stage}`);
    expect(stageEvents).toEqual(
      [
        "model",
        "coverage",
        "agents",
        "challenge",
        "judge",
        "work_orders",
      ].flatMap((stage) => [
        `stage.started:${stage}`,
        `stage.completed:${stage}`,
      ]),
    );
    expect(types(saved)[0]).toBe("run.started");
    expect(types(saved).at(-1)).toBe("run.completed");
    expect(
      types(saved).filter((type) => type === "agent.completed"),
    ).toHaveLength(5);
  });

  it("starts four agents only when the first one has begun to answer", async () => {
    let letFirstAnswer!: () => void;
    const held = new Promise<void>((resolve) => {
      letFirstAnswer = resolve;
    });
    const { deps, run, llm } = setup(SAMPLE_SCRIPT, {
      beforeStart: (key) => (key === "normal_user" ? held : Promise.resolve()),
    });

    const running = executeRun(deps, run);
    await new Promise((resolve) => setTimeout(resolve, 30));
    // The first agent is being held before its first byte: nobody else may
    // have started, or they would all pay to write the same cache entry.
    expect(llm.calls).toEqual(["model", "normal_user"]);

    letFirstAnswer();
    await running;
    expect(llm.calls.slice(0, 2)).toEqual(["model", "normal_user"]);
    expect(llm.calls.slice(2, 6).sort()).toEqual([
      "adversarial_user",
      "chaos",
      "product_critic",
      "scale",
    ]);
    // The challenge round starts the same way: one agent first, then the rest.
    expect(llm.calls[6]).toBe("challenge:normal_user");
    expect(llm.calls.slice(6, 11).sort()).toEqual([
      "challenge:adversarial_user",
      "challenge:chaos",
      "challenge:normal_user",
      "challenge:product_critic",
      "challenge:scale",
    ]);
    expect(llm.calls.slice(11)).toEqual(["judge", "work_orders"]);
  });

  it("carries on when the model declines one agent", async () => {
    const script = withScript((item) => {
      item.agents.adversarial_user = { kind: "declined", category: "cyber" };
    });
    const { deps, run } = setup(script);
    const done = await executeRun(deps, run);

    expect(done.status).toBe("completed");
    const declined = done.agents.find(
      (agent) => agent.agentId === "adversarial_user",
    );
    expect(declined).toMatchObject({
      status: "declined",
      declinedCategory: "cyber",
    });
    // Its findings are gone, so the group it found alone is gone too.
    expect(done.groups.map((group) => group.id)).toEqual(["g1", "g3", "g4"]);
    expect(done.workOrders.map((item) => item.id)).toEqual(["wo-1", "wo-3"]);
  });

  it("carries on when one agent's answer is malformed", async () => {
    const script = withScript((item) => {
      item.agents.scale = {
        kind: "ok",
        value: { scenarios: "not a list" } as never,
      };
    });
    const { deps, run, published } = setup(script);
    const done = await executeRun(deps, run);

    expect(done.status).toBe("completed");
    expect(
      done.agents.find((agent) => agent.agentId === "scale"),
    ).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/expected shape/),
    });
    expect(types(published)).toContain("agent.failed");
  });

  it("fails the run, with the reason, when a stage fails", async () => {
    const script = withScript((item) => {
      item.model = {
        kind: "error",
        message: "The Claude API rate limit was reached.",
      };
    });
    const { deps, run, published, llm } = setup(script);
    const done = await executeRun(deps, run);

    expect(done.status).toBe("failed");
    expect(done.error).toBe("The Claude API rate limit was reached.");
    expect(done.agents.every((agent) => agent.status === "failed")).toBe(true);
    expect(types(published).at(-1)).toBe("run.failed");
    expect(llm.calls).toEqual(["model"]);
  });

  it("fails the run when the model declines the requirement", async () => {
    const script = withScript((item) => {
      item.model = { kind: "declined", category: "general_harms" };
    });
    const { deps, run } = setup(script);
    const done = await executeRun(deps, run);
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/declined to analyse.*general_harms/);
  });

  it("fails the run when no agent finishes", async () => {
    const script = withScript((item) => {
      for (const id of Object.keys(item.agents) as (keyof Script["agents"])[]) {
        item.agents[id] = {
          kind: "error",
          message: "Could not reach the Claude API.",
        };
      }
    });
    const { deps, run, llm } = setup(script);
    const done = await executeRun(deps, run);

    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/No agent finished.*Could not reach/);
    expect(llm.calls).not.toContain("judge");
  });

  it("skips the judge and work orders when there is nothing to judge", async () => {
    const script = withScript((item) => {
      for (const id of Object.keys(item.agents) as (keyof Script["agents"])[]) {
        item.agents[id] = {
          kind: "ok",
          value: { scenarios: [], findings: [] },
        };
      }
    });
    const { deps, run, llm } = setup(script);
    const done = await executeRun(deps, run);

    expect(done.status).toBe("completed");
    expect(done.groups).toEqual([]);
    expect(llm.calls).not.toContain("judge");
    expect(llm.calls).not.toContain("work_orders");
    expect(done.scoreboard).toHaveLength(5);
  });
});

describe("the challenge round", () => {
  it("ignores what an agent says about its own or unknown findings", async () => {
    const script = withScript((item) => {
      item.challenges = {
        chaos: {
          kind: "ok",
          value: {
            challenges: [
              { findingId: "chaos/f1", stance: "support", reason: "Mine." },
              { findingId: "ghost/f1", stance: "dispute", reason: "No such." },
              { findingId: "scale/f1", stance: "dispute", reason: "First." },
              { findingId: "scale/f1", stance: "support", reason: "Again." },
            ],
          },
        },
      };
    });
    const { deps, run } = setup(script);
    const done = await executeRun(deps, run);
    expect(done.challenges).toEqual([
      {
        agentId: "chaos",
        findingId: "scale/f1",
        stance: "dispute",
        reason: "First.",
      },
    ]);
  });

  it("does not stop the run when an agent fails in it", async () => {
    const script = withScript((item) => {
      item.challenges = {
        normal_user: {
          kind: "error",
          message: "Could not reach the Claude API.",
        },
        scale: { kind: "declined", category: "cyber" },
      };
    });
    const { deps, run } = setup(script);
    const done = await executeRun(deps, run);
    expect(done.status).toBe("completed");
    expect(done.challenges).toEqual([]);
    expect(done.groups).toHaveLength(4);
  });
});

describe("export", () => {
  it("writes the report as Markdown and as JSON", async () => {
    const { deps, run } = setup();
    const done = await executeRun(deps, run);

    const markdown = runToMarkdown(done);
    for (const heading of [
      "# Windtunnel report:",
      "## Requirement",
      "## Findings",
      "### Security vulnerabilities",
      "#### Who may change permissions is not stated",
      "## Work orders",
      "- [ ] The requirement lists every permission by name.",
      "## Scoreboard",
      "## Design model",
      "## Coverage gaps",
      "## Rejected by the judge",
      "## Token use",
      "Sample run",
    ]) {
      expect(markdown).toContain(heading);
    }
    // Evidence is spelled out: the agent, the scenario, the step.
    expect(markdown).toContain(
      "_A member raises their own permissions_, step 1:",
    );

    expect(JSON.parse(runToJson(done))).toEqual(done);
  });
});
