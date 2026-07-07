import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import { getHashMapKey } from "./common.js";
import { getUserByUsername } from "../../db/repositories/users.js";
import { addFriendship } from "../../db/repositories/friendships.js";
import type { Socket } from "socket.io";

export const handleSocketAddFriend = async (
    socket: Socket,
    username: string,
    cb: (response: {
        done: boolean;
        errorMsg?: string;
        addedFriend?: { username: string; user_id: string; connected: boolean };
    }) => void,
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

    const { added } = await addFriendship(socket.user.user_id, friend.user_id);

    if (!added) {
        cb({ done: false, errorMsg: "Friend already added!" });
        return;
    }

    // Live presence (connected) still comes from Redis; absent hash => offline.
    const connected = (await redisClient.hGet(getHashMapKey(username), "connected")) === "true";

    socket.to(friend.user_id).emit(SOCKET_EVENTS.FRIEND_ADDED, { ...socket.user, connected: true });

    cb({
        done: true,
        addedFriend: {
            username,
            user_id: friend.user_id,
            connected,
        },
    });
    return;
};
