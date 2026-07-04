import { describe, it, expect, vi, beforeEach } from "vitest";

// fcm.js imports firebase.js (which reads service-account.json unless stubbed)
// and the redis/postgres singletons — mock all three boundaries for a unit test.
const get = vi.fn();
const set = vi.fn();
const query = vi.fn();
vi.mock("../firebase.js", () => ({
    default: { messaging: () => ({ send: vi.fn() }) },
}));
vi.mock("./redis.js", () => ({
    redisClient: { get: (...a) => get(...a), set: (...a) => set(...a) },
}));
vi.mock("./postgres.js", () => ({
    pool: { query: (...a) => query(...a) },
}));

const { getFcmTokens } = await import("./fcm.js");

beforeEach(() => {
    get.mockReset();
    set.mockReset();
    query.mockReset();
});

describe("getFcmTokens (unit)", () => {
    it("returns cached tokens without hitting Postgres on a cache hit", async () => {
        get.mockResolvedValue(JSON.stringify(["tok-1", "tok-2"]));

        const tokens = await getFcmTokens("user-1");

        expect(tokens).toEqual(["tok-1", "tok-2"]);
        expect(query).not.toHaveBeenCalled();
    });

    it("returns [] gracefully when Postgres throws on a cache miss", async () => {
        get.mockResolvedValue(null); // cache miss -> DB path
        query.mockRejectedValue(new Error("db down"));

        const tokens = await getFcmTokens("user-1");

        expect(tokens).toEqual([]);
    });
});
