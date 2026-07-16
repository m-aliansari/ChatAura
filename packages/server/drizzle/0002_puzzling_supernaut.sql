-- Add users.full_name in three steps so the migration is safe on a table that already has rows:
-- add the column nullable, backfill each existing account's display name to its username, then
-- enforce NOT NULL. (drizzle-kit generated a single NOT NULL ADD COLUMN, which would fail on
-- non-empty data — this hand-edit adds the backfill.)
ALTER TABLE "users" ADD COLUMN "full_name" varchar(60);--> statement-breakpoint
UPDATE "users" SET "full_name" = "username" WHERE "full_name" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL;
