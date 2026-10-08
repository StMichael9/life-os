CREATE TABLE "execution_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"result" text NOT NULL,
	CONSTRAINT "execution_receipt_owner_key" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "routine_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"routine_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"notes" text,
	CONSTRAINT "routine_day_key" UNIQUE("routine_id","local_date")
);
--> statement-breakpoint
CREATE TABLE "routine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"days" text NOT NULL,
	"spiritual" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "routine_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "routine_days" CHECK ("routine"."days" ~ '^[0-6](,[0-6])*$')
);
--> statement-breakpoint
CREATE TABLE "vault_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"kind" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"source_inbox_id" uuid,
	"converted_task_id" uuid,
	CONSTRAINT "vault_source_key" UNIQUE("user_id","source_inbox_id"),
	CONSTRAINT "vault_kind" CHECK ("vault_item"."kind" in ('idea','someday','not_now','research','career','business','personal','scripture','thought'))
);
--> statement-breakpoint
ALTER TABLE "daily_plan" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_plan" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_plan" ADD COLUMN "morning" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_plan" ADD COLUMN "evening" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "resumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_receipt" ADD CONSTRAINT "execution_receipt_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_completion" ADD CONSTRAINT "routine_completion_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_completion" ADD CONSTRAINT "routine_completion_routine_id_user_id_routine_id_user_id_fk" FOREIGN KEY ("routine_id","user_id") REFERENCES "public"."routine"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine" ADD CONSTRAINT "routine_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_source_inbox_id_user_id_inbox_item_id_user_id_fk" FOREIGN KEY ("source_inbox_id","user_id") REFERENCES "public"."inbox_item"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_converted_task_id_user_id_task_id_user_id_fk" FOREIGN KEY ("converted_task_id","user_id") REFERENCES "public"."task"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_completion_day_idx" ON "routine_completion" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "routine_owner_idx" ON "routine" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vault_owner_created_idx" ON "vault_item" USING btree ("user_id","created_at","id");--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_session_project_id_user_id_project_id_user_id_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."project"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_single_parent" CHECK (not ("focus_session"."project_id" is not null and "focus_session"."task_id" is not null));
--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_owner_key" UNIQUE("id","user_id");
--> statement-breakpoint
CREATE TABLE "focus_interval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	CONSTRAINT "focus_interval_dates" CHECK ("focus_interval"."ends_at" is null or "focus_interval"."ends_at" >= "focus_interval"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "focus_interval" ADD CONSTRAINT "focus_interval_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_interval" ADD CONSTRAINT "focus_interval_session_id_user_id_focus_session_id_user_id_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."focus_session"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_running_interval" ON "focus_interval" USING btree ("session_id") WHERE "focus_interval"."ends_at" is null;--> statement-breakpoint
CREATE INDEX "focus_interval_owner_start" ON "focus_interval" USING btree ("user_id","starts_at");--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "priority" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_priority" CHECK ("project"."priority" between 1 and 5);
--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "converted_goal_id" uuid;--> statement-breakpoint
ALTER TABLE "vault_item" ADD COLUMN "converted_project_id" uuid;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_converted_goal_id_user_id_goal_id_user_id_fk" FOREIGN KEY ("converted_goal_id","user_id") REFERENCES "public"."goal"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_converted_project_id_user_id_project_id_user_id_fk" FOREIGN KEY ("converted_project_id","user_id") REFERENCES "public"."project"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_single_conversion" CHECK (num_nonnulls("vault_item"."converted_task_id","vault_item"."converted_goal_id","vault_item"."converted_project_id") <= 1);
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['execution_receipt','routine','routine_completion','vault_item','focus_interval'] LOOP
 EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION life_os_touch_updated_at()',table_name);
 END LOOP; END; $$;
