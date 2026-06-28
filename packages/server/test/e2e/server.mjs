// E2E backend bootstrap: starts disposable Postgres + Redis, applies migrations,
// wires the env the real server expects, then boots the real index.js.
// Used as a Playwright `webServer` command. Testcontainers' Ryuk reaper cleans
// up the containers when this process exits.
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { RedisContainer } from "@testcontainers/redis"
import process from "node:process"
import { runMigrations } from "../runMigrations.js"

const SERVER_PORT = process.env.E2E_SERVER_PORT ?? "4010"
const CLIENT_ORIGIN = process.env.E2E_CLIENT_ORIGIN ?? "http://localhost:4011"

const pg = await new PostgreSqlContainer("postgres:16-alpine").start()
const redis = await new RedisContainer("redis:7-alpine").start()

await runMigrations(pg.getConnectionUri())

// index.js reads all of these at import time.
process.env.NODE_ENV = "production" // also selects redis.js socket host/port branch
process.env.PORT = SERVER_PORT
process.env.CLIENT_BASE_URL = CLIENT_ORIGIN
process.env.DATABASE_NAME = pg.getDatabase()
process.env.DATABASE_HOST = pg.getHost()
process.env.DATABASE_USER = pg.getUsername()
process.env.DATABASE_PASSWORD = pg.getPassword()
process.env.DATABASE_PORT = String(pg.getPort())
process.env.REDIS_SOCKET_HOST = redis.getHost()
process.env.REDIS_SOCKET_PORT = String(redis.getPort())
delete process.env.REDIS_USERNAME
delete process.env.REDIS_PASSWORD
process.env.DISABLE_FCM = "true"
process.env.DISABLE_RATE_LIMIT = "true" // many E2E requests share one IP
process.env.ENABLE_TEST_SEED = "true" // exposes /__test seed routes for E2E setup
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-key"

await import("../../index.js")
console.log(`[e2e] server booted on :${SERVER_PORT} (client origin ${CLIENT_ORIGIN})`)
