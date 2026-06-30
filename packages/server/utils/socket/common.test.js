import { describe, it, expect, vi, beforeEach } from "vitest";

// parseFriendList depends on the redis singleton; mock only that boundary.
const hGet = vi.fn();
vi.mock("../redis.js", () => ({
    redisClient: { hGet: (...args) => hGet(...args) },
}));

const { parseFriendList, getHashMapKey, getFriendsListKey, getMessagesKey } =
    await import("./common.js");

describe("redis key builders", () => {
    it("getHashMapKey namespaces by appName + username", () => {
        expect(getHashMapKey("alice")).toBe("realtime-chatapp:user_id:alice");
    });

    it("getFriendsListKey namespaces by appName + username", () => {
        expect(getFriendsListKey("alice")).toBe("realtime-chatapp:friends:alice");
    });

    it("getMessagesKey namespaces by appName + user_id", () => {
        expect(getMessagesKey("u-123")).toBe("realtime-chatapp:chat:u-123");
    });
});

describe("parseFriendList", () => {
    beforeEach(() => {
        hGet.mockReset();
    });

    it("splits '<username>.<user_id>' entries and resolves connection status", async () => {
        hGet.mockResolvedValueOnce("true").mockResolvedValueOnce("false");

        const result = await parseFriendList(["alice.u-1", "bob.u-2"]);

        expect(result).toEqual([
            { username: "alice", user_id: "u-1", connected: true },
            { username: "bob", user_id: "u-2", connected: false },
        ]);
    });

    it("queries the connection flag using the hash-map key for each friend", async () => {
        hGet.mockResolvedValue("true");

        await parseFriendList(["alice.u-1"]);

        expect(hGet).toHaveBeenCalledWith("realtime-chatapp:user_id:alice", "connected");
    });

    it("treats any non-'true' value as not connected", async () => {
        hGet.mockResolvedValueOnce(null);
        const [friend] = await parseFriendList(["carol.u-3"]);
        expect(friend.connected).toBe(false);
    });

    it("returns an empty array for an empty friend list", async () => {
        expect(await parseFriendList([])).toEqual([]);
    });

    it("parses a username/user_id entry without losing data", async () => {
        // SPEC: a friend entry must round-trip to the correct username + user_id.
        // (A username containing '.' currently corrupts the split — bug backlog.)
        hGet.mockResolvedValue("true");
        const [friend] = await parseFriendList(["abc.realid"]);
        expect(friend.username).toBe("abc");
        expect(friend.user_id).toBe("realid");
    });
});
