import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import express, { json } from "express";
import { API_ROUTES } from "@realtime-chatapp/common";
import * as usersRepo from "../../db/repositories/users.js";
import { GENERIC_ERROR } from "@realtime-chatapp/common";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

let baseUrl: string;
let server: Server;

beforeAll(async () => {
    const authRouter = (await import("../../routers/authRouter.js")).default;
    const app = express();
    app.set("trust proxy", 1);
    app.use(json());
    app.use(API_ROUTES.AUTH.BASE, authRouter);
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());
afterEach(() => vi.restoreAllMocks()); // un-stub the repo spies so later tests hit the real DB

const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

const readJson = async (res: Response) =>
    (await res.json()) as { loggedIn?: boolean; status?: string };

describe("auth resilience — server stays graceful when Postgres fails", () => {
    it("login returns a graceful status (not a 500 crash) when the DB is down", async () => {
        vi.spyOn(usersRepo, "getUserByUsername").mockRejectedValue(new Error("db down"));

        const res = await post(API_ROUTES.AUTH.LOGIN, {
            username: "carol1",
            password: "secret1",
        });
        const data = await readJson(res);

        expect(res.ok).toBe(true); // handler caught it, responded 200 w/ status
        expect(data).toEqual({
            loggedIn: false,
            status: GENERIC_ERROR,
        });
    });

    it("register returns a graceful status when the DB is down", async () => {
        // checkUserExists swallows its own error (-> false), so the failure surfaces at the insert.
        vi.spyOn(usersRepo, "addUser").mockRejectedValue(new Error("db down"));

        const res = await post(API_ROUTES.AUTH.REGISTER, {
            fullName: "New User",
            username: "newuser1",
            password: "secret1",
            confirmPassword: "secret1",
        });
        const data = await readJson(res);

        expect(data).toEqual({
            loggedIn: false,
            status: GENERIC_ERROR,
        });
    });
});

describe("auth rate limiting", () => {
    it("returns 429 after exceeding the register limit (5 / 60s)", async () => {
        // 5 allowed, the 6th is throttled. Distinct valid usernames each time.
        let last: Response | undefined;
        for (let i = 0; i < 6; i++) {
            last = await post(API_ROUTES.AUTH.REGISTER, {
                username: `ratelimit${i}`,
                password: "secret1",
            });
        }
        expect(last!.status).toBe(429);
        const data = await readJson(last!);
        expect(data).toEqual({ loggedIn: false, status: "Too many requests" });
    });
});
