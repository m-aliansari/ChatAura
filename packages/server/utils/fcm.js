import { CLIENT_BASE_URL } from "../constants/client.js";
import { REDIS_FCM_TOKENS_PREFIX } from "../constants/fcm.js";
import { ADD_FCM_TOKEN, GET_FCM_TOKENS, REMOVE_FCM_TOKEN } from "../queries/fcm.js";
import admin from "../firebase.js"; // import initialized firebase instance
import { pool } from "./postgres.js";
import { redisClient } from "./redis.js";
import { v4 as uuidv4 } from "uuid";

// Function to store FCM tokens
export const storeFcmToken = async (userId, fcmToken) => {
    // Store the FCM token in PostgreSQL
    const result = await pool.query(ADD_FCM_TOKEN, [fcmToken, userId]);
    const newFcmTokens = result[0].fcm_token;
    const redisKey = `${REDIS_FCM_TOKENS_PREFIX}${userId}`;

    // Cache the tokens in Redis
    await redisClient.set(redisKey, JSON.stringify(newFcmTokens));
};

// Function to remove a single FCM token (e.g. on logout)
export const deleteFcmToken = async (userId, fcmToken) => {
    const result = await pool.query(REMOVE_FCM_TOKEN, [fcmToken, userId]);
    const newFcmTokens = result[0]?.fcm_token ?? [];
    const redisKey = `${REDIS_FCM_TOKENS_PREFIX}${userId}`;

    // Refresh the Redis cache with the remaining tokens
    await redisClient.set(redisKey, JSON.stringify(newFcmTokens));
};

// Function to retrieve FCM tokens
export const getFcmTokens = async (userId) => {
    try {
        const redisKey = `${REDIS_FCM_TOKENS_PREFIX}${userId}`;

        // Check Redis for cached FCM tokens
        const cachedTokens = await redisClient.get(redisKey);
        if (cachedTokens) {
            return JSON.parse(cachedTokens);
        }

        // Fetch FCM tokens from PostgreSQL
        const result = await pool.query(GET_FCM_TOKENS, [userId]);
        const tokens = result?.[0]?.fcm_token ?? [];

        // Cache the tokens in Redis
        await redisClient.set(redisKey, JSON.stringify(tokens));

        return tokens;
    } catch (error) {
        console.error("Error retrieving FCM tokens:", error);
        return [];
    }
};

export async function sendChatNotifications(fcmTokens, messageText, fromUserId) {
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
