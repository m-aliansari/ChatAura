import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";

const getUserByUsername = vi.fn();
const getUserByUserId = vi.fn();
const addFriendship = vi.fn();
const getOrCreateDirectConversation = vi.fn();
const hGet = vi.fn();

// db.transaction just runs the callback with a throwaway tx handle — the repo fns are mocked and
// ignore it, so we only need it to invoke the callback and return its result.
vi.mock("../../db/index.js", () => ({
    db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("../../db/repositories/users.js", () => ({
    getUserByUsername: (...a: unknown[]) => getUserByUsername(...a),
    getUserByUserId: (...a: unknown[]) => getUserByUserId(...a),
}));
vi.mock("../../db/repositories/friendships.js", () => ({
    addFriendship: (...a: unknown[]) => addFriendship(...a),
}));
vi.mock("../../db/repositories/conversations.js", () => ({
    getOrCreateDirectConversation: (...a: unknown[]) => getOrCreateDirectConversation(...a),
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
    getUserByUserId.mockReset();
    addFriendship.mockReset();
    getOrCreateDirectConversation.mockReset();
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

    it("adds a new friend: friendship + conversation, emits FRIEND_ADDED, acks done", async () => {
        getUserByUsername.mockResolvedValue({
            user_id: "bob-id",
            username: "bob",
            full_name: "Bob Brown",
        });
        getUserByUserId.mockResolvedValue({
            user_id: "alice-id",
            username: "alice",
            full_name: "Alice Adams",
        });
        addFriendship.mockResolvedValue({ added: true });
        getOrCreateDirectConversation.mockResolvedValue(42);
        hGet.mockResolvedValue("true"); // bob online
        const { socket, emit } = makeSocket();
        const cb = vi.fn();

        await handleSocketAddFriend(socket, "bob", cb);

        // friendship + conversation are created inside the transaction (executor passed through).
        expect(addFriendship).toHaveBeenCalledWith("alice-id", "bob-id", expect.anything());
        expect(getOrCreateDirectConversation).toHaveBeenCalledWith(
            "alice-id",
            "bob-id",
            expect.anything(),
        );
        expect(socket.to).toHaveBeenCalledWith("bob-id");
        expect(emit).toHaveBeenCalledWith(
            "friend_added",
            expect.objectContaining({
                username: "alice",
                user_id: "alice-id",
                full_name: "Alice Adams",
                connected: true,
                conversationId: 42,
                lastMessage: null,
            }),
        );
        expect(cb).toHaveBeenCalledWith({
            done: true,
            addedFriend: {
                username: "bob",
                user_id: "bob-id",
                full_name: "Bob Brown",
                connected: true,
                conversationId: 42,
                lastMessage: null,
            },
        });
    });

    it("rejects a friend that is already added and does not create a conversation", async () => {
        getUserByUsername.mockResolvedValue({
            user_id: "bob-id",
            username: "bob",
            full_name: "Bob Brown",
        });
        addFriendship.mockResolvedValue({ added: false });
        const { socket } = makeSocket();
        const cb = vi.fn();

        await handleSocketAddFriend(socket, "bob", cb);

        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Friend already added!" });
        expect(getOrCreateDirectConversation).not.toHaveBeenCalled();
    });
});
