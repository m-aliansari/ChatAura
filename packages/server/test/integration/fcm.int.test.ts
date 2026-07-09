import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import type { Socket } from "socket.io";
import { REDIS_FCM_TOKENS_PREFIX } from "../../constants/fcm.js";
import { insertUser, befriend } from "./helpers.js";

// firebase.js require()s a gitignored service-account.json at import time, so it
// must be mocked. This same mock is the Layer-B "Google boundary" spy.
const sendMock = vi.fn().mockResolvedValue("fcm-message-id");
vi.mock("../../firebase.js", () => ({
    default: { messaging: () => ({ send: sendMock }) },
}));

const { storeFcmToken, getFcmTokens, deleteFcmToken } = await import("../../utils/fcm.js");
const { handleDirectMessage } = await import("../../utils/socket/directMessage.js");
const { getConversation } = await import("../../db/repositories/messages.js");
const { initMessageSentSubscriber } = await import("../../utils/events/messageSentSubscriber.js");
const { redisClient } = await import("../../utils/redis.js");

beforeEach(() => {
    sendMock.mockClear();
});

const cacheKey = (userId: string) => `${REDIS_FCM_TOKENS_PREFIX}${userId}`;

describe("FCM token lifecycle (Layer A) — real Postgres + Redis", () => {
    it("stores a token in Postgres and caches it in Redis", async () => {
        const { user_id } = await insertUser();

        await storeFcmToken(user_id, "tok-1");

        // Redis cache populated...
        const cached = await redisClient.get(cacheKey(user_id));
        expect(JSON.parse(cached!)).toEqual(["tok-1"]);
        // ...and getFcmTokens reflects it.
        expect(await getFcmTokens(user_id)).toEqual(["tok-1"]);
    });

    it("does not duplicate the same token", async () => {
        const { user_id } = await insertUser();
        await storeFcmToken(user_id, "tok-1");
        await storeFcmToken(user_id, "tok-1");
        expect(await getFcmTokens(user_id)).toEqual(["tok-1"]);
    });

    it("falls back to Postgres and repopulates the cache on a cache miss", async () => {
        // Both paths must return the token ARRAY (cache hit and DB fallback), so
        // the caller's `fcmTokens.length > 0` check works on a cold cache too.
        const { user_id } = await insertUser();
        await storeFcmToken(user_id, "tok-1");

        // Evict the cache to force the DB path.
        await redisClient.del(cacheKey(user_id));

        const tokens = await getFcmTokens(user_id);
        expect(tokens).toEqual(["tok-1"]);
        expect(Array.isArray(tokens)).toBe(true);
        // cache repopulated with the array shape
        expect(await redisClient.get(cacheKey(user_id))).toBe(JSON.stringify(["tok-1"]));
    });

    it("returns an empty array for a user that has never registered a token", async () => {
        const { user_id } = await insertUser();
        await redisClient.del(cacheKey(user_id)); // force DB path
        expect(await getFcmTokens(user_id)).toEqual([]);
    });

    it("removes a token and refreshes the cache", async () => {
        const { user_id } = await insertUser();
        await storeFcmToken(user_id, "tok-1");
        await storeFcmToken(user_id, "tok-2");

        await deleteFcmToken(user_id, "tok-1");

        expect(await getFcmTokens(user_id)).toEqual(["tok-2"]);
        expect(JSON.parse((await redisClient.get(cacheKey(user_id)))!)).toEqual(["tok-2"]);
    });
});

function fakeSocket(fromUser: { user_id: string; username: string }) {
    const emit = vi.fn();
    return {
        socket: {
            user: { user_id: fromUser.user_id, username: fromUser.username },
            to: vi.fn(() => ({ emit })),
        } as unknown as Socket,
        emit,
    };
}

describe("handleDirectMessage persistence (Layer B)", () => {
    it("persists exactly one message row to Postgres and acks done with the message", async () => {
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        const { socket } = fakeSocket(from);
        const cb = vi.fn();

        await handleDirectMessage(socket, { to: to.user_id, content: "hello" }, cb);

        expect(cb).toHaveBeenCalledWith(
            expect.objectContaining({
                done: true,
                message: expect.objectContaining({
                    to: to.user_id,
                    from: from.user_id,
                    content: "hello",
                }),
            }),
        );

        // A single canonical row (not two Redis lists) is the source of truth now.
        const { messages } = await getConversation(from.user_id, to.user_id, { limit: 10 });
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe("hello");
    });
});

// FCM is decoupled from the send path via a Redis pub/sub event. Start the real subscriber and
// assert the push fires end-to-end (the consumer's tokens/no-tokens branching is unit-tested in
// utils/events/messageSentSubscriber.test.ts).
describe("FCM notification consumer (e2e via Redis pub/sub)", () => {
    let subscriber: Awaited<ReturnType<typeof initMessageSentSubscriber>>;

    beforeAll(async () => {
        subscriber = await initMessageSentSubscriber();
    });

    afterAll(async () => {
        if (subscriber?.isOpen) await subscriber.quit();
    });

    it("delivers a push to the recipient's device when a message is sent", async () => {
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        await storeFcmToken(to.user_id, "recipient-token");
        const { socket } = fakeSocket(from);

        await handleDirectMessage(socket, { to: to.user_id, content: "ping" }, vi.fn());

        await vi.waitFor(() => expect(sendMock).toHaveBeenCalledOnce());
        const [payload] = sendMock.mock.calls[0];
        expect(payload.notification.body).toBe("ping");
        expect(payload.token).toBe("recipient-token");
        expect(payload.data.fromUserId).toBe(from.user_id);
    });

    it("notifies every one of the recipient's devices (all FCM tokens)", async () => {
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        await storeFcmToken(to.user_id, "device-1");
        await storeFcmToken(to.user_id, "device-2");
        const { socket } = fakeSocket(from);

        await handleDirectMessage(socket, { to: to.user_id, content: "ping" }, vi.fn());

        await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
        const tokens = sendMock.mock.calls.map((c) => c[0].token).sort();
        expect(tokens).toEqual(["device-1", "device-2"]);
    });
});
