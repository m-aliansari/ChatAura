import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the redis singleton's multi().incr().expire().exec() chain.
const exec = vi.fn()
const multiChain = {
    incr: vi.fn(() => multiChain),
    expire: vi.fn(() => multiChain),
    exec: (...args) => exec(...args),
}
vi.mock("../../utils/redis.js", () => ({
    redisClient: { multi: () => multiChain },
}))

const { rateLimiter } = await import("./rateLimiter.js")

function makeReqRes() {
    const req = { headers: {}, socket: { remoteAddress: "1.2.3.4" } }
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        },
    }
    const next = vi.fn()
    return { req, res, next }
}

describe("rateLimiter", () => {
    beforeEach(() => {
        exec.mockReset()
        multiChain.incr.mockClear()
        multiChain.expire.mockClear()
    })

    it("calls next() when the request count is under the limit", async () => {
        exec.mockResolvedValue([3]) // incr -> 3
        const { req, res, next } = makeReqRes()

        await rateLimiter(60, 5)(req, res, next)

        expect(next).toHaveBeenCalledOnce()
        expect(res.statusCode).toBeNull()
    })

    it("calls next() at exactly the limit (boundary, not over)", async () => {
        exec.mockResolvedValue([5]) // count === limit, 5 > 5 is false
        const { req, res, next } = makeReqRes()

        await rateLimiter(60, 5)(req, res, next)

        expect(next).toHaveBeenCalledOnce()
    })

    it("responds 429 when the count exceeds the limit", async () => {
        exec.mockResolvedValue([6]) // 6 > 5
        const { req, res, next } = makeReqRes()

        await rateLimiter(60, 5)(req, res, next)

        expect(next).not.toHaveBeenCalled()
        expect(res.statusCode).toBe(429)
        expect(res.body).toEqual({ loggedIn: false, status: "Too many requests" })
    })

    it("sets the expiry window via expire(key, secondsLimit)", async () => {
        exec.mockResolvedValue([1])
        const { req, res, next } = makeReqRes()

        await rateLimiter(90, 5)(req, res, next)

        expect(multiChain.incr).toHaveBeenCalledWith("realtime-chatapp:rate-limit:1.2.3.4")
        expect(multiChain.expire).toHaveBeenCalledWith(
            "realtime-chatapp:rate-limit:1.2.3.4",
            90
        )
    })

    it("keys off x-forwarded-for when present", async () => {
        exec.mockResolvedValue([1])
        const { req, res, next } = makeReqRes()
        req.headers["x-forwarded-for"] = "9.9.9.9"

        await rateLimiter(60, 5)(req, res, next)

        expect(multiChain.incr).toHaveBeenCalledWith("realtime-chatapp:rate-limit:9.9.9.9")
    })

    it("responds 500 when redis throws", async () => {
        exec.mockRejectedValue(new Error("redis down"))
        const { req, res, next } = makeReqRes()

        await rateLimiter(60, 5)(req, res, next)

        expect(next).not.toHaveBeenCalled()
        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({ loggedIn: false, status: "Internal server error" })
    })

    it("bypasses throttling entirely when DISABLE_RATE_LIMIT=true", async () => {
        const prev = process.env.DISABLE_RATE_LIMIT
        process.env.DISABLE_RATE_LIMIT = "true"
        try {
            const { req, res, next } = makeReqRes()
            await rateLimiter(60, 1)(req, res, next)
            expect(next).toHaveBeenCalledOnce()
            expect(exec).not.toHaveBeenCalled() // never touches redis
        } finally {
            process.env.DISABLE_RATE_LIMIT = prev
        }
    })
})
