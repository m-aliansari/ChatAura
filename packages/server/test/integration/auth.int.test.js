import { describe, it, expect, beforeAll, afterAll } from "vitest"
import express, { json } from "express"
import { API_ROUTES } from "@realtime-chatapp/common"
import jwt from "jsonwebtoken"
import { insertUser } from "./helpers.js"

let baseUrl
let server

beforeAll(async () => {
    // authRouter is firebase-free, so we can mount it on a bare app and fetch it.
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

afterAll(() => {
    server?.close()
})

const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })

describe("POST /auth/register", () => {
    it("creates a user and returns a valid JWT", async () => {
        const res = await post(API_ROUTES.AUTH.REGISTER, {
            username: "alice1",
            password: "secret1",
        })
        const data = await res.json()

        expect(data.loggedIn).toBe(true)
        const decoded = jwt.verify(data.token, "test-secret-key")
        expect(decoded.username).toBe("alice1")
        expect(decoded.user_id).toBeTruthy()
    })

    it("rejects a duplicate username (UNIQUE constraint surfaced as 'Username taken')", async () => {
        await insertUser({ username: "bobby1" })
        const res = await post(API_ROUTES.AUTH.REGISTER, {
            username: "bobby1",
            password: "secret1",
        })
        const data = await res.json()
        expect(data).toEqual({ loggedIn: false, status: "Username taken" })
    })

    it("rejects an invalid form (422) via validateForm", async () => {
        const res = await post(API_ROUTES.AUTH.REGISTER, {
            username: "x",
            password: "y",
        })
        expect(res.status).toBe(422)
    })
})

describe("POST /auth/login", () => {
    it("logs in with correct credentials", async () => {
        await insertUser({ username: "carol1", password: "secret1" })
        const res = await post(API_ROUTES.AUTH.LOGIN, {
            username: "carol1",
            password: "secret1",
        })
        const data = await res.json()

        expect(data.loggedIn).toBe(true)
        expect(jwt.verify(data.token, "test-secret-key").username).toBe("carol1")
    })

    it("rejects a wrong password", async () => {
        await insertUser({ username: "davey1", password: "secret1" })
        const res = await post(API_ROUTES.AUTH.LOGIN, {
            username: "davey1",
            password: "wrongpass",
        })
        const data = await res.json()
        expect(data).toEqual({ loggedIn: false, status: "Wrong username or password!" })
    })

    it("rejects an unknown user", async () => {
        const res = await post(API_ROUTES.AUTH.LOGIN, {
            username: "ghost1",
            password: "secret1",
        })
        const data = await res.json()
        expect(data.loggedIn).toBe(false)
    })
})

describe("GET /auth/login (handleCheckLogin)", () => {
    it("returns loggedIn:false without a token", async () => {
        const res = await fetch(`${baseUrl}${API_ROUTES.AUTH.LOGIN}`)
        const data = await res.json()
        expect(data.loggedIn).toBe(false)
    })

    it("confirms a valid token for an existing user", async () => {
        const user = await insertUser({ username: "erin1" })
        const token = jwt.sign(
            { username: user.username, user_id: user.user_id, id: user.id },
            "test-secret-key",
            { expiresIn: "3h" }
        )
        const res = await fetch(`${baseUrl}${API_ROUTES.AUTH.LOGIN}`, {
            headers: { authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        expect(data).toEqual({ loggedIn: true, token })
    })
})
