import { getFcmTokens, sendChatNotifications } from "../fcm.js";
import { redisClient } from "../redis.js";
import { MESSAGE_SENT_CHANNEL } from "../socket/common.js";

// The decoupled "a message was sent" event. The send path publishes it; the FCM side-effect
// runs off it — so notification latency/errors are off the message critical path, and the
// notification consumer can later be extracted as its own service (roadmap principle 4).
export type MessageSentEvent = {
    to: string;
    from: string;
    content: string;
    messageId: string;
};

export const publishMessageSent = async (event: MessageSentEvent): Promise<void> => {
    await redisClient.publish(MESSAGE_SENT_CHANNEL, JSON.stringify(event));
};

// Exported for unit testing the consumer logic in isolation from the async pub/sub transport.
export const handleMessageSent = async (raw: string): Promise<void> => {
    try {
        const { to, from, content } = JSON.parse(raw) as MessageSentEvent;
        const fcmTokens = await getFcmTokens(to);
        if (fcmTokens.length > 0) await sendChatNotifications(fcmTokens, content, from);
    } catch (error) {
        console.error("message-sent subscriber handler failed:", error);
    }
};

/**
 * Subscribe once at boot on a dedicated (duplicated) connection — a node-redis subscriber
 * connection cannot also run normal commands, and `getFcmTokens`' cache reads go through the
 * main client. Returns the subscriber so callers may keep a handle if needed.
 *
 * NOTE (multi-instance): every running instance's subscriber receives the published event, so
 * scaling out >1 instance would fan out duplicate push notifications. Correct at one instance
 * today; a single-consumer mechanism (Redis Streams consumer group, or extracting the
 * notification service) is required when the realtime gateway is scaled horizontally.
 */
export const initMessageSentSubscriber = async () => {
    const subscriber = redisClient.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(MESSAGE_SENT_CHANNEL, (raw) => {
        void handleMessageSent(raw);
    });
    return subscriber;
};
