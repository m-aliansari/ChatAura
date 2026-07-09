import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../index.js";
import { messages } from "../schema/messages.js";
import type { Message } from "../schema/messages.js";

// Match a single conversation (both directions) between two users.
const conversationFilter = (userId: string, otherUserId: string) =>
    or(
        and(eq(messages.from_user_id, userId), eq(messages.to_user_id, otherUserId)),
        and(eq(messages.from_user_id, otherUserId), eq(messages.to_user_id, userId)),
    );

/**
 * Persist one message. A single INSERT is atomic by construction — this replaces the old
 * non-transactional pair of Redis `lPush`es. Returns the full row (the DB-assigned `id`
 * cursor + `created_at`) so the caller can build the wire payload / ack.
 */
export const saveMessage = async (input: {
    message_id: string;
    from_user_id: string;
    to_user_id: string;
    content: string;
}): Promise<Message> => {
    const [row] = await db.insert(messages).values(input).returning();
    return row;
};

/**
 * One conversation, newest-first, cursor-paginated on the surrogate `id`. Pass `before` (an
 * `id`) to fetch the page strictly older than it. Fetches `limit + 1` to report `hasMore`
 * precisely without a second query.
 */
export const getConversation = async (
    userId: string,
    otherUserId: string,
    { before, limit }: { before?: number; limit: number },
): Promise<{ messages: Message[]; hasMore: boolean }> => {
    const filter = conversationFilter(userId, otherUserId);
    const where = before === undefined ? filter : and(filter, lt(messages.id, before));

    const rows = await db
        .select()
        .from(messages)
        .where(where)
        .orderBy(desc(messages.id))
        .limit(limit + 1);

    const hasMore = rows.length > limit;
    return { messages: hasMore ? rows.slice(0, limit) : rows, hasMore };
};

/**
 * The most recent N messages for each of the given conversations (scoped to a page of friend
 * ids so the connect / load-more payload is bounded to friends actually rendered). Reuses
 * `getConversation` per friend — at a page size of ~15 these are a handful of small indexed
 * LIMIT queries; a single windowed CTE is the optimization to reach for only if profiling
 * shows need. Returns a flat, globally newest-first array.
 */
export const getRecentMessagesForConversations = async (
    userId: string,
    friendUserIds: string[],
    limitPerConversation: number,
): Promise<Message[]> => {
    if (friendUserIds.length === 0) return [];

    const perConversation = await Promise.all(
        friendUserIds.map((friendId) =>
            getConversation(userId, friendId, { limit: limitPerConversation }),
        ),
    );

    return perConversation.flatMap((r) => r.messages).sort((a, b) => b.id - a.id);
};

/**
 * Delete an entire conversation (both directions) in a single atomic statement — replaces the
 * old Redis filter-and-rebuild in handleRemoveFriend. Returns how many rows were removed.
 */
export const deleteConversation = async (
    userIdA: string,
    userIdB: string,
): Promise<{ deleted: number }> => {
    const deleted = await db
        .delete(messages)
        .where(conversationFilter(userIdA, userIdB))
        .returning({ id: messages.id });
    return { deleted: deleted.length };
};
