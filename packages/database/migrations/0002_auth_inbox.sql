CREATE TABLE "auth_rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_attempts_positive" CHECK ("auth_rate_limit"."attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "inbox_item" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "inbox_item" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbox_item" ADD COLUMN "request_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "idle_expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "rotated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "previous_token_hash" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "previous_valid_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "auth_rate_limit_expiry_idx" ON "auth_rate_limit" USING btree ("resets_at");--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_owner_request_key" UNIQUE("user_id","request_id");--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_previous_token_hash_unique" UNIQUE("previous_token_hash");