import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

// Identity / auth context.
// Users — source of truth for identity. Two candidate keys are intentional and
// load-bearing: the surrogate `id` (used in the JWT payload) and the natural UUID
// `user_id` (the stable cross-context reference other tables point at). Both UNIQUE.
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 28 }).notNull().unique(),
    // Display name shown instead of the username in the friend/conversation list and chat header.
    // Display-only: presence and all cross-context refs stay keyed on username / user_id.
    full_name: varchar("full_name", { length: 60 }).notNull(),
    passhash: varchar("passhash").notNull(),
    user_id: varchar("user_id").notNull().unique(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
