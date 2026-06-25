import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import { getFriendsListKey, getHashMapKey } from "./common.js";



export const handleSocketAddFriend = async (socket, username, cb) => {
    if (username === socket.user.username) {
        cb({ done: false, errorMsg: "Cannot add self" });
        return;
    }

    const key = getHashMapKey(username);
    const friend = await redisClient.hGetAll(
        key
    );

    if (!friend || !Object.keys(friend).length) {
        cb({ done: false, errorMsg: "No such user exists!" });
        return;
    }

    const currentFriendList = await redisClient.lRange(
        getFriendsListKey(socket.user.username),
        0, -1
    );

    if (currentFriendList?.length && currentFriendList.indexOf(username) !== -1) {
        cb({ done: false, errorMsg: "Friend already added!" });
        return;
    }

    await redisClient.lPush(
        getFriendsListKey(socket.user.username),
        [username, friend.user_id].join(".")
    );

    await redisClient.lPush(
        getFriendsListKey(username),
        [socket.user.username, socket.user.user_id].join(".")
    );

    socket.to(friend.user_id).emit(SOCKET_EVENTS.FRIEND_ADDED, { ...socket.user, connected: true })

    cb({ done: true, addedFriend: { username, user_id: friend.user_id, connected: (friend.connected ?? "false") === "true" } });
    return;
};
