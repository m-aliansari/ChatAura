import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { insertUser, befriend } from "./helpers.js";

const sendMock = vi.fn().mockResolvedValue("id");
vi.mock("../../firebase.js", () => ({
    default: { messaging: () => ({ send: sendMock }) },
}));

const { authorizeUser } = await import("../../middlewares/socket/authorizeUser.js");
const { initializeUser } = await import("../../utils/socket/initializeUser.js");
const { handleDirectMessage } = await import("../../utils/socket/directMessage.js");
const { getConversation } = await import("../../db/repositories/messages.js");

let httpServer: HttpServer;
let io: Server;
let port: number;

beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    io.use(authorizeUser);
    io.on("connection", async (socket) => {
        await initializeUser(socket);
        socket.on(SOCKET_EVENTS.DIRECT_MESSAGE, (msg, cb) => handleDirectMessage(socket, msg, cb));
    });
    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    port = (httpServer.address() as AddressInfo).port;
});

afterAll(() => {
    io?.close();
    httpServer?.close();
});

const tokenFor = (user: { username: string; user_id: string; id: number }) =>
    jwt.sign({ username: user.username, user_id: user.user_id, id: user.id }, "test-secret-key", {
        expiresIn: "3h",
    });

const connect = (token: string) =>
    ioc(`http://127.0.0.1:${port}`, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
    });

const once = (socket: ClientSocket, event: string) =>
    new Promise((resolve) =>
        socket.once(event, (...a: unknown[]) => resolve(a.length > 1 ? a : a[0])),
    );

describe("authorization abuse — direct messages", () => {
    it("rejects a direct message to someone who is NOT a friend", async () => {
        // SPEC: you may only message friends. (No friendship check today.)
        const alice = await insertUser();
        const bob = await insertUser();
        const a = connect(tokenFor(alice));
        await once(a, SOCKET_EVENTS.FRIENDS_LIST);

        const ack = await a.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, {
            to: bob.user_id,
            content: "I am not your friend",
        });

        expect(ack.done).toBe(false);
        const { messages } = await getConversation(alice.user_id, bob.user_id, { limit: 10 });
        expect(messages).toHaveLength(0);
        a.close();
    });

    it("rejects a direct message to a non-existent user", async () => {
        // SPEC: messaging a phantom user_id should fail, not silently persist.
        const alice = await insertUser();
        const a = connect(tokenFor(alice));
        await once(a, SOCKET_EVENTS.FRIENDS_LIST);

        const ghost = uuid();
        const ack = await a.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, {
            to: ghost,
            content: "anyone there?",
        });

        expect(ack.done).toBe(false);
        const { messages } = await getConversation(alice.user_id, ghost, { limit: 10 });
        expect(messages).toHaveLength(0);
        a.close();
    });

    it("ignores a spoofed 'from' field and uses the authenticated identity", async () => {
        // SPEC (and current behavior): server sets `from` from socket.user.
        const alice = await insertUser();
        const bob = await insertUser();
        await befriend(alice, bob);
        const a = connect(tokenFor(alice));
        await once(a, SOCKET_EVENTS.FRIENDS_LIST);

        await a.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, {
            to: bob.user_id,
            from: "victim-spoofed-id",
            content: "spoof",
        });

        const { messages } = await getConversation(alice.user_id, bob.user_id, { limit: 10 });
        expect(messages).toHaveLength(1);
        // Server derives `from` from the authenticated identity, ignoring the spoofed field.
        expect(messages[0].from_user_id).toBe(alice.user_id);
        expect(messages[0].from_user_id).not.toBe("victim-spoofed-id");
        a.close();
    });

    it("does not leak a message to unrelated connected users (room isolation)", async () => {
        const alice = await insertUser();
        const bob = await insertUser();
        const carol = await insertUser();
        await befriend(alice, bob);
        const a = connect(tokenFor(alice));
        const b = connect(tokenFor(bob));
        const c = connect(tokenFor(carol));
        await Promise.all([
            once(a, SOCKET_EVENTS.FRIENDS_LIST),
            once(b, SOCKET_EVENTS.FRIENDS_LIST),
            once(c, SOCKET_EVENTS.FRIENDS_LIST),
        ]);

        let carolGotIt = false;
        c.on(SOCKET_EVENTS.DIRECT_MESSAGE, () => {
            carolGotIt = true;
        });

        await a.emitWithAck(SOCKET_EVENTS.DIRECT_MESSAGE, {
            to: bob.user_id,
            content: "for bob only",
        });
        await new Promise((r) => setTimeout(r, 150));

        expect(carolGotIt).toBe(false);
        a.close();
        b.close();
        c.close();
    });
});

describe("authorization abuse — connection", () => {
    it("rejects a validly-signed token for a user that does not exist in the DB", async () => {
        // SPEC: a token for a deleted/non-existent user must not connect.
        // (authorizeUser does no DB lookup today.)
        const ghost = { username: "ghost", user_id: uuid(), id: 999999 };
        const client = connect(tokenFor(ghost));

        const result = await Promise.race([
            once(client, "connect_error").then(() => "rejected"),
            once(client, SOCKET_EVENTS.FRIENDS_LIST).then(() => "connected"),
        ]);

        expect(result).toBe("rejected");
        client.close();
    });
});
