ALTER TABLE "projects" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "workspaces" jsonb DEFAULT '[]'::jsonb NOT NULL;