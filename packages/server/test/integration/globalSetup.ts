import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { runMigrations } from "../runMigrations.js";

/**
 * Starts one Postgres + one Redis container for the whole integration run,
 * applies the real migrations to Postgres, and hands connection details to the
 * test workers via `provide` (read back with `inject` in setup.js).
 */
export default async function ({ provide }) {
    const pgContainer = await new PostgreSqlContainer("postgres:16-alpine").start();
    const redisContainer = await new RedisContainer("redis:7-alpine").start();

    await runMigrations(pgContainer.getConnectionUri());

    provide("pgConfig", {
        host: pgContainer.getHost(),
        port: pgContainer.getPort(),
        database: pgContainer.getDatabase(),
        user: pgContainer.getUsername(),
        password: pgContainer.getPassword(),
    });
    provide("redisConfig", {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
    });

    return async () => {
        await redisContainer.stop();
        await pgContainer.stop();
    };
}
