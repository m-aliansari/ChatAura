import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import { getHashMapKey } from "./common.js";
import { db } from "../../db/index.js";
import { getUserByUsername, getUserByUserId } from "../../db/repositories/users.js";
import { addFriendship } from "../../db/repositories/friendships.js";
import { getOrCreateDirectConversation } from "../../db/repositories/conversations.js";
import type { Socket } from "socket.io";

// A friend row on the wire (superset of the old shape): `full_name`, `conversationId` and a null
// `lastMessage` so a freshly added friend renders in the WhatsApp-style list and sorts by recency.
type AddedFriend = {
    username: string;
    user_id: string;
    full_name: string;
    connected: boolean;
    conversationId: number;
    lastMessage: null;
};

export const handleSocketAddFriend = async (
    socket: Socket,
    username: string,
    cb: (response: { done: boolean; errorMsg?: string; addedFriend?: AddedFriend }) => void,
) => {
    if (username === socket.user.username) {
        cb({ done: false, errorMsg: "Cannot add self" });
        return;
    }

    // Resolve the target from Postgres (source of truth) — works even for a registered
    // user who has never connected (whose Redis presence hash may not exist yet).
    const friend = await getUserByUsername(username);

    if (!friend) {
        cb({ done: false, errorMsg: "No such user exists!" });
        return;
    }

    // Friendship + its direct conversation (with both member rows) are created ATOMICALLY: an
    // inbox is built from conversation_members, so a friendship without a conversation would be
    // invisible. One transaction keeps them consistent.
    const result = await db.transaction(async (tx) => {
        const { added } = await addFriendship(socket.user.user_id, friend.user_id, tx);
        if (!added) return { added: false as const, conversationId: 0 };
        const conversationId = await getOrCreateDirectConversation(
            socket.user.user_id,
            friend.user_id,
            tx,
        );
        return { added: true as const, conversationId };
    });

    if (!result.added) {
        cb({ done: false, errorMsg: "Friend already added!" });
        return;
    }

    // Live presence (connected) still comes from Redis; absent hash => offline.
    const connected = (await redisClient.hGet(getHashMapKey(username), "connected")) === "true";

    // Notify the other user live: the adder appears in their list. socket.user has no full_name
    // (it's not in the JWT), so read the adder's row for the display name.
    const me = await getUserByUserId(socket.user.user_id);
    socket.to(friend.user_id).emit(SOCKET_EVENTS.FRIEND_ADDED, {
        username: socket.user.username,
        user_id: socket.user.user_id,
        full_name: me?.full_name ?? socket.user.username,
        connected: true,
        conversationId: result.conversationId,
        lastMessage: null,
    });

    cb({
        done: true,
        addedFriend: {
            username,
            user_id: friend.user_id,
            full_name: friend.full_name,
            connected,
            conversationId: result.conversationId,
            lastMessage: null,
        },
    });
    return;
};
