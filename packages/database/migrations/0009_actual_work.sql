CREATE TABLE "work_time_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"before" text NOT NULL,
	"after" text NOT NULL,
	CONSTRAINT "work_change_kind" CHECK ("work_time_change"."kind" in ('correct','reset','discard','confirm'))
);
--> statement-breakpoint
ALTER TABLE "focus_interval" ADD COLUMN "excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "active_milliseconds" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "timer_mode" text DEFAULT 'countdown' NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "credited_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "work_target_minutes" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "work_target_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_time_change" ADD CONSTRAINT "work_time_change_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_time_change" ADD CONSTRAINT "work_time_change_session_id_user_id_focus_session_id_user_id_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."focus_session"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_change_session" ON "work_time_change" USING btree ("user_id","session_id","created_at");--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_work_fields" CHECK ("focus_session"."active_milliseconds" >= 0 and "focus_session"."active_milliseconds" <= 2000000000000 and "focus_session"."credited_minutes" >= 0 and "focus_session"."timer_mode" in ('countdown','stopwatch') and ("focus_session"."discarded_at" is null or ("focus_session"."ended_at" is not null and "focus_session"."resumed_at" is null)));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "work_target_range" CHECK ("app_user"."work_target_minutes" between 1 and 1440 and "app_user"."work_target_version" >= 0);
--> statement-breakpoint
-- Preserve recorded legacy totals; retain sub-second precision from existing closed intervals.
UPDATE focus_session f SET active_milliseconds = greatest(f.active_seconds::bigint*1000,
  coalesce((select floor(sum(extract(epoch from (i.ends_at-i.starts_at))*1000))::bigint
    from focus_interval i where i.session_id=f.id and i.user_id=f.user_id and i.ends_at is not null),0));
