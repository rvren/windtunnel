CREATE TABLE "agent_reports" (
	"run_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "agent_reports_run_id_agent_id_pk" PRIMARY KEY("run_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"event" jsonb NOT NULL,
	CONSTRAINT "run_events_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"stage" text,
	"title" text NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"work_order_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_reports" ADD CONSTRAINT "agent_reports_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");