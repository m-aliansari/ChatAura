import { describe, it, expect } from "vitest"
import jwt from "jsonwebtoken"
import { jwtSignPromise, jwtVerifyPromise, getJwtTokenFromRequest } from "./jwt.js"

// JWT_SECRET is injected via vitest.config.js env -> "test-secret-key"
const SECRET = "test-secret-key"

describe("jwtSignPromise / jwtVerifyPromise — [err, result] tuple contract", () => {
    it("signs a payload and returns [null, token]", async () => {
        const [err, token] = await jwtSignPromise({ user_id: "u1", username: "alice" })
        expect(err).toBeNull()
        expect(typeof token).toBe("string")
    })

    it("produces a token verifiable with the same secret", async () => {
        const [, token] = await jwtSignPromise({ user_id: "u1", username: "alice" })
        const decoded = jwt.verify(token, SECRET)
        expect(decoded.user_id).toBe("u1")
        expect(decoded.username).toBe("alice")
    })

    it("verifies a valid token and returns [null, decoded]", async () => {
        const [, token] = await jwtSignPromise({ user_id: "u1", username: "alice" })
        const [err, decoded] = await jwtVerifyPromise(token)
        expect(err).toBeNull()
        expect(decoded.user_id).toBe("u1")
    })

    it("returns [err, null] for a malformed token", async () => {
        const [err, decoded] = await jwtVerifyPromise("not-a-real-jwt")
        expect(err).toBeTruthy()
        expect(decoded).toBeNull()
    })

    it("returns [err, null] for a token signed with a different secret", async () => {
        const foreignToken = jwt.sign({ user_id: "u1" }, "some-other-secret")
        const [err, decoded] = await jwtVerifyPromise(foreignToken)
        expect(err).toBeTruthy()
        expect(decoded).toBeNull()
    })

    it("returns [err, null] for an expired token", async () => {
        const [, token] = await jwtSignPromise({ user_id: "u1" }, { expiresIn: -10 })
        const [err, decoded] = await jwtVerifyPromise(token)
        expect(err).toBeTruthy()
        expect(err.name).toBe("TokenExpiredError")
        expect(decoded).toBeNull()
    })

    it("honors the 3h-style expiresIn option", async () => {
        const [, token] = await jwtSignPromise({ user_id: "u1" }, { expiresIn: "3h" })
        const decoded = jwt.verify(token, SECRET)
        // exp should be ~3 hours ahead of iat
        expect(decoded.exp - decoded.iat).toBe(3 * 60 * 60)
    })
})

describe("getJwtTokenFromRequest", () => {
    it("extracts the token from a 'Bearer <token>' header", () => {
        const req = { headers: { authorization: "Bearer abc.def.ghi" } }
        expect(getJwtTokenFromRequest(req)).toBe("abc.def.ghi")
    })

    it("returns null when the Authorization header is absent", () => {
        expect(getJwtTokenFromRequest({ headers: {} })).toBeNull()
    })

    it("returns null-ish (no token) when the header has no second part", () => {
        // "Bearer".split(" ")[1] === undefined -> ?? null
        const req = { headers: { authorization: "Bearer" } }
        expect(getJwtTokenFromRequest(req)).toBeNull()
    })
})
