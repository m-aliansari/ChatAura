import { describe, it, expect, vi, beforeEach } from "vitest";
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
const { redisClient } = await import("../../utils/redis.js");
const { getMessagesKey } = await import("../../utils/socket/common.js");

beforeEach(() => {
    sendMock.mockClear();
});

const cacheKey = (userId) => `${REDIS_FCM_TOKENS_PREFIX}${userId}`;

describe("FCM token lifecycle (Layer A) — real Postgres + Redis", () => {
    it("stores a token in Postgres and caches it in Redis", async () => {
        const { user_id } = await insertUser();

        await storeFcmToken(user_id, "tok-1");

        // Redis cache populated...
        const cached = await redisClient.get(cacheKey(user_id));
        expect(JSON.parse(cached)).toEqual(["tok-1"]);
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
        expect(JSON.parse(await redisClient.get(cacheKey(user_id)))).toEqual(["tok-2"]);
    });
});

describe("handleDirectMessage notification trigger (Layer B)", () => {
    function fakeSocket(fromUser) {
        const emit = vi.fn();
        return {
            socket: {
                user: { user_id: fromUser.user_id, username: fromUser.username },
                to: vi.fn(() => ({ emit })),
            },
            emit,
        };
    }

    it("persists the message to both chat lists and acks done", async () => {
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        const { socket } = fakeSocket(from);
        const cb = vi.fn();

        await handleDirectMessage(socket, { to: to.user_id, content: "hello" }, cb);

        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ done: true }));

        const toList = await redisClient.lRange(getMessagesKey(to.user_id), 0, -1);
        const fromList = await redisClient.lRange(getMessagesKey(from.user_id), 0, -1);
        expect(toList).toHaveLength(1);
        expect(fromList).toHaveLength(1);
        // format: messageId.to.from.content
        expect(toList[0].endsWith(`.${to.user_id}.${from.user_id}.hello`)).toBe(true);
    });

    it("sends a push notification when the recipient has FCM tokens", async () => {
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        await storeFcmToken(to.user_id, "recipient-token");
        const { socket } = fakeSocket(from);

        await handleDirectMessage(socket, { to: to.user_id, content: "ping" }, vi.fn());

        expect(sendMock).toHaveBeenCalledOnce();
        const [payload] = sendMock.mock.calls[0];
        expect(payload.notification.body).toBe("ping");
        expect(payload.token).toBe("recipient-token");
        expect(payload.data.fromUserId).toBe(from.user_id);
    });

    it("notifies every one of the recipient's devices (all FCM tokens)", async () => {
        // SPEC: a user logged in on multiple devices is notified on each.
        // (Currently only fcmTokens[0] is used — bug backlog.)
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        await storeFcmToken(to.user_id, "device-1");
        await storeFcmToken(to.user_id, "device-2");
        const { socket } = fakeSocket(from);

        await handleDirectMessage(socket, { to: to.user_id, content: "ping" }, vi.fn());

        expect(sendMock).toHaveBeenCalledTimes(2);
        const tokens = sendMock.mock.calls.map((c) => c[0].token).sort();
        expect(tokens).toEqual(["device-1", "device-2"]);
    });

    it("does NOT send a notification when the recipient has no tokens", async () => {
        const from = await insertUser();
        const to = await insertUser();
        await befriend(from, to);
        const { socket } = fakeSocket(from);

        await handleDirectMessage(socket, { to: to.user_id, content: "ping" }, vi.fn());

        expect(sendMock).not.toHaveBeenCalled();
    });
});
