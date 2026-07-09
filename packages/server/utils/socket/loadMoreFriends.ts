import type { Socket } from "socket.io";
import { getFriendsPage, type FriendCursor } from "../../db/repositories/friendships.js";
import { getRecentMessagesForConversations } from "../../db/repositories/messages.js";
import {
    enrichWithPresence,
    FRIENDS_PAGE_SIZE,
    MESSAGES_PAGE_SIZE,
    toWireMessage,
    type WireMessage,
} from "./common.js";

// Next page of the friends list (infinite scroll) plus the recent messages for that page's
// conversations — returned together in the ack so the client merges them atomically.
export const handleLoadMoreFriends = async (
    socket: Socket,
    { cursor }: { cursor?: FriendCursor },
    cb: (response: {
        friends: { username: string; user_id: string; connected: boolean }[];
        hasMore: boolean;
        cursor: FriendCursor | null;
        messages: WireMessage[];
    }) => void,
) => {
    try {
        const {
            friends,
            hasMore,
            cursor: nextCursor,
        } = await getFriendsPage(socket.user.user_id, {
            before: cursor,
            limit: FRIENDS_PAGE_SIZE,
        });

        const enriched = await enrichWithPresence(friends);
        const rows = await getRecentMessagesForConversations(
            socket.user.user_id,
            friends.map((f) => f.user_id),
            MESSAGES_PAGE_SIZE,
        );

        cb({ friends: enriched, hasMore, cursor: nextCursor, messages: rows.map(toWireMessage) });
    } catch (error) {
        console.log(error);
        cb({ friends: [], hasMore: false, cursor: null, messages: [] });
    }
};
