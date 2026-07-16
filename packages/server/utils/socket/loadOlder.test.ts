import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const getConversation = vi.fn();
const getDirectConversationId = vi.fn();
vi.mock("../../db/repositories/messages.js", () => ({
    getConversation: (...a: unknown[]) => getConversation(...a),
}));
vi.mock("../../db/repositories/conversations.js", () => ({
    getDirectConversationId: (...a: unknown[]) => getDirectConversationId(...a),
}));
// common.js pulls in the redis singleton; stub that boundary.
vi.mock("../redis.js", () => ({ redisClient: { hGet: vi.fn() } }));

const { handleLoadOlder } = await import("./loadOlder.js");
const { MESSAGES_PAGE_SIZE } = await import("./common.js");

const socket = { user: { username: "alice", user_id: "alice-id" } } as unknown as Socket;

const row = (id: number, content: string) => ({
    id,
    message_id: `m${id}`,
    conversation_id: 11,
    sender_user_id: "bob-id",
    content,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    to_user_id: "alice-id",
});

beforeEach(() => {
    getConversation.mockReset();
    getDirectConversationId.mockReset();
    getDirectConversationId.mockResolvedValue(11);
});

describe("handleLoadOlder", () => {
    it("resolves the conversation, fetches the page before the cursor, acks wire messages", async () => {
        getConversation.mockResolvedValue({ messages: [row(5, "older")], hasMore: true });
        const cb = vi.fn();

        await handleLoadOlder(socket, { friendUserId: "bob-id", before: 9 }, cb);

        expect(getDirectConversationId).toHaveBeenCalledWith("alice-id", "bob-id");
        expect(getConversation).toHaveBeenCalledWith(11, {
            before: 9,
            limit: MESSAGES_PAGE_SIZE,
        });
        expect(cb).toHaveBeenCalledWith({
            hasMore: true,
            messages: [
                {
                    id: 5,
                    messageId: "m5",
                    conversationId: 11,
                    to: "alice-id",
                    from: "bob-id",
                    content: "older",
                    createdAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });
    });

    it("acks an empty page when there is no conversation with that friend yet", async () => {
        getDirectConversationId.mockResolvedValue(undefined);
        const cb = vi.fn();

        await handleLoadOlder(socket, { friendUserId: "bob-id" }, cb);

        expect(getConversation).not.toHaveBeenCalled();
        expect(cb).toHaveBeenCalledWith({ messages: [], hasMore: false });
    });

    it("passes an undefined cursor through for the first page of a conversation", async () => {
        getConversation.mockResolvedValue({ messages: [], hasMore: false });
        const cb = vi.fn();

        await handleLoadOlder(socket, { friendUserId: "bob-id" }, cb);

        expect(getConversation).toHaveBeenCalledWith(11, {
            before: undefined,
            limit: MESSAGES_PAGE_SIZE,
        });
        expect(cb).toHaveBeenCalledWith({ messages: [], hasMore: false });
    });

    it("acks an empty page instead of throwing when the DB fails", async () => {
        getConversation.mockRejectedValue(new Error("db down"));
        const cb = vi.fn();

        await handleLoadOlder(socket, { friendUserId: "bob-id", before: 3 }, cb);

        expect(cb).toHaveBeenCalledWith({ messages: [], hasMore: false });
    });
});
