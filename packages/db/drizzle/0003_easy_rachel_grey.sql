ALTER TABLE "bills" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "stripe_charge_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_email_payload" jsonb;