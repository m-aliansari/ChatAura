import { describe, it, expect, vi } from "vitest"
import validateForm from "./validateForm.js"

function makeRes() {
    return {
        statusCode: null,
        status(code) {
            this.statusCode = code
            return this
        },
        send: vi.fn(),
    }
}

describe("validateForm", () => {
    it("calls next() for a valid auth form", async () => {
        const req = { body: { username: "validuser", password: "secret1" } }
        const res = makeRes()
        const next = vi.fn()

        await validateForm(req, res, next)

        expect(next).toHaveBeenCalledOnce()
        expect(res.statusCode).toBeNull()
    })

    it("responds 422 and does not call next() for an invalid form", async () => {
        const req = { body: { username: "x", password: "y" } }
        const res = makeRes()
        const next = vi.fn()

        await validateForm(req, res, next)

        expect(res.statusCode).toBe(422)
        expect(next).not.toHaveBeenCalled()
    })

    it("responds 422 for a missing body field", async () => {
        const req = { body: { username: "validuser" } } // no password
        const res = makeRes()
        const next = vi.fn()

        await validateForm(req, res, next)

        expect(res.statusCode).toBe(422)
        expect(next).not.toHaveBeenCalled()
    })
})
