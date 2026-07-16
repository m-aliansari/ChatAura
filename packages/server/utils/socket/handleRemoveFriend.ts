import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import type { Socket } from "socket.io";
import { db } from "../../db/index.js";
import { removeFriendship } from "../../db/repositories/friendships.js";
import {
    getDirectConversationId,
    deleteConversationCascade,
} from "../../db/repositories/conversations.js";

export const handleRemoveFriend = async (
    socket: Socket,
    friend: { username: string; user_id: string },
    cb: (response: { done: boolean; errorMsg?: string }) => void,
) => {
    try {
        if (!friend?.username || !friend?.user_id) {
            cb({ done: false, errorMsg: "Invalid friend" });
            return;
        }

        const me = socket.user;

        // Remove the friendship and tear down the whole conversation (messages + members + the
        // conversation row) in ONE transaction, so the two contexts can't drift out of sync.
        const removed = await db.transaction(async (tx) => {
            const { removed } = await removeFriendship(me.user_id, friend.user_id, tx);
            if (!removed) return false;

            const conversationId = await getDirectConversationId(me.user_id, friend.user_id, tx);
            if (conversationId !== undefined) await deleteConversationCascade(conversationId, tx);
            return true;
        });

        if (!removed) {
            cb({ done: false, errorMsg: "Not in your friend list" });
            return;
        }

        // Notify the other user live
        socket.to(friend.user_id).emit(SOCKET_EVENTS.FRIEND_REMOVED, {
            username: me.username,
            user_id: me.user_id,
        });

        cb({ done: true });
    } catch (error) {
        console.log(error);
        cb({ done: false, errorMsg: "Failed to remove friend" });
    }
};
