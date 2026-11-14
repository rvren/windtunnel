CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"origin" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspaces_project_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_project_idx" ON "runs" USING btree ("project_id");