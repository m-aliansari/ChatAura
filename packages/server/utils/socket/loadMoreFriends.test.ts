import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const getFriendsPage = vi.fn();
const getRecentMessagesForConversations = vi.fn();
const hGet = vi.fn();

vi.mock("../../db/repositories/friendships.js", () => ({
    getFriendsPage: (...a: unknown[]) => getFriendsPage(...a),
}));
vi.mock("../../db/repositories/messages.js", () => ({
    getRecentMessagesForConversations: (...a: unknown[]) => getRecentMessagesForConversations(...a),
}));
// enrichWithPresence reads the `connected` flag from the redis presence hash.
vi.mock("../redis.js", () => ({ redisClient: { hGet: (...a: unknown[]) => hGet(...a) } }));

const { handleLoadMoreFriends } = await import("./loadMoreFriends.js");
const { FRIENDS_PAGE_SIZE, MESSAGES_PAGE_SIZE } = await import("./common.js");

const socket = { user: { username: "alice", user_id: "alice-id" } } as unknown as Socket;
const cursor = { createdAt: "2026-01-01 00:00:00.000001+00", userId: "bob-id" };

beforeEach(() => {
    getFriendsPage.mockReset();
    getRecentMessagesForConversations.mockReset();
    hGet.mockReset();
});

describe("handleLoadMoreFriends", () => {
    it("acks the next friends page (presence-enriched) plus that page's recent messages", async () => {
        const nextCursor = { createdAt: "2026-01-01 00:00:00.000003+00", userId: "carol-id" };
        getFriendsPage.mockResolvedValue({
            friends: [
                { username: "bob", user_id: "bob-id" },
                { username: "carol", user_id: "carol-id" },
            ],
            hasMore: true,
            cursor: nextCursor,
        });
        hGet.mockResolvedValueOnce("true").mockResolvedValueOnce("false");
        getRecentMessagesForConversations.mockResolvedValue([
            {
                id: 7,
                message_id: "m7",
                from_user_id: "bob-id",
                to_user_id: "alice-id",
                content: "hey",
                created_at: new Date("2026-01-01T00:00:00.000Z"),
            },
        ]);
        const cb = vi.fn();

        await handleLoadMoreFriends(socket, { cursor }, cb);

        expect(getFriendsPage).toHaveBeenCalledWith("alice-id", {
            before: cursor,
            limit: FRIENDS_PAGE_SIZE,
        });
        // Messages are scoped to exactly this page's conversations.
        expect(getRecentMessagesForConversations).toHaveBeenCalledWith(
            "alice-id",
            ["bob-id", "carol-id"],
            MESSAGES_PAGE_SIZE,
        );
        expect(cb).toHaveBeenCalledWith({
            friends: [
                { username: "bob", user_id: "bob-id", connected: true },
                { username: "carol", user_id: "carol-id", connected: false },
            ],
            hasMore: true,
            cursor: nextCursor,
            messages: [
                {
                    id: 7,
                    messageId: "m7",
                    to: "alice-id",
                    from: "bob-id",
                    content: "hey",
                    createdAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });
    });

    it("requests the first page when no cursor is supplied", async () => {
        getFriendsPage.mockResolvedValue({ friends: [], hasMore: false, cursor: null });
        getRecentMessagesForConversations.mockResolvedValue([]);
        const cb = vi.fn();

        await handleLoadMoreFriends(socket, {}, cb);

        expect(getFriendsPage).toHaveBeenCalledWith("alice-id", {
            before: undefined,
            limit: FRIENDS_PAGE_SIZE,
        });
        expect(cb).toHaveBeenCalledWith({
            friends: [],
            hasMore: false,
            cursor: null,
            messages: [],
        });
    });

    it("acks an empty page instead of throwing when the DB fails", async () => {
        getFriendsPage.mockRejectedValue(new Error("db down"));
        const cb = vi.fn();

        await handleLoadMoreFriends(socket, { cursor }, cb);

        expect(cb).toHaveBeenCalledWith({
            friends: [],
            hasMore: false,
            cursor: null,
            messages: [],
        });
    });
});
