import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const hGetAll = vi.fn();
const lRange = vi.fn();
const lPush = vi.fn();
vi.mock("../redis.js", () => ({
    redisClient: {
        hGetAll: (...a: unknown[]) => hGetAll(...a),
        lRange: (...a: unknown[]) => lRange(...a),
        lPush: (...a: unknown[]) => lPush(...a),
    },
}));

const { handleSocketAddFriend } = await import("./handleSocketAddFriend.js");

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

beforeEach(() => {
    hGetAll.mockReset();
    lRange.mockReset();
    lPush.mockReset();
});

describe("handleSocketAddFriend", () => {
    it("rejects adding yourself", async () => {
        const { socket } = makeSocket();
        const cb = vi.fn();
        await handleSocketAddFriend(socket, "alice", cb);
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Cannot add self" });
        expect(lPush).not.toHaveBeenCalled();
    });

    it("rejects a username that does not exist", async () => {
        hGetAll.mockResolvedValue({}); // no such user hash
        const { socket } = makeSocket();
        const cb = vi.fn();
        await handleSocketAddFriend(socket, "ghost", cb);
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "No such user exists!" });
        expect(lPush).not.toHaveBeenCalled();
    });

    it("adds a new friend: pushes both lists, emits FRIEND_ADDED, acks done", async () => {
        hGetAll.mockResolvedValue({ user_id: "bob-id", connected: "true" });
        lRange.mockResolvedValue([]); // alice has no friends yet
        const { socket, emit } = makeSocket();
        const cb = vi.fn();

        await handleSocketAddFriend(socket, "bob", cb);

        // both friend lists updated (mutual)
        expect(lPush).toHaveBeenCalledTimes(2);
        expect(socket.to).toHaveBeenCalledWith("bob-id");
        expect(emit).toHaveBeenCalledWith(
            "friend_added",
            expect.objectContaining({ username: "alice", user_id: "alice-id", connected: true }),
        );
        expect(cb).toHaveBeenCalledWith({
            done: true,
            addedFriend: { username: "bob", user_id: "bob-id", connected: true },
        });
    });

    it("rejects a friend that is already in the list", async () => {
        // List entries are "<username>.<user_id>"; the guard now compares the
        // full entry, so re-adding an existing friend is rejected (not duplicated).
        hGetAll.mockResolvedValue({ user_id: "bob-id", connected: "true" });
        lRange.mockResolvedValue(["bob.bob-id"]); // bob already a friend
        const { socket } = makeSocket();
        const cb = vi.fn();

        await handleSocketAddFriend(socket, "bob", cb);

        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Friend already added!" });
        expect(lPush).not.toHaveBeenCalled();
    });
});
