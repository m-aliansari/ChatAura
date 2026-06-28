// Helpers for seeding backend state in E2E tests without driving the UI.
// They hit the test-only /__test routes the e2e server exposes (see
// server/routers/testRouter.js + server/test/e2e/server.mjs).

// The `request` fixture's baseURL is the CLIENT origin, but the seed routes live
// on the SERVER, so we target it absolutely (matches SERVER_PORT in the config).
const SERVER_URL = process.env.E2E_SERVER_URL ?? "http://localhost:4000"

/**
 * Seeds a friendship directly in Postgres + Redis and returns both users with
 * JWTs. Usernames are optional (auto-generated when omitted); pass `aConnected`
 * / `bConnected` to control their initial online status.
 *
 * @returns {Promise<{a: {username,user_id,token}, b: {username,user_id,token}}>}
 */
export async function seedFriendship(request, opts = {}) {
    const res = await request.post(`${SERVER_URL}/__test/seed-friendship`, { data: opts })
    if (!res.ok()) throw new Error(`seedFriendship failed (${res.status()}): ${await res.text()}`)
    return res.json()
}

/** Seeds a single standalone user. @returns {Promise<{username,user_id,token}>} */
export async function seedUser(request, opts = {}) {
    const res = await request.post(`${SERVER_URL}/__test/seed-user`, { data: opts })
    if (!res.ok()) throw new Error(`seedUser failed (${res.status()}): ${await res.text()}`)
    return res.json()
}

/**
 * Opens a fresh browser context already authenticated as `user` by injecting its
 * JWT into localStorage before the app loads. Caller is responsible for closing it.
 * @returns {Promise<import("@playwright/test").BrowserContext>}
 */
export async function contextAs(browser, user) {
    const context = await browser.newContext()
    await context.addInitScript((token) => localStorage.setItem("token", token), user.token)
    return context
}
