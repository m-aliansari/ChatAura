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
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        // Deferred (unread / delivered receipts): last_read_message_id, last_delivered_message_id.
    },
    (t) => [
        primaryKey({ columns: [t.conversation_id, t.user_id] }),
        // The inbox read index: my rows, newest-activity first, no-message convos last by recency.
        index("conversation_members_inbox_idx").on(
            t.user_id,
            t.last_message_id.desc().nullsLast(),
            t.created_at.desc(),
        ),
    ],
);

export type ConversationMember = typeof conversationMembers.$inferSelect;
