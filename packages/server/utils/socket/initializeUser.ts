import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { emitConnectionStatus } from "./emitConnectionStatus.js";
import { getFriends } from "../../db/repositories/friendships.js";
import { redisClient } from "../redis.js";
import { getHashMapKey, getMessagesKey } from "./common.js";
import type { Socket } from "socket.io";

export const initializeUser = async (socket: Socket) => {
    socket.join(socket.user.user_id);

    await redisClient.hSet(getHashMapKey(socket.user.username), {
        user_id: socket.user.user_id,
        connected: "true",
    });

    const friendList = await getFriends(socket.user.user_id);

    const parsedList = await emitConnectionStatus(socket, true, friendList);
    const messagesRes = await redisClient.lRange(getMessagesKey(socket.user.user_id), 0, -1);

    const messages = messagesRes.map((msgStr) => {
        // Format: messageId.to.from.content — messageId/to/from are dot-free
        // uuids, so the remainder is the content (which may itself contain '.').
        const [messageId, to, from, ...rest] = msgStr.split(".");
        return { to, from, content: rest.join("."), messageId };
    });

    socket.emit(SOCKET_EVENTS.FRIENDS_LIST, parsedList);

    if (messages?.length) socket.emit(SOCKET_EVENTS.MESSAGES, messages);
};
