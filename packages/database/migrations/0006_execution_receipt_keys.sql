ALTER TABLE "execution_receipt" ADD COLUMN "request_id" uuid;
--> statement-breakpoint
UPDATE "execution_receipt" SET "request_id" = "id";
--> statement-breakpoint
ALTER TABLE "execution_receipt" ALTER COLUMN "request_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_receipt" ADD CONSTRAINT "execution_receipt_request_key" UNIQUE("user_id","request_id");
