import { appName } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";

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
export const getMessagesKey = (user_id: string) => `${appName}:chat:${user_id}`;
