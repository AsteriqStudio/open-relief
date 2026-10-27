ALTER TABLE "transactions" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idempotency_key_unique" ON "transactions" USING btree ("idempotency_key");