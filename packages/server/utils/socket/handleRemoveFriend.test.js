import { describe, it, expect, vi, beforeEach } from "vitest"

const lRange = vi.fn()
const lRem = vi.fn()
const del = vi.fn()
const rPush = vi.fn()
vi.mock("../redis.js", () => ({
    redisClient: {
        lRange: (...a) => lRange(...a),
        lRem: (...a) => lRem(...a),
        del: (...a) => del(...a),
        rPush: (...a) => rPush(...a),
    },
}))

const { handleRemoveFriend } = await import("./handleRemoveFriend.js")

function makeSocket() {
    const emit = vi.fn()
    return {
        socket: {
            user: { username: "alice", user_id: "alice-id" },
            to: vi.fn(() => ({ emit })),
        },
        emit,
    }
}

const bob = { username: "bob", user_id: "bob-id" }

beforeEach(() => {
    lRange.mockReset()
    lRem.mockReset()
    del.mockReset()
    rPush.mockReset()
})

describe("handleRemoveFriend", () => {
    it("rejects an invalid friend payload", async () => {
        const { socket } = makeSocket()
        const cb = vi.fn()
        await handleRemoveFriend(socket, { username: "bob" }, cb) // missing user_id
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Invalid friend" })
        expect(lRem).not.toHaveBeenCalled()
    })

    it("rejects removing someone not in your friend list", async () => {
        lRange.mockResolvedValue(["carol.carol-id"]) // bob not present
        const { socket } = makeSocket()
        const cb = vi.fn()
        await handleRemoveFriend(socket, bob, cb)
        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Not in your friend list" })
        expect(lRem).not.toHaveBeenCalled()
    })

    it("removes mutually, prunes shared messages, notifies, and acks done", async () => {
        lRange.mockImplementation(async (key) => {
            if (key === "realtime-chatapp:friends:alice") return ["bob.bob-id"]
            if (key === "realtime-chatapp:chat:alice-id")
                return ["m1.bob-id.alice-id.hi", "m2.carol-id.alice-id.yo"]
            if (key === "realtime-chatapp:chat:bob-id") return ["m1.bob-id.alice-id.hi"]
            return []
        })
        const { socket, emit } = makeSocket()
        const cb = vi.fn()

        await handleRemoveFriend(socket, bob, cb)

        // mutual removal from both friend lists
        expect(lRem).toHaveBeenCalledWith("realtime-chatapp:friends:alice", 0, "bob.bob-id")
        expect(lRem).toHaveBeenCalledWith(
            "realtime-chatapp:friends:bob",
            0,
            "alice.alice-id"
        )
        // alice's chat list: m1 (with bob) dropped, m2 (with carol) kept and rebuilt
        expect(del).toHaveBeenCalledWith("realtime-chatapp:chat:alice-id")
        expect(rPush).toHaveBeenCalledWith("realtime-chatapp:chat:alice-id", [
            "m2.carol-id.alice-id.yo",
        ])
        // bob's chat list: only the shared message -> deleted, nothing rebuilt
        expect(del).toHaveBeenCalledWith("realtime-chatapp:chat:bob-id")

        expect(socket.to).toHaveBeenCalledWith("bob-id")
        expect(emit).toHaveBeenCalledWith("friend_removed", {
            username: "alice",
            user_id: "alice-id",
        })
        expect(cb).toHaveBeenCalledWith({ done: true })
    })

    it("acks failure gracefully when Redis throws", async () => {
        lRange.mockRejectedValue(new Error("redis down"))
        const { socket } = makeSocket()
        const cb = vi.fn()

        await handleRemoveFriend(socket, bob, cb)

        expect(cb).toHaveBeenCalledWith({ done: false, errorMsg: "Failed to remove friend" })
    })
})
