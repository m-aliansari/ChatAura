import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const getUserByUsername = vi.fn();
const addFriendship = vi.fn();
const hGet = vi.fn();

vi.mock("../../db/repositories/users.js", () => ({
    getUserByUsername: (...a: unknown[]) => getUserByUsername(...a),
}));
vi.mock("../../db/repositories/friendships.js", () => ({
    addFriendship: (...a: unknown[]) => addFriendship(...a),
}));
vi.mock("../redis.js", () => ({
    redisClient: { hGet: (...a: unknown[]) => hGet(...a) },
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
    getUserByUsername.mockReset();
    addFriendship.mockReset();
    hGet.mockReset();
});

describe("handleSocketAddFriend", () => {
    it("rejects adding yourself", async () => {
        const { socket } = makeSocket();
        const cb = vi.fn();
        await handleSocketAddFriend(socket, "alice", cb);
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Cannot add self" });
        expect(addFriendship).not.toHaveBeenCalled();
    });

    it("rejects a username that does not exist", async () => {
        getUserByUsername.mockResolvedValue(undefined);
        const { socket } = makeSocket();
        const cb = vi.fn();
        await handleSocketAddFriend(socket, "ghost", cb);
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "No such user exists!" });
        expect(addFriendship).not.toHaveBeenCalled();
    });

    it("adds a new friend: inserts the friendship, emits FRIEND_ADDED, acks done", async () => {
        getUserByUsername.mockResolvedValue({ user_id: "bob-id", username: "bob" });
        addFriendship.mockResolvedValue({ added: true });
        hGet.mockResolvedValue("true"); // bob online
        const { socket, emit } = makeSocket();
        const cb = vi.fn();

        await handleSocketAddFriend(socket, "bob", cb);

        expect(addFriendship).toHaveBeenCalledWith("alice-id", "bob-id");
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

    it("rejects a friend that is already added", async () => {
        getUserByUsername.mockResolvedValue({ user_id: "bob-id", username: "bob" });
        addFriendship.mockResolvedValue({ added: false });
        const { socket } = makeSocket();
        const cb = vi.fn();

        await handleSocketAddFriend(socket, "bob", cb);

        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Friend already added!" });
    });
});
