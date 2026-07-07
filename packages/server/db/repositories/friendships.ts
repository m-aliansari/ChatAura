import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../index.js";
import { friendships } from "../schema/friendships.js";
// Cross-context read: the social repo joins `users` for usernames. Explicit import keeps this
// dependency visible — at a service split it becomes an API call / local read-model.
import { users } from "../schema/users.js";

// The friendship pair is canonicalised **in the database** with LEAST/GREATEST so the
// column ordering always matches the table's `user_a_id < user_b_id` CHECK under whatever
// collation Postgres uses — no dependence on JavaScript string comparison agreeing with it.
const canonicalA = (a: string, b: string) => sql`LEAST(${a}, ${b})`;
const canonicalB = (a: string, b: string) => sql`GREATEST(${a}, ${b})`;

// Match a friendship regardless of which argument is user_a/user_b (order-independent,
// equality-only so it is collation-independent).
const matchesPair = (a: string, b: string) =>
    or(
        and(eq(friendships.user_a_id, a), eq(friendships.user_b_id, b)),
        and(eq(friendships.user_a_id, b), eq(friendships.user_b_id, a)),
    );

/**
 * Create a friendship between two users. A single canonical-row upsert: atomic by
 * construction, and idempotent via the primary key. Returns `{ added: false }` when the pair
 * already exists (the caller surfaces "Friend already added").
 */
export const addFriendship = async (
    userIdA: string,
    userIdB: string,
): Promise<{ added: boolean }> => {
    const inserted = await db
        .insert(friendships)
        .values({
            user_a_id: canonicalA(userIdA, userIdB),
            user_b_id: canonicalB(userIdA, userIdB),
        })
        .onConflictDoNothing()
        .returning({ user_a_id: friendships.user_a_id });
    return { added: inserted.length > 0 };
};

/** Remove a friendship. Returns `{ removed: false }` when no such pair existed. */
export const removeFriendship = async (
    userIdA: string,
    userIdB: string,
): Promise<{ removed: boolean }> => {
    const deleted = await db
        .delete(friendships)
        .where(matchesPair(userIdA, userIdB))
        .returning({ user_a_id: friendships.user_a_id });
    return { removed: deleted.length > 0 };
};

/** Whether two users are friends (order-independent). */
export const areFriends = async (userIdA: string, userIdB: string): Promise<boolean> => {
    const [row] = await db
        .select({ user_a_id: friendships.user_a_id })
        .from(friendships)
        .where(matchesPair(userIdA, userIdB))
        .limit(1);
    return row !== undefined;
};

/**
 * A user's friends as `{ username, user_id }`. Joins `users` (usernames live only there —
 * friendships stores ids) picking the *other* side of each canonical row. Presence
 * (`connected`) is enriched separately from Redis by the caller.
 */
export const getFriends = async (
    userId: string,
): Promise<{ username: string; user_id: string }[]> => {
    return db
        .select({ username: users.username, user_id: users.user_id })
        .from(friendships)
        .innerJoin(
            users,
            sql`${users.user_id} = CASE WHEN ${friendships.user_a_id} = ${userId} THEN ${friendships.user_b_id} ELSE ${friendships.user_a_id} END`,
        )
        .where(or(eq(friendships.user_a_id, userId), eq(friendships.user_b_id, userId)));
};
