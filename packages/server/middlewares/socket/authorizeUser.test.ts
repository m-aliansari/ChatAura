import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";

// authorizeUser verifies the user still exists in Postgres. The unit tier has
// no DB, so stub the repository; existence/absence is driven per-test below.
const getUserByUserId = vi.fn();
vi.mock("../../db/repositories/users.js", () => ({
    getUserByUserId: (...a: unknown[]) => getUserByUserId(...a),
}));

const { authorizeUser } = await import("./authorizeUser.js");

const SECRET = "test-secret-key"; // from vitest.config.js env

const socketWith = (token: unknown) => ({ handshake: { auth: { token } } }) as unknown as Socket;

beforeEach(() => {
    vi.clearAllMocks();
    // Default: the user exists in the DB.
    getUserByUserId.mockResolvedValue({ user_id: "a1" });
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
        getUserByUserId.mockResolvedValueOnce(undefined);
        const token = jwt.sign({ username: "ghost", user_id: "gone" }, SECRET);
        const socket = socketWith(token);
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    it("fails closed when the DB lookup throws", async () => {
        getUserByUserId.mockRejectedValueOnce(new Error("db down"));
        const token = jwt.sign({ username: "alice", user_id: "a1" }, SECRET);
        const socket = socketWith(token);
        const next = vi.fn();

        await authorizeUser(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });
});
