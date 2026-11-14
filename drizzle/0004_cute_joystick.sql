CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"state" text NOT NULL,
	"path" text,
	"cwe" text,
	"first_run_id" uuid,
	"last_run_id" uuid,
	"last_group_id" text,
	"verified_run_id" uuid,
	"pr" jsonb,
	"opened_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"fixed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_first_run_id_runs_id_fk" FOREIGN KEY ("first_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_last_run_id_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_verified_run_id_runs_id_fk" FOREIGN KEY ("verified_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_project_idx" ON "issues" USING btree ("project_id");