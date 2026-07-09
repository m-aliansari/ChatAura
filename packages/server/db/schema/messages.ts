import { bigserial, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Messaging context.
// Direct messages — one row per message (DIRECTIONAL: from_user_id -> to_user_id, so unlike
// friendships this is NOT canonicalised). Replaces the Redis dot-joined
// "messageId.to.from.content" strings — proper columns kill the delimiter bug and a single
// INSERT is atomic (fixes the old non-transactional dual lPush). Surrogate `id` (bigserial) is
// the ordering / pagination cursor; `message_id` (uuid) is the stable wire id the client
// dedupes on (two candidate keys, both load-bearing, like users.id + users.user_id). Soft
// user_id refs, no FK (keeps the messaging context separable per roadmap principle 2).
export const messages = pgTable(
    "messages",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        message_id: varchar("message_id").notNull().unique(),
        from_user_id: varchar("from_user_id").notNull(),
        to_user_id: varchar("to_user_id").notNull(),
        content: text("content").notNull(),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        // Both directions of a conversation, each ending in `id` for range / ORDER BY on the cursor.
        index("messages_from_to_id_idx").on(t.from_user_id, t.to_user_id, t.id),
        index("messages_to_from_id_idx").on(t.to_user_id, t.from_user_id, t.id),
    ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
