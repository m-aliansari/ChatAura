import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the args passed to socket.io-client's io().
const ioMock = vi.fn(function () {
    return { __isSocket: true };
});
vi.mock("socket.io-client", () => ({ io: ioMock }));

const { getSocketCon } = await import("./socket.js");

describe("getSocketCon", () => {
    beforeEach(() => ioMock.mockClear());

    it("connects to the configured API base URL", () => {
        getSocketCon({ token: "jwt-abc" });
        const [url] = ioMock.mock.calls[0];
        expect(url).toBe("http://localhost:3000");
    });

    it("does not auto-connect (connection is triggered manually in useSocketSetup)", () => {
        getSocketCon({ token: "jwt-abc" });
        const [, opts] = ioMock.mock.calls[0];
        expect(opts.autoConnect).toBe(false);
    });

    it("sends credentials and the user's JWT in the handshake auth", () => {
        getSocketCon({ token: "jwt-abc" });
        const [, opts] = ioMock.mock.calls[0];
        expect(opts.withCredentials).toBe(true);
        expect(opts.auth).toEqual({ token: "jwt-abc" });
    });
});
