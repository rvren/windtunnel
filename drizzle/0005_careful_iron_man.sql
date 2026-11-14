ALTER TABLE "issues" ADD COLUMN "origin" text DEFAULT 'code' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_parent_run_id_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_parent_idx" ON "runs" USING btree ("parent_run_id");--> statement-breakpoint
UPDATE "issues" SET "origin" = CASE WHEN "runs"."data" ? 'source' THEN 'code' ELSE 'requirement' END FROM "runs" WHERE "runs"."id" = "issues"."first_run_id";
