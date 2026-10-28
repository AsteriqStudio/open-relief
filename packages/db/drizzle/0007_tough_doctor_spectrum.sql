CREATE TABLE "sponsorship_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"matched_amount_cents" integer NOT NULL,
	"fee_buffer_applied_cents" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsorship_allocations_amounts_check" CHECK ("sponsorship_allocations"."matched_amount_cents" >= 0 AND "sponsorship_allocations"."fee_buffer_applied_cents" >= 0 AND ("sponsorship_allocations"."matched_amount_cents" > 0 OR "sponsorship_allocations"."fee_buffer_applied_cents" > 0)),
	CONSTRAINT "sponsorship_allocations_status_check" CHECK ("sponsorship_allocations"."status" IN ('reserved', 'settled', 'released'))
);
--> statement-breakpoint
CREATE TABLE "sponsorship_pools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sponsor_name" text NOT NULL,
	"sponsor_logo_url" text,
	"match_ratio" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"total_match_budget_cents" integer NOT NULL,
	"remaining_match_budget_cents" integer NOT NULL,
	"total_fee_buffer_cents" integer DEFAULT 0 NOT NULL,
	"remaining_fee_buffer_cents" integer DEFAULT 0 NOT NULL,
	"target_category" "bill_category",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsorship_pools_balances_check" CHECK ("sponsorship_pools"."total_match_budget_cents" >= 0 AND "sponsorship_pools"."remaining_match_budget_cents" >= 0 AND "sponsorship_pools"."remaining_match_budget_cents" <= "sponsorship_pools"."total_match_budget_cents" AND "sponsorship_pools"."total_fee_buffer_cents" >= 0 AND "sponsorship_pools"."remaining_fee_buffer_cents" >= 0 AND "sponsorship_pools"."remaining_fee_buffer_cents" <= "sponsorship_pools"."total_fee_buffer_cents" AND "sponsorship_pools"."match_ratio" > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sponsor_match_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsorship_allocations" ADD CONSTRAINT "sponsorship_allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_allocations" ADD CONSTRAINT "sponsorship_allocations_pool_id_sponsorship_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."sponsorship_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsorship_allocations_transaction_unique" ON "sponsorship_allocations" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "sponsorship_allocations_pool_idx" ON "sponsorship_allocations" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "sponsorship_pools_target_idx" ON "sponsorship_pools" USING btree ("active","target_category");