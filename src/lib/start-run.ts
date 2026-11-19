import type { OutageMode, RunKind } from "@/server/engine/schema";

/*
 * What the start page sends to POST /api/runs for each kind of run, and
 * what is missing before it can. Pure, so the one page serves all four
 * kinds and the rules are tested in one place.
 */

export type ChangeMode = "pr" | "branches" | "text";

export interface StartProject {
  id: string;
  workspaces: { name: string; github: boolean }[];
}

export interface StartInput {
  kind: RunKind;
  /** A Tunnel Run tests a written requirement or the project's code. */
  subject: "requirement" | "code";
  /** The workspaces a Tunnel Run on code reads. */
  chosen: string[];
  /** The requirement, the change in words, or the incident. */
  text: string;
  documents: { name: string; content: string }[];
  /** A Crosswind's change, when given as a pull request or branches. */
  change: {
    mode: ChangeMode;
    workspace: string;
    number: string;
    base: string;
    head: string;
  };
  /** Engine Out: the part to cut (a map id, or a name) and how it fails. */
  outage: { part: string; mode: OutageMode; label: string };
  /** Dogfight: the security issue to defend, from a run of the project. */
  dogfight: { runId: string; groupId: string; label: string };
}

/** Why the run cannot start yet, in one sentence, or null. */
export function startProblem(
  input: StartInput,
  project: StartProject | null,
): string | null {
  if (!project) return "Choose a project.";
  const text = input.text.trim();
  const code = project.workspaces.length > 0;
  switch (input.kind) {
    case "audit":
      if (input.subject === "code") {
        if (!code)
          return "This project has no code yet. Add a workspace on its page.";
        if (input.chosen.length === 0) return "Choose at least one workspace.";
        return null;
      }
      return text ? null : "Enter a requirement.";
    case "crosswind":
      if (!code)
        return "Crosswind reads code. Add a workspace to this project first.";
      if (input.change.mode === "pr")
        return input.change.number ? null : "Enter the pull request number.";
      if (input.change.mode === "branches")
        return input.change.head.trim() ? null : "Enter the branch to compare.";
      return text ? null : "Describe the change.";
    case "flyoff":
      return text ? null : "Describe the feature to design.";
    case "blackbox":
      if (!code)
        return "Black Box reads code. Add a workspace to this project first.";
      return text ? null : "Paste the error or the incident note.";
    case "engineout":
      if (!code)
        return "Engine Out reads code. Add a workspace to this project first.";
      return input.outage.part.trim() ? null : "Choose the part to cut.";
    case "dogfight":
      if (!code)
        return "A Dogfight reads code. Add a workspace to this project first.";
      return input.dogfight.groupId ? null : "Choose the issue to defend.";
    case "preflight":
      if (!code)
        return "Preflight checks the code. Add a workspace to this project first.";
      return text ? null : "Paste the spec to check.";
  }
}

/** The request body for POST /api/runs. */
export function startBody(
  input: StartInput,
  project: StartProject,
): Record<string, unknown> {
  const all = project.workspaces.map((item) => item.name);
  switch (input.kind) {
    case "audit":
      return {
        projectId: project.id,
        requirement: input.text,
        documents: input.documents,
        ...(input.subject === "code" ? { workspaces: input.chosen } : {}),
      };
    case "crosswind": {
      const { mode, workspace, number, base, head } = input.change;
      return {
        projectId: project.id,
        kind: "crosswind",
        workspaces: all,
        requirement: "",
        documents: [],
        change:
          mode === "pr"
            ? { kind: "pr", workspace, number: Number(number) }
            : mode === "branches"
              ? { kind: "branches", workspace, base, head }
              : { kind: "text", text: input.text },
      };
    }
    case "flyoff":
      return {
        projectId: project.id,
        kind: "flyoff",
        requirement: input.text,
        documents: [],
      };
    case "blackbox":
      return {
        projectId: project.id,
        kind: "blackbox",
        workspaces: all,
        incident: input.text,
        requirement: "",
        documents: [],
      };
    case "engineout":
      return {
        projectId: project.id,
        kind: "engineout",
        workspaces: all,
        requirement: "",
        documents: [],
        outage: {
          part: input.outage.part.trim(),
          mode: input.outage.mode,
          label: input.outage.label.trim() || input.outage.part.trim(),
        },
      };
    case "dogfight":
      return {
        projectId: project.id,
        kind: "dogfight",
        workspaces: all,
        requirement: "",
        documents: [],
        dogfight: input.dogfight,
      };
    case "preflight":
      return {
        projectId: project.id,
        kind: "preflight",
        workspaces: all,
        requirement: input.text,
        documents: [],
      };
  }
}
