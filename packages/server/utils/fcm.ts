import { REDIS_FCM_TOKENS_PREFIX } from "../constants/fcm.js";
import { addToken, getTokens, removeToken } from "../db/repositories/fcmTokens.js";
import admin from "../firebase.js"; // import initialized firebase instance
import { redisClient } from "./redis.js";
import { v4 as uuidv4 } from "uuid";

// Refresh the Redis cache (a JSON string[] at fcm:tokens:<userId>) from Postgres — the
// source of truth. Keeps the cache contract identical for readers like getFcmTokens.
const refreshTokenCache = async (userId: string) => {
    const tokens = await getTokens(userId);
    await redisClient.set(`${REDIS_FCM_TOKENS_PREFIX}${userId}`, JSON.stringify(tokens));
};

// Function to store FCM tokens
export const storeFcmToken = async (userId: string, fcmToken: string) => {
    await addToken(userId, fcmToken);
    await refreshTokenCache(userId);
};

// Function to remove a single FCM token (e.g. on logout)
export const deleteFcmToken = async (userId: string, fcmToken: string) => {
    await removeToken(userId, fcmToken);
    await refreshTokenCache(userId);
};

// Function to retrieve FCM tokens
export const getFcmTokens = async (userId: string): Promise<string[]> => {
    try {
        const redisKey = `${REDIS_FCM_TOKENS_PREFIX}${userId}`;

        // Check Redis for cached FCM tokens
        const cachedTokens = await redisClient.get(redisKey);
        if (cachedTokens) {
            return JSON.parse(cachedTokens);
        }

        // Fetch FCM tokens from PostgreSQL (source of truth) and warm the cache
        const tokens = await getTokens(userId);
        await redisClient.set(redisKey, JSON.stringify(tokens));

        return tokens;
    } catch (error) {
        console.error("Error retrieving FCM tokens:", error);
        return [];
    }
};

export async function sendChatNotifications(
    fcmTokens: string[],
    messageText: string,
    fromUserId: string,
) {
    try {
        const tag = uuidv4(); // Unique tag for each notification
        const baseMessage = {
            notification: {
                title: "New Message",
                body: messageText,
            },
            data: {
                type: "chat",
                url: `/home?userId=${fromUserId}`, // Include userId in the URL
                messageId: tag, // Unique identifier for the message
                fromUserId, // Store the userId in data for easy access
            },
            webpush: {
                notification: {
                    icon: "/ChatAura_logo.png",
                    tag, // 👈 Web-specific
                    requireInteraction: true, // Unique tag for each notification
                    renotify: false,
                },
            },
        };

        // A user may be logged in on multiple devices — notify each token.
        await Promise.all(
            fcmTokens.map((token) => admin.messaging().send({ ...baseMessage, token })),
        );
    } catch (error) {
        console.error("Error sending notifications:", error);
    }
}
