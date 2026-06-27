import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import express, { json } from "express"
import { API_ROUTES } from "@realtime-chatapp/common"
import { pool } from "../../utils/postgres.js"

let baseUrl
let server

beforeAll(async () => {
    const authRouter = (await import("../../routers/authRouter.js")).default
    const app = express()
    app.set("trust proxy", 1)
    app.use(json())
    app.use(API_ROUTES.AUTH.BASE, authRouter)
    await new Promise((resolve) => {
        server = app.listen(0, resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => server?.close())
afterEach(() => vi.restoreAllMocks()) // un-stub pool.query so setup's TRUNCATE works

const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })

describe("auth resilience — server stays graceful when Postgres fails", () => {
    it("login returns a graceful status (not a 500 crash) when the DB is down", async () => {
        vi.spyOn(pool, "query").mockRejectedValue(new Error("db down"))

        const res = await post(API_ROUTES.AUTH.LOGIN, {
            username: "carol1",
            password: "secret1",
        })
        const data = await res.json()

        expect(res.ok).toBe(true) // handler caught it, responded 200 w/ status
        expect(data).toEqual({
            loggedIn: false,
            status: "Something went wrong, try again later",
        })
    })

    it("register returns a graceful status when the DB is down", async () => {
        vi.spyOn(pool, "query").mockRejectedValue(new Error("db down"))

        const res = await post(API_ROUTES.AUTH.REGISTER, {
            username: "newuser1",
            password: "secret1",
        })
        const data = await res.json()

        expect(data).toEqual({
            loggedIn: false,
            status: "Something went wrong, try again later",
        })
    })
})

describe("auth rate limiting", () => {
    it("returns 429 after exceeding the register limit (5 / 60s)", async () => {
        // 5 allowed, the 6th is throttled. Distinct valid usernames each time.
        let last
        for (let i = 0; i < 6; i++) {
            last = await post(API_ROUTES.AUTH.REGISTER, {
                username: `ratelimit${i}`,
                password: "secret1",
            })
        }
        expect(last.status).toBe(429)
        const data = await last.json()
        expect(data).toEqual({ loggedIn: false, status: "Too many requests" })
    })
})
