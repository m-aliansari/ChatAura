import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Client small/component tier: jsdom, no Docker. Playwright E2E lives in e2e/.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./src/test/setup.js"],
        // API_BASE_URL reads import.meta.env.VITE_API_BASE_URL.
        env: { VITE_API_BASE_URL: "http://localhost:3000" },
        include: ["src/**/*.test.{js,jsx}"],
        exclude: ["**/node_modules/**", "e2e/**"],
    },
});
