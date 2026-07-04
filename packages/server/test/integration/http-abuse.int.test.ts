import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { json } from "express";
import { API_ROUTES } from "@realtime-chatapp/common";
import { insertUser } from "./helpers.js";

let baseUrl;
let server;

beforeAll(async () => {
    const authRouter = (await import("../../routers/authRouter.js")).default;
    const app = express();
    app.set("trust proxy", 1);
    app.use(json());
    app.use(API_ROUTES.AUTH.BASE, authRouter);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

const raw = (path, { body, headers } = {}) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers, body });

describe("HTTP protocol abuse", () => {
    it("handles a malformed JSON body gracefully (4xx, not a crash)", async () => {
        const res = await raw(API_ROUTES.AUTH.LOGIN, {
            headers: { "Content-Type": "application/json" },
            body: "{ not valid json",
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });

    it("rejects an oversized body (> 100kb default limit)", async () => {
        const huge = JSON.stringify({ username: "a".repeat(200_000), password: "secret1" });
        const res = await raw(API_ROUTES.AUTH.REGISTER, {
            headers: { "Content-Type": "application/json" },
            body: huge,
        });
        expect(res.status).toBe(413);
    });

    it("does not crash when Content-Type is missing", async () => {
        const res = await raw(API_ROUTES.AUTH.LOGIN, {
            body: JSON.stringify({ username: "validuser", password: "secret1" }),
        });
        expect(res.status).toBeLessThan(500);
    });

    it("treats odd Authorization header shapes as unauthenticated", async () => {
        for (const authValue of ["Bearer", "Bearer ", "Basic xyz", "garbage"]) {
            const res = await fetch(`${baseUrl}${API_ROUTES.AUTH.LOGIN}`, {
                headers: { authorization: authValue },
            });
            const data = await res.json();
            expect(data.loggedIn).toBe(false);
        }
    });

    it("returns 404 for an unknown route", async () => {
        const res = await fetch(`${baseUrl}/auth/does-not-exist`);
        expect(res.status).toBe(404);
    });
});

describe("rate-limit isolation between routes", () => {
    it("does not let one route's traffic exhaust another route's budget", async () => {
        // SPEC: per-route budgets. Today the key is per-IP shared across all
        // routes, so prior /login calls can 429 the first /register call.
        const post = (path) =>
            raw(path, {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "limituser", password: "secret1" }),
            });

        for (let i = 0; i < 6; i++) await post(API_ROUTES.AUTH.LOGIN); // login limit is 10
        const firstRegister = await post(API_ROUTES.AUTH.REGISTER); // its own 1st call

        expect(firstRegister.status).not.toBe(429);
    });
});

describe("injection-resistant persistence", () => {
    it("rejects a SQL-injection-style username (validation) and keeps the table intact", async () => {
        // SPEC: usernames are restricted to [a-zA-Z0-9_], so injection
        // metacharacters never reach the query layer — validation rejects them.
        const evil = "x';DROP--"; // <= 20 chars so it exercises injection, not length
        const res = await raw(API_ROUTES.AUTH.REGISTER, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: evil, password: "secret1" }),
        });
        expect(res.status).toBe(422);

        // table still works: a normal user can still be created
        await expect(insertUser({ username: "stillworks1" })).resolves.toBeTruthy();
    });

    it("handles a schema-valid 25-char username gracefully (DB column is only VARCHAR(20))", async () => {
        // SPEC: a username the form/schema accepts (max 28) must not crash the
        // server. The DB column is VARCHAR(20) and handleRegister has no
        // try/catch, so 21–28 char names currently 500. Bug backlog.
        const res = await raw(API_ROUTES.AUTH.REGISTER, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "a".repeat(25), password: "secret1" }),
        });
        expect(res.status).toBeLessThan(500);
    });

    it("rejects a whitespace-only username at the register route", async () => {
        // SPEC: a 6-space username is not valid. (validateForm accepts it today.)
        const res = await raw(API_ROUTES.AUTH.REGISTER, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "      ", password: "secret1" }),
        });
        expect(res.status).toBe(422);
    });
});
