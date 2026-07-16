import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../index.js";
import { conversations } from "../schema/conversations.js";
import { messages } from "../schema/messages.js";
import type { Message } from "../schema/messages.js";

// `db` or a transaction handle (see conversations repo) — lets saveMessage run inside the send
// transaction alongside the member-row bump.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// A message row plus the recipient (`to_user_id`) computed from the conversation's canonical pair.
// The wire still carries `to`/`from` (so the current client is unchanged), so reads resolve the
// recipient here via a CASE join. Direct conversations only — a group message has no single `to`.
export type MessageRow = Message & { to_user_id: string };

/**
 * Persist one message (a single INSERT, atomic by construction). Accepts an executor so it can run
 * inside the send transaction. Returns the full row (DB-assigned `id` cursor + `created_at`).
 */
export const saveMessage = async (
    input: {
        message_id: string;
        conversation_id: number;
        sender_user_id: string;
        content: string;
    },
    executor: Executor = db,
): Promise<Message> => {
    const [row] = await executor.insert(messages).values(input).returning();
    return row;
};

/**
 * One conversation, newest-first, cursor-paginated on the surrogate `id`. Pass `before` (an `id`)
 * to fetch the page strictly older than it. Joins `conversations` to derive each message's `to`
 * (the non-sender participant). Fetches `limit + 1` to report `hasMore` without a second query.
 */
export const getConversation = async (
    conversationId: number,
    { before, limit }: { before?: number; limit: number },
): Promise<{ messages: MessageRow[]; hasMore: boolean }> => {
    const filter = eq(messages.conversation_id, conversationId);
    const where = before === undefined ? filter : and(filter, lt(messages.id, before));

    const rows = await db
        .select({
            id: messages.id,
            message_id: messages.message_id,
            conversation_id: messages.conversation_id,
            sender_user_id: messages.sender_user_id,
            content: messages.content,
            created_at: messages.created_at,
            to_user_id: sql<string>`CASE WHEN ${messages.sender_user_id} = ${conversations.user_a_id} THEN ${conversations.user_b_id} ELSE ${conversations.user_a_id} END`,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversation_id))
        .where(where)
        .orderBy(desc(messages.id))
        .limit(limit + 1);

    const hasMore = rows.length > limit;
    return { messages: hasMore ? rows.slice(0, limit) : rows, hasMore };
};

/**
 * The most recent N messages for each of the given conversations (scoped to a page of conversation
 * ids so the connect / load-more payload stays bounded). Reuses `getConversation` per conversation
 * — a handful of small indexed LIMIT queries; a windowed CTE is the optimization to reach for only
 * if profiling shows need. Returns a flat, globally newest-first array.
 */
export const getRecentMessagesForConversations = async (
    conversationIds: number[],
    limitPerConversation: number,
): Promise<MessageRow[]> => {
    if (conversationIds.length === 0) return [];

    const perConversation = await Promise.all(
        conversationIds.map((cid) => getConversation(cid, { limit: limitPerConversation })),
    );

    return perConversation.flatMap((r) => r.messages).sort((a, b) => b.id - a.id);
};
