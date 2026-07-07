import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

// Identity / auth context.
// Users — source of truth for identity. Two candidate keys are intentional and
// load-bearing: the surrogate `id` (used in the JWT payload) and the natural UUID
// `user_id` (the stable cross-context reference other tables point at). Both UNIQUE.
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 28 }).notNull().unique(),
    passhash: varchar("passhash").notNull(),
    user_id: varchar("user_id").notNull().unique(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
