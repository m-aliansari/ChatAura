import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import type { Socket } from "socket.io";
import { redisClient } from "../redis.js";
import { getMessagesKey } from "./common.js";
import { removeFriendship } from "../../db/repositories/friendships.js";

// Rewrite a user's chat list, dropping every message exchanged with `otherUserId`.
// We cannot blind-DEL the key (that would wipe ALL conversations), so we filter
// and rebuild in original order.
const removeMessagesBetween = async (ownerUserId: string, otherUserId: string) => {
    const key = getMessagesKey(ownerUserId);
    const all = await redisClient.lRange(key, 0, -1);
    if (!all.length) return;

    const kept = all.filter((msgStr) => {
        const [, to, from] = msgStr.split(".");
        return to !== otherUserId && from !== otherUserId;
    });

    await redisClient.del(key);
    if (kept.length) await redisClient.rPush(key, kept);
};

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

        // Delete chat history on both sides (messages still live in Redis this stage)
        await removeMessagesBetween(me.user_id, friend.user_id);
        await removeMessagesBetween(friend.user_id, me.user_id);

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
