CREATE TYPE "public"."direction_status" AS ENUM('planned', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."energy_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('inbox', 'planned', 'in_progress', 'completed', 'deferred', 'cancelled');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"spiritual" boolean DEFAULT false NOT NULL,
	CONSTRAINT "category_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "category_slug" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "auth_credential" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_big_three" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"outcome" text NOT NULL,
	"task_id" uuid,
	"completed_at" timestamp with time zone,
	CONSTRAINT "big_three_position" UNIQUE("plan_id","position"),
	CONSTRAINT "big_three_limit" CHECK ("daily_big_three"."position" between 1 and 3),
	CONSTRAINT "big_three_outcome" CHECK (length(trim("daily_big_three"."outcome")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "daily_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_date" date NOT NULL,
	"time_zone" text NOT NULL,
	"one_thing" text,
	"closed_at" timestamp with time zone,
	CONSTRAINT "daily_plan_date" UNIQUE("user_id","local_date"),
	CONSTRAINT "plan_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "one_thing_length" CHECK ("daily_plan"."one_thing" is null or length(trim("daily_plan"."one_thing")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "focus_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" uuid,
	"category_id" uuid,
	"objective" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"planned_minutes" integer NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"notes" text,
	CONSTRAINT "focus_duration" CHECK ("focus_session"."planned_minutes" > 0 and "focus_session"."active_seconds" >= 0 and ("focus_session"."ended_at" is null or "focus_session"."ended_at" >= "focus_session"."started_at"))
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vision_id" uuid,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"target_date" date,
	"status" "direction_status" DEFAULT 'planned' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"target_value" numeric(18, 4),
	"current_value" numeric(18, 4),
	"unit" text,
	CONSTRAINT "goal_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "goal_priority" CHECK ("goal"."priority" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "inbox_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body" text NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inbox_body_length" CHECK (length(trim("inbox_item"."body")) between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_date" date,
	"completed_at" timestamp with time zone,
	CONSTRAINT "milestone_owner_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"milestone_id" uuid,
	"goal_id" uuid,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"status" "direction_status" DEFAULT 'planned' NOT NULL,
	"starts_on" date,
	"target_date" date,
	CONSTRAINT "project_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "project_single_parent" CHECK (not ("project"."goal_id" is not null and "project"."milestone_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "schedule_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "schedule_duration" CHECK ("schedule_block"."ends_at" > "schedule_block"."starts_at"),
	CONSTRAINT "schedule_kind" CHECK ("schedule_block"."kind" in ('task','focus','routine','meeting','training','custom'))
);
--> statement-breakpoint
CREATE TABLE "season_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"season_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"percent" integer NOT NULL,
	CONSTRAINT "allocation_category" UNIQUE("season_id","category_id"),
	CONSTRAINT "allocation_percent" CHECK ("season_allocation"."percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"objective" text NOT NULL,
	"success_criteria" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "direction_status" DEFAULT 'planned' NOT NULL,
	CONSTRAINT "season_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "season_dates" CHECK ("season"."ends_on" >= "season"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"token_hash" text NOT NULL,
	"client" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "session_client" CHECK ("auth_session"."client" in ('web','desktop'))
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid,
	"goal_id" uuid,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"status" "work_status" DEFAULT 'inbox' NOT NULL,
	"due_at" timestamp with time zone,
	"estimate_minutes" integer,
	"actual_minutes" integer,
	"impact" integer DEFAULT 0 NOT NULL,
	"urgency" integer DEFAULT 0 NOT NULL,
	"opportunity" integer DEFAULT 0 NOT NULL,
	"goal_alignment" integer DEFAULT 0 NOT NULL,
	"energy" "energy_level" DEFAULT 'medium' NOT NULL,
	CONSTRAINT "task_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "task_single_parent" CHECK (not ("task"."goal_id" is not null and "task"."project_id" is not null)),
	CONSTRAINT "task_scores" CHECK ("task"."impact" between 0 and 5 and "task"."urgency" between 0 and 5 and "task"."opportunity" between 0 and 5 and "task"."goal_alignment" between 0 and 5),
	CONSTRAINT "task_durations" CHECK (("task"."estimate_minutes" is null or "task"."estimate_minutes" > 0) and ("task"."actual_minutes" is null or "task"."actual_minutes" >= 0))
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "email_normalized" CHECK ("app_user"."email" = lower(trim("app_user"."email")))
);
--> statement-breakpoint
CREATE TABLE "vision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "vision_owner_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_credential" ADD CONSTRAINT "auth_credential_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_big_three" ADD CONSTRAINT "daily_big_three_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_big_three" ADD CONSTRAINT "daily_big_three_plan_id_user_id_daily_plan_id_user_id_fk" FOREIGN KEY ("plan_id","user_id") REFERENCES "public"."daily_plan"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_big_three" ADD CONSTRAINT "daily_big_three_task_id_user_id_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."task"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan" ADD CONSTRAINT "daily_plan_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_session_task_id_user_id_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."task"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_session_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_vision_id_user_id_vision_id_user_id_fk" FOREIGN KEY ("vision_id","user_id") REFERENCES "public"."vision"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_goal_id_user_id_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goal"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_goal_id_user_id_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goal"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_milestone_id_user_id_milestone_id_user_id_fk" FOREIGN KEY ("milestone_id","user_id") REFERENCES "public"."milestone"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_task_id_user_id_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."task"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_allocation" ADD CONSTRAINT "season_allocation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_allocation" ADD CONSTRAINT "season_allocation_season_id_user_id_season_id_user_id_fk" FOREIGN KEY ("season_id","user_id") REFERENCES "public"."season"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_allocation" ADD CONSTRAINT "season_allocation_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_user_id_project_id_user_id_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."project"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_goal_id_user_id_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goal"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision" ADD CONSTRAINT "vision_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "big_three_user_idx" ON "daily_big_three" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_focus_per_user" ON "focus_session" USING btree ("user_id") WHERE "focus_session"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "focus_user_start_idx" ON "focus_session" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "goal_user_status_idx" ON "goal" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "inbox_user_created_idx" ON "inbox_item" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "milestone_goal_idx" ON "milestone" USING btree ("goal_id","user_id");--> statement-breakpoint
CREATE INDEX "project_user_status_idx" ON "project" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "schedule_user_start_idx" ON "schedule_block" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "allocation_user_idx" ON "season_allocation" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_season_per_user" ON "season" USING btree ("user_id") WHERE "season"."status" = 'active';--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expiry_idx" ON "auth_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "task_user_status_due_idx" ON "task" USING btree ("user_id","status","due_at");