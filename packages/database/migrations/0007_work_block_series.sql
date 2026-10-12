CREATE TABLE "schedule_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"project_id" uuid,
	"category_id" uuid,
	"objective" text DEFAULT '' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"days" text NOT NULL,
	"time_zone" text NOT NULL,
	CONSTRAINT "schedule_series_owner_key" UNIQUE("id","user_id"),
	CONSTRAINT "series_single_parent" CHECK ("schedule_series"."task_id" is null or "schedule_series"."project_id" is null),
	CONSTRAINT "series_range" CHECK ("schedule_series"."ends_on" >= "schedule_series"."starts_on" and "schedule_series"."ends_on" - "schedule_series"."starts_on" <= 365),
	CONSTRAINT "series_kind" CHECK ("schedule_series"."kind" in ('task','focus','routine','meeting','training','custom'))
);
--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "objective" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD COLUMN "skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_task_id_user_id_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."task"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_project_id_user_id_project_id_user_id_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."project"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_user_idx" ON "schedule_series" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_series_id_user_id_schedule_series_id_user_id_fk" FOREIGN KEY ("series_id","user_id") REFERENCES "public"."schedule_series"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_project_id_user_id_project_id_user_id_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."project"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_category_id_user_id_category_id_user_id_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."category"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_series_date_key" UNIQUE("series_id","occurrence_date");--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_single_parent" CHECK ("schedule_block"."task_id" is null or "schedule_block"."project_id" is null);--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_series_occurrence" CHECK (("schedule_block"."series_id" is null and "schedule_block"."occurrence_date" is null) or ("schedule_block"."series_id" is not null and "schedule_block"."occurrence_date" is not null));
--> statement-breakpoint
CREATE TRIGGER schedule_series_touch_updated_at BEFORE UPDATE ON schedule_series FOR EACH ROW EXECUTE FUNCTION life_os_touch_updated_at();
