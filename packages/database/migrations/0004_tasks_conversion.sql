ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_owner_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "priority" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "source_inbox_id" uuid;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "conversion_hash" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_source_inbox_id_user_id_inbox_item_id_user_id_fk" FOREIGN KEY ("source_inbox_id","user_id") REFERENCES "public"."inbox_item"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_source_inbox_key" UNIQUE("user_id","source_inbox_id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_priority" CHECK ("task"."priority" between 1 and 5);--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_conversion_provenance" CHECK (("task"."source_inbox_id" is null and "task"."conversion_hash" is null) or ("task"."source_inbox_id" is not null and "task"."conversion_hash" is not null and "task"."conversion_hash" ~ '^[0-9a-f]{64}$'));
