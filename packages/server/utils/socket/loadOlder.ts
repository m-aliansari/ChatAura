import type { Socket } from "socket.io";
import { getConversation } from "../../db/repositories/messages.js";
import { getDirectConversationId } from "../../db/repositories/conversations.js";
import { MESSAGES_PAGE_SIZE, toWireMessage, type WireMessage } from "./common.js";

// Fetch the page of messages older than `before` (an `id` cursor) for one conversation. The client
// still addresses this by the friend's user_id; we resolve it to the direct conversation. Ack-based
// (no persistent listener), so the client can paginate on scroll-to-top.
export const handleLoadOlder = async (
    socket: Socket,
    { friendUserId, before }: { friendUserId: string; before?: number },
    cb: (response: { messages: WireMessage[]; hasMore: boolean }) => void,
) => {
    try {
        const conversationId = await getDirectConversationId(socket.user.user_id, friendUserId);
        if (conversationId === undefined) {
            cb({ messages: [], hasMore: false });
            return;
        }

        const { messages, hasMore } = await getConversation(conversationId, {
            before,
            limit: MESSAGES_PAGE_SIZE,
        });
        cb({ messages: messages.map((r) => toWireMessage(r, r.to_user_id)), hasMore });
    } catch (error) {
        console.log(error);
        cb({ messages: [], hasMore: false });
    }
};
