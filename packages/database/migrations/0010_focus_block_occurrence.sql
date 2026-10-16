ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_owner_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "focus_session" ADD COLUMN "schedule_block_id" uuid;--> statement-breakpoint
ALTER TABLE "focus_session" ADD CONSTRAINT "focus_session_schedule_block_id_user_id_schedule_block_id_user_id_fk" FOREIGN KEY ("schedule_block_id","user_id") REFERENCES "public"."schedule_block"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_owner_block_idx" ON "focus_session" USING btree ("user_id","schedule_block_id","created_at");
