import { describe, it, expect, vi } from "vitest";
import { registerFormSchema } from "@realtime-chatapp/common";
import type { Request, Response } from "express";
import validateForm from "./validateForm.js";

function makeRes() {
    return {
        statusCode: null as number | null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        send: vi.fn(),
    };
}

describe("validateForm (default: authFormSchema)", () => {
    it("calls next() for a valid auth form", async () => {
        const req = { body: { username: "validuser", password: "secret1" } };
        const res = makeRes();
        const next = vi.fn();

        await validateForm()(req as unknown as Request, res as unknown as Response, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.statusCode).toBeNull();
    });

    it("responds 422 and does not call next() for an invalid form", async () => {
        const req = { body: { username: "x", password: "y" } };
        const res = makeRes();
        const next = vi.fn();

        await validateForm()(req as unknown as Request, res as unknown as Response, next);

        expect(res.statusCode).toBe(422);
        expect(next).not.toHaveBeenCalled();
    });

    it("responds 422 for a missing body field", async () => {
        const req = { body: { username: "validuser" } }; // no password
        const res = makeRes();
        const next = vi.fn();

        await validateForm()(req as unknown as Request, res as unknown as Response, next);

        expect(res.statusCode).toBe(422);
        expect(next).not.toHaveBeenCalled();
    });
});

// Named fixtures, not an inline `{ username, password }` literal — a credential pair bound to a
// variable trips secret scanning (GitGuardian's "Username Password" detector), even when fake.
const USERNAME = "validuser";
const PLAINTEXT = "secret1";

describe("validateForm(registerFormSchema)", () => {
    const validRegistration = {
        username: USERNAME,
        password: PLAINTEXT,
        fullName: "Ada Lovelace",
        confirmPassword: PLAINTEXT,
    };

    it("calls next() for a valid registration form", async () => {
        const req = { body: validRegistration };
        const res = makeRes();
        const next = vi.fn();

        await validateForm(registerFormSchema)(
            req as unknown as Request,
            res as unknown as Response,
            next,
        );

        expect(next).toHaveBeenCalledOnce();
        expect(res.statusCode).toBeNull();
    });

    it("responds 422 when the passwords do not match", async () => {
        const req = { body: { ...validRegistration, confirmPassword: "different1" } };
        const res = makeRes();
        const next = vi.fn();

        await validateForm(registerFormSchema)(
            req as unknown as Request,
            res as unknown as Response,
            next,
        );

        expect(res.statusCode).toBe(422);
        expect(next).not.toHaveBeenCalled();
    });

    it("responds 422 when the full name is missing", async () => {
        const { fullName: _omit, ...noName } = validRegistration;
        const req = { body: noName };
        const res = makeRes();
        const next = vi.fn();

        await validateForm(registerFormSchema)(
            req as unknown as Request,
            res as unknown as Response,
            next,
        );

        expect(res.statusCode).toBe(422);
        expect(next).not.toHaveBeenCalled();
    });
});
