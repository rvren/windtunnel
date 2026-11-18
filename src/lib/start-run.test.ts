import { describe, expect, it } from "vitest";

import { startBody, startProblem, type StartInput } from "./start-run";

const project = {
  id: "p1",
  workspaces: [
    { name: "web", github: true },
    { name: "api", github: false },
  ],
};
const bare = { id: "p2", workspaces: [] };

const input = (over: Partial<StartInput> = {}): StartInput => ({
  kind: "audit",
  subject: "requirement",
  chosen: ["web", "api"],
  text: "",
  documents: [],
  change: {
    mode: "text",
    workspace: "web",
    number: "",
    base: "main",
    head: "",
  },
  ...over,
});

describe("startProblem", () => {
  it("asks for a project first", () => {
    expect(startProblem(input({ text: "x" }), null)).toBe("Choose a project.");
  });

  it("asks for what each kind needs", () => {
    expect(startProblem(input(), project)).toBe("Enter a requirement.");
    expect(startProblem(input({ subject: "code", chosen: [] }), project)).toBe(
      "Choose at least one workspace.",
    );
    expect(startProblem(input({ kind: "crosswind" }), project)).toBe(
      "Describe the change.",
    );
    expect(
      startProblem(
        input({
          kind: "crosswind",
          change: {
            mode: "pr",
            workspace: "web",
            number: "",
            base: "main",
            head: "",
          },
        }),
        project,
      ),
    ).toBe("Enter the pull request number.");
    expect(startProblem(input({ kind: "flyoff" }), bare)).toBe(
      "Describe the feature to design.",
    );
    expect(startProblem(input({ kind: "blackbox", text: "500" }), bare)).toBe(
      "Black Box reads code. Add a workspace to this project first.",
    );
  });

  it("is satisfied by a complete input", () => {
    expect(startProblem(input({ text: "Build it" }), project)).toBeNull();
    expect(startProblem(input({ kind: "flyoff", text: "x" }), bare)).toBeNull();
  });
});

describe("startBody", () => {
  it("sends a Tunnel Run on code with the chosen workspaces only", () => {
    expect(
      startBody(input({ subject: "code", chosen: ["api"], text: "" }), project),
    ).toEqual({
      projectId: "p1",
      requirement: "",
      documents: [],
      workspaces: ["api"],
    });
  });

  it("sends a Crosswind with every workspace and its change", () => {
    expect(
      startBody(
        input({
          kind: "crosswind",
          change: {
            mode: "pr",
            workspace: "web",
            number: "42",
            base: "main",
            head: "",
          },
        }),
        project,
      ),
    ).toMatchObject({
      kind: "crosswind",
      workspaces: ["web", "api"],
      change: { kind: "pr", workspace: "web", number: 42 },
    });
  });

  it("sends a Black Box incident and a Fly-off requirement", () => {
    expect(
      startBody(input({ kind: "blackbox", text: "500 on /" }), project),
    ).toMatchObject({ kind: "blackbox", incident: "500 on /" });
    expect(
      startBody(input({ kind: "flyoff", text: "Design it" }), project),
    ).toEqual({
      projectId: "p1",
      kind: "flyoff",
      requirement: "Design it",
      documents: [],
    });
  });
});
