import { hash } from "bcrypt";
import { v4 as uuid } from "uuid";
import { addUser } from "../../db/repositories/users.js";
import { addFriendship } from "../../db/repositories/friendships.js";

let counter = 0;

/** Inserts a user directly into Postgres and returns its row + plaintext password. */
export async function insertUser({
    username,
    password = "secret1",
}: { username?: string; password?: string } = {}) {
    const name = username ?? `user${Date.now()}${counter++}`;
    const user_id = uuid();
    const passhash = await hash(password, 4); // low cost for test speed
    const user = await addUser({ user_id, username: name, passhash });
    return { ...user, password };
}

/** Seeds a friendship in Postgres (mirrors handleSocketAddFriend). */
export async function befriend(
    a: { username: string; user_id: string },
    b: { username: string; user_id: string },
) {
    await addFriendship(a.user_id, b.user_id);
}
