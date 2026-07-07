import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import type { Socket } from "socket.io";
import { getFriends } from "../../db/repositories/friendships.js";
import { enrichWithPresence } from "./common.js";

export const emitConnectionStatus = async (
    socket: Socket,
    connected: boolean,
    friends: { username: string; user_id: string }[] | null = null,
) => {
    const friendList = friends ?? (await getFriends(socket.user.user_id));

    const parsed = await enrichWithPresence(friendList);

    const friendRooms = parsed.map((friend) => friend.user_id);

    if (friendRooms?.length)
        socket
            .to(friendRooms)
            .emit(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED, connected, socket.user.username);

    return parsed;
};
