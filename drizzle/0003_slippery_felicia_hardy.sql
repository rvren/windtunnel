CREATE TABLE "connections" (
	"provider" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"account" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"run_id" uuid NOT NULL,
	"work_order_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"url" text,
	"error" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "deliveries_run_id_work_order_id_provider_pk" PRIMARY KEY("run_id","work_order_id","provider")
);
--> statement-breakpoint
CREATE TABLE "project_links" (
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_links_project_id_provider_pk" PRIMARY KEY("project_id","provider")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;