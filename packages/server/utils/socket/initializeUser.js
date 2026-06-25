import { SOCKET_EVENTS } from "@realtime-chatapp/common";
import { emitConnectionStatus } from "./emitConnectionStatus.js";
import { redisClient } from "../redis.js";
import { getFriendsListKey, getHashMapKey, getMessagesKey } from "./common.js";


export const initializeUser = async (socket) => {
    socket.join(socket.user.user_id);
    
    await redisClient.hSet(
        getHashMapKey(socket.user.username),
        {
            "user_id": socket.user.user_id,
            "connected": "true"
        }
    );

    const key = getFriendsListKey(socket.user.username);
    const friendList = await redisClient.lRange(key, 0, -1);


    const parsedList = await emitConnectionStatus(socket, true, friendList);
    const messagesRes = await redisClient.lRange(getMessagesKey(socket.user.user_id), 0, -1)

    const messages = messagesRes.map(msgStr => {
        const [messageId, to, from, content] = msgStr.split(".")
        return { to, from, content, messageId }
    })

    socket.emit(SOCKET_EVENTS.FRIENDS_LIST, parsedList);

    if (messages?.length)
        socket.emit(SOCKET_EVENTS.MESSAGES, messages);

};
