import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const removeFriendship = vi.fn();
const getDirectConversationId = vi.fn();
const deleteConversationCascade = vi.fn();

vi.mock("../../db/index.js", () => ({
    db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("../../db/repositories/friendships.js", () => ({
    removeFriendship: (...a: unknown[]) => removeFriendship(...a),
}));
vi.mock("../../db/repositories/conversations.js", () => ({
    getDirectConversationId: (...a: unknown[]) => getDirectConversationId(...a),
    deleteConversationCascade: (...a: unknown[]) => deleteConversationCascade(...a),
}));

const { handleRemoveFriend } = await import("./handleRemoveFriend.js");

function makeSocket() {
    const emit = vi.fn();
    return {
        socket: {
            user: { username: "alice", user_id: "alice-id" },
            to: vi.fn(() => ({ emit })),
        } as unknown as Socket,
        emit,
    };
}

const bob = { username: "bob", user_id: "bob-id" };

beforeEach(() => {
    removeFriendship.mockReset();
    getDirectConversationId.mockReset();
    deleteConversationCascade.mockReset();
    getDirectConversationId.mockResolvedValue(42);
    deleteConversationCascade.mockResolvedValue(undefined);
});

describe("handleRemoveFriend", () => {
    it("rejects an invalid friend payload", async () => {
        const { socket } = makeSocket();
        const cb = vi.fn();
        // missing user_id — intentionally malformed payload
        await handleRemoveFriend(
            socket,
            { username: "bob" } as { username: string; user_id: string },
            cb,
        );
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Invalid friend" });
        expect(removeFriendship).not.toHaveBeenCalled();
    });

    it("rejects removing someone you are not friends with", async () => {
        removeFriendship.mockResolvedValue({ removed: false });
        const { socket } = makeSocket();
        const cb = vi.fn();
        await handleRemoveFriend(socket, bob, cb);
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Not in your friend list" });
        expect(deleteConversationCascade).not.toHaveBeenCalled();
    });

    it("removes the friendship, tears down the conversation, notifies, and acks done", async () => {
        removeFriendship.mockResolvedValue({ removed: true });
        const { socket, emit } = makeSocket();
        const cb = vi.fn();

        await handleRemoveFriend(socket, bob, cb);

        // single canonical row removed, order-independent (executor threaded through the tx)
        expect(removeFriendship).toHaveBeenCalledWith("alice-id", "bob-id", expect.anything());
        // the whole conversation is torn down by id in the same transaction
        expect(getDirectConversationId).toHaveBeenCalledWith(
            "alice-id",
            "bob-id",
            expect.anything(),
        );
        expect(deleteConversationCascade).toHaveBeenCalledWith(42, expect.anything());

        expect(socket.to).toHaveBeenCalledWith("bob-id");
        expect(emit).toHaveBeenCalledWith("friend_removed", {
            username: "alice",
            user_id: "alice-id",
        });
        expect(cb).toHaveBeenCalledWith({ done: true });
    });

    it("acks failure gracefully when the DB throws", async () => {
        removeFriendship.mockRejectedValue(new Error("db down"));
        const { socket } = makeSocket();
        const cb = vi.fn();

        await handleRemoveFriend(socket, bob, cb);

        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Failed to remove friend" });
    });
});
