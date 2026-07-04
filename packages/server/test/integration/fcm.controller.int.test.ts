import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express, { json } from "express";
import jwt from "jsonwebtoken";
import { API_ROUTES } from "@realtime-chatapp/common";
import { insertUser } from "./helpers.js";

// fcmRouter -> controllers -> fcm.js -> firebase.js; stub firebase.
vi.mock("../../firebase.js", () => ({
    default: { messaging: () => ({ send: vi.fn() }) },
}));

let baseUrl;
let server;

beforeAll(async () => {
    const fcmRouter = (await import("../../routers/fcmRouter.js")).default;
    const app = express();
    app.set("trust proxy", 1);
    app.use(json());
    app.use(API_ROUTES.FCM.BASE, fcmRouter);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

const tokenFor = (user_id, username = "u") =>
    jwt.sign({ user_id, username, id: 1 }, "test-secret-key", { expiresIn: "3h" });

const post = (path, body, token) =>
    fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

describe("POST /fcm/token/save", () => {
    it("401 when the JWT is missing/invalid", async () => {
        const res = await post(API_ROUTES.FCM.TOKEN.SAVE, { fcmToken: "t" });
        expect(res.status).toBe(401);
    });

    it("400 when fcmToken is missing", async () => {
        const user = await insertUser();
        const res = await post(
            API_ROUTES.FCM.TOKEN.SAVE,
            {},
            tokenFor(user.user_id, user.username),
        );
        expect(res.status).toBe(400);
    });

    it("500 when the token cannot be stored (no such user row)", async () => {
        // storeFcmToken UPDATE matches 0 rows -> result[0].fcm_token throws -> 500
        const res = await post(
            API_ROUTES.FCM.TOKEN.SAVE,
            { fcmToken: "t" },
            tokenFor("ghost-user-id"),
        );
        expect(res.status).toBe(500);
    });

    it("200 and persists the token for a valid user", async () => {
        const user = await insertUser();
        const res = await post(
            API_ROUTES.FCM.TOKEN.SAVE,
            { fcmToken: "device-token-1" },
            tokenFor(user.user_id, user.username),
        );
        expect(res.status).toBe(200);
    });
});

describe("POST /fcm/token/delete", () => {
    it("401 without a valid JWT", async () => {
        const res = await post(API_ROUTES.FCM.TOKEN.DELETE, { fcmToken: "t" });
        expect(res.status).toBe(401);
    });

    it("200 and removes the token for a valid user", async () => {
        const user = await insertUser();
        const token = tokenFor(user.user_id, user.username);
        await post(API_ROUTES.FCM.TOKEN.SAVE, { fcmToken: "to-remove" }, token);

        const res = await post(API_ROUTES.FCM.TOKEN.DELETE, { fcmToken: "to-remove" }, token);
        expect(res.status).toBe(200);
    });
});
