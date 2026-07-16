import type { Socket } from "socket.io";
import {
    getConversationsPage,
    type ConversationCursor,
    type InboxConversation,
} from "../../db/repositories/conversations.js";
import { getRecentMessagesForConversations } from "../../db/repositories/messages.js";
import {
    enrichWithPresence,
    FRIENDS_PAGE_SIZE,
    MESSAGES_PAGE_SIZE,
    toWireMessage,
    type WireMessage,
} from "./common.js";

// Next page of the inbox (infinite scroll) plus the recent messages for that page's conversations —
// returned together in the ack so the client merges them atomically.
export const handleLoadMoreFriends = async (
    socket: Socket,
    { cursor }: { cursor?: ConversationCursor },
    cb: (response: {
        friends: (InboxConversation & { connected: boolean })[];
        hasMore: boolean;
        cursor: ConversationCursor | null;
        messages: WireMessage[];
    }) => void,
) => {
    try {
        const {
            conversations,
            hasMore,
            cursor: nextCursor,
        } = await getConversationsPage(socket.user.user_id, {
            before: cursor,
            limit: FRIENDS_PAGE_SIZE,
        });

        const friends = await enrichWithPresence(conversations);
        const rows = await getRecentMessagesForConversations(
            conversations.map((c) => c.conversationId),
            MESSAGES_PAGE_SIZE,
        );

        cb({
            friends,
            hasMore,
            cursor: nextCursor,
            messages: rows.map((r) => toWireMessage(r, r.to_user_id)),
        });
    } catch (error) {
        console.log(error);
        cb({ friends: [], hasMore: false, cursor: null, messages: [] });
    }
};
