import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

const checkUserExists = vi.fn();
vi.mock("../../utils/users.js", () => ({
    checkUserExists: (...a: unknown[]) => checkUserExists(...a),
}));

const { handleCheckLogin } = await import("./handleCheckLogin.js");

const SECRET = "test-secret-key"; // from vitest.config.js env

function makeRes() {
    return { json: vi.fn() } as unknown as Response;
}
const reqWith = (token: string | null) =>
    ({
        headers: token ? { authorization: `Bearer ${token}` } : {},
    }) as unknown as Request;

beforeEach(() => checkUserExists.mockReset());

describe("handleCheckLogin", () => {
    it("returns loggedIn:false when no token is present", async () => {
        const res = makeRes();
        await handleCheckLogin(reqWith(null), res);
        expect(res.json).toHaveBeenCalledWith({ loggedIn: false });
    });

    it("returns loggedIn:false for an invalid token", async () => {
        const res = makeRes();
        await handleCheckLogin(reqWith("not-a-jwt"), res);
        expect(res.json).toHaveBeenCalledWith({ loggedIn: false });
    });

    it("returns loggedIn:true for a valid token of an existing user", async () => {
        checkUserExists.mockResolvedValue(true);
        const token = jwt.sign({ username: "alice", user_id: "a1" }, SECRET);
        const res = makeRes();

        await handleCheckLogin(reqWith(token), res);

        expect(res.json).toHaveBeenCalledWith({ loggedIn: true, token });
    });

    it("returns ONLY loggedIn:false when the token is valid but the user no longer exists", async () => {
        // SPEC: a single, decisive negative response. (Currently the handler omits
        // a `return`, so it sends loggedIn:false AND then loggedIn:true — bug backlog.)
        checkUserExists.mockResolvedValue(false);
        const token = jwt.sign({ username: "ghost", user_id: "g1" }, SECRET);
        const res = makeRes();

        await handleCheckLogin(reqWith(token), res);

        expect(res.json).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith({ loggedIn: false });
    });
});
