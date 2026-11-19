import {
  OUTAGE_MODES,
  RUN_KINDS,
  type ChangeInput,
  type OutageMode,
  type RunKind,
} from "../schema";

/*
 * What a request to start a run of a newer kind must carry, checked before
 * anything starts. Pure.
 */

export const KIND_LIMITS = { changeChars: 4_000, incidentChars: 8_000 };

export type KindInput =
  | {
      ok: true;
      kind: RunKind;
      change?: ChangeInput;
      incident?: string;
      outage?: { part: string; mode: OutageMode; label?: string };
      dogfight?: { runId: string; groupId: string; label?: string };
    }
  | { ok: false; error: string };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * The kind and its input. `workspaces` are the names of the workspaces the
 * run reads (none for a requirement run).
 */
export function parseKind(
  body: Record<string, unknown>,
  workspaces: string[] | null,
): KindInput {
  const given = body.kind ?? "audit";
  if (typeof given !== "string" || !RUN_KINDS.includes(given as RunKind)) {
    return { ok: false, error: "That is not a kind of run Windtunnel knows." };
  }
  const kind = given as RunKind;
  if (kind === "audit") return { ok: true, kind };

  if (kind === "flyoff") {
    if (workspaces) {
      return {
        ok: false,
        error: "A fly-off designs a requirement: start it without workspaces.",
      };
    }
    return { ok: true, kind };
  }

  if (!workspaces) {
    return {
      ok: false,
      error:
        kind === "crosswind"
          ? "Crosswind reads a project's code: choose its workspaces."
          : kind === "engineout"
            ? "Engine Out reads a project's code: choose its workspaces."
            : kind === "dogfight"
              ? "A Dogfight reads a project's code: choose its workspaces."
              : kind === "preflight"
                ? "Preflight checks a spec against a project's code: choose its workspaces."
                : "A black box run reads a project's code: choose its workspaces.",
    };
  }

  if (kind === "preflight") return { ok: true, kind };

  if (kind === "dogfight") {
    const fight = (body.dogfight ?? null) as Record<string, unknown> | null;
    const runId = text(fight?.runId);
    const groupId = text(fight?.groupId);
    if (!/^[0-9a-f-]{36}$/i.test(runId) || !groupId || groupId.length > 120) {
      return { ok: false, error: "Choose the security issue to defend." };
    }
    const label = text(fight?.label).slice(0, 160);
    return {
      ok: true,
      kind,
      dogfight: { runId, groupId, ...(label ? { label } : {}) },
    };
  }

  if (kind === "engineout") {
    const outage = (body.outage ?? null) as Record<string, unknown> | null;
    const part = text(outage?.part);
    const mode = outage?.mode;
    if (!part || part.length > 120) {
      return { ok: false, error: "Choose the part to cut." };
    }
    if (!OUTAGE_MODES.includes(mode as OutageMode)) {
      return { ok: false, error: "Say whether the part is down or slow." };
    }
    const label = text(outage?.label).slice(0, 120);
    return {
      ok: true,
      kind,
      outage: {
        part,
        mode: mode as OutageMode,
        ...(label ? { label } : {}),
      },
    };
  }

  if (kind === "blackbox") {
    const incident = text(body.incident);
    if (!incident) {
      return {
        ok: false,
        error:
          "Paste the production feedback: an error, a stack trace or a note.",
      };
    }
    if (incident.length > KIND_LIMITS.incidentChars) {
      return {
        ok: false,
        error: `Keep the feedback under ${KIND_LIMITS.incidentChars.toLocaleString("en")} characters.`,
      };
    }
    return { ok: true, kind, incident };
  }

  // Crosswind.
  const change = (body.change ?? null) as Record<string, unknown> | null;
  if (!change || typeof change !== "object") {
    return {
      ok: false,
      error: "Say what changes: a pull request, branches or words.",
    };
  }
  if (change.kind === "text") {
    const words = text(change.text);
    if (!words) return { ok: false, error: "Describe the change." };
    if (words.length > KIND_LIMITS.changeChars) {
      return {
        ok: false,
        error: `Keep the change under ${KIND_LIMITS.changeChars.toLocaleString("en")} characters.`,
      };
    }
    return { ok: true, kind, change: { kind: "text", text: words } };
  }
  const workspace = text(change.workspace);
  if (!workspaces.includes(workspace)) {
    return { ok: false, error: "Choose the workspace the change is in." };
  }
  if (change.kind === "pr") {
    const number = Number(change.number);
    if (!Number.isInteger(number) || number < 1) {
      return { ok: false, error: "Give the pull request's number." };
    }
    return { ok: true, kind, change: { kind: "pr", workspace, number } };
  }
  if (change.kind === "branches") {
    const base = text(change.base);
    const head = text(change.head);
    const branch = /^[\w./-]{1,200}$/;
    if (!branch.test(base) || !branch.test(head) || base === head) {
      return { ok: false, error: "Give two different branch names." };
    }
    return {
      ok: true,
      kind,
      change: { kind: "branches", workspace, base, head },
    };
  }
  return {
    ok: false,
    error: "Say what changes: a pull request, branches or words.",
  };
}
