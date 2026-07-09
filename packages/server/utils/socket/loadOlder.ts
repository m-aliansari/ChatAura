import type { Socket } from "socket.io";
import { getConversation } from "../../db/repositories/messages.js";
import { MESSAGES_PAGE_SIZE, toWireMessage, type WireMessage } from "./common.js";

// Fetch the page of messages older than `before` (an `id` cursor) for one conversation.
// Ack-based (no persistent listener), so the client can paginate on scroll-to-top.
export const handleLoadOlder = async (
    socket: Socket,
    { friendUserId, before }: { friendUserId: string; before?: number },
    cb: (response: { messages: WireMessage[]; hasMore: boolean }) => void,
) => {
    try {
        const { messages, hasMore } = await getConversation(socket.user.user_id, friendUserId, {
            before,
            limit: MESSAGES_PAGE_SIZE,
        });
        cb({ messages: messages.map(toWireMessage), hasMore });
    } catch (error) {
        console.log(error);
        cb({ messages: [], hasMore: false });
    }
};
