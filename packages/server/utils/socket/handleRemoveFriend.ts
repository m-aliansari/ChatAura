import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import type { Socket } from "socket.io";
import { removeFriendship } from "../../db/repositories/friendships.js";
import { deleteConversation } from "../../db/repositories/messages.js";

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

        // Remove the single canonical friendship row (order-independent).
        const { removed } = await removeFriendship(me.user_id, friend.user_id);

        if (!removed) {
            cb({ done: false, errorMsg: "Not in your friend list" });
            return;
        }

        // Delete the whole conversation (both directions) in one atomic statement.
        await deleteConversation(me.user_id, friend.user_id);

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
