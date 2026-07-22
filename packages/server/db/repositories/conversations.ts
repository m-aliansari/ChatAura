import { and, count, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../index.js";
import { conversations } from "../schema/conversations.js";
import { conversationMembers } from "../schema/conversationMembers.js";
import { messages } from "../schema/messages.js";
// Cross-context read: the inbox join reaches into `users` for the display name/username. Explicit
// import keeps the dependency visible — at a service split it becomes an API call / local read-model.
import { users } from "../schema/users.js";

// `db` or a transaction handle — repository ops that participate in a caller's transaction accept
// this so the message INSERT and the member-row bump commit atomically (see services/sendMessage).
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Canonical pair, computed in the DB (LEAST/GREATEST — no Drizzle builder for these) so column
// order matches under any collation. Same discipline friendships uses. Interpolations are
// parameterised by the `sql` template, not string-concatenated.
const canonicalA = (a: string, b: string) => sql`LEAST(${a}, ${b})`;
const canonicalB = (a: string, b: string) => sql`GREATEST(${a}, ${b})`;

// Match the direct conversation for a pair, order-independently — mirrors friendships' `matchesPair`.
// `eq` on the discriminator still hits the partial unique index (`... WHERE type = 'direct'`):
// node-postgres sends unnamed statements, so Postgres plans with the bound value and can prove the
// index predicate. (A *named* prepared statement reused into a generic plan could not — verified by
// EXPLAIN — so don't wrap this call in `.prepare()` without re-checking the plan.)
const matchesDirectPair = (a: string, b: string) =>
    and(
        eq(conversations.type, "direct"),
        eq(conversations.user_a_id, canonicalA(a, b)),
        eq(conversations.user_b_id, canonicalB(a, b)),
    );

/**
 * Ensure the direct conversation between two users exists (with both member rows) and return its id.
 * Idempotent: the partial unique index makes the INSERT a no-op if it already exists, in which case
 * we look it up. Friend-add and the message send path both go through here, so a conversation always
 * has its two members.
 */
export const getOrCreateDirectConversation = async (
    userA: string,
    userB: string,
    executor: Executor = db,
): Promise<number> => {
    const inserted = await executor
        .insert(conversations)
        .values({
            type: "direct",
            user_a_id: canonicalA(userA, userB),
            user_b_id: canonicalB(userA, userB),
        })
        .onConflictDoNothing()
        .returning({ id: conversations.id });

    if (inserted.length > 0) {
        const id = inserted[0].id;
        await executor
            .insert(conversationMembers)
            .values([
                { conversation_id: id, user_id: userA },
                { conversation_id: id, user_id: userB },
            ])
            .onConflictDoNothing();
        return id;
    }

    const [row] = await executor
        .select({ id: conversations.id })
        .from(conversations)
        .where(matchesDirectPair(userA, userB))
        .limit(1);
    return row.id;
};

/** The id of the existing direct conversation for a pair, or undefined. */
export const getDirectConversationId = async (
    userA: string,
    userB: string,
    executor: Executor = db,
): Promise<number | undefined> => {
    const [row] = await executor
        .select({ id: conversations.id })
        .from(conversations)
        .where(matchesDirectPair(userA, userB))
        .limit(1);
    return row?.id;
};

/** Fan-out on write: bump `last_message_id` on every member of the conversation in one statement. */
export const bumpConversationLastMessage = async (
    conversationId: number,
    messageId: number,
    executor: Executor = db,
): Promise<void> => {
    await executor
        .update(conversationMembers)
        .set({ last_message_id: messageId })
        .where(eq(conversationMembers.conversation_id, conversationId));
};

/**
 * Advance one member's read pointer. `GREATEST` is the whole point: the write is idempotent and
 * commutative, so replaying it — a second device, a reconnect, or a broker redelivering the same
 * event — can never move the pointer backwards or double-count. Applying an older id is a no-op.
 * Scoped to the caller's own member row, so a user can only mark their own side read.
 */
export const markConversationRead = async (
    conversationId: number,
    userId: string,
    messageId: number,
    executor: Executor = db,
): Promise<void> => {
    await executor
        .update(conversationMembers)
        .set({
            last_read_message_id: sql`GREATEST(COALESCE(${conversationMembers.last_read_message_id}, 0), ${messageId})`,
        })
        .where(
            and(
                eq(conversationMembers.conversation_id, conversationId),
                eq(conversationMembers.user_id, userId),
            ),
        );
};

/** Delete a conversation and everything hanging off it (messages + members), explicitly (no FK). */
export const deleteConversationCascade = async (
    conversationId: number,
    executor: Executor = db,
): Promise<void> => {
    await executor.delete(messages).where(eq(messages.conversation_id, conversationId));
    await executor
        .delete(conversationMembers)
        .where(eq(conversationMembers.conversation_id, conversationId));
    await executor.delete(conversations).where(eq(conversations.id, conversationId));
};

// Opaque keyset cursor for the inbox order (last_message_id DESC NULLS LAST, created_at DESC,
// conversation_id DESC). `lastMessageId` is null while paging the no-message tail.
export type ConversationCursor = {
    lastMessageId: number | null;
    createdAt: string;
    conversationId: number;
};

// One inbox row (a direct conversation from the viewer's side). Backward-compatible superset of the
// old friend object (`user_id` + `username`), plus `full_name`, `conversationId`, and the last
// message preview the WhatsApp-style row needs. `connected` is enriched separately from Redis.
export type InboxConversation = {
    conversationId: number;
    type: string;
    user_id: string;
    username: string;
    full_name: string;
    lastMessage: { content: string; createdAt: string } | null;
    // Messages in this conversation newer than my read pointer, not sent by me. DERIVED, never
    // stored — see `last_read_message_id` in the schema for why a counter column was rejected.
    unreadCount: number;
};

/**
 * A page of the viewer's conversations, sorted by latest activity (`last_message_id` DESC), with
 * no-message conversations falling to the tail by `created_at`. Served entirely from the viewer's
 * `conversation_members` rows via the inbox index, joined to `conversations`/`users` for display
 * and left-joined to `messages` for the preview — a flat, scale-independent read. Direct
 * conversations only for now (the users innerJoin picks the other member; groups are a follow-up).
 */
export const getConversationsPage = async (
    userId: string,
    { before, limit }: { before?: ConversationCursor; limit: number },
): Promise<{
    conversations: InboxConversation[];
    hasMore: boolean;
    cursor: ConversationCursor | null;
}> => {
    const other = sql`CASE WHEN ${conversations.user_a_id} = ${userId} THEN ${conversations.user_b_id} ELSE ${conversations.user_a_id} END`;
    const mine = eq(conversationMembers.user_id, userId);

    // Unread count, as a correlated subquery in the SELECT list. The alias is needed because
    // `messages` is already joined in the outer query for the preview.
    //
    // This does NOT violate the "no query-time LATERAL" rule in CLAUDE.md — that rule protects the
    // SORT KEY, which must stay co-located with the membership filter. A SELECT-list subquery runs
    // only on rows the keyset has ALREADY chosen, so it cannot influence index selection for
    // ordering, and it executes at most `limit + 1` times. Each execution is an index-only-ish scan
    // on messages_conversation_id_id_idx (conversation_id, id) — the same index history pagination
    // uses, so no new index is needed. Re-check with EXPLAIN ANALYZE if you touch this.
    //
    // Built with the query builder, not a raw SQL string: the builder is what makes `alias()` emit
    // a real `FROM "messages" "unread"` clause. Interpolating an aliased table into a raw `sql`
    // template instead renders the bare alias name (`FROM "unread"` — no such relation).
    //
    // COALESCE is the one part left in `sql`: Drizzle defines no builder for it. The obvious pure
    // builder alternative — `or(isNull(last_read), gt(id, last_read))` — is NOT equivalent for the
    // planner. Measured with EXPLAIN ANALYZE:
    //   COALESCE -> Index Cond: (conversation_id = ... AND id > COALESCE(last_read, 0))
    //   OR       -> Index Cond: (conversation_id = ...)   + Filter: (last_read IS NULL OR id > ...)
    // i.e. the OR demotes the `id >` term out of the index condition, so the subquery reads EVERY
    // message in the conversation and filters in memory instead of range-scanning from the read
    // pointer. Invisible on small conversations, linear in history on large ones. Keep the COALESCE.
    const unread = alias(messages, "unread");
    const unreadCount = db
        .select({ value: count() })
        .from(unread)
        .where(
            and(
                eq(unread.conversation_id, conversationMembers.conversation_id),
                ne(unread.sender_user_id, userId),
                gt(unread.id, sql`COALESCE(${conversationMembers.last_read_message_id}, 0)`),
            ),
        );

    // Keyset condition. When the cursor still has a last_message_id we are in the messaged section
    // (ids are globally unique, so a strict `<` needs no tiebreak; null rows all sort after and are
    // safe to admit). Once it is null we are in the no-message tail, ordered by (created_at, id) —
    // a row-constructor comparison, the one part with no Drizzle builder equivalent.
    let cursorCond;
    if (before) {
        cursorCond =
            before.lastMessageId !== null
                ? or(
                      isNull(conversationMembers.last_message_id),
                      lt(conversationMembers.last_message_id, before.lastMessageId),
                  )
                : and(
                      isNull(conversationMembers.last_message_id),
                      sql`(${conversationMembers.created_at}, ${conversationMembers.conversation_id}) < (${before.createdAt}::timestamptz, ${before.conversationId})`,
                  );
    }
    const where = cursorCond ? and(mine, cursorCond) : mine;

    const rows = await db
        .select({
            conversationId: conversationMembers.conversation_id,
            lastMessageId: conversationMembers.last_message_id,
            memberCreatedAt: sql<string>`${conversationMembers.created_at}::text`,
            type: conversations.type,
            user_id: sql<string>`${other}`,
            username: users.username,
            full_name: users.full_name,
            lastContent: messages.content,
            lastCreatedAt: messages.created_at,
            // `.getSQL()` unwraps the builder into its SQL; the parens make it a scalar subquery
            // expression in the SELECT list.
            unreadCount: sql<number>`(${unreadCount.getSQL()})`.mapWith(Number),
        })
        .from(conversationMembers)
        .innerJoin(conversations, eq(conversations.id, conversationMembers.conversation_id))
        .innerJoin(users, eq(users.user_id, other))
        .leftJoin(messages, eq(messages.id, conversationMembers.last_message_id))
        .where(where)
        // NULLS LAST is spelled out on BOTH keys so this ordering matches the inbox index exactly.
        // `created_at` is NOT NULL, so `DESC` and `DESC NULLS LAST` are semantically identical — but
        // the planner matches index ordering literally, and plain `DESC` (i.e. NULLS FIRST) stops it
        // using the index's `created_at`. That costs nothing in the messaged section (last_message_id
        // is unique, so sort groups are size 1) but is O(all my conversations) in the no-message tail,
        // where every row shares last_message_id = NULL and becomes ONE giant sort group. Verified
        // with EXPLAIN: without this, a 2k-no-message inbox scans 2000 rows; with it, 17.
        .orderBy(
            sql`${conversationMembers.last_message_id} DESC NULLS LAST`,
            sql`${conversationMembers.created_at} DESC NULLS LAST`,
            desc(conversationMembers.conversation_id),
        )
        .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const cursor = last
        ? {
              lastMessageId: last.lastMessageId,
              createdAt: last.memberCreatedAt,
              conversationId: last.conversationId,
          }
        : null;

    return {
        conversations: page.map((r) => ({
            conversationId: r.conversationId,
            type: r.type,
            user_id: r.user_id,
            username: r.username,
            full_name: r.full_name,
            lastMessage:
                r.lastContent !== null && r.lastCreatedAt !== null
                    ? { content: r.lastContent, createdAt: r.lastCreatedAt.toISOString() }
                    : null,
            unreadCount: r.unreadCount,
        })),
        hasMore,
        cursor,
    };
};
