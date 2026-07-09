import { appName } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";
import type { Message } from "../../db/schema/messages.js";

// Given friends fetched from Postgres ({ username, user_id }), enrich each with live
// presence read from the Redis presence hash (the `connected` flag stays in Redis).
export const enrichWithPresence = async (friends: { username: string; user_id: string }[]) => {
    const enriched = [];

    for (const friend of friends) {
        const connected =
            (await redisClient.hGet(getHashMapKey(friend.username), "connected")) === "true";

        enriched.push({
            username: friend.username,
            user_id: friend.user_id,
            connected,
        });
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
// dedupes on `messageId`. `createdAt` is informational (emitted as an ISO string).
export const toWireMessage = (m: Message) => ({
    id: m.id,
    messageId: m.message_id,
    to: m.to_user_id,
    from: m.from_user_id,
    content: m.content,
    createdAt: m.created_at.toISOString(),
});

export type WireMessage = ReturnType<typeof toWireMessage>;
