import { defineConfig } from "vitest/config";

// Shared validation schemas + constants: pure logic, no Docker / no services.
export default defineConfig({
    test: {
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
        },
    },
});
