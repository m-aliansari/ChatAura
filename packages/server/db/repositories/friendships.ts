import { and, desc, eq, or, sql } from "drizzle-orm";
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

export type FriendCursor = { createdAt: string; userId: string };

/**
 * A page of a user's friends, ordered by friendship recency (`created_at DESC`, `user_id`
 * tiebreak) — a stable, deterministic order for infinite scroll. Pass `before` (the previous
 * page's `cursor`) to continue. Cursor is the `(created_at, user_id)` tuple of the last row;
 * the row-constructor comparison walks the same DESC order without gaps or duplicates. Fetches
 * `limit + 1` to report `hasMore`. Sorting by latest-message is intentionally NOT done here —
 * that's a deferred follow-up and would add a messages-table join.
 */
export const getFriendsPage = async (
    userId: string,
    { before, limit }: { before?: FriendCursor; limit: number },
): Promise<{
    friends: { username: string; user_id: string }[];
    hasMore: boolean;
    cursor: FriendCursor | null;
}> => {
    const otherSide = sql`CASE WHEN ${friendships.user_a_id} = ${userId} THEN ${friendships.user_b_id} ELSE ${friendships.user_a_id} END`;
    const membership = or(eq(friendships.user_a_id, userId), eq(friendships.user_b_id, userId));
    const where = before
        ? and(
              membership,
              sql`(${friendships.created_at}, ${users.user_id}) < (${before.createdAt}::timestamptz, ${before.userId})`,
          )
        : membership;

    const rows = await db
        .select({
            username: users.username,
            user_id: users.user_id,
            created_at: friendships.created_at,
        })
        .from(friendships)
        .innerJoin(users, sql`${users.user_id} = ${otherSide}`)
        .where(where)
        .orderBy(desc(friendships.created_at), desc(users.user_id))
        .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const cursor = last ? { createdAt: last.created_at.toISOString(), userId: last.user_id } : null;

    return {
        friends: page.map((r) => ({ username: r.username, user_id: r.user_id })),
        hasMore,
        cursor,
    };
};
