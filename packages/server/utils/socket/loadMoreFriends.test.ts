import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const getConversationsPage = vi.fn();
const getRecentMessagesForConversations = vi.fn();
const hGet = vi.fn();

vi.mock("../../db/repositories/conversations.js", () => ({
    getConversationsPage: (...a: unknown[]) => getConversationsPage(...a),
}));
vi.mock("../../db/repositories/messages.js", () => ({
    getRecentMessagesForConversations: (...a: unknown[]) => getRecentMessagesForConversations(...a),
}));
// enrichWithPresence reads the `connected` flag from the redis presence hash.
vi.mock("../redis.js", () => ({ redisClient: { hGet: (...a: unknown[]) => hGet(...a) } }));

const { handleLoadMoreFriends } = await import("./loadMoreFriends.js");
const { FRIENDS_PAGE_SIZE, MESSAGES_PAGE_SIZE } = await import("./common.js");

const socket = { user: { username: "alice", user_id: "alice-id" } } as unknown as Socket;
const cursor = { lastMessageId: 5, createdAt: "2026-01-01 00:00:00.000001+00", conversationId: 11 };

beforeEach(() => {
    getConversationsPage.mockReset();
    getRecentMessagesForConversations.mockReset();
    hGet.mockReset();
});

describe("handleLoadMoreFriends", () => {
    it("acks the next inbox page (presence-enriched) plus that page's recent messages", async () => {
        const nextCursor = {
            lastMessageId: 3,
            createdAt: "2026-01-01 00:00:00.000003+00",
            conversationId: 22,
        };
        getConversationsPage.mockResolvedValue({
            conversations: [
                {
                    conversationId: 11,
                    type: "direct",
                    user_id: "bob-id",
                    username: "bob",
                    full_name: "Bob Brown",
                    lastMessage: { content: "hey", createdAt: "2026-01-01T00:00:00.000Z" },
                },
                {
                    conversationId: 22,
                    type: "direct",
                    user_id: "carol-id",
                    username: "carol",
                    full_name: "Carol Clark",
                    lastMessage: null,
                },
            ],
            hasMore: true,
            cursor: nextCursor,
        });
        hGet.mockResolvedValueOnce("true").mockResolvedValueOnce("false");
        getRecentMessagesForConversations.mockResolvedValue([
            {
                id: 7,
                message_id: "m7",
                conversation_id: 11,
                sender_user_id: "bob-id",
                content: "hey",
                created_at: new Date("2026-01-01T00:00:00.000Z"),
                to_user_id: "alice-id",
            },
        ]);
        const cb = vi.fn();

        await handleLoadMoreFriends(socket, { cursor }, cb);

        expect(getConversationsPage).toHaveBeenCalledWith("alice-id", {
            before: cursor,
            limit: FRIENDS_PAGE_SIZE,
        });
        // Messages are scoped to exactly this page's conversations (by conversation id).
        expect(getRecentMessagesForConversations).toHaveBeenCalledWith(
            [11, 22],
            MESSAGES_PAGE_SIZE,
        );
        expect(cb).toHaveBeenCalledWith({
            friends: [
                {
                    conversationId: 11,
                    type: "direct",
                    user_id: "bob-id",
                    username: "bob",
                    full_name: "Bob Brown",
                    lastMessage: { content: "hey", createdAt: "2026-01-01T00:00:00.000Z" },
                    connected: true,
                },
                {
                    conversationId: 22,
                    type: "direct",
                    user_id: "carol-id",
                    username: "carol",
                    full_name: "Carol Clark",
                    lastMessage: null,
                    connected: false,
                },
            ],
            hasMore: true,
            cursor: nextCursor,
            messages: [
                {
                    id: 7,
                    messageId: "m7",
                    conversationId: 11,
                    to: "alice-id",
                    from: "bob-id",
                    content: "hey",
                    createdAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });
    });

    it("requests the first page when no cursor is supplied", async () => {
        getConversationsPage.mockResolvedValue({ conversations: [], hasMore: false, cursor: null });
        getRecentMessagesForConversations.mockResolvedValue([]);
        const cb = vi.fn();

        await handleLoadMoreFriends(socket, {}, cb);

        expect(getConversationsPage).toHaveBeenCalledWith("alice-id", {
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
        getConversationsPage.mockRejectedValue(new Error("db down"));
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
