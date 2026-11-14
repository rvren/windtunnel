import type { Coverage, DesignModel, Gap, GapKind } from "./schema";

/*
 * The mechanical gap finder. It reads the design model and lists the holes
 * that need no judgement to see: a role with no rule for an operation, an
 * operation with no failure behaviour, a thing with no limit. No model call.
 *
 * It also tidies the model first, because the rest of the engine trusts the
 * ids in it.
 */

/** Every id an agent or the judge may cite: model items and gaps. */
export function modelIds(model: DesignModel): Set<string> {
  return new Set([
    ...model.roles.map((item) => item.id),
    ...model.entities.map((item) => item.id),
    ...model.operations.map((item) => item.id),
    ...model.rules.map((item) => item.id),
    ...model.journeys.map((item) => item.id),
  ]);
}

/**
 * Removes anything that would make an id ambiguous or point at nothing:
 * repeated ids, and references to roles, entities or operations that are not
 * in the model. Returns the tidy model and a note for each thing removed.
 */
export function normalizeModel(model: DesignModel): {
  model: DesignModel;
  warnings: string[];
} {
  const warnings: string[] = [];
  const seen = new Set<string>();

  function unique<T extends { id: string }>(items: T[], kind: string): T[] {
    return items.filter((item) => {
      if (seen.has(item.id)) {
        warnings.push(`Dropped a second ${kind} with the id "${item.id}".`);
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  const roles = unique(model.roles, "role");
  const entities = unique(model.entities, "entity");
  const operations = unique(model.operations, "operation");
  const rules = unique(model.rules, "rule");
  const journeys = unique(model.journeys, "journey");

  const roleIds = new Set(roles.map((role) => role.id));
  const entityIds = new Set(entities.map((entity) => entity.id));
  const operationIds = new Set(operations.map((operation) => operation.id));

  function known(ids: string[], pool: Set<string>, owner: string): string[] {
    return ids.filter((id) => {
      if (pool.has(id)) return true;
      warnings.push(`${owner} referred to "${id}", which is not in the model.`);
      return false;
    });
  }

  const cells = new Set<string>();
  const permissions = model.permissions.filter((permission) => {
    const label = `A permission for "${permission.operationId}" and "${permission.roleId}"`;
    if (
      !operationIds.has(permission.operationId) ||
      !roleIds.has(permission.roleId)
    ) {
      warnings.push(`${label} was dropped: one of them is not in the model.`);
      return false;
    }
    const cell = `${permission.operationId}|${permission.roleId}`;
    if (cells.has(cell)) {
      warnings.push(`${label} was given twice; the first one was kept.`);
      return false;
    }
    cells.add(cell);
    return true;
  });

  return {
    warnings,
    model: {
      summary: model.summary,
      roles,
      entities,
      rules,
      permissions,
      operations: operations.map((operation) => ({
        ...operation,
        entityIds: known(
          operation.entityIds,
          entityIds,
          `Operation "${operation.id}"`,
        ),
      })),
      journeys: journeys
        .filter((journey) => {
          if (roleIds.has(journey.roleId)) return true;
          warnings.push(
            `Journey "${journey.id}" was dropped: its role "${journey.roleId}" is not in the model.`,
          );
          return false;
        })
        .map((journey) => ({
          ...journey,
          operationIds: known(
            journey.operationIds,
            operationIds,
            `Journey "${journey.id}"`,
          ),
        })),
    },
  };
}

/** Finds the gaps. Expects a model that `normalizeModel` has tidied. */
export function findCoverage(model: DesignModel): Coverage {
  const gaps: Gap[] = [];
  const add = (kind: GapKind, refs: string[], text: string) =>
    gaps.push({ id: `gap-${gaps.length + 1}`, kind, refs, text });

  const cell = (operationId: string, roleId: string) =>
    `${operationId}|${roleId}`;
  const specified = new Set(
    model.permissions.map((permission) =>
      cell(permission.operationId, permission.roleId),
    ),
  );

  for (const operation of model.operations) {
    for (const role of model.roles) {
      if (!specified.has(cell(operation.id, role.id))) {
        add(
          "permission_unspecified",
          [operation.id, role.id],
          `The design does not say whether ${role.name} may ${operation.name}.`,
        );
      }
    }
  }

  for (const permission of model.permissions) {
    if (permission.effect === "conditional" && !permission.condition?.trim()) {
      add(
        "condition_missing",
        [permission.operationId, permission.roleId],
        `"${permission.operationId}" is conditional for "${permission.roleId}", but the condition is not given.`,
      );
    }
  }

  for (const operation of model.operations) {
    if (!operation.failureBehaviour?.trim()) {
      add(
        "failure_unspecified",
        [operation.id],
        `The design does not say what happens when ${operation.name} fails part-way.`,
      );
    }
  }

  for (const entity of model.entities) {
    if (!entity.limit?.trim()) {
      add(
        "limit_unspecified",
        [entity.id],
        `The design sets no limit on how many ${entity.name} there can be.`,
      );
    }
  }

  const inJourney = new Set(
    model.journeys.flatMap((journey) => journey.operationIds),
  );
  for (const operation of model.operations) {
    if (!inJourney.has(operation.id)) {
      add(
        "operation_without_journey",
        [operation.id],
        `No journey uses ${operation.name}.`,
      );
    }
  }

  const withJourney = new Set(model.journeys.map((journey) => journey.roleId));
  for (const role of model.roles) {
    if (!withJourney.has(role.id)) {
      add(
        "role_without_journey",
        [role.id],
        `${role.name} has no journey of its own.`,
      );
    }
  }

  const sourced = [
    ...model.roles,
    ...model.entities,
    ...model.operations,
    ...model.permissions,
    ...model.rules,
    ...model.journeys,
  ];
  const assumedItems = sourced.filter(
    (item) => item.source === "assumed",
  ).length;

  return {
    gaps,
    stats: {
      roles: model.roles.length,
      operations: model.operations.length,
      permissionCells: model.roles.length * model.operations.length,
      specifiedCells: specified.size,
      assumedItems,
      statedItems: sourced.length - assumedItems,
    },
  };
}
