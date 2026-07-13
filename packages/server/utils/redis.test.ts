import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveRedisOptions } from "./redis.js";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("resolveRedisOptions", () => {
    it("prefers REDIS_URL when set", () => {
        vi.stubEnv("REDIS_URL", "redis://cache:6379");
        vi.stubEnv("REDIS_SOCKET_HOST", "ignored-host");

        expect(resolveRedisOptions()).toEqual({ url: "redis://cache:6379" });
    });

    // The path the Render deploy actually runs on: no REDIS_URL, authenticated remote.
    it("falls back to the discrete REDIS_* vars", () => {
        vi.stubEnv("REDIS_URL", "");
        vi.stubEnv("REDIS_SOCKET_HOST", "remote.example.com");
        vi.stubEnv("REDIS_SOCKET_PORT", "6380");
        vi.stubEnv("REDIS_USERNAME", "default");
        vi.stubEnv("REDIS_PASSWORD", "hunter2");

        expect(resolveRedisOptions()).toEqual({
            username: "default",
            password: "hunter2",
            socket: { host: "remote.example.com", port: 6380 },
        });
    });

    // node-redis omits AUTH when username/password are undefined — how the unauthenticated
    // local and Testcontainers instances connect.
    it("omits credentials when only a host is given", () => {
        vi.stubEnv("REDIS_URL", "");
        vi.stubEnv("REDIS_SOCKET_HOST", "redis");
        vi.stubEnv("REDIS_SOCKET_PORT", "6379");
        vi.stubEnv("REDIS_USERNAME", undefined);
        vi.stubEnv("REDIS_PASSWORD", undefined);

        expect(resolveRedisOptions()).toEqual({
            username: undefined,
            password: undefined,
            socket: { host: "redis", port: 6379 },
        });
    });

    // Bare `yarn dev:server` with nothing configured: node-redis defaults to
    // redis://localhost:6379. Config must NOT be inferred from NODE_ENV — that is what
    // silently pointed a containerized server at itself.
    it("defaults to node-redis' local default when nothing is configured", () => {
        vi.stubEnv("REDIS_URL", "");
        vi.stubEnv("REDIS_SOCKET_HOST", "");
        vi.stubEnv("NODE_ENV", "production");

        expect(resolveRedisOptions()).toEqual({});
    });
});
