ALTER TABLE "issues" ADD COLUMN "realized_by_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "schedule" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "schedule_hour" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "monthly_cap_usd" double precision;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "schedule_note" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "kind" text DEFAULT 'audit' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "requirement_run_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "counts" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_realized_by_issue_id_issues_id_fk" FOREIGN KEY ("realized_by_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_requirement_run_id_runs_id_fk" FOREIGN KEY ("requirement_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;