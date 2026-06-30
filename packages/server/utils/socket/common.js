import { appName } from "@realtime-chatapp/common";
import { redisClient } from "../redis.js";

export const parseFriendList = async (friendList) => {
    const newFriendList = [];

    for (let friend of friendList) {
        const [friendUsername, friendUserId] = friend.split(".");

        const friendConnected =
            (await redisClient.hGet(getHashMapKey(friendUsername), "connected")) === "true";

        newFriendList.push({
            username: friendUsername,
            user_id: friendUserId,
            connected: friendConnected,
        });
    }

    return newFriendList;
};

export const getHashMapKey = (username) => `${appName}:user_id:${username}`;
export const getFriendsListKey = (username) => `${appName}:friends:${username}`;
export const getMessagesKey = (user_id) => `${appName}:chat:${user_id}`;
