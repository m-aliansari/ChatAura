import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import type { Socket } from "socket.io";
import { getFriendsListKey, parseFriendList } from "./common.js";
import { redisClient } from "../redis.js";

export const emitConnectionStatus = async (
    socket: Socket,
    connected: boolean,
    friends: string[] | null = null,
) => {
    let friendList = friends ? [...friends] : null;

    if (!friendList) {
        friendList = await redisClient.lRange(getFriendsListKey(socket.user.username), 0, -1);
    }

    const parsed = await parseFriendList(friendList);

    const friendRooms = parsed.map((friend) => friend.user_id);

    if (friendRooms?.length)
        socket
            .to(friendRooms)
            .emit(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED, connected, socket.user.username);

    return parsed;
};
