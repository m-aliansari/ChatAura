import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const removeFriendship = vi.fn();
const lRange = vi.fn();
const del = vi.fn();
const rPush = vi.fn();

vi.mock("../../db/repositories/friendships.js", () => ({
    removeFriendship: (...a: unknown[]) => removeFriendship(...a),
}));
vi.mock("../redis.js", () => ({
    redisClient: {
        lRange: (...a: unknown[]) => lRange(...a),
        del: (...a: unknown[]) => del(...a),
        rPush: (...a: unknown[]) => rPush(...a),
    },
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
    lRange.mockReset();
    del.mockReset();
    rPush.mockReset();
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
        expect(del).not.toHaveBeenCalled();
    });

    it("removes the friendship, prunes shared messages, notifies, and acks done", async () => {
        removeFriendship.mockResolvedValue({ removed: true });
        lRange.mockImplementation(async (key) => {
            if (key === "realtime-chatapp:chat:alice-id")
                return ["m1.bob-id.alice-id.hi", "m2.carol-id.alice-id.yo"];
            if (key === "realtime-chatapp:chat:bob-id") return ["m1.bob-id.alice-id.hi"];
            return [];
        });
        const { socket, emit } = makeSocket();
        const cb = vi.fn();

        await handleRemoveFriend(socket, bob, cb);

        // single canonical row removed, order-independent
        expect(removeFriendship).toHaveBeenCalledWith("alice-id", "bob-id");
        // alice's chat list: m1 (with bob) dropped, m2 (with carol) kept and rebuilt
        expect(del).toHaveBeenCalledWith("realtime-chatapp:chat:alice-id");
        expect(rPush).toHaveBeenCalledWith("realtime-chatapp:chat:alice-id", [
            "m2.carol-id.alice-id.yo",
        ]);
        // bob's chat list: only the shared message -> deleted, nothing rebuilt
        expect(del).toHaveBeenCalledWith("realtime-chatapp:chat:bob-id");

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
