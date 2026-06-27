import { hash } from "bcrypt"
import { v4 as uuid } from "uuid"
import { pool } from "../../utils/postgres.js"
import { ADD_NEW_USER } from "../../queries/auth.js"

let counter = 0

/** Inserts a user directly into Postgres and returns its row + plaintext password. */
export async function insertUser({ username, password = "secret1" } = {}) {
    const name = username ?? `user${Date.now()}${counter++}`
    const user_id = uuid()
    const passhash = await hash(password, 4) // low cost for test speed
    const res = await pool.query(ADD_NEW_USER, [user_id, name, passhash])
    return { ...res[0], password }
}
