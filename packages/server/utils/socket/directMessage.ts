import { GENERIC_ERROR, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import { getMessagesKey } from "./common.js";
import { v4 as uuidv4 } from "uuid";
import { getFcmTokens, sendChatNotifications } from "../fcm.js";
import { areFriends } from "../../db/repositories/friendships.js";
import type { Socket } from "socket.io";

export const handleDirectMessage = async (
    socket: Socket,
    message: { to: string; content: string },
    cb: (response: { done: boolean; errorMsg?: string; messageId?: string }) => void,
) => {
    try {
        const { to, content } = message;
        const from = socket.user.user_id;
        const messageId = uuidv4();

        // A DB error here throws and is handled by the outer catch (-> GENERIC_ERROR).
        const friends = await areFriends(from, to);

        if (!friends) {
            cb({ done: false, errorMsg: "Not friends" });
            return;
        }

        const messageString = [messageId, to, from, content].join(".");

        await redisClient.lPush(getMessagesKey(to), messageString);
        await redisClient.lPush(getMessagesKey(from), messageString);

        // Get user's FCM tokens
        const fcmTokens = await getFcmTokens(to);

        if (fcmTokens.length > 0)
            // Send notification to all FCM tokens
            await sendChatNotifications(fcmTokens, content, from);

        socket.to(to).emit(SOCKET_EVENTS.DIRECT_MESSAGE, { to, from, content, messageId });
        cb({ done: true, messageId });
    } catch {
        cb({ done: false, errorMsg: GENERIC_ERROR });
    }
};
