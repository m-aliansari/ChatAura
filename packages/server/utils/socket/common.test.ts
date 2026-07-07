import { describe, it, expect, vi, beforeEach } from "vitest";

// enrichWithPresence depends on the redis singleton; mock only that boundary.
const hGet = vi.fn();
vi.mock("../redis.js", () => ({
    redisClient: { hGet: (...args: unknown[]) => hGet(...args) },
}));

const { enrichWithPresence, getHashMapKey, getMessagesKey } = await import("./common.js");

describe("redis key builders", () => {
    it("getHashMapKey namespaces by appName + username", () => {
        expect(getHashMapKey("alice")).toBe("realtime-chatapp:user_id:alice");
    });

    it("getMessagesKey namespaces by appName + user_id", () => {
        expect(getMessagesKey("u-123")).toBe("realtime-chatapp:chat:u-123");
    });
});

describe("enrichWithPresence", () => {
    beforeEach(() => {
        hGet.mockReset();
    });

    it("adds live connection status to each friend", async () => {
        hGet.mockResolvedValueOnce("true").mockResolvedValueOnce("false");

        const result = await enrichWithPresence([
            { username: "alice", user_id: "u-1" },
            { username: "bob", user_id: "u-2" },
        ]);

        expect(result).toEqual([
            { username: "alice", user_id: "u-1", connected: true },
            { username: "bob", user_id: "u-2", connected: false },
        ]);
    });

    it("queries the connection flag using the hash-map key for each friend", async () => {
        hGet.mockResolvedValue("true");

        await enrichWithPresence([{ username: "alice", user_id: "u-1" }]);

        expect(hGet).toHaveBeenCalledWith("realtime-chatapp:user_id:alice", "connected");
    });

    it("treats any non-'true' value as not connected", async () => {
        hGet.mockResolvedValueOnce(null);
        const [friend] = await enrichWithPresence([{ username: "carol", user_id: "u-3" }]);
        expect(friend.connected).toBe(false);
    });

    it("returns an empty array for an empty friend list", async () => {
        expect(await enrichWithPresence([])).toEqual([]);
    });
});
