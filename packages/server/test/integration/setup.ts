import { inject, beforeAll, afterAll, beforeEach } from "vitest";
import process from "node:process";

const pg = inject("pgConfig");
const redis = inject("redisConfig");

// These env vars are read at import time by utils/postgres.js and utils/redis.js,
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
const { pool } = await import("../../utils/postgres.js");

beforeAll(async () => {
    if (!redisClient.isOpen) await redisClient.connect();
});

afterAll(async () => {
    if (redisClient.isOpen) await redisClient.quit();
});

// Fresh state before every test: empty users table + empty Redis.
beforeEach(async () => {
    await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
    await redisClient.flushAll();
});
