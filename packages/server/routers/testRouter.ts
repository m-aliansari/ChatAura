// TEST-ONLY routes. Mounted by index.js ONLY when ENABLE_TEST_SEED === "true"
// (set by the E2E bootstrap in test/e2e/server.mjs). Never enabled in production.
//
// Lets E2E tests seed backend state directly — the e2e Postgres/Redis live in
// the server process and aren't reachable from the Playwright test process, so
// seeding has to go through the running server.
import { Router } from "express";
import { hash } from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../utils/postgres.js";
import { redisClient } from "../utils/redis.js";
import { ADD_NEW_USER, GET_USER_BY_USERNAME } from "../queries/auth.js";
import { getHashMapKey, getFriendsListKey } from "../utils/socket/common.js";
import { jwtSignPromise } from "../utils/jwt.js";

let seq = 0;
const uniqName = () => `seed${Date.now().toString().slice(-6)}${seq++}`;

// Find-or-create a Postgres user and mirror the Redis presence hash that
// initializeUser would create on connect (so add-friend lookups and the
// online/offline status both work for a seeded, not-yet-connected user).
async function ensureUser({
    username,
    password = "secret1",
    connected = false,
}: {
    username?: string;
    password?: string;
    connected?: boolean;
}) {
    const name = username ?? uniqName();

    let [user] = await pool.query(GET_USER_BY_USERNAME, [name]);
    if (!user) {
        const passhash = await hash(password, 4);
        [user] = await pool.query(ADD_NEW_USER, [uuidv4(), name, passhash]);
    }

    await redisClient.hSet(getHashMapKey(user.username), {
        user_id: user.user_id,
        connected: String(connected),
    });

    const [, token] = await jwtSignPromise(
        { username: user.username, user_id: user.user_id, id: user.id },
        { expiresIn: "3h" },
    );

    return { username: user.username, user_id: user.user_id, id: user.id, token };
}

// Bidirectional friendship in Redis — same shape handleSocketAddFriend writes.
async function befriend(
    a: { username: string; user_id: string },
    b: { username: string; user_id: string },
) {
    await redisClient.rPush(getFriendsListKey(a.username), `${b.username}.${b.user_id}`);
    await redisClient.rPush(getFriendsListKey(b.username), `${a.username}.${a.user_id}`);
}

const router = Router();

// POST /__test/seed-friendship
// Body (all optional): { a?, b?: username, aConnected?, bConnected?: boolean }
// Omitted usernames are auto-generated. Returns both users incl. JWTs so the
// test can open a context as either side: { a: {username,user_id,token}, b: {...} }.
router.post("/seed-friendship", async (req, res) => {
    try {
        const { a, b, aConnected = false, bConnected = false } = req.body ?? {};
        const userA = await ensureUser({ username: a, connected: aConnected });
        const userB = await ensureUser({ username: b, connected: bConnected });
        await befriend(userA, userB);
        res.json({ a: userA, b: userB });
    } catch (err) {
        console.error("[/__test/seed-friendship] failed:", err);
        res.status(500).json({ error: "seed failed" });
    }
});

// POST /__test/seed-user  { username?, connected?: boolean }
// Creates a standalone user (no friendship). Returns { username, user_id, token }.
router.post("/seed-user", async (req, res) => {
    try {
        const { username, connected = false } = req.body ?? {};
        res.json(await ensureUser({ username, connected }));
    } catch (err) {
        console.error("[/__test/seed-user] failed:", err);
        res.status(500).json({ error: "seed failed" });
    }
});

export default router;
