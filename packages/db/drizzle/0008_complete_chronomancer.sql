CREATE TABLE "pitch_demo_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"region" text NOT NULL,
	"payload" jsonb NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pitch_demo_cards_currency_check" CHECK ("pitch_demo_cards"."currency" IN ('USD', 'EUR')),
	CONSTRAINT "pitch_demo_cards_region_check" CHECK ("pitch_demo_cards"."region" IN ('US', 'DE'))
);
