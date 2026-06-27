import { describe, it, expect, vi } from "vitest"
import jwt from "jsonwebtoken"
import { authorizeUser } from "./authorizeUser.js"

const SECRET = "test-secret-key" // from vitest.config.js env

const socketWith = (token) => ({ handshake: { auth: { token } } })

describe("authorizeUser socket middleware", () => {
    it("attaches socket.user and calls next() for a valid token", async () => {
        const token = jwt.sign({ username: "alice", user_id: "a1" }, SECRET)
        const socket = socketWith(token)
        const next = vi.fn()

        await authorizeUser(socket, next)

        expect(socket.user).toMatchObject({ username: "alice", user_id: "a1" })
        expect(next).toHaveBeenCalledWith() // no error argument
    })

    it("rejects a connection with an invalid token", async () => {
        const socket = socketWith("garbage")
        const next = vi.fn()

        await authorizeUser(socket, next)

        expect(next).toHaveBeenCalledWith(expect.any(Error))
        expect(socket.user).toBeUndefined()
    })

    it("rejects a connection with a missing token", async () => {
        const socket = socketWith(undefined)
        const next = vi.fn()

        await authorizeUser(socket, next)

        expect(next).toHaveBeenCalledWith(expect.any(Error))
        expect(socket.user).toBeUndefined()
    })
})
