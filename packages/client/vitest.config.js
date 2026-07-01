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
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
            include: ["src/**/*.{js,jsx}"],
            exclude: [
                "src/**/*.test.{js,jsx}",
                "src/test/**",
                "src/components/ui/**",
                // No unit-testable logic — bootstrap, static config, side-effectful
                // SDK init, and a pure presentational img. The app shell these wire
                // together is exercised by the Playwright E2E suite instead.
                "src/main.jsx",
                "src/App.jsx",
                "src/theme.js",
                "src/utils/firebase.js",
                "src/components/common/Logo/Logo.jsx",
            ],
        },
    },
});
