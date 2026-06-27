import { describe, it, expect } from "vitest"
import {
    authFormSchema,
    friendFormSchema,
    messageFormSchema,
    appName,
    SOCKET_EVENTS,
    API_ROUTES,
} from "./index.js"

describe("authFormSchema", () => {
    it("accepts a valid username/password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser", password: "secret123" })
        ).resolves.toEqual({ username: "validuser", password: "secret123" })
    })

    it("rejects a missing username", async () => {
        await expect(
            authFormSchema.validate({ password: "secret123" })
        ).rejects.toThrow("Username required")
    })

    it("rejects a missing password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser" })
        ).rejects.toThrow("Password required")
    })

    it("enforces the 6-char minimum on username", async () => {
        await expect(
            authFormSchema.validate({ username: "short", password: "secret123" })
        ).rejects.toThrow("Username too short")
    })

    it("accepts exactly 6 chars on username (boundary)", async () => {
        await expect(
            authFormSchema.validate({ username: "sixsix", password: "secret123" })
        ).resolves.toBeTruthy()
    })

    it("enforces the 28-char maximum on username", async () => {
        await expect(
            authFormSchema.validate({ username: "a".repeat(29), password: "secret123" })
        ).rejects.toThrow("Username too long")
    })

    it("accepts exactly 28 chars on username (boundary)", async () => {
        await expect(
            authFormSchema.validate({ username: "a".repeat(28), password: "secret123" })
        ).resolves.toBeTruthy()
    })

    it("enforces the 6-char minimum on password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser", password: "abc" })
        ).rejects.toThrow("Password too short")
    })

    it("enforces the 28-char maximum on password", async () => {
        await expect(
            authFormSchema.validate({ username: "validuser", password: "a".repeat(29) })
        ).rejects.toThrow("Password too long")
    })
})

describe("friendFormSchema", () => {
    it("validates username only and ignores password", async () => {
        const result = await friendFormSchema.validate({ username: "frienduser" })
        expect(result).toEqual({ username: "frienduser" })
        expect(result).not.toHaveProperty("password")
    })

    it("still requires a username", async () => {
        await expect(friendFormSchema.validate({})).rejects.toThrow("Username required")
    })

    it("still enforces the username length rules", async () => {
        await expect(friendFormSchema.validate({ username: "shrt" })).rejects.toThrow(
            "Username too short"
        )
    })
})

describe("messageFormSchema", () => {
    it("accepts a normal message", async () => {
        await expect(
            messageFormSchema.validate({ message: "hello there" })
        ).resolves.toEqual({ message: "hello there" })
    })

    it("rejects an empty/missing message", async () => {
        await expect(messageFormSchema.validate({})).rejects.toThrow("Message required")
    })

    it("accepts exactly 255 chars (boundary)", async () => {
        await expect(
            messageFormSchema.validate({ message: "a".repeat(255) })
        ).resolves.toBeTruthy()
    })

    it("rejects messages longer than 255 chars", async () => {
        await expect(
            messageFormSchema.validate({ message: "a".repeat(256) })
        ).rejects.toThrow("Max length is 255")
    })
})

describe("constants", () => {
    it("exposes the app name", () => {
        expect(appName).toBe("realtime-chatapp")
    })

    it("SOCKET_EVENTS values are unique (no accidental dupes)", () => {
        const values = Object.values(SOCKET_EVENTS)
        expect(new Set(values).size).toBe(values.length)
    })

    it("SOCKET_EVENTS values are all non-empty strings", () => {
        for (const value of Object.values(SOCKET_EVENTS)) {
            expect(typeof value).toBe("string")
            expect(value.length).toBeGreaterThan(0)
        }
    })

    it("DISCONNECT maps to socket.io's 'disconnecting' event", () => {
        // The grace-period logic depends on this being the pre-disconnect event.
        expect(SOCKET_EVENTS.DISCONNECT).toBe("disconnecting")
    })

    it("API_ROUTES full paths compose BASE + SPECIFIC sub-paths", () => {
        expect(API_ROUTES.AUTH.LOGIN).toBe(
            API_ROUTES.AUTH.BASE + API_ROUTES.AUTH.SPECIFIC.LOGIN
        )
        expect(API_ROUTES.AUTH.REGISTER).toBe(
            API_ROUTES.AUTH.BASE + API_ROUTES.AUTH.SPECIFIC.REGISTER
        )
        expect(API_ROUTES.FCM.TOKEN.SAVE).toBe(
            API_ROUTES.FCM.BASE + API_ROUTES.FCM.SPECIFIC.TOKEN.SAVE
        )
        expect(API_ROUTES.FCM.TOKEN.DELETE).toBe(
            API_ROUTES.FCM.BASE + API_ROUTES.FCM.SPECIFIC.TOKEN.DELETE
        )
        expect(API_ROUTES.FCM.MESSAGE).toBe(
            API_ROUTES.FCM.BASE + API_ROUTES.FCM.SPECIFIC.MESSAGE
        )
    })
})
