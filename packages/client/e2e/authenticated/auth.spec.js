import test, { expect } from "@playwright/test"


test("authenticated user can log out", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible()
    await page.getByRole("button", { name: "Logout" }).click();

    // 1. We're back on the login screen.
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible()
    // 2. The authenticated UI is gone.
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0)
    // 3. The token was cleared client-side.
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull()
})

test("authenticated user can refresh the page and stay logged in", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible()

    await page.reload()

    // 1. We're still on the authenticated home.
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible()
    // 2. The token is still in localStorage (the JWT was persisted by the browser).
    expect(await page.evaluate(() => localStorage.getItem("token"))).not.toBeNull()
})