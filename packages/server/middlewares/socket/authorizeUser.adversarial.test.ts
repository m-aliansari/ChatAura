import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { authorizeUser } from "./authorizeUser.js";

const SECRET = "test-secret-key"; // from vitest.config.js env
const socketWith = (token: unknown) => ({ handshake: { auth: { token } } }) as unknown as Socket;

async function authorize(token: unknown) {
    const socket = socketWith(token);
    const next = vi.fn();
    await authorizeUser(socket, next);
    return { socket, next };
}

describe("authorizeUser — token forgery & abuse", () => {
    it("rejects an alg:none (unsigned) token", async () => {
        const forged = jwt.sign({ username: "attacker", user_id: "1" }, "", {
            algorithm: "none",
        });
        const { next, socket } = await authorize(forged);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.user).toBeUndefined();
    });

    it("rejects a token with a tampered signature", async () => {
        const valid = jwt.sign({ username: "alice", user_id: "1" }, SECRET);
        const tampered = valid.slice(0, -2) + (valid.endsWith("aa") ? "bb" : "aa");
        const { next } = await authorize(tampered);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("rejects a token signed with the wrong secret", async () => {
        const foreign = jwt.sign({ username: "alice", user_id: "1" }, "attacker-secret");
        const { next } = await authorize(foreign);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("rejects an expired token", async () => {
        const expired = jwt.sign({ username: "alice", user_id: "1" }, SECRET, {
            expiresIn: -10,
        });
        const { next } = await authorize(expired);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("rejects a validly-signed token missing required claims (username/user_id)", async () => {
        // SPEC: a token with no identity claims must not grant a connection.
        // (Today authorizeUser only checks verify success — empty payload passes.)
        const emptyClaims = jwt.sign({}, SECRET);
        const { next } = await authorize(emptyClaims);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});
