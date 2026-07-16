import { bigint, bigserial, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Messaging context.
// One row per message, belonging to a CONVERSATION (not a user pair) — this is the group-ready
// shape (a group message is still ONE row here + one bounded member-row bump). Surrogate `id`
// (bigserial) is the ordering / pagination cursor AND the value conversation_members.last_message_id
// points at; `message_id` (uuid) is the stable wire id the client dedupes on (two candidate keys,
// both load-bearing). `sender_user_id` is a soft ref, no FK (keeps the messaging context separable
// per roadmap principle 2); `conversation_id` is a soft same-context ref (no FK — deletes are
// explicit/transactional, matching the repo convention).
export const messages = pgTable(
    "messages",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        message_id: varchar("message_id").notNull().unique(),
        conversation_id: bigint("conversation_id", { mode: "number" }).notNull(),
        sender_user_id: varchar("sender_user_id").notNull(),
        content: text("content").notNull(),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        // History pagination: a conversation's messages newest-first, cursor on `id`.
        index("messages_conversation_id_id_idx").on(t.conversation_id, t.id),
    ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
