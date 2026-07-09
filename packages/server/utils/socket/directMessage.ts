import { GENERIC_ERROR, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { v4 as uuidv4 } from "uuid";
import { areFriends } from "../../db/repositories/friendships.js";
import { saveMessage } from "../../db/repositories/messages.js";
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

        // Single atomic INSERT (Postgres is now the source of truth) — replaces the old
        // non-transactional pair of Redis lPushes and the fragile dot-joined string.
        const row = await saveMessage({
            message_id: messageId,
            from_user_id: from,
            to_user_id: to,
            content,
        });
        const wire = toWireMessage(row);

        // Decouple FCM: publish an event and move on — a subscriber sends the push, so
        // notification latency/errors stay off the message send path (roadmap principle 4).
        await publishMessageSent({ to, from, content, messageId });

        socket.to(to).emit(SOCKET_EVENTS.DIRECT_MESSAGE, wire);
        cb({ done: true, message: wire });
    } catch {
        cb({ done: false, errorMsg: GENERIC_ERROR });
    }
};
