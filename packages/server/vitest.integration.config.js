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
    },
});
