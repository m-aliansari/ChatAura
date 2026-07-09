import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import type { Socket } from "socket.io";
import { getFriends } from "../../db/repositories/friendships.js";

// Broadcast this user's online/offline transition to ALL of their friends' rooms (presence
// must reach every friend, not just the caller's first sidebar page). Only the friend
// user_ids are needed here — presence enrichment is done by the reader (initializeUser /
// load-more), so this no longer reads the Redis presence hash for every friend.
export const emitConnectionStatus = async (
    socket: Socket,
    connected: boolean,
    friends: { username: string; user_id: string }[] | null = null,
) => {
    const friendList = friends ?? (await getFriends(socket.user.user_id));

    const friendRooms = friendList.map((friend) => friend.user_id);

    if (friendRooms.length)
        socket
            .to(friendRooms)
            .emit(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED, connected, socket.user.username);
};
