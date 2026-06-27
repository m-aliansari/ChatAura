import { defineConfig } from "vitest/config"

// Unit tier: pure logic, no Docker / no real services.
// Integration tests (real Postgres + Redis via Testcontainers) live in
// test/integration/*.int.test.js and run via `vitest.integration.config.js`.
export default defineConfig({
    test: {
        environment: "node",
        // JWT_SECRET is read at import time in constants/auth.js.
        env: { JWT_SECRET: "test-secret-key" },
        include: ["**/*.test.js"],
        exclude: ["**/node_modules/**", "**/*.int.test.js", "test/integration/**"],
    },
})
