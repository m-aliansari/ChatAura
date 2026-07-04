import { hash } from "bcrypt";
import { v4 as uuid } from "uuid";
import { pool } from "../../utils/postgres.js";
import { redisClient } from "../../utils/redis.js";
import { getFriendsListKey } from "../../utils/socket/common.js";
import { ADD_NEW_USER } from "../../queries/auth.js";

let counter = 0;

/** Inserts a user directly into Postgres and returns its row + plaintext password. */
export async function insertUser({
    username,
    password = "secret1",
}: { username?: string; password?: string } = {}) {
    const name = username ?? `user${Date.now()}${counter++}`;
    const user_id = uuid();
    const passhash = await hash(password, 4); // low cost for test speed
    const res = await pool.query(ADD_NEW_USER, [user_id, name, passhash]);
    return { ...res[0], password };
}

/** Seeds a bidirectional friendship in Redis (mirrors handleSocketAddFriend). */
export async function befriend(
    a: { username: string; user_id: string },
    b: { username: string; user_id: string },
) {
    await redisClient.rPush(getFriendsListKey(a.username), `${b.username}.${b.user_id}`);
    await redisClient.rPush(getFriendsListKey(b.username), `${a.username}.${a.user_id}`);
}
