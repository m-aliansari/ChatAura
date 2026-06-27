import { test, expect } from "@playwright/test"

// Unique-enough names within a single E2E run (one fresh DB per run).
let seq = 0
const uniq = (base) => `${base}${Date.now().toString().slice(-6)}${seq++}`

/** Registers a new user through the UI and lands on the authenticated home. */
async function register(page, username, password = "secret1") {
    await page.goto("/#/register")
    await page.getByPlaceholder("Enter username").fill(username)
    await page.getByPlaceholder("Enter password").fill(password)
    await page.getByRole("button", { name: "Create Account" }).click()
    await expect(page.getByRole("heading", { name: "Add Friend" })).toBeVisible()
}

test("a new user can register and reach the authenticated home (full stack)", async ({
    page,
}) => {
    await register(page, uniq("solo"))
    // Sidebar controls render -> client+server+Postgres+JWT+socket all wired.
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible()
})

test("two users can add each other and see updates in realtime", async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    const userA = uniq("alice")
    const userB = uniq("bobby")

    await register(pageA, userA)
    await register(pageB, userB)

    // A opens the Add Friend dialog (the only icon button before any friends exist).
    await pageA
        .getByRole("button")
        .filter({ has: pageA.locator("svg") })
        .first()
        .click()
    await pageA.getByPlaceholder("Enter Friend's username").fill(userB)
    await pageA.getByRole("button", { name: "Submit" }).click()

    // A sees B in their friend list (round-trip through server + Redis).
    // Friend-list entries are Tabs.Trigger elements (role "tab").
    await expect(pageA.getByRole("tab", { name: userB })).toBeVisible()

    // B sees A appear without reloading (FRIEND_ADDED pushed over the socket).
    await expect(pageB.getByRole("tab", { name: userA })).toBeVisible()

    await ctxA.close()
    await ctxB.close()
})
