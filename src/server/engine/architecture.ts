import type {
  Architecture,
  CodeLocation,
  Finding,
  FindingGroup,
  RunRecord,
} from "./schema";

/*
 * The checks on the architecture a model returns, and the two lookups the
 * cockpit needs: which workspace and which component a file belongs to.
 */

const cleanPath = (value: string) =>
  value
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");

/**
 * Tidies an architecture: one component per id, workspaces that exist,
 * connections that join two different components that exist, each once.
 */
export function normalizeArchitecture(
  raw: Architecture,
  workspaceNames: string[],
): { architecture: Architecture; warnings: string[] } {
  const warnings: string[] = [];
  const ids = new Set<string>();
  const components = raw.components
    .filter((component) => {
      if (ids.has(component.id)) {
        warnings.push(
          `Dropped a second component with the id "${component.id}".`,
        );
        return false;
      }
      ids.add(component.id);
      return true;
    })
    .map((component) => ({
      ...component,
      workspace:
        component.workspace && workspaceNames.includes(component.workspace)
          ? component.workspace
          : null,
      paths: component.paths.map(cleanPath).filter(Boolean),
    }));

  const seen = new Set<string>();
  const connections = raw.connections.filter((connection) => {
    const key = `${connection.from}>${connection.to}`;
    if (
      !ids.has(connection.from) ||
      !ids.has(connection.to) ||
      connection.from === connection.to
    ) {
      warnings.push(
        `Dropped a connection from "${connection.from}" to "${connection.to}": it does not join two components.`,
      );
      return false;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { architecture: { components, connections }, warnings };
}

/** The workspace a file is in: the first part of its path, in a project run. */
export function workspaceOf(
  path: string,
  workspaceNames: string[],
): string | null {
  const first = path.split("/")[0];
  return workspaceNames.includes(first) ? first : null;
}

/** The component a file belongs to: the one whose path matches most closely. */
export function componentOf(
  path: string,
  architecture: Architecture | undefined,
): string | null {
  let best: { id: string; length: number } | null = null;
  for (const component of architecture?.components ?? []) {
    for (const prefix of component.paths) {
      if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;
      if (!best || prefix.length > best.length) {
        best = { id: component.id, length: prefix.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * Where an accepted group's code is: the first of its findings that cites
 * code, or, for a group found by code (a secret), its own place. As the
 * Issues tab and the cockpit place it.
 */
export function groupLocation(
  group: FindingGroup,
  run: Pick<RunRecord, "agents">,
): CodeLocation | null {
  for (const uid of group.findingIds) {
    for (const agent of run.agents) {
      const finding = agent.findings.find((item) => item.uid === uid);
      if (finding?.location) return finding.location;
    }
  }
  return group.location ?? null;
}

/** Where a finding is, for the cockpit. Null when it cites no code. */
export function placeOf(
  finding: Finding,
  workspaceNames: string[],
  architecture: Architecture | undefined,
): { workspace: string | null; component: string | null } {
  const path = finding.location?.path;
  if (!path) return { workspace: null, component: null };
  return {
    workspace: workspaceOf(path, workspaceNames),
    component: componentOf(path, architecture),
  };
}
