import { appName } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import type { Message } from "../../db/schema/messages.js";

// Enrich each row (anything carrying a `username`) with live presence from the Redis presence hash
// (the `connected` flag stays in Redis). Generic + spread so it preserves the caller's other fields
// (full_name, conversationId, lastMessage, …) instead of narrowing to { username, user_id }.
export const enrichWithPresence = async <T extends { username: string }>(
    friends: T[],
): Promise<(T & { connected: boolean })[]> => {
    const enriched: (T & { connected: boolean })[] = [];

    for (const friend of friends) {
        const connected =
            (await redisClient.hGet(getHashMapKey(friend.username), "connected")) === "true";

        enriched.push({ ...friend, connected });
    }

    return enriched;
};

export const getHashMapKey = (username: string) => `${appName}:user_id:${username}`;

// How many friends the sidebar loads per page (connect + each infinite-scroll load-more).
export const FRIENDS_PAGE_SIZE = 15;

// How many messages per conversation to load at connect, and per "load older" page.
export const MESSAGES_PAGE_SIZE = 30;

// Server-internal Redis pub/sub channel that decouples FCM from the message send path
// (roadmap principle 4). Not shared with the JS client, so it lives here, not in `common`.
export const MESSAGE_SENT_CHANNEL = `${appName}:events:message-sent`;

// The wire shape for a message. `id` (bigserial) is the client's pagination cursor; the client
// dedupes on `messageId`. `to`/`from` are kept (so the current client, which keys messages by the
// conversation partner, is unchanged) — `to` (the recipient) is supplied by the caller: the send
// path already has it, read paths compute it from the conversation pair (MessageRow.to_user_id).
// `conversationId` is included for the sort/UI work that keys on the conversation directly.
export type WireMessage = {
    id: number;
    messageId: string;
    conversationId: number;
    to: string;
    from: string;
    content: string;
    createdAt: string;
};

export const toWireMessage = (m: Message, to: string): WireMessage => ({
    id: m.id,
    messageId: m.message_id,
    conversationId: m.conversation_id,
    to,
    from: m.sender_user_id,
    content: m.content,
    createdAt: m.created_at.toISOString(),
});
