import { defineConfig, devices } from "@playwright/test"

// The client build bakes in VITE_API_BASE_URL=http://localhost:4000 (.env), so
// the E2E backend runs on 4000 and the preview client on 4011.
const SERVER_PORT = 4000
const CLIENT_PORT = 4011
const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`

export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    reporter: "list",
    use: {
        baseURL: CLIENT_ORIGIN,
        trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: [
        {
            // Boots disposable PG + Redis + the real server (firebase stubbed via DISABLE_FCM).
            command: "node test/e2e/server.mjs",
            cwd: "../server",
            port: SERVER_PORT,
            timeout: 180_000,
            reuseExistingServer: false,
            stdout: "pipe",
            stderr: "pipe",
            env: {
                E2E_SERVER_PORT: String(SERVER_PORT),
                E2E_CLIENT_ORIGIN: CLIENT_ORIGIN,
            },
        },
        {
            command: `yarn preview --port ${CLIENT_PORT} --strictPort`,
            port: CLIENT_PORT,
            timeout: 120_000,
            reuseExistingServer: false,
        },
    ],
})
