import { bigserial, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Messaging context.
// A conversation is the addressable unit a message belongs to — NOT a user pair. A 1:1 chat is a
// 2-member conversation; a group is an N-member one. This is what lets a single message be one
// INSERT + one bounded member-row bump regardless of participant count (see conversation_members).
// Soft user_id refs, no FK (per roadmap principle 2 — cross-context references stay soft).
export const conversations = pgTable(
    "conversations",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        // 'direct' (1:1) or 'group'. A direct conversation carries the canonical member pair below
        // so it can be found / deduped by (user_a_id, user_b_id); group conversations leave them
        // null and resolve membership through conversation_members only.
        type: varchar("type", { length: 16 }).notNull().default("direct"),
        user_a_id: varchar("user_a_id"),
        user_b_id: varchar("user_b_id"),
        title: text("title"),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        // At most one direct conversation per canonical pair (user_a_id < user_b_id, enforced by the
        // caller with LEAST/GREATEST — mirrors friendships). Partial index: groups are exempt.
        uniqueIndex("conversations_direct_pair_uq")
            .on(t.user_a_id, t.user_b_id)
            .where(sql`${t.type} = 'direct'`),
    ],
);

export type Conversation = typeof conversations.$inferSelect;
