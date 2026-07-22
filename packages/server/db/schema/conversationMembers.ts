import { bigint, index, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

// Messaging context.
// Per-user conversation state — the row that powers each user's inbox. `last_message_id` is the
// DENORMALIZED sort key (fan-out on write: a send bumps it on every member of the conversation in
// one statement), so the inbox read is a single index range-scan over (user_id, last_message_id
// DESC) that stays flat as total conversations grow. `created_at` (member-since) is the fallback
// sort for conversations with no messages yet. Soft user_id / conversation_id refs, no FK — deletes
// are handled explicitly in a transaction (see deleteConversationCascade), matching the repo's
// established no-FK, atomic-multi-statement convention.
export const conversationMembers = pgTable(
    "conversation_members",
    {
        conversation_id: bigint("conversation_id", { mode: "number" }).notNull(),
        user_id: varchar("user_id").notNull(),
        last_message_id: bigint("last_message_id", { mode: "number" }),
        // Unread pointer: the newest message this user has read in this conversation. NOT a counter —
        // the count is DERIVED (messages newer than this, not sent by me). A pointer set with
        // GREATEST(current, new) is idempotent and commutative, so it converges under concurrent
        // devices and under a broker's at-least-once redelivery; `unread_count = unread_count + 1`
        // would corrupt permanently on a single replay. That matters because roadmap principle 4
        // puts fan-out behind a queue eventually. Null = nothing read yet (everything is unread).
        last_read_message_id: bigint("last_read_message_id", { mode: "number" }),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        // Deferred (delivered receipts): last_delivered_message_id — same pointer shape.
    },
    (t) => [
        primaryKey({ columns: [t.conversation_id, t.user_id] }),
        // The inbox read index: my rows, newest-activity first, no-message convos last by recency.
        // `last_read_message_id` is deliberately NOT here: it is not a sort key, and widening this
        // index would cost the read that depends on it. The unread count is served by
        // `messages_conversation_id_id_idx` instead.
        index("conversation_members_inbox_idx").on(
            t.user_id,
            t.last_message_id.desc().nullsLast(),
            t.created_at.desc(),
        ),
    ],
);

export type ConversationMember = typeof conversationMembers.$inferSelect;
