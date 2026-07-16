CREATE TABLE "conversation_members" (
	"conversation_id" bigint NOT NULL,
	"user_id" varchar NOT NULL,
	"last_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" varchar(16) DEFAULT 'direct' NOT NULL,
	"user_a_id" varchar,
	"user_b_id" varchar,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "conversation_id" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_user_id" varchar;--> statement-breakpoint
CREATE INDEX "conversation_members_inbox_idx" ON "conversation_members" USING btree ("user_id","last_message_id" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_pair_uq" ON "conversations" USING btree ("user_a_id","user_b_id") WHERE "conversations"."type" = 'direct';--> statement-breakpoint
-- ================= DATA BACKFILL (hand-authored; drizzle-kit only produces the DDL above) =========
-- Move existing directional messages into the conversation-centric model. One direct conversation
-- per existing friendship; messages routed to it by canonical pair; the sort pointer seeded.
-- 1) One direct conversation per friendship (friendships is already canonical user_a_id < user_b_id).
INSERT INTO "conversations" ("type", "user_a_id", "user_b_id", "created_at")
SELECT 'direct', "user_a_id", "user_b_id", "created_at" FROM "friendships";--> statement-breakpoint
-- 2) Two member rows per direct conversation (both participants), member-since = conversation birth.
INSERT INTO "conversation_members" ("conversation_id", "user_id", "created_at")
SELECT "id", "user_a_id", "created_at" FROM "conversations" WHERE "type" = 'direct';--> statement-breakpoint
INSERT INTO "conversation_members" ("conversation_id", "user_id", "created_at")
SELECT "id", "user_b_id", "created_at" FROM "conversations" WHERE "type" = 'direct';--> statement-breakpoint
-- 3) sender_user_id is just the old from_user_id.
UPDATE "messages" SET "sender_user_id" = "from_user_id";--> statement-breakpoint
-- 4) Route each message to its pair's direct conversation.
UPDATE "messages" m SET "conversation_id" = c."id"
FROM "conversations" c
WHERE c."type" = 'direct'
  AND LEAST(m."from_user_id", m."to_user_id") = c."user_a_id"
  AND GREATEST(m."from_user_id", m."to_user_id") = c."user_b_id";--> statement-breakpoint
-- 5) Drop any orphan messages whose pair is no longer a friendship (their conversation never existed;
--    removing a friend already deletes the conversation, so this should be a no-op in practice).
DELETE FROM "messages" WHERE "conversation_id" IS NULL;--> statement-breakpoint
-- 6) Seed the denormalised sort pointer: each member's last_message_id = the conversation's newest id.
UPDATE "conversation_members" cm SET "last_message_id" = sub."max_id"
FROM (SELECT "conversation_id", MAX("id") AS "max_id" FROM "messages" GROUP BY "conversation_id") sub
WHERE cm."conversation_id" = sub."conversation_id";