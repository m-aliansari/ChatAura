import { pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

// Notifications context.
// FCM push tokens — one row per (user, device token). Normalizes the former
// `users.fcm_token[]` array column (a 1NF violation). The natural `(user_id, token)` pair is
// the primary key (no surrogate id needed). References users by the stable `user_id` value
// (soft ref, no FK — keeps the messaging/notification context separable).
export const fcmTokens = pgTable(
    "fcm_tokens",
    {
        user_id: varchar("user_id").notNull(),
        token: varchar("token", { length: 255 }).notNull(),
        created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [primaryKey({ columns: [t.user_id, t.token] })],
);

export type FcmToken = typeof fcmTokens.$inferSelect;
