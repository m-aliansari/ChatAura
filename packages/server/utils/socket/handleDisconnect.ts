import { redisClient } from "../redis.js";
import { getHashMapKey } from "./common.js";
import { emitConnectionStatus } from "./emitConnectionStatus.js";
import type { Socket } from "socket.io";

export const handleDisconnect = async (socket: Socket) => {
    try {
        await redisClient.hSet(getHashMapKey(socket.user.username), { connected: "false" });
    } catch (error) {
        console.log("error in handleDisconnect");

        console.log(error);
    }

    await emitConnectionStatus(socket, false);
};
