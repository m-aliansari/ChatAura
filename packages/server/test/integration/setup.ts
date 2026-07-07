import { inject, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import process from "node:process";

const pg = inject("pgConfig");
const redis = inject("redisConfig");

// These env vars are read at import time by db/index.js and utils/redis.js,
// so they must be set BEFORE those modules are imported below.
process.env.DATABASE_NAME = pg.database;
process.env.DATABASE_HOST = pg.host;
process.env.DATABASE_USER = pg.user;
process.env.DATABASE_PASSWORD = pg.password;
process.env.DATABASE_PORT = String(pg.port);

// redis.js only honours REDIS_SOCKET_HOST/PORT on the production branch.
process.env.NODE_ENV = "production";
process.env.REDIS_SOCKET_HOST = redis.host;
process.env.REDIS_SOCKET_PORT = String(redis.port);
delete process.env.REDIS_USERNAME;
delete process.env.REDIS_PASSWORD;

process.env.JWT_SECRET = "test-secret-key";

const { redisClient } = await import("../../utils/redis.js");
const { db } = await import("../../db/index.js");

beforeAll(async () => {
    if (!redisClient.isOpen) await redisClient.connect();
});

afterAll(async () => {
    if (redisClient.isOpen) await redisClient.quit();
});

// Fresh state before every test: empty Postgres tables + empty Redis.
beforeEach(async () => {
    await db.execute(sql`TRUNCATE users, fcm_tokens, friendships RESTART IDENTITY CASCADE`);
    await redisClient.flushAll();
});
