import { GENERIC_ERROR, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import { getFriendsListKey, getHashMapKey } from "./common.js";
import { checkFriendshipStatus } from "./friends.js";
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

    const key = getHashMapKey(username);
    const friend = await redisClient.hGetAll(key);

    if (!friend || !Object.keys(friend).length) {
        cb({ done: false, errorMsg: "No such user exists!" });
        return;
    }

    const isFriendAlreadyAdded = await checkFriendshipStatus({
        username: socket.user.username,
        friendUsername: username,
        friendId: friend.user_id,
    });

    if (isFriendAlreadyAdded === null) {
        console.error("Error occurred while checking friendship status.");

        cb({ done: false, errorMsg: GENERIC_ERROR });
        return;
    }

    if (isFriendAlreadyAdded) {
        cb({ done: false, errorMsg: "Friend already added!" });
        return;
    }

    await redisClient.lPush(
        getFriendsListKey(socket.user.username),
        [username, friend.user_id].join("."),
    );

    await redisClient.lPush(
        getFriendsListKey(username),
        [socket.user.username, socket.user.user_id].join("."),
    );

    socket.to(friend.user_id).emit(SOCKET_EVENTS.FRIEND_ADDED, { ...socket.user, connected: true });

    cb({
        done: true,
        addedFriend: {
            username,
            user_id: friend.user_id,
            connected: (friend.connected ?? "false") === "true",
        },
    });
    return;
};
