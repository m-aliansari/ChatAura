import { defineConfig } from "vitest/config";

// Unit tier: pure logic, no Docker / no real services.
// Integration tests (real Postgres + Redis via Testcontainers) live in
// test/integration/*.int.test.js and run via `vitest.integration.config.js`.
export default defineConfig({
    test: {
        environment: "node",
        // JWT_SECRET is read at import time in constants/auth.js.
        env: { JWT_SECRET: "test-secret-key" },
        include: ["**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/*.int.test.ts", "test/integration/**"],
        coverage: {
            provider: "v8",
            // json emits coverage/unit/coverage-final.json, consumed by the
            // merge step (scripts/merge-coverage.mjs) to combine with integration.
            reporter: ["text", "html", "json"],
            reportsDirectory: "./coverage/unit",
            include: ["controllers/**", "middlewares/**", "utils/**", "db/**"],
            exclude: ["**/*.test.ts", "**/*.int.test.ts", "test/**"],
        },
    },
});
