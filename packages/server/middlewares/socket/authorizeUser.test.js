import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// authorizeUser verifies the user still exists in Postgres. The unit tier has
// no DB, so stub the pool; existence/absence is driven per-test below.
vi.mock("../../utils/postgres.js", () => ({
    pool: { query: vi.fn() },
}));

import { pool } from "../../utils/postgres.js";
import { authorizeUser } from "./authorizeUser.js";

const SECRET = "test-secret-key"; // from vitest.config.js env

const socketWith = (token) => ({ handshake: { auth: { token } } });

beforeEach(() => {
    vi.clearAllMocks();
    // Default: the user exists in the DB.
    pool.query.mockResolvedValue([{ user_id: "a1" }]);
});

describe("authorizeUser socket middleware", () => {
    it("attaches socket.user and calls next() for a valid token", async () => {
        const token = jwt.sign({ username: "alice", user_id: "a1" }, SECRET);
        const socket = socketWith(token);
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(socket.user).toMatchObject({ username: "alice", user_id: "a1" });
        expect(next).toHaveBeenCalledWith(); // no error argument
    });

    it("rejects a connection with an invalid token", async () => {
        const socket = socketWith("garbage");
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    it("rejects a connection with a missing token", async () => {
        const socket = socketWith(undefined);
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    it("rejects a validly-signed token for a user absent from the DB", async () => {
        // Deleted/non-existent account: token verifies, but no DB row exists.
        pool.query.mockResolvedValueOnce([]);
        const token = jwt.sign({ username: "ghost", user_id: "gone" }, SECRET);
        const socket = socketWith(token);
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    it("fails closed when the DB lookup throws", async () => {
        pool.query.mockRejectedValueOnce(new Error("db down"));
        const token = jwt.sign({ username: "alice", user_id: "a1" }, SECRET);
        const socket = socketWith(token);
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });
});
