import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Three tables. Structured results are JSONB: their shape is owned by the Zod
// schemas in src/server/engine/schema.ts and will still change. The plain
// columns are what the Runs table sorts and filters on.

/** One application. Its workspaces together are the whole of it. */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** One repository inside a project: a frontend, a service, and so on. */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Where the code is: a RepoOrigin (GitHub address or local folder). */
    origin: jsonb("origin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("workspaces_project_name").on(table.projectId, table.name),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey(),
    /** The project this run belongs to, if any. The run outlives it. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    stage: text("stage"),
    title: text("title").notNull(),
    findingCount: integer("finding_count").notNull().default(0),
    workOrderCount: integer("work_order_count").notNull().default(0),
    error: text("error"),
    /** Everything else about the run: see RunRecord in the engine schema. */
    data: jsonb("data").notNull(),
  },
  (table) => [
    index("runs_created_at_idx").on(table.createdAt),
    index("runs_project_idx").on(table.projectId),
  ],
);

export const agentReports = pgTable(
  "agent_reports",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    status: text("status").notNull(),
    /** One AgentRun: scenarios, findings, dropped findings, token use. */
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.agentId] })],
);

export const runEvents = pgTable(
  "run_events",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    /** One RunEvent, replayed to a page that opens or reloads mid-run. */
    event: jsonb("event").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.seq] })],
);
