CREATE TYPE "public"."assistance_program" AS ENUM('SNAP', 'MEDICAID', 'LIHEAP', 'NONE');--> statement-breakpoint
ALTER TYPE "public"."bill_status" ADD VALUE 'pending_review' BEFORE 'verified';--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "account_holder_name" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "is_shutoff_notice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "days_until_disconnection" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lifetime_aid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_aid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "assistance_program" "assistance_program" DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_lifetime_aid_check" CHECK ("users"."lifetime_aid_cents" >= 0);