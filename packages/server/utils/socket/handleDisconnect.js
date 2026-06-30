import { redisClient } from "../redis.js";
import { getHashMapKey } from "./common.js";
import { emitConnectionStatus } from "./emitConnectionStatus.js";

export const handleDisconnect = async (socket) => {
    try {
        await redisClient.hSet(getHashMapKey(socket.user.username), { connected: "false" });
    } catch (error) {
        console.log("error in handleDisconnect");

        console.log(error);
    }

    await emitConnectionStatus(socket, false);
};
