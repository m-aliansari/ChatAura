import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const getConversation = vi.fn();
vi.mock("../../db/repositories/messages.js", () => ({
    getConversation: (...a: unknown[]) => getConversation(...a),
}));
// common.js pulls in the redis singleton; stub that boundary.
vi.mock("../redis.js", () => ({ redisClient: { hGet: vi.fn() } }));

const { handleLoadOlder } = await import("./loadOlder.js");
const { MESSAGES_PAGE_SIZE } = await import("./common.js");

const socket = { user: { username: "alice", user_id: "alice-id" } } as unknown as Socket;

const row = (id: number, content: string) => ({
    id,
    message_id: `m${id}`,
    from_user_id: "bob-id",
    to_user_id: "alice-id",
    content,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
});

beforeEach(() => {
    getConversation.mockReset();
});

describe("handleLoadOlder", () => {
    it("fetches the page before the cursor and acks wire-shaped messages", async () => {
        getConversation.mockResolvedValue({ messages: [row(5, "older")], hasMore: true });
        const cb = vi.fn();

        await handleLoadOlder(socket, { friendUserId: "bob-id", before: 9 }, cb);

        expect(getConversation).toHaveBeenCalledWith("alice-id", "bob-id", {
            before: 9,
            limit: MESSAGES_PAGE_SIZE,
        });
        expect(cb).toHaveBeenCalledWith({
            hasMore: true,
            messages: [
                {
                    id: 5,
                    messageId: "m5",
                    to: "alice-id",
                    from: "bob-id",
                    content: "older",
                    createdAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });
    });

    it("passes an undefined cursor through for the first page of a conversation", async () => {
        getConversation.mockResolvedValue({ messages: [], hasMore: false });
        const cb = vi.fn();

        await handleLoadOlder(socket, { friendUserId: "bob-id" }, cb);

        expect(getConversation).toHaveBeenCalledWith("alice-id", "bob-id", {
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
