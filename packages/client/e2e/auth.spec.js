import { test, expect } from "@playwright/test"

let seq = 0
const uniq = (base) => `${base}${Date.now().toString().slice(-6)}${seq++}`

async function register(page, username, password = "secret1") {
    await page.goto("/#/register")
    await page.getByPlaceholder("Enter username").fill(username)
    await page.getByPlaceholder("Enter password").fill(password)
    await page.getByRole("button", { name: "Create Account" }).click()
    await expect(page.getByRole("heading", { name: "Add Friend" })).toBeVisible()
}

test("an existing user can log in", async ({ browser }) => {
    const username = uniq("login")

    // Create the account in one context...
    const ctx1 = await browser.newContext()
    const p1 = await ctx1.newPage()
    await register(p1, username)
    await ctx1.close()

    // ...then log in fresh (no stored token) in another context.
    const ctx2 = await browser.newContext()
    const p2 = await ctx2.newPage()
    await p2.goto("/")
    await p2.getByPlaceholder("Enter username").fill(username)
    await p2.getByPlaceholder("Enter password").fill("secret1")
    await p2.getByRole("button", { name: "Log In" }).click()

    await expect(p2.getByRole("heading", { name: "Add Friend" })).toBeVisible()
    await ctx2.close()
})

test("invalid login shows an error and stays on the login page", async ({ page }) => {
    await page.goto("/")
    await page.getByPlaceholder("Enter username").fill("nobody1")
    await page.getByPlaceholder("Enter password").fill("wrongpass")
    await page.getByRole("button", { name: "Log In" }).click()

    await expect(page.getByText("Wrong username or password!")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Add Friend" })).toHaveCount(0)
})
