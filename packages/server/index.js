import "dotenv/config.js";
import express, { json } from "express";
import { default as helmet } from "helmet";
import { Server } from "socket.io";
import cors from "cors";
import fcmRouter from "./routers/fcmRouter.js";
import authRouter from "./routers/authRouter.js";
import http from 'http';
import { corsConfig } from "./constants/cors.js";
import { authorizeUser } from "./middlewares/socket/authorizeUser.js";
import { API_ROUTES, SOCKET_EVENTS } from "@realtime-chatapp/common";
import { redisClient } from "./utils/redis.js";
import { handleDirectMessage } from "./utils/socket/directMessage.js";
import { handleSocketAddFriend } from "./utils/socket/handleSocketAddFriend.js";
import { handleRemoveFriend } from "./utils/socket/handleRemoveFriend.js";
import { handleDisconnect } from "./utils/socket/handleDisconnect.js";
import { initializeUser } from "./utils/socket/initializeUser.js";
import { disconnectTimers } from "./constants/socket.js";

redisClient.connect().catch(console.error);

const app = express();
const server = http.createServer(app)

const socketio = new Server(server, {
    cors: corsConfig
})

// express middlewares
app.use(helmet())
app.use(cors(corsConfig))
app.use(json())

// routers
app.use(API_ROUTES.AUTH.BASE, authRouter)
app.use(API_ROUTES.FCM.BASE, fcmRouter);
app.set("trust proxy", 1)

// socket middlewares
// socketio.use(socketCompatibleMiddleware(sessionMiddleware))
socketio.use(authorizeUser)

socketio.on("connection", async socket => {
    await initializeUser(socket)

    if (disconnectTimers.has(socket.user.username)) {
        clearTimeout(disconnectTimers.get(socket.user.username));
        disconnectTimers.delete(socket.user.username);
    }

    socket.on(SOCKET_EVENTS.ADD_FRIEND, (username, cb) => { handleSocketAddFriend(socket, username, cb) })
    socket.on(SOCKET_EVENTS.REMOVE_FRIEND, (friend, cb) => { handleRemoveFriend(socket, friend, cb) })
    socket.on(SOCKET_EVENTS.DIRECT_MESSAGE, (message, cb) => { handleDirectMessage(socket, message, cb) })
    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        const timer = setTimeout(() => {
            handleDisconnect(socket);
            disconnectTimers.delete(socket.user.username);
        }, 3000);

        disconnectTimers.set(socket.user.username, timer);
    })
    socket.on(SOCKET_EVENTS.FRIEND_REQUEST_RECEIVED, () => { handleDisconnect(socket) })
    socket.on(SOCKET_EVENTS.TYPING, ({ to }) => {
        if (to) {
            socket.to(to).emit(SOCKET_EVENTS.TYPING, { from: socket.user.user_id });
        }
    });

    socket.on(SOCKET_EVENTS.STOP_TYPING, ({ to }) => {
        if (to) {
            socket.to(to).emit(SOCKET_EVENTS.TYPING, { from: socket.user.user_id });
        }
    });
})

const PORT = process.env.PORT;
server.listen(PORT, () => {
    console.log("Server listening on port 4000");
})