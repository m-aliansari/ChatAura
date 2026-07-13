import { createClient } from "redis";
import type { RedisClientOptions } from "redis";

/**
 * Where Redis lives is configuration, not a consequence of NODE_ENV. Keying the transport
 * off NODE_ENV meant any non-production process fell back to `redis://localhost:6379` —
 * which inside a container resolves to the container itself, not the `redis` service.
 *
 * Precedence: REDIS_URL (Compose, ElastiCache, most managed providers) → the discrete
 * REDIS_* vars (the existing Render deploy) → a local default for bare `yarn dev:server`.
 */
function resolveRedisOptions(): RedisClientOptions {
    if (process.env.REDIS_URL) {
        return { url: process.env.REDIS_URL };
    }

    if (process.env.REDIS_SOCKET_HOST) {
        return {
            username: process.env.REDIS_USERNAME,
            password: process.env.REDIS_PASSWORD,
            socket: {
                host: process.env.REDIS_SOCKET_HOST,
                port: Number(process.env.REDIS_SOCKET_PORT),
            },
        };
    }

    return {};
}

export const redisClient = createClient(resolveRedisOptions());
