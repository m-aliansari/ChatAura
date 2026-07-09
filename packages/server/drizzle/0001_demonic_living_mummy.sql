CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"message_id" varchar NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX "messages_from_to_id_idx" ON "messages" USING btree ("from_user_id","to_user_id","id");--> statement-breakpoint
CREATE INDEX "messages_to_from_id_idx" ON "messages" USING btree ("to_user_id","from_user_id","id");