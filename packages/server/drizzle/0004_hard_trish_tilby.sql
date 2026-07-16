DROP INDEX "messages_from_to_id_idx";--> statement-breakpoint
DROP INDEX "messages_to_from_id_idx";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_user_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_conversation_id_id_idx" ON "messages" USING btree ("conversation_id","id");--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "from_user_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "to_user_id";