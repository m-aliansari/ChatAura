import "dotenv/config.js";
import express, { json } from "express";
import { default as helmet } from "helmet";
import { Server } from "socket.io";
import cors from "cors";
import fcmRouter from "./routers/fcmRouter.js";
import authRouter from "./routers/authRouter.js";
import healthRouter from "./routers/healthRouter.js";
import http from "http";
import { corsConfig } from "./constants/cors.js";
import { authorizeUser } from "./middlewares/socket/authorizeUser.js";
import { API_ROUTES, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "./utils/redis.js";
import { handleDirectMessage } from "./utils/socket/directMessage.js";
import { handleSocketAddFriend } from "./utils/socket/handleSocketAddFriend.js";
import { handleRemoveFriend } from "./utils/socket/handleRemoveFriend.js";
import { handleLoadOlder } from "./utils/socket/loadOlder.js";
import { handleLoadMoreFriends } from "./utils/socket/loadMoreFriends.js";
import { handleMarkRead } from "./utils/socket/markRead.js";
import { initializeUser } from "./utils/socket/initializeUser.js";
import { registerDisconnect } from "./utils/socket/registerDisconnect.js";
import { reconcilePresence } from "./utils/socket/reconcilePresence.js";
import { initMessageSentSubscriber } from "./utils/events/messageSentSubscriber.js";
import { disconnectTimers } from "./constants/socket.js";

// Connect Redis and clear any stale presence flags left by a previous process
// (crash/restart/deploy) before we accept sockets — otherwise offline users
// linger as "online" for their friends. Kept resilient: a Redis hiccup at boot
// must not stop the HTTP server from starting (the client auto-reconnects).
try {
    await redisClient.connect();
    await reconcilePresence();
    // Start the FCM notification consumer (decoupled from the message send path). Resilient:
    // a subscriber failure must not stop the HTTP server — the client auto-reconnects.
    await initMessageSentSubscriber();
} catch (error) {
    console.error("Redis startup/presence reconcile failed:", error);
}

const app = express();
const server = http.createServer(app);

const socketio = new Server(server, {
    cors: corsConfig,
});

// express middlewares
app.use(helmet());
app.use(cors(corsConfig));
app.use(json());

// routers
app.use(API_ROUTES.HEALTH, healthRouter);
app.use(API_ROUTES.AUTH.BASE, authRouter);
app.use(API_ROUTES.FCM.BASE, fcmRouter);
app.set("trust proxy", 1);

// Test-only seed routes — gated behind an env flag the E2E bootstrap sets.
// Never mounted in production.
if (process.env.ENABLE_TEST_SEED === "true") {
    const { default: testRouter } = await import("./routers/testRouter.js");
    app.use("/__test", testRouter);
    console.warn("⚠️  ENABLE_TEST_SEED=true — test seed routes mounted at /__test");
}

// socket middlewares
socketio.use(authorizeUser);

socketio.on("connection", async (socket) => {
    await initializeUser(socket);

    if (disconnectTimers.has(socket.user.username)) {
        clearTimeout(disconnectTimers.get(socket.user.username));
        disconnectTimers.delete(socket.user.username);
    }

    socket.on(SOCKET_EVENTS.ADD_FRIEND, (username, cb) => {
        handleSocketAddFriend(socket, username, cb);
    });
    socket.on(SOCKET_EVENTS.REMOVE_FRIEND, (friend, cb) => {
        handleRemoveFriend(socket, friend, cb);
    });
    socket.on(SOCKET_EVENTS.DIRECT_MESSAGE, (message, cb) => {
        handleDirectMessage(socket, message, cb);
    });
    socket.on(SOCKET_EVENTS.LOAD_OLDER, (payload, cb) => {
        handleLoadOlder(socket, payload, cb);
    });
    socket.on(SOCKET_EVENTS.LOAD_MORE_FRIENDS, (payload, cb) => {
        handleLoadMoreFriends(socket, payload, cb);
    });
    socket.on(SOCKET_EVENTS.MARK_READ, (payload, cb) => {
        handleMarkRead(socket, payload, cb);
    });
    registerDisconnect(socketio, socket);
    socket.on(SOCKET_EVENTS.TYPING, ({ to }) => {
        if (to) {
            socket.to(to).emit(SOCKET_EVENTS.TYPING, { from: socket.user.user_id });
        }
    });

    socket.on(SOCKET_EVENTS.STOP_TYPING, ({ to }) => {
        if (to) {
            socket.to(to).emit(SOCKET_EVENTS.STOP_TYPING, { from: socket.user.user_id });
        }
    });
});

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
