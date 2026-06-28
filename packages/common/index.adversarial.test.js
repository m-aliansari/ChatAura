import { describe, it, expect } from "vitest"
import { authFormSchema, friendFormSchema, messageFormSchema } from "./index.js"

// SPEC: inputs are trimmed and validated as non-empty, sane strings. Many of
// these currently pass garbage through — those failures are the bug backlog.

const rejects = (schema, value) => expect(schema.validate(value)).rejects.toThrow()

// Built at runtime so the source file stays pure ASCII.
const NUL = String.fromCharCode(0)
const BELL = String.fromCharCode(7)
const ZERO_WIDTH = String.fromCharCode(0x200b)
const RTL_OVERRIDE = String.fromCharCode(0x202e)

describe("authFormSchema — adversarial input", () => {
    it("rejects a whitespace-only username", async () => {
        await rejects(authFormSchema, { username: "      ", password: "secret1" })
    })

    it("rejects a whitespace-only password", async () => {
        await rejects(authFormSchema, { username: "validuser", password: "      " })
    })

    it("rejects leading white space in the username", async () => {
        await rejects(authFormSchema, { username: "   validuser", password: "secret1" })
    })

    it("rejects trailing white space in the username", async () => {
        await rejects(authFormSchema, { username: "validuser   ", password: "secret1" })
    })

    it("rejects leading white space in the password", async () => {
        await rejects(authFormSchema, { username: "validuser", password: "      secret1" })
    })

    it("rejects trailing white space in the password", async () => {
        await rejects(authFormSchema, { username: "validuser   ", password: "secret1   " })
    })

    it("rejects a username made of only tabs/newlines", async () => {
        await rejects(authFormSchema, { username: "\t\n\t\n\t\n", password: "secret1" })
    })

    it("rejects a NUL byte embedded in the username", async () => {
        await rejects(authFormSchema, { username: `alice1${NUL}x`, password: "secret1" })
    })

    it("rejects control characters (BELL) in the username", async () => {
        await rejects(authFormSchema, { username: `alice1${BELL}`, password: "secret1" })
    })

    it("rejects zero-width / RTL-override characters in the username", async () => {
        await rejects(authFormSchema, {
            username: `al${ZERO_WIDTH}ice${RTL_OVERRIDE}1`,
            password: "secret1",
        })
    })

    it("rejects ':' in the username (Redis key delimiter — namespace injection)", async () => {
        await rejects(authFormSchema, { username: "user_id:victim", password: "secret1" })
    })

    it("rejects '.' in the username (friend-list / message delimiter)", async () => {
        await rejects(authFormSchema, { username: "alice.bob", password: "secret1" })
    })

    it("rejects a non-string username (number)", async () => {
        await rejects(authFormSchema, { username: 1234567, password: "secret1" })
    })

    it("rejects a non-string username (object)", async () => {
        await rejects(authFormSchema, {
            username: { toString: () => "validuser" },
            password: "secret1",
        })
    })

    it("rejects a non-string username (array)", async () => {
        await rejects(authFormSchema, {
            username: ["a", "b", "c", "d", "e", "f"],
            password: "secret1",
        })
    })

    it("rejects a boolean password", async () => {
        await rejects(authFormSchema, { username: "validuser", password: true })
    })
})

describe("friendFormSchema — adversarial input", () => {
    it("rejects a whitespace-only friend username", async () => {
        await rejects(friendFormSchema, { username: "        " })
    })

    it("rejects a non-string friend username", async () => {
        await rejects(friendFormSchema, { username: 9999999 })
    })
})

describe("messageFormSchema — adversarial input", () => {
    it("rejects a whitespace-only message", async () => {
        await rejects(messageFormSchema, { message: "     " })
    })

    it("rejects a message of only newlines", async () => {
        await rejects(messageFormSchema, { message: "\n\n\n" })
    })

    it("rejects a non-string message", async () => {
        await rejects(messageFormSchema, { message: { length: 5 } })
    })

    it("trims a message before the length check", async () => {
        const result = await messageFormSchema.validate({
            message: `  ${"a".repeat(255)}  `,
        })
        expect(result.message).toBe("a".repeat(255))
    })
})
