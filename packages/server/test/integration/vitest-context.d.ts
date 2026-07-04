import "vitest";

// Typed channel between globalSetup (provide) and per-file setup (inject) for
// the shared Testcontainers Postgres/Redis connection details.
declare module "vitest" {
    interface ProvidedContext {
        pgConfig: {
            host: string;
            port: number;
            database: string;
            user: string;
            password: string;
        };
        redisConfig: {
            host: string;
            port: number;
        };
    }
}
