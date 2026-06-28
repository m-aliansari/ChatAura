import { test as setup } from "@playwright/test"
import { register, loginAs, uniq, STORAGE_STATE } from "./fixtures/auth.js"

// Authenticate once and persist the session so authenticated specs can reuse it
// via `storageState` instead of replaying the login UI. The fresh DB per run
// means we register a throwaway account here each time.
//
// Register only sets the user in memory; the login flow is what writes the JWT
// to localStorage. We register in one context, then log in fresh in another (so
// the login form actually renders, with no leftover in-memory session) and
// snapshot that clean, authenticated context — mirrors the login spec.
setup("authenticate", async ({ browser }) => {
    const username = uniq("seed")

    const signupCtx = await browser.newContext()
    await register(await signupCtx.newPage(), username)
    await signupCtx.close()

    const loginCtx = await browser.newContext()
    const page = await loginCtx.newPage()
    await loginAs(page, username)
    // Captures cookies + localStorage (the JWT) for the client origin.
    await page.context().storageState({ path: STORAGE_STATE })
    await loginCtx.close()
})
