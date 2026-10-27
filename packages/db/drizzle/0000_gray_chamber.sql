CREATE TYPE "public"."bill_category" AS ENUM('electric', 'water', 'gas', 'medical');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('pending_ocr', 'verified', 'funded', 'settled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('recipient', 'donor', 'admin');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"bill_id" uuid,
	"transaction_id" uuid,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_id" uuid NOT NULL,
	"biller_name" text,
	"biller_merchant_id" text,
	"biller_account_encrypted" text,
	"account_hash" text,
	"duplicate_fingerprint" text,
	"due_date" date,
	"statement_balance_cents" integer,
	"remaining_balance_cents" integer,
	"category" "bill_category" NOT NULL,
	"document_url" text NOT NULL,
	"document_key" text NOT NULL,
	"document_mime_type" text NOT NULL,
	"document_size_bytes" integer NOT NULL,
	"status" "bill_status" DEFAULT 'pending_ocr' NOT NULL,
	"fraud_score" real,
	"ocr_confidence" real,
	"zip_code" text,
	"story" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_document_size_check" CHECK ("bills"."document_size_bytes" > 0 AND "bills"."document_size_bytes" <= 10485760),
	CONSTRAINT "bills_balance_check" CHECK (("bills"."statement_balance_cents" IS NULL AND "bills"."remaining_balance_cents" IS NULL) OR ("bills"."statement_balance_cents" > 0 AND "bills"."remaining_balance_cents" >= 0 AND "bills"."remaining_balance_cents" <= "bills"."statement_balance_cents"))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bill_id" uuid NOT NULL,
	"donor_id" uuid NOT NULL,
	"amount_to_bill_cents" integer NOT NULL,
	"processing_fee_covered_cents" integer NOT NULL,
	"platform_tip_cents" integer NOT NULL,
	"total_charge_cents" integer NOT NULL,
	"stripe_fee_cents" integer NOT NULL,
	"net_platform_tip_cents" integer NOT NULL,
	"stripe_payment_intent_id" text,
	"method_disbursement_id" text,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_check" CHECK ("transactions"."amount_to_bill_cents" > 0 AND "transactions"."processing_fee_covered_cents" >= 0 AND "transactions"."platform_tip_cents" >= 0 AND "transactions"."total_charge_cents" >= "transactions"."amount_to_bill_cents")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_donor_id_users_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_bill_idx" ON "audit_logs" USING btree ("bill_id","created_at");--> statement-breakpoint
CREATE INDEX "bills_feed_idx" ON "bills" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "bills_duplicate_idx" ON "bills" USING btree ("duplicate_fingerprint","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_payment_intent_unique" ON "transactions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");