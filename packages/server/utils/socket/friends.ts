import { redisClient } from "../redis.js";
import { getFriendsListKey } from "./common.js";

export const checkFriendshipStatus = async ({
    username,
    friendUsername,
    friendId,
}: {
    username: string;
    friendUsername: string;
    friendId: string;
}) => {
    try {
        const currentFriendList = await redisClient.lRange(getFriendsListKey(username), 0, -1);

        const entry = [friendUsername, friendId].join(".");

        if (currentFriendList?.length && currentFriendList.includes(entry)) {
            return true;
        }
    } catch (err) {
        console.error(err);
        return null;
    }

    return false;
};

export const isFriendByUserId = async ({
    username,
    friendId,
}: {
    username: string;
    friendId: string;
}) => {
    try {
        const friendList = await redisClient.lRange(getFriendsListKey(username), 0, -1);
        return friendList.some((entry) => entry.split(".")[1] === String(friendId));
    } catch (err) {
        console.error(err);
        return null;
    }
};
