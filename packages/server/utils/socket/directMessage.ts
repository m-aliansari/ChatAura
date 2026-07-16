import { GENERIC_ERROR, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { v4 as uuidv4 } from "uuid";
import { areFriends } from "../../db/repositories/friendships.js";
import { getOrCreateDirectConversation } from "../../db/repositories/conversations.js";
import { sendMessage } from "../../services/sendMessage.js";
import { publishMessageSent } from "../events/messageSentSubscriber.js";
import { toWireMessage, type WireMessage } from "./common.js";
import type { Socket } from "socket.io";

export const handleDirectMessage = async (
    socket: Socket,
    message: { to: string; content: string },
    cb: (response: { done: boolean; errorMsg?: string; message?: WireMessage }) => void,
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

        // Resolve (or lazily create) the direct conversation, then persist + fan the sort pointer
        // out to its members in ONE transaction (services/sendMessage) — Postgres is the source of
        // truth and the inbox pointer can never be left stale relative to the message.
        const conversationId = await getOrCreateDirectConversation(from, to);
        const row = await sendMessage({
            message_id: messageId,
            conversation_id: conversationId,
            sender_user_id: from,
            content,
        });
        const wire = toWireMessage(row, to);

        // Decouple FCM: publish an event and move on — a subscriber sends the push, so
        // notification latency/errors stay off the message send path (roadmap principle 4).
        await publishMessageSent({ to, from, content, messageId });

        socket.to(to).emit(SOCKET_EVENTS.DIRECT_MESSAGE, wire);
        cb({ done: true, message: wire });
    } catch {
        cb({ done: false, errorMsg: GENERIC_ERROR });
    }
};
