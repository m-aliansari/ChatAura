import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import jwt from "jsonwebtoken";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { insertUser, befriend } from "./helpers.js";

// handleDirectMessage pulls in firebase.js transitively; mock that boundary.
const sendMock = vi.fn().mockResolvedValue("id");
vi.mock("../../firebase.js", () => ({
    default: { messaging: () => ({ send: sendMock }) },
}));

const { authorizeUser } = await import("../../middlewares/socket/authorizeUser.js");
const { initializeUser } = await import("../../utils/socket/initializeUser.js");
const { handleDirectMessage } = await import("../../utils/socket/directMessage.js");
const { redisClient } = await import("../../utils/redis.js");
const { getHashMapKey, getFriendsListKey } = await import("../../utils/socket/common.js");

let httpServer;
let io;
let port;

beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    io.use(authorizeUser); // same gate as index.js
    io.on("connection", async (socket) => {
        await initializeUser(socket);
        socket.on(SOCKET_EVENTS.DIRECT_MESSAGE, (msg, cb) => handleDirectMessage(socket, msg, cb));
    });
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
});

afterAll(() => {
    io?.close();
    httpServer?.close();
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

const once = (socket, event) =>
    new Promise((resolve) =>
        socket.once(event, (...args) => resolve(args.length > 1 ? args : args[0])),
    );

describe("socket authorization (authorizeUser)", () => {
    it("rejects a connection with an invalid token", async () => {
        const client = connect("not-a-valid-jwt");
        const err = await once(client, "connect_error");
        expect(err.message).toBe("Not authorized");
        client.close();
    });

    it("accepts a connection with a valid token", async () => {
        const user = await insertUser();
        const client = connect(tokenFor(user));
        await once(client, "connect");
        expect(client.connected).toBe(true);
        client.close();
    });
});

describe("initializeUser", () => {
    it("emits an (empty) FRIENDS_LIST and marks the user connected in Redis", async () => {
        const user = await insertUser();
        const client = connect(tokenFor(user));

        const friendList = await once(client, SOCKET_EVENTS.FRIENDS_LIST);
        expect(friendList).toEqual([]);

        const connected = await redisClient.hGet(getHashMapKey(user.username), "connected");
        expect(connected).toBe("true");
        client.close();
    });
});

describe("handleDirectMessage delivery", () => {
    it("delivers a message to the recipient's room and acks the sender", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        await befriend(alice, bob);

        const aliceSocket = connect(tokenFor(alice));
        const bobSocket = connect(tokenFor(bob));
        // wait until both are initialized (joined their user_id rooms)
        await Promise.all([
            once(aliceSocket, SOCKET_EVENTS.FRIENDS_LIST),
            once(bobSocket, SOCKET_EVENTS.FRIENDS_LIST),
        ]);

        const delivered = once(bobSocket, SOCKET_EVENTS.DIRECT_MESSAGE);
        const ack = await aliceSocket.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, {
            to: bob.user_id,
            content: "hi bob",
        });
        expect(ack.done).toBe(true);

        const msg = await delivered;
        expect(msg).toMatchObject({
            to: bob.user_id,
            from: alice.user_id,
            content: "hi bob",
        });

        aliceSocket.close();
        bobSocket.close();
    });

    it("acks done:false for a malformed message instead of crashing", async () => {
        const alice = await insertUser();
        const socket = connect(tokenFor(alice));
        await once(socket, SOCKET_EVENTS.FRIENDS_LIST);

        // null payload -> destructuring throws -> caught -> cb({ done:false, ... })
        const ack = await socket.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, null);
        expect(ack.done).toBe(false);

        socket.close();
    });

    it("round-trips message content losslessly through store + replay, including a '.'", async () => {
        // SPEC: content must survive encode (handleDirectMessage) + decode
        // (initializeUser MESSAGES). The dot-delimiter corrupts "3.14" — bug backlog.
        const alice = await insertUser();
        const bob = await insertUser();
        await befriend(alice, bob);
        const a = connect(tokenFor(alice));
        const b1 = connect(tokenFor(bob));
        await Promise.all([
            once(a, SOCKET_EVENTS.FRIENDS_LIST),
            once(b1, SOCKET_EVENTS.FRIENDS_LIST),
        ]);

        await a.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, {
            to: bob.user_id,
            content: "3.14",
        });
        b1.close();

        // Fresh connection replays stored messages via initializeUser.
        const b2 = connect(tokenFor(bob));
        const messages = await once(b2, SOCKET_EVENTS.MESSAGES);
        expect(messages[0].content).toBe("3.14");

        a.close();
        b2.close();
    });
});

describe("connection status propagation", () => {
    it("notifies a friend when a user comes online", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        // make them mutual friends in Redis
        await redisClient.rPush(
            getFriendsListKey(alice.username),
            `${bob.username}.${bob.user_id}`,
        );
        await redisClient.rPush(
            getFriendsListKey(bob.username),
            `${alice.username}.${alice.user_id}`,
        );

        const a = connect(tokenFor(alice));
        await once(a, SOCKET_EVENTS.FRIENDS_LIST);

        const statusReceived = once(a, SOCKET_EVENTS.CONNECTION_STATUS_CHANGED);
        const b = connect(tokenFor(bob));
        await once(b, SOCKET_EVENTS.FRIENDS_LIST);

        const [connected, username] = await statusReceived;
        expect(connected).toBe(true);
        expect(username).toBe(bob.username);

        a.close();
        b.close();
    });
});
