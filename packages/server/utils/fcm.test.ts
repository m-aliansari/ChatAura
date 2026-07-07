import { describe, it, expect, vi, beforeEach } from "vitest";

// fcm.js imports firebase.js (which reads service-account.json unless stubbed),
// the redis singleton, and the fcmTokens repository — mock all three boundaries.
const get = vi.fn();
const set = vi.fn();
const getTokens = vi.fn();
vi.mock("../firebase.js", () => ({
    default: { messaging: () => ({ send: vi.fn() }) },
}));
vi.mock("./redis.js", () => ({
    redisClient: { get: (...a: unknown[]) => get(...a), set: (...a: unknown[]) => set(...a) },
}));
vi.mock("../db/repositories/fcmTokens.js", () => ({
    getTokens: (...a: unknown[]) => getTokens(...a),
    addToken: vi.fn(),
    removeToken: vi.fn(),
}));

const { getFcmTokens } = await import("./fcm.js");

beforeEach(() => {
    get.mockReset();
    set.mockReset();
    getTokens.mockReset();
});

describe("getFcmTokens (unit)", () => {
    it("returns cached tokens without hitting Postgres on a cache hit", async () => {
        get.mockResolvedValue(JSON.stringify(["tok-1", "tok-2"]));

        const tokens = await getFcmTokens("user-1");

        expect(tokens).toEqual(["tok-1", "tok-2"]);
        expect(getTokens).not.toHaveBeenCalled();
    });

    it("returns [] gracefully when Postgres throws on a cache miss", async () => {
        get.mockResolvedValue(null); // cache miss -> DB path
        getTokens.mockRejectedValue(new Error("db down"));

        const tokens = await getFcmTokens("user-1");

        expect(tokens).toEqual([]);
    });
});
