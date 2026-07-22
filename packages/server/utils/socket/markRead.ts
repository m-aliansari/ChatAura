import type { Socket } from "socket.io";
import { markConversationRead } from "../../db/repositories/conversations.js";

/**
 * Advance the caller's read pointer for one conversation. Ack-based, fire-and-forget from the
 * client's perspective — the UI zeroes its own badge optimistically and this makes it durable.
 *
 * Authorization needs no lookup: `markConversationRead` scopes its UPDATE to
 * `user_id = <the caller>`, so a client that sends someone else's `conversationId` updates zero
 * rows. That is also why this takes `conversationId` directly (the client already has it on the
 * conversation row) rather than resolving it from a friend id like `handleLoadOlder` must.
 *
 * The underlying write is GREATEST-based, so a duplicate or out-of-order call is a no-op.
 */
export const handleMarkRead = async (
    socket: Socket,
    { conversationId, messageId }: { conversationId: number; messageId: number },
    cb?: (response: { ok: boolean }) => void,
) => {
    try {
        if (!Number.isInteger(conversationId) || !Number.isInteger(messageId)) {
            cb?.({ ok: false });
            return;
        }

        await markConversationRead(conversationId, socket.user.user_id, messageId);
        cb?.({ ok: true });
    } catch (error) {
        console.log(error);
        cb?.({ ok: false });
    }
};
