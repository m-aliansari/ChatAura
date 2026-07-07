import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

// Social context.
// Friendships — an undirected relationship stored ONCE per pair. The natural `(user_a_id,
// user_b_id)` pair is the primary key; the CHECK enforces a canonical column order so (A,B)
// and (B,A) cannot both exist => a friendship is a single row, inherently atomic to
// create/remove. The extra index on `user_b_id` serves getFriends' `OR user_b_id = $1` half
// (the PK's leftmost prefix already covers `user_a_id`). Soft `user_id` refs, no FK.
export const friendships = pgTable(
    "friendships",
    {
        user_a_id: varchar("user_a_id").notNull(),
        user_b_id: varchar("user_b_id").notNull(),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.user_a_id, t.user_b_id] }),
        index("friendships_user_b_id_idx").on(t.user_b_id),
        check("friendships_canonical_order", sql`${t.user_a_id} < ${t.user_b_id}`),
    ],
);

export type Friendship = typeof friendships.$inferSelect;
