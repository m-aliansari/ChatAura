import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import jwt from "jsonwebtoken";
import process from "node:process";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { insertUser, befriend } from "./helpers.js";

// Use a short grace window so the test doesn't wait the production 3s.
// Must be set before importing constants/socket.js (read at import time).
process.env.DISCONNECT_GRACE_MS = "400";

const { authorizeUser } = await import("../../middlewares/socket/authorizeUser.js");
const { initializeUser } = await import("../../utils/socket/initializeUser.js");
const { registerDisconnect } = await import("../../utils/socket/registerDisconnect.js");
const { redisClient } = await import("../../utils/redis.js");
const { getHashMapKey } = await import("../../utils/socket/common.js");
const { disconnectTimers, DISCONNECT_GRACE_MS } = await import("../../constants/socket.js");

let httpServer;
let io;
let port;

beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    io.use(authorizeUser);
    // Mirrors the connection + disconnect grace-period wiring in index.js,
    // reusing the real registerDisconnect so we test the shipped logic.
    io.on("connection", async (socket) => {
        await initializeUser(socket);
        if (disconnectTimers.has(socket.user.username)) {
            clearTimeout(disconnectTimers.get(socket.user.username));
            disconnectTimers.delete(socket.user.username);
        }
        registerDisconnect(io, socket);
    });
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
});

afterAll(() => {
    io?.close();
    httpServer?.close();
});

beforeEach(() => {
    for (const t of disconnectTimers.values()) clearTimeout(t);
    disconnectTimers.clear();
});

const tokenFor = (user) =>
    jwt.sign({ username: user.username, user_id: user.user_id, id: user.id }, "test-secret-key", {
        expiresIn: "3h",
    });

const connect = (token) =>
    ioc(`http://127.0.0.1:${port}`, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
    });

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("disconnect grace period", () => {
    it("marks the user offline only after the grace window elapses", async () => {
        const alice = await insertUser();
        const socket = connect(tokenFor(alice));
        await once(socket, SOCKET_EVENTS.FRIENDS_LIST);

        expect(await redisClient.hGet(getHashMapKey(alice.username), "connected")).toBe("true");

        socket.disconnect();
        await sleep(DISCONNECT_GRACE_MS + 300);

        expect(await redisClient.hGet(getHashMapKey(alice.username), "connected")).toBe("false");
    });

    it("stays online if the user reconnects within the grace window (no flicker)", async () => {
        const alice = await insertUser();
        const first = connect(tokenFor(alice));
        await once(first, SOCKET_EVENTS.FRIENDS_LIST);

        first.disconnect();
        // reconnect immediately, well within the grace window
        const second = connect(tokenFor(alice));
        await once(second, SOCKET_EVENTS.FRIENDS_LIST);

        // wait past the original timer; reconnect must have cancelled it
        await sleep(DISCONNECT_GRACE_MS + 300);

        expect(await redisClient.hGet(getHashMapKey(alice.username), "connected")).toBe("true");
        second.close();
    });
});

describe("presence is not lost to a friend on reload / multiple connections", () => {
    // Records the OFFLINE (connected === false) notifications a friend receives
    // about `username`, so a test can assert the friend was never told "offline".
    const recordOfflineFor = (friendSocket, username) => {
        const offline = [];
        friendSocket.on(SOCKET_EVENTS.CONNECTION_STATUS_CHANGED, (connected, who) => {
            if (!connected && who === username) offline.push(who);
        });
        return offline;
    };

    it("keeps a user online for their friend across a reload (disconnect + reconnect within grace)", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        await befriend(alice, bob);

        const bobSocket = connect(tokenFor(bob));
        await once(bobSocket, SOCKET_EVENTS.FRIENDS_LIST);
        const aliceOffline = recordOfflineFor(bobSocket, alice.username);

        const first = connect(tokenFor(alice));
        await once(first, SOCKET_EVENTS.FRIENDS_LIST);

        // A reload is a disconnect immediately followed by a reconnect.
        first.disconnect();
        const second = connect(tokenFor(alice));
        await once(second, SOCKET_EVENTS.FRIENDS_LIST);

        // Wait past the original disconnect timer; the reconnect must cancel it.
        await sleep(DISCONNECT_GRACE_MS + 300);

        expect(aliceOffline).toEqual([]);
        expect(await redisClient.hGet(getHashMapKey(alice.username), "connected")).toBe("true");

        bobSocket.close();
        second.close();
    });

    it("never marks a user offline to a friend while another connection is still live", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        await befriend(alice, bob);

        const bobSocket = connect(tokenFor(bob));
        await once(bobSocket, SOCKET_EVENTS.FRIENDS_LIST);
        const aliceOffline = recordOfflineFor(bobSocket, alice.username);

        // Alice has two live connections (e.g. two tabs).
        const first = connect(tokenFor(alice));
        await once(first, SOCKET_EVENTS.FRIENDS_LIST);
        const second = connect(tokenFor(alice));
        await once(second, SOCKET_EVENTS.FRIENDS_LIST);

        // Closing one must NOT flip Alice offline for Bob — she still has `second`.
        first.disconnect();
        await sleep(DISCONNECT_GRACE_MS + 300);

        expect(aliceOffline).toEqual([]);
        expect(await redisClient.hGet(getHashMapKey(alice.username), "connected")).toBe("true");

        bobSocket.close();
        second.close();
    });
});
