import { defineConfig } from "vitest/config";

// Medium tier: real Postgres + Redis via Testcontainers (needs Docker).
export default defineConfig({
    test: {
        environment: "node",
        globalSetup: ["./test/integration/globalSetup.js"],
        setupFiles: ["./test/integration/setup.js"],
        include: ["test/integration/**/*.int.test.js"],
        // One shared container set; avoid cross-file races on the shared DB.
        fileParallelism: false,
        testTimeout: 30000,
        hookTimeout: 180000,
        coverage: {
            provider: "v8",
            // Same include/exclude as the unit config so the two reports cover
            // the same file set and merge cleanly (scripts/merge-coverage.mjs).
            reporter: ["text", "html", "json"],
            reportsDirectory: "./coverage/integration",
            include: ["controllers/**", "middlewares/**", "utils/**", "queries/**"],
            exclude: ["**/*.test.js", "**/*.int.test.js", "test/**"],
        },
    },
});
