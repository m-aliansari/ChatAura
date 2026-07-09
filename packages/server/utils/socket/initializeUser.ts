import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { emitConnectionStatus } from "./emitConnectionStatus.js";
import { getFriendsPage } from "../../db/repositories/friendships.js";
import { getRecentMessagesForConversations } from "../../db/repositories/messages.js";
import { redisClient } from "../redis.js";
import {
    enrichWithPresence,
    FRIENDS_PAGE_SIZE,
    getHashMapKey,
    MESSAGES_PAGE_SIZE,
    toWireMessage,
} from "./common.js";
import type { Socket } from "socket.io";

export const initializeUser = async (socket: Socket) => {
    socket.join(socket.user.user_id);

    await redisClient.hSet(getHashMapKey(socket.user.username), {
        user_id: socket.user.user_id,
        connected: "true",
    });

    // Tell ALL friends this user just came online.
    await emitConnectionStatus(socket, true);

    // First page of friends for the sidebar; infinite scroll continues via LOAD_MORE_FRIENDS.
    const { friends, hasMore, cursor } = await getFriendsPage(socket.user.user_id, {
        limit: FRIENDS_PAGE_SIZE,
    });
    const enrichedFriends = await enrichWithPresence(friends);

    // Recent messages scoped to only the paged-in conversations — a bounded connect payload
    // (was an unbounded lRange of the whole Redis chat list).
    const rows = await getRecentMessagesForConversations(
        socket.user.user_id,
        friends.map((f) => f.user_id),
        MESSAGES_PAGE_SIZE,
    );

    // Emit LAST, after all awaits — the caller (index.ts) registers the DIRECT_MESSAGE /
    // LOAD_* listeners only after `await initializeUser` resolves, so any async work *between*
    // emitting FRIENDS_LIST and returning would open a window where a client that sends the
    // instant it sees FRIENDS_LIST has its message dropped (no listener yet → no ack → hang).
    socket.emit(SOCKET_EVENTS.FRIENDS_LIST, { friends: enrichedFriends, hasMore, cursor });
    if (rows.length) socket.emit(SOCKET_EVENTS.MESSAGES, rows.map(toWireMessage));
};
