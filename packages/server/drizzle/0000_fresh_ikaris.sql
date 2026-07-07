CREATE TABLE "fcm_tokens" (
	"user_id" varchar NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fcm_tokens_user_id_token_pk" PRIMARY KEY("user_id","token")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_a_id" varchar NOT NULL,
	"user_b_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_a_id_user_b_id_pk" PRIMARY KEY("user_a_id","user_b_id"),
	CONSTRAINT "friendships_canonical_order" CHECK ("friendships"."user_a_id" < "friendships"."user_b_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(28) NOT NULL,
	"passhash" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX "friendships_user_b_id_idx" ON "friendships" USING btree ("user_b_id");